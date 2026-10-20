// =============================================================================
// TELA: endereço que não existe (nunca deixar o usuário perdido)
// =============================================================================

import { html, mostrar } from '../nucleo/ui.js';
import { estadoVazio, botao } from '../nucleo/componentes.js';
import { sessao } from '../nucleo/sessao.js';

export default function montar({ raiz }) {
  mostrar(raiz, estadoVazio({
    icone: 'info',
    titulo: 'Página não encontrada',
    texto: 'O endereço que você abriu não existe ou foi trocado.',
    acao: botao({ texto: sessao.usuario ? 'Ir para o início' : 'Ir para a entrada', href: sessao.usuario ? '#/' : '#/entrar' }),
  }));
}
