// =============================================================================
// AJUDANTES DA TELA DE AGENDAMENTO (cartões de aparelho e de serviço)
// =============================================================================
// Este arquivo NÃO é uma tela (não está em rotas.js). Guarda o que é "conta":
//   * o estado do agendamento na tela (aparelhos -> serviços -> técnico);
//   * quais técnicos estão livres em cada serviço;
//   * a conversão entre o estado da tela e as linhas gravadas no banco;
//   * o rascunho que sobrevive a "Editar cliente"/"Novo aparelho" (ir e voltar).
// Nada aqui mexe no DOM nem no banco: é fácil de testar.
// =============================================================================

import { DURACAO_PADRAO_MIN } from '../nucleo/constantes.js';
import { tecnicoEstaLivre } from '../dominio/agenda.js';
import { combinarDataHora, ehISOValido, ehHoraValida } from '../dominio/datas.js';

let contador = 0;
/** Chave só da tela (para achar o cartão). Não vai para o banco. */
export const novaChave = () => { contador += 1; return `k${contador}`; };

/** Texto do retorno do tipo: "Retorno em 6 meses" / "Sem retorno". */
export function textoDoRetorno(tipo) {
  if (!tipo || tipo.geraRetorno !== true || !tipo.retornoPadraoMeses) return 'Sem retorno';
  const m = tipo.retornoPadraoMeses;
  return `Retorno em ${m} ${m === 1 ? 'mês' : 'meses'}`;
}

/** Duração de um serviço da tela, em minutos. */
export function duracaoDoTipo(tipo) {
  const n = Number(tipo?.duracaoMin);
  return Number.isFinite(n) && n > 0 ? n : DURACAO_PADRAO_MIN;
}

/**
 * Duração de um serviço da tela: a ajustada só para ele (duracaoMin) ou, se não
 * houver, a padrão do tipo.
 */
export function duracaoDoServicoNaTela(servico, tiposPorId) {
  const n = Number(servico.duracaoMin);
  return Number.isFinite(n) && n > 0 ? n : duracaoDoTipo(tiposPorId[servico.tipoId]);
}

/** Durações oferecidas ao ajustar um serviço (minutos). */
export const DURACOES_OFERECIDAS = [30, 45, 60, 90, 120, 150, 180, 240, 300, 360];

/** Texto "1h30" / "45 min" para mostrar a duração. */
export function textoDaDuracao(minutos) {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** Estado vazio de um agendamento novo. `obsAberta`: a observação do agendamento está aberta na tela? */
export function estadoInicial({ data, hora = '09:00', tecnicoUid = '' }) {
  return { cliente: null, enderecoId: '', data, hora, observacao: '', obsAberta: false, tecnicoUid, grupos: [] };
}

/** Cartão de aparelho (aparelhoId '' = serviços antigos sem aparelho). */
export const novoGrupo = (aparelhoId) => ({ chave: novaChave(), aparelhoId, obs: '', obsAberta: false, servicos: [] });
/** Cartão de serviço dentro do aparelho. `duracaoMin` null = padrão do tipo. */
export const novoServico = ({ id = null, tipoId, tecnicoUid = '', obs = '', duracaoMin = null }) => ({
  chave: novaChave(), id, tipoId, tecnicoUid, obs, duracaoMin, obsAberta: false,
});

/** Início do agendamento, ou null se dia/hora ainda não estão válidos. */
export function inicioDoEstado(estado) {
  if (!ehISOValido(estado.data) || !ehHoraValida(estado.hora)) return null;
  return combinarDataHora(estado.data, estado.hora);
}

/** Todos os cartões de serviço da tela, em ordem. */
export function todosOsServicos(estado) {
  return estado.grupos.flatMap((g) => g.servicos);
}

/** Minutos que o técnico já ocupa nesta visita (somando os serviços dele), sem contar `ignorarChave`. */
export function minutosDoTecnicoNaVisita(estado, tiposPorId, uid, ignorarChave = null) {
  return todosOsServicos(estado)
    .filter((s) => s.tecnicoUid === uid && s.chave !== ignorarChave)
    .reduce((soma, s) => soma + duracaoDoServicoNaTela(s, tiposPorId), 0);
}

/**
 * Técnicos livres para um serviço (só eles aparecem na lista).
 * `agendados`: serviços agendados no banco em volta do dia; `agendamentoId`: o que está sendo editado.
 * Mesmo técnico em vários serviços da visita é permitido: as durações se somam.
 */
export function tecnicosLivresParaServico({ estado, servico, tecnicos, tiposPorId, agendados, agendamentoId = null }) {
  const inicio = inicioDoEstado(estado);
  if (!inicio) return [];
  const minha = duracaoDoServicoNaTela(servico, tiposPorId);
  return tecnicos.filter((t) => tecnicoEstaLivre(t.uid, inicio, minutosDoTecnicoNaVisita(estado, tiposPorId, t.uid, servico.chave) + minha, agendados, agendamentoId));
}

/** Técnicos livres para o "técnico do agendamento" (quando ainda não há serviço). */
export function tecnicosLivresParaAgendamento({ estado, tecnicos, agendados, agendamentoId = null }) {
  const inicio = inicioDoEstado(estado);
  if (!inicio) return [];
  return tecnicos.filter((t) => tecnicoEstaLivre(t.uid, inicio, DURACAO_PADRAO_MIN, agendados, agendamentoId));
}

/**
 * Tira da tela quem ficou ocupado (depois de mudar dia/hora/serviços).
 * Devolve a quantidade de serviços que perderam o técnico (para avisar).
 */
export function limparTecnicosOcupados({ estado, tecnicos, tiposPorId, agendados, agendamentoId = null }) {
  let perdidos = 0;
  for (const s of todosOsServicos(estado)) {
    if (!s.tecnicoUid) continue;
    const livres = tecnicosLivresParaServico({ estado, servico: s, tecnicos, tiposPorId, agendados, agendamentoId });
    if (!livres.some((t) => t.uid === s.tecnicoUid)) { s.tecnicoUid = ''; perdidos += 1; }
  }
  if (estado.tecnicoUid) {
    const livres = tecnicosLivresParaAgendamento({ estado, tecnicos, agendados, agendamentoId });
    if (!livres.some((t) => t.uid === estado.tecnicoUid)) estado.tecnicoUid = '';
  }
  return perdidos;
}

/**
 * Escolhe um técnico livre para um serviço novo: o do agendamento (se livre),
 * senão o primeiro livre, senão '' (o app avisa e bloqueia o botão Agendar).
 */
export function tecnicoSugerido({ estado, servico, tecnicos, tiposPorId, agendados, agendamentoId = null }) {
  const livres = tecnicosLivresParaServico({ estado, servico, tecnicos, tiposPorId, agendados, agendamentoId });
  return (livres.find((t) => t.uid === estado.tecnicoUid) || livres[0])?.uid || '';
}

/**
 * O que impede de agendar agora? Lista de { texto, alvo } na ordem em que a tela
 * aparece. `alvo` diz para onde a tela deve rolar e colocar o cursor:
 *   { campo: 'clienteId' | 'data' | 'hora' | 'tecnicoUid' }  ou  { servico: chave } ou { grupo: chave }
 */
export function problemasDoAgendamento(estado, { tecnicos, tiposPorId, agendados, agendamentoId = null }) {
  const problemas = [];
  if (!estado.cliente) problemas.push({ texto: 'Escolha o cliente.', alvo: { campo: 'clienteId' } });
  if (!inicioDoEstado(estado)) {
    return [...problemas, { texto: 'Escolha o dia e a hora.', alvo: { campo: ehISOValido(estado.data) ? 'hora' : 'data' } }];
  }
  const servicos = todosOsServicos(estado);
  for (const g of estado.grupos.filter((x) => x.aparelhoId === '' && x.servicos.length === 0)) {
    problemas.push({ texto: 'Escolha o aparelho.', alvo: { grupo: g.chave } });
  }
  const gruposVazios = estado.grupos.filter((g) => g.servicos.length === 0).length;
  if (servicos.length === 0 || gruposVazios > 0) {
    const livres = tecnicosLivresParaAgendamento({ estado, tecnicos, agendados, agendamentoId });
    if (livres.length === 0) problemas.push({ texto: 'Nenhum técnico está livre nesse dia e horário. Escolha outro horário.', alvo: { campo: 'hora' } });
    else if (!estado.tecnicoUid) problemas.push({ texto: 'Escolha o técnico do agendamento.', alvo: { campo: 'tecnicoUid' } });
  }
  for (const s of servicos) {
    const livres = tecnicosLivresParaServico({ estado, servico: s, tecnicos, tiposPorId, agendados, agendamentoId });
    if (livres.length === 0) { problemas.push({ texto: 'Nenhum técnico está livre nesse dia e horário. Escolha outro horário.', alvo: { campo: 'hora' } }); break; }
    if (!s.tecnicoUid) { problemas.push({ texto: 'Escolha o técnico deste serviço.', alvo: { servico: s.chave } }); break; }
  }
  return problemas;
}

/** O que impede de agendar agora? Lista de textos (vazia = pode agendar). */
export function pendenciasDoAgendamento(estado, contexto) {
  return problemasDoAgendamento(estado, contexto).map((p) => p.texto);
}

/**
 * Converte o estado da tela nas linhas que o serviço de dados grava.
 * Aparelho sem serviço vira uma linha "Serviço a definir" daquele aparelho.
 */
export function montarLinhas(estado, { tiposPorId, aparelhosPorId, tecnicosPorUid }) {
  const tecnico = (uid) => (uid && tecnicosPorUid[uid]) || null;
  const linhas = [];
  for (const g of estado.grupos) {
    const aparelho = g.aparelhoId ? aparelhosPorId[g.aparelhoId] || null : null;
    if (g.servicos.length === 0) {
      linhas.push({ aparelho, tipo: null, tecnico: tecnico(estado.tecnicoUid), obsAparelho: g.obs, obsServico: '' });
      continue;
    }
    for (const s of g.servicos) {
      const tipo = tiposPorId[s.tipoId];
      linhas.push({ id: s.id || undefined, aparelho, tipo, tecnico: tecnico(s.tecnicoUid), duracaoMin: duracaoDoServicoNaTela(s, tiposPorId), obsAparelho: g.obs, obsServico: s.obs });
    }
  }
  return linhas;
}

/**
 * Monta o estado da tela a partir das linhas gravadas (editar agendamento).
 * Só as linhas ainda agendadas entram; concluídas/canceladas ficam como estão.
 */
export function estadoDeLinhas(linhas, { cliente, data, hora, tipoExiste = () => true }) {
  const abertas = linhas.filter((l) => l.status === 'agendado');
  const estado = estadoInicial({ data, hora });
  estado.cliente = cliente;
  estado.observacao = abertas[0]?.obsAgendamento || '';
  estado.obsAberta = estado.observacao.length > 0;
  estado.tecnicoUid = abertas[0]?.tecnicoUid || '';
  estado.enderecoId = abertas[0]?.enderecoId || '';
  const porAparelho = new Map();
  for (const l of abertas) {
    const chave = l.aparelhoId || '';
    if (!l.aparelhoId && !l.tipoServicoId) continue; // linha "a definir" sem aparelho: só guarda o técnico
    if (!porAparelho.has(chave)) {
      const g = novoGrupo(chave);
      g.obs = l.obsAparelho || '';
      g.obsAberta = g.obs.length > 0;
      porAparelho.set(chave, g);
      estado.grupos.push(g);
    }
    if (l.tipoServicoId && tipoExiste(l.tipoServicoId)) {
      const obs = l.obsServico || l.descricao || '';
      const servico = novoServico({
        id: l.id, tipoId: l.tipoServicoId, tecnicoUid: l.tecnicoUid || '', obs, duracaoMin: Number(l.duracaoMin) > 0 ? Number(l.duracaoMin) : null,
      });
      servico.obsAberta = obs.length > 0;
      porAparelho.get(chave).servicos.push(servico);
    }
  }
  return estado;
}

// -----------------------------------------------------------------------------
// RASCUNHO (para "Editar cliente", "Editar aparelho" e "Novo aparelho")
// -----------------------------------------------------------------------------
// Essas telas ficam fora de /agendar. Para o administrador não perder o que já
// preencheu, o estado fica guardado na memória até a tela voltar (só 1 vez).
// -----------------------------------------------------------------------------

let guardado = null;

/** Guarda o estado antes de sair para outra tela. */
export function guardarRascunho(estado, extras = {}) {
  guardado = { estado, extras, em: Date.now() };
}

/** Devolve o rascunho (uma única vez, e só se tiver menos de 30 minutos). */
export function pegarRascunho() {
  const r = guardado;
  guardado = null;
  if (!r || Date.now() - r.em > 30 * 60 * 1000) return null;
  return r;
}

/** Descarta qualquer rascunho (depois de salvar, por exemplo). */
export function descartarRascunho() {
  guardado = null;
}
