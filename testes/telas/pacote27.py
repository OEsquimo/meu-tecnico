"""
PACOTE 27 (modo demonstração): iniciar serviço, barra "Em serviço", avisos "Você já começou?" e "Serviço esperando
concluir", horários na conclusão (com validação), Desempenho, Esperando conclusão e Corrigir horários.
O relógio do navegador é ajustado para hoje em horários fixos (o serviço do técnico no demo é hoje às 14:00, 1 h).
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote27.py
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


def recarregar_tela(pag):
    ir(pag, "/agenda"); ir(pag, "/")


with sync_playwright() as p:
    nav = p.chromium.launch()

    # ---------------- Técnico: perto do horário -> Iniciar ----------------
    t, erros_t = entrar(nav, "tecnico@meutecnico.app", (13, 30))
    ok(t.locator("[data-acao=iniciar-agora]").count() == 1, "30 min antes: o cartão do serviço tem 'Iniciar serviço'")
    ok(t.locator("[data-aviso]").count() == 0, "antes do horário não há aviso")
    ok(t.locator("#barra-servico:not([hidden])").count() == 0, "sem serviço iniciado não há barra 'Em serviço'")
    t.click("[data-acao=iniciar-agora]"); t.wait_for_timeout(1200)
    ok("Em andamento desde 13:30" in texto(t), "depois de iniciar, o cartão mostra 'Em andamento desde 13:30'")
    ok(t.locator("[data-acao=iniciar-agora]").count() == 0, "o botão Iniciar some")
    t.wait_for_selector("#barra-servico:not([hidden])", timeout=5000)
    barra = t.inner_text("#barra-servico")
    ok("Em serviço" in barra and "Maria" in barra and "Concluir" in barra, f"a barra fixa mostra cliente e Concluir: {barra!r}")
    ir(t, "/agenda")
    ok(t.locator("#barra-servico:not([hidden])").count() == 1, "a barra continua em outras telas do técnico")
    ir(t, "/conta")
    ok(t.locator("#barra-servico:not([hidden])").count() == 1, "e na tela Conta")

    # passou do previsto (14:00 + 60 min + 10 min): Serviço esperando concluir (nunca os dois avisos)
    t.clock.set_system_time(hoje(15, 20)); recarregar_tela(t)
    corpo = texto(t)
    ok("Serviço esperando concluir" in corpo and "Você já começou?" not in corpo, "15:20 com início registrado: só 'Serviço esperando concluir'")
    ok(t.locator("[data-acao=ja-terminei]").count() == 1 and t.locator("[data-acao=ainda-no-servico]").count() == 1, "com os botões 'Já terminei' e 'Ainda estou no serviço'")
    t.click("[data-acao=ainda-no-servico]"); t.wait_for_selector("dialog[open]")
    t.click("dialog[open] [data-resposta=sim]"); t.wait_for_timeout(300)
    ok(t.locator("dialog[open] [data-erro-motivo]:not([hidden])").count() == 1, "sem motivo, a janela não deixa avisar")
    t.locator("dialog[open] label.chip", has_text="Falta de peça").click()
    t.locator("dialog[open] label.chip", has_text="30 min").click()
    t.click("dialog[open] [data-resposta=sim]"); t.wait_for_timeout(1300)
    ok("Serviço esperando concluir" not in texto(t) and "Em andamento" in texto(t), "depois de avisar, volta para 'Em andamento' (vale o prazo informado)")
    t.clock.set_system_time(hoje(16, 5)); recarregar_tela(t)
    ok("Serviço esperando concluir" in texto(t), "passado o prazo informado, o aviso volta")
    t.click("[data-acao=ja-terminei]"); t.wait_for_selector("[data-bloco=horarios]")
    ini = t.input_value("input[name=horaInicio]"); fim = t.input_value("input[name=horaConclusao]")
    ok(ini == "13:30", f"início = o registrado ao iniciar (13:30): {ini}")
    ok(fim == "14:30", f"passou do prazo: conclusão sugerida = início + duração prevista (14:30): {fim}")
    t.fill("input[name=horaConclusao]", "13:00"); t.click("#form-concluir [type=submit]"); t.wait_for_timeout(500)
    ok("A conclusão não pode ser antes do início." in texto(t) and "/concluir/" in t.url, "conclusão antes do início bloqueia, com mensagem")
    t.fill("input[name=horaConclusao]", "17:30"); t.click("#form-concluir [type=submit]"); t.wait_for_timeout(500)
    ok("Esse horário ainda não chegou." in texto(t) and "/concluir/" in t.url, "horário no futuro bloqueia")
    t.fill("input[name=horaInicio]", ""); t.click("#form-concluir [type=submit]"); t.wait_for_timeout(500)
    ok("Informe a hora de início." in texto(t), "início vazio bloqueia")
    t.fill("input[name=horaInicio]", "13:30"); t.fill("input[name=horaConclusao]", "13:33")
    t.click("#form-concluir [type=submit]"); t.wait_for_selector("dialog[open]")
    ok("3 min" in t.inner_text("dialog[open]"), "serviço muito curto pede confirmação")
    t.locator("dialog[open] button", has_text="Corrigir").click(); t.wait_for_timeout(300)
    t.fill("input[name=horaConclusao]", "14:40")
    t.click("#form-concluir [type=submit]"); t.wait_for_timeout(1500)
    ok("/concluir/" not in t.url, "com horários válidos o serviço é concluído")
    ok(t.locator("#barra-servico:not([hidden])").count() == 0, "concluído: a barra 'Em serviço' some")
    ok(not [e for e in erros_t if "favicon" not in e], f"técnico sem erros no console: {erros_t[:3]}")
    t.context.close()

    # ---------------- Técnico: "Você já começou?" ----------------
    t, erros_t2 = entrar(nav, "tecnico@meutecnico.app", (14, 25))
    corpo = texto(t)
    ok("Você já começou?" in corpo and "Serviço esperando concluir" not in corpo, "14:25 sem iniciar: só 'Você já começou?'")
    ok(all(t.locator(f"[data-acao={a}]").count() == 1 for a in ("iniciar-agora", "comecei-as", "ainda-nao-cheguei")), "com as 3 opções")
    t.click("[data-acao=ainda-nao-cheguei]"); t.wait_for_timeout(800)
    ok("Você já começou?" not in texto(t) and t.locator("dialog[open]").count() == 0, "'Ainda não cheguei' é um toque só: some, sem pedir motivo")
    t.clock.set_system_time(hoje(14, 50)); recarregar_tela(t)
    ok("Você já começou?" in texto(t), "20 min depois a pergunta volta")
    t.click("[data-acao=comecei-as]"); t.wait_for_selector("dialog[open] [data-hora]")
    t.fill("dialog[open] [data-hora]", "23:00"); t.click("dialog[open] [data-resposta=sim]"); t.wait_for_timeout(300)
    ok("ainda não chegou" in t.inner_text("dialog[open]"), "'Comecei às' no futuro não é aceito")
    t.fill("dialog[open] [data-hora]", "14:05"); t.click("dialog[open] [data-resposta=sim]"); t.wait_for_timeout(1300)
    ok("Em andamento desde 14:05" in texto(t), "'Comecei às 14:05' registra o início informado")
    t.context.close()

    # ---------------- Administrador ----------------
    a, erros_a = entrar(nav, "demo@meutecnico.app", (17, 30))
    ir(a, "/financeiro")
    ok(a.locator("[data-aviso=esperando-conclusao]").count() == 1, "Financeiro avisa serviços esperando conclusão")
    ok("Não entram nos totais abaixo" in texto(a), "o aviso diz que não entram nos totais")
    a.click("[data-aviso=esperando-conclusao] a"); a.wait_for_timeout(1200)
    ok("/esperando-conclusao" in a.url and "Maria" in texto(a), "'Ver serviços' lista as visitas esperando conclusão")
    ok(a.locator("[data-esperando] a:has-text('Concluir')").count() >= 1 and "Início não registrado" in texto(a), "cada visita tem Concluir e mostra início não registrado")

    ir(a, "/administrativa")
    ok("Desempenho" in texto(a), "Administrativa tem a linha Desempenho")
    ir(a, "/desempenho")
    ok(a.locator("[data-resumo=equipe]").count() == 1 and "Tempo médio" in texto(a), "Desempenho mostra o resumo da equipe")
    ok("As médias usam só serviços com início e conclusão informados" in texto(a), "e a nota sobre as médias")
    a.locator("[data-acao=tecnico]").first.click(); a.wait_for_timeout(600)
    ok(a.locator("[data-resumo=por-tipo]").count() == 1 and "Deslocamento médio" in texto(a), "tocar num técnico mostra por tipo de serviço e deslocamento")
    a.click("[data-acao=voltar-lista]"); a.wait_for_timeout(300)
    ok(a.locator("[data-resumo=equipe]").count() == 1, "dá para voltar para a lista da equipe")

    ir(a, "/servico/s-c1")
    a.click("[data-acao=editar-menu]"); a.wait_for_selector("dialog[open]")
    ok("Horários" in a.inner_text("dialog[open]"), "serviço concluído tem 'Horários' no menu Editar (Pacote 39)")
    a.click("dialog[open] [data-escolha=horarios]"); a.wait_for_selector("dialog[open]")
    a.fill("dialog[open] [data-inicio]", "11:00"); a.fill("dialog[open] [data-conclusao]", "10:00")
    a.click("dialog[open] [data-resposta=sim]"); a.wait_for_timeout(300)
    ok("A conclusão não pode ser antes do início." in a.inner_text("dialog[open]"), "corrigir: conclusão antes do início é bloqueada")
    a.fill("dialog[open] [data-inicio]", "10:00"); a.fill("dialog[open] [data-conclusao]", "11:10")
    a.locator("dialog[open] label.chip", has_text="Trânsito").click()
    a.click("dialog[open] [data-resposta=sim]"); a.wait_for_timeout(1500)
    a.locator("summary").first.click(); a.wait_for_timeout(300)  # Pacote 32: horários ficam em "Ver detalhes"
    corpo = texto(a)
    ok("10:00" in corpo and "1h 10" in corpo, "o serviço mostra início e tempo no cliente (1h 10)")
    ok("Trânsito" in corpo, "e o motivo do atraso")
    ok(not [e for e in erros_a if "favicon" not in e], f"administrador sem erros no console: {erros_a[:3]}")
    a.context.close()

print("\nFALHAS:", len(falhas))
for f in falhas:
    print(" -", f)
raise SystemExit(1 if falhas else 0)
