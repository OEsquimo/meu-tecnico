// =============================================================================
// ROTEADOR — troca de tela conforme o endereço (#/...) e protege as rotas
// =============================================================================
// Para cada navegação:
//   1. descobre a rota e confere se o usuário pode abrir (decidirAcesso);
//   2. mostra "esqueletos" de carregamento;
//   3. carrega o arquivo da tela e chama a função padrão dela com um "contexto";
//   4. se algo falhar, mostra uma tela de erro COM botão — o app nunca trava.
// =============================================================================

import { resolverRota, decidirAcesso, itensDoMenu } from './rotas.js';
import { sessao, aoMudarSessao, recarregarSessao } from './sessao.js';
import { mostrar, html, toast } from './ui.js';
import { esqueletos, menuSuperior, estadoVazio, botao } from './componentes.js';
import { traduzirErro, ehErroDeRede } from './erros.js';
import { NOME_APP } from './constantes.js';

let elementos = null; // { raiz, menu }
let token = 0; // identifica a navegação atual (descarta respostas atrasadas)
let limparTelaAtual = null;
let estadoAnterior = null;

/** Lê o "#/caminho?consulta" atual. */
export function lerEndereco() {
  const bruto = (typeof location !== 'undefined' ? location.hash : '').replace(/^#/, '') || '/';
  const indice = bruto.indexOf('?');
  const caminho = (indice === -1 ? bruto : bruto.slice(0, indice)) || '/';
  const consulta = new URLSearchParams(indice === -1 ? '' : bruto.slice(indice + 1));
  return { caminho: caminho.startsWith('/') ? caminho : `/${caminho}`, consulta };
}

/** Vai para outra tela. substituir=true não deixa a tela anterior no histórico. */
export function ir(destino, { substituir = false } = {}) {
  const novo = `#${destino.startsWith('/') ? destino : `/${destino}`}`;
  if (location.hash === novo) {
    navegar();
    return;
  }
  if (substituir) location.replace(novo);
  else location.hash = novo;
}

/** Volta uma tela (ou vai ao "plano B" se não houver histórico). */
export function voltar(planoB = '/') {
  if (typeof history !== 'undefined' && history.length > 1) history.back();
  else ir(planoB, { substituir: true });
}

/** Desenha de novo a tela atual (depois de salvar algo, por exemplo). */
export function recarregarTela() {
  return navegar();
}

function desenharMenu(rota) {
  const { menu } = elementos;
  const itens = itensDoMenu(sessao, rota.menuTipo || 'principal');
  const mostrarMenu = itens.length > 0 && sessao.estado !== 'visitante' && rota.acesso !== 'publico'
    && rota.padrao !== '/vinculo' && !rota.padrao.endsWith('-bloqueado') && rota.padrao !== '/conta-bloqueada';
  menu.hidden = !mostrarMenu;
  if (mostrarMenu) mostrar(menu, menuSuperior(itens, rota.menu));
}

function telaDeErro(erro, { recarregar = navegar } = {}) {
  console.error(erro); // fica no console para o suporte; o usuário vê só a mensagem amigável
  const rede = ehErroDeRede(erro);
  mostrar(elementos.raiz, estadoVazio({
    icone: rede ? 'alerta' : 'info',
    titulo: rede ? 'Sem conexão' : 'Algo deu errado',
    texto: rede
      ? 'Não conseguimos falar com o servidor. Confira a internet e tente de novo. Seus dados não foram perdidos.'
      : traduzirErro(erro),
    acao: html`<div class="pilha pilha--pequena">
      ${botao({ texto: 'Tentar de novo', acao: 'tentar-de-novo' })}
      ${botao({ texto: 'Ir para o início', variante: 'secundario', href: '#/' })}
    </div>`,
  }));
  elementos.raiz.querySelector('[data-acao="tentar-de-novo"]')?.addEventListener('click', () => recarregar());
}

async function navegar() {
  if (!elementos) return;
  const meu = ++token;
  if (limparTelaAtual) {
    try { limparTelaAtual(); } catch (e) { console.error(e); }
    limparTelaAtual = null;
  }

  const { caminho, consulta } = lerEndereco();
  const { rota, params } = resolverRota(caminho);
  const decisao = decidirAcesso(rota, sessao);
  estadoAnterior = sessao.estado;

  if (decisao.tipo === 'aguardar') return; // a tela de abertura ainda está visível
  if (decisao.tipo === 'erro') {
    elementos.menu.hidden = true;
    mostrar(elementos.raiz, estadoVazio({
      icone: sessao.erro?.rede ? 'alerta' : 'info',
      titulo: sessao.erro?.rede ? 'Sem conexão' : 'Não foi possível carregar',
      texto: sessao.erro?.mensagem || 'Tente de novo em instantes.',
      acao: botao({ texto: 'Tentar de novo', acao: 'recarregar-sessao' }),
    }));
    elementos.raiz.querySelector('[data-acao="recarregar-sessao"]')?.addEventListener('click', () => recarregarSessao());
    return;
  }
  if (decisao.tipo === 'redirecionar') {
    if (decisao.aviso) toast(decisao.aviso, 'erro');
    ir(decisao.para, { substituir: true });
    return;
  }

  desenharMenu(rota);
  document.title = `${rota.titulo} · ${NOME_APP}`;
  mostrar(elementos.raiz, esqueletos(3));

  try {
    const modulo = await rota.carregar();
    if (meu !== token) return;
    const contexto = {
      raiz: elementos.raiz,
      params,
      consulta,
      extras: rota.extras || {},
      rota,
      sessao,
      ir,
      voltar,
      recarregar: recarregarTela,
      ativo: () => meu === token, // a tela pode conferir se o usuário já saiu dela
    };
    const resultado = await modulo.default(contexto);
    if (meu !== token) {
      if (typeof resultado === 'function') resultado();
      return;
    }
    if (typeof resultado === 'function') limparTelaAtual = resultado;
    window.scrollTo(0, 0);
    elementos.raiz.querySelector('#titulo-da-tela')?.focus({ preventScroll: true });
  } catch (erro) {
    if (meu === token) telaDeErro(erro);
  }
}

/** Liga o roteador. raiz = <main>, menu = <nav>. */
export function iniciarRoteador({ raiz, menu }) {
  elementos = { raiz, menu };
  window.addEventListener('hashchange', navegar);
  // Se o estado da sessão mudar (saiu, foi bloqueado...), reavalia a tela.
  // Mudanças pequenas (contador de clientes) NÃO redesenham a tela aberta.
  aoMudarSessao(() => {
    if (sessao.estado !== estadoAnterior) navegar();
  });
  return navegar();
}
