// =============================================================================
// TELA PÚBLICA: o cliente escolhe dia e horário (/horarios?...) — sem login, sem menu
// =============================================================================
// É a página que o cliente abre pelo link que o administrador mandou no WhatsApp. Uma tela só,
// de cima para baixo, em 3 passos numerados:
//   1) Qual serviço você precisa? (marca um ou mais; "Não sei ainda" vale sozinho)   2) Escolha o dia
//   3) Escolha o horário (manhã e tarde)   4) Seus dados (nome, WhatsApp e endereço; referência é opcional)
// Link antigo, sem lista de serviços, começa direto no dia (3 passos).
// Ao tocar em "Pedir este horário" aparece "Quase lá": o cliente toca em enviar no WhatsApp e o pedido
// chega ao administrador (com o botão "Técnico: abrir no app"). A página NÃO agenda nada sozinha.
//
// Os horários vêm dentro do próprio link (dominio/link-horarios.js): nada é lido do banco, e o link não
// guarda dado nenhum de cliente. Linguagem simples, botões grandes, nunca fica sem saída.
// =============================================================================

import { html, mostrar, aoClicar, aoEnviar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, levarAte, avancarEntreCampos, escolher, comCarregando } from '../nucleo/ui.js';
import { botao, aviso, estadoVazio, campoTexto } from '../nucleo/componentes.js';
import { icone } from '../nucleo/icones.js';
import { mesVizinho } from '../dominio/agenda.js';
import { calendarioDoMes } from './calendario-comum.js';
import { formatarDiaExtenso, formatarMesAno, hojeISO } from '../dominio/datas.js';
import { mascararTelefoneDigitando, formatarTelefone } from '../dominio/telefone.js';
import { linkWhatsapp } from '../dominio/whatsapp.js';
import { linhaDoEndereco } from '../dominio/endereco.js';
import {
  lerLinkDeHorarios, periodoDoHorario, validarPedidoDoCliente, validarServicosDoPedido, SERVICO_NAO_SEI, mensagemDoPedido, enderecoBaseDoApp,
} from '../dominio/link-horarios.js';
import { obterLocalizacao, buscarPorCoordenadas } from '../servicos/cep.js';
import { carregarEstilos, mostrarErroComTentar } from './servicos-comum.js';
import { lerLinkCurto, linkDoPedidoParaEnviar } from '../servicos/links-curtos.js';

const ROTULOS_PERIODO = { manha: 'Manhã', tarde: 'Tarde' };

export default async function montar(ctx) {
  const { raiz, params } = ctx;
  let { consulta } = ctx;
  await carregarEstilos();
  // Pacote 25: link curto "#/h/<código>": os horários estão guardados no banco; o resto da página é igual.
  const codigoCurto = params?.codigo || '';
  let empresaDoLink = '';
  let linkVencido = false;
  if (codigoCurto) {
    mostrar(raiz, html`<div class="pagina-cliente">${marca('')}<p class="texto-suave" role="status">Abrindo os horários…</p></div>`);
    let achado = null;
    try {
      achado = await lerLinkCurto(codigoCurto);
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, () => ctx.recarregar(), html`<div class="pagina-cliente">${marca('')}</div>`);
      return undefined;
    }
    if (!ctx.ativo()) return undefined;
    if (achado && achado.tipo === 'horarios' && !achado.vencido) {
      consulta = new URLSearchParams(achado.consulta);
      empresaDoLink = achado.empresaId;
    } else {
      consulta = new URLSearchParams();
      linkVencido = true;
    }
  }
  const link = linkVencido ? { valido: false, motivo: 'vencido', empresa: '', whatsapp: '', servicos: [], dias: [] } : lerLinkDeHorarios(consulta);
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
  let servicosMarcados = []; // o que o cliente marcou em "Qual serviço você precisa?"
  const opcoesDeServico = link.servicos || [];
  const deslocamento = opcoesDeServico.length > 0 ? 1 : 0; // com a pergunta do serviço, os passos andam um número
  let semGps = false; // o cliente disse que NÃO está no local: o botão da localização some
  let coordenadas = null; // só existe se o endereço veio do GPS e a rua e a cidade não foram mexidas depois
  let origemGps = null; // rua e cidade que o GPS trouxe (para saber se o cliente mexeu)

  const temDiaNoMes = (a, m) => link.dias.some((d) => d.iso.startsWith(`${a}-${String(m + 1).padStart(2, '0')}-`));

  mostrar(raiz, html`
    <div class="pagina-cliente">
      ${marca(link.empresa)}
      <h1 class="pagina-cliente__titulo" id="titulo-da-tela" tabindex="-1">Escolha o melhor dia e horário</h1>
      ${link.servico && opcoesDeServico.length === 0 && html`<p class="texto-suave pagina-cliente__sub">Atendimento: ${link.servico}</p>`}
      ${opcoesDeServico.length > 0 && html`
        <section class="passo cartao" id="passo-servico" aria-labelledby="passo-0"><h2 class="passo__titulo" id="passo-0"><span class="passo__numero">1</span>Qual serviço você precisa?</h2>
          <div id="area-servicos"></div>
        </section>`}
      <section class="passo cartao" aria-labelledby="passo-1"><h2 class="passo__titulo" id="passo-1"><span class="passo__numero">${1 + deslocamento}</span>Escolha o dia</h2><div id="area-calendario"></div></section>
      <section class="passo cartao" id="passo-horario" aria-labelledby="passo-2" hidden><h2 class="passo__titulo" id="passo-2"><span class="passo__numero">${2 + deslocamento}</span>Escolha o horário</h2><div id="area-horarios"></div></section>
      <section class="passo cartao" id="passo-dados" aria-labelledby="passo-3" hidden><h2 class="passo__titulo" id="passo-3"><span class="passo__numero">${3 + deslocamento}</span>Seus dados</h2><div id="area-dados"></div></section>
    </div>`);

  /** Quadro "Qual serviço você precisa?" (só em links novos). "Não sei ainda" vale sozinho: marcar um tira o outro. */
  function desenharServicos() {
    const area = raiz.querySelector('#area-servicos');
    if (!area) return;
    const todos = [...opcoesDeServico, SERVICO_NAO_SEI];
    mostrar(area, html`
      <div class="chips" role="group" aria-labelledby="passo-0">
        ${todos.map((n) => html`
          <label class="chip">
            <input type="checkbox" name="servicos" value="${n}" ${servicosMarcados.includes(n) ? html`checked` : ''} />
            <span class="chip__texto">${n}</span>
          </label>`)}
      </div>
      <p class="campo__ajuda">Marque um ou mais. Se não souber, marque "Não sei ainda": vocês combinam na conversa.</p>
      <div data-erro-servicos role="alert"></div>`);
  }

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
        ${campoTexto({ nome: 'whatsapp', rotulo: 'Seu WhatsApp', tipo: 'tel', modo: 'tel', placeholder: '(11) 91234-5678', autocompletar: 'tel', valor: whatsapp })}
        <h3 class="passo__subtitulo">Onde será o atendimento?</h3>
        <div id="area-gps"></div>
        ${campoTexto({ nome: 'rua', rotulo: 'Rua ou avenida', maximo: 120, autocompletar: 'street-address' })}
        ${campoTexto({ nome: 'numero', rotulo: 'Número', maximo: 15, placeholder: 'Se não tiver, escreva S/N' })}
        ${campoTexto({ nome: 'complemento', rotulo: 'Complemento', opcional: true, maximo: 60, placeholder: 'Apto, bloco, casa dos fundos...' })}
        ${campoTexto({ nome: 'bairro', rotulo: 'Bairro', opcional: true, maximo: 80 })}
        ${campoTexto({ nome: 'cidade', rotulo: 'Cidade', maximo: 80, autocompletar: 'address-level2' })}
        ${campoTexto({ nome: 'uf', rotulo: 'Estado (sigla)', opcional: true, maximo: 2, placeholder: 'Ex.: PE' })}
        ${campoTexto({ nome: 'referencia', rotulo: 'Ponto de referência', opcional: true, maximo: 120, placeholder: 'Ex.: portão azul, em frente à padaria' })}
        ${botao({ texto: 'Pedir este horário', tipo: 'submit', bloco: true })}
      </form>`);
    const form = raiz.querySelector('#form-pedido');
    form.elements.nome.addEventListener('input', (e) => { nome = e.target.value; });
    form.elements.whatsapp.addEventListener('input', (e) => { e.target.value = mascararTelefoneDigitando(e.target.value); whatsapp = e.target.value; });
    desenharGps();
    // Mexer na rua ou na cidade depois do GPS: o ponto do mapa deixa de valer.
    form.addEventListener('input', (e) => {
      if (!coordenadas || !origemGps) return;
      if ((e.target.name === 'rua' && e.target.value.trim() !== origemGps.rua) || (e.target.name === 'cidade' && e.target.value.trim() !== origemGps.cidade)) coordenadas = null;
    });
    avancarEntreCampos(form); // Enter vai passando de campo em campo
    aoEnviar(form, () => enviar(form));
  }

  /** Botão "Usar minha localização" (some se o cliente disser que não está no local). */
  function desenharGps() {
    const area = raiz.querySelector('#area-gps');
    if (!area) return;
    mostrar(area, semGps ? '' : html`
      ${botao({ texto: 'Usar minha localização', variante: 'secundario', iconeNome: 'local', acao: 'usar-localizacao', bloco: true })}
      <p class="campo__ajuda">Ou preencha o endereço abaixo.</p>`);
  }

  async function usarLocalizacao(el) {
    const form = raiz.querySelector('#form-pedido');
    limparErrosGerais(form);
    const resposta = await escolher({
      titulo: 'Você está no local do atendimento?',
      mensagem: 'A localização só vale se você estiver agora no lugar onde o serviço será feito.',
      opcoes: [{ id: 'sim', rotulo: 'Sim, estou aqui' }, { id: 'nao', rotulo: 'Não, vou digitar o endereço' }],
      cancelar: 'Voltar',
    });
    if (resposta === 'nao') { semGps = true; desenharGps(); form.elements.rua.focus(); return; }
    if (resposta !== 'sim') return;
    await comCarregando(el, async () => {
      try {
        const achado = await buscarPorCoordenadas(await obterLocalizacao());
        for (const [campo, valor] of Object.entries({ rua: achado.rua, numero: achado.numero, bairro: achado.bairro, cidade: achado.cidade, uf: achado.uf })) {
          if (valor) form.elements[campo].value = valor;
        }
        coordenadas = { lat: achado.lat, lng: achado.lng };
        origemGps = { rua: (achado.rua || '').trim(), cidade: (achado.cidade || '').trim() };
        mostrarErrosNosCampos(form, {});
        (form.elements.numero.value ? form.elements.complemento : form.elements.numero).focus();
        const dica = raiz.querySelector('#area-gps');
        dica.insertAdjacentHTML('beforeend', '<p class="campo__ajuda" role="status">Confira o endereço e complete o número.</p>');
      } catch (erro) {
        mostrarErrosNosCampos(form, { geral: erro?.message || 'Não consegui pegar sua localização. Preencha o endereço à mão.' });
      }
    });
  }

  async function enviar(form) {
    limparErrosGerais(form);
    const servicos = validarServicosDoPedido(servicosMarcados, opcoesDeServico);
    if (!servicos.valido) {
      mostrar(raiz.querySelector('[data-erro-servicos]'), html`<p class="campo__erro">${servicos.erro}</p>`);
      levarAte(raiz.querySelector('#passo-servico'));
      return;
    }
    const r = validarPedidoDoCliente({ ...lerCampos(form), lat: coordenadas?.lat, lng: coordenadas?.lng });
    if (!r.valido) { mostrarErrosNosCampos(form, r.erros); return; }
    const base = enderecoBaseDoApp(window.location.href);
    const botaoEnviar = form.querySelector('[type="submit"]');
    let linkApp = '';
    await comCarregando(botaoEnviar, async () => {
      // Link curto do pedido (guardado no banco, só o administrador lê); se não der, vai o comprido.
      linkApp = await linkDoPedidoParaEnviar(base, { origem: codigoCurto, empresaId: empresaDoLink, data: dia, hora, nome: r.dados.nome, whatsapp: r.dados.whatsapp, endereco: r.dados.endereco, referencia: r.dados.referencia, servicos: servicos.dados });
    });
    const mensagem = mensagemDoPedido({ empresa: link.empresa, data: dia, hora, nome: r.dados.nome, whatsapp: r.dados.whatsapp, endereco: r.dados.endereco, referencia: r.dados.referencia, servico: link.servico, servicos: servicos.dados, linkApp });
    desenharQuaseLa({ nome: r.dados.nome, whatsappCliente: r.dados.whatsapp, endereco: r.dados.endereco, referencia: r.dados.referencia, servicos: servicos.dados, mensagem });
  }

  function desenharQuaseLa({ nome: nomeCliente, whatsappCliente, endereco, referencia, servicos = [], mensagem }) {
    mostrar(raiz, html`
      <div class="pagina-cliente">
        ${marca(link.empresa)}
        <h1 class="pagina-cliente__titulo" id="titulo-da-tela" tabindex="-1">Quase lá!</h1>
        <section class="cartao pilha pilha--pequena" aria-label="Seu pedido">
          <div class="resumo-pedido__linha">${icone('agenda', 20)}<span>${formatarDiaExtenso(dia)} às ${hora}</span></div>
          <div class="resumo-pedido__linha">${icone('clientes', 20)}<span>${nomeCliente}</span></div>
          ${whatsappCliente && html`<div class="resumo-pedido__linha">${icone('whatsapp', 20)}<span>${formatarTelefone(whatsappCliente)}</span></div>`}
          ${servicos.length > 0 && html`<div class="resumo-pedido__linha">${icone('ferramenta', 20)}<span>${servicos.join(', ')}</span></div>`}
          ${endereco && html`<div class="resumo-pedido__linha">${icone('local', 20)}<span>${linhaDoEndereco(endereco)}${referencia ? ` · Ref.: ${referencia}` : ''}</span></div>`}
        </section>
        ${aviso({ titulo: 'Falta só um toque', texto: 'Toque no botão abaixo e, no WhatsApp, aperte Enviar. É assim que o técnico recebe o seu pedido e confirma o horário com você.' })}
        ${botao({ texto: 'Enviar no WhatsApp', variante: 'whatsapp', iconeNome: 'whatsapp', bloco: true, externo: true, href: linkWhatsapp(link.whatsapp, mensagem), id: 'enviar-pedido' })}
        ${botao({ texto: 'Mudar o dia ou o horário', variante: 'fantasma', bloco: true, acao: 'mudar' })}
      </div>`);
    window.scrollTo(0, 0);
  }

  desenharServicos();
  raiz.querySelector('#area-servicos')?.addEventListener('change', (e) => {
    if (e.target.name !== 'servicos') return;
    const nomeMarcado = e.target.value;
    const jaTem = servicosMarcados.filter((n) => n !== nomeMarcado);
    if (!e.target.checked) servicosMarcados = jaTem;
    else if (nomeMarcado === SERVICO_NAO_SEI) servicosMarcados = [SERVICO_NAO_SEI]; // "Não sei ainda" vale sozinho
    else servicosMarcados = [...jaTem.filter((n) => n !== SERVICO_NAO_SEI), nomeMarcado];
    desenharServicos();
  });
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
    'usar-localizacao': (el) => usarLocalizacao(el),
    mudar: () => ctx.recarregar(),
  });
  return desligar;
}

/** Nome da empresa no alto da página (a página não tem menu). */
function marca(empresa) {
  return html`<div class="pagina-cliente__marca">${empresa || 'Agendamento'}</div>`;
}
