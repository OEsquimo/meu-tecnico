// =============================================================================
// RETORNOS (lembretes de limpeza e manutenção preventiva) — funções puras
// =============================================================================
// Um "retorno" nasce quando um serviço de um tipo que gera retorno
// (Limpeza, Manutenção preventiva...) é concluído. O técnico escolhe o prazo
// (3, 4, 6 ou 12 meses) e o app calcula o DIA do retorno.
// O retorno aparece na lista "Retornos" a partir de (dia do retorno - dias de aviso).
// =============================================================================

import { somarDias, somarMeses, diasEntre } from './datas.js';
import { GARANTIA_DIAS, PRAZOS_RETORNO_MESES, MENSAGEM_WHATSAPP_PADRAO, MENSAGEM_WHATSAPP_ANTIGA } from '../nucleo/constantes.js';

/** Dia do retorno = dia da conclusão + N meses. */
export function calcularDataRetorno(diaConclusaoISO, meses) {
  if (!PRAZOS_RETORNO_MESES.includes(meses)) {
    throw new Error(`Prazo de retorno inválido: ${meses}`);
  }
  return somarMeses(diaConclusaoISO, meses);
}

/** Fim da garantia legal (90 dias) a partir do dia da conclusão. */
export function calcularGarantiaAte(diaConclusaoISO) {
  return somarDias(diaConclusaoISO, GARANTIA_DIAS);
}

/**
 * Classifica um retorno em relação a hoje:
 *   'vencido' -> o dia do retorno já chegou ou passou
 *   'proximo' -> faltam até "diasAviso" dias (já está em tempo de avisar)
 *   'futuro'  -> ainda não é hora de avisar
 * "dias" é negativo quando está atrasado.
 */
export function classificarRetorno(dataRetornoISO, hojeISO, diasAviso) {
  const dias = diasEntre(hojeISO, dataRetornoISO);
  if (dias <= 0) return { estado: 'vencido', dias };
  if (dias <= diasAviso) return { estado: 'proximo', dias };
  return { estado: 'futuro', dias };
}

/** Último dia que precisa ser consultado no banco para trazer os retornos "em tempo". */
export function limiteConsultaRetornos(hojeISO, diasAviso) {
  return somarDias(hojeISO, diasAviso);
}

/**
 * Separa a lista de serviços com retorno pendente em vencidos e próximos,
 * ordenados do mais antigo para o mais novo. "Futuros" são descartados.
 */
export function separarRetornos(servicos, hojeISO, diasAviso) {
  const vencidos = [];
  const proximos = [];
  for (const s of servicos) {
    if (!s.dataRetorno || s.retornoSituacao !== 'pendente') continue;
    const { estado, dias } = classificarRetorno(s.dataRetorno, hojeISO, diasAviso);
    if (estado === 'vencido') vencidos.push({ ...s, diasParaRetorno: dias });
    else if (estado === 'proximo') proximos.push({ ...s, diasParaRetorno: dias });
  }
  const porData = (a, b) => (a.dataRetorno < b.dataRetorno ? -1 : a.dataRetorno > b.dataRetorno ? 1 : 0);
  vencidos.sort(porData);
  proximos.sort(porData);
  return { vencidos, proximos };
}

/**
 * Novo dia de retorno quando o administrador toca em "Adiar".
 * Conta a partir de hoje se o retorno já estava atrasado.
 */
export function adiarRetorno(dataRetornoISO, hojeISO, dias) {
  const base = dataRetornoISO > hojeISO ? dataRetornoISO : hojeISO;
  return somarDias(base, dias);
}

/** Opções de adiamento mostradas na tela (dias). */
export const OPCOES_ADIAR_DIAS = [7, 15, 30];

/**
 * Há quanto tempo foi o serviço, em palavras para a mensagem de retorno (pacote 26):
 * "12 dias", "1 mês", "6 meses", "1 ano", "1 ano e 2 meses", "2 anos". Sem data: "algum tempo".
 */
export function tempoDesde(diaISO, hojeISO) {
  if (!diaISO || !hojeISO) return 'algum tempo';
  const [a1, m1, d1] = diaISO.split('-').map(Number);
  const [a2, m2, d2] = hojeISO.split('-').map(Number);
  let meses = (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (meses < 1) {
    const dias = Math.max(0, diasEntre(diaISO, hojeISO));
    return dias === 1 ? '1 dia' : `${dias} dias`;
  }
  const anos = Math.floor(meses / 12);
  meses -= anos * 12;
  const doAno = anos === 0 ? '' : anos === 1 ? '1 ano' : `${anos} anos`;
  const doMes = meses === 0 ? '' : meses === 1 ? '1 mês' : `${meses} meses`;
  return [doAno, doMes].filter(Boolean).join(' e ');
}

/**
 * Modelo da mensagem de retorno da empresa. Vazio, ou ainda o texto padrão antigo (nunca editado): usa o padrão novo.
 * Quem editou a mensagem mantém exatamente o que escreveu.
 */
export function modeloDaMensagemDeRetorno(empresa) {
  const guardado = String(empresa?.mensagemWhatsapp ?? '').trim();
  if (!guardado || guardado === MENSAGEM_WHATSAPP_ANTIGA.trim()) return MENSAGEM_WHATSAPP_PADRAO;
  return empresa.mensagemWhatsapp;
}
