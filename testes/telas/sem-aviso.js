// Usado pelos testes de tela ANTIGOS (anteriores ao pacote 19): fecha sozinho a janela "Avisar o cliente no WhatsApp"
// (que aparece depois de agendar, reagendar e cancelar) clicando em "Agora não", para o teste seguir como antes.
// Só o pacote19.py trata essa janela de verdade.
(() => {
  const fechar = () => {
    const janela = document.querySelector('dialog[open] a[data-escolha="avisar"]')?.closest('dialog');
    if (janela) janela.querySelector('button[data-escolha=""]')?.click();
    // Painel de avisos (pacote 20): fecha pelo botão "Fechar".
    document.querySelector('dialog[open][data-avisos] [data-fechar]')?.click();
  };
  new MutationObserver(fechar).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
})();
