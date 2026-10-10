# Conectar o sistema ao Google (Agenda, Drive e Docs)

## O que funciona sem configurar nada

- **"+ Google Agenda"** em cada compromisso e tarefa: abre o Google Agenda com o evento já preenchido; é só clicar em Salvar.
- **Exportar .ics** (página Agenda): arquivo que importa todos os compromissos no Google Agenda, Outlook ou celular.
- **Baixar Word** e **Imprimir / salvar PDF** no gerador de documentos.

- **Pasta do cliente no Drive (vincular)**: na ficha do cliente, clique em **📁 Vincular pasta do Drive** e cole o link da pasta que já existe no Google Drive. Depois disso, o botão **📁 Pasta no Drive** (e o ícone 📁 na lista de clientes) abre a pasta com um clique. Cada pessoa precisa ter acesso à pasta no Drive dela.

## O que exige a conexão com o Google (configurada uma vez pelo administrador)

- **↻ Google Agenda**: envia de uma vez os compromissos e as tarefas de cada pessoa para o Google Agenda dela e mantém tudo atualizado (alterações viram atualização; itens cumpridos são retirados).
- **Pasta do cliente no Google Drive**: o sistema cria a pasta "*Nome do escritório* — Clientes" e uma subpasta para cada cliente.
- **Anexar** documentos do checklist: o arquivo vai direto para a pasta do cliente no Drive, e o link fica salvo no sistema.
- **Abrir no Google Docs**: o contrato, a proposta ou a procuração gerada vira um Google Docs editável, salvo na pasta do cliente.

> A conexão só funciona na **versão hospedada** (endereço `https://…`). Na página de demonstração do Claude, use os links e o arquivo `.ics`.

---

## Passo a passo (cerca de 15 minutos, uma única vez)

### 1. Criar o projeto no Google Cloud
1. Acesse <https://console.cloud.google.com/> com a conta Google do escritório.
2. No topo, clique em **Selecionar projeto → Novo projeto**, dê o nome **Gestão do Escritório** e clique em **Criar**.

### 2. Ativar as APIs
Em **APIs e serviços → Biblioteca**, procure e clique em **Ativar** em:
- **Google Calendar API**
- **Google Drive API**

### 3. Tela de consentimento (OAuth)
1. **APIs e serviços → Tela de consentimento OAuth** (ou "Google Auth Platform").
2. Tipo de usuário:
   - **Interno**, se o escritório usa **Google Workspace** (e-mails @seudominio): só a equipe consegue entrar, sem limite e sem revisão do Google;
   - **Externo**, se a equipe usa contas @gmail.com. Nesse caso, mantenha o app em **Teste** e adicione o e-mail de cada pessoa da equipe em **Usuários de teste** (até 100).
3. Preencha o nome do app (**Gestão do Escritório**), o e-mail de suporte e salve.
4. Em **Escopos / Acesso a dados**, adicione:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/drive`

### 4. Criar o "ID do cliente"
1. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**.
2. Tipo de aplicativo: **Aplicativo da Web**.
3. Em **Origens JavaScript autorizadas**, adicione o endereço do sistema **exatamente** como vocês acessam, por exemplo:
   `https://sistema.seudominio.com.br`
4. Clique em **Criar** e copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).

### 5. Colar no sistema
1. Entre no sistema como **administrador**.
2. **Configurações → Integrações Google → Client ID do Google**: cole o ID e clique em **Salvar**.
3. Clique em **Conectar Google** e autorize com a sua conta.

Cada pessoa da equipe conecta a **própria** conta Google (botão **Conectar Google** ou, direto, **↻ Google Agenda** na Agenda). Os compromissos vão para a agenda de quem está conectado.

---

## Dicas
- **Agenda compartilhada do escritório:** crie uma agenda no Google Agenda (ex.: "Prazos do escritório"), compartilhe-a com a equipe e copie o **ID da agenda** (Configurações da agenda → Integrar agenda). Cole esse ID em **Configurações → Integrações Google → Meu calendário**.
- **Pastas no Drive:** a pasta de clientes é criada no Drive de quem conectou primeiro. Para que todos vejam, compartilhe a pasta "*Nome do escritório* — Clientes" com a equipe, ou mova-a para um **Drive compartilhado** do Workspace.
- **Logotipo nos documentos:** envie o logo em PNG em **Configurações → Dados do escritório**. Ao converter para o Google Docs, se o logo não aparecer, insira-o uma vez no cabeçalho do documento.
- **Segurança:** o sistema não guarda a senha do Google. Ele usa uma autorização temporária (cerca de 1 hora), renovada automaticamente quando necessário.
