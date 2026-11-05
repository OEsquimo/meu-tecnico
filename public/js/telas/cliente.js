// =============================================================================
// TELA: Cliente (ficha) — rota /cliente/:id
// =============================================================================
// Mostra tudo sobre um cliente:
//   * dados: telefone, observações e os botões Ligar e WhatsApp;
//   * endereços (até 2), cada um com "Ir até lá" (janela com Waze / Google Maps);
//   * aparelhos, com o botão "Adicionar aparelho";
//   * todos os agendamentos e serviços do cliente (SÓ administrador — o técnico não vê serviços de
//     outros nem valores);
//   * administrador: "Agendar serviço", "Editar" e "Excluir" (com confirmação).
//     Técnico com permissão de cadastrar clientes vê apenas "Editar".
// Padrão: esqueleto ao carregar; erro vira "Tentar de novo".
// =============================================================================

import { html, mostrar, aoClicar, toast, escolher, confirmar, comCarregando, mostrarErro } from '../nucleo/ui.js';
import { cabecalho, botao, aviso, selo, itemLista, estadoVazio, esqueletos, listaDeDados } from '../nucleo/componentes.js';
import { ehAdmin } from '../nucleo/permissoes.js';
import { buscarCliente, excluirCliente } from '../servicos/clientes.js';
import { listarAparelhosDoCliente } from '../servicos/aparelhos.js';
import { listarServicosDoCliente, cancelarAgendamentoCompleto, excluirAgendamentoCompleto } from '../servicos/servicos.js';
import { formatarTelefone, normalizarWhatsappBR } from '../dominio/telefone.js';
import { linhaDoEndereco, formatarCEP, opcoesDeNavegacao } from '../dominio/endereco.js';
import { descricaoTecnica, tituloDoAparelho } from '../dominio/aparelhos.js';
import { seloDoServico, agruparAgendamentos, STATUS } from '../dominio/servicos.js';
import { formatarDataBR } from '../dominio/datas.js';
import { linkWhatsapp } from '../dominio/whatsapp.js';
import { telaDeErro, carregarEstilosClientes, lerDescricaoAparelho } from './clientes-comum.js';
import { linkLigar } from './servicos-comum.js';

/** Quantos agendamentos (visitas) aparecem na ficha. */
const MAXIMO_HISTORICO = 15;

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

  // Agendamentos do cliente (uma linha por visita), mais recentes primeiro.
  const visitas = servicos ? agruparAgendamentos(servicos).reverse() : [];

  // ---- 2. Desenha a ficha ----
  const enderecos = cliente.enderecos || [];
  const numero = normalizarWhatsappBR(cliente.whatsapp);
  const linkLig = linkLigar(cliente.whatsapp);
  const nomeDoEndereco = (id) => enderecos.find((e) => e.id === id);

  // Com vários endereços, a ficha mostra só o do próximo agendamento aberto (ou o primeiro cadastrado).
  let verTodos = false;
  const proximoAberto = (servicos || []).filter((l) => l.status === STATUS.AGENDADO && l.dataAgendada instanceof Date)
    .sort((a, b) => a.dataAgendada - b.dataAgendada)[0];
  const idEnderecoAtual = enderecos.find((e) => e.id === proximoAberto?.enderecoId)?.id || enderecos[0]?.id;

  function desenharFicha() {
    const varios = enderecos.length > 1;
    const colapsado = varios && !verTodos;
    const enderecosVisiveis = colapsado ? enderecos.filter((e) => e.id === idEnderecoAtual) : enderecos;
    const aparelhosVisiveis = colapsado ? aparelhos.filter((a) => !a.enderecoId || a.enderecoId === idEnderecoAtual) : aparelhos;
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
        <h2>${enderecos.length > 1 && !colapsado ? 'Endereços' : 'Endereço'}</h2>
        ${enderecos.length === 0 && html`<p class="texto-suave">Nenhum endereço cadastrado.</p>`}
        ${enderecosVisiveis.map((e) => html`
          <div class="endereco-item">
            ${(e.apelido || enderecos.length > 1) && html`<div class="endereco-item__apelido">${e.apelido || `Endereço ${enderecos.indexOf(e) + 1}`}</div>`}
            <div>${linhaDoEndereco(e) || 'Endereço incompleto'}</div>
            ${e.cep && html`<div class="texto-suave texto-pequeno">CEP ${formatarCEP(e.cep)}</div>`}
            ${botao({ texto: 'Ir até lá', variante: 'secundario', iconeNome: 'navegar', acao: 'navegar', dados: { indice: enderecos.indexOf(e) } })}
          </div>`)}
        ${varios && botao({ texto: colapsado ? `Ver todos os endereços (${enderecos.length})` : 'Mostrar só o atual', variante: 'fantasma', acao: 'alternar-enderecos', pequeno: true })}
      </section>

      <section class="cartao pilha">
        <h2>Aparelhos</h2>
        ${aparelhosVisiveis.length === 0
          ? html`<p class="texto-suave">${aparelhos.length === 0 ? 'Nenhum aparelho cadastrado ainda.' : 'Nenhum aparelho neste endereço.'}</p>`
          : html`<div class="lista">
              ${aparelhosVisiveis.map((a) => {
                const { marca, modelo } = lerDescricaoAparelho(a.descricao);
                const onde = enderecos.length > 1 && !colapsado ? nomeDoEndereco(a.enderecoId) : null;
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
          <h2>Agendamentos e serviços</h2>
          ${falhaHistorico && aviso({ tom: 'amarelo', texto: 'Não foi possível carregar os agendamentos agora.' })}
          ${servicos && servicos.length === 0 && html`<p class="texto-suave">Nenhum serviço ainda.</p>`}
          ${visitas.length > 0 && html`
            <div class="pilha pilha--pequena">
              ${visitas.slice(0, MAXIMO_HISTORICO).map((v) => {
                const principal = v.linhas.find((l) => l.status === STATUS.AGENDADO) || v.linhas.find((l) => l.status === STATUS.CANCELADO) || v.linhas[0];
                const situacao = seloDoServico(principal, new Date(), { curto: true });
                const abertas = v.linhas.filter((l) => l.status === STATUS.AGENDADO);
                const aguardando = v.status === STATUS.CANCELADO;
                const aberta = v.status === STATUS.AGENDADO;
                const nomes = [...new Set(v.linhas.map((l) => l.tipoServicoNome))].join(', ');
                const aparelhosDaVisita = [...new Set(v.linhas.map((l) => l.aparelhoResumo).filter(Boolean))].join(', ');
                return html`
                  <div class="visita-cliente">
                    ${itemLista({
                      href: `#/servico/${encodeURIComponent(principal.id)}`,
                      titulo: nomes,
                      sub: [formatarDataBR(v.dataAgendada), aparelhosDaVisita].filter(Boolean).join(' · '),
                      direita: selo(situacao.texto, situacao.tom),
                    })}
                    ${(aberta || aguardando) && html`
                      <div class="acoes-cartao">
                        ${abertas.length === 1 && botao({ texto: 'Concluir serviço', iconeNome: 'check', href: `#/concluir/${encodeURIComponent(abertas[0].id)}`, pequeno: true })}
                        ${abertas.length > 1 && abertas.map((l) => botao({ texto: `Concluir ${l.tipoServicoNome}`, iconeNome: 'check', href: `#/concluir/${encodeURIComponent(l.id)}`, pequeno: true }))}
                        ${aguardando && botao({ texto: 'Reagendar', iconeNome: 'agenda', href: `#/servico/${encodeURIComponent(principal.id)}/editar`, pequeno: true })}
                        ${aberta && botao({ texto: 'Cancelar', variante: 'secundario', acao: 'cancelar-visita', dados: { chave: v.chave }, pequeno: true })}
                        ${botao({ texto: 'Excluir', variante: 'perigo', iconeNome: 'lixeira', acao: 'excluir-visita', dados: { chave: v.chave }, pequeno: true })}
                      </div>`}
                  </div>`;
              })}
            </div>
            ${visitas.length > MAXIMO_HISTORICO && html`<p class="texto-suave texto-pequeno">Mostrando os ${MAXIMO_HISTORICO} mais recentes de ${visitas.length}.</p>`}
            <p class="texto-suave texto-pequeno">Serviços concluídos ficam guardados e não podem ser excluídos.</p>`}
        </section>`}

      <div class="ficha-acoes">
        ${administrador && botao({ texto: 'Agendar serviço', iconeNome: 'agenda', acao: 'agendar', bloco: true })}
        ${botao({ texto: 'Editar cliente', variante: 'secundario', iconeNome: 'editar', href: `#/cliente/${encodeURIComponent(idCliente)}/editar`, bloco: true })}
        ${administrador && botao({ texto: 'Excluir cliente', variante: 'perigo', iconeNome: 'lixeira', acao: 'excluir', bloco: true })}
      </div>
    </div>`);
  }
  desenharFicha();

  // ---- 3. Ações ----
  return aoClicar(raiz, {
    'alternar-enderecos': () => { verTodos = !verTodos; desenharFicha(); },
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

    // Agendamento ainda aberto: cancelar (fica aguardando reagendamento) ou excluir.
    'cancelar-visita': async (el) => {
      const v = visitas.find((x) => x.chave === el.dataset.chave);
      if (!v) return;
      if (!await confirmar({ titulo: 'Cancelar este agendamento?', mensagem: 'Ele fica "aguardando reagendamento" para você marcar outra data.', confirmar: 'Cancelar agendamento', cancelar: 'Voltar', perigo: true })) return;
      await comCarregando(el, async () => {
        try {
          await cancelarAgendamentoCompleto(empresaId, v.linhas);
          toast('Agendamento cancelado. Ele aguarda reagendamento.', 'sucesso');
          recarregar();
        } catch (e) { mostrarErro(e); }
      });
    },
    'excluir-visita': async (el) => {
      const v = visitas.find((x) => x.chave === el.dataset.chave);
      if (!v) return;
      if (!await confirmar({ titulo: 'Excluir este agendamento?', mensagem: 'Apaga os dados deste agendamento. Não apaga o cliente, os aparelhos dele nem serviços já concluídos. Não dá para desfazer.', confirmar: 'Excluir agendamento', cancelar: 'Voltar', perigo: true })) return;
      await comCarregando(el, async () => {
        try {
          await excluirAgendamentoCompleto(empresaId, v.linhas);
          toast('Agendamento excluído.', 'sucesso');
          recarregar();
        } catch (e) { mostrarErro(e); }
      });
    },

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
