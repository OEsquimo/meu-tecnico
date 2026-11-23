// Pacote 20: avisos por WhatsApp para o cliente e para os técnicos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { montarAviso, modeloDoAviso, servicosParaAviso, MODELOS_DE_AVISO, CAMPO_DO_AVISO } from '../../public/js/dominio/aviso-cliente.js';
import { montarAvisoTecnico, linkConversaWhatsapp } from '../../public/js/dominio/aviso-tecnico.js';
import { montarDestinatarios } from '../../public/js/dominio/destinatarios-aviso.js';

const quando = new Date(2026, 10, 16, 7, 0);
const antes = new Date(2026, 10, 14, 15, 30);
const empresa = { nome: 'Gelo Bom' };

const linha = (id, extra = {}) => ({
  id, clienteNome: 'Maria Souza', clienteWhatsapp: '5511912345678', clienteTelefone: '', local: 'Rua das Flores, 120 · Centro',
  dataAgendada: quando, tipoServicoId: 'ts', tipoServicoNome: 'Limpeza', tecnicoUids: ['t1'], tecnicosNomes: ['João Silva'], ...extra,
});
const equipe = [{ uid: 't1', nome: 'João Silva', telefone: '(11) 98888-7777' }, { uid: 't2', nome: 'Pedro', telefone: '' }, { uid: 'adm', nome: 'Dono', telefone: '(11) 97777-6666' }];

test('serviços no aviso: até 3 nomes diferentes; mais que isso fica vazio; repetidos contam uma vez', () => {
  assert.equal(servicosParaAviso(['Limpeza', 'Limpeza', 'Limpeza']), 'Limpeza');
  assert.equal(servicosParaAviso(['A', 'B', 'C']), 'A, B e C');
  assert.equal(servicosParaAviso(['A', 'B', 'C', 'D']), '');
});

test('aviso ao cliente (agendamento): formato do documento, com técnico e endereço', () => {
  const t = montarAviso(MODELOS_DE_AVISO.agendado, { nome: 'Maria', servicos: ['Limpeza'], dataHora: quando, empresa: 'Gelo Bom', tecnico: ['João Silva'], endereco: 'Rua das Flores, 120' });
  for (const trecho of ['Seu agendamento foi confirmado!', '📅 Data: Segunda-feira, 16 de novembro', '🕒 Horário: 07:00', '🔧 Serviços: Limpeza', '👨‍🔧 Técnico: João Silva', '📍 Endereço: Rua das Flores, 120', 'Agradecemos pela preferência!']) {
    assert.ok(t.includes(trecho), trecho);
  }
});

test('mais de 3 serviços: a linha de serviços some; sem técnico a linha do técnico some', () => {
  const t = montarAviso(MODELOS_DE_AVISO.agendado, { nome: 'Maria', servicos: ['A', 'B', 'C', 'D'], dataHora: quando, empresa: 'E' });
  assert.doesNotMatch(t, /Serviços:|Técnico:|Endereço:/);
  assert.doesNotMatch(t, /\n\n\n/);
});

test('cancelamento ao cliente: leva o link quando existe; sem link a linha some', () => {
  const com = montarAviso(MODELOS_DE_AVISO.cancelado, { nome: 'Maria', servicos: ['Limpeza'], dataHora: quando, empresa: 'E', link: 'https://x/#/h' });
  assert.match(com, /Informamos que seu agendamento foi cancelado/);
  assert.match(com, /outro dia e horário, acesse: https:\/\/x\/#\/h/);
  const sem = montarAviso(MODELOS_DE_AVISO.cancelado, { nome: 'Maria', servicos: ['Limpeza'], dataHora: quando, empresa: 'E' });
  assert.doesNotMatch(sem, /acesse/);
});

test('reagendamento ao cliente: nova data e horário', () => {
  const t = montarAviso(MODELOS_DE_AVISO.reagendado, { nome: 'Maria', servicos: ['Limpeza'], dataHora: quando, empresa: 'E' });
  assert.match(t, /Seu serviço foi reagendado/);
  assert.match(t, /Nova data: Segunda-feira, 16 de novembro/);
  assert.match(t, /Agradecemos pela compreensão!/);
});

test('modelo antigo do pacote 19 vira o novo; texto editado pela empresa continua', () => {
  const antigo = 'Olá, {nome}! Seu atendimento ({servico}) está agendado para {data} às {hora}. Qualquer dúvida, é só responder esta mensagem. {empresa}';
  assert.equal(modeloDoAviso({ [CAMPO_DO_AVISO.agendado]: antigo }, 'agendado'), MODELOS_DE_AVISO.agendado);
  assert.equal(modeloDoAviso({ avisoAgendado: 'Meu texto' }, 'agendado'), 'Meu texto');
});

test('aviso ao técnico (agendamento): sem lista de serviços, com contatos e link do app', () => {
  const t = montarAvisoTecnico('agendado', { tecnico: 'João Silva', cliente: 'Maria Souza', dataHora: quando, endereco: 'Rua A, 1', whatsappCliente: '5511912345678', telefoneCliente: '(11) 3333-4444', linkApp: 'https://app/#/servico/abc', servicos: ['Limpeza'] });
  assert.match(t, /^Olá, João!\nVocê tem um novo serviço agendado\./);
  for (const trecho of ['👤 Cliente: Maria Souza', '📅 Data:', '🕒 Horário: 07:00', '📍 Endereço: Rua A, 1', '📱 WhatsApp do cliente: https://wa.me/5511912345678', '📞 Telefone: (11) 3333-4444', 'Ver os serviços e todos os detalhes no app: https://app/#/servico/abc', 'Bom trabalho!']) {
    assert.ok(t.includes(trecho), trecho);
  }
  assert.doesNotMatch(t, /Limpeza/);
});

test('aviso ao técnico: sem telefone comum a linha some; reagendamento mostra só a nova data e o novo horário (Pacote 30)', () => {
  const t = montarAvisoTecnico('reagendado', { tecnico: 'João', cliente: 'Maria', dataHora: quando, anterior: antes, endereco: '', whatsappCliente: '5511912345678', linkApp: 'https://app/#/servico/abc' });
  assert.match(t, /foi reagendado/);
  assert.doesNotMatch(t, /anterior/i);
  assert.match(t, /Nova data: Segunda-feira, 16 de novembro/);
  assert.match(t, /Novo horário: 07:00/);
  assert.doesNotMatch(t, /Telefone:|Endereço:/);
});

test('aviso ao técnico (cancelamento): serviços até 3, sem link do app', () => {
  const t = montarAvisoTecnico('cancelado', { tecnico: 'João', cliente: 'Maria', dataHora: quando, servicos: ['Limpeza', 'Carga de gás'], linkApp: 'https://app/#/servico/abc' });
  assert.match(t, /foi cancelado/);
  assert.match(t, /Serviços: Limpeza e Carga de gás/);
  assert.doesNotMatch(t, /https:\/\/app/);
});

test('link de conversa: só número válido', () => {
  assert.equal(linkConversaWhatsapp('(11) 91234-5678'), 'https://wa.me/5511912345678');
  assert.equal(linkConversaWhatsapp('123'), '');
});

test('destinatários: cliente + um técnico, cada um com a sua mensagem', () => {
  const d = montarDestinatarios({ tipo: 'agendado', empresa, linhas: [linha('a')], equipe, adminUid: 'adm', baseApp: 'https://app/' });
  assert.deepEqual(d.map((x) => x.id), ['cliente', 'tec:t1']);
  assert.match(d[0].link, /^https:\/\/wa\.me\/5511912345678\?text=/);
  assert.match(d[0].texto, /confirmado/);
  assert.match(d[1].link, /^https:\/\/wa\.me\/5511988887777\?text=/);
  assert.match(d[1].texto, /novo serviço agendado/);
  assert.ok(d[1].texto.includes('https://app/#/servico/a'));
});

test('destinatários: a mensagem do técnico traz o número do cliente escrito (para ligar)', () => {
  const d = montarDestinatarios({ tipo: 'agendado', empresa, linhas: [linha('a')], equipe, adminUid: 'adm' });
  assert.match(d[1].texto, /📞 Telefone: \(11\) 91234-5678/);
});

test('destinatários: o administrador não recebe aviso dele mesmo', () => {
  const d = montarDestinatarios({ tipo: 'agendado', empresa, linhas: [linha('a', { tecnicoUids: ['adm'], tecnicosNomes: ['Dono'] })], equipe, adminUid: 'adm' });
  assert.deepEqual(d.map((x) => x.id), ['cliente']);
});

test('destinatários: técnico sem WhatsApp aparece com o motivo; cliente sem WhatsApp não aparece', () => {
  const d = montarDestinatarios({ tipo: 'agendado', empresa, linhas: [linha('a', { clienteWhatsapp: '', tecnicoUids: ['t2'], tecnicosNomes: ['Pedro'] })], equipe, adminUid: 'adm' });
  assert.deepEqual(d.map((x) => x.id), ['tec:t2']);
  assert.equal(d[0].link, '');
  assert.equal(d[0].motivo, 'sem WhatsApp cadastrado');
});

test('destinatários: visita com 2 técnicos e vários serviços — cada técnico só vê os serviços dele', () => {
  const linhas = [
    linha('a', { tipoServicoNome: 'Limpeza', tecnicoUids: ['t1'], tecnicosNomes: ['João Silva'] }),
    linha('b', { tipoServicoNome: 'Carga de gás', tecnicoUids: ['t2'], tecnicosNomes: ['Pedro'] }),
    linha('c', { tipoServicoNome: 'Instalação', tecnicoUids: ['t1', 't2'], tecnicosNomes: ['João Silva', 'Pedro'] }),
  ];
  const eq = equipe.map((m) => (m.uid === 't2' ? { ...m, telefone: '(11) 95555-4444' } : m));
  const cancel = montarDestinatarios({ tipo: 'cancelado', empresa, linhas, equipe: eq, adminUid: 'adm', linkRemarcar: 'https://x/#/h' });
  assert.deepEqual(cancel.map((x) => x.id), ['cliente', 'tec:t1', 'tec:t2']);
  const joao = decodeURIComponent(cancel[1].link.split('text=')[1]);
  assert.match(joao, /Limpeza e Instalação/);
  assert.doesNotMatch(joao, /Carga de gás/);
  assert.match(decodeURIComponent(cancel[0].link.split('text=')[1]), /acesse: https:\/\/x\/#\/h/);
  assert.match(cancel[0].texto, /Limpeza, Carga de gás e Instalação/);
});

test('destinatários: mais de 3 serviços na visita deixa o aviso genérico', () => {
  const linhas = ['A', 'B', 'C', 'D'].map((n, i) => linha(`l${i}`, { tipoServicoNome: n }));
  const d = montarDestinatarios({ tipo: 'agendado', empresa, linhas, equipe, adminUid: 'adm' });
  assert.doesNotMatch(d[0].texto, /Serviços:/);
});

test('destinatários: reagendamento NÃO leva a data anterior ao técnico (Pacote 30)', () => {
  const d = montarDestinatarios({ tipo: 'reagendado', empresa, linhas: [linha('a')], equipe, adminUid: 'adm', anterior: antes, baseApp: 'https://app/' });
  assert.doesNotMatch(d[1].texto, /anterior/i);
  assert.match(d[1].texto, /Nova data/);
});
