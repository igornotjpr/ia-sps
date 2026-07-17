
(function(){
  const fileBtn1 = document.getElementById('p20FileBtn1');
  const fileInput1 = document.getElementById('p20Tabela1File');
  const fileName1 = document.getElementById('p20FileName1');
  const fileBtn2 = document.getElementById('p20FileBtn2');
  const fileInput2 = document.getElementById('p20Tabela2File');
  const fileName2 = document.getElementById('p20FileName2');
  const maxInput = document.getElementById('p20MaxInput');
  const processBtn = document.getElementById('p20ProcessBtn');
  const resultArea = document.getElementById('p20ResultArea');
  const downloadRow = document.getElementById('p20DownloadRow');
  const copyBtn = document.getElementById('p20CopyBtn');
  const downloadBtn = document.getElementById('p20DownloadBtn');
  const countNote = document.getElementById('p20CountNote');
  const stampWrap = document.getElementById('p20StampWrap');
  const stampBadge = document.getElementById('p20StampBadge');
  const stampText = document.getElementById('p20StampText');

  const OUT_COLS = ["ORDEM","INSCRIÇÃO","NOME","NOTA","RESERVA"];

  const RESERVA_MAP = [
    { match: 'PRETO OU PARDO', code: '2.1.1' },
    { match: 'PESSOA COM DEFICIENCIA', code: '2.1.2' },
    { match: 'INDIGENA', code: '2.1.3' },
    { match: 'VULNERABILIDADE SOCIAL', code: '2.1.4' }
  ];

  let outputRows = [];

  fileBtn1.addEventListener('click', () => fileInput1.click());
  fileBtn2.addEventListener('click', () => fileInput2.click());

  fileInput1.addEventListener('change', () => {
    fileName1.textContent = (fileInput1.files && fileInput1.files[0]) ? fileInput1.files[0].name : 'Nenhum arquivo selecionado';
    checkReady();
  });
  fileInput2.addEventListener('change', () => {
    fileName2.textContent = (fileInput2.files && fileInput2.files[0]) ? fileInput2.files[0].name : 'Nenhum arquivo selecionado';
    checkReady();
  });
  maxInput.addEventListener('input', checkReady);

  function checkReady(){
    const hasT1 = fileInput1.files && fileInput1.files[0];
    const hasT2 = fileInput2.files && fileInput2.files[0];
    const maxOk = /^\d+$/.test(maxInput.value.trim()) && parseInt(maxInput.value.trim(),10) > 0;
    processBtn.disabled = !(hasT1 && hasT2 && maxOk);
  }

  function normHeader(h){
    return String(h===undefined||h===null?'':h).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  }
  // normName usa o normalizador compartilhado do TJPRCore; o wrapper String(s||'')
  // garante que valores vindos de células de planilha (que podem não ser string)
  // não quebrem a normalização.
  const { escapeHtml, csvEscape } = TJPRCore;
  function normName(s){ return TJPRCore.normName(String(s || '')); }
  function normInscricao(v){
    if(v === null || v === undefined) return '';
    let s = String(v).trim();
    if(s === '') return '';
    s = s.replace(/\.0+$/,'');
    s = s.replace(/[^\d]/g,'');
    return s;
  }
  function findCol(sampleRow, candidates){
    const keys = Object.keys(sampleRow || {});
    for(const cand of candidates){
      const idx = keys.findIndex(k => normHeader(k) === normHeader(cand));
      if(idx !== -1) return keys[idx];
    }
    return null;
  }
  function mapReserva(v){
    const n = normHeader(v);
    if(!n) return '';
    const hit = RESERVA_MAP.find(r => r.match === n);
    return hit ? hit.code : '';
  }
  function formatNota(v){
    if(v === null || v === undefined || String(v).trim()==='') return { ok:true, value:'' };
    const num = parseFloat(String(v).trim().replace(',', '.'));
    if(isNaN(num)) return { ok:false, value:String(v) };
    return { ok:true, value:num.toFixed(2).replace('.', ',') };
  }


  function readWorkbookFile(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function(e){
        try{
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
          resolve(rows);
        } catch(err){
          reject(err);
        }
      };
      reader.onerror = function(){ reject(new Error('Falha ao ler o arquivo.')); };
      reader.readAsArrayBuffer(file);
    });
  }

  processBtn.addEventListener('click', async function(){
    processBtn.disabled = true;
    processBtn.textContent = 'Processando...';
    try{
      await processFiles();
    } finally {
      processBtn.textContent = 'Processar e cruzar tabelas';
      checkReady();
    }
  });

  async function processFiles(){
    let t1, t2;
    try{
      t1 = await readWorkbookFile(fileInput1.files[0]);
    } catch(err){
      alert('Não foi possível ler o arquivo da Tabela 1. Verifique se é um arquivo .xlsx/.xls/.csv válido, exportado da Fábrica de Provas (Relatório de Classificação Final).');
      return;
    }
    try{
      t2 = await readWorkbookFile(fileInput2.files[0]);
    } catch(err){
      alert('Não foi possível ler o arquivo da Tabela 2. Verifique se é um arquivo .xlsx/.xls/.csv válido, exportado da Fábrica de Provas (Relatório de inscritos).');
      return;
    }

    if(!t1 || t1.length === 0){
      alert('A Tabela 1 (Classificação Final) está vazia ou não foi possível interpretar nenhuma linha.');
      return;
    }
    if(!t2 || t2.length === 0){
      alert('A Tabela 2 (Relatório de inscritos) está vazia ou não foi possível interpretar nenhuma linha.');
      return;
    }

    const colClass = findCol(t1[0], ['CLASSIFICAÇÃO','CLASSIFICACAO']);
    const colInsc1 = findCol(t1[0], ['INSCRIÇÃO','INSCRICAO']);
    const colNome1 = findCol(t1[0], ['NOME']);
    const colFinal = findCol(t1[0], ['FINAL']);

    if(!colClass || !colInsc1 || !colNome1 || !colFinal){
      alert('Não foi possível identificar as colunas obrigatórias da Tabela 1 (CLASSIFICAÇÃO, INSCRIÇÃO, NOME, FINAL). Colunas encontradas no arquivo: ' + Object.keys(t1[0]).join(', '));
      return;
    }

    const colInsc2 = findCol(t2[0], ['INSCRIÇÃO','INSCRICAO']);
    const colNome2 = findCol(t2[0], ['NOME']);
    const colReserva2 = findCol(t2[0], ['RESERVA ESPECIAL']);

    if(!colInsc2 || !colNome2 || !colReserva2){
      alert('Não foi possível identificar as colunas obrigatórias da Tabela 2 (Inscrição, Nome, Reserva especial). Colunas encontradas no arquivo: ' + Object.keys(t2[0]).join(', '));
      return;
    }

    // lookup Tabela 2: por inscrição (chave principal) e por nome normalizado (reserva)
    const lookupByInsc = {};
    const lookupByName = {};
    t2.forEach(r => {
      const insc = normInscricao(r[colInsc2]);
      if(insc && !lookupByInsc[insc]) lookupByInsc[insc] = r;
      const nome = normName(r[colNome2]);
      if(nome && !lookupByName[nome]) lookupByName[nome] = r;
    });

    const maxNum = parseInt(maxInput.value.trim(), 10);

    let reprovadosCount = 0;
    let notaErrors = [];
    let classErrors = [];
    let filtered = [];

    t1.forEach(r => {
      const classRaw = String(r[colClass]===undefined||r[colClass]===null?'':r[colClass]).trim();
      if(classRaw === '') return; // linha vazia, ignora silenciosamente
      const classNorm = normHeader(classRaw);
      if(classNorm === 'REPROVADO' || classNorm === 'DESCLASSIFICADO' || classNorm === 'ELIMINADO'){
        reprovadosCount++;
        return;
      }
      const classNum = parseInt(classRaw, 10);
      if(isNaN(classNum)){
        classErrors.push(classRaw + ' — ' + (r[colNome1] || '(nome não identificado)'));
        return;
      }
      filtered.push({
        ordem: classNum,
        insc: r[colInsc1],
        nome: r[colNome1],
        final: r[colFinal]
      });
    });

    if(filtered.length === 0){
      alert('Nenhum candidato classificado (não-REPROVADO) foi encontrado na Tabela 1. Verifique o arquivo enviado.');
      return;
    }

    filtered.sort((a,b) => a.ordem - b.ordem);
    const totalDisponivel = filtered.length;
    const limited = filtered.slice(0, maxNum);

    let unmatched = [];
    outputRows = limited.map(r => {
      const inscKey = normInscricao(r.insc);
      let match = lookupByInsc[inscKey];
      if(!match) match = lookupByName[normName(r.nome)];
      if(!match) unmatched.push(r.nome);

      const notaResult = formatNota(r.final);
      if(!notaResult.ok) notaErrors.push('Classificação ' + r.ordem + ' (' + r.nome + '): nota "' + notaResult.value + '" não numérica');

      return {
        "ORDEM": r.ordem,
        "INSCRIÇÃO": r.insc,
        "NOME": String(r.nome || '').toUpperCase(),
        "NOTA": notaResult.value,
        "RESERVA": match ? mapReserva(match[colReserva2]) : '',
        "_unmatched": !match
      };
    });

    renderResults({ reprovadosCount, classErrors, notaErrors, unmatched, totalDisponivel, maxNum });
  }

  function renderResults(info){
    stampWrap.classList.add('show');
    const temAviso = info.unmatched.length > 0 || info.classErrors.length > 0 || info.notaErrors.length > 0 || info.totalDisponivel < info.maxNum;

    if(!temAviso){
      stampBadge.classList.remove('warn');
      stampBadge.textContent = 'CONFERIDO';
      stampText.innerHTML = '<strong>' + outputRows.length + ' registros</strong> gerados com sucesso. Todos os nomes foram cruzados com a Tabela 2.';
    } else {
      stampBadge.classList.add('warn');
      stampBadge.textContent = 'REVISAR';
      let html = '<strong>' + outputRows.length + ' registros</strong> gerados';
      if(info.totalDisponivel < info.maxNum){
        html += ' — atenção: a Tabela 1 possui apenas <strong>' + info.totalDisponivel + '</strong> candidato(s) classificado(s) (não-REPROVADO), menos do que os ' + info.maxNum + ' solicitados';
      }
      html += '.';
      if(info.reprovadosCount > 0){
        html += '<br>' + info.reprovadosCount + ' candidato(s) marcado(s) como REPROVADO foram excluídos automaticamente.';
      }
      if(info.unmatched.length > 0){
        html += '<br><strong style="color:var(--stamp-red)">' + info.unmatched.length + ' candidato(s) sem correspondência</strong> na Tabela 2 (RESERVA deixado em branco, linhas destacadas abaixo):';
        html += '<ul class="warn-list">' + info.unmatched.slice(0,12).map(n => '<li>' + escapeHtml(n) + '</li>').join('') + (info.unmatched.length>12 ? '<li>… e mais ' + (info.unmatched.length-12) + '</li>' : '') + '</ul>';
      }
      if(info.classErrors.length > 0){
        html += '<br><strong style="color:var(--stamp-red)">' + info.classErrors.length + ' linha(s) da Tabela 1 com CLASSIFICAÇÃO não reconhecida</strong> e ignorada(s):';
        html += '<ul class="warn-list">' + info.classErrors.slice(0,8).map(n => '<li>' + escapeHtml(n) + '</li>').join('') + (info.classErrors.length>8 ? '<li>… e mais ' + (info.classErrors.length-8) + '</li>' : '') + '</ul>';
      }
      if(info.notaErrors.length > 0){
        html += '<br><strong style="color:var(--stamp-red)">' + info.notaErrors.length + ' nota(s) não numérica(s)</strong> — conferir manualmente:';
        html += '<ul class="warn-list">' + info.notaErrors.slice(0,8).map(n => '<li>' + escapeHtml(n) + '</li>').join('') + (info.notaErrors.length>8 ? '<li>… e mais ' + (info.notaErrors.length-8) + '</li>' : '') + '</ul>';
      }
      stampText.innerHTML = html;
    }

    let html = '<div class="simple-table-wrap"><table class="simple-table"><thead><tr>' +
      OUT_COLS.map(c => '<th>'+escapeHtml(c)+'</th>').join('') +
      '</tr></thead><tbody>';
    outputRows.forEach(r => {
      html += '<tr' + (r._unmatched ? ' class="p20-unmatched"' : '') + '>' +
        OUT_COLS.map(c => '<td>'+escapeHtml(r[c] === undefined || r[c] === null ? '' : r[c])+'</td>').join('') +
        '</tr>';
    });
    html += '</tbody></table></div>';
    resultArea.innerHTML = html;

    downloadRow.style.display = 'flex';
    countNote.textContent = outputRows.length + ' linha(s) na tabela final.';
  }

  // Cópia da tabela (TSV + HTML "limpo" para reconhecimento como tabela no
  // Word/Excel) usa a função genérica do TJPRCore — ver bloco compartilhado
  // no topo do arquivo para detalhes de por que <td> é usado em vez de <th>.
  function getCellValue(r, c){
    return r[c] === undefined || r[c] === null ? '' : r[c];
  }

  copyBtn.addEventListener('click', () => {
    TJPRCore.copyTableToClipboard(OUT_COLS, outputRows, getCellValue, copyBtn);
  });

  downloadBtn.addEventListener('click', function(){
    if(outputRows.length === 0) return;
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
    a.download = 'ponto20_classificacao_final_' + stamp + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
})();
