// =============================================================================
// TESTES: link de horários para o cliente escolher dia e hora (dominio/link-horarios.js)
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  horariosLivresParaOLink, compactarDias, abrirDias, montarLinkDeHorarios, lerLinkDeHorarios, periodoDoHorario,
  validarPedidoDoCliente, mensagemDoLinkDeHorarios, linkDoPedidoNoApp, mensagemDoPedido, lerPedidoDaConsulta,
  enderecoBaseDoApp, DIAS_A_FRENTE,
} from '../../public/js/dominio/link-horarios.js';
import { expedientePadrao, regrasDeTrabalhoPadrao } from '../../public/js/dominio/expediente.js';

const em = (iso, hora) => { const [a, m, d] = iso.split('-').map(Number); const [h, mi] = hora.split(':').map(Number); return new Date(a, m - 1, d, h, mi); };
const SEG = '2031-04-14'; // segunda-feira
const A = { uid: 'a', nome: 'Ana' };
const R = regrasDeTrabalhoPadrao();
const cedo = em(SEG, '06:00');
const base = { expediente: expedientePadrao(), tecnicos: [A], agendados: [], regras: R, agora: cedo };

test('horários livres do link: 14 dias, domingo fechado fica de fora, almoço não aparece', () => {
  const dias = horariosLivresParaOLink(base);
  assert.equal(dias[0].iso, SEG);
  assert.equal(dias.length, DIAS_A_FRENTE - 2, '14 dias menos 2 domingos');
  assert.ok(!dias.some((d) => d.iso === '2031-04-20' && false));
  assert.ok(dias[0].horas.includes('07:00') && dias[0].horas.includes('11:00'));
  assert.ok(!dias[0].horas.includes('12:00') && !dias[0].horas.includes('12:30'), 'almoço bloqueia serviço de 1 hora');
  assert.ok(dias[0].horas.includes('13:00') && dias[0].horas.includes('17:30'));
});

test('dia lotado e horário ocupado não entram; serviço mais longo tem menos horários', () => {
  const ocupado = { status: 'agendado', agendamentoId: 'x', dataAgendada: em(SEG, '07:00'), duracaoMin: 240, ocupacaoMin: 240, tecnicoUid: 'a', tecnicoUids: ['a'], tecnicos: [{ uid: 'a' }] };
  const dias = horariosLivresParaOLink({ ...base, agendados: [ocupado] });
  assert.ok(!dias[0].horas.includes('07:00') && !dias[0].horas.includes('10:30'), 'ocupado até 11:00');
  assert.ok(dias[0].horas.includes('11:00'));
  const longo = horariosLivresParaOLink({ ...base, duracaoMin: 180 });
  assert.ok(longo[0].horas.length < horariosLivresParaOLink(base)[0].horas.length);
});

test('horários que já passaram não entram; sem técnico não há horário', () => {
  const tarde = horariosLivresParaOLink({ ...base, agora: em(SEG, '14:10') });
  assert.ok(!tarde[0].horas.includes('14:00') && tarde[0].horas.includes('14:30'));
  assert.deepEqual(horariosLivresParaOLink({ ...base, tecnicos: [] }), []);
});

test('compactar e abrir os dias devolve o mesmo (inclusive horários soltos)', () => {
  const dias = [{ iso: SEG, horas: ['07:00', '07:30', '09:00', '17:30'] }, { iso: '2031-04-16', horas: ['13:00'] }];
  const texto = compactarDias(dias, SEG);
  assert.match(texto, /^[0-9a-z_-]+$/, 'só letras e números: não precisa escapar no endereço');
  assert.deepEqual(abrirDias(texto, SEG), dias);
  assert.deepEqual(abrirDias('', SEG), []);
});

test('texto quebrado ou mexido não abre (nunca dá erro)', () => {
  for (const ruim of ['abc', '0_zz', '0_bo_', '0_bo_0', '!_y_z', '999_bo_ff', '0_zzzz_1', '0_bo_!!']) assert.equal(abrirDias(ruim, SEG), null, ruim);
  assert.equal(abrirDias('0_bo_1', 'data-ruim'), null);
});

test('o link cabe num WhatsApp: 12 dias de horários ficam curtos', () => {
  const dias = horariosLivresParaOLink(base);
  const link = montarLinkDeHorarios({ base: 'https://app.exemplo/', empresa: 'Frio Bom', whatsapp: '5581983259341', dias, geradoEm: SEG });
  assert.ok(link.length < 400, `tamanho ${link.length}`);
  assert.ok(link.startsWith('https://app.exemplo/#/horarios?'));
});

test('ler o link: horários, empresa, WhatsApp e serviço voltam como foram feitos', () => {
  const dias = horariosLivresParaOLink(base);
  const link = montarLinkDeHorarios({ base: 'https://app.exemplo/', empresa: 'Frio & Cia', whatsapp: '5581983259341', servico: 'Limpeza', dias, geradoEm: SEG });
  const consulta = new URLSearchParams(link.split('?')[1]);
  const r = lerLinkDeHorarios(consulta, cedo);
  assert.equal(r.valido, true);
  assert.equal(r.empresa, 'Frio & Cia');
  assert.equal(r.whatsapp, '5581983259341');
  assert.equal(r.servico, 'Limpeza');
  assert.deepEqual(r.dias, dias);
});

test('link vale por 7 dias; depois disso mostra "vencido"', () => {
  const dias = horariosLivresParaOLink(base);
  const consulta = new URLSearchParams(montarLinkDeHorarios({ base: '/', empresa: 'X', whatsapp: '5581983259341', dias, geradoEm: SEG }).split('?')[1]);
  assert.equal(lerLinkDeHorarios(consulta, em('2031-04-21', '08:00')).valido, true, 'no 7º dia ainda vale');
  const r = lerLinkDeHorarios(consulta, em('2031-04-22', '08:00'));
  assert.equal(r.valido, false);
  assert.equal(r.motivo, 'vencido');
});

test('link: horários do dia que já passaram somem; sem nenhum horário → "sem-horarios"', () => {
  const dias = [{ iso: SEG, horas: ['08:00', '09:00'] }];
  const consulta = new URLSearchParams(montarLinkDeHorarios({ base: '/', empresa: 'X', whatsapp: '5581983259341', dias, geradoEm: SEG }).split('?')[1]);
  assert.deepEqual(lerLinkDeHorarios(consulta, em(SEG, '08:30')).dias, [{ iso: SEG, horas: ['09:00'] }]);
  assert.equal(lerLinkDeHorarios(consulta, em(SEG, '09:30')).motivo, 'sem-horarios');
});

test('link incompleto, cortado ou sem empresa → "incompleto"', () => {
  for (const q of ['', 'e=X', 'e=X&g=2031-04-14', 'e=X&g=2031-04-14&p=lixo', 'g=2031-04-14&p=0_bo_1', 'e=X&g=nao-e-data&p=0_bo_1']) {
    const r = lerLinkDeHorarios(new URLSearchParams(q), cedo);
    assert.equal(r.valido, false, q);
    assert.equal(r.motivo, 'incompleto', q);
  }
});

test('período: manhã antes do meio-dia, tarde depois', () => {
  assert.equal(periodoDoHorario('07:00'), 'manha');
  assert.equal(periodoDoHorario('11:30'), 'manha');
  assert.equal(periodoDoHorario('12:00'), 'tarde');
  assert.equal(periodoDoHorario('17:30'), 'tarde');
});

test('pedido do cliente: nome obrigatório, WhatsApp opcional mas válido', () => {
  assert.equal(validarPedidoDoCliente({ nome: '', whatsapp: '' }).erros.nome, 'Digite o seu nome.');
  assert.equal(validarPedidoDoCliente({ nome: 'A', whatsapp: '' }).valido, false);
  const semZap = validarPedidoDoCliente({ nome: '  Maria   Souza ', whatsapp: '' });
  assert.equal(semZap.valido, true);
  assert.deepEqual(semZap.dados, { nome: 'Maria Souza', whatsapp: '' });
  assert.ok(validarPedidoDoCliente({ nome: 'Maria', whatsapp: '123' }).erros.whatsapp);
  assert.equal(validarPedidoDoCliente({ nome: 'Maria', whatsapp: '(81) 98325-9341' }).dados.whatsapp, '5581983259341');
});

test('mensagens: link do administrador e pedido do cliente com "Técnico: abrir no app"', () => {
  assert.match(mensagemDoLinkDeHorarios({ empresa: 'Frio Bom', link: 'https://x/#/horarios?e=1' }), /Frio Bom[\s\S]*https:\/\/x\/#\/horarios\?e=1/);
  const linkApp = linkDoPedidoNoApp('https://x/', { data: SEG, hora: '09:00', nome: 'Maria Souza', whatsapp: '5581983259341' });
  assert.equal(linkApp, 'https://x/#/agendar?data=2031-04-14&hora=09%3A00&pedido=1&nome=Maria+Souza&whatsapp=5581983259341');
  const msg = mensagemDoPedido({ empresa: 'Frio Bom', data: SEG, hora: '09:00', nome: 'Maria Souza', whatsapp: '5581983259341', servico: 'Limpeza', linkApp });
  assert.match(msg, /Segunda-feira, 14 de abril às 09:00/);
  assert.match(msg, /Maria Souza/);
  assert.match(msg, /\(81\) 98325-9341/);
  assert.match(msg, /Limpeza/);
  assert.match(msg, /Técnico: abrir no app\nhttps:\/\/x\//);
  assert.ok(!mensagemDoPedido({ empresa: 'F', data: SEG, hora: '09:00', nome: 'M', linkApp }).includes('📱'), 'sem WhatsApp, sem a linha');
});

test('ler o pedido no Agendar: só vale com pedido=1, data e hora certas', () => {
  const linkApp = linkDoPedidoNoApp('https://x/', { data: SEG, hora: '09:00', nome: 'Maria Souza', whatsapp: '5581983259341' });
  const consulta = new URLSearchParams(linkApp.split('?')[1]);
  assert.deepEqual(lerPedidoDaConsulta(consulta), { data: SEG, hora: '09:00', nome: 'Maria Souza', whatsapp: '5581983259341' });
  assert.equal(lerPedidoDaConsulta(new URLSearchParams('data=2031-04-14&hora=09:00')), null, 'sem pedido=1 é o fluxo normal');
  assert.equal(lerPedidoDaConsulta(new URLSearchParams('pedido=1&data=2031-02-31&hora=09:00')), null);
  assert.equal(lerPedidoDaConsulta(new URLSearchParams('pedido=1&data=2031-04-14&hora=25:00')), null);
  assert.deepEqual(lerPedidoDaConsulta(new URLSearchParams('pedido=1&data=2031-04-14&hora=09:00&whatsapp=1')), { data: SEG, hora: '09:00', nome: '', whatsapp: '' }, 'WhatsApp estragado é ignorado');
  assert.equal(lerPedidoDaConsulta(null), null);
});

test('endereço base do app: tira #, ? e index.html', () => {
  assert.equal(enderecoBaseDoApp('https://a.b/meu-tecnico/index.html?demo=1#/x'), 'https://a.b/meu-tecnico/');
  assert.equal(enderecoBaseDoApp('https://a.b/meu-tecnico'), 'https://a.b/meu-tecnico/');
});
