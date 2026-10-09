# Gestão SM: sistema de gestão do escritório

Sistema próprio de gestão do escritório Martins & Saturnino Advocacia, com login individual para cada pessoa da equipe.

| Pasta / arquivo | Descrição |
|---|---|
| `sistema/index.html` | **O sistema** (arquivo único). Aberto direto no navegador, roda em modo demonstração |
| `sistema/api.php`, `instalar.php`, `config.exemplo.php`, `.htaccess` | Servidor: login, permissões e banco de dados MySQL (vão para a hospedagem junto com o `index.html`) |
| `sistema/src/` + `sistema/build.py` | Código-fonte do sistema, separado por partes. Após editar, rode `python3 sistema/build.py` para gerar o `index.html` |
| `docs/HOSPEDAGEM.md` | **Passo a passo para colocar no ar** (HostGator ou similar) |
| `docs/GOOGLE.md` | Como conectar Google Agenda, Drive e Docs |
| `docs/ESBOCO_SISTEMA.md` | Visão geral e próximos passos |

## Módulos

- **Painel**: visível a todos e sem dados financeiros. Mostra:
  - compromissos de hoje e da semana;
  - pendências (prazos vencidos, tarefas atrasadas, exigências, guias, atendimentos sem retorno, documentos);
  - **metas da equipe** com anéis de progresso, prêmio e comemoração animada quando a meta é batida;
  - **ranking de produtividade** com pontos e pins;
  - aniversariantes e partos previstos.
- **Agenda e compromissos**: tipos de compromisso/serviço **editáveis**, com cor; tarefas na agenda; **Google Agenda** (link por item, sincronização completa e arquivo .ics).
- **Atendimentos (CRM)**, **Clientes**, **Registro histórico** (colunas da planilha CRM) e **Scripts de atendimento** editáveis: primeiro contato, objeções, fechamento, pós-venda, indicação, aniversário, cobrança.
- **Contencioso e administrativo**:
  - contencioso: vara, comarca, instância e polo;
  - administrativo: órgão, protocolo, DER e dias em análise;
  - lista ou quadro por fase.
- **Salário-maternidade**:
  - quadro de casos: categoria da segurada, estratégia, carência, DPP/parto, qualidade de segurada, NB/DER;
  - **controle de guias** GPS/DAS: geração em lote, emitida, paga, vencida;
  - documentos padrão.
- **Documentos e modelos**:
  - gerador com **logotipo**;
  - contratos por área (salário-maternidade, previdenciário, trabalhista, cível/consumidor, família, **direito digital**, empresarial), **proposta de honorários**, procuração, declaração, recibo e notificação;
  - todos editáveis;
  - exporta para Word e PDF e cria no **Google Docs**;
  - checklist com anexos no **Google Drive**.
- **Parcerias**: perfil **parceiro**, que vê só os casos da parceria e a parte dele nos honorários; registro de repasses.
- **Financeiro**:
  - contas a receber e a pagar;
  - contratos com parcelas;
  - **previsão de recebimentos visual**;
  - despesas fixas (previsto × real);
  - fluxo de caixa;
  - contratos e metas.
- **Indicadores mensais**: gráficos, preenchimento automático, **valores editáveis** e indicadores manuais. Relatórios.
- Importação e exportação das planilhas Excel.

## Perfis de acesso

| Perfil | Vê |
|---|---|
| Administrador(a) | Tudo, e cria os acessos da equipe |
| Advogado(a) | Tudo, inclusive o financeiro |
| Financeiro / administrativo | Tudo, inclusive o financeiro |
| Estagiário(a) | Tudo, menos o financeiro |
| Parceiro | Somente os clientes, processos, prazos e honorários da parceria |

As regras são aplicadas também no servidor (`api.php`), e não só na tela.

## Demonstração

Abra `sistema/index.html` no navegador (ou o link publicado). Entre com um dos acessos de exemplo; a senha de todos é **demo1234**. Os dados da demonstração ficam só naquele navegador.

Para o escritório usar de verdade, com os dados compartilhados entre todos, siga **[docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md)**.
