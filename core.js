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

  /* ------------------------------------------------------------------------
     Seletor de horário próprio, no lugar do popup nativo do <input type="time">.
     Dois motivos para não usar o do navegador:
       1) não há como fechá-lo por código — clicar de novo no 🕐 não o fecha;
       2) suas colunas giram sem fim (de 23 passa direto para 00).
     Aqui cada coluna é uma lista de rolagem comum: para no primeiro e no último
     item, e a roda do mouse não vaza para a página (overscroll-behavior).
     ------------------------------------------------------------------------ */

  let horaAberto = null;   // { caixa, ancora }

  function fecharSeletorHora(){
    if(!horaAberto) return;
    horaAberto.caixa.remove();
    horaAberto = null;
    document.removeEventListener('mousedown', fecharPorClickFora, true);
    document.removeEventListener('keydown', fecharPorEsc, true);
    window.removeEventListener('resize', fecharSeletorHora);
  }
  function fecharPorClickFora(ev){
    if(!horaAberto) return;
    if(horaAberto.caixa.contains(ev.target) || horaAberto.ancora.contains(ev.target)) return;
    fecharSeletorHora();
  }
  function fecharPorEsc(ev){ if(ev.key === 'Escape') fecharSeletorHora(); }

  function colunaHora(titulo, de, ate, selecionado, aoClicar){
    const col = document.createElement('div');
    col.className = 'hora-col';
    const tit = document.createElement('p');
    tit.className = 'hora-col-tit';
    tit.textContent = titulo;
    col.appendChild(tit);
    const lista = document.createElement('div');
    lista.className = 'hora-lista';
    for(let v = de; v <= ate; v++){
      const it = document.createElement('button');
      it.type = 'button';
      it.tabIndex = -1;                    // 84 itens não entram na ordem do Tab
      it.className = 'hora-item' + (v === selecionado ? ' sel' : '');
      it.textContent = String(v).padStart(2,'0');
      it.addEventListener('click', function(){ aoClicar(v, lista, it); });
      lista.appendChild(it);
    }
    col.appendChild(lista);
    return { col, lista };
  }

  // Deixa o item escolhido visível sem animação: o seletor abre já no valor
  // que está no campo.
  function centralizar(lista, item){
    if(!item) return;
    lista.scrollTop = Math.max(0, item.offsetTop - lista.clientHeight/2 + item.offsetHeight/2);
  }

  /* Abre (ou fecha, se já estiver aberto no mesmo botão) o seletor ancorado em
     `ancora`. `opcoes.valor` é {h,m} ou null; `opcoes.aoEscolher` recebe {h,m}
     a cada clique — o campo acompanha a escolha em tempo real. */
  function seletorHora(ancora, opcoes){
    if(horaAberto && horaAberto.ancora === ancora){ fecharSeletorHora(); return; }
    fecharSeletorHora();
    opcoes = opcoes || {};
    const atual = opcoes.valor || null;
    let h = atual ? atual.h : null;
    let m = atual ? atual.m : null;

    const caixa = document.createElement('div');
    caixa.className = 'hora-pop';
    caixa.setAttribute('role','dialog');
    caixa.setAttribute('aria-label','Escolher horário');

    function avisar(){
      if(opcoes.aoEscolher) opcoes.aoEscolher({ h: h || 0, m: m || 0 });
    }

    const ch = colunaHora('hora', 0, 23, h, function(v, lista, it){
      h = v;
      lista.querySelectorAll('.hora-item.sel').forEach(e => e.classList.remove('sel'));
      it.classList.add('sel');
      avisar();
    });
    // escolher o minuto encerra: é sempre o último passo
    const cm = colunaHora('min', 0, 59, m, function(v, lista, it){
      m = v;
      lista.querySelectorAll('.hora-item.sel').forEach(e => e.classList.remove('sel'));
      it.classList.add('sel');
      avisar();
      fecharSeletorHora();
    });
    caixa.appendChild(ch.col);
    caixa.appendChild(cm.col);
    document.body.appendChild(caixa);

    const r = ancora.getBoundingClientRect();
    const alturaPop = caixa.offsetHeight;
    const cabeAbaixo = (window.innerHeight - r.bottom) > (alturaPop + 8);
    caixa.style.top = (cabeAbaixo ? r.bottom + 4 : r.top - alturaPop - 4) + window.scrollY + 'px';
    caixa.style.left = Math.max(8, Math.min(r.left, window.innerWidth - caixa.offsetWidth - 8))
      + window.scrollX + 'px';

    // sem valor no campo, abre no começo do expediente em vez de 00h
    centralizar(ch.lista, ch.lista.querySelector('.hora-item.sel') || ch.lista.children[8]);
    centralizar(cm.lista, cm.lista.querySelector('.hora-item.sel') || cm.lista.children[0]);

    horaAberto = { caixa, ancora };
    document.addEventListener('mousedown', fecharPorClickFora, true);
    document.addEventListener('keydown', fecharPorEsc, true);
    window.addEventListener('resize', fecharSeletorHora);
  }

  return {
    escapeHtml, csvEscape, normName, detectDelimiter, parseCSV,
    buildCleanTableHTML, buildTSV, copyTableToClipboard, pdfToText,
    seletorHora, fecharSeletorHora
  };
})();
