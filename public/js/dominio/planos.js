// =============================================================================
// PLANOS, TESTE E LIMITE DE CLIENTES — funções puras
// =============================================================================
// ATENÇÃO: a mesma lógica existe em firestore.rules (funções emTeste, pagoVigente,
// contaAtiva, limiteEfetivo). A regra do SERVIDOR é a que vale de verdade; esta
// versão serve para o app mostrar mensagens claras ANTES de tentar gravar.
// Se mudar uma, mude a outra (há testes que conferem as duas).
//
// Entradas esperadas:
//   empresa : { planoId, planoAte (Date|null), testeEstendidoAte (Date|null),
//               bloqueada (bool), contadorClientes (int), criadoEm (Date) }
//   planos  : objeto { [planoId]: { nome, limiteClientes, financeiroCompleto, ... } }
//   regras  : { diasTeste (int) }
// =============================================================================

import { LIMITE_ILIMITADO } from '../nucleo/constantes.js';

const MS_DIA = 86400000;

/** Dia em que o teste grátis termina (criação + dias de teste, ou a extensão do dono). */
export function fimDoTeste(empresa, regras) {
  const dias = Number.isInteger(regras?.diasTeste) ? regras.diasTeste : 7;
  const base = new Date(empresa.criadoEm.getTime() + dias * MS_DIA);
  const extensao = empresa.testeEstendidoAte;
  return extensao && extensao.getTime() > base.getTime() ? extensao : base;
}

export function emTeste(empresa, regras, agora = new Date()) {
  return fimDoTeste(empresa, regras).getTime() > agora.getTime();
}

/** Plano pago e dentro da validade. */
export function pagoVigente(empresa, agora = new Date()) {
  return (
    empresa.planoId !== 'gratis' &&
    empresa.planoAte instanceof Date &&
    empresa.planoAte.getTime() > agora.getTime()
  );
}

/**
 * Situação da conta (usada nos selos e nas mensagens):
 *   'bloqueada' | 'ativa' (plano pago em dia) | 'teste' | 'gratis' | 'vencida'
 */
export function situacaoConta(empresa, regras, agora = new Date()) {
  if (empresa.bloqueada === true) return 'bloqueada';
  if (pagoVigente(empresa, agora)) return 'ativa';
  if (emTeste(empresa, regras, agora)) return 'teste';
  if (empresa.planoId === 'gratis') return 'gratis';
  return 'vencida';
}

/** Limite de clientes que vale agora (precisa bater com limiteEfetivo das regras). */
export function limiteEfetivo(empresa, planos, regras, agora = new Date()) {
  if (pagoVigente(empresa, agora)) return planos?.[empresa.planoId]?.limiteClientes ?? 0;
  if (emTeste(empresa, regras, agora)) return LIMITE_ILIMITADO;
  return planos?.gratis?.limiteClientes ?? 10;
}

/**
 * Pode cadastrar mais um cliente? Retorna { ok, motivo, limite, usados }.
 * motivo: 'bloqueada' | 'vencida' | 'limite' | null
 */
export function podeCadastrarCliente(empresa, planos, regras, agora = new Date()) {
  const situacao = situacaoConta(empresa, regras, agora);
  const limite = limiteEfetivo(empresa, planos, regras, agora);
  const usados = empresa.contadorClientes ?? 0;
  if (situacao === 'bloqueada') return { ok: false, motivo: 'bloqueada', limite, usados };
  if (situacao === 'vencida') return { ok: false, motivo: 'vencida', limite, usados };
  if (usados >= limite) return { ok: false, motivo: 'limite', limite, usados };
  return { ok: true, motivo: null, limite, usados };
}

/** O Financeiro completo (por tipo, gráficos) está liberado? Teste libera tudo. */
export function temFinanceiroCompleto(empresa, planos, regras, agora = new Date()) {
  const situacao = situacaoConta(empresa, regras, agora);
  if (situacao === 'teste') return true;
  if (situacao === 'ativa') return planos?.[empresa.planoId]?.financeiroCompleto === true;
  return false;
}

/** "Ilimitado" ou o número. */
export function textoLimite(limite) {
  return limite >= LIMITE_ILIMITADO ? 'Ilimitado' : String(limite);
}

/** Texto curto da situação para selos. */
export function rotuloSituacao(situacao) {
  return (
    {
      ativa: 'Ativa',
      teste: 'Em teste',
      gratis: 'Grátis',
      vencida: 'Vencida',
      bloqueada: 'Bloqueada',
    }[situacao] || situacao
  );
}
