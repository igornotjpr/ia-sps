/* Gerador do Edital de Convocação para Entrevista — Divisão de Residência (TJPR)
   100% client-side. Depende de vendor/pdf.min.js (leitura de PDF) e core.js.

   Estrutura do arquivo:
     A) Utilidades de texto/número
     B) Reconhecimento de tabela (grade por coordenadas)
     C) Estado da ferramenta
     D) Passo 1 — origem dos dados
     E) Passo 2 — conferência de colunas
     F) Passo 3 — grade de candidatos
     G) Passo 4 — dados do edital
     H) Passo 5 — geração do edital
     I) Rascunho (exportar/importar) e inicialização
*/

/* ============================ A) utilidades ============================ */

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function semAcento(s){ return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function chaveNome(s){ return semAcento(s).toUpperCase().replace(/[^A-Z ]/g,' ').replace(/\s+/g,' ').trim(); }

const RE_NUM = /^-?\d{1,3}([.,]\d{1,3})?$/;
// nota truncada na origem, ex.: "4," no Despacho do Modelo 2 (só 1-2 dígitos,
// para não confundir com "704," de um endereço)
const RE_NUM_TRUNC = /^\d{1,2},$/;
function ehNumero(t){ return RE_NUM.test(t) || RE_NUM_TRUNC.test(t); }
const RE_HORA = /(\d{1,2})\s*[hH:]\s*(\d{2})/;

// "4,8" -> 4.8 | "5" -> 5 | "4," -> 4 | "" -> null
function paraNumero(txt){
  if(txt==null) return null;
  let s=String(txt).trim().replace(/\.(?=\d{3}\b)/g,'').replace(',','.').replace(/\.$/,'');
  if(s==='') return null;
  const v=Number(s);
  return isFinite(v)?v:null;
}
// 9.8 -> "9,80" (sempre duas casas, sempre vírgula)
function fmtNota(v){
  if(v==null||v==='') return '';
  const n=(typeof v==='number')?v:paraNumero(v);
  if(n==null) return String(v);
  return n.toFixed(2).replace('.',',');
}
function fmtInt(v){
  const n=(typeof v==='number')?v:paraNumero(v);
  if(n==null) return '';
  return String(Math.round(n));
}
// "13h30 min." / "13:30" / "13H30" -> {h:13,m:30}
function extrairHora(txt){
  const m=RE_HORA.exec(String(txt||''));
  if(!m) return null;
  const h=Number(m[1]), mi=Number(m[2]);
  if(h>23||mi>59) return null;
  return {h:h, m:mi};
}
function fmtHora(hora, formato){
  if(!hora) return '';
  const hh=String(hora.h).padStart(2,'0'), mm=String(hora.m).padStart(2,'0');
  return formato==='hmin' ? (hh+'h'+mm+'min') : (hh+'H'+mm);
}

/* ==================== B) reconhecimento de tabela ==================== */

// Palavras que identificam uma linha de CABEÇALHO da tabela de origem
const KW_CAB=['ORDEM','NOME','NOTA','NOTAS','PROVA','OBJETIVA','DISCURSIVA','SUBJETIVA',
  'TOTAL','ACERTOS','HORARIO','ENTREVISTA','SITUACAO','DATA','LOCAL','CANDIDATO',
  'CLASSIFICACAO','PONTUACAO','PONTOS','NASCIMENTO','N','NUM','MEDIA'];
const STOP_CAB=['DE','DA','DO','DOS','DAS','E','A','O'];
// Linhas que indicam a cota da seção seguinte
const KW_COTA=[
  {re:/AMPLA\s+CONCORR/i, cota:'ac'},
  {re:/(PRETA?|NEGRA?)\s*(OU|E)?\s*PARD|^\s*P\s*[NP]\s*P\s*$|\bPNP\b|\bPPP\b/i, cota:'ppp'},
  {re:/PESSOA[S]?\s+COM\s+DEFICI|\bP\s*C\s*D\b/i, cota:'pcd'}
];

function agruparLinhas(itens, tolY){
  tolY=tolY||3;
  const ord=itens.slice().sort((a,b)=> b.y-a.y || a.x-b.x);
  const linhas=[];
  ord.forEach(it=>{
    const u=linhas[linhas.length-1];
    if(u && Math.abs(u.y-it.y)<=tolY){ u.itens.push(it); }
    else linhas.push({y:it.y, itens:[it]});
  });
  linhas.forEach(l=>{
    l.itens.sort((a,b)=>a.x-b.x);
    l.y = l.itens.reduce((s,i)=>s+i.y,0)/l.itens.length;
  });
  return linhas;
}

function classificarTexto(tokens){
  const txt=tokens.join(' ').trim();
  if(!txt) return 'vazia';
  for(let i=0;i<KW_COTA.length;i++){
    if(KW_COTA[i].re.test(txt) && txt.length<70) return 'cota:'+KW_COTA[i].cota;
  }
  const temNum=tokens.some(t=>RE_NUM.test(String(t).trim()));
  if(!temNum){
    const palavras=semAcento(txt).toUpperCase().replace(/[^A-Z ]/g,' ').split(/\s+/).filter(Boolean);
    if(palavras.length && palavras.every(p=> KW_CAB.indexOf(p)>=0 || STOP_CAB.indexOf(p)>=0)) return 'cabecalho';
    return 'continuacao';
  }
  return 'ancora';
}

// Descobre onde estão os vãos verticais entre colunas. Só as linhas de dados
// entram na conta: linhas de cota e de texto corrido ocupam a largura toda e
// apagariam os vãos.
function detectarColunas(todas, minGap, fracLimiar){
  minGap=minGap||5;
  let linhas=todas.filter(l=> l.tipo==='ancora' || l.tipo==='continuacao');
  if(linhas.length<2) linhas=todas;
  let minX=Infinity, maxX=-Infinity;
  linhas.forEach(l=> l.itens.forEach(it=>{
    if(it.x<minX) minX=it.x;
    if(it.x+it.w>maxX) maxX=it.x+it.w;
  }));
  if(!isFinite(minX)) return [0];
  const n=Math.ceil(maxX-minX)+2;
  const cob=new Array(n).fill(0);
  linhas.forEach(l=>{
    const marc=new Array(n).fill(false);
    l.itens.forEach(it=>{
      const a=Math.max(0,Math.floor(it.x-minX)), b=Math.min(n,Math.ceil(it.x+it.w-minX));
      for(let i=a;i<b;i++) marc[i]=true;
    });
    for(let i=0;i<n;i++) if(marc[i]) cob[i]++;
  });
  const limiar=Math.floor(linhas.length*(fracLimiar===undefined?0.10:fracLimiar));
  const cortes=[]; let ini=-1;
  for(let i=0;i<n;i++){
    if(cob[i]<=limiar){ if(ini<0) ini=i; }
    else { if(ini>=0 && i-ini>=minGap) cortes.push(minX+(ini+i)/2); ini=-1; }
  }
  return [minX-1].concat(cortes);
}

function distribuirCelulas(linha, bordas){
  const c=new Array(bordas.length).fill('');
  linha.itens.forEach(it=>{
    let k=0;
    for(let i=0;i<bordas.length;i++) if(it.x+it.w/2>=bordas[i]) k=i;
    c[k]= c[k] ? c[k]+' '+it.str : it.str;
  });
  return c;
}

// itens {str,x,y,w} -> { colunas:n, registros:[{cels[],cota}], ignoradas:[] }
function montarGrade(itens){
  const linhas=agruparLinhas(itens);
  linhas.forEach(l=> l.tipo=classificarTexto(l.itens.map(i=>i.str)));
  const bordas=detectarColunas(linhas);
  const brutas=linhas.map(l=>({y:l.y, tipo:l.tipo, cels:distribuirCelulas(l,bordas)}));

  const registros=[]; const ignoradas=[]; const cabecalhos=[];
  let cota=null;
  brutas.forEach(r=>{ if(r.tipo==='cabecalho') cabecalhos.push(r.cels.join(' ').trim()); });
  brutas.forEach((r,i)=>{
    if(r.tipo.indexOf('cota:')===0){ cota=r.tipo.slice(5); return; }
    if(r.tipo==='ancora') registros.push({idx:i, y:r.y, cels:r.cels.slice(), cota:cota});
  });
  const idxAncoras=brutas.map((r,i)=> r.tipo==='ancora'?i:-1).filter(i=>i>=0);
  // Uma âncora "tem nome próprio" quando a própria linha já traz palavras — é o
  // caso das tabelas alinhadas ao topo (Athos/SEI), em que o nome começa na
  // linha da nota e transborda para BAIXO. Quando a âncora vem só com números,
  // a célula está centralizada verticalmente (tabelas do Word) e o nome pode
  // estar ACIMA dela. Sem essa distinção, o sobrenome de um candidato acaba
  // colado no início do nome do candidato seguinte.
  const temNome=i=> brutas[i].cels.some(c=> /[A-Za-zÀ-ÿ]{4,}/.test(String(c||'')));
  // distância máxima aceitável entre uma linha de continuação e sua âncora:
  // proporcional ao espaçamento típico entre candidatos (nomes de 4 linhas
  // ficam longe da própria nota em tabelas de célula alta)
  let limDist=34;
  if(idxAncoras.length>2){
    const difs=[];
    for(let k=1;k<idxAncoras.length;k++) difs.push(Math.abs(brutas[idxAncoras[k-1]].y-brutas[idxAncoras[k]].y));
    difs.sort((a,b)=>a-b);
    limDist=Math.min(70, Math.max(30, difs[Math.floor(difs.length/2)]*0.9));
  }
  brutas.forEach((r,i)=>{
    if(r.tipo!=='continuacao') return;
    let acimaI=-1, abaixoI=-1;
    idxAncoras.forEach(ai=>{
      if(brutas[ai].y > r.y){ if(acimaI<0 || brutas[ai].y < brutas[acimaI].y) acimaI=ai; }
      else if(abaixoI<0 || brutas[ai].y > brutas[abaixoI].y) abaixoI=ai;
    });
    const dAcima = acimaI>=0 ? Math.abs(brutas[acimaI].y-r.y) : 1e9;
    const dAbaixo= abaixoI>=0 ? Math.abs(brutas[abaixoI].y-r.y) : 1e9;
    let melhor, dist;
    if(abaixoI>=0 && !temNome(abaixoI) && dAbaixo<=dAcima){ melhor=abaixoI; dist=dAbaixo; }
    else if(acimaI>=0){ melhor=acimaI; dist=dAcima; }
    else { melhor=abaixoI; dist=dAbaixo; }
    const reg=(melhor>=0)?registros.find(x=>x.idx===melhor):null;
    if(!reg || dist>limDist){ ignoradas.push(r.cels.join(' ').trim()); return; }
    const acima = r.y > brutas[melhor].y;
    r.cels.forEach((c,k)=>{
      if(!c) return;
      reg.cels[k]= acima ? (c+' '+reg.cels[k]).trim() : (reg.cels[k]+' '+c).trim();
    });
  });
  return { colunas:bordas.length, registros:registros, ignoradas:ignoradas.filter(Boolean), cabecalho:cabecalhos.join(' ') };
}

// Texto colado -> itens sintéticos (reaproveita exatamente o mesmo algoritmo).
// Com TAB, cada campo vira uma coluna; sem TAB, usa a posição do caractere.
function itensDeTexto(texto){
  const linhas=String(texto||'').replace(/\r\n?/g,'\n').split('\n');
  const temTab=linhas.some(l=>l.indexOf('\t')>=0);
  const itens=[];
  linhas.forEach((linha,li)=>{
    const y=-li*12;
    if(temTab){
      let x=0;
      linha.split('\t').forEach(campo=>{
        const t=campo.trim();
        if(t) itens.push({str:t, x:x*6, y:y, w:Math.max(1,t.length)*6});
        x+=40;
      });
    } else {
      const re=/\S+/g; let m;
      while((m=re.exec(linha))!==null){
        itens.push({str:m[0], x:m.index*6, y:y, w:m[0].length*6});
      }
    }
  });
  return itens;
}

/* ========================== C) estado ========================== */

const PAPEIS=[
  {v:'ignorar',  t:'Ignorar'},
  {v:'ordem',    t:'Ordem (nº)'},
  {v:'nome',     t:'Nome'},
  {v:'numeros',  t:'Notas / acertos'},
  {v:'horario',  t:'Horário'}
];
const SLOTS=[
  {v:'ignorar', t:'Ignorar'},
  {v:'acertos', t:'Acertos'},
  {v:'obj',     t:'Nota da prova objetiva'},
  {v:'dis',     t:'Nota da prova discursiva'},
  {v:'tot',     t:'Total'},
  {v:'nota',    t:'Nota (coluna única)'}
];

const estado={
  modo:'duas',           // 'duas' = objetiva+discursiva+total | 'unica' = nota
  acertos:false,         // exibe coluna ACERTOS
  fmtHorario:'H',        // 'H' = 13H30 | 'hmin' = 13h30min
  cands:[],              // {id,nome,obj,dis,tot,acertos,hora,ac,ppp,pcd}
  doc:{
    nConv:'', nEdital:'', sei:'',
    data:'', horarioGeral:'', local:'', telefone:'', extra:'',
    cidade:'Curitiba', dataAss:'', assinante:'', cargo:'', unidade:''
  },
  bruto:null,            // resultado de montarGrade aguardando conferência
  seq:1
};

function novoCand(){
  return {id:estado.seq++, nome:'', obj:null, dis:null, tot:null, acertos:null, hora:null, ac:true, ppp:false, pcd:false};
}

/* ==================== D) passo 1 — origem dos dados ==================== */

// rolagem suave tolerante a navegadores antigos
function rolarAte(el){
  if(el && typeof el.scrollIntoView==='function'){
    try{ el.scrollIntoView({behavior:'smooth', block:'start'}); }catch(e){ el.scrollIntoView(); }
  }
}

function status(el, html, tipo){
  const n=$(el);
  n.className='notice-banner'+(tipo?(' '+tipo):'');
  n.innerHTML=html;
  n.style.display='block';
}

async function lerPdf(file){
  status('cvStatus','Lendo o PDF…','');
  try{
    if(typeof pdfjsLib==='undefined') throw new Error('biblioteca de PDF não carregada');
    // mesmo ajuste das demais ferramentas: aberto por duplo clique (file://) o
    // navegador bloqueia o worker, e o pdf.js cai no worker embutido
    try{ pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.js'; }catch(e){}
    const buf=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:buf}).promise;
    const paginas=[];
    let totalItens=0;
    for(let p=1;p<=pdf.numPages;p++){
      const pg=await pdf.getPage(p);
      const tc=await pg.getTextContent();
      const alt=pg.getViewport({scale:1}).height;
      const itens=[];
      tc.items.forEach(it=>{
        const s=(it.str||'').trim();
        if(!s) return;
        const x=it.transform[4], y=it.transform[5];
        (s.split(/\s+/)).forEach((tok,k,arr)=>{
          const larg=(it.width||s.length*4)*(tok.length/Math.max(1,s.length));
          const desl=(it.width||s.length*4)*(arr.slice(0,k).join(' ').length/Math.max(1,s.length));
          itens.push({str:tok, x:x+desl, y:y, w:Math.max(2,larg)});
        });
      });
      totalItens+=itens.length;
      paginas.push({num:p, itens:itens, alt:alt});
    }
    if(totalItens<5){
      status('cvStatus','<strong>Este PDF não tem texto para extrair.</strong> A lista provavelmente é uma imagem ou captura de tela colada no documento (acontece com frequência em Cotas e Despachos do SEI). '
        +'A leitura automática não funciona neste caso — <strong>copie e cole</strong> a tabela no quadro abaixo, ou digite os dados direto na conferência do passo 2.','warn');
      $('cvTexto').value='';
      return;
    }
    estado.paginasPdf=paginas;
    $('cvTexto').value=paginas.map(pg=>{
      return agruparLinhas(pg.itens).map(l=>l.itens.map(i=>i.str).join(' ')).join('\n');
    }).join('\n\n');
    montarMapaLinhas();
    status('cvStatus','PDF lido: <strong>'+pdf.numPages+'</strong> página(s). Agora <strong>selecione com o mouse</strong>, no quadro abaixo, apenas o trecho da tabela de convocados — depois clique em “Reconhecer tabela”.','ok');
  }catch(e){
    status('cvStatus','Não foi possível ler o PDF ('+esc(e.message||e)+'). Copie e cole a tabela no quadro abaixo.','warn');
  }
}

// Relaciona cada linha do quadro de texto com os itens de PDF correspondentes,
// para que a seleção do usuário recorte exatamente os mesmos itens.
function montarMapaLinhas(){
  estado.mapaLinhas=[];
  if(!estado.paginasPdf) return;
  estado.paginasPdf.forEach((pg,pi)=>{
    agruparLinhas(pg.itens).forEach(l=> estado.mapaLinhas.push(l.itens));
    if(pi<estado.paginasPdf.length-1) estado.mapaLinhas.push(null); // linha em branco entre páginas
  });
}

function itensDoTrecho(){
  const ta=$('cvTexto');
  const texto=ta.value;
  let ini=ta.selectionStart, fim=ta.selectionEnd;
  const selecionou = (fim-ini)>3;
  if(estado.paginasPdf && estado.mapaLinhas && estado.mapaLinhas.length){
    // caminho PDF: recorta pelos índices de linha cobertos pela seleção
    const linhas=texto.split('\n');
    let pos=0, de=0, ate=linhas.length-1;
    if(selecionou){
      de=-1;
      for(let i=0;i<linhas.length;i++){
        const p0=pos, p1=pos+linhas[i].length;
        if(de<0 && p1>=ini) de=i;
        if(p0<=fim) ate=i;
        pos=p1+1;
      }
      if(de<0) de=0;
    }
    const out=[];
    for(let i=de;i<=ate && i<estado.mapaLinhas.length;i++){
      const its=estado.mapaLinhas[i];
      if(its) its.forEach(t=>out.push(t));
    }
    if(out.length) return out;
  }
  // caminho colagem: gera itens sintéticos a partir do texto
  return itensDeTexto(selecionou ? texto.slice(ini,fim) : texto);
}

function reconhecer(){
  const itens=itensDoTrecho();
  if(!itens.length){ status('cvStatus','Não há texto para reconhecer. Cole a tabela ou escolha um PDF.','warn'); return; }
  const g=montarGrade(itens);
  if(!g.registros.length){
    status('cvStatus','Não reconheci nenhuma linha de candidato nesse trecho. Verifique se a seleção inclui as linhas com as notas.','warn');
    return;
  }
  estado.bruto=g;
  status('cvStatus','Reconheci <strong>'+g.registros.length+'</strong> linha(s) e <strong>'+g.colunas+'</strong> coluna(s). Confira a correspondência abaixo.','ok');
  renderMapeamento();
  $('cvPasso2').style.display='block';
  rolarAte($('cvPasso2'));
}

/* ================ E) passo 2 — conferência de colunas ================ */

// Palpite do papel de cada coluna, a partir do conteúdo
function palpitarPapeis(g){
  const n=g.colunas, papeis=new Array(n).fill('ignorar');
  const stats=[];
  for(let c=0;c<n;c++){
    let nums=0, palavras=0, horas=0, inteiros=0, cheios=0;
    g.registros.forEach(r=>{
      const v=(r.cels[c]||'').trim();
      if(!v) return;
      cheios++;
      if(extrairHora(v)) horas++;
      const toks=v.split(/\s+/);
      if(toks.every(t=>RE_NUM.test(t))){ nums++; if(toks.every(t=>/^\d+$/.test(t))) inteiros++; }
      if(toks.some(t=>/[A-Za-zÀ-ÿ]{3,}/.test(t))) palavras++;
    });
    stats.push({c:c, nums:nums, palavras:palavras, horas:horas, inteiros:inteiros, cheios:cheios});
  }
  const tot=g.registros.length;
  // 1) a coluna de NOME é a primeira (mais à esquerda) com texto na maioria das
  //    linhas — as demais colunas com palavras costumam ser "situação",
  //    "data/horário/local" etc., que não devem virar parte do nome
  let colNome=-1;
  for(let i=0;i<stats.length;i++){
    if(stats[i].cheios && stats[i].palavras>=tot*0.6){ colNome=stats[i].c; break; }
  }
  if(colNome<0){
    const s=stats.slice().sort((a,b)=>b.palavras-a.palavras)[0];
    if(s && s.palavras>0) colNome=s.c;
  }
  stats.forEach(s=>{
    if(!s.cheios) return;
    if(s.c===colNome){ papeis[s.c]='nome'; return; }
    if(s.horas>=tot*0.6) papeis[s.c]='horario';
    else if(s.nums>=tot*0.6) papeis[s.c]='numeros';
    else papeis[s.c]='ignorar';
  });
  // primeira coluna só com números inteiros = ordem
  const p=stats.find(s=>s.cheios>0);
  if(p && p.c!==colNome && p.inteiros>=tot*0.8 && papeis[p.c]==='numeros') papeis[p.c]='ordem';
  return papeis;
}

// Números de um registro, na ordem de leitura, considerando os papéis
function numerosDoRegistro(r, papeis){
  const out=[];
  papeis.forEach((p,c)=>{
    if(p!=='nome' && p!=='numeros') return;
    const v=(r.cels[c]||'').trim();
    if(!v) return;
    v.split(/\s+/).forEach(t=>{ if(ehNumero(t)) out.push(t); });
  });
  return out;
}
function nomeDoRegistro(r, papeis){
  const partes=[];
  papeis.forEach((p,c)=>{
    if(p!=='nome') return;
    const v=(r.cels[c]||'').trim();
    if(!v) return;
    v.split(/\s+/).forEach(t=>{ if(!ehNumero(t) && !/^\d{1,2}[hH:]\d{2}/.test(t)) partes.push(t); });
  });
  return partes.join(' ').replace(/\s+/g,' ').trim();
}
function horaDoRegistro(r, papeis){
  let h=null;
  papeis.forEach((p,c)=>{
    if(h || (p!=='horario' && p!=='nome')) return;
    h=extrairHora(r.cels[c]||'');
  });
  return h;
}

function palpitarSlots(qtd, g){
  const cab=semAcento((g&&g.cabecalho)||'').toUpperCase();
  const temAcertos=/ACERTO/.test(cab);
  const temDis=/DISCURSIV|SUBJETIV/.test(cab);
  const temTot=/TOTAL/.test(cab);
  const s=new Array(qtd).fill('ignorar');
  if(qtd<=0) return s;
  if(qtd===1){ s[0]='nota'; }
  else if(qtd===2){
    if(temAcertos){ s[0]='acertos'; s[1]='nota'; }
    else if(temDis && !temTot){ s[0]='obj'; s[1]='dis'; }
    else { s[0]='obj'; s[1]='tot'; }
  }
  else if(qtd===3){ s[0]='obj'; s[1]='dis'; s[2]='tot'; }
  else if(qtd>=4){
    if(temAcertos){ s[0]='acertos'; s[1]='obj'; s[2]='dis'; s[3]='tot'; }
    else { s[0]='obj'; s[1]='dis'; s[2]='tot'; }
  }
  return s;
}

function renderMapeamento(){
  const g=estado.bruto;
  if(!g) return;
  if(!estado.papeis || estado.papeis.length!==g.colunas) estado.papeis=palpitarPapeis(g);
  const papeis=estado.papeis;

  let h='<p class="step-desc">Diga o que é cada coluna reconhecida. As três primeiras linhas aparecem como amostra.</p>';
  h+='<div class="simple-table-wrap"><table class="simple-table" style="font-size:12px;"><tr>';
  for(let c=0;c<g.colunas;c++){
    h+='<th><select data-col="'+c+'" class="cvSelCol" style="width:100%;font-size:12px;padding:4px;">'
      +PAPEIS.map(p=>'<option value="'+p.v+'"'+(papeis[c]===p.v?' selected':'')+'>'+p.t+'</option>').join('')
      +'</select></th>';
  }
  h+='</tr>';
  g.registros.slice(0,3).forEach(r=>{
    h+='<tr>'+r.cels.map(c=>'<td>'+esc(c||'')+'</td>').join('')+'</tr>';
  });
  h+='</table></div>';

  const amostra=g.registros.map(r=>numerosDoRegistro(r,papeis).length);
  const qtd=amostra.length? amostra.sort((a,b)=>a-b)[Math.floor(amostra.length/2)] : 0;
  if(!estado.slots || estado.slots.length!==qtd) estado.slots=palpitarSlots(qtd,g);

  if(qtd>0){
    h+='<p class="step-desc" style="margin-top:18px;">Os números encontrados em cada linha, <strong>na ordem em que aparecem</strong>, correspondem a:</p>';
    h+='<div class="step-content" style="display:flex;flex-wrap:wrap;gap:10px;">';
    for(let i=0;i<qtd;i++){
      h+='<label style="font-size:12.5px;color:var(--ink-soft);">'+(i+1)+'º número<br><select data-slot="'+i+'" class="cvSelSlot" style="font-size:12.5px;padding:6px;">'
        +SLOTS.map(s=>'<option value="'+s.v+'"'+(estado.slots[i]===s.v?' selected':'')+'>'+s.t+'</option>').join('')
        +'</select></label>';
    }
    h+='</div>';
  } else {
    h+='<p class="step-desc" style="color:var(--coral);">Nenhum número foi encontrado nas colunas marcadas como “Nome” ou “Notas / acertos”. Reveja a marcação acima.</p>';
  }

  const p=g.registros[0];
  if(p){
    h+='<div class="notice-banner ok" style="margin-left:0;">Primeira linha como ficará: <strong>'+esc(nomeDoRegistro(p,papeis)||'(sem nome)')+'</strong>'
      +' — números: '+esc(numerosDoRegistro(p,papeis).join(' | ')||'nenhum')
      +' — horário: '+esc(horaDoRegistro(p,papeis)?fmtHora(horaDoRegistro(p,papeis),estado.fmtHorario):'nenhum')+'</div>';
  }
  if(g.ignoradas.length){
    h+='<div class="notice-banner warn" style="margin-left:0;"><strong>'+g.ignoradas.length+' linha(s) não foram aproveitadas</strong> (texto solto no trecho selecionado):<ul class="warn-list">'
      +g.ignoradas.slice(0,8).map(t=>'<li>'+esc(t.slice(0,110))+'</li>').join('')+'</ul></div>';
  }
  $('cvMapa').innerHTML=h;

  document.querySelectorAll('.cvSelCol').forEach(s=> s.addEventListener('change',()=>{
    estado.papeis[Number(s.dataset.col)]=s.value;
    estado.slots=null;
    renderMapeamento();
  }));
  document.querySelectorAll('.cvSelSlot').forEach(s=> s.addEventListener('change',()=>{
    estado.slots[Number(s.dataset.slot)]=s.value;
    renderMapeamento();
  }));
}

function importarParaGrade(substituir){
  const g=estado.bruto;
  if(!g) return;
  const papeis=estado.papeis, slots=estado.slots||[];
  if(substituir) estado.cands=[];
  const porNome={};
  estado.cands.forEach(c=> porNome[chaveNome(c.nome)]=c);

  let usaObj=false, usaNota=false, usaAcertos=false;
  let novos=0, fundidos=0;

  g.registros.forEach(r=>{
    const nome=nomeDoRegistro(r,papeis);
    if(!nome) return;
    const nums=numerosDoRegistro(r,papeis);
    const ch=chaveNome(nome);
    let c=porNome[ch];
    const novo=!c;
    if(novo){ c=novoCand(); c.nome=nome; }
    slots.forEach((s,i)=>{
      const v=paraNumero(nums[i]);
      if(v==null) return;
      if(s==='obj'){ c.obj=v; usaObj=true; }
      else if(s==='dis'){ c.dis=v; usaObj=true; }
      else if(s==='tot'){ c.tot=v; usaObj=true; }
      else if(s==='nota'){ c.tot=v; usaNota=true; }
      else if(s==='acertos'){ c.acertos=v; usaAcertos=true; }
    });
    const h=horaDoRegistro(r,papeis);
    if(h) c.hora=h;
    if(r.cota==='ppp') c.ppp=true;
    else if(r.cota==='pcd') c.pcd=true;
    else if(r.cota==='ac') c.ac=true;
    if(novo){ estado.cands.push(c); porNome[ch]=c; novos++; }
    else fundidos++;
  });

  if(usaNota && !usaObj) estado.modo='unica';
  if(usaObj) estado.modo='duas';
  if(usaAcertos) estado.acertos=true;

  // candidato sem nenhuma cota marcada entra na ampla concorrência
  estado.cands.forEach(c=>{ if(!c.ac && !c.ppp && !c.pcd) c.ac=true; });

  renderGrade();
  rolarAte($('cvPasso3'));
  const msg=novos+' candidato(s) importado(s)'+(fundidos?' e '+fundidos+' já existente(s) atualizado(s) — cotas foram somadas ao mesmo candidato':'')+'.';
  status('cvStatus',msg+' Confira tudo no passo 2.','ok');
}

/* ==================== F) passo 3 — grade de candidatos ==================== */

function totalCalculado(c){
  if(estado.modo!=='duas') return null;
  if(c.obj==null && c.dis==null) return null;
  return (c.obj||0)+(c.dis||0);
}

function avisosGrade(){
  const av=[];
  estado.cands.forEach((c,i)=>{
    const n=i+1;
    if(!c.nome.trim()) av.push({id:c.id, txt:'Linha '+n+': nome em branco.'});
    const calc=totalCalculado(c);
    if(calc!=null && c.tot!=null && Math.abs(calc-c.tot)>0.005){
      av.push({id:c.id, txt:'Linha '+n+' ('+c.nome+'): a soma das notas dá '+fmtNota(calc)+', mas o total informado é '+fmtNota(c.tot)+'. O valor informado foi mantido.'});
    }
    [['obj','objetiva'],['dis','discursiva'],['tot','total']].forEach(([k,rot])=>{
      if(c[k]!=null && (c[k]<0 || c[k]>10)) av.push({id:c.id, txt:'Linha '+n+': nota '+rot+' fora da faixa 0–10 ('+fmtNota(c[k])+').'});
    });
    if(!c.ac && !c.ppp && !c.pcd) av.push({id:c.id, txt:'Linha '+n+' ('+c.nome+'): nenhuma cota marcada — não aparecerá em tabela alguma.'});
  });
  // empates
  const porTotal={};
  estado.cands.forEach(c=>{ const k=(c.tot==null?'?':c.tot.toFixed(2)); (porTotal[k]=porTotal[k]||[]).push(c); });
  Object.keys(porTotal).forEach(k=>{
    if(k!=='?' && porTotal[k].length>1){
      av.push({tipo:'info', txt:'Empate em '+fmtNota(Number(k))+': '+porTotal[k].map(c=>c.nome||'(sem nome)').join(', ')+'. O desempate (idade, jurado, sorteio) é manual — use as setas para ordenar.'});
    }
  });
  // horários repetidos
  const porHora={};
  estado.cands.forEach(c=>{ if(!c.hora) return; const k=c.hora.h+':'+c.hora.m; (porHora[k]=porHora[k]||[]).push(c); });
  Object.keys(porHora).forEach(k=>{
    if(porHora[k].length>1) av.push({txt:'Horário '+fmtHora(porHora[k][0].hora,estado.fmtHorario)+' repetido em '+porHora[k].length+' candidatos.'});
  });
  return av;
}

function colunasAtivas(){
  const cols=[{k:'ordem', t:'ORDEM'}, {k:'nome', t:'NOME'}];
  if(estado.acertos) cols.push({k:'acertos', t:'ACERTOS'});
  if(estado.modo==='duas'){
    cols.push({k:'obj', t:'NOTA PROVA OBJETIVA'});
    cols.push({k:'dis', t:'NOTA PROVA DISCURSIVA'});
    cols.push({k:'tot', t:'TOTAL'});
  } else {
    cols.push({k:'tot', t:'NOTA'});
  }
  if(estado.cands.some(c=>c.hora)) cols.push({k:'hora', t:'HORÁRIO DA ENTREVISTA'});
  return cols;
}

function renderGrade(){
  const av=avisosGrade();
  const comAviso={};
  av.forEach(a=>{ if(a.id) comAviso[a.id]=true; });

  let h='<div class="table-scroll" style="max-height:none;"><table style="white-space:normal;font-family:\'Barlow\',system-ui,sans-serif;font-size:12.5px;">';
  h+='<thead><tr><th style="width:34px;">#</th><th>Nome</th>';
  if(estado.acertos) h+='<th style="width:70px;">Acertos</th>';
  if(estado.modo==='duas'){ h+='<th style="width:70px;">Objetiva</th><th style="width:70px;">Discursiva</th><th style="width:70px;">Total</th>'; }
  else h+='<th style="width:70px;">Nota</th>';
  h+='<th style="width:78px;">Horário</th><th style="width:38px;">AC</th><th style="width:44px;">PPP</th><th style="width:44px;">PcD</th><th style="width:86px;">Ações</th></tr></thead><tbody>';

  estado.cands.forEach((c,i)=>{
    const cl=comAviso[c.id]?' class="unmatched"':'';
    h+='<tr'+cl+' data-id="'+c.id+'">';
    h+='<td style="text-align:center;color:var(--ink-soft);">'+(i+1)+'</td>';
    h+='<td><input class="cvIn" data-f="nome" value="'+esc(c.nome)+'" style="width:100%;min-width:180px;padding:5px;border:1px solid var(--line);font-size:12.5px;"></td>';
    if(estado.acertos) h+='<td><input class="cvIn" data-f="acertos" value="'+esc(fmtInt(c.acertos))+'" style="width:100%;padding:5px;border:1px solid var(--line);text-align:right;font-size:12.5px;"></td>';
    const campos = (estado.modo==='duas')?['obj','dis','tot']:['tot'];
    campos.forEach(f=>{
      h+='<td><input class="cvIn" data-f="'+f+'" value="'+esc(fmtNota(c[f]))+'" style="width:100%;padding:5px;border:1px solid var(--line);text-align:right;font-size:12.5px;"></td>';
    });
    h+='<td><input class="cvIn" data-f="hora" value="'+esc(c.hora?fmtHora(c.hora,estado.fmtHorario):'')+'" placeholder="—" style="width:100%;padding:5px;border:1px solid var(--line);text-align:center;font-size:12.5px;"></td>';
    ['ac','ppp','pcd'].forEach(k=>{
      h+='<td style="text-align:center;"><input type="checkbox" class="cvChk" data-f="'+k+'"'+(c[k]?' checked':'')+'></td>';
    });
    h+='<td style="text-align:center;white-space:nowrap;">'
      +'<button type="button" class="cvAct" data-a="sobe" title="Subir">↑</button> '
      +'<button type="button" class="cvAct" data-a="desce" title="Descer">↓</button> '
      +'<button type="button" class="cvAct" data-a="apaga" title="Excluir">✕</button></td>';
    h+='</tr>';
  });
  h+='</tbody></table></div>';
  if(!estado.cands.length) h='<p class="empty-hint">Nenhum candidato ainda. Importe do passo 1 ou clique em “Nova linha”.</p>';
  $('cvGrade').innerHTML=h;

  document.querySelectorAll('#cvGrade .cvIn').forEach(inp=>{
    inp.addEventListener('change',()=>{
      const id=Number(inp.closest('tr').dataset.id);
      const c=estado.cands.find(x=>x.id===id);
      if(!c) return;
      const f=inp.dataset.f;
      if(f==='nome') c.nome=inp.value;
      else if(f==='hora') c.hora=extrairHora(inp.value);
      else if(f==='acertos') c.acertos=paraNumero(inp.value);
      else c[f]=paraNumero(inp.value);
      renderGrade();
    });
  });
  document.querySelectorAll('#cvGrade .cvChk').forEach(chk=>{
    chk.addEventListener('change',()=>{
      const id=Number(chk.closest('tr').dataset.id);
      const c=estado.cands.find(x=>x.id===id);
      if(c){ c[chk.dataset.f]=chk.checked; renderGrade(); }
    });
  });
  document.querySelectorAll('#cvGrade .cvAct').forEach(b=>{
    b.addEventListener('click',()=>{
      const id=Number(b.closest('tr').dataset.id);
      const i=estado.cands.findIndex(x=>x.id===id);
      if(i<0) return;
      const a=b.dataset.a;
      if(a==='apaga') estado.cands.splice(i,1);
      else if(a==='sobe' && i>0){ const t=estado.cands[i-1]; estado.cands[i-1]=estado.cands[i]; estado.cands[i]=t; }
      else if(a==='desce' && i<estado.cands.length-1){ const t=estado.cands[i+1]; estado.cands[i+1]=estado.cands[i]; estado.cands[i]=t; }
      renderGrade();
    });
  });

  let ah='';
  if(av.length){
    ah='<div class="notice-banner warn" style="margin-left:0;"><strong>'+av.length+' ponto(s) para conferir — nada foi alterado automaticamente:</strong><ul class="warn-list" style="color:var(--ink-soft);">'
      +av.map(a=>'<li>'+esc(a.txt)+'</li>').join('')+'</ul></div>';
  } else if(estado.cands.length){
    ah='<div class="notice-banner ok" style="margin-left:0;">Nenhuma inconsistência encontrada nos '+estado.cands.length+' candidatos.</div>';
  }
  $('cvAvisos').innerHTML=ah;
  $('cvResumo').textContent = estado.cands.length
    ? (estado.cands.length+' candidato(s) · ampla '+estado.cands.filter(c=>c.ac).length
       +' · PPP '+estado.cands.filter(c=>c.ppp).length
       +' · PcD '+estado.cands.filter(c=>c.pcd).length)
    : '';
}

function ordenarPorTotal(){
  estado.cands.sort((a,b)=>{
    const va=(a.tot==null?-1:a.tot), vb=(b.tot==null?-1:b.tot);
    return vb-va;
  });
  renderGrade();
}

function preencherHorarios(){
  const ini=extrairHora($('cvHoraInicial').value);
  const passo=Number($('cvHoraIntervalo').value)||0;
  if(!ini){ alert('Informe o horário inicial no formato 13h30 ou 13:30.'); return; }
  let min=ini.h*60+ini.m;
  estado.cands.forEach(c=>{
    c.hora={h:Math.floor(min/60)%24, m:min%60};
    min+=passo;
  });
  renderGrade();
}

/* ==================== G) passo 4 — dados do edital ==================== */

function lerCamposDoc(){
  Object.keys(estado.doc).forEach(k=>{
    const el=$('cvF_'+k);
    if(el) estado.doc[k]=el.value;
  });
}
function escreverCamposDoc(){
  Object.keys(estado.doc).forEach(k=>{
    const el=$('cvF_'+k);
    if(el) el.value=estado.doc[k]||'';
  });
}

/* ==================== H) passo 5 — geração do edital ==================== */

const GRUPOS=[
  {k:'ac',  rot:'AMPLA CONCORRÊNCIA'},
  {k:'ppp', rot:'PESSOA PRETA OU PARDA'},
  {k:'pcd', rot:'PcD - PESSOA COM DEFICIÊNCIA'}
];

function celulaTxt(c, col){
  if(col.k==='nome') return (c.nome||'').toUpperCase();
  if(col.k==='acertos') return fmtInt(c.acertos);
  if(col.k==='hora') return c.hora?fmtHora(c.hora,estado.fmtHorario):'';
  return fmtNota(c[col.k]);
}

function tabelaHtml(grupo, cols){
  const lista=estado.cands.filter(c=>c[grupo.k]);
  if(!lista.length) return '';
  const bordas='border:1pt solid #000;border-collapse:collapse;';
  const td='style="border:1pt solid #000;padding:3pt 5pt;vertical-align:top;"';
  let h='<table style="'+bordas+'width:100%;margin:0 0 12pt;font-family:\'Times New Roman\',Times,serif;font-size:11pt;">';
  h+='<tr><td colspan="'+cols.length+'" style="border:1pt solid #000;padding:3pt 5pt;font-weight:bold;">'+esc(grupo.rot)+'</td></tr>';
  h+='<tr>'+cols.map(c=>'<td '+td.replace('vertical-align:top;','vertical-align:top;font-weight:bold;')+'>'+esc(c.t)+'</td>').join('')+'</tr>';
  lista.forEach((c,i)=>{
    h+='<tr>'+cols.map(col=>{
      const v = (col.k==='ordem') ? String(i+1) : celulaTxt(c,col);
      return '<td '+td+'>'+esc(v)+'</td>';
    }).join('')+'</tr>';
  });
  h+='</table>';
  return h;
}

function gerarEdital(){
  lerCamposDoc();
  const d=estado.doc;
  const cols=colunasAtivas();
  const P='margin:0 0 10pt;font-family:\'Times New Roman\',Times,serif;font-size:11pt;';
  const C=P+'text-align:center;font-weight:bold;';
  let h='<div style="font-family:\'Times New Roman\',Times,serif;font-size:11pt;color:#000;">';
  h+='<p style="'+C+'">TRIBUNAL DE JUSTIÇA DO ESTADO DO PARANÁ</p>';
  h+='<p style="'+C+'margin-top:24pt;">EDITAL DE CONVOCAÇÃO PARA ENTREVISTA N° '+esc(d.nConv||'____/____')+'</p>';
  h+='<p style="'+C+'">PROCESSO SELETIVO PARA O PROGRAMA DE RESIDÊNCIA JURÍDICA</p>';
  h+='<p style="'+C+'margin-top:20pt;">EDITAL N° '+esc(d.nEdital||'____/____')+'<br>SEI!TJPR N° '+esc(d.sei||'____________')+'</p>';
  h+='<div style="margin-top:20pt;">';
  GRUPOS.forEach(g=>{ h+=tabelaHtml(g,cols); });
  h+='</div>';

  let dataLinha=esc(d.data||'');
  if(d.horarioGeral) dataLinha += (dataLinha?', ':'')+esc(d.horarioGeral);
  if(dataLinha) h+='<p style="'+P+'"><strong>Data:</strong> '+dataLinha+'</p>';
  if(d.local) h+='<p style="'+P+'"><strong>Local:</strong> '+esc(d.local).replace(/\n/g,'<br>')+'</p>';
  if(d.telefone) h+='<p style="'+P+'"><strong>Telefone:</strong> '+esc(d.telefone)+'</p>';
  if(d.extra) h+='<p style="'+P+'">'+esc(d.extra).replace(/\n/g,'<br>')+'</p>';

  h+='<p style="'+P+'text-align:center;margin-top:26pt;">'+esc(d.cidade||'Curitiba')+', '+esc(d.dataAss||'____ de __________ de ____')+'.</p>';
  h+='<p style="'+C+'margin-top:26pt;">'+esc((d.assinante||'').toUpperCase())+'</p>';
  if(d.cargo) h+='<p style="'+P+'text-align:center;">'+esc(d.cargo)+'</p>';
  if(d.unidade) h+='<p style="'+P+'text-align:center;">'+esc(d.unidade)+'</p>';
  h+='</div>';

  $('cvSaida').innerHTML=h;
  $('cvSaidaBox').style.display='block';
  const faltando=[];
  if(!d.nConv) faltando.push('nº do edital de convocação');
  if(!d.nEdital) faltando.push('nº do edital de abertura');
  if(!d.sei) faltando.push('nº SEI');
  if(!d.assinante) faltando.push('nome de quem assina');
  if(!estado.cands.length) faltando.push('candidatos');
  $('cvMsgSaida').innerHTML = faltando.length
    ? '<span style="color:var(--coral);">Faltou preencher: '+esc(faltando.join(', '))+'.</span>'
    : 'Edital gerado. Confira o texto antes de publicar.';
}

async function copiarEdital(){
  const el=$('cvSaida');
  try{
    if(navigator.clipboard && window.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([el.innerHTML],{type:'text/html'}),
        'text/plain': new Blob([el.innerText||el.textContent],{type:'text/plain'})
      })]);
      $('cvMsgSaida').textContent='Edital copiado — cole no Athos ou no Word.';
      return;
    }
  }catch(e){ /* cai no método antigo abaixo */ }
  const sel=window.getSelection(), r=document.createRange();
  r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r);
  let ok=false;
  try{ ok=document.execCommand('copy'); }catch(e){ ok=false; }
  sel.removeAllRanges();
  $('cvMsgSaida').textContent= ok?'Edital copiado — cole no Athos ou no Word.':'Não foi possível copiar automaticamente; selecione o texto e use Ctrl+C.';
}

function imprimirPdf(){
  const w=window.open('','_blank');
  if(!w){ $('cvMsgSaida').innerHTML='<span style="color:var(--coral);">O navegador bloqueou a janela de impressão — permita pop-ups para esta página.</span>'; return; }
  w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Edital de Convocação para Entrevista</title>'
    +'<style>@page{size:A4;margin:2.5cm 2cm;} body{font-family:"Times New Roman",Times,serif;font-size:11pt;color:#000;margin:0;}'
    +'table{border-collapse:collapse;width:100%;} td{border:1pt solid #000;padding:3pt 5pt;}</style></head><body>'
    +$('cvSaida').innerHTML+'</body></html>');
  w.document.close(); w.focus();
  setTimeout(()=>{ w.print(); },350);
}

function alternarEdicao(){
  const el=$('cvSaida');
  const lig=el.getAttribute('contenteditable')==='true';
  el.setAttribute('contenteditable', lig?'false':'true');
  el.style.outline = lig?'none':'2px dashed var(--teal)';
  $('cvBtnEditar').textContent = lig?'Editar texto':'Concluir edição';
  if(!lig) el.focus();
}

/* ============== I) rascunho (exportar/importar) e início ============== */

function exportarRascunho(){
  lerCamposDoc();
  const dados={
    versao:1, gerado:new Date().toISOString(),
    modo:estado.modo, acertos:estado.acertos, fmtHorario:estado.fmtHorario,
    doc:estado.doc, cands:estado.cands
  };
  const blob=new Blob([JSON.stringify(dados,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='rascunho_convocacao_'+(estado.doc.nConv||'sem_numero').replace(/[^\w-]/g,'_')+'.json';
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000);
}

function importarRascunho(file){
  const fr=new FileReader();
  fr.onload=()=>{
    try{
      const d=JSON.parse(fr.result);
      if(!d || !Array.isArray(d.cands)) throw new Error('arquivo sem lista de candidatos');
      estado.modo=d.modo||'duas';
      estado.acertos=!!d.acertos;
      estado.fmtHorario=d.fmtHorario||'H';
      estado.doc=Object.assign(estado.doc, d.doc||{});
      estado.cands=d.cands.map(c=>Object.assign(novoCand(), c, {id:estado.seq++}));
      escreverCamposDoc();
      sincronizarControles();
      renderGrade();
      status('cvStatus','Rascunho importado: '+estado.cands.length+' candidato(s).','ok');
    }catch(e){
      status('cvStatus','Não consegui ler este rascunho ('+esc(e.message||e)+'). Verifique se é o arquivo .json gerado por esta ferramenta.','warn');
    }
  };
  fr.readAsText(file);
}

function sincronizarControles(){
  $('cvModo').value=estado.modo;
  $('cvAcertos').checked=estado.acertos;
  $('cvFmtHora').value=estado.fmtHorario;
}

document.addEventListener('DOMContentLoaded',()=>{
  // passo 1
  $('cvArquivo').addEventListener('change',e=>{
    const f=e.target.files[0];
    if(!f) return;
    $('cvNomeArquivo').textContent=f.name;
    lerPdf(f);
  });
  $('cvBtnArquivo').addEventListener('click',()=> $('cvArquivo').click());
  $('cvBtnReconhecer').addEventListener('click',reconhecer);
  $('cvBtnLimpar').addEventListener('click',()=>{
    $('cvTexto').value=''; estado.paginasPdf=null; estado.mapaLinhas=null;
    $('cvNomeArquivo').textContent='nenhum arquivo escolhido';
    $('cvPasso2').style.display='none';
    status('cvStatus','Quadro de texto limpo.','');
  });
  $('cvTexto').addEventListener('input',()=>{ estado.paginasPdf=null; estado.mapaLinhas=null; });

  // passo 2
  $('cvBtnImportar').addEventListener('click',()=>importarParaGrade(true));
  $('cvBtnAcrescentar').addEventListener('click',()=>importarParaGrade(false));

  // passo 3
  $('cvModo').addEventListener('change',e=>{ estado.modo=e.target.value; renderGrade(); });
  $('cvAcertos').addEventListener('change',e=>{ estado.acertos=e.target.checked; renderGrade(); });
  $('cvFmtHora').addEventListener('change',e=>{ estado.fmtHorario=e.target.value; renderGrade(); });
  $('cvBtnNova').addEventListener('click',()=>{ estado.cands.push(novoCand()); renderGrade(); });
  $('cvBtnOrdenar').addEventListener('click',ordenarPorTotal);
  $('cvBtnHorarios').addEventListener('click',preencherHorarios);
  $('cvBtnExportar').addEventListener('click',exportarRascunho);
  $('cvBtnRascunho').addEventListener('click',()=> $('cvRascunho').click());
  $('cvRascunho').addEventListener('change',e=>{ const f=e.target.files[0]; if(f) importarRascunho(f); e.target.value=''; });

  // passos 4 e 5
  $('cvBtnGerar').addEventListener('click',gerarEdital);
  $('cvBtnCopiar').addEventListener('click',copiarEdital);
  $('cvBtnPDF').addEventListener('click',imprimirPdf);
  $('cvBtnEditar').addEventListener('click',alternarEdicao);

  sincronizarControles();
  renderGrade();
});
