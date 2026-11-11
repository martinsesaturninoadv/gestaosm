#!/usr/bin/env python3
"""
Testes automáticos da API v1, do webhook do WaSpeed, do OAuth e do conector MCP.

Instala o sistema numa pasta temporária, sobe o servidor embutido do PHP e testa tudo de ponta a ponta:
migração (prévia, aplicar, reverter), endpoints REST, erros, webhook, OAuth com PKCE e as 13 ferramentas MCP.

Uso:
    python3 sistema/testes/testar-api.py                 # SQLite (padrão)
    python3 sistema/testes/testar-api.py --mysql "host=localhost;banco=teste;usuario=u;senha=s"
Só usa a biblioteca padrão do Python. Precisa do php (8.0+) com pdo_sqlite (ou pdo_mysql), openssl e curl.
"""
import base64, hashlib, http.cookiejar, json, os, re, secrets, shutil, socket, subprocess, sys, tempfile, time, urllib.parse, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
SISTEMA = os.path.dirname(AQUI)
ARQUIVOS = ['index.html', 'api.php', 'api-v1.php', 'api-v1.yaml', 'nucleo.php', 'servico.php', 'portal.php', 'instalar.php']
falhas, total = [], 0


def ok(cond, msg):
    global total
    total += 1
    print(('  ✓ ' if cond else '  ✗ ') + msg)
    if not cond:
        falhas.append(msg)


class SemRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


class Cliente:
    def __init__(self, base):
        self.base = base
        self.cj = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cj), SemRedirect)

    def req(self, metodo, caminho, corpo=None, cab=None, form=None, bruto=None):
        cab = dict(cab or {})
        dados = None
        if form is not None:
            dados = urllib.parse.urlencode(form).encode()
            cab.setdefault('Content-Type', 'application/x-www-form-urlencoded')
        elif bruto is not None:
            dados = bruto
        elif corpo is not None:
            dados = json.dumps(corpo).encode()
            cab.setdefault('Content-Type', 'application/json')
        r = urllib.request.Request(self.base + caminho, data=dados, headers=cab, method=metodo)
        try:
            resp = self.op.open(r)
            st, h, b = resp.status, resp.headers, resp.read()
        except urllib.error.HTTPError as e:
            st, h, b = e.code, e.headers, e.read()
        try:
            j = json.loads(b) if b else None
        except ValueError:
            j = None
        return st, j, h, b.decode('utf-8', 'replace')

    def sistema(self, acao, corpo=None, q=''):
        st, j, _, _ = self.req('POST' if corpo is not None else 'GET', '/api.php?acao=' + acao + q, corpo, {'X-Requested-With': 'gestao'})
        return st, j


def porta_livre():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


def preparar(mysql):
    d = tempfile.mkdtemp(prefix='gestao-teste-')
    site = os.path.join(d, 'site')
    os.makedirs(site)
    for a in ARQUIVOS:
        if os.path.exists(os.path.join(SISTEMA, a)):
            shutil.copy(os.path.join(SISTEMA, a), site)
    shutil.copy(os.path.join(AQUI, 'roteador.php'), site)
    porta = porta_livre()
    log = open(os.path.join(d, 'php.log'), 'w')
    proc = subprocess.Popen(['php', '-S', '127.0.0.1:%d' % porta, '-t', site, os.path.join(site, 'roteador.php')], stdout=log, stderr=log)
    base = 'http://127.0.0.1:%d' % porta
    for _ in range(50):
        try:
            urllib.request.urlopen(base + '/index.html', timeout=1)
            break
        except Exception:
            time.sleep(0.1)
    form = {'nome': 'Joyce Teste', 'email': 'admin@teste.com', 'senha': 'senha12345', 'senha2': 'senha12345', 'tipo': 'auto'}
    if mysql:
        p = dict(x.split('=', 1) for x in mysql.split(';'))
        form.update({'tipo': 'mysql', 'host': p.get('host', 'localhost'), 'banco': p['banco'], 'usuario': p['usuario'], 'dbsenha': p['senha']})
    Cliente(base).req('POST', '/instalar.php', form=form)
    return d, proc, base


def pkce():
    v = secrets.token_urlsafe(48)
    c = base64.urlsafe_b64encode(hashlib.sha256(v.encode()).digest()).rstrip(b'=').decode()
    return v, c


def main():
    mysql = sys.argv[sys.argv.index('--mysql') + 1] if '--mysql' in sys.argv else None
    pasta, proc, base = preparar(mysql)
    print('Servidor de teste:', base, '| banco:', 'MySQL' if mysql else 'SQLite', '| pasta:', pasta)
    try:
        A = Cliente(base)
        st, j = A.sistema('login', {'email': 'admin@teste.com', 'senha': 'senha12345'})
        ok(st == 200 and j and j.get('ok'), 'login da administradora')
        A.sistema('conta', {'nome': 'Dra. Vitória', 'email': 'vitoria@teste.com', 'papel': 'advogado', 'senha': 'senha12345', 'ativo': True})

        print('\n== Antes da migração (o sistema continua igual) ==')
        A.sistema('salvar', {'upserts': [
            {'colecao': 'usuarios', 'id': 'u1', 'dados': {'id': 'u1', 'nome': 'Joyce Teste', 'email': 'admin@teste.com', 'papel': 'Administrador(a)'}},
            {'colecao': 'usuarios', 'id': 'u2', 'dados': {'id': 'u2', 'nome': 'Dra. Vitória', 'email': 'vitoria@teste.com', 'papel': 'Advogado(a)'}},
            {'colecao': 'leads', 'id': 'L1', 'dados': {'id': 'L1', 'nome': 'Ana Antiga', 'tel': '(11) 98888-0001', 'etapa': 'Novo contato', 'criado': '2026-10-01'}},
            {'colecao': 'leads', 'id': 'L2', 'dados': {'id': 'L2', 'nome': 'Bia Antiga', 'tel': '(11) 98888-0002', 'etapa': 'Em recuperação', 'criado': '2026-10-02'}},
            {'colecao': 'leads', 'id': 'L3', 'dados': {'id': 'L3', 'nome': 'Carla Fechou', 'tel': '11988880003', 'etapa': 'Fechado', 'criado': '2026-10-03'}},
            {'colecao': 'leads', 'id': 'L4', 'dados': {'id': 'L4', 'nome': 'Duplicada', 'tel': '+55 11 98888-0001', 'etapa': 'Perdido', 'criado': '2026-10-04'}},
            {'colecao': 'leads', 'id': 'L5', 'dados': {'id': 'L5', 'nome': 'Parceiro', 'tel': '21977770000', 'etapa': 'Encaminhado a parceiro', 'criado': '2026-10-05'}},
        ]})
        st, j, _, _ = A.req('GET', '/api/v1/leads')
        ok(st == 503, 'API desativada antes da migração (503)')
        st, j = A.sistema('integracaoApi', None, '&op=previa')
        pv = j['previa']
        ok(pv['total_leads'] == 5, 'prévia conta 5 leads')
        ok(pv['mapeamento'].get('Em recuperação → Negociação') == 1 and pv['mapeamento'].get('Fechado → Cliente fechado') == 1, 'prévia mostra o mapeamento das etapas')
        ok(len(pv['telefones_duplicados']) == 1, 'prévia aponta o telefone duplicado')

        print('\n== Migração ==')
        st, j = A.sistema('integracaoApi', {'op': 'aplicar'})
        ok(st == 200 and j.get('ok') and j['backup'], 'migração aplicada com backup: %s' % (j.get('backup') if j else st))
        st, j = A.sistema('dados', None, '&desde=0')
        regs = {r['id']: r['dados'] for r in j['registros'] if r['colecao'] == 'leads'}
        ok(regs['L1']['etapa'] == 'Novo lead' and regs['L2']['etapa'] == 'Negociação' and regs['L3']['etapa'] == 'Cliente fechado', 'etapas convertidas para o funil novo')
        ok(regs['L5']['etapa'] == 'Encaminhado a parceiro', '"Encaminhado a parceiro" mantida como etapa')
        ok(regs['L4']['motivoPerda'].startswith('Não informado'), 'perdidos antigos ganham motivo "não informado"')
        st, j = A.sistema('integracaoApi', {'op': 'aplicar'})
        ok(st == 409, 'aplicar de novo é recusado (409)')

        st, j = A.sistema('integracaoApi', {'op': 'criarChave', 'nome': 'Automação Claude', 'escopos': ['clientes:ler', 'clientes:gravar', 'leads:ler', 'leads:gravar', 'anuncios:ler', 'anuncios:gravar', 'relatorios:ler']})
        chave = j['chave']
        ok(chave.startswith('gsm_'), 'chave de API criada (aparece uma vez)')
        st, j = A.sistema('integracaoApi', {'op': 'criarChave', 'nome': 'Só leitura', 'escopos': ['leads:ler']})
        chave_ro = j['chave']
        H = {'Authorization': 'Bearer ' + chave}

        print('\n== Autenticação e erros ==')
        st, j, h, _ = A.req('GET', '/api/v1/leads')
        ok(st == 401, 'sem chave: 401')
        st, j, h, _ = A.req('GET', '/api/v1/leads', cab={'Authorization': 'Bearer gsm_errada'})
        ok(st == 401, 'chave inválida: 401')
        st, j, h, _ = A.req('POST', '/api/v1/leads', {'telefone': '11999990000'}, {'Authorization': 'Bearer ' + chave_ro})
        ok(st == 403, 'chave sem permissão de gravar: 403')
        st, j, h, _ = A.req('GET', '/api/v1/naoexiste', cab=H)
        ok(st == 404, 'rota inexistente: 404')
        st, j, h, _ = A.req('POST', '/api/v1/leads', bruto=b'{xx', cab=dict(H, **{'Content-Type': 'application/json'}))
        ok(st == 400, 'JSON inválido: 400')

        print('\n== Anúncios ==')
        st, j, _, _ = A.req('POST', '/api/v1/anuncios', {'codigo': 'BPC-01', 'campanha': 'BPC Idoso', 'conjunto': 'SP 60+', 'anuncio': 'Vídeo 1', 'area_do_direito': 'BPC/LOAS',
                                                         'data_inicio': '2026-11-01', 'investimento': '1.200,00'}, H)
        ok(st == 201 and j['anuncio']['investimento'] == 1200.0, 'POST /anuncios cria (valor "1.200,00" entendido)')
        st, j, _, _ = A.req('POST', '/api/v1/anuncios', {'codigo': 'bpc-01', 'conjunto': 'SP 65+'}, H)
        ok(st == 200 and j['criado'] is False and j['anuncio']['conjunto'] == 'SP 65+', 'mesmo código atualiza em vez de duplicar')
        st, j, _, _ = A.req('POST', '/api/v1/anuncios', {'codigo': 'X1'}, H)
        ok(st == 422, 'código de anúncio inválido: 422')
        A.req('POST', '/api/v1/anuncios', {'codigo': 'SM-02', 'campanha': 'Salário-maternidade', 'anuncio': 'Carrossel', 'area_do_direito': 'Salário-maternidade'}, H)
        st, j, _, _ = A.req('GET', '/api/v1/anuncios', cab=H)
        ok(st == 200 and len(j['itens']) == 2, 'GET /anuncios lista 2')

        print('\n== Leads ==')
        st, j, _, _ = A.req('POST', '/api/v1/leads', {'nome': 'Maria Souza', 'telefone': '(11) 97777-1111', 'primeira_mensagem': 'Olá! Vim pelo anúncio [BPC-01]',
                                                     'data_primeiro_contato': '2026-11-05', 'plataforma': 'Instagram', 'resumo_triagem': 'Mãe idosa, 67 anos', 'responsavel': 'Vitória'}, H)
        ok(st == 201 and j['criado'], 'POST /leads cria (201)')
        lead = j['lead']
        ok(lead['telefone'] == '+5511977771111', 'telefone normalizado em E.164')
        ok(lead['codigo_anuncio'] == 'BPC-01' and lead['campanha'] == 'BPC Idoso' and lead['conjunto'] == 'SP 65+', 'código lido da mensagem e campanha preenchida')
        ok(lead['responsavel_id'] == 'u2', 'responsável resolvido pelo nome')
        ok(lead['etapa'] == 'Novo lead', 'lead novo começa na primeira etapa')
        st, j, _, _ = A.req('POST', '/api/v1/leads', {'telefone': '+55 11 97777-1111', 'nome': 'Outro Nome', 'area_interesse': 'BPC/LOAS'}, H)
        ok(st == 200 and not j['criado'] and j['lead']['id'] == lead['id'] and j['lead']['nome'] == 'Maria Souza', 'mesmo telefone atualiza o lead (não duplica nem troca o nome)')
        st, j, _, _ = A.req('POST', '/api/v1/leads', {'telefone': '1197777222', 'nome': 'João sem 9', 'primeira_mensagem': 'oi, vi no insta'}, H)
        ok(j['lead']['telefone'] == '+5511997777222', 'celular antigo sem o 9 ganha o 9')
        ok(j['lead']['origem'] == 'Orgânico / não identificado', 'sem código: origem "Orgânico / não identificado"')
        st, j, _, _ = A.req('POST', '/api/v1/leads', {'telefone': '11966665555', 'primeira_mensagem': 'Vim pelo anúncio sm-2 e quero saber'}, H)
        ok(j['lead']['codigo_anuncio'] == 'SM-02', 'código sem colchetes e com número diferente (sm-2 → SM-02)')
        st, j, _, _ = A.req('POST', '/api/v1/leads', {'telefone': '11955554444', 'primeira_mensagem': '[ZZZ-99] olá'}, H)
        ok(j['lead']['codigo_anuncio'] == 'ZZZ-99' and any('não está cadastrado' in a for a in j['avisos']), 'código não cadastrado gera aviso')
        st, j, _, _ = A.req('POST', '/api/v1/leads', {'telefone': '123'}, H)
        ok(st == 422, 'telefone inválido: 422')
        st, j, _, _ = A.req('POST', '/api/v1/leads', {'telefone': '(11) 98888-0001', 'nome': 'Ana de novo'}, H)
        ok(j['lead']['id'] == 'L1', 'lead antigo da tela é achado pelo telefone (índice da migração)')

        st, j, _, _ = A.req('GET', '/api/v1/leads?telefone=11977771111', cab=H)
        ok(st == 200 and j['total'] == 1 and j['itens'][0]['id'] == lead['id'], 'GET /leads?telefone=')
        st, j, _, _ = A.req('GET', '/api/v1/leads?etapa=Novo%20lead&desde=2026-11-01', cab=H)
        ok(st == 200 and all(x['etapa'] == 'Novo lead' for x in j['itens']) and j['total'] >= 3, 'GET /leads?etapa=&desde=')
        st, j, _, _ = A.req('GET', '/api/v1/funil/etapas', cab=H)
        ok([e['nome'] for e in j['etapas']][:7] == ['Novo lead', 'Em triagem', 'Aguardando documentos', 'Proposta enviada', 'Negociação', 'Contrato enviado', 'Cliente fechado'], 'GET /funil/etapas na ordem')

        st, j, _, _ = A.req('PATCH', '/api/v1/leads/%s/etapa' % lead['id'], {'etapa': 'em triagem'}, H)
        ok(st == 200 and j['mudou'] and j['lead']['etapa'] == 'Em triagem', 'PATCH etapa (aceita maiúsculas/minúsculas)')
        st, j, _, _ = A.req('PATCH', '/api/v1/leads/%s/etapa' % lead['id'], {'etapa': 'Perdido'}, H)
        ok(st == 422 and j.get('campo') == 'motivo', 'Perdido sem motivo: 422')
        st, j, _, _ = A.req('PATCH', '/api/v1/leads/%s/etapa' % lead['id'], {'etapa': 'Etapa Inventada'}, H)
        ok(st == 422 and 'etapas' in j, 'etapa inexistente: 422 com a lista de etapas')
        st, j, _, _ = A.req('PATCH', '/api/v1/leads/%s/etapa' % lead['id'], {'etapa': 'Proposta enviada'}, H)
        ok(len(j['lead']['historico_etapas']) == 2 and j['lead']['historico_etapas'][-1]['de'] == 'Em triagem', 'histórico de etapas registrado')
        st, j, _, _ = A.req('PATCH', '/api/v1/leads/naoexiste/etapa', {'etapa': 'Em triagem'}, H)
        ok(st == 404, 'lead inexistente: 404')

        st, j, _, _ = A.req('POST', '/api/v1/leads/%s/interacoes' % lead['id'], {'data': '2026-11-06', 'canal': 'WhatsApp', 'resumo': 'Enviou CNIS e laudos',
                                                                                 'proximo_passo': 'Montar proposta', 'data_follow_up': '2026-11-10'}, H)
        ok(st == 201 and j['tarefa_follow_up_id'], 'POST interação cria tarefa de follow-up')
        st, j, _, _ = A.req('POST', '/api/v1/leads/%s/interacoes' % lead['id'], {'canal': 'WhatsApp'}, H)
        ok(st == 422, 'interação sem resumo: 422')

        print('\n== Clientes ==')
        st, j, _, _ = A.req('GET', '/api/v1/clientes', cab=H)
        ok(st == 422, 'busca de clientes sem filtro: 422')
        cliente = {'nome': 'José da Silva', 'nacionalidade': 'brasileiro', 'estado_civil': 'casado', 'profissao': 'pedreiro', 'rg': '12.345.678-9', 'orgao_emissor': 'SSP/SP',
                   'cpf': '529.982.247-25', 'data_nascimento': '15/03/1960', 'filiacao': 'Maria da Silva e João da Silva',
                   'endereco': {'cep': '01310100', 'logradouro': 'Av. Paulista', 'numero': '1000', 'bairro': 'Bela Vista', 'cidade': 'São Paulo', 'uf': 'sp'},
                   'email': 'jose@exemplo.com', 'telefone': '11 91234-5678', 'area_do_caso': 'BPC/LOAS', 'objeto': 'Concessão de BPC ao idoso',
                   'honorarios_valor': '3.000,00', 'honorarios_forma': 'Entrada de R$ 500 + 5x de R$ 500', 'honorarios_exito_percentual': 30, 'justica_gratuita': True}
        st, j, _, _ = A.req('POST', '/api/v1/clientes', cliente, H)
        ok(st == 201 and j['contrato_id'], 'POST /clientes cria cliente e contrato de honorários')
        cid = j['cliente']['id']
        c = j['cliente']
        ok(c['cpf'] == '529.982.247-25' and c['data_nascimento'] == '1960-03-15' and c['endereco']['cep'] == '01310-100' and c['endereco']['uf'] == 'SP', 'campos normalizados (CPF, data, CEP, UF)')
        ok(c['contratos'][0]['valor'] == 3000.0 and c['contratos'][0]['exito_percentual'] == 30.0, 'honorários gravados no contrato')
        st, j, _, _ = A.req('POST', '/api/v1/clientes', dict(cliente, cpf='52998224725'), H)
        ok(st == 409 and j['cliente_id'] == cid, 'CPF repetido: 409 com o id do cliente existente')
        st, j, _, _ = A.req('POST', '/api/v1/clientes', dict(cliente, cpf='111.111.111-11'), H)
        ok(st == 422 and j.get('campo') == 'cpf', 'CPF inválido: 422')
        st, j, _, _ = A.req('GET', '/api/v1/clientes?cpf=52998224725', cab=H)
        ok(j['total'] == 1, 'GET /clientes?cpf= (sem pontuação)')
        st, j, _, _ = A.req('GET', '/api/v1/clientes?nome=jose%20da', cab=H)
        ok(j['total'] == 1, 'GET /clientes?nome= (sem acento)')
        st, j, _, _ = A.req('GET', '/api/v1/clientes?telefone=%2B5511912345678', cab=H)
        ok(j['total'] == 1, 'GET /clientes?telefone=')
        st, j, _, _ = A.req('PATCH', '/api/v1/clientes/' + cid, {'profissao': 'aposentado', 'honorarios_valor': 3500}, H)
        ok(st == 200 and j['cliente']['profissao'] == 'aposentado' and j['cliente']['contratos'][0]['valor'] == 3500.0 and len(j['cliente']['contratos']) == 1, 'PATCH /clientes atualiza (e o mesmo contrato)')
        for tipo in ['procuracao', 'declaracao_hipossuficiencia', 'contrato_honorarios']:
            st, j, _, _ = A.req('POST', '/api/v1/clientes/%s/documentos' % cid, {'tipo': tipo, 'url': 'https://docs.google.com/document/d/%s/edit' % tipo, 'data': '2026-11-06'}, H)
        ok(st == 201, 'POST /clientes/{id}/documentos (3 documentos)')
        st, j, _, _ = A.req('POST', '/api/v1/clientes/%s/documentos' % cid, {'tipo': 'boleto', 'url': 'https://x'}, H)
        ok(st == 422, 'tipo de documento inválido: 422')
        st, j, _, _ = A.req('POST', '/api/v1/clientes/%s/documentos' % cid, {'tipo': 'outro', 'url': 'http://inseguro'}, H)
        ok(st == 422, 'URL sem https: 422')
        st, j, _, _ = A.req('GET', '/api/v1/clientes/' + cid, cab=H)
        ok(len(j['cliente']['documentos']) == 3, 'GET /clientes/{id} mostra os documentos')

        st, j, _, _ = A.req('POST', '/api/v1/leads/%s/converter' % lead['id'], {'cpf': '153.509.460-56', 'estado_civil': 'viúva'}, H)
        ok(st == 201 and j['cliente']['lead_id'] == lead['id'] and j['cliente']['telefone'] == '+5511977771111', 'POST /leads/{id}/converter cria o cliente ligado ao lead')
        st, j, _, _ = A.req('GET', '/api/v1/leads/' + lead['id'], cab=H)
        ok(j['lead']['convertido'] and j['lead']['etapa'] == 'Cliente fechado' and j['lead']['cliente_id'], 'lead convertido vai para "Cliente fechado"')
        st, j, _, _ = A.req('POST', '/api/v1/leads/%s/converter' % lead['id'], {}, H)
        ok(st == 409, 'converter de novo: 409')

        print('\n== Relatório por anúncio ==')
        st, j, _, _ = A.req('GET', '/api/v1/relatorios/anuncios?desde=2026-11-01', cab=H)
        bpc = [x for x in j['por_anuncio'] if x['codigo'] == 'BPC-01'][0]
        org = [x for x in j['por_anuncio'] if x['codigo'] == 'Orgânico / não identificado']
        ok(bpc['leads'] == 1 and bpc['fechados'] == 1 and bpc['taxa_conversao'] == 100.0 and bpc['custo_por_cliente'] == 1200.0, 'relatório: leads, fechados, taxa e custo por cliente do BPC-01')
        ok(org and org[0]['leads'] >= 1, 'relatório: linha "Orgânico / não identificado"')
        ok(any(c['campanha'] == 'BPC Idoso' for c in j['por_campanha']), 'relatório por campanha')

        print('\n== Webhook do WaSpeed ==')
        st, j, _, _ = A.req('POST', '/api/v1/webhooks/waspeed', {'phone': '11944443333'})
        ok(st == 401, 'webhook sem token: 401')
        st, j = A.sistema('integracaoApi', {'op': 'tokenWebhook'})
        tok = j['token']
        ok(tok.startswith('wsp_'), 'token do webhook gerado')
        A.sistema('salvar', {'upserts': [{'colecao': 'config', 'id': 'waspeed', 'dados': {'colunas': {'Atendendo': 'Em triagem', 'Pagou': 'Cliente fechado', 'Sem interesse': 'Perdido'}, 'caminhos': {}}}]})
        st, j, _, _ = A.req('POST', '/api/v1/webhooks/waspeed', {'event': 'message', 'data': {'contact': {'phone': '5511944443333@c.us', 'name': 'Paula WA'}, 'message': {'text': 'Oi! Vim pelo anúncio [SM-02]', 'fromMe': False}}},
                            {'X-Webhook-Token': tok})
        ok(st == 200 and j['resultados'][0]['status'] == 'ok', 'webhook (token no cabeçalho) cria o lead')
        wl = j['resultados'][0]['lead_id']
        st, j, _, _ = A.req('GET', '/api/v1/leads/' + wl, cab=H)
        ok(j['lead']['nome'] == 'Paula WA' and j['lead']['codigo_anuncio'] == 'SM-02' and j['lead']['campanha'] == 'Salário-maternidade', 'webhook leu nome e código do anúncio')
        st, j, _, _ = A.req('POST', '/api/v1/webhooks/waspeed?token=' + tok, {'type': 'kanban.moved', 'number': '11944443333', 'column': {'name': 'Atendendo'}, 'labels': [{'name': 'BPC'}, 'Quente']})
        ok(st == 200, 'webhook (token na URL) de mudança de coluna')
        st, j, _, _ = A.req('GET', '/api/v1/leads/' + wl, cab=H)
        ok(j['lead']['etapa'] == 'Em triagem' and 'Quente' in j['lead']['etiquetas'], 'coluna do WaSpeed espelhada na etapa e etiquetas gravadas')
        st, j, _, _ = A.req('POST', '/api/v1/webhooks/waspeed', {'number': '11944443333', 'column': 'Sem interesse'}, {'Authorization': 'Bearer ' + tok})
        st, j, _, _ = A.req('GET', '/api/v1/leads/' + wl, cab=H)
        ok(j['lead']['etapa'] == 'Perdido' and 'WaSpeed' in j['lead']['motivo_perda'], 'coluna de perda recebe motivo automático')
        st, j, _, _ = A.req('POST', '/api/v1/webhooks/waspeed', {'qualquer': 'coisa'}, {'X-Webhook-Token': tok})
        ok(st == 200 and j['resultados'][0]['status'] == 'ignorado', 'evento sem telefone é ignorado e fica no log')
        st, j = A.sistema('integracaoApi', None, '&op=webhookLog')
        ok(len(j['itens']) >= 4 and any(x['status'] == 'nao_autorizado' for x in j['itens']) and j['itens'][0]['payload'], 'log do webhook guarda o payload bruto')
        st, j = A.sistema('integracaoApi', {'op': 'testarWebhook', 'payload': '{"data":{"from":"5521988887777@s.whatsapp.net","pushName":"Teste","body":"[BPC-01]"}}'})
        ok(j['extraido']['telefone_e164'] == '+5521988887777' and j['extraido']['codigo_anuncio'] == 'BPC-01', 'teste de mapeamento sem gravar')

        print('\n== OAuth (conector do Claude) ==')
        st, j, _, _ = A.req('GET', '/.well-known/oauth-protected-resource')
        ok(st == 200 and j['resource'] == base + '/api/v1/mcp' and j['authorization_servers'] == [base], 'metadados do recurso protegido')
        st, j, _, _ = A.req('GET', '/.well-known/oauth-authorization-server')
        ok(j['issuer'] == base and 'S256' in j['code_challenge_methods_supported'] and j['registration_endpoint'], 'metadados do servidor de autorização')
        st, j, h, _ = A.req('POST', '/api/v1/mcp', {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {}})
        ok(st == 401 and 'resource_metadata=' in (h.get('WWW-Authenticate') or ''), 'MCP sem token: 401 com WWW-Authenticate')
        st, j, _, _ = A.req('POST', '/oauth/register', {'redirect_uris': ['https://site-malicioso.com/cb']})
        ok(st == 400, 'registro com endereço de retorno estranho é recusado')
        cb = 'https://claude.ai/api/mcp/auth_callback'
        st, j, _, _ = A.req('POST', '/oauth/register', {'client_name': 'Claude', 'redirect_uris': [cb], 'token_endpoint_auth_method': 'none'})
        ok(st == 201 and j['client_id'], 'registro automático do cliente (DCR)')
        client_id = j['client_id']
        verif, desafio = pkce()
        q = urllib.parse.urlencode({'response_type': 'code', 'client_id': client_id, 'redirect_uri': cb, 'code_challenge': desafio, 'code_challenge_method': 'S256',
                                    'state': 'xyz', 'scope': 'sistema', 'resource': base + '/api/v1/mcp'})
        N = Cliente(base)  # navegador novo, sem sessão
        st, _, _, html = N.req('GET', '/oauth/authorize?' + q)
        ok(st == 200 and 'administradora' in html, 'tela de login do OAuth')
        csrf = re.search(r'name="csrf" value="([^"]+)"', html).group(1)
        campos = dict(urllib.parse.parse_qsl(q), csrf=csrf)
        st, _, _, html = N.req('POST', '/oauth/authorize', form=dict(campos, acao='login', email='vitoria@teste.com', senha='senha12345'))
        ok('Só administradoras' in html, 'advogada (não administradora) não autoriza')
        st, _, _, html = N.req('POST', '/oauth/authorize', form=dict(campos, acao='login', email='admin@teste.com', senha='errada'))
        ok('incorretos' in html, 'senha errada recusada')
        st, _, _, html = N.req('POST', '/oauth/authorize', form=dict(campos, acao='login', email='admin@teste.com', senha='senha12345'))
        ok('Autorizar' in html, 'tela de consentimento')
        csrf = re.search(r'name="csrf" value="([^"]+)"', html).group(1)
        st, _, h, _ = N.req('POST', '/oauth/authorize', form=dict(campos, csrf=csrf, acao='autorizar'))
        loc = h.get('Location') or ''
        ok(st == 302 and loc.startswith(cb + '?'), 'autorizar redireciona para o Claude com o código')
        ps = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(loc).query))
        ok(ps.get('state') == 'xyz' and ps.get('iss') == base, 'state e iss devolvidos')
        st, j, _, _ = A.req('POST', '/oauth/token', form={'grant_type': 'authorization_code', 'code': ps['code'], 'redirect_uri': cb, 'client_id': client_id, 'code_verifier': 'errado' * 8})
        ok(st == 400 and j['error'] == 'invalid_grant', 'PKCE errado recusado')
        st, j, _, _ = A.req('POST', '/oauth/token', form={'grant_type': 'authorization_code', 'code': ps['code'], 'redirect_uri': cb, 'client_id': client_id, 'code_verifier': verif})
        ok(st == 400, 'código não pode ser reaproveitado depois de uma tentativa (uso único)')
        # novo código para o fluxo certo
        verif, desafio = pkce()
        campos.update(code_challenge=desafio)
        st, _, _, html = N.req('POST', '/oauth/authorize', form=dict(campos, acao='login', email='admin@teste.com', senha='senha12345'))
        csrf = re.search(r'name="csrf" value="([^"]+)"', html).group(1)
        st, _, h, _ = N.req('POST', '/oauth/authorize', form=dict(campos, csrf=csrf, acao='autorizar'))
        code = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(h.get('Location')).query))['code']
        st, j, _, _ = A.req('POST', '/oauth/token', form={'grant_type': 'authorization_code', 'code': code, 'redirect_uri': cb, 'client_id': client_id, 'code_verifier': verif})
        ok(st == 200 and j['access_token'].startswith('gat_') and j['refresh_token'] and j['expires_in'] == 3600, 'troca do código por token (PKCE S256)')
        acesso, renov = j['access_token'], j['refresh_token']
        st, j, _, _ = A.req('POST', '/oauth/token', form={'grant_type': 'refresh_token', 'refresh_token': renov, 'client_id': client_id})
        ok(st == 200 and j['access_token'] != acesso, 'renovação do token')
        acesso2, renov2 = j['access_token'], j['refresh_token']
        st, j, _, _ = A.req('POST', '/oauth/token', form={'grant_type': 'refresh_token', 'refresh_token': renov, 'client_id': client_id})
        ok(st == 400, 'renovação reaproveitada é recusada e derruba a sessão (rotação)')
        st, j, _, _ = A.req('POST', '/oauth/token', form={'grant_type': 'refresh_token', 'refresh_token': renov2, 'client_id': client_id})
        ok(st == 400, '... inclusive a renovação nova (proteção contra roubo de token)')
        # autoriza de novo para seguir com o MCP
        verif, desafio = pkce()
        campos.update(code_challenge=desafio)
        st, _, _, html = N.req('POST', '/oauth/authorize', form=dict(campos, acao='login', email='admin@teste.com', senha='senha12345'))
        csrf = re.search(r'name="csrf" value="([^"]+)"', html).group(1)
        st, _, h, _ = N.req('POST', '/oauth/authorize', form=dict(campos, csrf=csrf, acao='autorizar'))
        code = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(h.get('Location')).query))['code']
        st, j, _, _ = A.req('POST', '/oauth/token', form={'grant_type': 'authorization_code', 'code': code, 'redirect_uri': cb, 'client_id': client_id, 'code_verifier': verif})
        M = {'Authorization': 'Bearer ' + j['access_token']}

        print('\n== OAuth com identidade publicada do Claude (client_id é um endereço) ==')
        cimd = 'https://claude.ai/oauth/mcp-oauth-client-metadata'
        v2, d2 = pkce()
        q2 = {'response_type': 'code', 'client_id': cimd, 'redirect_uri': cb, 'code_challenge': d2, 'code_challenge_method': 'S256', 'state': 's2', 'resource': base + '/api/v1/mcp'}
        N2 = Cliente(base)
        st, _, _, html = N2.req('GET', '/oauth/authorize?' + urllib.parse.urlencode(q2))
        ok(st == 200 and 'administradora' in html, 'Claude identificado por endereço chega à tela de login (mesmo se o documento não puder ser lido)')
        csrf = re.search(r'name="csrf" value="([^"]+)"', html).group(1)
        st, _, _, html = N2.req('POST', '/oauth/authorize', form=dict(q2, csrf=csrf, acao='login', email='admin@teste.com', senha='senha12345'))
        csrf = re.search(r'name="csrf" value="([^"]+)"', html).group(1)
        st, _, h, _ = N2.req('POST', '/oauth/authorize', form=dict(q2, csrf=csrf, acao='autorizar'))
        code2 = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(h.get('Location') or '').query)).get('code', '')
        st, j2, _, _ = A.req('POST', '/oauth/token', form={'grant_type': 'authorization_code', 'code': code2, 'redirect_uri': cb, 'client_id': cimd, 'code_verifier': v2})
        ok(st == 200 and j2 and j2.get('access_token', '').startswith('gat_'), 'token emitido para o Claude identificado por endereço')
        st, _, _, html = N2.req('GET', '/oauth/authorize?' + urllib.parse.urlencode(dict(q2, client_id='https://site-estranho.com/cliente.json')))
        ok('Pedido de acesso inválido' in html, 'endereço de cliente fora do Claude é recusado')
        st, _, _, html = N2.req('GET', '/oauth/authorize?' + urllib.parse.urlencode(dict(q2, redirect_uri='https://site-estranho.com/cb')))
        ok('Pedido de acesso inválido' in html, 'retorno para outro site é recusado mesmo com client_id do Claude')

        print('\n== Servidor MCP ==')

        def mcp(metodo, params=None, id_=1):
            st, j, h, _ = A.req('POST', '/api/v1/mcp', {'jsonrpc': '2.0', 'id': id_, 'method': metodo, 'params': params or {}}, dict(M, Accept='application/json, text/event-stream'))
            return st, j

        def ferramenta(nome, args):
            st, j = mcp('tools/call', {'name': nome, 'arguments': args})
            return j['result']

        st, j = mcp('initialize', {'protocolVersion': '2025-06-18', 'capabilities': {}, 'clientInfo': {'name': 'teste', 'version': '1'}})
        ok(st == 200 and j['result']['protocolVersion'] == '2025-06-18' and 'tools' in j['result']['capabilities'], 'initialize')
        st, _, _, corpo = A.req('POST', '/api/v1/mcp', {'jsonrpc': '2.0', 'method': 'notifications/initialized'}, M)
        ok(st == 202 and corpo == '', 'notificação: 202 sem corpo')
        st, j = mcp('tools/list')
        nomes = [t['name'] for t in j['result']['tools']]
        esperadas = ['buscar_cliente', 'cadastrar_cliente', 'atualizar_cliente', 'anexar_documento_cliente', 'buscar_leads', 'registrar_lead', 'mudar_etapa_lead',
                     'registrar_interacao', 'converter_lead_em_cliente', 'listar_etapas_funil', 'listar_anuncios', 'cadastrar_anuncio', 'relatorio_por_anuncio']
        ok(sorted(nomes) == sorted(esperadas), 'tools/list traz as 13 ferramentas')
        ok(all(t['description'] and t['inputSchema']['type'] == 'object' for t in j['result']['tools']), 'todas com descrição e schema de entrada')
        r = ferramenta('listar_etapas_funil', {})
        ok(not r['isError'] and r['structuredContent']['etapas'][0]['nome'] == 'Novo lead', 'listar_etapas_funil')
        r = ferramenta('registrar_lead', {'telefone': '31 98765-4321', 'nome': 'Lead do Claude', 'primeira_mensagem': 'Olá! Vim pelo anúncio [BPC-01]', 'area_interesse': 'BPC/LOAS'})
        ok(not r['isError'] and r['structuredContent']['lead']['campanha'] == 'BPC Idoso', 'registrar_lead')
        lid = r['structuredContent']['lead']['id']
        r = ferramenta('mudar_etapa_lead', {'lead_id': lid, 'etapa': 'Aguardando documentos'})
        ok(not r['isError'] and r['structuredContent']['lead']['etapa'] == 'Aguardando documentos', 'mudar_etapa_lead')
        r = ferramenta('mudar_etapa_lead', {'lead_id': lid, 'etapa': 'Perdido'})
        ok(r['isError'] and 'motivo' in r['content'][0]['text'], 'erro de validação volta como isError (com a explicação)')
        r = ferramenta('registrar_interacao', {'lead_id': lid, 'resumo': 'Pediu a lista de documentos', 'data_follow_up': '2026-11-12'})
        ok(not r['isError'] and r['structuredContent']['tarefa_follow_up_id'], 'registrar_interacao')
        r = ferramenta('buscar_leads', {'telefone': '31987654321'})
        ok(r['structuredContent']['total'] == 1, 'buscar_leads')
        r = ferramenta('buscar_cliente', {'cpf': '529.982.247-25'})
        ok(r['structuredContent']['total'] == 1, 'buscar_cliente')
        r = ferramenta('cadastrar_cliente', {'nome': 'Cliente MCP', 'cpf': '935.411.347-80', 'area_do_caso': 'Trabalhista', 'honorarios_valor': 2000})
        ok(not r['isError'] and r['structuredContent']['contrato_id'], 'cadastrar_cliente')
        mid = r['structuredContent']['cliente']['id']
        r = ferramenta('atualizar_cliente', {'id': mid, 'profissao': 'motorista'})
        ok(r['structuredContent']['cliente']['profissao'] == 'motorista', 'atualizar_cliente')
        r = ferramenta('anexar_documento_cliente', {'cliente_id': mid, 'tipo': 'procuracao', 'url': 'https://docs.google.com/document/d/abc/edit'})
        ok(not r['isError'], 'anexar_documento_cliente')
        r = ferramenta('converter_lead_em_cliente', {'lead_id': lid, 'cpf': '714.602.380-01'})
        ok(not r['isError'] and r['structuredContent']['cliente']['lead_id'] == lid, 'converter_lead_em_cliente')
        r = ferramenta('cadastrar_anuncio', {'codigo': 'TRA-03', 'campanha': 'Trabalhista', 'anuncio': 'Demissão'})
        ok(not r['isError'] and r['structuredContent']['criado'], 'cadastrar_anuncio')
        r = ferramenta('listar_anuncios', {})
        ok(len(r['structuredContent']['itens']) == 3, 'listar_anuncios')
        r = ferramenta('relatorio_por_anuncio', {'desde': '2026-11-01'})
        ok(r['structuredContent']['totais']['leads'] >= 5, 'relatorio_por_anuncio')
        st, j = mcp('tools/call', {'name': 'apagar_tudo', 'arguments': {}})
        ok('error' in j, 'ferramenta inexistente: erro JSON-RPC')
        st, _, _, _ = A.req('GET', '/api/v1/mcp', cab=M)
        ok(st == 405, 'GET no MCP: 405 (só POST)')
        st, j, _, _ = A.req('GET', '/api/v1/leads/' + lid, cab=M)
        ok(st == 200, 'o mesmo token OAuth também serve na API REST')

        print('\n== Revogação, log e limites ==')
        st, j = A.sistema('integracaoApi', None, '&op=estado')
        ok(len(j['autorizacoes']) >= 1, 'autorização do Claude aparece na tela')
        for a in j['autorizacoes']:
            A.sistema('integracaoApi', {'op': 'revogarAutorizacao', 'familia': a['familia']})
        st, j = mcp('tools/list')
        ok(st == 401, 'depois de revogar, o token não funciona mais')
        kid = [c for c in A.sistema('integracaoApi', None, '&op=estado')[1]['chaves'] if c['nome'] == 'Só leitura'][0]['id']
        A.sistema('integracaoApi', {'op': 'revogarChave', 'id': kid})
        st, j, _, _ = A.req('GET', '/api/v1/leads', cab={'Authorization': 'Bearer ' + chave_ro})
        ok(st == 401, 'chave revogada: 401')
        st, j = A.sistema('integracaoApi', None, '&op=apiLog')
        rotas = [x['rota'] for x in j['itens']]
        ok(any('/api/v1/clientes' in r for r in rotas) and any(x['quem'].startswith('chave:') for x in j['itens']), 'log de acesso: quem, quando, rota')
        ok(not any('529' in r or '9777' in r for r in rotas), 'log não guarda CPF nem telefone das consultas')
        st, j, _, _ = A.req('GET', '/api/v1/leads', cab={'Authorization': 'Bearer ' + chave_ro})

        print('\n== Reverter e aplicar de novo ==')
        st, j = A.sistema('integracaoApi', {'op': 'reverter'})
        ok(st == 200 and j['ok'], 'reverter migração (com backup)')
        st, j = A.sistema('dados', None, '&desde=0')
        regs = {r['id']: r['dados'] for r in j['registros'] if r['colecao'] == 'leads'}
        ok(regs['L2']['etapa'] == 'Em recuperação' and regs['L3']['etapa'] == 'Fechado' and regs['L1']['etapa'] == 'Novo contato', 'etapas antigas restauradas')
        ok(regs[lead['id']]['etapa'] == 'Fechado', 'lead criado depois da migração volta pela tabela de volta ("Cliente fechado" → "Fechado")')
        st, j, _, _ = A.req('GET', '/api/v1/leads', cab=H)
        ok(st == 503, 'API desativada depois de reverter')
        st, j = A.sistema('integracaoApi', {'op': 'aplicar'})
        ok(st == 200, 'aplicar de novo depois de reverter')
    finally:
        proc.terminate()
        if '--manter' not in sys.argv:
            shutil.rmtree(pasta, ignore_errors=True)
    print('\n%d testes, %d falha(s)' % (total, len(falhas)))
    for f in falhas:
        print('  FALHOU:', f)
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
