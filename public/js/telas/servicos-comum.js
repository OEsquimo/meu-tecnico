// =============================================================================
// AJUDANTES COMUNS DAS TELAS DE SERVIÇOS (início, agenda, serviço, retornos...)
// =============================================================================
// Este arquivo NÃO é uma tela (não está em rotas.js): reúne o que as telas
// de serviço repetiriam — carregar o CSS próprio, desenhar o cartão de um
// serviço, abrir a navegação (Waze/Maps), tela de erro com "Tentar de novo".
// Assim cada tela fica curta e todas ficam iguais entre si.
// =============================================================================

import { html, mostrar, toast, escolher } from '../nucleo/ui.js';
import { botao, selo, estadoVazio, cabecalho } from '../nucleo/componentes.js';
import { traduzirErro, ehErroDeRede } from '../nucleo/erros.js';
import { sessao } from '../nucleo/sessao.js';
import { ehAdmin } from '../nucleo/permissoes.js';
import { estaAtrasado, textoDosTecnicos, nomesDosTecnicos } from '../dominio/servicos.js';
import { formatarHora, formatarDataBR, paraISO } from '../dominio/datas.js';
import { opcoesDeNavegacao } from '../dominio/endereco.js';
import { normalizarWhatsappBR } from '../dominio/telefone.js';

// -----------------------------------------------------------------------------
// CSS PRÓPRIO DAS TELAS DE SERVIÇO
// -----------------------------------------------------------------------------

let promessaEstilos = null;

/**
 * Carrega css/telas-servicos.css uma única vez (o index.html não o declara).
 * Nunca falha: se o arquivo demorar ou não vier, a tela abre mesmo assim.
 */
export function carregarEstilos() {
  if (promessaEstilos) return promessaEstilos;
  promessaEstilos = new Promise((resolver) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/telas-servicos.css';
    link.addEventListener('load', () => resolver());
    link.addEventListener('error', () => resolver());
    document.head.appendChild(link);
    setTimeout(resolver, 3000); // não espera para sempre
  });
  return promessaEstilos;
}

// -----------------------------------------------------------------------------
// QUEM ESTÁ USANDO
// -----------------------------------------------------------------------------

/** Dados do usuário atual usados por todas as telas de serviço. */
export function contextoDoUsuario() {
  return {
    empresaId: sessao.vinculo.empresaId,
    uid: sessao.usuario.uid,
    nome: sessao.vinculo.nome || '',
    admin: ehAdmin(sessao),
  };
}

/** Primeiro nome ("Marcos Frio" -> "Marcos"). */
export function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

// -----------------------------------------------------------------------------
// ERRO E CARREGAMENTO
// -----------------------------------------------------------------------------

/**
 * Desenha a tela de erro com o botão "Tentar de novo" (o app nunca trava).
 * "cabecalhoHtml" é opcional: mantém o título da tela acima do erro.
 */
export function mostrarErroComTentar(raiz, erro, tentarDeNovo, cabecalhoHtml = '') {
  console.error(erro);
  const rede = ehErroDeRede(erro);
  mostrar(raiz, html`
    ${cabecalhoHtml}
    ${estadoVazio({
      icone: rede ? 'alerta' : 'info',
      titulo: rede ? 'Sem conexão' : 'Algo deu errado',
      texto: rede ? 'Confira a internet e tente de novo. Seus dados não foram perdidos.' : traduzirErro(erro),
      acao: botao({ texto: 'Tentar de novo', acao: 'tentar-de-novo' }),
    })}`);
  raiz.querySelector('[data-acao="tentar-de-novo"]')?.addEventListener('click', () => tentarDeNovo());
}

/** Tela "não encontrado" com um botão de saída. */
export function mostrarNaoEncontrado(raiz, titulo, texto, href = '#/') {
  mostrar(raiz, html`
    ${cabecalho({ titulo, voltarPara: href })}
    ${estadoVazio({ icone: 'info', titulo, texto, acao: botao({ texto: 'Voltar', variante: 'secundario', href }) })}`);
}

// -----------------------------------------------------------------------------
// CARTÃO DE SERVIÇO
// -----------------------------------------------------------------------------

/** Separa as linhas de uma visita por aparelho, mantendo a ordem. */
function blocosPorAparelho(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const chave = l.aparelhoId || '';
    if (!mapa.has(chave)) mapa.set(chave, { rotulo: l.aparelhoResumo || '', linhas: [] });
    mapa.get(chave).linhas.push(l);
  }
  return [...mapa.values()];
}

/**
 * Cartão de UMA VISITA agendada (usado no início e na agenda): horário, cliente
 * e endereço aparecem uma vez; dentro, os aparelhos e, em cada um, os serviços
 * com o técnico e o botão "Concluir" de cada serviço.
 * visita: { linhas, clienteNome, ... } (ver agruparAgendamentos).
 * opcoes.mostrarData: mostra o dia junto da hora (lista de atrasados).
 * opcoes.mostrarTecnico: mostra o técnico de cada serviço (visão do administrador).
 * opcoes.acoes: mostra "Ir até o cliente" e os botões "Concluir".
 * opcoes.editar: mostra o botão "Editar" no topo (só administrador).
 * opcoes.acoesAtrasado: visita atrasada ganha "Cancelar" e "Excluir" (só administrador).
 */
export function cartaoDaVisita(visita, { mostrarData = false, mostrarTecnico = false, acoes = false, editar = false, acoesAtrasado = false } = {}) {
  const linhas = visita.linhas;
  const primeira = linhas[0];
  const atrasado = linhas.some((l) => estaAtrasado(l));
  return html`
    <div class="cartao servico-cartao ${atrasado ? 'servico-cartao--atrasado' : ''}">
      <div class="visita-cartao__topo">
        <a class="servico-cartao__corpo visita-cartao__corpo" href="#/servico/${primeira.id}">
          <div class="servico-cartao__hora">
            ${formatarHora(primeira.dataAgendada)}
            ${mostrarData && html`<span class="servico-cartao__data">${formatarDataBR(primeira.dataAgendada)}</span>`}
          </div>
          <div class="expande">
            <div class="item-lista__titulo">${visita.clienteNome}</div>
            ${primeira.local && html`<div class="item-lista__sub">${primeira.local}</div>`}
            ${atrasado && html`<div>${selo('Atrasado', 'vermelho')}</div>`}
          </div>
        </a>
        ${editar && botao({ texto: 'Editar', variante: 'secundario', iconeNome: 'editar', href: `#/servico/${primeira.id}/editar`, pequeno: true })}
      </div>
      ${blocosPorAparelho(linhas).map((bloco) => html`
        <div class="visita-bloco">
          <div class="visita-bloco__titulo">${bloco.rotulo || 'Aparelho ainda não escolhido'}</div>
          ${bloco.linhas.map((l) => html`
            <div class="visita-linha">
              <div class="expande">
                <div class="visita-linha__nome">${l.tipoServicoNome}</div>
                ${mostrarTecnico && textoDosTecnicos(l) && html`<div class="item-lista__sub">${nomesDosTecnicos(l).length > 1 ? 'Técnicos' : 'Técnico'}: ${textoDosTecnicos(l)}</div>`}
              </div>
              ${acoes && botao({ texto: 'Concluir', iconeNome: 'check', href: `#/concluir/${l.id}`, pequeno: true })}
            </div>`)}
        </div>`)}
      ${acoes && html`
        <div class="acoes-cartao">
          ${botao({ texto: 'Ir até o cliente', variante: 'secundario', iconeNome: 'navegar', acao: 'navegar', dados: { id: primeira.id }, pequeno: true })}
          ${acoesAtrasado && atrasado && botao({ texto: 'Cancelar', variante: 'secundario', acao: 'cancelar-visita', dados: { chave: visita.chave }, pequeno: true })}
          ${acoesAtrasado && atrasado && botao({ texto: 'Excluir', variante: 'perigo', iconeNome: 'lixeira', acao: 'excluir-visita', dados: { chave: visita.chave }, pequeno: true })}
        </div>`}
    </div>`;
}

// -----------------------------------------------------------------------------
// NAVEGAÇÃO / CONTATO
// -----------------------------------------------------------------------------

/**
 * Abre a janela "Ir até o cliente" (Google Maps, Waze, outro app).
 * Usa o texto do local que já vem copiado para dentro do serviço.
 */
export async function abrirNavegacao(servico) {
  if (!servico.local && !Number.isFinite(servico.localLat)) {
    toast('Este serviço não tem endereço cadastrado.', 'erro');
    return;
  }
  const endereco = {
    lat: Number.isFinite(servico.localLat) ? servico.localLat : null,
    lng: Number.isFinite(servico.localLng) ? servico.localLng : null,
    rua: String(servico.local || '').replace(/ · /g, ', '),
  };
  await escolher({
    titulo: 'Ir até o cliente',
    mensagem: 'Escolha o aplicativo de mapas.',
    opcoes: opcoesDeNavegacao(endereco).map((o) => ({ id: o.id, rotulo: o.rotulo, href: o.href })),
  });
}

/** "tel:+5511..." para ligar, ou null se o telefone for inválido. */
export function linkLigar(telefone) {
  const numero = normalizarWhatsappBR(telefone);
  return numero ? `tel:+${numero}` : null;
}

// -----------------------------------------------------------------------------
// PEQUENOS TEXTOS
// -----------------------------------------------------------------------------

/** Dia de hoje em AAAA-MM-DD. */
export const hojeIso = () => paraISO(new Date());

/** Título de seção pequeno dentro das telas. */
export function tituloSecao(texto, direita = null) {
  return html`<div class="linha linha--entre"><h2 class="titulo-secao">${texto}</h2>${direita}</div>`;
}
