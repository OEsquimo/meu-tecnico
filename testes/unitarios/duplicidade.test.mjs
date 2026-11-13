// =============================================================================
// TESTES: cliente duplicado e regra "um aparelho, um agendamento aberto"
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { acharClientesParecidos, enderecosIguais, normalizarTextoDeEndereco, acharAparelhoComAgendamentoAberto, mensagemAparelhoOcupado, textoDoAvisoDeCliente } from '../../public/js/dominio/duplicidade.js';

const maria = { id: 'c1', nome: 'Maria', whatsapp: '5511912345678', enderecos: [{ rua: 'Rua das Flores', numero: '120', cidade: 'São Paulo', complemento: '' }] };
const joao = { id: 'c2', nome: 'João', whatsapp: '5521988887777', enderecos: [{ rua: 'Avenida Brasil', numero: '50', cidade: 'Rio de Janeiro' }] };

test('endereço: acento, maiúscula, pontuação e abreviação não atrapalham', () => {
  assert.equal(normalizarTextoDeEndereco('  AV. Antônio  Carlos '), 'avenida antonio carlos');
  assert.ok(enderecosIguais({ rua: 'R. das Flores', numero: '120', cidade: 'sao paulo' }, maria.enderecos[0]));
  assert.ok(!enderecosIguais({ rua: 'Rua das Flores', numero: '121', cidade: 'São Paulo' }, maria.enderecos[0]));
  assert.ok(!enderecosIguais({ rua: '', numero: '1' }, { rua: '', numero: '1' }), 'sem rua não compara');
  assert.ok(!enderecosIguais({ rua: 'Rua A', numero: '10', complemento: 'apto 1' }, { rua: 'Rua A', numero: '10', complemento: 'apto 2' }), 'apartamentos diferentes');
  assert.ok(enderecosIguais({ rua: 'Rua A', numero: 'S/N' }, { rua: 'rua a', numero: 'sn' }));
});

test('cliente: acha por WhatsApp, por endereço ou pelos dois', () => {
  const lista = [maria, joao];
  const so = acharClientesParecidos(lista, { whatsapp: '(11) 91234-5678', enderecos: [{ rua: 'Outra rua', numero: '1' }] });
  assert.deepEqual(so.map((a) => [a.cliente.id, a.motivos]), [['c1', ['whatsapp']]]);
  const end = acharClientesParecidos(lista, { whatsapp: '(31) 99999-0000', enderecos: [{ rua: 'av brasil', numero: '50', cidade: 'rio de janeiro' }] });
  assert.deepEqual(end.map((a) => [a.cliente.id, a.motivos]), [['c2', ['endereco']]]);
  const dois = acharClientesParecidos(lista, { whatsapp: '11912345678', enderecos: [{ rua: 'R. das Flores', numero: '120', cidade: 'São Paulo' }] });
  assert.deepEqual(dois[0].motivos, ['whatsapp', 'endereco']);
  assert.equal(acharClientesParecidos(lista, { whatsapp: '(31) 99999-0000', enderecos: [] }).length, 0);
});

test('cliente: ignora o próprio e os arquivados; WhatsApp inválido não casa', () => {
  assert.equal(acharClientesParecidos([maria], { whatsapp: '11912345678', enderecos: [] }, { ignorarId: 'c1' }).length, 0);
  assert.equal(acharClientesParecidos([{ ...maria, arquivado: true }], { whatsapp: '11912345678', enderecos: [] }).length, 0);
  assert.equal(acharClientesParecidos([{ ...maria, whatsapp: '' }], { whatsapp: '', enderecos: [] }).length, 0);
  assert.match(textoDoAvisoDeCliente(['whatsapp']), /WhatsApp/);
  assert.match(textoDoAvisoDeCliente(['endereco']), /endereço/);
  assert.match(textoDoAvisoDeCliente(['whatsapp', 'endereco']), /iguais/);
});

const quando = new Date(2031, 3, 14, 9, 0);
const aberta = { id: 's1', agendamentoId: 'a1', status: 'agendado', clienteId: 'c1', aparelhoId: 'ap1', tipoServicoId: 't1', dataAgendada: quando };

test('aparelho: com agendamento aberto não aceita outro (nem de outro serviço, nem em outro dia)', () => {
  assert.equal(acharAparelhoComAgendamentoAberto({ aparelhoIds: ['ap1'], abertas: [aberta] }).id, 's1');
  assert.equal(acharAparelhoComAgendamentoAberto({ aparelhoIds: ['ap9', 'ap1'], abertas: [{ ...aberta, tipoServicoId: 't2', dataAgendada: new Date(2031, 5, 1, 15, 0) }] }).id, 's1');
});

test('aparelho: outro aparelho, linha sem aparelho e serviço concluído ou cancelado não bloqueiam', () => {
  assert.equal(acharAparelhoComAgendamentoAberto({ aparelhoIds: ['ap2'], abertas: [aberta] }), null);
  assert.equal(acharAparelhoComAgendamentoAberto({ aparelhoIds: [null, ''], abertas: [aberta] }), null);
  assert.equal(acharAparelhoComAgendamentoAberto({ aparelhoIds: ['ap1'], abertas: [{ ...aberta, status: 'concluido' }] }), null);
  assert.equal(acharAparelhoComAgendamentoAberto({ aparelhoIds: ['ap1'], abertas: [{ ...aberta, status: 'cancelado' }] }), null);
});

test('aparelho: editar o próprio agendamento não conflita com ele mesmo; a mensagem diz o que fazer', () => {
  assert.equal(acharAparelhoComAgendamentoAberto({ aparelhoIds: ['ap1'], abertas: [aberta], ignorarAgendamento: 'a1' }), null);
  assert.match(mensagemAparelhoOcupado(aberta), /14\/04\/2031 às 09:00/);
  assert.match(mensagemAparelhoOcupado(aberta), /edite o agendamento que já existe/);
});
