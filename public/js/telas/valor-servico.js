// =============================================================================
// TELA: Valor do serviço concluído (/servico/:id/valor) — só administrador
// =============================================================================
// Informa (ou corrige) valor, extras e desconto de um serviço já concluído.
// Se o serviço ainda não tem valor, já vem o valor padrão do tipo de serviço.
// =============================================================================

import { html, mostrar, aoEnviar, aoClicar, mostrarErrosNosCampos, limparErrosGerais, comCarregando, toast } from '../nucleo/ui.js';
import { cabecalho, botao, esqueletos } from '../nucleo/componentes.js';
import { traduzirErro } from '../nucleo/erros.js';
import { buscarServico, buscarValores, definirValor } from '../servicos/servicos.js';
import { listarPrecos } from '../servicos/precos.js';
import { validarValores } from '../dominio/valores.js';
import { centavosParaCampo } from '../dominio/dinheiro.js';
import { STATUS } from '../dominio/servicos.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar, mostrarNaoEncontrado } from './servicos-comum.js';
import { editorDeValores, ligarEditorDeValores, textosDeValores } from './valores-editor.js';

export default async function montar(ctx) {
  const { raiz, params, ir } = ctx;
  const usuario = contextoDoUsuario();
  const voltarPara = `#/servico/${params.id}`;
  const topo = cabecalho({ titulo: 'Valor do serviço', voltarPara });
  mostrar(raiz, html`${topo}${esqueletos(2)}`);
  try {
    await carregarEstilos();
    const s = await buscarServico(usuario.empresaId, params.id);
    if (!ctx.ativo()) return;
    if (!s) return mostrarNaoEncontrado(raiz, 'Serviço não encontrado', 'Ele pode ter sido excluído.', '#/agenda');
    if (s.status !== STATUS.CONCLUIDO) return mostrarNaoEncontrado(raiz, 'Ainda não foi concluído', 'O valor é informado ao concluir o serviço.', voltarPara);
    const [atual, precos] = await Promise.all([
      buscarValores(usuario.empresaId, s.id).catch(() => null),
      listarPrecos(usuario.empresaId).catch(() => ({})),
    ]);
    if (!ctx.ativo()) return;
    const padrao = Number.isInteger(precos[s.tipoServicoId]) ? precos[s.tipoServicoId] : null;
    const textos = atual ? textosDeValores(atual) : { base: padrao === null ? '' : centavosParaCampo(padrao), extras: [], desconto: '' };

    mostrar(raiz, html`
      ${cabecalho({ titulo: 'Valor do serviço', subtitulo: `${s.tipoServicoNome} · ${s.clienteNome}`, voltarPara })}
      <form id="form-valor" class="formulario" novalidate>
        <div data-erros-gerais></div>
        ${editorDeValores({ ...textos, ajudaValor: !atual && padrao !== null ? 'Valor padrão deste serviço. Pode mudar.' : '' })}
        ${botao({ texto: 'Salvar valor', tipo: 'submit', bloco: true })}
      </form>`);
    const form = raiz.querySelector('#form-valor');
    const editor = ligarEditorDeValores(form);
    aoClicar(raiz, editor.acoes);
    aoEnviar(form, async () => {
      limparErrosGerais(form);
      const v = validarValores(editor.ler(), { exigirBase: true });
      if (!v.valido) { mostrarErrosNosCampos(form, v.erros); return; }
      await comCarregando(form.querySelector('[type="submit"]'), async () => {
        try {
          await definirValor(usuario.empresaId, s, v.dados);
          toast('Valor salvo.', 'sucesso');
          ir(`/servico/${encodeURIComponent(s.id)}`, { substituir: true });
        } catch (erro) { mostrarErrosNosCampos(form, { geral: traduzirErro(erro) }); }
      });
    });
  } catch (erro) {
    if (ctx.ativo()) mostrarErroComTentar(raiz, erro, ctx.recarregar, topo);
  }
}
