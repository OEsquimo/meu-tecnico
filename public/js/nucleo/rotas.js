// =============================================================================
// ROTAS — a lista de TODAS as telas do aplicativo e quem pode abrir cada uma
// =============================================================================
// O app usa endereços com "#" (ex.: #/clientes, #/cliente/abc123). Assim o
// Firebase Hosting serve sempre o mesmo index.html e nada quebra ao recarregar.
//
// Campos de cada rota:
//   padrao   : caminho; ":nome" é um parâmetro (ex.: '/cliente/:id')
//   carregar : abre o arquivo da tela só quando precisa (app abre mais rápido)
//   acesso   : 'publico' | 'logado' | 'membro' | 'admin' | 'clientes' | 'dono'
//   menu     : qual aba do menu do topo fica destacada (ou null)
//   titulo   : nome que aparece na aba do navegador
//   permiteLogado : rota pública que também funciona com login (termos, convite)
//   extras   : valores fixos enviados para a tela (ex.: qual documento legal)
//
// "decidirAcesso" é uma função pura (fácil de testar): diz se a tela pode abrir
// agora ou para onde redirecionar.
// =============================================================================

import { acessoPermitido, podeGerirClientes, ehAdmin, ehAdminMesmoBloqueado, ehTecnico } from './permissoes.js';

export const ROTAS = [
  // ---- Sem login ----
  { padrao: '/entrar', carregar: () => import('../telas/entrar.js'), acesso: 'publico', menu: null, titulo: 'Entrar' },
  { padrao: '/criar-conta', carregar: () => import('../telas/criar-conta.js'), acesso: 'publico', menu: null, titulo: 'Criar conta' },
  { padrao: '/recuperar-senha', carregar: () => import('../telas/recuperar-senha.js'), acesso: 'publico', menu: null, titulo: 'Recuperar senha' },
  { padrao: '/convite/:empresaId/:equipeId', carregar: () => import('../telas/convite.js'), acesso: 'publico', permiteLogado: true, menu: null, titulo: 'Convite' },
  { padrao: '/termos', carregar: () => import('../telas/documento-legal.js'), acesso: 'publico', permiteLogado: true, menu: null, titulo: 'Termos de uso', extras: { documento: 'termos' } },
  { padrao: '/privacidade', carregar: () => import('../telas/documento-legal.js'), acesso: 'publico', permiteLogado: true, menu: null, titulo: 'Privacidade', extras: { documento: 'privacidade' } },

  // ---- Logado, mas sem empresa / bloqueado ----
  { padrao: '/vinculo', carregar: () => import('../telas/sem-vinculo.js'), acesso: 'logado', menu: null, titulo: 'Concluir cadastro' },
  { padrao: '/acesso-bloqueado', carregar: () => import('../telas/aviso-conta.js'), acesso: 'logado', menu: null, titulo: 'Acesso bloqueado', extras: { tipo: 'usuario' } },
  { padrao: '/conta-bloqueada', carregar: () => import('../telas/aviso-conta.js'), acesso: 'logado', menu: null, titulo: 'Conta bloqueada', extras: { tipo: 'conta' } },

  // ---- Administrador e técnico ----
  { padrao: '/', carregar: () => import('../telas/inicio.js'), acesso: 'membro', menu: 'inicio', titulo: 'Início' },
  { padrao: '/agenda', carregar: () => import('../telas/agenda.js'), acesso: 'membro', menu: 'agenda', titulo: 'Agenda' },
  { padrao: '/servico/:id', carregar: () => import('../telas/servico.js'), acesso: 'membro', menu: 'agenda', titulo: 'Serviço' },
  { padrao: '/concluir/:id', carregar: () => import('../telas/concluir-servico.js'), acesso: 'membro', menu: 'agenda', titulo: 'Concluir serviço' },
  { padrao: '/historico', carregar: () => import('../telas/historico.js'), acesso: 'membro', menu: 'historico', titulo: 'Histórico' },
  { padrao: '/aparelho/:id/editar', carregar: () => import('../telas/aparelho-form.js'), acesso: 'membro', menu: null, titulo: 'Aparelho' },
  { padrao: '/cliente/:clienteId/aparelho/novo', carregar: () => import('../telas/aparelho-form.js'), acesso: 'membro', menu: null, titulo: 'Novo aparelho' },
  { padrao: '/conta', carregar: () => import('../telas/conta.js'), acesso: 'membro', menu: null, titulo: 'Minha conta' },

  // ---- Clientes (administrador; técnico só se liberado) ----
  { padrao: '/clientes', carregar: () => import('../telas/clientes.js'), acesso: 'clientes', menu: 'clientes', titulo: 'Clientes' },
  { padrao: '/cliente/novo', carregar: () => import('../telas/cliente-form.js'), acesso: 'clientes', menu: 'clientes', titulo: 'Novo cliente' },
  { padrao: '/cliente/:id', carregar: () => import('../telas/cliente.js'), acesso: 'clientes', menu: 'clientes', titulo: 'Cliente' },
  { padrao: '/cliente/:id/editar', carregar: () => import('../telas/cliente-form.js'), acesso: 'clientes', menu: 'clientes', titulo: 'Editar cliente' },

  // ---- Só administrador ----
  { padrao: '/agendar', carregar: () => import('../telas/agendar.js'), acesso: 'admin', menu: 'agenda', titulo: 'Agendar serviço' },
  { padrao: '/servico/:id/editar', carregar: () => import('../telas/agendar.js'), acesso: 'admin', menu: 'agenda', titulo: 'Editar agendamento' },
  { padrao: '/retornos', carregar: () => import('../telas/retornos.js'), acesso: 'admin', menu: null, titulo: 'Retornos' },
  { padrao: '/financeiro', carregar: () => import('../telas/financeiro.js'), acesso: 'admin', menu: 'financeiro', titulo: 'Financeiro' },
  { padrao: '/administrativa', carregar: () => import('../telas/administrativa.js'), acesso: 'admin', menu: null, titulo: 'Administrativa' },
  { padrao: '/tipos-servico', carregar: () => import('../telas/tipos-servico.js'), acesso: 'admin', menu: null, titulo: 'Tipos de serviço' },
  { padrao: '/tipos-servico/novo', carregar: () => import('../telas/tipo-servico-form.js'), acesso: 'admin', menu: null, titulo: 'Novo tipo de serviço' },
  { padrao: '/tipos-servico/:id', carregar: () => import('../telas/tipo-servico-form.js'), acesso: 'admin', menu: null, titulo: 'Tipo de serviço' },
  { padrao: '/equipe', carregar: () => import('../telas/equipe.js'), acesso: 'admin', menu: null, titulo: 'Equipe' },
  { padrao: '/equipe/novo', carregar: () => import('../telas/funcionario-form.js'), acesso: 'admin', menu: null, titulo: 'Novo funcionário' },
  { padrao: '/equipe/convite/:id', carregar: () => import('../telas/convite-criado.js'), acesso: 'admin', menu: null, titulo: 'Convite' },
  { padrao: '/equipe/:id', carregar: () => import('../telas/funcionario.js'), acesso: 'admin', menu: null, titulo: 'Funcionário' },
  { padrao: '/configuracoes', carregar: () => import('../telas/configuracoes.js'), acesso: 'admin', menu: null, titulo: 'Configurações' },
  { padrao: '/plano', carregar: () => import('../telas/meu-plano.js'), acesso: 'admin', menu: null, titulo: 'Meu plano' },
  { padrao: '/backup', carregar: () => import('../telas/backup.js'), acesso: 'admin', menu: null, titulo: 'Backup' },

  // ---- Painel do dono do aplicativo ----
  { padrao: '/dono', carregar: () => import('../telas/dono-resumo.js'), acesso: 'dono', menu: 'resumo', menuTipo: 'dono', titulo: 'Painel do dono' },
  { padrao: '/dono/planos', carregar: () => import('../telas/dono-planos.js'), acesso: 'dono', menu: 'planos', menuTipo: 'dono', titulo: 'Planos' },
  { padrao: '/dono/contas', carregar: () => import('../telas/dono-contas.js'), acesso: 'dono', menu: 'contas', menuTipo: 'dono', titulo: 'Contas' },
];

/** Tela para endereços que não existem. */
export const ROTA_NAO_ENCONTRADA = {
  padrao: '*', carregar: () => import('../telas/nao-encontrada.js'), acesso: 'publico', permiteLogado: true, menu: null, titulo: 'Página não encontrada',
};

/** Compara "/cliente/abc" com "/cliente/:id" e devolve { id: 'abc' } (ou null se não bate). */
export function casarPadrao(padrao, caminho) {
  const a = padrao.split('/').filter(Boolean);
  const b = caminho.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startsWith(':')) {
      try {
        params[a[i].slice(1)] = decodeURIComponent(b[i]);
      } catch {
        return null;
      }
    } else if (a[i] !== b[i]) {
      return null;
    }
  }
  return params;
}

/** Acha a rota do caminho. Rotas fixas ('/cliente/novo') vencem as com parâmetro ('/cliente/:id'). */
export function resolverRota(caminho) {
  const candidatas = [];
  for (const rota of ROTAS) {
    const params = casarPadrao(rota.padrao, caminho);
    if (params) candidatas.push({ rota, params });
  }
  candidatas.sort((x, y) => Object.keys(x.params).length - Object.keys(y.params).length);
  return candidatas[0] || { rota: ROTA_NAO_ENCONTRADA, params: {} };
}

/**
 * Decide se a rota pode abrir agora.
 * Retorna { tipo: 'ok' } | { tipo: 'aguardar' } | { tipo: 'erro' }
 *       | { tipo: 'redirecionar', para, aviso? }
 */
export function decidirAcesso(rota, s) {
  const estado = s.estado;
  if (estado === 'iniciando' || estado === 'carregando') return { tipo: 'aguardar' };
  if (estado === 'erro') return { tipo: 'erro' };

  const aberta = rota.acesso === 'publico' && rota.permiteLogado;

  if (estado === 'visitante') {
    return rota.acesso === 'publico' ? { tipo: 'ok' } : { tipo: 'redirecionar', para: '/entrar' };
  }
  if (estado === 'sem-vinculo') {
    return aberta || rota.padrao === '/vinculo' ? { tipo: 'ok' } : { tipo: 'redirecionar', para: '/vinculo' };
  }
  if (estado === 'dono') {
    if (aberta || rota.acesso === 'dono' || rota.padrao === '/vinculo') return { tipo: 'ok' };
    return { tipo: 'redirecionar', para: '/dono' };
  }
  if (estado === 'usuario-bloqueado') {
    return aberta || rota.padrao === '/acesso-bloqueado' ? { tipo: 'ok' } : { tipo: 'redirecionar', para: '/acesso-bloqueado' };
  }
  if (estado === 'conta-bloqueada') {
    // Mesmo bloqueada, a empresa pode baixar seus dados (direito de portabilidade — LGPD).
    const liberada = aberta || rota.padrao === '/conta-bloqueada'
      || (ehAdminMesmoBloqueado(s) && (rota.padrao === '/backup' || rota.padrao === '/conta'));
    return liberada ? { tipo: 'ok' } : { tipo: 'redirecionar', para: '/conta-bloqueada' };
  }

  // estado === 'pronto'
  if (rota.acesso === 'publico' && !rota.permiteLogado) {
    return { tipo: 'redirecionar', para: s.papel ? '/' : '/entrar' };
  }
  if (rota.acesso === 'logado') return { tipo: 'redirecionar', para: '/' };
  if (!acessoPermitido(rota.acesso, s)) {
    return { tipo: 'redirecionar', para: '/', aviso: 'Você não tem acesso a esta tela.' };
  }
  return { tipo: 'ok' };
}

/** Itens do menu do topo conforme o papel. */
export function itensDoMenu(s, tipo = 'principal') {
  if (tipo === 'dono') {
    return [
      { id: 'resumo', rotulo: 'Resumo', href: '#/dono' },
      { id: 'planos', rotulo: 'Planos', href: '#/dono/planos' },
      { id: 'contas', rotulo: 'Contas', href: '#/dono/contas' },
    ];
  }
  if (ehAdmin(s)) {
    return [
      { id: 'inicio', rotulo: 'Início', href: '#/' },
      { id: 'agenda', rotulo: 'Agenda', href: '#/agenda' },
      { id: 'clientes', rotulo: 'Clientes', href: '#/clientes' },
      { id: 'historico', rotulo: 'Histórico', href: '#/historico' },
      { id: 'financeiro', rotulo: 'Financeiro', href: '#/financeiro' },
    ];
  }
  if (ehTecnico(s)) {
    const itens = [
      { id: 'inicio', rotulo: 'Meus serviços', href: '#/' },
      { id: 'agenda', rotulo: 'Agenda', href: '#/agenda' },
      { id: 'historico', rotulo: 'Histórico', href: '#/historico' },
    ];
    if (podeGerirClientes(s)) itens.splice(2, 0, { id: 'clientes', rotulo: 'Clientes', href: '#/clientes' });
    return itens;
  }
  return [];
}
