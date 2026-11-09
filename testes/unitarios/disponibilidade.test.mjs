// =============================================================================
// TESTES: expediente (horário de funcionamento) e disponibilidade (dias/horários livres)
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { expedientePadrao, expedienteDaEmpresa, validarExpediente, horariosDoDia, horaParaMinutos, minutosParaHora } from '../../public/js/dominio/expediente.js';
import { horariosLivresDoDia, diasComVaga, diasLotados } from '../../public/js/dominio/disponibilidade.js';

// 2031-04-14 é segunda-feira; 2031-04-13 é domingo.
const SEG = '2031-04-14';
const DOM = '2031-04-13';
const longeNoPassado = new Date(2000, 0, 1);
const A = { uid: 'a', nome: 'Ana' };
const B = { uid: 'b', nome: 'Bruno' };

function agendado(uid, iso, hora, duracaoMin = 60, agendamentoId = 'x') {
  const [h, m] = hora.split(':').map(Number);
  const [ano, mes, dia] = iso.split('-').map(Number);
  return { status: 'agendado', agendamentoId, dataAgendada: new Date(ano, mes - 1, dia, h, m), duracaoMin, tecnicoUid: uid, tecnicoUids: [uid], tecnicos: [{ uid }] };
}

test('expediente padrão: segunda a sábado 07:00–18:00, domingo fechado', () => {
  const e = expedientePadrao();
  assert.equal(e.dom.aberto, false);
  for (const d of ['seg', 'ter', 'qua', 'qui', 'sex', 'sab']) assert.deepEqual(e[d], { aberto: true, de: '07:00', ate: '18:00' });
});

test('empresa sem expediente salvo usa o padrão; expediente salvo vale; dia estragado volta ao padrão', () => {
  assert.deepEqual(expedienteDaEmpresa({}), expedientePadrao());
  assert.deepEqual(expedienteDaEmpresa(null), expedientePadrao());
  const e = expedienteDaEmpresa({ expediente: { dom: { aberto: true, de: '08:00', ate: '12:00' }, seg: { aberto: 'sim' } } });
  assert.deepEqual(e.dom, { aberto: true, de: '08:00', ate: '12:00' });
  assert.deepEqual(e.seg, expedientePadrao().seg);
});

test('horários do dia: de 30 em 30 min, só os que terminam até o fechamento', () => {
  const e = expedientePadrao();
  const h60 = horariosDoDia(e, SEG, 60);
  assert.equal(h60[0], '07:00');
  assert.equal(h60[h60.length - 1], '17:00');
  assert.equal(h60.length, 21);
  const h120 = horariosDoDia(e, SEG, 120);
  assert.equal(h120[h120.length - 1], '16:00');
  assert.deepEqual(horariosDoDia(e, DOM, 60), [], 'domingo fechado não tem horário');
  assert.equal(minutosParaHora(horaParaMinutos('07:30')), '07:30');
});

test('validar expediente: exige hora válida, fechar depois de abrir e pelo menos um dia aberto', () => {
  const ok = validarExpediente(expedientePadrao());
  assert.equal(ok.valido, true);
  const ruim = expedientePadrao();
  ruim.seg = { aberto: true, de: '18:00', ate: '07:00' };
  ruim.ter = { aberto: true, de: '', ate: '18:00' };
  const r = validarExpediente(ruim);
  assert.equal(r.valido, false);
  assert.ok(r.erros['seg-ate']);
  assert.ok(r.erros['ter-de']);
  const fechado = Object.fromEntries(Object.keys(expedientePadrao()).map((k) => [k, { aberto: false, de: '', ate: '' }]));
  const f = validarExpediente(fechado);
  assert.equal(f.valido, false);
  assert.ok(f.erros.geral);
  // dia fechado com horário vazio guarda o padrão
  const meio = expedientePadrao();
  meio.sab = { aberto: false, de: '', ate: '' };
  const m = validarExpediente(meio);
  assert.equal(m.valido, true);
  assert.deepEqual(m.dados.sab, { aberto: false, de: '07:00', ate: '18:00' });
});

test('horários livres: tira o horário ocupado e só mostra técnico livre', () => {
  const e = expedientePadrao();
  const agendados = [agendado('a', SEG, '09:00', 60)];
  const h = horariosLivresDoDia({ expediente: e, iso: SEG, duracaoMin: 60, tecnicos: [A], agendados, agora: longeNoPassado });
  assert.ok(!h.some((x) => x.hora === '09:00'), 'Ana ocupada às 09:00');
  assert.ok(!h.some((x) => x.hora === '08:30'), '08:30 + 60 min invade o serviço das 09:00');
  assert.ok(h.some((x) => x.hora === '08:00'));
  assert.ok(h.some((x) => x.hora === '10:00'));
  // com dois técnicos, 09:00 continua oferecido, só com o Bruno
  const dois = horariosLivresDoDia({ expediente: e, iso: SEG, duracaoMin: 60, tecnicos: [A, B], agendados, agora: longeNoPassado });
  const nove = dois.find((x) => x.hora === '09:00');
  assert.deepEqual(nove.tecnicos.map((t) => t.uid), ['b']);
});

test('horários livres: o próprio agendamento em edição não conta como ocupado', () => {
  const e = expedientePadrao();
  const agendados = [agendado('a', SEG, '09:00', 60, 'meu')];
  const h = horariosLivresDoDia({ expediente: e, iso: SEG, duracaoMin: 60, tecnicos: [A], agendados, ignorarAgendamento: 'meu', agora: longeNoPassado });
  assert.ok(h.some((x) => x.hora === '09:00'));
});

test('horários livres: horário que já passou não é oferecido (hoje)', () => {
  const e = expedientePadrao();
  const agora = new Date(2031, 3, 14, 10, 0);
  const h = horariosLivresDoDia({ expediente: e, iso: SEG, duracaoMin: 60, tecnicos: [A], agendados: [], agora });
  assert.equal(h[0].hora, '10:30');
  const ontem = horariosLivresDoDia({ expediente: e, iso: '2031-04-13', duracaoMin: 60, tecnicos: [A], agendados: [], agora: new Date(2031, 3, 15) });
  assert.deepEqual(ontem, []);
});

test('dias com vaga: dia cheio, domingo fechado e dia passado ficam de fora', () => {
  const e = expedientePadrao();
  e.ter = { aberto: true, de: '09:00', ate: '10:00' }; // terça só tem o horário das 09:00
  const agendados = [agendado('a', '2031-04-15', '09:00', 60)]; // terça 15 ocupada para a Ana
  const dias = diasComVaga({ expediente: e, ano: 2031, mes: 3, duracaoMin: 60, tecnicos: [A], agendados, agora: new Date(2031, 3, 3) });
  assert.ok(dias.has('2031-04-14'), 'segunda livre');
  assert.ok(!dias.has('2031-04-15'), 'terça cheia');
  assert.ok(!dias.has('2031-04-13'), 'domingo fechado');
  assert.ok(!dias.has('2031-04-02'), 'dia passado');
  const comBruno = diasComVaga({ expediente: e, ano: 2031, mes: 3, duracaoMin: 60, tecnicos: [A, B], agendados, agora: new Date(2031, 3, 3) });
  assert.ok(comBruno.has('2031-04-15'), 'com outro técnico livre o dia volta a ter vaga');
});

test('dias lotados: só o dia aberto, futuro e sem nenhum horário livre; fechado e passado não contam', () => {
  const e = expedientePadrao();
  e.ter = { aberto: true, de: '09:00', ate: '10:00' }; // terça só tem o horário das 09:00
  const agendados = [agendado('a', '2031-04-15', '09:00', 60)]; // terça 15 ocupada para a Ana
  const agora = new Date(2031, 3, 3);
  const lotados = diasLotados({ expediente: e, ano: 2031, mes: 3, duracaoMin: 60, tecnicos: [A], agendados, agora });
  assert.ok(lotados.has('2031-04-15'), 'terça cheia está lotada');
  assert.ok(!lotados.has('2031-04-14'), 'segunda livre não é lotada');
  assert.ok(!lotados.has('2031-04-13'), 'domingo fechado não é lotado');
  assert.ok(!lotados.has('2031-04-02'), 'dia passado não é lotado');
  // com outro técnico livre o dia deixa de estar lotado
  assert.ok(!diasLotados({ expediente: e, ano: 2031, mes: 3, duracaoMin: 60, tecnicos: [A, B], agendados, agora }).has('2031-04-15'));
  // sem nenhum técnico, todo dia aberto e futuro está lotado
  assert.ok(diasLotados({ expediente: e, ano: 2031, mes: 3, duracaoMin: 60, tecnicos: [], agendados: [], agora }).has('2031-04-14'));
});

test('dias lotados: a conta usa a duração da visita (uma instalação de 3h pode não caber onde uma limpeza de 1h cabe)', () => {
  const e = expedientePadrao();
  e.seg = { aberto: true, de: '09:00', ate: '12:00' };
  const agendados = [agendado('a', SEG, '10:00', 60)]; // Ana ocupada das 10:00 às 11:00
  const agora = new Date(2031, 3, 3);
  assert.ok(!diasLotados({ expediente: e, ano: 2031, mes: 3, duracaoMin: 60, tecnicos: [A], agendados, agora }).has(SEG), '1h cabe às 09:00 ou 11:00');
  assert.ok(diasLotados({ expediente: e, ano: 2031, mes: 3, duracaoMin: 180, tecnicos: [A], agendados, agora }).has(SEG), '3h não cabe no dia');
});

test('dias lotados: hoje, depois do fim do expediente, o dia só acabou (não é lotado)', () => {
  const e = expedientePadrao();
  const noite = new Date(2031, 3, 14, 20, 0);
  assert.ok(!diasLotados({ expediente: e, ano: 2031, mes: 3, duracaoMin: 60, tecnicos: [A], agendados: [], agora: noite }).has(SEG));
});
