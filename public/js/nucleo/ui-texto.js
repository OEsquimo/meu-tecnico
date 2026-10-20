// =============================================================================
// UI-TEXTO — montagem segura de HTML (proteção contra XSS)
// =============================================================================
// Problema: nome de cliente, observações etc. vêm do usuário. Se fossem
// colados direto no HTML, alguém poderia digitar <script> e executar código.
//
// Solução: a função html`...` escapa TUDO que é interpolado (${...}), exceto
// o que já foi montado por ela mesma ou marcado com bruto().
//
//   html`<p>Olá, ${nome}</p>`          -> nome é escapado
//   html`<ul>${lista.map(i => html`<li>${i}</li>`)}</ul>`   -> listas funcionam
//   ${cond && html`<b>x</b>`}           -> false/null/undefined viram texto vazio
//
// Este arquivo é puro (não toca no DOM): pode ser testado no Node.
// =============================================================================

class HtmlBruto {
  constructor(texto) {
    this.texto = texto;
  }

  toString() {
    return this.texto;
  }
}

/** Marca um texto como "já é HTML confiável" (use SÓ com HTML escrito por nós). */
export function bruto(texto) {
  return new HtmlBruto(String(texto));
}

const SUBSTITUICOES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/** Escapa caracteres especiais de HTML. */
export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"'`]/g, (c) => SUBSTITUICOES[c]);
}

function converter(valor) {
  if (valor instanceof HtmlBruto) return valor.texto;
  if (Array.isArray(valor)) return valor.map(converter).join('');
  if (valor === false || valor === null || valor === undefined) return '';
  return esc(valor);
}

/** Template tag: monta HTML escapando automaticamente os valores interpolados. */
export function html(textos, ...valores) {
  let saida = '';
  textos.forEach((texto, i) => {
    saida += texto;
    if (i < valores.length) saida += converter(valores[i]);
  });
  return new HtmlBruto(saida);
}

/** Primeiras letras do nome para o "avatar": "Maria Souza" -> "MS". */
export function iniciais(nome) {
  const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Remove acentos e põe em minúsculas — usado nas buscas ("jose" acha "José"). */
export function textoParaBusca(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
