"""
PACOTE 33 (modo demonstração): serviço concluído — valores, Editar, pagamento em parcelas, selo e Excluir.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote33.py
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
    return pag.inner_text("#conteudo").replace("\xa0", " ")


def pagar(a, valor):
    a.click("[data-acao=editar-menu]"); a.wait_for_selector("dialog[open]")
    a.click("dialog[open] [data-escolha=pagamento]"); a.wait_for_selector("dialog[open] [data-valor]")
    a.fill("dialog[open] [data-valor]", valor); a.click("dialog[open] [data-resposta=sim]"); a.wait_for_timeout(1500)


with sync_playwright() as p:
    nav = p.chromium.launch()
    a, erros = entrar(nav, "demo@meutecnico.app")

    # serviço concluído, valor R$ 220,00, nada pago
    ir(a, "/servico/s-c3")
    t = texto(a)
    ok("Telefone" not in t and "Local" not in t, "topo do concluído sem Telefone e Local")
    ok("Cliente" in t and "Quando" in t, "topo mantém Quando e Cliente")
    ok("Concluído a receber" in t, "selo 'Concluído a receber' com saldo")
    ok("Valor do serviço" in t and "R$ 220,00" in t and "Valor a pagar" in t and "Valor pago" not in t, "nada pago: Valor do serviço e Valor a pagar")
    ok(a.locator("[data-acao=editar-concluido]").count() == 0 and a.locator("[data-acao=editar-menu]").count() == 1, "botão Editar (não mais 'Corrigir descrição')")

    # Editar: opções
    a.click("[data-acao=editar-menu]"); a.wait_for_selector("dialog[open]")
    o = a.inner_text("dialog[open]")
    ok(all(x in o for x in ["Tipo de serviço", "O que foi feito", "Informar pagamento"]), "Editar oferece tipo, descrição e Informar pagamento (há saldo)")
    a.click("dialog[open] [data-escolha='']"); a.wait_for_timeout(300)

    # parcelas
    pagar(a, "50")
    t = texto(a)
    ok("Valor do serviço" in t and "R$ 220,00" in t and "Valor pago" in t and "R$ 50,00" in t and "R$ 170,00" in t, "1º pagamento: R$ 220 / pago R$ 50 / a pagar R$ 170")
    pagar(a, "100")
    t = texto(a)
    ok("R$ 150,00" in t and "R$ 70,00" in t, "2º pagamento: pago R$ 150 / a pagar R$ 70 (histórico somado)")
    ok(a.locator("[data-pagamento]").count() == 2, "os dois pagamentos continuam no histórico")
    # acima do saldo
    a.click("[data-acao=editar-menu]"); a.wait_for_selector("dialog[open]")
    a.click("dialog[open] [data-escolha=pagamento]"); a.wait_for_selector("dialog[open] [data-valor]")
    a.fill("dialog[open] [data-valor]", "100"); a.click("dialog[open] [data-resposta=sim]"); a.wait_for_timeout(300)
    ok("O saldo é R$ 70,00" in a.inner_text("dialog[open]").replace("\xa0", " "), "pagamento acima do saldo é bloqueado")
    a.fill("dialog[open] [data-valor]", "70"); a.click("dialog[open] [data-resposta=sim]"); a.wait_for_timeout(1500)

    # quitado
    t = texto(a)
    ok("Valor do serviço" in t and "R$ 220,00" in t and "Valor pago" not in t and "Valor a pagar" not in t, "quitado: só Valor do serviço")
    ok("Concluído a receber" not in t and "Concluído" in t, "selo volta para 'Concluído'")
    ok(a.locator("[data-bloco=receber-visita]").count() == 0, "sem botões de receber/cobrar")
    ok(a.locator("[data-pagamento]").count() == 0 or not a.locator("[data-pagamento]").first.is_visible(), "histórico de pagamentos recolhido")
    a.locator("summary").first.click(); a.wait_for_timeout(300)
    ok(a.locator("[data-pagamento]").count() == 3 and a.locator("[data-pagamento]").first.is_visible(), "Ver detalhes mostra os 3 pagamentos")
    a.click("[data-acao=editar-menu]"); a.wait_for_selector("dialog[open]")
    ok("Informar pagamento" not in a.inner_text("dialog[open]"), "quitado: Editar não oferece Informar pagamento")

    # trocar tipo
    a.click("dialog[open] [data-escolha=tipo]"); a.wait_for_selector("dialog[open]")
    opcoes = a.locator("dialog[open] [data-escolha]:not([data-escolha=''])")
    nomes = [opcoes.nth(i).inner_text() for i in range(opcoes.count())]
    ok(len(nomes) >= 2, f"tipo só por lista cadastrada: {nomes}")
    novo = [n for n in nomes if n not in texto(a).split("Valor do serviço")[0]][0]
    a.locator("dialog[open] [data-escolha]", has_text=novo).first.click(); a.wait_for_selector("dialog[open] [data-resposta=sim]")
    a.click("dialog[open] [data-resposta=sim]"); a.wait_for_timeout(1500)
    ok(novo in texto(a) and "R$ 220,00" in texto(a), "tipo trocado, valor preservado")

    # Excluir: uma confirmação só
    a.click("[data-acao=excluir-concluido]"); a.wait_for_selector("dialog[open]")
    ok("Tem certeza?" not in a.inner_text("dialog[open]"), "primeira confirmação do Excluir")
    a.click("dialog[open] [data-resposta=sim]"); a.wait_for_timeout(1500)
    ok(a.locator("dialog[open]").count() == 0, "sem segunda confirmação: o serviço foi excluído")

    # técnico: sem Editar
    tec, erros_t = entrar(nav, "tecnico@meutecnico.app")
    ir(tec, "/servico/s-c1")
    ok(tec.locator("[data-acao=editar-menu]").count() == 0 and tec.locator("[data-acao=excluir-concluido]").count() == 0, "técnico não edita serviço concluído")

    ok(not erros, f"sem erros no console {erros}")
    nav.close()

print("\nFALHAS:" if falhas else "\nTudo certo.")
for f in falhas:
    print(" -", f)
raise SystemExit(1 if falhas else 0)
