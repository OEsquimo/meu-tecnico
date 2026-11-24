import test from 'node:test';
import assert from 'node:assert/strict';
import {
  situacaoDePagamento, validarPagamento, distribuirRecebimento, comNovoPagamento, comPagamentoCorrigido, comPagamentoApagado,
  comNovoValor, cartoesAReceber, totaisAReceber, contarVisitasAReceber, textoDeAtraso, MAXIMO_PAGAMENTOS,
} from '../../public/js/dominio/pagamentos.js';
import { resumirComPagamentos } from '../../public/js/dominio/financeiro.js';
import { linhasCobraveis } from '../../public/js/dominio/cobranca.js';
import { lerDocumentoDeValores } from '../../public/js/dominio/valores.js';

const d = (s) => new Date(`${s}T12:00:00`);
const serv = (id, extra = {}) => ({ id, status: 'concluido', pago: false, agendamentoId: 'v1', clienteNome: 'Ana', clienteId: 'c1', clienteWhatsapp: '11999990000', tipoServicoNome: id, dataConclusao: d('2026-10-01'), ...extra });

test('situação: sem pagamento, parcial e quitado', () => {
  const v = { valorCentavos: 20000 };
  assert.equal(situacaoDePagamento(serv('a'), v).saldoCentavos, 20000);
  const p = situacaoDePagamento(serv('a'), { ...v, pagamentos: [{ centavos: 10000, em: d('2026-10-02') }] });
  assert.equal(p.saldoCentavos, 10000); assert.equal(p.parcial, true); assert.equal(p.quitado, false);
  assert.equal(situacaoDePagamento(serv('a'), { ...v, pagamentos: [{ centavos: 20000, em: d('2026-10-02') }] }).quitado, true);
});

test('serviço antigo pago vale um pagamento do valor todo (regra 2)', () => {
  const s = situacaoDePagamento(serv('a', { pago: true }), { valorCentavos: 15000 });
  assert.equal(s.quitado, true); assert.equal(s.pagamentos.length, 1); assert.equal(s.pagamentos[0].implicito, true);
});

test('pagamento maior que o saldo é bloqueado (regra 5)', () => {
  const r = validarPagamento({ valor: '300', dia: '2026-10-05' }, { saldoMaximoCentavos: 20000, hojeDia: '2026-10-05' });
  assert.equal(r.valido, false); assert.match(r.erros.valor, /O saldo é/);
  assert.equal(validarPagamento({ valor: '200', dia: '2026-10-05' }, { saldoMaximoCentavos: 20000, hojeDia: '2026-10-05' }).valido, true);
  assert.equal(validarPagamento({ valor: '10', dia: '2026-10-06' }, { saldoMaximoCentavos: 20000, hojeDia: '2026-10-05' }).valido, false);
});

test('recebimento da visita abate na ordem e mostra a divisão', () => {
  const itens = [{ id: 'a', saldoCentavos: 10000 }, { id: 'b', saldoCentavos: 5000 }];
  const r = distribuirRecebimento(itens, 12000);
  assert.deepEqual(r.divisao, [{ id: 'a', centavos: 10000, quita: true }, { id: 'b', centavos: 2000, quita: false }]);
  assert.equal(distribuirRecebimento(itens, 99999).ok, false);
});

test('novo pagamento, correção e exclusão recalculam o saldo (regra 4)', () => {
  const v = { valorCentavos: 20000 };
  const a = comNovoPagamento(serv('a'), v, { centavos: 5000, em: d('2026-10-02') });
  assert.equal(a.pago, false);
  const v2 = { ...v, pagamentos: a.pagamentos };
  const b = comNovoPagamento(serv('a'), v2, { centavos: 15000, em: d('2026-10-03') });
  assert.equal(b.pago, true);
  assert.ok(comNovoPagamento(serv('a'), v2, { centavos: 15001, em: d('2026-10-03') }).erro);
  const apagado = comPagamentoApagado(serv('a'), { ...v, pagamentos: b.pagamentos }, 1);
  assert.equal(apagado.pago, false); assert.equal(apagado.pagamentos.length, 1);
  assert.ok(comPagamentoCorrigido(serv('a'), { ...v, pagamentos: b.pagamentos }, 0, { centavos: 6000, em: d('2026-10-02') }).erro);
  assert.equal(comPagamentoApagado(serv('a'), { ...v, pagamentos: a.pagamentos }, 0).ultimoPagamentoEm, null);
});

test('limite de pagamentos por serviço', () => {
  const lista = Array.from({ length: MAXIMO_PAGAMENTOS }, (_, i) => ({ centavos: 1, em: d('2026-10-02') }));
  assert.match(comNovoPagamento(serv('a'), { valorCentavos: 100000, pagamentos: lista }, { centavos: 1, em: d('2026-10-03') }).erro, /no máximo/);
});

test('valor não pode ficar abaixo do já pago; desconto até o pago (regra 7)', () => {
  const v = { valorCentavos: 20000, pagamentos: [{ centavos: 10000, em: d('2026-10-02') }] };
  assert.ok(comNovoValor(serv('a'), v, 9000).erro);
  assert.equal(comNovoValor(serv('a'), v, 10000).pago, true);
  assert.equal(comNovoValor(serv('a'), v, 30000).pago, false);
  const antigo = comNovoValor(serv('a', { pago: true }), { valorCentavos: 20000 }, 25000);
  assert.equal(antigo.pago, false); assert.equal(antigo.pagamentos[0].centavos, 20000);
});

test('cobrança leva só o saldo (regra 6)', () => {
  const linhas = [serv('a'), serv('b', { pago: true })];
  const valores = { a: { valorCentavos: 20000, pagamentos: [{ centavos: 20000, em: d('2026-10-02') }] }, b: { valorCentavos: 100 } };
  assert.deepEqual(linhasCobraveis(linhas, valores).map((l) => l.id), []);
});

test('cartões: um por visita, mais antigo primeiro, sem valor separado', () => {
  const linhas = [
    serv('a', { dataConclusao: d('2026-10-10') }), serv('b', { dataConclusao: d('2026-10-10') }),
    serv('c', { agendamentoId: 'v2', clienteNome: 'Bia', clienteId: 'c2', dataConclusao: d('2026-09-01') }),
    serv('q', { agendamentoId: 'v3', pago: true }),
  ];
  const valores = {
    a: { valorCentavos: 20000, pagamentos: [{ centavos: 10000, em: d('2026-10-11') }] }, b: null,
    c: { valorCentavos: 5000 }, q: { valorCentavos: 100 },
  };
  const c = cartoesAReceber(linhas, valores, d('2026-10-20'));
  assert.deepEqual(c.map((x) => x.clienteNome), ['Bia', 'Ana']);
  assert.equal(c[1].dividaCentavos, 10000); assert.equal(c[1].semValor, 1); assert.equal(c[1].itens.find((i) => i.id === 'a').parcial, true);
  const t = totaisAReceber(c);
  assert.deepEqual([t.visitas, t.clientes, t.dividaCentavos], [2, 2, 15000]);
  assert.equal(contarVisitasAReceber(linhas.filter((l) => !l.pago)), 2);
  assert.equal(textoDeAtraso(d('2026-10-10'), d('2026-10-20')), 'há 10 dias');
});

test('Financeiro: recebido conta no dia de cada pagamento (regra 1)', () => {
  const periodo = { inicio: d('2026-11-01'), fim: d('2026-12-01') };
  const servicos = [serv('a', { dataConclusao: d('2026-10-20') }), serv('n', { dataConclusao: d('2026-11-05'), pago: true })];
  const docs = {
    a: { valorCentavos: 20000, tipoNome: 'a', pagamentos: [{ centavos: 5000, em: d('2026-10-21') }, { centavos: 7000, em: d('2026-11-03') }] },
    n: { valorCentavos: 8000 },
  };
  const r = resumirComPagamentos([servicos[1]], docs, periodo);
  assert.equal(r.recebidoCentavos, 15000); // 7000 (a, de novembro) + 8000 (antigo pago)
  assert.equal(r.aReceberCentavos, 0); // só serviços do período entram no saldo (a é de outubro)
});

test('ler documento de valores: pagamentos só aparecem quando existem', () => {
  assert.equal(Object.keys(lerDocumentoDeValores({ valorCentavos: 100 })).length, 4);
  assert.equal(lerDocumentoDeValores({ valorCentavos: 100, pagamentos: [{ centavos: 50, em: d('2026-10-01') }] }).pagamentos.length, 1);
});
