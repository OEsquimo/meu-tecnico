// =============================================================================
// VALORES DO SERVIÇO — conta do total (funções puras)
// =============================================================================
// Um serviço concluído tem: valor do serviço (base), extras (peças, deslocamento,
// serviço adicional...: descrição + valor) e desconto. O TOTAL é
//     base + soma dos extras - desconto
// Tudo em CENTAVOS inteiros (ver dinheiro.js).
// =============================================================================

import { reaisParaCentavos } from './dinheiro.js';

export const MAXIMO_EXTRAS = 20;
export const MAXIMO_CENTAVOS = 100000000;

const texto = (v) => String(v ?? '').trim();

/** Soma dos extras ({ descricao, valorCentavos }). */
export function somaDosExtras(extras) {
  return (extras || []).reduce((t, e) => t + (Number.isInteger(e?.valorCentavos) ? e.valorCentavos : 0), 0);
}

/** Total = base + extras - desconto (nunca abaixo de zero). */
export function calcularTotal({ baseCentavos = 0, extras = [], descontoCentavos = 0 }) {
  const base = Number.isInteger(baseCentavos) ? baseCentavos : 0;
  const desconto = Number.isInteger(descontoCentavos) ? descontoCentavos : 0;
  return Math.max(0, base + somaDosExtras(extras) - desconto);
}

/**
 * Lê o que foi digitado ({ base: '150', extras: [{descricao, valor}], desconto: '10' }).
 * `exigirBase`: o administrador precisa informar o valor do serviço.
 * Devolve { valido, erros, dados } com dados = { baseCentavos, extras, descontoCentavos, valorCentavos }.
 * Erros: valor, extras, desconto (chaves iguais aos data-campo da tela).
 */
export function validarValores({ base = '', extras = [], desconto = '' }, { exigirBase = true } = {}) {
  const erros = {};
  let baseCentavos = null;
  if (texto(base) === '') {
    if (exigirBase) erros.valor = 'Informe o valor do serviço.';
  } else {
    baseCentavos = reaisParaCentavos(texto(base));
    if (baseCentavos === null) erros.valor = 'Valor inválido. Exemplo: 150 ou 150,50';
    else if (baseCentavos > MAXIMO_CENTAVOS) erros.valor = 'Esse valor é alto demais. Confira.';
  }

  const itens = [];
  let extrasOk = true;
  for (const e of extras) {
    const d = texto(e.descricao);
    const v = texto(e.valor);
    if (d === '' && v === '') continue; // linha em branco: ignora
    const centavos = v === '' ? null : reaisParaCentavos(v);
    if (d === '' || centavos === null || centavos > MAXIMO_CENTAVOS || d.length > 60) { extrasOk = false; continue; }
    itens.push({ descricao: d, valorCentavos: centavos });
  }
  if (!extrasOk) erros.extras = 'Confira os extras: cada um precisa de descrição (até 60 letras) e de um valor válido.';
  else if (itens.length > MAXIMO_EXTRAS) erros.extras = `Use no máximo ${MAXIMO_EXTRAS} extras.`;

  let descontoCentavos = 0;
  if (texto(desconto) !== '') {
    const c = reaisParaCentavos(texto(desconto));
    if (c === null) erros.desconto = 'Desconto inválido. Exemplo: 10 ou 10,50';
    else descontoCentavos = c;
  }

  if (!erros.valor && !erros.extras && !erros.desconto) {
    const bruto = (baseCentavos ?? 0) + somaDosExtras(itens);
    if (descontoCentavos > bruto) erros.desconto = 'O desconto não pode ser maior que o valor do serviço mais os extras.';
    if (bruto > MAXIMO_CENTAVOS) erros.valor = 'O total fica alto demais. Confira.';
  }
  const dados = {
    baseCentavos, extras: itens, descontoCentavos,
    valorCentavos: baseCentavos === null && itens.length === 0 ? null : calcularTotal({ baseCentavos: baseCentavos ?? 0, extras: itens, descontoCentavos }),
  };
  return { valido: Object.keys(erros).length === 0, erros, dados };
}

/**
 * Documento valores/{servicoId} a partir dos dados validados (ou do valor antigo,
 * que era só um número: vira "base" sem extras).
 */
export function documentoDeValores(dados) {
  if (typeof dados === 'number') return { valorCentavos: dados, baseCentavos: dados, extras: [], descontoCentavos: 0 };
  const base = Number.isInteger(dados.baseCentavos) ? dados.baseCentavos : 0;
  const extras = (dados.extras || []).map((e) => ({ descricao: e.descricao, valorCentavos: e.valorCentavos }));
  const descontoCentavos = Number.isInteger(dados.descontoCentavos) ? dados.descontoCentavos : 0;
  return { valorCentavos: calcularTotal({ baseCentavos: base, extras, descontoCentavos }), baseCentavos: base, extras, descontoCentavos };
}

/** Lê um documento valores/{id} (inclusive o formato antigo, só com valorCentavos). */
export function lerDocumentoDeValores(doc) {
  if (!doc) return null;
  const total = Number.isInteger(doc.valorCentavos) ? doc.valorCentavos : 0;
  const extras = Array.isArray(doc.extras) ? doc.extras : [];
  const desconto = Number.isInteger(doc.descontoCentavos) ? doc.descontoCentavos : 0;
  const base = Number.isInteger(doc.baseCentavos) ? doc.baseCentavos : Math.max(0, total - somaDosExtras(extras) + desconto);
  return { valorCentavos: total, baseCentavos: base, extras, descontoCentavos: desconto };
}
