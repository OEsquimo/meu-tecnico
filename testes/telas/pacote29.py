"""
PACOTE 29 (modo demonstração): "Horário não conferido". Concluir sem iniciar e sem conferir marca o serviço; tocar em Iniciar,
marcar "Conferi os horários" ou mudar um horário conta como conferido. Indicador "Horários informados: X de Y" (técnico em
Concluídos, administrador no Desempenho) e selo no serviço concluído.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote29.py
"""
from datetime import datetime
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173/?demo=1"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


def hoje(h, m=0):
    n = datetime.now()
    return datetime(n.year, n.month, n.day, h, m)


def entrar(nav, email, hora):
    pag = nav.new_page(viewport={"width": 390, "height": 844})
    pag.add_init_script(path='testes/telas/sem-aviso.js')
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))
    pag.clock.install(time=hoje(*hora))
    pag.clock.resume()
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", email); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1200)
    return pag, erros


def ir(pag, h):
    pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(900)


def texto(pag):
    return pag.inner_text("#conteudo")


def enviar_concluir(pag):
    pag.click("#form-concluir [type=submit]"); pag.wait_for_timeout(900)
    for _ in range(3):
        if pag.locator("dialog[open] [data-resposta=sim]").count():
            pag.click("dialog[open] [data-resposta=sim]"); pag.wait_for_timeout(900)
    pag.wait_for_timeout(700)


with sync_playwright() as p:
    nav = p.chromium.launch()

    # 1) concluir sem iniciar e sem conferir -> "Horário não conferido"
    t, erros1 = entrar(nav, "tecnico@meutecnico.app", (15, 0))
    ir(t, "/concluir/s-hoje-1"); t.wait_for_selector("#form-concluir")
    ok(t.locator("[data-bloco=conferi] input[name=horariosConferidos]").count() == 1, "sem Iniciar, a conclusão mostra 'Conferi os horários'")
    ok("Horário não conferido" in t.inner_text("[data-bloco=horarios]"), "e avisa que sem conferir fica 'Horário não conferido'")
    enviar_concluir(t)
    ok("/concluir/" not in t.url, "conclui normalmente (continua concluído)")
    ir(t, "/servico/s-hoje-1")
    corpo = texto(t)
    ok("Horário não conferido" in corpo and "não conferidos" in corpo, "o serviço concluído mostra o selo 'Horário não conferido'")
    ok("Tempo no cliente" not in corpo, "e não calcula tempo no cliente")
    ir(t, "/historico")
    ind = t.locator("[data-horarios-informados]")
    ok(ind.count() == 1 and "0 de 1" in ind.inner_text(), f"o técnico vê 'Horários informados: 0 de 1' ({ind.inner_text() if ind.count() else ''!r})")
    ok(t.locator("#conteudo [data-acao=corrigir-horarios]").count() == 0, "o técnico não tem 'Corrigir horários'")
    ok(not [e for e in erros1 if "favicon" not in e], f"sem erros no console: {erros1[:3]}")
    t.context.close()

    # 2) marcando "Conferi os horários" -> conferido
    t, erros2 = entrar(nav, "tecnico@meutecnico.app", (15, 0))
    ir(t, "/concluir/s-hoje-1"); t.wait_for_selector("#form-concluir")
    t.check("input[name=horariosConferidos]")
    enviar_concluir(t)
    ir(t, "/servico/s-hoje-1")
    ok("Horário não conferido" not in texto(t), "com 'Conferi os horários' marcado não há selo")
    ir(t, "/historico")
    ind = t.locator("[data-horarios-informados]")
    ok(ind.count() == 1 and "1 de 1" in ind.inner_text(), "o técnico vê 'Horários informados: 1 de 1'")
    t.context.close()

    # 3) mudar um horário sugerido também conta como conferido
    t, erros3 = entrar(nav, "tecnico@meutecnico.app", (15, 0))
    ir(t, "/concluir/s-hoje-1"); t.wait_for_selector("#form-concluir")
    t.fill("input[name=horaInicio]", "14:05"); t.fill("input[name=horaConclusao]", "14:55")
    enviar_concluir(t)
    ir(t, "/servico/s-hoje-1")
    corpo = texto(t)
    ok("Horário não conferido" not in corpo and "50min" in corpo.replace(" ", ""), "corrigir os horários conta como conferido e calcula o tempo (50 min)")
    t.context.close()

    # 4) tocar em Iniciar -> conferido, e a conclusão nem pergunta "Conferi"
    t, erros4 = entrar(nav, "tecnico@meutecnico.app", (13, 45))
    t.click("[data-acao=iniciar-agora]"); t.wait_for_timeout(1200)
    t.clock.set_system_time(hoje(14, 40))
    ir(t, "/concluir/s-hoje-1"); t.wait_for_selector("#form-concluir")
    ok(t.locator("input[name=horariosConferidos]").count() == 0, "depois de Iniciar a conclusão não pede para conferir")
    enviar_concluir(t)
    ir(t, "/servico/s-hoje-1")
    ok("Horário não conferido" not in texto(t), "serviço iniciado e concluído não tem selo")
    t.context.close()

    # 5) administrador: Desempenho com o indicador e Corrigir horários marca como conferido
    a, erros_a = entrar(nav, "demo@meutecnico.app", (17, 30))
    ir(a, "/desempenho")
    a.locator("[data-acao=aba][data-aba=ano]").click() if a.locator("[data-acao=aba][data-aba=ano]").count() else None
    a.wait_for_timeout(700)
    ok("Concluídos" in texto(a), "Desempenho abre")
    a.locator("[data-acao=tecnico]").first.click(); a.wait_for_timeout(600)
    ok(a.locator("[data-linha=horarios-informados]").count() == 1 and "Horários informados" in texto(a), "o detalhe do técnico tem a linha 'Horários informados'")
    ir(a, "/servico/s-c1")
    a.click("[data-acao=corrigir-horarios]"); a.wait_for_selector("dialog[open]")
    a.fill("dialog[open] [data-inicio]", "10:00"); a.fill("dialog[open] [data-conclusao]", "11:00")
    a.click("dialog[open] [data-resposta=sim]"); a.wait_for_timeout(1500)
    ok("Horário não conferido" not in texto(a) and "Tempo no cliente" in texto(a), "administrador corrige: serviço conferido, com tempo no cliente")
    ir(a, "/desempenho")
    a.locator("[data-acao=aba][data-aba=ano]").click() if a.locator("[data-acao=aba][data-aba=ano]").count() else None
    a.wait_for_timeout(700)
    a.locator("[data-acao=tecnico]").first.click(); a.wait_for_timeout(600)
    corpo = texto(a)
    print("   (detalhe do técnico:", corpo.replace("\n", " | ")[:300], ")")
    ok(not [e for e in erros_a if "favicon" not in e], f"administrador sem erros no console: {erros_a[:3]}")
    a.context.close()

print("\nFALHAS:", len(falhas))
for f in falhas:
    print(" -", f)
raise SystemExit(1 if falhas else 0)
