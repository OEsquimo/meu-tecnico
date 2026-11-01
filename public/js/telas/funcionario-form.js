// =============================================================================
// TELA: Novo funcionário — só administrador
// =============================================================================
// Cria o convite (nome + WhatsApp). Depois leva à tela do link do convite.
// =============================================================================

import { html, mostrar, aoEnviar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando } from '../nucleo/ui.js';
import { cabecalho, campoTexto, interruptor, botao } from '../nucleo/componentes.js';
import { criarConvite } from '../servicos/equipe.js';
import { empresaId } from '../nucleo/sessao.js';
import { validarFuncionario } from '../dominio/validacoes.js';
import { mascararTelefoneDigitando } from '../dominio/telefone.js';
import { traduzirErro } from '../nucleo/erros.js';

export default async function montar({ raiz, ir }) {
  mostrar(raiz, html`
    ${cabecalho({ titulo: 'Novo funcionário', subtitulo: 'Ele recebe um link por WhatsApp', voltarPara: '#/equipe' })}
    <form id="form-func" class="formulario" novalidate>
      <div data-erros-gerais></div>
      ${campoTexto({ nome: 'nome', rotulo: 'Nome', maximo: 100, autocompletar: 'off' })}
      ${campoTexto({ nome: 'telefone', rotulo: 'WhatsApp', tipo: 'tel', modo: 'tel', placeholder: '(11) 91234-5678' })}
      ${interruptor({ nome: 'verValores', titulo: 'Pode ver valores', descricao: 'Vê o valor do serviço (para responder quando o cliente perguntar). Não vê o Financeiro.', marcado: false })}
      ${interruptor({ nome: 'alterarValores', titulo: 'Pode alterar valor e extras', descricao: 'Ao concluir, pode mudar o valor e acrescentar extras e desconto. Quem altera também vê.', marcado: false })}
      ${botao({ texto: 'Criar convite', tipo: 'submit', bloco: true })}
    </form>`);

  const form = raiz.querySelector('#form-func');
  form.elements.telefone.addEventListener('input', (e) => { e.target.value = mascararTelefoneDigitando(e.target.value); });

  aoEnviar(form, async () => {
    limparErrosGerais(form);
    const campos = lerCampos(form);
    const r = validarFuncionario(campos);
    if (!r.valido) { mostrarErrosNosCampos(form, r.erros); return; }
    await comCarregando(form.querySelector('[type="submit"]'), async () => {
      try {
        const id = await criarConvite(empresaId(), { ...r.dados, verValores: campos.verValores === true, alterarValores: campos.alterarValores === true });
        ir(`/equipe/convite/${id}`);
      } catch (erro) {
        mostrarErrosNosCampos(form, { geral: traduzirErro(erro) });
      }
    });
  });
}
