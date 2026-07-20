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

// Monta o cabeçalho institucional padrão (logo + identificação da unidade),
// idêntico em todas as páginas — assim o header é definido em um só lugar.
// A "Seção de Processo Seletivo" agora fica como terceira linha do bloco
// tjpr-name, logo abaixo de "Secretaria de Gestão de Pessoas".
function institutionalHtml(){
  return '<div class="institutional-header">'
    +'<div class="tjpr-fallback" style="display:block;">TJPR<small>TRIBUNAL DE JUSTIÇA<br>DO ESTADO DO PARANÁ</small></div>'
    +'<div class="tjpr-name">'
    +'<strong>Tribunal de Justiça do Estado do Paraná</strong>'
    +'<span class="tjpr-line">Secretaria de Gestão de Pessoas</span>'
    +'<span class="tjpr-line">Seção de Processo Seletivo</span>'
    +'</div></div>';
}

// Monta o HTML de um cartão de ferramenta/jogo — usado tanto para a grade de
// ferramentas (índice) quanto para a grade de jogos (jogos.html), garantindo
// que as duas usem exatamente o mesmo HTML/classes.
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
// e serve apenas para permitir que UM cartão específico (o de ferramentas, no
// índice) seja localizado depois e receba a função secreta — cartões sem esse
// id (ex.: o de jogos.html) continuam totalmente inertes.
function placeholderCardHtml(id, h2, desc){
  return `<div class="tool-card disabled"${id?` id="${id}"`:''} style="--accent:var(--line);">`
    +`<div class="tool-card-top"><span class="tool-card-emoji" aria-hidden="true">🚧</span>`
    +`<p class="tool-card-tag">Em breve</p></div>`
    +`<h2>${escHtml(h2)}</h2>`
    +`<p class="tool-card-desc">${escHtml(desc)}</p>`
    +`</div>`;
}

// Função secreta: 10 cliques no cartão "Em breve" das ferramentas (só no
// índice — nunca no cartão equivalente de jogos.html) leva a jogos.html. A
// cada clique é exibida, por instantes, a contagem regressiva de cliques
// restantes (10, 9, 8, ... 1); se o usuário demorar mais de 1,5s entre dois
// cliques, a contagem reinicia (evita disparo acidental em uso normal).
function wireSecretCounter(card){
  const RESET_MS=1500;    // inatividade acima disso reinicia a contagem em 10
  const NAV_DELAY_MS=350; // pequena pausa após mostrar "1" antes de navegar
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
      card.style.pointerEvents='none'; // trava novos cliques durante a transição
      setTimeout(()=>{ window.location.href='jogos.html'; },NAV_DELAY_MS);
    }
  });
}

document.addEventListener('DOMContentLoaded',()=>{
  const cur=location.pathname.split('/').pop()||'index.html';

  // 0) cabeçalho institucional padrão (mesmo em todas as páginas)
  const ih=document.getElementById('institutional-placeholder');
  if(ih){ ih.outerHTML=institutionalHtml(); }

  // 1) menu de navegação
  const p=document.getElementById('menu-placeholder');
  if(p){ p.outerHTML=navHtml(cur); }

  // 2) cabeçalho da página de ferramenta (selo de emoji + eyebrow + h1) vindo do
  //    registro; a cor de acento da ferramenta é aplicada ao cabeçalho inteiro
  //    (sombra do selo e filete inferior), ecoando o cartão da home
  const ht=document.getElementById('header-title');
  if(ht){
    let t=ferramentaPorArquivo(cur);
    let sufixo=' — Seção de Processo Seletivo (TJPR)';
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
      // manter o <title> da aba do navegador em sincronia
      document.title=(t.titulo||'Ferramenta')+sufixo;
    }
  }

  // 3) grade de cartões: FERRAMENTAS no índice, ou JOGOS em jogos.html
  //    (detectado via data-registro="jogos" no próprio elemento .tool-grid)
  const grid=document.querySelector('.tool-grid');
  if(grid){
    const isGamesGrid=grid.dataset.registro==='jogos';
    const registro=isGamesGrid?(typeof JOGOS!=='undefined'?JOGOS:[]):FERRAMENTAS;
    const rotuloFn=isGamesGrid?rotuloJogo:rotuloFerramenta;

    grid.innerHTML='';
    registro.forEach(item=>{
      grid.insertAdjacentHTML('beforeend',cardHtml(item,rotuloFn(item)));
    });

    if(isGamesGrid){
      grid.insertAdjacentHTML('beforeend',
        placeholderCardHtml('jogosEmBreveCard','Próximo jogo','Novos jogos aparecerão aqui conforme forem desenvolvidos.'));
    } else {
      grid.insertAdjacentHTML('beforeend',
        placeholderCardHtml('ferramentasEmBreveCard','Próxima ferramenta','Novas ferramentas aparecerão aqui conforme forem desenvolvidas.'));
      const secretCard=document.getElementById('ferramentasEmBreveCard');
      if(secretCard) wireSecretCounter(secretCard);
    }
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
