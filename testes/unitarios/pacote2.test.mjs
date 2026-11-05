// Pacote 2: cobrança (mensagem), serviço pendente e reagendamento separado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { montarCobranca, linhasCobraveis, modeloDaEmpresa, MODELOS_COBRANCA } from '../../public/js/dominio/cobranca.js';
import { seloDoServico, resumoDaVisita } from '../../public/js/dominio/servicos.js';

const itens = [
  { servico: 'Limpeza', aparelho: 'Sala', data: new Date(2031, 2, 10), centavos: 18000 },
  { servico: 'Carga de gás', aparelho: 'Sala', data: new Date(2031, 2, 10), centavos: 25000 },
];

test('cobrança: soma valores, junta serviços e usa o Pix', () => {
  const t = montarCobranca(MODELOS_COBRANCA.amigavel, { nome: 'Maria', empresa: 'Marcos Frio', pix: '11999999999', itens });
  assert.match(t, /Limpeza e Carga de gás/);
  assert.match(t, /430,00/);
  assert.match(t, /Pix: 11999999999/);
  assert.match(t, /Maria/);
});

test('cobrança: sem chave Pix a linha do Pix some', () => {
  const t = montarCobranca(MODELOS_COBRANCA.formal, { nome: 'Maria', empresa: 'X', pix: '', itens });
  assert.ok(!t.includes('Pix'));
});

test('cobrança: só serviços concluídos, não pagos e com valor', () => {
  const linhas = [
    { id: 'a', status: 'concluido', pago: false }, { id: 'b', status: 'concluido', pago: true },
    { id: 'c', status: 'agendado' }, { id: 'd', status: 'concluido', pago: false }, { id: 'e', status: 'cancelado', pendente: true },
  ];
  const valores = { a: { valorCentavos: 100 }, b: { valorCentavos: 100 }, d: { valorCentavos: 0 } };
  assert.deepEqual(linhasCobraveis(linhas, valores).map((l) => l.id), ['a']);
});

test('cobrança: modelo da empresa vence o padrão do tom', () => {
  assert.equal(modeloDaEmpresa({ mensagemCobranca: 'Oi {nome}' }), 'Oi {nome}');
  assert.equal(modeloDaEmpresa({ tomCobranca: 'formal' }), MODELOS_COBRANCA.formal);
  assert.equal(modeloDaEmpresa({}), MODELOS_COBRANCA.amigavel);
});

test('pendente: selo próprio, curto nas listas, e resumo da visita', () => {
  const pend = { status: 'cancelado', pendente: true };
  assert.equal(seloDoServico(pend).texto, 'Pendente — aguardando reagendamento');
  assert.equal(seloDoServico(pend, new Date(), { curto: true }).texto, 'Aguardando reagendamento');
  assert.equal(seloDoServico({ status: 'cancelado' }).texto, 'Cancelado — aguardando reagendamento');
  assert.equal(resumoDaVisita([{ status: 'concluido' }, { status: 'concluido' }, pend]), '2 concluídos · 1 pendente');
});
