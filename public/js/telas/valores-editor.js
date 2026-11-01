// =============================================================================
// EDITOR DE VALORES (não é uma tela: não tem rota)
// =============================================================================
// Bloco usado ao concluir o serviço e ao corrigir o valor depois:
//   Valor do serviço  +  Extras (descrição + valor, quantos precisar)  -  Desconto  =  Total
// O total aparece na hora, enquanto digita. Tudo em centavos por baixo (dominio/valores.js).
//
// Uso:  html`${editorDeValores({ base, extras, desconto })}`   (dentro do <form>)
//       const editor = ligarEditorDeValores(form);            // depois de mostrar a tela
//       aoClicar(raiz, { ...editor.acoes })                    // botões + Adicionar / Remover
//       const lido = editor.ler();                             // { base, extras, desconto } (textos)
// =============================================================================

import { html, mostrar } from '../nucleo/ui.js';
import { botao } from '../nucleo/componentes.js';
import { reaisParaCentavos, formatarReais, centavosParaCampo } from '../dominio/dinheiro.js';
import { calcularTotal, MAXIMO_EXTRAS } from '../dominio/valores.js';

function linhaDeExtra({ descricao = '', valor = '' }, i) {
  return html`
    <div class="extra-linha" data-extra="${i}">
      <input class="campo__entrada extra-linha__descricao" name="extraDescricao" type="text" maxlength="60" value="${descricao}" placeholder="Ex.: Peça, deslocamento" aria-label="Descrição do extra" />
      <input class="campo__entrada extra-linha__valor" name="extraValor" type="text" inputmode="decimal" maxlength="12" value="${valor}" placeholder="0,00" aria-label="Valor do extra (R$)" />
      <button type="button" class="botao botao--perigo botao--pequeno" data-acao="remover-extra" data-indice="${i}" aria-label="Remover extra">Remover</button>
    </div>`;
}

/** Converte centavos guardados em textos para preencher o editor. */
export function textosDeValores(v) {
  if (!v) return { base: '', extras: [], desconto: '' };
  return {
    base: Number.isInteger(v.baseCentavos) ? centavosParaCampo(v.baseCentavos) : '',
    extras: (v.extras || []).map((e) => ({ descricao: e.descricao, valor: centavosParaCampo(e.valorCentavos) })),
    desconto: v.descontoCentavos ? centavosParaCampo(v.descontoCentavos) : '',
  };
}

export function editorDeValores({ base = '', extras = [], desconto = '', ajudaValor = '' }) {
  return html`
    <section class="editor-valores" id="editor-valores">
      <div class="campo" data-campo="valor">
        <label class="campo__rotulo" for="campo-valor">Valor do serviço (R$)</label>
        <input class="campo__entrada" id="campo-valor" name="valor" type="text" inputmode="decimal" maxlength="12" value="${base}" placeholder="150,00" />
        ${ajudaValor && html`<p class="campo__ajuda">${ajudaValor}</p>`}
      </div>
      <div class="campo" data-campo="extras">
        <span class="campo__rotulo">Extras <span class="campo__opcional">(opcional)</span></span>
        <div id="lista-extras" class="pilha pilha--pequena">${extras.map((e, i) => linhaDeExtra(e, i))}</div>
        ${botao({ texto: '+ Adicionar extra', variante: 'secundario', pequeno: true, acao: 'adicionar-extra' })}
      </div>
      <div class="campo" data-campo="desconto">
        <label class="campo__rotulo" for="campo-desconto">Desconto (R$) <span class="campo__opcional">(opcional)</span></label>
        <input class="campo__entrada" id="campo-desconto" name="desconto" type="text" inputmode="decimal" maxlength="12" value="${desconto}" placeholder="0,00" />
      </div>
      <div class="editor-valores__total" aria-live="polite">
        <span>Total</span><strong id="total-valores">R$ 0,00</strong>
      </div>
    </section>`;
}

/** Valor só para ler (técnico que pode ver, mas não alterar). */
export function valorSoParaLer(centavos) {
  return html`
    <section class="editor-valores editor-valores--leitura">
      <div class="editor-valores__total"><span>Valor do serviço</span><strong>${centavos === null ? 'Ainda não definido' : formatarReais(centavos)}</strong></div>
      <p class="campo__ajuda">O administrador confirma o valor final depois.</p>
    </section>`;
}

export function ligarEditorDeValores(form) {
  const lista = form.querySelector('#lista-extras');
  const total = form.querySelector('#total-valores');

  const lerLinhas = () => [...lista.querySelectorAll('[data-extra]')].map((l) => ({
    descricao: l.querySelector('[name="extraDescricao"]').value,
    valor: l.querySelector('[name="extraValor"]').value,
  }));
  const ler = () => ({ base: form.elements.valor.value, extras: lerLinhas(), desconto: form.elements.desconto.value });

  function atualizarTotal() {
    const v = ler();
    const cent = (t) => (String(t).trim() === '' ? 0 : reaisParaCentavos(String(t)) ?? 0);
    const extras = v.extras.map((e) => ({ valorCentavos: cent(e.valor) }));
    total.textContent = formatarReais(calcularTotal({ baseCentavos: cent(v.base), extras, descontoCentavos: cent(v.desconto) }));
  }
  function desenharLinhas(linhas) {
    mostrar(lista, html`${linhas.map((e, i) => linhaDeExtra(e, i))}`);
    atualizarTotal();
  }

  form.addEventListener('input', (e) => {
    if (['valor', 'desconto', 'extraValor'].includes(e.target.name)) atualizarTotal();
  });
  atualizarTotal();

  return {
    ler,
    acoes: {
      'adicionar-extra': () => {
        const linhas = lerLinhas();
        if (linhas.length >= MAXIMO_EXTRAS) return;
        desenharLinhas([...linhas, { descricao: '', valor: '' }]);
        lista.querySelector('[data-extra]:last-child [name="extraDescricao"]')?.focus();
      },
      'remover-extra': (el) => {
        const i = Number(el.dataset.indice);
        desenharLinhas(lerLinhas().filter((_, n) => n !== i));
      },
    },
  };
}
