"""
PACOTE 22 (modo demonstração): cartões de agendamento e de concluído só com o RESUMO; tocar abre a página do agendamento.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote22.py
"""
import re
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173/?demo=1"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


def entrar(nav, email):
    pag = nav.new_page(viewport={"width": 390, "height": 844})
    erros = []
    pag.on("pageerror", lambda e: erros.append(str(e)))
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", email); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)
    return pag, erros


def visivel(pag, seletor):
    return pag.locator(seletor).first.is_visible()


with sync_playwright() as p:
    nav = p.chromium.launch()

    # ---------------- Administrador ----------------
    pag, erros = entrar(nav, "demo@meutecnico.app")

    def ir(h):
        pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1200)

    # Agenda: só o resumo
    ir("/agenda")
    cartoes = pag.locator(".servico-cartao")
    ok(cartoes.count() >= 1, "a agenda lista agendamentos em cartões")
    c = cartoes.first
    resumo = c.locator("a.visita-cartao__corpo").inner_text()
    ok("Maria Souza" in resumo and ("Atrasado" in resumo or "Agendado" in resumo) and "14:00" in resumo and "Rua das Flores" in resumo,
       "o resumo mostra cliente, status, hora e endereço")
    ok("Limpeza" in c.locator("[data-resumo=servicos]").inner_text(), "o resumo mostra o serviço")
    ok("Rafael Costa" in c.locator("[data-resumo=tecnicos]").inner_text(), "o resumo mostra o técnico")
    ok(c.locator("[data-acao=cancelar-visita]").count() == 0 and c.locator("[data-acao=excluir-visita]").count() == 0 and c.locator("a:has-text('Editar')").count() == 0,
       "o cartão do administrador não tem botões: eles ficam na página do agendamento")
    # Tocar abre a página do agendamento, com tudo
    c.locator("a.visita-cartao__corpo").click(); pag.wait_for_timeout(1200)
    ok("/servico/" in pag.url, "tocar no resumo abre a página do agendamento")
    t = pag.inner_text("#conteudo")
    ok("Maria Souza" in t and "Limpeza" in t and "Split" in t, "a página mostra cliente, serviço e aparelho")
    ok(pag.locator("a:has-text('Concluir serviço')").count() >= 1 and pag.locator("[data-acao=cancelar-servico]").count() == 1
       and pag.locator("[data-acao=excluir-servico]").count() == 1 and pag.locator("a:has-text('Editar')").count() >= 1
       and pag.locator("[data-acao=navegar]").count() == 1, "a página tem Concluir, Editar, Cancelar, Excluir e Ir até o cliente")

    # Concluídos: um cartão por agendamento, com dia, cliente, status, técnico e serviços
    ir("/historico")
    cs = pag.locator(".servico-cartao")
    ok(cs.count() >= 6, "Concluídos mostra um cartão por agendamento")
    primeiro = cs.nth(0).inner_text()
    ok("João Pereira" in primeiro and "Concluído" in primeiro and re.search(r"\d{2}/\d{2}/\d{4}", primeiro) and "Marcos Frio" in primeiro,
       "resumo do concluído: dia, cliente, status e técnico")
    ok(cs.nth(0).locator("[data-resumo=servicos]").inner_text().strip() != "", "o resumo do concluído mostra o(s) serviço(s)")
    ok("R$" not in primeiro, "o resumo do concluído não mostra valores")
    pag.fill("#busca", "carlos"); pag.wait_for_timeout(700)
    ok(pag.locator(".servico-cartao").count() == 1 and "Carlos Menezes" in pag.inner_text("#resultado"), "a busca por cliente continua funcionando")
    pag.locator(".servico-cartao a.visita-cartao__corpo").first.click(); pag.wait_for_timeout(1200)
    ok("/servico/" in pag.url and "Carlos Menezes" in pag.inner_text("#conteudo"), "tocar no concluído abre a página do agendamento")

    # Menu Serviços: também um cartão por agendamento, com o(s) serviço(s)
    ir("/servicos")
    ok(pag.locator("#itens .servico-cartao").count() >= 1 and pag.locator("#itens a.item-lista").count() == 0, "Serviços lista um cartão por agendamento")
    ok(pag.locator("#itens .servico-cartao [data-resumo=servicos]").count() >= 1, "Serviços mostra o(s) serviço(s) no resumo")
    pag.locator("#itens .servico-cartao a.visita-cartao__corpo").first.click(); pag.wait_for_timeout(1000)
    ok("/servico/" in pag.url, "em Serviços, tocar abre a página do agendamento")

    # Ficha do cliente
    ir("/clientes")
    pag.locator(".item-lista:has-text('Maria Souza')").first.click(); pag.wait_for_timeout(1200)
    fc = pag.locator(".servico-cartao")
    ok(fc.count() >= 1, "a ficha do cliente mostra os agendamentos em cartões")
    ok(fc.first.locator("[data-resumo=servicos]").count() == 1, "na ficha o resumo também mostra o serviço")
    fc.first.locator("a.visita-cartao__corpo").click(); pag.wait_for_timeout(1200)
    ok("/servico/" in pag.url, "na ficha, tocar abre a página do agendamento")

    ok(not erros, f"sem erros de JavaScript ({erros[:2]})")
    pag.close()

    # ---------------- Técnico em campo ----------------
    pag, erros = entrar(nav, "tecnico@meutecnico.app")
    pag.evaluate("location.hash='#/agenda'"); pag.wait_for_timeout(1200)
    cs = pag.locator(".servico-cartao")
    if cs.count() == 0:
        pag.evaluate("location.hash='#/inicio'"); pag.wait_for_timeout(1200)
        cs = pag.locator(".servico-cartao")
    ok(cs.count() >= 1, "o técnico vê o cartão do agendamento")
    c = cs.first
    ok("Técnico" in c.inner_text() and c.locator("[data-resumo=servicos]").count() == 1, "o cartão do técnico mostra serviço e técnico")
    ok(c.locator(".acoes-cartao").first.is_visible() and c.locator("[data-acao=navegar]").first.is_visible(), "técnico vê 'Ir até o cliente' no cartão")
    ok(c.locator("a:has-text('Concluir'), a:has-text('Informar serviço'), button:has-text('Concluir')").first.is_visible(), "técnico vê 'Concluir' no cartão")
    ok(c.locator("[data-acao=cancelar-visita]").count() == 0 and c.locator("[data-acao=excluir-visita]").count() == 0, "técnico não tem Cancelar/Excluir")
    ok(not erros, f"técnico sem erros de JavaScript ({erros[:2]})")
    pag.close()
    nav.close()

print("\nFALHAS:", len(falhas))
raise SystemExit(1 if falhas else 0)
