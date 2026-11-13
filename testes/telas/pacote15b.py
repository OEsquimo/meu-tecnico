"""
PACOTE 15 — fluxo pela Agenda (modo demonstração): + Agendar abre a tela flutuante (horários e técnicos), depois a escolha do
cliente (com botão "Cadastrar cliente novo") e a tela de Agendar SEM calendário (só o resumo, com "Alterar horário").
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote15b.py
"""
import datetime
from playwright.sync_api import sync_playwright
BASE = "http://localhost:5173/?demo=1"
SEL = "dialog.seletor"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


def proxima_quarta():
    h = datetime.date.today()
    primeiro = (h.replace(day=1) + datetime.timedelta(days=32)).replace(day=1)
    d = primeiro + datetime.timedelta(days=10)
    while d.weekday() != 2:
        d += datetime.timedelta(days=1)
    return d


def proximo_domingo():
    h = datetime.date.today()
    primeiro = (h.replace(day=1) + datetime.timedelta(days=32)).replace(day=1)
    d = primeiro + datetime.timedelta(days=10)
    while d.weekday() != 6:
        d += datetime.timedelta(days=1)
    return d


with sync_playwright() as p:
    nav = p.chromium.launch()
    pag = nav.new_page(viewport={"width": 390, "height": 844})
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))

    def ir(h):
        pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1000)

    def texto():
        return pag.inner_text("#conteudo")

    def esperar_folha():
        pag.wait_for_selector(f"{SEL}[open]")
        pag.wait_for_function("!document.querySelector('dialog.seletor')?.innerText.includes('Carregando')", timeout=8000)
        pag.wait_for_timeout(200)

    def tocar_dia_na_agenda(d):
        """Vai ao mês de `d` (a partir do mês atual) e toca no dia."""
        for _ in range(6):
            if pag.locator(f"section[aria-label='Calendário'] [data-dia='{d.isoformat()}']").count() > 0:
                break
            pag.click("[data-acao=mes-seguinte]"); pag.wait_for_timeout(700)
        pag.click(f"section[aria-label='Calendário'] [data-dia='{d.isoformat()}']"); pag.wait_for_timeout(300)

    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

    # ---------------- Botão Agendar acompanha o dia ----------------
    ir("/agenda"); pag.wait_for_timeout(500)
    ok("Agendar hoje" in pag.inner_text("#botao-agendar"), "hoje: o botão diz 'Agendar hoje'")
    d = proxima_quarta()
    tocar_dia_na_agenda(d)
    ok(pag.inner_text("#botao-agendar").strip().endswith(f"{d.day:02d}/{d.month:02d}"), f"dia escolhido: o botão diz 'Agendar em {d.day:02d}/{d.month:02d}'")
    ok(pag.locator("a[href*='#/agendar']").count() == 0, "o botão não é mais um link direto para o Agendar")

    # ---------------- + Agendar: tela flutuante ----------------
    pag.click("#botao-agendar"); esperar_folha()
    ok("#/agenda" in pag.url and pag.locator(f"{SEL} [data-acao=seletor-hora]").count() > 0, "+ Agendar abre a tela flutuante com os horários livres")
    ok(pag.locator(f"{SEL} .calendario").count() == 0, "a tela flutuante não tem calendário")
    pag.click(f"{SEL} [data-acao=seletor-hora][data-hora='09:00']"); pag.wait_for_timeout(200)
    marcados = pag.locator(f"{SEL} input[name=seletor-tec]:checked").count() + pag.locator(f"{SEL} .seletor__unico").count()
    ok(marcados == 1, "ao escolher o horário, um técnico já vem selecionado")
    pag.click(f"{SEL} [data-acao=seletor-confirmar]"); pag.wait_for_timeout(1200)

    # ---------------- Escolher cliente ----------------
    ok("#/agendar" in pag.url and "agenda=1" in pag.url, "confirmar leva à tela de escolher o cliente")
    ok("09:00" in pag.inner_text("#resumo-quando") and f"{d.day}" in pag.inner_text("#resumo-quando"), "no alto, o resumo com dia e hora escolhidos")
    ok(pag.locator("#botao-cliente-novo").count() == 1 and pag.locator("#botao-cliente-novo").evaluate("e => e.tagName") == "A", "botão 'Cadastrar cliente novo' (não é mais um link no texto)")
    ok(pag.locator("[data-acao=quando-dia]").count() == 0 and pag.locator(".quando-calendario").count() == 0, "sem calendário na escolha do cliente")
    pag.locator("[data-acao=escolher-cliente]", has_text="Maria Souza").click(); pag.wait_for_timeout(700)
    ok("Maria Souza" in pag.inner_text("#area-cliente"), "cliente escolhido")
    ok(pag.locator("[data-acao=quando-dia]").count() == 0 and pag.locator(".quando-calendario").count() == 0 and "Escolher dia e horário" not in texto(), "depois de escolher o cliente também não há calendário nem 'Escolher o horário'")
    ok("09:00" in pag.inner_text("#resumo-quando") and pag.locator("#botao-quando").inner_text().strip() == "Alterar horário", "o resumo continua, com 'Alterar horário'")

    # ---------------- Alterar horário ----------------
    pag.click("#botao-quando"); esperar_folha()
    pag.click(f"{SEL} [data-acao=seletor-hora][data-hora='10:00']"); pag.click(f"{SEL} [data-acao=seletor-confirmar]")
    pag.wait_for_selector(SEL, state="detached"); pag.wait_for_timeout(600)
    ok("10:00" in pag.inner_text("#resumo-quando"), "Alterar horário: o resumo mostra o novo horário")
    pag.locator("[data-acao=adicionar-aparelho]").first.click(); pag.wait_for_timeout(400)
    pag.locator("dialog [data-escolha]", has_text="Quarto").first.click(); pag.wait_for_timeout(500)
    pag.click("#botao-salvar"); pag.wait_for_timeout(1800)
    ok("/servico/" in pag.url and "10:00" in texto(), "salvou o agendamento no dia da Agenda, às 10:00")

    # ---------------- Voltar à Agenda mantém o dia ----------------
    ir("/agenda"); pag.wait_for_timeout(500)
    tocar_dia_na_agenda(d)
    pag.click("#botao-agendar"); esperar_folha()
    pag.click(f"{SEL} [data-acao=seletor-hora][data-hora='14:00']"); pag.click(f"{SEL} [data-acao=seletor-confirmar]"); pag.wait_for_timeout(1000)
    pag.go_back(); pag.wait_for_selector("section[aria-label='Calendário']"); pag.wait_for_timeout(900)
    sel = pag.locator("section[aria-label='Calendário'] .calendario__dia--selecionado").first.get_attribute("data-iso")
    ok(sel == d.isoformat(), f"voltando do Agendar, a Agenda reabre no dia escolhido ({sel})")

    # ---------------- Cadastrar cliente novo volta ao Agendar com o dia e a hora ----------------
    pag.click("#botao-agendar"); esperar_folha()
    pag.click(f"{SEL} [data-acao=seletor-hora][data-hora='15:00']"); pag.click(f"{SEL} [data-acao=seletor-confirmar]"); pag.wait_for_timeout(1000)
    pag.click("#botao-cliente-novo"); pag.wait_for_selector("#form-cliente"); pag.wait_for_timeout(400)
    ok("agenda=1" in pag.url and "hora=15%3A00" in pag.url.replace(":", "%3A"), "Cadastrar cliente novo leva o dia e a hora")
    pag.fill("input[name=nome]", "Cliente da Agenda"); pag.fill("input[name=whatsapp]", "11966665555")
    pag.locator("input[name=modo1][value=manual]").check(force=True)
    pag.fill("input[name=end1_rua]", "Rua da Agenda"); pag.fill("input[name=end1_numero]", "10"); pag.fill("input[name=end1_cidade]", "Santos")
    pag.click("#form-cliente [type=submit]"); pag.wait_for_timeout(1500)
    ok("#/agendar" in pag.url and "Cliente da Agenda" in pag.inner_text("#area-cliente") and "15:00" in pag.inner_text("#resumo-quando"),
       "depois de cadastrar, volta ao Agendar com o cliente novo e o horário escolhido")

    # ---------------- Dia sem horário livre: próximo dia livre ----------------
    ir("/agenda"); pag.wait_for_timeout(500)
    dom = proximo_domingo()
    tocar_dia_na_agenda(dom)
    pag.click("#botao-agendar"); esperar_folha()
    ok(pag.locator(f"{SEL} [data-acao=seletor-hora]").count() == 0 and "Nenhum horário livre" in pag.inner_text(SEL), "domingo (fechado): 'Nenhum horário livre neste dia.'")
    titulo_antes = pag.inner_text(f"{SEL} .seletor__titulo")
    pag.click(f"{SEL} [data-acao=seletor-proximo]"); pag.wait_for_timeout(1500)
    ok(pag.inner_text(f"{SEL} .seletor__titulo") != titulo_antes and pag.locator(f"{SEL} [data-acao=seletor-hora]").count() > 0, "'Ver próximo dia livre' vai para um dia com horários")
    pag.click(f"{SEL} [data-acao=seletor-fechar]"); pag.wait_for_selector(SEL, state="detached")

    # ---------------- Outros caminhos mantêm o calendário ----------------
    ir("/agendar?cliente=c-maria"); pag.wait_for_timeout(800)
    ok(pag.locator(".quando-calendario").count() == 1 and pag.locator("#resumo-quando").count() == 0, "Agendar fora da Agenda (ficha do cliente) continua com o calendário")

    ok(not erros, f"sem erros no console ({erros[:2]})")
    nav.close()
print("FALHAS:" if falhas else "TUDO OK", falhas if falhas else "")
raise SystemExit(1 if falhas else 0)
