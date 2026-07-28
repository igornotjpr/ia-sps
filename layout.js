/* Monta partes comuns de cada página a partir dos registros em ferramentas.js:
   - o menu de navegação com submenus por seção (elemento #menu-placeholder)
   - o cabeçalho eyebrow + h1 (elemento #header-title), para páginas de ferramenta
   - as grades de cartões do índice, agrupadas por seção (elemento .tool-sections)
   - a grade simples de jogos (elemento .tool-grid[data-registro="jogos"])
   Assim, título/eyebrow/rótulo/seção ficam definidos em um só lugar. */

function escHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ---------------------------------------------------------------- navegação

// Monta o HTML do menu de navegação (usado no cabeçalho da página e no
// header fixo miniaturizado). Cada SEÇÃO vira um item principal; as
// ferramentas daquela seção aparecem como subitens no menu suspenso, que abre
// ao passar o mouse (ou ao clicar/tabular, em telas de toque e no teclado).
function navHtml(cur){
  let h='<nav class="tab-nav">';
  h+=`<a class="tab-btn ${cur==='index.html'?'active':''}" href="index.html"><span class="tab-emoji" aria-hidden="true">🏠</span>Início</a>`;

  SECOES.forEach(sec=>{
    const itens=ferramentasDaSecao(sec.id);
    if(!itens.length) return;
    const ativa=itens.some(t=>t.arquivo===cur);
    h+='<div class="tab-group">';
    h+=`<button type="button" class="tab-btn tab-parent ${ativa?'active':''}" aria-haspopup="true" aria-expanded="false">`
      +`<span class="tab-emoji" aria-hidden="true">${escHtml(sec.emoji||'🗂️')}</span>`
      +`${escHtml(sec.rotulo)}<span class="tab-caret" aria-hidden="true">▾</span></button>`;
    h+='<div class="tab-menu">';
    itens.forEach(t=>{
      h+=`<a class="tab-menu-item ${cur===t.arquivo?'active':''}" href="${t.arquivo}" style="--accent:var(${t.cor||'--teal'});">`
        +`<span class="tab-emoji" aria-hidden="true">${escHtml(t.emoji||'🛠️')}</span>`
        +`<span class="tab-menu-label">${escHtml(rotuloFerramenta(t))}</span></a>`;
    });
    h+='</div></div>';
  });

  h+='</nav>';
  return h;
}

// Liga o comportamento dos menus suspensos dentro de um container (cabeçalho
// principal ou mini-header). O hover é feito em CSS; aqui tratamos clique
// (telas de toque), teclado (Esc) e clique fora para fechar.
function wireDropdowns(escopo){
  escopo.querySelectorAll('.tab-parent').forEach(btn=>{
    btn.addEventListener('click',ev=>{
      ev.preventDefault();
      const grupo=btn.parentElement;
      const abrir=!grupo.classList.contains('open');
      document.querySelectorAll('.tab-group.open').forEach(g=>{
        g.classList.remove('open');
        const b=g.querySelector('.tab-parent'); if(b) b.setAttribute('aria-expanded','false');
      });
      if(abrir){ grupo.classList.add('open'); btn.setAttribute('aria-expanded','true'); }
    });
  });
}

function fecharDropdowns(){
  document.querySelectorAll('.tab-group.open').forEach(g=>{
    g.classList.remove('open');
    const b=g.querySelector('.tab-parent'); if(b) b.setAttribute('aria-expanded','false');
  });
}

// ------------------------------------------------------- cabeçalho e cartões

// Monta o cabeçalho institucional padrão (logo + identificação da unidade),
// idêntico em todas as páginas — assim o header é definido em um só lugar.
function institutionalHtml(){
  return '<div class="institutional-header">'
    +'<div class="tjpr-fallback" style="display:block;">TJPR<small>TRIBUNAL DE JUSTIÇA<br>DO ESTADO DO PARANÁ</small></div>'
    +'<div class="tjpr-name">'
    +'<strong>Tribunal de Justiça do Estado do Paraná</strong>'
    +'<span class="tjpr-line">Secretaria de Gestão de Pessoas</span>'
    +'<span class="tjpr-line">SG-SGP-CDHO-DSERFTA</span>'
    +'</div></div>';
}

// Monta o HTML de um cartão de ferramenta/jogo — usado tanto para as grades de
// ferramentas (índice) quanto para a grade de jogos (jogos.html), garantindo
// que todas usem exatamente o mesmo HTML/classes.
function cardHtml(item, rotuloTexto){
  const accent=item.cor||'--teal';
  return `<a class="tool-card" href="${item.arquivo}" style="--accent:var(${accent});">`
    +`<div class="tool-card-top"><span class="tool-card-emoji" aria-hidden="true">${escHtml(item.emoji||'🛠️')}</span>`
    +`<p class="tool-card-tag">${escHtml(rotuloTexto)}</p></div>`
    +`<h2>${escHtml(item.titulo)}</h2>`
    +`<p class="tool-card-desc">${escHtml(item.descricao)}</p>`
    +`</a>`;
}

// Monta o cartão desabilitado "Em breve" ao fim de uma grade. `id` é opcional
// e serve apenas para permitir que UM cartão específico (o da seção de
// Processo Seletivo, no índice) seja localizado depois e receba a função
// secreta — cartões sem esse id continuam totalmente inertes.
function placeholderCardHtml(id, h2, desc){
  return `<div class="tool-card disabled"${id?` id="${id}"`:''} style="--accent:var(--line);">`
    +`<div class="tool-card-top"><span class="tool-card-emoji" aria-hidden="true">🚧</span>`
    +`<p class="tool-card-tag">Em breve</p></div>`
    +`<h2>${escHtml(h2)}</h2>`
    +`<p class="tool-card-desc">${escHtml(desc)}</p>`
    +`</div>`;
}

// Monta o bloco de uma seção no índice: cabeçalho da seção + grade de cartões
// das ferramentas daquela seção + o cartão "Em breve" correspondente.
function secaoHtml(sec){
  const itens=ferramentasDaSecao(sec.id);
  let h=`<section class="tool-section" style="--accent:var(${sec.cor||'--teal'});">`
    +'<div class="section-head">'
    +`<span class="section-emoji" aria-hidden="true">${escHtml(sec.emoji||'🗂️')}</span>`
    +'<div class="section-head-text">'
    +`<p class="eyebrow">${escHtml(sec.eyebrow||'')}</p>`
    +`<h2 class="section-title">${escHtml(sec.titulo||'')}</h2>`
    +'</div></div>';
  if(sec.descricao) h+=`<p class="section-desc">${escHtml(sec.descricao)}</p>`;
  h+='<div class="tool-grid">';
  itens.forEach(t=>{ h+=cardHtml(t,rotuloFerramenta(t)); });
  const idSecreto=(sec.id==='sps')?'ferramentasEmBreveCard':'';
  h+=placeholderCardHtml(idSecreto,'Próxima ferramenta',sec.emBreve||'Novas ferramentas aparecerão aqui conforme forem desenvolvidas.');
  h+='</div></section>';
  return h;
}

// Função secreta: 10 cliques no cartão "Em breve" da seção de Processo
// Seletivo (só no índice) leva a jogos.html. A cada clique é exibida, por
// instantes, a contagem regressiva (10, 9, 8, ... 1); mais de 1,5s entre dois
// cliques reinicia a contagem (evita disparo acidental em uso normal).
function wireSecretCounter(card){
  const RESET_MS=1500;
  const NAV_DELAY_MS=350;
  let remaining=10;
  let lastClickAt=0;

  const badge=document.createElement('span');
  badge.className='secret-countdown';
  badge.setAttribute('aria-hidden','true');
  card.appendChild(badge);

  card.addEventListener('click',()=>{
    const now=Date.now();
    if(now-lastClickAt>RESET_MS){ remaining=10; }
    lastClickAt=now;

    badge.textContent=String(remaining);
    badge.classList.remove('flash');
    void badge.offsetWidth; // reinicia a animação CSS mesmo em cliques rápidos consecutivos
    badge.classList.add('flash');

    remaining-=1;
    if(remaining<=0){
      card.style.pointerEvents='none';
      setTimeout(()=>{ window.location.href='jogos.html'; },NAV_DELAY_MS);
    }
  });
}

// ---------------------------------------------------------------- montagem

document.addEventListener('DOMContentLoaded',()=>{
  const cur=location.pathname.split('/').pop()||'index.html';

  // 0) cabeçalho institucional padrão (mesmo em todas as páginas)
  const ih=document.getElementById('institutional-placeholder');
  if(ih){ ih.outerHTML=institutionalHtml(); }

  // 1) menu de navegação
  const p=document.getElementById('menu-placeholder');
  if(p){ p.outerHTML=navHtml(cur); }

  // 2) cabeçalho da página de ferramenta (selo de emoji + eyebrow + h1) vindo
  //    do registro; a cor de acento da ferramenta é aplicada ao cabeçalho
  //    inteiro (sombra do selo e filete inferior), ecoando o cartão da home
  const ht=document.getElementById('header-title');
  if(ht){
    let t=ferramentaPorArquivo(cur);
    let sufixo=' — TJPR';
    if(t){
      const sec=secaoPorId(secaoDaFerramenta(t));
      sufixo=(sec&&sec.sufixoTitulo)?sec.sufixoTitulo:sufixo;
    }
    if(!t && typeof jogoPorArquivo==='function'){
      t=jogoPorArquivo(cur);
      if(t) sufixo=' — TJPR Jogos';
    }
    if(t){
      const sheet=document.querySelector('.sheet');
      if(sheet) sheet.style.setProperty('--accent','var('+(t.cor||'--teal')+')');
      ht.outerHTML='<header class="page-header">'
        +`<span class="page-emoji" aria-hidden="true">${escHtml(t.emoji||'🛠️')}</span>`
        +'<div class="page-title-block">'
        +`<p class="eyebrow">${escHtml(t.eyebrow||'')}</p>`
        +`<h1>${escHtml(t.titulo||'')}</h1>`
        +'</div></header>';
      document.title=(t.titulo||'Ferramenta')+sufixo;
    }
  }

  // 3) índice: um bloco por seção (cabeçalho + grade de cartões)
  const secoesBox=document.querySelector('.tool-sections');
  if(secoesBox){
    secoesBox.innerHTML=SECOES.map(secaoHtml).join('');
    const secretCard=document.getElementById('ferramentasEmBreveCard');
    if(secretCard) wireSecretCounter(secretCard);
  }

  // 3b) grade simples (jogos.html), que não usa seções
  const grid=document.querySelector('.tool-grid[data-registro="jogos"]');
  if(grid){
    const registro=(typeof JOGOS!=='undefined')?JOGOS:[];
    grid.innerHTML='';
    registro.forEach(item=>{
      grid.insertAdjacentHTML('beforeend',cardHtml(item,rotuloJogo(item)));
    });
    grid.insertAdjacentHTML('beforeend',
      placeholderCardHtml('','Próximo jogo','Novos jogos aparecerão aqui conforme forem desenvolvidos.'));
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
      window.addEventListener('scroll',()=>{
        const r=appHeader.getBoundingClientRect();
        mini.classList.toggle('show', r.bottom<0);
      },{passive:true});
    }
  }

  // 5) comportamento dos menus suspensos (clique/toque, Esc, clique fora)
  wireDropdowns(document);
  document.addEventListener('click',ev=>{
    if(!ev.target.closest('.tab-group')) fecharDropdowns();
  });
  document.addEventListener('keydown',ev=>{
    if(ev.key==='Escape') fecharDropdowns();
  });
});
