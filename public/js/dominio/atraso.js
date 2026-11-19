// =============================================================================
// ATRASO DO TÉCNICO — o sistema se ajusta quando um serviço passa do tempo (funções puras)
// =============================================================================
// Se um técnico ainda está num serviço que já devia ter acabado e o PRÓXIMO agendamento dele começa logo:
//   1) o próximo agendamento passa para outro técnico livre (o de menos serviço no dia);
//   2) se ninguém está livre, o próximo agendamento fica ATRASADO (`atrasoPorTecnico`), para o
//      administrador avisar o cliente do atraso e decidir se reagenda.
// Só "olha para a frente" um agendamento por técnico em cada conferência; a conferência roda quando o
// app é aberto (não existe um robô rodando sozinho sem o Firebase de verdade). O TÉCNICO que abre o app só
// marca o atraso dele; o ADMINISTRADOR, ao abrir o Início, também troca o técnico quando há alguém livre.
// =============================================================================

import { STATUS, tecnicosDoServico, nomesDosTecnicos, chaveDoAgendamento } from './servicos.js';
import { fimDoServico, motivoDeIndisponibilidade } from './agenda.js';
import { escolherTecnicoEquilibrado } from './disponibilidade.js';
import { paraISO } from './datas.js';

/** Depois do fim previsto do serviço, esperar um pouco antes de considerar que o técnico está atrasado. */
export const TOLERANCIA_ATRASO_MIN = 10;
/** O próximo agendamento só é ajustado quando começa dentro deste prazo (antes disso o técnico ainda pode chegar). */
export const ANTECEDENCIA_AJUSTE_MIN = 30;

const MIN = 60000;

/** Visitas ABERTAS (agendadas) de um técnico, em ordem de horário: [{ chave, linhas, inicio, fim }]. */
function visitasDoTecnico(uid, agendados) {
  const mapa = new Map();
  for (const s of agendados) {
    if (s.status !== STATUS.AGENDADO || !(s.dataAgendada instanceof Date) || !tecnicosDoServico(s).includes(uid)) continue;
    const chave = chaveDoAgendamento(s);
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(s);
  }
  return [...mapa].map(([chave, linhas]) => ({
    chave, linhas,
    inicio: linhas[0].dataAgendada,
    fim: new Date(Math.max(...linhas.map((l) => fimDoServico(l, uid).getTime()))),
  })).sort((a, b) => a.inicio - b.inicio);
}

/** O técnico está numa visita que já devia ter acabado (passou do fim + tolerância e não foi concluída)? */
export function visitaEmAtraso(uid, agendados, agora) {
  return visitasDoTecnico(uid, agendados).find((v) => v.inicio.getTime() <= agora.getTime()
    && agora.getTime() > v.fim.getTime() + TOLERANCIA_ATRASO_MIN * MIN) || null;
}

/**
 * Planeja os ajustes. Devolve uma lista de ações, na ordem em que devem ser aplicadas:
 *   { tipo: 'reatribuir', chave, linhaIds, de: {uid,nome}, para: {uid,nome}, motivoNome }
 *   { tipo: 'atrasar',    chave, linhaIds, tecnico: {uid,nome} }
 * @param {object[]} agendados linhas agendadas do dia (qualquer técnico)
 * @param {Array<{uid,nome}>} tecnicos técnicos que atendem
 * @param {boolean} soMarcar quando o app é aberto por um TÉCNICO: ele só vê os próprios serviços, então
 *   apenas MARCA o próximo agendamento dele como atrasado (nunca troca de técnico). O administrador, ao
 *   abrir o Início, troca o técnico dos agendamentos marcados se houver alguém livre.
 */
export function planejarAjustesDeAtraso({ agendados, tecnicos, regras = null, agora = new Date(), soMarcar = false }) {
  const acoes = [];
  let atual = agendados.map((l) => ({ ...l }));
  const iso = paraISO(agora);
  for (const t of tecnicos) {
    const emAtraso = visitaEmAtraso(t.uid, atual, agora);
    if (!emAtraso) continue;
    const proxima = visitasDoTecnico(t.uid, atual).find((v) => v.chave !== emAtraso.chave
      && v.inicio.getTime() >= emAtraso.inicio.getTime()
      && paraISO(v.inicio) === iso
      && v.inicio.getTime() <= agora.getTime() + ANTECEDENCIA_AJUSTE_MIN * MIN);
    if (!proxima) continue;
    const jaMarcada = proxima.linhas.every((l) => l.atrasoPorTecnico === true);
    if (soMarcar && jaMarcada) continue;
    const doTecnico = proxima.linhas.filter((l) => tecnicosDoServico(l).includes(t.uid));
    if (soMarcar) {
      const linhaIds = doTecnico.map((l) => l.id);
      acoes.push({ tipo: 'atrasar', chave: proxima.chave, linhaIds, tecnico: { uid: t.uid, nome: t.nome } });
      atual = atual.map((l) => (linhaIds.includes(l.id) ? { ...l, atrasoPorTecnico: true } : l));
      continue;
    }
    const janela = Math.max(...proxima.linhas.map((l) => (fimDoServico(l, t.uid).getTime() - l.dataAgendada.getTime()) / MIN));
    const jaNaVisita = new Set(proxima.linhas.flatMap(tecnicosDoServico));
    const livres = tecnicos.filter((c) => !jaNaVisita.has(c.uid)
      && !visitaEmAtraso(c.uid, atual, agora)
      && motivoDeIndisponibilidade(c.uid, proxima.inicio, janela, atual, proxima.chave, regras) === '');
    const escolhido = escolherTecnicoEquilibrado({ livres, agendados: atual, iso });
    const linhaIds = doTecnico.map((l) => l.id);
    if (escolhido) {
      acoes.push({ tipo: 'reatribuir', chave: proxima.chave, linhaIds, de: { uid: t.uid, nome: t.nome }, para: { uid: escolhido.uid, nome: escolhido.nome }, motivoNome: t.nome });
      atual = atual.map((l) => (linhaIds.includes(l.id) ? trocarTecnico(l, t.uid, escolhido) : l));
    } else if (!jaMarcada) {
      acoes.push({ tipo: 'atrasar', chave: proxima.chave, linhaIds, tecnico: { uid: t.uid, nome: t.nome } });
      atual = atual.map((l) => (linhaIds.includes(l.id) ? { ...l, atrasoPorTecnico: true } : l));
    }
  }
  return acoes;
}

/** A linha com `de` trocado por `para` (os outros técnicos continuam; sem repetir). */
export function trocarTecnico(linha, deUid, para) {
  const uids = tecnicosDoServico(linha);
  const nomes = nomesDosTecnicos(linha);
  const novos = [];
  uids.forEach((uid, i) => {
    const t = uid === deUid ? { uid: para.uid, nome: para.nome } : { uid, nome: nomes[i] || '' };
    if (!novos.some((x) => x.uid === t.uid)) novos.push(t);
  });
  const porTecnico = {};
  const antigo = linha.ocupacaoPorTecnico || {};
  for (const t of novos) porTecnico[t.uid] = Number(antigo[t.uid === para.uid ? deUid : t.uid]) || Number(linha.ocupacaoMin) || Number(linha.duracaoMin) || 0;
  return {
    ...linha,
    tecnicoUid: novos[0].uid, tecnicoNome: novos[0].nome,
    tecnicoUids: novos.map((t) => t.uid), tecnicosNomes: novos.map((t) => t.nome),
    ocupacaoPorTecnico: porTecnico,
  };
}
