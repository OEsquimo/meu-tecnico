// =============================================================================
// FINANCEIRO — cálculos puros (totais por período, por tipo de serviço, séries)
// =============================================================================
// Entradas:
//   servicos : lista de serviços CONCLUÍDOS
//              { id, tipoServicoNome, dataConclusao (Date), pago (bool) }
//   valores  : objeto { [servicoId]: valorCentavos } (vem da coleção "valores")
// Tudo em centavos (inteiros).
//
// Definições (as mesmas mostradas na tela):
//   recebido  = soma dos valores dos serviços marcados como PAGOS
//   aReceber  = soma dos valores dos serviços NÃO pagos
//   total     = recebido + aReceber
//   semValor  = serviços concluídos pelo técnico que o administrador ainda
//               não informou o valor (não entram nas somas)
// =============================================================================

import {
  inicioDoDia,
  inicioDoDiaSeguinte,
  inicioDaSemana,
  inicioDoMes,
  inicioDoAno,
  paraISO,
  diasNoMes,
} from './datas.js';

const NOMES_DIAS_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const NOMES_MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * Intervalo [inicio, fim) de um período. tipo: 'hoje' | 'semana' | 'mes' | 'ano'.
 */
export function periodoDe(tipo, referencia = new Date()) {
  if (tipo === 'hoje') {
    return { inicio: inicioDoDia(referencia), fim: inicioDoDiaSeguinte(referencia) };
  }
  if (tipo === 'semana') {
    const inicio = inicioDaSemana(referencia);
    const fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 7);
    return { inicio, fim };
  }
  if (tipo === 'mes') {
    const inicio = inicioDoMes(referencia);
    return { inicio, fim: new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1) };
  }
  if (tipo === 'ano') {
    const inicio = inicioDoAno(referencia);
    return { inicio, fim: new Date(inicio.getFullYear() + 1, 0, 1) };
  }
  throw new Error(`Período desconhecido: ${tipo}`);
}

/** Resume uma lista de serviços concluídos. */
export function resumir(servicos, valores) {
  let recebido = 0;
  let aReceber = 0;
  let semValor = 0;
  const porTipoMapa = new Map();

  for (const s of servicos) {
    const nome = s.tipoServicoNome || 'Outros';
    if (!porTipoMapa.has(nome)) {
      porTipoMapa.set(nome, { nome, quantidade: 0, totalCentavos: 0, recebidoCentavos: 0 });
    }
    const grupo = porTipoMapa.get(nome);
    grupo.quantidade += 1;

    const valor = valores[s.id];
    if (!Number.isInteger(valor)) {
      semValor += 1;
      continue;
    }
    grupo.totalCentavos += valor;
    if (s.pago === true) {
      recebido += valor;
      grupo.recebidoCentavos += valor;
    } else {
      aReceber += valor;
    }
  }

  const porTipo = [...porTipoMapa.values()].sort(
    (a, b) => b.totalCentavos - a.totalCentavos || a.nome.localeCompare(b.nome, 'pt-BR'),
  );

  return {
    quantidade: servicos.length,
    recebidoCentavos: recebido,
    aReceberCentavos: aReceber,
    totalCentavos: recebido + aReceber,
    semValor,
    porTipo,
  };
}

/**
 * Série para o gráfico de barras do período (soma dos valores por barra):
 *   semana -> 7 barras (Seg..Dom);  mes -> barras por semana do mês (dias 1-7, 8-14...)
 *   ano -> 12 barras (Jan..Dez);    hoje -> nenhuma barra.
 */
export function serieDoPeriodo(servicos, valores, tipo, referencia = new Date()) {
  const soma = (s) => (Number.isInteger(valores[s.id]) ? valores[s.id] : 0);

  if (tipo === 'semana') {
    const { inicio } = periodoDe('semana', referencia);
    const barras = NOMES_DIAS_CURTOS.map((rotulo) => ({ rotulo, totalCentavos: 0 }));
    for (const s of servicos) {
      const indice = Math.round((inicioDoDia(s.dataConclusao) - inicio) / 86400000);
      if (indice >= 0 && indice < 7) barras[indice].totalCentavos += soma(s);
    }
    return barras;
  }

  if (tipo === 'mes') {
    const total = diasNoMes(referencia.getFullYear(), referencia.getMonth());
    const quantidadeSemanas = Math.ceil(total / 7);
    const barras = Array.from({ length: quantidadeSemanas }, (_, i) => ({
      rotulo: `Sem ${i + 1}`,
      totalCentavos: 0,
    }));
    for (const s of servicos) {
      const indice = Math.floor((s.dataConclusao.getDate() - 1) / 7);
      if (barras[indice]) barras[indice].totalCentavos += soma(s);
    }
    return barras;
  }

  if (tipo === 'ano') {
    const barras = NOMES_MESES_CURTOS.map((rotulo) => ({ rotulo, totalCentavos: 0 }));
    for (const s of servicos) barras[s.dataConclusao.getMonth()].totalCentavos += soma(s);
    return barras;
  }

  return [];
}

/** Chave "AAAA-MM-DD" do dia da conclusão (útil para agrupar por dia). */
export function diaDaConclusao(servico) {
  return paraISO(servico.dataConclusao);
}
