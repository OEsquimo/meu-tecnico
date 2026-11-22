// =============================================================================
// TELA: Equipe (lista de funcionários) — só administrador
// =============================================================================

import { html, mostrar } from '../nucleo/ui.js';
import { cabecalho, botao, itemLista, avatar, esqueletos, aviso } from '../nucleo/componentes.js';
import { listarEquipe } from '../servicos/equipe.js';
import { empresaId } from '../nucleo/sessao.js';
import { formatarTelefone, normalizarWhatsappBR } from '../dominio/telefone.js';
import { mostrarFalha, seloStatusEquipe, seta } from './_auxiliar-admin.js';

/** WhatsApp do funcionário para a lista (pacote 26): formatado; sem número válido, avisa. */
const whatsappDoMembro = (m) => (normalizarWhatsappBR(m.telefone) ? formatarTelefone(m.telefone) : 'sem WhatsApp');

export default async function montar(ctx) {
  const { raiz, sessao } = ctx;
  const topo = cabecalho({ titulo: 'Equipe', voltarPara: '#/administrativa' });
  mostrar(raiz, html`${topo}${esqueletos(3)}`);
  try {
    const equipe = await listarEquipe(empresaId());
    if (!ctx.ativo()) return;
    const ativos = equipe.filter((m) => m.status === 'ativo').length;
    const convites = equipe.filter((m) => m.status === 'convite').length;
    const bloqueados = equipe.filter((m) => m.status === 'bloqueado').length;
    mostrar(raiz, html`
      ${cabecalho({ titulo: 'Equipe', subtitulo: `${ativos} ativos · ${convites} convites · ${bloqueados} bloqueados`, voltarPara: '#/administrativa' })}
      <div class="pilha">
        ${botao({ texto: 'Novo funcionário', iconeNome: 'usuarioMais', href: '#/equipe/novo', bloco: true })}
        <div class="lista pilha pilha--pequena">
          ${itemLista({ href: '#/equipe/eu', avatarNome: sessao.vinculo?.nome || 'Você', titulo: 'Você', sub: sessao.empresa?.adminAtende === false ? 'Administrador · não atende serviços' : 'Administrador · acesso total', direita: seta })}
          ${equipe.map((m) => itemLista({
            href: m.status === 'convite' ? `#/equipe/convite/${m.id}` : `#/equipe/${m.id}`,
            avatarNome: m.nome,
            titulo: m.nome,
            sub: `${m.status === 'convite' ? 'Ainda não entrou no app' : m.status === 'bloqueado' ? 'Sem acesso ao app' : 'Técnico'} · ${whatsappDoMembro(m)}`,
            inativo: m.status === 'bloqueado',
            direita: html`${seloStatusEquipe(m.status)}${seta}`,
          }))}
        </div>
        ${aviso({ texto: 'Cada técnico vê só os serviços que você atribuiu a ele. Os valores só aparecem para quem você liberar, em cada funcionário. Se você trabalha sozinho, a equipe fica só com você.' })}
      </div>`);
  } catch (erro) {
    if (ctx.ativo()) mostrarFalha(raiz, erro, ctx.recarregar);
  }
}
