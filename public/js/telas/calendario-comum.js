// =============================================================================
// CALENDÁRIO DO MÊS — um só, usado na Agenda e na escolha de dia e hora
// =============================================================================
// Mostra a grade do mês (domingo a sábado) com UM ponto por dia:
//   azul     = o dia tem agendamento e ainda cabe outro serviço;
//   vermelho = o dia está lotado (não cabe mais nada);
//   sem ponto = dia sem agendamento.
// No Agenda, dias que já passaram podem ter UM OU DOIS pontos de histórico: verde = serviço concluído,
// amarelo = serviço atrasado ou cancelado (valor do mapa = Set com 'verde' e/ou 'amarelo').
// Quem decide os pontos é dominio/disponibilidade.js (pontosDoMes); aqui só se desenha.
// Cada dia leva data-acao (o que acontece ao tocar) e a data em data-dia e data-iso.
// =============================================================================

import { html } from '../nucleo/ui.js';
import { gradeDoMes, DIAS_DA_SEMANA } from '../dominio/agenda.js';
import { formatarDiaExtenso } from '../dominio/datas.js';
import { diaTemInicioPelaFrente, diasComVaga, pontosDoMes } from '../dominio/disponibilidade.js';

/**
 * @param {object} p
 * @param {number} p.ano
 * @param {number} p.mes                     0 a 11
 * @param {string} p.hoje                    "AAAA-MM-DD"
 * @param {string} p.escolhido               dia escolhido ('' se nenhum)
 * @param {Map<string,string>} p.pontos      "AAAA-MM-DD" -> 'azul' | 'vermelho'
 * @param {string} p.acao                    valor de data-acao dos dias
 * @param {(iso:string)=>boolean} [p.desligado]  dia que não pode ser tocado (fica apagado)
 * @param {(iso:string)=>boolean} [p.passado]    dia que já passou (letra cinza, mas ainda dá para tocar: consulta)
 * @param {(iso:string, ponto:?string)=>string} [p.complemento]  texto extra para leitor de tela
 */
export function calendarioDoMes({ ano, mes, hoje, escolhido, pontos, acao, desligado = () => false, passado = () => false, complemento = () => '' }) {
  return html`
    <div class="calendario">
      ${DIAS_DA_SEMANA.map((d) => html`<div class="calendario__semana" aria-hidden="true">${d}</div>`)}
      ${gradeDoMes(ano, mes).map((c) => celula(c))}
    </div>`;

  function celula(c) {
    if (!c.iso) return html`<span class="calendario__dia calendario__dia--vazio" aria-hidden="true"></span>`;
    const ponto = pontos.get(c.iso) || null;
    const apagado = desligado(c.iso);
    const classes = ['calendario__dia'];
    if (c.iso === hoje) classes.push('calendario__dia--hoje');
    if (c.iso === escolhido) classes.push('calendario__dia--selecionado');
    if (ponto === 'vermelho') classes.push('calendario__dia--lotado');
    if (apagado) classes.push('calendario__dia--sem-vaga');
    if (passado(c.iso)) classes.push('calendario__dia--passado');
    let bolinha = '';
    if (ponto instanceof Set) {
      bolinha = html`<span class="calendario__pontos">${[...ponto].map((cor) => html`<span class="calendario__ponto calendario__ponto--${cor}"></span>`)}</span>`;
    } else if (ponto === 'vermelho') bolinha = html`<span class="calendario__ponto calendario__ponto--lotado"></span>`;
    else if (ponto === 'azul') bolinha = html`<span class="calendario__ponto"></span>`;
    return html`<button type="button" class="${classes.join(' ')}" data-acao="${acao}" data-dia="${c.iso}" data-iso="${c.iso}" ${apagado ? html`disabled` : ''}
      aria-label="${formatarDiaExtenso(c.iso)}${complemento(c.iso, ponto)}" aria-pressed="${c.iso === escolhido ? 'true' : 'false'}">${c.dia}${bolinha}</button>`;
  }
}


/**
 * Calendário de DISPONIBILIDADE (para escolher o dia de um agendamento): o mesmo na tela Agendar e no seletor.
 * Ponto azul = dia com agendamento em que ainda cabe outro serviço; vermelho = dia lotado; dia fechado ou que
 * já passou fica apagado e desligado. `pronto` falso (carregando ou erro) = sem pontos.
 */
export function calendarioDeDisponibilidade({ ano, mes, hoje, escolhido, acao, pronto, expediente, duracaoMin, duracaoMinima, regras, tecnicos, agendados, agendamentoId = null, agora = new Date() }) {
  const base = { expediente, duracaoMin, tecnicos, agendados, ignorarAgendamento: agendamentoId, regras, agora };
  const pontos = pronto ? pontosDoMes({ ...base, duracaoMinima, ano, mes, mostrarLotado: true }) : new Map();
  const comVaga = pronto ? diasComVaga({ ...base, ano, mes }) : new Set();
  const desligado = (iso) => !diaTemInicioPelaFrente(expediente, iso, agora);
  const complemento = (iso, ponto) => (comVaga.has(iso) ? ', com horário livre' : (ponto === 'vermelho' ? ', dia lotado, sem horário livre' : ', sem horário livre para este serviço'));
  return calendarioDoMes({ ano, mes, hoje, escolhido, pontos, acao, desligado, complemento });
}
