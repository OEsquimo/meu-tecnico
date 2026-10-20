// =============================================================================
// TELA: Cliente (ficha) — rota /cliente/:id
// =============================================================================
// Mostra tudo sobre um cliente:
//   * dados: telefone, observações e os botões Ligar e WhatsApp;
//   * endereços (até 2), cada um com "Ir até lá" (janela com Waze / Google Maps);
//   * aparelhos, com o botão "Adicionar aparelho";
//   * histórico de serviços (SÓ administrador — o técnico não vê serviços de
//     outros nem valores);
//   * administrador: "Agendar serviço", "Editar" e "Excluir" (com confirmação).
//     Técnico com permissão de cadastrar clientes vê apenas "Editar".
// Padrão: esqueleto ao carregar; erro vira "Tentar de novo".
// =============================================================================

import { html, mostrar, aoClicar, toast, escolher, confirmar, comCarregando } from '../nucleo/ui.js';
import { cabecalho, botao, aviso, selo, itemLista, estadoVazio, esqueletos, listaDeDados } from '../nucleo/componentes.js';
import { ehAdmin } from '../nucleo/permissoes.js';
import { buscarCliente, excluirCliente } from '../servicos/clientes.js';
import { listarAparelhosDoCliente } from '../servicos/aparelhos.js';
import { listarServicosDoCliente } from '../servicos/servicos.js';
import { formatarTelefone, normalizarWhatsappBR } from '../dominio/telefone.js';
import { linhaDoEndereco, formatarCEP, opcoesDeNavegacao } from '../dominio/endereco.js';
import { descricaoTecnica, tituloDoAparelho } from '../dominio/aparelhos.js';
import { seloDoServico } from '../dominio/servicos.js';
import { formatarDataBR } from '../dominio/datas.js';
import { linkWhatsapp } from '../dominio/whatsapp.js';
import { telaDeErro, carregarEstilosClientes, lerDescricaoAparelho } from './clientes-comum.js';
import { linkLigar } from './servicos-comum.js';

/** Quantos serviços aparecem no histórico da ficha. */
const MAXIMO_HISTORICO = 10;

export default async function montar({ raiz, params, sessao, ir, recarregar, ativo }) {
  const empresaId = sessao.vinculo.empresaId;
  const administrador = ehAdmin(sessao);
  const idCliente = params.id;

  await carregarEstilosClientes();
  mostrar(raiz, html`${cabecalho({ titulo: 'Cliente', voltarPara: '#/clientes' })}${esqueletos(3)}`);

  // ---- 1. Carrega cliente, aparelhos e (admin) histórico ----
  let cliente;
  let aparelhos;
  let servicos = null; // null = não carregou / sem permissão
  let falhaHistorico = false;
  try {
    [cliente, aparelhos] = await Promise.all([
      buscarCliente(empresaId, idCliente),
      listarAparelhosDoCliente(empresaId, idCliente),
    ]);
    if (administrador) {
      // Falha no histórico não derruba a ficha inteira.
      try {
        servicos = await listarServicosDoCliente(empresaId, idCliente);
      } catch (erro) {
        console.error(erro);
        falhaHistorico = true;
      }
    }
  } catch (erro) {
    if (!ativo()) return undefined;
    return telaDeErro(raiz, erro, recarregar, 'Não foi possível abrir o cliente');
  }
  if (!ativo()) return undefined;

  if (!cliente) {
    mostrar(raiz, html`
      ${cabecalho({ titulo: 'Cliente', voltarPara: '#/clientes' })}
      ${estadoVazio({ icone: 'info', titulo: 'Cliente não encontrado', texto: 'Ele pode ter sido excluído.', acao: botao({ texto: 'Ver clientes', href: '#/clientes' }) })}`);
    return undefined;
  }

  // ---- 2. Desenha a ficha ----
  const enderecos = cliente.enderecos || [];
  const numero = normalizarWhatsappBR(cliente.whatsapp);
  const linkLig = linkLigar(cliente.whatsapp);
  const nomeDoEndereco = (id) => enderecos.find((e) => e.id === id);

  mostrar(raiz, html`
    ${cabecalho({ titulo: cliente.nome, voltarPara: '#/clientes' })}
    <div class="pilha">
      <section class="cartao pilha">
        ${listaDeDados([
          ['Telefone', formatarTelefone(cliente.whatsapp)],
          ['Observações', cliente.observacoes],
        ])}
        ${numero
          ? html`<div class="contato-acoes">
              ${botao({ texto: 'Ligar', variante: 'secundario', iconeNome: 'telefone', href: linkLig })}
              ${botao({ texto: 'WhatsApp', variante: 'whatsapp', iconeNome: 'whatsapp', href: linkWhatsapp(numero, `Olá, ${cliente.nome}!`), externo: true })}
            </div>`
          : aviso({ tom: 'amarelo', texto: 'O telefone deste cliente não parece válido. Edite o cadastro para ligar ou chamar no WhatsApp.' })}
      </section>

      <section class="cartao pilha">
        <h2>${enderecos.length > 1 ? 'Endereços' : 'Endereço'}</h2>
        ${enderecos.length === 0 && html`<p class="texto-suave">Nenhum endereço cadastrado.</p>`}
        ${enderecos.map((e, i) => html`
          <div class="endereco-item">
            ${(e.apelido || enderecos.length > 1) && html`<div class="endereco-item__apelido">${e.apelido || `Endereço ${i + 1}`}</div>`}
            <div>${linhaDoEndereco(e) || 'Endereço incompleto'}</div>
            ${e.cep && html`<div class="texto-suave texto-pequeno">CEP ${formatarCEP(e.cep)}</div>`}
            ${botao({ texto: 'Ir até lá', variante: 'secundario', iconeNome: 'navegar', acao: 'navegar', dados: { indice: i } })}
          </div>`)}
      </section>

      <section class="cartao pilha">
        <h2>Aparelhos</h2>
        ${aparelhos.length === 0
          ? html`<p class="texto-suave">Nenhum aparelho cadastrado ainda.</p>`
          : html`<div class="lista">
              ${aparelhos.map((a) => {
                const { marca, modelo } = lerDescricaoAparelho(a.descricao);
                const onde = enderecos.length > 1 ? nomeDoEndereco(a.enderecoId) : null;
                return itemLista({
                  href: `#/aparelho/${encodeURIComponent(a.id)}/editar`,
                  titulo: tituloDoAparelho(a),
                  sub: [descricaoTecnica(a), [marca, modelo].filter(Boolean).join(' '), onde && (onde.apelido || linhaDoEndereco(onde))].filter(Boolean).join(' · '),
                });
              })}
            </div>`}
        ${botao({ texto: 'Adicionar aparelho', iconeNome: 'mais', href: `#/cliente/${encodeURIComponent(idCliente)}/aparelho/novo`, variante: 'secundario', bloco: true })}
      </section>

      ${administrador && html`
        <section class="cartao pilha">
          <h2>Histórico de serviços</h2>
          ${falhaHistorico && aviso({ tom: 'amarelo', texto: 'Não foi possível carregar o histórico agora.' })}
          ${servicos && servicos.length === 0 && html`<p class="texto-suave">Nenhum serviço ainda.</p>`}
          ${servicos && servicos.length > 0 && html`
            <div class="lista">
              ${servicos.slice(0, MAXIMO_HISTORICO).map((s) => {
                const situacao = seloDoServico(s);
                return itemLista({
                  href: `#/servico/${encodeURIComponent(s.id)}`,
                  titulo: s.tipoServicoNome,
                  sub: [formatarDataBR(s.dataAgendada), s.aparelhoResumo].filter(Boolean).join(' · '),
                  direita: selo(situacao.texto, situacao.tom),
                });
              })}
            </div>
            ${servicos.length > MAXIMO_HISTORICO && html`<p class="texto-suave texto-pequeno">Mostrando os ${MAXIMO_HISTORICO} mais recentes de ${servicos.length}.</p>`}`}
        </section>`}

      <div class="ficha-acoes">
        ${administrador && botao({ texto: 'Agendar serviço', iconeNome: 'agenda', acao: 'agendar', bloco: true })}
        ${botao({ texto: 'Editar cliente', variante: 'secundario', iconeNome: 'editar', href: `#/cliente/${encodeURIComponent(idCliente)}/editar`, bloco: true })}
        ${administrador && botao({ texto: 'Excluir cliente', variante: 'perigo', iconeNome: 'lixeira', acao: 'excluir', bloco: true })}
      </div>
    </div>`);

  // ---- 3. Ações ----
  return aoClicar(raiz, {
    // Janela para escolher o aplicativo de mapas do endereço tocado.
    navegar: async (el) => {
      const endereco = enderecos[Number(el.dataset.indice)];
      if (!endereco) return;
      await escolher({
        titulo: 'Ir até o cliente',
        mensagem: 'Escolha o aplicativo de mapas.',
        opcoes: opcoesDeNavegacao(endereco),
      });
    },

    agendar: () => ir(`/agendar?cliente=${encodeURIComponent(idCliente)}`),

    excluir: (el) => comCarregando(el, async () => {
      const ok = await confirmar({
        titulo: `Excluir ${cliente.nome}?`,
        mensagem: 'Isso apaga também os aparelhos e todo o histórico de serviços deste cliente. Não dá para desfazer.',
        confirmar: 'Excluir tudo',
        perigo: true,
      });
      if (!ok) return;
      await excluirCliente(empresaId, idCliente);
      toast('Cliente excluído.', 'sucesso');
      ir('/clientes', { substituir: true });
    }),
  });
}
