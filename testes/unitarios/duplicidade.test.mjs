// =============================================================================
// TESTES: cliente duplicado e agendamento duplicado
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { acharClientesParecidos, enderecosIguais, normalizarTextoDeEndereco, acharAgendamentoDuplicado, textoDoAvisoDeCliente } from '../../public/js/dominio/duplicidade.js';

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
const existente = { id: 's1', agendamentoId: 'a1', status: 'agendado', clienteId: 'c1', aparelhoId: 'ap1', tipoServicoId: 't1', dataAgendada: quando };

test('agendamento: mesmo cliente + aparelho + serviço + horário é duplicado', () => {
  const pares = [{ aparelhoId: 'ap1', tipoId: 't1' }];
  assert.equal(acharAgendamentoDuplicado({ clienteId: 'c1', inicio: new Date(quando), pares, agendados: [existente] }).id, 's1');
});

test('agendamento: serviço, aparelho, cliente, horário ou status diferentes não são duplicados', () => {
  const base = { clienteId: 'c1', inicio: new Date(quando), pares: [{ aparelhoId: 'ap1', tipoId: 't1' }], agendados: [existente] };
  assert.equal(acharAgendamentoDuplicado({ ...base, pares: [{ aparelhoId: 'ap1', tipoId: 't2' }] }), null);
  assert.equal(acharAgendamentoDuplicado({ ...base, pares: [{ aparelhoId: 'ap2', tipoId: 't1' }] }), null);
  assert.equal(acharAgendamentoDuplicado({ ...base, clienteId: 'c2' }), null);
  assert.equal(acharAgendamentoDuplicado({ ...base, inicio: new Date(2031, 3, 14, 10, 0) }), null);
  assert.equal(acharAgendamentoDuplicado({ ...base, agendados: [{ ...existente, status: 'cancelado' }] }), null);
  assert.equal(acharAgendamentoDuplicado({ ...base, pares: [{ aparelhoId: null, tipoId: '' }] }), null, 'linha "a definir" não conta');
});

test('agendamento: editar não conflita com ele mesmo', () => {
  const pares = [{ aparelhoId: 'ap1', tipoId: 't1' }];
  assert.equal(acharAgendamentoDuplicado({ clienteId: 'c1', inicio: new Date(quando), pares, agendados: [existente], ignorarAgendamento: 'a1' }), null);
});
