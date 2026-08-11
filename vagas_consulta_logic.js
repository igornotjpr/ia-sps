/* Consulta de Vagas Disponíveis por Unidade — Divisão de Gestão de Estágios,
   Residência e Voluntariado (TJPR)

   Como o Fluxo, esta ferramenta É o dado: fica gravado numa linha única do
   Supabase (tabela vagas_estado) e é compartilhado por toda a equipe — quem
   abre a página vê a última planilha enviada por qualquer pessoa. Não há
   edição campo a campo aqui: a única forma de atualizar é enviando a
   planilha de controle inteira (aba "Atualizar dados", no fim da página),
   que SUBSTITUI o que está gravado.

   A planilha de origem (.xlsx/.xlsm) traz duas abas que interessam:
     HERC_VPU — cópia bruta do relatório da Fábrica (Sigla + NomeUnidade em
                cadeia "CIDADE|SECRETARIA..." — mesmo formato usado no
                Gerador do Edital de Abertura) — usada só para resolver o
                nome por extenso de cada sigla.
     GERAL    — a aba com os dados que interessam de fato: Entrância, Seção
                Judiciária, Complemento, PRAZO/MOTIVO/SEI da vaga provisória,
                e o quantitativo de vagas (linha 3 = cabeçalho das colunas
                simples; linhas 1-2 = cabeçalho em grupo das colunas de vaga,
                repetidas em EM/G/PG para cada grupo: DISPONIBILIZADAS,
                OCUPADAS, PROVIS_DISP, PROVIS_OCUP — DJ 345/2019 e
                INCONSISTÊNCIA existem na planilha mas não são mostradas
                aqui, são referência/auditoria interna).

   Estrutura do arquivo:
     A) utilidades
     B) nome por extenso da unidade (duplicado do edital_logic.js — este
        projeto não usa módulos compartilhados entre ferramentas)
     C) gravação: nuvem (Supabase) e cópia local
     D) leitura da planilha de controle (.xlsx/.xlsm)
     E) estado da página, busca e filtros
     F) desenho: chips, lista de resultados, tabela comparativa
     G) upload: escolher arquivo, prévia, confirmar
     H) ligação com a página
*/
(function(){
'use strict';

/* ========================= A) utilidades ========================= */

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s){ return esc(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function normTxt(s){
  return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
}
function normBusca(s){
  return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
function numDe(v){
  var n = parseInt(String(v==null?'':v).trim(), 10);
  return isFinite(n) ? n : 0;
}
// PRAZO chega da planilha de duas formas, nenhuma delas já em DD/MM/AAAA:
// serial puro do Excel (dias desde 1899-12-30) quando a célula não tem
// formato de data reconhecido, ou "M/D/AA" (mês primeiro) quando o SheetJS
// aplica o formato padrão dele — nos dois casos convertemos para DD/MM/AAAA.
function formatarPrazo(v){
  var s = String(v==null?'':v).trim();
  if(!s) return '';
  if(/^\d+$/.test(s)){
    var d = new Date(Math.round((parseInt(s,10)-25569)*86400*1000));
    return ('0'+d.getUTCDate()).slice(-2)+'/'+('0'+(d.getUTCMonth()+1)).slice(-2)+'/'+d.getUTCFullYear();
  }
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if(m){
    var mes=parseInt(m[1],10), dia=parseInt(m[2],10), ano=parseInt(m[3],10);
    if(ano<100) ano += (ano<70 ? 2000 : 1900);
    return ('0'+dia).slice(-2)+'/'+('0'+mes).slice(-2)+'/'+ano;
  }
  return s;
}

/* ============ B) nome por extenso da unidade ============
   Idêntico ao do Gerador do Edital de Abertura (edital_logic.js) — mesma
   lógica: inverte a ordem da cadeia "CIDADE|SECRETARIA...", maiusculiza e
   concatena com DO/DA/DA COMARCA DE. Duplicado de propósito (sem módulos
   compartilhados neste projeto). */
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

/* ============ C) gravação: nuvem e cópia local ============
   Mesmo projeto Supabase do Fluxo (fluxo_logic.js), tabela nova
   (vagas_estado) — SQL de criação em Recursos/vagas_estado.sql. */
const SUPABASE_URL = 'https://xmuduqgwwplrtnfbfgtf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_O3f7DXw4K3DYf34k3QaF6w_ZJgpwExw';
const TABELA_NUVEM = 'vagas_estado';
const LINHA_NUVEM  = 'estado';
const CHAVE_LOCAL  = 'tjpr_vagas_consulta_v1';

function cabecalhosNuvem(extra){
  return Object.assign({ 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }, extra || {});
}
async function lerDaNuvem(){
  const url = SUPABASE_URL + '/rest/v1/' + TABELA_NUVEM
    + '?select=data,updated_at&id=eq.' + encodeURIComponent(LINHA_NUVEM) + '&limit=1';
  const r = await fetch(url, { headers: cabecalhosNuvem({ 'Accept':'application/json' }) });
  if(!r.ok) throw new Error('HTTP ' + r.status);
  const linhas = await r.json();
  return (linhas && linhas[0]) || null;
}
async function gravarNaNuvem(pacote){
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + TABELA_NUVEM, {
    method:'POST',
    headers: cabecalhosNuvem({ 'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify([{ id:LINHA_NUVEM, data:pacote, updated_at:new Date().toISOString() }])
  });
  if(!r.ok){
    const detalhe = await r.text().catch(()=>'');
    throw new Error('HTTP ' + r.status + (detalhe ? ' — ' + detalhe.slice(0,180) : ''));
  }
  return true;
}
function guardarCopiaLocal(pacote){ try{ localStorage.setItem(CHAVE_LOCAL, JSON.stringify(pacote)); }catch(e){} }
function lerCopiaLocal(){
  try{ const bruto = localStorage.getItem(CHAVE_LOCAL); return bruto ? JSON.parse(bruto) : null; }catch(e){ return null; }
}

/* ============ D) leitura da planilha de controle ============ */

// grupos de colunas de vaga que interessam (linha 1-2 do cabeçalho da aba
// GERAL) — DJ345 e INCONSISTÊNCIA existem na planilha mas ficam de fora
const GRUPOS_VAGA = ['DISPONIBILIZADAS','OCUPADAS','PROVIS_DISP','PROVIS_OCUP'];
const SUB_NIVEL = ['EM','G','PG'];

function lerPlanilhaComoLinhas(wb, nomeAba){
  const ws = wb.Sheets[nomeAba];
  if(!ws) throw new Error('A aba "'+nomeAba+'" não foi encontrada no arquivo. Abas disponíveis: '+wb.SheetNames.join(', ')+'.');
  return XLSX.utils.sheet_to_json(ws, { header:1, raw:false, defval:'' });
}

// mapa SIGLA -> NomeUnidade bruto ("CIDADE|SECRETARIA...") a partir da HERC_VPU
function mapaNomesDaHerc(linhasHerc){
  if(!linhasHerc.length) throw new Error('A aba HERC_VPU está vazia.');
  const cab = {};
  (linhasHerc[0]||[]).forEach((v,i)=>{ const n=normTxt(v); if(n) cab[n]=i; });
  const iSigla = cab['SIGLA'], iNome = cab['NOMEUNIDADE'];
  if(iSigla===undefined || iNome===undefined)
    throw new Error('Não encontrei as colunas "Sigla"/"NomeUnidade" no cabeçalho da aba HERC_VPU.');
  const mapa = {};
  for(let r=1;r<linhasHerc.length;r++){
    const linha = linhasHerc[r]; if(!linha) continue;
    const sigla = String(linha[iSigla]||'').trim().toUpperCase();
    const nome = String(linha[iNome]||'').trim();
    if(sigla && nome) mapa[sigla] = nome;
  }
  return mapa;
}

// localiza, na aba GERAL, os índices das colunas simples (linha 3) e das
// colunas de vaga em grupo (linhas 1-2, repetidas em EM/G/PG por grupo)
function localizarColunasGeral(linhasGeral){
  if(linhasGeral.length < 3) throw new Error('A aba GERAL não tem as 3 linhas de cabeçalho esperadas.');
  const linhaGrupo = linhasGeral[1] || [];
  const linhaSub   = linhasGeral[2] || [];

  const simples = {};
  linhaSub.forEach((v,i)=>{
    const n = normTxt(v);
    if(n && SUB_NIVEL.indexOf(n)===-1) simples[n]=i;
  });

  const grupos = {};
  let grupoAtual = '';
  linhaSub.forEach((v,i)=>{
    const n = normTxt(v);
    if(SUB_NIVEL.indexOf(n)===-1) return;
    const g = normTxt(linhaGrupo[i]);
    if(g) grupoAtual = g;
    if(grupoAtual) grupos[grupoAtual+'_'+n] = i;
  });

  const faltando = [];
  ['SIGLA','ENTRANCIA','SECAO JUDICIARIA','COMPLEMENTO','PRAZO','MOTIVO','SEI','GAB/SEC'].forEach(k=>{
    if(simples[k]===undefined) faltando.push(k);
  });
  GRUPOS_VAGA.forEach(g=>SUB_NIVEL.forEach(s=>{ if(grupos[g+'_'+s]===undefined) faltando.push(g+'_'+s); }));
  if(faltando.length)
    throw new Error('Não encontrei estas colunas no cabeçalho da aba GERAL (linhas 1-3): '+faltando.join(', ')+'. A planilha pode ter mudado de formato.');

  return { simples, grupos, primeiraLinhaDados: 3 };
}

function montarUnidades(linhasGeral, colGeral, mapaNomes){
  const porSigla = {};
  let duplicadas = 0, semNome = 0, comProvisoria = 0;
  const s = colGeral.simples, g = colGeral.grupos;

  var r;
  for(r=colGeral.primeiraLinhaDados; r<linhasGeral.length; r++){
    const linha = linhasGeral[r];
    if(!linha) continue;
    const sigla = String(linha[s['SIGLA']]||'').trim().toUpperCase();
    if(!sigla) continue;
    if(porSigla[sigla]) duplicadas++;

    const nomeBruto = mapaNomes[sigla];
    const nome = nomeBruto ? nomeUnidadePorExtenso(nomeBruto) : '';
    if(!nome) semNome++;

    function nivelPar(grupoDisp, grupoOcup, nivel){
      return { disp: numDe(linha[g[grupoDisp+'_'+nivel]]), ocup: numDe(linha[g[grupoOcup+'_'+nivel]]) };
    }
    const geral = {
      em: nivelPar('DISPONIBILIZADAS','OCUPADAS','EM'),
      g:  nivelPar('DISPONIBILIZADAS','OCUPADAS','G'),
      pg: nivelPar('DISPONIBILIZADAS','OCUPADAS','PG')
    };
    const provisoria = {
      em: nivelPar('PROVIS_DISP','PROVIS_OCUP','EM'),
      g:  nivelPar('PROVIS_DISP','PROVIS_OCUP','G'),
      pg: nivelPar('PROVIS_DISP','PROVIS_OCUP','PG'),
      prazo: formatarPrazo(linha[s['PRAZO']]),
      motivo: String(linha[s['MOTIVO']]||'').trim(),
      sei: String(linha[s['SEI']]||'').trim()
    };
    if(provisoria.em.disp || provisoria.g.disp || provisoria.pg.disp) comProvisoria++;

    const unidade = {
      sigla, nome,
      entrancia: String(linha[s['ENTRANCIA']]||'').trim(),
      secaoJudiciaria: String(linha[s['SECAO JUDICIARIA']]||'').trim(),
      complemento: String(linha[s['COMPLEMENTO']]||'').trim(),
      gabSec: String(linha[s['GAB/SEC']]||'').trim(),
      geral, provisoria
    };
    unidade._blob = normBusca([unidade.sigla,unidade.nome,unidade.secaoJudiciaria,unidade.entrancia,unidade.gabSec,unidade.complemento].join(' '));
    porSigla[sigla] = unidade;
  }

  const unidades = Object.keys(porSigla).sort().map(k=>porSigla[k]);
  return { unidades, resumo:{ total:unidades.length, duplicadas, semNome, comProvisoria } };
}

async function parseArquivoVagas(file){
  if(typeof XLSX === 'undefined') throw new Error('Biblioteca de planilhas não carregada (vendor/xlsx.min.js).');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type:'array' });
  const linhasHerc = lerPlanilhaComoLinhas(wb, 'HERC_VPU');
  const linhasGeral = lerPlanilhaComoLinhas(wb, 'GERAL');
  const mapaNomes = mapaNomesDaHerc(linhasHerc);
  const colGeral = localizarColunasGeral(linhasGeral);
  const { unidades, resumo } = montarUnidades(linhasGeral, colGeral, mapaNomes);
  if(!unidades.length) throw new Error('Nenhuma unidade foi lida da aba GERAL — confira se o arquivo é o correto.');
  return { unidades, resumo, arquivoNome:file.name };
}

/* ============ E) estado da página, busca e filtros ============ */

const estado = {
  unidades: [],
  selecionadas: new Set(),
  filtroEntrancia: '',
  filtroTipo: '',
  atualizadoEm: ''
};

function opcoesUnicas(campo){
  const vistos = {};
  estado.unidades.forEach(u=>{ const v=(u[campo]||'').trim(); if(v) vistos[v]=(vistos[v]||0)+1; });
  return Object.keys(vistos).sort();
}

function pontuar(u, termoNorm){
  if(!termoNorm) return 0;
  let score = 0;
  const siglaN = normBusca(u.sigla);
  if(siglaN===termoNorm) score += 1000;
  else if(siglaN.indexOf(termoNorm)===0) score += 500;
  else if(siglaN.indexOf(termoNorm)>=0) score += 200;
  if(normBusca(u.nome).indexOf(termoNorm)>=0) score += 100;
  return score;
}

function buscarUnidades(){
  const termoNorm = normBusca(($('vgBusca')&&$('vgBusca').value)||'');
  const tokens = termoNorm.split(/\s+/).filter(Boolean);
  let lista = estado.unidades.filter(u=>{
    if(estado.filtroEntrancia && u.entrancia!==estado.filtroEntrancia) return false;
    if(estado.filtroTipo && u.gabSec!==estado.filtroTipo) return false;
    if(!tokens.length) return true;
    return tokens.every(t=>u._blob.indexOf(t)>=0);
  });
  if(tokens.length){
    lista = lista.map(u=>({ u, pt: pontuar(u, termoNorm) })).sort((a,b)=> b.pt-a.pt || a.u.nome.localeCompare(b.u.nome)).map(x=>x.u);
  } else {
    lista = lista.slice().sort((a,b)=>a.nome.localeCompare(b.nome));
  }
  return lista;
}

/* ============ F) desenho: chips, lista, comparativo ============ */

let limiteExibido = 80;
const PASSO_EXIBICAO = 80;

function celulaVagas(par){
  const livre = Math.max(0, par.disp - par.ocup);
  return '<div>'+par.disp+' disp.</div><div style="color:var(--ink-soft);">'+par.ocup+' ocup.</div>'
    + '<div class="vg-num-livre '+(livre>0?'tem':'zero')+'">'+livre+' livre'+(livre===1?'':'s')+'</div>';
}

function resumoCompacto(u){
  function soma(chave){
    return ['em','g','pg'].reduce((acc,n)=>{ acc.disp+=u[chave][n].disp; acc.ocup+=u[chave][n].ocup; return acc; }, {disp:0,ocup:0});
  }
  const g = soma('geral'), p = soma('provisoria');
  let h = '<span class="vg-tag-disp">'+Math.max(0,g.disp-g.ocup)+' livre'+(Math.max(0,g.disp-g.ocup)===1?'':'s')+'</span> de '+g.disp+' (geral)';
  if(p.disp>0) h += ' · <span class="vg-tag-prov">'+Math.max(0,p.disp-p.ocup)+' livre'+(Math.max(0,p.disp-p.ocup)===1?'':'s')+'</span> de '+p.disp+' (provisória)';
  return h;
}

function renderChips(){
  const boxE = $('vgChipsEntrancia'), boxT = $('vgChipsTipo');
  if(!boxE || !boxT) return;
  const entrancias = opcoesUnicas('entrancia');
  boxE.innerHTML = entrancias.map(v=>
    '<button type="button" class="vg-chip'+(estado.filtroEntrancia===v?' ativo':'')+'" data-filtro="entrancia" data-valor="'+escAttr(v)+'">'+esc(v)+'</button>'
  ).join('');
  const tipos = opcoesUnicas('gabSec');
  boxT.innerHTML = tipos.map(v=>
    '<button type="button" class="vg-chip'+(estado.filtroTipo===v?' ativo':'')+'" data-filtro="tipo" data-valor="'+escAttr(v)+'">'+esc(v)+'</button>'
  ).join('');
  boxE.querySelectorAll('.vg-chip').forEach(b=>b.addEventListener('click',()=>{
    estado.filtroEntrancia = (estado.filtroEntrancia===b.dataset.valor) ? '' : b.dataset.valor;
    limiteExibido = PASSO_EXIBICAO;
    renderTudo();
  }));
  boxT.querySelectorAll('.vg-chip').forEach(b=>b.addEventListener('click',()=>{
    estado.filtroTipo = (estado.filtroTipo===b.dataset.valor) ? '' : b.dataset.valor;
    limiteExibido = PASSO_EXIBICAO;
    renderTudo();
  }));
}

function renderLista(){
  const box = $('vgLista'), maisBtn = $('vgMostrarMais');
  if(!box) return;
  const resultado = buscarUnidades();
  const exibidos = resultado.slice(0, limiteExibido);

  if(!estado.unidades.length){
    box.innerHTML = '<p class="empty-hint">Nenhum dado carregado ainda.</p>';
    if(maisBtn) maisBtn.style.display = 'none';
    return;
  }
  if(!exibidos.length){
    box.innerHTML = '<p class="empty-hint">Nenhuma unidade encontrada com esses termos/filtros.</p>';
    if(maisBtn) maisBtn.style.display = 'none';
    return;
  }

  box.innerHTML = exibidos.map(u=>{
    const marcado = estado.selecionadas.has(u.sigla);
    return '<label class="vg-item'+(marcado?' marcado':'')+'" data-sigla="'+escAttr(u.sigla)+'">'
      + '<input type="checkbox" data-sel="'+escAttr(u.sigla)+'"'+(marcado?' checked':'')+'>'
      + '<span class="vg-item-corpo">'
      +   '<span class="vg-item-sigla">'+esc(u.sigla)+'</span>'
      +   '<div class="vg-item-nome">'+esc(u.nome||'(nome não identificado — confira a sigla na planilha)')+'</div>'
      +   '<div class="vg-item-meta">'+[u.secaoJudiciaria,u.entrancia,u.gabSec,u.complemento].filter(Boolean).map(esc).join(' · ')+'</div>'
      +   '<div class="vg-item-vagas">'+resumoCompacto(u)+'</div>'
      + '</span></label>';
  }).join('');

  box.querySelectorAll('[data-sel]').forEach(cb=>cb.addEventListener('change',()=>{
    const sigla = cb.dataset.sel;
    if(cb.checked) estado.selecionadas.add(sigla); else estado.selecionadas.delete(sigla);
    cb.closest('.vg-item').classList.toggle('marcado', cb.checked);
    renderComparativo();
  }));

  if(maisBtn) maisBtn.style.display = (resultado.length > exibidos.length) ? '' : 'none';
  const status = $('vgStatus');
  if(status && estado.unidades.length){
    status.textContent = resultado.length + ' unidade'+(resultado.length===1?'':'s')+' encontrada'+(resultado.length===1?'':'s')
      + (estado.atualizadoEm ? ' · dados de ' + estado.atualizadoEm : '');
  }
}

function renderComparativo(){
  const boxWrap = $('vgComparativoBox'), tabela = $('vgTabelaComparativa');
  if(!boxWrap || !tabela) return;
  const selecionadas = estado.unidades.filter(u=>estado.selecionadas.has(u.sigla));
  if(!selecionadas.length){ boxWrap.style.display='none'; tabela.innerHTML=''; return; }
  boxWrap.style.display='';

  let h = '<thead><tr>'
    + '<th style="text-align:left;">Unidade</th>'
    + '<th>Geral · Médio</th><th>Geral · Graduação</th><th>Geral · Pós</th>'
    + '<th>Provisória · Médio</th><th>Provisória · Graduação</th><th>Provisória · Pós</th>'
    + '<th style="text-align:left;">Provisória — detalhes</th><th></th>'
    + '</tr></thead><tbody>';
  selecionadas.forEach(u=>{
    const temProv = (u.provisoria.em.disp||u.provisoria.g.disp||u.provisoria.pg.disp||u.provisoria.motivo);
    h += '<tr>'
      + '<td class="vg-col-unidade"><div class="vg-nome-unidade">'+esc(u.nome||'(nome não identificado)')+'</div>'
      +   '<div class="vg-sigla-unidade">'+esc(u.sigla)+(u.secaoJudiciaria?' · '+esc(u.secaoJudiciaria):'')+'</div></td>'
      + '<td>'+celulaVagas(u.geral.em)+'</td>'
      + '<td>'+celulaVagas(u.geral.g)+'</td>'
      + '<td>'+celulaVagas(u.geral.pg)+'</td>'
      + '<td>'+celulaVagas(u.provisoria.em)+'</td>'
      + '<td>'+celulaVagas(u.provisoria.g)+'</td>'
      + '<td>'+celulaVagas(u.provisoria.pg)+'</td>'
      + '<td class="vg-prazo-bloco">'+(temProv
          ? [u.provisoria.prazo?('Prazo: '+esc(u.provisoria.prazo)):'', u.provisoria.motivo?('Motivo: '+esc(u.provisoria.motivo)):'', u.provisoria.sei?('SEI: '+esc(u.provisoria.sei)):''].filter(Boolean).map(l=>'<div>'+l+'</div>').join('')
          : '—')+'</td>'
      + '<td><button type="button" class="vg-remover-btn" data-remover="'+escAttr(u.sigla)+'" title="Remover do comparativo">✕</button></td>'
      + '</tr>';
  });
  h += '</tbody>';
  tabela.innerHTML = h;
  tabela.querySelectorAll('[data-remover]').forEach(b=>b.addEventListener('click',()=>{
    estado.selecionadas.delete(b.dataset.remover);
    renderLista();
    renderComparativo();
  }));
}

function renderTudo(){ renderChips(); renderLista(); renderComparativo(); }

/* ============ G) upload: escolher arquivo, prévia, confirmar ============ */

let pacotePendente = null;

function ligarArquivo(btnId, inputId, nomeId, aoEscolher){
  const btn=$(btnId), inp=$(inputId), nome=$(nomeId);
  if(!btn||!inp) return;
  btn.addEventListener('click',()=>inp.click());
  inp.addEventListener('change',()=>{
    const f = inp.files && inp.files[0];
    if(nome) nome.textContent = f ? f.name : 'Nenhum arquivo selecionado';
    if(f && aoEscolher) aoEscolher(f);
  });
}

async function aoEscolherArquivo(file){
  const box = $('vgUploadResultado');
  box.innerHTML = '<p class="vg-upload-nota">Lendo planilha…</p>';
  try{
    const lido = await parseArquivoVagas(file);
    pacotePendente = lido;
    const r = lido.resumo;
    let avisos = '';
    if(r.semNome) avisos += '<li>'+r.semNome+' sigla(s) da aba GERAL sem correspondência de nome na HERC_VPU — aparecerão só pela sigla.</li>';
    if(r.duplicadas) avisos += '<li>'+r.duplicadas+' sigla(s) duplicada(s) na aba GERAL — foi mantida a última ocorrência de cada uma.</li>';
    box.innerHTML = '<div class="vg-upload-resumo">'
      + '<b>'+r.total+'</b> unidades lidas de "'+esc(lido.arquivoNome)+'" · <b>'+r.comProvisoria+'</b> com vaga provisória disponibilizada.'
      + (avisos ? '<div class="notice-banner warn" style="margin-top:10px;"><strong>Pontos de atenção:</strong><ul class="warn-list">'+avisos+'</ul></div>' : '')
      + '</div>'
      + '<button type="button" class="link-btn forte" id="vgConfirmarUpload">Confirmar e substituir para todo mundo</button>';
    $('vgConfirmarUpload').addEventListener('click', confirmarUpload);
  }catch(e){
    pacotePendente = null;
    box.innerHTML = '<div class="notice-banner warn"><strong>Não foi possível ler a planilha:</strong> '+esc(e.message)+'</div>';
  }
}

async function confirmarUpload(){
  if(!pacotePendente) return;
  const box = $('vgUploadResultado');
  box.innerHTML = '<p class="vg-upload-nota">Gravando para todos…</p>';
  const agora = new Date();
  const pacote = {
    unidades: pacotePendente.unidades,
    geradoEm: agora.toISOString(),
    origemArquivo: pacotePendente.arquivoNome
  };
  try{
    await gravarNaNuvem(pacote);
    guardarCopiaLocal(pacote);
    aplicarPacote(pacote);
    box.innerHTML = '<div class="notice-banner ok"><strong>Dados atualizados para todos.</strong> '+pacote.unidades.length+' unidades gravadas às '+agora.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'.</div>';
    avisar('Dados de vagas atualizados para todos.');
  }catch(e){
    box.innerHTML = '<div class="notice-banner warn"><strong>Não foi possível gravar na nuvem:</strong> '+esc(e.message)+'</div>';
  }
}

/* ============ H) ligação com a página ============ */

let temporizadorAviso=null;
function avisar(texto, tipo){
  const caixa = $('vgAviso'); if(!caixa) return;
  caixa.textContent = texto;
  caixa.className = 'fluxo-aviso aparece' + (tipo?' '+tipo:'');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(()=>caixa.classList.remove('aparece'), 3400);
}

function aplicarPacote(pacote){
  (pacote.unidades||[]).forEach(u=>{
    u._blob = normBusca([u.sigla,u.nome,u.secaoJudiciaria,u.entrancia,u.gabSec,u.complemento].join(' '));
  });
  estado.unidades = pacote.unidades||[];
  estado.selecionadas = new Set();
  estado.atualizadoEm = pacote.geradoEm ? new Date(pacote.geradoEm).toLocaleDateString('pt-BR') : '';
  limiteExibido = PASSO_EXIBICAO;
  renderTudo();
}

async function carregar(){
  const status = $('vgStatus');
  try{
    const linha = await lerDaNuvem();
    if(!linha || !linha.data || !linha.data.unidades || !linha.data.unidades.length){
      if(status) status.textContent = 'Ainda não há dados de vagas enviados — use "Atualizar dados", no fim da página, para enviar a primeira planilha.';
      return;
    }
    guardarCopiaLocal(linha.data);
    aplicarPacote(linha.data);
  }catch(erro){
    console.error('Falha ao carregar vagas da nuvem:', erro);
    const local = lerCopiaLocal();
    if(local && local.unidades && local.unidades.length){
      aplicarPacote(local);
      if(status) status.textContent = 'Sem conexão com a nuvem — mostrando a última cópia deste navegador.';
      avisar('Sem conexão com a nuvem — mostrando a última cópia deste navegador.', 'erro');
    } else {
      if(status) status.textContent = 'Sem conexão com a nuvem e nenhuma cópia local disponível.';
      avisar('Não foi possível carregar os dados de vagas.', 'erro');
    }
  }
}

document.addEventListener('DOMContentLoaded', function(){
  if(!$('vgLista')) return;

  $('vgBusca').addEventListener('input', ()=>{ limiteExibido = PASSO_EXIBICAO; renderLista(); });
  $('vgLimpar').addEventListener('click', ()=>{
    $('vgBusca').value = '';
    estado.filtroEntrancia = ''; estado.filtroTipo = '';
    limiteExibido = PASSO_EXIBICAO;
    renderTudo();
  });
  $('vgMostrarMais').addEventListener('click', ()=>{ limiteExibido += PASSO_EXIBICAO; renderLista(); });
  $('vgLimparSelecao').addEventListener('click', ()=>{ estado.selecionadas.clear(); renderLista(); renderComparativo(); });

  $('vgUploadToggle').addEventListener('click', ()=>{
    const corpo = $('vgUploadCorpo');
    corpo.style.display = corpo.style.display==='none' ? '' : 'none';
  });
  ligarArquivo('vgArquivoBtn','vgArquivoInput','vgArquivoNome', aoEscolherArquivo);

  carregar();
});

/* Exposto para depuração e testes automatizados. */
window.VagasConsulta = {
  estado, parseArquivoVagas, montarUnidades, localizarColunasGeral, mapaNomesDaHerc,
  nomeUnidadePorExtenso, formatarPrazo, buscarUnidades, aplicarPacote, carregar,
  lerDaNuvem, gravarNaNuvem, CHAVE_LOCAL
};
})();
