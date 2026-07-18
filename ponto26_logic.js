
(function(){
  const fileBtn = document.getElementById('fileBtn');
  const fileInput = document.getElementById('tabela2File');
  const fileName = document.getElementById('fileName');
  const processBtn = document.getElementById('processBtn');
  const tabela1Input = document.getElementById('tabela1Input');
  const resultArea = document.getElementById('resultArea');
  const downloadRow = document.getElementById('downloadRow');
  const downloadBtn = document.getElementById('downloadBtn');
  const countNote = document.getElementById('countNote');
  const stampWrap = document.getElementById('stampWrap');
  const stampBadge = document.getElementById('stampBadge');
  const stampText = document.getElementById('stampText');

  // Passo 1 — upload do PDF do edital e colagem manual (alternativa)
  const pdfFileBtn = document.getElementById('pdfFileBtn');
  const pdfFileInput = document.getElementById('pdfFileInput');
  const pdfFileName = document.getElementById('pdfFileName');
  const pdfStatusMsg = document.getElementById('pdfStatusMsg');
  const btnColarManual = document.getElementById('btnColarManual');
  const colarWrap = document.getElementById('colarWrap');

  let tabela2Rows = [];
  let outputRows = [];

  const OUT_COLS = ["Classificação","CPF","Nome do candidato","Nota final","E-mail","Telefone celular","Telefone fixo","PNE","VS","AFRO","INDÍGENA"];

  // Utilitários compartilhados vêm de core.js (carregado antes deste script).
  const { escapeHtml, csvEscape, normName, detectDelimiter, parseCSV } = TJPRCore;

  pdfFileBtn.addEventListener('click', () => pdfFileInput.click());

  // Um novo upload sempre descarta o estado anterior (extração, resultado do
  // cruzamento, download) — evita mistura de dados quando o usuário troca o
  // arquivo, por exemplo após enviar o PDF errado.
  function resetarEstado(){
    tabela1Input.value = '';
    outputRows = [];
    tabela2Rows = [];
    pdfStatusMsg.style.display = 'none';
    pdfStatusMsg.className = 'notice-banner';
    colarWrap.style.display = 'none';
    stampWrap.classList.remove('show');
    resultArea.innerHTML = '<p class="empty-hint">A tabela final aparecerá aqui após o processamento.</p>';
    downloadRow.style.display = 'none';
    checkReady();
  }

  // A extração começa automaticamente assim que o arquivo é escolhido —
  // sem botão intermediário.
  pdfFileInput.addEventListener('change', () => {
    const file = pdfFileInput.files && pdfFileInput.files[0];
    pdfFileName.textContent = file ? file.name : 'Nenhum arquivo selecionado';
    resetarEstado();
    if(file) lerPdf();
  });

  btnColarManual.addEventListener('click', () => {
    colarWrap.style.display = colarWrap.style.display === 'none' ? 'block' : 'none';
  });

  fileBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    if(fileInput.files && fileInput.files[0]){
      fileName.textContent = fileInput.files[0].name;
      checkReady();
    } else {
      fileName.textContent = 'Nenhum arquivo selecionado';
    }
  });

  tabela1Input.addEventListener('input', checkReady);

  function checkReady(){
    const hasTabela1 = tabela1Input.value.trim().length > 0;
    const hasTabela2 = fileInput.files && fileInput.files[0];
    processBtn.disabled = !(hasTabela1 && hasTabela2);
  }

  // normName, detectDelimiter e parseCSV vêm do TJPRCore (ver bloco compartilhado acima).

  // Table 1 always has the fixed shape ORDEM / INSCRIÇÃO / NOME / NOTA / RESERVA(opcional).
  // Rather than splitting on delimiters (fragile when names have single spaces and the
  // paste is plain aligned text, not real tabs), each data line is matched against a
  // pattern that recognizes the two leading numbers, a trailing decimal (NOTA), and an
  // optional trailing X.X.X code (RESERVA) — everything in between is the NOME.
  const ROW_RE = /^(\d+)\s+(\d+)\s+(.+?)\s+(\d{1,3}(?:[.,]\d{1,2})?)(?:\s+(\d(?:[.,]\d){1,3}))?\s*$/;

  function parseTabela1(text){
    const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').map(l=>l.trim()).filter(l => l !== '');
    if(lines.length < 2) return { rows: [], errors: [] };

    // skip the header line (identified by containing "ORDEM"); if not found, assume line 0 is header anyway
    let startIdx = 0;
    if(/ORDEM/i.test(lines[0])) startIdx = 1;

    const rows = [];
    const errors = [];
    for(let i=startIdx;i<lines.length;i++){
      const line = lines[i];
      const m = line.match(ROW_RE);
      if(!m){
        errors.push(line);
        continue;
      }
      rows.push({
        ORDEM: m[1],
        INSCRICAO: m[2],
        NOME: m[3].trim(),
        NOTA: m[4].replace(',', '.'),
        RESERVA: m[5] || ''
      });
    }
    return { rows, errors };
  }

  // A extração do PDF (via pdf.js, em core.js) devolve o texto agrupado por
  // linha visual do documento. Quando o nome do candidato é longo, a própria
  // tabela do edital "quebra" a célula em duas linhas — nesse caso o PDF entrega
  // ORDEM+INSCRIÇÃO numa linha, o NOME na linha seguinte e a NOTA (e RESERVA,
  // se houver) numa terceira linha. Por isso, em vez de tentar casar cada linha
  // isoladamente, acumulamos o texto de cada registro até a próxima linha que
  // comece com "ORDEM INSCRIÇÃO" (ou o fim da tabela) e só então remontamos uma
  // única linha por registro — que é reaproveitada pelo mesmo parseTabela1() já
  // usado na colagem manual (ROW_RE já sabe separar NOME, NOTA e RESERVA).
  const PDF_ROW_START_RE = /^(\d{1,3})\s+(\d{4,9})\s*(.*)$/;
  const PDF_BOILERPLATE_RE = /^(TRIBUNAL DE JUSTIÇA|Pç\.|SEI!TJPR|SEI!DOC|EDITAL[\s\u00baº°]|PROCESSO SELETIVO|GABINETE|VARA |JUIZADO|SERVI[ÇC]O DE|SECRETARIA DA|DIVIS[ÃA]O |Documento assinado|A autenticidade|assinatura|www\.tjpr)/i;

  function pdfTextToTabela1Lines(rawText){
    const allLines = rawText.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').map(l => l.trim()).filter(l => l !== '');

    // a tabela termina onde começa o bloco de assinatura ("Curitiba, ...")
    const fimIdx = allLines.findIndex(l => /^curitiba\b/i.test(l));
    const scanLines = fimIdx === -1 ? allLines : allLines.slice(0, fimIdx);

    const rows = [];
    let current = null;
    scanLines.forEach(line => {
      // pula linhas de cabeçalho da tabela (podem se repetir em páginas seguintes)
      if(/ORDEM/i.test(line) && /NOME/i.test(line)) return;
      // pula cabeçalho/rodapé institucional do edital
      if(PDF_BOILERPLATE_RE.test(line)) return;

      const m = line.match(PDF_ROW_START_RE);
      if(m){
        if(current) rows.push(current);
        current = { ordem: m[1], inscricao: m[2], buffer: (m[3] || '').trim() };
      } else if(current){
        current.buffer = (current.buffer + ' ' + line).trim();
      }
      // linhas antes do primeiro registro reconhecido (nome da unidade, número do
      // edital etc.) são ignoradas
    });
    if(current) rows.push(current);

    return rows.map(r => r.ordem + '\t' + r.inscricao + '\t' + r.buffer);
  }

  function mostrarStatus(html, tipo){ // tipo: '' (andamento) | 'ok' | 'warn'
    pdfStatusMsg.className = 'notice-banner' + (tipo ? ' ' + tipo : '');
    pdfStatusMsg.innerHTML = html;
    pdfStatusMsg.style.display = 'block';
  }

  async function lerPdf(){
    const file = pdfFileInput.files && pdfFileInput.files[0];
    if(!file) return;
    mostrarStatus('Lendo o PDF e extraindo a tabela de classificação...');
    try{
      const texto = await TJPRCore.pdfToText(file);
      if(texto.replace(/\s+/g,'').length < 30){
        throw new Error('o arquivo quase não contém texto extraível (provável digitalização/imagem)');
      }
      const linhas = pdfTextToTabela1Lines(texto);
      if(linhas.length === 0){
        mostrarStatus('<strong>Não foi possível localizar a tabela de classificação neste PDF.</strong> Confira se o arquivo é o Edital de Classificação Final, ou cole o conteúdo manualmente pelo botão "Colar tabela manualmente".', 'warn');
        return;
      }

      tabela1Input.value = 'ORDEM\tINSCRIÇÃO\tNOME\tNOTA\tRESERVA\n' + linhas.join('\n');

      // reaproveita o parser já usado na colagem manual para conferir e avisar
      // o usuário de eventuais linhas não reconhecidas, antes do Passo 2
      const conferencia = parseTabela1(tabela1Input.value);
      if(conferencia.errors.length > 0){
        mostrarStatus('<strong>' + conferencia.rows.length + ' registro(s)</strong> extraído(s) do PDF, mas <strong>' + conferencia.errors.length + ' linha(s) não reconhecida(s)</strong> — confira e corrija no quadro abaixo antes de processar.', 'warn');
      } else {
        mostrarStatus('<strong>' + conferencia.rows.length + ' registro(s)</strong> extraído(s) do PDF. Confira os dados no quadro abaixo (pode editar se necessário) e envie o CSV cadastral no Passo 2.', 'ok');
      }
      colarWrap.style.display = 'block'; // abre a tabela para conferência do usuário

      checkReady();
    }catch(e){
      mostrarStatus('<strong>Não foi possível ler o PDF</strong> (' + TJPRCore.escapeHtml(e.message) + '). Se o arquivo for uma digitalização (imagem), copie o texto da tabela e cole manualmente pelo botão "Colar tabela manualmente".', 'warn');
    }
  }

  function findCol(headers, candidates){
    for(const cand of candidates){
      const idx = headers.findIndex(h => normName(h) === normName(cand));
      if(idx !== -1) return headers[idx];
    }
    return null;
  }

  function processFiles(){
    const t1 = parseTabela1(tabela1Input.value);
    if(t1.rows.length === 0){
      alert('Não foi possível interpretar nenhuma linha da Tabela 1. Verifique se cada linha começa com ORDEM e INSCRIÇÃO numéricos, seguidos do nome e de uma nota (ex: 1  5116156  KADU LAIBIDA CORREA  8.00).');
      return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(e){
      let text = e.target.result;
      // strip BOM
      if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      const csvRows = parseCSV(text);
      if(csvRows.length < 2){
        alert('O arquivo CSV da Tabela 2 parece vazio ou inválido.');
        return;
      }
      const h2 = csvRows[0].map(h => h.trim());
      const colCPF = findCol(h2, ['CPF']);
      const colNome2 = findCol(h2, ['Nome do candidato','Nome']);
      const colEmail = findCol(h2, ['E-mail','Email']);
      const colCel = findCol(h2, ['Telefone celular','Celular']);
      const colFixo = findCol(h2, ['Telefone fixo','Fixo']);

      tabela2Rows = csvRows.slice(1).map(r => {
        const obj = {};
        h2.forEach((h,idx) => obj[h] = r[idx] !== undefined ? r[idx] : '');
        return obj;
      });

      // build lookup by normalized name
      const lookup = {};
      const dupNames = new Set();
      tabela2Rows.forEach(r => {
        const key = normName(colNome2 ? r[colNome2] : '');
        if(!key) return;
        if(lookup[key]) dupNames.add(key);
        else lookup[key] = r;
      });

      const unmatched = [];
      outputRows = t1.rows.map(r1 => {
        const nome1 = r1.NOME || '';
        const key = normName(nome1);
        const match = lookup[key];
        if(!match) unmatched.push(nome1);

        const reserva = r1.RESERVA || '';
        const flag = (code) => reserva.indexOf(code) !== -1 ? 'S' : 'N';

        return {
          "Classificação": r1.ORDEM || '',
          "CPF": match && colCPF ? match[colCPF] : '',
          "Nome do candidato": match && colNome2 ? match[colNome2] : nome1,
          "Nota final": (r1.NOTA || '').replace('.', ','),
          "E-mail": match && colEmail ? match[colEmail] : '',
          "Telefone celular": match && colCel ? match[colCel] : '',
          "Telefone fixo": match && colFixo ? match[colFixo] : '',
          "PNE": flag('2.1.2'),
          "VS": flag('2.1.4'),
          "AFRO": flag('2.1.1'),
          "INDÍGENA": flag('2.1.3'),
          "_unmatched": !match
        };
      });

      renderResults(unmatched, dupNames.size, t1.errors);
    };
    reader.onerror = function(){
      alert('Erro ao ler o arquivo CSV.');
    };
    reader.readAsText(file, 'UTF-8');
  }

  function renderResults(unmatched, dupCount, parseErrors){
    parseErrors = parseErrors || [];
    // stamp
    stampWrap.classList.add('show');
    if(unmatched.length === 0 && parseErrors.length === 0){
      stampBadge.classList.remove('warn');
      stampBadge.textContent = 'CONFERIDO';
      stampText.innerHTML = '<strong>' + outputRows.length + ' registros</strong> cruzados com sucesso. Todos os nomes da Tabela 1 foram encontrados na Tabela 2.';
    } else {
      stampBadge.classList.add('warn');
      stampBadge.textContent = 'REVISAR';
      let html = '<strong>' + outputRows.length + ' registros</strong> gerados';
      if(unmatched.length > 0){
        html += ' — <strong style="color:var(--stamp-red)">' + unmatched.length + ' sem correspondência</strong> na Tabela 2 (linhas destacadas abaixo, campos vazios preenchidos apenas com dados da Tabela 1)';
      }
      html += '.';
      if(dupCount > 0){
        html += '<br>Atenção: ' + dupCount + ' nome(s) duplicado(s) na Tabela 2 — usada a primeira ocorrência.';
      }
      if(unmatched.length > 0){
        html += '<ul class="warn-list">' + unmatched.slice(0,12).map(n => '<li>' + escapeHtml(n) + '</li>').join('') + (unmatched.length>12 ? '<li>… e mais ' + (unmatched.length-12) + '</li>' : '') + '</ul>';
      }
      if(parseErrors.length > 0){
        html += '<br><strong style="color:var(--stamp-red)">' + parseErrors.length + ' linha(s) da Tabela 1 não reconhecida(s)</strong> e ignorada(s) — confira o formato (ORDEM  INSCRIÇÃO  NOME  NOTA  RESERVA):';
        html += '<ul class="warn-list">' + parseErrors.slice(0,8).map(n => '<li>' + escapeHtml(n) + '</li>').join('') + (parseErrors.length>8 ? '<li>… e mais ' + (parseErrors.length-8) + '</li>' : '') + '</ul>';
      }
      stampText.innerHTML = html;
    }

    // table
    let html = '<div class="table-scroll"><table><thead><tr>' +
      OUT_COLS.map(c => '<th>'+c+'</th>').join('') +
      '</tr></thead><tbody>';
    outputRows.forEach(r => {
      html += '<tr' + (r._unmatched ? ' class="unmatched"' : '') + '>' +
        OUT_COLS.map(c => '<td>'+escapeHtml(r[c] || '')+'</td>').join('') +
        '</tr>';
    });
    html += '</tbody></table></div>';
    resultArea.innerHTML = html;

    downloadRow.style.display = 'flex';
    countNote.textContent = outputRows.length + ' linha(s) — CSV separado por ";" (abre em colunas automaticamente no Excel PT-BR).';
  }

  // escapeHtml e csvEscape vêm do TJPRCore (ver bloco compartilhado acima).

  function downloadCSV(){
    const lines = [];
    lines.push(OUT_COLS.map(csvEscape).join(';'));
    outputRows.forEach(r => {
      lines.push(OUT_COLS.map(c => csvEscape(r[c])).join(';'));
    });
    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const stamp = now.toISOString().slice(0,10);
    a.href = url;
    a.download = 'tabela_final_classificacao_' + stamp + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  processBtn.addEventListener('click', processFiles);
  downloadBtn.addEventListener('click', downloadCSV);
})();
