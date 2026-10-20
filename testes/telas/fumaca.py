"""
TESTE DE FUMAÇA DAS TELAS (modo demonstração, sem Firebase)
Uso: node scripts/servir-local.mjs &   python3 testes/telas/fumaca.py
Para cada perfil (admin, técnico, dono) entra com a conta demo, abre as rotas
principais e confere: sem erro de console/CSP/página e sem tela presa em
"carregando". Também confere que o técnico NÃO vê valores em R$.
"""
import sys, re
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173/?demo=1"
PERFIS = {
    "admin": ("demo@meutecnico.app", [
        "/", "/agenda", "/clientes", "/cliente/novo", "/historico", "/retornos", "/financeiro",
        "/administrativa", "/tipos-servico", "/tipos-servico/novo", "/equipe", "/equipe/novo",
        "/configuracoes", "/plano", "/backup", "/conta", "/agendar",
    ]),
    "tecnico": ("tecnico@meutecnico.app", ["/", "/agenda", "/historico", "/conta"]),
    "dono": ("dono@meutecnico.app", ["/dono", "/dono/planos", "/dono/contas"]),
}
falhas = []

def rodar(p, perfil, email, rotas):
    nav = p.chromium.launch()
    pag = nav.new_page(viewport={"width": 390, "height": 844})
    erros = []
    pag.on("console", lambda m: erros.append(f"console.{m.type}: {m.text}") if m.type in ("error",) else None)
    pag.on("pageerror", lambda e: erros.append(f"pageerror: {e}"))
    pag.goto(BASE + "#/entrar")
    pag.wait_for_selector("#form-entrar", timeout=15000)
    pag.fill("input[name=email]", email)
    pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]")
    pag.wait_for_selector("#menu-topo a, .menu-topo__item", timeout=15000)
    for r in rotas:
        antes = len(erros)
        pag.evaluate(f"location.hash = '#{r}'")
        pag.wait_for_timeout(900)
        texto = pag.inner_text("#conteudo")
        preso = pag.locator("#conteudo .esqueleto").count() > 0
        if preso: falhas.append(f"[{perfil}] {r}: ficou em 'carregando'")
        if len(texto.strip()) < 5: falhas.append(f"[{perfil}] {r}: tela vazia")
        if perfil == "tecnico" and re.search(r"R\$\s?\d", texto): falhas.append(f"[{perfil}] {r}: técnico vê valor em R$")
        for e in erros[antes:]: falhas.append(f"[{perfil}] {r}: {e}")
        print(f"  ok? {perfil:8} {r:24} {'ERRO' if len(erros)>antes or preso else 'ok'}")
    nav.close()

with sync_playwright() as p:
    for perfil, (email, rotas) in PERFIS.items():
        rodar(p, perfil, email, rotas)

if falhas:
    print("\nFALHAS:"); [print(" -", f) for f in falhas]; sys.exit(1)
print("\nTudo certo.")
