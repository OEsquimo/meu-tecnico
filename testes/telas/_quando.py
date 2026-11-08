"""Ajuda dos testes de tela: escolher dia, hora e técnicos no seletor de tela cheia (modo demonstração)."""

SELETOR = "dialog.seletor"


def _abrir_no_mes(pag, data):
    """Abre o seletor e navega até o mês de `data` (AAAA-MM-DD)."""
    pag.click("[data-acao=abrir-seletor]")
    pag.wait_for_selector(f"{SELETOR}[open]")
    alvo = data[:7]
    for _ in range(240):
        atual = pag.locator(f"{SELETOR} .seletor__mes").get_attribute("data-ano-mes")
        if atual == alvo:
            break
        # meses para trás ou para frente, conforme o caso
        passo = "1" if atual < alvo else "-1"
        pag.click(f"{SELETOR} [data-acao=seletor-mes][data-passo='{passo}']")
        pag.wait_for_timeout(60)
    pag.wait_for_selector(f"{SELETOR} [data-iso='{data}']:not([disabled]), {SELETOR} .calendario__dia--sem-vaga", timeout=8000)
    pag.wait_for_timeout(200)


def escolher_quando(pag, data, hora, tecnico=None, confirmar=True):
    """Escolhe dia, hora e (opcional) um técnico. tecnico=None mantém o que o seletor já marcou."""
    _abrir_no_mes(pag, data)
    pag.click(f"{SELETOR} [data-acao=seletor-dia][data-iso='{data}']")
    pag.click(f"{SELETOR} [data-acao=seletor-hora][data-hora='{hora}']")
    if tecnico:
        for i in range(pag.locator(f"{SELETOR} .tecnico-opcao").count()):
            opcao = pag.locator(f"{SELETOR} .tecnico-opcao").nth(i)
            caixa = opcao.locator("input")
            quer = tecnico in opcao.inner_text()
            if caixa.is_checked() != quer:
                caixa.set_checked(quer)
    if confirmar:
        pag.click(f"{SELETOR} [data-acao=seletor-confirmar]")
        pag.wait_for_selector(SELETOR, state="detached")
        pag.wait_for_timeout(500)


def tecnicos_no_horario(pag, data, hora):
    """Abre o seletor, escolhe dia e hora e devolve os nomes dos técnicos livres. Fecha sem confirmar."""
    _abrir_no_mes(pag, data)
    pag.click(f"{SELETOR} [data-acao=seletor-dia][data-iso='{data}']")
    if pag.locator(f"{SELETOR} [data-acao=seletor-hora][data-hora='{hora}']").count() == 0:
        nomes = None
    else:
        pag.click(f"{SELETOR} [data-acao=seletor-hora][data-hora='{hora}']")
        nomes = pag.locator(f"{SELETOR} .tecnico-opcao").all_inner_texts()
    pag.click(f"{SELETOR} [data-acao=seletor-fechar]")
    pag.wait_for_selector(SELETOR, state="detached")
    return nomes
