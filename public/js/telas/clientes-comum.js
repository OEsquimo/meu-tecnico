// =============================================================================
// AUXILIAR DAS TELAS DE CLIENTES (não é uma tela: não tem rota)
// =============================================================================
// Pedaços usados por mais de uma tela do grupo clientes / cliente / cliente-form /
// aparelho-form, para não repetir código:
//   * telaDeErro: mensagem clara + botão "Tentar de novo" (o app nunca trava
//     em "carregando");
//   * rotuloDoEndereco: texto curto para escolher entre os 2 endereços;
//   * carregarEstilosClientes: carrega css/telas-clientes.css (o index.html não o declara);
//   * montarDescricaoAparelho / lerDescricaoAparelho: o modelo de dados do
//     aparelho não tem campos "marca" e "modelo", então eles viajam dentro do
//     texto "descricao" (linhas "Marca: ..." e "Modelo: ..." no começo).
// =============================================================================

import { mostrar, aoClicar } from '../nucleo/ui.js';
import { estadoVazio, botao } from '../nucleo/componentes.js';
import { traduzirErro, ehErroDeRede } from '../nucleo/erros.js';
import { linhaCurtaDoEndereco } from '../dominio/endereco.js';

/**
 * Troca a tela por um aviso de erro com "Tentar de novo".
 * Retorna a função que desliga o clique (para a tela devolver como limpeza).
 */
export function telaDeErro(raiz, erro, recarregar, titulo = 'Não foi possível carregar') {
  mostrar(raiz, estadoVazio({
    icone: 'alerta',
    titulo: ehErroDeRede(erro) ? 'Sem conexão' : titulo,
    texto: traduzirErro(erro),
    acao: botao({ texto: 'Tentar de novo', acao: 'tentar-de-novo' }),
  }));
  return aoClicar(raiz, { 'tentar-de-novo': () => recarregar() });
}

/** "Casa · Rua das Flores, 120" (apelido, se houver, + rua e número). */
export function rotuloDoEndereco(endereco, posicao) {
  const curto = linhaCurtaDoEndereco(endereco) || 'Endereço sem rua';
  return endereco.apelido ? `${endereco.apelido} · ${curto}` : `Endereço ${posicao + 1} · ${curto}`;
}

// -----------------------------------------------------------------------------
// CSS PRÓPRIO DAS TELAS DE CLIENTES
// -----------------------------------------------------------------------------

let promessaEstilos = null;

/** Carrega css/telas-clientes.css uma única vez. Nunca falha nem espera mais de 3 s. */
export function carregarEstilosClientes() {
  if (promessaEstilos) return promessaEstilos;
  promessaEstilos = new Promise((resolver) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/telas-clientes.css';
    link.addEventListener('load', () => resolver());
    link.addEventListener('error', () => resolver());
    document.head.appendChild(link);
    setTimeout(resolver, 3000);
  });
  return promessaEstilos;
}

// -----------------------------------------------------------------------------
// MARCA E MODELO DENTRO DA DESCRIÇÃO DO APARELHO
// -----------------------------------------------------------------------------

/** Junta marca, modelo e observações no texto único guardado em "descricao". */
export function montarDescricaoAparelho({ marca = '', modelo = '', observacoes = '' }) {
  return [
    marca.trim() && `Marca: ${marca.trim()}`,
    modelo.trim() && `Modelo: ${modelo.trim()}`,
    observacoes.trim(),
  ].filter(Boolean).join('\n');
}

/** Faz o caminho inverso: { marca, modelo, observacoes } a partir da descrição guardada. */
export function lerDescricaoAparelho(descricao) {
  const linhas = String(descricao ?? '').split('\n');
  let marca = '';
  let modelo = '';
  if (linhas[0]?.startsWith('Marca: ')) marca = linhas.shift().slice(7).trim();
  if (linhas[0]?.startsWith('Modelo: ')) modelo = linhas.shift().slice(8).trim();
  return { marca, modelo, observacoes: linhas.join('\n').trim() };
}
