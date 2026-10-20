// =============================================================================
// APARELHOS — textos e resumos (funções puras)
// =============================================================================

import { TIPOS_APARELHO } from '../nucleo/constantes.js';

export function rotuloTipoAparelho(valor) {
  return TIPOS_APARELHO.find((t) => t.valor === valor)?.rotulo || 'Aparelho';
}

/** 12000 -> "12.000 BTUs" */
export function formatarBtus(btus) {
  if (!Number.isFinite(btus) || btus <= 0) return '';
  return `${new Intl.NumberFormat('pt-BR').format(btus)} BTUs`;
}

/** "Split (parede) · 12.000 BTUs" — o tipo e a capacidade. */
export function descricaoTecnica(a) {
  return [rotuloTipoAparelho(a.tipo), formatarBtus(a.btus)].filter(Boolean).join(' · ');
}

/** Título do aparelho: o nome (se tiver) ou o tipo. Ex.: "Sala" / "Split (parede)". */
export function tituloDoAparelho(a) {
  return a.nome ? a.nome : rotuloTipoAparelho(a.tipo);
}

/** Resumo de uma linha para listas e para guardar dentro do serviço: "Sala · Split (parede) · 12.000 BTUs". */
export function resumoDoAparelho(a) {
  const partes = [a.nome, rotuloTipoAparelho(a.tipo), formatarBtus(a.btus)].filter(Boolean);
  return partes.join(' · ');
}
