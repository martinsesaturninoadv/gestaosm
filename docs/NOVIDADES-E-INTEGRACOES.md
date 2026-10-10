# Novidades e integrações

## O que funciona sem configurar nada
| Função | Onde fica |
|---|---|
| **Prazos em dias úteis** (CPC): feriados nacionais, Carnaval, Sexta-feira Santa, Corpus Christi, recesso de 20/12 a 20/01, opção Justiça Federal | Formulário de compromisso → "Calcular prazo". Feriados locais em Configurações |
| **Fluxos automáticos**: ao mudar a etapa, o sistema cria as tarefas daquela etapa | Configurações → Fluxos automáticos (editável) |
| **Lembretes de guias e parto** com mensagem pronta (WhatsApp ou e-mail com um clique) | Salário-maternidade → aba Lembretes; aviso no Painel |
| **Envio automático dos lembretes por e-mail** (3 dias antes da guia, 10 dias antes do parto) | Configurações → Lembretes → marcar a opção |
| **RPV, precatórios e alvarás**: valor, previsão, depósito, levantamento, honorários e repasse ao cliente | Menu Jurídico → RPV, precatórios e alvarás |
| **Portal do cliente**: andamento, guias, documentos pendentes e envio de arquivos | Ficha do cliente → 🔗 Portal do cliente |
| **Pesquisa de satisfação (NPS)** com pedido de indicação, que vira atendimento no CRM | Relatórios → Pesquisa de satisfação; aviso no Painel |
| **Verificação em duas etapas** (Google/Microsoft Authenticator) | Configurações → Verificação em duas etapas |
| **Backup diário automático** (30 dias guardados no servidor + envio por e-mail) | Configurações → Backup automático diário |
| **Aplicativo no celular** (ícone na tela) e **notificações** | Configurações → Aplicativo no celular |
| **Tráfego pago (Meta)** dia a dia, ativas/inativas, teste/escala, fechamentos pelo CRM | Menu Gestão → Tráfego pago |

## O que precisa de conta em serviço externo
As chaves são coladas em **Configurações → Integrações**, só por administradora. Elas ficam guardadas apenas no servidor, e ninguém da equipe consegue lê-las depois.

### ✍️ ZapSign: assinatura eletrônica
1. Crie a conta em zapsign.com.br. O plano com API é pago.
2. Copie o **token da API** em ZapSign → Configurações → Integração.
3. Cole o token no sistema e salve.
4. Copie o **endereço do webhook** da ZapSign que aparece no sistema e cole na ZapSign, em Configurações → Webhooks. Assim a situação muda para "assinado" sozinha.
5. Para usar: Documentos → Gerador → **✍️ Enviar para assinatura**. O documento sai no papel timbrado.

### 💳 Asaas: cobrança por PIX, boleto ou cartão com baixa automática
1. Crie a conta em asaas.com e gere a **chave da API** em Integrações.
2. No sistema, cole a chave e invente um **token do webhook** (uma senha qualquer).
3. No Asaas, abra Integrações → Webhooks:
   - URL: o endereço do Asaas que aparece no sistema;
   - Token de autenticação: o mesmo token que você inventou;
   - Eventos: marque os de **cobrança**.
4. Para usar: no Financeiro, clique em **💳 Cobrar** numa receita. O cliente precisa ter CPF/CNPJ no cadastro.
5. Quando o cliente pagar, a parcela é baixada sozinha.

### ⚖️ Escavador: andamentos processuais
1. Contrate a API em api.escavador.com. A cobrança é por consulta.
2. Cole o token no sistema.
3. Para usar: na página do processo judicial, clique em **↻ Andamentos (Escavador)**. Os andamentos novos entram na lista sem duplicar.
4. As publicações e intimações dos diários (monitoramento) também são contratadas no Escavador. Peça para incluirmos depois, se quiserem.

### 🤖 IA (Claude): peças jurídicas
1. Crie a conta em console.anthropic.com, coloque créditos e gere a **API key**.
2. Cole a chave no sistema.
3. Para usar: Documentos → **🤖 Peças com IA**:
   - escolha o tipo de peça e o cliente, e escreva os fatos;
   - clique em **Gerar minuta**;
   - a minuta abre no gerador, no papel timbrado, para revisar e baixar em Word/PDF ou mandar para assinatura.
4. O sistema usa o modelo Claude Opus 5.5 com a opção de reserva automática (`fallbacks: "default"`): se o pedido for recusado, ele tenta automaticamente outro modelo. **Sempre revise a minuta.**

## Atualizar o sistema já instalado
1. Envie o **atualizacao-sistema.zip** para a pasta do sistema.
2. Clique em **Extrair** e aceite **substituir**.
3. Apague o zip.
4. Não apague o `config.php`.

O zip de atualização não traz o `instalar.php`.
