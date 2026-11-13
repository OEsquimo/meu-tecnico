"""Ajuda dos testes de tela: escolher dia, hora e técnicos no seletor de tela cheia (modo demonstração)."""

SELETOR = "dialog.seletor"          # tela flutuante com horários e técnicos
CALENDARIO = "#area-quando"          # calendário que fica na própria tela Agendar


def _abrir_no_mes(pag, data):
    """Vai até o mês de `data` (AAAA-MM-DD) no calendário da tela Agendar e toca no dia: abre a tela flutuante."""
    pag.wait_for_selector(f"{CALENDARIO} .seletor__mes")
    alvo = data[:7]
    for _ in range(240):
        pag.wait_for_selector(f"{CALENDARIO} .seletor__mes")
        atual = pag.locator(f"{CALENDARIO} .seletor__mes").get_attribute("data-ano-mes")
        if atual == alvo:
            break
        passo = "1" if atual < alvo else "-1"
        pag.click(f"{CALENDARIO} [data-acao=quando-mes][data-passo='{passo}']")
        pag.wait_for_timeout(80)
    pag.wait_for_selector(f"{CALENDARIO} [data-iso='{data}']:not([disabled]), {CALENDARIO} .calendario__dia--sem-vaga", timeout=8000)
    pag.wait_for_function("!document.querySelector('#area-quando')?.innerText.includes('Carregando os horários')", timeout=8000)
    pag.wait_for_timeout(200)


def _abrir_dia(pag, data):
    _abrir_no_mes(pag, data)
    pag.click(f"{CALENDARIO} [data-acao=quando-dia][data-iso='{data}']")
    pag.wait_for_selector(f"{SELETOR}[open]")
    pag.wait_for_function("!document.querySelector('dialog.seletor')?.innerText.includes('Carregando')", timeout=8000)
    pag.wait_for_timeout(150)


def escolher_quando(pag, data, hora, tecnico=None, confirmar=True):
    """Escolhe dia, hora e (opcional) um técnico. tecnico=None mantém o que a tela já marcou."""
    _abrir_dia(pag, data)
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
    """Toca no dia, escolhe a hora e devolve os nomes dos técnicos livres. Fecha sem confirmar."""
    _abrir_dia(pag, data)
    if pag.locator(f"{SELETOR} [data-acao=seletor-hora][data-hora='{hora}']").count() == 0:
        nomes = None
    else:
        pag.click(f"{SELETOR} [data-acao=seletor-hora][data-hora='{hora}']")
        nomes = pag.locator(f"{SELETOR} .tecnico-opcao").all_inner_texts() + pag.locator(f"{SELETOR} .seletor__unico strong").all_inner_texts()
    pag.click(f"{SELETOR} [data-acao=seletor-fechar]")
    pag.wait_for_selector(SELETOR, state="detached")
    return nomes


def informar(pag, servicos=("Limpeza",), primeiro="button:has-text('Informar')", aparelho=None):
    """Informa aparelho (o 1º da lista, ou o que tem o texto `aparelho`) e serviços pelos diálogos simples da visita.
    Atenção: um aparelho com agendamento aberto não pode ser escolhido (regra "um aparelho, um agendamento aberto")."""
    for i, nome in enumerate(servicos):
        alvo = primeiro if i == 0 else "button:has-text('Adicionar aparelhos e serviços')"
        pag.locator(alvo).first.click(); pag.wait_for_timeout(400)
        (pag.locator("dialog [data-escolha]", has_text=aparelho) if aparelho else pag.locator("dialog [data-escolha]")).first.click(); pag.wait_for_timeout(400)
        pag.locator("dialog [data-escolha]", has_text=nome).first.click(); pag.wait_for_timeout(1200)
