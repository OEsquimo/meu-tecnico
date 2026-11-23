// Pacote 30: status Em andamento / Tempo excedido (do início real), link curto do Maps e reagendamento sem data anterior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seloDaLinha, situacaoDaVisita, fimPrevistoDaVisita } from '../../public/js/dominio/tempo-servico.js';
import { estaAtrasado, fimPrevistoDesdeOInicio, minutosPrevistosDoServico } from '../../public/js/dominio/servicos.js';
import { fimDoServico } from '../../public/js/dominio/agenda.js';
import { seloDaLista } from '../../public/js/dominio/lista-servicos.js';
import { montarAvisoTecnico } from '../../public/js/dominio/aviso-tecnico.js';
import { montarDestinatarios } from '../../public/js/dominio/destinatarios-aviso.js';
import { hrefGoogleMaps, opcoesDeNavegacao } from '../../public/js/dominio/endereco.js';
import { linkCurtoDoMapa } from '../../public/js/dominio/link-horarios.js';

const D = (h, m = 0, dia = 14) => new Date(2031, 3, dia, h, m);
let n = 0;
const linha = (hora, minutos, extra = {}) => {
  n += 1;
  return {
    id: `l${n}`, agendamentoId: 'v1', status: 'agendado', dataAgendada: D(...hora), duracaoMin: minutos, ocupacaoMin: minutos,
    ocupacaoPorTecnico: { ana: minutos }, tecnicoUid: 'ana', tecnicoUids: ['ana'], tecnicosNomes: ['Ana'], clienteNome: 'C', tipoServicoNome: 'Limpeza', ...extra,
  };
};

// ---------------------------------------------------------------- status
test('sem iniciar: antes do horário "Agendado"; passou do horário "Atrasado" (como sempre)', () => {
  const l = linha([14, 0], 60);
  assert.equal(seloDaLinha(l, D(13, 0)).texto, 'Agendado');
  assert.equal(seloDaLinha(l, D(14, 30)).texto, 'Atrasado');
  assert.equal(seloDaLinha(l, D(16, 0)).texto, 'Atrasado'); // nunca iniciado: continua Atrasado
});

test('iniciado: "Em andamento" (verde) dentro do tempo e "Tempo excedido" (laranja) depois, contando do início real', () => {
  const l = linha([14, 0], 60, { iniciadoEm: D(14, 40) });
  assert.deepEqual(seloDaLinha(l, D(14, 50)), { texto: 'Em andamento', tom: 'verde' }); // atrasado para começar, mas em andamento
  assert.equal(seloDaLinha(l, D(15, 40)).texto, 'Em andamento'); // fim previsto 15:40
  assert.equal(seloDaLinha(l, D(15, 50)).texto, 'Em andamento'); // tolerância de 10 min
  assert.deepEqual(seloDaLinha(l, D(15, 51)), { texto: 'Tempo excedido', tom: 'laranja' });
});

test('tempo previsto é a soma dos serviços da visita (ocupação do técnico)', () => {
  const l = linha([9, 0], 60, { ocupacaoMin: 90, ocupacaoPorTecnico: { ana: 90 }, iniciadoEm: D(9, 0) });
  assert.equal(minutosPrevistosDoServico(l, 'ana'), 90);
  assert.equal(fimPrevistoDesdeOInicio(l, 'ana').getTime(), D(10, 30).getTime());
  assert.equal(seloDaLinha(l, D(10, 40)).texto, 'Em andamento');
  assert.equal(seloDaLinha(l, D(10, 41)).texto, 'Tempo excedido');
});

test('"Ainda estou no serviço" com prazo extra volta para "Em andamento" até o prazo acabar', () => {
  const l = linha([14, 0], 60, { iniciadoEm: D(14, 0), atrasoInformadoEm: D(15, 15), atrasoFalta: '30', atrasoMotivo: 'Falta de peça' });
  assert.equal(seloDaLinha(l, D(15, 20)).texto, 'Em andamento');
  assert.equal(seloDaLinha(l, D(15, 50)).texto, 'Tempo excedido'); // 15:15 + 30 min = 15:45, já acabou
});

test('serviço iniciado não é "atrasado"; concluído/cancelado seguem o selo de sempre', () => {
  assert.equal(estaAtrasado(linha([9, 0], 60, { iniciadoEm: D(9, 5) }), D(12, 0)), false);
  assert.equal(estaAtrasado(linha([9, 0], 60), D(12, 0)), true);
  assert.equal(seloDaLinha(linha([9, 0], 60, { status: 'concluido' }), D(12, 0)).texto, 'Concluído');
  assert.equal(seloDaLinha(linha([9, 0], 60, { status: 'cancelado' }), D(12, 0)).texto, 'Cancelado');
  assert.equal(seloDaLista(linha([9, 0], 60, { iniciadoEm: D(9, 5) }), D(9, 30)).texto, 'Em andamento');
});

test('o aviso "esperando concluir" também conta do início real (e sem início, do horário marcado)', () => {
  const iniciada = [linha([14, 0], 60, { iniciadoEm: D(14, 40) })];
  assert.equal(situacaoDaVisita(iniciada, D(15, 45)), 'em-servico'); // antes: 15:10 já seria "esperando concluir"
  assert.equal(situacaoDaVisita(iniciada, D(15, 51)), 'esperando-concluir');
  assert.equal(fimPrevistoDaVisita(iniciada).getTime(), D(15, 40).getTime());
  const semInicio = [linha([14, 0], 60)];
  assert.equal(situacaoDaVisita(semInicio, D(15, 11)), 'esperando-concluir');
  assert.equal(fimPrevistoDaVisita(semInicio).getTime(), fimDoServico(semInicio[0]).getTime());
});

// ---------------------------------------------------------------- mensagens
test('reagendamento ao técnico: só a nova data e o novo horário', () => {
  const t = montarAvisoTecnico('reagendado', { tecnico: 'Kaleu', cliente: 'Adriana', dataHora: D(14, 0, 30), anterior: D(14, 0, 23), endereco: 'Rua 52, 236' });
  assert.match(t, /Nova data: /);
  assert.match(t, /Novo horário: 14:00/);
  assert.doesNotMatch(t, /anterior/i);
});

test('o link do Maps na mensagem é o link curto quando existe, e o comprido quando não', () => {
  const curto = linkCurtoDoMapa('https://app/', 'abc123xyz9');
  assert.equal(curto, 'https://app/#/m/abc123xyz9');
  const com = montarAvisoTecnico('agendado', { tecnico: 'João', cliente: 'Maria', dataHora: D(9, 0), endereco: 'Rua A, 1', linkMapa: curto });
  assert.match(com, /Google Maps: https:\/\/app\/#\/m\/abc123xyz9/);
  assert.doesNotMatch(com, /google\.com\/maps/);
  const sem = montarAvisoTecnico('agendado', { tecnico: 'João', cliente: 'Maria', dataHora: D(9, 0), endereco: 'Rua A, 1' });
  assert.match(sem, /google\.com\/maps\/dir/);
  const cancel = montarAvisoTecnico('cancelado', { tecnico: 'João', cliente: 'Maria', dataHora: D(9, 0), endereco: 'Rua A, 1', linkMapa: curto });
  assert.doesNotMatch(cancel, /Maps/);
});

test('destinatários repassam o link curto do Maps ao técnico', () => {
  const l = { id: 'a', status: 'agendado', dataAgendada: D(9, 0), clienteNome: 'Maria', clienteWhatsapp: '11912345678', local: 'Rua A, 1', tipoServicoNome: 'Limpeza', tecnicoUids: ['t1'], tecnicosNomes: ['João'], tecnicoUid: 't1', agendamentoId: 'v1' };
  const d = montarDestinatarios({ tipo: 'agendado', empresa: { nome: 'E' }, linhas: [l], equipe: [{ uid: 't1', nome: 'João', telefone: '(11) 98888-7777' }], adminUid: 'adm', baseApp: 'https://app/', linkMapa: 'https://app/#/m/abc123xyz9' });
  assert.match(decodeURIComponent(d.find((x) => x.id === 'tec:t1').link), /\/#\/m\/abc123xyz9/);
});

test('hrefGoogleMaps é o mesmo link de "Ir até o cliente"', () => {
  const op = opcoesDeNavegacao({ rua: 'Rua A, 1', cidade: 'Recife', uf: 'PE' }).find((o) => o.id === 'google');
  assert.equal(op.href, hrefGoogleMaps('Rua A, 1, Recife - PE, Brasil'));
  assert.match(hrefGoogleMaps('-8.05,-34.9'), /destination=-8\.05%2C-34\.9/);
});

test('regras: o link curto do mapa é lido por quem tem o código e criado só pelo administrador', () => {
  const regras = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.match(regras, /tipo in \['horarios', 'mapa'\]/);
  assert.match(regras, /tipo == 'mapa'/);
});
