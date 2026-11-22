// =============================================================================
// TELA: Configurações da empresa
// =============================================================================
// Nome da empresa, quantos dias antes o app avisa do retorno, texto do lembrete
// de WhatsApp (com prévia ao vivo) e se o técnico pode cadastrar clientes.
// Variáveis do texto: {nome} {empresa} {servico} {aparelho}
// =============================================================================

import { html, mostrar, aoEnviar, aoClicar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, toast, avancarEntreCampos } from '../nucleo/ui.js';
import { cabecalho, campoTexto, campoTextoLongo, campoPilulas, interruptor, botao } from '../nucleo/componentes.js';
import { traduzirErro } from '../nucleo/erros.js';
import { empresaId, recarregarEmpresa } from '../nucleo/sessao.js';
import { salvarConfiguracoes } from '../servicos/empresas.js';
import { validarConfiguracoes } from '../dominio/validacoes.js';
import { montarMensagem } from '../dominio/whatsapp.js';
import { montarCobranca, modeloDaEmpresa, MODELOS_COBRANCA, TONS_COBRANCA, TOM_COBRANCA_PADRAO, COBRANCA_MAX_LETRAS, PIX_MAX_LETRAS } from '../dominio/cobranca.js';
import { MENSAGEM_WHATSAPP_PADRAO } from '../nucleo/constantes.js';
import { modeloDaMensagemDeRetorno } from '../dominio/retornos.js';
import { MODELOS_DE_AVISO, CAMPO_DO_AVISO, modeloDoAviso, montarAviso, AVISO_MAX_LETRAS } from '../dominio/aviso-cliente.js';

const ROTULOS_DO_AVISO = { agendado: 'Aviso de agendamento', cancelado: 'Aviso de cancelamento', reagendado: 'Aviso de reagendamento' };

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
        nome: 'mensagemWhatsapp', rotulo: 'Mensagem do lembrete (WhatsApp)', valor: modeloDaMensagemDeRetorno(e),
        linhas: 5, maximo: 600,
        ajuda: 'Variáveis: {nome} {empresa} {servico} {aparelho} {tempo} (há quanto tempo foi o último serviço) {data} (dia do último serviço). Elas são trocadas pelos dados de cada cliente.',
      })}
      <div class="pilha pilha--pequena">
        <span class="campo__rotulo">Prévia</span>
        <div class="mensagem-previa" id="previa" aria-live="polite"></div>
        ${botao({ texto: 'Voltar ao lembrete padrão', variante: 'fantasma', acao: 'padrao', pequeno: true })}
      </div>
      <h2 class="titulo-secao">Cobrança pelo WhatsApp</h2>
      ${campoTexto({ nome: 'chavePix', rotulo: 'Chave Pix (opcional)', valor: e.chavePix ?? '', maximo: PIX_MAX_LETRAS, ajuda: 'Aparece na mensagem de cobrança. Sem chave, a linha do Pix some.' })}
      ${campoPilulas({ nome: 'tomCobranca', rotulo: 'Tom da mensagem', opcoes: TONS_COBRANCA.map((t) => ({ valor: t.id, rotulo: t.rotulo })), valor: e.tomCobranca || TOM_COBRANCA_PADRAO })}
      ${campoTextoLongo({
        nome: 'mensagemCobranca', rotulo: 'Mensagem de cobrança', valor: modeloDaEmpresa(e),
        linhas: 6, maximo: COBRANCA_MAX_LETRAS,
        ajuda: 'Variáveis: {nome} {servico} {aparelho} {data} {valor} {pix} {empresa} {lista}.',
      })}
      <div class="pilha pilha--pequena">
        <span class="campo__rotulo">Prévia da cobrança</span>
        <div class="mensagem-previa" id="previa-cobranca" aria-live="polite"></div>
        ${botao({ texto: 'Voltar à cobrança padrão', variante: 'fantasma', acao: 'padrao-cobranca', pequeno: true })}
      </div>
      <h2 class="titulo-secao">Aviso ao cliente pelo WhatsApp</h2>
      <p class="texto-suave">Depois de agendar, cancelar ou reagendar, o app mostra um painel para avisar o cliente (com estas mensagens) e os técnicos do serviço (mensagem fixa). Você só toca em enviar no WhatsApp.</p>
      ${['agendado', 'cancelado', 'reagendado'].map((tipo) => html`
        ${campoTextoLongo({
    nome: CAMPO_DO_AVISO[tipo], rotulo: ROTULOS_DO_AVISO[tipo], valor: modeloDoAviso(e, tipo), linhas: 9, maximo: AVISO_MAX_LETRAS,
    ajuda: 'Variáveis: {nome} {servico} {data} {hora} {tecnico} {endereco} {empresa}' + (tipo === 'cancelado' ? ' {link}' : '') + '. Linha sem informação não aparece.',
  })}
        <div class="pilha pilha--pequena">
          <span class="campo__rotulo">Prévia</span>
          <div class="mensagem-previa" id="previa-${tipo}" aria-live="polite"></div>
          ${botao({ texto: 'Voltar ao aviso padrão', variante: 'fantasma', acao: 'padrao-aviso', pequeno: true, dados: { tipo } })}
        </div>`)}
      ${interruptor({
        nome: 'permiteTecnicoCliente',
        titulo: 'Técnicos podem cadastrar clientes',
        descricao: 'Desligado: só você cadastra e edita clientes.',
        marcado: e.permiteTecnicoCliente === true,
      })}
      ${botao({ texto: 'Salvar configurações', tipo: 'submit', bloco: true })}
    </form>`);

  const form = raiz.querySelector('#form-config');
  avancarEntreCampos(form); // Enter vai ao próximo campo
  const previa = raiz.querySelector('#previa');

  // Atualiza a prévia com dados de exemplo a cada letra digitada.
  const atualizarPrevia = () => {
    previa.textContent = montarMensagem(form.elements.mensagemWhatsapp.value, {
      nome: 'Maria',
      empresa: form.elements.nome.value.trim() || e.nome,
      servico: 'Limpeza',
      aparelho: 'Sala · Split 12.000 BTUs',
      tempo: '6 meses',
      data: '15/05/2026',
    });
  };
  form.elements.mensagemWhatsapp.addEventListener('input', atualizarPrevia);
  form.elements.nome.addEventListener('input', atualizarPrevia);
  atualizarPrevia();

  const previaCobranca = raiz.querySelector('#previa-cobranca');
  const tomAtual = () => form.querySelector('input[name="tomCobranca"]:checked')?.value || TOM_COBRANCA_PADRAO;
  const atualizarPreviaCobranca = () => {
    previaCobranca.textContent = montarCobranca(form.elements.mensagemCobranca.value, {
      nome: 'Maria',
      empresa: form.elements.nome.value.trim() || e.nome,
      pix: form.elements.chavePix.value,
      itens: [{ servico: 'Limpeza', aparelho: 'Sala · Split 12.000 BTUs', data: new Date(), centavos: 18000 }],
    });
  };
  ['mensagemCobranca', 'chavePix', 'nome'].forEach((n) => form.elements[n].addEventListener('input', atualizarPreviaCobranca));
  form.addEventListener('change', (ev) => {
    if (ev.target.name === 'tomCobranca') {
      form.elements.mensagemCobranca.value = MODELOS_COBRANCA[tomAtual()];
      atualizarPreviaCobranca();
    }
  });
  atualizarPreviaCobranca();

  // Prévia dos 3 avisos com dados de exemplo.
  const exemploDeAviso = { nome: 'Maria', servicos: ['Limpeza'], dataHora: new Date(2026, 10, 16, 7, 0), tecnico: 'João', endereco: 'Rua das Flores, 120 · Centro', link: 'https://…' };
  const atualizarPreviaDoAviso = (tipo) => {
    raiz.querySelector(`#previa-${tipo}`).textContent = montarAviso(form.elements[CAMPO_DO_AVISO[tipo]].value, {
      ...exemploDeAviso, empresa: form.elements.nome.value.trim() || e.nome,
    });
  };
  for (const tipo of Object.keys(MODELOS_DE_AVISO)) {
    form.elements[CAMPO_DO_AVISO[tipo]].addEventListener('input', () => atualizarPreviaDoAviso(tipo));
    form.elements.nome.addEventListener('input', () => atualizarPreviaDoAviso(tipo));
    atualizarPreviaDoAviso(tipo);
  }

  aoClicar(raiz, {
    'padrao-aviso': (el) => {
      const tipo = el.dataset.tipo;
      form.elements[CAMPO_DO_AVISO[tipo]].value = MODELOS_DE_AVISO[tipo];
      atualizarPreviaDoAviso(tipo);
    },
    'padrao-cobranca': () => {
      form.elements.mensagemCobranca.value = MODELOS_COBRANCA[tomAtual()];
      atualizarPreviaCobranca();
    },
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
