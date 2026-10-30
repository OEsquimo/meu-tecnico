// =============================================================================
// TELA: Concluir serviço (/concluir/:id)
// =============================================================================
//   * TÉCNICO: descreve o que fez e marca "cliente pagou? sim/não". NÃO vê nem
//     digita valor.
//   * ADMINISTRADOR: também informa o valor; "Mais opções" permite trocar o
//     aparelho e a data de conclusão.
// REGRAS: não dá para concluir sem aparelho. Se o serviço ainda não tem aparelho,
// o técnico escolhe um do cliente ou cadastra um novo aqui mesmo. Se o
// agendamento foi feito sem serviço ("Serviço a definir"), também escolhe o tipo.
// Se o tipo de serviço gera retorno (limpeza/manutenção), aparecem as opções
// 3/4/6/12 meses (já vem marcado o prazo padrão do tipo).
// =============================================================================

import { html, mostrar, aoEnviar, aoClicar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, toast } from '../nucleo/ui.js';
import { cabecalho, campoTexto, campoTextoLongo, campoPilulas, campoSelecao, interruptor, botao, esqueletos } from '../nucleo/componentes.js';
import { traduzirErro } from '../nucleo/erros.js';
import { buscarServico, concluirServico } from '../servicos/servicos.js';
import { listarAparelhosDoCliente } from '../servicos/aparelhos.js';
import { validarConclusao } from '../dominio/validacoes.js';
import { resumoDoAparelho } from '../dominio/aparelhos.js';
import { STATUS, ehLinhaSemServico } from '../dominio/servicos.js';
import { hojeISO } from '../dominio/datas.js';
import { PRAZOS_RETORNO_MESES, GARANTIA_DIAS } from '../nucleo/constantes.js';
import { sessao, tiposAtivos } from '../nucleo/sessao.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar, mostrarNaoEncontrado } from './servicos-comum.js';

/** Texto já digitado, guardado enquanto o técnico cadastra o aparelho em outra tela. */
let rascunho = null;

export default async function montar(ctx) {
  const { raiz, params, ir } = ctx;
  const usuario = contextoDoUsuario();
  const voltarPara = `#/servico/${params.id}`;

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
      desenhar(servico, aparelhos);
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregar, cabecalho({ titulo: 'Concluir serviço', voltarPara }));
    }
  }

  function desenhar(s, aparelhos) {
    const semServico = ehLinhaSemServico(s);
    const semAparelho = !s.aparelhoId;
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
    const mesesPadrao = mesesDe(tipoInicial);

    mostrar(raiz, html`
      ${cabecalho({ titulo: 'Concluir serviço', subtitulo: `${semServico ? 'Serviço a definir' : s.tipoServicoNome} · ${s.clienteNome}`, voltarPara })}
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
        ${campoTextoLongo({ nome: 'descricao', rotulo: 'O que foi feito?', linhas: 4, maximo: 2000, valor: salvo?.descricao || '', placeholder: 'Ex.: limpeza completa, troca do dreno' })}
        ${usuario.admin ? campoTexto({ nome: 'valor', rotulo: 'Valor (R$)', modo: 'decimal', placeholder: '150,00' }) : ''}
        ${interruptor({ nome: 'pago', titulo: 'O cliente já pagou?', descricao: usuario.admin ? '' : 'Só marque se o cliente pagou na hora.' })}
        <div id="bloco-retorno" ${geraRetornoInicial ? '' : html`hidden`}>
          ${campoPilulas({
            nome: 'retornoMeses', rotulo: 'Avisar para voltar daqui a quanto tempo?',
            opcoes: PRAZOS_RETORNO_MESES.map((m) => ({ valor: String(m), rotulo: `${m} meses` })), valor: String(mesesPadrao),
          })}
        </div>
        <p class="texto-suave texto-pequeno">Garantia de ${GARANTIA_DIAS} dias a partir de hoje.</p>

        ${usuario.admin ? html`
          <details class="detalhes">
            <summary>Mais opções</summary>
            <div class="pilha">
              ${campoTexto({ nome: 'dataConclusao', rotulo: 'Data do serviço', tipo: 'date', valor: hojeISO(), maximo: 10 })}
              ${!semAparelho && aparelhos.length > 0 ? campoSelecao({
                nome: 'aparelhoId', rotulo: 'Aparelho atendido', valor: s.aparelhoId || '', vazio: 'Manter o do agendamento',
                opcoes: aparelhos.map((a) => ({ valor: a.id, rotulo: resumoDoAparelho(a) })),
              }) : ''}
            </div>
          </details>` : ''}

        ${botao({ texto: 'Concluir serviço', tipo: 'submit', iconeNome: 'check', bloco: true })}
      </form>`);

    const form = raiz.querySelector('#form-concluir');
    const blocoRetorno = raiz.querySelector('#bloco-retorno');

    // Serviço "a definir": ao escolher o tipo, mostra (ou esconde) o prazo de retorno.
    form.addEventListener('change', (e) => {
      if (e.target.name !== 'tipoServicoId') return;
      const t = tipoAtual();
      blocoRetorno.hidden = t?.geraRetorno !== true;
      const marcar = form.querySelector(`input[name="retornoMeses"][value="${mesesDe(t)}"]`);
      if (marcar) marcar.checked = true;
    });

    aoClicar(raiz, {
      'novo-aparelho': () => {
        const c = lerCampos(form);
        rascunho = {
          id: s.id, descricao: c.descricao || '', tipoServicoId: c.tipoServicoId || '', aparelhoId: c.aparelhoId || '',
          aparelhosAntes: aparelhos.map((a) => a.id),
        };
        ir(`/cliente/${encodeURIComponent(s.clienteId)}/aparelho/novo?voltar=1`);
      },
    });

    aoEnviar(form, async () => {
      limparErrosGerais(form);
      const campos = lerCampos(form);
      const tipoEscolhido = semServico ? tipoAtual() : null;
      const geraRetorno = semServico ? tipoEscolhido?.geraRetorno === true : s.geraRetorno === true;
      const aparelhoId = campos.aparelhoId || s.aparelhoId || '';
      const r = validarConclusao({ ...campos, aparelhoId }, { exigirValor: usuario.admin, geraRetorno, exigirAparelho: true });
      const erros = { ...r.erros };
      if (semServico && !tipoEscolhido) erros.tipoServicoId = 'Escolha qual serviço foi feito.';
      if (Object.keys(erros).length > 0) {
        mostrarErrosNosCampos(form, erros);
        return;
      }
      await comCarregando(form.querySelector('[type="submit"]'), async () => {
        try {
          await concluirServico({
            empresaId: usuario.empresaId, servico: s, papel: usuario.admin ? 'admin' : 'tecnico', nomeQuemConcluiu: usuario.nome,
            dados: {
              descricao: r.dados.descricao, pago: r.dados.pago, retornoMeses: r.dados.retornoMeses,
              valorCentavos: r.dados.valorCentavos,
              aparelho: aparelhos.find((a) => a.id === r.dados.aparelhoId && a.id !== s.aparelhoId) || null,
              tipo: tipoEscolhido,
              exigirAparelho: true,
              dataConclusaoISO: usuario.admin ? (campos.dataConclusao || null) : null,
            },
          });
          toast('Serviço concluído!', 'sucesso');
          ir('/');
        } catch (erro) {
          mostrarErrosNosCampos(form, { geral: traduzirErro(erro) });
        }
      });
    });
  }

  await carregar();
}
