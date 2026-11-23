// =============================================================================
// DESEMPENHO — números por técnico e por tipo de serviço (funções puras)
// =============================================================================
// Entrada: serviços CONCLUÍDOS do período (linhas), a lista de técnicos e a pausa de almoço.
// Só entram nas médias os serviços com início e conclusão informados, com no máximo 12 h.
// Deslocamento = tempo entre concluir uma visita e iniciar a próxima, no mesmo dia, descontando o almoço.
// O primeiro serviço do dia não tem deslocamento.
// =============================================================================

import { STATUS, tecnicosDoServico, chaveDoAgendamento, duracaoDoServico } from './servicos.js';
import { paraISO, combinarDataHora } from './datas.js';
import {
  tempoNoCliente, sequenciarLinhasDaVisita, TOLERANCIA_ESPERANDO_MIN, DESLOCAMENTO_MAXIMO_MIN, MINIMO_PARA_COMPARAR,
  situacaoDaVisita, horarioConferido,
} from './tempo-servico.js';

const MIN = 60000;

function media(lista) {
  return lista.length ? Math.round(lista.reduce((a, b) => a + b, 0) / lista.length) : null;
}

/** Minutos da pausa de almoço que caem dentro de [de, ate] (0 se o almoço estiver desligado). */
export function minutosDeAlmocoEntre(de, ate, almoco) {
  if (!almoco?.ativo || ate.getTime() <= de.getTime()) return 0;
  const dia = paraISO(de);
  if (paraISO(ate) !== dia) return 0;
  const ini = combinarDataHora(dia, almoco.de);
  const fim = combinarDataHora(dia, almoco.ate);
  const a = Math.max(de.getTime(), ini.getTime());
  const b = Math.min(ate.getTime(), fim.getTime());
  return b > a ? Math.round((b - a) / MIN) : 0;
}

/**
 * Horários informados (Pacote 29): de quantos serviços concluídos o técnico informou/conferiu os horários.
 * Só entram na conta os serviços a que isso se aplica (com horários ou marcados como não conferidos).
 * @returns {{ horariosInformados: number, horariosAplicaveis: number, naoConferidos: number }}
 */
export function contagemDeHorarios(linhas) {
  let informados = 0;
  let aplicaveis = 0;
  for (const l of linhas) {
    if (l.status !== STATUS.CONCLUIDO) continue;
    const c = horarioConferido(l);
    if (c === null) continue;
    aplicaveis += 1;
    if (c) informados += 1;
  }
  return { horariosInformados: informados, horariosAplicaveis: aplicaveis, naoConferidos: aplicaveis - informados };
}

/** Este serviço teve atraso? (motivo informado, "ainda estou no serviço" ou passou do previsto + tolerância) */
export function teveAtraso(servico) {
  if (servico.atrasoMotivo || servico.atrasoInformadoEm) return true;
  const tempo = tempoNoCliente(servico);
  return tempo !== null && tempo > duracaoDoServico(servico) + TOLERANCIA_ESPERANDO_MIN;
}

/** Visitas concluídas de um técnico: [{ chave, linhas (sequenciadas), inicio, fim }] com início e fim informados. */
function visitasDoTecnico(uid, concluidos) {
  const mapa = new Map();
  for (const l of concluidos) {
    if (l.status !== STATUS.CONCLUIDO || !tecnicosDoServico(l).includes(uid)) continue;
    const chave = chaveDoAgendamento(l);
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(l);
  }
  const visitas = [];
  for (const [chave, lista] of mapa) {
    // Linhas com horário só sugerido ("não conferido") não entram no deslocamento.
    const linhas = sequenciarLinhasDaVisita(lista.filter((l) => horarioConferido(l) !== false));
    const inicios = linhas.map((l) => l.iniciadoEm?.getTime?.()).filter(Number.isFinite);
    const fins = linhas.map((l) => l.dataConclusao?.getTime?.()).filter(Number.isFinite);
    if (inicios.length === 0 || fins.length === 0) continue;
    visitas.push({ chave, linhas, inicio: new Date(Math.min(...inicios)), fim: new Date(Math.max(...fins)) });
  }
  return visitas.sort((a, b) => a.inicio - b.inicio);
}

/** Deslocamentos (minutos) de um técnico: entre o fim de uma visita e o início da seguinte, no mesmo dia. */
export function deslocamentosDoTecnico(uid, concluidos, almoco = null) {
  const visitas = visitasDoTecnico(uid, concluidos);
  const lista = [];
  for (let i = 1; i < visitas.length; i += 1) {
    const anterior = visitas[i - 1];
    const atual = visitas[i];
    if (paraISO(anterior.fim) !== paraISO(atual.inicio)) continue; // o primeiro do dia não tem deslocamento
    if (atual.inicio.getTime() <= anterior.fim.getTime()) continue;
    const bruto = Math.round((atual.inicio.getTime() - anterior.fim.getTime()) / MIN);
    const liquido = bruto - minutosDeAlmocoEntre(anterior.fim, atual.inicio, almoco);
    if (liquido > 0 && liquido <= DESLOCAMENTO_MAXIMO_MIN) lista.push(liquido);
  }
  return lista;
}

/** Comparação com a equipe no mesmo tipo de serviço: { texto, tom } ou null (poucos serviços para comparar). */
export function compararComEquipe({ minutosTecnico, minutosEquipe, feitos }) {
  if (feitos < MINIMO_PARA_COMPARAR || !Number.isFinite(minutosTecnico) || !Number.isFinite(minutosEquipe) || minutosEquipe <= 0) return null;
  const dif = Math.round(((minutosEquipe - minutosTecnico) / minutosEquipe) * 100);
  if (dif >= 5) return { texto: `${dif}% mais rápido`, tom: 'verde' };
  if (dif <= -5) return { texto: `${Math.abs(dif)}% mais lento`, tom: 'amarelo' };
  return { texto: 'na média', tom: 'azul' };
}

/** Média da equipe por tipo de serviço: Map(nome -> minutos). Cada serviço conta uma vez. */
export function mediasDaEquipePorTipo(concluidos) {
  const porVisita = new Map();
  for (const l of concluidos) {
    if (l.status !== STATUS.CONCLUIDO) continue;
    const chave = chaveDoAgendamento(l);
    if (!porVisita.has(chave)) porVisita.set(chave, []);
    porVisita.get(chave).push(l);
  }
  const tempos = new Map();
  for (const lista of porVisita.values()) {
    for (const l of sequenciarLinhasDaVisita(lista)) {
      const t = tempoNoCliente(l);
      if (t === null) continue;
      const nome = l.tipoServicoNome || 'Outros';
      if (!tempos.has(nome)) tempos.set(nome, []);
      tempos.get(nome).push(t);
    }
  }
  return new Map([...tempos].map(([nome, lista]) => [nome, media(lista)]));
}

/**
 * Desempenho de um técnico no período.
 * @returns {{ uid, nome, concluidos, comTempo, tempoMedio, atrasos, retornos, deslocamentoMedio,
 *   porTipo: Array<{nome, feitos, comTempo, tempoMedio, equipeMedio, comparacao}>, motivos: Array<{motivo, total}> }}
 */
export function desempenhoDoTecnico({ uid, nome = '', concluidos, almoco = null, mediasEquipe = null }) {
  const doTecnico = concluidos.filter((l) => l.status === STATUS.CONCLUIDO && tecnicosDoServico(l).includes(uid));
  const equipe = mediasEquipe || mediasDaEquipePorTipo(concluidos);
  const porVisita = new Map();
  for (const l of doTecnico) {
    const chave = chaveDoAgendamento(l);
    if (!porVisita.has(chave)) porVisita.set(chave, []);
    porVisita.get(chave).push(l);
  }
  const tempos = [];
  const tipos = new Map();
  const todosTempos = [];
  for (const lista of porVisita.values()) {
    for (const l of sequenciarLinhasDaVisita(lista)) {
      const nomeTipo = l.tipoServicoNome || 'Outros';
      if (!tipos.has(nomeTipo)) tipos.set(nomeTipo, { nome: nomeTipo, feitos: 0, tempos: [] });
      const t = tempoNoCliente(l);
      if (t !== null) { tempos.push(t); tipos.get(nomeTipo).tempos.push(t); todosTempos.push(t); }
    }
  }
  for (const l of doTecnico) {
    const nomeTipo = l.tipoServicoNome || 'Outros';
    if (!tipos.has(nomeTipo)) tipos.set(nomeTipo, { nome: nomeTipo, feitos: 0, tempos: [] });
    tipos.get(nomeTipo).feitos += 1;
  }
  const motivosMapa = new Map();
  for (const l of doTecnico) {
    if (l.atrasoMotivo) motivosMapa.set(l.atrasoMotivo, (motivosMapa.get(l.atrasoMotivo) || 0) + 1);
  }
  const porTipo = [...tipos.values()].map((t) => {
    const tempoMedio = media(t.tempos);
    const equipeMedio = equipe.get(t.nome) ?? null;
    return {
      nome: t.nome, feitos: t.feitos, comTempo: t.tempos.length, tempoMedio, equipeMedio,
      comparacao: compararComEquipe({ minutosTecnico: tempoMedio, minutosEquipe: equipeMedio, feitos: t.tempos.length }),
    };
  }).sort((a, b) => b.feitos - a.feitos || a.nome.localeCompare(b.nome, 'pt-BR'));
  return {
    uid, nome,
    concluidos: doTecnico.length,
    comTempo: tempos.length,
    tempoMedio: media(tempos),
    atrasos: doTecnico.filter(teveAtraso).length,
    retornos: doTecnico.filter((l) => Boolean(l.origemRetornoId)).length,
    ...contagemDeHorarios(doTecnico),
    deslocamentoMedio: media(deslocamentosDoTecnico(uid, concluidos, almoco)),
    porTipo,
    motivos: [...motivosMapa].map(([motivo, total]) => ({ motivo, total })).sort((a, b) => b.total - a.total || a.motivo.localeCompare(b.motivo, 'pt-BR')),
  };
}

/** Desempenho de todos os técnicos, na ordem dos técnicos recebidos. */
export function desempenhoDaEquipe({ tecnicos, concluidos, almoco = null }) {
  const equipe = mediasDaEquipePorTipo(concluidos);
  const lista = tecnicos.map((t) => desempenhoDoTecnico({ uid: t.uid, nome: t.nome, concluidos, almoco, mediasEquipe: equipe }));
  const dosTempos = lista.filter((d) => d.tempoMedio !== null);
  const totalTempos = dosTempos.reduce((n, d) => n + d.comTempo, 0);
  const somaTempos = dosTempos.reduce((n, d) => n + d.tempoMedio * d.comTempo, 0);
  return {
    tecnicos: lista,
    resumo: {
      concluidos: lista.reduce((n, d) => n + d.concluidos, 0),
      atrasos: lista.reduce((n, d) => n + d.atrasos, 0),
      tempoMedio: totalTempos ? Math.round(somaTempos / totalTempos) : null,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Serviços esperando conclusão (administrador)
// ---------------------------------------------------------------------------------------------

/**
 * Visitas ainda abertas que já passaram do previsto: [{ chave, linhas, dataAgendada, clienteNome, tecnicos, atrasoMin }]
 * (as mais antigas primeiro). `agendados` são linhas com status agendado.
 */
export function visitasEsperandoConclusao(agendados, agora = new Date()) {
  const mapa = new Map();
  for (const l of agendados) {
    if (l.status !== STATUS.AGENDADO || !(l.dataAgendada instanceof Date)) continue;
    const chave = chaveDoAgendamento(l);
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(l);
  }
  const lista = [];
  for (const [chave, linhas] of mapa) {
    if (situacaoDaVisita(linhas, agora) !== 'esperando-concluir') continue;
    const dataAgendada = linhas.map((l) => l.dataAgendada).sort((a, b) => a - b)[0];
    lista.push({ chave, linhas, dataAgendada, clienteNome: linhas[0].clienteNome, atrasoMin: Math.round((agora.getTime() - dataAgendada.getTime()) / MIN) });
  }
  return lista.sort((a, b) => a.dataAgendada - b.dataAgendada);
}
