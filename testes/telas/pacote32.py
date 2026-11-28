"""
PACOTE 32 (modo demonstração): tela do serviço concluído mais enxuta (administrador).
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote32.py
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


with sync_playwright() as p:
    nav = p.chromium.launch()
    a, erros = entrar(nav, "demo@meutecnico.app")

    # serviço concluído e a receber (Ana, R$ 220): poucos botões
    ir(a, "/servico/s-c3")
    ok(all(a.locator(f"[data-acao={x}]").count() == 1 for x in ["editar-menu", "excluir-concluido"]) and a.locator("[data-acao=corrigir-horarios]").count() == 0 and a.locator("a:has-text('Corrigir valor')").count() == 0, "concluído tem só Editar e Excluir (Pacote 39: horários e valor ficam no menu Editar)")
    for velho in ["alternar-pago", "corrigir-servico", "cobrar-servico"]:
        ok(a.locator(f"[data-acao={velho}]").count() == 0, f"sem o botão antigo {velho}")
    ok(a.locator("[data-acao=navegar]").count() == 0, "visita concluída não tem 'Ir até o cliente'")
    ok("Cliente pagou?" not in texto(a), "sem a linha 'Cliente pagou?' para o administrador")
    ok("Valor a pagar" in texto(a) and "R$ 220,00" in texto(a), "mostra o que falta pagar")
    ok(a.locator("[data-bloco=receber-visita] [data-acao=recebi-visita]").count() == 1 and a.locator("[data-bloco=receber-visita] [data-acao=cobrar]").count() == 1, "botões Registrar pagamento e Cobrar cliente na visita")
    ok("Registrar pagamento" in a.inner_text("[data-bloco=receber-visita]"), "com um serviço só o botão se chama 'Registrar pagamento'")

    # detalhes recolhidos
    ok("Tempo no cliente" not in texto(a) and a.locator("summary").count() >= 1, "detalhes técnicos ficam recolhidos")

    # registra pagamento parcial sem recarregar a página inteira
    a.evaluate("window.__marca = 1")
    a.click("[data-acao=recebi-visita]"); a.wait_for_selector("dialog[open]")
    a.fill("dialog[open] [data-valor]", "100"); a.click("dialog[open] [data-resposta=sim]"); a.wait_for_timeout(1500)
    ok(a.evaluate("window.__marca") == 1, "a tela não recarregou a página")
    ok("Valor pago" in texto(a) and "R$ 120,00" in texto(a), "atualiza para já pago 100 e falta 120")
    ok(a.locator("[data-pagamento]").count() == 1, "o pagamento aparece como uma linha tocável")

    # tocar no pagamento: Corrigir / Apagar
    a.click("[data-acao=pagamento]"); a.wait_for_selector("dialog[open]")
    t = a.inner_text("dialog[open]")
    ok("Corrigir valor ou dia" in t and "Apagar pagamento" in t, "tocar no pagamento oferece Corrigir e Apagar")
    a.click("dialog[open] [data-escolha='']"); a.wait_for_timeout(300)

    # quitar tudo: some o bloco de receber/cobrar
    a.click("[data-acao=recebi-visita]"); a.wait_for_selector("dialog[open]")
    a.click("dialog[open] [data-resposta=sim]"); a.wait_for_timeout(1500)
    ok(a.locator("[data-bloco=receber-visita]").count() == 0 and "Valor a pagar" not in texto(a), "quitado: some Registrar pagamento, Cobrar cliente e Valor a pagar")

    ok(not erros, f"sem erros no console {erros}")
    nav.close()

print("\nFALHAS:" if falhas else "\nTudo certo.")
for f in falhas:
    print(" -", f)
raise SystemExit(1 if falhas else 0)
