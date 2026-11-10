// =============================================================================
// TESTES: expediente (horário de funcionamento) e disponibilidade (dias/horários livres)
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { expedientePadrao, expedienteDaEmpresa, validarExpediente, horariosDoDia, horaParaMinutos, minutosParaHora, fimDepoisDoExpediente } from '../../public/js/dominio/expediente.js';
import { horariosLivresDoDia, diasComVaga, diasLotados, pontosDoMes, menorDuracaoDosTipos } from '../../public/js/dominio/disponibilidade.js';
import { tecnicoEstaLivre } from '../../public/js/dominio/agenda.js';

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

test('horários do dia: de 30 em 30 min, do abrir até 30 min antes de fechar (o serviço pode passar do fechamento)', () => {
  const e = expedientePadrao();
  const h = horariosDoDia(e, SEG);
  assert.equal(h[0], '07:00');
  assert.equal(h[h.length - 1], '17:30', 'fecha às 18:00: o último início é 17:30');
  assert.equal(h.length, 22);
  assert.deepEqual(horariosDoDia(e, SEG, 240), h, 'a duração do serviço não limita o início (hora extra)');
  assert.deepEqual(horariosDoDia(e, DOM), [], 'domingo fechado não tem horário');
  assert.equal(minutosParaHora(horaParaMinutos('07:30')), '07:30');
});

test('hora extra: avisa só quando o serviço termina depois do fechamento', () => {
  const e = expedientePadrao(); // fecha às 18:00
  assert.equal(fimDepoisDoExpediente(e, SEG, '16:00', 120), null, 'termina às 18:00: dentro do expediente');
  assert.equal(fimDepoisDoExpediente(e, SEG, '16:30', 240), '20:30');
  assert.equal(fimDepoisDoExpediente(e, SEG, '16:30', 600), 'depois da meia-noite');
  assert.equal(fimDepoisDoExpediente(e, DOM, '09:00', 60), null, 'dia fechado');
  assert.equal(fimDepoisDoExpediente(e, SEG, '', 60), null);
});

test('hora extra: o serviço longo no fim do dia é oferecido (começa dentro do expediente, termina depois)', () => {
  const e = expedientePadrao();
  const h = horariosLivresDoDia({ expediente: e, iso: SEG, duracaoMin: 480, tecnicos: [A], agendados: [], agora: longeNoPassado });
  assert.equal(h[h.length - 1].hora, '17:30');
});

test('dia seguinte livre: a ocupação acaba na meia-noite do dia em que o serviço começou', () => {
  // Ana começa às 16:30 um serviço de 8h (iria até 00:30 da terça).
  const agendados = [agendado('a', SEG, '16:30', 480)];
  assert.equal(tecnicoEstaLivre('a', new Date(2031, 3, 14, 20, 0), 60, agendados), false, 'à noite de segunda ela segue ocupada');
  assert.equal(tecnicoEstaLivre('a', new Date(2031, 3, 15, 7, 0), 60, agendados), true, 'na terça cedo ela está livre');
  assert.equal(tecnicoEstaLivre('a', new Date(2031, 3, 15, 0, 15), 30, agendados), true, 'depois da meia-noite já é outro dia');
  // O serviço novo que passa da meia-noite também só conta até a meia-noite.
  const terca = [agendado('a', '2031-04-15', '07:00', 60)];
  assert.equal(tecnicoEstaLivre('a', new Date(2031, 3, 14, 16, 30), 900, terca), true, 'um serviço de segunda não esbarra na agenda de terça');
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

test('dias lotados: lotado = não cabe nem o MENOR serviço (a regra não depende do serviço em montagem)', () => {
  const e = expedientePadrao();
  e.seg = { aberto: true, de: '09:00', ate: '12:00' }; // inícios: 09:00, 09:30, 10:00, 10:30, 11:00, 11:30
  const agora = new Date(2031, 3, 3);
  const comBrecha = [agendado('a', SEG, '10:00', 60)]; // Ana ocupada das 10:00 às 11:00; ela ainda pode começar às 09:00
  assert.ok(!diasLotados({ expediente: e, ano: 2031, mes: 3, duracaoMinima: 60, tecnicos: [A], agendados: comBrecha, agora }).has(SEG));
  const cheio = [agendado('a', SEG, '09:00', 180)]; // Ana ocupada das 09:00 às 12:00: nenhum início livre
  assert.ok(diasLotados({ expediente: e, ano: 2031, mes: 3, duracaoMinima: 60, tecnicos: [A], agendados: cheio, agora }).has(SEG));
  // Ana ocupada das 09:30 às 12:00: só cabe um serviço de 30 min às 09:00. Com o menor serviço de 1 hora o dia está lotado...
  const sobraMeia = [agendado('a', SEG, '09:30', 150)];
  assert.ok(diasLotados({ expediente: e, ano: 2031, mes: 3, duracaoMinima: 60, tecnicos: [A], agendados: sobraMeia, agora }).has(SEG));
  // ...mas se existir um serviço de 30 minutos cadastrado, ainda cabe e o dia não está lotado
  assert.ok(!diasLotados({ expediente: e, ano: 2031, mes: 3, duracaoMinima: 30, tecnicos: [A], agendados: sobraMeia, agora }).has(SEG));
  // um serviço que começa às 11:30 e passa do fechamento (hora extra) ainda deixa o dia lotado
  const ate1130 = [agendado('a', SEG, '09:00', 150), agendado('a', SEG, '11:30', 120, 'y')]; // 09:00–11:30 e 11:30 em diante
  assert.ok(diasLotados({ expediente: e, ano: 2031, mes: 3, duracaoMinima: 60, tecnicos: [A], agendados: ate1130, agora }).has(SEG));
});

test('menor serviço cadastrado: o menor entre os tipos ativos; sem tipo, 1 hora', () => {
  assert.equal(menorDuracaoDosTipos([{ duracaoMin: 120 }, { duracaoMin: 45 }, { duracaoMin: 90, ativo: true }]), 45);
  assert.equal(menorDuracaoDosTipos([{ duracaoMin: 30, ativo: false }, { duracaoMin: 90 }]), 90, 'tipo desativado não conta');
  assert.equal(menorDuracaoDosTipos([]), 60);
  assert.equal(menorDuracaoDosTipos([{ duracaoMin: 'x' }, {}]), 60);
});

test('dias lotados: hoje, depois do fim do expediente, o dia só acabou (não é lotado)', () => {
  const e = expedientePadrao();
  const noite = new Date(2031, 3, 14, 20, 0);
  assert.ok(!diasLotados({ expediente: e, ano: 2031, mes: 3, duracaoMin: 60, tecnicos: [A], agendados: [], agora: noite }).has(SEG));
});

// ---------- Pontos do calendário (um por dia; o mesmo na Agenda e na escolha de dia e hora) ----------
const base = (extra = {}) => ({ expediente: expedientePadrao(), ano: 2031, mes: 3, duracaoMin: 60, duracaoMinima: 60, tecnicos: [A, B], agendados: [], agora: new Date(2031, 3, 3), ...extra });

test('pontos: dia com visita que ainda comporta mais é AZUL; dia sem visita não tem ponto', () => {
  const p = pontosDoMes(base({ agendados: [agendado('a', SEG, '09:00', 60)], mostrarLotado: true }));
  assert.equal(p.get(SEG), 'azul');
  assert.equal(p.has('2031-04-15'), false);
  assert.equal(p.size, 1);
});

test('pontos: dia lotado é VERMELHO e o vermelho substitui o azul (um ponto só por dia)', () => {
  const e = expedientePadrao();
  e.seg = { aberto: true, de: '09:00', ate: '10:00' };
  const agendados = [agendado('a', SEG, '09:00', 60, '1'), agendado('b', SEG, '09:00', 60, '2')];
  const p = pontosDoMes(base({ expediente: e, agendados, mostrarLotado: true }));
  assert.equal(p.get(SEG), 'vermelho');
  assert.equal(p.size, 1);
});

test('pontos: sem permissão para ver o lotado (técnico comum) só existe o azul, nunca o vermelho', () => {
  const e = expedientePadrao();
  e.seg = { aberto: true, de: '09:00', ate: '10:00' };
  const agendados = [agendado('a', SEG, '09:00', 60, '1'), agendado('b', SEG, '09:00', 60, '2')];
  const p = pontosDoMes(base({ expediente: e, agendados, mostrarLotado: false }));
  assert.equal(p.get(SEG), 'azul');
});

test('pontos: sem lista de técnicos não se avisa "lotado" (evita falso vermelho)', () => {
  const p = pontosDoMes(base({ tecnicos: [], agendados: [agendado('a', SEG, '09:00', 60)], mostrarLotado: true }));
  assert.equal(p.get(SEG), 'azul');
  assert.equal([...p.values()].includes('vermelho'), false);
});

test('pontos: visita em dia já passado (atrasada) e em dia fechado continuam AZUIS; passado e fechado nunca são vermelhos', () => {
  const p = pontosDoMes(base({ agendados: [agendado('a', '2031-04-02', '09:00', 60), agendado('a', DOM, '09:00', 60)], mostrarLotado: true }));
  assert.equal(p.get('2031-04-02'), 'azul');
  assert.equal(p.get(DOM), 'azul');
});

test('pontos: só serviço AGENDADO conta; concluído, cancelado e visita de outro mês não dão ponto', () => {
  const concluido = { ...agendado('a', SEG, '09:00', 60), status: 'concluido' };
  const cancelado = { ...agendado('a', SEG, '10:00', 60), status: 'cancelado' };
  const outroMes = agendado('a', '2031-05-05', '09:00', 60);
  const p = pontosDoMes(base({ agendados: [concluido, cancelado, outroMes], mostrarLotado: true }));
  assert.equal(p.size, 0);
});

test('pontos: com filtro de técnico o ponto fala só daquele técnico', () => {
  const e = expedientePadrao();
  e.seg = { aberto: true, de: '09:00', ate: '10:00' };
  e.ter = { aberto: true, de: '09:00', ate: '10:00' };
  // segunda: Ana ocupada às 09:00, Bruno livre. terça: só Bruno tem visita.
  const agendados = [agendado('a', SEG, '09:00', 60, '1'), agendado('b', '2031-04-15', '09:00', 60, '2')];
  const todos = pontosDoMes(base({ expediente: e, agendados, mostrarLotado: true }));
  assert.equal(todos.get(SEG), 'azul', 'para a empresa, segunda ainda comporta (Bruno livre)');
  const ana = pontosDoMes(base({ expediente: e, agendados, filtroTecnico: 'a', mostrarLotado: true }));
  assert.equal(ana.get(SEG), 'vermelho', 'para a Ana, segunda está lotada (09:00 era o único horário)');
  assert.equal(ana.has('2031-04-15'), false, 'a visita de terça é do Bruno: não aparece para a Ana');
  const bruno = pontosDoMes(base({ expediente: e, agendados, filtroTecnico: 'b', mostrarLotado: true }));
  assert.equal(bruno.has(SEG), false, 'o Bruno não tem visita na segunda');
  assert.equal(bruno.get('2031-04-15'), 'vermelho', 'terça é o único horário do dia e ele está nele: lotada para ele');
  // técnico do filtro que não está na lista: nada de vermelho
  assert.equal([...pontosDoMes(base({ agendados, filtroTecnico: 'zzz', mostrarLotado: true })).values()].includes('vermelho'), false);
});

test('pontos: a visita em edição não deixa o próprio horário vermelho', () => {
  const e = expedientePadrao();
  e.seg = { aberto: true, de: '09:00', ate: '10:00' };
  const agendados = [agendado('a', SEG, '09:00', 60, 'edit'), agendado('b', SEG, '09:00', 60, 'outro')];
  assert.equal(pontosDoMes(base({ expediente: e, agendados, mostrarLotado: true })).get(SEG), 'vermelho');
  assert.equal(pontosDoMes(base({ expediente: e, agendados, mostrarLotado: true, ignorarAgendamento: 'edit' })).get(SEG), 'azul');
});

test('pontos: a cor do dia NÃO depende da duração do serviço (Agenda e seletor mostram sempre o mesmo)', () => {
  const e = expedientePadrao();
  e.seg = { aberto: true, de: '09:00', ate: '12:00' };
  const agendados = [agendado('a', SEG, '09:00', 120, '1'), agendado('b', SEG, '09:00', 120, '2')]; // sobra só 11:00–12:00 e o início 11:30 (30 min)
  const curto = pontosDoMes(base({ expediente: e, agendados, duracaoMin: 30, mostrarLotado: true }));
  const longo = pontosDoMes(base({ expediente: e, agendados, duracaoMin: 480, mostrarLotado: true }));
  assert.deepEqual([...curto], [...longo]);
  assert.equal(curto.get(SEG), 'azul', 'ainda cabe o menor serviço (1 h) às 11:00');
});
