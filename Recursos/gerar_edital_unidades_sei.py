#!/usr/bin/env python3
"""Gera edital_unidades_sei.js a partir da planilha de unidades do TJPR.

Uso (da raiz do projeto):
    python3 Recursos/gerar_edital_unidades_sei.py [caminho_da_planilha.xlsx]

Sem argumento, procura por qualquer "report*.xlsx" dentro de Recursos/ (pega o
mais recente, pela data de modificação — útil quando a pasta é sincronizada
com uma planilha na nuvem e o nome do arquivo muda a cada exportação, ex.:
"report (2).xlsx" -> "report (9).xlsx").
Sobrescreve edital_unidades_sei.js na raiz do projeto.

Espera colunas "Sigla" e "NomeUnidade" (nessa ou em outra posição — a busca
é pelo cabeçalho, não pela letra da coluna). NomeUnidade vem como uma cadeia
hierárquica separada por "|" (ex.: "IRATI|SECRETARIA ESPECIALIZADA...");
essa cadeia é gravada como está — a montagem do nome por extenso (ordem
invertida, maiúsculas, conectores "DO"/"DA"/"DA COMARCA DE") é feita em
tempo de execução por nomeUnidadePorExtenso() em edital_logic.js, não aqui.

Não depende de bibliotecas externas (só a standard library), porque o
ambiente de desenvolvimento deste projeto não tem pandas/openpyxl
disponíveis — o .xlsx é lido diretamente como zip + XML.
"""
import glob
import html
import json
import os
import re
import sys
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def achar_planilha(argv):
    if len(argv) > 1:
        return Path(argv[1])
    candidatos = glob.glob(str(RAIZ / 'Recursos' / 'report*.xlsx'))
    if not candidatos:
        sys.exit('Nenhuma planilha "report*.xlsx" encontrada em Recursos/.')
    candidatos.sort(key=os.path.getmtime, reverse=True)
    return Path(candidatos[0])


def celulas_da_linha(row_xml, col_letra):
    m = re.search(r'<c r="' + col_letra + r'\d+"[^>]*>(.*?)</c>', row_xml, re.S)
    if not m:
        return None
    tm = re.search(r'<t[^>]*>(.*?)</t>', m.group(1), re.S)
    return html.unescape(tm.group(1)) if tm else ''


def letra_da_coluna(cabecalho_xml, nome_coluna):
    """Descobre em qual coluna (A, B, C...) está o cabeçalho informado."""
    for m in re.finditer(r'<c r="([A-Z]+)1"[^>]*>(.*?)</c>', cabecalho_xml, re.S):
        letra, conteudo = m.group(1), m.group(2)
        tm = re.search(r'<t[^>]*>(.*?)</t>', conteudo, re.S)
        if tm and html.unescape(tm.group(1)).strip() == nome_coluna:
            return letra
    return None


def main():
    caminho = achar_planilha(sys.argv)
    z = zipfile.ZipFile(caminho)
    xml = z.read('xl/worksheets/sheet1.xml').decode('utf-8')
    partes = xml.split('<row ')
    cabecalho_xml = '<row ' + partes[1]

    col_sigla = letra_da_coluna(cabecalho_xml, 'Sigla')
    col_nome = letra_da_coluna(cabecalho_xml, 'NomeUnidade')
    if not col_sigla or not col_nome:
        sys.exit('Não encontrei as colunas "Sigla"/"NomeUnidade" no cabeçalho da planilha.')

    unidades = {}
    for p in partes[2:]:
        row_xml = '<row ' + p
        sigla = celulas_da_linha(row_xml, col_sigla)
        nome = celulas_da_linha(row_xml, col_nome)
        if not sigla or not nome or '|' not in nome:
            continue  # descarta linhas de rodapé/resumo e linhas sem a cadeia hierárquica
        unidades[sigla.strip().upper()] = nome.strip()

    destino = RAIZ / 'edital_unidades_sei.js'
    corpo = json.dumps(unidades, ensure_ascii=False, indent=0, sort_keys=True)
    destino.write_text(
        '/* Gerado automaticamente por Recursos/gerar_edital_unidades_sei.py a partir de\n'
        '   ' + caminho.name + ' — não editar à mão, regenerar o arquivo.\n'
        '   sigla (SEI) -> cadeia hierárquica bruta da planilha, separada por "|"\n'
        '   (a montagem do nome por extenso acontece em edital_logic.js). */\n'
        'const UNIDADES_SEI=' + corpo + ';\n',
        encoding='utf-8'
    )
    print(f'{len(unidades)} unidades gravadas em {destino} (fonte: {caminho.name})')


if __name__ == '__main__':
    main()
