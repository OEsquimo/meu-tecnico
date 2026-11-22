// Pacote 21: atraso só marcado pelo técnico, links de mapa na mensagem do técnico, menu do técnico.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planejarAjustesDeAtraso } from '../../public/js/dominio/atraso.js';
import { montarAvisoTecnico, linksDeMapa } from '../../public/js/dominio/aviso-tecnico.js';
import { montarDestinatarios } from '../../public/js/dominio/destinatarios-aviso.js';
import { itensDoMenu } from '../../public/js/nucleo/rotas.js';

const ANA = { uid: 'ana', nome: 'Ana' };
const BRUNO = { uid: 'bruno', nome: 'Bruno' };
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

test('atraso: técnico que abre o app só MARCA o próximo agendamento (nunca troca de técnico)', () => {
  const atual = linha(ANA, '09:00', 60);
  const proximo = linha(ANA, '11:00', 60);
  const acoes = planejarAjustesDeAtraso({ agendados: [atual, proximo], tecnicos: [ANA], agora, soMarcar: true });
  assert.deepEqual(acoes.map((a) => [a.tipo, a.linhaIds[0]]), [['atrasar', proximo.id]]);
});

test('atraso: quem já está marcado não é marcado de novo pelo técnico', () => {
  const atual = linha(ANA, '09:00', 60);
  const proximo = linha(ANA, '11:00', 60, { atrasoPorTecnico: true });
  assert.equal(planejarAjustesDeAtraso({ agendados: [atual, proximo], tecnicos: [ANA], agora, soMarcar: true }).length, 0);
});

test('atraso: o administrador troca o técnico de um agendamento que o técnico já marcou, se há alguém livre', () => {
  const atual = linha(ANA, '09:00', 60);
  const proximo = linha(ANA, '11:00', 60, { atrasoPorTecnico: true });
  const acoes = planejarAjustesDeAtraso({ agendados: [atual, proximo], tecnicos: [ANA, BRUNO], agora });
  assert.deepEqual(acoes.map((a) => [a.tipo, a.para?.uid]), [['reatribuir', 'bruno']]);
});

test('atraso: administrador sem ninguém livre não repete a marcação', () => {
  const atual = linha(ANA, '09:00', 60);
  const proximo = linha(ANA, '11:00', 60, { atrasoPorTecnico: true });
  assert.equal(planejarAjustesDeAtraso({ agendados: [atual, proximo], tecnicos: [ANA], agora }).length, 0);
});

test('mapas: endereço escrito vira links do Google Maps e do Waze', () => {
  const m = linksDeMapa('Rua A, 1 · Centro');
  assert.match(m.google, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=Rua%20A/);
  assert.match(m.waze, /^https:\/\/waze\.com\/ul\?q=Rua%20A/);
});

test('mapas: com coordenadas os links vão ao ponto exato; sem endereço não há link', () => {
  const m = linksDeMapa('Rua A, 1', -8.05, -34.9);
  assert.match(m.google, /destination=-8\.05%2C-34\.9/);
  assert.match(m.waze, /ll=-8\.05,-34\.9/);
  assert.deepEqual(linksDeMapa(''), { google: '', waze: '' });
});

test('mensagem do técnico: endereço com Google Maps (sem Waze, pacote 25); sem endereço sem links; cancelamento sem mapas', () => {
  const base = { tecnico: 'João', cliente: 'Maria', dataHora: new Date(2026, 10, 25, 9, 0), whatsappCliente: '5511912345678' };
  const com = montarAvisoTecnico('agendado', { ...base, endereco: 'Rua A, 1' });
  assert.match(com, /📍 Endereço: Rua A, 1\n🗺️ Google Maps: https:\/\/www\.google\.com\/maps\/dir/);
  assert.doesNotMatch(com, /Waze/); // pacote 25: só o Google Maps
  const sem = montarAvisoTecnico('agendado', { ...base, endereco: '' });
  assert.doesNotMatch(sem, /Maps|Waze|Endereço/);
  assert.doesNotMatch(montarAvisoTecnico('cancelado', { ...base, endereco: 'Rua A, 1' }), /Maps|Waze/);
});

test('destinatários: o técnico recebe o link do Google Maps e, havendo coordenadas, o ponto exato', () => {
  const l = { id: 'a', clienteNome: 'Maria', clienteWhatsapp: '5511912345678', local: 'Rua A, 1', localLat: -8.05, localLng: -34.9, dataAgendada: new Date(2026, 10, 25, 9, 0), tipoServicoId: 't', tipoServicoNome: 'Limpeza', tecnicoUids: ['t1'], tecnicosNomes: ['João'] };
  const d = montarDestinatarios({ tipo: 'agendado', empresa: { nome: 'E' }, linhas: [l], equipe: [{ uid: 't1', nome: 'João', telefone: '(11) 98888-7777' }], adminUid: 'adm' });
  assert.match(d[1].texto, /destination=-8\.05%2C-34\.9/); // pacote 25: só o Google Maps (o Waze saiu da mensagem)
});

test('menu do técnico tem "Conta" (onde ele sai); administrador não ganha item novo', () => {
  const tecnico = { estado: 'pronto', papel: 'tecnico', vinculo: {}, empresa: {} };
  const ids = itensDoMenu(tecnico).map((i) => i.id);
  assert.equal(ids[ids.length - 1], 'conta');
  const admin = { estado: 'pronto', papel: 'admin', vinculo: {}, empresa: {} };
  assert.ok(!itensDoMenu(admin).some((i) => i.id === 'conta'));
});
