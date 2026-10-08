#!/usr/bin/env python3
"""
Organizador de arquivos de clientes — Martins & Saturnino Advocacia.

Lê os arquivos soltos de uma pasta de entrada (ex.: Downloads, anexos do
WhatsApp, digitalizações) e move cada um para:

    <destino>/<Nome do Cliente>/<Categoria do documento>/<arquivo>

O cliente é identificado pelo CPF ou pelo nome presente no nome do arquivo,
usando a lista em clientes.csv (exportável pelo sistema). Arquivos que não
batem com nenhum cliente (ou batem com mais de um) vão para
"_Nao_Identificados". Toda movimentação é registrada em um log CSV, o que
permite desfazer a última execução.

Uso:
    python organizar_clientes.py --entrada ENTRADA --destino DESTINO [opções]

Exemplos:
    python organizar_clientes.py --entrada ~/Downloads/Clientes --destino ~/Clientes --simular
    python organizar_clientes.py --entrada ~/Downloads/Clientes --destino ~/Clientes
    python organizar_clientes.py --entrada ~/Downloads/Clientes --destino ~/Clientes --monitorar 60
    python organizar_clientes.py --destino ~/Clientes --desfazer
"""

import argparse
import csv
import re
import shutil
import sys
import time
import unicodedata
from datetime import datetime
from pathlib import Path

PASTA_NAO_IDENTIFICADOS = "_Nao_Identificados"
PASTA_LOGS = "_Logs"
CATEGORIA_PADRAO = "99 - Outros"

# Ordem importa: a primeira categoria cujo termo aparecer no nome vence.
# Termos são comparados já normalizados (minúsculos, sem acento).
CATEGORIAS = [
    ("05 - CNIS", ["cnis", "extrato previdenciario", "vinculos"]),
    ("04 - Carteira de trabalho", ["ctps", "carteira de trabalho", "carteira trabalho"]),
    ("03 - Certidao de nascimento", ["certidao de nascimento", "certidao nascimento",
                                     "nascimento", "dnv", "nascido vivo"]),
    ("02 - Comprovante de residencia", ["comprovante de residencia", "comprovante residencia",
                                        "comprovante de endereco", "comprovante endereco",
                                        "residencia", "endereco", "conta de luz", "conta luz",
                                        "conta de agua", "conta agua"]),
    ("06 - Contrato e procuracao", ["contrato", "procuracao", "honorario",
                                    "hipossuficiencia", "declaracao de pobreza"]),
    ("07 - INSS", ["inss", "requerimento", "protocolo", "exigencia", "indeferimento",
                   "carta de concessao", "concessao", "beneficio", "meu inss"]),
    ("08 - MEI", ["mei", "ccmei", "dasn", "guia das", "simples nacional", "cnpj"]),
    ("09 - Documentacao rural", ["rural", "itr", "sindicato", "produtor", "ccir",
                                 "autodeclaracao"]),
    ("01 - Documentos pessoais", ["rg", "cpf", "cnh", "identidade", "documento pessoal",
                                  "titulo de eleitor"]),
]

IGNORAR = {"desktop.ini", "thumbs.db", ".ds_store"}
EXTENSOES_TEMPORARIAS = {".tmp", ".part", ".crdownload", ".partial"}


# ---------------------------------------------------------------- utilidades
def normalizar(texto):
    """Minúsculas, sem acentos, apenas letras/números separados por espaço."""
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^a-z0-9]+", " ", texto.lower())
    return f" {texto.strip()} "


def so_digitos(texto):
    return re.sub(r"\D", "", texto or "")


def nome_de_pasta(texto):
    """Remove caracteres proibidos em nomes de pasta (Windows/Mac/Linux)."""
    return re.sub(r'[<>:"/\\|?*]+', "", texto).strip().rstrip(".") or "Sem nome"


def destino_livre(caminho):
    """Se o arquivo já existe, acrescenta (2), (3)... ao nome."""
    if not caminho.exists():
        return caminho
    n = 2
    while True:
        candidato = caminho.with_name(f"{caminho.stem} ({n}){caminho.suffix}")
        if not candidato.exists():
            return candidato
        n += 1


# ------------------------------------------------------------------ clientes
STOPWORDS = {"da", "de", "do", "das", "dos", "e"}


class Cliente:
    def __init__(self, nome, cpf="", apelidos=""):
        self.nome = " ".join(nome.split())
        self.cpf = so_digitos(cpf)
        self.pasta = nome_de_pasta(self.nome)
        tokens = [t for t in normalizar(self.nome).split() if t not in STOPWORDS]
        # Formas aceitas: nome completo e "primeiro + último nome".
        self.formas = {" ".join(tokens)}
        if len(tokens) >= 2:
            self.formas.add(f"{tokens[0]} {tokens[-1]}")
        for apelido in filter(None, (a.strip() for a in apelidos.split("|"))):
            self.formas.add(normalizar(apelido).strip())

    def pontuacao(self, nome_arquivo_norm, digitos_arquivo):
        """0 = não bate; quanto maior, mais certeza."""
        if self.cpf and len(self.cpf) == 11 and self.cpf in digitos_arquivo:
            return 100
        melhor = 0
        for forma in self.formas:
            if forma and f" {forma} " in nome_arquivo_norm:
                melhor = max(melhor, len(forma.split()))
        return melhor


def carregar_clientes(caminho_csv):
    if not caminho_csv.exists():
        sys.exit(f"Arquivo de clientes não encontrado: {caminho_csv}\n"
                 "Exporte pelo sistema (Clientes Ativos → Exportar p/ automação) "
                 "ou crie um CSV com as colunas: nome;cpf;apelidos")
    with open(caminho_csv, encoding="utf-8-sig", newline="") as f:
        amostra = f.read(2048)
        f.seek(0)
        delimitador = ";" if amostra.count(";") >= amostra.count(",") else ","
        leitor = csv.DictReader(f, delimiter=delimitador)
        leitor.fieldnames = [normalizar(c).strip() for c in (leitor.fieldnames or [])]
        clientes = [Cliente(l.get("nome", ""), l.get("cpf", ""), l.get("apelidos", "") or "")
                    for l in leitor if (l.get("nome") or "").strip()]
    if not clientes:
        sys.exit(f"Nenhum cliente encontrado em {caminho_csv}")
    return clientes


def identificar_cliente(arquivo, clientes):
    """Retorna o cliente correspondente, ou None se nenhum/ambíguo."""
    texto = normalizar(arquivo.stem)
    digitos = so_digitos(arquivo.stem)
    pontos = [(c.pontuacao(texto, digitos), c) for c in clientes]
    pontos = [p for p in pontos if p[0] > 0]
    if not pontos:
        return None
    pontos.sort(key=lambda p: p[0], reverse=True)
    if len(pontos) > 1 and pontos[0][0] == pontos[1][0]:
        return None  # empate: melhor não arriscar
    return pontos[0][1]


def identificar_categoria(arquivo, cliente=None):
    texto = normalizar(arquivo.stem)
    if cliente:  # o nome da cliente não deve influenciar a categoria
        for forma in sorted(cliente.formas, key=len, reverse=True):
            texto = texto.replace(f" {forma} ", " ")
    for categoria, termos in CATEGORIAS:
        if any(f" {normalizar(t).strip()} " in texto for t in termos):
            return categoria
    return CATEGORIA_PADRAO


# --------------------------------------------------------------- organização
def arquivos_pendentes(entrada, destino):
    agora = time.time()
    for arq in sorted(entrada.iterdir()):
        if not arq.is_file():
            continue
        if arq.name.lower() in IGNORAR or arq.name.startswith(("~$", ".")):
            continue
        if arq.suffix.lower() in EXTENSOES_TEMPORARIAS:
            continue
        if agora - arq.stat().st_mtime < 5:
            continue  # provavelmente ainda está sendo baixado/copiado
        if destino in arq.resolve().parents:
            continue
        yield arq


def organizar(entrada, destino, clientes, simular=False):
    movimentos = []
    for arq in arquivos_pendentes(entrada, destino):
        cliente = identificar_cliente(arq, clientes)
        if cliente:
            pasta = destino / cliente.pasta / identificar_categoria(arq, cliente)
        else:
            pasta = destino / PASTA_NAO_IDENTIFICADOS
        alvo = destino_livre(pasta / arq.name)
        rotulo = cliente.nome if cliente else "NÃO IDENTIFICADO"
        print(f"{'[simulação] ' if simular else ''}{arq.name}  →  "
              f"{alvo.relative_to(destino)}   ({rotulo})")
        if not simular:
            pasta.mkdir(parents=True, exist_ok=True)
            shutil.move(str(arq), str(alvo))
        movimentos.append((arq, alvo, rotulo))

    if movimentos and not simular:
        gravar_log(destino, movimentos)
    nao_id = sum(1 for m in movimentos if m[2] == "NÃO IDENTIFICADO")
    print(f"\n{len(movimentos)} arquivo(s) {'seriam movidos' if simular else 'movidos'}"
          f" · {nao_id} não identificado(s).")
    return movimentos


def gravar_log(destino, movimentos):
    pasta_logs = destino / PASTA_LOGS
    pasta_logs.mkdir(parents=True, exist_ok=True)
    nome = datetime.now().strftime("organizacao_%Y-%m-%d_%H-%M-%S.csv")
    with open(pasta_logs / nome, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["data_hora", "origem", "destino", "cliente"])
        agora = datetime.now().isoformat(timespec="seconds")
        for origem, alvo, rotulo in movimentos:
            w.writerow([agora, str(origem), str(alvo), rotulo])
    print(f"Log salvo em {pasta_logs / nome}")


def desfazer(destino):
    pasta_logs = destino / PASTA_LOGS
    logs = sorted(pasta_logs.glob("organizacao_*.csv")) if pasta_logs.exists() else []
    if not logs:
        sys.exit("Nenhuma execução anterior para desfazer.")
    ultimo = logs[-1]
    with open(ultimo, encoding="utf-8-sig", newline="") as f:
        linhas = list(csv.DictReader(f, delimiter=";"))
    for linha in reversed(linhas):
        origem, alvo = Path(linha["origem"]), Path(linha["destino"])
        if not alvo.exists():
            print(f"Não encontrado (ignorado): {alvo}")
            continue
        volta = destino_livre(origem)
        volta.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(alvo), str(volta))
        print(f"{alvo.name}  →  {volta}")
        # remove pastas que ficaram vazias
        for pasta in (alvo.parent, alvo.parent.parent):
            if pasta != destino and pasta.exists() and not any(pasta.iterdir()):
                pasta.rmdir()
    ultimo.rename(ultimo.with_suffix(".desfeito"))
    print(f"\nExecução de {ultimo.stem.replace('organizacao_', '')} desfeita.")


# ----------------------------------------------------------------------- CLI
def main():
    base = Path(__file__).resolve().parent
    p = argparse.ArgumentParser(description="Organiza arquivos de clientes em pastas.")
    p.add_argument("--entrada", type=Path, help="Pasta com os arquivos soltos a organizar")
    p.add_argument("--destino", type=Path, required=True,
                   help="Pasta raiz onde ficam as pastas dos clientes")
    p.add_argument("--clientes", type=Path, default=base / "clientes.csv",
                   help="CSV com nome;cpf;apelidos (padrão: clientes.csv ao lado do script)")
    p.add_argument("--simular", action="store_true",
                   help="Só mostra o que seria feito, sem mover nada")
    p.add_argument("--monitorar", type=int, metavar="SEGUNDOS",
                   help="Fica rodando e verifica a pasta de entrada a cada N segundos")
    p.add_argument("--desfazer", action="store_true",
                   help="Desfaz a última organização (usa o log em <destino>/_Logs)")
    a = p.parse_args()

    destino = a.destino.expanduser().resolve()
    if a.desfazer:
        desfazer(destino)
        return
    if not a.entrada:
        p.error("--entrada é obrigatório (exceto com --desfazer)")
    entrada = a.entrada.expanduser().resolve()
    if not entrada.is_dir():
        sys.exit(f"Pasta de entrada não existe: {entrada}")

    clientes = carregar_clientes(a.clientes.expanduser())
    print(f"{len(clientes)} cliente(s) carregado(s) de {a.clientes}\n")

    if not a.monitorar:
        organizar(entrada, destino, clientes, a.simular)
        return

    print(f"Monitorando {entrada} a cada {a.monitorar}s (Ctrl+C para parar)...")
    try:
        while True:
            if any(True for _ in arquivos_pendentes(entrada, destino)):
                print(f"\n--- {datetime.now():%d/%m/%Y %H:%M:%S} ---")
                organizar(entrada, destino, clientes, a.simular)
            time.sleep(a.monitorar)
    except KeyboardInterrupt:
        print("\nMonitoramento encerrado.")


if __name__ == "__main__":
    main()
