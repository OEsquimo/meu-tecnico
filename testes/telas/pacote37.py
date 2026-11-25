"""
PACOTE 37 (modo demonstração): "Técnico" no lugar de "Por" e "Ver detalhes" em blocos Horários / Valores.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote37.py
"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173/?demo=1"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


with sync_playwright() as p:
    nav = p.chromium.launch()
    a = nav.new_page(viewport={"width": 360, "height": 800})
    a.add_init_script(path='testes/telas/sem-aviso.js')
    erros = []
    a.on("pageerror", lambda e: erros.append(str(e)))
    a.goto(BASE + "#/entrar"); a.wait_for_selector("#form-entrar")
    a.fill("input[name=email]", "demo@meutecnico.app"); a.fill("input[name=senha]", "demo123")
    a.click("#form-entrar [type=submit]"); a.wait_for_selector(".menu-topo__item"); a.wait_for_timeout(1200)

    a.evaluate("location.hash='#/servico/s-c4'"); a.wait_for_timeout(1500)
    a.locator("summary", has_text="Ver detalhes").first.click(); a.wait_for_timeout(300)
    t = a.inner_text("#conteudo").replace("\xa0", " ")
    ok("Técnico" in t and "\nPor\n" not in t, "detalhes mostram 'Técnico' (não 'Por')")
    ok(a.locator("[data-bloco-detalhe=Valores]").count() == 1, "bloco Valores existe")
    ok("Total" in a.inner_text("[data-bloco-detalhe=Valores]"), "Total em destaque no bloco Valores")
    # valores não quebram: cada <dd> do bloco tem uma linha só (altura pequena)
    alturas = a.evaluate("[...document.querySelectorAll('.detalhes-servico dd')].map(d => d.getBoundingClientRect().height)")
    ok(alturas and max(alturas) < 30, f"valores numa linha só (maior altura {max(alturas) if alturas else '-'}px)")
    ok(not erros, f"sem erros de console ({erros[:1]})")
    nav.close()

print("FALHAS:", len(falhas))
raise SystemExit(1 if falhas else 0)
