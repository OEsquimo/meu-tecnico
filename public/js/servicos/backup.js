// =============================================================================
// BACKUP — gerar e restaurar o arquivo JSON da empresa
// =============================================================================
// Gerar: lê todas as coleções da empresa e monta o arquivo (dominio/backup.js).
// Restaurar: grava de volta SEM apagar nada que já existe. Registros com o mesmo
// id são atualizados; os novos são criados — respeitando o limite de clientes
// do plano (cliente novo precisa subir o contador, um por lote).
// =============================================================================

import { listar, gravar, operacao as op, ler, AGORA } from '../nucleo/banco.js';
import { invalidarCache } from '../nucleo/cache.js';
import { sessao, recarregarEmpresa, recarregarTipos } from '../nucleo/sessao.js';
import { podeCadastrarCliente } from '../dominio/planos.js';
import { montarBackup, serializarBackup } from '../dominio/backup.js';

const base = (empresaId) => `empresas/${empresaId}`;

/** Lê tudo da empresa e devolve { texto (JSON), backup (objeto), resumo }. */
export async function gerarBackup(empresaId, empresa) {
  const [tiposServico, clientes, aparelhos, servicos, valores, equipe] = await Promise.all([
    listar(`${base(empresaId)}/tiposServico`),
    listar(`${base(empresaId)}/clientes`),
    listar(`${base(empresaId)}/aparelhos`),
    listar(`${base(empresaId)}/servicos`),
    listar(`${base(empresaId)}/valores`),
    listar(`${base(empresaId)}/equipe`),
  ]);
  const backup = montarBackup({ empresa, tiposServico, clientes, aparelhos, servicos, valores, equipe });
  return {
    backup,
    texto: serializarBackup(backup),
    resumo: Object.fromEntries(Object.entries(backup.colecoes).map(([k, v]) => [k, v.length])),
  };
}

/** Grava uma lista de operações em lotes de 400, contando falhas sem parar tudo. */
async function gravarEmLotes(operacoes, resultado, chave) {
  for (let i = 0; i < operacoes.length; i += 200) {
    const pedaco = operacoes.slice(i, i + 200);
    try {
      await gravar(pedaco);
      resultado[chave] += pedaco.length;
    } catch (erro) {
      console.error(erro);
      resultado.falhas += pedaco.length;
    }
  }
}

/**
 * Restaura o backup já validado (resultado de lerBackup).
 * @param {(texto:string)=>void} aoProgresso mostra o andamento
 * @returns {Promise<{tipos, clientes, aparelhos, servicos, valores, ignoradosPorLimite, falhas}>}
 */
export async function restaurarBackup(empresaId, usuarioUid, backup, aoProgresso = () => {}) {
  const resultado = { tipos: 0, clientes: 0, aparelhos: 0, servicos: 0, valores: 0, ignoradosPorLimite: 0, falhas: 0 };
  const { colecoes } = backup;

  // 1. Tipos de serviço
  aoProgresso('Restaurando tipos de serviço…');
  await gravarEmLotes(
    colecoes.tiposServico.map(({ id, ...dados }) => op.definir(`${base(empresaId)}/tiposServico/${id}`, dados)),
    resultado, 'tipos',
  );

  // 2. Clientes (os novos sobem o contador; um por lote)
  aoProgresso('Restaurando clientes…');
  const atuais = await listar(`${base(empresaId)}/clientes`);
  const idsAtuais = new Set(atuais.map((c) => c.id));
  const clientesValidos = new Set(idsAtuais);

  const existentes = colecoes.clientes.filter((c) => idsAtuais.has(c.id));
  await gravarEmLotes(
    existentes.map(({ id, ...dados }) => op.definir(`${base(empresaId)}/clientes/${id}`, { ...dados, atualizadoEm: AGORA })),
    resultado, 'clientes',
  );

  const novos = colecoes.clientes.filter((c) => !idsAtuais.has(c.id));
  let empresa = await ler(base(empresaId));
  for (const { id, ...dados } of novos) {
    const permissao = podeCadastrarCliente(empresa, sessao.planos, sessao.regras);
    if (!permissao.ok) {
      resultado.ignoradosPorLimite += 1;
      continue;
    }
    try {
      await gravar([
        op.criar(`${base(empresaId)}/clientes/${id}`, { ...dados, criadoPor: usuarioUid, atualizadoEm: AGORA, criadoEm: dados.criadoEm ?? AGORA }),
        op.atualizar(base(empresaId), { contadorClientes: (empresa.contadorClientes ?? 0) + 1, ultimoClienteId: id }),
      ]);
      empresa = { ...empresa, contadorClientes: (empresa.contadorClientes ?? 0) + 1 };
      clientesValidos.add(id);
      resultado.clientes += 1;
    } catch (erro) {
      console.error(erro);
      resultado.falhas += 1;
    }
  }

  // 3. Aparelhos (só os de clientes que existem agora)
  aoProgresso('Restaurando aparelhos…');
  await gravarEmLotes(
    colecoes.aparelhos
      .filter((a) => clientesValidos.has(a.clienteId))
      .map(({ id, ...dados }) => op.definir(`${base(empresaId)}/aparelhos/${id}`, dados)),
    resultado, 'aparelhos',
  );

  // 4. Serviços (só de clientes que existem; técnico que não existe mais vira "sem técnico")
  aoProgresso('Restaurando serviços…');
  const equipe = await listar(`${base(empresaId)}/equipe`);
  const tecnicosValidos = new Set([usuarioUid, ...equipe.filter((m) => m.uid).map((m) => m.uid)]);
  const servicosValidos = colecoes.servicos.filter((s) =>
    clientesValidos.has(s.clienteId) && s.tipoServicoId && s.tipoServicoNome && s.dataAgendada instanceof Date);
  await gravarEmLotes(
    servicosValidos.map(({ id, ...dados }) => op.definir(`${base(empresaId)}/servicos/${id}`, {
      ...dados,
      tecnicoUid: tecnicoValido(dados.tecnicoUid, tecnicosValidos),
    })),
    resultado, 'servicos',
  );

  // 5. Valores (só dos serviços que foram restaurados)
  aoProgresso('Restaurando valores…');
  const idsServicos = new Set(servicosValidos.map((s) => s.id));
  await gravarEmLotes(
    colecoes.valores
      .filter((v) => idsServicos.has(v.id) && Number.isInteger(v.valorCentavos) && v.valorCentavos >= 0)
      .map(({ id, ...dados }) => op.definir(`${base(empresaId)}/valores/${id}`, { ...dados, tipoNome: dados.tipoNome || '' })),
    resultado, 'valores',
  );

  invalidarCache();
  await recarregarEmpresa();
  await recarregarTipos();
  return resultado;
}

function tecnicoValido(uid, validos) {
  return uid && validos.has(uid) ? uid : null;
}
