/*
  core.js — funções compartilhadas entre todas as ferramentas (Ponto XX) da
  Seção de Processo Seletivo (TJPR). Referenciar sempre por caminho relativo:
  <script src="core.js"></script>

  100% client-side, sem chamadas a APIs externas.

  Para usar em uma nova ferramenta:
    const { escapeHtml, csvEscape, normName, detectDelimiter, parseCSV,
            copyTableToClipboard } = TJPRCore;
*/
window.TJPRCore = (function(){

  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function csvEscape(val){
    val = String(val === undefined || val === null ? '' : val);
    if(/[";\n]/.test(val)){
      return '"' + val.replace(/"/g,'""') + '"';
    }
    return val;
  }

  function normName(s){
    if(!s) return '';
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toUpperCase()
      .replace(/[^A-Z\s]/g,'')
      .replace(/\s+/g,' ')
      .trim();
  }

  function detectDelimiter(text){
    const firstLine = text.split(/\r\n|\r|\n/)[0] || '';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    return semiCount > commaCount ? ';' : ',';
  }

  // Parser de CSV robusto (lida com campos entre aspas; delimitador é
  // autodetectado — Excel exportado em locale pt-BR normalmente usa ";")
  function parseCSV(text){
    const delim = detectDelimiter(text);
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    text = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    for(let i=0; i<text.length; i++){
      const c = text[i];
      if(inQuotes){
        if(c === '"'){
          if(text[i+1] === '"'){ field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += c;
        }
      } else {
        if(c === '"'){ inQuotes = true; }
        else if(c === delim){ row.push(field); field=''; }
        else if(c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
        else { field += c; }
      }
    }
    if(field.length > 0 || row.length > 0){ row.push(field); rows.push(row); }
    return rows.filter(r => !(r.length===1 && r[0].trim()===''));
  }

  // Monta um HTML de tabela "limpo" (sem font-family, sem font-size, sem cor)
  // para uso exclusivo na área de transferência. Usa <td> em vez de <th> no
  // cabeçalho porque Word/Excel reconhecem <th> como linha de cabeçalho e
  // aplicam seu próprio estilo automático (fonte maior, centralizada),
  // ignorando qualquer CSS definido aqui.
  function buildCleanTableHTML(cols, rows, getCell){
    const cellStyle = 'border:1pt solid #000000;text-align:left;padding:4px 8px;font-weight:normal;';
    const headerStyle = 'border:1pt solid #000000;text-align:left;padding:4px 8px;font-weight:bold;';
    let html = '<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;">';
    html += '<tr>' + cols.map(c =>
      '<td style="' + headerStyle + '">' + escapeHtml(c) + '</td>'
    ).join('') + '</tr>';
    rows.forEach(r => {
      html += '<tr>' + cols.map(c =>
        '<td style="' + cellStyle + '">' + escapeHtml(getCell(r, c)) + '</td>'
      ).join('') + '</tr>';
    });
    html += '</table>';
    return html;
  }

  function buildTSV(cols, rows, getCell){
    const lines = [cols.join('\t')];
    rows.forEach(r => {
      lines.push(cols.map(c => String(getCell(r, c))).join('\t'));
    });
    return lines.join('\n');
  }

  // Copia cols/rows para a área de transferência como tabela real (HTML) +
  // texto puro (fallback). getCell(row, col) deve devolver o valor de cada
  // célula. buttonEl recebe o feedback visual "Copiado!".
  async function copyTableToClipboard(cols, rows, getCell, buttonEl){
    if(rows.length === 0) return;
    const tsv = buildTSV(cols, rows, getCell);
    const htmlTable = buildCleanTableHTML(cols, rows, getCell);

    function showCopied(){
      if(!buttonEl) return;
      const original = buttonEl.textContent;
      buttonEl.textContent = 'Copiado!';
      setTimeout(() => { buttonEl.textContent = original; }, 1800);
    }

    if(navigator.clipboard && window.ClipboardItem){
      try{
        const item = new ClipboardItem({
          'text/html': new Blob([htmlTable], {type:'text/html'}),
          'text/plain': new Blob([tsv], {type:'text/plain'})
        });
        await navigator.clipboard.write([item]);
        showCopied();
        return;
      }catch(err){
        // segue para o fallback abaixo
      }
    }

    const holder = document.createElement('div');
    holder.contentEditable = 'true';
    holder.style.position = 'fixed';
    holder.style.opacity = '0';
    holder.style.pointerEvents = 'none';
    holder.innerHTML = htmlTable;
    document.body.appendChild(holder);
    const range = document.createRange();
    range.selectNodeContents(holder);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try{
      document.execCommand('copy');
      showCopied();
    }catch(err2){
      alert('Não foi possível copiar automaticamente. Selecione a tabela manualmente e copie com Ctrl+C.');
    }
    sel.removeAllRanges();
    document.body.removeChild(holder);
  }

  // Extrai o texto de um PDF usando pdf.js (vendor/pdf.min.js + vendor/pdf.worker.min.js
  // precisam estar incluídos na página, via <script>, antes de chamar esta função).
  // Agrupa os itens de texto por linha (coordenada Y) e ordena por X, reconstruindo
  // a leitura visual do documento — inclusive tabelas simples.
  async function pdfToText(file){
    if(typeof pdfjsLib === 'undefined'){
      throw new Error('Biblioteca pdf.js não carregada (vendor/pdf.min.js).');
    }
    try{ pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; }catch(e){}
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({data: buf}).promise;
    let out = '';
    for(let p=1; p<=doc.numPages; p++){
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const linhas = {};
      tc.items.forEach(it => {
        if(!it.str) return;
        const y = Math.round(it.transform[5]);
        (linhas[y] = linhas[y] || []).push({x: it.transform[4], t: it.str});
      });
      const ys = Object.keys(linhas).map(Number).sort((a,b) => b-a);
      ys.forEach(y => {
        const l = linhas[y].sort((a,b) => a.x-b.x).map(o => o.t).join(' ').replace(/\s+/g,' ').trim();
        if(l) out += l + '\n';
      });
      out += '\n';
    }
    return out;
  }

  return {
    escapeHtml, csvEscape, normName, detectDelimiter, parseCSV,
    buildCleanTableHTML, buildTSV, copyTableToClipboard, pdfToText
  };
})();
