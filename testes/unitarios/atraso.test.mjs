// =============================================================================
// TESTES: atraso do técnico, técnico equilibrado e pontos do histórico
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { planejarAjustesDeAtraso, trocarTecnico, TOLERANCIA_ATRASO_MIN } from '../../public/js/dominio/atraso.js';
import { escolherTecnicoEquilibrado, pontosDoHistorico } from '../../public/js/dominio/disponibilidade.js';
import { estaAtrasado, seloDoServico } from '../../public/js/dominio/servicos.js';

const ANA = { uid: 'ana', nome: 'Ana' };
const BRUNO = { uid: 'bruno', nome: 'Bruno' };
const CARLA = { uid: 'carla', nome: 'Carla' };
const TODOS = [ANA, BRUNO, CARLA];
const agora = new Date(2031, 3, 14, 11, 0);

let n = 0;
const linha = (tec, hora, minutos, extra = {}) => {
  const [h, m] = hora.split(':').map(Number);
  n += 1;
  return {
    id: `l${n}`, agendamentoId: `v${n}`, status: 'agendado', dataAgendada: new Date(2031, 3, 14, h, m),
    duracaoMin: minutos, ocupacaoMin: minutos, ocupacaoPorTecnico: { [tec.uid]: minutos },
    tecnicoUid: tec.uid, tecnicoNome: tec.nome, tecnicoUids: [tec.uid], tecnicosNomes: [tec.nome], clienteNome: 'Cliente', ...extra,
  };
};

test('técnico passou do tempo e o próximo começa logo: o próximo vai para outro técnico livre', () => {
  const atual = linha(ANA, '09:00', 60); // devia acabar às 10:00 e às 11:00 ainda não foi concluído
  const proximo = linha(ANA, '11:00', 60);
  const acoes = planejarAjustesDeAtraso({ agendados: [atual, proximo], tecnicos: TODOS, agora });
  assert.equal(acoes.length, 1);
  assert.equal(acoes[0].tipo, 'reatribuir');
  assert.deepEqual(acoes[0].linhaIds, [proximo.id]);
  assert.equal(acoes[0].de.uid, 'ana');
  assert.ok(['bruno', 'carla'].includes(acoes[0].para.uid));
});

test('vai para o técnico com menos serviço no dia', () => {
  const atual = linha(ANA, '09:00', 60);
  const proximo = linha(ANA, '11:00', 60);
  const cheio = linha(BRUNO, '14:00', 240); // Bruno já tem 4 h hoje; Carla nada
  const acoes = planejarAjustesDeAtraso({ agendados: [atual, proximo, cheio], tecnicos: TODOS, agora });
  assert.equal(acoes[0].para.uid, 'carla');
});

test('ninguém livre: o próximo fica atrasado (para o administrador avisar o cliente)', () => {
  const atual = linha(ANA, '09:00', 60);
  const proximo = linha(ANA, '11:00', 60);
  const acoes = planejarAjustesDeAtraso({
    agendados: [atual, proximo, linha(BRUNO, '10:30', 120), linha(CARLA, '10:30', 120)], tecnicos: TODOS, agora,
  });
  assert.deepEqual(acoes.map((a) => [a.tipo, a.linhaIds[0]]), [['atrasar', proximo.id]]);
});

test('quem também está atrasado não recebe o serviço', () => {
  const ana1 = linha(ANA, '09:00', 60);
  const ana2 = linha(ANA, '11:00', 60);
  const bruno1 = linha(BRUNO, '09:00', 60); // Bruno também passou do tempo
  const acoes = planejarAjustesDeAtraso({ agendados: [ana1, ana2, bruno1], tecnicos: [ANA, BRUNO, CARLA], agora });
  assert.equal(acoes.find((a) => a.chave === ana2.agendamentoId).para.uid, 'carla');
});

test('sem atraso real não mexe em nada: dentro do tempo, tolerância, próximo ainda longe ou outro dia', () => {
  const dentro = linha(ANA, '10:30', 60); // acaba 11:30
  assert.equal(planejarAjustesDeAtraso({ agendados: [dentro, linha(ANA, '11:30', 60)], tecnicos: TODOS, agora }).length, 0);
  const quaseNoFim = linha(ANA, '09:00', 120); // acaba 11:00 (dentro da tolerância de 10 min)
  assert.equal(planejarAjustesDeAtraso({ agendados: [quaseNoFim, linha(ANA, '11:00', 60)], tecnicos: TODOS, agora: new Date(2031, 3, 14, 11, TOLERANCIA_ATRASO_MIN - 1) }).length, 0);
  const longe = linha(ANA, '15:00', 60);
  assert.equal(planejarAjustesDeAtraso({ agendados: [linha(ANA, '09:00', 60), longe], tecnicos: TODOS, agora }).length, 0, 'o próximo só é ajustado quando começa logo');
  const amanha = { ...linha(ANA, '11:00', 60), dataAgendada: new Date(2031, 3, 15, 11, 0) };
  assert.equal(planejarAjustesDeAtraso({ agendados: [linha(ANA, '09:00', 60), amanha], tecnicos: TODOS, agora }).length, 0);
});

test('serviço concluído do técnico não conta como atraso; visita com dois técnicos troca só o atrasado', () => {
  const feito = { ...linha(ANA, '09:00', 60), status: 'concluido' };
  assert.equal(planejarAjustesDeAtraso({ agendados: [feito, linha(ANA, '11:00', 60)], tecnicos: TODOS, agora }).length, 0);
  const dupla = { ...linha(ANA, '11:00', 60), tecnicoUids: ['ana', 'bruno'], tecnicosNomes: ['Ana', 'Bruno'], ocupacaoPorTecnico: { ana: 60, bruno: 60 } };
  const nova = trocarTecnico(dupla, 'ana', CARLA);
  assert.deepEqual(nova.tecnicoUids, ['carla', 'bruno']);
  assert.deepEqual(nova.tecnicosNomes, ['Carla', 'Bruno']);
  assert.equal(nova.ocupacaoPorTecnico.carla, 60);
  assert.equal(nova.ocupacaoPorTecnico.ana, undefined);
});

test('uma conferência só ajusta o próximo agendamento de cada técnico e não repete o já atrasado', () => {
  const atual = linha(ANA, '09:00', 60);
  const jaAtrasado = linha(ANA, '11:00', 60, { atrasoPorTecnico: true });
  assert.equal(planejarAjustesDeAtraso({ agendados: [atual, jaAtrasado, linha(BRUNO, '10:30', 120), linha(CARLA, '10:30', 120)], tecnicos: TODOS, agora }).length, 0);
});

test('"Atrasado" também vale quando o técnico anterior atrasou (mesmo antes da hora do próprio agendamento)', () => {
  const futuro = linha(ANA, '15:00', 60, { atrasoPorTecnico: true });
  assert.equal(estaAtrasado(futuro, agora), true);
  assert.equal(seloDoServico(futuro, agora).texto, 'Atrasado');
  assert.equal(estaAtrasado(linha(ANA, '15:00', 60), agora), false);
  assert.equal(estaAtrasado({ ...futuro, status: 'concluido' }, agora), false);
});

test('técnico equilibrado: menos minutos no dia; empate pelo menor número de visitas e depois pelo nome', () => {
  const iso = '2031-04-14';
  const livres = [{ uid: 'bruno', nome: 'Bruno' }, { uid: 'ana', nome: 'Ana' }, { uid: 'carla', nome: 'Carla' }];
  assert.equal(escolherTecnicoEquilibrado({ livres, agendados: [], iso }).nome, 'Ana', 'sem nada: ordem alfabética');
  assert.equal(escolherTecnicoEquilibrado({ livres, agendados: [linha(ANA, '08:00', 120), linha(CARLA, '08:00', 60)], iso }).nome, 'Bruno');
  assert.equal(escolherTecnicoEquilibrado({ livres, agendados: [linha(ANA, '08:00', 60), linha(BRUNO, '08:00', 30), linha(BRUNO, '09:00', 30), linha(CARLA, '09:00', 60)], iso }).nome, 'Ana', 'mesmo tempo: menos visitas');
  assert.equal(escolherTecnicoEquilibrado({ livres: [], agendados: [], iso }), null);
  // Visita com vários serviços do mesmo técnico conta uma vez só (o tempo é o da visita).
  const visita = [{ ...linha(ANA, '08:00', 120), agendamentoId: 'x' }, { ...linha(ANA, '08:00', 120), agendamentoId: 'x' }];
  assert.equal(escolherTecnicoEquilibrado({ livres: [ANA, BRUNO], agendados: [...visita, linha(BRUNO, '13:00', 180)], iso }).nome, 'Ana');
});

test('pontos do histórico: verde = concluído, amarelo = atrasado ou cancelado, os dois se houver; hoje e futuro não entram', () => {
  const dia = (d, status) => ({ status, dataAgendada: new Date(2031, 3, d, 10, 0) });
  const pontos = pontosDoHistorico({
    ano: 2031, mes: 3, hoje: '2031-04-14',
    servicos: [dia(3, 'concluido'), dia(5, 'cancelado'), dia(6, 'agendado'), dia(8, 'concluido'), dia(8, 'cancelado'), dia(14, 'concluido'), dia(20, 'agendado')],
  });
  assert.deepEqual([...pontos.get('2031-04-03')], ['verde']);
  assert.deepEqual([...pontos.get('2031-04-05')], ['amarelo']);
  assert.deepEqual([...pontos.get('2031-04-06')], ['amarelo'], 'agendado que já passou = atrasado');
  assert.deepEqual([...pontos.get('2031-04-08')].sort(), ['amarelo', 'verde']);
  assert.equal(pontos.has('2031-04-14'), false);
  assert.equal(pontos.has('2031-04-20'), false);
});
