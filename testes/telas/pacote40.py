"""
PACOTE 40 (modo demonstração): "Reagendar" do cartão de um serviço cancelado reagenda SÓ aquele serviço.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote40.py
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
    ok(a.locator("[data-acao=excluir]").count() == 1, "2 cancelados: rodapé (todos de uma vez) continua")
    escolhido = a.locator("[data-acoes-cancelado]").first.locator("xpath=ancestor::*[contains(@class,'visita-')][1]").inner_text() if False else ""
    a.locator("[data-acoes-cancelado] a:has-text('Reagendar')").first.click(); a.wait_for_timeout(1500)
    ok("?so=" in a.url, "Reagendar do cartão abre a edição só daquele serviço")
    corpo = a.inner_text("#conteudo")
    tem_limpeza, tem_manut = "Limpeza" in corpo, "Manutenção preventiva" in corpo
    ok(tem_limpeza != tem_manut, f"a edição mostra um serviço só (Limpeza={tem_limpeza}, Manutenção={tem_manut})")
    nome = "Limpeza" if tem_limpeza else "Manutenção preventiva"
    outro = "Manutenção preventiva" if tem_limpeza else "Limpeza"
    escolher_quando(a, "2031-07-10", "11:00")
    a.click("#botao-salvar"); a.wait_for_timeout(2000)
    corpo = a.inner_text("#conteudo")
    ok(nome in corpo and outro not in corpo, "depois de salvar: visita nova só com o serviço reagendado")
    ok("Cancelado" not in a.inner_text("h1, .cabecalho") , "o serviço reagendado não está mais cancelado")

    # visita antiga: concluído + o outro ainda cancelado (agora um só → rodapé some)
    a.goto(url_visita); a.wait_for_timeout(1800)
    corpo = a.inner_text("#conteudo")
    ok(outro in corpo and "Concluído" in corpo, "visita antiga mantém o concluído e o outro cancelado")
    ok(a.locator("[data-acoes-cancelado]").count() == 1 and a.locator("[data-acao=excluir]").count() == 0, "agora com um cancelado só: botões só no cartão (sem repetição)")
    ok(not erros, f"sem erros de console ({erros[:1]})")
    nav.close()

print("FALHAS:", len(falhas))
raise SystemExit(1 if falhas else 0)
