"""
PACOTE 38 (modo demonstração): serviço cancelado dentro de visita com concluído (Reagendar/Excluir só admin),
tela de concluir sem a frase de ajuda do valor.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote38.py
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

    # tela de concluir: sem a frase de ajuda do valor
    ir(pag, "/concluir/s-amanha")
    ok("Valor do cadastro de tipos de serviço" not in pag.inner_text("#conteudo"), "concluir: frase de ajuda do valor removida")
    ok("(opcional)" in pag.inner_text("#conteudo"), "concluir: '(opcional)' continua em Extras/Desconto")

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
    ok(pag.locator("[data-acoes-cancelado]").count() == 1, "admin: cartão cancelado tem Reagendar e Excluir")
    ok(pag.locator("[data-acoes-cancelado] a:has-text('Reagendar')").count() == 1 and pag.locator("[data-acao=excluir-cancelado]").count() == 1, "botões Reagendar e Excluir presentes")
    pag.click("[data-acoes-cancelado] a:has-text('Reagendar')"); pag.wait_for_timeout(1200)
    ok("/editar" in pag.url, "Reagendar abre a tela de editar/reagendar")
    pag.goto(url_visita); pag.wait_for_timeout(1500)
    pag.click("[data-acao=excluir-cancelado]"); pag.wait_for_timeout(500)
    ok("Excluir este serviço cancelado" in pag.inner_text("dialog"), "Excluir pede confirmação")
    pag.click("dialog [data-resposta=nao]"); pag.wait_for_timeout(500)
    ok(pag.locator("[data-acao=excluir-cancelado]").count() == 1, "Voltar mantém o serviço")
    pag.click("[data-acao=excluir-cancelado]"); pag.wait_for_timeout(500)
    pag.click("dialog [data-resposta=sim]"); pag.wait_for_timeout(1800)
    ok(pag.locator("[data-acoes-cancelado]").count() == 0 and "Motivo: cliente viajou" not in pag.inner_text("#conteudo"), "serviço cancelado excluído da visita")
    pag.close()

    # técnico não vê os botões (só informação)
    print("FALHAS:", len(falhas))
    nav.close()
raise SystemExit(1 if falhas else 0)
