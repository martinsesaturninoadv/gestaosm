# API, webhook do WaSpeed e conector do Claude

Guia do que foi criado para o Claude (claude.ai) e outras automações lerem e gravarem dados no sistema de gestão.

## Resumo

| Peça | Endereço | Para quê |
|---|---|---|
| API REST | `https://gestao.martinsesaturninoadvocacia.com.br/api/v1` | Clientes, leads, funil e anúncios, com chave de API |
| Webhook do WaSpeed | `…/api/v1/webhooks/waspeed` | Recebe os eventos do WaSpeed e atualiza o funil sozinho |
| Conector MCP do Claude | `…/api/v1/mcp` | O Claude usa as 35 ferramentas, com login por OAuth |
| Documentação OpenAPI | `…/api/v1/openapi.yaml` | Especificação completa (pode abrir no editor.swagger.io) |

**Tecnologia**
- Tudo é em **PHP**, como o resto do sistema. Roda na hospedagem compartilhada da HostGator, sem Node, sem processo contínuo e sem SSH.
- O conector MCP é "sem estado": cada pedido do Claude é uma requisição comum ao PHP.

## 1. O que fazer na HostGator (uma vez)

1. Envie o `atualizacao-sistema.zip` para a pasta do sistema, clique em **Extrair** e aceite **substituir**. Depois apague o zip. **Não apague o `config.php`.**
   - O zip traz três arquivos novos: `api-v1.php`, `servico.php` e `api-v1.yaml`.
   - O `.htaccess` foi atualizado com as rotas novas.
2. Entre no sistema como administradora e abra **Configurações → 🔌 API, WaSpeed e conector do Claude**.
3. Clique em **Ver prévia (não grava nada)**. Ela mostra:
   - como cada lead vai mudar de etapa;
   - os telefones repetidos;
   - os leads sem telefone.
4. Clique em **Aplicar migração**.
   - Antes de mudar qualquer coisa, o sistema guarda um backup completo na pasta `backups` do servidor: o arquivo do banco SQLite inteiro e um export JSON, com nome `pre-migracao-aplicar-…`.
   - Se algo der errado no meio, nada é alterado.
5. Pronto. O botão **Reverter migração** desfaz tudo; um backup é feito antes de reverter também.

Não é preciso criar banco, cron novo nem configuração no cPanel. O cron dos avisos que já existe continua o mesmo.

**Requisitos**
- O sistema precisa estar na **raiz** do domínio, como já está em `gestao.martinsesaturninoadvocacia.com.br`. O OAuth do Claude procura os endereços `/.well-known/…` na raiz.
- PHP 7.4 ou mais novo, com as extensões openssl e curl. A HostGator já tem tudo isso.

## 2. Funil de atendimento

Etapas novas, na ordem:

> Novo lead → Em triagem → Aguardando documentos → Proposta enviada → Negociação → Contrato enviado → **Cliente fechado** | **Perdido** (com motivo) | Encaminhado a parceiro

Como as etapas antigas foram convertidas:

| Antes | Depois |
|---|---|
| Novo contato | Novo lead |
| Em atendimento | Em triagem |
| Proposta enviada | Proposta enviada |
| Em recuperação | Negociação |
| Fechado | Cliente fechado |
| Perdido | Perdido (motivo "Não informado (antes da migração)") |
| Encaminhado a parceiro | Encaminhado a parceiro (mantida como etapa) |

**Para editar as etapas:** Atendimentos (CRM) → **⚙ Etapas**.
- Dá para renomear, reordenar, criar e remover etapas.
- Cada etapa tem um **tipo**:
  - **andamento**;
  - **ganho**: conta como cliente fechado nas metas e nos relatórios;
  - **perdido**: pede o motivo;
  - **parceiro**.
- Ao renomear, os leads que estão na etapa vão junto.
- O sistema não deixa remover uma etapa que ainda tem leads.

Toda mudança de etapa fica no **histórico do lead**: de, para, quando, quem e motivo. Isso vale para as feitas pela tela, pela API, pelo WaSpeed e pelo Claude.

## 3. Chaves de API (para automações)

**Criar**
1. Configurações → API e conector → **+ Nova chave de API**.
2. Dê um nome, por exemplo "Automação de leads", e marque as permissões:
   - ler ou gravar clientes;
   - ler ou gravar leads;
   - ler ou gravar anúncios;
   - relatórios.
3. A chave (`gsm_…`) aparece **uma única vez**: copie e guarde num lugar seguro.
   - O sistema guarda só um resumo criptográfico (hash) da chave.
   - A chave nunca vai para o código nem para o git.

**Revogar:** botão **Revogar** ao lado da chave. Ela para de funcionar na hora.

**Usar:** envie o cabeçalho `Authorization: Bearer gsm_…` em todas as chamadas.

**Limites e registro**
- Limite de **120 requisições por minuto** por chave. Acima disso, a resposta é `429` com `Retry-After: 60`.
- Cada chamada fica no **registro de acesso** (Configurações → Ver as últimas chamadas), por 12 meses: quem, quando, IP, rota, status e qual registro.
- Por causa da LGPD, os valores das consultas, como CPF e telefone, **não** são gravados nesse registro.

## 4. Webhook do WaSpeed

1. Configurações → API e conector → **Gerar token**. Aparecem a URL, o token e a "URL com token". Copie na hora: o token não aparece de novo.
2. No painel do WaSpeed, procure a área de **Webhook** (ou Integrações) e cadastre:
   - **URL:** `https://gestao.martinsesaturninoadvocacia.com.br/api/v1/webhooks/waspeed`;
   - **Token:** se houver campo para cabeçalho, use o nome `X-Webhook-Token` e cole o token. Se só houver o campo URL, cole a **URL com token** (`…/waspeed?token=wsp_…`);
   - **Eventos:** nova mensagem, contato, etiqueta e mudança de coluna do Kanban.
3. Em **Colunas do WaSpeed → etapas**, diga qual coluna do Kanban do WaSpeed corresponde a qual etapa do sistema. Uma por linha, por exemplo: `Atendendo = Em triagem`. Colunas com o mesmo nome de uma etapa não precisam ser cadastradas.

**O que o webhook faz com cada evento**
- Cria o lead pelo telefone em E.164, ou atualiza o lead que já existe com esse telefone.
- Na primeira mensagem do cliente, lê o código do anúncio e preenche campanha, conjunto e anúncio.
- Junta as etiquetas.
- Quando o card muda de coluna no WaSpeed, muda a etapa do lead aqui e registra no histórico. Ao ir para uma coluna de perda, o motivo fica "Movido para … no WaSpeed".

### Capturar um evento de teste para conferir o formato
O formato exato do JSON do WaSpeed não está documentado publicamente, então o mapeamento ficou isolado e fácil de ajustar:

1. Depois de cadastrar o webhook no WaSpeed, mande uma mensagem de teste para o número do escritório e mova um card de coluna.
2. Em Configurações → API e conector, clique em **Eventos recebidos**.
   - Cada evento aparece com o **JSON bruto** (guardado por 30 dias) e o resultado: `ok`, `ignorado` ou `nao_autorizado`.
3. Se algum dado não for reconhecido (por exemplo, "Telefone não encontrado"):
   - clique em **Copiar JSON**;
   - abra **Testar um JSON** e cole: a tela mostra o que o sistema entendeu, sem gravar nada;
   - se faltar algo, em **Colunas do WaSpeed → etapas → Avançado** informe o caminho do dado, por exemplo `data.contact.phone`.
   - Você também pode me mandar o JSON e eu ajusto o mapeamento.

Sem nada configurado, o sistema já procura os nomes mais comuns: `phone`, `number`, `chatId`, `remoteJid`, `contact.phone`, `message.text`, `body`, `column`, `labels`, `fromMe` e outros.

## 5. Conector do Claude (claude.ai)

**Endereço do conector:** `https://gestao.martinsesaturninoadvocacia.com.br/api/v1/mcp`

1. No claude.ai, abra **Personalizar → Conectores → Adicionar conector personalizado**.
   - Em plano Team ou Enterprise, quem adiciona é a Owner, em **Configurações da organização → Conectores**.
2. Cole o endereço acima. Em **Autenticação**, deixe **Entrar agora** (OAuth). Não é preciso informar client ID: o Claude se registra sozinho.
3. Clique em **Conectar**. Abre a tela de login **do próprio sistema**:
   - entre com uma conta de **administradora**;
   - digite o código do autenticador, se a verificação em duas etapas estiver ativa;
   - clique em **Autorizar**.
4. Pronto: o Claude passa a ter as ferramentas abaixo.
   - O acesso vale 1 hora e é renovado sozinho por até 30 dias.
   - Para desconectar, use Configurações → API e conector → **Autorizações ativas → Revogar**.

| Ferramenta | O que faz |
|---|---|
| `buscar_cliente` | Procura por CPF, nome ou telefone (use antes de cadastrar) |
| `cadastrar_cliente` | Cadastro completo com qualificação e honorários (vira contrato) |
| `atualizar_cliente` | Atualiza só os campos informados |
| `anexar_documento_cliente` | Registra o link do Google Docs (procuração, declaração, contrato…) |
| `buscar_leads` | Lista por etapa, telefone ou data |
| `registrar_lead` | Cria ou atualiza pelo telefone e lê o código do anúncio |
| `mudar_etapa_lead` | Muda a etapa (motivo obrigatório para Perdido) |
| `registrar_interacao` | Registra a conversa e, com data de follow-up, cria a tarefa |
| `converter_lead_em_cliente` | Cria o cliente a partir do lead e liga os dois |
| `listar_etapas_funil` | Etapas na ordem |
| `listar_anuncios` / `cadastrar_anuncio` | Tabela de códigos de anúncio |
| `relatorio_por_anuncio` | Leads, fechados e conversão por anúncio e campanha |

**Salário-maternidade** (as mesmas regras da tela):

| Ferramenta | O que faz |
|---|---|
| `sm_buscar_caso` | Procura por caso, cliente, nome, CPF, telefone ou etapa; com um resultado, traz a ficha completa e os alertas |
| `sm_criar_caso` | Abre o caso de uma cliente já cadastrada (etapa Documentos, com o checklist básico) |
| `sm_atualizar_caso` | Categoria, estratégia, DPP, data do parto (nunca no futuro), honorários etc. |
| `sm_mover_etapa` | Muda a etapa; Encerrado exige o desfecho |
| `sm_registrar_guia` | Guia com vencimento (dia 15, ou 20 no DAS-MEI, no próximo dia útil) e valor pelo % do código sobre o salário mínimo da competência |
| `sm_marcar_guia_paga` | Marca paga, avisa atraso; paga pelo escritório vira reembolso |
| `sm_registrar_requerimento` | NB e DER; move para No INSS |
| `sm_registrar_exigencia` | Abre ou marca como cumprida a exigência do INSS |
| `sm_registrar_deferimento` | NB, DER, valor e parcelas do INSS; move para "Deferido — a receber" |
| `sm_registrar_parcela_recebida` | A cliente recebeu a parcela: os honorários dela vencem 5 dias úteis depois |
| `sm_a_receber` | O que cobrar agora, o que aguarda o benefício e o previsto ainda não lançado |

Converter um lead de salário-maternidade (`converter_lead_em_cliente`) já cria o caso no quadro e devolve `caso_sm_id`.

**Petições, agenda, financeiro e tráfego**

| Ferramenta | O que faz |
|---|---|
| `registrar_peticao` / `mudar_status_peticao` / `buscar_peticoes` | Quadro de conferência; avisa no celular quem confere (padrão: a outra advogada) e quem redigiu |
| `registrar_compromisso` / `buscar_agenda` | Audiência, perícia, reunião ou prazo (sem duplicar); vai para o Google Agenda de quem tiver o Google conectado |
| `registrar_lancamento` | Conta a receber ou a pagar, parcelada se precisar |
| `registrar_despesa_fixa` | Aluguel, contador, sistemas… (atualiza pelo nome) |
| `contas_a_receber_e_pagar` | Quando, de quem/para quem, o quê, processo e situação, com totais |
| `registrar_investimento_anuncios` | Gasto por dia e por conta (substitui o mesmo dia, sem somar duas vezes) |
| `relatorio_trafego` | % orgânico × anúncio, investimento por dia e por conta, retorno em contratos (dia, semana, quinzena, mês) |
| `sincronizar_meta_ads` | Busca agora no Gerenciador de Anúncios (o sistema já busca sozinho a cada 6 horas) |

`registrar_lead` aceita `canal_whatsapp` (Geral ou Salário-maternidade) e `veio_de_anuncio`. O WaSpeed fica no número Geral; as conversas do número de salário-maternidade chegam pelo Claude.

**Meta Ads:** em Configurações → Integrações, cole o token (usuário do sistema com permissão `ads_read`) e os IDs das duas contas. O token fica só no servidor.

O financeiro do caso (honorários e reembolso de guia) é montado pelo sistema na próxima abertura; nada é lançado em dobro.

**Segurança**
- Só administradoras conseguem autorizar.
- O registro automático do cliente OAuth só aceita o endereço de retorno do Claude (`https://claude.ai/api/mcp/auth_callback`).
- O login exige PKCE (S256). Os tokens têm uso controlado:
  - a renovação reaproveitada derruba a sessão inteira;
  - o código de autorização vale uma vez só, por 5 minutos.
- Os tokens são guardados só como hash.

## 6. Código do anúncio

Cada anúncio da Meta leva uma mensagem pré-preenchida com o código, por exemplo:

> Olá! Vim pelo anúncio [BPC-01]

**Onde cadastrar:** tela **Anúncios e origem** (menu Clientes) ou `POST /anuncios`. Para cada código, informe campanha, conjunto, anúncio, área, datas e, se quiser, o investimento.

**Como o código é lido**
- O sistema procura `[XXX-00]` na primeira mensagem: de 2 a 5 letras, hífen e de 1 a 3 números, em maiúsculas ou minúsculas.
- Se a pessoa apagar os colchetes, o código ainda vale, **desde que esteja cadastrado**. Isso evita confundir com outras palavras.
- Sem código, a origem fica **"Orgânico / não identificado"**.

**Relatório:** na tela **Anúncios e origem**, aba **Relatório por anúncio**, ou em `GET /relatorios/anuncios`. Mostra leads, clientes fechados, perdidos e a taxa de conversão por anúncio e por campanha. Quando o investimento está cadastrado, mostra também o custo por cliente.

## 7. Exemplos com curl

Defina primeiro:
```bash
API=https://gestao.martinsesaturninoadvocacia.com.br/api/v1
CHAVE=gsm_cole_a_sua_chave_aqui
```

**Situação da API (sem chave)**
```bash
curl -s $API/status
```

**Clientes**
```bash
# buscar (evitar duplicidade)
curl -s -H "Authorization: Bearer $CHAVE" "$API/clientes?cpf=529.982.247-25"
curl -s -H "Authorization: Bearer $CHAVE" "$API/clientes?nome=jose%20da%20silva"
curl -s -H "Authorization: Bearer $CHAVE" "$API/clientes?telefone=11912345678"

# cadastrar
curl -s -X POST $API/clientes -H "Authorization: Bearer $CHAVE" -H "Content-Type: application/json" -d '{
  "nome": "José da Silva", "nacionalidade": "brasileiro", "estado_civil": "casado", "profissao": "pedreiro",
  "rg": "12.345.678-9", "orgao_emissor": "SSP/SP", "cpf": "529.982.247-25", "data_nascimento": "1960-03-15",
  "filiacao": "Maria da Silva e João da Silva",
  "endereco": {"cep": "01310-100", "logradouro": "Av. Paulista", "numero": "1000", "bairro": "Bela Vista", "cidade": "São Paulo", "uf": "SP"},
  "email": "jose@exemplo.com", "telefone": "(11) 91234-5678", "area_do_caso": "BPC/LOAS", "objeto": "Concessão de BPC ao idoso",
  "honorarios_valor": 3000, "honorarios_forma": "Entrada de R$ 500 + 5x de R$ 500", "honorarios_exito_percentual": 30,
  "justica_gratuita": true, "lead_id": "ID_DO_LEAD_OPCIONAL"}'

# ver e atualizar
curl -s -H "Authorization: Bearer $CHAVE" $API/clientes/ID_DO_CLIENTE
curl -s -X PATCH $API/clientes/ID_DO_CLIENTE -H "Authorization: Bearer $CHAVE" -H "Content-Type: application/json" -d '{"profissao": "aposentado"}'

# registrar documento gerado no Google Docs
curl -s -X POST $API/clientes/ID_DO_CLIENTE/documentos -H "Authorization: Bearer $CHAVE" -H "Content-Type: application/json" \
  -d '{"tipo": "procuracao", "url": "https://docs.google.com/document/d/XXXX/edit", "data": "2026-11-06"}'
```

**Leads**
```bash
# registrar (cria ou atualiza pelo telefone)
curl -s -X POST $API/leads -H "Authorization: Bearer $CHAVE" -H "Content-Type: application/json" -d '{
  "nome": "Maria Souza", "telefone": "(11) 97777-1111", "primeira_mensagem": "Olá! Vim pelo anúncio [BPC-01]",
  "data_primeiro_contato": "2026-11-06", "plataforma": "Instagram", "area_interesse": "BPC/LOAS",
  "resumo_triagem": "Mãe de 67 anos, renda familiar baixa", "responsavel": "Vitória"}'

# listar
curl -s -H "Authorization: Bearer $CHAVE" "$API/leads?etapa=Em%20triagem&desde=2026-11-01"
curl -s -H "Authorization: Bearer $CHAVE" "$API/leads?telefone=11977771111"

# mudar etapa (motivo obrigatório para Perdido)
curl -s -X PATCH $API/leads/ID_DO_LEAD/etapa -H "Authorization: Bearer $CHAVE" -H "Content-Type: application/json" -d '{"etapa": "Aguardando documentos"}'
curl -s -X PATCH $API/leads/ID_DO_LEAD/etapa -H "Authorization: Bearer $CHAVE" -H "Content-Type: application/json" -d '{"etapa": "Perdido", "motivo": "Achou caro"}'

# registrar interação (data_follow_up cria tarefa)
curl -s -X POST $API/leads/ID_DO_LEAD/interacoes -H "Authorization: Bearer $CHAVE" -H "Content-Type: application/json" \
  -d '{"data": "2026-11-06", "canal": "WhatsApp", "resumo": "Enviou CNIS e laudos", "proximo_passo": "Montar proposta", "data_follow_up": "2026-11-10"}'

# converter em cliente
curl -s -X POST $API/leads/ID_DO_LEAD/converter -H "Authorization: Bearer $CHAVE" -H "Content-Type: application/json" -d '{"cpf": "153.509.460-56"}'
```

**Funil, anúncios e relatório**
```bash
curl -s -H "Authorization: Bearer $CHAVE" $API/funil/etapas
curl -s -H "Authorization: Bearer $CHAVE" $API/anuncios
curl -s -X POST $API/anuncios -H "Authorization: Bearer $CHAVE" -H "Content-Type: application/json" \
  -d '{"codigo": "BPC-01", "campanha": "BPC Idoso", "conjunto": "SP 60+", "anuncio": "Vídeo 1", "area_do_direito": "BPC/LOAS", "data_inicio": "2026-11-01", "investimento": 1200}'
curl -s -H "Authorization: Bearer $CHAVE" "$API/relatorios/anuncios?desde=2026-11-01&ate=2026-11-30"
```

**Webhook do WaSpeed (simular um evento)**
```bash
curl -s -X POST $API/webhooks/waspeed -H "X-Webhook-Token: wsp_cole_o_token" -H "Content-Type: application/json" \
  -d '{"event": "message", "data": {"contact": {"phone": "5511944443333", "name": "Paula"}, "message": {"text": "Oi! Vim pelo anúncio [BPC-01]", "fromMe": false}}}'
```

**Conector MCP (teste manual: precisa de um token OAuth `gat_…` ou de uma chave de API)**
```bash
curl -s -X POST $API/mcp -H "Authorization: Bearer $CHAVE" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'
```

## 8. O que mudou no banco e no sistema

**Tabelas novas.** São criadas pela migração e apagadas ao reverter:

| Tabela | Conteúdo |
|---|---|
| `schema_migracoes` | Controle das migrations aplicadas |
| `api_chaves` | Chaves de API: nome, prefixo, **hash**, permissões, último uso e revogação |
| `api_log` | Registro de cada chamada: quem, quando, IP, rota e status (12 meses) |
| `api_limite` | Contadores do limite por minuto |
| `webhook_log` | Eventos recebidos do WaSpeed, com o JSON bruto (30 dias) |
| `oauth_clientes`, `oauth_codigos`, `oauth_tokens` | Conector do Claude (tokens só como hash) |
| `lead_telefones` | Índice de telefones E.164: chave única do lead |

**Dados que já existiam**
- **Leads:**
  - mudam de etapa conforme a tabela da seção 2, e a etapa antiga fica guardada no campo `etapaAntesMigracao` para a reversão;
  - ganham telefone E.164, origem do anúncio, resumo da triagem, histórico de etapas e interações.
- **Clientes:** ganham os campos de qualificação (nacionalidade, estado civil, RG, órgão emissor, filiação, endereço com CEP, objeto, justiça gratuita) e a lista de documentos gerados. Os campos aparecem no cadastro do cliente, e os documentos na aba Documentos.
- **Coleção nova `anuncios`** (tela Anúncios e origem) e configurações novas `funil` (etapas) e `waspeed` (mapeamento).
- Nada foi apagado. As telas continuam funcionando antes e depois da migração.

**Telas novas ou alteradas**
- Atendimentos (CRM): etapas dinâmicas, ⚙ Etapas, motivo da perda, código do anúncio no card, histórico e interações no atendimento.
- Anúncios e origem: relatório e cadastro.
- Configurações → API e conector.
- Cliente: qualificação e documentos gerados.

## 9. Testes

Bateria automática com 162 verificações. Ela cobre:
- migração, reversão e nova aplicação;
- todos os endpoints e os erros 400, 401, 403, 404, 409, 422 e 503;
- telefone E.164 e código do anúncio;
- webhook;
- OAuth completo (PKCE, rotação e revogação);
- as 35 ferramentas MCP;
- o registro de acesso.

Para rodar (precisa de PHP e Python 3 na máquina):
```bash
python3 sistema/testes/testar-api.py                       # SQLite
python3 sistema/testes/testar-api.py --mysql "host=localhost;banco=teste;usuario=u;senha=s"
```
Resultado atual: **120 testes, 0 falhas**, em SQLite e em MySQL.
