// =============================================================================
// TELA: Aparelho — novo e editar
//   rotas: /cliente/:clienteId/aparelho/novo   e   /aparelho/:id/editar
// =============================================================================
// Campos: tipo, marca, modelo, capacidade em BTUs (pílulas com os valores mais
// comuns + "Outro"), local/cômodo (ex.: "Sala"), endereço do cliente (só se ele
// tiver 2) e observações.
//
// Observação sobre os dados: o modelo do aparelho (e as regras do Firestore) só
// têm tipo, btus, nome, descricao e enderecoId. Por isso:
//   * "Local/cômodo" é gravado em "nome" (é o título do aparelho nas listas);
//   * marca, modelo e observações são gravados juntos em "descricao"
//     (ver montarDescricaoAparelho em clientes-comum.js).
//
// Técnico: pode cadastrar/editar aparelho mesmo sem acesso à ficha do cliente
// (então o endereço não é perguntado e o já gravado é mantido). Só o
// administrador exclui.
// =============================================================================

import { html, mostrar, aoClicar, aoEnviar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, confirmar, toast } from '../nucleo/ui.js';
import { cabecalho, campoTexto, campoTextoLongo, campoSelecao, campoPilulas, botao, estadoVazio } from '../nucleo/componentes.js';
import { ehAdmin, podeGerirClientes } from '../nucleo/permissoes.js';
import { traduzirErro } from '../nucleo/erros.js';
import { TIPOS_APARELHO, BTUS_COMUNS } from '../nucleo/constantes.js';
import { buscarCliente } from '../servicos/clientes.js';
import { buscarAparelho, criarAparelho, atualizarAparelho, excluirAparelho } from '../servicos/aparelhos.js';
import { validarAparelho } from '../dominio/validacoes.js';
import { telaDeErro, rotuloDoEndereco, montarDescricaoAparelho, lerDescricaoAparelho, carregarEstilosClientes } from './clientes-comum.js';

const OPCOES_TIPO = TIPOS_APARELHO.map((t) => ({ valor: t.valor, rotulo: t.rotulo }));

/** Pílulas de BTUs: "Não informar", os comuns (12.000...) e "Outro". */
const OPCOES_BTUS = [
  { valor: '', rotulo: 'Não informar' },
  ...BTUS_COMUNS.map((b) => ({ valor: String(b), rotulo: new Intl.NumberFormat('pt-BR').format(b) })),
  { valor: 'outro', rotulo: 'Outro' },
];

export default async function montar({ raiz, params, consulta, sessao, ir, voltar, recarregar, ativo }) {
  const empresaId = sessao.vinculo.empresaId;
  const editando = Boolean(params.id);
  const administrador = ehAdmin(sessao);
  const veClientes = podeGerirClientes(sessao);

  await carregarEstilosClientes();

  // ---- 1. Carrega o aparelho (editar) e o cliente (se tiver permissão) ----
  let aparelho = null;
  let cliente = null;
  let clienteId = params.clienteId;
  try {
    if (editando) {
      aparelho = await buscarAparelho(empresaId, params.id);
      if (!ativo()) return undefined;
      if (!aparelho) {
        mostrar(raiz, html`
          ${cabecalho({ titulo: 'Aparelho', voltarPara: true })}
          ${estadoVazio({ icone: 'info', titulo: 'Aparelho não encontrado', texto: 'Ele pode ter sido excluído.', acao: botao({ texto: 'Voltar', variante: 'secundario', acao: 'voltar' }) })}`);
        return aoClicar(raiz, { voltar: () => voltar('/') });
      }
      clienteId = aparelho.clienteId;
    }
    // Só quem pode ver clientes lê a ficha (o técnico comum não tem acesso a ela).
    if (veClientes) cliente = await buscarCliente(empresaId, clienteId);
  } catch (erro) {
    return telaDeErro(raiz, erro, recarregar, 'Não foi possível abrir o aparelho');
  }
  if (!ativo()) return undefined;

  if (veClientes && !cliente) {
    mostrar(raiz, html`
      ${cabecalho({ titulo: 'Aparelho', voltarPara: '#/clientes' })}
      ${estadoVazio({ icone: 'info', titulo: 'Cliente não encontrado', texto: 'Ele pode ter sido excluído.', acao: botao({ texto: 'Ver clientes', href: '#/clientes' }) })}`);
    return undefined;
  }

  // ---- 2. Valores iniciais ----
  const enderecos = cliente?.enderecos || [];
  const perguntaEndereco = enderecos.length > 1;
  const { marca, modelo, observacoes } = lerDescricaoAparelho(aparelho?.descricao);
  const btusAtual = aparelho?.btus ? String(aparelho.btus) : '';
  const btusEhComum = BTUS_COMUNS.map(String).includes(btusAtual);
  const escolhaInicial = !btusAtual ? '' : btusEhComum ? btusAtual : 'outro';

  // Endereço: o já gravado; ou, se o cliente tem só um, esse; senão o primeiro.
  const enderecoInicial = aparelho?.enderecoId || enderecos[0]?.id || '';

  // ---- 3. Desenha ----
  mostrar(raiz, html`
    ${cabecalho({
      titulo: editando ? 'Editar aparelho' : 'Novo aparelho',
      subtitulo: cliente?.nome,
      voltarPara: true,
    })}
    <form id="form-aparelho" class="formulario" novalidate>
      <div data-erros-gerais></div>
      <section class="cartao pilha">
        ${campoSelecao({ nome: 'tipo', rotulo: 'Tipo de aparelho', opcoes: OPCOES_TIPO, vazio: 'Escolha o tipo', valor: aparelho?.tipo ?? '' })}
        ${campoTexto({ nome: 'marca', rotulo: 'Marca', valor: marca, opcional: true, maximo: 40, placeholder: 'Samsung, LG, Midea...' })}
        ${campoTexto({ nome: 'modelo', rotulo: 'Modelo', valor: modelo, opcional: true, maximo: 60 })}
        ${campoPilulas({ nome: 'btusEscolha', rotulo: 'Capacidade (BTUs)', opcoes: OPCOES_BTUS, valor: escolhaInicial })}
        <div id="area-btus-outro" ${escolhaInicial === 'outro' ? '' : 'hidden'}>
          ${campoTexto({ nome: 'btus', rotulo: 'Quantos BTUs?', valor: btusAtual, tipo: 'text', modo: 'numeric', maximo: 7, placeholder: 'Ex.: 15000' })}
        </div>
        ${campoTexto({ nome: 'nome', rotulo: 'Local / cômodo', valor: aparelho?.nome ?? '', opcional: true, maximo: 80, placeholder: 'Sala, Quarto do casal, Loja...' })}
        ${perguntaEndereco && campoSelecao({
          nome: 'enderecoId', rotulo: 'Em qual endereço está?',
          opcoes: enderecos.map((e, i) => ({ valor: e.id, rotulo: rotuloDoEndereco(e, i) })), valor: enderecoInicial,
        })}
        ${campoTextoLongo({ nome: 'observacoes', rotulo: 'Observações', valor: observacoes, opcional: true, maximo: 350, placeholder: 'Ex.: instalado em 2022, gás R410A...' })}
      </section>
      ${botao({ texto: editando ? 'Salvar alterações' : 'Cadastrar aparelho', tipo: 'submit', bloco: true })}
      ${editando && administrador && botao({ texto: 'Excluir aparelho', variante: 'perigo', iconeNome: 'lixeira', acao: 'excluir', bloco: true })}
    </form>`);

  const form = raiz.querySelector('#form-aparelho');
  const areaOutro = raiz.querySelector('#area-btus-outro');

  /** Depois de gravar/excluir: vai para a ficha do cliente (ou volta, se o técnico não a enxerga). */
  const terminar = () => (consulta?.get('voltar') === '1' ? voltar(administrador ? '/agendar' : '/') : veClientes ? ir(`/cliente/${encodeURIComponent(clienteId)}`, { substituir: true }) : voltar('/'));

  // Pílulas de BTUs: as comuns preenchem o campo escondido; "Outro" mostra o campo para digitar.
  form.addEventListener('change', (ev) => {
    if (ev.target.name !== 'btusEscolha') return;
    const escolha = ev.target.value;
    areaOutro.hidden = escolha !== 'outro';
    if (escolha === 'outro') {
      form.elements.btus.value = BTUS_COMUNS.map(String).includes(form.elements.btus.value) ? '' : form.elements.btus.value;
      form.elements.btus.focus();
    } else {
      form.elements.btus.value = escolha;
    }
  });

  const desligar = aoClicar(raiz, {
    voltar: () => voltar('/'),

    excluir: (el) => comCarregando(el, async () => {
      const ok = await confirmar({
        titulo: 'Excluir este aparelho?',
        mensagem: 'Os serviços antigos continuam no histórico. Não dá para desfazer.',
        confirmar: 'Excluir',
        perigo: true,
      });
      if (!ok) return;
      await excluirAparelho(empresaId, aparelho);
      toast('Aparelho excluído.', 'sucesso');
      terminar();
    }),
  });

  // ---- 4. Salvar ----
  aoEnviar(form, async () => {
    limparErrosGerais(form);
    const c = lerCampos(form);
    const descricao = montarDescricaoAparelho({ marca: c.marca, modelo: c.modelo, observacoes: c.observacoes });
    const r = validarAparelho({
      tipo: c.tipo,
      btus: c.btusEscolha === '' ? '' : c.btus,
      nome: c.nome,
      descricao,
      enderecoId: perguntaEndereco ? c.enderecoId : enderecoInicial,
    });
    if (!r.valido) {
      const { descricao: erroDescricao, ...outros } = r.erros;
      mostrarErrosNosCampos(form, erroDescricao ? { ...outros, observacoes: erroDescricao } : outros);
      return;
    }
    await comCarregando(form.querySelector('[type="submit"]'), async () => {
      try {
        if (editando) await atualizarAparelho(empresaId, aparelho, r.dados);
        else await criarAparelho(empresaId, clienteId, r.dados);
        toast(editando ? 'Aparelho atualizado.' : 'Aparelho cadastrado.', 'sucesso');
        terminar();
      } catch (erro) {
        mostrarErrosNosCampos(form, { geral: traduzirErro(erro) });
      }
    });
  });

  return desligar;
}
