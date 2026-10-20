// =============================================================================
// TELA: Acesso bloqueado (técnico bloqueado) e Conta bloqueada (empresa bloqueada)
// =============================================================================
// Mesmo bloqueada, a empresa pode BAIXAR OS PRÓPRIOS DADOS (portabilidade LGPD).
// =============================================================================

import { html, mostrar, aoClicar, comCarregando } from '../nucleo/ui.js';
import { estadoVazio, botao } from '../nucleo/componentes.js';
import { sairDaSessao } from '../nucleo/sessao.js';
import { ehAdminMesmoBloqueado } from '../nucleo/permissoes.js';

export default async function montar({ raiz, extras, sessao }) {
  const ehConta = extras.tipo === 'conta';
  mostrar(raiz, estadoVazio({
    icone: 'cadeado',
    titulo: ehConta ? 'Conta bloqueada' : 'Seu acesso foi bloqueado',
    texto: ehConta
      ? 'O acesso desta empresa está suspenso. Seus dados continuam guardados. Fale com o suporte do aplicativo para resolver.'
      : 'O administrador da empresa bloqueou o seu acesso. Fale com ele para voltar a usar o app.',
    acao: html`<div class="pilha pilha--pequena">
      ${ehConta && ehAdminMesmoBloqueado(sessao) ? botao({ texto: 'Baixar meus dados (backup)', href: '#/backup', iconeNome: 'baixar' }) : ''}
      ${botao({ texto: 'Sair', variante: 'secundario', acao: 'sair', iconeNome: 'sair' })}
    </div>`,
  }));
  aoClicar(raiz, { sair: (el) => comCarregando(el, () => sairDaSessao()) });
}
