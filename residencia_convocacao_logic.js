/* Gerador do Edital de Convocação para Entrevista — Divisão de Residência (TJPR)
   100% client-side. Depende de vendor/pdf.min.js (leitura de PDF) e core.js.

   Estrutura do arquivo:
     A) utilidades de texto/número
     B) leitura de PDF e agrupamento por linha (coordenadas) — igual à Classificação Final
     C) leitor da Lista de dados dos inscritos — igual à Classificação Final
     D) modalidade da inscrição -> reserva de vaga
     E) datas e horários: máscara, calendário, extenso
     F) estado da ferramenta
     G) passo 1 — trazer a lista e montar a conferência
     H) passo 2 — selecionar candidatos (conferência com checkbox e busca)
     I) passo 3 — tabelas de convocação (rascunho editável, por cota)
     J) passo 4 — dados do edital
     K) passo 5 — geração dos blocos para o Athos
     L) rascunho (exportar/importar) e ligação com a página
*/

(function(){
'use strict';

/* ========================= A) utilidades ========================= */

function $(id){ return document.getElementById(id); }
const esc = TJPRCore.escapeHtml;
function escAttr(s){ return esc(s==null?'':s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
// Garante ponto final ao imprimir (Data da entrevista, Local, Outras
// informações) — se o usuário já tiver colocado, não duplica.
function comPontoFinal(s){
  s = String(s==null?'':s).trim();
  return (!s || /\.$/.test(s)) ? s : s+'.';
}

function semAcento(s){ return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function chaveNome(s){ return semAcento(s).toUpperCase().replace(/[^A-Z ]/g,' ').replace(/\s+/g,' ').trim(); }
function limpar(v){ return String(v==null?'':v).trim().replace(/\s+/g,' '); }
function soDigitos(v){ return String(v==null?'':v).replace(/\D/g,''); }

const RE_INTEIRO = /^\d{1,3}$/;
const RE_DATA    = /^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})$/;

// "8.5" -> 8.5 | "8,5" -> 8.5 | "8" -> 8 | "" -> null
//
// Sem vírgula NEM ponto, com 2 ou mais dígitos: os DOIS ÚLTIMOS dígitos
// viram a parte decimal, o resto vira a parte inteira — "85" quer dizer
// 8,50; "770" quer dizer 7,70; "1000" quer dizer 10,00. Com só 2 dígitos ao
// todo, a parte inteira ficaria vazia ("85" -> "" + "85"); nesse caso ela
// toma emprestado o primeiro dígito da dupla, sobrando um só para a casa
// decimal ("85" -> "8" + "5", preenchido para "8,50"). Um único dígito
// ("8") não é ambíguo e continua interpretado ao pé da letra. Exceção:
// "10" sozinho é sempre a nota máxima (10,00) — não a mesma regra do
// empréstimo, que o transformaria em 1,00.
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
  const s = bruto.replace(',','.');
  const n = Number(s);
  return isFinite(n) ? n : null;
}
// 8.5 -> "8,50" (sempre duas casas, sempre vírgula)
function fmtNota(v){
  if(v==null || v==='') return '';
  const n = (typeof v==='number') ? v : paraNumero(v);
  if(n==null) return String(v);
  return n.toFixed(2).replace('.',',');
}

// "28/07/1998" ou "1998-07-28" (os dois formatos que a Lista de dados traz,
// ver RE_DATA) -> Date | null.
function parseDataNascimento(txt){
  const s = String(txt==null?'':txt).trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if(m){
    const d = new Date(Number(m[3]), Number(m[2])-1, Number(m[1]));
    return isNaN(d) ? null : d;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if(m){
    const d = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
    return isNaN(d) ? null : d;
  }
  return null;
}
// Idade em anos completos numa data de referência (padrão: hoje) — usada só
// para exibir na tela de conferência, nunca impressa. O desempate por idade
// (ver reordenarPorNotaEIdade) compara as DATAS diretamente, não esse
// número, então nunca depende de qual dia o usuário abriu a ferramenta.
function calcularIdade(dataNascimento, dataRef){
  const nasc = (dataNascimento instanceof Date) ? dataNascimento : parseDataNascimento(dataNascimento);
  if(!nasc) return null;
  const ref = dataRef || new Date();
  let idade = ref.getFullYear() - nasc.getFullYear();
  const aniversarioAinda = (ref.getMonth() < nasc.getMonth())
    || (ref.getMonth()===nasc.getMonth() && ref.getDate() < nasc.getDate());
  if(aniversarioAinda) idade--;
  return idade;
}

// Idade completa em anos + dias decorridos desde o último aniversário (ex.: 25 anos e 311 dias)
function calcularIdadeDetalhada(dataNascimento, dataRef){
  const nasc = (dataNascimento instanceof Date) ? dataNascimento : parseDataNascimento(dataNascimento);
  if(!nasc) return null;
  const ref = dataRef || new Date();
  const anos = calcularIdade(nasc, ref);
  if(anos==null) return null;
  const ultimoAniversario = new Date(nasc.getFullYear()+anos, nasc.getMonth(), nasc.getDate());
  const msPorDia = 86400000;
  const dias = Math.round((Date.UTC(ref.getFullYear(),ref.getMonth(),ref.getDate()) - Date.UTC(ultimoAniversario.getFullYear(),ultimoAniversario.getMonth(),ultimoAniversario.getDate())) / msPorDia);
  return { anos, dias };
}

// Formata o resultado de calcularIdadeDetalhada como texto ("25 anos e 311 dias")
function fmtIdadeDetalhada(dataNascimento, dataRef){
  const id = calcularIdadeDetalhada(dataNascimento, dataRef);
  if(!id) return '—';
  const anosTxt = id.anos+' ano'+(id.anos===1?'':'s');
  const diasTxt = id.dias+' dia'+(id.dias===1?'':'s');
  return anosTxt+' e '+diasTxt;
}

// rolagem suave tolerante a navegadores antigos
function rolarAte(el){
  if(el && typeof el.scrollIntoView==='function'){
    try{ el.scrollIntoView({behavior:'smooth', block:'start'}); }catch(e){ el.scrollIntoView(); }
  }
}

/* ================ B) leitura de PDF e linhas por coordenada ================
   Idêntico à Classificação Final — cada ferramenta da Residência mantém sua
   própria cópia (nenhum módulo é compartilhado entre elas). */

async function pdfParaPaginas(file){
  if(typeof pdfjsLib==='undefined') throw new Error('biblioteca de PDF não carregada (vendor/pdf.min.js)');
  try{ pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.js'; }catch(e){}
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data:buf}).promise;
  const paginas = [];
  for(let p=1;p<=pdf.numPages;p++){
    const pg = await pdf.getPage(p);
    const tc = await pg.getTextContent();
    const alt = pg.getViewport({scale:1}).height;
    const itens = [];
    tc.items.forEach(it=>{
      const s = (it.str||'').trim();
      if(!s) return;
      const x = it.transform[4], y = it.transform[5];
      const larguraTotal = it.width || s.length*4;
      const partes = s.split(/\s+/);
      partes.forEach((tok,k)=>{
        if(!tok) return;
        const antes = partes.slice(0,k).join(' ').length;
        const desl = larguraTotal * (antes / Math.max(1,s.length));
        const larg = larguraTotal * (tok.length / Math.max(1,s.length));
        itens.push({ str:tok, x:x+desl, y:y, w:Math.max(2,larg) });
      });
    });
    paginas.push({ num:p, alt:alt, itens:itens });
  }
  return paginas;
}

function agruparLinhas(itens, tolY){
  tolY = tolY || 3;
  const ord = itens.slice().sort((a,b)=> b.y-a.y || a.x-b.x);
  const linhas = [];
  ord.forEach(it=>{
    const u = linhas[linhas.length-1];
    if(u && Math.abs(u.y-it.y)<=tolY) u.itens.push(it);
    else linhas.push({ y:it.y, itens:[it] });
  });
  linhas.forEach(l=>{
    l.itens.sort((a,b)=>a.x-b.x);
    l.y = l.itens.reduce((s,i)=>s+i.y,0)/l.itens.length;
    l.txt = l.itens.map(i=>i.str).join(' ');
  });
  return linhas;
}

function linhasDasPaginas(paginas, tolY){
  const out = [];
  paginas.forEach((pg,i)=>{
    agruparLinhas(pg.itens, tolY).forEach(l=>{
      out.push({ pag:i, y:l.y, yGlobal: -(i*1e6) + l.y, itens:l.itens, txt:l.txt });
    });
  });
  return out;
}

/* ============ C) leitor da Lista de dados dos inscritos ============
   Também idêntico à Classificação Final. Só o nome e a modalidade
   interessam aqui — CPF, celular e e-mail são lidos e mantidos no quadro
   de conferência, mas esta ferramenta não os usa depois. */

const RE_TELEFONE_FIM = /(\(?\d{2}\)?[\s.\-]*\d{3,5}[\s.\-]?\d{3,5})\s*$/;

function extrairTelefone(trecho){
  const m = RE_TELEFONE_FIM.exec(limpar(trecho));
  return m ? limpar(m[1]) : '';
}

function registroDaLinhaLista(toks){
  const idxData = toks.findIndex(t=>RE_DATA.test(t));
  if(idxData < 1) return null;
  let idxCPF = -1;
  for(let i=0;i<idxData;i++){ if(/^\d{9,11}$/.test(toks[i]) || /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(toks[i])){ idxCPF=i; break; } }
  if(idxCPF < 0) return null;
  const temNumero = RE_INTEIRO.test(toks[0]) || /^\d{1,4}$/.test(toks[0]);
  const ini = (temNumero && idxCPF>0) ? 1 : 0;
  const modalidade = toks.slice(ini, idxCPF).join(' ');
  const nome = toks.slice(idxCPF+1, idxData).join(' ');
  let idxEmail = -1;
  for(let i=idxData+1;i<toks.length;i++){ if(toks[i].indexOf('@')>=0){ idxEmail=i; break; } }
  const email = idxEmail>=0 ? toks[idxEmail] : '';
  const meio = toks.slice(idxData+1, idxEmail>=0 ? idxEmail : toks.length).join(' ');
  return {
    num: temNumero ? toks[0] : '',
    modalidade: limpar(modalidade),
    cpf: soDigitos(toks[idxCPF]),
    nome: limpar(nome),
    // a Data de Nascimento é o próprio marcador usado pra achar onde o Nome
    // termina (idxData) — já estava sendo localizada, só não era guardada
    nascimento: toks[idxData],
    celular: extrairTelefone(meio),
    email: limpar(email)
  };
}

function reconhecerLista(linhas){
  const registros = [];
  const ignoradas = [];
  let ultimo = null;

  linhas.forEach(l=>{
    const toks = l.itens.map(i=>i.str);
    const reg = registroDaLinhaLista(toks);
    if(reg){
      const itData = l.itens.find(i=>RE_DATA.test(i.str));
      const itensNome = l.itens.filter(i => itData ? (i.x < itData.x) : true)
                              .filter(i => /[A-Za-zÀ-ÿ]{2,}/.test(i.str));
      registros.push(reg);
      ultimo = {
        reg,
        xData: itData ? itData.x : Infinity,
        xNomeMin: itensNome.length ? Math.min.apply(null, itensNome.map(i=>i.x)) : 0,
        y: l.yGlobal
      };
      return;
    }
    if(ultimo && Math.abs(ultimo.y - l.yGlobal) < 40){
      const naFaixa = l.itens.filter(i => i.x >= ultimo.xNomeMin-4 && (i.x + i.w) < ultimo.xData - 4);
      if(naFaixa.length && naFaixa.length === l.itens.length){
        ultimo.reg.nome = limpar(ultimo.reg.nome + ' ' + naFaixa.map(i=>i.str).join(' '));
        return;
      }
    }
    if(/[A-Za-zÀ-ÿ]/.test(l.txt)) ignoradas.push(l.txt);
  });

  return { registros, ignoradas };
}

function listaParaTexto(registros){
  return registros.map((r,i)=>
    [ r.num || (i+1), r.modalidade, r.cpf, r.nome, r.nascimento||'', r.celular, r.email ].join('\t')
  ).join('\n');
}

function lerQuadroLista(texto){
  const registros = [];
  const naoReconhecidas = [];
  String(texto||'').replace(/\r\n?/g,'\n').split('\n').forEach(bruta=>{
    const linha = bruta.trim();
    if(!linha) return;
    if(/^N[ºo°]?\s+Modalidade/i.test(linha)) return;
    const porTab = linha.split('\t').map(s=>s.trim());
    if(porTab.length>=5){
      // campo 5 (índice 4) é a Data de Nascimento quando parece uma data;
      // senão, é um quadro no formato antigo (sem essa coluna) — aceito pra
      // não quebrar rascunho ou texto colado de antes desta mudança.
      if(RE_DATA.test(porTab[4]||'')){
        registros.push({
          num: porTab[0], modalidade: porTab[1], cpf: soDigitos(porTab[2]),
          nome: limpar(porTab[3]), nascimento: porTab[4],
          celular: limpar(porTab[5]||''), email: limpar(porTab[6]||'')
        });
      } else {
        registros.push({
          num: porTab[0], modalidade: porTab[1], cpf: soDigitos(porTab[2]),
          nome: limpar(porTab[3]), nascimento: '',
          celular: limpar(porTab[4]||''), email: limpar(porTab[5]||'')
        });
      }
      return;
    }
    const reg = registroDaLinhaLista(linha.split(/\s+/));
    if(reg){ registros.push(reg); return; }
    naoReconhecidas.push(linha);
  });
  return { registros, naoReconhecidas };
}

/* ============ D) modalidade da inscrição -> reserva de vaga ============
   Mesmo mapeamento da Classificação Final. A cota VS só vale para editais de
   Ensino Médio; na Residência ela reverte para concorrência Geral. */

const MAPA_RESERVA = [
  // PRET[OA]/PARD[OA] cobre as duas concordâncias de gênero — a modalidade
  // normalmente vem como "Pessoa Preta ou Parda" (feminino), que
  // "PRETO|PARDO" sozinho não reconhece.
  { flag:'ppp', re:/(PRET[OA]|PARD[OA]|NEGR|AFRO|ETNICO)/ },
  { flag:'pcd', re:/(DEFICI|PCD|PNE|PORTADOR DE NECESSIDADE)/ },
  { flag:'ind', re:/(INDIGEN)/ }
];
const RE_VS = /(VULNERAB|HIPOSSUF|BAIXA RENDA|CADUNICO|CAD UNICO|SOCIOECONOMIC|ESCOLA PUBLICA)/;

function reservaDaModalidade(texto){
  const flags = { ppp:false, pcd:false, ind:false };
  const bruto = limpar(texto);
  if(bruto==='' || bruto==='-') return { flags, vs:false, desconhecida:null };
  const chave = semAcento(bruto).toUpperCase();
  if(/AMPLA|GERAL/.test(chave)) return { flags, vs:false, desconhecida:null };
  if(RE_VS.test(chave)) return { flags, vs:true, desconhecida:null };
  let achou = false;
  MAPA_RESERVA.forEach(m=>{ if(m.re.test(chave)){ flags[m.flag]=true; achou=true; } });
  return { flags, vs:false, desconhecida: achou ? null : bruto };
}

function reservaTexto(item){
  const rot = [];
  if(item.ppp) rot.push('PRETA/PARDA');
  if(item.pcd) rot.push('PcD');
  if(item.ind) rot.push('INDÍGENA');
  return rot.length ? rot.join(' + ') : '—';
}

/* ==================== E) datas e horários ==================== */

const MESES_EXTENSO=['janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro'];

function formatarDataExtenso(d){ return d.getDate()+' de '+MESES_EXTENSO[d.getMonth()]+' de '+d.getFullYear(); }
function formatarDataBarra(d){ return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); }
function lerDataDoTexto(txt, modo){
  const s = String(txt||'').trim();
  if(!s) return null;
  if(modo==='slash'){
    const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if(!m) return null;
    const d=new Date(Number(m[3]), Number(m[2])-1, Number(m[1]));
    return isNaN(d) ? null : d;
  }
  const m=/^(\d{1,2})\s+de\s+([a-zçãéô]+)\s+de\s+(\d{4})$/i.exec(semAcento(s).toLowerCase());
  if(!m) return null;
  const mi=MESES_EXTENSO.findIndex(mes=> semAcento(mes)===m[2]);
  if(mi<0) return null;
  return new Date(Number(m[3]), mi, Number(m[1]));
}

function ativarMascaraData(el){
  if(!el) return;
  el.addEventListener('input', ()=>{
    const d = el.value.replace(/\D/g,'').slice(0,8);
    let out = d.slice(0,2);
    if(d.length>2) out += '/'+d.slice(2,4);
    if(d.length>4) out += '/'+d.slice(4,8);
    el.value = out;
  });
}

// Botão de calendário (📅) ao lado do campo de data. `height:34px` explícito
// no wrap e no campo — sem isso, a altura do conjunto campo+botão depende
// de arredondamento de padding/borda que às vezes fica 1-2px menor que os
// campos vizinhos sem botão, desalinhando a linha inteira da grade.
function ativarBotaoCalendario(inputEl, modo){
  if(!inputEl) return;
  const wrap = document.createElement('span');
  wrap.className = 'campo-data-wrap';
  wrap.style.cssText = 'display:flex;align-items:stretch;gap:6px;width:100%;height:34px;';
  inputEl.parentNode.insertBefore(wrap, inputEl);
  inputEl.style.flex = '1 1 auto';
  inputEl.style.width = 'auto';
  inputEl.style.minWidth = '0';
  inputEl.style.height = '34px';
  inputEl.style.boxSizing = 'border-box';
  wrap.appendChild(inputEl);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'date-pick-btn';
  btn.style.height = '34px';
  btn.title = 'Abrir calendário';
  btn.setAttribute('aria-label','Abrir calendário');
  btn.textContent = '📅';
  wrap.appendChild(btn);

  const nativo = document.createElement('input');
  nativo.type = 'date';
  nativo.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
  wrap.appendChild(nativo);

  btn.addEventListener('click', ()=>{
    const d = lerDataDoTexto(inputEl.value, modo);
    nativo.value = d ? (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')) : '';
    if(nativo.showPicker) nativo.showPicker(); else nativo.click();
  });
  nativo.addEventListener('change', ()=>{
    if(!nativo.value) return;
    const [y,mo,dd] = nativo.value.split('-').map(Number);
    const d = new Date(y, mo-1, dd);
    inputEl.value = modo==='extenso' ? formatarDataExtenso(d) : formatarDataBarra(d);
    inputEl.dispatchEvent(new Event('change', {bubbles:true}));
  });
}

const RE_HORA = /^(\d{1,2})\s*[hH:]\s*(\d{1,2})\s*(?:m(?:in)?\.?)?$/i;
// Aceita "14" (só hora, minutos zerados), "1330"/"1356" (4 dígitos, os 2
// últimos são o minuto), "13:30"/"13h30"/"13h30min" (com separador). Sempre
// devolve {h,m} ou null — nunca corrige silenciosamente um valor inválido.
function interpretarHoraDigitada(txt){
  const s = String(txt||'').trim();
  if(!s) return null;
  let m = RE_HORA.exec(s);
  if(m){
    const h=Number(m[1]), mi=Number(m[2]);
    return (h<=23 && mi<=59) ? {h:h, m:mi} : null;
  }
  m = /^(\d{3,4})$/.exec(s);
  if(m){
    const d=m[1], mi=Number(d.slice(-2)), h=Number(d.slice(0,-2));
    if(h<=23 && mi<=59) return {h:h, m:mi};
  }
  m = /^(\d{1,2})$/.exec(s);
  if(m){
    const h=Number(m[1]);
    if(h<=23) return {h:h, m:0};
  }
  return null;
}
// {h:13,m:30} -> "13h30min" — padrão usado em toda a Residência.
function fmtHora(hora){
  if(!hora) return '';
  return String(hora.h).padStart(2,'0')+'h'+String(hora.m).padStart(2,'0')+'min';
}

/* ============ F) estado da ferramenta ============ */

const GRUPOS_CV = [
  { k:'ac',  rot:'AMPLA CONCORRÊNCIA' },
  { k:'ppp', rot:'PESSOA PRETA OU PARDA' },
  { k:'pcd', rot:'PcD - PESSOA COM DEFICIÊNCIA' },
  { k:'ind', rot:'INDÍGENA' }
];

const estado = {
  inscritos: [],      // {id, nome, modalidade, ppp, pcd, ind, marcado}
  cands: [],           // {id, nome, nota, hora, ac, ppp, pcd, ind} — cadastro único
  cols: { hora:false },
  editando: false,
  trabalho: [],
  seq: 1,
  doc: {
    nConv:'', nEdital:'EDITAL N° $$(numerar automaticamente)%%', sei:'',
    data:'', horarioGeral:'', local:'', telefone:'', extra:'',
    cidade:'Curitiba', dataAss:'', assinante:'', cargo:'', unidade:''
  }
};

function candidatosDoGrupo(lista, grupoK){ return lista.filter(c=>c[grupoK]); }
function idxTrabalho(id){
  for(let i=0;i<estado.trabalho.length;i++){ if(estado.trabalho[i].id===id) return i; }
  return -1;
}

/* ============================================================================
   A partir daqui, tudo depende do DOM da página (residencia_convocacao.html).
   Em Node (testes automatizados) o bloco inteiro é ignorado — só as funções
   puras acima ficam disponíveis via module.exports, no fim do arquivo.
   ========================================================================== */

if(typeof document !== 'undefined' && document.getElementById('cvBtnProcessar')){

  const cvArquivo=$('cvArquivo'), cvBtnArquivo=$('cvBtnArquivo'), cvNomeArquivo=$('cvNomeArquivo'),
        cvStatus=$('cvStatus'), cvTexto=$('cvTexto'), cvBtnLimpar=$('cvBtnLimpar'), cvBtnProcessar=$('cvBtnProcessar');
  const cvPasso2=$('cvPasso2'), cvChecklist=$('cvChecklist'), cvResumoSelecao=$('cvResumoSelecao'),
        cvBuscaNome=$('cvBuscaNome'),
        cvBtnMarcarTodos=$('cvBtnMarcarTodos'), cvBtnDesmarcarTodos=$('cvBtnDesmarcarTodos'),
        cvBtnGerarTabelas=$('cvBtnGerarTabelas');
  const cvPasso3=$('cvPasso3'), cvTabelas=$('cvTabelas'), cvBtnEditarTabelas=$('cvBtnEditarTabelas'),
        cvStatusSalvo=$('cvStatusSalvo'),
        cvColHora=$('cvColHora'), cvPainelHorarios=$('cvPainelHorarios'),
        cvHoraInicial=$('cvHoraInicial'), cvHoraIntervalo=$('cvHoraIntervalo'), cvBtnHorarios=$('cvBtnHorarios');
  const cvSaidaBox=$('cvSaidaBox'), cvMsgSaida=$('cvMsgSaida');

  function status(el, html, tipo){
    el.className = 'notice-banner' + (tipo ? ' '+tipo : '');
    el.innerHTML = html;
    el.style.display = 'block';
  }

  function lista(itens, render, limite){
    limite = limite || 10;
    return '<ul class="warn-list">'
      + itens.slice(0,limite).map(render).join('')
      + (itens.length>limite ? '<li>… e mais '+(itens.length-limite)+'</li>' : '')
      + '</ul>';
  }

  /* ---------------- passo 1 — trazer a lista ---------------- */

  function conferirPasso1(){ cvBtnProcessar.disabled = !cvTexto.value.trim(); }

  cvBtnArquivo.addEventListener('click', ()=> cvArquivo.click());
  cvTexto.addEventListener('input', conferirPasso1);
  cvBtnLimpar.addEventListener('click', ()=>{
    cvTexto.value=''; cvStatus.style.display='none'; cvArquivo.value=''; cvNomeArquivo.textContent='nenhum arquivo escolhido';
    conferirPasso1();
  });

  cvArquivo.addEventListener('change', async ()=>{
    const f = cvArquivo.files && cvArquivo.files[0];
    cvNomeArquivo.textContent = f ? f.name : 'nenhum arquivo escolhido';
    if(!f) return;
    status(cvStatus, 'Lendo o PDF da lista de dados…', '');
    try{
      const paginas = await pdfParaPaginas(f);
      const totalItens = paginas.reduce((s,p)=>s+p.itens.length,0);
      if(totalItens < 10){
        status(cvStatus, '<strong>Este PDF não tem texto para extrair.</strong> Cole a lista no quadro abaixo.', 'warn');
        return;
      }
      const r = reconhecerLista(linhasDasPaginas(paginas, 3));
      if(!r.registros.length){
        status(cvStatus, '<strong>Nenhum inscrito reconhecido neste PDF.</strong> Confira se é a Lista de dados, ou cole o conteúdo no quadro abaixo.', 'warn');
        return;
      }
      cvTexto.value = listaParaTexto(r.registros);
      let msg = '<strong>'+r.registros.length+' inscrito(s)</strong> reconhecido(s). Confira o quadro abaixo antes de processar.';
      status(cvStatus, msg, 'ok');
      conferirPasso1();
    }catch(e){
      status(cvStatus, 'Não foi possível ler o PDF ('+esc(e.message||e)+'). Cole a lista no quadro abaixo.', 'warn');
    }
  });

  cvBtnProcessar.addEventListener('click', ()=>{
    const li = lerQuadroLista(cvTexto.value);
    if(!li.registros.length){ alert('Nenhum inscrito reconhecido no quadro. Cada linha deve trazer Nº, Modalidade, CPF, Nome, Celular e E-mail (separados por tabulação).'); return; }

    const desconhecidas = [], vsList = [], duplicados = [];
    const vistos = new Set();
    estado.inscritos = li.registros.map(r=>{
      const ch = chaveNome(r.nome);
      if(ch){ if(vistos.has(ch)) duplicados.push(r.nome); else vistos.add(ch); }
      const conv = reservaDaModalidade(r.modalidade);
      if(conv.desconhecida) desconhecidas.push({ nome:r.nome, valor:conv.desconhecida });
      if(conv.vs) vsList.push(r.nome);
      // desmarcado por padrão: o usuário escolhe ativamente quem vai pra
      // convocação, em vez de precisar excluir quem não participa
      return { id: estado.seq++, nome:r.nome, modalidade:r.modalidade, nascimento:r.nascimento||'',
               ppp:conv.flags.ppp, pcd:conv.flags.pcd, ind:conv.flags.ind, marcado:false };
    });

    let msg = '<strong>'+estado.inscritos.length+' inscrito(s)</strong> prontos para seleção no Passo 2.';
    if(li.naoReconhecidas.length){
      msg += '<br><strong style="color:var(--stamp-red)">'+li.naoReconhecidas.length+' linha(s) não reconhecida(s)</strong> e ignorada(s):';
      msg += lista(li.naoReconhecidas, n=>'<li>'+esc(n)+'</li>', 8);
    }
    if(vsList.length){
      msg += '<br><strong style="color:var(--stamp-red)">'+vsList.length+' candidato(s) com Vulnerabilidade Social</strong> — essa cota vale só para Ensino Médio; na Residência a vaga reverte para Geral, então não foi marcada nenhuma reserva:';
      msg += lista(vsList, n=>'<li>'+esc(n)+'</li>');
    }
    if(desconhecidas.length){
      msg += '<br><strong style="color:var(--stamp-red)">'+desconhecidas.length+' modalidade(s) não reconhecida(s)</strong> — tratada(s) como Ampla Concorrência:';
      msg += lista(desconhecidas, x=>'<li>'+esc(x.nome)+' — "'+esc(x.valor)+'"</li>');
    }
    if(duplicados.length){
      msg += '<br>Atenção: '+duplicados.length+' nome(s) repetido(s) na lista — confira se não é a mesma pessoa duas vezes.';
    }
    const semNasc = estado.inscritos.filter(i=>!i.nascimento).map(i=>i.nome);
    if(semNasc.length){
      msg += '<br><strong style="color:var(--stamp-red)">'+semNasc.length+' inscrito(s) sem data de nascimento reconhecida</strong> — sem idade pra desempate no Passo 3:';
      msg += lista(semNasc, n=>'<li>'+esc(n)+'</li>');
    }
    status(cvStatus, msg, (li.naoReconhecidas.length||vsList.length||desconhecidas.length||semNasc.length) ? 'warn' : 'ok');

    renderChecklist();
    cvPasso2.style.display = '';
    rolarAte(cvPasso2);
  });

  /* ---------------- passo 2 — selecionar candidatos ---------------- */

  function inscritosFiltrados(){
    const termo = chaveNome(cvBuscaNome.value);
    if(!termo) return estado.inscritos;
    return estado.inscritos.filter(it=> chaveNome(it.nome).indexOf(termo) >= 0);
  }

  function renderChecklist(){
    if(!estado.inscritos.length){
      cvChecklist.innerHTML = '<p class="empty-hint">Nenhum inscrito. Processe a lista no Passo 1.</p>';
      atualizarResumoSelecao();
      return;
    }
    const visiveis = inscritosFiltrados();
    let h = '<div class="table-scroll"><table><thead><tr>'
      + '<th style="width:34px;"></th><th>Nome</th><th style="width:180px;">Reserva de vaga</th>'
      + '</tr></thead><tbody>';
    if(!visiveis.length){
      h += '<tr><td colspan="3" class="empty-hint">Nenhum nome bate com o filtro.</td></tr>';
    }
    visiveis.forEach(it=>{
      h += '<tr><td style="text-align:center;"><input type="checkbox" class="cvChkInsc" data-id="'+it.id+'"'+(it.marcado?' checked':'')+'></td>'
        + '<td>'+esc(it.nome)+'</td><td>'+esc(reservaTexto(it))+'</td></tr>';
    });
    h += '</tbody></table></div>';
    cvChecklist.innerHTML = h;

    Array.prototype.forEach.call(cvChecklist.querySelectorAll('.cvChkInsc'), function(chk){
      chk.addEventListener('change', function(){
        const it = estado.inscritos.find(x=>x.id===Number(chk.dataset.id));
        if(it){ it.marcado = chk.checked; atualizarResumoSelecao(); }
      });
    });
    atualizarResumoSelecao();
  }

  function atualizarResumoSelecao(){
    const marcados = estado.inscritos.filter(i=>i.marcado);
    const visiveis = inscritosFiltrados();
    cvResumoSelecao.textContent = marcados.length + ' de ' + estado.inscritos.length + ' candidato(s) selecionado(s)'
      + (visiveis.length!==estado.inscritos.length ? ' — ' + visiveis.length + ' visível(is) com o filtro atual' : '') + '.';
  }

  cvBuscaNome.addEventListener('input', renderChecklist);
  cvBtnMarcarTodos.addEventListener('click', ()=>{ inscritosFiltrados().forEach(i=>i.marcado=true); renderChecklist(); });
  cvBtnDesmarcarTodos.addEventListener('click', ()=>{ inscritosFiltrados().forEach(i=>i.marcado=false); renderChecklist(); });

  cvBtnGerarTabelas.addEventListener('click', ()=>{
    const marcados = estado.inscritos.filter(i=>i.marcado);
    if(!marcados.length){ alert('Marque ao menos um candidato para gerar as tabelas.'); return; }
    if(estado.cands.length && !confirm('Isso substitui as tabelas de convocação já geradas — as notas já digitadas serão perdidas. Continuar?')) return;

    // maiúsculas já na montagem — não só na impressão do edital
    estado.cands = marcados.map(it=>({
      id: estado.seq++, nome: it.nome.toUpperCase(), nascimento: it.nascimento||'',
      nota:null, hora:null,
      ac:true, ppp:it.ppp, pcd:it.pcd, ind:it.ind
    }));
    estado.editando = false;
    estado.trabalho = [];
    renderTabelas();
    cvPasso3.style.display = '';
    $('cvPasso4').style.display = '';
    rolarAte(cvPasso3);
  });

  /* ---------------- passo 3 — tabelas de convocação (por cota) ----------------

     Cadastro único por candidato: o mesmo objeto aparece na lista filtrada de
     cada cota em que ele concorre, então corrigir a nota ou o horário em
     qualquer tabela atualiza a mesma pessoa em todas. A ORDEM também é uma
     só (a posição do candidato no array `trabalho`); cada tabela é só o
     recorte filtrado daquela ordem.

     Excluir dentro da tabela AMPLA CONCORRÊNCIA remove o candidato por
     inteiro (todo mundo tem que estar na Ampla); excluir nas demais tabelas
     só desmarca aquela cota específica. */

  function tabelaTela(grupo, editando){
    const base = editando ? estado.trabalho : estado.cands;
    const lista_ = candidatosDoGrupo(base, grupo.k);
    let h = '<div class="cf-grupo-bloco"><p class="cf-grupo-tit">'+esc(grupo.rot)
      + ' <span class="cf-grupo-qtd">('+lista_.length+')</span></p>';
    if(!lista_.length){
      h += '<p class="empty-hint">nenhum candidato aqui'+(editando?' — use “+ Adicionar linha” para incluir um':'')+'</p></div>';
      return h;
    }
    const mostrarHora = estado.cols.hora;
    h += '<div class="table-scroll" style="max-height:none;"><table class="cv-grade-table" style="white-space:normal;">';
    h += '<thead><tr>'+(editando?'<th style="width:30px;"></th>':'')
      + '<th style="width:62px;white-space:nowrap;">ORDEM</th><th>NOME</th>'
      + '<th style="width:132px;white-space:nowrap;" title="Só para conferência — não vai para o edital impresso">IDADE</th>'
      + '<th style="width:80px;">NOTA</th>'
      + (mostrarHora?'<th style="width:96px;">HORÁRIO</th>':'')
      + (editando?'<th style="width:44px;">Ações</th>':'')+'</tr></thead><tbody>';
    lista_.forEach((c,i)=>{
      const idadeTxt = fmtIdadeDetalhada(c.nascimento);
      h += '<tr data-id="'+c.id+'" data-grupo="'+grupo.k+'" draggable="false">';
      if(editando){
        h += '<td style="text-align:center;"><button type="button" class="drag-handle" data-id="'+c.id+'" data-grupo="'+grupo.k+'" tabindex="0"'
          + ' title="Arrastar para reordenar (ou Alt+↑ / Alt+↓)" aria-label="Remanejar '+escAttr(c.nome||'linha em branco')+'">⠿</button></td>';
      }
      h += '<td style="text-align:center;color:var(--ink-soft);">'+(i+1)+'</td>';
      if(editando){
        h += '<td><input class="cvIn" data-f="nome" value="'+escAttr(c.nome)+'" style="width:100%;min-width:190px;padding:5px;border:1px solid var(--line);font-size:12.5px;"></td>';
        h += '<td style="text-align:center;color:var(--ink-soft);white-space:nowrap;">'+esc(idadeTxt)+'</td>';
        h += '<td><input class="cvIn" data-f="nota" value="'+escAttr(fmtNota(c.nota))+'" style="width:100%;padding:5px;border:1px solid var(--line);text-align:center;font-size:12.5px;"></td>';
        if(mostrarHora) h += '<td><input class="cvIn" data-f="hora" value="'+escAttr(c.hora?fmtHora(c.hora):'')+'" placeholder="—" style="width:100%;padding:5px;border:1px solid var(--line);text-align:center;font-size:12.5px;"></td>';
        h += '<td style="text-align:center;"><button type="button" class="row-del-btn" data-id="'+c.id+'" data-grupo="'+grupo.k+'" tabindex="-1"'
          + ' title="'+(grupo.k==='ac' ? 'Excluir este candidato de todas as tabelas' : 'Tirar este candidato desta tabela')+'">✕</button></td>';
      } else {
        h += '<td>'+esc(c.nome)+'</td>'
          + '<td style="text-align:center;color:var(--ink-soft);white-space:nowrap;">'+esc(idadeTxt)+'</td>'
          + '<td style="text-align:center;">'+esc(fmtNota(c.nota))+'</td>';
        if(mostrarHora) h += '<td style="text-align:center;">'+esc(c.hora?fmtHora(c.hora):'')+'</td>';
      }
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    if(editando) h += '<div class="download-row" style="margin:8px 0 0;"><button type="button" class="link-btn cvBtnAdd" data-grupo="'+grupo.k+'">+ Adicionar linha</button></div>';
    h += '</div>';
    return h;
  }

  function renderTabelas(){
    let h = '';
    if(estado.editando){
      h += '<div class="notice-banner" style="margin-left:0;"><strong>Modo de edição.</strong> '
        + 'Arraste a linha pela alça <strong>⠿</strong> — ou, com a alça em foco, use <strong>Alt+↑</strong> e <strong>Alt+↓</strong> — para mudar a ordem; '
        + 'a mesma pessoa muda de posição em todas as tabelas em que aparece. '
        + 'Os campos brancos podem ser corrigidos — a nota e o horário são a mesma pessoa em toda tabela. '
        + 'A coluna <strong>IDADE</strong> é só para conferência (calculada a partir da data de nascimento lida no Passo 1) — não vai para o edital impresso. '
        + '<strong>✕</strong> na tabela <strong>AMPLA CONCORRÊNCIA</strong> exclui o candidato por completo; nas demais, só tira daquela cota. '
        + '<strong>Nada é salvo até clicar em "Salvar alterações"</strong> — o botão "Gerar edital" avisa e não deixa prosseguir se as tabelas ainda estiverem em edição.</div>';
      h += '<div class="download-row" style="margin:14px 0 22px;">'
        + '<button type="button" class="link-btn" id="cvBtnSalvarTabelas" style="background:var(--teal);color:var(--white);">Salvar alterações</button>'
        + '<button type="button" class="link-btn" id="cvBtnCancelarTabelas">Cancelar</button>'
        + '<button type="button" class="link-btn" id="cvBtnReordenarNota">Reordenar por nota e idade</button>'
        + '</div>';
      h += '<div id="cvAvisosTabelas"></div>';
    }
    GRUPOS_CV.forEach(g=>{ h += tabelaTela(g, estado.editando); });
    cvTabelas.innerHTML = h;
    if(estado.editando){ ligarEventosEdicaoTabelas(); atualizarAvisosTabelas(); }
    cvBtnEditarTabelas.style.display = estado.editando ? 'none' : '';
  }

  function entrarEdicaoTabelas(){
    estado.trabalho = estado.cands.map(c=>Object.assign({}, c));
    estado.editando = true;
    renderTabelas();
  }
  function cancelarEdicaoTabelas(){
    estado.editando = false;
    estado.trabalho = [];
    renderTabelas();
  }

  let statusSalvoTimer = null;
  // Confirmação visível do salvamento — sem isso, não tem como o usuário
  // ter certeza de que o clique em "Salvar alterações" realmente gravou.
  function avisarSalvo(){
    if(!cvStatusSalvo) return;
    const hora = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    cvStatusSalvo.textContent = 'Alterações salvas às ' + hora + '.';
    clearTimeout(statusSalvoTimer);
    statusSalvoTimer = setTimeout(()=>{ cvStatusSalvo.textContent = ''; }, 5000);
  }

  function salvarEdicaoTabelas(){
    estado.cands = estado.trabalho;
    estado.editando = false;
    estado.trabalho = [];
    renderTabelas();
    avisarSalvo();
  }

  function commitCampoTabela(el){
    const tr = el.closest('tr');
    const c = estado.trabalho[idxTrabalho(Number(tr.dataset.id))];
    if(!c) return;
    const f = el.dataset.f;
    if(f==='nome') c.nome = el.value;
    else if(f==='hora') c.hora = interpretarHoraDigitada(el.value);
    else c[f] = paraNumero(el.value);
  }

  // Copia nome/nota/horário do candidato para TODAS as linhas que o mostram
  // (outras tabelas de cota em que ele também aparece), sem redesenhar —
  // é o que preserva o foco e a navegação por Tab durante a digitação.
  function refletirCandidatoNaTela(c){
    const linhas = cvTabelas.querySelectorAll('tr[data-id="'+c.id+'"]');
    const valores = { nome:c.nome, nota:fmtNota(c.nota), hora:c.hora?fmtHora(c.hora):'' };
    Array.prototype.forEach.call(linhas, function(tr){
      Object.keys(valores).forEach(function(f){
        const inp = tr.querySelector('.cvIn[data-f="'+f+'"]');
        if(inp && document.activeElement!==inp) inp.value = valores[f];
      });
    });
  }

  // Candidatos empatados em Nota, agrupados — só entram no grupo os que TÊM
  // nota (null nunca "empata" com ninguém).
  function gruposEmpatadosPorNota(lista){
    const porNota = new Map();
    lista.forEach(c=>{
      if(c.nota==null) return;
      const chave = c.nota.toFixed(2);
      if(!porNota.has(chave)) porNota.set(chave, []);
      porNota.get(chave).push(c);
    });
    return Array.from(porNota.values()).filter(g=>g.length>1);
  }

  // Empate em nota onde pelo menos um dos empatados não tem data de
  // nascimento reconhecida: a ordem entre ELES não é decidida sozinha por
  // "Reordenar por nota e idade" — só avisada, pra ajuste manual.
  function atualizarAvisosTabelas(){
    const box = $('cvAvisosTabelas');
    if(!box) return;
    const gruposSemIdade = gruposEmpatadosPorNota(estado.trabalho)
      .filter(g=> g.some(c=>!parseDataNascimento(c.nascimento)));
    if(!gruposSemIdade.length){ box.innerHTML=''; return; }
    box.innerHTML = '<div class="notice-banner warn" style="margin:12px 0 0;margin-left:0;">'
      + '<strong>'+gruposSemIdade.length+' empate(s) em Nota sem idade pra desempatar sozinho</strong> — a ordem entre os nomes abaixo não foi decidida automaticamente, ajuste arrastando se for o caso:'
      + lista(gruposSemIdade, function(g){
          return '<li>Nota '+esc(fmtNota(g[0].nota))+': '+g.map(function(c){
            const idadeTxt = fmtIdadeDetalhada(c.nascimento);
            return esc(c.nome||'(sem nome)') + (idadeTxt!=='—' ? ' ('+esc(idadeTxt)+')' : ' (sem data de nascimento)');
          }).join(', ')+'</li>';
        })
      + '</div>';
  }

  // Move `idOrigem` para o lado de `idAlvo` na ordem única (trabalho) —
  // usado tanto pelo soltar do arrasto quanto pelo Alt+↑/↓. `grupoK`, quando
  // informado, devolve o foco pra alça da linha movida (renderTabelas()
  // recria a linha, e junto o que estivesse com foco nela) — sem isso, um
  // Alt+↑ repetido perderia o foco a cada passo em vez de mover a fileira
  // inteira de uma vez.
  function moverParaAoLadoDe(idOrigem, idAlvo, depois, grupoK){
    const de = idxTrabalho(idOrigem);
    let destino = idxTrabalho(idAlvo);
    if(de<0 || destino<0) return;
    if(depois) destino++;
    if(de < destino) destino--;
    const mov = estado.trabalho[de];
    estado.trabalho.splice(de,1);
    destino = Math.max(0, Math.min(destino, estado.trabalho.length));
    estado.trabalho.splice(destino, 0, mov);
    renderTabelas();
    if(grupoK){
      const novo = cvTabelas.querySelector('.drag-handle[data-id="'+idOrigem+'"][data-grupo="'+grupoK+'"]');
      if(novo) novo.focus();
    }
  }

  function moverPorTecladoGrupo(id, grupoK, passo){
    const listaGrupo = candidatosDoGrupo(estado.trabalho, grupoK);
    const i = listaGrupo.findIndex(c=>c.id===id);
    if(i<0) return;
    const viz = listaGrupo[i+passo];
    if(!viz) return;
    moverParaAoLadoDe(id, viz.id, passo>0, grupoK);
  }

  // Decrescente por Nota; empate desempatado pelo mais velho (regra do
  // TJPR). Compara as DATAS de nascimento diretamente — não a idade em anos
  // exibida na tela — então o resultado nunca muda conforme o dia em que a
  // ferramenta é usada. Só decide o par quando os DOIS têm data reconhecida;
  // sem isso, mantém a ordem que já estava entre eles (nunca inventa um
  // desempate sem dado) e atualizarAvisosTabelas() sinaliza o caso.
  function reordenarPorNotaEIdade(){
    const comIdx = estado.trabalho.map((c,i)=>({c,i}));
    comIdx.sort((a,b)=>{
      const va = a.c.nota==null ? -Infinity : a.c.nota;
      const vb = b.c.nota==null ? -Infinity : b.c.nota;
      if(vb!==va) return vb-va;
      const na = parseDataNascimento(a.c.nascimento), nb = parseDataNascimento(b.c.nascimento);
      if(na && nb && na.getTime()!==nb.getTime()) return na-nb; // data menor = mais velho = primeiro
      return a.i-b.i;
    });
    estado.trabalho = comIdx.map(x=>x.c);
    renderTabelas();
  }

  function ligarEventosEdicaoTabelas(){
    const q = cvTabelas;

    $('cvBtnSalvarTabelas').addEventListener('click', salvarEdicaoTabelas);
    $('cvBtnCancelarTabelas').addEventListener('click', cancelarEdicaoTabelas);
    $('cvBtnReordenarNota').addEventListener('click', reordenarPorNotaEIdade);

    // 'change' NUNCA chama renderTabelas() aqui — redesenhar a tabela inteira
    // no meio da transição de foco do Tab destrói o campo que acabou de
    // receber o foco, e o navegador perde a posição (o Tab seguinte reinicia
    // do topo da página). Em vez disso, só o(s) campo(s) necessário(s) são
    // atualizados diretamente — o Tab nativo segue intacto.
    Array.prototype.forEach.call(q.querySelectorAll('.cvIn'), function(el){
      el.addEventListener('input', function(){ commitCampoTabela(el); });
      el.addEventListener('change', function(){
        commitCampoTabela(el);
        const tr = el.closest('tr');
        const c = estado.trabalho[idxTrabalho(Number(tr.dataset.id))];
        if(!c) return;
        const f = el.dataset.f;
        if(f==='nome'){ c.nome = c.nome.toUpperCase(); el.value = c.nome; }
        else if(f==='nota') el.value = fmtNota(c.nota);
        else if(f==='hora') el.value = c.hora ? fmtHora(c.hora) : '';
        refletirCandidatoNaTela(c);
      });
    });

    Array.prototype.forEach.call(q.querySelectorAll('.row-del-btn'), function(b){
      b.addEventListener('click', function(){
        const id = Number(b.dataset.id);
        const grupo = b.dataset.grupo;
        const i = idxTrabalho(id);
        if(i<0) return;
        if(grupo==='ac') estado.trabalho.splice(i,1);
        else estado.trabalho[i][grupo] = false;
        renderTabelas();
      });
    });

    Array.prototype.forEach.call(q.querySelectorAll('.cvBtnAdd'), function(b){
      b.addEventListener('click', function(){
        const grupo = b.dataset.grupo;
        const novo = { id: estado.seq++, nome:'', nota:null, hora:null,
                       ac:true, ppp:false, pcd:false, ind:false };
        novo[grupo] = true;
        estado.trabalho.push(novo);
        renderTabelas();
        const tr = q.querySelector('tr[data-id="'+novo.id+'"][data-grupo="'+grupo+'"]');
        const alvo = tr && tr.querySelector('.cvIn[data-f="nome"]');
        if(alvo) alvo.focus();
      });
    });

    ligarArrastarSoltarTabelas(q);
  }

  /* ---------- arrastar e soltar (só dentro da mesma tabela/cota) ---------- */
  function ligarArrastarSoltarTabelas(q){
    let origemId = null, origemGrupo = null;

    function limparMarcas(manterArrastada){
      Array.prototype.forEach.call(q.querySelectorAll('tr'), function(t){
        t.classList.remove('drop-before','drop-after');
        if(!manterArrastada) t.classList.remove('row-dragging');
      });
    }

    Array.prototype.forEach.call(q.querySelectorAll('.drag-handle'), function(h){
      const tr = h.closest('tr');
      h.addEventListener('mousedown', function(){ tr.setAttribute('draggable','true'); });
      h.addEventListener('mouseup',   function(){ tr.setAttribute('draggable','false'); });
      h.addEventListener('keydown', function(ev){
        if(!ev.altKey || (ev.key!=='ArrowUp' && ev.key!=='ArrowDown')) return;
        ev.preventDefault();
        moverPorTecladoGrupo(Number(h.dataset.id), h.dataset.grupo, ev.key==='ArrowUp' ? -1 : 1);
      });
    });

    Array.prototype.forEach.call(q.querySelectorAll('tbody tr[data-id]'), function(tr){
      tr.addEventListener('dragstart', function(ev){
        origemId = Number(tr.dataset.id);
        origemGrupo = tr.dataset.grupo;
        tr.classList.add('row-dragging');
        try{
          ev.dataTransfer.effectAllowed = 'move';
          ev.dataTransfer.setData('text/plain', String(origemId));
        }catch(e){}
      });
      tr.addEventListener('dragend', function(){
        tr.setAttribute('draggable','false');
        origemId = null; origemGrupo = null;
        limparMarcas();
      });
      tr.addEventListener('dragover', function(ev){
        if(origemId===null) return;
        if(tr.dataset.grupo!==origemGrupo){ limparMarcas(true); return; }
        ev.preventDefault();
        try{ ev.dataTransfer.dropEffect = 'move'; }catch(e){}
        limparMarcas(true);
        const r = tr.getBoundingClientRect();
        tr.classList.add(((ev.clientY - r.top) > r.height/2) ? 'drop-after' : 'drop-before');
      });
      tr.addEventListener('drop', function(ev){
        ev.preventDefault();
        if(origemId===null || tr.dataset.grupo!==origemGrupo){ origemId=null; origemGrupo=null; limparMarcas(); return; }
        const alvoId = Number(tr.dataset.id);
        const r = tr.getBoundingClientRect();
        const depois = (ev.clientY - r.top) > r.height/2;
        const deId = origemId, deGrupo = origemGrupo;
        origemId = null; origemGrupo = null;
        limparMarcas();
        if(deId===alvoId) return;
        moverParaAoLadoDe(deId, alvoId, depois, deGrupo);
      });
    });
  }

  cvBtnEditarTabelas.addEventListener('click', ()=>{ if(!estado.editando) entrarEdicaoTabelas(); });

  // "Colunas do edital": só resta a Hora, opcional (Objetiva/Discursiva/
  // Acertos saíram — a nota agora é um único campo, sempre presente).
  // "Horário geral" só faz sentido quando NINGUÉM tem horário próprio — com
  // a coluna Horário ativa na tabela, o campo geral ficaria redundante (e
  // pode confundir se sobrar um valor antigo digitado antes de ativar a
  // coluna). O campo some da tela, e o gerarEdital() também ignora qualquer
  // valor deixado nele enquanto a coluna estiver ativa.
  function sincronizarCampoHorarioGeral(){
    const campo = $('cvCampoHorarioGeral');
    if(campo) campo.style.display = estado.cols.hora ? 'none' : '';
  }

  cvColHora.addEventListener('change', ()=>{
    estado.cols.hora = cvColHora.checked;
    cvPainelHorarios.style.display = estado.cols.hora ? 'flex' : 'none';
    sincronizarCampoHorarioGeral();
    renderTabelas();
  });

  // "Preencher horários" opera na ordem única (trabalho) — por isso só faz
  // sentido dentro do modo de edição, igual às demais ações em massa.
  cvBtnHorarios.addEventListener('click', ()=>{
    if(!estado.editando){ alert('Clique em "Editar tabelas" antes de preencher os horários.'); return; }
    const ini = interpretarHoraDigitada(cvHoraInicial.value);
    const passo = Number(cvHoraIntervalo.value)||0;
    if(!ini){ alert('Informe o horário inicial no formato 13h30 ou 13:30.'); return; }
    let min = ini.h*60 + ini.m;
    estado.trabalho.forEach(c=>{
      if(!c.nome.trim()) return;
      c.hora = { h:Math.floor(min/60)%24, m:min%60 };
      min += passo;
    });
    renderTabelas();
  });

  /* ---------------- passo 4 — dados do edital ---------------- */

  function lerCamposDoc(){
    Object.keys(estado.doc).forEach(k=>{ const el=$('cvF_'+k); if(el) estado.doc[k]=el.value; });
  }
  function escreverCamposDoc(){
    Object.keys(estado.doc).forEach(k=>{ const el=$('cvF_'+k); if(el) el.value=estado.doc[k]||''; });
  }

  // Máscara do protocolo SEI: 0000000-00.0000.0.00.0000 (20 dígitos) — mesma
  // função da Classificação Final e do Ponto 14/18.
  function ativarMascaraSei(el){
    if(!el) return;
    el.addEventListener('input', function(){
      const d = el.value.replace(/\D/g,'').slice(0,20);
      let out = d.slice(0,7);
      if(d.length>7)  out += '-' + d.slice(7,9);
      if(d.length>9)  out += '.' + d.slice(9,13);
      if(d.length>13) out += '.' + d.slice(13,14);
      if(d.length>14) out += '.' + d.slice(14,16);
      if(d.length>16) out += '.' + d.slice(16,20);
      el.value = out;
    });
  }

  // Máscara do número do edital: NNNN/AAAA — mesma função da Classificação
  // Final. Os últimos 4 dígitos digitados são sempre o ano.
  function ativarMascaraEdital(el){
    if(!el) return;
    el.addEventListener('input', function(){
      const d = el.value.replace(/\D/g,'').slice(0,9);
      el.value = d.length<=4 ? d : d.slice(0, d.length-4) + '/' + d.slice(-4);
    });
  }

  // "Horário geral": só reformata se o campo inteiro for um horário puro
  // ("1330", "13:30"...) — texto livre como "às 13h30min" ou "conforme
  // cronograma" fica intacto, porque não é isso que o padrão reconhece.
  function ativarAutoformatoHorarioGeral(el){
    if(!el) return;
    el.addEventListener('change', function(){
      const h = interpretarHoraDigitada(el.value);
      if(h) el.value = fmtHora(h);
    });
  }

  // Telefone: (XX) XXXXX-XXXX pra 11 dígitos (celular), (XX) XXXX-XXXX pra
  // 10 (fixo) — reconstruído a partir dos dígitos a cada tecla, mesmo idioma
  // das outras máscaras. Só dá pra saber se é fixo ou celular com o número
  // completo, então o formato do corpo (4 ou 5 dígitos antes do traço) só
  // se decide quando passa de 10 dígitos no total.
  function ativarMascaraTelefone(el){
    if(!el) return;
    el.addEventListener('input', function(){
      const d = el.value.replace(/\D/g,'').slice(0,11);
      if(!d.length){ el.value=''; return; }
      let out = '(' + d.slice(0,2);
      if(d.length>2){
        out += ') ';
        const corpo = d.slice(2);
        const celular = d.length>10;
        const primeiraParte = celular ? 5 : 4;   // "99999" (celular) ou "9999" (fixo)
        out += corpo.slice(0,primeiraParte) + (corpo.length>primeiraParte ? '-'+corpo.slice(primeiraParte,primeiraParte+4) : '');
      }
      el.value = out;
    });
  }

  /* ---------------- passo 5 — geração dos blocos ---------------- */

  const P = "margin:0 0 10pt;font-family:'Times New Roman',Times,serif;font-size:11pt;";
  // Espaçamento simples (sem os 10pt de folga do P) — Preâmbulo, Numeração e
  // assinatura, a pedido.
  const P0 = "margin:0;font-family:'Times New Roman',Times,serif;font-size:11pt;";
  // Negrito, alinhado à esquerda, espaçamento simples — Preâmbulo (Bloco 2),
  // Numeração (Bloco 3) e o nome de quem assina (Bloco 6).
  const E0 = P0+'text-align:left;font-weight:bold;';
  // O atributo HTML align="..." vai JUNTO do style="text-align:...": é o que
  // faz o alinhamento sobreviver de forma confiável ao colar no Word/Athos —
  // mesmo raciocínio do border="1" e do <b> na tabela do Bloco 4.

  const LARGURA_COL_CV = { ordem:'56pt', nota:'70pt', hora:'90pt' };

  function tabelaImpressa(grupo){
    const lista_ = estado.cands.filter(c=> c[grupo.k] && c.nome && c.nome.trim());
    if(!lista_.length) return '';
    const cols = [ {k:'ordem', t:'ORDEM'}, {k:'nome', t:'NOME'}, {k:'nota', t:'NOTA'} ];
    if(estado.cols.hora) cols.push({k:'hora', t:'HORÁRIO'});
    const td = (k, cabecalho)=>{
      let s = 'border:1pt solid #000;padding:3pt 5pt;vertical-align:top;word-break:break-word;';
      s += k==='ordem' ? 'white-space:nowrap;' : 'white-space:normal;';
      if(LARGURA_COL_CV[k]) s += 'width:'+LARGURA_COL_CV[k]+';';
      if(cabecalho) s += 'font-weight:bold;';
      return 'style="'+s+'"';
    };
    // border="1" (atributo HTML, não só CSS) e <b> de verdade (não só
    // font-weight no style) são o que fazem borda e negrito sobreviverem ao
    // colar no Word/Athos de forma confiável.
    let h = '<table border="1" cellspacing="0" style="border:1pt solid #000;border-collapse:collapse;width:100%;max-width:100%;table-layout:fixed;margin:0 0 12pt;font-family:\'Times New Roman\',Times,serif;font-size:11pt;">';
    h += '<colgroup>'+cols.map(c=>'<col'+(LARGURA_COL_CV[c.k]?(' style="width:'+LARGURA_COL_CV[c.k]+';"'):'')+'>').join('')+'</colgroup>';
    h += '<tr><td align="center" colspan="'+cols.length+'" style="border:1pt solid #000;padding:3pt 5pt;font-weight:bold;text-align:center;"><b>'+esc(grupo.rot)+'</b></td></tr>';
    h += '<tr>'+cols.map(c=>'<td '+td(c.k,true)+'><b>'+esc(c.t)+'</b></td>').join('')+'</tr>';
    lista_.forEach((c,i)=>{
      h += '<tr>'+cols.map(col=>{
        const v = (col.k==='ordem') ? String(i+1)
                : (col.k==='nome') ? c.nome.toUpperCase()
                : (col.k==='hora') ? (c.hora?fmtHora(c.hora):'')
                : fmtNota(c.nota);
        return '<td '+td(col.k,false)+'>'+esc(v)+'</td>';
      }).join('')+'</tr>';
    });
    h += '</table>';
    return h;
  }

  // Os 6 blocos vivem em containers HTML fixos (cvBloco1..cvBloco6) — cada um
  // pensado para colar num campo diferente do Athos.
  function gerarEdital(){
    // As tabelas de convocação ainda estão em edição: gerar agora usaria
    // estado.cands, que só é atualizado ao clicar em "Salvar alterações" —
    // ou seja, sairia com dado desatualizado, sem o usuário perceber.
    if(estado.editando){
      alert('As tabelas de convocação ainda estão em edição. Clique em "Salvar alterações" (ou "Cancelar") no Passo 3 antes de gerar o edital.');
      return;
    }
    lerCamposDoc();
    const d = estado.doc;
    const incluirTribunal = $('cvIncluirTribunal').checked;

    // Bloco 1 — Título do Edital (referência curta, não faz parte do texto
    // legal em si). Todos os caracteres em maiúsculas, alinhado à esquerda.
    const bTitulo = '<p align="left" style="'+E0+'">'
      + esc(('EDITAL DE CONVOCAÇÃO PARA ENTREVISTA N° '+(d.nConv||'____/____')+' - SEI!'+(d.sei||'____________')).toUpperCase())
      + '</p>';

    // Bloco 2 — Preâmbulo. Alinhado à esquerda, espaçamento simples.
    let b2 = '';
    if(incluirTribunal) b2 += '<p align="left" style="'+E0+'">TRIBUNAL DE JUSTIÇA DO ESTADO DO PARANÁ</p>';
    b2 += '<p align="left" style="'+E0+(incluirTribunal?'margin-top:24pt;':'')+'">EDITAL DE CONVOCAÇÃO PARA ENTREVISTA N° '+esc(d.nConv||'____/____')+'</p>';
    b2 += '<p align="left" style="'+E0+'">PROCESSO SELETIVO PARA O PROGRAMA DE RESIDÊNCIA JURÍDICA</p>';

    // Bloco 3 — Numeração. Alinhado à esquerda, espaçamento simples.
    let b3 = '<p align="left" style="'+E0+'">'+esc(d.nEdital||'____/____')+'</p>';
    b3 += '<p align="left" style="'+E0+'">SEI!TJPR N° '+esc(d.sei||'____________')+'</p>';

    // Bloco 4 — Conteúdo (tabelas + data/local/telefone/outras informações).
    // Um parágrafo vazio de espaçamento simples entre as tabelas de cota —
    // margin no <table> não sobrevive de forma confiável ao colar no
    // Word/Athos, um <p> entre elas sim.
    let b4 = '';
    GRUPOS_CV.forEach(g=>{
      const t = tabelaImpressa(g);
      if(!t) return;
      if(b4) b4 += '<p style="'+P0+'">&nbsp;</p>';
      b4 += t;
    });
    let dataLinha = (d.data||'').trim();
    // ignora qualquer valor deixado no campo — a coluna Horário por
    // candidato manda, o horário geral não faz sentido junto dela
    if(d.horarioGeral && !estado.cols.hora) dataLinha += (dataLinha?', ':'')+d.horarioGeral.trim();
    if(dataLinha) b4 += '<p style="'+P+'"><strong>Data:</strong> '+esc(comPontoFinal(dataLinha))+'</p>';
    if(d.local) b4 += '<p style="'+P+'"><strong>Local:</strong> '+esc(comPontoFinal(d.local)).replace(/\n/g,'<br>')+'</p>';
    if(d.telefone) b4 += '<p style="'+P+'"><strong>Telefone:</strong> '+esc(d.telefone)+'</p>';
    if(d.extra) b4 += '<p style="'+P+'"><strong>Outras informações:</strong> '+esc(comPontoFinal(d.extra)).replace(/\n/g,'<br>')+'</p>';

    // Bloco 5 — Data da assinatura. Alinhado à esquerda.
    const b5 = '<p align="left" style="'+P+'text-align:left;">'+esc(d.cidade||'Curitiba')+', '+esc(d.dataAss||'____ de __________ de ____')+'.</p>';

    // Bloco 6 — Quem assina. Alinhado à esquerda, espaçamento simples.
    let b6 = '<p align="left" style="'+E0+'">'+esc((d.assinante||'').toUpperCase())+'</p>';
    if(d.cargo) b6 += '<p align="left" style="'+P0+'text-align:left;">'+esc(d.cargo)+'</p>';
    if(d.unidade) b6 += '<p align="left" style="'+P0+'text-align:left;">'+esc(d.unidade)+'</p>';

    [bTitulo,b2,b3,b4,b5,b6].forEach((b,i)=>{
      $('cvBloco'+(i+1)).innerHTML = '<div style="font-family:\'Times New Roman\',Times,serif;font-size:11pt;color:#000;">'+b+'</div>';
    });

    cvSaidaBox.style.display = 'block';
    const faltando = [];
    if(!d.nConv) faltando.push('nº do edital de convocação');
    if(!d.sei) faltando.push('nº SEI');
    if(!d.assinante) faltando.push('nome de quem assina');
    if(!estado.cands.length) faltando.push('candidatos');
    cvMsgSaida.innerHTML = faltando.length
      ? '<span style="color:var(--coral);">Faltou preencher: '+esc(faltando.join(', '))+'.</span>'
      : 'Edital gerado. Confira o texto de cada bloco antes de copiar.';
    rolarAte(cvSaidaBox);
  }

  async function copiarConteudo(el, msgOk){
    try{
      if(navigator.clipboard && window.ClipboardItem){
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([el.innerHTML],{type:'text/html'}),
          'text/plain': new Blob([el.innerText||el.textContent],{type:'text/plain'})
        })]);
        cvMsgSaida.textContent = msgOk;
        return;
      }
    }catch(e){ /* cai no método antigo abaixo */ }
    const sel = window.getSelection(), r = document.createRange();
    r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r);
    let ok = false;
    try{ ok = document.execCommand('copy'); }catch(e){ ok = false; }
    sel.removeAllRanges();
    cvMsgSaida.textContent = ok ? msgOk : 'Não foi possível copiar automaticamente; selecione o texto e use Ctrl+C.';
  }

  function copiarBloco(n){ copiarConteudo($('cvBloco'+n), 'Bloco copiado — cole no Athos ou no Word.'); }

  async function copiarTudo(){
    let html = '';
    for(let i=1;i<=6;i++) html += $('cvBloco'+i).innerHTML;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
    document.body.appendChild(tmp);
    try{ await copiarConteudo(tmp, 'Edital copiado — cole no Athos ou no Word.'); }
    finally{ tmp.remove(); }
  }

  function imprimirPdf(){
    const w = window.open('','_blank');
    if(!w){ cvMsgSaida.innerHTML = '<span style="color:var(--coral);">O navegador bloqueou a janela de impressão — permita pop-ups para esta página.</span>'; return; }
    let html = '';
    for(let i=1;i<=6;i++) html += $('cvBloco'+i).innerHTML;
    w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Edital de Convocação para Entrevista</title>'
      +'<style>@page{size:A4;margin:2.5cm 2cm;} body{font-family:"Times New Roman",Times,serif;font-size:11pt;color:#000;margin:0;}'
      +'table{border-collapse:collapse;width:100%;} td{border:1pt solid #000;padding:3pt 5pt;}</style></head><body>'
      +html+'</body></html>');
    w.document.close(); w.focus();
    setTimeout(()=>{ w.print(); },350);
  }

  function alternarEdicaoTexto(){
    const blocos = [1,2,3,4,5,6].map(i=>$('cvBloco'+i));
    const lig = blocos[0].getAttribute('contenteditable')==='true';
    blocos.forEach(el=>{
      el.setAttribute('contenteditable', lig?'false':'true');
      el.style.outline = lig?'none':'2px dashed var(--teal)';
    });
    $('cvBtnEditarTexto').textContent = lig ? 'Editar texto' : 'Concluir edição';
    if(!lig) blocos[0].focus();
  }

  $('cvBtnGerar').addEventListener('click', gerarEdital);
  $('cvBtnCopiarTudo').addEventListener('click', copiarTudo);
  $('cvBtnPDF').addEventListener('click', imprimirPdf);
  $('cvBtnEditarTexto').addEventListener('click', alternarEdicaoTexto);
  document.querySelectorAll('.cv-bloco-copiar').forEach(btn=>{
    btn.addEventListener('click', ()=>copiarBloco(btn.dataset.bloco));
  });

  // data da entrevista: máscara numérica + calendário; assinatura: só calendário
  ativarMascaraData($('cvF_data'));
  ativarBotaoCalendario($('cvF_data'),'slash');
  estado.doc.dataAss = formatarDataExtenso(new Date());
  $('cvF_dataAss').value = estado.doc.dataAss;
  ativarBotaoCalendario($('cvF_dataAss'),'extenso');
  ativarMascaraSei($('cvF_sei'));
  ativarMascaraEdital($('cvF_nConv'));
  ativarAutoformatoHorarioGeral($('cvF_horarioGeral'));
  ativarMascaraTelefone($('cvF_telefone'));

  /* ---------------- L) rascunho (.json) ---------------- */

  function exportarRascunho(){
    lerCamposDoc();
    const dados = {
      ferramenta:'residencia-convocacao', versao:2, gerado:new Date().toISOString(),
      inscritos: estado.inscritos, cands: estado.cands, cols: estado.cols, doc: estado.doc
    };
    const blob = new Blob([JSON.stringify(dados,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rascunho_convocacao_' + (estado.doc.nConv||'sem_numero').replace(/[^\w-]/g,'_') + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function importarRascunho(file){
    const fr = new FileReader();
    fr.onload = ()=>{
      let d;
      try{ d = JSON.parse(fr.result); }
      catch(e){ alert('Arquivo de rascunho inválido (não é um JSON legível).'); return; }
      if(!d || (d.ferramenta && d.ferramenta!=='residencia-convocacao')){
        if(!confirm('Este rascunho não foi salvo por esta ferramenta. Tentar abrir assim mesmo?')) return;
      }
      estado.inscritos = Array.isArray(d.inscritos) ? d.inscritos : [];
      estado.cands = Array.isArray(d.cands) ? d.cands : [];
      estado.cols = Object.assign({hora:false}, d.cols||{});
      estado.doc = Object.assign(estado.doc, d.doc||{});
      let maxId = 0;
      estado.inscritos.concat(estado.cands).forEach(x=>{ if(x.id>maxId) maxId=x.id; });
      estado.seq = maxId + 1;
      estado.editando = false;
      estado.trabalho = [];

      escreverCamposDoc();
      cvColHora.checked = !!estado.cols.hora;
      cvPainelHorarios.style.display = estado.cols.hora ? 'flex' : 'none';
      sincronizarCampoHorarioGeral();
      renderChecklist();
      if(estado.cands.length){ renderTabelas(); cvPasso3.style.display=''; $('cvPasso4').style.display=''; }
      if(estado.inscritos.length) cvPasso2.style.display='';
      status(cvStatus, 'Rascunho aberto: '+estado.inscritos.length+' inscrito(s), '+estado.cands.length+' na(s) tabela(s) de convocação.', 'ok');
    };
    fr.readAsText(file, 'UTF-8');
  }

  $('cvBtnExportar').addEventListener('click', exportarRascunho);
  $('cvBtnAbrirRascunho').addEventListener('click', ()=> $('cvRascunho').click());
  $('cvRascunho').addEventListener('change', (e)=>{ const f=e.target.files[0]; if(f) importarRascunho(f); e.target.value=''; });

  // Caixa flutuante do rascunho — mesmo padrão da Seção de Processo
  // Seletivo (Ponto 14/18): recolhida por padrão, pra não atrapalhar a
  // navegação.
  const cvDraft = $('cvDraft'), cvDraftToggle = $('cvDraftToggle');
  if(cvDraft && cvDraftToggle){
    cvDraftToggle.addEventListener('click', ()=>{
      const recolhida = cvDraft.classList.toggle('collapsed');
      cvDraftToggle.textContent = recolhida ? '+' : '–';
      cvDraftToggle.title = recolhida ? 'Abrir' : 'Recolher';
      cvDraftToggle.setAttribute('aria-expanded', recolhida ? 'false' : 'true');
    });
  }

  sincronizarCampoHorarioGeral();
  conferirPasso1();
}

/* Exposto para os testes automatizados (jsdom/Node) e para depuração. */
if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    paraNumero, fmtNota, chaveNome, semAcento, limpar, soDigitos, comPontoFinal,
    agruparLinhas, linhasDasPaginas, extrairTelefone, registroDaLinhaLista,
    reconhecerLista, listaParaTexto, lerQuadroLista,
    reservaDaModalidade, reservaTexto, GRUPOS_CV, candidatosDoGrupo,
    interpretarHoraDigitada, fmtHora, formatarDataExtenso, formatarDataBarra,
    parseDataNascimento, calcularIdade, calcularIdadeDetalhada, fmtIdadeDetalhada,
    estado
  };
}

})();
