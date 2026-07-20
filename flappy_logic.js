/* Flappy Bird (ASCII) — TJPR Jogos
   Todo o campo de jogo (pássaro, cano, chão, estrelas, cometas) é desenhado
   como uma grade de caracteres de texto, redesenhada a cada quadro por um
   laço requestAnimationFrame (até 120 fps) com física baseada em tempo real
   (delta time), não em contagem de quadros. Pontuação = tempo sobrevivido
   (segundos); recorde salvo em localStorage neste navegador. */
(function(){
  const COLS=50, ROWS=16, GROUND_ROW=ROWS-1;
  const BIRD_COL=8;
  const GRAVITY=32, FLAP_VEL=-15.5, MAX_FALL_VEL=12.5; // linhas/s², linhas/s
  const PIPE_WIDTH=3, GAP_SIZE=5;
  const PIPE_SPEED_BASE=9, PIPE_SPEED_MAX=16, PIPE_SPEED_RAMP=0.22; // colunas/s
  const SPAWN_DISTANCE=17; // colunas percorridas entre canos
  const COMET_INTERVAL=8; // segundos sobrevividos entre cometas (marca progresso)
  const BG_SCROLL_SPEED=10; // colunas/s de referência p/ paralaxe (sempre ativo)
  const MAX_FPS=120, MIN_FRAME_MS=1000/MAX_FPS;
  const STORAGE_KEY='tjpr_flappy_scores';

  const screenEl=document.getElementById('fbScreen');
  const scoreEl=document.getElementById('fbScore');
  const bestEl=document.getElementById('fbBest');
  const startBtn=document.getElementById('fbStartBtn');
  const boardBody=document.getElementById('fbBoardBody');

  let state='ready'; // 'ready' | 'playing' | 'gameover'
  let birdRow, birdVel, pipes, distanceSinceSpawn, startTime, elapsed, finalScore, gameOverAt;
  let bgDistance=0, comet=null, lastCometMilestone=0;
  let lastFrameTime=null;

  function loadScores(){
    try{
      const arr=JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(arr)?arr:[];
    }catch(e){ return []; }
  }
  function saveScores(arr){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }catch(e){}
  }
  function bestScore(){
    const arr=loadScores();
    return arr.length?arr[0].score:0;
  }
  function fmtScore(s){ return s.toFixed(1)+'s'; }

  function renderBoard(highlightId){
    const arr=loadScores();
    if(!arr.length){
      boardBody.innerHTML='<tr><td colspan="3" class="empty-hint" style="padding:14px 10px;">Nenhuma pontuação registrada ainda — jogue uma partida!</td></tr>';
      return;
    }
    boardBody.innerHTML=arr.map((r,i)=>
      `<tr${r.id===highlightId?' class="fb-this-run"':''}><td>${i+1}º</td><td>${fmtScore(r.score)}</td><td>${r.data}</td></tr>`
    ).join('');
  }

  function resetGrid(){
    const grid=[];
    for(let r=0;r<ROWS;r++) grid.push(new Array(COLS).fill(' '));
    for(let c=0;c<COLS;c++){ grid[GROUND_ROW][c]='='; }
    return grid;
  }

  // Fundo com paralaxe: duas camadas de "estrelas" rolando continuamente em
  // velocidades diferentes (mais lentas que os canos), sempre ativas — inclusive
  // nas telas de início/fim — para dar vida ao cenário.
  function drawStars(grid){
    const farOffset=Math.floor(bgDistance*0.18);
    const nearOffset=Math.floor(bgDistance*0.5);
    for(let r=0;r<GROUND_ROW;r++){
      for(let c=0;c<COLS;c++){
        const far=c+farOffset, near=c+nearOffset;
        if((r*7+far*13)%37===0) grid[r][c]='.';
        else if((r*11+near*17)%53===0) grid[r][c]=':';
      }
    }
  }

  // Cometa "easter egg": risca a tela em diagonal a cada COMET_INTERVAL segundos
  // sobrevividos, como um marco visual do progresso do jogador na partida.
  function spawnComet(){
    comet={
      start:elapsed, duration:1.2,
      col0:COLS+4, col1:-9,
      row0:1+Math.floor(Math.random()*3),
      row1:GROUND_ROW-3-Math.floor(Math.random()*3)
    };
  }
  function drawComet(grid){
    if(!comet) return;
    const p=(elapsed-comet.start)/comet.duration;
    if(p<0||p>1){ if(p>1) comet=null; return; }
    const col=comet.col0+(comet.col1-comet.col0)*p;
    const row=comet.row0+(comet.row1-comet.row0)*p;
    const trail=['*','+','.','`'];
    for(let k=0;k<trail.length;k++){
      const tc=Math.round(col+k*1.6);
      const tr=Math.round(row-k*0.5);
      if(tr>=0 && tr<GROUND_ROW && tc>=0 && tc<COLS) grid[tr][tc]=trail[k];
    }
  }

  function drawCentered(grid, lines, startRow){
    lines.forEach((line,i)=>{
      const r=startRow+i;
      if(r<0||r>=GROUND_ROW) return;
      const pad=Math.max(0, Math.floor((COLS-line.length)/2));
      for(let c=0;c<COLS;c++) grid[r][c]=' ';
      for(let i2=0;i2<line.length && pad+i2<COLS;i2++){ grid[r][pad+i2]=line[i2]; }
    });
  }

  function render(){
    const grid=resetGrid();
    drawStars(grid);
    drawComet(grid);

    pipes.forEach(p=>{
      const col0=Math.round(p.col);
      for(let dc=0; dc<PIPE_WIDTH; dc++){
        const c=col0+dc;
        if(c<0||c>=COLS) continue;
        for(let r=0;r<GROUND_ROW;r++){
          const inGap=(r>=p.gapStart && r<p.gapStart+GAP_SIZE);
          if(inGap) continue;
          const isCap=(r===p.gapStart-1 || r===p.gapStart+GAP_SIZE);
          grid[r][c]=isCap?'=':'#';
        }
      }
    });

    const br=Math.max(0, Math.min(GROUND_ROW-1, Math.round(birdRow)));
    if(BIRD_COL>=0 && BIRD_COL<COLS){ grid[br][BIRD_COL]=state==='gameover'?'X':'@'; }

    if(state==='ready'){
      drawCentered(grid,[
        'FLAPPY BIRD (ASCII)',
        '',
        'ESPAÇO para começar',
        'Recorde: '+fmtScore(bestScore())
      ], 4);
    } else if(state==='gameover'){
      const top=loadScores()[0];
      const isBest=finalScore>0 && top && finalScore===top.score;
      drawCentered(grid,[
        'FIM DE JOGO',
        '',
        'Pontuação: '+fmtScore(finalScore),
        (isBest?'NOVO RECORDE!':'Recorde: '+fmtScore(bestScore())),
        '',
        'ESPAÇO para jogar de novo'
      ], 3);
    }

    screenEl.textContent=grid.map(row=>row.join('')).join('\n');
  }

  function spawnPipe(){
    const maxGapStart=GROUND_ROW-1-GAP_SIZE;
    const gapStart=1+Math.floor(Math.random()*Math.max(1,maxGapStart-1));
    pipes.push({col:COLS-1, gapStart});
  }

  function pipeSpeed(){ return Math.min(PIPE_SPEED_MAX, PIPE_SPEED_BASE+elapsed*PIPE_SPEED_RAMP); }

  function flap(){
    if(state!=='playing') return;
    birdVel=FLAP_VEL;
  }

  function update(dt){
    bgDistance+=BG_SCROLL_SPEED*dt;
    if(state!=='playing') return;

    birdVel=Math.min(MAX_FALL_VEL, birdVel+GRAVITY*dt);
    birdRow+=birdVel*dt;
    if(birdRow<0){ birdRow=0; birdVel=0; }

    const speed=pipeSpeed();
    pipes.forEach(p=>{ p.col-=speed*dt; });
    pipes=pipes.filter(p=>p.col+PIPE_WIDTH>=-1);

    distanceSinceSpawn+=speed*dt;
    if(distanceSinceSpawn>=SPAWN_DISTANCE){
      distanceSinceSpawn-=SPAWN_DISTANCE;
      spawnPipe();
    }

    elapsed=(performance.now()-startTime)/1000;
    scoreEl.textContent=fmtScore(elapsed);

    const milestone=Math.floor(elapsed/COMET_INTERVAL);
    if(milestone>lastCometMilestone){
      lastCometMilestone=milestone;
      spawnComet();
    }

    const brRound=Math.round(birdRow);
    let dead=(birdRow>=GROUND_ROW-1);
    if(!dead){
      pipes.forEach(p=>{
        const pc=Math.round(p.col);
        if(BIRD_COL>=pc && BIRD_COL<pc+PIPE_WIDTH){
          if(brRound<p.gapStart || brRound>=p.gapStart+GAP_SIZE) dead=true;
        }
      });
    }

    if(dead) endGame();
  }

  function loop(now){
    requestAnimationFrame(loop);
    if(lastFrameTime===null){ lastFrameTime=now; }
    const deltaMs=now-lastFrameTime;
    if(deltaMs<MIN_FRAME_MS) return; // limita a taxa máxima a 120 fps
    const dt=Math.min(0.05, deltaMs/1000); // evita saltos grandes (aba em segundo plano)
    lastFrameTime=now;
    update(dt);
    render();
  }

  function startGame(){
    state='playing';
    birdRow=ROWS/2-1;
    birdVel=0;
    pipes=[];
    distanceSinceSpawn=0;
    startTime=performance.now();
    elapsed=0;
    lastCometMilestone=0;
    comet=null;
    startBtn.textContent='Bater asas';
    scoreEl.textContent=fmtScore(0);
    bestEl.textContent=fmtScore(bestScore());
  }

  function endGame(){
    state='gameover';
    finalScore=Math.round(elapsed*10)/10;
    gameOverAt=performance.now();

    const scores=loadScores();
    const runId=Date.now();
    scores.push({score:finalScore, id:runId, data:new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})});
    scores.sort((a,b)=>b.score-a.score);
    const trimmed=scores.slice(0,5);
    saveScores(trimmed);

    bestEl.textContent=fmtScore(bestScore());
    startBtn.textContent='Jogar de novo';
    renderBoard(trimmed.some(r=>r.id===runId)?runId:null);
  }

  function handleActivate(){
    if(state==='ready'){ startGame(); }
    else if(state==='playing'){ flap(); }
    else if(state==='gameover'){
      if(performance.now()-gameOverAt>350) startGame();
    }
  }

  window.addEventListener('keydown', e=>{
    if(e.code==='Space' || e.key===' ' || e.key==='Spacebar'){
      e.preventDefault();
      if(e.repeat) return;
      handleActivate();
    }
  });

  startBtn.addEventListener('click', handleActivate);

  bestEl.textContent=fmtScore(bestScore());
  renderBoard(null);
  birdRow=ROWS/2-1; birdVel=0; pipes=[]; distanceSinceSpawn=0; finalScore=0;
  requestAnimationFrame(loop);
})();
