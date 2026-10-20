// =============================================================================
// TELA: Funcionário (/equipe/:id) — só administrador
// =============================================================================
// Editar nome/telefone, bloquear/reativar o acesso ou remover da equipe.
// Bloquear mantém os dados; remover tira da equipe (o histórico de serviços fica).
// =============================================================================

import { html, mostrar, aoClicar, aoEnviar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, confirmar, toast, mostrarErro } from '../nucleo/ui.js';
import { cabecalho, campoTexto, botao, esqueletos } from '../nucleo/componentes.js';
import { buscarMembro, editarFuncionario, alterarBloqueio, removerFuncionario } from '../servicos/equipe.js';
import { empresaId } from '../nucleo/sessao.js';
import { validarFuncionario } from '../dominio/validacoes.js';
import { formatarTelefone, mascararTelefoneDigitando } from '../dominio/telefone.js';
import { traduzirErro } from '../nucleo/erros.js';
import { mostrarFalha, seloStatusEquipe } from './_auxiliar-admin.js';
import { mostrarNaoEncontrado } from './servicos-comum.js';

export default async function montar(ctx) {
  const { raiz, params, ir } = ctx;
  mostrar(raiz, html`${cabecalho({ titulo: 'Funcionário', voltarPara: '#/equipe' })}${esqueletos(2)}`);
  try {
    const m = await buscarMembro(empresaId(), params.id);
    if (!ctx.ativo()) return;
    if (!m) return mostrarNaoEncontrado(raiz, 'Funcionário não encontrado', 'Ele pode ter sido removido.', '#/equipe');
    if (m.status === 'convite') { ir(`/equipe/convite/${m.id}`); return; }
    const bloqueado = m.status === 'bloqueado';

    mostrar(raiz, html`
      ${cabecalho({ titulo: m.nome, voltarPara: '#/equipe', acaoDireita: seloStatusEquipe(m.status) })}
      <div class="pilha">
        <form id="form-func" class="formulario" novalidate>
          <div data-erros-gerais></div>
          ${campoTexto({ nome: 'nome', rotulo: 'Nome', valor: m.nome, maximo: 100 })}
          ${campoTexto({ nome: 'telefone', rotulo: 'WhatsApp', tipo: 'tel', modo: 'tel', valor: formatarTelefone(m.telefone) })}
          ${botao({ texto: 'Salvar', tipo: 'submit', bloco: true })}
        </form>
        ${botao({ texto: bloqueado ? 'Reativar acesso' : 'Bloquear acesso', variante: 'secundario', iconeNome: 'cadeado', acao: 'bloqueio', bloco: true })}
        ${botao({ texto: 'Remover da equipe', variante: 'perigo', iconeNome: 'lixeira', acao: 'remover', bloco: true })}
      </div>`);

    const form = raiz.querySelector('#form-func');
    form.elements.telefone.addEventListener('input', (e) => { e.target.value = mascararTelefoneDigitando(e.target.value); });
    aoEnviar(form, async () => {
      limparErrosGerais(form);
      const r = validarFuncionario(lerCampos(form));
      if (!r.valido) { mostrarErrosNosCampos(form, r.erros); return; }
      await comCarregando(form.querySelector('[type="submit"]'), async () => {
        try {
          await editarFuncionario(empresaId(), m, r.dados);
          toast('Salvo.', 'sucesso');
          ir('/equipe');
        } catch (erro) { mostrarErrosNosCampos(form, { geral: traduzirErro(erro) }); }
      });
    });

    aoClicar(raiz, {
      bloqueio: async (el) => {
        if (!bloqueado && !await confirmar({ titulo: `Bloquear ${m.nome}?`, mensagem: 'Ele não consegue mais entrar no app. Você pode reativar depois.', confirmar: 'Bloquear', perigo: true })) return;
        await comCarregando(el, async () => {
          try {
            await alterarBloqueio(empresaId(), m, !bloqueado);
            toast(bloqueado ? 'Acesso reativado.' : 'Acesso bloqueado.', 'sucesso');
            ctx.recarregar();
          } catch (e) { mostrarErro(e); }
        });
      },
      remover: async (el) => {
        if (!await confirmar({ titulo: `Remover ${m.nome}?`, mensagem: 'Ele sai da equipe. Os serviços que ele fez continuam no histórico.', confirmar: 'Remover', perigo: true })) return;
        await comCarregando(el, async () => {
          try {
            await removerFuncionario(empresaId(), m);
            toast('Funcionário removido.', 'sucesso');
            ir('/equipe');
          } catch (e) { mostrarErro(e); }
        });
      },
    });
  } catch (erro) {
    if (ctx.ativo()) mostrarFalha(raiz, erro, ctx.recarregar);
  }
}
