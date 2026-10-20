// =============================================================================
// TELA: Tipos de serviço (lista)
// =============================================================================
// Mostra os tipos da empresa (Limpeza, Instalação...) e leva ao formulário para
// criar ou editar. Os tipos já ficam na sessão (sessao.tipos), por isso a tela
// abre na hora e nunca fica "carregando".
// =============================================================================

import { html, mostrar } from '../nucleo/ui.js';
import { cabecalho, itemLista, estadoVazio, botao, selo } from '../nucleo/componentes.js';
import { seta } from './_auxiliar-admin.js';

export default async function montar({ raiz, sessao }) {
  const tipos = sessao.tipos;

  /** Texto que explica o retorno de cada tipo. */
  const descricao = (t) => (t.geraRetorno
    ? `Gera retorno · prazo padrão ${t.retornoPadraoMeses} meses`
    : 'Não gera retorno');

  mostrar(raiz, html`
    ${cabecalho({
      titulo: 'Tipos de serviço',
      subtitulo: 'O que você faz para os clientes',
      voltarPara: '#/administrativa',
    })}
    <div class="pilha">
      ${botao({ texto: 'Novo tipo de serviço', href: '#/tipos-servico/novo', iconeNome: 'mais', bloco: true })}
      ${tipos.length === 0
        ? estadoVazio({
          icone: 'ferramenta',
          titulo: 'Nenhum tipo cadastrado',
          texto: 'Crie o primeiro tipo para poder agendar serviços.',
        })
        : html`<div class="lista pilha pilha--pequena">
          ${tipos.map((t) => itemLista({
            href: `#/tipos-servico/${encodeURIComponent(t.id)}`,
            titulo: t.nome,
            sub: descricao(t),
            inativo: t.ativo === false,
            direita: t.ativo === false ? selo('Inativo') : seta,
          }))}
        </div>`}
    </div>`);
}
