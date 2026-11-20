"""
PACOTE 16 (modo demonstração): página Serviços — menu suspenso de status (Agendados por padrão), período,
atrasados primeiro, cartão com cliente/serviço/técnico/data, abrir o serviço, e o técnico não vê a aba.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote16.py
"""
import re
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173/?demo=1"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


def entrar(pag, email):
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", email); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)


with sync_playwright() as p:
    nav = p.chromium.launch()
    erros = []

    def nova():
        c = nav.new_context(viewport={"width": 390, "height": 844})
        pg = c.new_page()
        pg.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: erros.append(str(e)))
        return c, pg

    _, pag = nova()
    entrar(pag, "demo@meutecnico.app")

    def ir(h):
        pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1000)

    def cartoes():
        return pag.locator("#itens .servico-cartao a.visita-cartao__corpo")

    # ---------------- Menu e abertura ----------------
    itens = pag.locator(".menu-topo__item").all_inner_texts()
    ok("Serviços" in itens, f"administrador vê a aba Serviços no menu: {itens}")
    ok("Concluídos" not in itens, "administrador não tem mais a aba Concluídos (usa Serviços → Concluídos)")
    ok(itens.index("Serviços") == itens.index("Agenda") + 1, "a aba Serviços fica logo depois da Agenda")
    pag.locator(".menu-topo__item:has-text('Serviços')").click(); pag.wait_for_selector("select[name=status]", timeout=8000); pag.wait_for_timeout(800)
    ok("#/servicos" in pag.url, "a aba abre #/servicos")
    ok(pag.locator(".menu-topo__item--ativo").inner_text().strip() == "Serviços", "a aba Serviços fica destacada")

    # ---------------- Menu suspenso: todas as opções, Agendados por padrão ----------------
    ops = pag.locator("select[name=status] option").all_inner_texts()
    ok(ops == ["Agendados", "Concluídos", "Cancelados", "Pendentes", "Reagendados", "Todos"], f"opções do menu suspenso: {ops}")
    ok(pag.locator("select[name=status]").input_value() == "agendado", "abre em Agendados")
    t = pag.inner_text("#conteudo")
    ok("A partir de hoje" in t, "Agendados mostram 'A partir de hoje' (sem mês)")
    ok(pag.locator("[data-acao=mes-anterior]").count() == 0, "Agendados não têm setas de mês")
    n = cartoes().count()
    ok(n > 0, f"há agendamentos na demonstração ({n})")

    # ---------------- Cartão (pacote 22): cliente, serviço, técnico, data e hora ----------------
    c1 = cartoes().first.inner_text()
    ok(re.search(r"\d{2}/\d{2}/\d{4}", c1) is not None, f"cartão traz a data: {c1!r}")
    ok("Técnico:" in c1, "cartão traz o técnico")
    ok(re.search(r"\d{2}:\d{2}", c1) is not None, "cartão mostra a hora (pacote 22)")

    # ---------------- Atrasados primeiro, depois por data ----------------
    selos = pag.locator("#itens .servico-cartao a.visita-cartao__corpo .selo").all_inner_texts()
    if "Atrasado" in selos:
        ult = max(i for i, s in enumerate(selos) if s == "Atrasado")
        ok(all(s == "Atrasado" for s in selos[: ult + 1]), "os atrasados vêm todos primeiro")
    datas = [re.search(r"(\d{2})/(\d{2})/(\d{4})", x).groups() for x in cartoes().all_inner_texts()]
    chaves = [(int(a), int(m), int(d)) for d, m, a in datas]
    primeiro_futuro = next((i for i, s in enumerate(selos) if s != "Atrasado"), len(selos))
    futuros = chaves[primeiro_futuro:]
    ok(futuros == sorted(futuros), "os agendados em dia ficam na ordem da data (hoje antes de amanhã)")
    ok(pag.locator("button:has-text('Ver mais')").count() == 0 or n >= 30, "só mostra 'Ver mais 30' se houver 30 ou mais")

    # ---------------- Outras situações: mês com setas ----------------
    pag.select_option("select[name=status]", "concluido"); pag.wait_for_timeout(800)
    ok(pag.locator("[data-acao=mes-anterior]").count() == 1 and pag.locator("[data-acao=mes-seguinte]").count() == 1, "Concluídos têm setas de mês")
    mes1 = pag.inner_text("#periodo-titulo")
    pag.click("[data-acao=mes-anterior]"); pag.wait_for_timeout(800)
    mes2 = pag.inner_text("#periodo-titulo")
    ok(mes1 != mes2, f"seta muda o mês: {mes1} -> {mes2}")
    pag.click("[data-acao=mes-seguinte]"); pag.wait_for_timeout(800)
    ok(pag.inner_text("#periodo-titulo") == mes1, "a outra seta volta ao mês")
    for st in ("cancelado", "pendente", "reagendado", "todos"):
        pag.select_option("select[name=status]", st); pag.wait_for_timeout(700)
        ok(pag.locator("select[name=status]").input_value() == st and "Algo deu errado" not in pag.inner_text("#conteudo"), f"situação {st} abre sem erro")
    pag.select_option("select[name=status]", "agendado"); pag.wait_for_timeout(700)
    ok(cartoes().count() == n, "voltar a Agendados traz a mesma lista")

    # ---------------- Tocar abre o serviço completo ----------------
    cartoes().first.click(); pag.wait_for_timeout(1200)
    ok("#/servico/" in pag.url, "tocar no cartão abre o serviço completo")

    # ---------------- Técnico não vê a aba nem abre a página ----------------
    _, tec = nova()
    entrar(tec, "tecnico@meutecnico.app")
    ok("Serviços" not in tec.locator(".menu-topo__item").all_inner_texts(), "técnico não vê a aba Serviços")
    ok("Concluídos" in tec.locator(".menu-topo__item").all_inner_texts(), "técnico continua com a aba Concluídos")
    tec.evaluate("location.hash='#/servicos'"); tec.wait_for_timeout(1000)
    ok("#/servicos" not in tec.url, "técnico não abre #/servicos")

    ok(not [e for e in erros if "favicon" not in e], f"sem erros no console: {erros[:3]}")
    nav.close()

print("\nFALHAS:" if falhas else "\nTudo certo.", falhas or "")
raise SystemExit(1 if falhas else 0)
