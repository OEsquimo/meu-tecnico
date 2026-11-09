"""
PACOTE 10 (modo demonstração): cartão da visita com a hora sob o status, aviso neutro do técnico,
textos do cancelado/reagendado e ponto vermelho nos dias lotados do seletor.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote10.py
"""
from playwright.sync_api import sync_playwright
from _quando import escolher_quando, SELETOR, _abrir_no_mes
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
    def dialogo(t): pag.locator("dialog [data-escolha]", has_text=t).first.click(); pag.wait_for_timeout(400)
    def novo_agendamento(cliente):
        ir("/agenda"); ir("/agendar")
        pag.locator("[data-acao=escolher-cliente]", has_text=cliente).click(); pag.wait_for_timeout(600)
    def caixa(sel):
        return pag.locator(sel).first.bounding_box()
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

    # ---- Aviso neutro do técnico: antes de escolher dia e hora ----
    novo_agendamento("Ana Lima")
    pag.click("[data-acao=adicionar-aparelho]"); pag.wait_for_timeout(300); dialogo("Janela")
    pag.locator("[data-acao=adicionar-servico]").first.click(); pag.wait_for_timeout(300); dialogo("Limpeza")
    ok(pag.locator(".aviso-neutro").count() == 1 and "Escolha o dia e o horário" in pag.inner_text(".aviso-neutro"), "sem dia e hora: aviso neutro no cartão do serviço")
    ok("Nenhum técnico está livre" not in texto(), "sem dia e hora: não diz que não há técnico livre")
    ok(pag.locator(".agenda-servico input[type=checkbox]").count() == 0, "sem dia e hora: ainda não há lista de técnicos")
    escolher_quando(pag, "2031-06-10", "09:00")
    ok(pag.locator(".aviso-neutro").count() == 0 and pag.locator(".agenda-servico input[type=checkbox]").count() >= 1, "escolhido o dia e a hora: some o aviso e aparecem os técnicos livres")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    ok("/servico/" in pag.url, "agendou para 10/06/2031")

    # ---- Cartão da visita: hora sob o status, nome em cima, endereço com a largura toda ----
    def abrir_dia_na_agenda(iso):
        ir("/agenda")
        alvo = iso[:7]
        for _ in range(240):
            if pag.locator(f"[data-dia='{iso}']").count() > 0: break
            pag.click("[data-acao=mes-seguinte]"); pag.wait_for_timeout(80)
        pag.click(f"[data-dia='{iso}']"); pag.wait_for_timeout(500)
    abrir_dia_na_agenda("2031-06-10")
    cartao = pag.locator(".servico-cartao").first
    ok(cartao.count() == 1 and cartao.locator(".visita-cartao__lado .selo").count() == 1 and cartao.locator(".visita-cartao__lado .servico-cartao__hora").count() == 1, "cartão tem o status e a hora na coluna da direita")
    selo, hora, nome, card = caixa(".visita-cartao__lado .selo"), caixa(".visita-cartao__lado .servico-cartao__hora"), caixa(".visita-cartao__nome"), caixa(".servico-cartao")
    ok(hora["y"] >= selo["y"] + selo["height"] - 1, "a hora fica abaixo do status")
    ok(abs((hora["x"] + hora["width"]) - (selo["x"] + selo["width"])) <= 2, "hora e status alinhados à direita")
    ok(nome["x"] < hora["x"] and nome["y"] <= selo["y"] + 2, "o nome fica em cima, à esquerda")
    ok("09:00" in pag.inner_text(".servico-cartao .servico-cartao__hora"), "a hora aparece no cartão")
    if pag.locator(".visita-cartao__local").count() > 0:
        loc = caixa(".visita-cartao__local")
        ok(loc["width"] >= card["width"] - 40 and loc["y"] >= nome["y"] + nome["height"] - 1, "o endereço usa a largura toda, abaixo do nome")
    ok(sem_rolagem(), "agenda sem rolagem lateral")
    pag.set_viewport_size({"width": 320, "height": 700}); pag.wait_for_timeout(300)
    ok(sem_rolagem(), "agenda sem rolagem lateral em tela de 320px")
    pag.set_viewport_size({"width": 390, "height": 844})
    ir("/")
    ok(pag.locator(".servico-cartao .visita-cartao__lado").count() >= 1 or pag.locator(".servico-cartao").count() == 0, "Início usa o mesmo cartão")
    ok(sem_rolagem(), "início sem rolagem lateral")

    # ---- Dia lotado: ponto vermelho, tocável, com mensagem ----
    ir("/expediente")
    pag.fill("input[name=seg-de]", "09:00"); pag.fill("input[name=seg-ate]", "10:00")
    pag.click("#form-expediente [type=submit]"); pag.wait_for_timeout(1200)
    def dia_lotado(iso):
        novo_agendamento("Maria Souza")
        _abrir_no_mes(pag, iso)
        lotado = "calendario__dia--lotado" in (pag.locator(f"{SELETOR} [data-iso='{iso}']").get_attribute("class") or "")
        pag.click(f"{SELETOR} [data-acao=seletor-fechar]"); pag.wait_for_selector(SELETOR, state="detached")
        return lotado
    lotou = False
    for _ in range(8):
        if dia_lotado("2031-06-09"):
            lotou = True; break
        novo_agendamento("Maria Souza")
        escolher_quando(pag, "2031-06-09", "09:00")
        pag.click("#botao-salvar"); pag.wait_for_timeout(1200)
    ok(lotou, "depois de agendar todos os técnicos às 09:00, a segunda 09/06/2031 fica lotada")
    novo_agendamento("Maria Souza")
    _abrir_no_mes(pag, "2031-06-09")
    dia = pag.locator(f"{SELETOR} [data-iso='2031-06-09']")
    ok(dia.is_enabled() and dia.locator(".calendario__ponto").count() == 1, "dia lotado é tocável e tem o ponto")
    cor = dia.locator(".calendario__ponto").evaluate("e => getComputedStyle(e).backgroundColor")
    ok(cor == "rgb(201, 59, 59)", f"o ponto do dia lotado é vermelho ({cor})")
    ok(pag.locator(f"{SELETOR} .calendario__ponto").count() == 1, "só o dia lotado tem ponto (os com vaga ficam sem ponto)")
    ok(pag.locator(f"{SELETOR} [data-iso='2031-06-10']").is_enabled() and pag.locator(f"{SELETOR} [data-iso='2031-06-10'] .calendario__ponto").count() == 0, "dia com vaga: ligado e sem ponto")
    dom = pag.locator(f"{SELETOR} [data-iso='2031-06-08']")
    ok(dom.is_disabled() and dom.locator(".calendario__ponto").count() == 0, "domingo (fechado): apagado e sem ponto")
    dia.click(); pag.wait_for_timeout(300)
    ok("Nenhum horário livre neste dia." in pag.inner_text(f"{SELETOR} [data-secao=horarios]"), "tocar no dia lotado mostra 'Nenhum horário livre neste dia.'")
    ok(pag.locator(f"{SELETOR} [data-acao=seletor-hora]").count() == 0 and pag.locator(f"{SELETOR} [data-acao=seletor-confirmar]").is_disabled(), "dia lotado não oferece horário e Confirmar fica desligado")
    pag.click(f"{SELETOR} [data-acao=seletor-mes][data-passo='1']"); pag.wait_for_timeout(500)
    ok(pag.locator(f"{SELETOR} .calendario__ponto").count() == 0, "mês seguinte sem lotados: nenhum ponto")
    pag.click(f"{SELETOR} [data-acao=seletor-fechar]"); pag.wait_for_selector(SELETOR, state="detached")

    # ---- Cancelado: aviso "está cancelado" e mensagem "Agendamento reagendado" ----
    ir("/expediente")
    pag.fill("input[name=seg-de]", "07:00"); pag.fill("input[name=seg-ate]", "18:00")
    pag.click("#form-expediente [type=submit]"); pag.wait_for_timeout(1200)
    novo_agendamento("Maria Souza")
    escolher_quando(pag, "2031-06-11", "10:00")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    url_visita = pag.url
    pag.click("[data-acao=cancelar]"); pag.wait_for_timeout(400)
    pag.click("dialog [data-resposta=sim]"); pag.wait_for_timeout(1200)
    ir(url_visita.split("#")[1])
    pag.locator("a:has-text('Editar')").first.click(); pag.wait_for_timeout(1200)
    t = texto()
    ok("está cancelado" in t and "volta para" not in t and "estava cancelado" not in t, "o aviso diz que o agendamento está cancelado, sem prometer o status")
    pag.click("#botao-salvar")
    pag.wait_for_selector(".aviso-rapido", timeout=4000)
    ok("Agendamento reagendado" in pag.inner_text(".aviso-rapido"), f"depois de salvar: 'Agendamento reagendado' ({pag.inner_text('.aviso-rapido')!r})")
    pag.wait_for_timeout(1200)
    ok("Reagendado" in texto(), "o agendamento aparece como Reagendado")
    # edição comum continua dizendo "atualizado"
    pag.locator("a:has-text('Editar')").first.click(); pag.wait_for_timeout(1200)
    ok("está cancelado" not in texto(), "agendamento já reagendado não mostra o aviso de cancelado")
    pag.click("#botao-salvar")
    try:
        pag.wait_for_selector(".aviso-rapido:has-text('Agendamento atualizado')", timeout=4000); achou = True
    except Exception:
        achou = False
    ok(achou, f"edição comum continua com 'Agendamento atualizado' ({pag.locator('.aviso-rapido').all_inner_texts()})")
    ok(not erros, f"sem erros no console ({erros[:2]})")
    nav.close()
print("FALHAS:" if falhas else "TUDO OK", falhas if falhas else "")
raise SystemExit(1 if falhas else 0)
