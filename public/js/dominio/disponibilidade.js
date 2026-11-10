// =============================================================================
// DISPONIBILIDADE — quais dias e horários têm técnico livre (funções puras)
// =============================================================================
// Usado pelo seletor de dia e hora (agendar, editar e reagendar). Um horário só é
// oferecido se COMEÇAR dentro do expediente da empresa (até 30 minutos antes de fechar), não for
// passado e tiver pelo menos um técnico livre pelo tempo do serviço. O serviço pode passar do
// fechamento (hora extra), mas a ocupação do técnico acaba na meia-noite do dia em que ele começou.
// =============================================================================

import { combinarDataHora, paraISO, diasNoMes } from './datas.js';
import { tecnicosLivres } from './agenda.js';
import { expedienteDoDia, horariosDoDia } from './expediente.js';
import { DURACAO_PADRAO_MIN } from '../nucleo/constantes.js';
import { STATUS, tecnicosDoServico } from './servicos.js';

/**
 * Horários livres de um dia.
 * @returns {Array<{ hora: string, tecnicos: Array<{uid:string, nome:string}> }>} só horários com algum técnico livre
 */
export function horariosLivresDoDia({ expediente, iso, duracaoMin, tecnicos, agendados, ignorarAgendamento = null, agora = new Date() }) {
  const resultado = [];
  for (const hora of horariosDoDia(expediente, iso)) {
    const inicio = combinarDataHora(iso, hora);
    if (inicio.getTime() <= agora.getTime()) continue; // horário que já passou
    const livres = tecnicosLivres({ tecnicos, agendados, inicio, duracaoMin, ignorarAgendamento });
    if (livres.length > 0) resultado.push({ hora, tecnicos: livres });
  }
  return resultado;
}

/** Os dias de um mês que têm pelo menos um horário livre: Set de "AAAA-MM-DD". */
export function diasComVaga({ expediente, ano, mes, duracaoMin, tecnicos, agendados, ignorarAgendamento = null, agora = new Date() }) {
  const dias = new Set();
  for (let d = 1; d <= diasNoMes(ano, mes); d += 1) {
    const iso = paraISO(new Date(ano, mes, d));
    if (!expedienteDoDia(expediente, iso)?.aberto) continue;
    if (horariosLivresDoDia({ expediente, iso, duracaoMin, tecnicos, agendados, ignorarAgendamento, agora }).length > 0) dias.add(iso);
  }
  return dias;
}

/**
 * A menor duração entre os tipos de serviço ativos (a medida do "dia lotado").
 * Sem nenhum tipo cadastrado, usa a duração padrão (1 hora).
 */
export function menorDuracaoDosTipos(tipos = []) {
  const duracoes = tipos.filter((t) => t && t.ativo !== false).map((t) => Number(t.duracaoMin)).filter((n) => Number.isFinite(n) && n > 0);
  return duracoes.length > 0 ? Math.min(...duracoes) : DURACAO_PADRAO_MIN;
}

/**
 * Os dias LOTADOS de um mês: dias abertos, que ainda não acabaram, onde não cabe nem o MENOR serviço
 * (`duracaoMinima`): nenhum horário de início, até 30 minutos antes de fechar, tem técnico livre por esse
 * tempo. O serviço pode passar do fechamento (hora extra). É a mesma regra na Agenda e no seletor, e não
 * depende do tamanho do serviço que se está montando. Dia fechado e dia que já passou não são "lotados".
 * Devolve um Set de "AAAA-MM-DD".
 */
export function diasLotados({ expediente, ano, mes, tecnicos, agendados, duracaoMinima = DURACAO_PADRAO_MIN, ignorarAgendamento = null, agora = new Date() }) {
  const dias = new Set();
  for (let d = 1; d <= diasNoMes(ano, mes); d += 1) {
    const iso = paraISO(new Date(ano, mes, d));
    if (!diaTemInicioPelaFrente(expediente, iso, agora)) continue;
    if (horariosLivresDoDia({ expediente, iso, duracaoMin: duracaoMinima, tecnicos, agendados, ignorarAgendamento, agora }).length === 0) dias.add(iso);
  }
  return dias;
}

/** O dia está aberto e ainda tem algum horário de início pela frente? (hoje, depois do expediente, o dia só "acabou") */
export function diaTemInicioPelaFrente(expediente, iso, agora = new Date()) {
  if (!expedienteDoDia(expediente, iso)?.aberto) return false;
  return horariosDoDia(expediente, iso).some((hora) => combinarDataHora(iso, hora).getTime() > agora.getTime());
}

/**
 * Os pontos do calendário de um mês (o MESMO na Agenda e na escolha de dia e hora): um ponto por dia.
 *   - VERMELHO: dia lotado (não dá mais para começar nenhum serviço). Só é calculado quando `mostrarLotado` é verdadeiro
 *     (administrador) e há técnicos carregados — se a lista de técnicos não veio, não se avisa "lotado"
 *     (melhor não avisar do que avisar errado). Com `filtroTecnico`, vale só para aquele técnico.
 *   - AZUL: o dia tem agendamento (serviço agendado) e ainda cabe outro serviço. Aparece em qualquer dia
 *     (também em dia já passado, que é visita atrasada, ou em dia hoje fechado), e com `filtroTecnico`
 *     só conta as visitas daquele técnico.
 *   - sem ponto: dia sem agendamento.
 * O vermelho substitui o azul (nunca aparecem os dois no mesmo dia).
 * @returns {Map<string, 'azul'|'vermelho'>} "AAAA-MM-DD" -> cor
 */
export function pontosDoMes({ expediente, ano, mes, duracaoMinima, tecnicos = [], agendados = [], filtroTecnico = '', mostrarLotado = false, ignorarAgendamento = null, agora = new Date() }) {
  const pontos = new Map();
  const prefixo = `${ano}-${String(mes + 1).padStart(2, '0')}-`;
  for (const s of agendados) {
    if (s.status !== STATUS.AGENDADO || !(s.dataAgendada instanceof Date)) continue;
    if (filtroTecnico && !tecnicosDoServico(s).includes(filtroTecnico)) continue;
    const iso = paraISO(s.dataAgendada);
    if (iso.startsWith(prefixo)) pontos.set(iso, 'azul');
  }
  if (mostrarLotado && tecnicos.length > 0) {
    const contaveis = filtroTecnico ? tecnicos.filter((t) => t.uid === filtroTecnico) : tecnicos;
    if (contaveis.length > 0) {
      for (const iso of diasLotados({ expediente, ano, mes, duracaoMinima, tecnicos: contaveis, agendados, ignorarAgendamento, agora })) pontos.set(iso, 'vermelho');
    }
  }
  return pontos;
}
