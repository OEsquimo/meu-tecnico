// =============================================================================
// TELA: Horário de funcionamento (só administrador)
// =============================================================================
// Para cada dia da semana: aberto ou fechado e o horário de abrir e fechar.
// O seletor de dia e hora do agendamento só oferece horários dentro disso.
// Aqui também ficam a pausa de almoço e o limite de horas de serviço por técnico por dia.
// =============================================================================

import { html, mostrar, aoEnviar, mostrarErrosNosCampos, limparErrosGerais, comCarregando, toast } from '../nucleo/ui.js';
import { cabecalho, campoTexto, interruptor, botao } from '../nucleo/componentes.js';
import { traduzirErro } from '../nucleo/erros.js';
import { empresaId, recarregarEmpresa } from '../nucleo/sessao.js';
import { salvarExpediente, salvarRegrasDeTrabalho } from '../servicos/empresas.js';
import { DIAS_DA_SEMANA_CHAVES, ROTULOS_DOS_DIAS, expedienteDaEmpresa, validarExpediente, regrasDaEmpresa, validarRegrasDeTrabalho } from '../dominio/expediente.js';

export default async function montar({ raiz, sessao, ir }) {
  const atual = expedienteDaEmpresa(sessao.empresa);
  const regras = regrasDaEmpresa(sessao.empresa);

  mostrar(raiz, html`
    ${cabecalho({ titulo: 'Horário de funcionamento', voltarPara: '#/administrativa' })}
    <form id="form-expediente" class="formulario" novalidate>
      <div data-erros-gerais></div>
      <p class="campo__ajuda">Ao agendar, o app só oferece dias e horários dentro deste funcionamento. Dia desligado fica sem horários.</p>
      ${DIAS_DA_SEMANA_CHAVES.map((chave, i) => html`
        <section class="cartao pilha pilha--pequena" data-dia="${chave}">
          ${interruptor({ nome: `${chave}-aberto`, titulo: ROTULOS_DOS_DIAS[i], marcado: atual[chave].aberto })}
          <div class="grade-2">
            ${campoTexto({ nome: `${chave}-de`, rotulo: 'Abre às', tipo: 'time', valor: atual[chave].de })}
            ${campoTexto({ nome: `${chave}-ate`, rotulo: 'Fecha às', tipo: 'time', valor: atual[chave].ate })}
          </div>
        </section>`)}
      <section class="cartao pilha pilha--pequena" data-secao="almoco">
        ${interruptor({ nome: 'almoco-ativo', titulo: 'Pausa de almoço', descricao: 'Nesse intervalo ninguém é agendado, e um serviço de até 4 horas não atravessa o almoço.', marcado: regras.almoco.ativo })}
        <div class="grade-2">
          ${campoTexto({ nome: 'almoco-de', rotulo: 'Começa às', tipo: 'time', valor: regras.almoco.de })}
          ${campoTexto({ nome: 'almoco-ate', rotulo: 'Termina às', tipo: 'time', valor: regras.almoco.ate })}
        </div>
      </section>
      <section class="cartao pilha pilha--pequena" data-secao="limite">
        ${campoTexto({ nome: 'limiteHoras', rotulo: 'Limite de horas de serviço por técnico, por dia', tipo: 'text', valor: String(regras.limiteMin / 60).replace('.', ','), ajuda: 'Quando o técnico chega nesse limite, o dia fica vermelho para ele. Digite 0 para não limitar.' })}
      </section>
      ${botao({ texto: 'Salvar horário', tipo: 'submit', bloco: true })}
    </form>`);

  const form = raiz.querySelector('#form-expediente');
  aoEnviar(form, async () => {
    limparErrosGerais(form);
    const entrada = {};
    for (const chave of DIAS_DA_SEMANA_CHAVES) {
      entrada[chave] = {
        aberto: form.elements[`${chave}-aberto`].checked,
        de: form.elements[`${chave}-de`].value,
        ate: form.elements[`${chave}-ate`].value,
      };
    }
    const r = validarExpediente(entrada);
    const g = validarRegrasDeTrabalho({ almocoAtivo: form.elements['almoco-ativo'].checked, de: form.elements['almoco-de'].value, ate: form.elements['almoco-ate'].value, limiteHoras: form.elements.limiteHoras.value });
    if (!r.valido || !g.valido) {
      mostrarErrosNosCampos(form, { ...r.erros, ...g.erros });
      return;
    }
    await comCarregando(form.querySelector('[type="submit"]'), async () => {
      try {
        await salvarExpediente(empresaId(), r.dados);
        await salvarRegrasDeTrabalho(empresaId(), g.dados);
        await recarregarEmpresa(); // a sessão passa a usar o novo horário
        toast('Horário de funcionamento salvo.', 'sucesso');
        ir('/administrativa');
      } catch (erro) {
        mostrarErrosNosCampos(form, { geral: traduzirErro(erro) });
      }
    });
  });
}
