// =============================================================================
// TELA: Configurações da empresa
// =============================================================================
// Nome da empresa, quantos dias antes o app avisa do retorno, texto do lembrete
// de WhatsApp (com prévia ao vivo) e se o técnico pode cadastrar clientes.
// Variáveis do texto: {nome} {empresa} {servico} {aparelho}
// =============================================================================

import { html, mostrar, aoEnviar, aoClicar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, toast } from '../nucleo/ui.js';
import { cabecalho, campoTexto, campoTextoLongo, interruptor, botao } from '../nucleo/componentes.js';
import { traduzirErro } from '../nucleo/erros.js';
import { empresaId, recarregarEmpresa } from '../nucleo/sessao.js';
import { salvarConfiguracoes } from '../servicos/empresas.js';
import { validarConfiguracoes } from '../dominio/validacoes.js';
import { montarMensagem } from '../dominio/whatsapp.js';
import { MENSAGEM_WHATSAPP_PADRAO } from '../nucleo/constantes.js';

export default async function montar({ raiz, sessao, ir }) {
  const e = sessao.empresa;

  mostrar(raiz, html`
    ${cabecalho({ titulo: 'Configurações', voltarPara: '#/administrativa' })}
    <form id="form-config" class="formulario" novalidate>
      <div data-erros-gerais></div>
      ${campoTexto({ nome: 'nome', rotulo: 'Nome da empresa', valor: e.nome, maximo: 100 })}
      ${campoTexto({
        nome: 'diasAvisoRetorno', rotulo: 'Avisar do retorno com quantos dias de antecedência?', tipo: 'number', modo: 'numeric',
        valor: e.diasAvisoRetorno ?? 15, minimo: 0, ajuda: 'Use de 0 a 90 dias. O padrão é 15.',
      })}
      ${campoTextoLongo({
        nome: 'mensagemWhatsapp', rotulo: 'Mensagem do lembrete (WhatsApp)', valor: e.mensagemWhatsapp ?? MENSAGEM_WHATSAPP_PADRAO,
        linhas: 5, maximo: 600,
        ajuda: 'Variáveis: {nome} {empresa} {servico} {aparelho}. Elas são trocadas pelos dados de cada cliente.',
      })}
      <div class="pilha pilha--pequena">
        <span class="campo__rotulo">Prévia</span>
        <div class="mensagem-previa" id="previa" aria-live="polite"></div>
        ${botao({ texto: 'Voltar à mensagem padrão', variante: 'fantasma', acao: 'padrao', pequeno: true })}
      </div>
      ${interruptor({
        nome: 'permiteTecnicoCliente',
        titulo: 'Técnicos podem cadastrar clientes',
        descricao: 'Desligado: só você cadastra e edita clientes.',
        marcado: e.permiteTecnicoCliente === true,
      })}
      ${botao({ texto: 'Salvar configurações', tipo: 'submit', bloco: true })}
    </form>`);

  const form = raiz.querySelector('#form-config');
  const previa = raiz.querySelector('#previa');

  // Atualiza a prévia com dados de exemplo a cada letra digitada.
  const atualizarPrevia = () => {
    previa.textContent = montarMensagem(form.elements.mensagemWhatsapp.value, {
      nome: 'Maria',
      empresa: form.elements.nome.value.trim() || e.nome,
      servico: 'Limpeza',
      aparelho: 'Sala · Split 12.000 BTUs',
    });
  };
  form.elements.mensagemWhatsapp.addEventListener('input', atualizarPrevia);
  form.elements.nome.addEventListener('input', atualizarPrevia);
  atualizarPrevia();

  aoClicar(raiz, {
    padrao: () => {
      form.elements.mensagemWhatsapp.value = MENSAGEM_WHATSAPP_PADRAO;
      atualizarPrevia();
    },
  });

  aoEnviar(form, async () => {
    limparErrosGerais(form);
    const r = validarConfiguracoes(lerCampos(form));
    if (!r.valido) {
      mostrarErrosNosCampos(form, r.erros);
      return;
    }
    await comCarregando(form.querySelector('[type="submit"]'), async () => {
      try {
        await salvarConfiguracoes(empresaId(), r.dados);
        await recarregarEmpresa(); // a sessão passa a usar os novos valores
        toast('Configurações salvas.', 'sucesso');
        ir('/administrativa');
      } catch (erro) {
        mostrarErrosNosCampos(form, { geral: traduzirErro(erro) });
      }
    });
  });
}
