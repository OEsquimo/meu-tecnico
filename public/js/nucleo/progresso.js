// =============================================================================
// PROGRESSO — barra fina no topo da tela, ligada a qualquer operação demorada
// =============================================================================
// Funciona como um "contador de tarefas em andamento": a barra liga quando a
// primeira começa e só desliga quando a última termina. Também espera um
// instante antes de aparecer, para não piscar em operações muito rápidas.
// =============================================================================

let emAndamento = 0;
let temporizador = null;
const ATRASO_MS = 150;

function elementoBarra() {
  return typeof document === 'undefined' ? null : document.getElementById('barra-progresso');
}

function atualizar() {
  const barra = elementoBarra();
  if (!barra) return;
  if (emAndamento > 0) {
    if (!temporizador) {
      temporizador = setTimeout(() => {
        barra.classList.add('barra-progresso--ativa');
        barra.setAttribute('aria-hidden', 'false');
      }, ATRASO_MS);
    }
  } else {
    clearTimeout(temporizador);
    temporizador = null;
    barra.classList.remove('barra-progresso--ativa');
    barra.setAttribute('aria-hidden', 'true');
  }
}

export function iniciarProgresso() {
  emAndamento += 1;
  atualizar();
}

export function concluirProgresso() {
  emAndamento = Math.max(0, emAndamento - 1);
  atualizar();
}

/** Liga a barra enquanto a promessa não termina (sucesso ou erro). */
export async function comProgresso(promessa) {
  iniciarProgresso();
  try {
    return await promessa;
  } finally {
    concluirProgresso();
  }
}

/** Para testes. */
export function progressoEmAndamento() {
  return emAndamento;
}
