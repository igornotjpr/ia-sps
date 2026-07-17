/* Monta partes comuns de cada página a partir do registro em ferramentas.js:
   - o menu de navegação (elemento #menu-placeholder)
   - o cabeçalho eyebrow + h1 (elemento #header-title), para páginas de ferramenta
   - a grade de cartões do índice (elemento .tool-grid)
   Assim, título/eyebrow/rótulo ficam definidos em um só lugar (ferramentas.js). */

function escHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

document.addEventListener('DOMContentLoaded',()=>{
  const cur=location.pathname.split('/').pop()||'index.html';

  // 1) menu de navegação
  const p=document.getElementById('menu-placeholder');
  if(p){
    let h='<nav class="tab-nav">';
    h+=`<a class="tab-btn ${cur==='index.html'?'active':''}" href="index.html">Início</a>`;
    FERRAMENTAS.forEach(t=>{
      h+=`<a class="tab-btn ${cur===t.arquivo?'active':''}" href="${t.arquivo}">${escHtml(rotuloFerramenta(t))}</a>`;
    });
    h+='</nav>';
    p.outerHTML=h;
  }

  // 2) cabeçalho da página de ferramenta (eyebrow + h1) vindo do registro
  const ht=document.getElementById('header-title');
  if(ht){
    const t=ferramentaPorArquivo(cur);
    if(t){
      ht.outerHTML='<header>'
        +`<p class="eyebrow">${escHtml(t.eyebrow||'')}</p>`
        +`<h1>${escHtml(t.titulo||'')}</h1>`
        +'</header>';
      // manter o <title> da aba do navegador em sincronia
      document.title=(t.titulo||'Ferramenta')+' — Seção de Processo Seletivo (TJPR)';
    }
  }

  // 3) grade de cartões do índice
  const grid=document.querySelector('.tool-grid');
  if(grid){
    grid.innerHTML='';
    FERRAMENTAS.forEach(t=>{
      grid.insertAdjacentHTML('beforeend',
        `<a class="tool-card" href="${t.arquivo}"><p class="tool-card-tag">${escHtml(rotuloFerramenta(t))}</p><h2>${escHtml(t.titulo)}</h2><p>${escHtml(t.descricao)}</p></a>`);
    });
    grid.insertAdjacentHTML('beforeend',
      `<div class="tool-card disabled"><p class="tool-card-tag">Em breve</p><h2>Próxima ferramenta</h2><p>Novas ferramentas aparecerão aqui conforme forem desenvolvidas.</p></div>`);
  }
});
