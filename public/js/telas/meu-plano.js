// =============================================================================
// TELA: Meu plano
// =============================================================================
// Mostra o plano atual, o uso de clientes, a validade/teste e os planos que o
// dono do app oferece. A cobrança é manual: o botão abre o WhatsApp de vendas
// com a mensagem pronta pedindo a ativação; o dono ativa o plano depois do Pix.
// =============================================================================

import { html, mostrar } from '../nucleo/ui.js';
import { cabecalho, botao, aviso, selo, listaDeDados, esqueletos } from '../nucleo/componentes.js';
import { resumoDoPlano, sessao as sessaoGlobal } from '../nucleo/sessao.js';
import { listarPlanos, lerRegras } from '../servicos/planos.js';
import { fimDoTeste, rotuloSituacao, textoLimite } from '../dominio/planos.js';
import { formatarReais } from '../dominio/dinheiro.js';
import { formatarDataBR } from '../dominio/datas.js';
import { normalizarWhatsappBR } from '../dominio/telefone.js';
import { linkWhatsapp } from '../dominio/whatsapp.js';
import { REGRAS_PADRAO, LIMITE_ILIMITADO } from '../nucleo/constantes.js';
import { mostrarFalha, seloSituacao } from './_auxiliar-admin.js';

export default async function montar({ raiz, sessao, recarregar, ativo }) {
  mostrar(raiz, html`${cabecalho({ titulo: 'Meu plano', voltarPara: '#/administrativa' })}${esqueletos(3)}`);

  let planos;
  let regras;
  try {
    [planos, regras] = await Promise.all([listarPlanos(), lerRegras()]);
  } catch (erro) {
    if (ativo()) mostrarFalha(raiz, erro, recarregar);
    return;
  }
  if (!ativo()) return;
  regras = { ...REGRAS_PADRAO, ...(regras || {}) };

  const resumo = resumoDoPlano();
  const empresa = sessao.empresa;
  const disponiveis = planos.filter((p) => p.ativo !== false);
  const numeroVendas = regras.whatsappVendas ? normalizarWhatsappBR(regras.whatsappVendas) : null;

  // Preço com o desconto de lançamento (se o dono ligou).
  const desconto = regras.descontoLancamentoAtivo === true ? Number(regras.descontoLancamentoPercentual) || 0 : 0;
  const precoFinal = (p) => Math.round((p.precoCentavos * (100 - desconto)) / 100);

  /** Link do WhatsApp pedindo ativação do plano escolhido. */
  const linkDoPlano = (p) => {
    if (!numeroVendas) return null;
    const texto = `Olá! Quero ativar o plano ${p.nome} (${formatarReais(precoFinal(p))}/mês) no Meu Técnico. `
      + `Empresa: ${empresa.nome}. E-mail: ${empresa.emailAdmin || sessaoGlobal.usuario?.email || ''}.`;
    return linkWhatsapp(numeroVendas, texto);
  };

  // Frase sobre validade / teste.
  let validade = '';
  if (resumo.situacao === 'ativa') validade = `Plano pago válido até ${formatarDataBR(empresa.planoAte)}`;
  else if (resumo.situacao === 'teste') validade = `Teste grátis com tudo liberado até ${formatarDataBR(fimDoTeste(empresa, sessao.regras))}`;
  else if (resumo.situacao === 'vencida') validade = `Plano vencido em ${formatarDataBR(empresa.planoAte)}`;

  const limite = resumo.limite;
  const ilimitado = limite >= LIMITE_ILIMITADO;
  const percentual = ilimitado || limite === 0 ? 0 : Math.min(100, Math.round((resumo.usados / limite) * 100));

  mostrar(raiz, html`
    ${cabecalho({ titulo: 'Meu plano', voltarPara: '#/administrativa' })}
    <div class="pilha">
      ${resumo.situacao === 'vencida' && aviso({ tom: 'amarelo', titulo: 'Plano vencido', texto: 'Você não pode cadastrar novos clientes até renovar. Seus dados continuam guardados.' })}

      <section class="cartao pilha pilha--pequena" aria-label="Plano atual">
        <div class="linha linha--entre">
          <h2>${resumo.plano.nome}</h2>
          ${seloSituacao(resumo.situacao, rotuloSituacao(resumo.situacao))}
        </div>
        ${validade && html`<p class="texto-suave">${validade}</p>`}
        ${listaDeDados([
          ['Clientes', `${resumo.usados} de ${textoLimite(limite)}`],
          ['Financeiro completo', resumo.financeiroCompleto ? 'Liberado' : 'Não incluído'],
        ])}
        ${!ilimitado && html`<div class="barra-horizontal" role="img" aria-label="${percentual}% do limite de clientes usado">
          <div class="barra-horizontal__preenchimento" data-largura="${percentual}"></div></div>`}
        ${!resumo.podeCadastrar && resumo.motivoBloqueio === 'limite' && html`<p class="texto-erro">Você chegou ao limite de clientes do plano.</p>`}
      </section>

      <h2>Planos disponíveis</h2>
      ${desconto > 0 && aviso({ tom: 'verde', texto: `Desconto de lançamento: ${desconto}% em todos os planos pagos.` })}
      ${disponiveis.length === 0
        ? aviso({ texto: 'Nenhum plano foi cadastrado ainda.' })
        : disponiveis.map((p) => {
          const atual = p.id === empresa.planoId;
          const link = linkDoPlano(p);
          const gratis = p.precoCentavos === 0;
          return html`
            <article class="cartao pilha pilha--pequena ${atual ? 'cartao--destaque' : ''}">
              <div class="linha linha--entre">
                <h3>${p.nome}</h3>
                ${atual && selo('Seu plano', 'azul')}
              </div>
              <div class="numero-medio">${gratis ? 'Grátis' : formatarReais(precoFinal(p))}${!gratis && html` <span class="texto-pequeno texto-suave">/mês</span>`}</div>
              ${!gratis && desconto > 0 && html`<p class="texto-pequeno texto-suave">Preço normal: ${formatarReais(p.precoCentavos)}</p>`}
              <ul class="lista-recursos">
                <li>${p.limiteClientes >= LIMITE_ILIMITADO ? 'Clientes sem limite' : `Até ${p.limiteClientes} clientes`}</li>
                <li>${p.financeiroCompleto ? 'Financeiro completo (gráficos e por tipo)' : 'Financeiro: só o resumo do dia'}</li>
                <li>Backup e equipe inclusos</li>
              </ul>
              ${p.descricao && html`<p class="texto-pequeno texto-suave">${p.descricao}</p>`}
              ${!atual && !gratis && (link
                ? botao({ texto: `Quero o plano ${p.nome}`, href: link, externo: true, variante: 'whatsapp', iconeNome: 'whatsapp', bloco: true })
                : botao({ texto: 'Contato de vendas indisponível', desabilitado: true, variante: 'secundario', bloco: true }))}
            </article>`;
        })}

      <section class="cartao pilha pilha--pequena">
        <h2>Como pagar</h2>
        ${regras.instrucoesPagamento
          ? html`<div class="mensagem-previa">${regras.instrucoesPagamento}</div>`
          : html`<p class="texto-suave">As instruções de pagamento serão informadas pelo atendimento.</p>`}
        <p class="texto-pequeno texto-suave">Escolha o plano acima: o WhatsApp abre com o pedido pronto. Depois do pagamento, o plano é ativado por 30 dias.</p>
        ${!numeroVendas && aviso({ tom: 'amarelo', texto: 'O contato de vendas ainda não foi configurado pelo dono do aplicativo.' })}
      </section>
    </div>`);
}
