"""
PACOTE 11 (modo demonstração): pausa de almoço e limite de horas por técnico por dia.
Tela "Horário de funcionamento" (almoço + limite), seletor sem horários de almoço, dia vermelho no limite.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote11.py
"""
from playwright.sync_api import sync_playwright
from _quando import escolher_quando, _abrir_dia, SELETOR
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
    def ir(h): pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1000)
    def texto(): return pag.inner_text("#conteudo")
    def horas_do_dia(data):
        _abrir_dia(pag, data)
        horas = pag.locator(f"{SELETOR} [data-acao=seletor-hora]").evaluate_all("els => els.map(e => e.dataset.hora)")
        pag.click(f"{SELETOR} [data-acao=seletor-fechar]"); pag.wait_for_timeout(400)
        return horas
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

    # ---- tela de configuração ----
    ir("/expediente")
    ok(pag.locator("input[name=almoco-ativo]").is_checked(), "almoço vem ligado por padrão")
    ok(pag.input_value("input[name=almoco-de]") == "12:00" and pag.input_value("input[name=almoco-ate]") == "13:00", "almoço padrão 12:00–13:00")
    ok(pag.input_value("input[name=limiteHoras]") == "8", "limite padrão 8 horas")
    pag.fill("input[name=limiteHoras]", "30"); pag.click("#form-expediente [type=submit]"); pag.wait_for_timeout(500)
    ok("0 a 24" in texto() or "0 a 24" in pag.inner_text("body"), "limite fora de 0 a 24 mostra erro")
    pag.fill("input[name=limiteHoras]", "8"); pag.fill("input[name=almoco-ate]", "11:00"); pag.click("#form-expediente [type=submit]"); pag.wait_for_timeout(500)
    ok("terminar depois de começar" in pag.inner_text("body"), "almoço que termina antes de começar mostra erro")
    pag.fill("input[name=almoco-ate]", "13:00"); pag.click("#form-expediente [type=submit]"); pag.wait_for_timeout(1500)
    ok("#/administrativa" in pag.url, "salva e volta para a Administrativa")

    # ---- seletor sem horários de almoço (serviço de 60 min) ----
    ir("/agenda"); ir("/agendar")
    pag.locator("[data-acao=escolher-cliente]", has_text="Ana Lima").click(); pag.wait_for_timeout(600)
    horas = horas_do_dia("2031-09-10")
    ok("11:00" in horas and "11:30" not in horas and "12:00" not in horas and "12:30" not in horas and "13:00" in horas, f"serviço de 60 min: 11:00 (acaba 12:00) pode; 11:30, 12:00 e 12:30 não ({horas[7:13]})")
    # ---- desligar o almoço volta a oferecer ----
    ir("/expediente")
    pag.locator("input[name=almoco-ativo]").uncheck(force=True); pag.click("#form-expediente [type=submit]"); pag.wait_for_timeout(1500)
    ir("/agenda"); ir("/agendar")
    pag.locator("[data-acao=escolher-cliente]", has_text="Ana Lima").click(); pag.wait_for_timeout(600)
    horas = horas_do_dia("2031-09-10")
    ok("12:00" in horas and "12:30" in horas, "com o almoço desligado, 12:00 e 12:30 voltam")
    ir("/expediente")
    ok(not pag.locator("input[name=almoco-ativo]").is_checked(), "a escolha ficou salva")
    ok(not erros, f"sem erros no console ({erros[:2]})")
    nav.close()
print("FALHAS:" if falhas else "TUDO OK", falhas if falhas else "")
raise SystemExit(1 if falhas else 0)
