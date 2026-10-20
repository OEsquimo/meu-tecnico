// =============================================================================
// EQUIPE — CRUD de funcionários (técnicos) e convites
// =============================================================================
// Como um técnico entra na empresa:
//   1. o administrador cadastra nome + WhatsApp do funcionário -> nasce um
//      CONVITE (empresas/{id}/equipe/{conviteId}, situação "convite");
//   2. o app gera um link e abre o WhatsApp com a mensagem pronta;
//   3. o técnico abre o link, cria o próprio login e aceita o convite;
//   4. o convite vira "ativo" e passa a existir usuarios/{uid} com papel "tecnico".
// Situações: convite -> ativo <-> bloqueado. "Remover" apaga o vínculo, mas o
// histórico de serviços fica (o nome do técnico é copiado para dentro do serviço).
// =============================================================================

import { ler, listar, gravar, operacao as op, novoId, AGORA } from '../nucleo/banco.js';
import { comCache, invalidarCache } from '../nucleo/cache.js';
import { ErroApp } from '../nucleo/erros.js';
import { linkWhatsapp } from '../dominio/whatsapp.js';
import { somenteDigitos } from '../dominio/telefone.js';

const caminhoEquipe = (empresaId) => `empresas/${empresaId}/equipe`;

/** Lista a equipe ordenada por nome. */
export function listarEquipe(empresaId) {
  return comCache(`${empresaId}:equipe`, async () => {
    const lista = await listar(caminhoEquipe(empresaId));
    return lista.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  });
}

export function buscarMembro(empresaId, id) {
  return ler(`${caminhoEquipe(empresaId)}/${id}`);
}

/** Técnicos que podem receber serviço: o próprio administrador + funcionários ativos. */
export async function tecnicosParaAtribuir(empresaId, administrador) {
  const equipe = await listarEquipe(empresaId);
  const lista = [{ uid: administrador.uid, nome: administrador.nome ? `${administrador.nome} (eu)` : 'Eu mesmo' }];
  for (const m of equipe) {
    if (m.status === 'ativo' && m.uid) lista.push({ uid: m.uid, nome: m.nome });
  }
  return lista;
}

/** Cria o convite. Retorna o id (que vai no link). */
export async function criarConvite(empresaId, { nome, telefone }) {
  const id = novoId(caminhoEquipe(empresaId));
  await gravar([op.criar(`${caminhoEquipe(empresaId)}/${id}`, { nome, telefone, status: 'convite', uid: null, criadoEm: AGORA })]);
  invalidarCache(`${empresaId}:equipe`);
  return id;
}

/** Link que o técnico abre. "origem" = endereço do app (ex.: https://meu-app.web.app/). */
export function linkDoConvite(empresaId, equipeId, origem) {
  const base = String(origem).replace(/#.*$/, '').replace(/index\.html$/, '').replace(/\?.*$/, '');
  return `${base.endsWith('/') ? base : `${base}/`}#/convite/${empresaId}/${equipeId}`;
}

/** Mensagem pronta para mandar o convite pelo WhatsApp. */
export function mensagemDoConvite({ nomeFuncionario, nomeEmpresa, link }) {
  return `Olá, ${nomeFuncionario}! Você foi convidado(a) para a equipe da ${nomeEmpresa} no aplicativo Meu Técnico. ` +
    `Toque no link, crie sua senha e comece a usar: ${link}`;
}

/** Link do WhatsApp com o convite (ou null se o telefone for inválido). */
export function linkWhatsappDoConvite(telefone, texto) {
  const numero = somenteDigitos(telefone);
  return numero ? linkWhatsapp(numero.startsWith('55') ? numero : `55${numero}`, texto) : null;
}

/** Lê um convite pelo link (qualquer pessoa logada que tenha o código consegue). */
export async function lerConvite(empresaId, equipeId) {
  const convite = await ler(`${caminhoEquipe(empresaId)}/${equipeId}`);
  if (!convite || convite.status !== 'convite') return null;
  return convite;
}

/**
 * Aceita o convite: cria o vínculo do técnico e marca o convite como "ativo".
 * Tudo num lote só (ou entra tudo, ou nada).
 */
export async function aceitarConvite({ empresaId, equipeId, nome, uid }) {
  const convite = await lerConvite(empresaId, equipeId);
  if (!convite) {
    throw new ErroApp('Este convite não vale mais (já foi usado ou foi cancelado). Peça um novo ao administrador.', 'convite-invalido');
  }
  await gravar([
    op.criar(`usuarios/${uid}`, { empresaId, papel: 'tecnico', ativo: true, nome: nome || convite.nome, equipeId, criadoEm: AGORA }),
    op.atualizar(`${caminhoEquipe(empresaId)}/${equipeId}`, { uid, status: 'ativo' }),
  ]);
  invalidarCache(`${empresaId}:equipe`);
}

/** Edita nome e telefone (e o nome no vínculo, se o técnico já entrou). */
export async function editarFuncionario(empresaId, membro, { nome, telefone }) {
  const operacoes = [op.atualizar(`${caminhoEquipe(empresaId)}/${membro.id}`, { nome, telefone, status: membro.status })];
  if (membro.uid) operacoes.push(op.atualizar(`usuarios/${membro.uid}`, { nome, ativo: membro.status !== 'bloqueado' }));
  await gravar(operacoes);
  invalidarCache(`${empresaId}:equipe`);
}

/** Bloqueia (true) ou reativa (false) o acesso do técnico. Os dados dele ficam guardados. */
export async function alterarBloqueio(empresaId, membro, bloquear) {
  if (!membro.uid) throw new ErroApp('Este funcionário ainda não entrou no app, então não há o que bloquear. Cancele o convite se quiser.', 'sem-uid');
  await gravar([
    op.atualizar(`${caminhoEquipe(empresaId)}/${membro.id}`, { nome: membro.nome, telefone: membro.telefone, status: bloquear ? 'bloqueado' : 'ativo' }),
    op.atualizar(`usuarios/${membro.uid}`, { nome: membro.nome, ativo: !bloquear }),
  ]);
  invalidarCache(`${empresaId}:equipe`);
}

/** Remove o funcionário da equipe (ou cancela um convite). O histórico de serviços continua. */
export async function removerFuncionario(empresaId, membro) {
  const operacoes = [op.apagar(`${caminhoEquipe(empresaId)}/${membro.id}`)];
  if (membro.uid) operacoes.push(op.apagar(`usuarios/${membro.uid}`));
  await gravar(operacoes);
  invalidarCache(`${empresaId}:equipe`);
}
