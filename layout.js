/* Monta partes comuns de cada página a partir do registro em ferramentas.js:
   - o menu de navegação (elemento #menu-placeholder)
   - o cabeçalho eyebrow + h1 (elemento #header-title), para páginas de ferramenta
   - a grade de cartões do índice (elemento .tool-grid)
   Assim, título/eyebrow/rótulo ficam definidos em um só lugar (ferramentas.js). */

function escHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Monta o HTML do menu de navegação (usado no cabeçalho da página e no
// header fixo miniaturizado) — cada aba carrega o emoji da ferramenta.
function navHtml(cur){
  let h='<nav class="tab-nav">';
  h+=`<a class="tab-btn ${cur==='index.html'?'active':''}" href="index.html"><span class="tab-emoji" aria-hidden="true">🏠</span>Início</a>`;
  FERRAMENTAS.forEach(t=>{
    const em=t.emoji?`<span class="tab-emoji" aria-hidden="true">${escHtml(t.emoji)}</span>`:'';
    h+=`<a class="tab-btn ${cur===t.arquivo?'active':''}" href="${t.arquivo}">${em}${escHtml(rotuloFerramenta(t))}</a>`;
  });
  h+='</nav>';
  return h;
}

document.addEventListener('DOMContentLoaded',()=>{
  const cur=location.pathname.split('/').pop()||'index.html';

  // 1) menu de navegação
  const p=document.getElementById('menu-placeholder');
  if(p){ p.outerHTML=navHtml(cur); }

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

  // 4) header fixo miniaturizado: só navegação + botão "Topo", exibido quando
  //    o cabeçalho principal (app-header) sai de vista ao rolar a página
  const appHeader=document.querySelector('.app-header');
  if(appHeader){
    const mini=document.createElement('div');
    mini.className='mini-header';
    mini.innerHTML='<div class="mini-header-inner">'+navHtml(cur)
      +'<button type="button" class="top-btn" title="Voltar ao topo da página">Topo <span aria-hidden="true">↑</span></button></div>';
    document.body.appendChild(mini);
    mini.querySelector('.top-btn').addEventListener('click',()=>{
      window.scrollTo({top:0,behavior:'smooth'});
    });
    if('IntersectionObserver' in window){
      new IntersectionObserver(entries=>{
        const e=entries[0];
        // só mostra quando o cabeçalho saiu por CIMA da tela (rolagem para baixo)
        mini.classList.toggle('show', !e.isIntersecting && e.boundingClientRect.top<0);
      },{threshold:0}).observe(appHeader);
    } else {
      // fallback para navegadores sem IntersectionObserver
      window.addEventListener('scroll',()=>{
        const r=appHeader.getBoundingClientRect();
        mini.classList.toggle('show', r.bottom<0);
      },{passive:true});
    }
  }
});
