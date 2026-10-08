# Esboço: Sistema de Gestão do Escritório (Martins & Saturnino)

Um sistema próprio que reúne num só lugar **clientes, processos, prazos, financeiro, captação e documentos**.
Este documento descreve o que o sistema faz, como os dados se organizam e um caminho para tirá-lo do protótipo e colocá-lo em produção.

> **Protótipo navegável:** `ms_gestao_escritorio_v4.html`. Abra no navegador, sem instalar nada.
> Ele já vem com dados fictícios e guarda as alterações no próprio navegador (dá para exportar/importar backup em *Configurações*).

---

## 1. Módulos

| Módulo | O que resolve | Principais funções |
|---|---|---|
| **Painel** | Visão do dia ao abrir o sistema | Indicadores (clientes ativos, processos, prazos da semana, recebido no mês, inadimplência, resultado), prazos dos próximos 7 dias, tarefas atrasadas, cobranças vencidas com botão de cobrança no WhatsApp, fluxo de caixa de 6 meses |
| **Agenda e prazos** | Não perder prazo | Prazos, audiências, perícias, reuniões e exigências do INSS; visão em lista (com bloco de *vencidos*) e calendário mensal; filtro por responsável e tipo; marcar como cumprido |
| **Tarefas** | Organizar a equipe | Kanban (A fazer / Em andamento / Concluído), prioridade, responsável, vínculo com cliente/processo |
| **Clientes** | Cadastro único do cliente | PF e PJ, CPF/CNPJ, contato, origem; ficha com abas: processos, financeiro, documentos, agenda e **histórico de atendimentos** |
| **Processos** | Acompanhamento jurídico | Judiciais e administrativos (INSS), área, vara/órgão, parte contrária, fase (barra de progresso), responsável, valor da causa, **andamentos** em linha do tempo, prazos, tarefas e financeiro do processo |
| **Documentos e modelos** | Papelada sob controle | Checklist de documentos por cliente (pendente/recebido) e **gerador de modelos** preenchidos automaticamente: procuração, contrato de honorários, declaração de hipossuficiência, recibo; baixar em .doc |
| **Atendimentos (CRM)** | Captação de novos casos | Funil Novo contato → Em atendimento → Proposta → Fechado/Perdido; taxa de conversão, origem; **converter em cliente** com um clique |
| **Financeiro** | Saber quanto entra e quanto sai | Contas a receber e a pagar, status automático (em aberto/atrasado/pago), baixa com um clique, **contrato de honorários com geração de parcelas** (entrada + N parcelas + êxito), fluxo de caixa, filtros por mês, exportação CSV |
| **Relatórios** | Decisões de gestão | DRE simplificado do ano (regime de caixa), receita por área do direito, processos por área e por resultado, produtividade da equipe, origem dos clientes, ticket médio |
| **Configurações** | Administração | Dados do escritório (usados nos modelos), equipe e funções, backup/restauração |

---

## 2. Modelo de dados

```
Escritório ─┐
            └─ Usuários (sócio, advogado, estagiário, administrativo)

Cliente (PF/PJ) ──< Processo ──< Andamento
   │                   │
   │                   ├──< Evento (prazo, audiência, perícia, reunião, exigência)
   │                   ├──< Tarefa
   │                   └──< Lançamento financeiro
   ├──< Documento (checklist + arquivo)
   ├──< Nota de atendimento (histórico)
   └──< Lançamento financeiro (honorários, reembolsos)

Atendimento/Lead ──(convertido em)──> Cliente
```

Entidades principais e seus campos:

- **Cliente**: tipo (PF/PJ), nome/razão social, CPF/CNPJ, telefone, e-mail, cidade, origem, situação, observações, data de cadastro.
- **Processo**: cliente, número (CNJ, NB ou protocolo), tipo (judicial/administrativo), área, objeto, vara/órgão, parte contrária, fase, situação, responsável, valor da causa, distribuição.
- **Andamento**: processo, data, descrição *(na produção: origem manual ou captura automática)*.
- **Evento**: tipo, descrição, data, hora, processo, cliente, responsável, cumprido.
- **Tarefa**: título, status, prioridade, prazo, responsável, cliente, processo.
- **Lançamento**: receita/despesa, descrição, categoria, valor, vencimento, pago/data do pagamento, forma, cliente, processo.
- **Documento**: cliente, nome, recebido/data *(na produção: arquivo anexo)*.
- **Atendimento (lead)**: nome, telefone, área, origem, etapa, honorários estimados, resumo.

---

## 3. Da maquete à versão de produção

O protótipo serve para **validar telas e fluxos** com a equipe. Para uso real, com vários usuários e dados sigilosos, recomenda-se:

### Arquitetura sugerida

| Camada | Sugestão | Por quê |
|---|---|---|
| Front-end | Next.js (React) + TypeScript | Reaproveita as telas do protótipo; funciona bem no celular |
| Back-end / banco | Supabase (PostgreSQL + autenticação + armazenamento de arquivos) | Banco relacional robusto, login pronto, regras de acesso por linha, backup automático, custo baixo no início |
| Hospedagem | Vercel (front) + Supabase (dados), região São Paulo | Simples de manter, sem servidor próprio |
| Arquivos | Supabase Storage (bucket privado) | Documentos dos clientes vinculados ao cadastro |

### Segurança e LGPD (obrigatório para escritório de advocacia)

- Login individual com **autenticação em dois fatores**; nada de senha compartilhada.
- **Perfis de permissão**: sócio vê tudo; advogado vê seus processos; estagiário não vê o financeiro; administrativo vê o financeiro e não vê o mérito.
- **Registro de auditoria**: quem criou, alterou ou excluiu cada dado, e quando.
- Criptografia em trânsito e em repouso, backups diários, dados hospedados no Brasil.
- Termo de consentimento/ciência no contrato de honorários (já incluído no modelo) e política de retenção e descarte.

### Integrações (por prioridade)

1. **Publicações e andamentos**: captura automática de intimações do DJe e de movimentações (PJe, eproc, e-SAJ) por meio de serviços especializados (ex.: Escavador, Jusbrasil Soluções, Codilo, Digesto). Cada nova intimação gera um *evento de prazo* para conferência.
2. **Cobrança**: emissão de boleto/PIX e baixa automática (ex.: Asaas, Banco Inter, Mercado Pago), com lembrete automático antes do vencimento.
3. **WhatsApp Business API**: modelos de mensagem (confirmação de protocolo, cobrança de documentos, aviso de deferimento) disparados a partir da ficha do cliente.
4. **Google Agenda / Outlook**: sincronizar prazos e audiências com a agenda de cada advogado.
5. **Nota fiscal de serviço (NFS-e)** emitida ao receber honorários.
6. **Assinatura eletrônica** de contrato e procuração (ex.: ZapSign, Clicksign).
7. **Portal do cliente**: o cliente acompanha o andamento e envia documentos sem precisar ligar.

---

## 4. Fases sugeridas

| Fase | Entrega | Prazo estimado* |
|---|---|---|
| **0 — Validação** | Equipe usa o protótipo e ajusta campos, etapas e categorias | 1–2 semanas |
| **1 — MVP** | Login e permissões, clientes, processos, agenda/prazos, tarefas, financeiro básico, migração das planilhas atuais | 4–6 semanas |
| **2 — Documentos e CRM** | Upload de arquivos, modelos em Word/PDF, funil de atendimentos, WhatsApp (links e modelos) | 3–4 semanas |
| **3 — Automação** | Captura de publicações/andamentos, cobrança PIX/boleto com baixa automática, sincronização de agenda | 4–6 semanas |
| **4 — Expansão** | Portal do cliente, assinatura eletrônica, NFS-e, relatórios avançados e metas | contínuo |

\* Estimativas para um desenvolvedor dedicado; variam conforme o escopo final.

---

## 5. Decisões a tomar com os sócios

- [ ] Quais **áreas** o escritório atende (a lista atual é editável)?
- [ ] Quais **fases** de processo e **categorias** financeiras usar?
- [ ] Quem vê o quê (perfis de permissão)?
- [ ] Honorários: modelos padrão (valor fixo, parcelado, êxito %, partido mensal)?
- [ ] Quais planilhas/sistemas existentes precisam ser migrados?
- [ ] Prioridade de integrações: publicações, cobrança ou WhatsApp primeiro?
- [ ] O protótipo anterior (`ms_advocacia_saas_v3.html`, foco em salário-maternidade) vira um **módulo previdenciário** dentro do sistema geral, com viabilidade, estratégia e exigências do INSS?
