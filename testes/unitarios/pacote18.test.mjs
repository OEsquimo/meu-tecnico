// Pacote 18: editar os dados do administrador (nome, empresa, WhatsApp) e a linha do dia na escolha do cliente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarAdaptadorMemoria } from '../../public/js/nucleo/adaptador-memoria.js';
import { definirAdaptadorBanco, gravar, ler, operacao as op } from '../../public/js/nucleo/banco.js';
import { definirAdaptadorAuth } from '../../public/js/nucleo/autenticacao.js';
import { salvarDadosDoAdministrador } from '../../public/js/servicos/equipe.js';
import { validarAdministrador } from '../../public/js/dominio/validacoes.js';

test('validar administrador: nome da empresa é obrigatório quando o campo existe', () => {
  assert.equal(validarAdministrador({ nome: 'Marcos', telefone: '' }).valido, true, 'sem o campo (tela antiga) continua valendo');
  assert.equal(validarAdministrador({ nome: 'Marcos', telefone: '', nomeEmpresa: '' }).erros.nomeEmpresa !== undefined, true);
  assert.equal(validarAdministrador({ nome: 'Marcos', telefone: '', nomeEmpresa: 'x'.repeat(101) }).erros.nomeEmpresa !== undefined, true);
  const ok = validarAdministrador({ nome: ' Marcos ', telefone: '(81) 98325-9346', nomeEmpresa: '  O Esquimó ' });
  assert.equal(ok.valido, true);
  assert.equal(ok.dados.nomeEmpresa, 'O Esquimó');
  assert.equal(ok.dados.nome, 'Marcos');
  assert.equal(validarAdministrador({ nome: 'Marcos', telefone: '123', nomeEmpresa: 'Frio' }).erros.telefone !== undefined, true);
});

test('salvar dados do administrador grava o vínculo e a empresa (nome da empresa e nomeAdmin)', async () => {
  const memoria = criarAdaptadorMemoria();
  definirAdaptadorBanco(memoria.banco);
  definirAdaptadorAuth(memoria.auth);
  await gravar([
    op.definir('empresas/e1', { nome: 'Antigo', nomeAdmin: 'Antigo Admin', adminAtende: true }),
    op.definir('usuarios/u1', { empresaId: 'e1', papel: 'admin', nome: 'Antigo Admin' }),
  ]);
  await salvarDadosDoAdministrador('e1', 'u1', { nome: 'Well6', telefone: '5581983259346', atende: true, nomeEmpresa: 'O Esquimó' });
  const emp = await ler('empresas/e1');
  const usu = await ler('usuarios/u1');
  assert.equal(emp.nome, 'O Esquimó');
  assert.equal(emp.nomeAdmin, 'Well6');
  assert.equal(usu.nome, 'Well6');
  assert.equal(usu.telefone, '5581983259346');
  // sem nome da empresa (tela antiga): a empresa mantém o nome
  await salvarDadosDoAdministrador('e1', 'u1', { nome: 'Well7', telefone: '', atende: false });
  const emp2 = await ler('empresas/e1');
  assert.equal(emp2.nome, 'O Esquimó');
  assert.equal(emp2.nomeAdmin, 'Well7');
  assert.equal(emp2.adminAtende, false);
});
