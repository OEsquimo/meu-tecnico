// =============================================================================
// ÍCONES — desenhos SVG simples (traço de 2 px), no mesmo estilo em todo o app
// =============================================================================
// Uso: ${icone('sino')} ou ${icone('mais', 20)} dentro de um html`...`.
// Cada ícone é só o conteúdo interno do <svg viewBox="0 0 24 24">.
// =============================================================================

import { bruto } from './ui-texto.js';

const DESENHOS = {
  voltar: '<path d="M15 5l-7 7 7 7"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  buscar: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  sino: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 15 18 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.2.7 3.5 2.6 3.5 5.7"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  grafico: '<path d="M4 20V11M10 20V4M16 20v-6M2 20h20"/>',
  ajustes: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  telefone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  whatsapp: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.7-5.2A8.4 8.4 0 1 1 21 11.5z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-1.9-1-.8.6a3.4 3.4 0 0 1-1.6-1.6l.6-.8-1-1.9z"/>',
  navegar: '<path d="M3 11l18-8-8 18-2-8-8-2z"/>',
  editar: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  lixeira: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  casa: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
  local: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  aparelho: '<rect x="3" y="4" width="18" height="8" rx="2"/><path d="M7 16c0 2 2 2 2 4M12 16c0 2 2 2 2 4M17 16c0 2 2 2 2 4"/>',
  usuarioMais: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M19 8v6M16 11h6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  cadeado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  baixar: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  subir: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
  alerta: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  dinheiro: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.4 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1.1 0-2-.4-2.5-1.2M12 6v2M12 16v2"/>',
  ferramenta: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  escudo: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  estrela: '<path d="M12 3l2.7 5.5 6 .9-4.4 4.2 1 6L12 16.8 6.7 19.6l1-6L3.3 9.4l6-.9z"/>',
  recarregar: '<path d="M20 11a8 8 0 0 0-14.5-3.5M4 4v4h4M4 13a8 8 0 0 0 14.5 3.5M20 20v-4h-4"/>',
};

/** Devolve o SVG pronto (como HTML "bruto", seguro) para usar dentro de html`...`. */
export function icone(nome, tamanho = 22) {
  const desenho = DESENHOS[nome];
  if (!desenho) throw new Error(`Ícone desconhecido: ${nome}`);
  return bruto(
    `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${desenho}</svg>`,
  );
}

export const NOMES_DE_ICONES = Object.keys(DESENHOS);
