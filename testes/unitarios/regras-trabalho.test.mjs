// =============================================================================
// TESTES: pausa de almoço e limite de horas por técnico por dia
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { expedientePadrao, regrasDeTrabalhoPadrao, regrasDaEmpresa, validarRegrasDeTrabalho } from '../../public/js/dominio/expediente.js';
import { horariosLivresDoDia, diasLotados } from '../../public/js/dominio/disponibilidade.js';
import { tecnicoEstaLivre, motivoDeIndisponibilidade } from '../../public/js/dominio/agenda.js';

const SEG = '2031-04-14'; // segunda-feira
const passado = new Date(2000, 0, 1);
const A = { uid: 'a', nome: 'Ana' };
const R = regrasDeTrabalhoPadrao();
const em = (hora, iso = SEG) => { const [h, m] = hora.split(':').map(Number); const [a, mes, d] = iso.split('-').map(Number); return new Date(a, mes - 1, d, h, m); };
function visita(hora, min, id = hora) {
  return { status: 'agendado', agendamentoId: id, dataAgendada: em(hora), duracaoMin: min, ocupacaoMin: min, tecnicoUid: 'a', tecnicoUids: ['a'], tecnicos: [{ uid: 'a' }] };
}

test('regras padrão: almoço 12:00–13:00 e 8 h por dia; empresa sem regras usa o padrão', () => {
  assert.deepEqual(R, { almoco: { ativo: true, de: '12:00', ate: '13:00' }, limiteMin: 480 });
  assert.deepEqual(regrasDaEmpresa({}), R);
  assert.deepEqual(regrasDaEmpresa(null), R);
  assert.deepEqual(regrasDaEmpresa({ almoco: { ativo: false, de: '11:30', ate: '12:30' }, limiteHorasDia: 9 }), { almoco: { ativo: false, de: '11:30', ate: '12:30' }, limiteMin: 540 });
  assert.equal(regrasDaEmpresa({ limiteHorasDia: 0 }).limiteMin, 0, '0 = sem limite');
  assert.deepEqual(regrasDaEmpresa({ almoco: { ativo: true, de: '14:00', ate: '13:00' }, limiteHorasDia: 99 }), R, 'valores estragados voltam ao padrão');
});

test('validar regras: almoço precisa terminar depois de começar; limite de 0 a 24 (vírgula aceita)', () => {
  assert.equal(validarRegrasDeTrabalho({ almocoAtivo: true, de: '12:00', ate: '12:00', limiteHoras: '8' }).erros['almoco-ate'] !== undefined, true);
  assert.equal(validarRegrasDeTrabalho({ almocoAtivo: true, de: '', ate: '13:00', limiteHoras: '8' }).erros['almoco-de'] !== undefined, true);
  assert.equal(validarRegrasDeTrabalho({ almocoAtivo: false, de: '', ate: '', limiteHoras: '8' }).valido, true, 'almoço desligado não exige horário');
  assert.equal(validarRegrasDeTrabalho({ almocoAtivo: true, de: '12:00', ate: '13:00', limiteHoras: '25' }).erros.limiteHoras !== undefined, true);
  assert.equal(validarRegrasDeTrabalho({ almocoAtivo: true, de: '12:00', ate: '13:00', limiteHoras: 'abc' }).erros.limiteHoras !== undefined, true);
  const ok = validarRegrasDeTrabalho({ almocoAtivo: true, de: '12:00', ate: '13:30', limiteHoras: '7,5' });
  assert.deepEqual(ok.dados, { almoco: { ativo: true, de: '12:00', ate: '13:30' }, limiteHorasDia: 7.5 });
  assert.equal(validarRegrasDeTrabalho({ almocoAtivo: true, de: '12:00', ate: '13:00', limiteHoras: '' }).dados.limiteHorasDia, 0, 'vazio = sem limite');
});

test('almoço: serviço de até 4 h não começa nem atravessa 12:00–13:00; encostar pode', () => {
  const livre = (hora, min) => motivoDeIndisponibilidade('a', em(hora), min, [], null, R);
  assert.equal(livre('09:30', 150), '', 'termina 12:00 (encosta): livre');
  assert.equal(livre('10:00', 150), 'almoco', 'atravessa o almoço');
  assert.equal(livre('12:00', 60), 'almoco', 'começa no almoço');
  assert.equal(livre('12:30', 30), 'almoco');
  assert.equal(livre('13:00', 150), '', 'começa quando o almoço acaba: livre');
  assert.equal(motivoDeIndisponibilidade('a', em('10:00'), 150, [], null, null), '', 'sem regras (compatível): livre');
  assert.equal(motivoDeIndisponibilidade('a', em('10:00'), 150, [], null, { almoco: { ativo: false, de: '12:00', ate: '13:00' }, limiteMin: 0 }), '', 'almoço desligado');
  assert.equal(livre('07:00', 360), '', 'serviço longo (mais de 4 h) pode atravessar, senão nunca caberia');
});

test('limite diário: soma o que o técnico já tem no dia (uma vez por visita) e bloqueia o que passa de 8 h', () => {
  const dia = [visita('07:00', 150), visita('13:00', 150), visita('15:30', 120)]; // 2h30 + 2h30 + 2h = 7h
  assert.equal(motivoDeIndisponibilidade('a', em('18:00'), 60, dia, null, R), '', '7 h + 1 h = 8 h: no limite, cabe');
  assert.equal(motivoDeIndisponibilidade('a', em('17:30'), 90, dia, null, R), 'limite', '7 h + 1h30 passa de 8 h');
  assert.equal(motivoDeIndisponibilidade('a', em('17:30'), 90, dia, null, { ...R, limiteMin: 0 }), '', 'sem limite (0) não bloqueia por horas');
  // Outro dia não conta.
  const outroDia = { ...visita('07:00', 480), dataAgendada: em('07:00', '2031-04-15') };
  assert.equal(motivoDeIndisponibilidade('a', em('09:00'), 120, [outroDia], null, R), '', 'o tempo de outro dia não entra');
  // Serviço maior que o limite num dia vazio ainda é possível.
  assert.equal(motivoDeIndisponibilidade('a', em('07:00'), 600, [], null, R), '', 'dia vazio: serviço de 10 h pode');
  // Editar o próprio agendamento não conta contra ele mesmo.
  assert.equal(motivoDeIndisponibilidade('a', em('18:00'), 60, dia, '07:00', R), '', 'ignorando a primeira visita (2h30), sobra espaço');
  // Linhas da mesma visita contam uma vez só.
  const duasLinhas = [visita('07:00', 150, 'v1'), { ...visita('07:00', 150, 'v1') }];
  assert.equal(motivoDeIndisponibilidade('a', em('13:00'), 330, duasLinhas, null, R), '', '2h30 (uma vez) + 5h30 = 8 h');
});

test('o cenário do técnico: instalações de 2h30 — no máximo 3 por dia (com almoço e limite)', () => {
  const exp = expedientePadrao();
  const agendados = [];
  let marcadas = 0;
  for (let i = 0; i < 6; i += 1) {
    const livres = horariosLivresDoDia({ expediente: exp, iso: SEG, duracaoMin: 150, tecnicos: [A], agendados, regras: R, agora: passado });
    if (livres.length === 0) break;
    agendados.push(visita(livres[0].hora, 150, `v${i}`));
    marcadas += 1;
  }
  assert.equal(marcadas, 3, '3 instalações de 2h30 (7 h 30) e acabou o dia');
  assert.equal(diasLotados({ expediente: exp, ano: 2031, mes: 3, tecnicos: [A], agendados, duracaoMinima: 60, regras: R, agora: passado }).has(SEG), true, 'sobram 30 min: um serviço de 1 h não cabe, o dia fica vermelho');
  assert.equal(diasLotados({ expediente: exp, ano: 2031, mes: 3, tecnicos: [A], agendados, duracaoMinima: 30, regras: R, agora: passado }).has(SEG), false, 'mas se o menor serviço for de 30 min, ainda cabe');
});

test('dia lotado considera o limite: com 8 h feitas, nem o menor serviço cabe', () => {
  const exp = expedientePadrao();
  const agendados = [visita('07:00', 240, 'm'), visita('13:00', 240, 'n')]; // 4 h + 4 h
  const lotados = diasLotados({ expediente: exp, ano: 2031, mes: 3, tecnicos: [A], agendados, duracaoMinima: 60, regras: R, agora: passado });
  assert.equal(lotados.has(SEG), true);
  const semRegras = diasLotados({ expediente: exp, ano: 2031, mes: 3, tecnicos: [A], agendados, duracaoMinima: 60, agora: passado });
  assert.equal(semRegras.has(SEG), false, 'sem as regras novas o dia ainda teria vaga (17:00)');
});

import { validarAdministrador } from '../../public/js/dominio/validacoes.js';
test('administrador: nome obrigatório, WhatsApp opcional mas válido quando vem', () => {
  assert.equal(validarAdministrador({ nome: '', telefone: '' }).erros.nome !== undefined, true);
  assert.equal(validarAdministrador({ nome: 'Marcos Frio', telefone: '' }).valido, true, 'sem WhatsApp pode');
  assert.equal(validarAdministrador({ nome: 'Marcos Frio', telefone: '123' }).erros.telefone !== undefined, true);
  const ok = validarAdministrador({ nome: ' Marcos Frio ', telefone: '(11) 91234-5678' });
  assert.equal(ok.valido, true);
  assert.equal(ok.dados.nome, 'Marcos Frio');
  assert.equal(typeof ok.dados.telefone, 'string');
});
