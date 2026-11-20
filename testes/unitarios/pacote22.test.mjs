import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparConcluidos, nomesDosServicos, tecnicosDaVisita } from '../../public/js/dominio/servicos.js';

const d = (s) => new Date(s);
const linha = (id, extra = {}) => ({ id, clienteNome: 'Ana', tipoServicoNome: 'Limpeza', status: 'concluido', ...extra });

test('agruparConcluidos junta as linhas da mesma visita e mantém a ordem', () => {
  const g = agruparConcluidos([
    linha('a1', { agendamentoId: 'A', dataConclusao: d('2026-11-18T12:00:00'), tecnicosNomes: ['Marcos'], tecnicoUids: ['m'] }),
    linha('b1', { dataConclusao: d('2026-11-17T12:00:00'), tecnicoNome: 'Rafael', tecnicoUid: 'r' }),
    linha('a2', { agendamentoId: 'A', dataConclusao: d('2026-11-18T09:00:00'), tecnicosNomes: ['Rafael'], tecnicoUids: ['r'] }),
  ]);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].linhas.map((l) => l.id), ['a1', 'a2']);
  assert.equal(g[0].dataConclusao.getTime(), d('2026-11-18T09:00:00').getTime());
  assert.equal(g[0].tecnicos, 'Marcos e Rafael');
  assert.equal(g[1].tecnicos, 'Rafael');
});

test('agruparConcluidos: serviço antigo sem agendamentoId vira um cartão só', () => {
  const g = agruparConcluidos([linha('x', { dataConclusao: d('2026-01-01T10:00:00') }), linha('y', { dataConclusao: d('2026-01-02T10:00:00') })]);
  assert.equal(g.length, 2);
});

test('nomesDosServicos junta sem repetir; tecnicosDaVisita lista todos', () => {
  const ls = [linha('1', { tipoServicoId: 't1', tipoServicoNome: 'Limpeza', tecnicoNome: 'Ana', tecnicoUid: 'a' }), linha('2', { tipoServicoId: 't1', tipoServicoNome: 'Limpeza', tecnicoNome: 'Ana', tecnicoUid: 'a' }), linha('3', { tipoServicoId: 't2', tipoServicoNome: 'Carga de gás', tecnicoNome: 'Rui', tecnicoUid: 'r' })];
  assert.deepEqual(nomesDosServicos(ls), ['Limpeza', 'Carga de gás']);
  assert.equal(tecnicosDaVisita(ls), 'Ana e Rui');
});
