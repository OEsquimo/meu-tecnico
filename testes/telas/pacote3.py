"""
PACOTE 3 (modo demonstração): status Reagendado (roxo), sem botão Reagendar,
botões por status sem estourar a tela, concluído corrigível/excluível pelo admin,
aparelhos recolhidos na ficha e cliente com histórico arquivado.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote3.py
"""
from playwright.sync_api import sync_playwright
BASE = "http://localhost:5173/?demo=1"
falhas = []
def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c: falhas.append(m)

with sync_playwright() as p:
    nav = p.chromium.launch(); pag = nav.new_page(viewport={"width": 390, "height": 844})
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item")
    def ir(h): pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(900)
    def texto(): return pag.inner_text("#conteudo")
    def sem_rolagem(): return pag.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")

    # ---- Botões por status: Início e Agenda ----
    ir("/")
    ok(pag.locator("#conteudo [data-acao=cancelar-visita]").count() == 1 and pag.locator("#conteudo [data-acao=excluir-visita]").count() == 1, "Início: Editar, Cancelar e Excluir")
    ok(pag.locator("#conteudo a:has-text('Reagendar'), #conteudo button:has-text('Reagendar')").count() == 0, "Início sem 'Reagendar'")
    ok(sem_rolagem(), "Início sem rolagem lateral")
    ir("/agenda")
    ok(pag.locator("#conteudo a:has-text('Reagendar'), #conteudo button:has-text('Reagendar')").count() == 0, "Agenda sem 'Reagendar'")
    ok(sem_rolagem(), "Agenda sem rolagem lateral")

    # ---- Cancelar e reagendar editando: vira Reagendado (roxo) ----
    pag.locator("#conteudo a[href^='#/servico/']").first.click(); pag.wait_for_timeout(900)
    pag.click("[data-acao=cancelar]"); pag.wait_for_timeout(400)
    pag.click("dialog [data-resposta=sim]"); pag.wait_for_timeout(1200)
    ir("/reagendamentos")
    ok(pag.locator(".selo--amarelo:has-text('Cancelado')").count() >= 1, "cancelado: selo amarelo 'Cancelado'")
    pag.locator("#conteudo a[href^='#/servico/']").first.click(); pag.wait_for_timeout(900)
    ok(pag.locator("[data-acao=excluir]").count() == 1 and pag.locator("a:has-text('Editar')").count() >= 1, "cancelado: Editar e Excluir")
    ok(pag.locator("[data-acao=cancelar]").count() == 0, "cancelado não tem Cancelar")
    pag.locator("a:has-text('Editar')").first.click(); pag.wait_for_timeout(1000)
    pag.fill("input[name=data]", "2031-07-10"); pag.dispatch_event("input[name=data]", "change"); pag.wait_for_timeout(400)
    pag.fill("input[name=hora]", "11:00"); pag.dispatch_event("input[name=hora]", "change"); pag.wait_for_timeout(400)
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    ok(pag.locator(".selo--roxo:has-text('Reagendado')").count() >= 1, "novo horário: selo roxo 'Reagendado'")
    ok(pag.locator("[data-acao=cancelar]").count() == 1 and pag.locator("[data-acao=excluir]").count() == 1, "reagendado: Editar, Cancelar e Excluir")
    pag.click("[data-acao=excluir]"); pag.wait_for_timeout(400)
    pag.click("dialog [data-resposta=sim]"); pag.wait_for_timeout(1500)

    # ---- Concluído: admin corrige e exclui com dupla confirmação ----
    ir("/historico")
    pag.locator("#resultado a[href^='#/servico/']").first.click(); pag.wait_for_timeout(900)
    ok(pag.locator("[data-acao=editar-concluido]").count() >= 1 and pag.locator("[data-acao=excluir-concluido]").count() >= 1, "concluído: Editar e Excluir (admin)")
    pag.locator("[data-acao=excluir-concluido]").first.click(); pag.wait_for_timeout(400)
    pag.click("dialog [data-resposta=nao]"); pag.wait_for_timeout(400)
    ok("/servico/" in pag.url, "recusar a confirmação não exclui")
    ok(sem_rolagem(), "detalhe sem rolagem lateral")

    # ---- Ficha do cliente: aparelhos recolhidos ----
    ir("/clientes")
    pag.locator("#conteudo a:has-text('Ana Lima')").first.click(); pag.wait_for_timeout(1000)
    ok(pag.locator("a[href*='/aparelho/']").count() == 0 or pag.locator("[data-acao=alternar-aparelhos]").count() == 1, "aparelhos começam escondidos")
    ok("Ver aparelhos (" in texto(), "link 'Ver aparelhos (N)'")
    pag.click("[data-acao=alternar-aparelhos]"); pag.wait_for_timeout(500)
    ok("Esconder aparelhos" in texto(), "abre a lista de aparelhos")
    ok(pag.locator("#conteudo a:has-text('Reagendar'), #conteudo button:has-text('Reagendar')").count() == 0, "ficha sem 'Reagendar'")
    ok(sem_rolagem(), "ficha sem rolagem lateral")

    ok(not erros, f"sem erros no console ({erros[:2]})")
    nav.close()
print("FALHAS:" if falhas else "TUDO OK", falhas if falhas else "")
raise SystemExit(1 if falhas else 0)
