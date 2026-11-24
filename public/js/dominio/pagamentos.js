// =============================================================================
// PAGAMENTOS — pagamento parcial, saldo e lista "A receber" (funções puras; Pacote 31)
// =============================================================================
// Cada serviço concluído pode ter vários pagamentos (valor + dia). Ficam em valores/{servicoId}.pagamentos
// ([{ centavos, em }]), junto do valor, porque só o administrador lê (o técnico só diz "cliente pagou? sim/não").
//   * saldo = valor do serviço - soma dos pagamentos; quitado = saldo zero (e valor maior que zero).
//   * `servicos.pago` continua existindo e é mantido igual a "quitado" (é por ele que o app acha o que falta receber).
//   * Serviço antigo marcado como pago, sem lista: vale como UM pagamento do valor total no dia da conclusão
//     ("implícito"). Ao corrigir/apagar ou mudar o valor, esse pagamento vira real (entra na lista).
// Tudo em CENTAVOS inteiros.
// =============================================================================

import { reaisParaCentavos, formatarReais } from './dinheiro.js';
import { paraISO, hojeISO, deISO, diasEntre } from './datas.js';
import { chaveDoAgendamento } from './servicos.js';

export const MAXIMO_PAGAMENTOS = 30;
const MAXIMO_CENTAVOS = 100000000;

/** Só os pagamentos válidos ({ centavos inteiro > 0, em Date }), na ordem do dia. */
export function normalizarPagamentos(lista) {
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((p) => p && Number.isInteger(p.centavos) && p.centavos > 0 && p.em instanceof Date && !Number.isNaN(p.em.getTime()))
    .map((p) => ({ centavos: p.centavos, em: p.em }))
    .sort((a, b) => a.em - b.em);
}

/**
 * Pagamentos de um serviço. `valor` é o documento de valores já lido (com `pagamentos` se houver).
 * Sem lista e marcado como pago: um pagamento implícito do valor total no dia da conclusão.
 */
export function pagamentosDoServico(servico, valor) {
  const reais = normalizarPagamentos(valor?.pagamentos);
  if (reais.length > 0) return reais.map((p) => ({ ...p, implicito: false }));
  if (servico?.pago === true && valor && valor.valorCentavos > 0) {
    return [{ centavos: valor.valorCentavos, em: servico.dataConclusao instanceof Date ? servico.dataConclusao : null, implicito: true }];
  }
  return [];
}

/** Situação de pagamento de um serviço concluído. */
export function situacaoDePagamento(servico, valor) {
  const valorCentavos = valor?.valorCentavos > 0 ? valor.valorCentavos : 0;
  const pagamentos = pagamentosDoServico(servico, valor);
  const pagoCentavos = pagamentos.reduce((t, p) => t + p.centavos, 0);
  const temValor = valorCentavos > 0;
  const saldoCentavos = temValor ? Math.max(0, valorCentavos - pagoCentavos) : 0;
  const quitado = temValor && saldoCentavos === 0;
  return { temValor, valorCentavos, pagoCentavos, saldoCentavos, quitado, parcial: pagoCentavos > 0 && !quitado, pagamentos };
}

/** Lê "R$ 150" e o dia de um pagamento. `saldoMaximoCentavos`: o que ainda falta (o pagamento não pode passar disso). */
export function validarPagamento({ valor, dia }, { saldoMaximoCentavos, hojeDia = hojeISO(), agora = new Date() }) {
  const erros = {};
  const centavos = reaisParaCentavos(String(valor ?? '').trim());
  if (centavos === null || centavos <= 0) erros.valor = 'Informe o valor recebido. Exemplo: 150 ou 150,50';
  else if (centavos > MAXIMO_CENTAVOS) erros.valor = 'Esse valor é alto demais. Confira.';
  else if (centavos > saldoMaximoCentavos) erros.valor = `O saldo é ${formatarReais(saldoMaximoCentavos)}. O pagamento não pode ser maior.`;

  const iso = String(dia ?? '').trim();
  let em = null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) erros.dia = 'Informe o dia do pagamento.';
  else if (iso > hojeDia) erros.dia = 'O dia do pagamento não pode ser no futuro.';
  else if (iso < '2000-01-01') erros.dia = 'Esse dia não parece certo. Confira.';
  else {
    const d = deISO(iso);
    // Hoje: a hora de agora. Outro dia: meio-dia (só o dia importa para o Financeiro).
    em = iso === hojeDia ? new Date(agora) : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  }
  return { valido: Object.keys(erros).length === 0, erros, dados: { centavos, em } };
}

/**
 * Divide um valor recebido entre os serviços da visita, na ordem recebida (o primeiro quita antes).
 * @param {{ id: string, saldoCentavos: number }[]} itens   só os que ainda têm saldo
 * @returns {{ ok: boolean, erro?: string, divisao: { id: string, centavos: number, quita: boolean }[] }}
 */
export function distribuirRecebimento(itens, centavos) {
  const comSaldo = itens.filter((i) => i.saldoCentavos > 0);
  const saldoTotal = comSaldo.reduce((t, i) => t + i.saldoCentavos, 0);
  if (!Number.isInteger(centavos) || centavos <= 0) return { ok: false, erro: 'Informe o valor recebido.', divisao: [] };
  if (centavos > saldoTotal) return { ok: false, erro: `O saldo é ${formatarReais(saldoTotal)}. O pagamento não pode ser maior.`, divisao: [] };
  let resta = centavos;
  const divisao = [];
  for (const i of comSaldo) {
    if (resta <= 0) break;
    const parte = Math.min(resta, i.saldoCentavos);
    divisao.push({ id: i.id, centavos: parte, quita: parte === i.saldoCentavos });
    resta -= parte;
  }
  return { ok: true, divisao };
}

/** Resultado a gravar depois de mudar a lista de pagamentos de um serviço (pago = quitado). */
function resultado(valor, lista) {
  const pagamentos = normalizarPagamentos(lista);
  const total = pagamentos.reduce((t, p) => t + p.centavos, 0);
  return {
    pagamentos,
    pago: valor.valorCentavos > 0 && total >= valor.valorCentavos,
    ultimoPagamentoEm: pagamentos.length > 0 ? pagamentos[pagamentos.length - 1].em : null,
  };
}

const semImplicito = (lista) => lista.map(({ centavos, em }) => ({ centavos, em: em || new Date() }));

/** Soma um pagamento ao serviço. Erro (texto) se passar do saldo ou do limite de pagamentos. */
export function comNovoPagamento(servico, valor, { centavos, em }) {
  const atual = semImplicito(pagamentosDoServico(servico, valor));
  const s = situacaoDePagamento(servico, valor);
  if (!s.temValor) return { erro: 'Informe o valor do serviço antes de registrar o pagamento.' };
  if (centavos > s.saldoCentavos) return { erro: `O saldo é ${formatarReais(s.saldoCentavos)}. O pagamento não pode ser maior.` };
  if (atual.length >= MAXIMO_PAGAMENTOS) return { erro: `Cada serviço aceita no máximo ${MAXIMO_PAGAMENTOS} pagamentos.` };
  return resultado(valor, [...atual, { centavos, em }]);
}

/** Troca valor e dia de um pagamento (índice da lista ordenada). O total pago não pode passar do valor do serviço. */
export function comPagamentoCorrigido(servico, valor, indice, { centavos, em }) {
  const atual = semImplicito(pagamentosDoServico(servico, valor));
  if (!atual[indice]) return { erro: 'Este pagamento não existe mais.' };
  const outros = atual.reduce((t, p, i) => (i === indice ? t : t + p.centavos), 0);
  if (centavos + outros > valor.valorCentavos) {
    return { erro: `O saldo é ${formatarReais(Math.max(0, valor.valorCentavos - outros))}. O pagamento não pode ser maior.` };
  }
  return resultado(valor, atual.map((p, i) => (i === indice ? { centavos, em } : p)));
}

/** Apaga um pagamento (índice da lista ordenada). */
export function comPagamentoApagado(servico, valor, indice) {
  const atual = semImplicito(pagamentosDoServico(servico, valor));
  if (!atual[indice]) return { erro: 'Este pagamento não existe mais.' };
  return resultado(valor, atual.filter((_, i) => i !== indice));
}

/**
 * Efeito de mudar o valor do serviço (Pacote 31): não pode ficar abaixo do que já foi pago; se o valor sobe, o serviço
 * volta a ter saldo; se desce até o que foi pago, quita. O pagamento implícito (serviço antigo "pago") vira real.
 */
export function comNovoValor(servico, valorAtual, novoValorCentavos) {
  const lista = semImplicito(pagamentosDoServico(servico, valorAtual));
  const pago = lista.reduce((t, p) => t + p.centavos, 0);
  if (novoValorCentavos < pago) {
    return { erro: `O valor não pode ficar abaixo do que já foi pago (${formatarReais(pago)}). Corrija ou apague um pagamento antes.` };
  }
  return resultado({ valorCentavos: novoValorCentavos }, lista);
}

// -----------------------------------------------------------------------------
// LISTA "A RECEBER" — um cartão por visita (agendamento)
// -----------------------------------------------------------------------------

/** "hoje", "ontem" ou "há N dias" (a partir do dia do serviço). */
export function textoDeAtraso(dataServico, hoje = new Date()) {
  const dias = Math.max(0, diasEntre(paraISO(dataServico), paraISO(hoje)));
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

/**
 * Cartões da lista: um por visita com serviço concluído ainda não quitado. Mais antigo primeiro.
 * @param {object[]} linhas   serviços concluídos com pago=false
 * @param {Object<string, object|null>} valores  { [servicoId]: documento de valores }
 */
export function cartoesAReceber(linhas, valores, hoje = new Date()) {
  const grupos = new Map();
  for (const l of linhas) {
    if (l.status !== 'concluido') continue;
    const chave = chaveDoAgendamento(l);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(l);
  }
  const cartoes = [];
  for (const [chave, grupo] of grupos) {
    const itens = grupo
      .map((l) => ({ linha: l, ...situacaoDePagamento(l, valores[l.id] || null) }))
      .filter((i) => !i.quitado)
      .map((i) => ({
        id: i.linha.id, servico: i.linha.tipoServicoNome, aparelho: i.linha.aparelhoResumo || '', data: i.linha.dataConclusao,
        valorCentavos: i.valorCentavos, pagoCentavos: i.pagoCentavos, saldoCentavos: i.saldoCentavos, parcial: i.parcial, semValor: !i.temValor,
        cobradoEm: i.linha.cobradoEm instanceof Date ? i.linha.cobradoEm : null,
      }))
      .sort((a, b) => (a.data - b.data) || a.servico.localeCompare(b.servico, 'pt-BR'));
    if (itens.length === 0) continue;
    const primeira = grupo[0];
    const dataServico = itens.map((i) => i.data).filter((d) => d instanceof Date).sort((a, b) => a - b)[0] || null;
    const cobrancas = itens.map((i) => i.cobradoEm).filter(Boolean).sort((a, b) => b - a);
    const dividaCentavos = itens.reduce((t, i) => t + i.saldoCentavos, 0);
    cartoes.push({
      chave, clienteId: primeira.clienteId || null, clienteNome: primeira.clienteNome || '', whatsapp: primeira.clienteWhatsapp || '',
      abrirId: itens[0].id, dataServico, atraso: dataServico ? textoDeAtraso(dataServico, hoje) : '',
      itens, dividaCentavos, semValor: itens.filter((i) => i.semValor).length, cobradoEm: cobrancas[0] || null,
      cobraveis: itens.filter((i) => i.saldoCentavos > 0),
    });
  }
  return cartoes.sort((a, b) => (a.dataServico || 0) - (b.dataServico || 0) || a.clienteNome.localeCompare(b.clienteNome, 'pt-BR'));
}

/** Totais para o topo da lista, para o Início e para o Financeiro. */
export function totaisAReceber(cartoes) {
  const clientes = new Set(cartoes.map((c) => c.clienteId || c.clienteNome));
  return {
    visitas: cartoes.length,
    clientes: clientes.size,
    dividaCentavos: cartoes.reduce((t, c) => t + c.dividaCentavos, 0),
    servicosSemValor: cartoes.reduce((t, c) => t + c.semValor, 0),
  };
}

/** Quantidade de visitas com serviço concluído sem quitar (a bolinha do Início): conta só pelas linhas, sem ler valores. */
export function contarVisitasAReceber(linhasNaoPagas) {
  return new Set(linhasNaoPagas.filter((l) => l.status === 'concluido').map(chaveDoAgendamento)).size;
}
