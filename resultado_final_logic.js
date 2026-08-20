/* Gerador da Tabela de Resultado Final — Unidades Externas (TJPR)

   Para a comarca/unidade que conduz o próprio processo seletivo informar as
   notas dos candidatos SEM cadastrá-las na Fábrica de Provas, produzindo o
   resultado final no mesmo modelo do Relatório de Classificação Final
   (colunas idênticas às da Tabela 1 lida pelo Ponto 20).

   100% client-side. Dependências (todas locais, nenhuma de CDN):
     - tjpr_logo.js            logotipo em base64 para o cabeçalho do PDF
     - edital_unidades_sei.js  base sigla SEI -> nome da unidade (sugestão)
     - core.css + ferramentas.js + layout.js  moldura do portal
   Para hospedagem futura fora do portal, só core.css, tjpr_logo.js,
   edital_unidades_sei.js e este arquivo são necessários.

   Saídas:
     - PDF (montado byte a byte, baixado direto): cabeçalho institucional +
       tabela em texto extraível. FORMATO DOCUMENTADO para leitura por
       ferramenta: linhas de cabeçalho centralizadas, nesta ordem — TRIBUNAL
       DE JUSTIÇA DO ESTADO DO PARANÁ / PROCESSO SELETIVO DE ESTAGIÁRIOS /
       SEI Nº x / TABELA DE CLASSIFICAÇÃO FINAL / nome da unidade —,
       depois uma tabela com bordas em que cada candidato ocupa UMA linha,
       nas colunas fixas: CLASSIFICAÇÃO | INSCRIÇÃO | NOME | E-MAIL | PROVA |
       ENTREVISTA | FINAL | RESERVA | NASCIMENTO (mesmo com colunas vazias,
       a estrutura não muda — um leitor por posição nunca se perde).
     - CSV (.csv, ';', UTF-8 com BOM): mesmas colunas — aceito diretamente
       pela ferramenta do Ponto 20 hoje.

   Nuvem: cada preenchimento é gravado no Supabase (tabela
   resultado_final_unidades) com id igual aos dígitos do processo SEI —
   salvar de novo com o mesmo SEI substitui o registro (é o mecanismo de
   correção). SQL de criação e notas de backup: Recursos/resultado_final_unidades.sql.

   Estrutura do arquivo:
     A) utilidades de texto/número/data
     B) sugestão de unidade pela sigla SEI
     C) estado da ferramenta
     D) tabela de candidatos: desenho, edição tab-safe, arrastar e soltar
     E) reordenações e avisos
     F) documentos: CSV e PDF
     G) nuvem: salvar, buscar, carregar, backup
     H) rascunho local (autosave + arquivo) e ligação com a página
*/
(function(){
'use strict';

/* ========================= A) utilidades ========================= */

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s){ return esc(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function semAcento(s){ return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
// chave estável de nome: sem acento, maiúscula, só letras e espaços — usada
// na ordenação alfabética e na composição do id do registro na nuvem
function chaveNome(s){ return semAcento(s).toUpperCase().replace(/[^A-Z ]/g,' ').replace(/\s+/g,' ').trim(); }
function limpar(v){ return String(v==null?'':v).trim().replace(/\s+/g,' '); }
function soDigitos(v){ return String(v==null?'':v).replace(/\D/g,''); }

// "8,5"/"8.5"/"85"(=8,50)/"770"(=7,70) -> número | null — mesma convenção de
// digitação rápida das ferramentas da Residência ("10" é sempre a nota máxima)
function paraNumero(txt){
  const bruto = String(txt==null?'':txt).trim();
  if(bruto==='') return null;
  if(bruto==='10') return 10;
  if(/^\d{2,}$/.test(bruto)){
    const inteiro = bruto.length===2 ? bruto.slice(0,1) : bruto.slice(0, bruto.length-2);
    const decimal = bruto.length===2 ? bruto.slice(1)+'0' : bruto.slice(-2);
    const n = Number(inteiro+'.'+decimal);
    return isFinite(n) ? n : null;
  }
  const n = Number(bruto.replace(',','.'));
  return isFinite(n) ? n : null;
}
// 8.5 -> "8,50" (duas casas, vírgula) — o formato que sai na tela, no CSV e no PDF
function fmtNota(v){
  if(v==null || v==='') return '';
  const n = (typeof v==='number') ? v : paraNumero(v);
  if(n==null) return String(v);
  return n.toFixed(2).replace('.',',');
}

// "28/07/1998" -> Date | null (o único formato aceito nesta ferramenta — a
// máscara do campo já força DD/MM/AAAA)
function parseDataNascimento(txt){
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(txt==null?'':txt).trim());
  if(!m) return null;
  const d = new Date(Number(m[3]), Number(m[2])-1, Number(m[1]));
  return isNaN(d) ? null : d;
}

// média de prova e entrevista — null quando falta uma das duas (nunca
// calculamos "média de um número só")
function calcularMedia(l){
  if(l.notaProva==null || l.notaEntrevista==null) return null;
  return (l.notaProva + l.notaEntrevista) / 2;
}
function notaFinalDivergente(l){
  const media = calcularMedia(l);
  if(media==null || l.notaFinal==null) return false;
  return Math.abs(l.notaFinal - media) > 0.005;
}

/* ============ B) sugestão de unidade pela sigla SEI ============
   Mesma montagem de nome por extenso do Gerador do Edital de Abertura
   (edital_logic.js) — duplicada de propósito: as ferramentas deste projeto
   não compartilham módulos, cada página carrega só o que usa. */
function conectorDeGenero(nivel){
  const primeira=nivel.trim().split(/[\s-]+/)[0].toUpperCase();
  if(primeira==='FORO' || primeira==='TRIBUNAL' || primeira==='JUIZADO' || primeira==='JUÍZO') return 'DO ';
  if(/(ª|ÇÃO|ÇÕES|SÃO|SÕES|DADE|DADES|AGEM|AGENS|AS?)$/.test(primeira)) return 'DA ';
  if(/[ºO]$/.test(primeira)) return 'DO ';
  return 'DO ';
}
function nomeUnidadePorExtenso(bruto){
  const niveis=String(bruto||'').split('|').map(s=>s.trim()).filter(Boolean);
  if(!niveis.length) return '';
  let nome=niveis[niveis.length-1].toUpperCase();
  for(let i=niveis.length-2;i>=0;i--){
    const nivel=niveis[i];
    if(i===0){
      const primeira=nivel.split(/\s+/)[0].toUpperCase();
      nome += (primeira==='FORO' || primeira==='TRIBUNAL' || primeira==='COMARCA')
        ? (' '+conectorDeGenero(nivel)+nivel.toUpperCase())
        : (' DA COMARCA DE '+nivel.toUpperCase());
    } else {
      nome += ' '+conectorDeGenero(nivel)+nivel.toUpperCase();
    }
  }
  return nome;
}

/* ========================= C) estado ========================= */

// Rótulos de reserva por extenso — escolhidos entre os termos que o Ponto 20
// reconhece (RESERVA_MAP de ponto20_logic.js, comparação sem acento), para o
// CSV/PDF gerado aqui ser lido lá sem aviso de rótulo desconhecido.
const RESERVAS = ['', 'Preto ou pardo', 'Pessoa com deficiência', 'Indígena', 'Vulnerabilidade social'];

const COLUNAS_SAIDA = ['CLASSIFICAÇÃO','INSCRIÇÃO','NOME','E-MAIL','PROVA','ENTREVISTA','FINAL','RESERVA','NASCIMENTO'];

const estado = {
  sigla: '',
  unidade: '',
  sei: '',
  linhas: [],   // {id, inscricao, nome, email, notaProva, notaEntrevista, notaFinal, reserva, nascimento}
  seq: 1
};

function novaLinha(){
  return { id: estado.seq++, inscricao:'', nome:'', email:'',
           notaProva:null, notaEntrevista:null, notaFinal:null,
           reserva:'', nascimento:'' };
}
function idxLinha(id){
  for(let i=0;i<estado.linhas.length;i++){ if(estado.linhas[i].id===id) return i; }
  return -1;
}

/* ===== D) tabela de candidatos: desenho, edição tab-safe, drag&drop ===== */

// A tabela está SEMPRE em edição (é o meio de entrada principal da
// ferramenta). renderTabela() redesenha tudo — por isso só é chamada em
// ações discretas (adicionar, excluir, arrastar, reordenar, carregar). Os
// handlers de 'input'/'change' dos campos NUNCA a chamam: redesenhar no meio
// da transição de foco do Tab destrói o campo que acabou de recebê-lo.
function renderTabela(){
  const corpo = $('rfCorpo');
  if(!corpo) return;

  if(!estado.linhas.length){
    corpo.innerHTML = '<tr><td colspan="11"><p class="empty-hint" style="text-align:center;margin:8px 0;">'
      + (travado ? 'Nenhum candidato na tabela.' : 'Nenhum candidato — use “+ Adicionar candidato” para começar.')
      + '</p></td></tr>';
  } else {
    // travado: campos em somente-leitura (o texto continua selecionável, para
    // poder ser copiado) e nada de alça de arraste nem botão de excluir
    const ro = travado ? ' readonly' : '';
    const cls = travado ? ' rf-in-travado' : '';
    corpo.innerHTML = estado.linhas.map((l,i)=>{
      const divergente = notaFinalDivergente(l) ? ' rf-nota-divergente' : '';
      return '<tr data-id="'+l.id+'" draggable="false">'
        + '<td style="text-align:center;">'
        +   (travado ? '' : '<button type="button" class="drag-handle" data-id="'+l.id+'" tabindex="0"'
            + ' title="Arrastar para reordenar (ou Alt+↑ / Alt+↓)" aria-label="Remanejar '+escAttr(l.nome||'linha em branco')+'">⠿</button>')
        + '</td>'
        + '<td class="rf-col-class">'+(i+1)+'</td>'
        + '<td><input class="rfIn'+cls+'" data-f="inscricao" value="'+escAttr(l.inscricao)+'"'+ro+'></td>'
        + '<td><input class="rfIn'+cls+'" data-f="nome" value="'+escAttr(l.nome)+'"'+ro+'></td>'
        + '<td><input class="rfIn'+cls+'" data-f="email" type="email" value="'+escAttr(l.email)+'"'+ro+'></td>'
        + '<td><input class="rfIn'+cls+'" data-f="notaProva" inputmode="decimal" value="'+escAttr(fmtNota(l.notaProva))+'" style="text-align:center;"'+ro+'></td>'
        + '<td><input class="rfIn'+cls+'" data-f="notaEntrevista" inputmode="decimal" value="'+escAttr(fmtNota(l.notaEntrevista))+'" style="text-align:center;"'+ro+'></td>'
        + '<td><input class="rfIn'+cls+divergente+'" data-f="notaFinal" inputmode="decimal" value="'+escAttr(fmtNota(l.notaFinal))+'" style="text-align:center;"'+ro+'></td>'
        // <select> não tem readonly: travado, ele vira texto simples
        + '<td>'+(travado
            ? '<span class="rf-reserva-travada">'+(l.reserva ? esc(l.reserva) : '—')+'</span>'
            : '<select class="rfIn" data-f="reserva">'
              + RESERVAS.map(r=>'<option value="'+escAttr(r)+'"'+(l.reserva===r?' selected':'')+'>'+(r?esc(r):'— Ampla concorrência —')+'</option>').join('')
              + '</select>')+'</td>'
        + '<td><input class="rfIn'+cls+'" data-f="nascimento" inputmode="numeric" placeholder="DD/MM/AAAA" value="'+escAttr(l.nascimento)+'" style="text-align:center;"'+ro+'></td>'
        + '<td style="text-align:center;">'
        +   (travado ? '' : '<button type="button" class="row-del-btn" data-id="'+l.id+'" tabindex="-1" title="Excluir esta linha">✕</button>')
        + '</td>'
        + '</tr>';
    }).join('');
  }

  const cont = $('rfContagem');
  if(cont) cont.textContent = estado.linhas.length + (estado.linhas.length===1 ? ' candidato na tabela.' : ' candidatos na tabela.');
  ligarEventosTabela();
  atualizarAvisos();
  agendarRascunhoLocal();
}

// grava o valor digitado no estado, sem tocar no DOM
function commitCampo(el){
  const tr = el.closest('tr');
  const l = estado.linhas[idxLinha(Number(tr.dataset.id))];
  if(!l) return;
  const f = el.dataset.f;
  if(f==='notaProva' || f==='notaEntrevista' || f==='notaFinal') l[f] = paraNumero(el.value);
  else l[f] = el.value;
}

function ligarEventosTabela(){
  const corpo = $('rfCorpo');
  if(!corpo) return;

  Array.prototype.forEach.call(corpo.querySelectorAll('.rfIn'), function(el){
    el.addEventListener('input', function(){
      // máscara da data: dígitos -> DD/MM/AAAA enquanto digita
      if(el.dataset.f==='nascimento'){
        const d = soDigitos(el.value).slice(0,8);
        let out = d.slice(0,2);
        if(d.length>2) out += '/'+d.slice(2,4);
        if(d.length>4) out += '/'+d.slice(4,8);
        el.value = out;
      }
      commitCampo(el);
      agendarRascunhoLocal();
    });
    el.addEventListener('change', function(){
      commitCampo(el);
      const tr = el.closest('tr');
      const l = estado.linhas[idxLinha(Number(tr.dataset.id))];
      if(!l) return;
      const f = el.dataset.f;
      // nome sempre maiúsculo — o documento sai todo em caixa alta, e assim
      // a tela nunca destoa do que será impresso
      if(f==='nome'){ l.nome = limpar(l.nome).toUpperCase(); el.value = l.nome; }
      if(f==='notaProva' || f==='notaEntrevista' || f==='notaFinal'){
        el.value = fmtNota(l[f]);
        if(f!=='notaFinal'){
          const media = calcularMedia(l);
          if(media!=null){
            l.notaFinal = media;
            const inpFinal = tr.querySelector('.rfIn[data-f="notaFinal"]');
            if(inpFinal && document.activeElement!==inpFinal) inpFinal.value = fmtNota(media);
          }
        }
        const inpFinal = tr.querySelector('.rfIn[data-f="notaFinal"]');
        if(inpFinal) inpFinal.classList.toggle('rf-nota-divergente', notaFinalDivergente(l));
      }
      atualizarAvisos();
      agendarRascunhoLocal();
    });
  });

  Array.prototype.forEach.call(corpo.querySelectorAll('.row-del-btn'), function(b){
    b.addEventListener('click', function(){
      const i = idxLinha(Number(b.dataset.id));
      if(i>=0){ estado.linhas.splice(i,1); renderTabela(); }
    });
  });

  ligarArrastarSoltar(corpo);
}

// Move a linha `idOrigem` para o lado de `idAlvo`; `devolverFoco` recoloca o
// foco na alça movida (renderTabela recria o DOM — sem isso, Alt+↑ repetido
// perderia o foco a cada passo)
function moverParaAoLadoDe(idOrigem, idAlvo, depois, devolverFoco){
  const de = idxLinha(idOrigem);
  let destino = idxLinha(idAlvo);
  if(de<0 || destino<0) return;
  if(depois) destino++;
  if(de < destino) destino--;
  const mov = estado.linhas[de];
  estado.linhas.splice(de,1);
  destino = Math.max(0, Math.min(destino, estado.linhas.length));
  estado.linhas.splice(destino, 0, mov);
  renderTabela();
  if(devolverFoco){
    const alca = $('rfCorpo').querySelector('.drag-handle[data-id="'+idOrigem+'"]');
    if(alca) alca.focus();
  }
}

function ligarArrastarSoltar(corpo){
  let origemId = null;

  function limparMarcas(manterArrastada){
    Array.prototype.forEach.call(corpo.querySelectorAll('tr'), function(t){
      t.classList.remove('drop-before','drop-after');
      if(!manterArrastada) t.classList.remove('row-dragging');
    });
  }

  Array.prototype.forEach.call(corpo.querySelectorAll('.drag-handle'), function(h){
    const tr = h.closest('tr');
    h.addEventListener('mousedown', function(){ tr.setAttribute('draggable','true'); });
    h.addEventListener('mouseup',   function(){ tr.setAttribute('draggable','false'); });
    h.addEventListener('keydown', function(ev){
      if(!ev.altKey || (ev.key!=='ArrowUp' && ev.key!=='ArrowDown')) return;
      ev.preventDefault();
      const id = Number(h.dataset.id);
      const i = idxLinha(id);
      const viz = estado.linhas[i + (ev.key==='ArrowUp' ? -1 : 1)];
      if(viz) moverParaAoLadoDe(id, viz.id, ev.key==='ArrowDown', true);
    });
  });

  Array.prototype.forEach.call(corpo.querySelectorAll('tr[data-id]'), function(tr){
    tr.addEventListener('dragstart', function(ev){
      origemId = Number(tr.dataset.id);
      tr.classList.add('row-dragging');
      try{
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', String(origemId));
      }catch(e){}
    });
    tr.addEventListener('dragend', function(){
      tr.setAttribute('draggable','false');
      origemId = null;
      limparMarcas();
    });
    tr.addEventListener('dragover', function(ev){
      if(origemId===null) return;
      ev.preventDefault();
      try{ ev.dataTransfer.dropEffect = 'move'; }catch(e){}
      limparMarcas(true);
      const r = tr.getBoundingClientRect();
      tr.classList.add(((ev.clientY - r.top) > r.height/2) ? 'drop-after' : 'drop-before');
    });
    tr.addEventListener('drop', function(ev){
      ev.preventDefault();
      if(origemId===null){ limparMarcas(); return; }
      const alvoId = Number(tr.dataset.id);
      const r = tr.getBoundingClientRect();
      const depois = (ev.clientY - r.top) > r.height/2;
      const deId = origemId;
      origemId = null;
      limparMarcas();
      if(deId!==alvoId) moverParaAoLadoDe(deId, alvoId, depois, false);
    });
  });
}

/* ================= E) reordenações e avisos ================= */

// Decrescente por nota final; empate vai para o candidato mais velho (regra
// do TJPR), comparando as DATAS de nascimento — o resultado nunca depende do
// dia em que a ferramenta foi aberta. Só decide o par quando os DOIS têm
// data reconhecida; sem isso mantém a ordem que estava (nunca inventa
// desempate sem dado) e o aviso de empate aponta o caso.
function ordenarPorNota(linhas){
  const comIdx = linhas.map((l,i)=>({l,i}));
  comIdx.sort((a,b)=>{
    const va = a.l.notaFinal==null ? -Infinity : a.l.notaFinal;
    const vb = b.l.notaFinal==null ? -Infinity : b.l.notaFinal;
    if(vb!==va) return vb-va;
    const na = parseDataNascimento(a.l.nascimento), nb = parseDataNascimento(b.l.nascimento);
    if(na && nb && na.getTime()!==nb.getTime()) return na-nb; // data menor = mais velho = primeiro
    return a.i-b.i;
  });
  return comIdx.map(x=>x.l);
}

// Alfabética por nome (sem acento/caixa), estável — linhas sem nome vão pro fim
function ordenarAlfabetico(linhas){
  const comIdx = linhas.map((l,i)=>({l,i,k:chaveNome(l.nome)}));
  comIdx.sort((a,b)=>{
    if(!a.k && b.k) return 1;
    if(a.k && !b.k) return -1;
    if(a.k<b.k) return -1;
    if(a.k>b.k) return 1;
    return a.i-b.i;
  });
  return comIdx.map(x=>x.l);
}

function atualizarAvisos(){
  const box = $('rfAvisosTabela');
  if(!box) return;
  let html = '';
  function listaHtml(itens, fn){ return '<ul class="warn-list">'+itens.map(fn).join('')+'</ul>'; }

  const divergentes = estado.linhas.filter(notaFinalDivergente);
  if(divergentes.length){
    html += '<div class="notice-banner warn" style="margin:12px 0 0 36px;">'
      + '<strong>'+divergentes.length+' candidato(s) com a nota FINAL diferente da média de PROVA e ENTREVISTA</strong> — o valor digitado foi mantido:'
      + listaHtml(divergentes, l=>'<li>'+esc(l.nome||'(sem nome)')+' — final '+esc(fmtNota(l.notaFinal))+', média seria '+esc(fmtNota(calcularMedia(l)))+'</li>')
      + '</div>';
  }

  // inscrições repetidas: quase sempre erro de digitação
  const porInscricao = {};
  estado.linhas.forEach(l=>{ const k=limpar(l.inscricao); if(k){ (porInscricao[k]=porInscricao[k]||[]).push(l); } });
  const duplicadas = Object.keys(porInscricao).filter(k=>porInscricao[k].length>1);
  if(duplicadas.length){
    html += '<div class="notice-banner warn" style="margin:12px 0 0 36px;">'
      + '<strong>Inscrição repetida em mais de uma linha</strong> — confira se não é a mesma pessoa duas vezes:'
      + listaHtml(duplicadas, k=>'<li>'+esc(k)+' — '+porInscricao[k].map(l=>esc(l.nome||'(sem nome)')).join(', ')+'</li>')
      + '</div>';
  }

  // notas fora da escala 0–10
  const foraEscala = estado.linhas.filter(l=>[l.notaProva,l.notaEntrevista,l.notaFinal].some(n=>n!=null && (n<0 || n>10)));
  if(foraEscala.length){
    html += '<div class="notice-banner warn" style="margin:12px 0 0 36px;">'
      + '<strong>'+foraEscala.length+' candidato(s) com nota fora da escala 0 a 10</strong>:'
      + listaHtml(foraEscala, l=>'<li>'+esc(l.nome||'(sem nome)')+'</li>')
      + '</div>';
  }

  // empates de nota final em que falta data de nascimento para o desempate
  // automático — a ordem entre eles fica como está, para ajuste manual
  const porNota = {};
  estado.linhas.forEach(l=>{ if(l.notaFinal!=null){ const k=l.notaFinal.toFixed(2); (porNota[k]=porNota[k]||[]).push(l); } });
  const empatesSemData = Object.keys(porNota)
    .filter(k=>porNota[k].length>1 && porNota[k].some(l=>!parseDataNascimento(l.nascimento)));
  if(empatesSemData.length){
    html += '<div class="notice-banner warn" style="margin:12px 0 0 36px;">'
      + '<strong>'+empatesSemData.length+' empate(s) de nota final sem data de nascimento para desempatar sozinho</strong> — a ordem entre esses nomes não é decidida automaticamente, ajuste arrastando se necessário:'
      + listaHtml(empatesSemData, k=>'<li>Nota '+esc(fmtNota(porNota[k][0].notaFinal))+': '+porNota[k].map(l=>esc(l.nome||'(sem nome)')).join(', ')+'</li>')
      + '</div>';
  }

  box.innerHTML = html;
}

/* ================= F) documentos: CSV e PDF ================= */

function linhaParaColunas(l, posicao){
  return [ String(posicao), limpar(l.inscricao), limpar(l.nome).toUpperCase(), limpar(l.email),
           fmtNota(l.notaProva), fmtNota(l.notaEntrevista), fmtNota(l.notaFinal),
           l.reserva || '', limpar(l.nascimento) ];
}

// CSV no padrão Excel brasileiro: ';' como separador (a vírgula é decimal),
// CRLF, BOM UTF-8 para o Excel reconhecer a acentuação — e cabeçalho idêntico
// ao do Relatório de Classificação Final, que o Ponto 20 procura por nome.
function gerarCsvTexto(st){
  const escCampo = v => /[";\r\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v;
  const linhas = [COLUNAS_SAIDA.join(';')];
  (st||estado).linhas.forEach((l,i)=>{
    linhas.push(linhaParaColunas(l, i+1).map(escCampo).join(';'));
  });
  return '﻿'+linhas.join('\r\n')+'\r\n';
}

function baixarArquivo(nome, conteudo, tipo){
  const blob = new Blob([conteudo], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

function nomeBaseArquivo(){
  const dig = soDigitos(estado.sei);
  return 'resultado_final' + (dig ? '_'+dig : '');
}

// HTML do documento impresso. Estilos INLINE (não classes): o conteúdo vai
// para uma janela própria de impressão, sem o core.css.
function montarDocumentoHtml(st){
  const s = st || estado;
  const P_CENTRO = 'margin:0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#000;line-height:1.4;';
  const neg = t => '<b>'+t+'</b>';
  let h = '';

  h += '<p style="margin:0 0 6pt;text-align:center;">'
    + '<img src="'+(typeof TJPR_LOGO_DATA_URI!=='undefined'?TJPR_LOGO_DATA_URI:'')
    + '" alt="Tribunal de Justiça do Estado do Paraná" style="width:110pt;height:65pt;"></p>';
  h += '<p style="'+P_CENTRO+'margin-bottom:18pt;">'+neg('TRIBUNAL DE JUSTIÇA DO ESTADO DO PARANÁ')+'</p>';
  h += '<p style="'+P_CENTRO+'">'+neg('PROCESSO SELETIVO DE ESTAGIÁRIOS')+'</p>';
  h += '<p style="'+P_CENTRO+'">'+neg('SEI Nº '+esc(limpar(s.sei)))+'</p>';
  h += '<p style="'+P_CENTRO+'">'+neg('TABELA DE CLASSIFICAÇÃO FINAL')+'</p>';
  h += '<p style="'+P_CENTRO+'margin-bottom:22pt;">'+neg(esc(limpar(s.unidade).toUpperCase()))+'</p>';

  // tabela: border="1" (atributo legado) + estilo — o par que sobrevive tanto
  // à impressão quanto à colagem em editores; th/td com padding em pt
  const TH = 'border:1pt solid #000;padding:3pt 5pt;font-family:Arial,Helvetica,sans-serif;font-size:9pt;text-align:center;background:#eeeeee;';
  const TD = 'border:1pt solid #000;padding:3pt 5pt;font-family:Arial,Helvetica,sans-serif;font-size:9pt;';
  h += '<table border="1" align="center" style="border-collapse:collapse;margin:0 auto;width:100%;">';
  h += '<tr>'+COLUNAS_SAIDA.map(c=>'<td style="'+TH+'">'+neg(esc(c))+'</td>').join('')+'</tr>';
  s.linhas.forEach((l,i)=>{
    const cols = linhaParaColunas(l, i+1);
    h += '<tr>'+cols.map((v,ci)=>{
      const centro = (ci!==2 && ci!==3 && ci!==7) ? 'text-align:center;' : '';
      return '<td style="'+TD+centro+'">'+esc(v)+'</td>';
    }).join('')+'</tr>';
  });
  h += '</table>';

  const agora = new Date();
  h += '<p style="margin:14pt 0 0;text-align:right;font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#444;">'
    + 'Documento gerado em '+agora.toLocaleDateString('pt-BR')+' às '+agora.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'.</p>';
  return h;
}

// valida o mínimo para o documento oficial fazer sentido; devolve lista de
// problemas (vazia = pode gerar)
function validarParaDocumento(){
  const problemas = [];
  if(!limpar(estado.unidade)) problemas.push('Preencha a Unidade (nome por extenso) no Passo 1.');
  if(soDigitos(estado.sei).length < 15) problemas.push('Preencha o Número SEI completo no Passo 1.');
  if(!estado.linhas.some(l=>limpar(l.nome))) problemas.push('A tabela precisa de pelo menos um candidato com nome.');
  return problemas;
}

/* ---------------- PDF: arquivo montado aqui, sem impressão ----------------

   O PDF é escrito byte a byte (formato PDF 1.4), em vez de passar pela caixa
   de impressão do navegador. Motivos:
     - o usuário quer BAIXAR o arquivo, não imprimi-lo;
     - o resultado não depende do navegador nem das margens que a pessoa
       deixou configuradas — o mesmo preenchimento gera sempre o mesmo
       documento, o que importa num documento oficial;
     - não entra biblioteca externa no projeto.

   O texto usa as fontes padrão do PDF (Helvetica/Helvetica-Bold), que todo
   leitor tem: não é preciso embutir fonte, e o texto sai SELECIONÁVEL e
   EXTRAÍVEL — condição para uma ferramenta futura ler este documento. */

// Larguras das fontes padrão (unidades de 1/1000 do corpo), códigos 32 a 126.
// Necessárias para centralizar e para quebrar linha na medida certa.
const PDF_LARGURAS = {
  normal: ('278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 '
    +'556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 '
    +'778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 '
    +'222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584').split(' ').map(Number),
  negrito: ('278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 '
    +'556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 '
    +'778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 '
    +'278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584').split(' ').map(Number)
};
// Acentuadas do português: a largura é a da letra-base (é o caso em
// Helvetica). Fora desta lista e do ASCII, o caractere vira '?' no PDF.
const PDF_EQUIV_ACENTO = {
  'À':'A','Á':'A','Â':'A','Ã':'A','Ä':'A','Ç':'C','È':'E','É':'E','Ê':'E','Ë':'E',
  'Ì':'I','Í':'I','Î':'I','Ï':'I','Ñ':'N','Ò':'O','Ó':'O','Ô':'O','Õ':'O','Ö':'O',
  'Ù':'U','Ú':'U','Û':'U','Ü':'U',
  'à':'a','á':'a','â':'a','ã':'a','ä':'a','ç':'c','è':'e','é':'e','ê':'e','ë':'e',
  'ì':'i','í':'i','î':'i','ï':'i','ñ':'n','ò':'o','ó':'o','ô':'o','õ':'o','ö':'o',
  'ù':'u','ú':'u','û':'u','ü':'u','º':'o','ª':'a'
};

// largura de um texto, em pontos, na fonte e corpo informados
function pdfLarguraTexto(txt, negrito, corpo){
  const tabela = negrito ? PDF_LARGURAS.negrito : PDF_LARGURAS.normal;
  let total = 0;
  const s = String(txt==null?'':txt);
  for(let i=0;i<s.length;i++){
    const ch = PDF_EQUIV_ACENTO[s[i]] || s[i];
    const code = ch.charCodeAt(0);
    total += (code>=32 && code<=126) ? tabela[code-32] : 556;
  }
  return total * corpo / 1000;
}

// quebra o texto em linhas que caibam em `largura` (quebra por palavra; se uma
// palavra sozinha não couber, ela é cortada por caractere — nunca vaza a célula)
function pdfQuebrarTexto(txt, largura, negrito, corpo){
  const palavras = String(txt==null?'':txt).split(/\s+/).filter(Boolean);
  if(!palavras.length) return [''];
  const linhas = [];
  let atual = '';
  palavras.forEach(function(p){
    const tentativa = atual ? atual+' '+p : p;
    if(pdfLarguraTexto(tentativa, negrito, corpo) <= largura){ atual = tentativa; return; }
    if(atual){ linhas.push(atual); atual = ''; }
    if(pdfLarguraTexto(p, negrito, corpo) <= largura){ atual = p; return; }
    // palavra maior que a coluna (e-mail longo): corta por caractere
    let pedaco = '';
    for(let i=0;i<p.length;i++){
      if(pdfLarguraTexto(pedaco+p[i], negrito, corpo) > largura){ linhas.push(pedaco); pedaco = ''; }
      pedaco += p[i];
    }
    atual = pedaco;
  });
  if(atual) linhas.push(atual);
  return linhas.length ? linhas : [''];
}

// Sinais tipográficos que o WinAnsiEncoding coloca na faixa 0x80-0x9F (fora
// do Latin-1). Sem este mapa o travessão dos títulos e as aspas curvas
// coladas do Word virariam '?' no documento.
const PDF_WINANSI = {
  0x2013:0x96, 0x2014:0x97, 0x2018:0x91, 0x2019:0x92, 0x201C:0x93,
  0x201D:0x94, 0x2022:0x95, 0x2026:0x85, 0x20AC:0x80, 0x2122:0x99
};

// Texto para dentro de uma string PDF: WinAnsiEncoding é Latin-1 na faixa que
// o português usa, então o código Unicode do caractere já é o byte. Fora
// disso e do mapa acima, o caractere vira '?' — melhor um sinal trocado do
// que um arquivo corrompido por causa de um caractere solto.
function pdfEscaparTexto(txt){
  const s = String(txt==null?'':txt);
  let out = '';
  for(let i=0;i<s.length;i++){
    const ch = s[i];
    let code = s.charCodeAt(i);
    if(PDF_WINANSI[code]) code = PDF_WINANSI[code];
    if(ch==='(' || ch===')' || ch==='\\') out += '\\'+ch;
    else if(code < 32) out += ' ';
    else if(code < 128) out += String.fromCharCode(code);
    else if(code <= 255) out += '\\' + ('00'+code.toString(8)).slice(-3);
    else out += '?';
  }
  return out;
}

// base64 -> string binária (1 caractere = 1 byte). Escrita aqui em vez de
// atob() para a função poder ser testada fora do navegador.
function pdfBase64ParaBinario(b64){
  const ALFA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const limpo = String(b64||'').replace(/[^A-Za-z0-9+/]/g,'');
  let out = '', bits = 0, acc = 0;
  for(let i=0;i<limpo.length;i++){
    acc = (acc<<6) | ALFA.indexOf(limpo[i]);
    bits += 6;
    if(bits>=8){ bits -= 8; out += String.fromCharCode((acc>>bits) & 0xFF); }
  }
  return out;
}

// Largura/altura/componentes de cor de um JPEG, lidos do marcador SOF —
// o PDF precisa deles para montar o objeto de imagem do logotipo.
function pdfDimensoesJpeg(bin){
  let i = 2;
  while(i < bin.length-9){
    if(bin.charCodeAt(i) !== 0xFF){ i++; continue; }
    const marcador = bin.charCodeAt(i+1);
    const ehSOF = (marcador>=0xC0 && marcador<=0xCF) && marcador!==0xC4 && marcador!==0xC8 && marcador!==0xCC;
    if(ehSOF){
      return {
        altura:  (bin.charCodeAt(i+5)<<8) | bin.charCodeAt(i+6),
        largura: (bin.charCodeAt(i+7)<<8) | bin.charCodeAt(i+8),
        componentes: bin.charCodeAt(i+9)
      };
    }
    i += 2 + ((bin.charCodeAt(i+2)<<8) | bin.charCodeAt(i+3));
  }
  return null;
}

// medidas da página e da tabela, em pontos (A4 paisagem)
const PDF_PAG = { largura:842, altura:595, margem:40 };
const PDF_COLS = [
  { titulo:'CLASSIFICAÇÃO', largura:68, alinhamento:'centro' },
  { titulo:'INSCRIÇÃO',     largura:68, alinhamento:'centro' },
  { titulo:'NOME',          largura:170, alinhamento:'esquerda' },
  { titulo:'E-MAIL',        largura:150, alinhamento:'esquerda' },
  { titulo:'PROVA',         largura:48, alinhamento:'centro' },
  { titulo:'ENTREVISTA',    largura:62, alinhamento:'centro' },
  { titulo:'FINAL',         largura:48, alinhamento:'centro' },
  { titulo:'RESERVA',       largura:78, alinhamento:'esquerda' },
  { titulo:'NASCIMENTO',    largura:70, alinhamento:'centro' }
];
const PDF_CORPO_TABELA = 7.5;
const PDF_ALTURA_LINHA = 9.5;
const PDF_PADDING = 3;

// Monta o arquivo PDF inteiro e devolve os bytes (Uint8Array).
function construirPdf(st){
  const s = st || estado;
  const M = PDF_PAG.margem;
  const larguraUtil = PDF_COLS.reduce((a,c)=>a+c.largura, 0);
  const x0 = (PDF_PAG.largura - larguraUtil) / 2;   // tabela centralizada

  /* ---- 1) quebra de cada linha em células já divididas por linha de texto ---- */
  const linhasTabela = s.linhas.map(function(l, i){
    const valores = linhaParaColunas(l, i+1);
    const celulas = valores.map(function(v, ci){
      return pdfQuebrarTexto(v, PDF_COLS[ci].largura - 2*PDF_PADDING, false, PDF_CORPO_TABELA);
    });
    const maxLinhas = celulas.reduce((a,c)=>Math.max(a, c.length), 1);
    return { celulas, altura: maxLinhas*PDF_ALTURA_LINHA + 2*PDF_PADDING };
  });
  const cabecalhoCelulas = PDF_COLS.map(function(c){
    return pdfQuebrarTexto(c.titulo, c.largura - 2*PDF_PADDING, true, PDF_CORPO_TABELA);
  });
  const alturaCabecalhoTabela = cabecalhoCelulas.reduce((a,c)=>Math.max(a,c.length),1)*PDF_ALTURA_LINHA + 2*PDF_PADDING;

  /* ---- 2) distribui as linhas em páginas ---- */
  const unidadeLinhas = pdfQuebrarTexto(limpar(s.unidade).toUpperCase(), PDF_PAG.largura - 2*M, true, 9);
  // Altura do bloco de cabeçalho da primeira página, somando os mesmos
  // deslocamentos aplicados ao desenhar (logo 43 + 12, tribunal 16, certame
  // 11, SEI 14, título 13, unidade 11 por linha, respiro 9). Serve só para
  // decidir quantas linhas cabem — arredondado para cima de propósito:
  // sobrar espaço é inofensivo, faltar empurraria a tabela para fora da folha.
  const alturaTopo1 = 124 + unidadeLinhas.length*11;
  const alturaTopoN = 24;
  const limiteInferior = M + 22;   // espaço reservado para o rodapé

  const paginas = [];
  let atual = { linhas:[], primeira:true };
  let y = PDF_PAG.altura - M - alturaTopo1 - alturaCabecalhoTabela;
  linhasTabela.forEach(function(lt){
    if(y - lt.altura < limiteInferior){
      paginas.push(atual);
      atual = { linhas:[], primeira:false };
      y = PDF_PAG.altura - M - alturaTopoN - alturaCabecalhoTabela;
    }
    atual.linhas.push(lt);
    y -= lt.altura;
  });
  paginas.push(atual);

  /* ---- 3) logotipo (opcional: se o arquivo do logo não estiver na página,
             o documento sai sem ele em vez de falhar) ---- */
  let logo = null;
  if(typeof TJPR_LOGO_DATA_URI !== 'undefined' && TJPR_LOGO_DATA_URI){
    const bin = pdfBase64ParaBinario(String(TJPR_LOGO_DATA_URI).split(',')[1] || '');
    const dim = bin ? pdfDimensoesJpeg(bin) : null;
    if(dim && dim.largura && dim.altura) logo = { bin, dim };
  }

  /* ---- 4) fluxo de conteúdo de cada página ---- */
  const agora = new Date();
  const rodape = 'Documento gerado em '+agora.toLocaleDateString('pt-BR')
    + ' às '+agora.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'.';

  function texto(x, yy, txt, negrito, corpo){
    return 'BT /'+(negrito?'F2':'F1')+' '+corpo+' Tf 1 0 0 1 '+x.toFixed(2)+' '+yy.toFixed(2)+' Tm ('+pdfEscaparTexto(txt)+') Tj ET\n';
  }
  function textoCentro(yy, txt, negrito, corpo){
    return texto((PDF_PAG.largura - pdfLarguraTexto(txt, negrito, corpo))/2, yy, txt, negrito, corpo);
  }
  function linha(xa, ya, xb, yb){
    return xa.toFixed(2)+' '+ya.toFixed(2)+' m '+xb.toFixed(2)+' '+yb.toFixed(2)+' l S\n';
  }

  const conteudos = paginas.map(function(pag, iPag){
    let c = '0.5 w 0 G 0 g\n';
    let yy = PDF_PAG.altura - M;

    if(pag.primeira){
      if(logo){
        const larguraLogo = 72;
        const alturaLogo = larguraLogo * logo.dim.altura / logo.dim.largura;
        yy -= alturaLogo;
        c += 'q '+larguraLogo.toFixed(2)+' 0 0 '+alturaLogo.toFixed(2)+' '
           + ((PDF_PAG.largura-larguraLogo)/2).toFixed(2)+' '+yy.toFixed(2)+' cm /Im1 Do Q\n';
        yy -= 12;
      } else {
        yy -= 10;
      }
      // ordem do cabeçalho: tribunal, certame, SEI, título do documento e —
      // por último — a unidade, logo acima da tabela a que ela se refere
      c += textoCentro(yy, 'TRIBUNAL DE JUSTIÇA DO ESTADO DO PARANÁ', true, 10); yy -= 16;
      c += textoCentro(yy, 'PROCESSO SELETIVO DE ESTAGIÁRIOS', true, 9); yy -= 11;
      c += textoCentro(yy, 'SEI Nº '+limpar(s.sei), true, 9); yy -= 14;
      c += textoCentro(yy, 'TABELA DE CLASSIFICAÇÃO FINAL', true, 10); yy -= 13;
      unidadeLinhas.forEach(function(l){ c += textoCentro(yy, l, true, 9); yy -= 11; });
      yy -= 9;
    } else {
      c += textoCentro(yy-8, 'TABELA DE CLASSIFICAÇÃO FINAL — continuação (página '+(iPag+1)+' de '+paginas.length+')', true, 8);
      yy -= 24;
    }

    // cabeçalho da tabela, com fundo cinza claro
    const topoTabela = yy;
    c += '0.93 g '+x0.toFixed(2)+' '+(yy-alturaCabecalhoTabela).toFixed(2)+' '
       + larguraUtil.toFixed(2)+' '+alturaCabecalhoTabela.toFixed(2)+' re f 0 g\n';
    let xx = x0;
    PDF_COLS.forEach(function(col, ci){
      const linhasCel = cabecalhoCelulas[ci];
      linhasCel.forEach(function(t, li){
        const largT = pdfLarguraTexto(t, true, PDF_CORPO_TABELA);
        const tx = xx + (col.largura - largT)/2;   // cabeçalho sempre centralizado
        c += texto(tx, yy - PDF_PADDING - (li+1)*PDF_ALTURA_LINHA + 2.5, t, true, PDF_CORPO_TABELA);
      });
      xx += col.largura;
    });
    yy -= alturaCabecalhoTabela;

    // linhas de dados
    pag.linhas.forEach(function(lt){
      xx = x0;
      lt.celulas.forEach(function(linhasCel, ci){
        const col = PDF_COLS[ci];
        linhasCel.forEach(function(t, li){
          if(!t) return;
          const largT = pdfLarguraTexto(t, false, PDF_CORPO_TABELA);
          const tx = (col.alinhamento==='centro') ? xx + (col.largura - largT)/2 : xx + PDF_PADDING;
          c += texto(tx, yy - PDF_PADDING - (li+1)*PDF_ALTURA_LINHA + 2.5, t, false, PDF_CORPO_TABELA);
        });
        xx += col.largura;
      });
      yy -= lt.altura;
    });

    // grade: horizontais (topo, sob o cabeçalho e sob cada linha) e verticais
    const fundoTabela = yy;
    let yGrade = topoTabela;
    c += linha(x0, yGrade, x0+larguraUtil, yGrade);
    yGrade -= alturaCabecalhoTabela;
    c += linha(x0, yGrade, x0+larguraUtil, yGrade);
    pag.linhas.forEach(function(lt){
      yGrade -= lt.altura;
      c += linha(x0, yGrade, x0+larguraUtil, yGrade);
    });
    let xGrade = x0;
    c += linha(xGrade, topoTabela, xGrade, fundoTabela);
    PDF_COLS.forEach(function(col){
      xGrade += col.largura;
      c += linha(xGrade, topoTabela, xGrade, fundoTabela);
    });

    // rodapé
    // a quebra de linha depois de "g" é obrigatória: sem ela o operador cola
    // no "BT" seguinte ("gBT") e o leitor descarta o bloco de texto inteiro
    c += '0.3 g\n' + texto(PDF_PAG.largura - M - pdfLarguraTexto(rodape, false, 7), M - 8, rodape, false, 7) + '0 g\n';
    return c;
  });

  /* ---- 5) montagem dos objetos do arquivo ---- */
  // números fixos: 1 catálogo, 2 páginas, 3 fonte normal, 4 negrito, 5 logo
  const numLogo = logo ? 5 : 0;
  const primeiroObjPagina = logo ? 6 : 5;
  const objetos = [];                                   // objetos[n-1] = corpo do objeto n
  function setObj(n, corpo){ objetos[n-1] = corpo; }

  const idsPaginas = paginas.map(function(_, i){ return primeiroObjPagina + i*2 + 1; });
  setObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  setObj(2, '<< /Type /Pages /Kids ['+idsPaginas.map(n=>n+' 0 R').join(' ')+'] /Count '+paginas.length+' >>');
  setObj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  setObj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  if(logo){
    const espaco = logo.dim.componentes===1 ? '/DeviceGray' : (logo.dim.componentes===4 ? '/DeviceCMYK' : '/DeviceRGB');
    setObj(5, '<< /Type /XObject /Subtype /Image /Width '+logo.dim.largura+' /Height '+logo.dim.altura
      + ' /ColorSpace '+espaco+' /BitsPerComponent 8 /Filter /DCTDecode /Length '+logo.bin.length
      + ' >>\nstream\n'+logo.bin+'\nendstream');
  }
  conteudos.forEach(function(c, i){
    const nConteudo = primeiroObjPagina + i*2;
    const nPagina = nConteudo + 1;
    setObj(nConteudo, '<< /Length '+c.length+' >>\nstream\n'+c+'endstream');
    setObj(nPagina, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PDF_PAG.largura+' '+PDF_PAG.altura+']'
      + ' /Resources << /Font << /F1 3 0 R /F2 4 0 R >>'
      + (logo ? ' /XObject << /Im1 '+numLogo+' 0 R >>' : '')
      + ' >> /Contents '+nConteudo+' 0 R >>');
  });

  /* ---- 6) serialização: os deslocamentos do xref têm de ser exatos, por
             isso o arquivo é montado como string binária (1 char = 1 byte) ---- */
  let arquivo = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const deslocamentos = [];
  objetos.forEach(function(corpo, i){
    deslocamentos[i] = arquivo.length;
    arquivo += (i+1)+' 0 obj\n'+corpo+'\nendobj\n';
  });
  const inicioXref = arquivo.length;
  arquivo += 'xref\n0 '+(objetos.length+1)+'\n0000000000 65535 f \n';
  deslocamentos.forEach(function(off){
    arquivo += ('0000000000'+off).slice(-10)+' 00000 n \n';
  });
  arquivo += 'trailer\n<< /Size '+(objetos.length+1)+' /Root 1 0 R >>\nstartxref\n'+inicioXref+'\n%%EOF\n';

  const bytes = new Uint8Array(arquivo.length);
  for(let i=0;i<arquivo.length;i++) bytes[i] = arquivo.charCodeAt(i) & 0xFF;
  return bytes;
}

function gerarPdf(){
  const problemas = validarParaDocumento();
  const msg = $('rfMsgDocs');
  if(problemas.length){
    if(msg) msg.innerHTML = '<span style="color:var(--coral);">'+problemas.map(esc).join(' ')+'</span>';
    return;
  }
  try{
    baixarArquivo(nomeBaseArquivo()+'.pdf', construirPdf(), 'application/pdf');
    if(msg) msg.textContent = 'PDF baixado.';
    // prévia na própria página, para conferir sem abrir o arquivo
    const doc = $('rfDocumento');
    doc.innerHTML = montarDocumentoHtml();
    doc.style.display = 'block';
  }catch(e){
    console.error('Falha ao gerar o PDF:', e);
    if(msg) msg.innerHTML = '<span style="color:var(--coral);">Não foi possível gerar o PDF ('+esc(e.message)+').</span>';
  }
}

function baixarCsv(){
  const problemas = validarParaDocumento();
  const msg = $('rfMsgDocs');
  // para o CSV, unidade/SEI não entram no arquivo — só avisa, não bloqueia
  if(!estado.linhas.some(l=>limpar(l.nome))){
    if(msg) msg.innerHTML = '<span style="color:var(--coral);">A tabela precisa de pelo menos um candidato com nome.</span>';
    return;
  }
  if(msg) msg.textContent = problemas.length ? 'CSV gerado — atenção: '+problemas.join(' ') : '';
  baixarArquivo(nomeBaseArquivo()+'.csv', gerarCsvTexto(), 'text/csv;charset=utf-8');
}

/* ---------------- finalizar / voltar a editar ----------------
   Dois estados, um só interruptor (`travado`):

     travado = false  edição livre; documentos e prévia OCULTOS
     travado = true   tela em somente-leitura; documentos e prévia à mostra

   Assim o que está na tela é sempre o que está no documento gerado — não
   existe o intervalo em que se edita com o PDF já disponível, que era o que
   antes obrigava a exibir um aviso de "prévia desatualizada". */
let travado = false;

// Alterna a tela entre edição e somente-leitura. Redesenha a tabela porque é
// ela quem monta (ou não) os campos, alças de arraste e botões de excluir.
function aplicarTravamento(){
  const inUnidade = $('rfUnidade'), inSei = $('rfSei');
  if(inUnidade) inUnidade.readOnly = travado;
  if(inSei) inSei.readOnly = travado;

  [['rfBtnAdicionar'],['rfBtnOrdenarNota'],['rfBtnOrdenarNome']].forEach(function(par){
    const b = $(par[0]);
    if(b) b.disabled = travado;
  });

  const btnFinalizar = $('rfBtnFinalizar'), btnEditar = $('rfBtnEditar');
  if(btnFinalizar) btnFinalizar.style.display = travado ? 'none' : '';
  if(btnEditar) btnEditar.style.display = travado ? '' : 'none';

  const aviso = $('rfTravadoAviso');
  if(aviso) aviso.style.display = travado ? '' : 'none';

  // documentos e prévia acompanham o travamento
  const espera = $('rfDocsEspera'), area = $('rfDocsArea'), doc = $('rfDocumento');
  if(espera) espera.style.display = travado ? 'none' : '';
  if(area) area.style.display = travado ? '' : 'none';
  if(doc && !travado){ doc.innerHTML = ''; doc.style.display = 'none'; }

  if(travado) fecharSugestoes();
  renderTabela();
}

async function finalizarPreenchimento(){
  const problemas = validarParaDocumento();
  const st = $('rfNuvemStatus');
  if(problemas.length){
    if(st) st.innerHTML = '<span style="color:var(--coral);">'+problemas.map(esc).join(' ')+'</span>';
    return false;
  }

  const gravou = await salvarNuvem();

  // Trava e libera os documentos MESMO se a gravação falhar: sem isso, uma
  // indisponibilidade da nuvem impediria a unidade de produzir o documento
  // oficial dela. O resultado da gravação fica dito no status do Passo 3.
  travado = true;
  aplicarTravamento();
  const doc = $('rfDocumento');
  if(doc){ doc.innerHTML = montarDocumentoHtml(); doc.style.display = 'block'; }

  const msg = $('rfMsgDocs');
  if(msg) msg.textContent = 'Baixe abaixo o PDF e o CSV desta tabela.';

  agendarRascunhoLocal();   // guarda também o estado de finalizado
  const area = $('rfDocsArea');
  if(area && area.scrollIntoView) area.scrollIntoView({behavior:'smooth', block:'nearest'});
  return gravou;
}

// Volta ao modo de edição: os documentos e a prévia somem, para não ficar
// disponível um arquivo que não corresponde mais ao que está na tela.
function voltarAEditar(){
  travado = false;
  aplicarTravamento();
  const msg = $('rfMsgDocs'); if(msg) msg.textContent = '';
  const st = $('rfNuvemStatus'); if(st) st.textContent = '';
  agendarRascunhoLocal();
  avisar('Edição liberada — finalize de novo ao terminar.');
}

/* ============ G) nuvem: salvar, buscar, carregar, backup ============
   Mesmo projeto Supabase das demais ferramentas (ver fluxo_logic.js);
   tabela própria: resultado_final_unidades. Diferente do Fluxo (linha
   única), aqui cada preenchimento é UMA linha, com id derivado de
   SEI + unidade — SQL em Recursos/resultado_final_unidades.sql. */
const SUPABASE_URL = 'https://xmuduqgwwplrtnfbfgtf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_O3f7DXw4K3DYf34k3QaF6w_ZJgpwExw';
const TABELA_NUVEM = 'resultado_final_unidades';

function cabecalhosNuvem(extra){
  return Object.assign({ 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }, extra || {});
}

// id único e ESTÁVEL do registro: SÓ os dígitos do processo SEI.
// O nome da unidade NÃO entra na chave de propósito — é digitado à mão e
// qualquer variação ("Secretaria" x "Secretária", espaço a mais, abreviação)
// criaria um registro paralelo em vez de atualizar o existente. O SEI é
// numérico, conferível e único por processo seletivo: reabrir e salvar com o
// mesmo SEI cai sempre no mesmo id, e o upsert substitui.
function idRegistro(sei){
  const dig = soDigitos(sei);
  return dig ? dig : null;
}

function pacoteAtual(){
  return {
    versao: 1,
    sigla: limpar(estado.sigla),
    unidade: limpar(estado.unidade),
    sei: limpar(estado.sei),
    linhas: estado.linhas.map(l=>({
      inscricao: limpar(l.inscricao), nome: limpar(l.nome).toUpperCase(), email: limpar(l.email),
      notaProva: l.notaProva, notaEntrevista: l.notaEntrevista, notaFinal: l.notaFinal,
      reserva: l.reserva || '', nascimento: limpar(l.nascimento)
    })),
    // guardado para a tela voltar como foi deixada: finalizada volta travada,
    // com os documentos à mão, sem obrigar a refinalizar sem ter mudado nada
    finalizado: travado,
    salvoEm: new Date().toISOString()
  };
}

// devolve true se aplicou; valida o formato antes de tocar no estado
function aplicarPacote(p){
  if(!p || !Array.isArray(p.linhas)) return false;
  estado.sigla   = String(p.sigla||'');
  estado.unidade = String(p.unidade||'');
  estado.sei     = String(p.sei||'');
  estado.linhas  = p.linhas.map(l=>({
    id: estado.seq++,
    inscricao: String(l.inscricao||''), nome: String(l.nome||''), email: String(l.email||''),
    notaProva: (typeof l.notaProva==='number') ? l.notaProva : null,
    notaEntrevista: (typeof l.notaEntrevista==='number') ? l.notaEntrevista : null,
    notaFinal: (typeof l.notaFinal==='number') ? l.notaFinal : null,
    reserva: RESERVAS.indexOf(l.reserva)>=0 ? l.reserva : '',
    nascimento: String(l.nascimento||'')
  }));
  const inUnidade=$('rfUnidade'), inSei=$('rfSei');
  if(inUnidade){ inUnidade.value = estado.unidade; marcarObrigatorio(inUnidade,'rfUnidadeObrig'); }
  if(inSei){ inSei.value = estado.sei; marcarObrigatorio(inSei,'rfSeiObrig'); }
  // retoma o estado em que o preenchimento foi deixado (travado ou em edição)
  travado = !!p.finalizado;
  const msgDocs = $('rfMsgDocs');
  if(msgDocs) msgDocs.textContent = travado ? 'Baixe abaixo o PDF e o CSV desta tabela.' : '';
  aplicarTravamento();   // já redesenha a tabela
  const doc = $('rfDocumento');
  if(doc && travado){ doc.innerHTML = montarDocumentoHtml(); doc.style.display = 'block'; }
  return true;
}

async function salvarNuvem(){
  const st = $('rfNuvemStatus'), quando = $('rfNuvemSalvoEm');
  const id = idRegistro(estado.sei);
  if(!id){
    if(st) st.innerHTML = '<span style="color:var(--coral);">Preencha o Número SEI (Passo 1) antes de salvar — é ele que identifica o registro.</span>';
    return false;
  }
  if(st) st.textContent = 'Gravando na nuvem…';
  try{
    const r = await fetch(SUPABASE_URL+'/rest/v1/'+TABELA_NUVEM, {
      method:'POST',
      headers: cabecalhosNuvem({ 'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify([{ id, data: pacoteAtual(), updated_at: new Date().toISOString() }])
    });
    if(!r.ok){
      const detalhe = await r.text().catch(()=> '');
      throw new Error('HTTP '+r.status+(detalhe?' — '+detalhe.slice(0,160):''));
    }
    const hora = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    if(st) st.textContent = '';
    if(quando) quando.textContent = 'Salvo na nuvem às '+hora+' (registro SEI '+limpar(estado.sei)+').';
    avisar('Preenchimento salvo na nuvem.');
    return true;
  }catch(e){
    console.error('Falha ao salvar na nuvem:', e);
    if(st) st.innerHTML = '<span style="color:var(--coral);">Não foi possível salvar na nuvem ('+esc(e.message)+'). O rascunho local continua guardado neste navegador.</span>';
    return false;
  }
}

async function buscarNuvem(){
  // status próprio da área administrativa: o do Passo 3 é do "Salvar", e
  // misturar os dois faria a mensagem de uma ação aparecer sob a outra
  const lista = $('rfNuvemLista'), st = $('rfNuvemStatusAdmin');
  const termoBruto = limpar(($('rfNuvemBusca')&&$('rfNuvemBusca').value)||'');
  let url = SUPABASE_URL+'/rest/v1/'+TABELA_NUVEM
    + '?select=id,updated_at,unidade:data->>unidade,sei:data->>sei&order=updated_at.desc&limit=50';
  if(termoBruto){
    // O id é só o SEI em dígitos, então buscar por unidade tem de olhar o
    // conteúdo do registro (data->>unidade), não a chave. Um `or` cobre os
    // dois casos de uma vez: digitou número, casa pelo id; digitou nome,
    // casa pela unidade gravada. Vírgula e parênteses quebrariam a sintaxe
    // do PostgREST, por isso saem do termo antes de montar a URL.
    const seguro = termoBruto.replace(/[(),*]/g,' ').trim();
    const digitos = soDigitos(seguro);
    const filtros = [];
    if(digitos) filtros.push('id.ilike.*'+digitos+'*');
    if(/[a-zA-Z]/.test(seguro)) filtros.push('data->>unidade.ilike.*'+seguro+'*');
    if(filtros.length) url += '&or=('+encodeURIComponent(filtros.join(','))+')';
  }
  if(st) st.textContent = 'Buscando…';
  try{
    const r = await fetch(url, { headers: cabecalhosNuvem({ 'Accept':'application/json' }) });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const regs = await r.json();
    if(st) st.textContent = '';
    if(!lista) return;
    if(!regs.length){
      lista.innerHTML = '<p class="empty-hint">Nenhum registro salvo'+(termoBruto?' com esse termo':'')+'.</p>';
      return;
    }
    lista.innerHTML = regs.map(reg=>{
      const quando = reg.updated_at ? new Date(reg.updated_at).toLocaleString('pt-BR') : '';
      return '<div class="rf-nuvem-item">'
        + '<div class="rf-nuvem-info">'
        +   '<div class="rf-nuvem-unidade">'+esc(reg.unidade||'(sem unidade)')+'</div>'
        +   '<div class="rf-nuvem-meta">SEI '+esc(reg.sei||'?')+(quando?' · atualizado em '+esc(quando):'')+'</div>'
        + '</div>'
        + '<button type="button" class="link-btn" data-carregar="'+escAttr(reg.id)+'">Carregar</button>'
        + '<button type="button" class="link-btn rf-btn-excluir" data-excluir="'+escAttr(reg.id)+'"'
        +   ' data-unidade="'+escAttr(reg.unidade||'')+'" data-sei="'+escAttr(reg.sei||'')+'">Excluir</button>'
        + '</div>';
    }).join('');
    Array.prototype.forEach.call(lista.querySelectorAll('[data-carregar]'), function(b){
      b.addEventListener('click', function(){ carregarRegistro(b.dataset.carregar); });
    });
    Array.prototype.forEach.call(lista.querySelectorAll('[data-excluir]'), function(b){
      b.addEventListener('click', function(){
        excluirRegistro(b.dataset.excluir, b.dataset.unidade, b.dataset.sei);
      });
    });
  }catch(e){
    console.error('Falha ao buscar na nuvem:', e);
    if(st) st.innerHTML = '<span style="color:var(--coral);">Não foi possível consultar a nuvem ('+esc(e.message)+').</span>';
  }
}

async function carregarRegistro(id){
  const st = $('rfNuvemStatusAdmin');
  const temConteudo = estado.linhas.some(l=>limpar(l.nome)) || limpar(estado.unidade) || limpar(estado.sei);
  if(temConteudo && !confirm('Carregar este registro substitui o preenchimento atual da tela (o rascunho local também será sobrescrito). Continuar?')) return;
  if(st) st.textContent = 'Carregando registro…';
  try{
    const r = await fetch(SUPABASE_URL+'/rest/v1/'+TABELA_NUVEM+'?select=data&id=eq.'+encodeURIComponent(id)+'&limit=1',
      { headers: cabecalhosNuvem({ 'Accept':'application/json' }) });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const regs = await r.json();
    if(!regs.length || !aplicarPacote(regs[0].data)) throw new Error('registro vazio ou em formato desconhecido');
    if(st) st.textContent = '';
    avisar('Registro carregado — edite e finalize de novo para substituir.');
  }catch(e){
    console.error('Falha ao carregar registro:', e);
    if(st) st.innerHTML = '<span style="color:var(--coral);">Não foi possível carregar ('+esc(e.message)+').</span>';
  }
}

/* Apaga um registro da base. É DEFINITIVO: não há lixeira, e o caminho de
   volta é o backup .json (botão logo abaixo na própria área administrativa).
   Por isso a confirmação mostra unidade e SEI — para ninguém apagar o
   registro errado por ter clicado na linha de cima. */
async function excluirRegistro(id, unidade, sei){
  const st = $('rfNuvemStatusAdmin');
  const quem = (unidade ? unidade : '(sem unidade)') + (sei ? ' — SEI '+sei : '');
  if(!confirm('Excluir definitivamente este registro?\n\n'+quem
    + '\n\nNão há como desfazer. Se ainda não baixou um backup recente, cancele e baixe antes.')) return false;
  if(st) st.textContent = 'Excluindo…';
  try{
    // return=representation devolve as linhas apagadas. É o que permite saber
    // se a exclusão REALMENTE aconteceu: com RLS ativo e sem policy de DELETE
    // a API responde 200 sem apagar nada, e um simples "deu certo" mentiria.
    const r = await fetch(SUPABASE_URL+'/rest/v1/'+TABELA_NUVEM+'?id=eq.'+encodeURIComponent(id)+'&select=id', {
      method:'DELETE',
      headers: cabecalhosNuvem({ 'Accept':'application/json', 'Prefer':'return=representation' })
    });
    if(!r.ok){
      const detalhe = await r.text().catch(()=> '');
      throw new Error('HTTP '+r.status+(detalhe?' — '+detalhe.slice(0,160):''));
    }
    const apagados = await r.json().catch(()=> []);
    if(!Array.isArray(apagados) || !apagados.length){
      throw new Error('a base não apagou o registro — provavelmente falta a policy de DELETE na tabela');
    }
    if(st) st.innerHTML = '<span style="color:var(--teal);">Registro excluído.</span>';
    avisar('Registro excluído da base.');
    buscarNuvem();   // relista, para a linha apagada sumir
    return true;
  }catch(e){
    console.error('Falha ao excluir registro:', e);
    if(st) st.innerHTML = '<span style="color:var(--coral);">Não foi possível excluir ('+esc(e.message)+'). '
      + 'Se a mensagem citar permissão, falta a policy de DELETE na tabela — ver Recursos/resultado_final_unidades.sql.</span>';
    return false;
  }
}

// Backup completo: baixa TODOS os registros num .json (para guarda periódica)
// e restaura esse mesmo arquivo por upsert — o caminho de volta se a base for
// perdida ou uma edição errada precisar ser desfeita em lote.
async function baixarBackupCompleto(){
  const aviso = $('rfAvisoBackup');
  if(aviso) aviso.innerHTML = '<p class="rf-nuvem-status">Baixando todos os registros…</p>';
  try{
    const r = await fetch(SUPABASE_URL+'/rest/v1/'+TABELA_NUVEM+'?select=id,data,updated_at&order=id.asc&limit=10000',
      { headers: cabecalhosNuvem({ 'Accept':'application/json' }) });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const regs = await r.json();
    const pacote = { formato:'resultado_final_backup', versao:1, geradoEm:new Date().toISOString(), registros:regs };
    const data = new Date().toISOString().slice(0,10);
    baixarArquivo('backup_resultado_final_'+data+'.json', JSON.stringify(pacote, null, 1), 'application/json');
    if(aviso) aviso.innerHTML = '<div class="notice-banner ok" style="margin:12px 0 0 36px;"><strong>Backup gerado:</strong> '+regs.length+' registro(s).</div>';
  }catch(e){
    console.error('Falha no backup:', e);
    if(aviso) aviso.innerHTML = '<div class="notice-banner warn" style="margin:12px 0 0 36px;"><strong>Não foi possível gerar o backup:</strong> '+esc(e.message)+'</div>';
  }
}

async function restaurarBackup(file){
  const aviso = $('rfAvisoBackup');
  try{
    const texto = await file.text();
    const pacote = JSON.parse(texto);
    if(!pacote || pacote.formato!=='resultado_final_backup' || !Array.isArray(pacote.registros))
      throw new Error('o arquivo não é um backup desta ferramenta');
    if(!pacote.registros.length) throw new Error('o backup está vazio');
    if(!confirm('Restaurar '+pacote.registros.length+' registro(s) do backup? Registros com o mesmo id serão SUBSTITUÍDOS pelos do arquivo.')) return;
    const r = await fetch(SUPABASE_URL+'/rest/v1/'+TABELA_NUVEM, {
      method:'POST',
      headers: cabecalhosNuvem({ 'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(pacote.registros.map(reg=>({ id:reg.id, data:reg.data, updated_at:reg.updated_at||new Date().toISOString() })))
    });
    if(!r.ok){
      const detalhe = await r.text().catch(()=> '');
      throw new Error('HTTP '+r.status+(detalhe?' — '+detalhe.slice(0,160):''));
    }
    if(aviso) aviso.innerHTML = '<div class="notice-banner ok" style="margin:12px 0 0 36px;"><strong>Backup restaurado:</strong> '+pacote.registros.length+' registro(s) gravados.</div>';
    buscarNuvem();
  }catch(e){
    console.error('Falha ao restaurar backup:', e);
    if(aviso) aviso.innerHTML = '<div class="notice-banner warn" style="margin:12px 0 0 36px;"><strong>Não foi possível restaurar:</strong> '+esc(e.message)+'</div>';
  }
}

/* ===== H) rascunho local (autosave + arquivo) e ligação com a página ===== */

const CHAVE_LOCAL = 'tjpr_resultado_final_rascunho_v1';
let timerRascunho = null;
// autosave com folga: grava o pacote no localStorage ~1s depois da última
// alteração — barato o bastante para rodar a cada tecla sem pesar
function agendarRascunhoLocal(){
  clearTimeout(timerRascunho);
  timerRascunho = setTimeout(function(){
    try{ localStorage.setItem(CHAVE_LOCAL, JSON.stringify(pacoteAtual())); }catch(e){}
  }, 1000);
}

let timerAviso = null;
function avisar(texto, tipo){
  const caixa = $('rfAviso');
  if(!caixa) return;
  caixa.textContent = texto;
  caixa.className = 'fluxo-aviso aparece' + (tipo ? ' '+tipo : '');
  clearTimeout(timerAviso);
  timerAviso = setTimeout(function(){ caixa.classList.remove('aparece'); }, 3400);
}

// selo "obrigatório" do rótulo some quando o campo tem valor
function marcarObrigatorio(input, idSelo){
  const selo = $(idSelo);
  if(selo) selo.style.display = limpar(input.value) ? 'none' : '';
}

// Máscara do protocolo SEI: 0000000-00.0000.0.00.0000 — mesma das demais
// ferramentas, reconstruída a partir dos dígitos a cada tecla
function ativarMascaraSei(el){
  el.addEventListener('input', function(){
    const d = soDigitos(el.value).slice(0,20);
    let out = d.slice(0,7);
    if(d.length>7)  out += '-' + d.slice(7,9);
    if(d.length>9)  out += '.' + d.slice(9,13);
    if(d.length>13) out += '.' + d.slice(13,14);
    if(d.length>14) out += '.' + d.slice(14,16);
    if(d.length>16) out += '.' + d.slice(16,20);
    el.value = out;
  });
}

/* ---------------- autocomplete da unidade ----------------
   Um campo só: a pessoa digita a sigla SEI ou parte do nome e a lista sugere
   unidades da base do TJPR (edital_unidades_sei.js). Escolher é OPCIONAL —
   o campo aceita qualquer texto, inclusive de unidade que não esteja na base. */

// O índice (sigla + nome por extenso + chave de busca) é montado uma única
// vez, na primeira tecla: são ~2.000 unidades e remontar a cada tecla
// deixaria a digitação lenta.
let indiceUnidades = null;
function obterIndiceUnidades(){
  if(indiceUnidades) return indiceUnidades;
  indiceUnidades = [];
  if(typeof UNIDADES_SEI === 'undefined') return indiceUnidades;
  Object.keys(UNIDADES_SEI).forEach(function(sigla){
    const nome = nomeUnidadePorExtenso(UNIDADES_SEI[sigla]);
    if(nome) indiceUnidades.push({ sigla, nome, busca: semAcento(sigla+' '+nome).toUpperCase() });
  });
  return indiceUnidades;
}

const MAX_SUGESTOES = 12;
let sugestoesAtuais = [], sugestaoAtiva = -1;

function fecharSugestoes(){
  const lista = $('rfUnidadeLista'), campo = $('rfUnidade');
  if(lista){ lista.classList.remove('aberta'); lista.innerHTML = ''; }
  if(campo) campo.setAttribute('aria-expanded','false');
  sugestoesAtuais = []; sugestaoAtiva = -1;
}

function escolherSugestao(i){
  const s = sugestoesAtuais[i];
  if(!s) return;
  const campo = $('rfUnidade');
  campo.value = s.nome;
  estado.unidade = s.nome;
  estado.sigla = s.sigla;
  marcarObrigatorio(campo, 'rfUnidadeObrig');
  fecharSugestoes();
  agendarRascunhoLocal();
}

function marcarSugestaoAtiva(){
  const lista = $('rfUnidadeLista');
  if(!lista) return;
  Array.prototype.forEach.call(lista.querySelectorAll('.rf-auto-item'), function(el, i){
    el.classList.toggle('ativo', i===sugestaoAtiva);
  });
}

function atualizarSugestoes(){
  const campo = $('rfUnidade'), lista = $('rfUnidadeLista');
  if(!campo || !lista) return;
  const termo = semAcento(limpar(campo.value)).toUpperCase();
  // menos de 2 caracteres traria centenas de resultados sem utilidade
  if(termo.length < 2){ fecharSugestoes(); return; }

  const partes = termo.split(' ').filter(Boolean);
  sugestoesAtuais = [];
  const todas = obterIndiceUnidades();
  for(let i=0;i<todas.length && sugestoesAtuais.length<MAX_SUGESTOES;i++){
    if(partes.every(p=>todas[i].busca.indexOf(p)>=0)) sugestoesAtuais.push(todas[i]);
  }
  sugestaoAtiva = -1;

  if(!sugestoesAtuais.length){ fecharSugestoes(); return; }
  // sigla e nome em linhas próprias: o nome das unidades é longo e, tudo na
  // mesma linha, a lista vira uma parede de texto
  lista.innerHTML = sugestoesAtuais.map(function(s, i){
    return '<span class="rf-auto-item" role="option" data-i="'+i+'">'
      + '<span class="rf-auto-sigla">'+esc(s.sigla)+'</span>'
      + '<span class="rf-auto-nome">'+esc(s.nome)+'</span></span>';
  }).join('');
  lista.classList.add('aberta');
  campo.setAttribute('aria-expanded','true');
  Array.prototype.forEach.call(lista.querySelectorAll('.rf-auto-item'), function(el){
    // mousedown (e não click): o blur do campo fecharia a lista antes do clique
    el.addEventListener('mousedown', function(ev){ ev.preventDefault(); escolherSugestao(Number(el.dataset.i)); });
  });
}

function teclaNasSugestoes(ev){
  const aberta = sugestoesAtuais.length > 0;
  if(ev.key==='Escape'){ fecharSugestoes(); return; }
  if(!aberta) return;
  if(ev.key==='ArrowDown'){ ev.preventDefault(); sugestaoAtiva = (sugestaoAtiva+1) % sugestoesAtuais.length; marcarSugestaoAtiva(); }
  else if(ev.key==='ArrowUp'){ ev.preventDefault(); sugestaoAtiva = (sugestaoAtiva<=0 ? sugestoesAtuais.length : sugestaoAtiva) - 1; marcarSugestaoAtiva(); }
  else if(ev.key==='Enter' && sugestaoAtiva>=0){ ev.preventDefault(); escolherSugestao(sugestaoAtiva); }
}

// Zera o estado e a tela. `apagarRascunho` distingue os dois usos: começar do
// zero apaga também a cópia local; abrir um registro da nuvem só limpa a tela
// antes de aplicar o que veio de lá.
function limparTudo(apagarRascunho){
  estado.sigla = ''; estado.unidade = ''; estado.sei = '';
  estado.linhas = [];
  if(apagarRascunho){ try{ localStorage.removeItem(CHAVE_LOCAL); }catch(e){} }
  const inUnidade = $('rfUnidade'), inSei = $('rfSei');
  if(inUnidade){ inUnidade.value = ''; marcarObrigatorio(inUnidade, 'rfUnidadeObrig'); }
  if(inSei){ inSei.value = ''; marcarObrigatorio(inSei, 'rfSeiObrig'); }
  fecharSugestoes();
  const msg = $('rfMsgDocs'); if(msg) msg.textContent = '';
  const salvoEm = $('rfNuvemSalvoEm'); if(salvoEm) salvoEm.textContent = '';
  const st = $('rfNuvemStatus'); if(st) st.textContent = '';
  const doc = $('rfDocumento'); if(doc){ doc.innerHTML = ''; doc.style.display = 'none'; }
  // outro preenchimento recomeça em edição, com os documentos ocultos até
  // que ESTE novo trabalho seja finalizado
  travado = false;
  aplicarTravamento();   // já redesenha a tabela
}

// Limpa a tela para começar outro processo seletivo — o caso de uma mesma
// unidade tocar dois certames (graduação e pós, por exemplo). Confirma antes:
// o rascunho local é apagado junto, e o que não tiver sido salvo na nuvem ou
// baixado se perde.
function novoPreenchimento(){
  const temConteudo = estado.linhas.some(l=>limpar(l.nome)) || limpar(estado.unidade) || limpar(estado.sei);
  if(temConteudo && !confirm('Começar um novo preenchimento? O que está na tela será apagado — salve ou baixe antes, se ainda precisar.')) return;
  limparTudo(true);
  avisar('Tela limpa para um novo preenchimento.');
}

/* ---------------- tela inicial ----------------
   A página abre só com a escolha: começar do zero ou retomar o que ficou
   guardado neste navegador. Antes disso nenhum campo aparece — abrir já
   carregando o preenchimento anterior fazia parecer que a ferramenta só
   servia para um processo seletivo. */
let rascunhoGuardado = null;   // pacote lido do localStorage, ainda NÃO aplicado

function lerRascunhoGuardado(){
  try{
    const bruto = localStorage.getItem(CHAVE_LOCAL);
    if(!bruto) return null;
    const p = JSON.parse(bruto);
    if(!p || !Array.isArray(p.linhas)) return null;
    // Rascunho SEM CONTEÚDO não conta como algo a retomar. Isso acontece de
    // verdade: ao limpar a tela, o autosave grava o estado vazio de volta —
    // sem esta checagem a tela inicial ofereceria "continuar" um
    // preenchimento em branco, com 0 candidatos.
    const vazio = !limpar(p.unidade) && !limpar(p.sei) && !p.linhas.some(l=>limpar(l && l.nome));
    return vazio ? null : p;
  }catch(e){ return null; }
}

// resumo do que está guardado, para a pessoa saber o que vai retomar
function descreverRascunho(p){
  const partes = [];
  if(limpar(p.unidade)) partes.push(limpar(p.unidade));
  if(limpar(p.sei)) partes.push('SEI '+limpar(p.sei));
  const qtd = p.linhas.filter(l=>limpar(l.nome)).length;
  partes.push(qtd===1 ? '1 candidato' : qtd+' candidatos');
  if(p.salvoEm){
    const d = new Date(p.salvoEm);
    if(!isNaN(d)) partes.push('última alteração em '+d.toLocaleString('pt-BR'));
  }
  return partes.join(' · ');
}

function mostrarTelaInicial(){
  const inicio = $('rfInicio'), trabalho = $('rfTrabalho'), nota = $('rfInicioNota');
  const btnAnterior = $('rfBtnInicioAnterior');
  rascunhoGuardado = lerRascunhoGuardado();
  if(inicio) inicio.style.display = '';
  if(trabalho) trabalho.style.display = 'none';
  if(rascunhoGuardado){
    if(btnAnterior){ btnAnterior.disabled = false; btnAnterior.title = ''; }
    if(nota) nota.innerHTML = 'Guardado neste navegador: <strong>'+esc(descreverRascunho(rascunhoGuardado))+'</strong>.';
  } else {
    if(btnAnterior){ btnAnterior.disabled = true; btnAnterior.title = 'Nenhum preenchimento guardado neste navegador'; }
    if(nota) nota.textContent = 'Não há preenchimento guardado neste navegador — comece um novo.';
  }
}

function abrirAreaDeTrabalho(){
  const inicio = $('rfInicio'), trabalho = $('rfTrabalho');
  if(inicio) inicio.style.display = 'none';
  if(trabalho) trabalho.style.display = '';
}

function baixarRascunho(){
  baixarArquivo(nomeBaseArquivo()+'_rascunho.json', JSON.stringify(pacoteAtual(), null, 1), 'application/json');
}

/* ---------------- área administrativa ----------------
   PIN de 6 dígitos que apenas EVITA CLIQUE ACIDENTAL de quem só vai gerar o
   documento da própria unidade. Não é segurança de verdade: o valor está no
   código, que roda no navegador. Se um dia precisar ser mesmo restrito, a
   trava tem de ficar do lado do banco (policies do Supabase por usuário
   autenticado), não aqui. */
const PIN_ADMIN = '000000';

function tentarPin(){
  const campo = $('rfPin'), msg = $('rfPinMsg');
  if(soDigitos(campo.value) === PIN_ADMIN){
    $('rfAdminTrava').style.display = 'none';
    $('rfAdminConteudo').style.display = '';
    if(msg) msg.textContent = '';
    campo.value = '';
  } else {
    if(msg) msg.innerHTML = '<span style="color:var(--coral);">PIN incorreto.</span>';
    campo.value = '';
    campo.focus();
  }
}
function abrirRascunho(file){
  file.text().then(function(texto){
    let p = null;
    try{ p = JSON.parse(texto); }catch(e){}
    if(!p || !aplicarPacote(p)){
      avisar('O arquivo não é um rascunho desta ferramenta.', 'erro');
      return;
    }
    // a caixa de rascunho fica visível também na tela inicial: abrir um
    // arquivo por ali já leva direto para a área de trabalho
    abrirAreaDeTrabalho();
    avisar('Rascunho aberto.');
  });
}

document.addEventListener('DOMContentLoaded', function(){
  if(!$('rfCorpo')) return;

  // Passo 1 — campos básicos
  const inUnidade = $('rfUnidade'), inSei = $('rfSei');
  ativarMascaraSei(inSei);
  inUnidade.addEventListener('input', function(){
    estado.unidade = inUnidade.value;
    estado.sigla = '';        // digitou à mão: a sigla anterior não vale mais
    marcarObrigatorio(inUnidade, 'rfUnidadeObrig');
    atualizarSugestoes();
    agendarRascunhoLocal();
  });
  inUnidade.addEventListener('keydown', teclaNasSugestoes);
  inUnidade.addEventListener('blur', function(){ setTimeout(fecharSugestoes, 120); });
  inSei.addEventListener('input', function(){
    estado.sei = inSei.value;
    marcarObrigatorio(inSei, 'rfSeiObrig');
    agendarRascunhoLocal();
  });
  $('rfBtnNovo').addEventListener('click', novoPreenchimento);

  // Passo 2 — tabela
  $('rfBtnAdicionar').addEventListener('click', function(){
    estado.linhas.push(novaLinha());
    renderTabela();
    const tr = $('rfCorpo').querySelector('tr[data-id="'+estado.linhas[estado.linhas.length-1].id+'"]');
    const alvo = tr && tr.querySelector('.rfIn[data-f="inscricao"]');
    if(alvo) alvo.focus();
  });
  $('rfBtnOrdenarNota').addEventListener('click', function(){
    estado.linhas = ordenarPorNota(estado.linhas);
    renderTabela();
  });
  $('rfBtnOrdenarNome').addEventListener('click', function(){
    estado.linhas = ordenarAlfabetico(estado.linhas);
    renderTabela();
  });

  // Passo 3 — finalizar (grava, trava a tela e libera os documentos) e o
  // caminho de volta, que destrava e esconde os documentos de novo
  $('rfBtnFinalizar').addEventListener('click', finalizarPreenchimento);
  $('rfBtnEditar').addEventListener('click', voltarAEditar);

  // Área administrativa (fora dos passos) — recuperar registros e backup,
  // atrás do PIN. Salvar NÃO está aqui: é do usuário, no Passo 3.
  $('rfAdminToggle').addEventListener('click', function(){
    const corpo = $('rfAdminCorpo'), botao = $('rfAdminToggle');
    const abrir = corpo.style.display === 'none';
    corpo.style.display = abrir ? '' : 'none';
    botao.textContent = abrir ? 'Fechar' : 'Abrir';
    botao.setAttribute('aria-expanded', abrir ? 'true' : 'false');
  });
  $('rfBtnPin').addEventListener('click', tentarPin);
  $('rfPin').addEventListener('keydown', function(ev){ if(ev.key==='Enter'){ ev.preventDefault(); tentarPin(); } });

  $('rfBtnNuvemBuscar').addEventListener('click', buscarNuvem);
  $('rfNuvemBusca').addEventListener('keydown', function(ev){ if(ev.key==='Enter'){ ev.preventDefault(); buscarNuvem(); } });
  $('rfBtnBackupBaixar').addEventListener('click', baixarBackupCompleto);
  const backupArquivo = $('rfBackupArquivo');
  $('rfBtnBackupRestaurar').addEventListener('click', function(){ backupArquivo.click(); });
  backupArquivo.addEventListener('change', function(){
    const f = backupArquivo.files && backupArquivo.files[0];
    backupArquivo.value = '';
    if(f) restaurarBackup(f);
  });

  // Passo 4 — documentos (PDF e CSV)
  $('rfBtnPdf').addEventListener('click', gerarPdf);
  $('rfBtnCsv').addEventListener('click', baixarCsv);

  // Rascunho flutuante
  const draft = $('rfDraft'), draftToggle = $('rfDraftToggle');
  draftToggle.addEventListener('click', function(){
    const recolhida = draft.classList.toggle('collapsed');
    draftToggle.textContent = recolhida ? '+' : '–';
    draftToggle.title = recolhida ? 'Abrir' : 'Recolher';
    draftToggle.setAttribute('aria-expanded', recolhida ? 'false' : 'true');
  });
  $('rfBtnRascunhoBaixar').addEventListener('click', baixarRascunho);
  const rascunhoArquivo = $('rfRascunhoArquivo');
  $('rfBtnRascunhoAbrir').addEventListener('click', function(){ rascunhoArquivo.click(); });
  rascunhoArquivo.addEventListener('change', function(){
    const f = rascunhoArquivo.files && rascunhoArquivo.files[0];
    rascunhoArquivo.value = '';
    if(f) abrirRascunho(f);
  });

  // Tela inicial — as duas escolhas antes de qualquer campo
  $('rfBtnInicioNovo').addEventListener('click', function(){
    limparTudo(true);
    abrirAreaDeTrabalho();
    const inUnidade = $('rfUnidade'); if(inUnidade) inUnidade.focus();
  });
  $('rfBtnInicioAnterior').addEventListener('click', function(){
    if(!rascunhoGuardado) return;
    if(!aplicarPacote(rascunhoGuardado)){
      avisar('O preenchimento guardado está em formato desconhecido.', 'erro');
      return;
    }
    abrirAreaDeTrabalho();
    const nota = $('rfDraftNota');
    if(nota) nota.textContent = 'preenchimento anterior retomado';
  });

  aplicarTravamento();   // estado inicial (em edição) + primeiro desenho da tabela
  mostrarTelaInicial();
});

/* Exposto para depuração e testes automatizados. */
window.ResultadoFinal = {
  estado, novaLinha, paraNumero, fmtNota, parseDataNascimento, calcularMedia,
  notaFinalDivergente, ordenarPorNota, ordenarAlfabetico, chaveNome,
  gerarCsvTexto, montarDocumentoHtml, linhaParaColunas, validarParaDocumento,
  idRegistro, pacoteAtual, aplicarPacote, nomeUnidadePorExtenso,
  COLUNAS_SAIDA, RESERVAS, CHAVE_LOCAL, renderTabela,
  construirPdf, pdfLarguraTexto, pdfQuebrarTexto, pdfEscaparTexto,
  pdfBase64ParaBinario, pdfDimensoesJpeg,
  obterIndiceUnidades, atualizarSugestoes, escolherSugestao, fecharSugestoes,
  novoPreenchimento, limparTudo, tentarPin, PIN_ADMIN,
  lerRascunhoGuardado, descreverRascunho, mostrarTelaInicial, abrirAreaDeTrabalho,
  finalizarPreenchimento, voltarAEditar, aplicarTravamento, salvarNuvem,
  excluirRegistro,
  estaTravado: function(){ return travado; }
};
})();
