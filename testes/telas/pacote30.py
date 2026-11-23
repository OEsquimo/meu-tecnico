"""
PACOTE 30 (modo demonstração): selo "Em andamento" / "Tempo excedido" (contando do início real) e link curto do mapa (#/m/código).
O serviço do técnico no demo é hoje às 14:00 (1 h). O relógio do navegador é ajustado.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote30.py
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


def entrar(nav, email, hora, base=BASE):
    pag = nav.new_page(viewport={"width": 390, "height": 844})
    pag.add_init_script(path='testes/telas/sem-aviso.js')
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))
    pag.clock.install(time=hoje(*hora))
    pag.clock.resume()
    pag.goto(base + "#/entrar"); pag.wait_for_selector("#form-entrar")
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

    # ---------------- Técnico: Atrasado -> Em andamento -> Tempo excedido ----------------
    t, erros_t = entrar(nav, "tecnico@meutecnico.app", (14, 20))
    ok("Atrasado" in texto(t) and "Em andamento" not in texto(t), "14:20 sem iniciar: selo 'Atrasado'")
    t.click("[data-acao=iniciar-agora]") if t.locator("[data-acao=iniciar-agora]").count() else None
    if t.locator("dialog[open] [data-hora]").count() == 0 and "Em andamento" not in texto(t):
        t.click("[data-acao=comecei-as]"); t.wait_for_selector("dialog[open] [data-hora]")
        t.fill("dialog[open] [data-hora]", "14:20"); t.click("dialog[open] [data-resposta=sim]")
    t.wait_for_timeout(1300)
    corpo = texto(t)
    ok("Em andamento desde 14:20" in corpo, "depois de iniciar às 14:20 o selo é 'Em andamento desde 14:20'")
    ok("Atrasado" not in corpo, "e não aparece mais 'Atrasado'")
    t.clock.set_system_time(hoje(15, 25)); recarregar_tela(t)
    ok("Em andamento desde 14:20" in texto(t), "15:25 (fim previsto 15:20 + 10 min de tolerância): ainda em andamento")
    t.clock.set_system_time(hoje(15, 35)); recarregar_tela(t)
    corpo = texto(t)
    ok("Tempo excedido" in corpo and "Em andamento" not in corpo, "15:35: o selo vira 'Tempo excedido' (contado do início real, não das 14:00)")
    ok(t.locator(".selo--laranja").count() >= 1, "e é laranja")
    ok("Serviço esperando concluir" in corpo, "o aviso 'Serviço esperando concluir' aparece junto")
    ir(t, "/servico/s-hoje-1")
    ok("Tempo excedido" in texto(t), "a página do serviço mostra o mesmo selo")
    ok(not [e for e in erros_t if "favicon" not in e], f"técnico sem erros no console: {erros_t[:3]}")
    t.context.close()

    # ---------------- Administrador: Atrasado -> Em andamento ----------------
    a, erros_a = entrar(nav, "demo@meutecnico.app", (14, 30))
    ir(a, "/servico/s-hoje-1")
    ok("Atrasado" in texto(a), "administrador: serviço de 14:00 sem iniciar aparece 'Atrasado'")
    a.click("[data-acao=iniciar-visita]"); a.wait_for_timeout(1300)
    corpo = texto(a)
    ok("Em andamento" in corpo and "Atrasado" not in corpo, "depois de Iniciar o selo é 'Em andamento'")
    ir(a, "/agenda")
    ok(a.locator(".selo--verde:has-text('Em andamento')").count() >= 1, "a Agenda também mostra 'Em andamento'")
    ok(not [e for e in erros_a if "favicon" not in e], f"administrador sem erros no console: {erros_a[:3]}")
    a.context.close()

    # ---------------- Link curto do mapa ----------------
    a, erros_m = entrar(nav, "demo@meutecnico.app", (10, 0), base=BASE + "&curtos=1")
    link = a.evaluate("""async () => {
      const m = await import('/js/servicos/links-curtos.js');
      const s = await import('/js/nucleo/sessao.js');
      return m.linkDoMapaParaEnviar('http://localhost:5173/', { empresaId: s.empresaId(), endereco: 'Rua 52, 236 · PARQUE CAPIBARIBE · SAO LOURENCO DA MATA/PE' });
    }""")
    ok("/#/m/" in link and len(link) < 60, f"o link do mapa é curto ({link!r}, {len(link)} caracteres)")
    pedidos = []
    a.route("**/www.google.com/**", lambda r: (pedidos.append(r.request.url), r.abort()))
    ir(a, "/m/" + link.split("/#/m/")[1])
    a.wait_for_timeout(800)
    ok(any("google.com/maps/dir" in u and "destination=Rua%2052" in u for u in pedidos), f"abrir o link curto vai para o Google Maps no endereço ({pedidos[:1]})")
    a.unroute("**/www.google.com/**")
    a.goto(BASE + "&curtos=1#/m/0000000000"); a.wait_for_timeout(1200)
    corpo = texto(a)
    ok("Link do mapa vencido" in corpo and "Ir até o cliente" in corpo, "link que não existe/venceu: avisa e orienta usar 'Ir até o cliente'")
    ok(not [e for e in erros_m if "favicon" not in e and "google" not in e.lower()], f"sem erros no console: {erros_m[:3]}")
    a.context.close()

print("\nFALHAS:", len(falhas))
for f in falhas:
    print(" -", f)
raise SystemExit(1 if falhas else 0)
