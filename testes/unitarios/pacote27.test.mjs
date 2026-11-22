// Pacote 27: iniciar/concluir com horários, avisos, validação, desempenho e deslocamento.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  situacaoDaVisita, sugerirInicio, sugerirConclusao, validarHorarios, tempoNoCliente, sequenciarLinhasDaVisita, textoDeMinutos,
  inicioDaVisita, MOTIVOS_ATRASO, FALTAS_ATRASO, horaDeCampo,
} from '../../public/js/dominio/tempo-servico.js';
import {
  desempenhoDoTecnico, desempenhoDaEquipe, deslocamentosDoTecnico, compararComEquipe, minutosDeAlmocoEntre, visitasEsperandoConclusao, teveAtraso,
} from '../../public/js/dominio/desempenho.js';
import { planejarAjustesDeAtraso } from '../../public/js/dominio/atraso.js';
import { CAMPOS_PERMITIDOS } from '../../public/js/dominio/backup.js';
import { readFileSync } from 'node:fs';

const ANA = { uid: 'ana', nome: 'Ana' };
const BRUNO = { uid: 'bruno', nome: 'Bruno' };
const D = (h, m = 0, dia = 14) => new Date(2031, 3, dia, h, m);
let n = 0;
const linha = (tec, hora, minutos, extra = {}) => {
  n += 1;
  return {
    id: `l${n}`, agendamentoId: `v${n}`, status: 'agendado', dataAgendada: D(...hora),
    duracaoMin: minutos, ocupacaoMin: minutos, ocupacaoPorTecnico: { [tec.uid]: minutos },
    tecnicoUid: tec.uid, tecnicoNome: tec.nome, tecnicoUids: [tec.uid], tecnicosNomes: [tec.nome], clienteNome: 'Cliente', tipoServicoNome: 'Limpeza', ...extra,
  };
};
const feita = (tec, hora, minutos, inicio, fim, extra = {}) => linha(tec, hora, minutos, { status: 'concluido', iniciadoEm: inicio, dataConclusao: fim, ...extra });

// ---------------------------------------------------------------- situação da visita
test('situação: antes da hora = agendado; 10 min depois do horário sem iniciar = perguntar início', () => {
  const v = [linha(ANA, [10, 0], 60)];
  assert.equal(situacaoDaVisita(v, D(9, 50), 'ana'), 'agendado');
  assert.equal(situacaoDaVisita(v, D(10, 5), 'ana'), 'agendado'); // dentro da tolerância
  assert.equal(situacaoDaVisita(v, D(10, 25), 'ana'), 'perguntar-inicio');
});

test('situação: iniciou e está no prazo = em serviço; passou do previsto + tolerância = esperando concluir', () => {
  const v = [linha(ANA, [10, 0], 60, { iniciadoEm: D(10, 5) })];
  assert.equal(situacaoDaVisita(v, D(10, 30), 'ana'), 'em-servico');
  assert.equal(situacaoDaVisita(v, D(11, 9), 'ana'), 'em-servico'); // 11:00 + 10 min de tolerância
  assert.equal(situacaoDaVisita(v, D(11, 20), 'ana'), 'esperando-concluir');
});

test('situação: esqueceu os dois: depois do previsto é esperando concluir (nunca "você já começou?" junto)', () => {
  const v = [linha(ANA, [10, 0], 60)];
  assert.equal(situacaoDaVisita(v, D(11, 20), 'ana'), 'esperando-concluir');
  assert.equal(situacaoDaVisita(v, D(11, 5), 'ana'), 'perguntar-inicio');
});

test('situação: "ainda estou no serviço" vale pelo prazo que o técnico deu; depois volta a perguntar', () => {
  const v = [linha(ANA, [10, 0], 60, { iniciadoEm: D(10, 5), atrasoInformadoEm: D(11, 20), atrasoFalta: '30', atrasoMotivo: 'Falta de peça' })];
  assert.equal(situacaoDaVisita(v, D(11, 40), 'ana'), 'em-servico');
  assert.equal(situacaoDaVisita(v, D(11, 55), 'ana'), 'esperando-concluir');
});

test('situação: sem linha aberta não há situação; outro técnico não conta', () => {
  assert.equal(situacaoDaVisita([feita(ANA, [10, 0], 60, D(10, 0), D(11, 0))], D(12, 0), 'ana'), null);
  assert.equal(situacaoDaVisita([linha(BRUNO, [10, 0], 60)], D(12, 0), 'ana'), null);
});

test('início da visita: o mais antigo entre as linhas com início', () => {
  assert.equal(inicioDaVisita([{ iniciadoEm: D(10, 30) }, { iniciadoEm: D(10, 5) }, {}]).getTime(), D(10, 5).getTime());
  assert.equal(inicioDaVisita([{}]), null);
});

// ---------------------------------------------------------------- horários sugeridos
test('início sugerido: o horário marcado; ou o fim do serviço anterior se for mais tarde', () => {
  assert.equal(sugerirInicio({ marcado: D(10, 0) }).data.getTime(), D(10, 0).getTime());
  assert.equal(sugerirInicio({ marcado: D(10, 0), fimAnterior: D(10, 40) }).data.getTime(), D(10, 40).getTime());
  assert.equal(sugerirInicio({ marcado: D(10, 0), fimAnterior: D(9, 30) }).data.getTime(), D(10, 0).getTime());
});

test('início sugerido nunca passa da conclusão: recua e avisa que foi ajustado', () => {
  // marcado 10:00, anterior terminou 10:40, mas concluiu às 10:30 (serviço rápido, esqueceu o início)
  const s = sugerirInicio({ marcado: D(10, 0), fimAnterior: D(10, 40), conclusao: D(10, 30), duracaoMin: 60 });
  assert.equal(s.ajustada, true);
  assert.ok(s.data.getTime() < D(10, 30).getTime());
  // não recua para antes de a meia-noite do dia
  const cedo = sugerirInicio({ marcado: D(0, 20), conclusao: D(0, 10), duracaoMin: 60 });
  assert.ok(cedo.data.getTime() >= D(0, 0).getTime());
});

test('conclusão sugerida: agora; se esqueceu de concluir, início + duração prevista (nunca no futuro)', () => {
  assert.equal(sugerirConclusao({ inicio: D(10, 0), duracaoMin: 60, agora: D(10, 40) }).getTime(), D(10, 40).getTime());
  assert.equal(sugerirConclusao({ inicio: D(10, 5), duracaoMin: 60, agora: D(14, 0), passouDoPrazo: true }).getTime(), D(11, 5).getTime());
  assert.equal(sugerirConclusao({ inicio: D(13, 30), duracaoMin: 60, agora: D(14, 0), passouDoPrazo: true }).getTime(), D(14, 0).getTime());
});

// ---------------------------------------------------------------- validação
const agora = D(15, 0);
test('validar horários: formato, futuro e conclusão antes do início bloqueiam com mensagem no campo certo', () => {
  assert.equal(validarHorarios({ diaISO: '2031-04-14', inicio: '', conclusao: '11:00', agora }).erros.inicio, 'Informe a hora de início.');
  assert.equal(validarHorarios({ diaISO: '2031-04-14', inicio: '25:70', conclusao: '11:00', agora }).erros.inicio, 'Informe a hora de início.');
  assert.equal(validarHorarios({ diaISO: '2031-04-14', inicio: '10:00', conclusao: '09:00', agora }).erros.conclusao, 'A conclusão não pode ser antes do início.');
  assert.equal(validarHorarios({ diaISO: '2031-04-14', inicio: '10:00', conclusao: '10:00', agora }).erros.conclusao, 'A conclusão não pode ser antes do início.');
  assert.equal(validarHorarios({ diaISO: '2031-04-14', inicio: '10:00', conclusao: '16:00', agora }).erros.conclusao, 'Esse horário ainda não chegou.');
  assert.equal(validarHorarios({ diaISO: '2031-04-14', inicio: '15:30', conclusao: '15:40', agora }).erros.inicio, 'Esse horário ainda não chegou.');
  assert.equal(validarHorarios({ diaISO: '2031-04-15', inicio: '10:00', conclusao: '11:00', agora }).erros.dia, 'Esse dia ainda não chegou.');
  assert.equal(validarHorarios({ diaISO: '2031-04-10', inicio: '10:00', conclusao: '11:00', agora, diaMarcadoISO: '2031-04-12' }).erros.dia, 'O início precisa ser no dia do serviço ou depois.');
  assert.equal(validarHorarios({ diaISO: '2031-04-14', inicio: '10:00', conclusao: '11:00', agora }).valido, true);
});

test('validar horários: casos estranhos pedem confirmação, não bloqueiam', () => {
  const curto = validarHorarios({ diaISO: '2031-04-14', inicio: '10:00', conclusao: '10:03', agora });
  assert.equal(curto.valido, true);
  assert.deepEqual(curto.confirmacoes.map((c) => c.codigo), ['curto']);
  assert.match(curto.confirmacoes[0].texto, /3 min/);
  const longo = validarHorarios({ diaISO: '2031-04-14', inicio: '00:30', conclusao: '14:00', agora });
  assert.deepEqual(longo.confirmacoes.map((c) => c.codigo), ['longo']);
  assert.match(longo.confirmacoes[0].texto, /fora da média/);
  const sobrepoe = validarHorarios({ diaISO: '2031-04-14', inicio: '10:00', conclusao: '11:00', agora, fimAnterior: D(10, 40) });
  assert.deepEqual(sobrepoe.confirmacoes.map((c) => c.codigo), ['sobrepoe']);
  assert.match(sobrepoe.confirmacoes[0].texto, /10:40/);
});

test('texto de minutos e hora do campo', () => {
  assert.equal(textoDeMinutos(45), '45 min');
  assert.equal(textoDeMinutos(65), '1h 05');
  assert.equal(textoDeMinutos(120), '2 h');
  assert.equal(horaDeCampo(D(9, 5)), '09:05');
});

// ---------------------------------------------------------------- tempo no cliente
test('tempo no cliente: só com início e conclusão informados e até 12 h', () => {
  assert.equal(tempoNoCliente(feita(ANA, [10, 0], 60, D(11, 5), D(12, 10))), 65);
  assert.equal(tempoNoCliente(feita(ANA, [10, 0], 60, null, D(12, 10))), null); // serviço antigo, sem início
  assert.equal(tempoNoCliente(feita(ANA, [10, 0], 60, D(12, 10), D(11, 0))), null);
  assert.equal(tempoNoCliente(feita(ANA, [10, 0], 60, D(0, 30), D(14, 0))), null); // mais de 12 h
  assert.equal(tempoNoCliente(linha(ANA, [10, 0], 60, { iniciadoEm: D(10, 0) })), null); // ainda aberto
});

test('linhas da mesma visita são feitas em sequência: o início da segunda é a conclusão da primeira', () => {
  const a = { ...feita(ANA, [10, 0], 60, D(10, 0), D(10, 50)), agendamentoId: 'v' };
  const b = { ...feita(ANA, [10, 0], 60, D(10, 0), D(11, 40)), agendamentoId: 'v' };
  const seq = sequenciarLinhasDaVisita([b, a]);
  assert.equal(tempoNoCliente(seq[0]), 50);
  assert.equal(tempoNoCliente(seq[1]), 50);
});

// ---------------------------------------------------------------- desempenho e deslocamento
const ALMOCO = { ativo: true, de: '12:00', ate: '13:00' };
test('almoço: desconta só os minutos que caem dentro do intervalo entre os serviços', () => {
  assert.equal(minutosDeAlmocoEntre(D(11, 30), D(13, 30), ALMOCO), 60);
  assert.equal(minutosDeAlmocoEntre(D(11, 30), D(12, 30), ALMOCO), 30);
  assert.equal(minutosDeAlmocoEntre(D(10, 0), D(10, 30), ALMOCO), 0);
  assert.equal(minutosDeAlmocoEntre(D(11, 30), D(13, 30), { ativo: false }), 0);
});

test('deslocamento: entre concluir uma visita e iniciar a próxima; o primeiro do dia não tem', () => {
  const lista = [
    feita(ANA, [8, 0], 60, D(8, 30), D(10, 40)),
    feita(ANA, [11, 0], 60, D(11, 5), D(12, 10)),
    feita(ANA, [14, 0], 60, D(14, 20), D(15, 0)),
  ];
  // 10:40 -> 11:05 = 25 min; 12:10 -> 14:20 = 130 min - 50 de almoço (12:10 às 13:00) = 80 min
  assert.deepEqual(deslocamentosDoTecnico('ana', lista, ALMOCO), [25, 80]);
});

test('deslocamento: dias diferentes, início antes do fim anterior e intervalo acima de 2 h ficam de fora', () => {
  const lista = [
    feita(ANA, [8, 0], 60, D(8, 0), D(9, 0), { agendamentoId: 'a' }),
    feita(ANA, [8, 0], 60, D(7, 0, 15), D(8, 0, 15), { agendamentoId: 'b' }), // outro dia
    feita(ANA, [16, 0], 60, D(16, 0), D(17, 0), { agendamentoId: 'c' }), // 7 h depois
  ];
  assert.deepEqual(deslocamentosDoTecnico('ana', lista, null), []);
});

test('comparação com a equipe só com 3 ou mais serviços do tipo; 5% de folga é "na média"', () => {
  assert.equal(compararComEquipe({ minutosTecnico: 65, minutosEquipe: 72, feitos: 2 }), null);
  assert.deepEqual(compararComEquipe({ minutosTecnico: 65, minutosEquipe: 72, feitos: 12 }), { texto: '10% mais rápido', tom: 'verde' });
  assert.deepEqual(compararComEquipe({ minutosTecnico: 270, minutosEquipe: 216, feitos: 3 }), { texto: '25% mais lento', tom: 'amarelo' });
  assert.deepEqual(compararComEquipe({ minutosTecnico: 100, minutosEquipe: 98, feitos: 5 }), { texto: 'na média', tom: 'azul' });
});

test('desempenho do técnico: concluídos, tempo médio, atrasos, motivos e por tipo de serviço', () => {
  const lista = [
    feita(ANA, [8, 0], 60, D(8, 0), D(9, 0)),
    feita(ANA, [10, 0], 60, D(10, 0), D(11, 10), { tipoServicoNome: 'Instalação', atrasoMotivo: 'Falta de peça' }),
    feita(ANA, [14, 0], 60, null, D(15, 0)), // sem início: conta como concluído, fica fora da média
    feita(BRUNO, [8, 0], 60, D(8, 0), D(9, 20)),
  ];
  const d = desempenhoDoTecnico({ uid: 'ana', nome: 'Ana', concluidos: lista, almoco: ALMOCO });
  assert.equal(d.concluidos, 3);
  assert.equal(d.comTempo, 2);
  assert.equal(d.tempoMedio, 65); // (60 + 70) / 2
  assert.equal(d.atrasos, 1);
  assert.deepEqual(d.motivos, [{ motivo: 'Falta de peça', total: 1 }]);
  assert.deepEqual(d.porTipo.map((t) => [t.nome, t.feitos]), [['Limpeza', 2], ['Instalação', 1]]);
  assert.equal(d.porTipo.find((t) => t.nome === 'Limpeza').comTempo, 1);
});

test('desempenho da equipe: resumo geral e média da equipe por tipo de serviço', () => {
  const lista = [
    feita(ANA, [8, 0], 60, D(8, 0), D(9, 0)),
    feita(BRUNO, [8, 0], 60, D(8, 0), D(9, 20)),
  ];
  const e = desempenhoDaEquipe({ tecnicos: [ANA, BRUNO], concluidos: lista, almoco: ALMOCO });
  assert.equal(e.resumo.concluidos, 2);
  assert.equal(e.resumo.tempoMedio, 70);
  assert.equal(e.tecnicos[0].porTipo[0].equipeMedio, 70);
});

test('atraso no desempenho: motivo informado ou passou do previsto + tolerância', () => {
  assert.equal(teveAtraso(feita(ANA, [8, 0], 60, D(8, 0), D(9, 5))), false); // dentro da tolerância
  assert.equal(teveAtraso(feita(ANA, [8, 0], 60, D(8, 0), D(9, 30))), true);
  assert.equal(teveAtraso(feita(ANA, [8, 0], 60, D(8, 0), D(8, 50), { atrasoMotivo: 'Trânsito' })), true);
});

// ---------------------------------------------------------------- esperando conclusão (administrador)
test('esperando conclusão: só visitas abertas que passaram do previsto; as mais antigas primeiro', () => {
  const velha = linha(ANA, [9, 0], 60, { dataAgendada: D(9, 0, 12) });
  const hoje = linha(BRUNO, [10, 0], 60);
  const dentro = linha(ANA, [14, 30], 60);
  const respondeu = linha(BRUNO, [9, 0], 60, { iniciadoEm: D(9, 5), atrasoInformadoEm: D(14, 50), atrasoFalta: '60', atrasoMotivo: 'x' });
  const lista = visitasEsperandoConclusao([hoje, dentro, velha, respondeu], D(15, 0));
  assert.deepEqual(lista.map((v) => v.chave), [velha.agendamentoId, hoje.agendamentoId]);
});

// ---------------------------------------------------------------- atraso automático só com confirmação
test('sem tocar em Iniciar nem responder o aviso, o app NÃO troca nem marca o próximo agendamento sozinho', () => {
  const quando = D(11, 0);
  const sem = linha(ANA, [9, 0], 60);
  const proximo = linha(ANA, [11, 0], 60);
  assert.equal(planejarAjustesDeAtraso({ agendados: [sem, proximo], tecnicos: [ANA, BRUNO], agora: quando }).length, 0);
  const iniciou = linha(ANA, [9, 0], 60, { iniciadoEm: D(9, 5) });
  assert.equal(planejarAjustesDeAtraso({ agendados: [iniciou, proximo], tecnicos: [ANA, BRUNO], agora: quando }).length, 1);
  const respondeu = linha(ANA, [9, 0], 60, { atrasoInformadoEm: D(10, 55), atrasoMotivo: 'Trânsito' });
  assert.equal(planejarAjustesDeAtraso({ agendados: [respondeu, proximo], tecnicos: [ANA, BRUNO], agora: quando }).length, 1);
});

// ---------------------------------------------------------------- constantes, backup e regras
test('motivos e prazos de atraso: opções combinadas', () => {
  assert.deepEqual(MOTIVOS_ATRASO, ['Trânsito', 'Serviço demorou mais', 'Falta de peça', 'Cliente atrasou', 'Outro']);
  assert.deepEqual(FALTAS_ATRASO.map((f) => f.valor), ['15', '30', '60', 'mais']);
});

test('backup e regras do Firestore conhecem os campos novos dos serviços', () => {
  const regras = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  for (const campo of ['iniciadoEm', 'atrasoMotivo', 'atrasoDetalhe', 'atrasoFalta', 'atrasoInformadoEm']) {
    assert.ok(CAMPOS_PERMITIDOS.servicos.includes(campo), `backup: ${campo}`);
    assert.ok(regras.includes(`'${campo}'`), `regras: ${campo}`);
  }
});
