"""
PACOTE 28 (modo demonstração): a conclusão não pergunta mais o prazo de retorno (vale o padrão do tipo) e, sem serviço
hoje, "Meus serviços" do técnico mostra o PRÓXIMO serviço (qualquer dia futuro), com a data em cima e sem Iniciar/Concluir.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote28.py
"""
import re
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


def ir(pag, h):
    pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(900)


def texto(pag):
    return pag.inner_text("#conteudo")


with sync_playwright() as p:
    nav = p.chromium.launch()
    pag = nav.new_page(viewport={"width": 390, "height": 844})
    pag.add_init_script(path='testes/telas/sem-aviso.js')
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))
    pag.clock.install(time=hoje(13, 30)); pag.clock.resume()
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "tecnico@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1200)

    corpo = texto(pag)
    ok("Maria" in corpo and "Próximo serviço" not in corpo, "com serviço hoje, a tela fica como antes (sem 'Próximo serviço')")

    # concluir: sem a pergunta do retorno
    pag.click("a:has-text('Concluir')"); pag.wait_for_selector("#form-concluir")
    corpo = texto(pag)
    ok("Avisar para voltar" not in corpo, "a tela de concluir não pergunta mais daqui a quanto tempo voltar")
    ok(pag.locator("input[name=retornoMeses]").count() == 0, "e não tem os botões de meses")
    pag.clock.set_system_time(hoje(15, 0))
    pag.fill("input[name=horaInicio]", "14:00"); pag.fill("input[name=horaConclusao]", "14:50")
    pag.click("#form-concluir [type=submit]"); pag.wait_for_timeout(1500)
    ok("/concluir/" not in pag.url, "conclui normalmente, sem escolher o prazo")
    ir(pag, "/servico/s-hoje-1")
    ok(re.search(r"Retorno em \d+ meses", texto(pag)) is not None, "o serviço guarda o prazo de retorno do tipo ('Retorno em N meses')")

    # sem serviço hoje: aparece o próximo, com a data em cima
    ir(pag, "/")
    corpo = texto(pag)
    ok("Próximo serviço" in corpo and "Nada para hoje" not in corpo, "sem serviço hoje, mostra 'Próximo serviço' no lugar de 'Nada para hoje'")
    data = pag.locator("[data-proximo-data]").inner_text() if pag.locator("[data-proximo-data]").count() else ""
    ok(re.match(r"^[A-ZÁÉÍÓÚÂÊÔÃ][^,]+, \d{1,2} de \w+$", data) is not None, f"a data aparece em cima ({data!r})")
    ok("João" in corpo and "09:00" in corpo, "é o serviço de amanhã às 09:00 (João)")
    ok(pag.locator("[data-acao=iniciar-agora]").count() == 0, "sem botão Iniciar")
    ok(pag.locator("#conteudo a:has-text('Concluir')").count() == 0, "sem botão Concluir")
    ok(pag.locator("[data-acao=navegar]").count() == 1, "mantém 'Ir até o cliente'")
    ok(pag.locator("[data-visita-link]").count() == 1, "tocar no cartão abre o serviço")
    ok(not [e for e in erros if "favicon" not in e], f"sem erros no console: {erros[:3]}")
    pag.close()

print("\nFALHAS:", len(falhas))
for f in falhas:
    print(" -", f)
raise SystemExit(1 if falhas else 0)
