"""
PACOTE 38 (final, modo demonstração): rodapé só com "Excluir todos" e pergunta "Juntar ao agendamento já marcado" ao reagendar no mesmo horário.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote38b.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from playwright.sync_api import sync_playwright
from _quando import escolher_quando

BASE = "http://localhost:5173/?demo=1"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


with sync_playwright() as p:
    nav = p.chromium.launch()
    a = nav.new_page(viewport={"width": 390, "height": 844})
    a.add_init_script(path='testes/telas/sem-aviso.js')
    erros = []
    a.on("pageerror", lambda e: erros.append(str(e)))
    a.goto(BASE + "#/entrar"); a.wait_for_selector("#form-entrar")
    a.fill("input[name=email]", "demo@meutecnico.app"); a.fill("input[name=senha]", "demo123")
    a.click("#form-entrar [type=submit]"); a.wait_for_selector(".menu-topo__item"); a.wait_for_timeout(1200)

    # visita com 1 concluído e 2 cancelados
    a.evaluate("location.hash='#/agenda'"); a.wait_for_timeout(1200)
    a.locator("#conteudo a[href^='#/servico/']:not(:has-text('Cancelado')):not(:has-text('Concluído'))").first.click(); a.wait_for_timeout(900)
    for _ in range(2):
        a.click("[data-acao=adicionar-servico]"); a.wait_for_timeout(500)
        a.locator("dialog .janela__opcao").first.click(); a.wait_for_timeout(500)
        a.locator("dialog .janela__opcao").first.click(); a.wait_for_timeout(1200)
    a.locator("a[href*='/concluir/']").first.click(); a.wait_for_timeout(900)
    v = a.locator("input[name=valor]")
    if v.count() and not v.input_value(): v.fill("100")
    a.click("#form-concluir [type=submit]"); a.wait_for_timeout(1200)
    a.locator("dialog [data-escolha=nao]").click(); a.wait_for_timeout(500)
    a.locator("dialog [data-escolha=outro]").click(); a.wait_for_timeout(500)
    a.fill("dialog [data-texto]", "Faltou tempo"); a.click("dialog [data-resposta=sim]"); a.wait_for_timeout(1800)
    a.evaluate("location.hash='#/historico'"); a.wait_for_timeout(1200)
    a.locator("#conteudo a[href^='#/servico/']", has_text="Maria").first.click(); a.wait_for_timeout(1500)
    url_visita = a.url

    ok(a.locator("[data-acoes-cancelado]").count() == 2, "2 cancelados: cada cartão tem Reagendar e Excluir")
    ok(a.locator("[data-acao=excluir]").count() == 1, "rodapé tem um botão só (Excluir todos)")
    ok(a.locator("a[href$='/editar']").count() == 0, "rodapé sem Editar/Reagendar todos")

    def reagendar_primeiro():
        a.locator("[data-acoes-cancelado] a:has-text('Reagendar')").first.click(); a.wait_for_timeout(1500)
        escolher_quando(a, "2031-07-10", "08:00")
        a.click("#botao-salvar"); a.wait_for_timeout(2000)

    reagendar_primeiro()
    url_nova = a.url
    a.goto(url_visita); a.wait_for_timeout(1800)
    reagendar_primeiro()
    ok(a.locator("dialog:has-text('Juntar ao agendamento já marcado')").count() == 1, "pergunta se junta à visita já marcada")
    a.locator("dialog button:has-text('Juntar ao agendamento já marcado')").click(); a.wait_for_timeout(2000)
    corpo = a.inner_text("#conteudo")
    ok("Limpeza" in corpo and "Manutenção preventiva" in corpo, "visita juntada mostra os dois serviços")
    a.goto(url_visita); a.wait_for_timeout(1800)
    ok(a.locator("[data-acoes-cancelado]").count() == 0, "visita antiga sem cancelados")
    ok(not erros, f"sem erros de console ({erros[:1]})")
    nav.close()

print("FALHAS:", len(falhas))
raise SystemExit(1 if falhas else 0)
