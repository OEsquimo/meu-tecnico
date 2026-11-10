// =============================================================================
// /informar/:id — endereço antigo. Hoje "Informar serviço" abre as perguntas simples
// ("Em qual aparelho?" / "Qual serviço?") na própria tela da visita.
// =============================================================================

export default async function montar(ctx) {
  ctx.ir(`/servico/${encodeURIComponent(ctx.params.id)}?informar=1`, { substituir: true });
  return () => {};
}
