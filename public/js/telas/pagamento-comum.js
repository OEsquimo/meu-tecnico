// =============================================================================
// Pacote 31 — janela "Registrar pagamento" (valor + dia) e texto de cobrança do saldo
// =============================================================================
// Usada no detalhe do serviço (por serviço, por visita e para corrigir) e na lista "A receber".
// Só administrador. Não pede forma de pagamento (Pix, dinheiro...): só valor e dia.
// =============================================================================

import { html, criarJanela } from '../nucleo/ui.js';
import { paraISO, hojeISO } from '../dominio/datas.js';
import { formatarReais, centavosParaCampo, reaisParaCentavos } from '../dominio/dinheiro.js';
import { validarPagamento } from '../dominio/pagamentos.js';

/**
 * @param {object} o
 * @param {string} o.titulo
 * @param {number} o.saldoMaximoCentavos  o pagamento não pode passar disso
 * @param {number} [o.valorInicial]       centavos sugeridos (padrão: o saldo)
 * @param {Date}   [o.diaInicial]         padrão: hoje
 * @param {string} [o.explicacao]
 * @param {(centavos:number)=>string} [o.previsao]  texto mostrado abaixo do valor (divisão entre os serviços)
 * @returns {Promise<{centavos:number, em:Date}|null>}
 */
export function pedirPagamento({ titulo, saldoMaximoCentavos, valorInicial, diaInicial, explicacao = '', previsao = null, confirmarTexto = 'Salvar pagamento' }) {
  return new Promise((resolver) => {
    const janela = criarJanela();
    const inicial = Number.isInteger(valorInicial) ? valorInicial : saldoMaximoCentavos;
    janela.innerHTML = String(html`
      <h2>${titulo}</h2>
      <p class="texto-suave texto-pequeno">Saldo a receber: <strong>${formatarReais(saldoMaximoCentavos)}</strong>.${explicacao ? ` ${explicacao}` : ''}</p>
      <div class="campo"><label class="campo__rotulo" for="pag-valor">Valor recebido (R$)</label><input class="campo__entrada" id="pag-valor" type="text" inputmode="decimal" value="${centavosParaCampo(inicial)}" data-valor /><p class="campo__erro" data-erro="valor" hidden></p></div>
      <p class="texto-pequeno texto-suave" data-previsao hidden></p>
      <div class="campo"><label class="campo__rotulo" for="pag-dia">Dia do pagamento</label><input class="campo__entrada" id="pag-dia" type="date" value="${paraISO(diaInicial instanceof Date ? diaInicial : new Date())}" max="${hojeISO()}" data-dia /><p class="campo__erro" data-erro="dia" hidden></p></div>
      <div class="janela__acoes">
        <button type="button" class="botao botao--bloco" data-resposta="sim">${confirmarTexto}</button>
        <button type="button" class="botao botao--bloco botao--secundario" data-resposta="nao">Voltar</button>
      </div>`);
    const campoValor = janela.querySelector('[data-valor]');
    const caixaPrevisao = janela.querySelector('[data-previsao]');
    const atualizarPrevisao = () => {
      if (!previsao) return;
      const c = reaisParaCentavos(campoValor.value.trim());
      const texto = Number.isInteger(c) && c > 0 && c <= saldoMaximoCentavos ? previsao(c) : '';
      caixaPrevisao.textContent = texto;
      caixaPrevisao.hidden = !texto;
    };
    campoValor.addEventListener('input', atualizarPrevisao);
    atualizarPrevisao();
    let resposta = null;
    janela.addEventListener('click', (e) => {
      const b = e.target.closest('[data-resposta]');
      if (!b) return;
      if (b.dataset.resposta === 'sim') {
        const r = validarPagamento({ valor: campoValor.value, dia: janela.querySelector('[data-dia]').value }, { saldoMaximoCentavos });
        for (const campo of ['valor', 'dia']) {
          const el = janela.querySelector(`[data-erro="${campo}"]`);
          el.textContent = r.erros[campo] || '';
          el.hidden = !r.erros[campo];
        }
        if (!r.valido) return;
        resposta = { centavos: r.dados.centavos, em: r.dados.em };
      }
      janela.close();
    });
    janela.addEventListener('close', () => { janela.remove(); resolver(resposta); });
    janela.showModal();
  });
}

/** Texto da divisão de um recebimento da visita: "Limpeza: R$ 100 (quita) · Carga: R$ 50 (falta R$ 30)". */
export function textoDaDivisao(divisao, itens) {
  return divisao.map((d) => {
    const i = itens.find((x) => x.id === d.id);
    return `${i?.nome || 'Serviço'}: ${formatarReais(d.centavos)} ${d.quita ? '(quita)' : `(falta ${formatarReais((i?.saldoCentavos || 0) - d.centavos)})`}`;
  }).join(' · ');
}
