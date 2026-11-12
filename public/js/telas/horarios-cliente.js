// =============================================================================
// TELA PÚBLICA: o cliente escolhe dia e horário (/horarios?...) — sem login, sem menu
// =============================================================================
// É a página que o cliente abre pelo link que o administrador mandou no WhatsApp. Uma tela só,
// de cima para baixo, em 3 passos numerados:
//   1) Escolha o dia   2) Escolha o horário (manhã e tarde)   3) Seus dados (nome; WhatsApp é opcional)
// Ao tocar em "Pedir este horário" aparece "Quase lá": o cliente toca em enviar no WhatsApp e o pedido
// chega ao administrador (com o botão "Técnico: abrir no app"). A página NÃO agenda nada sozinha.
//
// Os horários vêm dentro do próprio link (dominio/link-horarios.js): nada é lido do banco, e o link não
// guarda dado nenhum de cliente. Linguagem simples, botões grandes, nunca fica sem saída.
// =============================================================================

import { html, mostrar, aoClicar, aoEnviar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, levarAte, avancarEntreCampos } from '../nucleo/ui.js';
import { botao, aviso, estadoVazio, campoTexto } from '../nucleo/componentes.js';
import { icone } from '../nucleo/icones.js';
import { mesVizinho } from '../dominio/agenda.js';
import { calendarioDoMes } from './calendario-comum.js';
import { formatarDiaExtenso, formatarMesAno, hojeISO } from '../dominio/datas.js';
import { mascararTelefoneDigitando, formatarTelefone } from '../dominio/telefone.js';
import { linkWhatsapp } from '../dominio/whatsapp.js';
import {
  lerLinkDeHorarios, periodoDoHorario, validarPedidoDoCliente, mensagemDoPedido, linkDoPedidoNoApp, enderecoBaseDoApp,
} from '../dominio/link-horarios.js';
import { carregarEstilos } from './servicos-comum.js';

const ROTULOS_PERIODO = { manha: 'Manhã', tarde: 'Tarde' };

export default async function montar(ctx) {
  const { raiz, consulta } = ctx;
  await carregarEstilos();
  const link = lerLinkDeHorarios(consulta);
  const hoje = hojeISO();

  // ---- Link com problema: explica e dá uma saída (nunca fica sem resposta) ----
  if (!link.valido || !link.whatsapp) {
    const motivo = link.valido ? 'incompleto' : link.motivo;
    const textos = {
      incompleto: ['Link incompleto', 'Este link parece estar cortado. Peça um novo link ao técnico, pelo WhatsApp.'],
      vencido: ['Este link venceu', 'Os horários mudam todos os dias, por isso cada link vale por poucos dias. Peça um novo link ao técnico.'],
      'sem-horarios': ['Não há horário livre agora', 'Os horários deste link já passaram ou foram preenchidos. Fale com o técnico para combinar outro.'],
    }[motivo];
    const falar = link.whatsapp
      ? botao({ texto: 'Falar com o técnico no WhatsApp', variante: 'whatsapp', iconeNome: 'whatsapp', bloco: true, externo: true, href: linkWhatsapp(link.whatsapp, `Olá! Abri o link de horários da ${link.empresa}, mas ${motivo === 'vencido' ? 'ele venceu' : 'não encontrei horário livre'}. Pode me ajudar?`) })
      : '';
    mostrar(raiz, html`
      <div class="pagina-cliente">
        ${marca(link.empresa)}
        ${estadoVazio({ icone: 'alerta', titulo: textos[0], texto: textos[1], acao: falar })}
      </div>`);
    return undefined;
  }

  // ---- Estado da escolha ----
  const diasComHorario = new Map(link.dias.map((d) => [d.iso, d.horas]));
  const [anoInicial, mesInicial] = link.dias[0].iso.split('-').map(Number);
  let ano = anoInicial;
  let mes = mesInicial - 1;
  let dia = '';
  let hora = '';
  let nome = '';
  let whatsapp = '';

  const temDiaNoMes = (a, m) => link.dias.some((d) => d.iso.startsWith(`${a}-${String(m + 1).padStart(2, '0')}-`));

  mostrar(raiz, html`
    <div class="pagina-cliente">
      ${marca(link.empresa)}
      <h1 class="pagina-cliente__titulo" id="titulo-da-tela" tabindex="-1">Escolha o melhor dia e horário</h1>
      ${link.servico && html`<p class="texto-suave pagina-cliente__sub">Atendimento: ${link.servico}</p>`}
      <section class="passo cartao" aria-labelledby="passo-1"><h2 class="passo__titulo" id="passo-1"><span class="passo__numero">1</span>Escolha o dia</h2><div id="area-calendario"></div></section>
      <section class="passo cartao" id="passo-horario" aria-labelledby="passo-2" hidden><h2 class="passo__titulo" id="passo-2"><span class="passo__numero">2</span>Escolha o horário</h2><div id="area-horarios"></div></section>
      <section class="passo cartao" id="passo-dados" aria-labelledby="passo-3" hidden><h2 class="passo__titulo" id="passo-3"><span class="passo__numero">3</span>Seus dados</h2><div id="area-dados"></div></section>
    </div>`);

  function desenharCalendario() {
    const anterior = mesVizinho(ano, mes, -1);
    const proximo = mesVizinho(ano, mes, 1);
    const podeVoltar = temDiaNoMes(anterior.ano, anterior.mes);
    const podeAvancar = temDiaNoMes(proximo.ano, proximo.mes);
    mostrar(raiz.querySelector('#area-calendario'), html`
      <div class="seletor__mes">
        <button type="button" class="botao botao--secundario botao--pequeno" data-acao="mes" data-passo="-1" aria-label="Mês anterior" ${podeVoltar ? '' : html`disabled`}>‹</button>
        <strong>${formatarMesAno(ano, mes)}</strong>
        <button type="button" class="botao botao--secundario botao--pequeno" data-acao="mes" data-passo="1" aria-label="Próximo mês" ${podeAvancar ? '' : html`disabled`}>›</button>
      </div>
      ${calendarioDoMes({
    ano, mes, hoje, escolhido: dia, pontos: new Map(), acao: 'dia',
    desligado: (iso) => !diasComHorario.has(iso),
    complemento: (iso) => (diasComHorario.has(iso) ? ', com horário livre' : ', sem horário livre'),
  })}
      <p class="campo__ajuda">Os dias apagados não têm horário livre.</p>`);
  }

  function desenharHorarios() {
    const passo = raiz.querySelector('#passo-horario');
    passo.hidden = !dia;
    if (!dia) return;
    const horas = diasComHorario.get(dia) || [];
    const grupos = ['manha', 'tarde'].map((p) => ({ p, horas: horas.filter((h) => periodoDoHorario(h) === p) })).filter((g) => g.horas.length > 0);
    mostrar(raiz.querySelector('#area-horarios'), html`
      <p class="texto-suave">${formatarDiaExtenso(dia)}</p>
      ${grupos.map((g) => html`
        <div class="horarios-grupo">
          <div class="horarios-grupo__titulo">${ROTULOS_PERIODO[g.p]}</div>
          <div class="horarios-grade">
            ${g.horas.map((h) => html`<button type="button" class="horario-botao ${h === hora ? 'horario-botao--escolhido' : ''}" data-acao="hora" data-hora="${h}" aria-pressed="${h === hora ? 'true' : 'false'}">${h}</button>`)}
          </div>
        </div>`)}`);
  }

  function desenharDados() {
    const passo = raiz.querySelector('#passo-dados');
    const ja = !passo.hidden;
    passo.hidden = !(dia && hora);
    if (!dia || !hora || ja) return; // o formulário é desenhado uma vez; o que a pessoa digitou fica
    mostrar(raiz.querySelector('#area-dados'), html`
      <form id="form-pedido" class="formulario" novalidate>
        <div data-erros-gerais></div>
        ${campoTexto({ nome: 'nome', rotulo: 'Seu nome', valor: nome, maximo: 100, autocompletar: 'name' })}
        ${campoTexto({ nome: 'whatsapp', rotulo: 'Seu WhatsApp', opcional: true, tipo: 'tel', modo: 'tel', placeholder: '(11) 91234-5678', autocompletar: 'tel', valor: whatsapp })}
        ${botao({ texto: 'Pedir este horário', tipo: 'submit', bloco: true })}
      </form>`);
    const form = raiz.querySelector('#form-pedido');
    form.elements.nome.addEventListener('input', (e) => { nome = e.target.value; });
    form.elements.whatsapp.addEventListener('input', (e) => { e.target.value = mascararTelefoneDigitando(e.target.value); whatsapp = e.target.value; });
    avancarEntreCampos(form); // Enter no nome vai para o WhatsApp
    aoEnviar(form, () => enviar(form));
  }

  function enviar(form) {
    limparErrosGerais(form);
    const r = validarPedidoDoCliente(lerCampos(form));
    if (!r.valido) { mostrarErrosNosCampos(form, r.erros); return; }
    const base = enderecoBaseDoApp(window.location.href);
    const linkApp = linkDoPedidoNoApp(base, { data: dia, hora, nome: r.dados.nome, whatsapp: r.dados.whatsapp });
    const mensagem = mensagemDoPedido({ empresa: link.empresa, data: dia, hora, nome: r.dados.nome, whatsapp: r.dados.whatsapp, servico: link.servico, linkApp });
    desenharQuaseLa({ nome: r.dados.nome, whatsappCliente: r.dados.whatsapp, mensagem });
  }

  function desenharQuaseLa({ nome: nomeCliente, whatsappCliente, mensagem }) {
    mostrar(raiz, html`
      <div class="pagina-cliente">
        ${marca(link.empresa)}
        <h1 class="pagina-cliente__titulo" id="titulo-da-tela" tabindex="-1">Quase lá!</h1>
        <section class="cartao pilha pilha--pequena" aria-label="Seu pedido">
          <div class="resumo-pedido__linha">${icone('agenda', 20)}<span>${formatarDiaExtenso(dia)} às ${hora}</span></div>
          <div class="resumo-pedido__linha">${icone('clientes', 20)}<span>${nomeCliente}</span></div>
          ${whatsappCliente && html`<div class="resumo-pedido__linha">${icone('whatsapp', 20)}<span>${formatarTelefone(whatsappCliente)}</span></div>`}
        </section>
        ${aviso({ titulo: 'Falta só um toque', texto: 'Toque no botão abaixo e, no WhatsApp, aperte Enviar. É assim que o técnico recebe o seu pedido e confirma o horário com você.' })}
        ${botao({ texto: 'Enviar no WhatsApp', variante: 'whatsapp', iconeNome: 'whatsapp', bloco: true, externo: true, href: linkWhatsapp(link.whatsapp, mensagem), id: 'enviar-pedido' })}
        ${botao({ texto: 'Mudar o dia ou o horário', variante: 'fantasma', bloco: true, acao: 'mudar' })}
      </div>`);
    window.scrollTo(0, 0);
  }

  desenharCalendario();

  const desligar = aoClicar(raiz, {
    mes: (el) => {
      const v = mesVizinho(ano, mes, Number(el.dataset.passo));
      ano = v.ano; mes = v.mes;
      desenharCalendario();
    },
    dia: (el) => {
      dia = el.dataset.iso;
      hora = '';
      desenharCalendario();
      raiz.querySelector('#passo-dados').hidden = true; // volta a aparecer quando escolher o horário
      desenharHorarios();
      levarAte(raiz.querySelector('#passo-horario'), { focar: false });
    },
    hora: (el) => {
      const primeira = !hora;
      hora = el.dataset.hora;
      desenharHorarios();
      desenharDados();
      if (primeira) levarAte(raiz.querySelector('#passo-dados'), { focar: false });
    },
    mudar: () => ctx.recarregar(),
  });
  return desligar;
}

/** Nome da empresa no alto da página (a página não tem menu). */
function marca(empresa) {
  return html`<div class="pagina-cliente__marca">${empresa || 'Agendamento'}</div>`;
}
