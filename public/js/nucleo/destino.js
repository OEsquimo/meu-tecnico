// =============================================================================
// DESTINO DEPOIS DO LOGIN — lembra para onde a pessoa queria ir
// =============================================================================
// Quem toca num link do app (ex.: "Técnico: abrir no app", que abre o Agendar com o pedido de um cliente) sem
// estar logado cai na tela Entrar. Aqui guardamos esse destino, por pouco tempo, só na aba do navegador
// (sessionStorage); depois do login o roteador leva a pessoa até ele — se o papel dela puder abrir a tela.
// Se o armazenamento do navegador não funcionar, nada quebra: o login só vai para o Início, como sempre.
// =============================================================================

const CHAVE = 'meu-tecnico:destino';
/** Depois desse tempo o destino é esquecido (quem deixou o login para depois não é surpreendido). */
export const VALIDADE_DO_DESTINO_MS = 30 * 60 * 1000;

/** Guarda o endereço (ex.: "/agendar?data=..."). Só endereços internos do app. */
export function guardarDestino(endereco, agora = Date.now()) {
  if (typeof endereco !== 'string' || !endereco.startsWith('/') || endereco === '/' || endereco.startsWith('//')) return;
  try { sessionStorage.setItem(CHAVE, JSON.stringify({ endereco, em: agora })); } catch { /* sem armazenamento: tudo bem */ }
}

/** Devolve o destino guardado (e esquece). Null se não há, se venceu ou se estiver estragado. */
export function pegarDestino(agora = Date.now()) {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    sessionStorage.removeItem(CHAVE);
    if (!bruto) return null;
    const { endereco, em } = JSON.parse(bruto);
    if (typeof endereco !== 'string' || !endereco.startsWith('/') || endereco.startsWith('//')) return null;
    if (typeof em !== 'number' || agora - em > VALIDADE_DO_DESTINO_MS) return null;
    return endereco;
  } catch {
    return null;
  }
}
