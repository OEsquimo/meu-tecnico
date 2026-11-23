// =============================================================================
// TELA: Concluir serviço (/concluir/:id)
// =============================================================================
//   * O valor já vem preenchido com o valor padrão do tipo de serviço. Dá para mudar,
//     acrescentar extras (descrição + valor) e dar desconto; o total aparece na hora.
//   * ADMINISTRADOR: sempre vê e altera o valor; "Mais opções" troca o aparelho e a data.
//   * TÉCNICO: só vê o valor se o administrador liberou ("Pode ver valores"); só altera
//     valor e extras com "Pode alterar valor e extras". Sem permissão, o administrador
//     confirma o valor depois (Financeiro).
//   * "O que foi feito?" fica no fim e é opcional.
// REGRAS: não dá para concluir sem aparelho. Se o serviço ainda não tem aparelho,
// o técnico escolhe um do cliente ou cadastra um novo aqui mesmo. Se o
// agendamento foi feito sem serviço ("Serviço a definir"), também escolhe o tipo.
// Se o tipo de serviço gera retorno (limpeza/manutenção), o prazo de retorno é SEMPRE o
// padrão do tipo (configurado em Tipos de serviço); a tela não pergunta mais (Pacote 28).
// =============================================================================

import { html, mostrar, aoEnviar, aoClicar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, toast, escolher, pedirTexto, confirmar, avancarEntreCampos } from '../nucleo/ui.js';
import { cabecalho, campoTexto, campoTextoLongo, campoPilulas, campoSelecao, interruptor, botao, esqueletos, estadoVazio } from '../nucleo/componentes.js';
import { traduzirErro } from '../nucleo/erros.js';
import { buscarServico, concluirServico, listarLinhasDoAgendamento, marcarPendente, listarConcluidosECancelados } from '../servicos/servicos.js';
import { situacaoDaVisita, sugerirInicio, sugerirConclusao, validarHorarios, horaDeCampo, MOTIVOS_ATRASO } from '../dominio/tempo-servico.js';
import { listarAparelhosDoCliente } from '../servicos/aparelhos.js';
import { validarConclusao } from '../dominio/validacoes.js';
import { validarValores } from '../dominio/valores.js';
import { centavosParaCampo } from '../dominio/dinheiro.js';
import { listarPrecos } from '../servicos/precos.js';
import { podeVerValores, podeAlterarValores } from '../nucleo/permissoes.js';
import { editorDeValores, valorSoParaLer, ligarEditorDeValores } from './valores-editor.js';
import { resumoDoAparelho } from '../dominio/aparelhos.js';
import { STATUS, ehLinhaSemServico, MOTIVOS_PENDENCIA } from '../dominio/servicos.js';
import { hojeISO, paraISO, inicioDoDia, inicioDoDiaSeguinte } from '../dominio/datas.js';
import { PRAZOS_RETORNO_MESES, GARANTIA_DIAS } from '../nucleo/constantes.js';
import { sessao, tiposAtivos } from '../nucleo/sessao.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar, mostrarNaoEncontrado } from './servicos-comum.js';

/** Texto já digitado, guardado enquanto o técnico cadastra o aparelho em outra tela. */
let rascunho = null;

export default async function montar(ctx) {
  const { raiz, params, ir } = ctx;
  const usuario = contextoDoUsuario();
  const voltarPara = `#/servico/${params.id}`;

  /**
   * Sobrou serviço aberto na mesma visita? Pergunta se faz hoje ou fica pendente.
   * Devolve o id de um serviço que continua aberto na visita (para voltar a ela), ou null.
   */
  async function perguntarPendentes(concluido) {
    let abertos = [];
    try {
      const linhas = await listarLinhasDoAgendamento(usuario.empresaId, concluido, { tecnicoUid: usuario.admin ? null : usuario.uid });
      abertos = linhas.filter((l) => l.id !== concluido.id && l.status === STATUS.AGENDADO);
    } catch { return null; } // a pergunta é um extra: se falhar, o serviço já está concluído
    if (abertos.length === 0) return null;
    const n = abertos.length;
    const nomes = abertos.map((l) => l.tipoServicoNome || 'Serviço a definir').join(', ');
    const r = await escolher({
      titulo: `${n} ${n === 1 ? 'serviço pendente' : 'serviços pendentes'} nesta visita`,
      mensagem: `${nomes}. Dá para fazer ainda hoje?`,
      opcoes: [
        { id: 'hoje', rotulo: 'Fazer ainda hoje' },
        { id: 'nao', rotulo: 'Não deu para fazer' },
      ],
      cancelar: 'Decidir depois',
    });
    if (r !== 'nao') return abertos[0].id; // "Fazer ainda hoje" e "Decidir depois": continuam abertos na visita
    let motivo = await escolher({
      titulo: 'Por que ficou pendente?',
      opcoes: [...MOTIVOS_PENDENCIA.map((m) => ({ id: m, rotulo: m })), { id: 'outro', rotulo: 'Outro motivo' }],
      cancelar: 'Sem informar',
    });
    if (motivo === 'outro') motivo = await pedirTexto({ titulo: 'Qual o motivo?', rotulo: 'Ex.: cliente não estava em casa' }) || 'Outro motivo';
    try {
      await marcarPendente(usuario.empresaId, abertos.map((l) => l.id), motivo || '');
      toast(n === 1 ? 'Serviço ficou pendente, aguardando reagendamento.' : 'Serviços pendentes, aguardando reagendamento.', 'sucesso');
      return null; // todos ficaram pendentes: a visita não tem mais nada a concluir
    } catch (e) {
      toast('Não foi possível marcar como pendente. Tente de novo pela tela do serviço.', 'erro');
      return abertos[0].id;
    }
  }

  async function carregar() {
    mostrar(raiz, html`${cabecalho({ titulo: 'Concluir serviço', voltarPara })}${esqueletos(2)}`);
    try {
      await carregarEstilos();
      const servico = await buscarServico(usuario.empresaId, params.id);
      if (!ctx.ativo()) return;
      if (!servico) return mostrarNaoEncontrado(raiz, 'Serviço não encontrado', 'Ele pode ter sido excluído.', '#/agenda');
      if (servico.status !== STATUS.AGENDADO) {
        return mostrarNaoEncontrado(raiz, 'Serviço já fechado', 'Este serviço já foi concluído ou cancelado.', voltarPara);
      }
      // Aparelhos do cliente: todos precisam (aparelho é obrigatório para concluir).
      const aparelhos = servico.clienteId
        ? await listarAparelhosDoCliente(usuario.empresaId, servico.clienteId).catch(() => [])
        : [];
      if (!ctx.ativo()) return;
      const precos = podeVerValores(sessao) ? await listarPrecos(usuario.empresaId).catch(() => ({})) : {};
      if (!ctx.ativo()) return;
      // Pacote 27: quando o serviço anterior do mesmo técnico terminou (ajuda a sugerir o início e a avisar de sobreposição).
      const fimAnterior = await fimDoServicoAnterior(servico);
      if (!ctx.ativo()) return;
      desenhar(servico, aparelhos, precos, fimAnterior);
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregar, cabecalho({ titulo: 'Concluir serviço', voltarPara }));
    }
  }

  async function fimDoServicoAnterior(s) {
    try {
      const dia = s.dataAgendada instanceof Date ? s.dataAgendada : new Date();
      const feitos = await listarConcluidosECancelados({ empresaId: usuario.empresaId, de: inicioDoDia(dia), ate: inicioDoDiaSeguinte(dia), tecnicoUid: s.tecnicoUid || usuario.uid });
      const fins = feitos.filter((f) => f.status === STATUS.CONCLUIDO && f.agendamentoId !== s.agendamentoId && f.dataConclusao instanceof Date && f.dataConclusao.getTime() <= Date.now()).map((f) => f.dataConclusao.getTime());
      return fins.length > 0 ? new Date(Math.max(...fins)) : null;
    } catch { return null; }
  }

  function desenhar(s, aparelhos, precos, fimAnterior = null) {
    const editaValores = podeAlterarValores(sessao);
    const veValores = podeVerValores(sessao);
    const precoDe = (t) => (Number.isInteger(precos[t?.id]) ? precos[t.id] : null);
    const semServico = ehLinhaSemServico(s);
    const semAparelho = !s.aparelhoId;
    // Sem aparelho ou sem serviço informado: não dá para concluir. Em vez de uma lista cheia de
    // opções, um aviso amigável leva para a tela "Aparelhos e serviços" (primeiro o aparelho, depois os serviços).
    if (semServico || semAparelho) {
      mostrar(raiz, html`
        ${cabecalho({ titulo: 'Concluir serviço', subtitulo: s.clienteNome, voltarPara })}
        ${estadoVazio({
    icone: 'info',
    titulo: 'Antes de concluir',
    texto: 'Escolha ou cadastre o aparelho e selecione o serviço feito. É rapidinho!',
    acao: botao({ texto: 'Informar aparelhos e serviços', href: `#/servico/${s.id}?informar=1` }),
  })}`);
      return;
    }
    // Horários sugeridos (Pacote 27): só são gravados os que a pessoa confirmar ao concluir.
    const agoraSug = new Date();
    const situacaoSug = situacaoDaVisita([s], agoraSug, usuario.admin ? null : usuario.uid);
    const duracao = s.ocupacaoPorTecnico?.[usuario.uid] || s.duracaoMin || 60;
    const marcadoSug = s.dataAgendada instanceof Date ? s.dataAgendada : agoraSug;
    const concSug = sugerirConclusao({ inicio: s.iniciadoEm instanceof Date ? s.iniciadoEm : marcadoSug, duracaoMin: duracao, agora: agoraSug, passouDoPrazo: situacaoSug === 'esperando-concluir' });
    const iniSug = s.iniciadoEm instanceof Date ? { data: s.iniciadoEm, ajustada: false } : sugerirInicio({ marcado: marcadoSug, fimAnterior, conclusao: concSug, duracaoMin: duracao });
    const diaSug = paraISO(concSug);
    // Serviço marcado para um dia que ainda não chegou (concluído adiantado): o piso do dia é hoje.
    const diaMarcado = paraISO(marcadoSug) < hojeISO() ? paraISO(marcadoSug) : hojeISO();
    const salvo = rascunho && rascunho.id === s.id ? rascunho : null;
    const idsAntes = new Set(salvo?.aparelhosAntes || []);
    const novoAparelho = salvo ? aparelhos.find((a) => !idsAntes.has(a.id)) : null;
    rascunho = null;
    const tiposEscolha = tiposAtivos();
    const tipoSalvo = salvo?.tipoServicoId && tiposEscolha.some((t) => t.id === salvo.tipoServicoId) ? salvo.tipoServicoId : '';
    const tipoAtual = () => (semServico ? sessao.tipos.find((t) => t.id === (form.elements.tipoServicoId?.value || '')) : sessao.tipos.find((t) => t.id === s.tipoServicoId));
    const tipoInicial = semServico ? sessao.tipos.find((t) => t.id === tipoSalvo) : sessao.tipos.find((t) => t.id === s.tipoServicoId);
    const geraRetornoInicial = semServico ? tipoInicial?.geraRetorno === true : s.geraRetorno === true;
    const mesesDe = (t) => (PRAZOS_RETORNO_MESES.includes(t?.retornoPadraoMeses) ? t.retornoPadraoMeses : 6);

    mostrar(raiz, html`
      ${cabecalho({
    titulo: 'Concluir serviço',
    subtitulo: html`${semServico ? 'Serviço a definir' : s.tipoServicoNome} · ${s.clienteNome}${s.aparelhoResumo ? html`<div class="cabecalho__aparelho">${s.aparelhoResumo}</div>` : ''}`,
    voltarPara,
  })}
      <form id="form-concluir" class="formulario" novalidate>
        <div data-erros-gerais></div>
        ${semServico ? campoPilulas({
          nome: 'tipoServicoId', rotulo: 'Qual serviço foi feito?',
          opcoes: tiposEscolha.map((t) => ({ valor: t.id, rotulo: t.nome })), valor: tipoSalvo,
        }) : ''}
        ${semAparelho ? html`
          ${aparelhos.length > 0 ? campoSelecao({
            nome: 'aparelhoId', rotulo: 'Aparelho atendido', valor: novoAparelho?.id || salvo?.aparelhoId || '', vazio: 'Escolha o aparelho',
            opcoes: aparelhos.map((a) => ({ valor: a.id, rotulo: resumoDoAparelho(a) })),
          }) : html`<div class="campo" data-campo="aparelhoId"><span class="campo__rotulo">Aparelho atendido</span><p class="campo__ajuda">Este cliente ainda não tem aparelho cadastrado. Cadastre um para poder concluir.</p></div>`}
          ${botao({ texto: '+ Cadastrar aparelho novo', variante: 'secundario', acao: 'novo-aparelho', pequeno: true })}` : ''}
        ${editaValores ? editorDeValores({
    base: salvo?.valor ?? (precoDe(tipoInicial) === null ? '' : centavosParaCampo(precoDe(tipoInicial))),
    extras: salvo?.extras || [], desconto: salvo?.desconto || '',
    ajudaValor: precoDe(tipoInicial) === null ? (usuario.admin ? '' : 'Se não souber, deixe vazio: o administrador confirma depois.') : 'Valor padrão deste serviço. Pode mudar.',
  }) : (veValores ? valorSoParaLer(precoDe(tipoInicial)) : '')}
        ${interruptor({ nome: 'pago', titulo: 'O cliente já pagou?', descricao: usuario.admin ? '' : 'Só marque se o cliente pagou na hora.' })}
        <section class="cartao pilha pilha--pequena" data-bloco="horarios" aria-label="Horários do serviço">
          <h2 class="titulo-secao">Horários do serviço</h2>
          <p class="texto-suave texto-pequeno">${s.iniciadoEm instanceof Date ? 'O início foi registrado quando você iniciou.' : 'Sugerimos estes horários. Confira e corrija se precisar.'}${iniSug.ajustada ? ' O início foi ajustado para caber antes da conclusão.' : ''}</p>
          ${s.iniciadoEm instanceof Date ? '' : html`<div data-bloco="conferi">${interruptor({ nome: 'horariosConferidos', titulo: 'Conferi os horários', descricao: 'Sem conferir, o serviço fica marcado como "Horário não conferido" e fora das médias.' })}</div>`}
          ${!usuario.admin && diaSug !== hojeISO() ? campoTexto({ nome: 'dataConclusao', rotulo: 'Dia do serviço', tipo: 'date', valor: diaSug, maximo: 10 }) : ''}
          <div class="linha">
            ${campoTexto({ nome: 'horaInicio', rotulo: 'Início', tipo: 'time', valor: horaDeCampo(iniSug.data) })}
            ${campoTexto({ nome: 'horaConclusao', rotulo: 'Conclusão', tipo: 'time', valor: horaDeCampo(concSug) })}
          </div>
          <details class="detalhes" ${s.atrasoMotivo ? html`open` : ''}>
            <summary>Houve atraso? Informe o motivo (opcional)</summary>
            <div class="pilha">
              ${campoPilulas({ nome: 'atrasoMotivo', rotulo: 'Motivo do atraso', opcoes: MOTIVOS_ATRASO.map((m) => ({ valor: m, rotulo: m })), valor: s.atrasoMotivo || '' })}
              ${campoTexto({ nome: 'atrasoDetalhe', rotulo: 'Detalhe', opcional: true, valor: s.atrasoDetalhe || '', maximo: 300 })}
            </div>
          </details>
        </section>
        <p class="texto-suave texto-pequeno">Garantia de ${GARANTIA_DIAS} dias a partir de hoje.</p>
        ${campoTextoLongo({ nome: 'descricao', rotulo: 'O que foi feito?', opcional: true, linhas: 3, maximo: 2000, valor: salvo?.descricao || '', placeholder: 'Ex.: limpeza completa, troca do dreno' })}

        ${usuario.admin ? html`
          <details class="detalhes">
            <summary>Mais opções</summary>
            <div class="pilha">
              ${campoTexto({ nome: 'dataConclusao', rotulo: 'Data do serviço', tipo: 'date', valor: diaSug, maximo: 10 })}
              ${!semAparelho && aparelhos.length > 0 ? campoSelecao({
                nome: 'aparelhoId', rotulo: 'Aparelho atendido', valor: s.aparelhoId || '', vazio: 'Manter o do agendamento',
                opcoes: aparelhos.map((a) => ({ valor: a.id, rotulo: resumoDoAparelho(a) })),
              }) : ''}
            </div>
          </details>` : ''}

        ${botao({ texto: 'Concluir serviço', tipo: 'submit', iconeNome: 'check', bloco: true })}
      </form>`);

    const form = raiz.querySelector('#form-concluir');
    avancarEntreCampos(form); // Enter vai ao próximo campo
    const editor = editaValores ? ligarEditorDeValores(form) : null;
    let valorMexido = false; // se a pessoa já mexeu no valor, trocar o tipo não o sobrescreve
    form.addEventListener('input', (e) => { if (e.target.name === 'valor') valorMexido = true; });

    // Serviço "a definir": ao escolher o tipo, o valor padrão dele entra (se a pessoa ainda não mexeu no valor).
    form.addEventListener('change', (e) => {
      if (e.target.name !== 'tipoServicoId') return;
      const t = tipoAtual();
      if (editor && !valorMexido) {
        form.elements.valor.value = precoDe(t) === null ? '' : centavosParaCampo(precoDe(t));
        form.elements.valor.dispatchEvent(new Event('input', { bubbles: true }));
        valorMexido = false;
      }
    });

    aoClicar(raiz, {
      ...(editor?.acoes || {}),
      'novo-aparelho': () => {
        const c = lerCampos(form);
        rascunho = {
          ...(editor ? { valor: c.valor, extras: editor.ler().extras, desconto: c.desconto } : {}),
          id: s.id, descricao: c.descricao || '', tipoServicoId: c.tipoServicoId || '', aparelhoId: c.aparelhoId || '',
          aparelhosAntes: aparelhos.map((a) => a.id),
        };
        ir(`/cliente/${encodeURIComponent(s.clienteId)}/aparelho/novo?voltar=1&endereco=${encodeURIComponent(s.enderecoId || '')}`);
      },
    });

    aoEnviar(form, async () => {
      limparErrosGerais(form);
      const campos = lerCampos(form);
      const tipoEscolhido = semServico ? tipoAtual() : null;
      const geraRetorno = semServico ? tipoEscolhido?.geraRetorno === true : s.geraRetorno === true;
      const aparelhoId = campos.aparelhoId || s.aparelhoId || '';
      // O prazo de retorno é o padrão do tipo de serviço (a tela não pergunta mais).
      const tipoDoRetorno = semServico ? tipoEscolhido : sessao.tipos.find((t) => t.id === s.tipoServicoId);
      const r = validarConclusao({ ...campos, retornoMeses: String(mesesDe(tipoDoRetorno)), aparelhoId }, { exigirValor: false, geraRetorno, exigirAparelho: true });
      const erros = { ...r.erros };
      // Valor, extras e desconto (só quem pode alterar). O administrador precisa informar o valor.
      const v = editor ? validarValores(editor.ler(), { exigirBase: usuario.admin }) : null;
      if (v) Object.assign(erros, v.erros);
      if (semServico && !tipoEscolhido) erros.tipoServicoId = 'Escolha qual serviço foi feito.';
      // Horários (Pacote 27): erros bloqueiam; casos estranhos pedem confirmação.
      const diaInformado = campos.dataConclusao || diaSug;
      const h = validarHorarios({ diaISO: diaInformado, inicio: campos.horaInicio, conclusao: campos.horaConclusao, agora: new Date(), diaMarcadoISO: diaMarcado, fimAnterior });
      if (h.erros.dia) erros.dataConclusao = h.erros.dia;
      if (h.erros.inicio) erros.horaInicio = h.erros.inicio;
      if (h.erros.conclusao) erros.horaConclusao = h.erros.conclusao;
      if (Object.keys(erros).length > 0) {
        mostrarErrosNosCampos(form, erros);
        return;
      }
      for (const c of h.confirmacoes) {
        if (!await confirmar({ titulo: 'Confira os horários', mensagem: c.texto, confirmar: 'Está certo', cancelar: 'Corrigir' })) return;
      }
      await comCarregando(form.querySelector('[type="submit"]'), async () => {
        try {
          await concluirServico({
            empresaId: usuario.empresaId, servico: s, papel: usuario.admin ? 'admin' : 'tecnico', nomeQuemConcluiu: usuario.nome,
            dados: {
              descricao: r.dados.descricao, pago: r.dados.pago, retornoMeses: r.dados.retornoMeses,
              valores: v && v.dados.valorCentavos !== null ? v.dados : null,
              podeAlterarValores: editaValores,
              aparelho: aparelhos.find((a) => a.id === r.dados.aparelhoId && a.id !== s.aparelhoId) || null,
              tipo: tipoEscolhido,
              exigirAparelho: true,
              inicio: h.inicio,
              conclusao: h.conclusao,
              // Pacote 29: conferido = iniciou o serviço, marcou "Conferi os horários" ou mudou algum horário sugerido.
              horariosConferidos: s.iniciadoEm instanceof Date || campos.horariosConferidos === true
                || campos.horaInicio !== horaDeCampo(iniSug.data) || campos.horaConclusao !== horaDeCampo(concSug)
                || (campos.dataConclusao ? campos.dataConclusao !== diaSug : false),
              atraso: campos.atrasoMotivo ? { motivo: campos.atrasoMotivo, detalhe: campos.atrasoDetalhe || '' } : null,
            },
          });
          const aindaAberto = await perguntarPendentes(s);
          if (aindaAberto) {
            // Ainda há serviço aberto nesta visita: volta para ela para concluir o resto.
            toast('Serviço concluído! Ainda falta concluir o resto desta visita.', 'sucesso');
            ir(`/servico/${encodeURIComponent(aindaAberto)}`, { substituir: true });
          } else {
            toast('Serviço concluído!', 'sucesso');
            ir('/');
          }
        } catch (erro) {
          mostrarErrosNosCampos(form, { geral: traduzirErro(erro) });
        }
      });
    });
  }

  await carregar();
}
