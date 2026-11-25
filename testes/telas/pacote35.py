"""
PACOTE 35 (modo demonstração): cliente clicável nas telas de serviço/concluir e valor do serviço só como texto.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote35.py
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


with sync_playwright() as p:
    nav = p.chromium.launch()
    a, erros = entrar(nav, "demo@meutecnico.app")

    ir(a, "/servico/s-amanha")
    ok(a.locator("[data-link-cliente]").count() == 1, "serviço: nome do cliente é link")
    a.click("[data-link-cliente]"); a.wait_for_timeout(1200)
    ok("#/cliente/" in a.url and "de=" in a.url, "abre o cadastro do cliente")
    ok(a.locator("a[href*='/editar'], [data-acao*=editar]").count() >= 1, "cadastro tem opção de editar")
    a.click(".cabecalho a, .cabecalho [href]"); a.wait_for_timeout(1000)
    ok("#/servico/s-amanha" in a.url, "seta de voltar retorna ao serviço")

    ir(a, "/concluir/s-amanha")
    ok(a.locator("[data-link-cliente]").count() == 1, "concluir: nome do cliente é link")
    ok(not a.locator("input[name=valor]").is_visible(), "valor do serviço não é campo de digitação")
    ok("R$ 600,00" in a.inner_text("#editor-valores").replace("\xa0", " "), "valor do serviço aparece como texto")
    a.click("[data-link-cliente]"); a.wait_for_timeout(1200)
    a.click(".cabecalho a, .cabecalho [href]"); a.wait_for_timeout(1000)
    ok("#/concluir/s-amanha" in a.url, "concluir: voltar do cadastro retorna à tela de concluir")

    a.close()
    # técnico: só é link se ele pode gerir clientes (tem "Clientes" no menu)
    t, e2 = entrar(nav, "tecnico@meutecnico.app")
    tem_menu = t.locator(".menu-topo__item", has_text="Clientes").count() > 0
    ir(t, "/servico/s-amanha")
    ok((t.locator("[data-link-cliente]").count() == 1) == tem_menu, f"técnico: cliente é link só com permissão (menu Clientes: {tem_menu})")
    nav.close()

print("FALHAS:", len(falhas))
raise SystemExit(1 if falhas else 0)
