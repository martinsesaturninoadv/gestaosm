# Automação: organizar arquivos de clientes por pasta

Pega os arquivos soltos de uma pasta (Downloads, anexos do WhatsApp,
digitalizações…) e move cada um para a pasta da cliente, já separado por tipo
de documento:

```
Clientes/
├── Ana Paula Silva/
│   ├── 01 - Documentos pessoais/      RG, CPF, CNH
│   ├── 02 - Comprovante de residencia/
│   ├── 03 - Certidao de nascimento/
│   ├── 04 - Carteira de trabalho/     CTPS
│   ├── 05 - CNIS/
│   ├── 06 - Contrato e procuracao/    contrato, procuração, honorários
│   ├── 07 - INSS/                     requerimento, protocolo, exigência, concessão
│   ├── 08 - MEI/                      CCMEI, DASN
│   ├── 09 - Documentacao rural/
│   └── 99 - Outros/
├── _Nao_Identificados/                arquivos sem cliente reconhecido
└── _Logs/                             registro de cada execução
```

Só precisa de Python 3 instalado (nenhuma biblioteca extra).

## Como a cliente é reconhecida

Pelo **nome do arquivo**:

- **CPF** (com ou sem pontuação): `CNIS 345.678.901-22.pdf`
- **Nome completo** ou **primeiro + último nome**: `RG Ana Paula Silva.jpg`, `ana_silva_rg.jpg`
- **Apelidos** cadastrados no `clientes.csv` (separados por `|`): `Ana Paula|Aninha`

Acentos, maiúsculas, `_` e `-` são ignorados. Se o arquivo combinar com duas
clientes ao mesmo tempo, ele vai para `_Nao_Identificados` em vez de arriscar.

Dica: ao salvar um documento, coloque o nome da cliente e o tipo no nome do
arquivo (ex.: `Helena Pinto - CTPS.pdf`).

## Lista de clientes (`clientes.csv`)

No sistema, em **Clientes Ativos → ⤓ Exportar p/ automação**, baixe o
`clientes.csv` e coloque nesta pasta (substituindo o de exemplo). Formato:

```
nome;cpf;apelidos
Ana Paula Silva;123.456.789-00;Ana Paula
```

## Uso

**Windows:** edite as pastas no início do `organizar.bat` e dê dois cliques.
Ele mostra uma simulação e pede confirmação antes de mover.

**Linha de comando:**

```bash
# ver o que seria feito, sem mover nada
python organizar_clientes.py --entrada ~/Downloads/Clientes --destino ~/Clientes --simular

# organizar
python organizar_clientes.py --entrada ~/Downloads/Clientes --destino ~/Clientes

# deixar rodando e organizar a cada 60 segundos
python organizar_clientes.py --entrada ~/Downloads/Clientes --destino ~/Clientes --monitorar 60

# desfazer a última organização
python organizar_clientes.py --destino ~/Clientes --desfazer
```

Arquivos com o mesmo nome nunca são sobrescritos: o novo recebe `(2)`, `(3)`…

Para rodar sozinho todo dia, agende o `organizar_clientes.py` (sem `--simular`)
no Agendador de Tarefas do Windows ou no `cron`.

## Ajustar categorias

As palavras-chave de cada pasta ficam na lista `CATEGORIAS` no início de
`organizar_clientes.py`. A primeira categoria que bater com o nome do arquivo
é a escolhida.
