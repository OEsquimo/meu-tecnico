// =============================================================================
// DUPLICIDADE — cliente repetido e agendamento repetido (funções puras)
// =============================================================================
// 1. CLIENTE: ao cadastrar um cliente novo, compara o WhatsApp e os endereços com os clientes
//    que já existem. O app só AVISA e deixa a pessoa decidir: nunca bloqueia nem junta sozinho.
// 2. AGENDAMENTO: o mesmo cliente, no mesmo aparelho, com o mesmo serviço, no mesmo dia e hora,
//    não pode ser agendado duas vezes (isso é quase sempre um toque duplo ou um esquecimento).
// =============================================================================

import { normalizarWhatsappBR } from './telefone.js';
import { STATUS, chaveDoAgendamento } from './servicos.js';

// -----------------------------------------------------------------------------
// CLIENTE
// -----------------------------------------------------------------------------

const ABREVIACOES = new Map([
  ['r', 'rua'], ['av', 'avenida'], ['avd', 'avenida'], ['trav', 'travessa'], ['tv', 'travessa'],
  ['al', 'alameda'], ['estr', 'estrada'], ['rod', 'rodovia'], ['pc', 'praca'], ['pca', 'praca'],
  ['lg', 'largo'], ['jd', 'jardim'], ['vl', 'vila'], ['sta', 'santa'], ['sto', 'santo'],
  ['dr', 'doutor'], ['prof', 'professor'], ['cel', 'coronel'], ['gen', 'general'],
]);

/** Texto sem acento, minúsculo, sem pontuação e com as abreviações comuns por extenso. */
export function normalizarTextoDeEndereco(texto) {
  const limpo = String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpo) return '';
  return limpo.split(' ').map((p) => ABREVIACOES.get(p) || p).join(' ');
}

/** "S/N", "sn", "s n" e vazio contam como "sem número". */
function normalizarNumero(texto) {
  const t = normalizarTextoDeEndereco(texto).replace(/ /g, '');
  if (t === '' || t === 'sn' || t === 'semnumero') return 'sn';
  return t;
}

/**
 * Chave de comparação de um endereço: rua + número + cidade (+ complemento, que separa apartamentos).
 * Devolve '' quando não dá para comparar (sem rua).
 */
export function chaveDoEndereco(e) {
  const rua = normalizarTextoDeEndereco(e?.rua);
  if (!rua) return '';
  return [rua, normalizarNumero(e?.numero), normalizarTextoDeEndereco(e?.cidade), normalizarTextoDeEndereco(e?.complemento)].join('|');
}

/** Mesma rua, número e cidade (o complemento só conta se os dois tiverem). */
export function enderecosIguais(a, b) {
  const ca = chaveDoEndereco(a);
  const cb = chaveDoEndereco(b);
  if (!ca || !cb) return false;
  const [ra, na, ia, xa] = ca.split('|');
  const [rb, nb, ib, xb] = cb.split('|');
  if (ra !== rb || na !== nb) return false;
  if (ia && ib && ia !== ib) return false;
  if (xa && xb && xa !== xb) return false;
  return true;
}

/**
 * Procura, entre `clientes`, quem tem o mesmo WhatsApp e/ou o mesmo endereço do cadastro novo.
 * Devolve [{ cliente, motivos: ['whatsapp'?, 'endereco'?] }] — quem bate nos dois vem primeiro.
 * `ignorarId`: o próprio cliente (ao editar).
 */
export function acharClientesParecidos(clientes, { whatsapp, enderecos = [] }, { ignorarId = null } = {}) {
  const fone = normalizarWhatsappBR(whatsapp);
  const achados = [];
  for (const c of clientes || []) {
    if (!c || c.id === ignorarId || c.arquivado === true) continue;
    const motivos = [];
    if (fone && normalizarWhatsappBR(c.whatsapp) === fone) motivos.push('whatsapp');
    if (enderecos.some((novo) => (c.enderecos || []).some((antigo) => enderecosIguais(novo, antigo)))) motivos.push('endereco');
    if (motivos.length > 0) achados.push({ cliente: c, motivos });
  }
  return achados.sort((a, b) => b.motivos.length - a.motivos.length);
}

/** Texto do aviso, conforme o que coincidiu (só telefone, só endereço ou os dois). */
export function textoDoAvisoDeCliente(motivos) {
  if (motivos.length === 2) return 'O WhatsApp e o endereço são iguais aos de um cliente já cadastrado.';
  if (motivos[0] === 'whatsapp') return 'Já existe um cliente com esse WhatsApp.';
  return 'Já existe um cliente com esse endereço.';
}

// -----------------------------------------------------------------------------
// AGENDAMENTO
// -----------------------------------------------------------------------------

const mesmoMinuto = (a, b) => a instanceof Date && b instanceof Date && Math.floor(a.getTime() / 60000) === Math.floor(b.getTime() / 60000);

/**
 * Já existe, para o MESMO cliente, o mesmo aparelho e o mesmo serviço nesse dia e hora?
 * - `pares`: [{ aparelhoId, tipoId }] do agendamento que vai ser salvo (linhas sem aparelho ou sem serviço não contam);
 * - `agendados`: serviços com status "agendado" (de qualquer visita);
 * - `ignorarAgendamento`: chave do agendamento em edição (ele não conflita com ele mesmo).
 * Devolve a linha que já existe, ou null.
 */
export function acharAgendamentoDuplicado({ clienteId, inicio, pares, agendados, ignorarAgendamento = null }) {
  if (!clienteId || !(inicio instanceof Date)) return null;
  const validos = (pares || []).filter((p) => p.aparelhoId && p.tipoId);
  if (validos.length === 0) return null;
  for (const s of agendados || []) {
    if (s.status !== STATUS.AGENDADO || s.clienteId !== clienteId) continue;
    if (ignorarAgendamento && chaveDoAgendamento(s) === ignorarAgendamento) continue;
    if (!mesmoMinuto(s.dataAgendada, inicio)) continue;
    if (validos.some((p) => p.aparelhoId === s.aparelhoId && p.tipoId === s.tipoServicoId)) return s;
  }
  return null;
}

export const MENSAGEM_AGENDAMENTO_DUPLICADO = 'Esse serviço já está agendado para este cliente, neste aparelho, nesse dia e horário.';
