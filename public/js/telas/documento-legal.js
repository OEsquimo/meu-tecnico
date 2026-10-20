// =============================================================================
// TELA: Termos de uso / Política de privacidade (mesma tela, dois documentos)
// =============================================================================

import { html, mostrar } from '../nucleo/ui.js';
import { cabecalho } from '../nucleo/componentes.js';
import { sessao } from '../nucleo/sessao.js';
import { TERMOS_DE_USO, POLITICA_DE_PRIVACIDADE, DATA_ATUALIZACAO_TEXTOS } from './textos-legais.js';

export default function montar({ raiz, extras }) {
  const ehTermos = extras.documento === 'termos';
  const secoes = ehTermos ? TERMOS_DE_USO : POLITICA_DE_PRIVACIDADE;
  const voltar = sessao.usuario ? (sessao.estado === 'pronto' ? '#/conta' : '#/vinculo') : '#/criar-conta';
  mostrar(raiz, html`
    ${cabecalho({ titulo: ehTermos ? 'Termos de uso' : 'Política de privacidade', subtitulo: `Atualizado em ${DATA_ATUALIZACAO_TEXTOS}`, voltarPara: voltar })}
    <article class="documento">
      ${secoes.map((s) => html`
        <h2>${s.titulo}</h2>
        ${(s.paragrafos || []).map((p) => html`<p>${p}</p>`)}
        ${s.itens && html`<ul>${s.itens.map((i) => html`<li>${i}</li>`)}</ul>`}
      `)}
      <p class="texto-suave texto-pequeno">Modelo de texto: leia com atenção e peça revisão jurídica antes de vender o aplicativo.</p>
    </article>`);
}
