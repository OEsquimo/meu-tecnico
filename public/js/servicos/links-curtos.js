// =============================================================================
// LINKS CURTOS (pacote 25) — "#/h/<código>" e "#/p/<código>"
// =============================================================================
// Os links de horários e do pedido do cliente eram enormes (tudo ia escrito no endereço). Agora o app guarda esse
// texto num pequeno documento (coleção `linksCurtos`) e o link leva só um código de 10 letras/números.
//   * tipo "horarios": criado pelo ADMINISTRADOR; qualquer pessoa com o código lê (não dá para listar). Vale ~8 dias.
//   * tipo "pedido":   criado pela página do CLIENTE (precisa citar o código de um link de horários válido da mesma
//                      empresa); só o administrador da empresa lê. Vale 30 dias.
// Se não der para gravar (sem internet, regras ainda não publicadas...) o app usa o link comprido de antes: nada deixa de
// funcionar. No modo demonstração os links continuam compridos (o banco de lá é só da memória de cada aparelho); para
// testar o link curto na demonstração, abra o app com "?demo=1&curtos=1".
// =============================================================================

import { ehErroDePermissao } from '../nucleo/erros.js';
import { ler, gravar, operacao, AGORA, nomeDoAdaptador } from '../nucleo/banco.js';
import {
  codigoDeLinkCurtoValido, consultaDoLinkDeHorarios, consultaDoPedido, linkCurtoDeHorarios, linkCurtoDoPedido,
  montarLinkDeHorarios, linkDoPedidoNoApp, linkCurtoDoMapa,
} from '../dominio/link-horarios.js';
import { consultaParaMapa, hrefGoogleMaps } from '../dominio/endereco.js';

export const VIDA_LINK_HORARIOS_DIAS = 8;
export const VIDA_LINK_PEDIDO_DIAS = 30;
export const VIDA_LINK_MAPA_DIAS = 30;
const COLECAO = 'linksCurtos';
const ALFABETO = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Código aleatório de 10 letras minúsculas e números (difícil de adivinhar). */
export function gerarCodigoCurto() {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

/** Os links curtos valem no app de verdade; na demonstração só com "?demo=1&curtos=1". */
export function usaLinkCurto() {
  if (nomeDoAdaptador() === 'firestore') return true;
  try { return new URLSearchParams(window.location.search).get('curtos') === '1'; } catch { return false; }
}

const emDias = (n) => new Date(Date.now() + n * 86400000);

async function criar({ tipo, empresaId, consulta, origem = null, vidaDias }) {
  const codigo = gerarCodigoCurto();
  const dados = { tipo, empresaId, consulta, criadoEm: AGORA, expiraEm: emDias(vidaDias) };
  if (origem) dados.origem = origem;
  await gravar([operacao.criar(`${COLECAO}/${codigo}`, dados)]);
  return codigo;
}

/**
 * Link de horários para mandar ao cliente: curto se conseguir gravar, comprido se não.
 * @param {object} p  { base, empresaId, empresa, whatsapp, servicos, dias, geradoEm }
 */
export async function linkDeHorariosParaEnviar(p) {
  const { empresaId, ...resto } = p;
  if (usaLinkCurto() && empresaId) {
    try {
      const codigo = await criar({ tipo: 'horarios', empresaId, consulta: consultaDoLinkDeHorarios(resto), vidaDias: VIDA_LINK_HORARIOS_DIAS });
      return linkCurtoDeHorarios(p.base, codigo);
    } catch { /* usa o link comprido */ }
  }
  return montarLinkDeHorarios(resto);
}

/**
 * Link "Técnico: abrir no app" do pedido do cliente. `origem` = código do link de horários que o cliente abriu
 * (sem código = link comprido de antes, então o pedido também vai comprido).
 */
export async function linkDoPedidoParaEnviar(base, { origem, empresaId, ...dados }) {
  if (origem && empresaId) {
    try {
      const codigo = await criar({ tipo: 'pedido', empresaId, consulta: consultaDoPedido(dados), origem, vidaDias: VIDA_LINK_PEDIDO_DIAS });
      return linkCurtoDoPedido(base, codigo);
    } catch { /* usa o link comprido */ }
  }
  return linkDoPedidoNoApp(base, dados);
}

/**
 * Link do Google Maps para a mensagem do técnico (Pacote 30): curto (`#/m/<código>`, vale 30 dias) se conseguir gravar,
 * senão o link comprido do Google Maps de sempre. Sem endereço nem coordenadas devolve ''.
 */
export async function linkDoMapaParaEnviar(base, { empresaId, endereco = '', lat = null, lng = null }) {
  const texto = String(endereco ?? '').trim();
  const temPonto = Number.isFinite(lat) && Number.isFinite(lng);
  if (!texto && !temPonto) return '';
  const consulta = consultaParaMapa({ rua: texto, lat: temPonto ? lat : undefined, lng: temPonto ? lng : undefined });
  if (usaLinkCurto() && empresaId) {
    try {
      const codigo = await criar({ tipo: 'mapa', empresaId, consulta, vidaDias: VIDA_LINK_MAPA_DIAS });
      return linkCurtoDoMapa(base, codigo);
    } catch { /* usa o link comprido */ }
  }
  return hrefGoogleMaps(consulta);
}

/**
 * Lê um link curto. Devolve { tipo, empresaId, consulta, origem, vencido } ou null se não existir / não for permitido.
 * Erro de rede ou de tempo sobe (a tela mostra "tentar de novo").
 */
export async function lerLinkCurto(codigo) {
  if (!codigoDeLinkCurtoValido(codigo)) return null;
  let doc;
  try {
    doc = await ler(`${COLECAO}/${codigo}`);
  } catch (erro) {
    if (ehErroDePermissao(erro)) return null; // não existe ou venceu
    throw erro;
  }
  if (!doc || typeof doc.consulta !== 'string') return null;
  const vencido = doc.expiraEm instanceof Date && doc.expiraEm.getTime() < Date.now();
  return { tipo: doc.tipo, empresaId: doc.empresaId || '', consulta: doc.consulta, origem: doc.origem || '', vencido };
}
