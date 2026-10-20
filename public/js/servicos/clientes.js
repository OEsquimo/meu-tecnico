// =============================================================================
// CLIENTES — acesso a dados (CRUD) com controle do limite do plano
// =============================================================================
// Cada cliente tem até 2 endereços (guardados dentro do próprio documento).
//
// LIMITE DE CLIENTES: o plano define quantos clientes a empresa pode ter. Para
// o servidor conseguir conferir isso (as regras do Firestore não sabem contar
// documentos), a empresa guarda um CONTADOR (contadorClientes). Toda criação ou
// exclusão de cliente atualiza o contador NO MESMO LOTE. Se alguém tentar criar
// cliente sem subir o contador, as regras recusam (ver firestore.rules).
// =============================================================================

import { ler, listar, gravar, operacao as op, novoId, AGORA } from '../nucleo/banco.js';
import { comCache, invalidarCache } from '../nucleo/cache.js';
import { ErroApp, ehErroDePermissao } from '../nucleo/erros.js';
import { sessao, recarregarEmpresa } from '../nucleo/sessao.js';
import { podeCadastrarCliente } from '../dominio/planos.js';
import { ordenarPorNome } from '../dominio/clientes.js';
import { localDoServico } from '../dominio/servicos.js';

const caminho = (empresaId) => `empresas/${empresaId}/clientes`;

/** Mensagem clara para cada motivo de bloqueio do cadastro. */
export function mensagemDeBloqueio(permissao) {
  if (permissao.motivo === 'bloqueada') return 'Sua conta está bloqueada. Fale com o suporte do aplicativo.';
  if (permissao.motivo === 'vencida') return 'Seu plano venceu. Renove na tela "Meu plano" para cadastrar novos clientes. Seus dados continuam guardados.';
  return `Você chegou ao limite de ${permissao.limite} clientes do seu plano. Veja a tela "Meu plano" para cadastrar mais. Seus dados continuam guardados.`;
}

/** Lista todos os clientes (ordem alfabética), com cache de alguns minutos. */
export function listarClientes(empresaId) {
  return comCache(`${empresaId}:clientes`, async () => ordenarPorNome(await listar(caminho(empresaId))));
}

export function buscarCliente(empresaId, id) {
  return ler(`${caminho(empresaId)}/${id}`);
}

/**
 * Cria o cliente e sobe o contador da empresa (mesmo lote).
 * Retorna o id do novo cliente.
 * @param {object} dados já validados: { nome, whatsapp, observacoes, enderecos }
 */
export async function criarCliente(empresaId, dados, uid) {
  const id = novoId(caminho(empresaId));
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    // Lemos a empresa de novo antes de gravar: outro aparelho pode ter cadastrado
    // clientes e mudado o contador desde a última leitura.
    const empresa = await ler(`empresas/${empresaId}`);
    if (!empresa) throw new ErroApp('Empresa não encontrada. Saia e entre de novo.', 'sem-empresa');
    const permissao = podeCadastrarCliente(empresa, sessao.planos, sessao.regras);
    if (!permissao.ok) throw new ErroApp(mensagemDeBloqueio(permissao), 'limite-clientes');
    try {
      await gravar([
        op.criar(`${caminho(empresaId)}/${id}`, {
          ...dados, criadoEm: AGORA, atualizadoEm: AGORA, criadoPor: uid,
        }),
        op.atualizar(`empresas/${empresaId}`, { contadorClientes: (empresa.contadorClientes ?? 0) + 1, ultimoClienteId: id }),
      ]);
      invalidarCache(`${empresaId}:clientes`);
      await recarregarEmpresa();
      return id;
    } catch (erro) {
      // "Permissão negada" na primeira tentativa costuma ser contador desatualizado: tenta uma vez mais.
      if (tentativa === 0 && ehErroDePermissao(erro)) continue;
      throw erro;
    }
  }
  throw new ErroApp('Não foi possível cadastrar o cliente agora. Tente de novo.', 'falha-cliente');
}

/**
 * Atualiza o cliente. Os serviços JÁ AGENDADOS desse cliente também recebem o
 * nome/telefone/local novos (o técnico enxerga o que está dentro do serviço).
 * Serviços já concluídos mantêm os dados da época (histórico não muda).
 */
export async function atualizarCliente(empresaId, id, dados, { administrador = true } = {}) {
  await gravar([op.atualizar(`${caminho(empresaId)}/${id}`, { ...dados, atualizadoEm: AGORA })]);
  invalidarCache(`${empresaId}:clientes`);
  if (!administrador) return;
  const servicos = await listar(`empresas/${empresaId}/servicos`, { onde: [['clienteId', '==', id]] });
  const agendados = servicos.filter((s) => s.status === 'agendado');
  const operacoes = agendados.map((s) => {
    const endereco = dados.enderecos.find((e) => e.id === s.enderecoId) || dados.enderecos[0];
    return op.atualizar(`empresas/${empresaId}/servicos/${s.id}`, {
      clienteNome: dados.nome,
      clienteWhatsapp: dados.whatsapp,
      local: localDoServico(endereco),
      localLat: endereco?.lat ?? null,
      localLng: endereco?.lng ?? null,
      atualizadoEm: AGORA,
    });
  });
  for (let i = 0; i < operacoes.length; i += 400) await gravar(operacoes.slice(i, i + 400));
  if (operacoes.length) invalidarCache(`${empresaId}:servicos`);
}

/**
 * Exclui o cliente E tudo que pertence a ele (aparelhos, serviços e valores),
 * e baixa o contador. Só o administrador pode.
 */
export async function excluirCliente(empresaId, id) {
  const servicos = await listar(`empresas/${empresaId}/servicos`, { onde: [['clienteId', '==', id]] });
  const aparelhos = await listar(`empresas/${empresaId}/aparelhos`, { onde: [['clienteId', '==', id]] });
  const apagar = [
    ...servicos.flatMap((s) => [
      op.apagar(`empresas/${empresaId}/servicos/${s.id}`),
      op.apagar(`empresas/${empresaId}/valores/${s.id}`),
    ]),
    ...aparelhos.map((a) => op.apagar(`empresas/${empresaId}/aparelhos/${a.id}`)),
  ];
  for (let i = 0; i < apagar.length; i += 400) await gravar(apagar.slice(i, i + 400));

  const empresa = await ler(`empresas/${empresaId}`);
  await gravar([
    op.apagar(`${caminho(empresaId)}/${id}`),
    op.atualizar(`empresas/${empresaId}`, { contadorClientes: Math.max(0, (empresa?.contadorClientes ?? 1) - 1), ultimoClienteId: id }),
  ]);
  invalidarCache(`${empresaId}:`);
  await recarregarEmpresa();
}
