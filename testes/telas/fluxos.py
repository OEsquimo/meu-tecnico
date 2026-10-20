"""
FLUXOS PRINCIPAIS (modo demonstração): cliente novo, detalhes, concluir serviço
como técnico (sem valor), convite de funcionário, painel do dono.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/fluxos.py
"""
import sys, re
from playwright.sync_api import sync_playwright
BASE = "http://localhost:5173/?demo=1"
falhas = []
def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c: falhas.append(m)

def entrar(p, email):
    nav = p.chromium.launch(); pag = nav.new_page(viewport={"width": 390, "height": 844})
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", email); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item")
    return nav, pag, erros

def ir(pag, h): pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(800)

with sync_playwright() as p:
    # ---- ADMIN ----
    nav, pag, erros = entrar(p, "demo@meutecnico.app")
    ir(pag, "/clientes")
    pag.locator("#conteudo a[href^='#/cliente/c-']").first.click(); pag.wait_for_timeout(800)
    ok("cliente" in pag.url and "novo" not in pag.url, "abre detalhe do cliente")
    ir(pag, "/agenda")
    link = pag.locator("#conteudo a[href^='#/servico/']").first
    ok(link.count() > 0, "agenda lista serviço do dia ou do mês")
    ir(pag, "/historico")
    h = pag.locator("#conteudo a[href^='#/servico/']").first
    if h.count():
        h.click(); pag.wait_for_timeout(800)
        ok("R$" in pag.inner_text("#conteudo") or "valor" in pag.inner_text("#conteudo").lower(), "admin vê valor no serviço concluído")
    ir(pag, "/equipe/novo")
    pag.fill("input[name=nome]", "Teste Silva"); pag.fill("input[name=telefone]", "11912345678")
    pag.click("#form-func [type=submit]"); pag.wait_for_timeout(1000)
    ok("equipe/convite" in pag.url, "criar convite leva à tela do link")
    ok("#/convite/" in pag.inner_text("#conteudo"), "link do convite aparece")
    ir(pag, "/financeiro"); ok("Recebido" in pag.inner_text("#conteudo"), "financeiro mostra Recebido")
    ok(not erros, f"admin sem erros de console ({erros[:2]})"); nav.close()

    # ---- TÉCNICO ----
    nav, pag, erros = entrar(p, "tecnico@meutecnico.app")
    ir(pag, "/agenda")
    l = pag.locator("#conteudo a[href^='#/servico/']").first
    if l.count():
        l.click(); pag.wait_for_timeout(800)
        sid = pag.url.split("/servico/")[1]
        ir(pag, f"/concluir/{sid}")
        ok(pag.locator("input[name=valor]").count() == 0, "técnico não tem campo de valor ao concluir")
        pag.fill("textarea[name=descricao]", "Limpeza completa feita")
        pag.click("#form-concluir [type=submit]"); pag.wait_for_timeout(1200)
        ok(pag.url.endswith("#/") or pag.url.endswith("/"), "técnico conclui e volta ao início")
    else:
        print("  (técnico sem serviço no mês: fluxo de concluir não exercitado)")
    ir(pag, "/financeiro"); ok("#/financeiro" not in pag.url, "técnico não acessa financeiro")
    ok(not erros, f"técnico sem erros ({erros[:2]})"); nav.close()

    # ---- DONO ----
    nav, pag, erros = entrar(p, "dono@meutecnico.app")
    ir(pag, "/dono/contas")
    pag.locator("#conteudo [data-acao=abrir]").first.click(); pag.wait_for_timeout(500)
    ok("Ativar / renovar" in pag.inner_text("#conteudo"), "dono abre uma conta")
    ok(not erros, f"dono sem erros ({erros[:2]})"); nav.close()

if falhas: print("\nFALHAS:", *falhas, sep="\n - "); sys.exit(1)
print("\nTudo certo.")
