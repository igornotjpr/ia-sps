/* ============================================================================
   ponto14_logic.js — Ponto 14: Gerador do Edital de Ensalamento
   Seção de Processo Seletivo (SG-SGP-CDHO-DSERFTA) — TJPR

   Entradas:
     1) Formulário de Abertura de Processo Seletivo (PDF do SEI, o mesmo usado
        no edital de abertura) -> nº do processo SEI, modalidade, duração da
        prova, local e endereço da prova presencial;
     2) Relatório de inscritos da Fábrica de Provas (.xlsx/.csv) -> candidatos
        com "Situação da inscrição" = DEFERIDA.

   Saída: os blocos do edital, prontos para colar, um a um, no modelo de blocos
   de impressão do Athos.

   100% client-side. Nada sai do computador.
   ========================================================================== */
(function(){
'use strict';

var TEM_DOM = (typeof document !== 'undefined');
var C = (typeof window !== 'undefined' && window.TJPRCore) ? window.TJPRCore : {
  // reimplementação mínima, usada apenas pelos testes em Node
  escapeHtml: function(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); },
  normName: function(s){
    if(!s) return '';
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
      .replace(/[^A-Z\s]/g,'').replace(/\s+/g,' ').trim();
  }
};
var esc = C.escapeHtml;
function $(id){ return TEM_DOM ? document.getElementById(id) : null; }

var LINK_PROVA = 'https://tjpr-pse.fabricadeprovas.com.br/login';

/* ==========================================================================
   A) UTILIDADES DE TEXTO, DATA E HORA
   ========================================================================== */

function norm(s){
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/\s+/g,' ').trim();
}
function colapsa(s){ return String(s == null ? '' : s).replace(/\s+/g,' ').trim(); }

var MESES = ['janeiro','fevereiro','março','abril','maio','junho',
             'julho','agosto','setembro','outubro','novembro','dezembro'];

function pad2(n){ return String(n).padStart(2,'0'); }

/* O bloco de Data do Athos leva SÓ a data por extenso: nem a cidade nem o ponto
   final — os dois vêm do próprio modelo de blocos. */
function hojeExtenso(){
  var d = new Date();
  return pad2(d.getDate()) + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
}

/* Reduz o que estiver no campo à data por extenso: "Curitiba, 28 de julho de
   2026." -> "28 de julho de 2026". Serve tanto para o que o usuário digita
   quanto para rascunhos antigos, salvos quando o local ainda entrava no bloco. */
function somenteDataExtenso(txt){
  var s = colapsa(txt);
  if(!s) return '';
  var m = /(\d{1,2}\s+de\s+[A-Za-zÀ-ÿ]+\s+de\s+\d{4})/i.exec(s);
  if(m) return colapsa(m[1]);
  return s.replace(/^[^,]+,\s*/,'').replace(/\.\s*$/,'');   // sem data reconhecível: tira local e ponto
}

// dd/mm/aaaa -> Date (ou null). Valida o dia de verdade: 31/02 não passa.
function lerDataBarra(s){
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s||'').trim());
  if(!m) return null;
  var dd = +m[1], mo = +m[2], yy = +m[3];
  var d = new Date(yy, mo-1, dd);
  if(d.getDate()!==dd || d.getMonth()!==mo-1 || d.getFullYear()!==yy) return null;
  return d;
}
function fmtDataBarra(d){
  return pad2(d.getDate()) + '/' + pad2(d.getMonth()+1) + '/' + d.getFullYear();
}

/* Máscara de data por reconstrução a partir dos dígitos: o usuário pode digitar
   "01072026" ou colar "01/07/2026" — o resultado é sempre dd/mm/aaaa, sem
   barra duplicada. Mesmo comportamento do Ponto 18. */
function ativarMascaraData(el){
  if(!el) return;
  el.addEventListener('input', function(){
    var d = el.value.replace(/\D/g,'').slice(0,8);
    var out = d.slice(0,2);
    if(d.length>2) out += '/' + d.slice(2,4);
    if(d.length>4) out += '/' + d.slice(4,8);
    el.value = out;
  });
}

/* Máscara do protocolo SEI: 0000000-00.0000.0.00.0000 (20 dígitos). */
function ativarMascaraSei(el){
  if(!el) return;
  el.addEventListener('input', function(){
    var d = el.value.replace(/\D/g,'').slice(0,20);
    var out = d.slice(0,7);
    if(d.length>7)  out += '-' + d.slice(7,9);
    if(d.length>9)  out += '.' + d.slice(9,13);
    if(d.length>13) out += '.' + d.slice(13,14);
    if(d.length>14) out += '.' + d.slice(14,16);
    if(d.length>16) out += '.' + d.slice(16,20);
    el.value = out;
  });
}

/* --------------------------------- horas --------------------------------- */
/* Um horário é sempre guardado como {h,m} e exibido/impresso como "14h00min".
   A leitura aceita tudo que o usuário costuma digitar: "14", "1400", "14:00",
   "14h", "14h00", "14h00min", "14.00". */
function lerHora(s){
  s = String(s==null?'':s).trim();
  if(!s) return null;
  var d = s.replace(/[^\d]/g,'');
  var h, m;
  if(/^\d{1,2}$/.test(d)){ h = +d; m = 0; }
  else if(d.length === 3){ h = +d.slice(0,1); m = +d.slice(1,3); }
  else if(d.length >= 4){ h = +d.slice(0,2); m = +d.slice(2,4); }
  else return null;
  if(!(h>=0 && h<=23) || !(m>=0 && m<=59)) return null;
  return {h:h, m:m};
}
function fmtHora(o){ return o ? pad2(o.h)+'h'+pad2(o.m)+'min' : ''; }
function horaParaInput(o){ return o ? pad2(o.h)+':'+pad2(o.m) : ''; }

/* Máscara de horário: reconstrói a partir dos dígitos e só normaliza para
   "14h00min" ao sair do campo — assim não atrapalha quem ainda está digitando. */
function ativarMascaraHora(el){
  if(!el) return;
  el.addEventListener('input', function(){
    var d = el.value.replace(/\D/g,'').slice(0,4);
    var out = d.slice(0,2);
    if(d.length>2) out += 'h' + d.slice(2,4);
    el.value = out;
  });
  el.addEventListener('blur', function(){
    var o = lerHora(el.value);
    el.value = o ? fmtHora(o) : '';
    el.dispatchEvent(new Event('change',{bubbles:true}));
  });
}

/* Botão 🕐 ao lado do campo de horário: abre o seletor nativo (roda do mouse /
   lista de horários do navegador) e devolve o valor já no padrão 14h00min.
   O <input type="time"> fica escondido justamente para que o campo visível
   continue aceitando digitação livre. */
function ativarBotaoRelogio(inputEl){
  if(!inputEl) return;
  var wrap = document.createElement('span');
  wrap.style.cssText = 'display:flex;align-items:stretch;gap:6px;width:100%;position:relative;';
  inputEl.parentNode.insertBefore(wrap, inputEl);
  inputEl.style.flex = '1 1 auto';
  inputEl.style.width = 'auto';
  inputEl.style.minWidth = '0';
  wrap.appendChild(inputEl);

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'date-pick-btn';
  btn.title = 'Abrir seletor de horário';
  btn.setAttribute('aria-label','Abrir seletor de horário');
  btn.textContent = '🕐';
  wrap.appendChild(btn);

  var nativo = document.createElement('input');
  nativo.type = 'time';
  nativo.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
  wrap.appendChild(nativo);

  btn.addEventListener('click', function(){
    nativo.value = horaParaInput(lerHora(inputEl.value));
    if(nativo.showPicker) nativo.showPicker(); else nativo.click();
  });
  nativo.addEventListener('change', function(){
    if(!nativo.value) return;
    var p = nativo.value.split(':');
    inputEl.value = fmtHora({h:+p[0], m:+p[1]});
    inputEl.dispatchEvent(new Event('change',{bubbles:true}));
  });
}

/* Botão 📅 ao lado do campo de data: mesmo padrão já usado nas ferramentas da
   Residência (calendário nativo do navegador, sem dependência externa). */
function ativarBotaoCalendario(inputEl){
  if(!inputEl) return;
  var wrap = document.createElement('span');
  wrap.style.cssText = 'display:flex;align-items:stretch;gap:6px;width:100%;position:relative;';
  inputEl.parentNode.insertBefore(wrap, inputEl);
  inputEl.style.flex = '1 1 auto';
  inputEl.style.width = 'auto';
  inputEl.style.minWidth = '0';
  wrap.appendChild(inputEl);

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'date-pick-btn';
  btn.title = 'Abrir calendário';
  btn.setAttribute('aria-label','Abrir calendário');
  btn.textContent = '📅';
  wrap.appendChild(btn);

  var nativo = document.createElement('input');
  nativo.type = 'date';
  nativo.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
  wrap.appendChild(nativo);

  btn.addEventListener('click', function(){
    var d = lerDataBarra(inputEl.value);
    nativo.value = d ? (d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())) : '';
    if(nativo.showPicker) nativo.showPicker(); else nativo.click();
  });
  nativo.addEventListener('change', function(){
    if(!nativo.value) return;
    var p = nativo.value.split('-');
    inputEl.value = fmtDataBarra(new Date(+p[0], +p[1]-1, +p[2]));
    inputEl.dispatchEvent(new Event('change',{bubbles:true}));
  });
}

/* ==========================================================================
   B) LEITURA DO FORMULÁRIO DE ABERTURA (PDF ou texto colado)
   ========================================================================== */

/* Linhas de cabeçalho/rodapé do SEI que se intercalam ao conteúdo e atrapalham
   a leitura por rótulo (o valor de um campo pode cair logo depois delas). */
function linhaDeRodape(l){
  var t = l.trim();
  if(!t) return false;
  if(/^#\s*Abertura de Processo Seletivo/i.test(t)) return true;
  if(/SEI\s+\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\s*\/\s*pg\./i.test(t)) return true;
  if(/^Documento assinado eletronicamente/i.test(t)) return true;
  if(/^A autenticidade do documento pode ser conferida/i.test(t)) return true;
  if(/^informando o c[óo]digo verificador/i.test(t)) return true;
  if(/^Assinar e enviar para a unidade/i.test(t)) return true;
  return false;
}

function linhasDoFormulario(texto){
  return String(texto||'')
    .replace(/\r\n?/g,'\n')
    .split('\n')
    .map(function(l){ return colapsa(l); })
    .filter(function(l){ return !linhaDeRodape(l); });
}

/* Uma linha "parece rótulo" quando termina em dois-pontos — é assim que o
   formulário do SEI é exportado. Serve para não confundir o valor de um campo
   vazio com o rótulo seguinte (acontece em "Tipo das questões da prova:"). */
function pareceRotulo(l){ return /:\s*$/.test(l); }

/* Versão normalizada de uma linha (sem acento, minúscula) acompanhada do mapa
   de posições para o texto ORIGINAL. É o que permite localizar o rótulo sem
   acento e, ainda assim, recortar o valor exatamente do texto de origem. */
function normComMapa(s){
  s = String(s == null ? '' : s);
  var txt = '', idx = [];
  for(var i=0; i<s.length; i++){
    var c = s[i].normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    for(var k=0; k<c.length; k++){ txt += c[k]; idx.push(i); }
  }
  return { txt: txt, idx: idx };
}

/* Valor de um campo, localizado pelo rótulo (comparação sem acento e sem
   diferença de maiúsculas). Devolve '' quando o campo está vazio ou preenchido
   com um traço, e null quando o rótulo não existe no documento.

   O rótulo é procurado em QUALQUER posição da linha, e não só no começo: a
   extração de PDF sem layout às vezes cola o valor truncado do campo anterior
   ao rótulo seguinte (ex.: "(41) 98739Modalidade do processo seletivo:"). */
function campoForm(linhas, rotulo){
  var alvo = norm(rotulo).replace(/:$/,'');
  for(var i=0; i<linhas.length; i++){
    var m = normComMapa(linhas[i]);
    var pos = m.txt.indexOf(alvo);
    if(pos === -1) continue;
    // valor na mesma linha: o que vier depois dos dois-pontos que fecham o
    // rótulo (nenhum rótulo do formulário tem ":" no meio)
    var iniOriginal = m.idx[pos] !== undefined ? m.idx[pos] : 0;
    var doisPontos = linhas[i].indexOf(':', iniOriginal);
    var resto = doisPontos === -1 ? '' : linhas[i].slice(doisPontos+1).trim();
    if(resto) return limpaValor(resto);
    // senão, a primeira linha seguinte que não seja outro rótulo
    for(var j=i+1; j<linhas.length && j<i+6; j++){
      var v = linhas[j].trim();
      if(!v) continue;
      if(pareceRotulo(v)) return '';
      return limpaValor(v);
    }
    return '';
  }
  return null; // rótulo não encontrado no documento
}
function limpaValor(v){
  v = colapsa(v);
  if(/^[-–—\s]*$/.test(v)) return '';
  return v;
}

function extrairSei(texto){
  var m = /\b(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/.exec(String(texto||''));
  return m ? m[1] : '';
}

/* Duração da prova: o campo é texto livre e vem em formatos muito variados
   ("02", "3", "3 horas", "03(três) horas", "2h30"). Extrai horas e minutos. */
function lerDuracao(s){
  s = String(s==null?'':s).trim();
  if(!s) return null;
  var m = /(\d{1,2})\s*(?:h|:)\s*(\d{2})/i.exec(s);           // 2h30 / 02:30
  if(m) return {h:+m[1], m:+m[2]};
  m = /(\d{1,2})\s*[,.]\s*5\b/.exec(s);                        // 2,5
  if(m) return {h:+m[1], m:30};
  m = /(\d{1,2})/.exec(s);                                     // 03(três) horas
  if(m && +m[1] >= 1 && +m[1] <= 24) return {h:+m[1], m:0};
  return null;
}
function fmtDuracao(o){ return o ? pad2(o.h)+'h'+pad2(o.m)+'min' : ''; }

function somarHoras(ini, dur){
  if(!ini || !dur) return null;
  var t = ini.h*60 + ini.m + dur.h*60 + dur.m;
  t = ((t % 1440) + 1440) % 1440;
  return {h: Math.floor(t/60), m: t%60};
}

/* ------------------------- local e endereço ------------------------------ */

var CONECTIVOS = ['de','da','do','das','dos','e','em','na','no','a','o','com','sem','sob','para','ao','à'];

function ehCaixaUniforme(s){
  var letras = s.replace(/[^A-Za-zÀ-ÿ]/g,'');
  if(!letras) return false;
  return letras === letras.toUpperCase() || letras === letras.toLowerCase();
}
function tituloCase(s){
  return s.split(' ').map(function(p, i){
    var base = p.toLowerCase();
    if(i>0 && CONECTIVOS.indexOf(base.replace(/[^a-zà-ÿ]/g,'')) !== -1) return base;
    return base.replace(/^([a-zà-ÿ])/, function(_,c){ return c.toUpperCase(); });
  }).join(' ');
}
/* Capitaliza apenas as palavras que vieram INTEIRAMENTE em minúsculas — o que
   já foi digitado com inicial maiúscula é preservado como está. É o que resolve
   "Av sete de abril 571 - Centro - Palmeira/PR", em que o usuário capitalizou
   parte do endereço e parte não. */
function capitalizarMinusculas(s){
  return s.split(' ').map(function(p, i){
    var letras = p.replace(/[^A-Za-zÀ-ÿ]/g,'');
    if(!letras || letras !== letras.toLowerCase()) return p;          // já tem maiúscula
    if(i > 0 && CONECTIVOS.indexOf(letras) !== -1) return p;          // conectivo fica minúsculo
    return p.replace(/([a-zà-ÿ])/, function(c){ return c.toUpperCase(); });
  }).join(' ');
}

var LOGRADOUROS = [
  [/^r\.?\s+/i,'Rua '], [/^rua\s+/i,'Rua '],
  [/^av\.?\s+/i,'Avenida '], [/^avd?a?\.?\s+/i,'Avenida '],
  [/^al\.?\s+/i,'Alameda '], [/^tv\.?\s+/i,'Travessa '], [/^trav\.?\s+/i,'Travessa '],
  [/^rod\.?\s+/i,'Rodovia '], [/^estr\.?\s+/i,'Estrada '], [/^lg\.?\s+/i,'Largo '],
  [/^p(?:ç|c)\.?\s+/i,'Praça '], [/^pca\.?\s+/i,'Praça ']
];
/* Só expandimos abreviaturas de tratamento quando vêm com ponto — sem essa
   exigência, palavras comuns ("des", "min") seriam trocadas por engano. */
var TITULOS = [
  ['pref','Prefeito'], ['pres','Presidente'], ['dra','Doutora'], ['dr','Doutor'],
  ['gov','Governador'], ['sen','Senador'], ['dep','Deputado'], ['ver','Vereador'],
  ['cel','Coronel'], ['mal','Marechal'], ['profa','Professora'], ['prof','Professor'],
  ['cap','Capitão'], ['gal','General'], ['eng','Engenheiro'], ['des','Desembargador'],
  ['min','Ministro'], ['sto','Santo'], ['sta','Santa'], ['jd','Jardim'],
  ['vl','Vila'], ['pq','Parque'], ['cj','Conjunto'], ['bl','Bloco'], ['visc','Visconde']
];

var UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
           'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

/* Marcador interno que gruda na parte do endereço em que estava a sigla do
   estado — é assim que sabemos qual dos pedaços é a cidade. Some no fim. */
var MARCA_UF = '\u0001';

var CEP_PLACEHOLDER = 'XXXXXX';

/* Começo de logradouro (para achar onde o endereço começa de fato) e começo
   típico de nome de bairro (para desempatar bairro × cidade). */
var RE_LOGRADOURO = /^(Rua|Avenida|Pra[çc]a|Rodovia|Estrada|Alameda|Travessa|Largo|Linha|Quadra|Via|Marginal|Passeio|Servid[ãa]o)\b/i;
var RE_BAIRRO = /^(Centro|Bairro|Jardim|Vila|Parque|Conjunto|Distrito|Alto|Núcleo|Nucleo|Colônia|Colonia|Chácara|Chacara|Balneário|Balneario|Loteamento|Zona|Cidade Industrial)\b/i;
/* Complemento: sala, andar, bloco e afins. As palavras que também são nome de
   bairro só contam como complemento quando vêm seguidas do identificador
   ("Sala 5", "Bloco B") — "Casa da Cultura" e "Conjunto Solar" continuam bairro. */
var RE_COMPLEMENTO = /^(?:(?:salas?|loja|bloco|bl\.?|apto\.?|apartamento|casa|lote|pavimento|andar)\s*\.?\s*(?:\d|[A-Za-z]\b)|\d+\s*[ºo°]?\s*(?:andar|pavimento)|t[ée]rreo|fundos|anexo|sobreloja|mezanino)/i;

/* Reescreve o endereço no padrão publicado nos editais:
   "Rua Fulano de Tal, nº 500 - Centro, Palmeira - PR, CEP 84.130-000".
   Sem CEP no formulário, sai "CEP XXXXXX" para ser completado à mão (a linha
   ENDEREÇO do edital acrescenta o ponto final).
   Nada é inventado em silêncio: cada dedução e cada peça faltante vira uma nota
   em `notas`, mostrada na caixa de avisos junto com o texto original. */
function analisarEndereco(bruto){
  var notas = [];
  var s = colapsa(bruto);
  if(!s) return { texto:'', notas:notas };
  s = s.replace(/\.\s*$/,'');
  s = ehCaixaUniforme(s) ? tituloCase(s) : capitalizarMinusculas(s);

  for(var i=0;i<LOGRADOUROS.length;i++){
    if(LOGRADOUROS[i][0].test(s)){ s = s.replace(LOGRADOUROS[i][0], LOGRADOUROS[i][1]); break; }
  }
  TITULOS.forEach(function(t){
    s = s.replace(new RegExp('\\b'+t[0]+'\\.\\s*','gi'), t[1]+' ');
  });

  // 1) CEP sai da frente antes de tudo: senão seus 8 dígitos seriam tomados
  //    pelo número do imóvel.
  var cep = '';
  s = s.replace(/\bcep\b\s*:?\s*/i, ' ');
  s = s.replace(/\b(\d{2})\.?\s?(\d{3})\s*-?\s*(\d{3})\b/, function(_,a,b,c){
    cep = a+'.'+b+'-'+c; return ' ';
  });
  s = s.replace(/\bX{4,}\b/i, ' ');   // "CEP XXXXXX" de um texto já gerado aqui

  // 2) sigla do estado: sai da string e volta no fim, colada à cidade.
  //    O limite é (?![letra]) e não \b: em "Paraná," o \b não vale, porque o
  //    "á" já não é caractere de palavra para o JavaScript.
  var uf = '';
  var alt = UFS.join('|') + '|Paran[áa]';
  var fim = '(?![A-Za-zÀ-ÿ])\\.?';
  s = s.replace(new RegExp('\\s*[-\\/,]\\s*(' + alt + ')' + fim, 'i'), function(_, sig){
    uf = /paran/i.test(sig) ? 'PR' : sig.toUpperCase(); return MARCA_UF;
  });
  if(!uf){   // "Palmeira PR", sem separador nenhum
    s = s.replace(new RegExp('\\s+(' + alt + ')' + fim + '\\s*$', 'i'), function(_, sig){
      uf = /paran/i.test(sig) ? 'PR' : sig.toUpperCase(); return MARCA_UF;
    });
  }

  // 3) o que sobrou dos pedaços retirados vira separador solto ("- ,"): junta
  s = colapsa(s).replace(/\s*[-,;]\s*(?=[-,;])/g, '').replace(/^[-,;\s]+|[-,;\s]+$/g,'');

  // 4) pedaços: nos formulários, vírgula e " - " são o mesmo separador
  var partes = s.split(/\s*[,;]\s*|\s+-\s+/).map(colapsa).filter(Boolean);

  // 5) o formulário às vezes traz o nome do prédio antes do endereço ("Fórum de
  //    Palmeira, Avenida 7 de Abril, 571"): tudo que vem antes do logradouro
  //    fica junto dele, nada é descartado.
  var iLog = -1;
  for(var q=0; q<partes.length && q<3; q++){ if(RE_LOGRADOURO.test(partes[q])){ iLog = q; break; } }
  if(iLog > 0) partes.splice(0, iLog+1, partes.slice(0, iLog+1).join(', '));

  // 6) número do imóvel: pedaço só com o número, ou grudado no fim do logradouro
  var num = '';
  for(var k=0; k<partes.length; k++){
    var m = /^(?:n[º°o]?\.?\s*)?(\d{1,6}\s?[A-Za-z]?)$/i.exec(partes[k]);
    if(m){ num = colapsa(m[1]); partes.splice(k,1); break; }
    if(/^(?:n[º°o]?\.?\s*)?s\/?\s*n[º°]?\.?$/i.test(partes[k]) || /^sem\s+n[úu]mero$/i.test(partes[k])){
      num = 's/n'; partes.splice(k,1); break;
    }
  }
  if(!num && partes.length){
    partes[0] = partes[0].replace(/([A-Za-zÀ-ÿ.])\s*,?\s*(?:n[º°o]?\.?\s*)?(\d{1,6}[A-Za-z]?)$/i,
      function(_, antes, n){ num = n; return antes; });
    partes[0] = colapsa(partes[0]).replace(/[,\s]+$/,'');
  }

  // 7) complemento (sala, andar, bloco…): fica junto do número, que é onde o
  //    edital o publica — sem ele o bairro sairia com "Sala 5" na frente
  var compl = [];
  for(var c2=partes.length-1; c2>=0; c2--){
    if(RE_COMPLEMENTO.test(partes[c2])) compl.unshift(partes.splice(c2,1)[0]);
  }

  // 8) logradouro, bairro e cidade
  var logradouro = partes.shift() || '';
  var cidade = '';
  for(var j=0; j<partes.length; j++){
    if(partes[j].indexOf(MARCA_UF) >= 0){
      cidade = colapsa(partes[j].split(MARCA_UF).join(' '));
      partes.splice(j,1);
      break;
    }
  }
  // Sem sigla de estado não há como saber, com certeza, se o último pedaço é
  // bairro ou cidade. Sobrando mais de um, o último é a cidade; sobrando um só,
  // decide pelo jeito do nome ("Centro", "Jardim das Flores" são bairro).
  if(!cidade && partes.length > 1) cidade = partes.pop();
  else if(!cidade && partes.length === 1 && !RE_BAIRRO.test(partes[0])) cidade = partes.pop();
  var bairro = colapsa(partes.join(', ').split(MARCA_UF).join(' '));
  logradouro = colapsa(logradouro.split(MARCA_UF).join(' '));

  var texto = logradouro;
  if(num)          texto += ', ' + (num === 's/n' ? 's/n' : 'nº ' + num);
  if(compl.length) texto += ', ' + compl.join(', ');
  if(bairro)       texto += ' - ' + bairro;
  if(cidade) texto += ', ' + cidade + ' - ' + (uf || 'PR');
  else if(uf) texto += ', ' + uf;
  texto += ', CEP ' + (cep || CEP_PLACEHOLDER);

  if(!num)    notas.push('não foi possível identificar o número do imóvel');
  if(!bairro) notas.push('o bairro não foi identificado');
  if(!cidade) notas.push('a cidade não foi identificada');
  else if(!uf) notas.push('o estado não veio no formulário — foi impresso “- PR”');
  if(!cep)    notas.push('o formulário não trouxe CEP — saiu “CEP ' + CEP_PLACEHOLDER + '”, complete antes de publicar');

  return { texto: colapsa(texto), notas: notas };
}

function normalizarEndereco(bruto){ return analisarEndereco(bruto).texto; }

function normalizarLocal(bruto){
  var s = colapsa(bruto);
  if(!s) return '';
  s = s.replace(/\.\s*$/,'').replace(/\s*[-\/]\s*(PR|Paran[áa])\b\.?$/i,'');
  if(ehCaixaUniforme(s)) s = tituloCase(s);
  return colapsa(s);
}

/* Campos do formulário do SEI são truncados na exportação. Quando o texto chega
   no limite e termina no meio de uma palavra, avisamos em vez de publicar pela
   metade (foi o caso de "…, Centro, Almiran" no 0024424-25). */
function pareceTruncado(s){
  s = String(s||'');
  if(s.length < 45) return false;
  return !/[.)\d]$/.test(s.trim());
}

var ROTULOS = {
  modalidade: 'Modalidade do processo seletivo:',
  duracao:    'Quantas horas o candidato terá para realizar a prova, a partir do seu início:',
  local:      'Local ou unidade para a realização da prova presencial:',
  endereco:   'Endereço do local ou unidade para a realização da prova presencial:'
};

function lerFormularioTexto(texto){
  var linhas = linhasDoFormulario(texto);
  var avisos = [];
  var out = { sei:'', modalidade:'', duracao:null, local:'', endereco:'' };

  out.sei = extrairSei(texto);
  if(!out.sei) avisos.push('Não foi possível localizar o número do processo SEI no formulário — preencha o campo manualmente.');

  var mod = campoForm(linhas, ROTULOS.modalidade);
  if(mod === null || !mod){
    avisos.push('Campo "Modalidade do processo seletivo" não localizado no formulário — selecione manualmente.');
  } else if(/on\s*-?\s*line/i.test(mod)){ out.modalidade = 'On-line'; }
  else if(/presencial/i.test(mod)){ out.modalidade = 'Presencial'; }
  else { avisos.push('Modalidade lida como "'+mod+'", que não é "On-line" nem "Presencial" — selecione manualmente.'); }

  var dur = campoForm(linhas, ROTULOS.duracao);
  if(dur === null || !dur){
    avisos.push('Campo "Quantas horas o candidato terá para realizar a prova" não localizado ou vazio — preencha a duração manualmente.');
  } else {
    out.duracao = lerDuracao(dur);
    if(!out.duracao){
      avisos.push('Não foi possível interpretar a duração da prova a partir de "'+dur+'" — preencha manualmente.');
    } else if(!/^\d{1,2}$/.test(dur.trim())){
      avisos.push('A duração da prova foi interpretada como '+fmtDuracao(out.duracao)+' a partir do texto livre "'+dur+'" — confira.');
    }
  }

  var loc = campoForm(linhas, ROTULOS.local);
  var end = campoForm(linhas, ROTULOS.endereco);
  out.localBruto = loc || '';
  out.enderecoBruto = end || '';
  out.local = normalizarLocal(loc || '');
  var infoEnd = analisarEndereco(end || '');
  out.endereco = infoEnd.texto;

  if(out.modalidade === 'Presencial'){
    if(!out.local)    avisos.push('Prova presencial, mas o campo "Local ou unidade para a realização da prova presencial" está vazio no formulário — preencha manualmente.');
    if(!out.endereco) avisos.push('Prova presencial, mas o campo "Endereço do local ou unidade" está vazio no formulário — preencha manualmente.');
    if(pareceTruncado(out.localBruto))    avisos.push('O LOCAL parece ter sido cortado pelo formulário do SEI ("'+out.localBruto+'") — confira e complete.');
    if(pareceTruncado(out.enderecoBruto)) avisos.push('O ENDEREÇO parece ter sido cortado pelo formulário do SEI ("'+out.enderecoBruto+'") — confira e complete.');
    // Toda mudança no endereço é declarada, com o texto original ao lado do
    // publicado, para o usuário conferir peça por peça.
    if(out.endereco && out.endereco !== colapsa(out.enderecoBruto)){
      avisos.push('O ENDEREÇO foi padronizado. Original do formulário: "'+colapsa(out.enderecoBruto)
        + '". Como será publicado: "'+out.endereco+'". Confira antes de publicar.');
    }
    infoEnd.notas.forEach(function(n){ avisos.push('ENDEREÇO — ' + n + '.'); });
    if(out.local && out.local !== colapsa(out.localBruto))
      avisos.push('O local foi ajustado automaticamente ("'+colapsa(out.localBruto)+'" → "'+out.local+'"). Confira antes de publicar.');
  }

  out.avisos = avisos;
  return out;
}

/* ==========================================================================
   C) LEITURA DO RELATÓRIO DE INSCRITOS (planilha da Fábrica de Provas)
   ========================================================================== */

/* O relatório sai do sistema com estes cabeçalhos; localizamos pela comparação
   normalizada, para tolerar acentuação e maiúsculas diferentes. */
function acharColuna(cab, nomes){
  for(var i=0;i<cab.length;i++){
    var n = norm(cab[i]);
    for(var j=0;j<nomes.length;j++){
      if(n === norm(nomes[j]) || n.indexOf(norm(nomes[j])) === 0) return i;
    }
  }
  return -1;
}

/* O número de inscrição chega da planilha como número (5240056) e o SheetJS o
   entrega como "5240056.0" em alguns arquivos — normalizamos para inteiro. */
function limpaInscricao(v){
  var s = String(v==null?'':v).trim();
  if(!s) return '';
  s = s.replace(/[^\d.,]/g,'').replace(/[.,]0+$/,'');
  s = s.replace(/[.,]/g,'');
  return s;
}

function lerMatrizInscritos(matriz){
  var res = { cands:[], avisos:[], total:0, deferidas:0, indeferidas:0, outras:0 };
  if(!matriz || !matriz.length){
    res.avisos.push('A planilha está vazia ou não pôde ser lida.');
    return res;
  }
  // a linha de cabeçalho é a primeira que contenha "Nome" e "Situação"
  var iCab = -1;
  for(var k=0; k<Math.min(matriz.length, 12); k++){
    var lin = (matriz[k]||[]).map(function(c){ return norm(c); });
    if(lin.indexOf('nome') !== -1 && lin.some(function(c){ return c.indexOf('situacao') === 0; })){ iCab = k; break; }
  }
  if(iCab === -1){
    res.avisos.push('Não foi encontrada a linha de cabeçalho da planilha (com as colunas "Nome" e "Situação da inscrição"). Confirme se o arquivo é o Relatório de inscritos da Fábrica de Provas.');
    return res;
  }
  var cab = matriz[iCab].map(function(c){ return String(c==null?'':c); });
  var cNome = acharColuna(cab, ['Nome','Candidato','Nome do candidato']);
  var cInsc = acharColuna(cab, ['Inscrição','Inscricao','Nº de inscrição','Numero de inscricao']);
  var cSit  = acharColuna(cab, ['Situação da inscrição','Situacao da inscricao','Situação']);

  if(cNome === -1){ res.avisos.push('Coluna "Nome" não encontrada na planilha.'); return res; }
  if(cSit === -1)  res.avisos.push('Coluna "Situação da inscrição" não encontrada — todos os candidatos da planilha foram incluídos. Confira a lista.');
  if(cInsc === -1) res.avisos.push('Coluna "Inscrição" não encontrada — os números de inscrição ficaram em branco.');

  for(var i=iCab+1; i<matriz.length; i++){
    var r = matriz[i] || [];
    var nome = colapsa(r[cNome]);
    if(!nome) continue;
    res.total++;
    var sit = cSit === -1 ? 'DEFERIDA' : norm(r[cSit]);
    if(cSit !== -1){
      if(sit.indexOf('indeferid') === 0){ res.indeferidas++; continue; }
      if(sit.indexOf('deferid') !== 0){
        res.outras++;
        res.avisos.push('Linha '+(i+1)+' ("'+nome+'") com situação "'+colapsa(r[cSit])+'", que não é DEFERIDA nem INDEFERIDA — não foi incluída. Acrescente manualmente se for o caso.');
        continue;
      }
      res.deferidas++;
    } else { res.deferidas++; }

    var insc = cInsc === -1 ? '' : limpaInscricao(r[cInsc]);
    if(!insc) res.avisos.push('Candidato(a) "'+nome+'" está DEFERIDA mas sem número de inscrição na planilha — preencha manualmente na tabela.');
    res.cands.push({ inscricao: insc, nome: nome.toUpperCase() });
  }

  if(!res.cands.length) res.avisos.push('Nenhuma inscrição DEFERIDA foi encontrada na planilha.');
  ordenarPorNome(res.cands);
  return res;
}

function ordenarPorNome(lista){
  lista.sort(function(a,b){
    return C.normName(a.nome).localeCompare(C.normName(b.nome),'pt-BR');
  });
}

/* Colagem manual da lista (alternativa à planilha): aceita "inscrição TAB nome",
   "inscrição espaço nome" e "nome TAB inscrição". Linhas não reconhecidas são
   devolvidas ao usuário com o texto exato — nunca somem em silêncio. */
function lerListaColada(txt){
  var res = { cands:[], avisos:[] };
  String(txt||'').replace(/\r\n?/g,'\n').split('\n').forEach(function(linha){
    var l = linha.trim();
    if(!l) return;
    if(/^(inscri|candidat|nome|ordem|n[º°]\b)/.test(norm(l))) return; // cabeçalho colado junto
    var m = /^(\d{4,10})\s*[\t;|]?\s*(.+)$/.exec(l);
    if(m && /[A-Za-zÀ-ÿ]/.test(m[2])){
      res.cands.push({ inscricao: m[1], nome: colapsa(m[2]).toUpperCase() });
      return;
    }
    m = /^(.+?)[\t;|]\s*(\d{4,10})\s*$/.exec(l);
    if(m){
      res.cands.push({ inscricao: m[2], nome: colapsa(m[1]).toUpperCase() });
      return;
    }
    m = /^(.+?)\s+(\d{4,10})\s*$/.exec(l);
    if(m && /[A-Za-zÀ-ÿ]/.test(m[1])){
      res.cands.push({ inscricao: m[2], nome: colapsa(m[1]).toUpperCase() });
      return;
    }
    res.avisos.push('Linha não reconhecida: "'+l+'"');
  });
  if(!res.cands.length) res.avisos.push('Nenhuma linha de candidato foi reconhecida no texto colado.');
  return res;
}

/* ==========================================================================
   D) ESTADO DA FERRAMENTA
   ========================================================================== */

var est = {
  sei:'', unidade:'', modalidade:'Presencial',
  dataIni:'', horaIni:'', dataFim:'', horaFim:'',
  duracao:'', local:'', endereco:'',
  dataAss:'', assinanteNome:'', assinanteCargo:'',
  cands:[], seqId:1,
  editando:false,
  avisosLeitura:[]
};

var ASSINANTE_PADRAO = 'JOÃO PEDRO DE PAULA SOARES VALENTE';
var CARGO_PADRAO = 'Chefe da Divisão de Seleção de Estagiários e Residentes, Formação de Talentos e Ambientação\n'
  + 'Coordenadoria de Desenvolvimento Humano e Organizacional\n'
  + 'Secretaria de Gestão de Pessoas';

function novoId(){ return est.seqId++; }
function candPorId(id){ return est.cands.filter(function(c){ return c.id === id; })[0] || null; }
function indiceDoId(id){
  for(var i=0;i<est.cands.length;i++) if(est.cands[i].id === id) return i;
  return -1;
}
function adotarCandidatos(lista){
  est.cands = lista.map(function(c){
    return { id: novoId(), inscricao: c.inscricao || '', nome: c.nome || '' };
  });
}

function ehOnline(){ return est.modalidade === 'On-line'; }
function usaPeriodo(){ return !!(est.dataFim || est.horaFim); }

/* ==========================================================================
   E) CAMPOS — leitura, escrita e validação
   ========================================================================== */

var CAMPOS = [
  ['sei','p14Sei'], ['unidade','p14Unidade'], ['modalidade','p14Modalidade'],
  ['dataIni','p14DataIni'], ['horaIni','p14HoraIni'],
  ['dataFim','p14DataFim'], ['horaFim','p14HoraFim'],
  ['duracao','p14Duracao'], ['local','p14Local'], ['endereco','p14Endereco'],
  ['dataAss','p14DataAss'], ['assinanteNome','p14Assinante'], ['assinanteCargo','p14Cargo']
];

function camposParaTela(){
  CAMPOS.forEach(function(p){
    var el = $(p[1]);
    if(el) el.value = est[p[0]] || '';
  });
  aplicarModalidade();
  atualizarPrevia();
  marcarObrigatorios();
}
function telaParaCampos(){
  CAMPOS.forEach(function(p){
    var el = $(p[1]);
    if(el) est[p[0]] = el.value;
  });
}

function aplicarModalidade(){
  var presencial = !ehOnline();
  ['p14LocalWrap','p14EnderecoWrap'].forEach(function(id){
    var el = $(id);
    if(el) el.style.display = presencial ? '' : 'none';
  });
  var obs = $('p14NotaOnline');
  if(obs) obs.style.display = presencial ? 'none' : '';
}

/* Campos obrigatórios ficam com borda vermelha enquanto vazios — mesmo destaque
   do Gerador do Edital de Abertura. Nunca bloqueiam: só avisam. */
function obrigatoriosVazios(){
  var faltas = [];
  if(!est.sei.trim()) faltas.push('Número do processo SEI');
  if(!est.unidade.trim()) faltas.push('Nome da unidade');
  if(!est.modalidade) faltas.push('Modalidade');
  if(!lerDataBarra(est.dataIni)) faltas.push('Data de início da prova');
  if(!lerHora(est.horaIni)) faltas.push('Horário de início da prova');
  if(!lerDuracao(est.duracao)) faltas.push('Duração da prova');
  if(!ehOnline()){
    if(!est.local.trim()) faltas.push('Local');
    if(!est.endereco.trim()) faltas.push('Endereço');
  }
  if(!est.cands.length) faltas.push('Tabela de candidatos (nenhum candidato)');
  // período: se um dos dois campos de fim foi preenchido, o outro passa a ser exigido
  if(est.dataFim && !lerHora(est.horaFim)) faltas.push('Horário de fim da prova (obrigatório porque a data de fim foi preenchida)');
  if(est.horaFim && !lerDataBarra(est.dataFim)) faltas.push('Data de fim da prova (obrigatória porque o horário de fim foi preenchido)');
  return faltas;
}

var MAPA_REQ = {
  'Número do processo SEI':'p14Sei', 'Nome da unidade':'p14Unidade',
  'Data de início da prova':'p14DataIni', 'Horário de início da prova':'p14HoraIni',
  'Duração da prova':'p14Duracao', 'Local':'p14Local', 'Endereço':'p14Endereco'
};
function marcarObrigatorios(){
  var faltas = obrigatoriosVazios();
  Object.keys(MAPA_REQ).forEach(function(k){
    var el = $(MAPA_REQ[k]);
    if(el) el.classList.toggle('p14-vazio', faltas.indexOf(k) !== -1);
  });
  ['p14DataFim','p14HoraFim'].forEach(function(id){
    var el = $(id);
    if(el) el.classList.toggle('p14-vazio',
      faltas.some(function(f){ return f.indexOf('fim da prova (obrigat') !== -1; }));
  });
  var cx = $('p14AvisoCampos');
  if(cx){
    if(faltas.length){
      cx.className = 'notice-banner warn';
      cx.innerHTML = '<strong>Faltam preencher:</strong> ' + esc(faltas.join('; ')) + '.';
      cx.style.display = '';
    } else {
      cx.className = 'notice-banner ok';
      cx.innerHTML = '<strong>Tudo preenchido.</strong> Confira os dados e gere o edital.';
      cx.style.display = '';
    }
  }
}

/* Pré-visualização das linhas DATA/HORÁRIO, para o usuário conferir a regra
   aplicada (período de vários dias × horário simples) antes de gerar. */
function atualizarPrevia(){
  var el = $('p14Previa');
  if(!el) return;
  var l = linhasDataHora();
  el.innerHTML = l.length
    ? l.map(function(x){ return '<div><strong>'+esc(x.rot)+':</strong> '+esc(x.val)+'</div>'; }).join('')
    : '<em>preencha data, horário e duração para ver a prévia</em>';
}

/* ==========================================================================
   F) MONTAGEM DO TEXTO DO EDITAL
   ========================================================================== */

/* Regras acordadas:
   - sem data/hora de fim: "HORÁRIO: 14h00min às 17h00min." (fim = início + duração)
   - com data/hora de fim (prova disponível por vários dias):
       "DATA: 10/07/2026 a 13/07/2026."
       "HORÁRIO: 00h00min de 10/07/2026 às 23h59min de 13/07/2026, com duração
        máxima de 02h00min a partir do início da prova pelo candidato."
   - On-line: sem LOCAL/ENDEREÇO, com a linha OBSERVAÇÕES do link da prova.
   - Presencial: com LOCAL e ENDEREÇO, sem OBSERVAÇÕES.                     */
function linhasDataHora(){
  var out = [];
  var dIni = est.dataIni, hIni = lerHora(est.horaIni), dur = lerDuracao(est.duracao);
  var dFim = est.dataFim, hFim = lerHora(est.horaFim);
  var periodo = usaPeriodo();

  out.push({ rot:'DATA', val: (periodo && dFim && dFim !== dIni)
    ? (dIni + ' a ' + dFim + '.')
    : (dIni ? dIni + '.' : '') });

  if(periodo){
    var t = (hIni ? fmtHora(hIni) : '') + (dIni ? ' de ' + dIni : '')
          + ' às ' + (hFim ? fmtHora(hFim) : '') + (dFim ? ' de ' + dFim : '');
    if(dur) t += ', com duração máxima de ' + fmtDuracao(dur) + ' a partir do início da prova pelo candidato';
    out.push({ rot:'HORÁRIO', val: colapsa(t) + '.' });
  } else {
    var fim = somarHoras(hIni, dur);
    out.push({ rot:'HORÁRIO', val: (hIni ? fmtHora(hIni) : '') + ' às ' + (fim ? fmtHora(fim) : '') + '.' });
  }

  if(ehOnline()){
    out.push({ rot:'OBSERVAÇÕES', val:'Prova on-line: ' + LINK_PROVA + '.' });
  } else {
    out.push({ rot:'LOCAL', val: est.local ? est.local.replace(/\.\s*$/,'') + '.' : '' });
    out.push({ rot:'ENDEREÇO', val: est.endereco ? est.endereco.replace(/\.\s*$/,'') + '.' : '' });
  }
  return out.filter(function(x){ return x.val && x.val !== '.'; });
}

function textoNumSei(){ return est.sei.trim() || '____________________'; }

/* Tabela de candidatos com linha simples de 1pt preta e alinhamento à esquerda,
   com o estilo NAS PRÓPRIAS CÉLULAS: é o que sobrevive à colagem no Athos, que
   descarta folhas de estilo. */
function tabelaCandidatosHTML(){
  var bordaCel = 'border:1pt solid #000000;text-align:left;padding:4px 8px;font-weight:normal;';
  var bordaCab = 'border:1pt solid #000000;text-align:left;padding:4px 8px;font-weight:bold;';
  var h = '<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;">';
  h += '<tr><td style="'+bordaCab+'width:22%;"><b>INSCRIÇÃO</b></td><td style="'+bordaCab+'"><b>CANDIDATO(A)</b></td></tr>';
  est.cands.forEach(function(c){
    h += '<tr><td style="'+bordaCel+'">'+esc(c.inscricao)+'</td>'
       + '<td style="'+bordaCel+'">'+esc(c.nome)+'</td></tr>';
  });
  return h + '</table>';
}

function corpoEditalHTML(){
  var p = [];
  p.push('<p class="ed-j">A Secretaria de Gestão de Pessoas, no uso de suas atribuições, torna público o '
    + 'edital de ensalamento de processo seletivo de estudantes, mediante as disposições do '
    + 'Decreto Judiciário nº 345/2019.</p>');
  p.push('<p class="ed-j">&nbsp;</p>');
  linhasDataHora().forEach(function(l){
    p.push('<p class="ed-j"><b>' + esc(l.rot) + ':</b> ' + esc(l.val) + '</p>');
  });
  p.push('<p class="ed-j">&nbsp;</p>');
  p.push(tabelaCandidatosHTML());
  return p.join('\n');
}

function gerarBlocos(){
  var b = {};
  // 1 — Nome do documento (campo "nome" do documento no Athos)
  b[1] = '<p>Edital de Ensalamento - SEI!TJPR nº ' + esc(textoNumSei()) + '</p>';
  // 2 — Preâmbulo: dois pedaços copiáveis em separado
  b['2a'] = '<p class="ed-c ed-b">ENSALAMENTO</p>';
  b['2b'] = '<p class="ed-c ed-b">' + esc((est.unidade||'').toUpperCase()) + '</p>';
  // 3 — Numeração: só o número. O rótulo "SEI!TJPR N°" já é impresso pelo
  // próprio modelo de blocos do Athos — se viesse junto na cópia, sairia
  // duplicado. Ele só reaparece no PDF (ver cabecalhoPDFHTML).
  b[3] = '<p class="ed-c ed-b">' + esc(textoNumSei()) + '</p>';
  // 4 — Conteúdo
  b[4] = corpoEditalHTML();
  // 5 — Data: só "28 de julho de 2026" (sem local e sem ponto final)
  b[5] = '<p class="ed-c">' + esc(somenteDataExtenso(est.dataAss) || hojeExtenso()) + '</p>';
  // 6 — Quem assina
  var b6 = '';
  if(est.assinanteNome) b6 += '<p class="ed-c ed-b">' + esc(est.assinanteNome.toUpperCase()) + '</p>';
  (est.assinanteCargo||'').split('\n').map(function(l){ return l.trim(); })
    .filter(Boolean).forEach(function(l){ b6 += '<p class="ed-c ed-b">' + esc(l) + '</p>'; });
  b[6] = b6;
  return b;
}

var IDS_BLOCOS = ['1','2a','2b','3','4','5','6'];
function elBloco(n){ return $('p14Bloco'+n); }
function blocosEls(){ return IDS_BLOCOS.map(elBloco).filter(Boolean); }

/* ==========================================================================
   G) CÓPIA COM FORMATAÇÃO (mesmo caminho do Gerador do Edital de Abertura)
   ========================================================================== */

var ED_FONTE = 'Calibri,\'Carlito\',Arial,sans-serif';
var ED_ENTRELINHA = '1';          // parágrafo simples
var ED_ESPACO_P = '0';            // sem espaçamento entre parágrafos
var ED_ENTRELINHA_PDF = '1.15';

/* Converte as classes internas (ed-c/ed-b/ed-j) em estilo inline + marcação
   clássica (align, <b>) direto no elemento vivo. É o que faz a formatação
   sobreviver tanto ao botão "Copiar" quanto ao Ctrl+C manual: no destino as
   classes desta folha de estilo não existem. */
function aplicarEstilosInline(el){
  if(!el) return;
  Array.prototype.forEach.call(el.querySelectorAll('p'), function(pEl){
    if(pEl.classList.contains('ed-c')){ pEl.style.textAlign='center';  pEl.setAttribute('align','center'); }
    if(pEl.classList.contains('ed-j')){ pEl.style.textAlign='left';    pEl.setAttribute('align','left'); }
    if(pEl.classList.contains('ed-b')){ pEl.style.fontWeight='bold'; pEl.innerHTML='<b>'+pEl.innerHTML+'</b>'; }
    pEl.style.margin = '0 0 ' + ED_ESPACO_P;
    pEl.style.lineHeight = ED_ENTRELINHA;
    pEl.classList.remove('ed-c','ed-j','ed-b');
    if(!pEl.className) pEl.removeAttribute('class');
  });
}

function htmlComEstilosInline(el, entrelinha){
  var lh = entrelinha || ED_ENTRELINHA;
  var clone = el.cloneNode(true);
  Array.prototype.forEach.call(clone.querySelectorAll('p'), function(pEl){
    pEl.style.lineHeight = lh;
  });
  return '<div style="font-family:'+ED_FONTE+';font-size:11pt;line-height:'+lh+';">'
    + clone.innerHTML + '</div>';
}

function copiarSelecaoViva(el){
  var r = document.createRange(); r.selectNodeContents(el);
  var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  var ok = false;
  try{ ok = document.execCommand('copy'); }catch(e){ ok = false; }
  sel.removeAllRanges();
  return ok;
}

function copiarElementos(els, msgOk){
  if(!els.length) return;
  if(els.length === 1 && copiarSelecaoViva(els[0])){ aviso(msgOk); return; }
  var tmp = document.createElement('div');
  tmp.innerHTML = els.map(function(el){ return htmlComEstilosInline(el); }).join('');
  tmp.style.cssText = 'position:absolute;left:-9999px;top:0;width:720px;';
  document.body.appendChild(tmp);
  var ok = false;
  try{ ok = copiarSelecaoViva(tmp); }catch(e){ ok = false; }
  document.body.removeChild(tmp);
  aviso(ok ? msgOk : 'Não foi possível copiar automaticamente. Selecione o quadro e use Ctrl+C.');
}

function aviso(msg){
  var n = $('p14MsgAcao');
  if(!n) return;
  n.textContent = msg;
  setTimeout(function(){ if(n.textContent === msg) n.textContent = ''; }, 6000);
}

/* Texto puro de um bloco, já com as edições feitas à mão nos quadros. */
function textoBloco(n){
  var el = elBloco(n);
  return el ? colapsa(el.textContent || '') : '';
}

/* No Athos o preâmbulo é montado pelo modelo (que acrescenta "EDITAL DE" e o
   rótulo "SEI!TJPR N°"); por isso os blocos 2 e 3 saem só com o miolo. O PDF não
   passa pelo modelo, então reconstrói aqui o cabeçalho completo, em três linhas:
   EDITAL DE ENSALAMENTO / SEI!TJPR N° 0000000-00.0000.0.00.0000 / UNIDADE.
   O bloco 1 (nome do documento) é interno do SEI e não entra no PDF. */
function cabecalhoPDFHTML(){
  var linhas = [];
  var tipo = (textoBloco('2a') || 'ENSALAMENTO').toUpperCase();
  linhas.push(/^EDITAL\b/.test(tipo) ? tipo : 'EDITAL DE ' + tipo);
  var num = textoBloco('3');
  if(num) linhas.push('SEI!TJPR N° ' + num);
  var unidade = textoBloco('2b');
  if(unidade) linhas.push(unidade.toUpperCase());
  return linhas.map(function(l){
    return '<p align="center" style="text-align:center;margin:0;line-height:'
      + ED_ENTRELINHA_PDF + ';"><b>' + esc(l) + '</b></p>';
  }).join('');
}

var IDS_BLOCOS_PDF = ['4','5','6'];

function baixarPDF(){
  var w = window.open('','_blank');
  if(!w){ aviso('O navegador bloqueou a janela de impressão — permita pop-ups para esta página.'); return; }
  var corpo = IDS_BLOCOS_PDF.map(elBloco).filter(Boolean)
    .map(function(el){ return htmlComEstilosInline(el, ED_ENTRELINHA_PDF); })
    .join('<div class="p14-espaco"></div>');
  w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">'
    + '<title>Edital de Ensalamento</title><style>'
    + '@page{margin:2.5cm 2cm;} body{font-family:Calibri,"Carlito",Arial,sans-serif;font-size:11pt;line-height:1.15;color:#000;}'
    + 'table{border-collapse:collapse;width:100%;} td{border:1pt solid #000;padding:4px 8px;text-align:left;}'
    + '.p14-espaco{height:12pt;}'
    + '</style></head><body>'
    + '<div style="font-family:Calibri,\'Carlito\',Arial,sans-serif;font-size:11pt;">'
    + cabecalhoPDFHTML() + '</div>'
    + '<div class="p14-espaco"></div>'
    + corpo
    + '</body></html>');
  w.document.close();
  w.focus();
  setTimeout(function(){ w.print(); }, 300);
}

function alternarEdicaoTexto(){
  var els = blocosEls(), btn = $('p14BtnEditarTexto');
  var ligado = els[0].getAttribute('contenteditable') === 'true';
  els.forEach(function(el){
    el.setAttribute('contenteditable', ligado ? 'false' : 'true');
    el.classList.toggle('ed-editando', !ligado);
    if(ligado) aplicarEstilosInline(el);
  });
  btn.textContent = ligado ? 'Editar texto' : 'Concluir edição';
  var tb = $('p14Toolbar');
  if(tb) tb.classList.toggle('show', !ligado);
  if(!ligado) els[0].focus();
}

/* ==========================================================================
   H) TABELA DE CANDIDATOS (conferência, edição e reordenação)
   ========================================================================== */

function renderTabela(){
  var box = $('p14Tabela');
  if(!box) return;
  if(!est.cands.length){
    box.innerHTML = '<p class="zona-vazia">nenhum candidato na lista — ative a edição e use “Adicionar linha”, '
      + 'ou reenvie o relatório de inscritos</p>';
    atualizarContagem();
    return;
  }
  var ed = est.editando;
  var h = '<div class="table-scroll" style="max-height:none;">'
    + '<table class="cv-grade-table" style="white-space:normal;font-family:\'Barlow\',system-ui,sans-serif;font-size:12.5px;">'
    + '<thead><tr>'
    + (ed ? '<th style="width:30px;"></th>' : '')
    + '<th style="width:34px;">#</th><th style="width:120px;">INSCRIÇÃO</th><th>CANDIDATO(A)</th>'
    + (ed ? '<th style="width:60px;">Ações</th>' : '')
    + '</tr></thead><tbody>';

  est.cands.forEach(function(c, i){
    h += '<tr data-id="'+c.id+'" draggable="false">';
    if(ed) h += '<td style="text-align:center;width:30px;">'
      + '<button type="button" class="drag-handle" data-id="'+c.id+'" tabindex="0" '
      + 'title="Arrastar para reordenar (ou Alt+↑ / Alt+↓)" aria-label="Reordenar '+esc(c.nome||'linha')+'">⠿</button></td>';
    h += '<td style="text-align:center;color:var(--ink-soft);">'+(i+1)+'</td>';
    if(ed){
      h += '<td><input class="p14In" data-f="inscricao" value="'+esc(c.inscricao)+'" '
        + 'style="width:100%;padding:5px;border:1px solid var(--line);font-size:12.5px;text-align:center;"></td>';
      h += '<td><input class="p14In" data-f="nome" value="'+esc(c.nome)+'" '
        + 'style="width:100%;padding:5px;border:1px solid var(--line);font-size:12.5px;"></td>';
      h += '<td style="text-align:center;"><button type="button" class="p14Act" data-a="apaga" '
        + 'title="Excluir linha" tabindex="-1">✕</button></td>';
    } else {
      h += '<td style="text-align:center;">'+esc(c.inscricao || '—')+'</td>';
      h += '<td>'+esc(c.nome)+'</td>';
    }
    h += '</tr>';
  });
  box.innerHTML = h + '</tbody></table></div>';

  ligarEventosTabela();
  if(ed) ligarArrastarSoltar();
  atualizarContagem();
}

function atualizarContagem(){
  var n = $('p14Contagem');
  if(!n) return;
  var semInsc = est.cands.filter(function(c){ return !c.inscricao; }).length;
  var vazios  = est.cands.filter(function(c){ return !c.nome; }).length;
  var t = est.cands.length + ' candidato' + (est.cands.length===1?'':'s') + ' na lista';
  if(semInsc) t += ' · ' + semInsc + ' sem número de inscrição';
  if(vazios)  t += ' · ' + vazios + ' sem nome';
  n.textContent = t;
  n.style.color = (semInsc || vazios) ? 'var(--coral)' : 'var(--ink-soft)';
}

function ligarEventosTabela(){
  var box = $('p14Tabela');
  Array.prototype.forEach.call(box.querySelectorAll('.p14In'), function(inp){
    inp.addEventListener('input', function(){
      var tr = inp.closest('tr');
      var c = candPorId(Number(tr.dataset.id));
      if(!c) return;
      var f = inp.dataset.f;
      c[f] = (f === 'nome') ? inp.value.toUpperCase() : inp.value;
      if(f === 'nome' && inp.value !== c.nome){
        var pos = inp.selectionStart;
        inp.value = c.nome;
        try{ inp.setSelectionRange(pos,pos); }catch(e){}
      }
      atualizarContagem();
      marcarObrigatorios();
    });
  });
  Array.prototype.forEach.call(box.querySelectorAll('.p14Act'), function(b){
    b.addEventListener('click', function(){
      var tr = b.closest('tr');
      var i = indiceDoId(Number(tr.dataset.id));
      if(i < 0) return;
      est.cands.splice(i,1);
      renderTabela();
      marcarObrigatorios();
    });
  });
}

/* Arrastar e soltar de linhas. O <tr> só fica "draggable" enquanto o ponteiro
   está sobre a alça ⠿ — sem isso, arrastar para selecionar texto dentro de um
   campo iniciaria um arraste de linha por engano. Alt+↑/Alt+↓ faz o mesmo pelo
   teclado. */
function ligarArrastarSoltar(){
  var box = $('p14Tabela');
  var origemId = null;

  Array.prototype.forEach.call(box.querySelectorAll('.drag-handle'), function(h){
    var tr = h.closest('tr');
    h.addEventListener('mousedown', function(){ tr.setAttribute('draggable','true'); });
    h.addEventListener('mouseup',   function(){ tr.setAttribute('draggable','false'); });
    h.addEventListener('keydown', function(ev){
      if(!ev.altKey || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
      ev.preventDefault();
      moverPorTeclado(Number(h.dataset.id), ev.key === 'ArrowUp' ? -1 : 1);
    });
  });

  function limparMarcas(manter){
    Array.prototype.forEach.call(box.querySelectorAll('tr'), function(t){
      t.classList.remove('drop-before','drop-after');
      if(!manter) t.classList.remove('row-dragging');
    });
  }

  Array.prototype.forEach.call(box.querySelectorAll('tbody tr[data-id]'), function(tr){
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
      if(origemId === null) return;
      ev.preventDefault();
      try{ ev.dataTransfer.dropEffect = 'move'; }catch(e){}
      limparMarcas(true);
      var r = tr.getBoundingClientRect();
      tr.classList.add(((ev.clientY - r.top) > r.height/2) ? 'drop-after' : 'drop-before');
    });
    tr.addEventListener('drop', function(ev){
      ev.preventDefault();
      if(origemId === null) return;
      var de = indiceDoId(origemId);
      var alvo = indiceDoId(Number(tr.dataset.id));
      var r = tr.getBoundingClientRect();
      var depois = (ev.clientY - r.top) > r.height/2;
      origemId = null;
      limparMarcas();
      if(de < 0 || alvo < 0) return;
      mover(de, alvo + (depois ? 1 : 0));
    });
  });
}

function mover(de, destino){
  var mov = est.cands[de];
  if(!mov) return;
  if(de < destino) destino--;
  est.cands.splice(de,1);
  destino = Math.max(0, Math.min(destino, est.cands.length));
  est.cands.splice(destino, 0, mov);
  renderTabela();
}
function moverPorTeclado(id, passo){
  var i = indiceDoId(id);
  if(i < 0) return;
  var j = i + passo;
  if(j < 0 || j >= est.cands.length) return;
  var t = est.cands[i]; est.cands[i] = est.cands[j]; est.cands[j] = t;
  renderTabela();
  var h = $('p14Tabela').querySelector('.drag-handle[data-id="'+id+'"]');
  if(h) h.focus();
}

function alternarEdicaoTabela(){
  est.editando = !est.editando;
  var b = $('p14BtnEditarTabela');
  b.textContent = est.editando ? 'Desativar edição (salvar)' : 'Editar tabela';
  b.classList.toggle('ativo', est.editando);
  var extra = $('p14AcoesTabela');
  if(extra) extra.style.display = est.editando ? '' : 'none';
  renderTabela();
}

/* ==========================================================================
   I) FLUXO: ler arquivos, processar, gerar
   ========================================================================== */

function mostrarAvisos(id, lista, titulo){
  var el = $(id);
  if(!el) return;
  if(!lista || !lista.length){ el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  el.className = 'notice-banner warn';
  el.innerHTML = '<strong>' + esc(titulo) + '</strong><ul class="warn-list">'
    + lista.map(function(a){ return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>';
}

async function textoDoPdf(file){
  return await C.pdfToText(file);
}

function matrizDaPlanilha(file){
  return new Promise(function(resolve, reject){
    var fr = new FileReader();
    fr.onerror = function(){ reject(new Error('Não foi possível ler o arquivo da planilha.')); };
    fr.onload = function(){
      try{
        if(typeof XLSX === 'undefined') throw new Error('Biblioteca de planilhas não carregada (vendor/xlsx.min.js).');
        var wb = XLSX.read(new Uint8Array(fr.result), {type:'array'});
        var ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, {header:1, raw:false, defval:''}));
      }catch(e){ reject(e); }
    };
    fr.readAsArrayBuffer(file);
  });
}

async function processar(){
  var avisos = [];
  var btn = $('p14BtnProcessar');
  btn.disabled = true;
  var rotuloOriginal = btn.textContent;
  btn.textContent = 'Processando...';

  try{
    /* ---- 1) formulário de abertura ---- */
    var fPdf = $('p14PdfFile').files && $('p14PdfFile').files[0];
    var colado = ($('p14TextoColado').value || '').trim();
    var texto = '';
    if(fPdf){
      try{ texto = await textoDoPdf(fPdf); }
      catch(e){ avisos.push('Falha ao ler o PDF do formulário: ' + e.message); }
      if(colapsa(texto).length < 40){
        avisos.push('O PDF do formulário não tem texto extraível (provavelmente é digitalizado). '
          + 'Use a opção "Colar texto manualmente".');
        texto = '';
      }
    }
    if(!texto && colado) texto = colado;
    if(!texto){
      avisos.push('Nenhum formulário de abertura foi lido — os campos automáticos ficaram em branco.');
    } else {
      var f = lerFormularioTexto(texto);
      est.sei = f.sei || est.sei;
      if(f.modalidade) est.modalidade = f.modalidade;
      if(f.duracao) est.duracao = fmtDuracao(f.duracao);
      if(f.local) est.local = f.local;
      if(f.endereco) est.endereco = f.endereco;
      avisos = avisos.concat(f.avisos);
    }

    /* ---- 2) relatório de inscritos ---- */
    var fXls = $('p14XlsFile').files && $('p14XlsFile').files[0];
    var listaColada = ($('p14ListaColada').value || '').trim();
    var lidos = null;
    if(fXls){
      try{
        var matriz = await matrizDaPlanilha(fXls);
        lidos = lerMatrizInscritos(matriz);
      }catch(e){ avisos.push('Falha ao ler a planilha de inscritos: ' + e.message); }
    }
    if(!lidos && listaColada) lidos = lerListaColada(listaColada);
    if(!lidos){
      avisos.push('Nenhum relatório de inscritos foi lido — a tabela de candidatos ficou vazia.');
    } else {
      adotarCandidatos(lidos.cands);
      avisos = avisos.concat(lidos.avisos);
      if(lidos.deferidas !== undefined){
        var resumo = $('p14ResumoPlanilha');
        if(resumo){
          resumo.style.display = '';
          resumo.className = 'notice-banner ok';
          resumo.innerHTML = '<strong>Planilha lida:</strong> ' + lidos.total + ' inscrição(ões) no relatório — '
            + '<strong>' + lidos.deferidas + ' DEFERIDA(S)</strong> incluída(s), '
            + lidos.indeferidas + ' INDEFERIDA(S) descartada(s)'
            + (lidos.outras ? ', ' + lidos.outras + ' com outra situação (não incluída[s])' : '') + '.';
        }
      }
    }
  } finally {
    btn.disabled = false;
    btn.textContent = rotuloOriginal;
  }

  /* ---- 3) valores padrão dos campos de assinatura ---- */
  if(!est.dataAss) est.dataAss = hojeExtenso();
  if(!est.assinanteNome) est.assinanteNome = ASSINANTE_PADRAO;
  if(!est.assinanteCargo) est.assinanteCargo = CARGO_PADRAO;

  est.avisosLeitura = avisos;
  mostrarAvisos('p14AvisosLeitura', avisos, 'Confira estes pontos antes de publicar:');
  camposParaTela();
  renderTabela();
  $('p14Etapa4').style.display = '';
  $('p14Etapa4').scrollIntoView({behavior:'smooth', block:'start'});
  salvarNota();
}

function gerarEdital(){
  telaParaCampos();
  var faltas = obrigatoriosVazios();
  marcarObrigatorios();
  if(faltas.length){
    if(!confirm('Ainda faltam campos:\n\n• ' + faltas.join('\n• ')
      + '\n\nGerar mesmo assim? Os trechos ficarão em branco no texto.')) return;
  }
  var b = gerarBlocos();
  IDS_BLOCOS.forEach(function(n){
    var el = elBloco(n);
    if(!el) return;
    el.innerHTML = b[n] || '';
    el.setAttribute('contenteditable','false');
    el.classList.remove('ed-editando');
    aplicarEstilosInline(el);
  });
  var btn = $('p14BtnEditarTexto');
  if(btn) btn.textContent = 'Editar texto';
  var tb = $('p14Toolbar');
  if(tb) tb.classList.remove('show');
  $('p14Etapa5').style.display = '';
  $('p14Etapa5').scrollIntoView({behavior:'smooth', block:'start'});
}

/* ==========================================================================
   J) RASCUNHO (.json) — salvar e retomar o trabalho
   ========================================================================== */

function estadoParaJson(){
  telaParaCampos();
  return JSON.stringify({
    ferramenta:'ponto14-ensalamento', versao:1,
    campos:{
      sei:est.sei, unidade:est.unidade, modalidade:est.modalidade,
      dataIni:est.dataIni, horaIni:est.horaIni, dataFim:est.dataFim, horaFim:est.horaFim,
      duracao:est.duracao, local:est.local, endereco:est.endereco,
      dataAss:est.dataAss, assinanteNome:est.assinanteNome, assinanteCargo:est.assinanteCargo
    },
    candidatos: est.cands.map(function(c){ return {inscricao:c.inscricao, nome:c.nome}; }),
    avisos: est.avisosLeitura
  }, null, 2);
}

function exportarRascunho(){
  var nome = 'rascunho-ensalamento-' + (est.sei ? est.sei.replace(/[^\d]/g,'') : 'sem-sei') + '.json';
  var blob = new Blob([estadoParaJson()], {type:'application/json;charset=utf-8'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
  salvarNota('rascunho salvo');
}

function abrirRascunho(file){
  var fr = new FileReader();
  fr.onload = function(){
    var d;
    try{ d = JSON.parse(fr.result); }
    catch(e){ alert('Arquivo de rascunho inválido (não é um JSON legível).'); return; }
    if(!d || d.ferramenta !== 'ponto14-ensalamento'){
      if(!confirm('Este rascunho não foi salvo por esta ferramenta. Tentar abrir assim mesmo?')) return;
    }
    Object.keys(d.campos || {}).forEach(function(k){
      if(k in est) est[k] = d.campos[k] || '';
    });
    adotarCandidatos(d.candidatos || []);
    est.avisosLeitura = d.avisos || [];
    mostrarAvisos('p14AvisosLeitura', est.avisosLeitura, 'Confira estes pontos antes de publicar:');
    camposParaTela();
    renderTabela();
    $('p14Etapa4').style.display = '';
    $('p14Etapa4').scrollIntoView({behavior:'smooth', block:'start'});
    salvarNota('rascunho aberto');
  };
  fr.readAsText(file, 'UTF-8');
}

function salvarNota(msg){
  var n = $('p14DraftNota');
  if(!n) return;
  if(msg){ n.textContent = msg; setTimeout(function(){ salvarNota(); }, 4000); return; }
  var p = est.cands.length;
  n.textContent = p ? (p + ' candidato' + (p===1?'':'s') + ' · ' + (est.sei || 'sem nº SEI'))
                    : 'nada preenchido ainda';
}

/* ==========================================================================
   K) LIGAÇÃO DA PÁGINA
   ========================================================================== */

function ligarArquivo(btnId, inputId, nomeId){
  var btn = $(btnId), inp = $(inputId), nome = $(nomeId);
  if(!btn || !inp) return;
  btn.addEventListener('click', function(){ inp.click(); });
  inp.addEventListener('change', function(){
    nome.textContent = inp.files && inp.files[0] ? inp.files[0].name : 'Nenhum arquivo selecionado';
  });
}

function alternarPainel(btnId, painelId, textoAbrir, textoFechar){
  var b = $(btnId), p = $(painelId);
  if(!b || !p) return;
  b.addEventListener('click', function(){
    var aberto = p.style.display !== 'none';
    p.style.display = aberto ? 'none' : '';
    b.textContent = aberto ? textoAbrir : textoFechar;
  });
}

if(TEM_DOM) document.addEventListener('DOMContentLoaded', function(){
  ligarArquivo('p14FileBtn','p14PdfFile','p14FileName');
  ligarArquivo('p14XlsBtn','p14XlsFile','p14XlsName');
  alternarPainel('p14BtnColar','p14ColarWrap','Colar texto manualmente','Ocultar campo de texto');
  alternarPainel('p14BtnColarLista','p14ColarListaWrap','Colar lista manualmente','Ocultar campo de texto');

  $('p14BtnProcessar').addEventListener('click', function(){
    processar().catch(function(e){
      mostrarAvisos('p14AvisosLeitura', ['Erro inesperado ao processar: ' + e.message],
        'Não foi possível concluir a leitura:');
    });
  });
  $('p14BtnGerar').addEventListener('click', gerarEdital);
  $('p14BtnEditarTabela').addEventListener('click', alternarEdicaoTabela);

  $('p14BtnAddLinha').addEventListener('click', function(){
    est.cands.push({ id: novoId(), inscricao:'', nome:'' });
    renderTabela();
    var ins = $('p14Tabela').querySelectorAll('tbody tr');
    var ultimo = ins[ins.length-1];
    if(ultimo){
      var campo = ultimo.querySelector('input[data-f="inscricao"]');
      if(campo) campo.focus();
    }
    marcarObrigatorios();
  });
  $('p14BtnOrdenar').addEventListener('click', function(){
    ordenarPorNome(est.cands);
    renderTabela();
  });

  // campos: qualquer alteração recalcula prévia e destaques
  CAMPOS.forEach(function(p){
    var el = $(p[1]);
    if(!el) return;
    ['input','change'].forEach(function(ev){
      el.addEventListener(ev, function(){
        telaParaCampos();
        if(p[0] === 'modalidade') aplicarModalidade();
        atualizarPrevia();
        marcarObrigatorios();
        salvarNota();
      });
    });
  });

  ativarMascaraSei($('p14Sei'));
  ativarMascaraData($('p14DataIni'));
  ativarMascaraData($('p14DataFim'));
  ativarMascaraHora($('p14HoraIni'));
  ativarMascaraHora($('p14HoraFim'));
  ativarMascaraHora($('p14Duracao'));
  ativarBotaoCalendario($('p14DataIni'));
  ativarBotaoCalendario($('p14DataFim'));
  ativarBotaoRelogio($('p14HoraIni'));
  ativarBotaoRelogio($('p14HoraFim'));

  // blocos: cópia individual
  Array.prototype.forEach.call(document.querySelectorAll('.p14-bloco-copiar'), function(b){
    b.addEventListener('click', function(){
      var el = elBloco(b.dataset.bloco);
      if(el) copiarElementos([el], b.dataset.rotulo + ' copiado — cole no campo correspondente do Athos.');
    });
  });
  $('p14BtnCopiarTudo').addEventListener('click', function(){
    copiarElementos(blocosEls(), 'Edital completo copiado com formatação.');
  });
  $('p14BtnPDF').addEventListener('click', baixarPDF);
  $('p14BtnEditarTexto').addEventListener('click', alternarEdicaoTexto);

  // barra de formatação do modo "Editar texto"
  Array.prototype.forEach.call(document.querySelectorAll('#p14Toolbar button[data-cmd]'), function(b){
    b.addEventListener('mousedown', function(ev){ ev.preventDefault(); });
    b.addEventListener('click', function(){
      try{ document.execCommand(b.dataset.cmd, false, null); }catch(e){}
    });
  });

  // rascunho
  $('p14BtnExportar').addEventListener('click', exportarRascunho);
  $('p14BtnAbrirRascunho').addEventListener('click', function(){ $('p14Rascunho').click(); });
  $('p14Rascunho').addEventListener('change', function(){
    if(this.files && this.files[0]) abrirRascunho(this.files[0]);
    this.value = '';
  });
  var tgl = $('p14DraftToggle');
  if(tgl) tgl.addEventListener('click', function(){
    var recolhida = $('p14Draft').classList.toggle('collapsed');
    tgl.textContent = recolhida ? '+' : '–';
    tgl.title = recolhida ? 'Abrir' : 'Recolher';
    tgl.setAttribute('aria-expanded', recolhida ? 'false' : 'true');
  });

  atualizarPrevia();
  salvarNota();
});

/* Exposto apenas para os testes automatizados em Node (teste_ponto14.js e
   teste_ponto14_dom.js). No navegador, `module` não existe e este trecho é
   simplesmente ignorado — nada muda no funcionamento da ferramenta. */
if(typeof module !== 'undefined' && module.exports){
  module.exports = { lerFormularioTexto, lerMatrizInscritos, normalizarEndereco, analisarEndereco,
                     normalizarLocal, somenteDataExtenso,
                     lerDuracao, lerHora, fmtHora, fmtDuracao, somarHoras, lerListaColada,
                     limpaInscricao, campoForm, linhasDoFormulario, extrairSei,
                     linhasDataHora, gerarBlocos, hojeExtenso,
                     _est: est, _setEst: function(o){ Object.keys(o).forEach(function(k){ est[k] = o[k]; }); } };
}

})();
