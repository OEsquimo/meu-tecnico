"""
PACOTE 39 (modo demonstração): rodapé Editar/Excluir some quando a visita tem um concluído e um só cancelado (os botões do cartão bastam).
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote39.py
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
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", email); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1200)
    return pag


def ir(pag, h):
    pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1200)


with sync_playwright() as p:
    nav = p.chromium.launch()
    pag = entrar(nav, "demo@meutecnico.app")


    # visita com um concluído e um pendente (mesmo fluxo do pacote2)
    ir(pag, "/agenda"); pag.locator("#conteudo a[href^='#/servico/']:not(:has-text('Cancelado')):not(:has-text('Concluído'))").first.click(); pag.wait_for_timeout(900)
    pag.click("[data-acao=adicionar-servico]"); pag.wait_for_timeout(500)
    pag.locator("dialog .janela__opcao").first.click(); pag.wait_for_timeout(500)
    pag.locator("dialog .janela__opcao").first.click(); pag.wait_for_timeout(1200)
    pag.locator("a[href*='/concluir/']").first.click(); pag.wait_for_timeout(900)
    v = pag.locator("input[name=valor]")
    if v.count() and not v.input_value(): v.fill("100")
    pag.click("#form-concluir [type=submit]"); pag.wait_for_timeout(1200)
    pag.locator("dialog [data-escolha=nao]").click(); pag.wait_for_timeout(500)
    pag.locator("dialog [data-escolha=outro]").click(); pag.wait_for_timeout(500)
    pag.fill("dialog [data-texto]", "cliente viajou"); pag.click("dialog [data-resposta=sim]"); pag.wait_for_timeout(1800)
    ir(pag, "/agenda")
    ir(pag, "/historico")
    pag.locator("#conteudo a[href^='#/servico/']", has_text="Maria").first.click(); pag.wait_for_timeout(1500)
    url_visita = pag.url
    ok(pag.locator("[data-acoes-cancelado]").count() == 1, "cartão do cancelado tem Reagendar e Excluir")
    ok(pag.locator("[data-acao=excluir]").count() == 0 and pag.locator("a[href$='/editar']:not([data-acoes-cancelado] a)").count() == 0, "rodapé Editar/Excluir da visita some (sem repetição)")
    ok("Toque em Reagendar" in pag.inner_text("#conteudo"), "aviso amarelo manda tocar em Reagendar")
    pag.click("[data-acao=excluir-cancelado]"); pag.wait_for_timeout(500)
    pag.click("dialog [data-resposta=sim]"); pag.wait_for_timeout(1800)
    ok(pag.locator("[data-acoes-cancelado]").count() == 0, "excluir o cancelado pelo cartão funciona")
    pag.close()

    # técnico não vê os botões (só informação)
    print("FALHAS:", len(falhas))
    nav.close()
raise SystemExit(1 if falhas else 0)
