// =============================================================================
// CONTATOS DO TELEFONE — "trazer os dados do cliente da agenda do celular"
// =============================================================================
// Usa a Contact Picker API (Chrome no Android). Se o aparelho não suportar,
// o botão simplesmente não aparece e o cadastro continua manual.
// O app só recebe o contato que a PESSOA ESCOLHER na janela do sistema.
// =============================================================================

import { ErroApp } from '../nucleo/erros.js';

export function contatosSuportados() {
  return typeof navigator !== 'undefined' && 'contacts' in navigator && typeof window !== 'undefined' && 'ContactsManager' in window;
}

/** Abre a agenda do celular e devolve { nome, telefone } do contato escolhido (ou null se cancelou). */
export async function escolherContato() {
  if (!contatosSuportados()) {
    throw new ErroApp('Este aparelho não permite trazer contatos. Digite os dados à mão.', 'sem-contatos');
  }
  try {
    const [contato] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
    if (!contato) return null;
    return { nome: (contato.name?.[0] || '').trim(), telefone: (contato.tel?.[0] || '').trim() };
  } catch (erro) {
    if (erro && erro.name === 'AbortError') return null;
    throw new ErroApp('Não foi possível abrir os contatos. Digite os dados à mão.', 'sem-contatos', erro);
  }
}
