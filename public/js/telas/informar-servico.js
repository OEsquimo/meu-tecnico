// =============================================================================
// TELA "APARELHOS E SERVIÇOS" (informar) — #/informar/:id
// -----------------------------------------------------------------------------
// Usada quando o atendimento foi agendado sem aparelho e/ou sem serviço. Antes de
// concluir, a pessoa informa, NESTA ORDEM:
//   1) o aparelho (escolhe um do cliente ou cadastra um novo);
//   2) um ou mais serviços para aquele aparelho.
// Pode repetir com "+ Aparelho". Ao salvar, o 1º par preenche a linha "a definir" e os
// demais viram linhas novas na mesma visita; cada uma é concluída pelo botão "Concluir"
// de sempre. Se quem informa é o técnico, as linhas ficam marcadas "Incluído pelo técnico".
// =============================================================================

import { html, mostrar, aoEnviar, aoClicar, mostrarErrosNosCampos, limparErrosGerais, comCarregando, toast } from '../nucleo/ui.js';
import { cabecalho, campoPilulas, botao, esqueletos, aviso } from '../nucleo/componentes.js';
import { traduzirErro } from '../nucleo/erros.js';
import { buscarServico, informarAparelhosEServicos } from '../servicos/servicos.js';
import { listarAparelhosDoCliente } from '../servicos/aparelhos.js';
import { resumoDoAparelho } from '../dominio/aparelhos.js';
import { STATUS } from '../dominio/servicos.js';
import { sessao, tiposAtivos } from '../nucleo/sessao.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar, mostrarNaoEncontrado } from './servicos-comum.js';

/** O que já foi escolhido, guardado enquanto a pessoa cadastra um aparelho em outra tela. */
let rascunho = null;

export default async function montar(ctx) {
  const { raiz, params, ir } = ctx;
  const usuario = contextoDoUsuario();
  const voltarPara = `#/servico/${params.id}`;

  async function carregar() {
    mostrar(raiz, html`${cabecalho({ titulo: 'Aparelhos e serviços', voltarPara })}${esqueletos(2)}`);
    try {
      await carregarEstilos();
      const servico = await buscarServico(usuario.empresaId, params.id);
      if (!ctx.ativo()) return;
      if (!servico) return mostrarNaoEncontrado(raiz, 'Serviço não encontrado', 'Ele pode ter sido excluído.', '#/agenda');
      if (servico.status !== STATUS.AGENDADO) {
        return mostrarNaoEncontrado(raiz, 'Serviço já fechado', 'Este serviço já foi concluído ou cancelado.', voltarPara);
      }
      const todos = servico.clienteId ? await listarAparelhosDoCliente(usuario.empresaId, servico.clienteId).catch(() => []) : [];
      if (!ctx.ativo()) return;
      // Só os aparelhos do endereço deste atendimento (os sem endereço aparecem sempre).
      const aparelhos = todos.filter((a) => !servico.enderecoId || !a.enderecoId || a.enderecoId === servico.enderecoId);
      desenhar(servico, aparelhos);
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregar, cabecalho({ titulo: 'Aparelhos e serviços', voltarPara }));
    }
  }

  function desenhar(s, aparelhos) {
    const tipos = tiposAtivos();
    const salvo = rascunho && rascunho.id === s.id ? rascunho : null;
    rascunho = null;

    // Estado: uma lista de blocos { aparelhoId, tipoIds[] }.
    let blocos = salvo ? salvo.blocos : [{
      aparelhoId: s.aparelhoId || (aparelhos.length === 1 ? aparelhos[0].id : ''),
      tipoIds: s.tipoServicoId ? [s.tipoServicoId] : [],
    }];
    // Voltou do cadastro de aparelho: o aparelho novo já vem escolhido no bloco que pediu.
    if (salvo) {
      const antes = new Set(salvo.aparelhosAntes);
      const novo = aparelhos.find((a) => !antes.has(a.id));
      if (novo && blocos[salvo.alvo]) blocos[salvo.alvo].aparelhoId = novo.id;
    }

    function desenharTela() {
      const usados = (i) => new Set(blocos.filter((_, j) => j !== i).map((b) => b.aparelhoId).filter(Boolean));
      mostrar(raiz, html`
        ${cabecalho({ titulo: 'Aparelhos e serviços', subtitulo: s.clienteNome, voltarPara })}
        <form id="form-informar" class="formulario" novalidate>
          <div data-erros-gerais></div>
          <p class="campo__ajuda">Primeiro escolha o aparelho (ou cadastre um novo). Depois marque os serviços feitos nele.</p>
          ${blocos.map((b, i) => {
    const opcoes = aparelhos.filter((a) => !usados(i).has(a.id)).map((a) => ({ valor: a.id, rotulo: resumoDoAparelho(a) }));
    return html`
            <section class="cartao" data-bloco="${i}">
              <div class="cabecalho-linha">
                <h2 class="subtitulo">Aparelho ${i + 1}</h2>
                ${blocos.length > 1 && botao({ texto: 'Remover', variante: 'fantasma', pequeno: true, acao: 'remover-bloco', dados: { indice: i } })}
              </div>
              ${opcoes.length > 0
    ? campoPilulas({ nome: `aparelho-${i}`, rotulo: 'Qual aparelho?', opcoes, valor: b.aparelhoId })
    : html`<div class="campo" data-campo="aparelho-${i}"><span class="campo__rotulo">Qual aparelho?</span><p class="campo__ajuda">${b.aparelhoId ? '' : 'Nenhum aparelho disponível. Cadastre um novo abaixo.'}</p></div>`}
              ${botao({ texto: '+ Cadastrar aparelho novo', variante: 'secundario', pequeno: true, acao: 'novo-aparelho', dados: { indice: i } })}
              ${b.aparelhoId && campoPilulas({
    nome: `servicos-${i}`, rotulo: 'Quais serviços foram feitos neste aparelho?', multiplo: true,
    opcoes: tipos.map((t) => ({ valor: t.id, rotulo: t.nome })), valor: b.tipoIds,
  })}
            </section>`;
  })}
          ${botao({ texto: '+ Aparelho', variante: 'secundario', acao: 'mais-aparelho', bloco: true })}
          ${!usuario.admin && aviso({ texto: 'O administrador será avisado do que você incluir. O valor segue o preço padrão do serviço.' })}
          ${botao({ texto: 'Salvar aparelhos e serviços', tipo: 'submit', bloco: true })}
        </form>`);
      ligar();
    }

    function ligar() {
      const form = raiz.querySelector('#form-informar');
      // Escolher aparelho ou marcar serviços só atualiza o estado (aparelho redesenha para mostrar os serviços).
      form.addEventListener('change', (e) => {
        const [tipo, indice] = String(e.target.name || '').split('-');
        const i = Number(indice);
        if (!blocos[i]) return;
        if (tipo === 'aparelho') {
          blocos[i].aparelhoId = e.target.value;
          desenharTela();
        } else if (tipo === 'servicos') {
          blocos[i].tipoIds = [...form.querySelectorAll(`input[name="servicos-${i}"]:checked`)].map((x) => x.value);
        }
      });

      aoEnviar(form, async () => {
        limparErrosGerais(form);
        const erros = {};
        blocos.forEach((b, i) => {
          if (!b.aparelhoId) erros[`aparelho-${i}`] = 'Escolha ou cadastre o aparelho.';
          else if (b.tipoIds.length === 0) erros[`servicos-${i}`] = 'Escolha pelo menos um serviço para este aparelho.';
        });
        if (Object.keys(erros).length > 0) {
          mostrarErrosNosCampos(form, erros);
          return;
        }
        const itens = blocos.map((b) => ({
          aparelho: aparelhos.find((a) => a.id === b.aparelhoId),
          tipos: b.tipoIds.map((id) => sessao.tipos.find((t) => t.id === id)).filter(Boolean),
        }));
        await comCarregando(form.querySelector('[type="submit"]'), async () => {
          try {
            await informarAparelhosEServicos({
              empresaId: usuario.empresaId, servico: s, itens,
              tecnico: usuario.admin ? null : { uid: usuario.uid, nome: usuario.nome },
            });
            toast('Aparelhos e serviços informados. Agora é só concluir cada um.', 'sucesso');
            ir(`/servico/${encodeURIComponent(s.id)}`, { substituir: true });
          } catch (erro) {
            mostrarErrosNosCampos(form, { geral: traduzirErro(erro) });
          }
        });
      });
    }

    // Cliques da tela: ligados uma vez só (os botões são redesenhados, mas a raiz é a mesma).
    aoClicar(raiz, {
      'mais-aparelho': () => { blocos.push({ aparelhoId: '', tipoIds: [] }); desenharTela(); },
      'remover-bloco': (el) => { blocos.splice(Number(el.dataset.indice), 1); desenharTela(); },
      'novo-aparelho': (el) => {
        rascunho = { id: s.id, blocos, alvo: Number(el.dataset.indice), aparelhosAntes: aparelhos.map((a) => a.id) };
        ir(`/cliente/${encodeURIComponent(s.clienteId)}/aparelho/novo?voltar=1&endereco=${encodeURIComponent(s.enderecoId || '')}`);
      },
    });

    desenharTela();
  }

  await carregar();
}
