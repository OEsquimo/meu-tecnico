// =============================================================================
// TELA: Ferramentas (lista)
// =============================================================================
// Mostra as ferramentas liberadas para o papel do usuário (nucleo/ferramentas.js).
// =============================================================================

import { html, mostrar } from '../nucleo/ui.js';
import { cabecalho, estadoVazio } from '../nucleo/componentes.js';
import { ferramentasDoUsuario } from '../nucleo/ferramentas.js';
import { icone } from '../nucleo/icones.js';

export default async function montar({ raiz, sessao }) {
  const lista = ferramentasDoUsuario(sessao);
  mostrar(raiz, html`
    ${cabecalho({ titulo: 'Ferramentas', voltarPara: '#/' })}
    ${lista.length === 0
    ? estadoVazio({ icone: 'ferramenta', titulo: 'Nenhuma ferramenta por aqui', texto: 'Quando houver ferramentas liberadas para você, elas aparecem nesta tela.' })
    : html`<div class="pilha pilha--pequena">${lista.map((f) => html`
        <a class="cartao cartao-link ferramenta" href="${f.href}">
          <span class="ferramenta__icone">${icone(f.icone, 22)}</span>
          <span class="expande">
            <span class="item-lista__titulo">${f.titulo}</span><br />
            <span class="item-lista__sub">${f.sub}</span>
          </span>
        </a>`)}</div>`}`);
}
