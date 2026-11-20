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
import { seloDaLista } from '../dominio/lista-servicos.js';
import { estaAtrasado, precisaInformarAparelhoEServico, seloDoServico, textoDosTecnicos, nomesDosTecnicos, nomesDosServicos, tecnicosDaVisita, diaDaConclusao } from '../dominio/servicos.js';
import { formatarHora, formatarDataBR, paraISO } from '../dominio/datas.js';
import { opcoesDeNavegacao } from '../dominio/endereco.js';
import { normalizarWhatsappBR } from '../dominio/telefone.js';
import { abrirAvisos } from './avisos-whatsapp.js';
import { STATUS, ehLinhaSemServico } from '../dominio/servicos.js';

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
 * Cartão de UMA VISITA (agendamento de qualquer status, concluído também). Mostra só o RESUMO: cliente, status,
 * hora (ou o dia, no concluído), endereço, serviço(s) e técnico(s). Tocar abre a página do agendamento
 * (#/servico/<id>) com o cliente, todos os aparelhos e serviços e todos os botões.
 * visita: { linhas, clienteNome, ... } (ver agruparAgendamentos / agruparConcluidos).
 * opcoes.mostrarData: mostra o dia junto da hora.
 * opcoes.acoes: nas listas do dia (Início e Agenda), o TÉCNICO vê "Ir até o cliente" e "Concluir" no próprio cartão.
 *   Com mais de um serviço aberto, "Concluir" abre a página do agendamento para ele escolher qual.
 */
export function cartaoDaVisita(visita, { mostrarData = false, acoes = false, editar = false } = {}) {
  const linhas = visita.linhas;
  const primeira = linhas[0];
  const atrasada = linhas.find((l) => estaAtrasado(l));
  const abertas = linhas.filter((l) => l.status === STATUS.AGENDADO);
  const principal = atrasada || abertas[0] || linhas.find((l) => l.status === STATUS.CANCELADO) || primeira;
  const situacao = seloDaLista(principal);
  const concluido = linhas.every((l) => l.status === STATUS.CONCLUIDO);
  const doTecnico = acoes && !editar;
  const unica = doTecnico && abertas.length === 1 ? abertas[0] : null;
  const servicos = nomesDosServicos(linhas);
  const tecnicos = tecnicosDaVisita(linhas);
  const diaConcluido = diaDaConclusao(linhas);
  const passou = abertas.find((l) => l.reatribuidoDeNome);
  const avisouAtraso = abertas.find((l) => l.atrasoPorTecnico === true);
  const href = `#/servico/${encodeURIComponent(principal.id)}`;

  const corpo = html`
    <a class="visita-cartao__corpo" href="${href}" data-visita-link>
      <div class="visita-cartao__linha">
        <div class="item-lista__titulo visita-cartao__nome">${visita.clienteNome}</div>
        <div class="visita-cartao__lado">
          ${selo(situacao.texto, situacao.tom)}
          <div class="servico-cartao__hora">
            ${concluido ? formatarDataBR(diaConcluido) : formatarHora(primeira.dataAgendada)}
            ${!concluido && mostrarData && html`<span class="servico-cartao__data">${formatarDataBR(primeira.dataAgendada)}</span>`}
          </div>
        </div>
      </div>
      ${primeira.local && html`<div class="item-lista__sub visita-cartao__local">${primeira.local}</div>`}
      ${servicos.length > 0 && html`<div class="visita-cartao__servicos" data-resumo="servicos">${servicos.join(', ')}</div>`}
      ${tecnicos && html`<div class="item-lista__sub" data-resumo="tecnicos">${tecnicos.includes(' e ') || tecnicos.includes(',') ? 'Técnicos' : 'Técnico'}: ${tecnicos}</div>`}
      ${passou && html`<div class="item-lista__sub">Passou de ${passou.reatribuidoDeNome.split(' ')[0]} (atraso)</div>`}
      ${avisouAtraso && html`<div class="item-lista__sub" data-aviso="atraso-tecnico">${(avisouAtraso.atrasoTecnicoNome || 'O técnico').split(' ')[0]} avisou atraso neste serviço.</div>`}
      <span class="visita-cartao__seta" aria-hidden="true"></span>
    </a>`;

  const extra = doTecnico && abertas.length > 0 && html`
    <div class="acoes-cartao">
      ${botao({ texto: 'Ir até o cliente', variante: 'secundario', iconeNome: 'navegar', acao: 'navegar', dados: { id: primeira.id }, pequeno: true })}
      ${unica
    ? (precisaInformarAparelhoEServico(unica)
      ? botao({ texto: unica.aparelhoId ? 'Informar o serviço' : 'Informar aparelho e serviço', iconeNome: 'editar', href: `#/servico/${unica.id}?informar=1`, pequeno: true })
      : botao({ texto: 'Concluir', iconeNome: 'check', href: `#/concluir/${unica.id}`, pequeno: true }))
    : botao({ texto: 'Concluir', iconeNome: 'check', href, pequeno: true })}
    </div>`;

  return html`<div class="cartao servico-cartao ${atrasada ? 'servico-cartao--atrasado' : ''}">${corpo}${extra}</div>`;
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
/** Dia que a Agenda reabre se a pessoa voltar do Agendar sem salvar (vale 10 minutos; o Agendar limpa ao salvar). */
export const diaDeVolta = { iso: '', quando: 0 };

export const hojeIso = () => paraISO(new Date());

/** Título de seção pequeno dentro das telas. */
export function tituloSecao(texto, direita = null) {
  return html`<div class="linha linha--entre"><h2 class="titulo-secao">${texto}</h2>${direita}</div>`;
}

/** Abre o painel de avisos pelo WhatsApp (cliente e técnicos). Só administrador. */
export async function oferecerAviso(tipo, linhas, extra = {}) {
  await abrirAvisos(tipo, linhas, extra);
}

/** O mesmo aviso, a partir das linhas de um agendamento (só as ainda agendadas contam; sem elas, todas). */
export function oferecerAvisoDasLinhas(tipo, linhas, extra = {}) {
  const abertas = linhas.filter((l) => l.status === STATUS.AGENDADO);
  const base = abertas.length > 0 ? abertas : linhas;
  if (base.length === 0) return Promise.resolve();
  return abrirAvisos(tipo, base, extra);
}
