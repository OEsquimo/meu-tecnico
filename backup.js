// =============================================================================
// BACKUP EM JSON — montar, serializar e validar o arquivo (funções puras)
// =============================================================================
// O arquivo é um "retrato" dos dados da empresa. Serve para:
//   * ter uma cópia de segurança fora do Firebase;
//   * portabilidade de dados (LGPD): o titular leva os dados embora;
//   * restaurar em outra conta.
// NÃO entram: valores só são exportados para o administrador (quem gera o
// backup), e nunca logins/senhas de funcionários.
//
// Datas viram {"$data": "2026-10-17T12:00:00.000Z"} no JSON e voltam a ser Date.
// =============================================================================

import { VERSAO_BACKUP } from '../nucleo/constantes.js';

export const FORMATO_BACKUP = 'meu-tecnico-backup';

/** Campos que cada coleção aceita (iguais aos permitidos em firestore.rules). */
export const CAMPOS_PERMITIDOS = {
  tiposServico: ['nome', 'geraRetorno', 'retornoPadraoMeses', 'duracaoMin', 'ativo', 'ordem'],
  clientes: ['nome', 'whatsapp', 'observacoes', 'enderecos', 'criadoEm', 'atualizadoEm', 'criadoPor'],
  aparelhos: ['clienteId', 'enderecoId', 'tipo', 'btus', 'nome', 'descricao', 'ativo', 'criadoEm', 'atualizadoEm'],
  servicos: [
    'clienteId', 'clienteNome', 'clienteWhatsapp', 'local', 'localLat', 'localLng', 'enderecoId', 'aparelhoId',
    'aparelhoResumo', 'tipoServicoId', 'tipoServicoNome', 'geraRetorno', 'status', 'dataAgendada', 'tecnicoUid',
    'tecnicoNome', 'descricao', 'pago', 'valorDefinido', 'dataConclusao', 'retornoMeses', 'dataRetorno',
    'retornoSituacao', 'ultimoAvisoEm', 'garantiaAte', 'concluidoPorNome', 'origemRetornoId', 'criadoEm', 'atualizadoEm',
    'agendamentoId', 'obsAgendamento', 'obsAparelho', 'obsServico', 'duracaoMin', 'ocupacaoMin', 'ordem',
  ],
  valores: ['valorCentavos', 'tipoNome', 'dataConclusao', 'atualizadoEm'],
};

export const COLECOES_DO_BACKUP = Object.keys(CAMPOS_PERMITIDOS);

/** Date -> {"$data": ...} (e o contrário ao ler). */
function paraJson(chave, valor) {
  // JSON.stringify chama toJSON() antes do replacer, então Date já chega como texto:
  // por isso lemos o valor original em this[chave].
  const original = this[chave];
  if (original instanceof Date) return { $data: original.toISOString() };
  return valor;
}

function deJson(chave, valor) {
  if (valor && typeof valor === 'object' && !Array.isArray(valor) && Object.keys(valor).length === 1
    && typeof valor.$data === 'string') {
    const d = new Date(valor.$data);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return valor;
}

/** Deixa só os campos permitidos de um documento. */
export function filtrarCampos(colecao, doc) {
  const permitidos = CAMPOS_PERMITIDOS[colecao];
  const saida = {};
  for (const campo of permitidos) {
    if (doc[campo] !== undefined) saida[campo] = doc[campo];
  }
  return saida;
}

/**
 * Monta o objeto do backup.
 * @param {object} dados { empresa, tiposServico, clientes, aparelhos, servicos, valores, equipe }
 * Cada lista tem itens { id, ...campos }.
 */
export function montarBackup(dados, agora = new Date()) {
  const colecoes = {};
  for (const nome of COLECOES_DO_BACKUP) {
    colecoes[nome] = (dados[nome] || []).map((d) => ({ id: d.id, ...filtrarCampos(nome, d) }));
  }
  return {
    formato: FORMATO_BACKUP,
    versao: VERSAO_BACKUP,
    exportadoEm: agora,
    empresa: dados.empresa
      ? { nome: dados.empresa.nome, diasAvisoRetorno: dados.empresa.diasAvisoRetorno, mensagemWhatsapp: dados.empresa.mensagemWhatsapp }
      : null,
    // Só informativo: nome/telefone/situação da equipe (não é restaurado, pois depende de logins).
    equipe: (dados.equipe || []).map((m) => ({ nome: m.nome, telefone: m.telefone, status: m.status })),
    colecoes,
  };
}

/** Objeto -> texto JSON (com datas preservadas). */
export function serializarBackup(backup) {
  return JSON.stringify(backup, paraJson, 2);
}

/** Nome sugerido do arquivo: meu-tecnico-backup-2026-10-17.json */
export function nomeDoArquivoDeBackup(agora = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `meu-tecnico-backup-${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}.json`;
}

/**
 * Lê e VALIDA o texto de um arquivo de backup.
 * Retorna { ok: true, backup, resumo } ou { ok: false, erro: 'mensagem em português' }.
 * Nada é gravado aqui: só conferimos se o arquivo é confiável.
 */
export function lerBackup(textoJson) {
  let bruto;
  try {
    bruto = JSON.parse(textoJson, deJson);
  } catch {
    return { ok: false, erro: 'Este arquivo não é um backup válido (não foi possível ler o conteúdo).' };
  }
  if (!bruto || typeof bruto !== 'object' || bruto.formato !== FORMATO_BACKUP) {
    return { ok: false, erro: 'Este arquivo não é um backup do Meu Técnico.' };
  }
  if (bruto.versao !== VERSAO_BACKUP) {
    return { ok: false, erro: `Versão do backup (${bruto.versao}) não é suportada por este app.` };
  }
  if (!bruto.colecoes || typeof bruto.colecoes !== 'object') {
    return { ok: false, erro: 'O backup está incompleto (faltam os dados).' };
  }

  const colecoes = {};
  const resumo = {};
  for (const nome of COLECOES_DO_BACKUP) {
    const lista = bruto.colecoes[nome] ?? [];
    if (!Array.isArray(lista)) return { ok: false, erro: `O backup está corrompido na seção "${nome}".` };
    const ids = new Set();
    colecoes[nome] = [];
    for (const item of lista) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id)) {
        return { ok: false, erro: `O backup está corrompido: há um registro sem identificação em "${nome}".` };
      }
      if (ids.has(item.id)) return { ok: false, erro: `O backup tem registros repetidos em "${nome}".` };
      ids.add(item.id);
      colecoes[nome].push({ id: item.id, ...filtrarCampos(nome, item) });
    }
    resumo[nome] = colecoes[nome].length;
  }

  // Cada cliente precisa ter nome (o resto o app valida ao gravar).
  for (const c of colecoes.clientes) {
    if (typeof c.nome !== 'string' || !c.nome.trim()) {
      return { ok: false, erro: 'O backup está corrompido: há cliente sem nome.' };
    }
    if (!Array.isArray(c.enderecos)) c.enderecos = [];
    if (typeof c.whatsapp !== 'string') c.whatsapp = '';
  }
  for (const s of colecoes.servicos) {
    if (!['agendado', 'concluido', 'cancelado'].includes(s.status)) {
      return { ok: false, erro: 'O backup está corrompido: há serviço com situação desconhecida.' };
    }
  }

  return {
    ok: true,
    backup: { formato: bruto.formato, versao: bruto.versao, exportadoEm: bruto.exportadoEm, empresa: bruto.empresa || null, colecoes },
    resumo,
  };
}
