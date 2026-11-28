"""
PACOTE 39 (modo demonstração): botões do agendamento (topo "Todo o agendamento" e cada serviço), rodapé sem botões,
motivo opcional ao cancelar, Editar/Reagendar de um serviço só e do agendamento inteiro, cancelado sempre com Reagendar/Excluir.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote39final.py
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
    def entrar_novo():
        ctx_ = nav.new_context(viewport={"width": 390, "height": 844})
        pag = ctx_.new_page()
        pag.add_init_script(path='testes/telas/sem-aviso.js')
        pag.on("pageerror", lambda e: erros.append(str(e)))
        pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
        pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
        pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1200)
        return pag

    erros = []
    a = entrar_novo()

    def texto(): return a.inner_text("#conteudo")

    def abrir_primeiro():
        a.evaluate("location.hash='#/agenda'"); a.wait_for_timeout(1200)
        a.locator("#conteudo a[href^='#/servico/']:not(:has-text('Cancelado')):not(:has-text('Concluído'))").first.click(); a.wait_for_timeout(1200)

    def abrir_agendamento_com_tres():
        a.evaluate("location.hash='#/agenda'"); a.wait_for_timeout(1200)
        a.locator("#conteudo a[href^='#/servico/']:not(:has-text('Cancelado')):not(:has-text('Concluído'))").first.click(); a.wait_for_timeout(900)
        while a.locator("[data-acoes-agendado]").count() < 3:
            a.click("[data-acao=adicionar-servico]"); a.wait_for_timeout(500)
            a.locator("dialog .janela__opcao").first.click(); a.wait_for_timeout(500)
            a.locator("dialog .janela__opcao").first.click(); a.wait_for_timeout(1200)

    # ---- 1) agendamento com 3 serviços agendados ----
    abrir_agendamento_com_tres()
    url = a.url
    topo = a.locator("[data-bloco=todo-agendamento]")
    ok(topo.count() == 1 and "todo o agendamento" in topo.inner_text().lower(), "topo tem a linha 'Todo o agendamento'")
    ok(topo.locator("a:has-text('Reagendar')").count() == 1 and topo.locator("[data-acao=cancelar]").count() == 1 and topo.locator("[data-acao=excluir]").count() == 1, "topo: Reagendar, Cancelar e Excluir")
    ok(a.locator("[data-acoes-agendado]").count() == 3, "cada um dos 3 serviços tem a linha de botões")
    cada = a.locator("[data-acoes-agendado]")
    ok(all(cada.nth(i).locator("a:has-text('Editar')").count() == 1 and cada.nth(i).locator("[data-acao=cancelar-servico]").count() == 1 and cada.nth(i).locator("[data-acao=excluir-servico]").count() == 1 for i in range(3)), "cada serviço: Editar, Cancelar e Excluir")
    ok(a.locator("[data-acao=cancelar]").count() == 1 and a.locator("[data-acao=excluir]").count() == 1, "sem botões repetidos no rodapé (só os do topo)")

    # ---- 2) cancelar UM serviço, com motivo ----
    a.locator("[data-acao=cancelar-servico]").first.click(); a.wait_for_timeout(500)
    ok(a.locator("dialog [data-texto]").count() == 1 and a.locator("dialog [data-texto]").get_attribute("placeholder") == "Motivo (opcional)", "cancelar pergunta o motivo (opcional)")
    a.fill("dialog [data-texto]", "Cliente pediu para remarcar"); a.click("dialog [data-resposta=sim]"); a.wait_for_timeout(1800)
    ok("Motivo: Cliente pediu para remarcar" in texto(), "o motivo aparece no cartão cancelado")
    ok(a.locator("[data-acoes-cancelado]").count() == 1 and a.locator("[data-acoes-cancelado] a:has-text('Reagendar')").count() == 1 and a.locator("[data-acoes-cancelado] [data-acao=excluir-cancelado]").count() == 1, "cancelado tem Reagendar e Excluir")
    ok(a.locator("[data-acoes-agendado]").count() == 2, "os outros 2 continuam agendados")

    # ---- 3) excluir UM serviço agendado ----
    a.locator("[data-acao=excluir-servico]").first.click(); a.wait_for_timeout(500)
    ok("apaga de vez" in a.inner_text("dialog").lower() or "não pode ser desfeito" in a.inner_text("dialog"), "excluir pede confirmação clara")
    a.click("dialog [data-resposta=sim]"); a.wait_for_timeout(1800)
    ok(a.locator("[data-acoes-agendado]").count() == 1, "sobrou 1 serviço agendado")
    ok(a.locator("[data-bloco=todo-agendamento]").count() == 1 and a.locator("[data-bloco=todo-agendamento] [data-acao=excluir]").count() == 1 and a.locator("[data-bloco=todo-agendamento] [data-acao=cancelar]").count() == 0, "1 agendado + 1 cancelado: topo só com Excluir")

    # ---- 4) Editar um serviço agendado: muda dia e hora, separa do agendamento (começa de uma tela limpa) ----
    a = entrar_novo()
    abrir_agendamento_com_tres()
    def secao_com(n):
        sec = a.locator("section.visita-aparelho")
        for k in range(sec.count()):
            if sec.nth(k).locator("[data-acoes-agendado]").count() == n:
                return sec.nth(k)
        return None

    # Aparelho com 2 serviços: o dia/hora não muda só para um deles (um aparelho só tem um agendamento aberto).
    dupla = secao_com(2)
    ok(dupla is not None, "há um aparelho com 2 serviços agendados")
    dupla.locator("[data-acoes-agendado] a:has-text('Editar')").first.click(); a.wait_for_timeout(1500)
    ok("mudam juntos" in texto() and a.locator("#area-quando .quando-calendario").count() == 0, "aparelho com 2 serviços: dia, hora e técnicos mudam juntos (sem calendário aqui)")
    a.go_back(); a.wait_for_timeout(1500)
    # Aparelho com 1 serviço só: pode mudar o dia e a hora sozinho.
    sozinho = secao_com(1)
    ok(sozinho is not None, "há um aparelho com 1 serviço agendado")
    sozinho.locator("[data-acoes-agendado] a:has-text('Editar')").first.click(); a.wait_for_timeout(1500)
    corpo = a.inner_text("#conteudo")
    ok("Editar serviço" in a.content(), "título 'Editar serviço'")
    ok("Técnicos deste serviço" not in corpo and a.locator("[data-acao=remover-servico], [data-acao=remover-aparelho], [data-acao=adicionar-aparelho], [data-acao=novo-aparelho]").count() == 0, "sem técnicos por serviço, sem Remover e sem adicionar aparelho")
    ok(a.locator("#area-obs-agendamento .obs-recolhivel").count() == 0, "observação do agendamento não aparece ao editar só um serviço")
    escolher_quando(a, "2031-08-14", "08:00")
    a.click("#botao-salvar"); a.wait_for_timeout(700)
    ok("Mudar o dia ou a hora?" in a.inner_text("dialog"), "aviso 'Mudar o dia ou a hora?' antes de salvar")
    ok(a.locator("dialog [data-resposta=sim]").inner_text().strip() == "Salvar", "botão do aviso é só 'Salvar'")
    a.click("dialog [data-resposta=sim]"); a.wait_for_timeout(2200)
    ok("14/08/2031" in texto() and a.locator("[data-acoes-agendado]").count() == 1, "o serviço foi para 14/08/2031 sozinho")
    abrir_primeiro()
    ok("14/08/2031" not in texto() and a.locator("[data-acoes-agendado]").count() == 2, "os outros 2 continuam no agendamento antigo")

    # ---- 5) Reagendar o agendamento todo (topo) ----
    a.locator("[data-bloco=todo-agendamento] a:has-text('Reagendar')").click(); a.wait_for_timeout(1500)
    ok(a.locator("#area-aparelhos .agenda-aparelho").count() == 0, "reagendar o agendamento todo não lista aparelhos nem serviços")
    escolher_quando(a, "2031-09-18", "08:00")
    a.click("#botao-salvar"); a.wait_for_timeout(2200)
    ok("18/09/2031" in texto() and a.locator("[data-acoes-agendado]").count() == 2, "os 2 serviços foram juntos para 18/09/2031")

    # ---- 6) Cancelar o agendamento todo (topo), com motivo ----
    a.locator("[data-bloco=todo-agendamento] [data-acao=cancelar]").click(); a.wait_for_timeout(500)
    a.fill("dialog [data-texto]", "Cliente viajou"); a.click("dialog [data-resposta=sim]"); a.wait_for_timeout(2000)
    ok("#/agenda" in a.url, "depois de cancelar tudo, volta para a Agenda")
    a.goto(a.url.split("#")[0] + "#/servicos"); a.wait_for_timeout(300)
    # abre o agendamento cancelado pelo histórico de pendentes (Reagendamentos)
    a.evaluate("location.hash='#/reagendamentos'"); a.wait_for_timeout(1500)
    a.locator("#conteudo a[href^='#/servico/']").first.click(); a.wait_for_timeout(1500)
    ok(a.locator("[data-acoes-cancelado]").count() == 2 and "Motivo: Cliente viajou" in texto(), "agendamento todo cancelado, sem concluído: cada serviço tem Reagendar/Excluir e o motivo")
    ok(a.locator("[data-bloco=todo-agendamento] a:has-text('Reagendar')").count() == 0 and a.locator("[data-bloco=todo-agendamento] [data-acao=cancelar]").count() == 0 and a.locator("[data-bloco=todo-agendamento] [data-acao=excluir]").count() == 1, "topo com 2 cancelados: só Excluir")

    # ---- 7) Excluir todos (topo) ----
    a.locator("[data-bloco=todo-agendamento] [data-acao=excluir]").click(); a.wait_for_timeout(500)
    ok("Excluir os 2 serviços" in a.inner_text("dialog"), "a confirmação diz quantos serviços serão apagados")
    a.click("dialog [data-resposta=sim]"); a.wait_for_timeout(2000)
    ok("#/agenda" in a.url, "depois de excluir tudo, volta para a Agenda")

    ok(not erros, f"sem erros de console ({erros[:1]})")
    nav.close()

print("FALHAS:", len(falhas))
raise SystemExit(1 if falhas else 0)
