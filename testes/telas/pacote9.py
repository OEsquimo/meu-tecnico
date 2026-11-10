"""
PACOTE 9 (modo demonstração): horário de funcionamento (expediente) e seletor de dia, hora e técnicos.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote9.py
"""
from playwright.sync_api import sync_playwright
from _quando import escolher_quando, tecnicos_no_horario, SELETOR
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
    def ir(h): pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(900)
    def texto(): return pag.inner_text("#conteudo")
    def sem_rolagem(): return pag.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

    # ---- Área administrativa: horário de funcionamento ----
    ir("/administrativa")
    ok(pag.locator("a[href='#/expediente']").count() == 1, "Administrativa tem 'Horário de funcionamento'")
    ir("/expediente")
    ok(pag.locator("[data-dia]").count() == 7, "tela mostra os 7 dias")
    ok(pag.locator("input[name=seg-aberto]").is_checked() and not pag.locator("input[name=dom-aberto]").is_checked(), "padrão: segunda aberta, domingo fechado")
    ok(pag.input_value("input[name=seg-de]") == "07:00" and pag.input_value("input[name=seg-ate]") == "18:00", "padrão: 07:00 às 18:00")
    ok(sem_rolagem(), "tela sem rolagem lateral")
    pag.fill("input[name=seg-de]", "18:00"); pag.fill("input[name=seg-ate]", "09:00")
    pag.click("#form-expediente [type=submit]"); pag.wait_for_timeout(600)
    ok("#/expediente" in pag.url and pag.locator("[data-campo=seg-ate] .campo__erro").count() == 1, "fechar antes de abrir mostra erro no campo")
    pag.fill("input[name=seg-de]", "09:00"); pag.fill("input[name=seg-ate]", "12:00")
    pag.locator("input[name=dom-aberto]").set_checked(True, force=True)
    pag.click("#form-expediente [type=submit]"); pag.wait_for_timeout(1200)
    ok("#/administrativa" in pag.url, "salvou o horário e voltou para a Administrativa")
    ir("/expediente")
    ok(pag.input_value("input[name=seg-de]") == "09:00" and pag.locator("input[name=dom-aberto]").is_checked(), "o horário salvo volta ao abrir de novo")

    # ---- Seletor: estrutura e regras ----
    ir("/agenda"); ir("/agendar")
    pag.locator("[data-acao=escolher-cliente]", has_text="Ana Lima").click(); pag.wait_for_timeout(600)
    ok(pag.locator("input[name=data]").count() == 0 and pag.locator("input[name=hora]").count() == 0, "Agendar não tem mais os campos soltos de dia e hora")
    ok(pag.locator("#area-tecnico").count() == 0 and pag.locator("input[name=tecnicoUids]").count() == 0, "Agendar não tem mais a escolha de técnicos da visita")
    ok("Escolher dia e horário" in pag.inner_text("#botao-quando"), "campo 'Quando' começa vazio")
    pag.click("[data-acao=abrir-seletor]"); pag.wait_for_selector(f"{SELETOR}[open]"); pag.wait_for_timeout(500)
    ok(pag.locator(f"{SELETOR} [data-acao=seletor-mes][data-passo='-1']").is_disabled(), "não dá para ir para mês que já passou")
    ok(pag.locator(f"{SELETOR} [data-acao=seletor-confirmar]").is_disabled(), "Confirmar começa desligado")
    ok(pag.locator(f"{SELETOR} [data-secao=horarios]").count() == 0, "sem dia escolhido não há horários")
    ok(pag.locator(f"{SELETOR} .calendario__dia--sem-vaga[disabled]").count() >= 1, "dias sem vaga ficam desligados (passados, por exemplo)")
    ok(pag.evaluate("(() => { const d = document.querySelector('dialog.seletor'); const r = d.getBoundingClientRect(); return r.width >= innerWidth - 2 && r.height >= innerHeight - 2; })()"), "o seletor ocupa a tela toda")
    ok(sem_rolagem(), "sem rolagem lateral com o seletor aberto")
    pag.click(f"{SELETOR} [data-acao=seletor-fechar]"); pag.wait_for_selector(SELETOR, state="detached")
    ok("Escolher dia e horário" in pag.inner_text("#botao-quando"), "fechar sem confirmar não muda nada")

    # Mês e dia: segunda 14/04/2031 (09:00–12:00 pelo horário salvo) e domingo 13/04 (aberto, ajustado acima)
    pag.click("[data-acao=abrir-seletor]"); pag.wait_for_selector(f"{SELETOR}[open]")
    for _ in range(240):
        if pag.locator(f"{SELETOR} .seletor__mes").get_attribute("data-ano-mes") == "2031-04": break
        pag.click(f"{SELETOR} [data-acao=seletor-mes][data-passo='1']"); pag.wait_for_timeout(60)
    pag.wait_for_selector(f"{SELETOR} [data-iso='2031-04-14']:not([disabled])")
    ok(pag.locator(f"{SELETOR} [data-iso='2031-04-13']").is_enabled(), "domingo aberto no horário de funcionamento tem vaga")
    pag.click(f"{SELETOR} [data-acao=seletor-dia][data-iso='2031-04-14']")
    horas = pag.locator(f"{SELETOR} [data-acao=seletor-hora]").all_inner_texts()
    ok(horas[0] == "09:00" and horas[-1] == "11:30", f"segunda só oferece 09:00 a 11:30 (horário salvo: abre 09:00 e fecha 12:00; o último início é 30 min antes de fechar): {horas[:1]}..{horas[-1:]}")
    ok(pag.locator(f"{SELETOR} [data-secao=tecnicos]").count() == 0 and pag.locator(f"{SELETOR} [data-acao=seletor-confirmar]").is_disabled(), "sem horário escolhido não há técnicos e Confirmar fica desligado")
    pag.click(f"{SELETOR} [data-acao=seletor-hora][data-hora='10:00']")
    ok(pag.locator(f"{SELETOR} [data-secao=tecnicos]").count() == 1 and pag.locator(f"{SELETOR} input[name=seletor-tec]").count() >= 2, "escolhido o horário, aparece a lista de técnicos livres")
    ok(pag.locator(f"{SELETOR} input[name=seletor-tec]:checked").count() == 1, "o primeiro técnico livre já vem marcado")
    ok(not pag.locator(f"{SELETOR} [data-acao=seletor-confirmar]").is_disabled(), "Confirmar liga")
    pag.locator(f"{SELETOR} input[name=seletor-tec]:checked").uncheck()
    ok(pag.locator(f"{SELETOR} [data-acao=seletor-confirmar]").is_disabled(), "sem nenhum técnico marcado, Confirmar desliga")
    pag.locator(f"{SELETOR} .tecnico-opcao", has_text="Rafael").locator("input").check()
    # trocar de mês limpa o dia (os horários vêm dos agendamentos do mês que está na tela)
    pag.click(f"{SELETOR} [data-acao=seletor-mes][data-passo='1']"); pag.wait_for_timeout(500)
    ok(pag.locator(f"{SELETOR} [data-secao=horarios]").count() == 0, "trocar de mês limpa o dia escolhido")
    pag.click(f"{SELETOR} [data-acao=seletor-mes][data-passo='-1']"); pag.wait_for_timeout(500)
    pag.click(f"{SELETOR} [data-acao=seletor-dia][data-iso='2031-04-14']")
    pag.click(f"{SELETOR} [data-acao=seletor-hora][data-hora='10:00']")
    pag.locator(f"{SELETOR} input[name=seletor-tec]:checked").evaluate_all("l => l.forEach(c => c.click())")
    pag.locator(f"{SELETOR} .tecnico-opcao", has_text="Rafael").locator("input").check()
    pag.click(f"{SELETOR} [data-acao=seletor-confirmar]"); pag.wait_for_selector(SELETOR, state="detached"); pag.wait_for_timeout(500)
    q = pag.inner_text("#botao-quando")
    ok("14/04/2031" in q and "10:00" in q and "Rafael" in q, f"campo 'Quando' mostra dia, hora e técnico ({q!r})")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    ok("/servico/" in pag.url and "Rafael" in texto(), "agendou com o técnico escolhido no seletor")
    url_visita = pag.url

    # ---- Editar: o seletor abre com o horário atual e continua válido ----
    pag.locator("a:has-text('Editar')").first.click(); pag.wait_for_timeout(1200)
    ok("14/04/2031" in pag.inner_text("#botao-quando") and "10:00" in pag.inner_text("#botao-quando"), "editar mostra o dia e a hora atuais")
    pag.click("[data-acao=abrir-seletor]"); pag.wait_for_selector(f"{SELETOR}[open]"); pag.wait_for_timeout(700)
    ok(pag.locator(f"{SELETOR} [data-acao=seletor-hora][data-hora='10:00'][aria-pressed=true]").count() == 1, "o horário atual vem marcado (o próprio agendamento não conta como ocupado)")
    ok(pag.locator(f"{SELETOR} input[name=seletor-tec]:checked").count() == 1, "o técnico atual vem marcado")
    pag.click(f"{SELETOR} [data-acao=seletor-confirmar]"); pag.wait_for_selector(SELETOR, state="detached")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    ok("/servico/" in pag.url and "editar" not in pag.url, "salvou a edição sem mudar nada")
    url_visita = pag.url  # editar um agendamento só com 'Serviço a definir' regrava a linha (id novo)

    # ---- Reagendar cancelado: mesmo dia e hora é permitido ----
    pag.click("[data-acao=cancelar]"); pag.wait_for_timeout(400)
    pag.click("dialog [data-resposta=sim]"); pag.wait_for_timeout(1200)
    ir(url_visita.split("#")[1])
    pag.locator("a:has-text('Editar')").first.click(); pag.wait_for_timeout(1200)
    ok("está cancelado" in texto() and "14/04/2031" in pag.inner_text("#botao-quando"), "reagendar abre com o dia e a hora de antes")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    ok("/servico/" in pag.url and "Reagendado" in texto() and "10:00" in texto(), "salvou no mesmo dia e hora: ficou 'Reagendado'")
    url_visita = pag.url

    # ---- Reagendar com o técnico ocupado: bloqueia e nada muda ----
    pag.click("[data-acao=cancelar]"); pag.wait_for_timeout(400)
    pag.click("dialog [data-resposta=sim]"); pag.wait_for_timeout(1200)
    ir("/agenda"); ir("/agendar")
    pag.locator("[data-acao=escolher-cliente]", has_text="Maria Souza").click(); pag.wait_for_timeout(600)
    escolher_quando(pag, "2031-04-14", "10:00", tecnico="Rafael")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    ok("/servico/" in pag.url, "outro agendamento ocupou o horário do Rafael")
    ir(url_visita.split("#")[1])
    pag.locator("a:has-text('Editar')").first.click(); pag.wait_for_timeout(1200)
    q2 = pag.inner_text("#botao-quando")
    ok("Rafael" not in q2 and "14/04/2031" in q2 and "10:00" in q2, f"Rafael ocupado sai do campo 'Quando'; outro técnico livre assume ({q2!r})")
    pag.click("[data-acao=abrir-seletor]"); pag.wait_for_selector(f"{SELETOR}[open]"); pag.wait_for_timeout(700)
    ok(pag.locator(f"{SELETOR} .tecnico-opcao", has_text="Rafael").count() == 0, "no seletor, o técnico ocupado não aparece entre os livres")
    pag.click(f"{SELETOR} [data-acao=seletor-fechar]"); pag.wait_for_selector(SELETOR, state="detached")
    ok(not erros, f"sem erros no console ({erros[:2]})")
    nav.close()
print("FALHAS:" if falhas else "TUDO OK", falhas if falhas else "")
raise SystemExit(1 if falhas else 0)
