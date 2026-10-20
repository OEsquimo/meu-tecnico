// =============================================================================
// TELA: Clientes (lista com busca)
// =============================================================================
// Mostra todos os clientes da empresa em ordem alfabética, com:
//   * contador "x de limite" do plano (ex.: "4 de 30 clientes");
//   * busca por nome, telefone ou rua (filtrarClientes, com espera ao digitar);
//   * botão "Novo cliente" — se o limite do plano foi atingido ou o plano
//     venceu, o botão continua visível mas explica o motivo (mensagemDeBloqueio);
//   * estado vazio com orientação de "o que fazer agora".
// A lista vem de servicos/clientes.js (que usa cache por alguns minutos).
// =============================================================================

import { html, mostrar, aoClicar, toast, esperarDigitar } from '../nucleo/ui.js';
import { cabecalho, campoTexto, botao, aviso, selo, itemLista, estadoVazio, esqueletos } from '../nucleo/componentes.js';
import { resumoDoPlano } from '../nucleo/sessao.js';
import { ehAdmin } from '../nucleo/permissoes.js';
import { listarClientes, mensagemDeBloqueio } from '../servicos/clientes.js';
import { filtrarClientes } from '../dominio/clientes.js';
import { formatarTelefone } from '../dominio/telefone.js';
import { linhaCurtaDoEndereco } from '../dominio/endereco.js';
import { textoLimite } from '../dominio/planos.js';
import { telaDeErro } from './clientes-comum.js';

/** "4 de 30 clientes" ou "4 clientes" (plano sem limite). */
function textoDoContador(plano) {
  const limite = textoLimite(plano.limite);
  return limite === 'Ilimitado' ? `${plano.usados} clientes` : `${plano.usados} de ${limite} clientes`;
}

export default async function montar({ raiz, sessao, recarregar, ativo }) {
  const empresaId = sessao.vinculo.empresaId;
  const plano = resumoDoPlano();
  const podeNovo = plano ? plano.podeCadastrar : true;
  let limpar = () => {};

  /** Botão "Novo cliente": link normal, ou aviso do motivo se estiver bloqueado. */
  const botaoNovo = (id = '') => (podeNovo
    ? botao({ texto: 'Novo cliente', iconeNome: 'mais', href: '#/cliente/novo', bloco: true, id })
    : botao({ texto: 'Novo cliente', iconeNome: 'mais', acao: 'bloqueado', bloco: true, id }));

  const mensagemBloqueio = plano && !podeNovo
    ? mensagemDeBloqueio({ motivo: plano.motivoBloqueio, limite: plano.limite })
    : '';

  mostrar(raiz, html`
    ${cabecalho({
      titulo: 'Clientes',
      subtitulo: plano && html`<span data-contador>${textoDoContador(plano)}</span>`,
    })}
    <div class="pilha">
      ${mensagemBloqueio && aviso({ tom: 'amarelo', texto: mensagemBloqueio })}
      ${plano && !podeNovo && ehAdmin(sessao) && botao({ texto: 'Ver meu plano', variante: 'secundario', href: '#/plano', bloco: true })}
      ${botaoNovo('botao-novo-topo')}
      <div id="area-busca"></div>
      <div id="area-lista">${esqueletos(3)}</div>
    </div>`);

  limpar = aoClicar(raiz, {
    bloqueado: () => toast(mensagemBloqueio, 'erro', 9000),
  });

  // Carrega os clientes (nunca deixa a tela travada: erro vira "Tentar de novo").
  let todos;
  try {
    todos = await listarClientes(empresaId);
  } catch (erro) {
    if (!ativo()) return limpar;
    limpar();
    return telaDeErro(raiz, erro, recarregar, 'Não foi possível carregar os clientes');
  }
  if (!ativo()) return limpar;

  // Nenhum cliente ainda: orienta o primeiro passo.
  if (todos.length === 0) {
    mostrar(raiz.querySelector('#area-lista'), estadoVazio({
      icone: 'clientes',
      titulo: 'Nenhum cliente ainda',
      texto: 'Cadastre o primeiro cliente para guardar os endereços, os aparelhos e o histórico de serviços.',
    }));
    return limpar;
  }

  // Campo de busca (fica fora da lista para não perder o foco ao filtrar).
  mostrar(raiz.querySelector('#area-busca'), campoTexto({
    nome: 'busca', rotulo: 'Buscar cliente', tipo: 'search', placeholder: 'Nome, telefone ou rua', autocompletar: 'off',
  }));

  const area = raiz.querySelector('#area-lista');

  /** Desenha a lista já filtrada pelo texto da busca. */
  function desenharLista(termo) {
    const lista = filtrarClientes(todos, termo);
    if (lista.length === 0) {
      mostrar(area, estadoVazio({ icone: 'buscar', titulo: 'Nenhum cliente encontrado', texto: 'Confira a escrita ou tente só uma parte do nome.' }));
      return;
    }
    mostrar(area, html`
      <div class="lista">
        ${lista.map((c) => itemLista({
          href: `#/cliente/${encodeURIComponent(c.id)}`,
          avatarNome: c.nome,
          titulo: c.nome,
          sub: [formatarTelefone(c.whatsapp), linhaCurtaDoEndereco(c.enderecos?.[0])].filter(Boolean).join(' · '),
          direita: (c.enderecos?.length ?? 0) > 1 ? selo('2 endereços') : null,
        }))}
      </div>`);
  }

  desenharLista('');
  const entrada = raiz.querySelector('input[name="busca"]');
  const filtrar = esperarDigitar(() => desenharLista(entrada.value));
  entrada.addEventListener('input', filtrar);

  return limpar;
}
