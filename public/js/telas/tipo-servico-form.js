// =============================================================================
// TELA: Tipo de serviço (novo e editar) — rotas /tipos-servico/novo e /tipos-servico/:id
// =============================================================================
// Campos: nome, "gera retorno" (interruptor), prazo padrão (3/4/6/12 meses),
// ativo (só ao editar). O prazo só aparece quando "gera retorno" está ligado.
// Excluir um tipo não altera o histórico: o nome fica copiado em cada serviço.
// =============================================================================

import { html, mostrar, aoEnviar, aoClicar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, confirmar, toast } from '../nucleo/ui.js';
import { cabecalho, campoTexto, campoPilulas, interruptor, botao, estadoVazio } from '../nucleo/componentes.js';
import { traduzirErro } from '../nucleo/erros.js';
import { empresaId } from '../nucleo/sessao.js';
import { criarTipo, atualizarTipo, excluirTipo } from '../servicos/tiposServico.js';
import { validarTipoServico } from '../dominio/validacoes.js';
import { PRAZOS_RETORNO_MESES } from '../nucleo/constantes.js';

export default async function montar({ raiz, params, sessao, ir }) {
  const novo = !params.id;
  const tipo = novo ? null : sessao.tipos.find((t) => t.id === params.id);

  // Endereço de um tipo que não existe (apagado em outro aparelho, por exemplo).
  if (!novo && !tipo) {
    mostrar(raiz, html`
      ${cabecalho({ titulo: 'Tipo de serviço', voltarPara: '#/tipos-servico' })}
      ${estadoVazio({ icone: 'info', titulo: 'Tipo não encontrado', texto: 'Ele pode ter sido excluído.', acao: botao({ texto: 'Ver todos os tipos', href: '#/tipos-servico' }) })}`);
    return;
  }

  const geraRetorno = novo ? true : tipo.geraRetorno === true;
  // Prazo marcado ao abrir: o do tipo, ou 6 meses se ainda não tinha.
  const prazo = tipo && PRAZOS_RETORNO_MESES.includes(tipo.retornoPadraoMeses) ? tipo.retornoPadraoMeses : 6;

  mostrar(raiz, html`
    ${cabecalho({ titulo: novo ? 'Novo tipo de serviço' : 'Editar tipo', voltarPara: '#/tipos-servico' })}
    <form id="form-tipo" class="formulario" novalidate>
      <div data-erros-gerais></div>
      ${campoTexto({ nome: 'nome', rotulo: 'Nome do serviço', valor: tipo?.nome ?? '', maximo: 60 })}
      ${interruptor({
        nome: 'geraRetorno',
        titulo: 'Gera retorno',
        descricao: 'O app avisa quando o cliente precisar repetir o serviço (ex.: limpeza).',
        marcado: geraRetorno,
      })}
      <div id="bloco-prazo" ${geraRetorno ? '' : html`hidden`}>
        ${campoPilulas({
          nome: 'retornoPadraoMeses',
          rotulo: 'Prazo padrão do retorno',
          opcoes: PRAZOS_RETORNO_MESES.map((m) => ({ valor: m, rotulo: `${m} meses` })),
          valor: prazo,
        })}
      </div>
      ${!novo && interruptor({
        nome: 'ativo',
        titulo: 'Ativo',
        descricao: 'Desligue para esconder este tipo na hora de agendar, sem apagar o histórico.',
        marcado: tipo.ativo !== false,
      })}
      ${botao({ texto: 'Salvar', tipo: 'submit', bloco: true })}
      ${!novo && botao({ texto: 'Excluir tipo', variante: 'perigo', acao: 'excluir', bloco: true, iconeNome: 'lixeira' })}
    </form>`);

  const form = raiz.querySelector('#form-tipo');
  const blocoPrazo = raiz.querySelector('#bloco-prazo');

  // Mostra/esconde o prazo conforme o interruptor.
  form.elements.geraRetorno.addEventListener('change', (e) => {
    blocoPrazo.hidden = !e.target.checked;
  });

  aoEnviar(form, async () => {
    limparErrosGerais(form);
    const campos = lerCampos(form);
    const r = validarTipoServico(campos);
    if (!r.valido) {
      mostrarErrosNosCampos(form, r.erros);
      return;
    }
    await comCarregando(form.querySelector('[type="submit"]'), async () => {
      try {
        if (novo) await criarTipo(empresaId(), r.dados);
        else await atualizarTipo(empresaId(), tipo, { ...r.dados, ativo: campos.ativo });
        toast('Tipo salvo.', 'sucesso');
        ir('/tipos-servico');
      } catch (erro) {
        mostrarErrosNosCampos(form, { geral: traduzirErro(erro) });
      }
    });
  });

  aoClicar(raiz, {
    excluir: async (botaoEl) => {
      const sim = await confirmar({
        titulo: `Excluir "${tipo.nome}"?`,
        mensagem: 'Os serviços já feitos continuam no histórico com este nome. Não dá para desfazer.',
        confirmar: 'Excluir',
        perigo: true,
      });
      if (!sim) return;
      await comCarregando(botaoEl, async () => {
        await excluirTipo(empresaId(), tipo.id);
        toast('Tipo excluído.', 'sucesso');
        ir('/tipos-servico');
      });
    },
  });
}
