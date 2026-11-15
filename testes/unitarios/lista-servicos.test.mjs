// Página "Serviços": consulta por situação, 30 em 30, ordem dos agendados, selos e menu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarAdaptadorMemoria } from '../../public/js/nucleo/adaptador-memoria.js';
import { definirAdaptadorBanco, gravar, operacao as op } from '../../public/js/nucleo/banco.js';
import { definirAdaptadorAuth } from '../../public/js/nucleo/autenticacao.js';
import { listarServicosDaLista } from '../../public/js/servicos/servicos.js';
import { PAGINA_SERVICOS } from '../../public/js/nucleo/constantes.js';
import {
  STATUS_DA_LISTA, STATUS_PADRAO_DA_LISTA, statusValido, usaFiltroDeMes, periodoDoMes, mesVizinho,
  montarConsultaDaLista, ordenarAgendados, seloDaLista, haMais,
} from '../../public/js/dominio/lista-servicos.js';
import { itensDoMenu, resolverRota } from '../../public/js/nucleo/rotas.js';

const E = 'emp-lista';
const col = (id) => `empresas/${E}/servicos/${id}`;

test('a página tem 30 por vez e abre em Agendados', () => {
  assert.equal(PAGINA_SERVICOS, 30);
  assert.equal(STATUS_PADRAO_DA_LISTA, 'agendado');
  assert.deepEqual(STATUS_DA_LISTA.map((s) => s.rotulo), ['Agendados', 'Concluídos', 'Cancelados', 'Pendentes', 'Reagendados', 'Todos']);
  assert.equal(statusValido('lixo'), 'agendado');
});

test('só Agendados ignoram o mês', () => {
  assert.equal(usaFiltroDeMes('agendado'), false);
  for (const s of ['concluido', 'cancelado', 'pendente', 'reagendado', 'todos']) assert.equal(usaFiltroDeMes(s), true);
});

test('mês: período e navegação virando o ano', () => {
  const { de, ate } = periodoDoMes(2026, 11);
  assert.equal(de.getTime(), new Date(2026, 11, 1).getTime());
  assert.equal(ate.getTime(), new Date(2027, 0, 1).getTime());
  assert.deepEqual(mesVizinho({ ano: 2026, mes: 0 }, -1), { ano: 2025, mes: 11 });
  assert.deepEqual(mesVizinho({ ano: 2026, mes: 11 }, 1), { ano: 2027, mes: 0 });
});

test('consulta de cada situação', () => {
  const a = montarConsultaDaLista({ status: 'agendado', ano: 2026, mes: 10, limite: 30 });
  assert.deepEqual(a.onde, [['status', '==', 'agendado']]);
  assert.deepEqual(a.ordenarPor, [['dataAgendada', 'asc']]);
  const p = montarConsultaDaLista({ status: 'pendente', ano: 2026, mes: 10, limite: 30 });
  assert.deepEqual(p.onde.slice(0, 2), [['status', '==', 'cancelado'], ['pendente', '==', true]]);
  assert.deepEqual(p.ordenarPor, [['dataAgendada', 'desc']]);
  const r = montarConsultaDaLista({ status: 'reagendado', ano: 2026, mes: 10, limite: 30 });
  assert.deepEqual(r.onde[0], ['reagendado', '==', true]);
  const t = montarConsultaDaLista({ status: 'todos', ano: 2026, mes: 10, limite: 60 });
  assert.equal(t.onde.length, 2);
  assert.equal(t.limite, 60);
});

test('as consultas combinam com índices declarados', () => {
  const indices = JSON.parse(readFileSync(new URL('../../firestore.indexes.json', import.meta.url), 'utf8')).indexes;
  // campos = [[campo, ordem], ...]; a ordem importa (a lista usa desc, exceto Agendados).
  const tem = (campos) => indices.some((i) => i.fields.length === campos.length
    && campos.every(([c, o], k) => i.fields[k].fieldPath === c && i.fields[k].order === o));
  assert.ok(tem([['status', 'ASCENDING'], ['dataAgendada', 'ASCENDING']]), 'agendados (mais próximo primeiro)');
  assert.ok(tem([['status', 'ASCENDING'], ['dataAgendada', 'DESCENDING']]), 'concluídos e cancelados (mais recente primeiro)');
  assert.ok(tem([['status', 'ASCENDING'], ['pendente', 'ASCENDING'], ['dataAgendada', 'DESCENDING']]), 'pendentes');
  assert.ok(tem([['reagendado', 'ASCENDING'], ['dataAgendada', 'DESCENDING']]), 'reagendados');
});

test('atrasados vêm primeiro; depois hoje antes de amanhã', () => {
  const agora = new Date(2026, 10, 15, 10, 0);
  const s = (id, d, extra = {}) => ({ id, status: 'agendado', dataAgendada: d, ...extra });
  const lista = [
    s('amanha', new Date(2026, 10, 16, 9, 0)),
    s('hoje16', new Date(2026, 10, 15, 16, 0)),
    s('ontem', new Date(2026, 10, 14, 15, 0)),
    s('hoje9', new Date(2026, 10, 15, 9, 0)), // já passou das 10h: atrasado
    s('hoje13', new Date(2026, 10, 15, 13, 0)),
    s('tecnico', new Date(2026, 10, 15, 18, 0), { atrasoPorTecnico: true }),
  ];
  assert.deepEqual(ordenarAgendados(lista, agora).map((x) => x.id), ['ontem', 'hoje9', 'tecnico', 'hoje13', 'hoje16', 'amanha']);
});

test('selos da lista', () => {
  const agora = new Date(2026, 10, 15, 10, 0);
  assert.equal(seloDaLista({ status: 'cancelado', pendente: true }, agora).texto, 'Pendente');
  assert.equal(seloDaLista({ status: 'cancelado' }, agora).texto, 'Cancelado');
  assert.equal(seloDaLista({ status: 'agendado', dataAgendada: new Date(2026, 10, 1) }, agora).texto, 'Atrasado');
  assert.equal(seloDaLista({ status: 'agendado', reagendado: true, dataAgendada: new Date(2026, 10, 20) }, agora).texto, 'Reagendado');
  assert.equal(seloDaLista({ status: 'concluido' }, agora).texto, 'Concluído');
});

test('ha mais só quando veio o que foi pedido', () => {
  assert.equal(haMais(30, 30), true);
  assert.equal(haMais(29, 30), false);
  assert.equal(haMais(0, 30), false);
});

async function banco() {
  const memoria = criarAdaptadorMemoria();
  definirAdaptadorBanco(memoria.banco);
  definirAdaptadorAuth(memoria.auth);
}

test('banco: agendados 30, 60 e o que sobrar (sem filtro de mês)', async () => {
  await banco();
  const ops = [];
  for (let i = 0; i < 75; i += 1) {
    ops.push(op.definir(col(`a${String(i).padStart(3, '0')}`), { status: 'agendado', clienteNome: `C${i}`, dataAgendada: new Date(2031, 0, 1 + (i % 28), 8 + (i % 8)) }));
  }
  ops.push(op.definir(col('conc'), { status: 'concluido', clienteNome: 'X', dataAgendada: new Date(2031, 0, 2) }));
  await gravar(ops);
  const p1 = await listarServicosDaLista({ empresaId: E, status: 'agendado', ano: 2031, mes: 5, limite: PAGINA_SERVICOS });
  assert.equal(p1.length, 30);
  assert.ok(p1.every((s) => s.status === 'agendado'));
  for (let i = 1; i < p1.length; i += 1) assert.ok(p1[i - 1].dataAgendada <= p1[i].dataAgendada);
  const p2 = await listarServicosDaLista({ empresaId: E, status: 'agendado', ano: 2031, mes: 5, limite: PAGINA_SERVICOS * 2 });
  assert.equal(p2.length, 60);
  const p3 = await listarServicosDaLista({ empresaId: E, status: 'agendado', ano: 2031, mes: 5, limite: PAGINA_SERVICOS * 3 });
  assert.equal(p3.length, 75);
  assert.equal(haMais(p3.length, PAGINA_SERVICOS * 3), false);
});

test('banco: concluídos, cancelados, pendentes, reagendados e todos respeitam o mês', async () => {
  await banco();
  const d = (dia) => new Date(2031, 2, dia, 9, 0);
  await gravar([
    op.definir(col('c1'), { status: 'concluido', clienteNome: 'Conc', dataAgendada: d(5) }),
    op.definir(col('c2'), { status: 'cancelado', clienteNome: 'Canc', dataAgendada: d(6) }),
    op.definir(col('p1'), { status: 'cancelado', pendente: true, clienteNome: 'Pend', dataAgendada: d(7) }),
    op.definir(col('r1'), { status: 'agendado', reagendado: true, clienteNome: 'Reag', dataAgendada: d(8) }),
    op.definir(col('fora'), { status: 'concluido', clienteNome: 'Fora', dataAgendada: new Date(2031, 3, 2) }),
  ]);
  const nomes = async (status) => (await listarServicosDaLista({ empresaId: E, status, ano: 2031, mes: 2, limite: 30 })).map((s) => s.clienteNome);
  assert.deepEqual(await nomes('concluido'), ['Conc']);
  assert.deepEqual(await nomes('cancelado'), ['Pend', 'Canc']); // o mais recente primeiro; pendente também é cancelado
  assert.deepEqual(await nomes('pendente'), ['Pend']);
  assert.deepEqual(await nomes('reagendado'), ['Reag']);
  assert.deepEqual(await nomes('todos'), ['Reag', 'Pend', 'Canc', 'Conc']);
});

test('menu: só o administrador tem a aba Serviços, entre Agenda e Clientes', () => {
  const admin = itensDoMenu({ estado: 'pronto', papel: 'admin', empresaId: 'e', uid: 'u' });
  const ids = admin.map((i) => i.id);
  assert.ok(ids.includes('servicos'), JSON.stringify(ids));
  assert.equal(ids.indexOf('servicos'), ids.indexOf('agenda') + 1);
  assert.ok(!ids.includes('historico'), 'administrador vê concluídos em Serviços, não em aba própria');
  const tec = itensDoMenu({ estado: 'pronto', papel: 'tecnico', empresaId: 'e', uid: 'u' });
  assert.ok(!tec.some((i) => i.id === 'servicos'));
  assert.ok(tec.some((i) => i.id === 'historico'), 'técnico continua com a aba Concluídos');
  assert.equal(resolverRota('/servicos').rota.acesso, 'admin');
});
