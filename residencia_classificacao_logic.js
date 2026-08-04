/* Gerador do Edital de Classificação Final — Divisão de Residência (TJPR)
   100% client-side. Depende de vendor/pdf.min.js (leitura de PDF) e core.js.

   Estrutura do arquivo:
     A) utilidades de texto/número
     B) leitura de PDF e agrupamento por linha (coordenadas) — igual ao Hércules
     C) leitor da Lista de dados dos inscritos — igual ao Hércules
     D) modalidade da inscrição -> reserva de vaga
     E) estado da ferramenta
     F) passo 1 — trazer a lista e montar a conferência
     G) passo 2 — selecionar candidatos (conferência com checkbox)
     H) passo 3 — tabelas de classificação (rascunho editável, por cota)
     I) passo 4 — dados do edital
     J) passo 5 — geração dos blocos para o Athos
     K) rascunho (exportar/importar) e ligação com a página
*/

(function(){
'use strict';

/* ========================= A) utilidades ========================= */

function $(id){ return document.getElementById(id); }
const esc = TJPRCore.escapeHtml;
function escAttr(s){ return esc(s==null?'':s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

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
// 8.5 -> "8,50" (sempre duas casas, sempre vírgula) — corrige o que o usuário
// digitar ou colar com ponto, ou sem as casas decimais.
function fmtNota(v){
  if(v==null || v==='') return '';
  const n = (typeof v==='number') ? v : paraNumero(v);
  if(n==null) return String(v);
  return n.toFixed(2).replace('.',',');
}

// Nota Prova e Nota Entrevista preenchidas -> Nota Final vira a média das
// duas, automaticamente. null quando falta uma das duas — nunca calculamos
// "média de um número só".
function calcularMedia(c){
  if(c.notaProva==null || c.notaEntrevista==null) return null;
  return (c.notaProva + c.notaEntrevista) / 2;
}
// Edição manual da Nota Final que diverge da média não é bloqueada nem
// corrigida sozinha — só sinalizada (mesmo espírito de toda a ferramenta:
// nada é corrigido em silêncio).
function notaFinalDivergente(c){
  const media = calcularMedia(c);
  if(media==null || c.notaFinal==null) return false;
  return Math.abs(c.notaFinal - media) > 0.005;
}

// rolagem suave tolerante a navegadores antigos
function rolarAte(el){
  if(el && typeof el.scrollIntoView==='function'){
    try{ el.scrollIntoView({behavior:'smooth', block:'start'}); }catch(e){ el.scrollIntoView(); }
  }
}

/* ================ B) leitura de PDF e linhas por coordenada ================
   Idêntico ao residencia_hercules_logic.js — cada ferramenta da Residência
   mantém sua própria cópia (nenhum módulo é compartilhado entre elas). */

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
   Também idêntico ao residencia_hercules_logic.js. Só o número, a modalidade
   e o nome interessam aqui — CPF, celular e e-mail são lidos e mantidos no
   quadro de conferência, mas esta ferramenta não os usa depois. */

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
    [ r.num || (i+1), r.modalidade, r.cpf, r.nome, r.celular, r.email ].join('\t')
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
      registros.push({
        num: porTab[0], modalidade: porTab[1], cpf: soDigitos(porTab[2]),
        nome: limpar(porTab[3]), celular: limpar(porTab[4]), email: limpar(porTab[5]||'')
      });
      return;
    }
    const reg = registroDaLinhaLista(linha.split(/\s+/));
    if(reg){ registros.push(reg); return; }
    naoReconhecidas.push(linha);
  });
  return { registros, naoReconhecidas };
}

/* ============ D) modalidade da inscrição -> reserva de vaga ============
   Mesmo mapeamento do Hércules (MAPA_MODALIDADE), com os nomes de flag desta
   ferramenta (ppp/pcd/ind). A cota VS só vale para editais de Ensino Médio;
   na Residência ela reverte para concorrência Geral — mesma regra do Hércules. */

const MAPA_RESERVA = [
  // PRET[OA]/PARD[OA] cobre as duas concordâncias de gênero — a modalidade da
  // inscrição normalmente vem como "Pessoa Preta ou Parda" (feminino), que
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

/* ============ E) estado da ferramenta ============ */

const GRUPOS_CF = [
  { k:'ac',  rot:'AMPLA CONCORRÊNCIA' },
  { k:'ppp', rot:'PESSOA PRETA OU PARDA' },
  { k:'pcd', rot:'PcD - PESSOA COM DEFICIÊNCIA' },
  { k:'ind', rot:'INDÍGENA' }
];

const estado = {
  inscritos: [],      // {id, nome, modalidade, ppp, pcd, ind, marcado}
  cands: [],           // {id, nome, notaProva, notaEntrevista, notaFinal, ac, ppp, pcd, ind} — cadastro único
  editando: false,
  trabalho: [],
  seq: 1,
  doc: { numEdital:'', sei:'', assinante:'', cargo:'', unidade:'', cidade:'Curitiba', dataAss:'' }
};

function candidatosDoGrupo(lista, grupoK){ return lista.filter(c=>c[grupoK]); }
function idxTrabalho(id){
  for(let i=0;i<estado.trabalho.length;i++){ if(estado.trabalho[i].id===id) return i; }
  return -1;
}

/* ============================================================================
   A partir daqui, tudo depende do DOM da página (residencia_classificacao.html).
   Em Node (testes automatizados) o bloco inteiro é ignorado — só as funções
   puras acima ficam disponíveis via module.exports, no fim do arquivo.
   ========================================================================== */

if(typeof document !== 'undefined' && document.getElementById('cfBtnProcessar')){

  const cfArquivo=$('cfArquivo'), cfBtnArquivo=$('cfBtnArquivo'), cfNomeArquivo=$('cfNomeArquivo'),
        cfStatus=$('cfStatus'), cfTexto=$('cfTexto'), cfBtnLimpar=$('cfBtnLimpar'), cfBtnProcessar=$('cfBtnProcessar');
  const cfPasso2=$('cfPasso2'), cfChecklist=$('cfChecklist'), cfResumoSelecao=$('cfResumoSelecao'),
        cfBuscaNome=$('cfBuscaNome'),
        cfBtnMarcarTodos=$('cfBtnMarcarTodos'), cfBtnDesmarcarTodos=$('cfBtnDesmarcarTodos'),
        cfBtnGerarTabelas=$('cfBtnGerarTabelas');
  const cfPasso3=$('cfPasso3'), cfTabelas=$('cfTabelas'), cfBtnEditarTabelas=$('cfBtnEditarTabelas'),
        cfStatusSalvo=$('cfStatusSalvo');
  const cfPasso4=$('cfPasso4'), cfBtnGerar=$('cfBtnGerar');
  const cfSaidaBox=$('cfSaidaBox'), cfMsgSaida=$('cfMsgSaida');

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

  function conferirPasso1(){ cfBtnProcessar.disabled = !cfTexto.value.trim(); }

  cfBtnArquivo.addEventListener('click', ()=> cfArquivo.click());
  cfTexto.addEventListener('input', conferirPasso1);
  cfBtnLimpar.addEventListener('click', ()=>{
    cfTexto.value=''; cfStatus.style.display='none'; cfArquivo.value=''; cfNomeArquivo.textContent='nenhum arquivo escolhido';
    conferirPasso1();
  });

  cfArquivo.addEventListener('change', async ()=>{
    const f = cfArquivo.files && cfArquivo.files[0];
    cfNomeArquivo.textContent = f ? f.name : 'nenhum arquivo escolhido';
    if(!f) return;
    status(cfStatus, 'Lendo o PDF da lista de dados…', '');
    try{
      const paginas = await pdfParaPaginas(f);
      const totalItens = paginas.reduce((s,p)=>s+p.itens.length,0);
      if(totalItens < 10){
        status(cfStatus, '<strong>Este PDF não tem texto para extrair.</strong> Cole a lista no quadro abaixo.', 'warn');
        return;
      }
      const r = reconhecerLista(linhasDasPaginas(paginas, 3));
      if(!r.registros.length){
        status(cfStatus, '<strong>Nenhum inscrito reconhecido neste PDF.</strong> Confira se é a Lista de dados, ou cole o conteúdo no quadro abaixo.', 'warn');
        return;
      }
      cfTexto.value = listaParaTexto(r.registros);
      let msg = '<strong>'+r.registros.length+' inscrito(s)</strong> reconhecido(s). Confira o quadro abaixo antes de processar.';
      status(cfStatus, msg, 'ok');
      conferirPasso1();
    }catch(e){
      status(cfStatus, 'Não foi possível ler o PDF ('+esc(e.message||e)+'). Cole a lista no quadro abaixo.', 'warn');
    }
  });

  cfBtnProcessar.addEventListener('click', ()=>{
    const li = lerQuadroLista(cfTexto.value);
    if(!li.registros.length){ alert('Nenhum inscrito reconhecido no quadro. Cada linha deve trazer Nº, Modalidade, CPF, Nome, Celular e E-mail (separados por tabulação).'); return; }

    const desconhecidas = [], vsList = [], duplicados = [];
    const vistos = new Set();
    estado.inscritos = li.registros.map(r=>{
      const ch = chaveNome(r.nome);
      if(ch){ if(vistos.has(ch)) duplicados.push(r.nome); else vistos.add(ch); }
      const conv = reservaDaModalidade(r.modalidade);
      if(conv.desconhecida) desconhecidas.push({ nome:r.nome, valor:conv.desconhecida });
      if(conv.vs) vsList.push(r.nome);
      // desmarcado por padrão: o usuário escolhe ativamente quem entra na
      // classificação, em vez de precisar excluir quem não participa
      return { id: estado.seq++, nome:r.nome, modalidade:r.modalidade,
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
    status(cfStatus, msg, (li.naoReconhecidas.length||vsList.length||desconhecidas.length) ? 'warn' : 'ok');

    renderChecklist();
    cfPasso2.style.display = '';
    rolarAte(cfPasso2);
  });

  /* ---------------- passo 2 — selecionar candidatos ---------------- */

  // Filtro por nome: substring, sem acento e sem caixa — não é um "fuzzy find"
  // por subsequência de letras, é a mesma comparação normalizada usada em
  // chaveNome para tudo o mais nesta ferramenta.
  function inscritosFiltrados(){
    const termo = chaveNome(cfBuscaNome.value);
    if(!termo) return estado.inscritos;
    return estado.inscritos.filter(it=> chaveNome(it.nome).indexOf(termo) >= 0);
  }

  function renderChecklist(){
    if(!estado.inscritos.length){
      cfChecklist.innerHTML = '<p class="empty-hint">Nenhum inscrito. Processe a lista no Passo 1.</p>';
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
      h += '<tr><td style="text-align:center;"><input type="checkbox" class="cfChkInsc" data-id="'+it.id+'"'+(it.marcado?' checked':'')+'></td>'
        + '<td>'+esc(it.nome)+'</td><td>'+esc(reservaTexto(it))+'</td></tr>';
    });
    h += '</tbody></table></div>';
    cfChecklist.innerHTML = h;

    Array.prototype.forEach.call(cfChecklist.querySelectorAll('.cfChkInsc'), function(chk){
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
    cfResumoSelecao.textContent = marcados.length + ' de ' + estado.inscritos.length + ' candidato(s) selecionado(s)'
      + (visiveis.length!==estado.inscritos.length ? ' — ' + visiveis.length + ' visível(is) com o filtro atual' : '') + '.';
  }

  cfBuscaNome.addEventListener('input', renderChecklist);
  // "Marcar/desmarcar todos" age só sobre quem está visível com o filtro atual
  // — evita marcar às cegas alguém que nem apareceu na tela.
  cfBtnMarcarTodos.addEventListener('click', ()=>{ inscritosFiltrados().forEach(i=>i.marcado=true); renderChecklist(); });
  cfBtnDesmarcarTodos.addEventListener('click', ()=>{ inscritosFiltrados().forEach(i=>i.marcado=false); renderChecklist(); });

  cfBtnGerarTabelas.addEventListener('click', ()=>{
    const marcados = estado.inscritos.filter(i=>i.marcado);
    if(!marcados.length){ alert('Marque ao menos um candidato para gerar as tabelas.'); return; }
    if(estado.cands.length && !confirm('Isso substitui as tabelas de classificação já geradas — as notas já digitadas serão perdidas. Continuar?')) return;

    // maiúsculas já na montagem — não só na impressão do edital, pra ficar
    // igual do jeito que aparece na tela de conferência e edição também
    estado.cands = marcados.map(it=>({
      id: estado.seq++, nome: it.nome.toUpperCase(),
      notaProva:null, notaEntrevista:null, notaFinal:null,
      ac:true, ppp:it.ppp, pcd:it.pcd, ind:it.ind
    }));
    estado.editando = false;
    estado.trabalho = [];
    renderTabelas();
    cfPasso3.style.display = '';
    cfPasso4.style.display = '';
    rolarAte(cfPasso3);
  });

  /* ---------------- passo 3 — tabelas de classificação (por cota) ----------------

     Cadastro único por candidato: o mesmo objeto aparece na lista filtrada de
     cada cota em que ele concorre, então corrigir a nota em qualquer tabela
     atualiza a mesma pessoa em todas. A ORDEM também é uma só (a posição do
     candidato no array `trabalho`); cada tabela é só o recorte filtrado
     daquela ordem — por isso arrastar numa tabela também reflete nas demais
     em que os dois candidatos movidos aparecem juntos.

     Excluir dentro da tabela AMPLA CONCORRÊNCIA remove o candidato por
     inteiro (todo mundo tem que estar na Ampla — não existe "só tirar de
     lá"); excluir nas demais tabelas só desmarca aquela cota específica. */

  function tabelaTela(grupo, editando){
    const base = editando ? estado.trabalho : estado.cands;
    const lista_ = candidatosDoGrupo(base, grupo.k);
    let h = '<div class="cf-grupo-bloco"><p class="cf-grupo-tit">'+esc(grupo.rot)
      + ' <span class="cf-grupo-qtd">('+lista_.length+')</span></p>';
    if(!lista_.length){
      h += '<p class="empty-hint">nenhum candidato aqui'+(editando?' — use “+ Adicionar linha” para incluir um':'')+'</p></div>';
      return h;
    }
    h += '<div class="table-scroll" style="max-height:none;"><table class="cv-grade-table" style="white-space:normal;">';
    h += '<thead><tr>'+(editando?'<th style="width:30px;"></th>':'')
      + '<th style="width:62px;white-space:nowrap;">ORDEM</th><th>NOME</th>'
      + '<th style="width:96px;">NOTA PROVA</th><th style="width:110px;">NOTA ENTREVISTA</th><th style="width:90px;">NOTA FINAL</th>'
      + (editando?'<th style="width:44px;">Ações</th>':'')+'</tr></thead><tbody>';
    lista_.forEach((c,i)=>{
      h += '<tr data-id="'+c.id+'" data-grupo="'+grupo.k+'" draggable="false">';
      if(editando){
        h += '<td style="text-align:center;"><button type="button" class="drag-handle" data-id="'+c.id+'" data-grupo="'+grupo.k+'" tabindex="0"'
          + ' title="Arrastar para reordenar (ou Alt+↑ / Alt+↓)" aria-label="Remanejar '+escAttr(c.nome||'linha em branco')+'">⠿</button></td>';
      }
      h += '<td style="text-align:center;color:var(--ink-soft);">'+(i+1)+'</td>';
      if(editando){
        h += '<td><input class="cfIn" data-f="nome" value="'+escAttr(c.nome)+'" style="width:100%;min-width:190px;padding:5px;border:1px solid var(--line);font-size:12.5px;"></td>';
        h += '<td><input class="cfIn" data-f="notaProva" value="'+escAttr(fmtNota(c.notaProva))+'" style="width:100%;padding:5px;border:1px solid var(--line);text-align:center;font-size:12.5px;"></td>';
        h += '<td><input class="cfIn" data-f="notaEntrevista" value="'+escAttr(fmtNota(c.notaEntrevista))+'" style="width:100%;padding:5px;border:1px solid var(--line);text-align:center;font-size:12.5px;"></td>';
        h += '<td><input class="cfIn" data-f="notaFinal" value="'+escAttr(fmtNota(c.notaFinal))+'" style="width:100%;padding:5px;border:1px solid var(--line);text-align:center;font-size:12.5px;"></td>';
        h += '<td style="text-align:center;"><button type="button" class="row-del-btn" data-id="'+c.id+'" data-grupo="'+grupo.k+'" tabindex="-1"'
          + ' title="'+(grupo.k==='ac' ? 'Excluir este candidato de todas as tabelas' : 'Tirar este candidato desta tabela')+'">✕</button></td>';
      } else {
        h += '<td>'+esc(c.nome)+'</td>'
          + '<td style="text-align:center;">'+esc(fmtNota(c.notaProva))+'</td>'
          + '<td style="text-align:center;">'+esc(fmtNota(c.notaEntrevista))+'</td>'
          + '<td style="text-align:center;">'+esc(fmtNota(c.notaFinal))+'</td>';
      }
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    if(editando) h += '<div class="download-row" style="margin:8px 0 0;"><button type="button" class="link-btn cfBtnAdd" data-grupo="'+grupo.k+'">+ Adicionar linha</button></div>';
    h += '</div>';
    return h;
  }

  function renderTabelas(){
    let h = '';
    if(estado.editando){
      h += '<div class="notice-banner" style="margin-left:0;"><strong>Modo de edição.</strong> '
        + 'Arraste a linha pela alça <strong>⠿</strong> — ou, com a alça em foco, use <strong>Alt+↑</strong> e <strong>Alt+↓</strong> — para mudar a ordem; '
        + 'a mesma pessoa muda de posição em todas as tabelas em que aparece. '
        + 'Os campos brancos podem ser corrigidos — a nota é a mesma pessoa em toda tabela. '
        + 'Preencher <strong>Nota Prova</strong> e <strong>Nota Entrevista</strong> calcula a <strong>Nota Final</strong> pela média automaticamente; '
        + 'editar a Nota Final à mão continua permitido, mas fica sinalizado se não bater com a média. '
        + '<strong>✕</strong> na tabela <strong>AMPLA CONCORRÊNCIA</strong> exclui o candidato por completo; nas demais, só tira daquela cota. '
        + 'Clique em <strong>Salvar alterações</strong> quando terminar — ou simplesmente saia do quadro (clique ou dê Tab para fora dele) que a edição é salva sozinha, sem risco de o edital sair com um valor digitado e nunca confirmado.</div>';
      h += '<div class="download-row" style="margin-top:14px;">'
        + '<button type="button" class="link-btn" id="cfBtnSalvarTabelas" style="background:var(--teal);color:var(--white);">Salvar alterações</button>'
        + '<button type="button" class="link-btn" id="cfBtnCancelarTabelas">Cancelar</button>'
        + '<button type="button" class="link-btn" id="cfBtnReordenarNota">Reordenar por nota final</button>'
        + '</div>';
      h += '<div id="cfAvisosTabelas"></div>';
    }
    GRUPOS_CF.forEach(g=>{ h += tabelaTela(g, estado.editando); });
    cfTabelas.innerHTML = h;
    if(estado.editando) ligarEventosEdicaoTabelas();
    cfBtnEditarTabelas.style.display = estado.editando ? 'none' : '';
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
  // saber se sair do bloco (ou clicar em "Salvar alterações") realmente
  // gravou as edições, principalmente no salvamento automático, que não
  // tem um clique explícito pra se apoiar.
  function avisarSalvo(){
    if(!cfStatusSalvo) return;
    const hora = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    cfStatusSalvo.textContent = 'Alterações salvas às ' + hora + '.';
    clearTimeout(statusSalvoTimer);
    statusSalvoTimer = setTimeout(()=>{ cfStatusSalvo.textContent = ''; }, 5000);
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
    else c[f] = paraNumero(el.value);
  }

  // Copia nome/notas do candidato para TODAS as linhas que o mostram (as
  // outras tabelas de cota em que ele também aparece), sem redesenhar —
  // é o que preserva o foco e a navegação por Tab durante a digitação.
  function refletirCandidatoNaTela(c){
    const linhas = cfTabelas.querySelectorAll('tr[data-id="'+c.id+'"]');
    const valores = { nome:c.nome, notaProva:fmtNota(c.notaProva), notaEntrevista:fmtNota(c.notaEntrevista), notaFinal:fmtNota(c.notaFinal) };
    Array.prototype.forEach.call(linhas, function(tr){
      Object.keys(valores).forEach(function(f){
        const inp = tr.querySelector('.cfIn[data-f="'+f+'"]');
        if(inp && document.activeElement!==inp) inp.value = valores[f];
      });
    });
  }

  function atualizarAvisosTabelas(){
    const box = $('cfAvisosTabelas');
    if(!box) return;
    const divergentes = estado.trabalho.filter(notaFinalDivergente);
    if(!divergentes.length){ box.innerHTML=''; return; }
    box.innerHTML = '<div class="notice-banner warn" style="margin:12px 0 0;margin-left:0;">'
      + '<strong>'+divergentes.length+' candidato(s) com a Nota Final diferente da média de Prova e Entrevista</strong> — o valor digitado foi mantido:'
      + lista(divergentes, function(c){
          return '<li>'+esc(c.nome||'(sem nome)')+' — final '+esc(fmtNota(c.notaFinal))+', média seria '+esc(fmtNota(calcularMedia(c)))+'</li>';
        })
      + '</div>';
  }

  // Move `idOrigem` para o lado de `idAlvo` na ordem única (trabalho) —
  // usado tanto pelo soltar do arrasto quanto pelo Alt+↑/↓. `grupoK`, quando
  // informado, devolve o foco pra alça da linha movida: renderTabelas()
  // recria a linha (e o que estivesse com foco nela se perde); sem
  // devolver o foco pra dentro do quadro, o "sair do bloco salva sozinho"
  // (ver o listener de focusout mais abaixo) fecharia o modo de edição a
  // cada arrasto ou tecla de mover — o oposto do que se quer aqui.
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
      const novo = cfTabelas.querySelector('.drag-handle[data-id="'+idOrigem+'"][data-grupo="'+grupoK+'"]');
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

  // Sorteia por NOTA FINAL, decrescente, estável — afeta a ordem única, então
  // vale para todas as tabelas de uma vez.
  function reordenarPorNotaFinal(){
    const comIdx = estado.trabalho.map((c,i)=>({c,i}));
    comIdx.sort((a,b)=>{
      const va = a.c.notaFinal==null ? -Infinity : a.c.notaFinal;
      const vb = b.c.notaFinal==null ? -Infinity : b.c.notaFinal;
      if(vb!==va) return vb-va;
      return a.i-b.i;
    });
    estado.trabalho = comIdx.map(x=>x.c);
    renderTabelas();
    // devolve o foco pro próprio botão — sem isso, o "sair do bloco salva
    // sozinho" fecharia o modo de edição a cada reordenação
    const btn = $('cfBtnReordenarNota');
    if(btn) btn.focus();
  }

  function ligarEventosEdicaoTabelas(){
    const q = cfTabelas;

    $('cfBtnSalvarTabelas').addEventListener('click', salvarEdicaoTabelas);
    $('cfBtnCancelarTabelas').addEventListener('click', cancelarEdicaoTabelas);
    $('cfBtnReordenarNota').addEventListener('click', reordenarPorNotaFinal);

    // 'change' NUNCA chama renderTabelas() aqui — redesenhar a tabela inteira
    // no meio da transição de foco do Tab destrói o campo que acabou de
    // receber o foco, e o navegador perde a posição (o Tab seguinte reinicia
    // do topo da página). Em vez disso, só o(s) campo(s) necessário(s) são
    // atualizados diretamente — o Tab nativo segue intacto.
    Array.prototype.forEach.call(q.querySelectorAll('.cfIn'), function(el){
      el.addEventListener('input', function(){ commitCampoTabela(el); });
      el.addEventListener('change', function(){
        commitCampoTabela(el);
        const tr = el.closest('tr');
        const c = estado.trabalho[idxTrabalho(Number(tr.dataset.id))];
        if(!c) return;
        const f = el.dataset.f;
        // maiúsculas já na montagem da tabela: corrigir o nome à mão também
        // entra maiúsculo, pra nunca destoar de quem veio da importação
        if(f==='nome'){ c.nome = c.nome.toUpperCase(); el.value = c.nome; }
        else el.value = fmtNota(c[f]);
        if(f==='notaProva' || f==='notaEntrevista'){
          const media = calcularMedia(c);
          if(media!=null) c.notaFinal = media;
        }
        refletirCandidatoNaTela(c);
        atualizarAvisosTabelas();
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
        // devolve o foco pra dentro do quadro (a linha excluída não existe
        // mais) — sem isso, o "sair do bloco salva sozinho" fecharia o modo
        // de edição a cada exclusão
        const salvar = $('cfBtnSalvarTabelas');
        if(salvar) salvar.focus();
      });
    });

    Array.prototype.forEach.call(q.querySelectorAll('.cfBtnAdd'), function(b){
      b.addEventListener('click', function(){
        const grupo = b.dataset.grupo;
        const novo = { id: estado.seq++, nome:'', notaProva:null, notaEntrevista:null, notaFinal:null,
                       ac:true, ppp:false, pcd:false, ind:false };
        novo[grupo] = true;
        estado.trabalho.push(novo);
        renderTabelas();
        const tr = q.querySelector('tr[data-id="'+novo.id+'"][data-grupo="'+grupo+'"]');
        const alvo = tr && tr.querySelector('.cfIn[data-f="nome"]');
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
        // passou para uma tabela diferente da de origem: não é destino válido,
        // mas limpa a marca deixada na tabela de origem para não ficar "presa"
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

  cfBtnEditarTabelas.addEventListener('click', ()=>{ if(!estado.editando) entrarEdicaoTabelas(); });

  /* Sair do bloco de edição sem clicar em "Salvar alterações" não pode
     deixar a mudança perdida — é o que faria o edital sair com valores
     antigos, sem o usuário perceber. Então tirar o foco do bloco INTEIRO
     (não de campo pra campo dentro dele, que é navegação normal) salva
     sozinho, como se tivesse clicado em "Salvar alterações".

     cfTabelas nunca é recriado (só o conteúdo dele, via innerHTML), então
     este único listener, ligado uma vez, continua valendo depois de cada
     redesenho. O setTimeout é necessário porque relatedTarget não é
     confiável em todo navegador/interação (ex.: clique em algo não-focável
     fora do bloco) — o próximo ciclo confere onde o foco realmente parou. */
  cfTabelas.addEventListener('focusout', (ev)=>{
    if(!estado.editando) return;
    if(ev.relatedTarget && cfTabelas.contains(ev.relatedTarget)) return;
    setTimeout(()=>{
      if(estado.editando && !cfTabelas.contains(document.activeElement)) salvarEdicaoTabelas();
    }, 0);
  });

  /* ---------------- passo 4 — dados do edital ---------------- */

  // Máscara do protocolo SEI: 0000000-00.0000.0.00.0000 (20 dígitos) — mesma
  // função do Ponto 14/18, reconstruída a partir dos dígitos a cada tecla.
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

  // Máscara do número do edital: NNNN/AAAA — os últimos 4 dígitos digitados
  // são sempre tratados como o ano; o resto vira o número, do jeito que sai
  // nos 3 exemplos ("4254/2026", "4753/2026").
  function ativarMascaraEdital(el){
    if(!el) return;
    el.addEventListener('input', function(){
      const d = el.value.replace(/\D/g,'').slice(0,9);
      el.value = d.length<=4 ? d : d.slice(0, d.length-4) + '/' + d.slice(-4);
    });
  }

  const MESES_EXTENSO=['janeiro','fevereiro','março','abril','maio','junho',
    'julho','agosto','setembro','outubro','novembro','dezembro'];
  function formatarDataExtenso(d){ return d.getDate()+' de '+MESES_EXTENSO[d.getMonth()]+' de '+d.getFullYear(); }

  function lerDataDoTexto(txt){
    const s = String(txt||'').trim();
    if(!s) return null;
    const m = /^(\d{1,2})\s+de\s+([a-zçãéô]+)\s+de\s+(\d{4})$/i.exec(semAcento(s).toLowerCase());
    if(!m) return null;
    const mi = MESES_EXTENSO.findIndex(mes=> semAcento(mes)===m[2]);
    if(mi<0) return null;
    return new Date(Number(m[3]), mi, Number(m[1]));
  }

  // Botão de calendário (📅) ao lado do campo de data por extenso.
  function ativarBotaoCalendario(inputEl){
    if(!inputEl) return;
    const wrap = document.createElement('span');
    wrap.className = 'campo-data-wrap';
    wrap.style.cssText = 'display:flex;align-items:stretch;gap:6px;width:100%;';
    inputEl.parentNode.insertBefore(wrap, inputEl);
    inputEl.style.flex = '1 1 auto';
    inputEl.style.width = 'auto';
    inputEl.style.minWidth = '0';
    wrap.appendChild(inputEl);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'date-pick-btn';
    btn.title = 'Abrir calendário';
    btn.setAttribute('aria-label','Abrir calendário');
    btn.textContent = '📅';
    wrap.appendChild(btn);

    const nativo = document.createElement('input');
    nativo.type = 'date';
    nativo.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
    wrap.appendChild(nativo);

    btn.addEventListener('click', ()=>{
      const d = lerDataDoTexto(inputEl.value);
      nativo.value = d ? (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')) : '';
      if(nativo.showPicker) nativo.showPicker(); else nativo.click();
    });
    nativo.addEventListener('change', ()=>{
      if(!nativo.value) return;
      const [y,mo,dd] = nativo.value.split('-').map(Number);
      inputEl.value = formatarDataExtenso(new Date(y, mo-1, dd));
      inputEl.dispatchEvent(new Event('change', {bubbles:true}));
    });
  }

  /* ---------------- passo 5 — geração dos blocos ---------------- */

  const P = "margin:0 0 10pt;font-family:'Times New Roman',Times,serif;font-size:11pt;";
  const C = P+'text-align:center;font-weight:bold;';
  // Espaçamento simples entre parágrafos (sem os 10pt de folga do P/C acima) —
  // usado só no bloco da assinatura, a pedido: nome, cargo e unidade colados.
  const P0 = "margin:0;font-family:'Times New Roman',Times,serif;font-size:11pt;";
  const C0 = P0+'text-align:center;font-weight:bold;';
  const LARGURA_COL_CF = { ordem:'56pt', notaProva:'80pt', notaEntrevista:'92pt', notaFinal:'75pt' };

  function tabelaImpressa(grupo){
    const lista_ = estado.cands.filter(c=> c[grupo.k] && c.nome && c.nome.trim());
    if(!lista_.length) return '';
    const cols = [
      {k:'ordem', t:'ORDEM'}, {k:'nome', t:'NOME'},
      {k:'notaProva', t:'NOTA PROVA'}, {k:'notaEntrevista', t:'NOTA ENTREVISTA'}, {k:'notaFinal', t:'NOTA FINAL'}
    ];
    const td = (k, cabecalho)=>{
      let s = 'border:1pt solid #000;padding:3pt 5pt;vertical-align:top;word-break:break-word;';
      // ORDEM nunca quebra linha ("1", "2"... e o próprio rótulo do cabeçalho);
      // as demais colunas continuam quebrando — é o que evita nome comprido
      // vazando por cima das colunas vizinhas.
      s += k==='ordem' ? 'white-space:nowrap;' : 'white-space:normal;';
      if(LARGURA_COL_CF[k]) s += 'width:'+LARGURA_COL_CF[k]+';';
      if(cabecalho) s += 'font-weight:bold;';
      return 'style="'+s+'"';
    };
    let h = '<table style="border:1pt solid #000;border-collapse:collapse;width:100%;max-width:100%;table-layout:fixed;margin:0 0 12pt;font-family:\'Times New Roman\',Times,serif;font-size:11pt;">';
    h += '<colgroup>'+cols.map(c=>'<col'+(LARGURA_COL_CF[c.k]?(' style="width:'+LARGURA_COL_CF[c.k]+';"'):'')+'>').join('')+'</colgroup>';
    // título da cota primeiro, cabeçalho das colunas embaixo — lido de cima
    // pra baixo, isso lê "que tabela é essa" antes de "que coluna é essa"
    h += '<tr><td colspan="'+cols.length+'" style="border:1pt solid #000;padding:3pt 5pt;font-weight:bold;text-align:center;">'+esc(grupo.rot)+'</td></tr>';
    h += '<tr>'+cols.map(c=>'<td '+td(c.k,true)+'>'+esc(c.t)+'</td>').join('')+'</tr>';
    lista_.forEach((c,i)=>{
      h += '<tr>'+cols.map(col=>{
        const v = (col.k==='ordem') ? String(i+1)
                : (col.k==='nome') ? c.nome.toUpperCase()
                : fmtNota(c[col.k]);
        return '<td '+td(col.k,false)+'>'+esc(v)+'</td>';
      }).join('')+'</tr>';
    });
    h += '</table>';
    return h;
  }

  function lerCamposDoc(){
    Object.keys(estado.doc).forEach(k=>{ const el=$('cfF_'+k); if(el) estado.doc[k]=el.value; });
  }
  function escreverCamposDoc(){
    Object.keys(estado.doc).forEach(k=>{ const el=$('cfF_'+k); if(el) el.value=estado.doc[k]||''; });
  }

  // Os 6 blocos, um por campo do modelo de blocos do Athos — mesma estrutura
  // usada no Ensalamento e na Convocação para Entrevista da Residência.
  function gerarEdital(){
    lerCamposDoc();
    const d = estado.doc;

    // Bloco 1 — nome do documento (não sai no PDF, é só o nome no SEI)
    const bTitulo = '<p style="'+C+'">EDITAL DE CLASSIFICAÇÃO FINAL N° '+esc(d.numEdital||'____/____')+' SEI! '+esc(d.sei||'____________')+'</p>';

    // Bloco 2 — Preâmbulo. Sem a linha do Tribunal: o modelo do Athos já a
    // imprime sozinho — repeti-la aqui duplicaria no documento final.
    let b2 = '<p style="'+C+'">EDITAL DE CLASSIFICAÇÃO FINAL</p>';
    b2 += '<p style="'+C+'">PROCESSO SELETIVO PARA O PROGRAMA DE RESIDÊNCIA JURÍDICA</p>';

    // Bloco 3 — Numeração
    let b3 = '<p style="'+C+'">EDITAL N° '+esc(d.numEdital||'____/____')+'</p>';
    b3 += '<p style="'+C+'">SEI!TJPR N° '+esc(d.sei||'____________')+'</p>';

    // Bloco 4 — Conteúdo: direto as tabelas, sem parágrafo introdutório —
    // é assim que sai nos editais publicados.
    let b4 = '';
    GRUPOS_CF.forEach(g=>{ b4 += tabelaImpressa(g); });

    // Bloco 5 — Data
    const b5 = '<p style="'+P+'text-align:center;">'+esc(d.cidade||'Curitiba')+', '+esc(d.dataAss||'____ de __________ de ____')+'.</p>';

    // Bloco 6 — Quem assina. Espaçamento simples entre as linhas (P0/C0) —
    // nome, cargo e unidade ficam colados, sem a folga de 10pt do resto do documento.
    let b6 = '<p style="'+C0+'">'+esc((d.assinante||'').toUpperCase())+'</p>';
    if(d.cargo) b6 += '<p style="'+P0+'text-align:center;">'+esc(d.cargo)+'</p>';
    if(d.unidade) b6 += '<p style="'+P0+'text-align:center;">'+esc(d.unidade)+'</p>';

    [bTitulo,b2,b3,b4,b5,b6].forEach((b,i)=>{
      $('cfBloco'+(i+1)).innerHTML = '<div style="font-family:\'Times New Roman\',Times,serif;font-size:11pt;color:#000;">'+b+'</div>';
    });

    cfSaidaBox.style.display = 'block';
    const faltando = [];
    if(!d.numEdital) faltando.push('nº do edital');
    if(!d.sei) faltando.push('nº SEI');
    if(!d.assinante) faltando.push('nome de quem assina');
    if(!estado.cands.length) faltando.push('candidatos');
    cfMsgSaida.innerHTML = faltando.length
      ? '<span style="color:var(--coral);">Faltou preencher: '+esc(faltando.join(', '))+'.</span>'
      : 'Edital gerado. Confira o texto de cada bloco antes de copiar.';
    rolarAte(cfSaidaBox);
  }

  async function copiarConteudo(el, msgOk){
    try{
      if(navigator.clipboard && window.ClipboardItem){
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([el.innerHTML],{type:'text/html'}),
          'text/plain': new Blob([el.innerText||el.textContent],{type:'text/plain'})
        })]);
        cfMsgSaida.textContent = msgOk;
        return;
      }
    }catch(e){ /* cai no método antigo abaixo */ }
    const sel = window.getSelection(), r = document.createRange();
    r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r);
    let ok = false;
    try{ ok = document.execCommand('copy'); }catch(e){ ok = false; }
    sel.removeAllRanges();
    cfMsgSaida.textContent = ok ? msgOk : 'Não foi possível copiar automaticamente; selecione o texto e use Ctrl+C.';
  }

  function copiarBloco(n){ copiarConteudo($('cfBloco'+n), 'Bloco copiado — cole no Athos ou no Word.'); }

  async function copiarTudo(){
    let html = '';
    for(let i=1;i<=6;i++) html += $('cfBloco'+i).innerHTML;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
    document.body.appendChild(tmp);
    try{ await copiarConteudo(tmp, 'Edital copiado — cole no Athos ou no Word.'); }
    finally{ tmp.remove(); }
  }

  function imprimirPdf(){
    const w = window.open('','_blank');
    if(!w){ cfMsgSaida.innerHTML = '<span style="color:var(--coral);">O navegador bloqueou a janela de impressão — permita pop-ups para esta página.</span>'; return; }
    let html = '';
    for(let i=1;i<=6;i++) html += $('cfBloco'+i).innerHTML;
    w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Edital de Classificação Final</title>'
      +'<style>@page{size:A4;margin:2.5cm 2cm;} body{font-family:"Times New Roman",Times,serif;font-size:11pt;color:#000;margin:0;}'
      +'table{border-collapse:collapse;width:100%;} td{border:1pt solid #000;padding:3pt 5pt;}</style></head><body>'
      +html+'</body></html>');
    w.document.close(); w.focus();
    setTimeout(()=>{ w.print(); },350);
  }

  function alternarEdicaoTexto(){
    const blocos = [1,2,3,4,5,6].map(i=>$('cfBloco'+i));
    const lig = blocos[0].getAttribute('contenteditable')==='true';
    blocos.forEach(el=>{
      el.setAttribute('contenteditable', lig?'false':'true');
      el.style.outline = lig?'none':'2px dashed var(--teal)';
    });
    $('cfBtnEditarTexto').textContent = lig ? 'Editar texto' : 'Concluir edição';
    if(!lig) blocos[0].focus();
  }

  cfBtnGerar.addEventListener('click', gerarEdital);
  $('cfBtnCopiarTudo').addEventListener('click', copiarTudo);
  $('cfBtnPDF').addEventListener('click', imprimirPdf);
  $('cfBtnEditarTexto').addEventListener('click', alternarEdicaoTexto);
  document.querySelectorAll('.cf-bloco-copiar').forEach(btn=>{
    btn.addEventListener('click', ()=>copiarBloco(btn.dataset.bloco));
  });

  estado.doc.dataAss = formatarDataExtenso(new Date());
  $('cfF_dataAss').value = estado.doc.dataAss;
  ativarBotaoCalendario($('cfF_dataAss'));
  ativarMascaraSei($('cfF_sei'));
  ativarMascaraEdital($('cfF_numEdital'));

  /* ---------------- K) rascunho (.json) ---------------- */

  function exportarRascunho(){
    lerCamposDoc();
    const dados = {
      ferramenta:'residencia-classificacao', versao:1, gerado:new Date().toISOString(),
      inscritos: estado.inscritos, cands: estado.cands, doc: estado.doc
    };
    const blob = new Blob([JSON.stringify(dados,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rascunho_classificacao_' + (estado.doc.numEdital||'sem_numero').replace(/[^\w-]/g,'_') + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function importarRascunho(file){
    const fr = new FileReader();
    fr.onload = ()=>{
      let d;
      try{ d = JSON.parse(fr.result); }
      catch(e){ alert('Arquivo de rascunho inválido (não é um JSON legível).'); return; }
      if(!d || (d.ferramenta && d.ferramenta!=='residencia-classificacao')){
        if(!confirm('Este rascunho não foi salvo por esta ferramenta. Tentar abrir assim mesmo?')) return;
      }
      estado.inscritos = Array.isArray(d.inscritos) ? d.inscritos : [];
      estado.cands = Array.isArray(d.cands) ? d.cands : [];
      estado.doc = Object.assign(estado.doc, d.doc||{});
      // seq precisa ficar acima de qualquer id já usado, senão um novo
      // registro pode colidir com um id existente no rascunho
      let maxId = 0;
      estado.inscritos.concat(estado.cands).forEach(x=>{ if(x.id>maxId) maxId=x.id; });
      estado.seq = maxId + 1;
      estado.editando = false;
      estado.trabalho = [];

      escreverCamposDoc();
      renderChecklist();
      if(estado.cands.length){ renderTabelas(); cfPasso3.style.display=''; cfPasso4.style.display=''; }
      if(estado.inscritos.length) cfPasso2.style.display='';
      status(cfStatus, 'Rascunho aberto: '+estado.inscritos.length+' inscrito(s), '+estado.cands.length+' na(s) tabela(s) de classificação.', 'ok');
    };
    fr.readAsText(file, 'UTF-8');
  }

  $('cfBtnExportar').addEventListener('click', exportarRascunho);
  $('cfBtnAbrirRascunho').addEventListener('click', ()=> $('cfRascunho').click());
  $('cfRascunho').addEventListener('change', (e)=>{ const f=e.target.files[0]; if(f) importarRascunho(f); e.target.value=''; });

  const cfDraft = $('cfDraft'), cfDraftToggle = $('cfDraftToggle');
  if(cfDraft && cfDraftToggle){
    cfDraftToggle.addEventListener('click', ()=>{
      const recolhida = cfDraft.classList.toggle('collapsed');
      cfDraftToggle.textContent = recolhida ? '+' : '–';
      cfDraftToggle.title = recolhida ? 'Abrir' : 'Recolher';
      cfDraftToggle.setAttribute('aria-expanded', recolhida ? 'false' : 'true');
    });
  }

  conferirPasso1();
}

/* Exposto para os testes automatizados (jsdom/Node) e para depuração. */
if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    paraNumero, fmtNota, chaveNome, semAcento, limpar, soDigitos,
    agruparLinhas, linhasDasPaginas, extrairTelefone, registroDaLinhaLista,
    reconhecerLista, listaParaTexto, lerQuadroLista,
    reservaDaModalidade, reservaTexto, GRUPOS_CF, candidatosDoGrupo,
    calcularMedia, notaFinalDivergente,
    estado
  };
}

})();
