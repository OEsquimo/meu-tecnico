// =============================================================================
// DESTINATÁRIOS DO AVISO — quem recebe mensagem quando um agendamento muda
// =============================================================================
// Funções puras (sem tela, sem Firebase). Gera UMA linha para o cliente e UMA para cada técnico
// responsável pela visita (menos o próprio administrador). Cada linha: { id, papel, nome, texto, link, motivo }.
// link vazio = não dá para abrir conversa (o painel não mostra botão). Cliente sem WhatsApp: nem aparece.
// =============================================================================

import { montarAviso, modeloDoAviso, nomesDistintos } from './aviso-cliente.js';
import { montarAvisoTecnico } from './aviso-tecnico.js';
import { tecnicosDoServico, nomesDosTecnicos, ehLinhaSemServico } from './servicos.js';
import { normalizarWhatsappBR } from './telefone.js';
import { linkWhatsapp } from './whatsapp.js';

const primeiroNome = (nome) => String(nome ?? '').trim().split(/\s+/)[0] || '';

/**
 * @param {object} p
 * @param {'agendado'|'cancelado'|'reagendado'} p.tipo
 * @param {object} p.empresa       dados da empresa (nome e textos dos avisos)
 * @param {object[]} p.linhas      linhas (documentos de servicos/) da visita
 * @param {object[]} p.equipe      membros { uid, nome, telefone }
 * @param {string} p.adminUid      quem está usando o app (não recebe aviso)
 * @param {Date} [p.anterior]      dia e hora de antes (reagendamento)
 * @param {string} [p.linkRemarcar] link para o cliente escolher outro horário (cancelamento)
 * @param {string} [p.baseApp]     endereço do app (para o link do técnico)
 */
export function montarDestinatarios({ tipo, empresa, linhas, equipe = [], adminUid = '', anterior = null, linkRemarcar = '', baseApp = '' }) {
  if (!linhas || linhas.length === 0) return [];
  const primeira = linhas[0];
  const dataHora = primeira.dataAgendada;
  const nomeDosServicos = (ls) => ls.filter((l) => !ehLinhaSemServico(l)).map((l) => l.tipoServicoNome);
  const nomesTec = [];
  const porTecnico = new Map(); // uid -> { nome, linhas }
  for (const l of linhas) {
    const uids = tecnicosDoServico(l);
    const nomes = nomesDosTecnicos(l);
    uids.forEach((uid, i) => {
      if (!porTecnico.has(uid)) porTecnico.set(uid, { nome: nomes[i] || '', linhas: [] });
      porTecnico.get(uid).linhas.push(l);
      if (nomes[i]) nomesTec.push(nomes[i]);
    });
  }
  const linhasDeAviso = [];

  const whatsCliente = normalizarWhatsappBR(primeira.clienteWhatsapp || '');
  if (whatsCliente) {
    const texto = montarAviso(modeloDoAviso(empresa, tipo), {
      nome: primeiroNome(primeira.clienteNome),
      servicos: nomeDosServicos(linhas),
      dataHora,
      empresa: empresa?.nome,
      tecnico: nomesDistintos(nomesTec),
      endereco: primeira.local || '',
      link: tipo === 'cancelado' ? linkRemarcar : '',
    });
    linhasDeAviso.push({ id: 'cliente', papel: 'Cliente', nome: primeira.clienteNome || 'Cliente', texto, link: linkWhatsapp(whatsCliente, texto), motivo: '' });
  }

  for (const [uid, dados] of porTecnico) {
    if (uid === adminUid) continue;
    const membro = equipe.find((m) => m.uid === uid);
    const nome = membro?.nome || dados.nome || 'Técnico';
    const texto = montarAvisoTecnico(tipo, {
      tecnico: nome,
      cliente: primeira.clienteNome,
      dataHora,
      anterior,
      endereco: primeira.local || '',
      lat: primeira.localLat ?? null,
      lng: primeira.localLng ?? null,
      whatsappCliente: primeira.clienteWhatsapp,
      telefoneCliente: primeira.clienteWhatsapp || '',
      servicos: nomeDosServicos(dados.linhas),
      linkApp: tipo === 'cancelado' || !baseApp ? '' : `${baseApp}#/servico/${encodeURIComponent(dados.linhas[0].id)}`,
    });
    const whats = normalizarWhatsappBR(membro?.telefone || '');
    linhasDeAviso.push({
      id: `tec:${uid}`, papel: 'Técnico', nome, texto,
      link: whats ? linkWhatsapp(whats, texto) : '',
      motivo: whats ? '' : 'sem WhatsApp cadastrado',
    });
  }
  return linhasDeAviso;
}
