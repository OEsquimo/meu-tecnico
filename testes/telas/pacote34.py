"""
PACOTE 34 (modo demonstração): tela de concluir — valor do serviço só informativo + campo "Valor pago".
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote34.py
"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173/?demo=1"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


def entrar(nav, email):
    pag = nav.new_page(viewport={"width": 390, "height": 844})
    pag.add_init_script(path='testes/telas/sem-aviso.js')
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", email); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1200)
    return pag, erros


def ir(pag, h):
    pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1200)


def texto(pag):
    return pag.inner_text("#conteudo").replace("\xa0", " ")


def enviar(a):
    a.click("#form-concluir [type=submit]"); a.wait_for_timeout(1500)
    if a.locator("dialog", has_text="pendente").count():
        a.locator("dialog button", has_text="Decidir depois").click(); a.wait_for_timeout(800)


with sync_playwright() as p:
    nav = p.chromium.launch()
    a, erros = entrar(nav, "demo@meutecnico.app")

    ir(a, "/concluir/s-amanha")
    ok(a.locator("input[name=valor]").get_attribute("readonly") is not None, "valor do serviço é só informação (somente leitura)")  # Pacote 35: agora também escondido (texto)
    base = a.input_value("input[name=valor]")
    ok(base != "", f"valor do cadastro já vem preenchido ({base})")
    ok(a.locator("input[name=valorPago]").count() == 1 and a.input_value("input[name=valorPago]") == "", "campo Valor pago existe e vem em branco")
    ok(a.locator("input[name=pago]").count() == 0, "caixa 'O cliente já pagou?' não aparece para o administrador")
    ok("Valor a pagar: R$ 600,00" in texto(a), "em branco: 'Valor a pagar' mostra o total todo")

    # extra altera o total
    a.click("[data-acao=adicionar-extra]"); a.wait_for_timeout(200)
    a.fill("input[name=extraDescricao]", "Peça"); a.fill("input[name=extraValor]", "20,00"); a.wait_for_timeout(200)
    a.click("[data-acao=pagou-tudo]"); a.wait_for_timeout(200)
    pago_tudo = a.input_value("input[name=valorPago]")
    ok(pago_tudo != "" and "Valor a pagar" not in texto(a), f"'Pagou tudo' preenche o total ({pago_tudo}) e some o 'Valor a pagar'")

    # maior que o total: bloqueia
    a.fill("input[name=valorPago]", "99999"); a.click("#form-concluir [type=submit]"); a.wait_for_timeout(600)
    ok("#/concluir/" in a.url and "não pode ser maior" in texto(a), "valor pago acima do total é bloqueado com aviso")
    a.fill("input[name=valorPago]", "abc"); a.click("#form-concluir [type=submit]"); a.wait_for_timeout(600)
    ok("#/concluir/" in a.url and "valor válido" in texto(a), "valor pago inválido é bloqueado")

    # pago parcial: R$ 100,00 → mostra 'Valor a pagar'
    a.fill("input[name=valorPago]", "100"); a.wait_for_timeout(300)
    ok("Valor a pagar" in texto(a), "pagamento parcial mostra 'Valor a pagar' na hora")
    enviar(a)
    ir(a, "/servico/s-amanha")
    t = texto(a)
    ok("Concluído a receber" in t, "concluiu com saldo: 'Concluído a receber'")
    ok("Valor pago" in t and "R$ 100,00" in t and "Valor a pagar" in t, "cartão mostra Valor do serviço, Valor pago R$ 100,00 e Valor a pagar")

    # tipo sem preço: valor continua editável (serviço s-semana, administrador)
    ir(a, "/concluir/s-semana")
    ok(a.locator("input[name=valorPago]").count() == 1, "outro serviço: campo Valor pago presente")
    ok(a.locator("input[name=pago]").count() == 0, "sem caixa de pago para administrador")

    # técnico: continua com sim/não
    a.close()
    tec, e2 = entrar(nav, "tecnico@meutecnico.app")
    ir(tec, "/concluir/s-amanha")
    ok(tec.locator("input[name=valorPago]").count() == 0, "técnico não vê 'Valor pago'")
    erros += e2
    ok(not erros, f"sem erros de console ({erros[:2]})")
    nav.close()

print("FALHAS:", len(falhas))
raise SystemExit(1 if falhas else 0)
