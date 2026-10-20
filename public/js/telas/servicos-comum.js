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
import { seloDoServico, estaAtrasado } from '../dominio/servicos.js';
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

/**
 * Cartão de um serviço agendado (usado no início e na agenda).
 * opcoes.mostrarData: mostra o dia junto da hora (lista de atrasados).
 * opcoes.mostrarTecnico: mostra o nome do técnico (visão do administrador).
 * opcoes.acoes: mostra os botões "Ir até o cliente" e "Concluir".
 */
export function cartaoDoServico(s, { mostrarData = false, mostrarTecnico = false, acoes = false } = {}) {
  const atrasado = estaAtrasado(s);
  const situacao = seloDoServico(s);
  return html`
    <div class="cartao servico-cartao ${atrasado ? 'servico-cartao--atrasado' : ''}">
      <a class="servico-cartao__corpo" href="#/servico/${s.id}">
        <div class="servico-cartao__hora">
          ${formatarHora(s.dataAgendada)}
          ${mostrarData && html`<span class="servico-cartao__data">${formatarDataBR(s.dataAgendada)}</span>`}
        </div>
        <div class="expande">
          <div class="item-lista__titulo">${s.clienteNome}</div>
          <div class="item-lista__sub">${s.tipoServicoNome}${s.aparelhoResumo ? ` · ${s.aparelhoResumo}` : ''}</div>
          ${s.local && html`<div class="item-lista__sub">${s.local}</div>`}
          ${mostrarTecnico && s.tecnicoNome && html`<div class="item-lista__sub">Técnico: ${s.tecnicoNome}</div>`}
        </div>
        ${(atrasado || s.status !== 'agendado') && selo(situacao.texto, situacao.tom)}
      </a>
      ${acoes && html`
        <div class="acoes-cartao">
          ${botao({ texto: 'Ir até o cliente', variante: 'secundario', iconeNome: 'navegar', acao: 'navegar', dados: { id: s.id }, pequeno: true })}
          ${botao({ texto: 'Concluir', iconeNome: 'check', href: `#/concluir/${s.id}`, pequeno: true })}
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
