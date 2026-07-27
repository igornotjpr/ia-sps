/* Ponto 18 — Convocação para Entrevista (Seção de Processo Seletivo, TJPR)

   Cobre toda a fase de divulgação da convocação:
     1) leitura do Relatório de convocação para entrevistas (.xlsx da Fábrica de Provas)
     2) alocação dos convocados em dias de entrevista (quadro do passo 2)
     3) preenchimento dos dados do documento
     4) geração, edição, cópia e impressão em PDF
     5) blocos separados para publicar o edital no Athos
     6) lista de e-mails em bloco único, separada por ponto e vírgula (para o SEI)

   100% client-side. Depende de vendor/xlsx.min.js (leitura da planilha) e de
   tjpr_logo.js (logotipo embutido em base64). Nenhum recurso é buscado na rede.

   Estrutura do arquivo:
     A) utilidades de texto, número, hora e data
     B) reserva (cotas) e leitura do relatório
     C) estado da ferramenta
     D) passo 1 — planilha da Fábrica de Provas
     E) passo 2 — quadro de alocação por dia
     F) passo 3 — dados da convocação
     G) passo 4 — geração do documento / cópia / PDF
     H) passo 5 — blocos para publicar no Athos
     I) passo 6 — lista de e-mails
     J) rascunho e inicialização
*/
(function(){
'use strict';

/* ==================== A) utilidades ==================== */

function $(id){ return document.getElementById(id); }
function esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function semAcento(s){ return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function normHeader(h){ return semAcento(h).toUpperCase().replace(/\s+/g,' ').trim(); }

// "8.00" -> 8 | "7,50" -> 7.5 | "" -> null
function paraNumero(txt){
  if(txt==null) return null;
  var s=String(txt).trim().replace(/\s/g,'').replace(',','.');
  if(s==='' || s==='-' || s==='--') return null;
  var v=Number(s);
  return isFinite(v) ? v : null;
}
// 7.5 -> "7,50" (sempre duas casas decimais, sempre vírgula, conforme o edital)
function fmtNota(v){
  var n=(typeof v==='number') ? v : paraNumero(v);
  if(n==null) return '';
  return n.toFixed(2).replace('.',',');
}

// aceita "1400", "14h", "14h30", "14:30", "14H30MIN" -> {h:14,m:30}
function interpretarHora(txt){
  var s=String(txt==null?'':txt).trim();
  if(!s) return null;
  var m=/^(\d{1,2})\s*[hH:]\s*(\d{1,2})\s*(?:m(?:in)?\.?)?$/.exec(s);
  if(m){
    var h=Number(m[1]), mi=Number(m[2]);
    return (h<=23 && mi<=59) ? {h:h, m:mi} : null;
  }
  m=/^(\d{1,2})\s*[hH]$/.exec(s);
  if(m && Number(m[1])<=23) return {h:Number(m[1]), m:0};
  m=/^(\d{3,4})$/.exec(s);
  if(m){
    var d=m[1], mi2=Number(d.slice(-2)), h2=Number(d.slice(0,-2));
    if(h2<=23 && mi2<=59) return {h:h2, m:mi2};
  }
  return null;
}
// {h:14,m:30} -> "14h30min" (formato usado nas convocações já expedidas)
function fmtHora(hora){
  if(!hora) return '';
  return String(hora.h).padStart(2,'0')+'h'+String(hora.m).padStart(2,'0')+'min';
}

// Máscara de data por reconstrução a partir dos dígitos: nunca duplica barra,
// funciona igual para "22072026" digitado e "22/07/2026" colado.
function ativarMascaraData(el){
  if(!el) return;
  el.addEventListener('input',function(){
    var d=el.value.replace(/\D/g,'').slice(0,8);
    var out=d.slice(0,2);
    if(d.length>2) out+='/'+d.slice(2,4);
    if(d.length>4) out+='/'+d.slice(4,8);
    el.value=out;
  });
}
// Máscara do protocolo SEI: 0000000-00.0000.0.00.0000 (20 dígitos)
function ativarMascaraSei(el){
  if(!el) return;
  el.addEventListener('input',function(){
    var d=el.value.replace(/\D/g,'').slice(0,20);
    var out=d.slice(0,7);
    if(d.length>7)  out+='-'+d.slice(7,9);
    if(d.length>9)  out+='.'+d.slice(9,13);
    if(d.length>13) out+='.'+d.slice(13,14);
    if(d.length>14) out+='.'+d.slice(14,16);
    if(d.length>16) out+='.'+d.slice(16,20);
    el.value=out;
  });
}
function lerDataBarra(txt){
  var m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(txt||'').trim());
  if(!m) return null;
  var d=new Date(Number(m[3]), Number(m[2])-1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
}
// Botão 📅 ao lado do campo de data: abre um <input type="date"> nativo oculto.
function ativarBotaoCalendario(el){
  if(!el) return;
  if(el.parentNode && el.parentNode.classList.contains('campo-data-wrap')) return;
  var wrap=document.createElement('span');
  wrap.className='campo-data-wrap';
  wrap.style.cssText='display:flex;align-items:stretch;gap:6px;width:100%;';
  el.parentNode.insertBefore(wrap, el);
  // min-width:0 é o que permite ao campo encolher dentro do rótulo; sem ele o
  // input mantém a largura intrínseca e empurra o botão 📅 para fora da caixa.
  el.style.flex='1 1 auto'; el.style.width='auto'; el.style.minWidth='0';
  wrap.appendChild(el);

  var btn=document.createElement('button');
  btn.type='button'; btn.className='date-pick-btn'; btn.title='Abrir calendário';
  btn.setAttribute('aria-label','Abrir calendário');
  btn.textContent='📅';
  wrap.appendChild(btn);

  var nativo=document.createElement('input');
  nativo.type='date';
  nativo.style.cssText='position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
  wrap.appendChild(nativo);

  btn.addEventListener('click',function(){
    var d=lerDataBarra(el.value);
    nativo.value = d ? (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')) : '';
    if(nativo.showPicker) nativo.showPicker(); else nativo.click();
  });
  nativo.addEventListener('change',function(){
    if(!nativo.value) return;
    var p=nativo.value.split('-');
    el.value=p[2]+'/'+p[1]+'/'+p[0];
    el.dispatchEvent(new Event('change',{bubbles:true}));
  });
}

function rolarAte(el){
  if(el && typeof el.scrollIntoView==='function'){
    try{ el.scrollIntoView({behavior:'smooth', block:'start'}); }catch(e){ el.scrollIntoView(); }
  }
}
function status(html, tipo){
  var n=$('p18Status');
  n.className='notice-banner'+(tipo?(' '+tipo):'');
  n.innerHTML=html;
  n.style.display='block';
}
function ehUrl(s){
  return /^(https?:\/\/|www\.)\S+$/i.test(String(s||'').trim());
}
function comHttp(s){
  s=String(s||'').trim();
  return /^https?:\/\//i.test(s) ? s : ('https://'+s);
}

/* ============= B) reserva (cotas) e leitura do relatório ============= */

// Mesma tabela de códigos do Ponto 20 / Edital de Classificação Final: a
// Fábrica de Provas nem sempre grava o rótulo exatamente igual, por isso cada
// código aceita várias grafias.
var RESERVA_MAP=[
  { code:'2.1.1', termos:['PRETO OU PARDO','PRETA OU PARDA','PRETO','PARDO','PRETA','PARDA','NEGRO','NEGRA','PPP','PNP'] },
  { code:'2.1.2', termos:['PESSOA COM DEFICIENCIA','PESSOA COM DEFICIENCIA (PCD)','PCD','DEFICIENTE','DEFICIENCIA'] },
  { code:'2.1.3', termos:['INDIGENA'] },
  { code:'2.1.4', termos:['VULNERABILIDADE SOCIAL','HIPOSSUFICIENTE','HIPOSSUFICIENCIA'] }
];
var CODIGOS_RESERVA=['2.1.1','2.1.2','2.1.3','2.1.4'];
// Valores que significam "não é cotista" — ausência de reserva, não erro.
var SEM_RESERVA=['','-','--','N/A','NA','NAO','NAO SE APLICA','NENHUMA','NENHUM',
                 'AMPLA CONCORRENCIA','AMPLA CONCORRENCIA (AC)','AC'];

// Célula do GRUPO CADASTRO -> { code:'2.1.1', desconhecidos:[...] }.
// Valores não reconhecidos nunca são descartados em silêncio: voltam em
// `desconhecidos` para virar aviso na tela.
function mapReserva(v){
  var partes=String(v==null?'':v).split(/[,;\/|]+/).map(normHeader).filter(function(p){ return p!==''; });
  var codes=[], desconhecidos=[];
  partes.forEach(function(p){
    if(SEM_RESERVA.indexOf(p)!==-1) return;
    var hit=null;
    RESERVA_MAP.forEach(function(r){ if(!hit && r.termos.indexOf(p)!==-1) hit=r; });
    if(hit){ if(codes.indexOf(hit.code)===-1) codes.push(hit.code); }
    else if(desconhecidos.indexOf(p)===-1){ desconhecidos.push(p); }
  });
  codes.sort();
  return { code:codes.join(', '), desconhecidos:desconhecidos };
}

// Cabeçalhos aceitos para cada campo do relatório da Fábrica de Provas.
var COLS_RELATORIO={
  classificacao:['CLASSIFICACAO','CLASSIFICACAO FINAL','CLASS','COLOCACAO','SITUACAO'],
  inscricao:['INSCRICAO','N INSCRICAO','NUMERO DE INSCRICAO','MATRICULA'],
  nome:['NOME','NOME DO ESTUDANTE','NOME DO CANDIDATO','CANDIDATO'],
  email:['E-MAIL','EMAIL','E MAIL','ENDERECO ELETRONICO'],
  prova:['PROVA','NOTA','NOTA DA PROVA','PONTUACAO'],
  grupoVaga:['GRUPO DA VAGA','GRUPO VAGA'],
  grupoUso:['GRUPO USO','GRUPO DE USO'],
  grupoCadastro:['GRUPO CADASTRO','GRUPO DE CADASTRO','RESERVA','RESERVA ESPECIAL'],
  nascimento:['NASCIMENTO','DATA DE NASCIMENTO','DT NASCIMENTO']
};

// Localiza a linha de cabeçalho dentro da matriz bruta (algumas exportações
// trazem título ou linhas em branco antes) e devolve {indice, mapa} com a
// posição de cada campo conhecido.
function localizarCabecalho(aoa){
  var melhor={indice:-1, mapa:null, acertos:0};
  var limite=Math.min(aoa.length, 15);
  for(var i=0;i<limite;i++){
    var celulas=(aoa[i]||[]).map(normHeader);
    var mapa={}, acertos=0;
    Object.keys(COLS_RELATORIO).forEach(function(campo){
      var idx=-1;
      COLS_RELATORIO[campo].forEach(function(rot){
        if(idx<0) idx=celulas.indexOf(normHeader(rot));
      });
      if(idx>=0){ mapa[campo]=idx; acertos++; }
    });
    if(acertos>melhor.acertos) melhor={indice:i, mapa:mapa, acertos:acertos};
  }
  return melhor.acertos>=3 ? melhor : null;
}

function lerPlanilha(file){
  return new Promise(function(resolve, reject){
    var fr=new FileReader();
    fr.onload=function(e){
      try{
        if(typeof XLSX==='undefined') throw new Error('biblioteca de planilhas não carregada (vendor/xlsx.min.js)');
        var wb=XLSX.read(new Uint8Array(e.target.result), {type:'array'});
        var ws=wb.Sheets[wb.SheetNames[0]];
        if(!ws) throw new Error('a planilha não tem nenhuma aba com dados');
        resolve(XLSX.utils.sheet_to_json(ws, {header:1, defval:'', raw:false, blankrows:false}));
      }catch(err){ reject(err); }
    };
    fr.onerror=function(){ reject(new Error('falha ao abrir o arquivo')); };
    fr.readAsArrayBuffer(file);
  });
}

/* ==================== C) estado ==================== */

var ASSINANTE_CARGO_PADRAO=
  'Chefe da Divisão de Seleção de Estagiários e Residentes, Formação de Talentos e Ambientação\n'
 +'Coordenadoria de Desenvolvimento Humano e Organizacional\n'
 +'Secretaria de Gestão de Pessoas';

var estado={
  cols:{ reserva:false, link:false },   // Data e Horário são derivados da alocação
  // cand: {id,inscricao,nome,nota,reserva,diaId,hora,linkTexto,linkUrl,email}
  //   `diaId` aponta para um item de `dias`; a data nunca fica na linha, o que
  //   permite mover o candidato de dia sem tocar em mais nada.
  cands:[],
  dias:[],        // [{id, data:'27/07/2026'}] — ordem de impressão da tabela
  diaSeq:1,
  doc:{
    ano:String(new Date().getFullYear()),
    sei:'', unidade:'',
    modalidade:'Presencial', local:'', endereco:'',
    observacoes:'O candidato que não comparecer à entrevista será desclassificado do processo seletivo.',
    // exclusivos da publicação no Athos (passo 5)
    nEditalAbertura:'', cidadeAthos:'Curitiba', dataAthos:'',
    assinanteNome:'João Pedro de Paula Soares Valente',
    assinanteCargo:ASSINANTE_CARGO_PADRAO
  },
  seq:1,
  avisosImport:[],
  descartados:0
};

function novoCand(){
  return {id:estado.seq++, inscricao:'', nome:'', nota:null, reserva:'',
          diaId:null, hora:null, linkTexto:'', linkUrl:'', email:''};
}

/* ============ D) passo 1 — planilha da Fábrica de Provas ============ */

function importarRelatorio(aoa){
  var cab=localizarCabecalho(aoa);
  if(!cab){
    status('<strong>Não reconheci esta planilha como o Relatório de convocação para entrevistas.</strong> '
      +'Esperava encontrar uma linha de cabeçalho com, ao menos, <strong>INSCRIÇÃO</strong>, <strong>NOME</strong> e <strong>PROVA</strong>. '
      +'Confira se o arquivo é o baixado na Fábrica de Provas e se a primeira aba é a do ranking.','warn');
    return;
  }
  var m=cab.mapa;
  var faltando=['inscricao','nome','prova'].filter(function(k){ return m[k]===undefined; });
  if(faltando.length){
    status('<strong>Faltam colunas essenciais na planilha:</strong> '+esc(faltando.join(', ').toUpperCase())+'. Nada foi importado.','warn');
    return;
  }

  var cands=[], avisos=[], descartados=0, temReserva=false;

  for(var i=cab.indice+1; i<aoa.length; i++){
    var linha=aoa[i]||[];
    var cel=function(k){ return m[k]===undefined ? '' : String(linha[m[k]]==null?'':linha[m[k]]).trim(); };

    var nome=cel('nome');
    var inscricao=cel('inscricao').replace(/\.0+$/,'').replace(/\D/g,'');
    if(!nome && !inscricao) continue;                       // linha em branco

    var classificacao=normHeader(cel('classificacao'));
    if(/REPROV|ELIMIN|DESCLASSIFIC|AUSENTE|FALTOU/.test(classificacao)){ descartados++; continue; }

    var c=novoCand();
    c.inscricao=inscricao;
    c.nome=nome.toUpperCase();
    c.email=cel('email').toLowerCase();

    var bruta=cel('prova');
    c.nota=paraNumero(bruta);
    if(c.nota===null && bruta!==''){
      avisos.push('Linha '+(i+1)+' da planilha ('+nome+'): não entendi a nota “'+bruta+'”. O campo ficou em branco.');
    }

    var r=mapReserva(cel('grupoCadastro'));
    c.reserva=r.code;
    if(c.reserva) temReserva=true;
    if(r.desconhecidos.length){
      avisos.push('Linha '+(i+1)+' da planilha ('+nome+'): reserva não reconhecida em GRUPO CADASTRO — “'+r.desconhecidos.join(', ')+'”. A coluna RESERVA ficou em branco; preencha à mão se for o caso.');
    }
    if(!c.inscricao) avisos.push('Linha '+(i+1)+' da planilha ('+nome+'): inscrição em branco ou não numérica.');

    cands.push(c);
  }

  if(!cands.length){
    status('<strong>Nenhum candidato aproveitado.</strong> A planilha foi lida, mas todas as linhas ou estavam vazias ou constavam como reprovadas ('+descartados+' descartada(s)).','warn');
    return;
  }

  estado.cands=cands;
  estado.avisosImport=avisos;
  estado.descartados=descartados;
  // Um relatório novo é um trabalho novo: RESERVA é religada conforme a lista, e
  // Horário/Link voltam a desligadas para não sobrar coluna vazia de um edital
  // anterior feito na mesma sessão.
  // um relatório novo é um trabalho novo: nenhuma data, todos a atribuir
  estado.dias=[];
  estado.cands.forEach(function(c){ c.diaId=null; });
  estado.cols.reserva=temReserva;
  estado.cols.link=false;

  sincronizarControles();
  renderQuadro();

  var msg='<strong>'+cands.length+' convocado(s)</strong> importado(s)';
  if(descartados) msg+=' — <strong>'+descartados+'</strong> reprovado(s) descartado(s)';
  msg+='. A coluna RESERVA foi '+(temReserva?'ligada (há cotistas na lista)':'mantida desligada (nenhum cotista na lista)')+'.';
  if(avisos.length) msg+=' Há <strong>'+avisos.length+' ponto(s)</strong> para conferir logo abaixo da tabela.';
  status(msg, avisos.length?'warn':'ok');
  rolarAte($('p18Quadro'));
}

/* ============== E) passo 2 — quadro de alocação por dia ==============

   O trabalho segue o fluxo real da unidade: importa-se o relatório, todo mundo
   cai em "A atribuir" na ordem de classificação, e o usuário vai criando datas
   e puxando candidatos para elas — sempre os primeiros colocados primeiro.
   Cada dia tem tabela e horários próprios; arrastar entre blocos realoca.

   Modelo: o dia é uma entidade com identidade (id, data, regime de horário) e
   o candidato só guarda `diaId` (null = ainda não alocado). Mover de dia é
   trocar um campo — foi o que destravou o arrastar entre dias.            */

function novoDia(data){
  return {id:estado.diaSeq++, data:String(data||''),
          horarioModo:'individual',        // 'individual' | 'geral'
          horaInicial:'14h00', intervalo:15, horarioGeral:''};
}
function diaPorId(id){
  var achado=null;
  estado.dias.forEach(function(d){ if(d.id===id) achado=d; });
  return achado;
}
function indiceDoDia(id){
  var i=-1;
  estado.dias.forEach(function(d,k){ if(d.id===id) i=k; });
  return i;
}
function candPorId(id){
  var achado=null;
  estado.cands.forEach(function(c){ if(c.id===id) achado=c; });
  return achado;
}
function indiceDoId(id){
  var i=-1;
  estado.cands.forEach(function(c,k){ if(c.id===id) i=k; });
  return i;
}
function linhasDoDia(diaId){
  return estado.cands.filter(function(c){ return c.diaId===diaId; });
}
function naoAlocados(){
  return estado.cands.filter(function(c){ return !c.diaId; });
}
function comNome(lista){
  return lista.filter(function(c){ return c.nome.trim(); });
}
// Dias que efetivamente entram no documento (dia sem ninguém não é impresso).
function diasComCandidatos(){
  return estado.dias.filter(function(d){ return comNome(linhasDoDia(d.id)).length; });
}

// Invariante da ordem: `estado.cands` é sempre "dia 1, dia 2, …, a atribuir".
// A tabela é impressa exatamente nessa ordem, então o agrupamento tem de ser
// estável — a ordem relativa dentro de cada grupo é preservada.
function normalizarOrdem(){
  var validos={};
  estado.dias.forEach(function(d){ validos[d.id]=true; });
  estado.cands.forEach(function(c){ if(c.diaId && !validos[c.diaId]) c.diaId=null; });
  var saida=[];
  estado.dias.forEach(function(d){
    estado.cands.forEach(function(c){ if(c.diaId===d.id) saida.push(c); });
  });
  estado.cands.forEach(function(c){ if(!c.diaId) saida.push(c); });
  estado.cands=saida;
}

function fmtDataBarra(d){
  return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
}

/* ---------------- criar uma data e puxar candidatos ---------------- */

function criarData(){
  var data=String($('p18NovaData').value||'').trim();
  if(!lerDataBarra(data)){ alert('Informe a data da entrevista no formato dd/mm/aaaa.'); return; }
  if(estado.dias.some(function(d){ return d.data===data; })){
    if(!confirm('Já existe um dia com a data '+data+'. Criar assim mesmo?')) return;
  }

  var disponiveis=comNome(naoAlocados());
  if(!disponiveis.length){ alert('Não há candidatos em “A atribuir”. Todos já estão em alguma data.'); return; }

  var modo=$('p18QuantosModo').value;
  var quantos = modo==='todos' ? disponiveis.length : (Number($('p18Quantos').value)||0);
  if(quantos<1){ alert('Informe quantos candidatos serão alocados nesta data.'); return; }
  if(quantos>disponiveis.length) quantos=disponiveis.length;

  var dia=novoDia(data);
  estado.dias.push(dia);
  // "primeiros colocados primeiro": a lista de não alocados já está na ordem
  // de classificação importada, então basta pegar os N do começo
  disponiveis.slice(0, quantos).forEach(function(c){ c.diaId=dia.id; });

  $('p18NovaData').value='';
  renderQuadro();
  var restam=comNome(naoAlocados()).length;
  $('p18NotaCriar').textContent = quantos+' alocado(s) em '+data
    + (restam ? ' · '+restam+' ainda a atribuir' : ' · todos alocados');
}

// Desfazer um dia devolve os candidatos para "A atribuir" — nada some.
function desfazerDia(id){
  var i=indiceDoDia(id);
  if(i<0) return;
  estado.cands.forEach(function(c){ if(c.diaId===id) c.diaId=null; });
  estado.dias.splice(i,1);
  renderQuadro();
}

/* ---------------- horários, por dia ---------------- */

function preencherHorariosDoDia(diaId){
  var dia=diaPorId(diaId);
  if(!dia) return;
  var ini=interpretarHora(dia.horaInicial);
  if(!ini){ alert('Informe o horário inicial no formato 14h00, 14:00 ou 1400.'); return; }
  var passo=Number(dia.intervalo)||0;
  var min=ini.h*60+ini.m;
  comNome(linhasDoDia(diaId)).forEach(function(c){
    c.hora={h:Math.floor(min/60)%24, m:min%60};
    min+=passo;
  });
  renderQuadro();
}

/* ---------------- colunas do documento ----------------

   Data e Horário não são mais caixas que o usuário marca: saem da alocação.
   Com um único dia e horário igual para todos, as duas informações vão para as
   linhas DATA:/HORÁRIO: acima da tabela — que é o formato das convocações já
   expedidas pela unidade. Havendo mais de um dia, ou horário por candidato,
   viram colunas.                                                            */

function precisaColunaData(){
  return diasComCandidatos().length>1;
}
function precisaColunaHora(){
  var dias=diasComCandidatos();
  if(!dias.length) return false;
  if(dias.length===1 && dias[0].horarioModo==='geral') return false;
  return dias.some(function(d){
    return d.horarioModo==='geral'
      ? String(d.horarioGeral||'').trim()!==''
      : comNome(linhasDoDia(d.id)).some(function(c){ return !!c.hora; });
  });
}
function colunasAtivas(){
  var cols=[{k:'inscricao', t:'INSCRIÇÃO'}, {k:'nome', t:'NOME DO ESTUDANTE'}, {k:'nota', t:'NOTA'}];
  if(estado.cols.reserva) cols.push({k:'reserva', t:'RESERVA'});
  if(precisaColunaData())  cols.push({k:'data', t:'DATA'});
  if(precisaColunaHora())  cols.push({k:'hora', t:'HORÁRIO'});
  if(estado.cols.link)     cols.push({k:'link', t:'LINK'});
  return cols;
}
// Horário que vale para um candidato: o do dia, quando o dia usa horário único.
function horaDoCandidato(c){
  var dia=diaPorId(c.diaId);
  if(dia && dia.horarioModo==='geral') return String(dia.horarioGeral||'').trim();
  return fmtHora(c.hora);
}

/* ---------------- avisos ---------------- */

function avisosGrade(){
  var av=[];
  estado.avisosImport.forEach(function(t){ av.push({txt:t}); });

  estado.cands.forEach(function(c,i){
    var n=i+1;
    var quem=c.nome ? (' ('+c.nome+')') : '';
    if(!c.nome.trim())      av.push({id:c.id, txt:'Linha '+n+': nome em branco.'});
    if(!String(c.inscricao).trim()) av.push({id:c.id, txt:'Linha '+n+quem+': inscrição em branco.'});
    if(c.nota==null)        av.push({id:c.id, txt:'Linha '+n+quem+': nota em branco.'});
    else if(c.nota<0 || c.nota>10) av.push({id:c.id, txt:'Linha '+n+quem+': nota fora da faixa 0–10 ('+fmtNota(c.nota)+').'});
    if(c.reserva && CODIGOS_RESERVA.indexOf(c.reserva)===-1)
      av.push({id:c.id, txt:'Linha '+n+quem+': código de reserva “'+c.reserva+'” não previsto no edital.'});
    if(c.email && c.email.indexOf('@')===-1)
      av.push({id:c.id, txt:'Linha '+n+quem+': o e-mail “'+c.email+'” não parece válido.'});
    if(estado.cols.link && !c.linkUrl.trim() && c.nome.trim())
      av.push({id:c.id, txt:'Linha '+n+quem+': coluna Link ligada, mas esta linha está sem endereço.'});
  });

  // não alocados: o documento simplesmente não os traz — precisa ser explícito
  var sobrando=comNome(naoAlocados());
  if(sobrando.length){
    av.push({txt:sobrando.length+' candidato(s) ainda em “A atribuir” — eles NÃO entram no documento: '
      +sobrando.slice(0,6).map(function(c){ return c.nome; }).join(', ')
      +(sobrando.length>6?'…':'')+'.'});
  }

  estado.dias.forEach(function(d,k){
    var rotulo=(k+1)+'º dia';
    var lista=comNome(linhasDoDia(d.id));
    if(!String(d.data||'').trim()) av.push({txt:rotulo+': sem data preenchida.'});
    else if(!lerDataBarra(d.data)) av.push({txt:rotulo+': a data “'+d.data+'” não está no formato dd/mm/aaaa.'});
    if(!lista.length){ av.push({txt:rotulo+' ('+(d.data||'sem data')+'): nenhum candidato — não será impresso.'}); return; }
    if(d.horarioModo==='geral'){
      if(!String(d.horarioGeral||'').trim())
        av.push({txt:rotulo+': horário único para o dia ainda não informado.'});
    } else {
      var sem=lista.filter(function(c){ return !c.hora; }).length;
      if(sem && sem<lista.length) av.push({txt:rotulo+': '+sem+' candidato(s) sem horário.'});
      var vistos={};
      lista.forEach(function(c){
        if(!c.hora) return;
        var kk=c.hora.h+':'+c.hora.m;
        if(vistos[kk]) av.push({txt:rotulo+' ('+(d.data||'sem data')+'): horário '+fmtHora(c.hora)+' repetido.'});
        vistos[kk]=true;
      });
    }
  });

  // datas repetidas entre dias
  var porData={};
  estado.dias.forEach(function(d,k){
    var v=String(d.data||'').trim();
    if(!v) return;
    if(porData[v]) av.push({txt:(k+1)+'º dia: a data '+v+' já é a do '+porData[v]+'º dia.'});
    else porData[v]=k+1;
  });

  // Empate na última colocação — item 6 do edital
  var todos=comNome(estado.cands).filter(function(c){ return c.nota!=null; });
  if(todos.length>1){
    var menor=Math.min.apply(null, todos.map(function(c){ return c.nota; }));
    var empatados=todos.filter(function(c){ return Math.abs(c.nota-menor)<0.005; });
    if(empatados.length>1){
      av.push({txt:'Item 6 do edital — '+empatados.length+' candidatos empatados na menor nota da lista ('+fmtNota(menor)+'): '
        +empatados.map(function(c){ return c.nome; }).join(', ')
        +'. Confira no edital de classificação se há outros candidatos com esta mesma nota que também devam ser convocados.'});
    }
  }

  // Inscrições repetidas
  var porInsc={};
  estado.cands.forEach(function(c){
    var k=String(c.inscricao).trim();
    if(!k) return;
    (porInsc[k]=porInsc[k]||[]).push(c);
  });
  Object.keys(porInsc).forEach(function(k){
    if(porInsc[k].length>1) av.push({txt:'Inscrição '+k+' aparece em '+porInsc[k].length+' linhas.'});
  });

  return av;
}

/* ---------------- desenho do quadro ---------------- */

function inputCel(campo, valor, largura, centro){
  return '<input class="p18In" data-f="'+campo+'" value="'+esc(valor)+'"'
    +' style="width:100%;min-width:'+largura+';padding:5px;border:1px solid var(--line);font-size:12.5px;'
    +(centro?'text-align:center;':'')+'">';
}

function tabelaDoBloco(lista, mostrarHora){
  if(!lista.length){
    return '<p class="zona-vazia">nenhum candidato aqui — arraste uma linha para cá</p>';
  }
  var h='<div class="table-scroll" style="max-height:none;"><table class="cv-grade-table" style="white-space:normal;font-family:\'Barlow\',system-ui,sans-serif;font-size:12.5px;">';
  h+='<thead><tr><th style="width:30px;"></th><th style="width:34px;">#</th><th style="width:96px;">Inscrição</th><th>Nome do estudante</th><th style="width:70px;">Nota</th>';
  if(estado.cols.reserva) h+='<th style="width:86px;">Reserva</th>';
  if(mostrarHora)         h+='<th style="width:84px;">Horário</th>';
  if(estado.cols.link)    h+='<th style="width:190px;">Link (texto e endereço)</th>';
  h+='<th style="width:190px;">E-mail</th><th style="width:60px;">Ações</th></tr></thead><tbody>';
  lista.forEach(function(c){
    h+='<tr data-id="'+c.id+'" draggable="false">';
    h+='<td style="text-align:center;width:30px;"><button type="button" class="drag-handle" data-id="'+c.id+'" tabindex="0" title="Arrastar para remanejar ou mudar de dia (ou Alt+↑ / Alt+↓)" aria-label="Remanejar '+esc(c.nome||'linha')+'">⠿</button></td>';
    h+='<td style="text-align:center;color:var(--ink-soft);">'+(indiceDoId(c.id)+1)+'</td>';
    h+='<td>'+inputCel('inscricao', c.inscricao, '80px', true)+'</td>';
    h+='<td>'+inputCel('nome', c.nome, '190px', false)+'</td>';
    h+='<td>'+inputCel('nota', fmtNota(c.nota), '56px', true)+'</td>';
    if(estado.cols.reserva){
      h+='<td><select class="p18Sel" data-f="reserva" style="width:100%;padding:5px;border:1px solid var(--line);font-size:12.5px;">';
      h+='<option value=""'+(c.reserva===''?' selected':'')+'>—</option>';
      CODIGOS_RESERVA.forEach(function(cod){
        h+='<option value="'+cod+'"'+(c.reserva===cod?' selected':'')+'>'+cod+'</option>';
      });
      // código vindo da planilha que não está na lista: preservado, nunca sobrescrito em silêncio
      if(c.reserva && CODIGOS_RESERVA.indexOf(c.reserva)===-1)
        h+='<option value="'+esc(c.reserva)+'" selected>'+esc(c.reserva)+'</option>';
      h+='</select></td>';
    }
    if(mostrarHora) h+='<td>'+inputCel('hora', fmtHora(c.hora), '68px', true)+'</td>';
    if(estado.cols.link){
      h+='<td>'+inputCel('linkTexto', c.linkTexto, '150px', false)
        +'<div style="height:4px;"></div>'+inputCel('linkUrl', c.linkUrl, '150px', false)+'</td>';
    }
    h+='<td>'+inputCel('email', c.email, '170px', false)+'</td>';
    h+='<td style="text-align:center;"><button type="button" class="p18Act" tabindex="-1" data-a="apaga" title="Excluir linha">✕</button></td>';
    h+='</tr>';
  });
  return h+'</tbody></table></div>';
}

function renderQuadro(){
  normalizarOrdem();
  var h='';

  estado.dias.forEach(function(d,k){
    var lista=linhasDoDia(d.id);
    var n=comNome(lista).length;
    var individual = d.horarioModo!=='geral';
    h+='<section class="bloco-dia" data-dia="'+d.id+'">';
    h+='<div class="bloco-dia-cab">'
      +'<p class="bloco-dia-tit">'+(k+1)+'º dia</p>'
      +'<label class="campo-vert campo-data">data'
      +'<input type="text" class="p18DataDia" data-dia="'+d.id+'" value="'+esc(d.data)+'" placeholder="dd/mm/aaaa">'
      +'</label>'
      +'<span class="bloco-dia-qtd">'+n+' candidato'+(n===1?'':'s')+'</span>'
      +'<span class="bloco-dia-acoes"><button type="button" class="link-btn p18DiaAct" data-a="desfazer" data-dia="'+d.id+'" title="Devolve os candidatos para “A atribuir”">Desfazer dia</button></span>'
      +'</div>';

    h+='<div class="bloco-dia-horarios">'
      +'<label class="campo-check"><input type="radio" name="modo_'+d.id+'" class="p18ModoHora" data-dia="'+d.id+'" value="individual"'+(individual?' checked':'')+'> um horário por candidato</label>';
    if(individual){
      h+='<label class="campo-vert">a partir de<input type="text" class="p18HoraIni" data-dia="'+d.id+'" value="'+esc(d.horaInicial)+'" style="width:88px;text-align:center;"></label>'
        +'<label class="campo-vert">intervalo (min)<input type="number" class="p18Interv" data-dia="'+d.id+'" value="'+esc(d.intervalo)+'" min="0" max="240"></label>'
        +'<button type="button" class="link-btn p18DiaAct" data-a="horarios" data-dia="'+d.id+'">Preencher horários</button>';
    }
    h+='<span style="width:1px;align-self:stretch;background:var(--paper-dark);"></span>'
      +'<label class="campo-check"><input type="radio" name="modo_'+d.id+'" class="p18ModoHora" data-dia="'+d.id+'" value="geral"'+(individual?'':' checked')+'> mesmo horário para todos</label>';
    if(!individual){
      h+='<label class="campo-vert">horário do dia<input type="text" class="p18HoraGeral" data-dia="'+d.id+'" value="'+esc(d.horarioGeral)+'" placeholder="14h00min" style="width:110px;text-align:center;"></label>';
    }
    h+='</div>';

    h+='<div class="bloco-dia-corpo">'+tabelaDoBloco(lista, individual)+'</div>';
    h+='</section>';
  });

  var sobra=naoAlocados();
  h+='<section class="bloco-dia sem-dia" data-dia="0">'
    +'<div class="bloco-dia-cab">'
    +'<p class="bloco-dia-tit">A atribuir</p>'
    +'<span class="bloco-dia-qtd">'+comNome(sobra).length+' candidato(s) sem data</span>'
    +'</div>'
    +'<div class="bloco-dia-corpo">'+tabelaDoBloco(sobra, false)+'</div>'
    +'</section>';

  if(!estado.cands.length){
    h='<p class="empty-hint">Nenhum convocado ainda. Envie o relatório no passo 1 ou use “Acrescentar linha”.</p>';
  }
  $('p18Quadro').innerHTML=h;

  ligarEventosDoQuadro();
  atualizarAvisos();
  atualizarDraftNota();
  atualizarResumoAlocacao();
}

function ligarEventosDoQuadro(){
  var q=$('p18Quadro');

  // A grade NÃO é redesenhada a cada tecla: o estado é atualizado no evento e
  // só os avisos são refeitos. Assim o Tab nativo continua funcionando e o
  // foco nunca se perde no meio da digitação.
  Array.prototype.forEach.call(q.querySelectorAll('.p18In'), function(inp){
    inp.addEventListener('input', function(){ commitCampo(inp); atualizarAvisos(); });
    inp.addEventListener('change', function(){ commitCampo(inp); normalizarExibicao(inp); atualizarAvisos(); });
  });
  Array.prototype.forEach.call(q.querySelectorAll('.p18Sel'), function(sel){
    sel.addEventListener('change', function(){ commitCampo(sel); atualizarAvisos(); });
  });
  Array.prototype.forEach.call(q.querySelectorAll('.p18Act'), function(b){
    b.addEventListener('click', function(){
      var i=indiceDoId(Number(b.closest('tr').dataset.id));
      if(i>=0) estado.cands.splice(i,1);
      renderQuadro();
    });
  });

  // data do dia: reflete na hora, sem redesenhar (não tirar o foco do campo)
  Array.prototype.forEach.call(q.querySelectorAll('.p18DataDia'), function(inp){
    mascararDataNoCampo(inp);
    ativarBotaoCalendario(inp);
    inp.addEventListener('input', function(){
      var d=diaPorId(Number(inp.dataset.dia));
      if(d) d.data=inp.value;
      atualizarAvisos();
      atualizarResumoAlocacao();
    });
  });
  Array.prototype.forEach.call(q.querySelectorAll('.p18HoraIni'), function(inp){
    inp.addEventListener('input', function(){
      var d=diaPorId(Number(inp.dataset.dia));
      if(d) d.horaInicial=inp.value;
    });
  });
  Array.prototype.forEach.call(q.querySelectorAll('.p18Interv'), function(inp){
    inp.addEventListener('input', function(){
      var d=diaPorId(Number(inp.dataset.dia));
      if(d) d.intervalo=Number(inp.value)||0;
    });
  });
  Array.prototype.forEach.call(q.querySelectorAll('.p18HoraGeral'), function(inp){
    inp.addEventListener('input', function(){
      var d=diaPorId(Number(inp.dataset.dia));
      if(d) d.horarioGeral=inp.value;
      atualizarAvisos();
      atualizarResumoAlocacao();
    });
  });
  Array.prototype.forEach.call(q.querySelectorAll('.p18ModoHora'), function(r){
    r.addEventListener('change', function(){
      var d=diaPorId(Number(r.dataset.dia));
      if(!d || !r.checked) return;
      d.horarioModo=r.value;
      renderQuadro();
    });
  });
  Array.prototype.forEach.call(q.querySelectorAll('.p18DiaAct'), function(b){
    b.addEventListener('click', function(){
      var id=Number(b.dataset.dia);
      if(b.dataset.a==='desfazer') desfazerDia(id);
      else if(b.dataset.a==='horarios') preencherHorariosDoDia(id);
    });
  });

  ligarArrastarSoltar();
}

function candDaLinha(el){
  var tr=el.closest('tr');
  return tr ? candPorId(Number(tr.dataset.id)) : null;
}
function commitCampo(el){
  var c=candDaLinha(el);
  if(!c) return;
  var f=el.dataset.f, v=el.value;
  if(f==='nota')       c.nota=paraNumero(v);
  else if(f==='hora')  c.hora=interpretarHora(v);
  else if(f==='nome')  c.nome=v.toUpperCase();
  else if(f==='email') c.email=v.trim();
  else if(f==='inscricao') c.inscricao=v.trim();
  else c[f]=v;
}
// Reescreve o campo no formato final quando o usuário sai dele (7,5 -> 7,50 |
// 1400 -> 14h00min | nome em maiúsculas), sem redesenhar o quadro inteiro.
function normalizarExibicao(inp){
  var c=candDaLinha(inp);
  if(!c) return;
  var f=inp.dataset.f;
  if(f==='nota' && c.nota!=null) inp.value=fmtNota(c.nota);
  else if(f==='hora') inp.value=fmtHora(c.hora);
  else if(f==='nome') inp.value=c.nome;
}
function mascararDataNoCampo(el){
  el.addEventListener('input', function(){
    var d=el.value.replace(/\D/g,'').slice(0,8);
    var out=d.slice(0,2);
    if(d.length>2) out+='/'+d.slice(2,4);
    if(d.length>4) out+='/'+d.slice(4,8);
    el.value=out;
  });
}

function atualizarAvisos(){
  var av=avisosGrade();
  var comAviso={};
  av.forEach(function(a){ if(a.id) comAviso[a.id]=true; });

  Array.prototype.forEach.call($('p18Quadro').querySelectorAll('tbody tr[data-id]'), function(tr){
    tr.classList.toggle('unmatched', !!comAviso[Number(tr.dataset.id)]);
  });

  var reais=comNome(estado.cands);
  var ah='';
  if(av.length){
    ah='<div class="notice-banner warn" style="margin-left:0;"><strong>'+av.length+' ponto(s) para conferir — nada foi alterado automaticamente:</strong>'
      +'<ul class="warn-list" style="color:var(--ink-soft);">'
      +av.map(function(a){ return '<li>'+esc(a.txt)+'</li>'; }).join('')+'</ul></div>';
  } else if(reais.length){
    ah='<div class="notice-banner ok" style="margin-left:0;">Nenhuma inconsistência encontrada nos '+reais.length+' convocados.</div>';
  }
  $('p18Avisos').innerHTML=ah;

  var cotistas=reais.filter(function(c){ return c.reserva; }).length;
  var comEmail=reais.filter(function(c){ return c.email.indexOf('@')>0; }).length;
  var alocados=reais.filter(function(c){ return c.diaId; }).length;
  $('p18Resumo').textContent = reais.length
    ? (reais.length+' convocado(s) · '+alocados+' alocado(s) em '+estado.dias.length+' dia(s) · '
       +cotistas+' com reserva · '+comEmail+' com e-mail'
       + (estado.descartados ? ' · '+estado.descartados+' reprovado(s) descartado(s)' : ''))
    : '';
}

// Resumo que aparece no passo 3, já que data e horário saíram de lá.
function atualizarResumoAlocacao(){
  var el=$('p18ResumoAlocacao');
  if(!el) return;
  var dias=diasComCandidatos();
  if(!dias.length){
    el.className='notice-banner warn';
    el.innerHTML='Nenhum candidato alocado ainda — volte ao passo 2 e crie ao menos uma data de entrevista.';
    return;
  }
  var partes=dias.map(function(d){
    var n=comNome(linhasDoDia(d.id)).length;
    var hora = d.horarioModo==='geral'
      ? (String(d.horarioGeral||'').trim() || 'horário a definir')
      : 'horário por candidato';
    return '<strong>'+esc(d.data||'sem data')+'</strong> — '+n+' candidato(s), '+esc(hora);
  });
  var formato = (dias.length===1 && dias[0].horarioModo==='geral')
    ? 'A data e o horário serão impressos acima da tabela, como nas convocações já expedidas.'
    : (dias.length>1
        ? 'Como há mais de um dia, a tabela sai com as colunas DATA e HORÁRIO.'
        : 'A data sai acima da tabela e os horários, na coluna HORÁRIO.');
  el.className='notice-banner ok';
  el.innerHTML=partes.join('<br>')+'<br><span style="color:var(--ink-soft);">'+formato+'</span>';
}

/* --------- arrastar e soltar ---------

   Solta-se sobre uma LINHA (entra antes ou depois dela, no bloco dela) ou sobre
   um BLOCO (entra no fim daquele dia, ou em "A atribuir"). Como o dia do
   candidato é um campo próprio, realocar é reatribuir esse campo.

   O <tr> só vira "draggable" enquanto o ponteiro está sobre a alça: sem isso,
   arrastar para selecionar texto dentro de um campo iniciaria um arraste de
   linha por engano.                                                        */
function ligarArrastarSoltar(){
  var q=$('p18Quadro');
  var origemId=null;

  Array.prototype.forEach.call(q.querySelectorAll('.drag-handle'), function(h){
    var tr=h.closest('tr');
    h.addEventListener('mousedown', function(){ tr.setAttribute('draggable','true'); });
    h.addEventListener('mouseup',   function(){ tr.setAttribute('draggable','false'); });
    h.addEventListener('keydown', function(ev){
      if(!ev.altKey || (ev.key!=='ArrowUp' && ev.key!=='ArrowDown')) return;
      ev.preventDefault();
      moverPorTeclado(Number(h.dataset.id), ev.key==='ArrowUp' ? -1 : 1);
    });
  });

  function limparMarcas(manterArrastada){
    Array.prototype.forEach.call(q.querySelectorAll('tr,.bloco-dia'), function(t){
      t.classList.remove('drop-before','drop-after','drop-into');
      if(!manterArrastada) t.classList.remove('row-dragging');
    });
  }

  // 0 = "A atribuir" no data-dia do bloco; internamente vira null
  function diaDoBloco(bloco){
    var v=Number(bloco.dataset.dia);
    return v ? v : null;
  }

  Array.prototype.forEach.call(q.querySelectorAll('tbody tr[data-id]'), function(tr){
    tr.addEventListener('dragstart', function(ev){
      origemId=Number(tr.dataset.id);
      tr.classList.add('row-dragging');
      try{
        ev.dataTransfer.effectAllowed='move';
        ev.dataTransfer.setData('text/plain', String(origemId));
      }catch(e){}
    });
    tr.addEventListener('dragend', function(){
      tr.setAttribute('draggable','false');
      origemId=null;
      limparMarcas();
    });
    tr.addEventListener('dragover', function(ev){
      if(origemId===null) return;
      ev.preventDefault();
      ev.stopPropagation();
      try{ ev.dataTransfer.dropEffect='move'; }catch(e){}
      limparMarcas(true);
      var r=tr.getBoundingClientRect();
      tr.classList.add(((ev.clientY - r.top) > r.height/2) ? 'drop-after' : 'drop-before');
    });
    tr.addEventListener('drop', function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      if(origemId===null) return;
      var alvo=candPorId(Number(tr.dataset.id));
      var de=indiceDoId(origemId);
      origemId=null;
      limparMarcas();
      if(!alvo || de<0) return;
      var r=tr.getBoundingClientRect();
      var depois=(ev.clientY - r.top) > r.height/2;
      soltarEm(de, indiceDoId(alvo.id) + (depois?1:0), alvo.diaId);
    });
  });

  // soltar no bloco (fora das linhas): vai para o FIM daquele dia
  Array.prototype.forEach.call(q.querySelectorAll('.bloco-dia'), function(bloco){
    bloco.addEventListener('dragover', function(ev){
      if(origemId===null) return;
      ev.preventDefault();
      try{ ev.dataTransfer.dropEffect='move'; }catch(e){}
      limparMarcas(true);
      bloco.classList.add('drop-into');
    });
    bloco.addEventListener('drop', function(ev){
      ev.preventDefault();
      if(origemId===null) return;
      var de=indiceDoId(origemId);
      origemId=null;
      limparMarcas();
      if(de<0) return;
      var diaId=diaDoBloco(bloco);
      var lista=diaId ? linhasDoDia(diaId) : naoAlocados();
      var ultimo=lista.length ? indiceDoId(lista[lista.length-1].id)+1 : estado.cands.length;
      soltarEm(de, ultimo, diaId);
    });
  });

  // Move a linha de `de` para `destino` (índice medido ANTES da remoção) e a
  // reatribui ao dia informado.
  function soltarEm(de, destino, diaId){
    var mov=estado.cands[de];
    if(!mov) return;
    if(de < destino) destino--;
    estado.cands.splice(de,1);
    mov.diaId=diaId || null;
    destino=Math.max(0, Math.min(destino, estado.cands.length));
    estado.cands.splice(destino,0,mov);
    renderQuadro();
  }
}

// Alt+↑ / Alt+↓ na alça: um passo por vez. Ao sair pelo topo ou pela base do
// próprio bloco, o candidato passa para o bloco vizinho em vez de travar.
function moverPorTeclado(id, passo){
  var i=indiceDoId(id);
  if(i<0) return;
  var c=estado.cands[i];
  var vizinho=estado.cands[i+passo];

  if(!vizinho || vizinho.diaId!==c.diaId){
    // ordem dos blocos na tela: dias, na ordem, e "A atribuir" por último
    var ordem=estado.dias.map(function(d){ return d.id; }).concat([null]);
    var k=ordem.indexOf(c.diaId||null)+passo;
    if(k<0 || k>=ordem.length) return;
    var alvo=ordem[k];
    estado.cands.splice(i,1);
    c.diaId=alvo;
    var lista=alvo ? linhasDoDia(alvo) : naoAlocados();
    var idx = passo<0
      ? (lista.length ? indiceDoId(lista[lista.length-1].id)+1 : estado.cands.length)
      : (lista.length ? indiceDoId(lista[0].id) : estado.cands.length);
    estado.cands.splice(idx,0,c);
  } else {
    estado.cands.splice(i,1);
    estado.cands.splice(i+passo,0,c);
  }

  renderQuadro();
  var novo=$('p18Quadro').querySelector('.drag-handle[data-id="'+id+'"]');
  if(novo) novo.focus();
}

// Reordena por nota DENTRO de cada bloco — reordenar o conjunto todo desfaria
// a alocação já feita.
function ordenarPorNota(){
  var porNota=function(a,b){
    var va=(a.nota==null?-1:a.nota), vb=(b.nota==null?-1:b.nota);
    return vb-va;
  };
  var saida=[];
  estado.dias.forEach(function(d){ saida=saida.concat(linhasDoDia(d.id).slice().sort(porNota)); });
  saida=saida.concat(naoAlocados().slice().sort(porNota));
  estado.cands=saida;
  renderQuadro();
}

/* ============ F) passo 3 — dados da convocação ============ */

function lerCamposDoc(){
  Object.keys(estado.doc).forEach(function(k){
    var el=$('p18F_'+k);
    if(el) estado.doc[k]=el.value;
  });
}
function escreverCamposDoc(){
  Object.keys(estado.doc).forEach(function(k){
    var el=$('p18F_'+k);
    if(el) el.value=estado.doc[k]||'';
  });
}
function sincronizarControles(){
  $('p18ColReserva').checked=!!estado.cols.reserva;
  $('p18ColLink').checked=!!estado.cols.link;
  // "Todos os restantes" dispensa a caixa de quantidade
  var especificar = $('p18QuantosModo').value==='especificar';
  $('p18CampoQuantos').style.display = especificar ? 'flex' : 'none';
}

/* ---------------- caixa flutuante de rascunho ---------------- */

function atualizarDraftNota(){
  var el=$('p18DraftNota');
  if(!el) return;
  var n=comNome(estado.cands).length;
  var pend=comNome(naoAlocados()).length;
  el.textContent = n
    ? (n+' convocado'+(n===1?'':'s')+' · '+estado.dias.length+' dia(s)'
       +(pend?(' · '+pend+' a atribuir'):''))
    : 'nada preenchido ainda';
}

function ligarCaixaRascunho(){
  var caixa=$('p18Draft'), botao=$('p18DraftToggle');
  if(!caixa || !botao) return;
  botao.addEventListener('click', function(){
    var recolhida=caixa.classList.toggle('collapsed');
    botao.textContent = recolhida ? '+' : '–';
    botao.title = recolhida ? 'Abrir' : 'Recolher';
    botao.setAttribute('aria-expanded', recolhida ? 'false' : 'true');
  });
}

/* ============ G) passo 4 — geração do documento ============ */

/* Todos os estilos são embutidos linha a linha (e não em folha de estilo)
   porque o mesmo HTML é reaproveitado em três destinos: a pré-visualização
   na tela, a área de transferência (colar no Word mantendo a formatação) e a
   janela de impressão em PDF. Medidas em pt, calibradas sobre as convocações
   já expedidas pela unidade. */
// Uma única fonte no documento inteiro, a 11pt. O bloco de título já saiu em
// Arial: como a altura-x da Arial é maior que a da Calibri, aquelas duas linhas
// engordavam no mesmo corpo de 11pt e o bloco lia como um cabeçalho à parte —
// além de divergir dos blocos do Athos, que sempre usaram a fonte do corpo.
var FONTE="Calibri, Carlito, 'Segoe UI', system-ui, sans-serif";

// Entrelinha: o documento do passo 4 é calibrado nos PDFs já expedidos (1,4);
// os blocos do Athos vão em entrelinha SIMPLES, que é como o sistema publica.
var LH_DOC='1.4';
var LH_CELULA='1.15';   // dentro das células da tabela
var LH_SIMPLES='1';

function corpoCss(lh){
  return "font-family:"+FONTE+";font-size:11pt;color:#000;line-height:"+(lh||LH_DOC)+";";
}
// Espaçamentos medidos linha a linha nos PDFs-modelo (distância entre as
// bases de duas linhas seguidas, em pt): bloco de título arejado, bloco
// DATA/HORÁRIO/LOCAL/ENDEREÇO compacto.
function pCentroCss(lh){ return "margin:0 0 10pt;text-align:center;font-weight:bold;"+corpoCss(lh); }

var CORPO=corpoCss(LH_DOC);
var P_CENTRO=pCentroCss(LH_DOC);

// Negrito marcado TAMBÉM com <b>: o editor do Athos (como o do Word e o de
// outros sistemas) higieniza o atributo style ao colar e descarta o
// font-weight, mas preserva a tag. Sem isto, o negrito se perde na cópia.
function neg(html){ return '<b>'+html+'</b>'; }

// Larguras medidas nos PDFs-modelo. NOME absorve o restante quando a soma
// ultrapassa a área útil da folha A4 (por exemplo com HORÁRIO e LINK juntos).
var LARGURA_COL={ inscricao:70.5, nome:240.5, nota:48.5, reserva:62.5, data:70, hora:63.5, link:110 };
var LARGURA_UTIL_PT=523;   // A4 (595.5pt) menos 1,27cm de margem de cada lado

function celulaTexto(c, col){
  if(col.k==='inscricao') return String(c.inscricao||'');
  if(col.k==='nome')      return String(c.nome||'').toUpperCase();
  if(col.k==='nota')      return fmtNota(c.nota);
  if(col.k==='reserva')   return String(c.reserva||'');
  if(col.k==='data'){
    var dia=diaPorId(c.diaId);
    return (dia && dia.data) || '';
  }
  if(col.k==='hora')      return horaDoCandidato(c);
  if(col.k==='link')      return String(c.linkTexto||c.linkUrl||'').toUpperCase();
  return '';
}

function tabelaHtml(lh){
  var lhCel=lh||LH_CELULA;
  var cols=colunasAtivas();
  // só os alocados entram no documento; quem ficou em "A atribuir" é apontado
  // como pendência nos avisos do passo 2, nunca impresso em silêncio
  var lista=[];
  diasComCandidatos().forEach(function(d){ lista=lista.concat(comNome(linhasDoDia(d.id))); });
  if(!lista.length) return '';

  // Larguras dos modelos quando cabem na folha. Passando disso (caso de
  // RESERVA + DATA + HORÁRIO juntas), o excesso sai todo do NOME — que aceita
  // quebra de linha — até o piso de 150pt; só então a tabela vira 100% e o
  // navegador decide. Assim as colunas de número nunca são espremidas.
  var largura={};
  cols.forEach(function(c){ largura[c.k]=LARGURA_COL[c.k]||60; });
  var soma=cols.reduce(function(s,c){ return s+largura[c.k]; }, 0);
  if(soma>LARGURA_UTIL_PT && largura.nome){
    largura.nome=Math.max(150, largura.nome-(soma-LARGURA_UTIL_PT));
    soma=cols.reduce(function(s,c){ return s+largura[c.k]; }, 0);
  }
  var larguraTabela = (soma<=LARGURA_UTIL_PT) ? (soma+'pt') : '100%';

  var base='border:0.5pt solid #000;padding:0.5pt 4pt;vertical-align:middle;'
    +'text-align:center;white-space:normal;word-break:break-word;'+corpoCss(lhCel);

  // 32pt acima e 28pt abaixo reproduzem as duas linhas em branco que separam a
  // tabela do bloco ENDEREÇO e da linha OBSERVAÇÕES nos modelos.
  var h='<table style="border-collapse:collapse;table-layout:fixed;width:'+larguraTabela+';margin:32pt 0 28pt 5pt;">';
  h+='<colgroup>'+cols.map(function(c){
        return '<col style="width:'+(c.k==='nome' && larguraTabela==='100%' ? 'auto' : largura[c.k]+'pt')+';">';
      }).join('')+'</colgroup>';
  h+='<tr>'+cols.map(function(c){
        return '<td style="'+base+'font-weight:bold;">'+neg(esc(c.t))+'</td>';
      }).join('')+'</tr>';

  // O nome é o único campo de texto corrido da tabela: alinhado à esquerda, os
  // sobrenomes ficam alinhados entre si e a leitura em coluna fica mais fácil.
  // As demais colunas são números curtos e seguem centralizadas.
  lista.forEach(function(c){
    h+='<tr>'+cols.map(function(col){
      var estilo=base+(col.k==='nome' ? 'text-align:left;' : '');
      if(col.k==='link' && String(c.linkUrl||'').trim()){
        var rot=String(c.linkTexto||c.linkUrl).toUpperCase();
        return '<td style="'+estilo+'"><a href="'+esc(comHttp(c.linkUrl))+'" style="color:#0563c1;text-decoration:underline;">'+esc(rot)+'</a></td>';
      }
      return '<td style="'+estilo+'">'+esc(celulaTexto(c,col))+'</td>';
    }).join('')+'</tr>';
  });
  h+='</table>';
  return h;
}

/* Miolo do documento: das linhas DATA/HORÁRIO/LOCAL/ENDEREÇO até OBSERVAÇÕES,
   passando pela tabela. Sai idêntico no PDF (passo 4) e no Bloco 4 do Athos
   (passo 5) — no Athos, precedido da frase de abertura da SGP.  */
// `lh` é a entrelinha dos parágrafos e `lhCel` a das células da tabela: o
// documento do passo 4 usa as medidas dos modelos; o Bloco 4 do Athos, simples.
function conteudoHtml(lh, lhCel){
  var d=estado.doc, h='';
  // O parágrafo é de texto normal: o negrito fica SÓ na etiqueta (DATA:,
  // HORÁRIO:, LOCAL:, ENDEREÇO:, OBSERVAÇÕES:), nunca no que foi digitado.
  var P='margin:0;text-align:left;font-weight:normal;'+corpoCss(lh||LH_DOC);
  function linha(rotulo, valorHtml){
    return '<p style="'+P+'">'+neg(esc(rotulo))+(valorHtml ? ' '+valorHtml : '')+'</p>';
  }

  // Havendo um único dia, data e horário vão para as linhas acima da tabela —
  // formato das convocações já expedidas. Com mais de um dia, ou horário por
  // candidato, a informação está nas colunas e estas linhas somem.
  var dias=diasComCandidatos();
  if(dias.length===1){
    h+=linha('DATA:', esc(dias[0].data||'__/__/____'));
    if(dias[0].horarioModo==='geral' && String(dias[0].horarioGeral||'').trim())
      h+=linha('HORÁRIO:', esc(dias[0].horarioGeral.trim()));
  }
  if(String(d.local||'').trim())
    h+=linha('LOCAL:', esc(d.modalidade)+' | '+esc(comPontoFinal(d.local)));
  if(String(d.endereco||'').trim()){
    var end=String(d.endereco).trim();
    var valor = ehUrl(end)
      ? '<a href="'+esc(comHttp(end))+'" style="color:#0563c1;text-decoration:underline;">'+esc(end)+'</a>'
      : esc(comPontoFinal(end));
    h+=linha('ENDEREÇO:', valor);
  }

  // tabela dos convocados (sem convocados, mantém o respiro entre os blocos)
  h += tabelaHtml(lhCel) || '<p style="margin:0 0 28pt;line-height:'+(lh||LH_DOC)+';">&nbsp;</p>';

  // observações (cada linha digitada vira um parágrafo; só a etiqueta é negrito)
  var obs=String(d.observacoes||'').split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);
  if(obs.length){
    if(obs.length===1){
      h+=linha('OBSERVAÇÕES:', esc(obs[0]));
    } else {
      h+=linha('OBSERVAÇÕES:');
      obs.forEach(function(l){ h+='<p style="'+P+'">'+esc(l)+'</p>'; });
    }
  }
  return h;
}

function gerarDocumento(){
  lerCamposDoc();
  var d=estado.doc;
  var h='';

  // 1) logotipo horizontal do TJPR, centralizado (embutido em base64)
  h+='<p style="margin:0 0 6pt;text-align:center;">'
    +'<img src="'+(typeof TJPR_LOGO_DATA_URI!=='undefined'?TJPR_LOGO_DATA_URI:'')
    +'" alt="Tribunal de Justiça do Estado do Paraná" style="width:110pt;height:65pt;">'
    +'</p>';

  // 2) identificação e bloco de título
  h+='<p style="'+P_CENTRO+'margin-bottom:24pt;">'+neg('TRIBUNAL DE JUSTIÇA DO ESTADO DO PARANÁ')+'</p>';
  h+='<p style="'+P_CENTRO+'">'+neg('PROCESSO SELETIVO DE ESTUDANTES '+esc(d.ano||'____'))+'</p>';
  h+='<p style="'+P_CENTRO+'">'+neg('PROTOCOLO SEI N° '+esc(d.sei||'____________'))+'</p>';
  h+='<p style="'+P_CENTRO+'">'+neg('CONVOCAÇÃO PARA ENTREVISTA')+'</p>';
  h+='<p style="'+P_CENTRO+'margin-bottom:46pt;">'+neg(esc(String(d.unidade||'').toUpperCase().replace(/\s+/g,' ').trim()))+'</p>';

  // 3 a 5) miolo: DATA/HORÁRIO/LOCAL/ENDEREÇO + tabela + OBSERVAÇÕES.
  // É o mesmo trecho reaproveitado no Bloco 4 do Athos (passo 5).
  h+=conteudoHtml();

  $('p18Doc').innerHTML='<div style="'+CORPO+'">'+h+'</div>';
  $('p18SaidaBox').style.display='block';

  var faltando=[];
  if(!String(d.sei).trim())      faltando.push('protocolo SEI');
  if(!String(d.unidade).trim())  faltando.push('nome da unidade');
  if(!String(d.local).trim())    faltando.push('local');
  var diasDoc=diasComCandidatos();
  if(!diasDoc.length) faltando.push('alocar os convocados em ao menos uma data (passo 2)');
  var semData=diasDoc.filter(function(x){ return !String(x.data||'').trim(); }).length;
  if(semData) faltando.push(semData+' dia(s) de entrevista sem data');
  var semHora=diasDoc.filter(function(x){
    return x.horarioModo==='geral' && !String(x.horarioGeral||'').trim();
  }).length;
  if(semHora) faltando.push(semHora+' dia(s) com horário único ainda em branco');

  $('p18MsgSaida').innerHTML = faltando.length
    ? '<span style="color:var(--coral);">Faltou preencher: '+esc(faltando.join(', '))+'.</span>'
    : 'Documento gerado. Confira antes de salvar em PDF.';
  rolarAte($('p18SaidaBox'));
}

// Ponto final ao imprimir, sem duplicar o que o usuário já digitou.
function comPontoFinal(s){
  s=String(s==null?'':s).trim();
  return (!s || /[.!?]$/.test(s)) ? s : s+'.';
}

// Copia um trecho preservando a formatação (text/html) e com texto puro como
// alternativa. `elMsg` é onde aparece a confirmação — assim a mesma função
// serve ao documento do passo 4 e aos blocos do Athos do passo 5.
async function copiarConteudoEm(el, elMsg, msgOk){
  function avisa(t){ if(elMsg) elMsg.textContent=t; }
  // Documento HTML completo, e não só o trecho: com <meta charset> e <body>, o
  // destino (Athos, Word) lê os acentos certos e aplica os estilos de linha —
  // entrelinha, negrito e alinhamento — em vez de reformatar por conta própria.
  var html='<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
          + el.innerHTML + '</body></html>';
  try{
    if(navigator.clipboard && window.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({
        'text/html':  new Blob([html],{type:'text/html'}),
        'text/plain': new Blob([el.innerText||el.textContent],{type:'text/plain'})
      })]);
      avisa(msgOk);
      return;
    }
  }catch(e){ /* cai no método antigo abaixo */ }
  var sel=window.getSelection(), r=document.createRange();
  r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r);
  var ok=false;
  try{ ok=document.execCommand('copy'); }catch(e2){ ok=false; }
  sel.removeAllRanges();
  avisa(ok ? msgOk : 'Não foi possível copiar automaticamente; selecione o texto e use Ctrl+C.');
}
function copiarConteudo(el, msgOk){
  return copiarConteudoEm(el, $('p18MsgSaida'), msgOk);
}

function imprimirPdf(){
  var w=window.open('','_blank');
  if(!w){
    $('p18MsgSaida').innerHTML='<span style="color:var(--coral);">O navegador bloqueou a janela de impressão — permita pop-ups para esta página e tente de novo.</span>';
    return;
  }
  var titulo='Convocação para Entrevista'+(estado.doc.sei?(' — SEI '+estado.doc.sei):'');
  w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>'+esc(titulo)+'</title>'
    +'<style>@page{size:A4;margin:2cm 1.5cm 2cm 1.27cm;}'
    +'body{margin:0;'+CORPO+'}'
    +'table{border-collapse:collapse;} tr{page-break-inside:avoid;}'
    +'img{max-width:100%;}</style></head><body>'
    +$('p18Doc').innerHTML+'</body></html>');
  w.document.close();
  w.focus();
  // o logotipo é data-URI, mas ainda assim precisa de um instante para decodificar
  setTimeout(function(){ w.print(); }, 400);
}

function alternarEdicao(){
  var el=$('p18Doc');
  var ligado = el.getAttribute('contenteditable')==='true';
  el.setAttribute('contenteditable', ligado?'false':'true');
  el.style.outline = ligado ? 'none' : '2px dashed var(--teal)';
  $('p18BtnEditar').textContent = ligado ? 'Editar texto' : 'Concluir edição';
  if(!ligado) el.focus();
}

/* ============ H) passo 5 — blocos para o Athos ============ */

var MESES_EXTENSO=['janeiro','fevereiro','março','abril','maio','junho',
                   'julho','agosto','setembro','outubro','novembro','dezembro'];

function formatarDataExtenso(d){
  return d.getDate()+' de '+MESES_EXTENSO[d.getMonth()]+' de '+d.getFullYear();
}
// Próximo dia útil a partir de hoje — mesma conta do Ponto 20. Só sábado e
// domingo são pulados: não há tabela de feriados embutida, e inventar uma que
// envelhece em silêncio seria pior do que pedir a conferência ao usuário.
function proximoDiaUtil(base){
  var d=new Date(base.getTime());
  do{ d.setDate(d.getDate()+1); } while(d.getDay()===0 || d.getDay()===6);
  return d;
}

var FRASE_ABERTURA='A Secretaria de Gestão de Pessoas, no uso de suas atribuições, torna público '
  +'o edital de convocação para entrevista de processo seletivo de estudantes, mediante as '
  +'disposições do Decreto Judiciário nº 345/2019.';

function montarBlocosAthos(){
  lerCamposDoc();
  var d=estado.doc;
  var sei=String(d.sei||'').trim() || '____________';
  var unidade=String(d.unidade||'').toUpperCase().replace(/\s+/g,' ').trim();
  var b={};

  // Todo o passo 5 sai em entrelinha SIMPLES. Nos blocos de título/assinatura,
  // cujas linhas formam um único conjunto, também some o espaço entre
  // parágrafos (margin:0) — é assim que o Athos publica. Cada parágrafo leva o
  // estilo inteiro, sem declaração repetida: sobreposições do tipo
  // "font-weight:bold; … font-weight:normal" costumam confundir os
  // higienizadores de colagem.
  var CORPO_A  = corpoCss(LH_SIMPLES);
  var P_C_A    = 'margin:0;text-align:center;font-weight:bold;'+CORPO_A;
  var P_C_A_N  = 'margin:0;text-align:center;font-weight:normal;'+CORPO_A;
  var P_E_A_N  = 'margin:0;text-align:left;font-weight:normal;'+CORPO_A;

  // 1 — Nome do documento (é o rótulo do documento no Athos, não texto legal)
  b[1]='<p style="'+P_E_A_N+'">Edital de convocação para Entrevista SEI!TJPR n° '+esc(sei)+'</p>';

  // 2 — Preâmbulo
  b[2]='<p style="'+P_C_A+'">'+neg('EDITAL DE CONVOCAÇÃO PARA ENTREVISTA')+'</p>'
     + '<p style="'+P_C_A+'">'+neg('PROCESSO SELETIVO DE ESTAGIÁRIOS')+'</p>'
     + (unidade ? '<p style="'+P_C_A+'">'+neg(esc(unidade))+'</p>' : '');

  // 3 — Numeração
  b[3]='<p style="'+P_C_A+'">'+neg('EDITAL DE CONVOCAÇÃO PARA ENTREVISTA N° '+esc(String(d.nEditalAbertura||'').trim()||'____/____'))+'</p>'
     + '<p style="'+P_C_A+'">'+neg('PROTOCOLO SEI '+esc(sei))+'</p>';

  // 4 — Conteúdo: frase de abertura da SGP + o mesmo miolo do PDF, em entrelinha
  // simples. Aqui as margens estruturais ficam (a folga antes e depois da
  // tabela vem dos modelos e separa as partes do edital).
  b[4]='<p style="margin:0 0 14pt;text-align:justify;font-weight:normal;'+CORPO_A+'">'+esc(FRASE_ABERTURA)+'</p>'
     + conteudoHtml(LH_SIMPLES, LH_SIMPLES);

  // 5 — Data
  b[5]='<p style="'+P_C_A_N+'">'
     + esc(String(d.cidadeAthos||'Curitiba').trim())+', '
     + esc(String(d.dataAthos||'').trim()||'____ de __________ de ____')+'.</p>';

  // 6 — Quem assina (nome em maiúsculas e negrito; cargo, uma linha por linha)
  var b6='';
  if(String(d.assinanteNome||'').trim())
    b6+='<p style="'+P_C_A+'">'+neg(esc(d.assinanteNome.toUpperCase()))+'</p>';
  String(d.assinanteCargo||'').split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean)
    .forEach(function(l){ b6+='<p style="'+P_C_A_N+'">'+esc(l)+'</p>'; });
  b[6]=b6;

  for(var i=1;i<=6;i++){
    $('p18Bloco'+i).innerHTML='<div style="'+CORPO_A+'">'+b[i]+'</div>';
  }
  $('p18AthosBox').style.display='block';

  var faltando=[];
  if(!String(d.sei).trim())              faltando.push('protocolo SEI (passo 3)');
  if(!unidade)                           faltando.push('nome da unidade (passo 3)');
  if(!String(d.nEditalAbertura).trim())  faltando.push('n° do edital de abertura');
  if(!String(d.assinanteNome).trim())    faltando.push('nome de quem assina');
  if(!estado.cands.filter(function(c){ return c.nome.trim(); }).length) faltando.push('convocados na tabela');
  $('p18MsgAthos').innerHTML = faltando.length
    ? '<span style="color:var(--coral);">Faltou preencher: '+esc(faltando.join(', '))+'.</span>'
    : 'Blocos montados. Copie um a um nos campos correspondentes do Athos.';
  rolarAte($('p18AthosBox'));
}

function copiarBlocoAthos(n){
  copiarConteudoEm($('p18Bloco'+n), $('p18MsgAthos'), 'Bloco '+n+' copiado — cole no campo do Athos.');
}
async function copiarTudoAthos(){
  var tmp=document.createElement('div');
  var html='';
  for(var i=1;i<=6;i++) html+=$('p18Bloco'+i).innerHTML;
  tmp.innerHTML=html;
  tmp.style.cssText='position:absolute;left:-9999px;top:-9999px;';
  document.body.appendChild(tmp);
  try{ await copiarConteudoEm(tmp, $('p18MsgAthos'), 'Todos os blocos copiados em sequência.'); }
  finally{ tmp.remove(); }
}

/* ============ I) passo 6 — lista de e-mails ============ */

function montarBloco(valores){
  return valores.length ? (valores.join('; ')+';') : '';
}

function gerarEmailsDaTabela(){
  var reais=estado.cands.filter(function(c){ return c.nome.trim(); });
  var comEmail=[], sem=[], vistos={}, repetidos=[];
  reais.forEach(function(c){
    var e=String(c.email||'').trim().toLowerCase();
    if(!e || e.indexOf('@')<1){ sem.push(c.nome); return; }
    if(vistos[e]){ repetidos.push(e); return; }
    vistos[e]=true;
    comEmail.push(e);
  });
  $('p18EmailsSaida').value=montarBloco(comEmail);

  var h='';
  if(!reais.length){
    h='<div class="notice-banner warn" style="margin-left:0;">A tabela do passo 2 está vazia — envie o relatório no passo 1 ou cole a lista no quadro acima.</div>';
  } else {
    var partes=['<strong>'+comEmail.length+'</strong> e-mail(s) na lista, na mesma ordem da tabela.'];
    if(repetidos.length) partes.push('<strong>'+repetidos.length+'</strong> repetido(s) foram incluídos uma única vez.');
    if(sem.length) partes.push('<strong>'+sem.length+' convocado(s) sem e-mail válido</strong> ficaram de fora: '+esc(sem.join(', '))+'.');
    h='<div class="notice-banner '+(sem.length?'warn':'ok')+'" style="margin-left:0;">'+partes.join(' ')+'</div>';
  }
  $('p18EmailsAviso').innerHTML=h;
  $('p18EmailsNota').textContent = comEmail.length ? (comEmail.length+' e-mail(s) gerados da tabela') : 'a partir da tabela do passo 2';
}

function processarColagem(){
  var valores=$('p18EmailsEntrada').value.split(/[\r\n;,]+/).map(function(v){ return v.trim(); }).filter(Boolean);
  $('p18EmailsSaida').value=montarBloco(valores);
  var invalidos=valores.filter(function(v){ return v.indexOf('@')<1; });
  $('p18EmailsAviso').innerHTML = valores.length
    ? '<div class="notice-banner '+(invalidos.length?'warn':'ok')+'" style="margin-left:0;"><strong>'+valores.length+'</strong> valor(es) processado(s).'
      +(invalidos.length?(' <strong>'+invalidos.length+'</strong> não parecem e-mail: '+esc(invalidos.slice(0,8).join(', '))+'.'):'')+'</div>'
    : '<div class="notice-banner warn" style="margin-left:0;">Não havia nada para processar no quadro de colagem.</div>';
}

async function copiarEmails(){
  var out=$('p18EmailsSaida');
  if(!out.value) return;
  var btn=$('p18BtnCopiarEmails');
  function feito(){
    btn.textContent='Copiado!';
    setTimeout(function(){ btn.textContent='Copiar resultado'; }, 1800);
  }
  try{
    await navigator.clipboard.writeText(out.value);
    feito();
  }catch(e){
    out.select();
    try{ if(document.execCommand('copy')) feito(); }catch(e2){}
    window.getSelection().removeAllRanges();
  }
}

/* ============ J) rascunho e inicialização ============ */

function exportarRascunho(){
  lerCamposDoc();
  var dados={ ferramenta:'ponto18', versao:2, gerado:new Date().toISOString(),
              cols:estado.cols, doc:estado.doc, dias:estado.dias, cands:estado.cands };
  var blob=new Blob([JSON.stringify(dados,null,2)],{type:'application/json'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='rascunho_convocacao_'+String(estado.doc.sei||'sem_protocolo').replace(/[^\w-]/g,'_')+'.json';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function importarRascunho(file){
  var fr=new FileReader();
  fr.onload=function(){
    try{
      var d=JSON.parse(fr.result);
      if(!d || !Array.isArray(d.cands)) throw new Error('arquivo sem lista de convocados');
      estado.cols=Object.assign({reserva:false, link:false}, d.cols||{});
      estado.doc=Object.assign(estado.doc, d.doc||{});
      // Converte rascunhos antigos: v1 marcava o dia como "quebra" na linha,
      // v2 já tinha lista de dias mas sem regime de horário. Nenhum trabalho
      // anterior se perde ao abrir.
      var mapaDia={};
      estado.dias=[];
      if(Array.isArray(d.dias) && d.dias.length){
        d.dias.forEach(function(x){
          var nd=novoDia(x.data);
          if(x.horarioModo) nd.horarioModo=x.horarioModo;
          if(x.horaInicial) nd.horaInicial=x.horaInicial;
          if(x.intervalo!==undefined) nd.intervalo=x.intervalo;
          if(x.horarioGeral) nd.horarioGeral=x.horarioGeral;
          mapaDia[x.id]=nd.id;
          estado.dias.push(nd);
        });
      } else {
        d.cands.forEach(function(c,i){
          if(i===0 || c.quebra) estado.dias.push(novoDia(c.data||''));
        });
      }
      var k=0;
      estado.cands=d.cands.map(function(c,i){
        var novo=Object.assign(novoCand(), c, {id:estado.seq++});
        if(Array.isArray(d.dias) && d.dias.length){
          novo.diaId = mapaDia[c.diaId] || null;
        } else if(estado.dias.length){
          if(i>0 && c.quebra) k++;
          novo.diaId = (estado.dias[k]||estado.dias[0]).id;
        } else {
          novo.diaId = null;
        }
        delete novo.quebra; delete novo.data;
        return novo;
      });
      // rascunho antigo podia ter o horário geral no bloco de dados do documento
      if(d.doc && d.doc.horario && estado.dias.length===1 && !estado.dias[0].horarioGeral){
        estado.dias[0].horarioModo='geral';
        estado.dias[0].horarioGeral=d.doc.horario;
      }
      estado.avisosImport=[]; estado.descartados=0;
      escreverCamposDoc();
      sincronizarControles();
      renderQuadro();
      status('Rascunho aberto: <strong>'+estado.cands.length+'</strong> convocado(s).','ok');
    }catch(e){
      status('Não consegui ler este rascunho ('+esc(e.message||e)+'). Verifique se é o arquivo .json gerado por esta ferramenta.','warn');
    }
  };
  fr.onerror=function(){ status('Falha ao abrir o arquivo de rascunho.','warn'); };
  fr.readAsText(file);
}

var jaIniciou=false;

function iniciar(){
  // trava de reentrada: se esta função rodasse duas vezes, cada botão ficaria
  // com dois ouvintes e um clique desfaria o efeito do outro
  if(jaIniciou) return;
  jaIniciou=true;

  // ---- passo 1
  $('p18BtnArquivo').addEventListener('click', function(){ $('p18Arquivo').click(); });
  $('p18Arquivo').addEventListener('change', async function(e){
    var f=e.target.files[0];
    if(!f) return;
    $('p18NomeArquivo').textContent=f.name;
    status('Lendo a planilha…','');
    try{
      var aoa=await lerPlanilha(f);
      importarRelatorio(aoa);
    }catch(err){
      status('Não foi possível ler a planilha ('+esc(err.message||err)+'). Confira se é o arquivo .xlsx baixado na Fábrica de Provas.','warn');
    }
    e.target.value='';
  });
  $('p18BtnExportar').addEventListener('click', exportarRascunho);
  $('p18BtnAbrirRascunho').addEventListener('click', function(){ $('p18Rascunho').click(); });
  $('p18Rascunho').addEventListener('change', function(e){
    var f=e.target.files[0];
    if(f) importarRascunho(f);
    e.target.value='';
  });

  // ---- passo 2
  [['p18ColReserva','reserva'], ['p18ColLink','link']].forEach(function(par){
    $(par[0]).addEventListener('change', function(e){
      estado.cols[par[1]]=e.target.checked;
      renderQuadro();
    });
  });
  ativarMascaraData($('p18NovaData'));
  ativarBotaoCalendario($('p18NovaData'));
  $('p18QuantosModo').addEventListener('change', sincronizarControles);
  $('p18BtnCriarData').addEventListener('click', criarData);
  $('p18BtnOrdenar').addEventListener('click', ordenarPorNota);
  $('p18BtnNovaLinha').addEventListener('click', function(){
    estado.cands.push(novoCand());   // linha nova nasce em "A atribuir"
    renderQuadro();
  });

  // ---- passo 3
  ativarMascaraSei($('p18F_sei'));
  $('p18BtnGerar').addEventListener('click', function(){ atualizarResumoAlocacao(); gerarDocumento(); });

  // ---- passo 4
  $('p18BtnPDF').addEventListener('click', imprimirPdf);
  $('p18BtnCopiar').addEventListener('click', function(){
    copiarConteudo($('p18Doc'), 'Documento copiado — cole no Word ou no editor do SEI.');
  });
  $('p18BtnEditar').addEventListener('click', alternarEdicao);

  // ---- passo 5 (Athos)
  estado.doc.dataAthos=formatarDataExtenso(proximoDiaUtil(new Date()));
  $('p18BtnAthos').addEventListener('click', montarBlocosAthos);
  $('p18BtnCopiarAthos').addEventListener('click', copiarTudoAthos);
  Array.prototype.forEach.call(document.querySelectorAll('.p18-bloco-copiar'), function(b){
    b.addEventListener('click', function(){ copiarBlocoAthos(b.dataset.bloco); });
  });

  // ---- passo 6
  $('p18BtnGerarEmails').addEventListener('click', gerarEmailsDaTabela);
  $('p18BtnProcessarColagem').addEventListener('click', processarColagem);
  $('p18BtnCopiarEmails').addEventListener('click', copiarEmails);

  escreverCamposDoc();
  ligarCaixaRascunho();
  sincronizarControles();
  renderQuadro();
}

// Aberto por duplo clique, o script está no fim do <body> e o documento ainda
// está sendo lido; mas se por qualquer motivo já estiver pronto, inicia agora
// em vez de esperar por um evento que não virá mais.
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();

})();
