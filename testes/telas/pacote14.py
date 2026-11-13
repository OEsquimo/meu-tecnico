"""
PACOTE 14 (modo demonstração): cliente duplicado, agendamento duplicado, técnico livre ao informar serviço depois
e avanço automático entre campos.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote14.py
"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173/?demo=1"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


with sync_playwright() as p:
    nav = p.chromium.launch()
    pag = nav.new_page(viewport={"width": 390, "height": 844})
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))

    def ir(h):
        pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1000)

    def texto():
        return pag.inner_text("#conteudo")

    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

    def preencher_endereco(rua, numero, cidade):
        pag.locator("input[name=modo1][value=manual]").check(force=True)
        pag.fill("input[name=end1_rua]", rua); pag.fill("input[name=end1_numero]", numero); pag.fill("input[name=end1_cidade]", cidade)

    # ---------------- Avanço automático ----------------
    ir("/cliente/novo")
    pag.click("input[name=nome]"); pag.keyboard.type("Pessoa Teste")
    pag.keyboard.press("Enter"); pag.wait_for_timeout(200)
    ok(pag.evaluate("document.activeElement.name") == "whatsapp", "Enter no nome preenchido vai para o WhatsApp (sem enviar)")
    ok(pag.locator(".campo--erro, [data-erro]").count() == 0 or "obrigat" not in texto().lower(), "Enter no nome não mostrou erros")
    pag.keyboard.type("1199988777"); pag.wait_for_timeout(200)
    ok(pag.evaluate("document.activeElement.name") == "whatsapp", "com 10 dígitos o foco continua no WhatsApp")
    pag.keyboard.type("7"); pag.wait_for_timeout(200)
    ok(pag.evaluate("document.activeElement.name") != "whatsapp", "com os 11 dígitos o foco segue sozinho para o próximo campo")
    ok(pag.input_value("input[name=whatsapp]") == "(11) 99988-7777", "o número digitado continua intacto")
    pag.fill("input[name=whatsapp]", ""); pag.click("input[name=whatsapp]"); pag.keyboard.press("Enter"); pag.wait_for_timeout(500)
    ok("Informe" in pag.inner_text("body") or "inválid" in pag.inner_text("body").lower() or "telefone" in pag.inner_text("body").lower(), "Enter com WhatsApp vazio não avança: envia e mostra o que falta")
    ok(pag.evaluate("document.activeElement.tagName") != "SELECT", "o foco não cai em lista de escolha")

    # ---------------- Cliente duplicado ----------------
    ir("/cliente/novo")
    pag.fill("input[name=nome]", "Maria Outra"); pag.fill("input[name=whatsapp]", "11912345678")
    preencher_endereco("Rua Diferente", "9", "Santos")
    pag.click("#form-cliente [type=submit]"); pag.wait_for_timeout(700)
    dialogo = pag.inner_text("dialog[open]") if pag.locator("dialog[open]").count() else ""
    ok("Já existe um cliente cadastrado com essas informações" in dialogo and "Maria Souza" in dialogo, "mesmo WhatsApp: aviso com o nome do cliente existente")
    ok("Consultar o cadastro existente" in dialogo and "Cadastrar mesmo assim" in dialogo, "aviso oferece consultar ou cadastrar mesmo assim")
    pag.locator("dialog[open] [data-escolha=abrir]").click(); pag.wait_for_timeout(1000)
    ok("#/cliente/c-maria" in pag.url, "'Consultar o cadastro existente' abre o cliente existente")

    ir("/cliente/novo")
    pag.fill("input[name=nome]", "Maria Outra"); pag.fill("input[name=whatsapp]", "11912345678")
    preencher_endereco("Rua Diferente", "9", "Santos")
    pag.click("#form-cliente [type=submit]"); pag.wait_for_timeout(700)
    pag.locator("dialog[open] [data-escolha=mesmo]").click(); pag.wait_for_timeout(1200)
    ok("#/cliente/" in pag.url and "c-maria" not in pag.url and "novo" not in pag.url, "'Cadastrar mesmo assim' cadastra o cliente novo (nada é bloqueado nem juntado)")

    ir("/cliente/novo")
    pag.fill("input[name=nome]", "Outra Pessoa"); pag.fill("input[name=whatsapp]", "11955554444")
    preencher_endereco("R. das Flores", "120", "são paulo")
    pag.click("#form-cliente [type=submit]"); pag.wait_for_timeout(700)
    dialogo = pag.inner_text("dialog[open]") if pag.locator("dialog[open]").count() else ""
    ok("mesmo endereço" in dialogo.lower() or "esse endereço" in dialogo, "mesmo endereço (abreviação e sem acento): aviso mostra que o endereço coincide")
    pag.locator("dialog[open] [data-escolha='']").click(); pag.wait_for_timeout(500)
    ok("#/cliente/novo" in pag.url and pag.input_value("input[name=nome]") == "Outra Pessoa", "'Voltar e conferir' mantém o formulário preenchido")

    ir("/cliente/novo")
    pag.fill("input[name=nome]", "Cliente Inédito"); pag.fill("input[name=whatsapp]", "11977776666")
    preencher_endereco("Rua Inédita", "77", "Niterói")
    pag.click("#form-cliente [type=submit]"); pag.wait_for_timeout(1200)
    ok(pag.locator("dialog[open]").count() == 0 and "#/cliente/" in pag.url and "novo" not in pag.url, "cliente sem coincidência é cadastrado direto, sem aviso")

    # ---------------- Agendamento duplicado e técnico livre (serviço) ----------------
    r = pag.evaluate("""async () => {
      const o = location.origin + '/js/';
      const S = await import(o + 'servicos/servicos.js');
      const C = await import(o + 'servicos/clientes.js');
      const A = await import(o + 'servicos/aparelhos.js');
      const { sessao } = await import(o + 'nucleo/sessao.js');
      const { CONTAS_DEMO } = await import(o + 'nucleo/demonstracao.js');
      const empresaId = sessao.vinculo.empresaId;
      const cliente = (await C.listarClientes(empresaId)).find((c) => c.id === 'c-ana');
      const aparelho = (await A.listarAparelhosDoCliente(empresaId, 'c-ana')).find((a) => a.id === 'a-ana-2');
      const aparelho3 = (await A.listarAparelhosDoCliente(empresaId, 'c-ana')).find((a) => a.id === 'a-ana-3');
      const tipo = sessao.tipos.find((t) => t.nome === 'Limpeza');
      const outroTipo = sessao.tipos.find((t) => t.nome === 'Carga de gás');
      const rafael = { uid: CONTAS_DEMO.tecnico.uid, nome: 'Rafael Costa' };
      const admin = { uid: empresaId, nome: 'Marcos Frio' };
      const base = { empresaId, cliente, endereco: cliente.enderecos[0], data: '2031-10-14', hora: '09:00', regras: null };
      const saida = {};
      const tenta = async (nome, f) => { try { await f(); saida[nome] = 'ok'; } catch (e) { saida[nome] = e.codigo || e.code || e.message; } };
      await tenta('primeiro', () => S.salvarAgendamento({ ...base, tecnicos: [rafael], linhas: [{ aparelho, tipo, tecnicos: [rafael] }] }));
      await tenta('repetido', () => S.salvarAgendamento({ ...base, tecnicos: [admin], linhas: [{ aparelho, tipo, tecnicos: [admin] }] }));
      await tenta('outroServico', () => S.salvarAgendamento({ ...base, tecnicos: [admin], linhas: [{ aparelho, tipo: outroTipo, tecnicos: [admin] }] }));
      await tenta('outroHorario', () => S.salvarAgendamento({ ...base, hora: '15:00', tecnicos: [admin], linhas: [{ aparelho, tipo, tecnicos: [admin] }] }));
      // Técnico livre ao informar depois: visita sem serviço com o Rafael às 11:00 e outro atendimento dele às 12:00.
      const base2 = { ...base, data: '2031-10-15', hora: '11:00' };
      await tenta('semServico', () => S.salvarAgendamento({ ...base2, tecnicos: [rafael], linhas: [] }));
      const maria = (await C.listarClientes(empresaId)).find((c) => c.id === 'c-maria');
      await tenta('vizinho', () => S.salvarAgendamento({ ...base2, hora: '12:00', cliente: maria, endereco: null, tecnicos: [rafael], linhas: [] }));
      const linhas = (await S.listarAgendados({ empresaId, de: new Date(2031, 9, 15), ate: new Date(2031, 9, 16) })).filter((l) => l.clienteId === 'c-ana');
      const tipoLongo = { ...tipo, duracaoMin: 180 };
      await tenta('informarOcupado', () => S.informarServicoNaVisita({ empresaId, linhasDaVisita: linhas, aparelho: aparelho3, tipo: tipoLongo }));
      const tipoCurto = { ...tipo, duracaoMin: 30 };
      await tenta('informarCabe', () => S.informarServicoNaVisita({ empresaId, linhasDaVisita: linhas, aparelho: aparelho3, tipo: tipoCurto }));
      return saida;
    }""")
    ok(r["primeiro"] == "ok", f"agendamento novo é gravado ({r['primeiro']})")
    ok(r["repetido"] == "aparelho-ocupado", f"aparelho com agendamento aberto não ganha outro ({r['repetido']})")
    ok(r["outroServico"] == "aparelho-ocupado", f"outro serviço no mesmo aparelho também é barrado ({r['outroServico']})")
    ok(r["outroHorario"] == "aparelho-ocupado", f"outro horário no mesmo aparelho também é barrado ({r['outroHorario']})")
    ok(r["informarOcupado"] == "tecnico-ocupado", f"informar serviço longo com o técnico ocupado depois é barrado ({r['informarOcupado']})")
    ok(r["informarCabe"] == "ok", f"informar serviço curto que cabe é permitido ({r['informarCabe']})")

    ok(not erros, f"sem erros no console ({erros[:2]})")
    nav.close()
print("FALHAS:" if falhas else "TUDO OK", falhas if falhas else "")
raise SystemExit(1 if falhas else 0)
