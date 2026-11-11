// =============================================================================
// TELA: Enviar horários ao cliente (Ferramentas) — só administrador
// =============================================================================
// O administrador escolhe (se quiser) o serviço, vê a mensagem pronta e manda o link pelo WhatsApp
// (abre a lista de contatos do WhatsApp) ou copia a mensagem. NÃO escolhe cliente: muitos contatos vêm
// pelo WhatsApp e nem estão cadastrados. O cliente abre o link, escolhe dia e hora e responde no WhatsApp.
//
// Os horários livres dos próximos 14 dias (mesmas regras do seletor de dia e hora) viajam dentro do link,
// que vale por 7 dias (dominio/link-horarios.js). O pedido do cliente chega pelo WhatsApp do administrador,
// por isso o administrador precisa ter o WhatsApp dele cadastrado (pedimos aqui mesmo, se faltar).
// =============================================================================

import { html, mostrar, aoClicar, aoEnviar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, copiarTexto, toast } from '../nucleo/ui.js';
import { cabecalho, campoTexto, campoPilulas, aviso, botao, esqueletos } from '../nucleo/componentes.js';
import { sessao, tiposAtivos, recarregarSessao, empresaId } from '../nucleo/sessao.js';
import { traduzirErro } from '../nucleo/erros.js';
import { tecnicosParaAtribuir, salvarDadosDoAdministrador } from '../servicos/equipe.js';
import { listarAgendados } from '../servicos/servicos.js';
import { expedienteDaEmpresa, regrasDaEmpresa } from '../dominio/expediente.js';
import { hojeISO, somarDias, deISO } from '../dominio/datas.js';
import { normalizarWhatsappBR, mascararTelefoneDigitando, formatarTelefone } from '../dominio/telefone.js';
import { linkWhatsapp } from '../dominio/whatsapp.js';
import {
  horariosLivresParaOLink, montarLinkDeHorarios, mensagemDoLinkDeHorarios, enderecoBaseDoApp,
  DIAS_A_FRENTE, VALIDADE_DIAS, DURACAO_SEM_SERVICO_MIN,
} from '../dominio/link-horarios.js';
import { contextoDoUsuario, mostrarErroComTentar, carregarEstilos } from './servicos-comum.js';
import { textoDaDuracao } from './agendamento-comum.js';

export default async function montar(ctx) {
  const { raiz } = ctx;
  const usuario = contextoDoUsuario();
  const topo = cabecalho({ titulo: 'Enviar horários ao cliente', voltarPara: '#/ferramentas' });
  let desligar = () => {};
  let escutaMudanca = null;

  mostrar(raiz, html`${topo}${esqueletos(3)}`);
  let tecnicos;
  let agendados;
  try {
    await carregarEstilos();
    const agora = new Date();
    [tecnicos, agendados] = await Promise.all([
      tecnicosParaAtribuir(usuario.empresaId, { uid: usuario.uid, nome: usuario.nome, atende: sessao.empresa?.adminAtende !== false }),
      // Um dia de folga antes: serviço que começou ontem à noite também conta.
      listarAgendados({ empresaId: usuario.empresaId, de: deISO(somarDias(hojeISO(agora), -1)), ate: deISO(somarDias(hojeISO(agora), DIAS_A_FRENTE + 2)) }),
    ]);
  } catch (erro) {
    if (ctx.ativo()) mostrarErroComTentar(raiz, erro, () => ctx.recarregar(), topo);
    return undefined;
  }
  if (!ctx.ativo()) return undefined;

  const tipos = tiposAtivos();
  const whatsappDoAdmin = normalizarWhatsappBR(sessao.vinculo?.telefone || '') || '';
  const nomeDaEmpresa = sessao.empresa?.nome || 'nossa empresa';
  let tipoEscolhido = ''; // '' = não sei ainda

  // ---- Sem WhatsApp do administrador: pede aqui mesmo (o pedido do cliente chega nele) ----
  if (!whatsappDoAdmin) {
    mostrar(raiz, html`
      ${topo}
      <form id="form-whatsapp" class="formulario" novalidate>
        <div data-erros-gerais></div>
        ${aviso({ tom: 'amarelo', titulo: 'Falta o seu WhatsApp', texto: 'O cliente vai mandar o pedido de horário para o seu WhatsApp. Informe o número dele para continuar.' })}
        ${campoTexto({ nome: 'telefone', rotulo: 'Seu WhatsApp', tipo: 'tel', modo: 'tel', placeholder: '(11) 91234-5678', autocompletar: 'off' })}
        ${botao({ texto: 'Salvar e continuar', tipo: 'submit', bloco: true })}
      </form>`);
    const form = raiz.querySelector('#form-whatsapp');
    form.elements.telefone.addEventListener('input', (e) => { e.target.value = mascararTelefoneDigitando(e.target.value); });
    aoEnviar(form, async () => {
      limparErrosGerais(form);
      const numero = normalizarWhatsappBR(lerCampos(form).telefone);
      if (!numero) { mostrarErrosNosCampos(form, { telefone: 'Número inválido. Digite com DDD, por exemplo (11) 91234-5678.' }); return; }
      await comCarregando(form.querySelector('[type="submit"]'), async () => {
        try {
          await salvarDadosDoAdministrador(empresaId(), sessao.usuario.uid, { nome: sessao.vinculo?.nome || usuario.nome || 'Administrador', telefone: numero, atende: sessao.empresa?.adminAtende !== false });
          await recarregarSessao();
          toast('WhatsApp salvo.', 'sucesso');
          ctx.recarregar();
        } catch (erro) {
          mostrarErrosNosCampos(form, { geral: traduzirErro(erro) });
        }
      });
    });
    return undefined;
  }

  // ---- A ferramenta ----
  mostrar(raiz, html`
    ${topo}
    <div class="pilha">
      <form id="form-servico" class="cartao pilha" novalidate>
        ${campoPilulas({
    nome: 'servico', rotulo: 'Serviço (opcional)', valor: '',
    opcoes: [{ valor: '', rotulo: `Não sei ainda · ${textoDaDuracao(DURACAO_SEM_SERVICO_MIN)}` }, ...tipos.map((t) => ({ valor: t.id, rotulo: `${t.nome} · ${textoDaDuracao(Number(t.duracaoMin) || DURACAO_SEM_SERVICO_MIN)}` }))],
  })}
        <p class="campo__ajuda">Serve só para reservar o tempo certo na agenda. O cliente não precisa saber o serviço agora: vocês combinam na conversa.</p>
      </form>
      <div id="area-previa" class="pilha"></div>
    </div>`);

  function calcular() {
    const tipo = tipos.find((t) => t.id === tipoEscolhido) || null;
    const duracaoMin = tipo ? Number(tipo.duracaoMin) || DURACAO_SEM_SERVICO_MIN : DURACAO_SEM_SERVICO_MIN;
    const agora = new Date();
    const dias = horariosLivresParaOLink({
      expediente: expedienteDaEmpresa(sessao.empresa), tecnicos, agendados, duracaoMin, regras: regrasDaEmpresa(sessao.empresa), agora,
    });
    const link = dias.length === 0 ? '' : montarLinkDeHorarios({
      base: enderecoBaseDoApp(window.location.href), empresa: nomeDaEmpresa, whatsapp: whatsappDoAdmin, servico: tipo?.nome || '', dias, geradoEm: hojeISO(agora),
    });
    const mensagem = link ? mensagemDoLinkDeHorarios({ empresa: nomeDaEmpresa, link }) : '';
    return { dias, link, mensagem, tipo };
  }

  let atual = calcular();

  function desenharPrevia() {
    atual = calcular();
    const area = raiz.querySelector('#area-previa');
    const totalHorarios = atual.dias.reduce((n, d) => n + d.horas.length, 0);
    if (atual.dias.length === 0) {
      mostrar(area, aviso({ tom: 'amarelo', titulo: 'Nenhum horário livre', texto: `Não há horário livre nos próximos ${DIAS_A_FRENTE} dias para ${atual.tipo ? `este serviço (${textoDaDuracao(Number(atual.tipo.duracaoMin) || DURACAO_SEM_SERVICO_MIN)})` : 'esse tempo'}. Confira o horário de funcionamento e a equipe.` }));
      return;
    }
    mostrar(area, html`
      <section class="cartao pilha pilha--pequena" aria-label="Mensagem que será enviada">
        <span class="campo__rotulo">Mensagem para o cliente</span>
        <div class="mensagem-previa" id="mensagem-previa">${atual.mensagem}</div>
        <p class="campo__ajuda" id="resumo-previa">O link mostra ${atual.dias.length} ${atual.dias.length === 1 ? 'dia' : 'dias'} com horário livre (${totalHorarios} horários) nos próximos ${DIAS_A_FRENTE} dias e vale por ${VALIDADE_DIAS} dias. O pedido do cliente chega no seu WhatsApp, ${formatarTelefone(whatsappDoAdmin)}.</p>
      </section>
      <a class="botao botao--whatsapp botao--bloco" id="enviar-whatsapp" href="${linkWhatsapp('', atual.mensagem)}" target="_blank" rel="noopener noreferrer" data-acao="enviar-whatsapp">Enviar pelo WhatsApp</a>
      ${botao({ texto: 'Copiar mensagem', variante: 'secundario', iconeNome: 'copiar', bloco: true, acao: 'copiar-mensagem' })}`);
  }

  const form = raiz.querySelector('#form-servico');
  escutaMudanca = (e) => {
    if (e.target.name !== 'servico') return;
    tipoEscolhido = e.target.value;
    desenharPrevia();
  };
  form.addEventListener('change', escutaMudanca);
  desenharPrevia();

  desligar = aoClicar(raiz, {
    'copiar-mensagem': async () => {
      const ok = await copiarTexto(atual.mensagem);
      toast(ok ? 'Mensagem copiada. Cole na conversa do cliente.' : 'Não deu para copiar. Use "Enviar pelo WhatsApp".', ok ? 'sucesso' : 'erro');
    },
  });

  return () => { desligar(); form.removeEventListener('change', escutaMudanca); };
}
