"""
PACOTE 10c (modo demonstração): Agenda com um botão "Agendar" só (dentro do calendário) e título no meio,
Agendar sem avisos repetidos (cartão "Quando" amarelo com ícone), aviso discreto de hora extra no seletor,
texto da Equipe, Termos só na Minha conta, botões da Configurações e detalhe da visita sem repetições.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote10c.py
"""
from playwright.sync_api import sync_playwright
from _quando import escolher_quando, SELETOR, _abrir_no_mes
BASE = "http://localhost:5173/?demo=1"
falhas = []
def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c: falhas.append(m)

def entrar(nav, email):
    pag = nav.new_page(viewport={"width": 390, "height": 844})
    pag.on("pageerror", lambda e: falhas.append(f"pageerror: {e}"))
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", email); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)
    return pag

with sync_playwright() as p:
    nav = p.chromium.launch()
    pag = entrar(nav, "demo@meutecnico.app")
    def ir(h): pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(900)
    def texto(): return pag.inner_text("#conteudo")

    # ---- Agenda: um botão só, dentro do calendário; título no meio ----
    ir("/agenda")
    ok(pag.locator("#botao-agendar").count() == 1, "Agenda: um único botão Agendar")
    ok(pag.locator("a[href*='#/agendar']").count() == 1, "Agenda: nenhum outro atalho para Agendar na tela")
    ok(pag.locator("section[aria-label='Calendário'] #botao-agendar").count() == 1, "o botão fica dentro do cartão do calendário")
    ultimo_dia = pag.locator("section[aria-label='Calendário'] .calendario__dia").last.bounding_box()
    bt = pag.locator("#botao-agendar").bounding_box()
    ok(bt["y"] > ultimo_dia["y"], "o botão fica embaixo dos dias do mês")
    titulo = pag.locator("#titulo-da-tela").bounding_box()
    ok(abs((titulo["x"] + titulo["width"] / 2) - 195) < 20 or pag.evaluate("getComputedStyle(document.querySelector('.cabecalho__textos')).textAlign") == "center", "o título Agenda fica no meio")
    # dia sem serviço: só o texto, sem segundo botão
    sem = pag.locator("section[aria-label='Calendário'] .calendario__dia:not(:has(.calendario__ponto)):not([disabled])")
    sem.nth(sem.count() - 1).click(); pag.wait_for_timeout(300)
    ok("Nenhum serviço neste dia." in texto(), "dia vazio: texto simples 'Nenhum serviço neste dia.'")
    ok(pag.locator("a[href*='#/agendar']").count() == 1 and "Agendar serviço" not in texto(), "dia vazio: continua um botão Agendar só")
    dia_escolhido = pag.locator("section[aria-label='Calendário'] .calendario__dia--selecionado").first.get_attribute("data-iso")
    pag.click("#botao-agendar"); pag.wait_for_timeout(700)
    ok("#/agendar" in pag.url and f"data={dia_escolhido}" in pag.url, f"o botão abre Agendar no dia escolhido ({dia_escolhido})")

    # ---- Agendar: sem avisos repetidos; cartão Quando amarelo com ícone ----
    ir("/agendar")
    ok("Escolha o cliente." not in pag.inner_text("#area-pendencias") if pag.locator("#area-pendencias").count() else True, "sem cliente: nenhum aviso amarelo repetido")
    pag.locator("[data-acao=escolher-cliente]", has_text="Ana Lima").click(); pag.wait_for_timeout(600)
    ok(pag.locator(".aviso--amarelo", has_text="Escolha o dia e a hora").count() == 0, "sem dia e hora: sem aviso amarelo separado embaixo")
    ok(pag.locator("#botao-quando.quando-botao--pendente").count() == 1, "o cartão 'Escolher dia e horário' fica marcado como pendente")
    ok(pag.locator("#botao-quando .quando-botao__icone svg").count() == 1, "o cartão pendente tem o ícone de aviso (desenhado no app)")
    fundo = pag.evaluate("getComputedStyle(document.querySelector('#botao-quando')).backgroundColor")
    ok(fundo == "rgb(255, 243, 214)", f"o cartão pendente tem fundo amarelo ({fundo})")
    # tocar em Agendar sem escolher mostra o erro
    pag.click("#botao-salvar"); pag.wait_for_timeout(500)
    ok(pag.locator(".aviso-rapido--erro").count() >= 1 or pag.locator(".campo__erro").count() >= 1, "tocar em Agendar sem dia e hora mostra o erro")

    # ---- Seletor: hora extra com aviso discreto ----
    _abrir_no_mes(pag, "2031-06-10")
    pag.click(f"{SELETOR} [data-acao=seletor-dia][data-iso='2031-06-10']")
    horas = pag.locator(f"{SELETOR} [data-acao=seletor-hora]").all_inner_texts()
    ok(horas[-1] == "17:30", f"o último início é 30 min antes de fechar ({horas[-1]})")
    ok(pag.locator(f"{SELETOR} [data-aviso=hora-extra]").count() == 0, "sem horário escolhido: sem aviso de hora extra")
    pag.click(f"{SELETOR} [data-acao=seletor-hora][data-hora='16:00']")
    ok(pag.locator(f"{SELETOR} [data-aviso=hora-extra]").count() == 0, "16:00 (1 h) termina às 17:00: sem aviso")
    pag.click(f"{SELETOR} [data-acao=seletor-hora][data-hora='17:30']")
    aviso = pag.locator(f"{SELETOR} [data-aviso=hora-extra]")
    ok(aviso.count() == 1 and "Termina às 18:30, depois do expediente." in aviso.inner_text(), "17:30 + 1 h: 'Termina às 18:30, depois do expediente.'")
    cor = pag.evaluate("getComputedStyle(document.querySelector('dialog.seletor [data-aviso=hora-extra]')).backgroundColor")
    ok(cor in ("rgba(0, 0, 0, 0)", "transparent"), "o aviso é discreto: sem fundo colorido")
    ok(pag.locator(f"{SELETOR} [data-aviso=hora-extra] svg").count() == 0, "o aviso de hora extra não tem ícone")
    pag.click(f"{SELETOR} [data-acao=seletor-confirmar]"); pag.wait_for_selector(SELETOR, state="detached"); pag.wait_for_timeout(400)
    ok(pag.locator("#botao-quando.quando-botao--pendente").count() == 0, "depois de escolher, o cartão 'Quando' volta ao visual normal")

    # ---- Equipe, Administrativa, Minha conta, Configurações ----
    ir("/equipe")
    ok("sem valores" not in texto() and "só aparecem para quem você liberar" in texto(), "Equipe: o texto não diz mais 'sem valores'")
    ir("/administrativa")
    ok("Termos de uso" not in texto() and "Política de privacidade" not in texto(), "Administrativa: Termos e Política não aparecem aqui")
    ir("/conta")
    ok(pag.locator("a[href='#/termos']").count() == 1 and pag.locator("a[href='#/privacidade']").count() == 1, "Minha conta: Termos e Política ficam só aqui")
    ir("/configuracoes")
    ok("Voltar ao lembrete padrão" in texto() and "Voltar à cobrança padrão" in texto(), "Configurações: os dois botões têm nomes diferentes e claros")
    ok("Voltar à mensagem padrão" not in texto(), "Configurações: sumiu o nome repetido")

    # ---- Detalhe da visita sem repetições ----
    ir("/servico/s-amanha")
    t = texto()
    ok(t.count("Instalação") == 1, f"detalhe: o nome do serviço aparece uma vez ({t.count('Instalação')})")
    ok(t.count("Agendado") == 1, f"detalhe: a situação aparece uma vez ({t.count('Agendado')})")
    ok("Técnico: Rafael Costa" not in t and "Rafael Costa" in t, "detalhe: o técnico aparece só no cartão de cima")
    ok(pag.locator("#conteudo :is(a,button):has-text('Concluir serviço')").count() == 1, "detalhe: o botão Concluir serviço continua")

    # ---- Técnico comum: sem botão Agendar na Agenda; título no meio ----
    pt = entrar(nav, "tecnico@meutecnico.app")
    pt.evaluate("location.hash='#/agenda'"); pt.wait_for_timeout(900)
    ok(pt.locator("#botao-agendar").count() == 0 and pt.locator("a[href*='#/agendar']").count() == 0, "técnico: a Agenda não tem botão Agendar")
    ok(pt.locator(".cabecalho--centro").count() == 1, "técnico: o título também fica no meio")
    nav.close()

if falhas:
    print("\nFALHAS:"); [print(" -", f) for f in falhas]; raise SystemExit(1)
print("\nTUDO OK")
