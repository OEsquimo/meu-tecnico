// =============================================================================
// MODO DEMONSTRAÇÃO — dados de exemplo para ver o app funcionando sem Firebase
// =============================================================================
// Abra o app com ?demo=1 no endereço. Os dados ficam só no navegador (localStorage)
// e o login é falso. NENHUMA regra de segurança é aplicada aqui: serve para
// conhecer as telas e para os testes automáticos, nunca para uso real.
//
// Contas de exemplo (senha de todas: demo123):
//   demo@meutecnico.app     -> administrador (empresa "Frio Certo Refrigeração")
//   tecnico@meutecnico.app  -> técnico da mesma empresa
//   dono@meutecnico.app     -> dono do aplicativo (painel /dono)
// =============================================================================

import { TIPOS_SERVICO_PADRAO, PLANOS_PADRAO, REGRAS_PADRAO, MENSAGEM_WHATSAPP_PADRAO } from './constantes.js';
import { AGORA } from './banco-comum.js';

export const CONTAS_DEMO = {
  admin: { email: 'demo@meutecnico.app', senha: 'demo123', uid: 'demo-admin' },
  tecnico: { email: 'tecnico@meutecnico.app', senha: 'demo123', uid: 'demo-tecnico' },
  dono: { email: 'dono@meutecnico.app', senha: 'demo123', uid: 'demo-dono' },
};

/** Registra os logins de exemplo (precisa rodar a cada abertura: o login fica só na memória). */
export function cadastrarUsuariosDemo(memoria) {
  for (const c of Object.values(CONTAS_DEMO)) memoria.cadastrarUsuario(c.email, c.senha, c.uid);
}

/** Data relativa a agora: dia(0, 14) = hoje às 14h; dia(-30, 9) = há 30 dias, 9h. */
function dia(diasDepois, hora = 9, minuto = 0) {
  const d = new Date();
  d.setDate(d.getDate() + diasDepois);
  d.setHours(hora, minuto, 0, 0);
  return d;
}

function iso(diasDepois) {
  const d = new Date();
  d.setDate(d.getDate() + diasDepois);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const END = (id, rua, numero, bairro, cidade, uf, cep = '', extras = {}) => ({
  id, apelido: '', cep, rua, numero, complemento: '', bairro, cidade, uf, lat: null, lng: null, ...extras,
});

/** Cria todos os documentos de exemplo. */
export async function semearDemonstracao(memoria) {
  const E = 'demo-admin';
  const docs = {};

  // ---- Planos e regras do aplicativo ----
  for (const p of PLANOS_PADRAO) {
    docs[`planos/${p.id}`] = {
      nome: p.nome, precoCentavos: p.precoCentavos, limiteClientes: p.limiteClientes, financeiroCompleto: p.financeiroCompleto,
      ativo: p.ativo, ordem: p.ordem, descricao: p.descricao, atualizadoEm: AGORA,
    };
  }
  docs['config/regras'] = { ...REGRAS_PADRAO, whatsappVendas: '5511999990000', instrucoesPagamento: 'Pix: contato@meutecnico.app (CNPJ de exemplo)', atualizadoEm: AGORA };
  docs[`donosApp/${CONTAS_DEMO.dono.uid}`] = { criadoEm: AGORA };

  // ---- Empresa de exemplo (plano Médio pago e vigente) ----
  docs[`empresas/${E}`] = {
    nome: 'Frio Certo Refrigeração', donoUid: E, emailAdmin: CONTAS_DEMO.admin.email, nomeAdmin: 'Marcos Frio',
    planoId: 'medio', planoAte: dia(20), testeEstendidoAte: null, bloqueada: false, contadorClientes: 4,
    permiteTecnicoCliente: false, diasAvisoRetorno: 15, mensagemWhatsapp: MENSAGEM_WHATSAPP_PADRAO, criadoEm: dia(-60),
  };
  docs[`usuarios/${E}`] = { empresaId: E, papel: 'admin', ativo: true, nome: 'Marcos Frio', criadoEm: dia(-60) };
  docs[`usuarios/${CONTAS_DEMO.tecnico.uid}`] = {
    empresaId: E, papel: 'tecnico', ativo: true, nome: 'Rafael Costa', equipeId: 'eq-rafael', criadoEm: dia(-40),
  };

  // ---- Equipe ----
  docs[`empresas/${E}/equipe/eq-rafael`] = { nome: 'Rafael Costa', telefone: '5511987654321', status: 'ativo', uid: CONTAS_DEMO.tecnico.uid, criadoEm: dia(-40) };
  docs[`empresas/${E}/equipe/eq-sergio`] = { nome: 'Sérgio Alves', telefone: '5511976543210', status: 'convite', uid: null, criadoEm: dia(-2) };
  docs[`empresas/${E}/equipe/eq-julio`] = { nome: 'Júlio Ramos', telefone: '5511965432109', status: 'bloqueado', uid: 'u-julio', criadoEm: dia(-50) };
  docs['usuarios/u-julio'] = { empresaId: E, papel: 'tecnico', ativo: false, nome: 'Júlio Ramos', equipeId: 'eq-julio', criadoEm: dia(-50) };

  // ---- Tipos de serviço ----
  const tipos = {};
  TIPOS_SERVICO_PADRAO.forEach((t, i) => {
    const id = `tipo-${i + 1}`;
    tipos[t.nome] = { id, ...t };
    docs[`empresas/${E}/tiposServico/${id}`] = t;
  });

  // ---- Clientes e aparelhos ----
  docs[`empresas/${E}/clientes/c-maria`] = {
    nome: 'Maria Souza', whatsapp: '5511912345678', observacoes: 'Portão azul. Tem um cachorro, avisar antes de entrar.',
    enderecos: [END('e-maria', 'Rua das Flores', '120', 'Jardim América', 'São Paulo', 'SP', '01310100')],
    criadoEm: dia(-90), atualizadoEm: dia(-90), criadoPor: E,
  };
  docs[`empresas/${E}/clientes/c-joao`] = {
    nome: 'João Pereira', whatsapp: '5511923456789', observacoes: '',
    enderecos: [END('e-joao', 'Avenida Brasil', '455', 'Centro', 'Campinas', 'SP', ''), END('e-joao2', 'Rua Sete de Setembro', '30', 'Vila Nova', 'Campinas', 'SP')],
    criadoEm: dia(-80), atualizadoEm: dia(-80), criadoPor: E,
  };
  docs[`empresas/${E}/clientes/c-ana`] = {
    nome: 'Ana Lima', whatsapp: '5511934567890', observacoes: 'Prefere atendimento à tarde.',
    enderecos: [END('e-ana', 'Rua Quinze de Novembro', '9', 'Centro', 'Santos', 'SP')],
    criadoEm: dia(-70), atualizadoEm: dia(-70), criadoPor: E,
  };
  docs[`empresas/${E}/clientes/c-carlos`] = {
    nome: 'Carlos Menezes', whatsapp: '5511945678901', observacoes: '',
    enderecos: [END('e-carlos', 'Rua do Comércio', '77', 'Boa Vista', 'Sorocaba', 'SP')],
    criadoEm: dia(-30), atualizadoEm: dia(-30), criadoPor: E,
  };

  const ap = (id, clienteId, enderecoId, tipo, btus, nome) => {
    docs[`empresas/${E}/aparelhos/${id}`] = { clienteId, enderecoId, tipo, btus, nome, descricao: '', ativo: true, criadoEm: dia(-90), atualizadoEm: dia(-90) };
  };
  ap('a-maria-sala', 'c-maria', 'e-maria', 'split', 12000, 'Sala');
  ap('a-maria-quarto', 'c-maria', 'e-maria', 'split', 9000, 'Quarto');
  ap('a-joao-1', 'c-joao', 'e-joao', 'cassete', 36000, 'Loja');
  ap('a-ana-1', 'c-ana', 'e-ana', 'janela', 7000, '');
  ap('a-carlos-1', 'c-carlos', 'e-carlos', 'piso-teto', 24000, 'Escritório');

  // ---- Serviços ----
  const servicoBase = (cliente, endId, apId, apResumo, tipoNome) => {
    const c = docs[`empresas/${E}/clientes/${cliente}`];
    const e = c.enderecos.find((x) => x.id === endId);
    return {
      clienteId: cliente, clienteNome: c.nome, clienteWhatsapp: c.whatsapp,
      local: `${e.rua}, ${e.numero} · ${e.bairro} · ${e.cidade}/${e.uf}`, localLat: null, localLng: null, enderecoId: endId,
      aparelhoId: apId, aparelhoResumo: apResumo,
      tipoServicoId: tipos[tipoNome].id, tipoServicoNome: tipoNome, geraRetorno: tipos[tipoNome].geraRetorno,
      criadoEm: dia(-100), atualizadoEm: dia(-100),
    };
  };
  const agendado = (id, base, quando, tecnicoUid, tecnicoNome, descricao = '') => {
    docs[`empresas/${E}/servicos/${id}`] = {
      ...base, status: 'agendado', dataAgendada: quando, tecnicoUid, tecnicoNome, descricao, pago: false, valorDefinido: false,
    };
  };
  const concluido = (id, base, quando, tecnicoUid, tecnicoNome, descricao, valorCentavos, pago, retornoMeses, diasRetorno) => {
    docs[`empresas/${E}/servicos/${id}`] = {
      ...base, status: 'concluido', dataAgendada: quando, dataConclusao: quando, tecnicoUid, tecnicoNome, descricao, pago,
      valorDefinido: valorCentavos !== null, garantiaAte: iso(Math.round((quando - new Date()) / 86400000) + 90),
      concluidoPorNome: tecnicoNome, retornoMeses: retornoMeses ?? null,
      dataRetorno: retornoMeses ? iso(diasRetorno) : null, retornoSituacao: retornoMeses ? 'pendente' : null,
    };
    if (valorCentavos !== null) {
      docs[`empresas/${E}/valores/${id}`] = { valorCentavos, tipoNome: base.tipoServicoNome, dataConclusao: quando, atualizadoEm: quando };
    }
  };

  const tecnico = CONTAS_DEMO.tecnico.uid;
  agendado('s-hoje-1', servicoBase('c-maria', 'e-maria', 'a-maria-sala', 'Sala · Split (parede) · 12.000 BTUs', 'Limpeza'), dia(0, 14), tecnico, 'Rafael Costa');
  agendado('s-hoje-2', servicoBase('c-ana', 'e-ana', 'a-ana-1', 'Janela · 7.000 BTUs', 'Carga de gás'), dia(0, 16, 30), E, 'Marcos Frio', 'Verificar vazamento.');
  agendado('s-amanha', servicoBase('c-joao', 'e-joao', 'a-joao-1', 'Loja · Cassete · 36.000 BTUs', 'Instalação'), dia(1, 9), tecnico, 'Rafael Costa');
  agendado('s-semana', servicoBase('c-carlos', 'e-carlos', 'a-carlos-1', 'Escritório · Piso/teto · 24.000 BTUs', 'Manutenção preventiva'), dia(5, 10), E, 'Marcos Frio');

  // Concluídos: alguns com retorno vencido/próximo/futuro, um sem valor (feito por técnico)
  concluido('s-c1', servicoBase('c-maria', 'e-maria', 'a-maria-quarto', 'Quarto · Split (parede) · 9.000 BTUs', 'Limpeza'), dia(-190, 10), E, 'Marcos Frio', 'Limpeza completa de filtros e serpentina.', 18000, true, 6, -10);
  concluido('s-c2', servicoBase('c-joao', 'e-joao', 'a-joao-1', 'Loja · Cassete · 36.000 BTUs', 'Manutenção preventiva'), dia(-170, 11), tecnico, 'Rafael Costa', 'Manutenção preventiva trimestral.', 35000, true, 6, 5);
  concluido('s-c3', servicoBase('c-ana', 'e-ana', 'a-ana-1', 'Janela · 7.000 BTUs', 'Limpeza'), dia(-100, 15), E, 'Marcos Frio', 'Limpeza e troca de capacitor.', 22000, false, 6, 80);
  concluido('s-c4', servicoBase('c-carlos', 'e-carlos', 'a-carlos-1', 'Escritório · Piso/teto · 24.000 BTUs', 'Instalação'), dia(-20, 9), E, 'Marcos Frio', 'Instalação completa com suporte e dreno.', 120000, true, null, 0);
  concluido('s-c5', servicoBase('c-maria', 'e-maria', 'a-maria-sala', 'Sala · Split (parede) · 12.000 BTUs', 'Carga de gás'), dia(-3, 14), tecnico, 'Rafael Costa', 'Recarga de gás R410A após reparo.', null, true, null, 0);
  concluido('s-c6', servicoBase('c-joao', 'e-joao', 'a-joao-1', 'Loja · Cassete · 36.000 BTUs', 'Limpeza'), dia(-1, 10), E, 'Marcos Frio', 'Limpeza geral.', 28000, false, 4, 120);

  // ---- Outras empresas (só para o painel do dono) ----
  const outra = (id, nome, plano, extras) => {
    docs[`empresas/${id}`] = {
      nome, donoUid: id, emailAdmin: `${id}@exemplo.com`, nomeAdmin: nome, planoId: plano, planoAte: null, testeEstendidoAte: null,
      bloqueada: false, contadorClientes: 0, permiteTecnicoCliente: false, diasAvisoRetorno: 15, mensagemWhatsapp: 'Olá',
      criadoEm: dia(-5), ...extras,
    };
  };
  outra('emp-ana', 'Ana Lima Climatização', 'gratis', { contadorClientes: 8, criadoEm: dia(-40) });
  outra('emp-carlos', 'Carlos Menezes Ar', 'gratis', { contadorClientes: 14, criadoEm: dia(-2) });
  outra('emp-marcos', 'Marcos Rocha Refrigeração', 'basico', { contadorClientes: 20, planoAte: dia(-6), criadoEm: dia(-220) });
  outra('emp-paula', 'Paula Souza Frio', 'avancado', { contadorClientes: 41, planoAte: dia(25), criadoEm: dia(-150) });
  outra('emp-bloq', 'Conta Bloqueada Exemplo', 'gratis', { contadorClientes: 3, bloqueada: true, criadoEm: dia(-90) });

  memoria.semear(docs);
}
