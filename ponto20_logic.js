
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
  // colunas efetivamente exibidas/exportadas — RESERVA é suprimida quando
  // nenhum aprovado é cotista e todos os nomes foram cruzados (ver processFiles)
  let activeCols = OUT_COLS;

  // Cada código de reserva aceita vários rótulos possíveis, porque a Fábrica de
  // Provas nem sempre grava o texto exatamente igual.
  const RESERVA_MAP = [
    { code: '2.1.1', termos: ['PRETO OU PARDO','PRETA OU PARDA','PRETO','PARDO','PRETA','PARDA','NEGRO','NEGRA'] },
    { code: '2.1.2', termos: ['PESSOA COM DEFICIENCIA','PESSOA COM DEFICIENCIA (PCD)','PCD','DEFICIENTE','DEFICIENCIA'] },
    { code: '2.1.3', termos: ['INDIGENA'] },
    { code: '2.1.4', termos: ['VULNERABILIDADE SOCIAL','HIPOSSUFICIENTE','HIPOSSUFICIENCIA'] }
  ];

  // Valores que significam "não é cotista" — ausência de reserva, não erro.
  const SEM_RESERVA = ['-','--','N/A','NA','NAO','NAO SE APLICA','NENHUMA','NENHUM',
                       'AMPLA CONCORRENCIA','AMPLA CONCORRENCIA (AC)','AC'];

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
  // A célula "Reserva especial" pode trazer MAIS DE UM rótulo separado por
  // vírgula (e às vezes o mesmo rótulo repetido, ex.: "Preto ou pardo, Preto ou
  // pardo"). Por isso a célula é quebrada em partes, cada parte é normalizada e
  // mapeada individualmente, com remoção de duplicatas. Valores que não batem
  // com nenhum termo conhecido são devolvidos em `desconhecidos` para virarem
  // aviso na tela — nunca são descartados em silêncio.
  function mapReserva(v){
    const partes = String(v === undefined || v === null ? '' : v)
      .split(/[,;\/|]+/)
      .map(normHeader)
      .filter(p => p !== '');
    const codes = [];
    const desconhecidos = [];
    partes.forEach(p => {
      if(SEM_RESERVA.indexOf(p) !== -1) return;
      const hit = RESERVA_MAP.find(r => r.termos.indexOf(p) !== -1);
      if(hit){
        if(codes.indexOf(hit.code) === -1) codes.push(hit.code);
      } else if(desconhecidos.indexOf(p) === -1){
        desconhecidos.push(p);
      }
    });
    codes.sort();
    return { code: codes.join(', '), desconhecidos: desconhecidos };
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
    // Opcional: o Relatório de Classificação Final também traz uma coluna
    // RESERVA. Ela é usada como conferência cruzada / rede de segurança.
    const colReserva1 = findCol(t1[0], ['RESERVA']);

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
        final: r[colFinal],
        reserva1: colReserva1 ? r[colReserva1] : ''
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
    let reservaErrors = [];
    let reservaDivergencias = [];

    outputRows = limited.map(r => {
      const inscKey = normInscricao(r.insc);
      let match = lookupByInsc[inscKey];
      if(!match) match = lookupByName[normName(r.nome)];
      if(!match) unmatched.push(r.nome);

      const notaResult = formatNota(r.final);
      if(!notaResult.ok) notaErrors.push('Classificação ' + r.ordem + ' (' + r.nome + '): nota "' + notaResult.value + '" não numérica');

      const rotulo = 'Classificação ' + r.ordem + ' (' + r.nome + ')';
      const res2 = match ? mapReserva(match[colReserva2]) : { code:'', desconhecidos:[] };
      const res1 = mapReserva(r.reserva1);

      res2.desconhecidos.forEach(d => reservaErrors.push(rotulo + ': valor de reserva não reconhecido na Tabela 2 — "' + d + '"'));
      res1.desconhecidos.forEach(d => reservaErrors.push(rotulo + ': valor de reserva não reconhecido na Tabela 1 — "' + d + '"'));

      // Tabela 2 (Relatório de inscritos) é a fonte principal; a Tabela 1 serve
      // de rede de segurança quando a inscrição não foi encontrada ou veio vazia.
      const reserva = res2.code || res1.code;
      if(match && res1.code !== res2.code){
        reservaDivergencias.push(rotulo + ': Tabela 1 indica "' + (res1.code || '(nenhuma)') +
          '" e Tabela 2 indica "' + (res2.code || '(nenhuma)') + '" — prevaleceu "' + (reserva || '(nenhuma)') + '"');
      }

      return {
        "ORDEM": r.ordem,
        "INSCRIÇÃO": r.insc,
        "NOME": String(r.nome || '').toUpperCase(),
        "NOTA": notaResult.value,
        "RESERVA": reserva,
        "_unmatched": !match
      };
    });

    // A coluna RESERVA só é suprimida quando está comprovadamente vazia: nenhum
    // aprovado cotista, todos os nomes cruzados com a Tabela 2, nenhum rótulo de
    // reserva não reconhecido e nenhuma divergência entre as duas tabelas. Em
    // qualquer dúvida, a coluna PERMANECE — é melhor uma coluna em branco a ser
    // conferida do que uma cota que desaparece do edital.
    const temReserva = outputRows.some(r => r["RESERVA"] !== '');
    const reservaSuprimida = !temReserva && unmatched.length === 0 &&
                             reservaErrors.length === 0 && reservaDivergencias.length === 0;
    activeCols = reservaSuprimida ? OUT_COLS.filter(c => c !== 'RESERVA') : OUT_COLS;

    renderResults({ reprovadosCount, classErrors, notaErrors, unmatched, totalDisponivel, maxNum,
                    reservaSuprimida, reservaErrors, reservaDivergencias });
  }

  function renderResults(info){
    stampWrap.classList.add('show');
    const temAviso = info.unmatched.length > 0 || info.classErrors.length > 0 || info.notaErrors.length > 0 ||
                     info.reservaErrors.length > 0 || info.reservaDivergencias.length > 0 ||
                     info.totalDisponivel < info.maxNum;

    if(!temAviso){
      stampBadge.classList.remove('warn');
      stampBadge.textContent = 'CONFERIDO';
      let okHtml = '<strong>' + outputRows.length + ' registros</strong> gerados com sucesso. Todos os nomes foram cruzados com a Tabela 2.';
      if(info.reservaSuprimida){
        okHtml += '<br>Nenhum candidato aprovado é cotista — a coluna RESERVA, vazia, foi suprimida da tabela final.';
      }
      stampText.innerHTML = okHtml;
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
      if(info.reservaSuprimida){
        html += '<br>Nenhum candidato aprovado é cotista — a coluna RESERVA, vazia, foi suprimida da tabela final.';
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
      if(info.reservaErrors.length > 0){
        html += '<br><strong style="color:var(--stamp-red)">' + info.reservaErrors.length + ' rótulo(s) de reserva não reconhecido(s)</strong> — a coluna RESERVA ficou em branco nesses casos, conferir manualmente:';
        html += '<ul class="warn-list">' + info.reservaErrors.slice(0,8).map(n => '<li>' + escapeHtml(n) + '</li>').join('') + (info.reservaErrors.length>8 ? '<li>… e mais ' + (info.reservaErrors.length-8) + '</li>' : '') + '</ul>';
      }
      if(info.reservaDivergencias.length > 0){
        html += '<br><strong style="color:var(--stamp-red)">' + info.reservaDivergencias.length + ' divergência(s) de reserva entre a Tabela 1 e a Tabela 2</strong> — conferir manualmente:';
        html += '<ul class="warn-list">' + info.reservaDivergencias.slice(0,8).map(n => '<li>' + escapeHtml(n) + '</li>').join('') + (info.reservaDivergencias.length>8 ? '<li>… e mais ' + (info.reservaDivergencias.length-8) + '</li>' : '') + '</ul>';
      }
      stampText.innerHTML = html;
    }

    let html = '<div class="simple-table-wrap"><table class="simple-table"><thead><tr>' +
      activeCols.map(c => '<th>'+escapeHtml(c)+'</th>').join('') +
      '</tr></thead><tbody>';
    outputRows.forEach(r => {
      html += '<tr' + (r._unmatched ? ' class="p20-unmatched"' : '') + '>' +
        activeCols.map(c => '<td>'+escapeHtml(r[c] === undefined || r[c] === null ? '' : r[c])+'</td>').join('') +
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
    TJPRCore.copyTableToClipboard(activeCols, outputRows, getCellValue, copyBtn);
  });

  downloadBtn.addEventListener('click', function(){
    if(outputRows.length === 0) return;
    const lines = [];
    lines.push(activeCols.map(csvEscape).join(';'));
    outputRows.forEach(r => {
      lines.push(activeCols.map(c => csvEscape(r[c])).join(';'));
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

  // ---- Bloco de assinatura do chefe da unidade (copiar e colar) ----
  const sigCopyBtn = document.getElementById('p20SigCopyBtn');
  const sigText = document.getElementById('p20SigText');
  if(sigCopyBtn && sigText){
    sigCopyBtn.addEventListener('click', async function(){
      // texto puro: uma linha por item, como será colado no edital
      const lines = sigText.innerText.split('\n').map(s => s.trim()).filter(Boolean);
      const plain = lines.join('\n');
      const html = '<p style="text-align:center;margin:0;"><strong>' + escapeHtml(lines[0]) + '</strong><br>'
        + lines.slice(1).map(escapeHtml).join('<br>') + '</p>';

      function showCopied(){
        const original = sigCopyBtn.textContent;
        sigCopyBtn.textContent = 'Copiado!';
        setTimeout(() => { sigCopyBtn.textContent = original; }, 1800);
      }

      if(navigator.clipboard && window.ClipboardItem){
        try{
          await navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob([html], {type:'text/html'}),
            'text/plain': new Blob([plain], {type:'text/plain'})
          })]);
          showCopied();
          return;
        }catch(err){ /* segue para o fallback */ }
      }
      try{
        await navigator.clipboard.writeText(plain);
        showCopied();
      }catch(err){
        alert('Não foi possível copiar automaticamente. Selecione o texto da assinatura e use Ctrl+C.');
      }
    });
  }
})();
