# Gestão SM: sistema de gestão do escritório

Sistema próprio de gestão do escritório Martins & Saturnino Advocacia: clientes, CRM, processos, prazos, documentos, financeiro, contratos e metas, e indicadores mensais. Reproduz e automatiza as planilhas **CRM interno** e **Controle financeiro**.

| Pasta / arquivo | Descrição |
|---|---|
| `sistema/` | **O sistema.** É esta pasta que vai para a hospedagem |
| `sistema/index.html` | Telas do sistema. Aberto direto no navegador, funciona em modo demonstração |
| `sistema/api.php` | Guarda os dados no banco MySQL e controla o login da equipe |
| `sistema/instalar.php` | Cria o primeiro administrador (apagar depois de usar) |
| `sistema/config.exemplo.php` | Modelo do `config.php` com os dados do banco |
| `docs/HOSPEDAGEM.md` | **Passo a passo para colocar no ar** (HostGator ou similar) e como os dados ficam salvos |
| `docs/ESBOCO_SISTEMA.md` | Visão geral: módulos, modelo de dados e próximos passos |
| `ms_advocacia_saas_v3.html` | Protótipo antigo (salário-maternidade) |

## Módulos

- **Atendimentos (CRM)**: funil de novos contatos, com origem, produto/nicho, proposta, perfil, "em recuperação", "encaminhado a parceiro" e conversão em cliente.
- **Clientes** e **Registro histórico**: as mesmas colunas da aba *Registro histórico* da planilha, exportáveis para Excel.
- **Processos**, **Agenda e prazos**, **Tarefas**, **Documentos e modelos** (procuração, contrato, declaração, recibo).
- **Financeiro**:
  - contas a receber e a pagar;
  - **contratos de honorários**, que geram entrada e parcelas sozinhos;
  - **previsão de recebimentos** (dias 10/20/30);
  - **despesas fixas** (previsto × real);
  - **fluxo de caixa** (saldo anterior, entradas, saídas, distribuição de lucros e saldo transportado);
  - **contratos e metas** (batida / não batida).
- **Indicadores mensais**: o *Questionário geral* e os blocos por nicho, calculados automaticamente (faturamento, inadimplência, CAC, conversões por origem, tickets médios, perfil dos novos clientes…).
- **Importação das planilhas Excel** atuais e exportação para Excel.

## Dois modos de uso

| | Modo demonstração | Modo escritório (hospedado) |
|---|---|---|
| Como abrir | Abrir `sistema/index.html` no navegador | Endereço próprio, ex.: `https://sistema.seudominio.com.br` |
| Onde ficam os dados | Só naquele navegador | No banco MySQL da hospedagem |
| Equipe | Uma pessoa | Cada pessoa com login; todos veem os mesmos dados |
| Login e permissões | Não | Sim (o estagiário não vê o financeiro) e histórico de alterações |

Para colocar no ar, siga **[docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md)**.
