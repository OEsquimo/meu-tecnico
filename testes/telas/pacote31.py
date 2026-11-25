"""
PACOTE 31 (modo demonstração): A receber + pagamento parcial.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote31.py
"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173/?demo=1"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


def entrar(nav, email):
    pag = nav.new_page(viewport={"width": 390, "height": 844})
    pag.add_init_script(path='testes/telas/sem-aviso.js')
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", email); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1200)
    return pag, erros


def ir(pag, h):
    pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1200)


def texto(pag):
    return pag.inner_text("#conteudo")


with sync_playwright() as p:
    nav = p.chromium.launch()
    a, erros = entrar(nav, "demo@meutecnico.app")

    # Início: atalho com bolinha = visitas
    atalho = a.locator('a.atalho[href="#/servicos?status=a-receber"]')
    ok(atalho.count() == 1, "Início tem o atalho A receber")
    ok("Quem ainda deve" in atalho.inner_text(), "atalho com a legenda 'Quem ainda deve'")
    ok(atalho.locator(".bolinha").count() == 1 and atalho.locator(".bolinha").inner_text().strip() == "2", "bolinha mostra 2 visitas")

    # Lista
    atalho.click(); a.wait_for_selector("[data-a-receber]"); a.wait_for_timeout(600)
    cartoes = a.locator("[data-a-receber]")
    ok(cartoes.count() == 2, "dois cartões (um por visita)")
    ok("Ana" in cartoes.nth(0).inner_text(), "o mais antigo (Ana) vem primeiro")
    ok("Total a receber: R$ 500,00" in texto(a).replace("\xa0", " "), "topo mostra o total")
    ok(cartoes.nth(0).locator("text=Abrir serviço").count() == 1 and cartoes.nth(0).locator("text=Cobrar cliente").count() == 1, "botões Abrir serviço e Cobrar cliente")

    # Pagamento parcial de R$ 100 na Ana
    cartoes.nth(0).locator('[data-acao="recebi-cartao"]').click(); a.wait_for_selector("dialog[open]")
    a.fill("dialog[open] [data-valor]", "100")
    a.click("dialog[open] [data-resposta=sim]"); a.wait_for_timeout(1500)
    t = texto(a).replace("\xa0", " ")
    ok("pagou R$ 100,00" in t and "falta R$ 120,00" in t, "cartão mostra pagou 100 e falta 120")
    ok("Total a receber: R$ 400,00" in t, "total caiu para 400")

    # Pagamento maior que o saldo é bloqueado
    a.locator("[data-a-receber]").nth(0).locator('[data-acao="recebi-cartao"]').click(); a.wait_for_selector("dialog[open]")
    a.fill("dialog[open] [data-valor]", "500")
    a.click("dialog[open] [data-resposta=sim]"); a.wait_for_timeout(400)
    ok("O saldo é R$ 120,00" in a.inner_text("dialog[open]").replace("\xa0", " "), "pagamento acima do saldo é bloqueado")
    a.click("dialog[open] [data-resposta=nao]"); a.wait_for_timeout(300)

    # Abrir serviço: mostra pagamento e permite apagar
    a.locator("[data-a-receber]").nth(0).locator("text=Abrir serviço").click(); a.wait_for_selector("[data-bloco=pagamentos]")
    ok("Valor a pagar" in texto(a), "detalhe mostra 'Valor a pagar'")
    a.locator('[data-acao="pagamento"]').first.click(); a.wait_for_selector("dialog[open]")
    a.click("dialog[open] [data-escolha=apagar]"); a.wait_for_selector("dialog[open] [data-resposta=sim]")
    a.click("dialog[open] [data-resposta=sim]"); a.wait_for_timeout(1500)
    ok("Valor a pagar" in texto(a) and "R$ 220,00" in texto(a).replace("\xa0", " "), "apagar pagamento devolve o saldo todo")

    # Financeiro: total geral
    ir(a, "/financeiro")
    ok("Total geral a receber" in texto(a), "Financeiro tem 'Total geral a receber'")

    ok(not erros, f"sem erros no console {erros}")
    nav.close()

print("\nFALHAS:" if falhas else "\nTudo certo.")
for f in falhas:
    print(" -", f)
raise SystemExit(1 if falhas else 0)
