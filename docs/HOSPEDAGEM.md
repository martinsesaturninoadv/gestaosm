# Como colocar o sistema no ar (HostGator ou similar)

## Respostas rápidas

**Dá certo contratar domínio + hospedagem (ex.: HostGator) e publicar o código lá?**
Sim. O sistema foi feito para rodar em hospedagem compartilhada comum, com **cPanel, PHP e MySQL**, que é o que os planos da HostGator oferecem.

**Preciso de mais algum programa?**
Não. O plano já inclui tudo o que o sistema usa: PHP, banco de dados MySQL e certificado SSL gratuito (o cadeado do `https`). Você só precisa:
1. de um **domínio** (ex.: `martinsesaturnino.adv.br` ou `.com.br`);
2. de um **plano de hospedagem com cPanel** (os planos compartilhados da HostGator servem);
3. do navegador, para enviar os arquivos pelo **Gerenciador de Arquivos** do cPanel. O FileZilla é opcional.

**Como as informações ficam salvas? A Dra. Vitória vai ver o que eu cadastro?**
Na hospedagem, tudo fica num **banco de dados MySQL** do escritório, e não mais no navegador:
- cada pessoa entra com **o próprio e-mail e senha**;
- todos veem **os mesmos dados**: o que você cadastra aparece para a Dra. Vitória em até ~20 segundos, ou na hora ao recarregar a página, e vice-versa;
- funciona no computador e no celular, de qualquer lugar;
- o sistema registra **quem alterou o quê e quando** (tabela `historico`);
- o perfil **estagiário** não vê nada do financeiro, e o bloqueio é feito no servidor, não só na tela.
- o perfil **parceiro** vê só os clientes, processos e honorários marcados para a parceria dele.

> O link de demonstração no Claude e o arquivo aberto direto no computador são **modo demonstração**: os dados ficam só naquele navegador. Para trabalhar em equipe, é preciso hospedar (passo a passo abaixo).

**Quanto custa?** (valores aproximados; confira no site de cada empresa)
- Domínio `.com.br` / `.adv.br` no Registro.br: cerca de R$ 40 por ano.
- Hospedagem compartilhada com cPanel: cerca de R$ 15 a R$ 40 por mês, conforme o plano e o período contratado.

---

## Passo a passo

### 1. Contratar
1. Registre o domínio (Registro.br ou a própria HostGator).
2. Contrate um plano de **hospedagem compartilhada com cPanel**. Se o domínio for registrado fora, aponte os DNS dele para os da hospedagem (a HostGator envia os endereços por e-mail).
3. No cPanel, confira em **SSL/TLS Status** (ou "AutoSSL") se o certificado gratuito está ativo para o domínio.

### 2. Criar o endereço do sistema (recomendado)
cPanel → **Domínios** (ou "Subdomínios") → crie `sistema.seudominio.com.br`.
O cPanel cria uma pasta para ele, por exemplo `public_html/sistema`.

### 3. Enviar os arquivos
1. Baixe o pacote **sistema-gestao-hostgator.zip**, que traz `index.html`, `api.php`, `instalar.php`, `config.exemplo.php` e `.htaccess`. Também dá para montar o pacote com esses arquivos da pasta `sistema` do GitHub.
2. cPanel → **Gerenciador de Arquivos** → entre na pasta do subdomínio (ex.: `gestao.seudominio.com.br`).
3. Clique em **Carregar**, envie o zip, volte para a pasta, clique com o botão direito no zip e escolha **Extract** (extrair). Depois apague o zip.

### 4. Ativar o cadeado (SSL)
cPanel → **SSL/TLS Status** → marque o subdomínio → **Run AutoSSL**. Isso só funciona depois que o DNS do domínio já aponta para a HostGator. O sistema exige `https://`.

### 5. Instalar (tudo pelo navegador)
1. Abra `https://gestao.seudominio.com.br/instalar.php`.
2. Preencha **seu nome, e-mail e senha** e clique em **Instalar**.
3. Pronto. O instalador:
   - cria o banco de dados sozinho, num arquivo guardado **fora** da pasta pública do site;
   - grava a configuração (`config.php`);
   - cria o seu acesso de administrador;
   - **apaga a si mesmo**.

> Não é preciso criar banco MySQL no cPanel nem editar arquivo nenhum. Se preferir usar MySQL, abra "Banco de dados" no instalador e informe um banco criado em **cPanel → Bancos de dados MySQL**.

### 6. Versão do PHP (só se der erro)
cPanel → **Selecionar versão do PHP** (ou "MultiPHP Manager"): escolha **PHP 8.1 ou mais novo** (mínimo 7.4).

### 7. Entrar no sistema
Abra `https://gestao.seudominio.com.br` e entre com o e-mail e a senha que você cadastrou.

### 8. Primeiro uso
1. Abra `https://sistema.seudominio.com.br` e entre com o administrador.
2. **Configurações → Acessos ao sistema → + Acesso**: crie o login e a senha de cada pessoa: a **Dra. Vitória** (perfil *Advogado(a)* ou *Administrador(a)*), a equipe e os **parceiros** (perfil *Parceiro*).
   Em **Configurações → Equipe**, cadastre também cada pessoa com o **mesmo e-mail** do acesso (para parceiros, use a função *Parceiro*). Depois marque, no cadastro do cliente, a **Parceria** daquele caso. Envie a senha inicial por um canal seguro; cada pessoa troca a sua em **Configurações → Minha senha**.
3. **Configurações → Dados do escritório**: preencha os dados e o **saldo inicial do caixa** (para o fluxo de caixa começar certo).
4. **Configurações → Produtos / nichos**: ajuste a lista (ex.: DBA, AIC, BAR, Salário-maternidade…).
5. **Configurações → Dados do escritório**: envie o **logotipo** (sai nos contratos, propostas e procurações) e confira o salário mínimo usado nas guias.
6. **Integrações Google** (opcional): siga o guia **[GOOGLE.md](GOOGLE.md)**.
7. **Configurações → Importar planilhas do Excel**: envie o `CRM INTERNO CLIENTE` e o `CONTROLE FINANCEIRO`. Confira o que foi encontrado e clique em **Importar**. Importar de novo não duplica.

### 9. Backup
- O plano da HostGator costuma ter backup próprio. Mesmo assim, uma vez por mês: cPanel → **Backup** → baixe o **backup do banco MySQL**.
- No próprio sistema: **Configurações → Exportar backup (.json)**.

### Atualizar o sistema no futuro
Substitua só `index.html` e `api.php`. O `config.php` e o banco de dados continuam intactos, e nenhum dado se perde.

---

## Boas práticas (LGPD e sigilo profissional)
- Use **senhas fortes** e um acesso por pessoa; desative o acesso de quem sair do escritório (**Configurações → Acessos → Acesso ativo**).
- Não envie o `config.php` para ninguém e não o coloque no GitHub (ele já está no `.gitignore`).
- Sempre acesse pelo endereço com **https://**.
- Faça backup antes de grandes importações.

## Problemas comuns
| Mensagem | O que fazer |
|---|---|
| "Sistema ainda não configurado" | Abra `instalar.php` (passo 5). |
| "Erro de conexão com o banco de dados" | Confira no `config.php` o nome **completo** do banco e do usuário (com o prefixo do cPanel) e a senha, e se o usuário foi adicionado ao banco com todos os privilégios. |
| Página em branco ou "500" | Verifique a versão do PHP (passo 6). |
| Abre sem cadeado | Ative o SSL/AutoSSL no cPanel e aguarde alguns minutos. |
| Esqueci a senha | Outro administrador redefine em **Configurações → Acessos**. Se for o único administrador, peça ajuda técnica para redefinir no banco. |
