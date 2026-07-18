/* Monta partes comuns de cada página a partir do registro em ferramentas.js:
   - o menu de navegação (elemento #menu-placeholder)
   - o cabeçalho eyebrow + h1 (elemento #header-title), para páginas de ferramenta
   - a grade de cartões do índice (elemento .tool-grid)
   Assim, título/eyebrow/rótulo ficam definidos em um só lugar (ferramentas.js). */

function escHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

document.addEventListener('DOMContentLoaded',()=>{
  const cur=location.pathname.split('/').pop()||'index.html';

  // 1) menu de navegação — cada aba carrega o emoji da ferramenta
  const p=document.getElementById('menu-placeholder');
  if(p){
    let h='<nav class="tab-nav">';
    h+=`<a class="tab-btn ${cur==='index.html'?'active':''}" href="index.html"><span class="tab-emoji" aria-hidden="true">🏠</span>Início</a>`;
    FERRAMENTAS.forEach(t=>{
      const em=t.emoji?`<span class="tab-emoji" aria-hidden="true">${escHtml(t.emoji)}</span>`:'';
      h+=`<a class="tab-btn ${cur===t.arquivo?'active':''}" href="${t.arquivo}">${em}${escHtml(rotuloFerramenta(t))}</a>`;
    });
    h+='</nav>';
    p.outerHTML=h;
  }

  // 2) cabeçalho da página de ferramenta (selo de emoji + eyebrow + h1) vindo do
  //    registro; a cor de acento da ferramenta é aplicada ao cabeçalho inteiro
  //    (sombra do selo e filete inferior), ecoando o cartão da home
  const ht=document.getElementById('header-title');
  if(ht){
    const t=ferramentaPorArquivo(cur);
    if(t){
      const sheet=document.querySelector('.sheet');
      if(sheet) sheet.style.setProperty('--accent','var('+(t.cor||'--teal')+')');
      ht.outerHTML='<header class="page-header">'
        +`<span class="page-emoji" aria-hidden="true">${escHtml(t.emoji||'🛠️')}</span>`
        +'<div class="page-title-block">'
        +`<p class="eyebrow">${escHtml(t.eyebrow||'')}</p>`
        +`<h1>${escHtml(t.titulo||'')}</h1>`
        +'</div></header>';
      // manter o <title> da aba do navegador em sincronia
      document.title=(t.titulo||'Ferramenta')+' — Seção de Processo Seletivo (TJPR)';
    }
  }

  // 3) grade de cartões do índice
  const grid=document.querySelector('.tool-grid');
  if(grid){
    grid.innerHTML='';
    FERRAMENTAS.forEach(t=>{
      const accent=t.cor||'--teal';
      grid.insertAdjacentHTML('beforeend',
        `<a class="tool-card" href="${t.arquivo}" style="--accent:var(${accent});">`
        +`<div class="tool-card-top"><span class="tool-card-emoji" aria-hidden="true">${escHtml(t.emoji||'🛠️')}</span>`
        +`<p class="tool-card-tag">${escHtml(rotuloFerramenta(t))}</p></div>`
        +`<h2>${escHtml(t.titulo)}</h2>`
        +`<p class="tool-card-desc">${escHtml(t.descricao)}</p>`
        +`</a>`);
    });
    grid.insertAdjacentHTML('beforeend',
      `<div class="tool-card disabled" style="--accent:var(--line);">`
      +`<div class="tool-card-top"><span class="tool-card-emoji" aria-hidden="true">🚧</span>`
      +`<p class="tool-card-tag">Em breve</p></div>`
      +`<h2>Próxima ferramenta</h2>`
      +`<p class="tool-card-desc">Novas ferramentas aparecerão aqui conforme forem desenvolvidas.</p>`
      +`</div>`);
  }
});
