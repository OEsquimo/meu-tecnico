// =============================================================================
// FERRAMENTAS — a lista de ferramentas do app e quem pode usar cada uma
// =============================================================================
// Para criar uma ferramenta nova (ex.: calculadora de BTU):
//   1. crie a tela dela em telas/ e a rota em nucleo/rotas.js;
//   2. acrescente UMA linha em FERRAMENTAS abaixo, dizendo quem pode usar (campo "acesso").
// A tela "Ferramentas" e o quadrado do Início se ajustam sozinhos: o técnico só vê as ferramentas
// liberadas para ele, e o quadrado "Ferramentas" some se não houver nenhuma para o papel dele.
// (A segurança de verdade das telas está nas rotas e no servidor; isto só decide o que mostrar.)
// =============================================================================

import { acessoPermitido } from './permissoes.js';

/**
 * Campos: id, titulo, sub (uma linha explicando), icone (nome de nucleo/icones.js),
 * href (endereço da tela) e acesso: 'admin' (só administrador) | 'membro' (administrador e técnico).
 */
export const FERRAMENTAS = [
  {
    id: 'horarios',
    titulo: 'Enviar horários ao cliente',
    sub: 'Mande um link pelo WhatsApp para o cliente escolher dia e horário.',
    icone: 'whatsapp',
    href: '#/ferramentas/horarios',
    acesso: 'admin',
  },
];

/** As ferramentas que o usuário atual pode abrir. */
export function ferramentasDoUsuario(s) {
  return FERRAMENTAS.filter((f) => acessoPermitido(f.acesso, s));
}
