// =============================================================================
// TELA: Convite criado (/equipe/convite/:id) — só administrador
// =============================================================================
// Mostra o link do convite com: enviar por WhatsApp, copiar e cancelar convite.
// =============================================================================

import { html, mostrar, aoClicar, copiarTexto, toast, confirmar, comCarregando, mostrarErro } from '../nucleo/ui.js';
import { cabecalho, botao, aviso, esqueletos } from '../nucleo/componentes.js';
import { buscarMembro, linkDoConvite, mensagemDoConvite, linkWhatsappDoConvite, removerFuncionario } from '../servicos/equipe.js';
import { empresaId } from '../nucleo/sessao.js';
import { mostrarFalha } from './_auxiliar-admin.js';
import { mostrarNaoEncontrado } from './servicos-comum.js';

export default async function montar(ctx) {
  const { raiz, params, sessao, ir } = ctx;
  mostrar(raiz, html`${cabecalho({ titulo: 'Convite', voltarPara: '#/equipe' })}${esqueletos(2)}`);
  try {
    const membro = await buscarMembro(empresaId(), params.id);
    if (!ctx.ativo()) return;
    if (!membro) return mostrarNaoEncontrado(raiz, 'Convite não encontrado', 'Ele pode ter sido cancelado.', '#/equipe');
    if (membro.status !== 'convite') { ir(`/equipe/${membro.id}`); return; }

    const link = linkDoConvite(empresaId(), membro.id, window.location.href);
    const texto = mensagemDoConvite({ nomeFuncionario: membro.nome, nomeEmpresa: sessao.empresa.nome, link });
    const whats = linkWhatsappDoConvite(membro.telefone, texto);

    mostrar(raiz, html`
      ${cabecalho({ titulo: 'Convite criado', subtitulo: membro.nome, voltarPara: '#/equipe' })}
      <div class="pilha">
        ${aviso({ tom: 'verde', texto: 'Envie o link para o funcionário. Ele cria a própria senha e já entra na sua equipe.' })}
        <div class="codigo-copiavel">${link}</div>
        ${whats ? botao({ texto: 'Enviar pelo WhatsApp', variante: 'whatsapp', iconeNome: 'whatsapp', href: whats, externo: true, bloco: true }) : ''}
        ${botao({ texto: 'Copiar link', variante: 'secundario', iconeNome: 'copiar', acao: 'copiar', bloco: true })}
        ${botao({ texto: 'Cancelar convite', variante: 'perigo', iconeNome: 'lixeira', acao: 'cancelar', bloco: true })}
      </div>`);

    aoClicar(raiz, {
      copiar: async () => toast(await copiarTexto(link) ? 'Link copiado.' : 'Não consegui copiar. Segure o texto para copiar.', 'info'),
      cancelar: async (el) => {
        if (!await confirmar({ titulo: 'Cancelar este convite?', mensagem: 'O link deixa de funcionar.', confirmar: 'Cancelar convite', cancelar: 'Voltar', perigo: true })) return;
        await comCarregando(el, async () => {
          try {
            await removerFuncionario(empresaId(), membro);
            toast('Convite cancelado.', 'sucesso');
            ir('/equipe');
          } catch (e) { mostrarErro(e); }
        });
      },
    });
  } catch (erro) {
    if (ctx.ativo()) mostrarFalha(raiz, erro, ctx.recarregar);
  }
}
