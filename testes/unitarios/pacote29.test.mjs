// Pacote 29: "Horário não conferido" — fora das médias e do deslocamento, contagem "X de Y".
import test from 'node:test';
import assert from 'node:assert/strict';
import { horarioConferido, tempoNoCliente } from '../../public/js/dominio/tempo-servico.js';
import { desempenhoDoTecnico, desempenhoDaEquipe, contagemDeHorarios, deslocamentosDoTecnico } from '../../public/js/dominio/desempenho.js';
import { CAMPOS_PERMITIDOS } from '../../public/js/dominio/backup.js';
import { readFileSync } from 'node:fs';

const ANA = { uid: 'ana', nome: 'Ana' };
const D = (h, m = 0, dia = 14) => new Date(2031, 3, dia, h, m);
let n = 0;
const feita = (ini, fim, extra = {}) => {
  n += 1;
  return {
    id: `l${n}`, agendamentoId: `v${n}`, status: 'concluido', dataAgendada: ini, duracaoMin: 60, tipoServicoNome: 'Limpeza',
    tecnicoUid: 'ana', tecnicoUids: ['ana'], tecnicosNomes: ['Ana'], clienteNome: 'C', iniciadoEm: ini, dataConclusao: fim, ...extra,
  };
};

test('horarioConferido: true/false do campo; antigo vale pelo início; sem horários não se aplica', () => {
  assert.equal(horarioConferido({ horariosConferidos: true }), true);
  assert.equal(horarioConferido({ horariosConferidos: false, iniciadoEm: D(9) }), false);
  assert.equal(horarioConferido({ iniciadoEm: D(9) }), true);
  assert.equal(horarioConferido({}), null);
});

test('serviço não conferido fica fora do tempo no cliente, mas o conferido continua', () => {
  assert.equal(tempoNoCliente(feita(D(9), D(10), { horariosConferidos: false })), null);
  assert.equal(tempoNoCliente(feita(D(9), D(10), { horariosConferidos: true })), 60);
  assert.equal(tempoNoCliente(feita(D(9), D(10))), 60); // antigo, com início
});

test('contagem: X de Y só com os serviços a que se aplica; sem horários ficam de fora', () => {
  const c = contagemDeHorarios([
    feita(D(9), D(10), { horariosConferidos: true }),
    feita(D(11), D(12), { horariosConferidos: false }),
    feita(D(13), D(14)),
    feita(null, D(15), { iniciadoEm: undefined }),
    { ...feita(D(9), D(10)), status: 'agendado' },
  ]);
  assert.deepEqual(c, { horariosInformados: 2, horariosAplicaveis: 3, naoConferidos: 1 });
});

test('desempenho: não conferido conta como concluído, sai da média e aparece em "informados X de Y"', () => {
  const lista = [
    feita(D(8), D(9), { horariosConferidos: true }),
    feita(D(10), D(12), { horariosConferidos: true }),
    feita(D(13), D(18), { horariosConferidos: false }),
  ];
  const d = desempenhoDoTecnico({ uid: 'ana', nome: 'Ana', concluidos: lista });
  assert.equal(d.concluidos, 3);
  assert.equal(d.comTempo, 2);
  assert.equal(d.tempoMedio, 90);
  assert.equal(d.horariosInformados, 2);
  assert.equal(d.horariosAplicaveis, 3);
  assert.equal(d.naoConferidos, 1);
  const eq = desempenhoDaEquipe({ tecnicos: [ANA], concluidos: lista });
  assert.equal(eq.tecnicos[0].tempoMedio, 90);
  assert.equal(eq.resumo.concluidos, 3);
});

test('deslocamento ignora visitas com horário não conferido', () => {
  const lista = [
    feita(D(8), D(9), { horariosConferidos: true }),
    feita(D(9, 30), D(10, 30), { horariosConferidos: true }),
    feita(D(11), D(12), { horariosConferidos: false }),
    feita(D(12, 30), D(13, 30), { horariosConferidos: true }),
  ];
  assert.deepEqual(deslocamentosDoTecnico('ana', lista), [30, 120]);
});

test('o campo novo está no backup e nas regras do Firestore', () => {
  assert.ok(CAMPOS_PERMITIDOS.servicos?.includes?.('horariosConferidos') || JSON.stringify(CAMPOS_PERMITIDOS).includes('horariosConferidos'));
  const regras = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.ok(regras.includes("'horariosConferidos'") && regras.includes('horariosConferidos is bool'));
});
