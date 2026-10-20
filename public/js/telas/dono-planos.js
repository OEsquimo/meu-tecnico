// =============================================================================
// TELA: Painel do dono — Planos e regras globais
// =============================================================================
// O dono do app controla TUDO daqui, sem mexer em código:
//   * planos (nome, preço, limite de clientes, financeiro completo, ativo, ordem);
//   * regras globais (dias de teste, desconto de lançamento, WhatsApp de vendas,
//     instruções de pagamento).
// Primeiro uso: botão "Criar planos e regras padrão".
// =============================================================================

import { html, mostrar, aoClicar, aoEnviar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, toast, confirmar, mostrarErro } from '../nucleo/ui.js';
import { cabecalho, botao, campoTexto, campoTextoLongo, interruptor, itemLista, selo, estadoVazio, esqueletos } from '../nucleo/componentes.js';
import { listarPlanos, lerRegras, salvarPlano, excluirPlano, salvarRegras, criarPlanosEregrasPadrao } from '../servicos/planos.js';
import { validarPlano, validarRegrasGlobais } from '../dominio/validacoes.js';
import { formatarReais, centavosParaCampo } from '../dominio/dinheiro.js';
import { formatarTelefone } from '../dominio/telefone.js';
import { textoLimite } from '../dominio/planos.js';
import { REGRAS_PADRAO, LIMITE_ILIMITADO } from '../nucleo/constantes.js';
import { recarregarSessao } from '../nucleo/sessao.js';
import { traduzirErro } from '../nucleo/erros.js';
import { mostrarFalha, seta } from './_auxiliar-admin.js';

export default async function montar(ctx) {
  const { raiz } = ctx;
  const topo = cabecalho({ titulo: 'Planos e regras' });
  let planos = [];
  let regras = REGRAS_PADRAO;
  let editando = null; // null = lista; { id?, novo } = formulário de plano

  async function carregar() {
    mostrar(raiz, html`${topo}${esqueletos(3)}`);
    try {
      [planos, regras] = await Promise.all([listarPlanos(), lerRegras().then((r) => r || REGRAS_PADRAO).catch(() => REGRAS_PADRAO)]);
      if (!ctx.ativo()) return;
      desenharLista();
    } catch (erro) {
      if (ctx.ativo()) mostrarFalha(raiz, erro, carregar);
    }
  }

  // ---------------------------------------------------------------------------
  // Lista de planos + regras
  // ---------------------------------------------------------------------------
  function desenharLista() {
    editando = null;
    mostrar(raiz, html`
      ${topo}
      <div class="pilha">
        ${planos.length === 0 ? estadoVazio({
          icone: 'estrela', titulo: 'Nenhum plano criado',
          texto: 'Crie os planos e as regras padrão (você pode mudar tudo depois).',
          acao: botao({ texto: 'Criar planos e regras padrão', acao: 'criar-padrao' }),
        }) : html`
          ${botao({ texto: 'Novo plano', iconeNome: 'mais', acao: 'novo-plano', bloco: true })}
          <div class="lista pilha pilha--pequena">
            ${planos.map((p) => itemLista({
              acao: 'editar-plano', dados: { id: p.id },
              titulo: p.nome, sub: `${formatarReais(p.precoCentavos)}/mês · ${textoLimite(p.limiteClientes)}${p.financeiroCompleto ? ' · Financeiro completo' : ''}`,
              inativo: p.ativo === false, direita: html`${p.ativo === false ? selo('Inativo') : ''}${seta}`,
            }))}
          </div>`}

        <form id="form-regras" class="cartao formulario" novalidate>
          <h2>Regras gerais</h2>
          <div data-erros-gerais></div>
          ${campoTexto({ nome: 'diasTeste', rotulo: 'Dias de teste grátis (conta nova)', tipo: 'number', modo: 'numeric', valor: regras.diasTeste ?? 7, minimo: 0 })}
          ${interruptor({ nome: 'descontoAtivo', titulo: 'Desconto de lançamento ligado', marcado: regras.descontoLancamentoAtivo === true })}
          ${campoTexto({ nome: 'descontoPercentual', rotulo: 'Desconto (%)', tipo: 'number', modo: 'numeric', valor: regras.descontoLancamentoPercentual ?? 0, minimo: 0 })}
          ${campoTexto({ nome: 'whatsappVendas', rotulo: 'WhatsApp para contratar plano', tipo: 'tel', modo: 'tel', valor: regras.whatsappVendas ? formatarTelefone(regras.whatsappVendas) : '', opcional: true })}
          ${campoTextoLongo({ nome: 'instrucoesPagamento', rotulo: 'Instruções de pagamento (ex.: chave Pix)', valor: regras.instrucoesPagamento ?? '', opcional: true, maximo: 500, linhas: 3 })}
          ${botao({ texto: 'Salvar regras', tipo: 'submit', bloco: true })}
        </form>
      </div>`);

    const form = raiz.querySelector('#form-regras');
    aoEnviar(form, async () => {
      limparErrosGerais(form);
      const c = lerCampos(form);
      const r = validarRegrasGlobais({ ...c, descontoAtivo: c.descontoAtivo === true || c.descontoAtivo === 'on' });
      if (!r.valido) { mostrarErrosNosCampos(form, r.erros); return; }
      await comCarregando(form.querySelector('[type="submit"]'), async () => {
        try {
          await salvarRegras(r.dados);
          regras = r.dados;
          await recarregarSessao();
          toast('Regras salvas.', 'sucesso');
        } catch (erro) { mostrarErrosNosCampos(form, { geral: traduzirErro(erro) }); }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Formulário de plano (novo / editar)
  // ---------------------------------------------------------------------------
  function desenharFormulario(plano) {
    const novo = !plano;
    const p = plano || { id: '', nome: '', precoCentavos: 0, limiteClientes: 10, financeiroCompleto: false, ativo: true, ordem: planos.length + 1, descricao: '' };
    const ilimitado = p.limiteClientes >= LIMITE_ILIMITADO;
    editando = { id: p.id, novo };
    mostrar(raiz, html`
      <header class="cabecalho"><button type="button" class="cabecalho__voltar" data-acao="cancelar-plano" aria-label="Voltar">‹</button>
        <div class="cabecalho__textos"><h1 class="titulo-tela" tabindex="-1" id="titulo-da-tela">${novo ? 'Novo plano' : p.nome}</h1></div></header>
      <form id="form-plano" class="formulario" novalidate>
        <div data-erros-gerais></div>
        ${novo ? campoTexto({ nome: 'id', rotulo: 'Código do plano', placeholder: 'premium', ajuda: 'Letras minúsculas, números e hífen. Não muda depois.' }) : ''}
        ${campoTexto({ nome: 'nome', rotulo: 'Nome do plano', valor: p.nome, maximo: 40 })}
        ${campoTexto({ nome: 'preco', rotulo: 'Preço por mês (R$)', modo: 'decimal', valor: centavosParaCampo(p.precoCentavos) })}
        ${campoTexto({ nome: 'limiteClientes', rotulo: 'Limite de clientes', tipo: 'number', modo: 'numeric', valor: ilimitado ? '' : p.limiteClientes, minimo: 0 })}
        ${interruptor({ nome: 'ilimitado', titulo: 'Clientes ilimitados', marcado: ilimitado })}
        ${interruptor({ nome: 'financeiroCompleto', titulo: 'Inclui Financeiro completo', marcado: p.financeiroCompleto })}
        ${interruptor({ nome: 'ativo', titulo: 'Plano disponível para contratar', marcado: p.ativo !== false })}
        ${campoTexto({ nome: 'ordem', rotulo: 'Ordem na lista', tipo: 'number', modo: 'numeric', valor: p.ordem ?? 99 })}
        ${campoTexto({ nome: 'descricao', rotulo: 'Descrição curta', valor: p.descricao, opcional: true, maximo: 120 })}
        ${botao({ texto: 'Salvar plano', tipo: 'submit', bloco: true })}
        ${!novo && p.id !== 'gratis' ? botao({ texto: 'Excluir plano', variante: 'perigo', iconeNome: 'lixeira', acao: 'excluir-plano', bloco: true }) : ''}
      </form>`);

    const form = raiz.querySelector('#form-plano');
    aoEnviar(form, async () => {
      limparErrosGerais(form);
      const c = lerCampos(form);
      const marcado = (v) => v === true || v === 'on';
      const r = validarPlano({
        ...c, id: novo ? c.id : p.id, ilimitado: marcado(c.ilimitado), financeiroCompleto: marcado(c.financeiroCompleto), ativo: marcado(c.ativo),
      }, { novo });
      if (!r.valido) { mostrarErrosNosCampos(form, r.erros); return; }
      if (novo && planos.some((x) => x.id === r.dados.id)) { mostrarErrosNosCampos(form, { id: 'Já existe um plano com esse código.' }); return; }
      const ordem = Number(c.ordem);
      await comCarregando(form.querySelector('[type="submit"]'), async () => {
        try {
          await salvarPlano(r.dados.id, { ...r.dados, ordem: Number.isFinite(ordem) ? ordem : 99 });
          await recarregarSessao();
          toast('Plano salvo.', 'sucesso');
          await carregar();
        } catch (erro) { mostrarErrosNosCampos(form, { geral: traduzirErro(erro) }); }
      });
    });
  }

  aoClicar(raiz, {
    'criar-padrao': (el) => comCarregando(el, async () => {
      try { await criarPlanosEregrasPadrao(); await recarregarSessao(); toast('Planos criados.', 'sucesso'); await carregar(); } catch (e) { mostrarErro(e); }
    }),
    'novo-plano': () => desenharFormulario(null),
    'editar-plano': (el) => desenharFormulario(planos.find((x) => x.id === el.dataset.id)),
    'cancelar-plano': () => desenharLista(),
    'excluir-plano': async (el) => {
      if (!await confirmar({ titulo: 'Excluir este plano?', mensagem: 'Empresas que já usam este plano continuam com ele até você trocar na tela Contas.', confirmar: 'Excluir', perigo: true })) return;
      await comCarregando(el, async () => {
        try { await excluirPlano(editando.id); await recarregarSessao(); toast('Plano excluído.', 'sucesso'); await carregar(); } catch (e) { mostrarErro(e); }
      });
    },
  });

  await carregar();
}
