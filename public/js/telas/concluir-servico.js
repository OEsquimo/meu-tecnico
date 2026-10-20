// =============================================================================
// TELA: Concluir serviço (/concluir/:id)
// =============================================================================
//   * TÉCNICO: descreve o que fez e marca "cliente pagou? sim/não". NÃO vê nem
//     digita valor.
//   * ADMINISTRADOR: também informa o valor; "Mais opções" permite trocar o
//     aparelho e a data de conclusão.
// Se o tipo de serviço gera retorno (limpeza/manutenção), aparecem as opções
// 3/4/6/12 meses (já vem marcado o prazo padrão do tipo).
// =============================================================================

import { html, mostrar, aoEnviar, aoClicar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, toast } from '../nucleo/ui.js';
import { cabecalho, campoTexto, campoTextoLongo, campoPilulas, campoSelecao, interruptor, botao, esqueletos } from '../nucleo/componentes.js';
import { traduzirErro } from '../nucleo/erros.js';
import { buscarServico, concluirServico } from '../servicos/servicos.js';
import { listarAparelhosDoCliente } from '../servicos/aparelhos.js';
import { validarConclusao } from '../dominio/validacoes.js';
import { resumoDoAparelho } from '../dominio/aparelhos.js';
import { STATUS } from '../dominio/servicos.js';
import { hojeISO } from '../dominio/datas.js';
import { PRAZOS_RETORNO_MESES, GARANTIA_DIAS } from '../nucleo/constantes.js';
import { sessao } from '../nucleo/sessao.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar, mostrarNaoEncontrado } from './servicos-comum.js';

export default async function montar(ctx) {
  const { raiz, params, ir } = ctx;
  const usuario = contextoDoUsuario();
  const voltarPara = `#/servico/${params.id}`;

  async function carregar() {
    mostrar(raiz, html`${cabecalho({ titulo: 'Concluir serviço', voltarPara })}${esqueletos(2)}`);
    try {
      await carregarEstilos();
      const servico = await buscarServico(usuario.empresaId, params.id);
      if (!ctx.ativo()) return;
      if (!servico) return mostrarNaoEncontrado(raiz, 'Serviço não encontrado', 'Ele pode ter sido excluído.', '#/agenda');
      if (servico.status !== STATUS.AGENDADO) {
        return mostrarNaoEncontrado(raiz, 'Serviço já fechado', 'Este serviço já foi concluído ou cancelado.', voltarPara);
      }
      // Aparelhos só são necessários no administrador (para trocar o aparelho em "Mais opções").
      const aparelhos = usuario.admin && servico.clienteId
        ? await listarAparelhosDoCliente(usuario.empresaId, servico.clienteId).catch(() => [])
        : [];
      if (!ctx.ativo()) return;
      desenhar(servico, aparelhos);
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregar, cabecalho({ titulo: 'Concluir serviço', voltarPara }));
    }
  }

  function desenhar(s, aparelhos) {
    const tipo = sessao.tipos.find((t) => t.id === s.tipoServicoId);
    const geraRetorno = s.geraRetorno === true;
    const mesesPadrao = PRAZOS_RETORNO_MESES.includes(tipo?.retornoPadraoMeses) ? tipo.retornoPadraoMeses : 6;

    mostrar(raiz, html`
      ${cabecalho({ titulo: 'Concluir serviço', subtitulo: `${s.tipoServicoNome} · ${s.clienteNome}`, voltarPara })}
      <form id="form-concluir" class="formulario" novalidate>
        <div data-erros-gerais></div>
        ${campoTextoLongo({ nome: 'descricao', rotulo: 'O que foi feito?', linhas: 4, maximo: 2000, placeholder: 'Ex.: limpeza completa, troca do dreno' })}
        ${usuario.admin ? campoTexto({ nome: 'valor', rotulo: 'Valor (R$)', modo: 'decimal', placeholder: '150,00' }) : ''}
        ${interruptor({ nome: 'pago', titulo: 'O cliente já pagou?', descricao: usuario.admin ? '' : 'Só marque se o cliente pagou na hora.' })}
        ${geraRetorno ? campoPilulas({
          nome: 'retornoMeses', rotulo: 'Avisar para voltar daqui a quanto tempo?',
          opcoes: PRAZOS_RETORNO_MESES.map((m) => ({ valor: String(m), rotulo: `${m} meses` })), valor: String(mesesPadrao),
        }) : ''}
        <p class="texto-suave texto-pequeno">Garantia de ${GARANTIA_DIAS} dias a partir de hoje.</p>

        ${usuario.admin ? html`
          <details class="detalhes">
            <summary>Mais opções</summary>
            <div class="pilha">
              ${campoTexto({ nome: 'dataConclusao', rotulo: 'Data do serviço', tipo: 'date', valor: hojeISO(), maximo: 10 })}
              ${aparelhos.length > 0 ? campoSelecao({
                nome: 'aparelhoId', rotulo: 'Aparelho atendido', valor: s.aparelhoId || '', vazio: 'Não informar',
                opcoes: aparelhos.map((a) => ({ valor: a.id, rotulo: resumoDoAparelho(a) })),
              }) : ''}
            </div>
          </details>` : ''}

        ${botao({ texto: 'Concluir serviço', tipo: 'submit', iconeNome: 'check', bloco: true })}
      </form>`);

    const form = raiz.querySelector('#form-concluir');
    aoEnviar(form, async () => {
      limparErrosGerais(form);
      const campos = lerCampos(form);
      const r = validarConclusao(campos, { exigirValor: usuario.admin, geraRetorno });
      if (!r.valido) {
        mostrarErrosNosCampos(form, r.erros);
        return;
      }
      await comCarregando(form.querySelector('[type="submit"]'), async () => {
        try {
          await concluirServico({
            empresaId: usuario.empresaId, servico: s, papel: usuario.admin ? 'admin' : 'tecnico', nomeQuemConcluiu: usuario.nome,
            dados: {
              descricao: r.dados.descricao, pago: r.dados.pago, retornoMeses: r.dados.retornoMeses,
              valorCentavos: r.dados.valorCentavos,
              aparelho: aparelhos.find((a) => a.id === r.dados.aparelhoId) || null,
              dataConclusaoISO: usuario.admin ? (campos.dataConclusao || null) : null,
            },
          });
          toast('Serviço concluído!', 'sucesso');
          ir('/');
        } catch (erro) {
          mostrarErrosNosCampos(form, { geral: traduzirErro(erro) });
        }
      });
    });
  }

  await carregar();
}
