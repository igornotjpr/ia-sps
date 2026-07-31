/* Gerador do arquivo de importação para o Hércules — Divisão de Residência (TJPR)
   100% client-side. Depende de vendor/pdf.min.js (leitura de PDF) e core.js.

   Estrutura do arquivo:
     A) utilidades de texto/número
     B) leitura de PDF e agrupamento por linha (coordenadas)
     C) leitor do Edital de Classificação Final  (PDF -> quadro de conferência)
     D) leitor da Lista de dados dos inscritos   (PDF -> quadro de conferência)
     E) leitura dos quadros de conferência (texto editável -> dados)
     F) ordem de chamamento (Decisão 11697384)
     G) cruzamento, conferência e CSV
     H) ligação com a página
*/

(function(){
'use strict';

/* ========================= A) utilidades ========================= */

function $(id){ return document.getElementById(id); }
const esc = TJPRCore.escapeHtml;
const csvEscape = TJPRCore.csvEscape;

/* O escapeHtml do core trata &, < e > — o bastante para texto, mas não para
   valor de atributo: um nome com aspas ("José 'Zé' da Silva", ou uma aspa
   digitada por engano num campo) fecharia o value="…" e quebraria a linha
   inteira da grade editável. Os campos de edição vão para atributos, então
   usam esta versão. */
function escAttr(s){ return esc(s==null?'':s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function semAcento(s){ return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
// chave de cruzamento: maiúsculas, sem acento, só letras e espaço simples
function chaveNome(s){ return semAcento(s).toUpperCase().replace(/[^A-Z ]/g,' ').replace(/\s+/g,' ').trim(); }
function limpar(v){ return String(v==null?'':v).trim().replace(/\s+/g,' '); }
function soDigitos(v){ return String(v==null?'':v).replace(/\D/g,''); }

const RE_DECIMAL = /^\d{1,3}[.,]\d{1,2}$/;
const RE_INTEIRO = /^\d{1,3}$/;
const RE_DATA    = /^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})$/;

// "9,30" -> "9,30" | "9.3" -> "9,30" | "" -> ""
function fmtNota(v){
  const s = String(v==null?'':v).trim().replace(',','.');
  if(s==='') return '';
  const n = Number(s);
  if(!isFinite(n)) return String(v).trim();
  return n.toFixed(2).replace('.',',');
}

// "9,30" -> 9.3 | "" -> null  (para comparar notas entre tabelas diferentes)
function numNota(v){
  const s = String(v==null?'':v).trim().replace(',','.');
  if(s==='') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

// O Hércules exige CPF com 11 dígitos; ao passar pelo Excel o zero à esquerda
// se perde. Reconstituímos aqui e devolvemos o motivo quando não for possível.
function normalizarCPF(valor){
  const d = soDigitos(valor);
  if(d==='') return { cpf:'', erro:'CPF vazio' };
  if(d.length>11) return { cpf:d, erro:'CPF com '+d.length+' dígitos' };
  return { cpf:d.padStart(11,'0'), erro:(d.length<9 ? 'CPF com '+d.length+' dígitos' : null) };
}

/* ================ B) leitura de PDF e linhas por coordenada ================ */

// Devolve [{num, alt, itens:[{str,x,y,w}]}] — um item por palavra.
async function pdfParaPaginas(file){
  if(typeof pdfjsLib==='undefined') throw new Error('biblioteca de PDF não carregada (vendor/pdf.min.js)');
  // aberto por duplo clique (file://) o navegador bloqueia o worker externo;
  // o pdf.js então cai no worker embutido — mesmo ajuste das demais ferramentas
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

// Agrupa itens em linhas visuais (y decrescente = de cima para baixo na página).
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

// Todas as páginas em uma sequência única de linhas, na ordem de leitura.
function linhasDasPaginas(paginas, tolY){
  const out = [];
  paginas.forEach((pg,i)=>{
    agruparLinhas(pg.itens, tolY).forEach(l=>{
      out.push({ pag:i, y:l.y, yGlobal: -(i*1e6) + l.y, itens:l.itens, txt:l.txt });
    });
  });
  return out;
}

/* ============ C) leitor do Edital de Classificação Final ============ */

// Rótulos das seções de cota, na ordem de teste (o mais específico primeiro)
const COTAS_EDITAL = [
  { chave:'ppp', re:/(PRETA?|NEGRA?)\s*(OU|E)?\s*PARD|\bP\s*P\s*P\b/i,            rotulo:'PESSOA PRETA OU PARDA' },
  { chave:'pcd', re:/PESSOA[S]?\s+COM\s+DEFICI|DEFICI[EÊ]NCIA|\bP\s*C\s*D\b/i,     rotulo:'PcD - PESSOA COM DEFICIÊNCIA' },
  { chave:'ind', re:/IND[IÍ]GEN/i,                                                  rotulo:'INDÍGENA' },
  { chave:'ac',  re:/AMPLA\s+CONCORR/i,                                             rotulo:'AMPLA CONCORRÊNCIA' }
];

// Linhas de cabeçalho/rodapé institucional e do navegador, que não são dados
const RE_LIXO_EDITAL = new RegExp(
  '^(Firefox\\b|https?:|\\d+\\s+of\\s+\\d+\\b|TRIBUNAL DE JUSTI|EDITAL\\b|SEI!?TJPR|PROCESSO SELETIVO|'
  +'PROGRAMA DE RESID|Curitiba,|Assinado de forma digital|Dados: \\d|Ju[íi]za? de Direito|Desembargadora)','i');

function ehLinhaLixoEdital(txt){
  if(RE_LIXO_EDITAL.test(txt)) return true;
  if(/^\d{1,2}\/\d{1,2}\/\d{4}/.test(txt)) return true;          // "15/07/2026, 14:35"
  if(/portal\.tjpr\.jus\.br/i.test(txt)) return true;
  return false;
}

// Cabeçalho da tabela: só palavras do vocabulário de cabeçalho, sem nenhum
// número decimal. Cobre também os modelos embaralhados ("ORDEMNOME",
// "ENTRNEOVTISATA"), porque testamos por radical e não por igualdade.
function ehCabecalhoEdital(txt){
  if(/\d[.,]\d/.test(txt)) return false;
  const t = semAcento(txt).toUpperCase();
  if(!/(ORDEM|NOME|NOTA|PROVA|ENTREV|FINAL)/.test(t)) return false;
  return t.replace(/[^A-Z ]/g,' ').split(/\s+/).filter(Boolean)
    .every(p => /(ORDEM|NOME|NOTA|PROVA|ENTREV|FINAL|MEDIA|CLASSIF|CANDIDAT|DA|DE|DO|E)/.test(p));
}

function cotaDaLinha(txt){
  if(txt.length>70) return null;
  for(const c of COTAS_EDITAL){ if(c.re.test(txt)) return c.chave; }
  return null;
}

function temLetras(itens){
  return itens.some(i => /[A-Za-zÀ-ÿ]{2,}/.test(i.str));
}

/* Reconhece as tabelas do edital a partir das linhas por coordenada.

   Nestes editais NÃO dá para casar "uma linha = um candidato": dentro da mesma
   tabela, a célula da ORDEM é centralizada verticalmente enquanto a do NOME é
   alinhada ao topo, e cada coluna de nota tem alinhamento próprio. O resultado
   é que os pedaços de um mesmo candidato se espalham por 2 ou 3 linhas
   visuais, em ordens diferentes conforme o nome ocupe uma ou duas linhas.

   Por isso montamos BLOCOS: linhas consecutivas e próximas formam um registro,
   e um novo registro começa quando (a) aparece outra ORDEM, ou (b) o espaço
   vertical em relação à linha anterior é maior que o entrelinhas típico.
   Dentro do bloco, cada pedaço é identificado pelo que é — inteiro na coluna
   da ORDEM, decimal (nota) ou palavra (nome) — e não por onde caiu.
   A NOTA FINAL é sempre a nota mais à DIREITA do bloco. */
function reconhecerEdital(linhas){
  // 1) descarta cabeçalho/rodapé institucional e para no bloco de assinatura
  const uteis = [];
  for(const l of linhas){
    if(/^Curitiba,/i.test(l.txt)) break;      // daqui para baixo é a assinatura
    if(ehLinhaLixoEdital(l.txt)) continue;
    uteis.push(l);
  }

  // 2) marca cota / cabeçalho de tabela / dados
  let viuCota = false;
  const marcadas = uteis.map(l=>{
    const cota = cotaDaLinha(l.txt);
    if(cota){ viuCota = true; return { l, tipo:'cota', cota }; }
    if(ehCabecalhoEdital(l.txt)) return { l, tipo:'cabecalho' };
    return { l, tipo:'dado' };
  });

  const dados = marcadas.filter(m=>m.tipo==='dado').map(m=>m.l);

  // 3) coluna da ORDEM: é a mais à esquerda das linhas de dados
  let xMin = Infinity;
  dados.forEach(l=> l.itens.forEach(i=>{ if(i.x<xMin) xMin=i.x; }));
  const limiteColunaOrdem = (isFinite(xMin) ? xMin : 0) + 20;
  function ordemDaLinha(l){
    const p = l.itens[0];
    if(!p || !RE_INTEIRO.test(p.str)) return null;
    if(p.x > limiteColunaOrdem) return null;
    return p.str;
  }

  // 4) entrelinhas típico: mediana dos espaços entre linhas de dados vizinhas
  //    da MESMA página (o salto entre páginas não pode entrar na conta)
  const espacos = [];
  for(let i=1;i<dados.length;i++){
    if(dados[i].pag !== dados[i-1].pag) continue;
    const d = Math.abs(dados[i-1].yGlobal - dados[i].yGlobal);
    if(d>0 && d<60) espacos.push(d);
  }
  espacos.sort((a,b)=>a-b);
  const entrelinhas = espacos.length ? espacos[Math.floor(espacos.length/2)] : 14;
  const limiteBloco = entrelinhas * 1.18;

  // 5) monta os blocos
  const blocos = [];
  let atual = null;
  let cotaAtual = 'ac';
  let anterior = null;

  function fecharBloco(){ if(atual && atual.itens.length) blocos.push(atual); atual = null; anterior = null; }
  function novoBloco(){ fecharBloco(); atual = { cota:cotaAtual, ordem:null, itens:[] }; }

  marcadas.forEach(m=>{
    if(m.tipo==='cota'){ fecharBloco(); cotaAtual = m.cota; return; }
    if(m.tipo==='cabecalho'){ fecharBloco(); return; }

    const l = m.l;
    const ordem = ordemDaLinha(l);
    const longe = anterior && (anterior.pag !== l.pag || Math.abs(anterior.yGlobal - l.yGlobal) > limiteBloco);

    if(!atual) novoBloco();
    else if(ordem !== null && atual.ordem !== null) novoBloco();   // já havia uma ORDEM: é outro candidato
    else if(longe && atual.ordem !== null) novoBloco();            // saltou de linha depois de fechar o registro
    else if(longe && atual.itens.length) novoBloco();              // saltou de linha antes mesmo da ORDEM

    if(ordem !== null && atual.ordem === null){
      atual.ordem = ordem;
      atual.itens = atual.itens.concat(l.itens.slice(1));
    } else {
      atual.itens = atual.itens.concat(l.itens);
    }
    anterior = l;
  });
  fecharBloco();

  // 6) cada bloco vira um registro
  const tabelas = { ac:[], ppp:[], pcd:[], ind:[] };
  const ignoradas = [];
  blocos.forEach(b=>{
    const nome = limpar(b.itens.filter(i=>/[A-Za-zÀ-ÿ]{2,}/.test(i.str)).map(i=>i.str).join(' '));
    const notas = b.itens.filter(i=>RE_DECIMAL.test(i.str));
    if(b.ordem === null || !nome){
      // só reportamos o que tinha cara de dado (nota); texto corrido do edital
      // (parágrafos introdutórios, assinatura) é descartado em silêncio
      if(notas.length) ignoradas.push(limpar(b.itens.map(i=>i.str).join(' ')));
      return;
    }
    let final = '';
    if(notas.length){
      final = notas.reduce((a,b2)=> (b2.x > a.x ? b2 : a)).str;
    }
    tabelas[b.cota].push({ ordem:b.ordem, nome:nome, nota:fmtNota(final) });
  });

  return { tabelas, ignoradas, semCota: !viuCota };
}

// Converte o reconhecido no texto do quadro de conferência.
function editalParaTexto(tabelas){
  const linhas = [];
  COTAS_EDITAL.slice().sort((a,b)=>ordemCota(a.chave)-ordemCota(b.chave)).forEach(c=>{
    const lista = tabelas[c.chave];
    if(!lista || !lista.length) return;
    if(linhas.length) linhas.push('');
    linhas.push(c.rotulo);
    lista.forEach(r=> linhas.push(r.ordem+'\t'+r.nome+'\t'+r.nota));
  });
  return linhas.join('\n');
}
function ordemCota(c){ return ({ac:0, ppp:1, pcd:2, ind:3})[c]; }

/* ============ D) leitor da Lista de dados dos inscritos ============ */

// Telefone no fim de um trecho de texto: "(41) 99999-9999", "41999999999",
// "(44) 99138-668" (a lista traz números truncados com alguma frequência).
const RE_TELEFONE_FIM = /(\(?\d{2}\)?[\s.\-]*\d{3,5}[\s.\-]?\d{3,5})\s*$/;

function extrairTelefone(trecho){
  const m = RE_TELEFONE_FIM.exec(limpar(trecho));
  return m ? limpar(m[1]) : '';
}

// Interpreta UMA linha (lista de tokens) da Lista de dados.
// Devolve null quando a linha não é o início de um registro.
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

// Reconhece a Lista de dados a partir das linhas por coordenada.
// A descrição da necessidade ocupa várias linhas em volta do registro e é
// descartada; só continuações que caem NA FAIXA DA COLUNA DO NOME (à esquerda
// da data de nascimento) são aproveitadas, para o caso de nome muito longo.
function reconhecerLista(linhas){
  const registros = [];
  const ignoradas = [];
  let ultimo = null;   // { reg, xNomeMin, xNomeMax, xData, y }

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
    // continuação
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

/* ============ E) leitura dos quadros de conferência (texto) ============ */

// Aceita tanto o formato normalizado (ORDEM \t NOME \t NOTA) quanto uma linha
// solta com as três notas ("1 FULANO 8,60 10,00 9,30") — nesse caso vale a
// ÚLTIMA nota da linha, que é sempre a NOTA FINAL.
const RE_LINHA_EDITAL_SOLTA = /^(\d{1,3})\s+(.+?)((?:\s+\d{1,3}[.,]\d{1,2}){1,4})\s*$/;

function lerQuadroEdital(texto){
  const tabelas = { ac:[], ppp:[], pcd:[], ind:[] };
  const naoReconhecidas = [];
  let cota = 'ac';
  let viuCota = false;
  String(texto||'').replace(/\r\n?/g,'\n').split('\n').forEach(bruta=>{
    const linha = bruta.trim();
    if(!linha) return;
    const c = cotaDaLinha(linha);
    if(c && !/\d[.,]\d/.test(linha)){ cota = c; viuCota = true; return; }
    if(ehCabecalhoEdital(linha)) return;

    const porTab = linha.split('\t').map(s=>s.trim()).filter(s=>s!=='');
    if(porTab.length>=3 && RE_INTEIRO.test(porTab[0])){
      const notas = porTab.filter(s=>RE_DECIMAL.test(s));
      tabelas[cota].push({
        ordem: porTab[0],
        nome: porTab.slice(1).filter(s=>!RE_DECIMAL.test(s)).join(' '),
        nota: fmtNota(notas.length ? notas[notas.length-1] : '')
      });
      return;
    }
    const m = RE_LINHA_EDITAL_SOLTA.exec(linha);
    if(m){
      const notas = m[3].trim().split(/\s+/);
      tabelas[cota].push({ ordem:m[1], nome:limpar(m[2]), nota:fmtNota(notas[notas.length-1]) });
      return;
    }
    naoReconhecidas.push(linha);
  });
  return { tabelas, naoReconhecidas, semCota:!viuCota };
}

function lerQuadroLista(texto){
  const registros = [];
  const naoReconhecidas = [];
  String(texto||'').replace(/\r\n?/g,'\n').split('\n').forEach(bruta=>{
    const linha = bruta.trim();
    if(!linha) return;
    if(/^N[ºo°]?\s+Modalidade/i.test(linha)) return;    // cabeçalho da lista
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

/* ============ F) ordem de chamamento (Decisão 11697384) ============ */

/* Vagas 1 a 100. G = Geral, N = Negros, P = PcD, I = Indígenas, V = VS.
   A cota VS só se aplica a editais de Ensino Médio; na Residência
   (pós-graduação) a vaga reverte para concorrência Geral. */
const ORDEM_VAGAS = (
  'GGNGPNVGGI' + 'PVNGGGNGGN' + 'PVGNGGNGGN' + 'PVGNGGNGGN' + 'PVGNIGNGGN' +
  'PVGNGGNGGN' + 'PVGNGGNGGN' + 'PVNGGNGGGI' + 'PVNGGGNGGG' + 'PVGNGGGGGN'
).split('');

const LISTA_DA_VAGA = { G:'ac', N:'ppp', P:'pcd', I:'ind', V:'ac' };
const ROTULO_VAGA   = { G:'Geral', N:'Negros', P:'PcD', I:'Indígenas', V:'VS → Geral' };

function tipoDaVaga(n){ return ORDEM_VAGAS[(n-1) % ORDEM_VAGAS.length]; }

/* Monta a lista única de chamamento a partir das tabelas do edital.
   Percorre as vagas na ordem: cada vaga puxa o próximo candidato ainda não
   alocado da lista correspondente; se aquela lista estiver esgotada, a vaga
   reverte para Geral (ampla concorrência), seguindo a ordem de mérito.
   Como o candidato cotista que já entrou pela ampla é simplesmente pulado na
   lista da cota, a posição que prevalece é sempre a mais vantajosa. */
function montarChamamento(tabelas){
  const alocados = new Set();
  const cursor = { merito:0, ppp:0, pcd:0, ind:0 };
  const avisos = [];

  // 1) candidatos distintos em todas as tabelas
  const todos = new Map();          // chave -> {nome, nota, cotas:Set, ordemAC, ordemCota}
  ['ac','ppp','pcd','ind'].forEach(k=>{
    (tabelas[k]||[]).forEach(r=>{
      const ch = chaveNome(r.nome);
      if(!ch) return;
      if(!todos.has(ch)) todos.set(ch, { nome:r.nome, nota:r.nota, cotas:new Set(), ordemAC:'', ordemCota:'' });
      const t = todos.get(ch);
      t.cotas.add(k);
      if(k==='ac') t.ordemAC = r.ordem;
      else if(!t.ordemCota) t.ordemCota = r.ordem;
      if(!t.nota) t.nota = r.nota;
      // a mesma pessoa com notas diferentes em duas tabelas é erro de origem:
      // mantemos a primeira e avisamos, nunca escolhemos por conta própria
      else if(r.nota && numNota(r.nota)!==numNota(t.nota)){
        avisos.push('“'+r.nome+'” aparece com notas diferentes nas tabelas do edital ('
          +t.nota+' e '+r.nota+'). Foi mantida a primeira; confira o edital.');
      }
    });
  });

  /* 2) LISTA DE MÉRITO — é ela que atende as vagas Gerais.
     A base é a tabela de Ampla Concorrência na ordem impressa, porque essa
     ordem já embute o desempate feito pela banca (vários candidatos podem ter
     a mesma nota final). Quem só aparece em tabela de cota é encaixado por
     nota: acima de quem tem nota MENOR e abaixo de quem tem nota IGUAL — o
     edital não ranqueou os dois entre si, então não inventamos desempate.
     É isso que faz o cotista com nota mais alta que a da ampla assumir a
     posição Geral que lhe cabe, em vez de esperar a vaga da cota. */
  const merito = [];
  const encaixados = [];
  const empates = [];
  (tabelas.ac||[]).forEach(r=>{
    const ch = chaveNome(r.nome);
    if(ch && merito.indexOf(ch)<0) merito.push(ch);
  });
  const forasteiros = Array.from(todos.keys()).filter(ch=> merito.indexOf(ch)<0);
  forasteiros.sort((a,b)=> (numNota(todos.get(b).nota)||0) - (numNota(todos.get(a).nota)||0));
  forasteiros.forEach(ch=>{
    const n = numNota(todos.get(ch).nota);
    let pos = merito.length;
    for(let i=0;i<merito.length;i++){
      const outra = numNota(todos.get(merito[i]).nota);
      if(n!=null && outra!=null && outra < n){ pos = i; break; }
    }
    merito.splice(pos, 0, ch);
    const acima = pos>0 ? merito[pos-1] : null;
    const info = todos.get(ch);
    encaixados.push({ nome:info.nome, nota:info.nota, posicao:pos+1,
      acima: acima ? todos.get(acima).nome : '(topo da lista)' });
    if(acima && numNota(todos.get(acima).nota) === n){
      empates.push({ nome:info.nome, nota:info.nota, com:todos.get(acima).nome });
    }
  });

  // 3) percorre as vagas
  function proximoMerito(){
    while(cursor.merito < merito.length){
      const ch = merito[cursor.merito];
      if(!alocados.has(ch)) return ch;
      cursor.merito++;
    }
    return null;
  }
  function proximoCota(listaId){
    const lista = tabelas[listaId] || [];
    while(cursor[listaId] < lista.length){
      const ch = chaveNome(lista[cursor[listaId]].nome);
      if(ch && !alocados.has(ch)) return ch;
      cursor[listaId]++;
    }
    return null;
  }

  const saida = [];
  const total = todos.size;
  let vaga = 1;
  const limite = total*4 + 200;      // trava de segurança contra laço infinito
  while(saida.length < total && vaga <= limite){
    const tipo = tipoDaVaga(vaga);
    const listaId = LISTA_DA_VAGA[tipo];
    let ch = (listaId==='ac') ? proximoMerito() : proximoCota(listaId);
    let origem = listaId;
    let revertida = false;
    if(!ch && listaId!=='ac'){ ch = proximoMerito(); origem='ac'; revertida = !!ch; }
    if(!ch){ vaga++; continue; }

    alocados.add(ch);
    const info = todos.get(ch);
    saida.push({
      vaga: vaga,
      tipoVaga: ROTULO_VAGA[tipo] + (revertida ? ' (sem cotista — revertida)' : ''),
      listaOrigem: origem,
      ordemEdital: (origem==='ac') ? (info.ordemAC || info.ordemCota) : info.ordemCota,
      nome: info.nome,
      nota: info.nota || '',
      cotasEdital: Array.from(info.cotas),
      ordemAC: info.ordemAC,
      soCota: !info.cotas.has('ac')
    });
    vaga++;
  }
  if(saida.length < total){
    avisos.push('Não foi possível posicionar '+(total-saida.length)+' candidato(s) na ordem de chamamento.');
  }
  // renumera a Classificação de forma consecutiva (o Hércules espera 1..N);
  // o número original da vaga fica registrado para conferência
  saida.forEach((r,i)=> r.classificacao = i+1);
  return { linhas:saida, avisos, total, encaixados, empates };
}

/* ============ G) cruzamento, conferência e CSV ============ */

const COLS_CSV = ['Classificação','CPF','Nome do candidato','Nota final','E-mail',
                  'Telefone celular','Telefone fixo','PNE','VS','AFRO','INDÍGENA'];
const COLS_CONF = ['Classificação','Vaga (tipo)','Ordem no edital','CPF','Nome do candidato',
                   'Nota final','E-mail','Telefone celular','Telefone fixo','PNE','VS','AFRO','INDÍGENA'];

// Modalidade da inscrição (Lista de dados) -> colunas S/N do Hércules.
// Valor não reconhecido NUNCA vira "N" em silêncio: é reportado ao usuário.
const MAPA_MODALIDADE = [
  { col:'AFRO',     re:/(PRETO|PARDO|NEGR|AFRO|ETNICO)/ },
  { col:'PNE',      re:/(DEFICI|PCD|PNE|PORTADOR DE NECESSIDADE)/ },
  { col:'INDÍGENA', re:/(INDIGEN)/ },
  { col:'VS',       re:/(VULNERAB|HIPOSSUF|BAIXA RENDA|CADUNICO|CAD UNICO|SOCIOECONOMIC|ESCOLA PUBLICA)/ }
];

function modalidadeParaCotas(texto){
  const flags = { PNE:'N', VS:'N', AFRO:'N', 'INDÍGENA':'N' };
  const bruto = limpar(texto);
  if(bruto==='' || bruto==='-') return { flags, desconhecida:null };
  const chave = semAcento(bruto).toUpperCase();
  if(/AMPLA|GERAL/.test(chave)) return { flags, desconhecida:null };
  let achou = false;
  MAPA_MODALIDADE.forEach(m=>{ if(m.re.test(chave)){ flags[m.col]='S'; achou=true; } });
  return { flags, desconhecida: achou ? null : bruto };
}

// Correspondência aproximada: mesmo primeiro e último nome e um dos nomes é
// subconjunto (na ordem) do outro. Só vale quando encontra UMA única opção.
function acharAproximado(chave, indice){
  const alvo = chave.split(' ');
  if(alvo.length<2) return null;
  const achados = [];
  indice.forEach((reg, k)=>{
    const outro = k.split(' ');
    if(outro.length<2) return;
    if(outro[0]!==alvo[0] || outro[outro.length-1]!==alvo[alvo.length-1]) return;
    const [menor, maior] = alvo.length<=outro.length ? [alvo,outro] : [outro,alvo];
    let j=0;
    for(let i=0;i<maior.length && j<menor.length;i++){ if(maior[i]===menor[j]) j++; }
    if(j===menor.length) achados.push({ k, reg });
  });
  return achados.length===1 ? achados[0] : null;
}

function cruzar(chamada, registrosLista){
  const indice = new Map();
  const duplicados = [];
  registrosLista.forEach(r=>{
    const ch = chaveNome(r.nome);
    if(!ch) return;
    if(indice.has(ch)) duplicados.push(r.nome);
    else indice.set(ch, r);
  });

  const semCorrespondencia = [];
  const aproximados = [];
  const divergenciasCota = [];
  const modalidadesDesconhecidas = [];
  const cpfsSuspeitos = [];
  const semCelular = [];
  const avisosVS = [];

  const linhas = chamada.linhas.map(c=>{
    const ch = chaveNome(c.nome);
    let reg = indice.get(ch) || null;
    if(!reg){
      const ap = acharAproximado(ch, indice);
      if(ap){ reg = ap.reg; aproximados.push({ edital:c.nome, lista:ap.reg.nome }); }
      else semCorrespondencia.push(c.nome);
    }

    const conv = reg ? modalidadeParaCotas(reg.modalidade) : { flags:{PNE:'N',VS:'N',AFRO:'N','INDÍGENA':'N'}, desconhecida:null };
    const flags = conv.flags;
    if(reg && conv.desconhecida) modalidadesDesconhecidas.push({ nome:c.nome, valor:conv.desconhecida });
    // A cota VS só existe em edital de Ensino Médio; na Residência
    // (pós-graduação) ela reverte para concorrência Geral. Gravamos "N" no
    // arquivo, mas avisamos quem veio marcado assim na Lista de dados.
    if(flags.VS==='S'){ avisosVS.push(c.nome); flags.VS = 'N'; }

    // conferência entre a modalidade da inscrição e as tabelas do edital
    if(reg){
      const doEdital = { AFRO: c.cotasEdital.indexOf('ppp')>=0, PNE: c.cotasEdital.indexOf('pcd')>=0, 'INDÍGENA': c.cotasEdital.indexOf('ind')>=0 };
      ['AFRO','PNE','INDÍGENA'].forEach(k=>{
        const naLista = flags[k]==='S';
        if(naLista !== doEdital[k]){
          divergenciasCota.push({
            nome: c.nome, campo: k,
            lista: reg.modalidade || '(vazio)',
            edital: doEdital[k] ? 'consta na tabela da cota' : 'não consta na tabela da cota'
          });
        }
      });
    }

    const cpfInfo = reg ? normalizarCPF(reg.cpf) : { cpf:'', erro:null };
    if(reg && cpfInfo.erro) cpfsSuspeitos.push({ nome:c.nome, motivo:cpfInfo.erro });
    const celular = reg ? limpar(reg.celular) : '';
    if(reg && !celular) semCelular.push(c.nome);

    return {
      'Classificação': String(c.classificacao),
      'Vaga (tipo)': c.vaga + ' — ' + c.tipoVaga,
      'Ordem no edital': (c.ordemEdital||'') + ' (' + rotuloCurtoLista(c.listaOrigem) + ')'
        + (c.listaOrigem!=='ac' && c.ordemAC ? ' · ' + c.ordemAC + ' (Ampla)' : ''),
      'CPF': cpfInfo.cpf,
      'Nome do candidato': (reg ? reg.nome : c.nome).toUpperCase(),
      'Nota final': fmtNota(c.nota),
      'E-mail': reg ? limpar(reg.email) : '',
      'Telefone celular': celular,
      // o formato do Hércules replica o celular no campo de telefone fixo
      'Telefone fixo': celular,
      'PNE': flags.PNE, 'VS': flags.VS, 'AFRO': flags.AFRO, 'INDÍGENA': flags['INDÍGENA'],
      _semCadastro: !reg
    };
  });

  return { linhas, semCorrespondencia, aproximados, divergenciasCota,
           modalidadesDesconhecidas, cpfsSuspeitos, semCelular, avisosVS,
           duplicados, avisosChamada: chamada.avisos,
           encaixados: chamada.encaixados || [], empates: chamada.empates || [] };
}

function rotuloCurtoLista(id){ return ({ac:'Ampla', ppp:'Preta/Parda', pcd:'PcD', ind:'Indígena'})[id] || id; }

function gerarCSV(linhas){
  const out = [ COLS_CSV.map(csvEscape).join(';') ];
  linhas.forEach(r=> out.push(COLS_CSV.map(c=>csvEscape(r[c])).join(';')));
  return '\uFEFF' + out.join('\r\n');
}

/* ---- edi\u00E7\u00E3o manual da tabela de confer\u00EAncia (arrastar, excluir, incluir) ----

   A ordem de chamamento calculada \u00E9 um ponto de partida, n\u00E3o um veredito: a
   banca pode ter desempatado de outro jeito, um candidato pode ter desistido,
   um nome pode ter ficado de fora do PDF. Por isso a tabela final \u00E9
   remanej\u00E1vel, e \u00E9 ela \u2014 e n\u00E3o o c\u00E1lculo \u2014 que o CSV reproduz. */

// A Classifica\u00E7\u00E3o \u00E9 a coluna que o H\u00E9rcules importa, ent\u00E3o ela acompanha
// sempre a posi\u00E7\u00E3o da linha: renumeramos 1..N a cada grava\u00E7\u00E3o da edi\u00E7\u00E3o.
function renumerarClassificacao(linhas){
  linhas.forEach((r,i)=> r['Classifica\u00E7\u00E3o'] = String(i+1));
  return linhas;
}

// Linha em branco acrescentada \u00E0 m\u00E3o. As colunas de confer\u00EAncia ficam com "\u2014":
// n\u00E3o vieram de vaga nenhuma do c\u00E1lculo, e fingir o contr\u00E1rio esconderia do
// usu\u00E1rio que aquela linha \u00E9 responsabilidade dele.
function linhaManualVazia(){
  const r = {};
  COLS_CONF.forEach(c=> r[c] = '');
  ['PNE','VS','AFRO','IND\u00CDGENA'].forEach(c=> r[c] = 'N');
  r['Vaga (tipo)'] = '\u2014 (linha acrescentada \u00E0 m\u00E3o)';
  r['Ordem no edital'] = '\u2014';
  r._semCadastro = false;
  r._semCadastroBase = false;
  return r;
}

// Aplica na linha editada as mesmas normaliza\u00E7\u00F5es do cruzamento autom\u00E1tico,
// para que uma linha digitada \u00E0 m\u00E3o chegue ao CSV no mesmo formato das outras.
function normalizarLinhaEditada(r){
  const cpf = limpar(r['CPF']);
  r['CPF'] = cpf ? normalizarCPF(cpf).cpf : '';
  r['Nome do candidato'] = limpar(r['Nome do candidato']).toUpperCase();
  r['Nota final'] = fmtNota(r['Nota final']);
  r['E-mail'] = limpar(r['E-mail']);
  r['Telefone celular'] = limpar(r['Telefone celular']);
  r['Telefone fixo'] = limpar(r['Telefone fixo']);
  ['PNE','VS','AFRO','IND\u00CDGENA'].forEach(c=>{
    r[c] = (String(r[c]||'').trim().toUpperCase()==='S') ? 'S' : 'N';
  });
  COLS_CONF.forEach(c=>{ if(r[c]==null) r[c]=''; });
  return r;
}

// Assinatura do conte\u00FAdo que vai para o CSV \u2014 serve s\u00F3 para saber se a passagem
// pelo modo de edi\u00E7\u00E3o mudou alguma coisa de fato.
function assinaturaCSV(linhas){
  return linhas.map(r=> COLS_CSV.map(c=>String(r[c]==null?'':r[c])).join('\u0001')).join('\u0002');
}

/* ============ H) ligação com a página ============ */

if(typeof document !== 'undefined' && document.getElementById('btnProcessar')){

  const edArquivo=$('edArquivo'), edBtnArquivo=$('edBtnArquivo'), edNomeArquivo=$('edNomeArquivo'),
        edStatus=$('edStatus'), edTexto=$('edTexto'), edBtnLimpar=$('edBtnLimpar');
  const liArquivo=$('liArquivo'), liBtnArquivo=$('liBtnArquivo'), liNomeArquivo=$('liNomeArquivo'),
        liStatus=$('liStatus'), liTexto=$('liTexto'), liBtnLimpar=$('liBtnLimpar');
  const btnProcessar=$('btnProcessar'), areaResultado=$('areaResultado'),
        linhaDownload=$('linhaDownload'), btnBaixar=$('btnBaixar'), notaContagem=$('notaContagem'),
        btnEditarOrdem=$('btnEditarOrdem'),
        stampWrap=$('stampWrap'), stampBadge=$('stampBadge'), stampText=$('stampText');

  // linhasSaida é a única fonte do CSV. Enquanto o usuário edita, mexemos numa
  // cópia (trabalho) — cancelar tem de devolver a tabela intacta, e o download
  // nunca pode sair de um estado que ainda está sendo mexido.
  let linhasSaida = [];
  let editando = false;
  let trabalho = [];
  let ordemEditada = false;      // já houve edição salva? (muda o aviso na tela)
  let assinaturaAoEntrar = '';
  let seqId = 0;

  function status(el, html, tipo){
    el.className = 'notice-banner' + (tipo ? ' '+tipo : '');
    el.innerHTML = html;
    el.style.display = 'block';
  }

  function conferir(){
    btnProcessar.disabled = !(edTexto.value.trim() && liTexto.value.trim());
  }

  function limparResultado(){
    linhasSaida = [];
    trabalho = [];
    editando = false;
    ordemEditada = false;
    stampWrap.classList.remove('show');
    areaResultado.innerHTML = '<p class="empty-hint">A tabela final aparecerá aqui após o processamento.</p>';
    linhaDownload.style.display = 'none';
  }

  edBtnArquivo.addEventListener('click', ()=> edArquivo.click());
  liBtnArquivo.addEventListener('click', ()=> liArquivo.click());
  edTexto.addEventListener('input', ()=>{ conferir(); });
  liTexto.addEventListener('input', ()=>{ conferir(); });
  edBtnLimpar.addEventListener('click', ()=>{ edTexto.value=''; edStatus.style.display='none'; edArquivo.value=''; edNomeArquivo.textContent='nenhum arquivo escolhido'; limparResultado(); conferir(); });
  liBtnLimpar.addEventListener('click', ()=>{ liTexto.value=''; liStatus.style.display='none'; liArquivo.value=''; liNomeArquivo.textContent='nenhum arquivo escolhido'; limparResultado(); conferir(); });

  edArquivo.addEventListener('change', async ()=>{
    const f = edArquivo.files && edArquivo.files[0];
    edNomeArquivo.textContent = f ? f.name : 'nenhum arquivo escolhido';
    if(!f) return;
    limparResultado();
    status(edStatus, 'Lendo o PDF do edital…', '');
    try{
      const paginas = await pdfParaPaginas(f);
      const totalItens = paginas.reduce((s,p)=>s+p.itens.length,0);
      if(totalItens < 10){
        status(edStatus, '<strong>Este PDF não tem texto para extrair.</strong> O edital provavelmente foi salvo como imagem (print colado). '
          +'A leitura automática não funciona neste caso — <strong>digite ou cole</strong> a tabela no quadro abaixo, uma linha por candidato.', 'warn');
        return;
      }
      const r = reconhecerEdital(linhasDasPaginas(paginas, 3));
      const qt = ['ac','ppp','pcd','ind'].map(k=>r.tabelas[k].length);
      const totalReg = qt.reduce((a,b)=>a+b,0);
      if(totalReg===0){
        status(edStatus, '<strong>Não foi possível localizar a tabela de classificação neste PDF.</strong> Confira se é o Edital de Classificação Final, ou preencha o quadro abaixo manualmente.', 'warn');
        return;
      }
      edTexto.value = editalParaTexto(r.tabelas);
      let msg = '<strong>'+totalReg+' registro(s)</strong> reconhecido(s): '
        + 'Ampla '+qt[0]+' · Preta/Parda '+qt[1]+' · PcD '+qt[2]+' · Indígena '+qt[3]+'.';
      if(r.semCota) msg += '<br>O edital não traz título de cota — tudo foi lançado como <strong>Ampla Concorrência</strong>.';
      if(r.ignoradas.length) msg += '<br><strong>'+r.ignoradas.length+' trecho(s) não aproveitado(s)</strong>: '+esc(r.ignoradas.slice(0,5).join(' | '))+(r.ignoradas.length>5?' …':'');
      status(edStatus, msg + '<br>Confira o quadro abaixo antes de processar.', r.ignoradas.length ? 'warn' : 'ok');
      conferir();
    }catch(e){
      status(edStatus, 'Não foi possível ler o PDF ('+esc(e.message||e)+'). Digite ou cole a tabela no quadro abaixo.', 'warn');
    }
  });

  liArquivo.addEventListener('change', async ()=>{
    const f = liArquivo.files && liArquivo.files[0];
    liNomeArquivo.textContent = f ? f.name : 'nenhum arquivo escolhido';
    if(!f) return;
    limparResultado();
    status(liStatus, 'Lendo o PDF da lista de dados…', '');
    try{
      const paginas = await pdfParaPaginas(f);
      const totalItens = paginas.reduce((s,p)=>s+p.itens.length,0);
      if(totalItens < 10){
        status(liStatus, '<strong>Este PDF não tem texto para extrair.</strong> Cole a lista no quadro abaixo.', 'warn');
        return;
      }
      const r = reconhecerLista(linhasDasPaginas(paginas, 3));
      if(!r.registros.length){
        status(liStatus, '<strong>Nenhum inscrito reconhecido neste PDF.</strong> Confira se é a Lista de dados, ou cole o conteúdo no quadro abaixo.', 'warn');
        return;
      }
      liTexto.value = listaParaTexto(r.registros);
      const semEmail = r.registros.filter(x=>!x.email).length;
      const semTel   = r.registros.filter(x=>!x.celular).length;
      let msg = '<strong>'+r.registros.length+' inscrito(s)</strong> reconhecido(s).';
      if(semEmail) msg += '<br>'+semEmail+' sem e-mail reconhecido.';
      if(semTel)   msg += '<br>'+semTel+' sem celular reconhecido.';
      status(liStatus, msg + '<br>Confira o quadro abaixo antes de processar.', (semEmail||semTel) ? 'warn' : 'ok');
      conferir();
    }catch(e){
      status(liStatus, 'Não foi possível ler o PDF ('+esc(e.message||e)+'). Cole a lista no quadro abaixo.', 'warn');
    }
  });

  btnProcessar.addEventListener('click', ()=>{
    const ed = lerQuadroEdital(edTexto.value);
    const li = lerQuadroLista(liTexto.value);
    const totalEd = ['ac','ppp','pcd','ind'].reduce((s,k)=>s+ed.tabelas[k].length,0);
    if(totalEd===0){ alert('Nenhum candidato reconhecido no quadro do Passo 1. Cada linha deve trazer ORDEM, NOME e NOTA.'); return; }
    if(li.registros.length===0){ alert('Nenhum inscrito reconhecido no quadro do Passo 2.'); return; }

    const chamada = montarChamamento(ed.tabelas);
    const res = cruzar(chamada, li.registros);
    // reprocessar recomeça do zero: a edição anterior era sobre outros dados
    editando = false;
    trabalho = [];
    ordemEditada = false;
    linhasSaida = res.linhas.map(r=>{
      r._id = ++seqId;
      r._semCadastroBase = !!r._semCadastro;
      return r;
    });
    renderizar(res, ed, li);
  });

  function lista(itens, render, limite){
    limite = limite || 10;
    return '<ul class="warn-list">'
      + itens.slice(0,limite).map(render).join('')
      + (itens.length>limite ? '<li>… e mais '+(itens.length-limite)+'</li>' : '')
      + '</ul>';
  }

  function renderizar(res, ed, li){
    const problemas = res.semCorrespondencia.length + res.aproximados.length + res.divergenciasCota.length
      + res.modalidadesDesconhecidas.length + res.cpfsSuspeitos.length + res.semCelular.length
      + res.avisosVS.length + res.avisosChamada.length + ed.naoReconhecidas.length + li.naoReconhecidas.length
      + res.encaixados.length + res.empates.length;

    stampWrap.classList.add('show');

    if(problemas===0){
      stampBadge.classList.remove('warn');
      stampBadge.textContent = 'CONFERIDO';
      stampText.innerHTML = '<strong>'+res.linhas.length+' candidato(s)</strong> na classificação final, sem repetição de nome. '
        +'Todos foram encontrados na Lista de dados e as cotas conferem com as tabelas do edital.';
    } else {
      stampBadge.classList.add('warn');
      stampBadge.textContent = 'REVISAR';
      let h = '<strong>'+res.linhas.length+' candidato(s)</strong> na classificação final — confira os pontos abaixo antes de importar.';

      if(res.semCorrespondencia.length){
        h += '<br><br><strong style="color:var(--stamp-red)">'+res.semCorrespondencia.length
          +' classificado(s) sem correspondência na Lista de dados</strong> (linhas destacadas; CPF, e-mail e telefone em branco):';
        h += lista(res.semCorrespondencia, n=>'<li>'+esc(n)+'</li>');
      }
      if(res.aproximados.length){
        h += '<br><strong style="color:var(--stamp-red)">'+res.aproximados.length
          +' correspondência(s) aproximada(s)</strong> — o nome do edital não bate exatamente com o da lista; confira se é a mesma pessoa:';
        h += lista(res.aproximados, x=>'<li>edital: '+esc(x.edital)+' &rarr; lista: '+esc(x.lista)+'</li>');
      }
      if(res.divergenciasCota.length){
        h += '<br><strong style="color:var(--stamp-red)">'+res.divergenciasCota.length
          +' divergência(s) entre a modalidade da inscrição e as tabelas do edital</strong> — foi gravada a <strong>modalidade da Lista de dados</strong>. '
          +'Atenção: a ordem de chamamento usa as tabelas do edital, então um candidato marcado na lista mas ausente da tabela da cota não disputa vaga reservada:';
        h += lista(res.divergenciasCota, x=>'<li>'+esc(x.nome)+' — '+esc(x.campo)+': lista diz "'+esc(x.lista)+'", edital '+esc(x.edital)+'</li>');
      }
      if(res.encaixados.length){
        h += '<br><strong style="color:var(--stamp-red)">'+res.encaixados.length
          +' candidato(s) que só constam em tabela de cota</strong> — não estão na tabela de Ampla Concorrência do edital. '
          +'Foram encaixados na ordem de mérito pela nota, para que possam ocupar vaga Geral se a nota permitir. Confira o posicionamento:';
        h += lista(res.encaixados, x=>'<li>'+esc(x.nome)+' (nota '+esc(x.nota)+') — colocado(a) logo abaixo de '+esc(x.acima)+'</li>');
      }
      if(res.empates.length){
        h += '<br><strong style="color:var(--stamp-red)">'+res.empates.length
          +' empate(s) de nota no encaixe</strong> — o edital não ranqueou essas pessoas entre si. '
          +'A ferramenta manteve quem já estava na Ampla à frente e <strong>não decidiu o desempate</strong>; se a banca definiu outra ordem, ajuste à mão:';
        h += lista(res.empates, x=>'<li>'+esc(x.nome)+' empata em '+esc(x.nota)+' com '+esc(x.com)+'</li>');
      }
      if(res.modalidadesDesconhecidas.length){
        h += '<br><strong style="color:var(--stamp-red)">'+res.modalidadesDesconhecidas.length
          +' modalidade(s) não reconhecida(s)</strong> — lançadas como "N" em todas as colunas. Preencha à mão e avise para incluir o termo na ferramenta:';
        h += lista(res.modalidadesDesconhecidas, x=>'<li>'+esc(x.nome)+' — "'+esc(x.valor)+'"</li>');
      }
      if(res.avisosVS.length){
        h += '<br><strong style="color:var(--stamp-red)">'+res.avisosVS.length
          +' candidato(s) com Vulnerabilidade Social</strong> — essa cota vale só para editais de Ensino Médio; na Residência as vagas VS revertem para Geral. Confira a coluna VS:';
        h += lista(res.avisosVS, n=>'<li>'+esc(n)+'</li>');
      }
      if(res.cpfsSuspeitos.length){
        h += '<br><strong style="color:var(--stamp-red)">'+res.cpfsSuspeitos.length+' CPF(s) fora do padrão de 11 dígitos</strong>:';
        h += lista(res.cpfsSuspeitos, x=>'<li>'+esc(x.nome)+' — '+esc(x.motivo)+'</li>');
      }
      if(res.semCelular.length){
        h += '<br><strong style="color:var(--stamp-red)">'+res.semCelular.length+' sem telefone reconhecido</strong> na Lista de dados:';
        h += lista(res.semCelular, n=>'<li>'+esc(n)+'</li>');
      }
      if(res.duplicados.length){
        h += '<br>Atenção: '+res.duplicados.length+' nome(s) repetido(s) na Lista de dados — usada a primeira ocorrência.';
      }
      if(ed.naoReconhecidas.length){
        h += '<br><strong style="color:var(--stamp-red)">'+ed.naoReconhecidas.length
          +' linha(s) do quadro do Passo 1 não reconhecida(s)</strong> e ignorada(s):';
        h += lista(ed.naoReconhecidas, n=>'<li>'+esc(n)+'</li>', 8);
      }
      if(li.naoReconhecidas.length){
        h += '<br><strong style="color:var(--stamp-red)">'+li.naoReconhecidas.length
          +' linha(s) do quadro do Passo 2 não reconhecida(s)</strong> e ignorada(s):';
        h += lista(li.naoReconhecidas, n=>'<li>'+esc(n)+'</li>', 8);
      }
      res.avisosChamada.forEach(a=>{ h += '<br><strong style="color:var(--stamp-red)">'+esc(a)+'</strong>'; });

      stampText.innerHTML = h;
    }

    renderTabela();
  }

  /* ---------- desenho da tabela de conferência (leitura e edição) ---------- */

  const confOnly = { 'Vaga (tipo)':1, 'Ordem no edital':1 };
  const CAMPO_SN = { 'PNE':1, 'VS':1, 'AFRO':1, 'INDÍGENA':1 };
  const LARGURA_EDICAO = {
    'CPF':'104px', 'Nome do candidato':'230px', 'Nota final':'58px',
    'E-mail':'200px', 'Telefone celular':'118px', 'Telefone fixo':'118px'
  };

  function tabelaConferencia(linhas){
    let h = '<div class="table-scroll"><table><thead><tr>'
      + COLS_CONF.map(c=>'<th'+(confOnly[c]?' style="background:#e7edef;"':'')+'>'+esc(c)+'</th>').join('')
      + '</tr></thead><tbody>';
    linhas.forEach(r=>{
      h += '<tr'+(r._semCadastro?' class="unmatched"':'')+'>'
        + COLS_CONF.map(c=>'<td'+(confOnly[c]?' style="background:#f2f6f7;"':'')+'>'+esc(r[c]||'')+'</td>').join('')
        + '</tr>';
    });
    return h + '</tbody></table></div>';
  }

  function inputEdicao(coluna, valor){
    return '<input class="rhIn" data-c="'+escAttr(coluna)+'" value="'+escAttr(valor)+'"'
      + ' style="width:100%;min-width:'+(LARGURA_EDICAO[coluna]||'110px')+';padding:5px;border:1px solid var(--line);'
      + 'font-family:\'IBM Plex Mono\',\'Consolas\',monospace;font-size:11.5px;">';
  }

  function selectSN(coluna, valor){
    const v = (String(valor==null?'':valor).trim().toUpperCase()==='S') ? 'S' : 'N';
    return '<select class="rhSel" data-c="'+escAttr(coluna)+'" style="padding:5px;border:1px solid var(--line);font-size:11.5px;">'
      + '<option value="N"'+(v==='N'?' selected':'')+'>N</option>'
      + '<option value="S"'+(v==='S'?' selected':'')+'>S</option>'
      + '</select>';
  }

  function tabelaEdicao(linhas){
    if(!linhas.length){
      return '<p class="empty-hint">Nenhuma linha na tabela — use “Acrescentar linha” para incluir uma, ou cancele para recuperar a lista calculada.</p>';
    }
    let h = '<div class="table-scroll"><table class="rh-edit-table" style="white-space:normal;">'
      + '<thead><tr><th style="width:30px;"></th>'
      + COLS_CONF.map(c=>'<th'+(confOnly[c]?' style="background:#e7edef;"':'')+'>'+esc(c)+'</th>').join('')
      + '<th style="width:52px;">Ações</th></tr></thead><tbody>';
    linhas.forEach((r,i)=>{
      h += '<tr data-id="'+r._id+'" draggable="false"'+(r._semCadastro?' class="unmatched"':'')+'>';
      h += '<td style="text-align:center;"><button type="button" class="drag-handle" data-id="'+r._id+'" tabindex="0"'
        + ' title="Arrastar para mudar a ordem (ou Alt+↑ / Alt+↓)"'
        + ' aria-label="Remanejar '+escAttr(r['Nome do candidato']||'linha em branco')+'">⠿</button></td>';
      COLS_CONF.forEach(c=>{
        // a Classificação não é digitável: ela É a posição da linha na tabela
        if(c==='Classificação')  h += '<td style="text-align:center;color:var(--ink-soft);">'+(i+1)+'</td>';
        else if(confOnly[c])     h += '<td style="background:#f2f6f7;">'+esc(r[c]||'')+'</td>';
        else if(CAMPO_SN[c])     h += '<td style="text-align:center;">'+selectSN(c, r[c])+'</td>';
        else                     h += '<td>'+inputEdicao(c, r[c])+'</td>';
      });
      h += '<td style="text-align:center;"><button type="button" class="row-del-btn" data-id="'+r._id+'"'
        + ' tabindex="-1" title="Excluir esta linha">✕</button></td>';
      h += '</tr>';
    });
    return h + '</tbody></table></div>';
  }

  function renderTabela(){
    const linhas = editando ? trabalho : linhasSaida;
    let h = '';

    if(editando){
      h += '<div class="notice-banner" style="margin-left:0;"><strong>Modo de edição.</strong> '
        + 'Arraste a linha pela alça <strong>⠿</strong> — ou, com a alça em foco, use <strong>Alt+↑</strong> e <strong>Alt+↓</strong> — para mudar a ordem. '
        + 'Os campos brancos podem ser corrigidos, <strong>✕</strong> exclui a linha e “Acrescentar linha” inclui uma em branco no fim. '
        + 'A <strong>Classificação</strong> se renumera sozinha, conforme a posição. '
        + 'Nada disso chega ao CSV enquanto você não clicar em <strong>Salvar alterações</strong>.</div>';
      h += '<div class="download-row" style="margin-top:14px;">'
        + '<button type="button" class="link-btn" id="rhSalvar" style="background:var(--teal);color:var(--white);">Salvar alterações</button>'
        + '<button type="button" class="link-btn" id="rhCancelar">Cancelar</button>'
        + '<button type="button" class="link-btn" id="rhAcrescentar">Acrescentar linha</button>'
        + '<span class="count-note">'+linhas.length+' linha(s) na tabela</span>'
        + '</div>';
    } else if(ordemEditada){
      h += '<div class="notice-banner warn" style="margin-left:0;"><strong>Esta tabela foi editada à mão.</strong> '
        + 'A coluna <strong>Classificação</strong> foi renumerada de 1 a '+linhas.length+' e é ela que vai para o CSV. '
        + 'As colunas de conferência <strong>Vaga (tipo)</strong> e <strong>Ordem no edital</strong> continuam mostrando o resultado do '
        + 'cálculo automático e podem já não corresponder à posição da linha. Os avisos acima também são do cálculo, e não da tabela editada.</div>';
    }

    h += '<p class="step-desc" style="margin-left:0;">As duas colunas em cinza são apenas para conferência — <strong>não vão para o CSV</strong>. A coluna <strong>Classificação</strong> é a que será importada.</p>';
    h += editando ? tabelaEdicao(linhas) : tabelaConferencia(linhas);
    areaResultado.innerHTML = h;
    if(editando) ligarEventosEdicao();

    linhaDownload.style.display = 'flex';
    btnBaixar.disabled = editando || !linhasSaida.length;
    btnEditarOrdem.style.display = editando ? 'none' : '';
    notaContagem.textContent = editando
      ? 'Salve as alterações para liberar o download.'
      : (linhasSaida.length
          ? linhasSaida.length + ' linha(s) — CSV separado por ";" (abre em colunas automaticamente no Excel PT-BR).'
          : 'Nenhuma linha na tabela — não há o que baixar.');
  }

  /* ---------- edição: entrar, gravar, desistir ---------- */

  function entrarEdicao(){
    trabalho = linhasSaida.map(r=>{
      const c = Object.assign({}, r);
      if(c._id == null) c._id = ++seqId;
      if(c._semCadastroBase === undefined) c._semCadastroBase = !!c._semCadastro;
      return c;
    });
    assinaturaAoEntrar = assinaturaCSV(linhasSaida);
    editando = true;
    renderTabela();
  }

  function cancelarEdicao(){
    editando = false;
    trabalho = [];
    renderTabela();
  }

  function salvarEdicao(){
    linhasSaida = trabalho.map(normalizarLinhaEditada);
    renumerarClassificacao(linhasSaida);
    // o aviso de "editada à mão" só aparece se algo realmente mudou; passar
    // pelo modo de edição e sair sem mexer não deve sujar a tela
    if(assinaturaCSV(linhasSaida) !== assinaturaAoEntrar) ordemEditada = true;
    editando = false;
    trabalho = [];
    renderTabela();
  }

  function idxNoTrabalho(id){
    for(let i=0;i<trabalho.length;i++){ if(trabalho[i]._id === id) return i; }
    return -1;
  }

  function ligarEventosEdicao(){
    const q = areaResultado;

    $('rhSalvar').addEventListener('click', salvarEdicao);
    $('rhCancelar').addEventListener('click', cancelarEdicao);
    $('rhAcrescentar').addEventListener('click', ()=>{
      const nova = linhaManualVazia();
      nova._id = ++seqId;
      trabalho.push(nova);
      renderTabela();
      const tr = q.querySelector('tr[data-id="'+nova._id+'"]');
      const alvo = tr && tr.querySelector('.rhIn[data-c="Nome do candidato"]');
      if(alvo) alvo.focus();
    });

    // A tabela NÃO é redesenhada a cada tecla: só o objeto da linha é atualizado.
    // Assim o Tab nativo continua funcionando e o foco não se perde na digitação.
    Array.prototype.forEach.call(q.querySelectorAll('.rhIn, .rhSel'), function(el){
      const commit = function(){ commitCampo(el); };
      el.addEventListener('input', commit);
      el.addEventListener('change', commit);
    });

    Array.prototype.forEach.call(q.querySelectorAll('.row-del-btn'), function(b){
      b.addEventListener('click', function(){
        const i = idxNoTrabalho(Number(b.dataset.id));
        if(i>=0) trabalho.splice(i,1);
        renderTabela();
      });
    });

    ligarArrastarSoltar(q);
  }

  function commitCampo(el){
    const tr = el.closest('tr');
    if(!tr) return;
    const r = trabalho[idxNoTrabalho(Number(tr.dataset.id))];
    if(!r) return;
    const col = el.dataset.c;
    r[col] = el.value;
    // o destaque vermelho quer dizer "faltam os dados do cadastro"; se o usuário
    // digitar o CPF que faltava, ele sai — e volta se o campo for esvaziado
    if(col==='CPF'){
      r._semCadastro = r._semCadastroBase && !limpar(el.value);
      tr.classList.toggle('unmatched', !!r._semCadastro);
    }
  }

  /* ---------- arrastar e soltar ----------

     Mesmo comportamento da grade do Ponto 18: o <tr> só vira "draggable"
     enquanto o ponteiro está sobre a alça. Sem isso, arrastar para selecionar o
     texto de um campo começaria um arraste de linha por engano. */
  function ligarArrastarSoltar(q){
    let origemId = null;

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
        moverPorTeclado(Number(h.dataset.id), ev.key==='ArrowUp' ? -1 : 1);
      });
    });

    Array.prototype.forEach.call(q.querySelectorAll('tbody tr[data-id]'), function(tr){
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
        if(origemId===null) return;
        const de = idxNoTrabalho(origemId);
        const alvo = idxNoTrabalho(Number(tr.dataset.id));
        origemId = null;
        limparMarcas();
        if(de<0 || alvo<0) return;
        const r = tr.getBoundingClientRect();
        const depois = (ev.clientY - r.top) > r.height/2;
        moverLinha(de, alvo + (depois?1:0));
      });
    });
  }

  // Move a linha de `de` para `destino` (índice medido ANTES da remoção).
  function moverLinha(de, destino){
    const mov = trabalho[de];
    if(!mov) return;
    if(de < destino) destino--;
    trabalho.splice(de,1);
    destino = Math.max(0, Math.min(destino, trabalho.length));
    trabalho.splice(destino, 0, mov);
    renderTabela();
  }

  // Alt+↑ / Alt+↓ na alça: um passo por vez, sem tirar o foco da linha movida.
  function moverPorTeclado(id, passo){
    const i = idxNoTrabalho(id);
    if(i<0) return;
    const j = i + passo;
    if(j<0 || j>=trabalho.length) return;
    const c = trabalho[i];
    trabalho.splice(i,1);
    trabalho.splice(j,0,c);
    renderTabela();
    const novo = areaResultado.querySelector('.drag-handle[data-id="'+id+'"]');
    if(novo) novo.focus();
  }

  btnEditarOrdem.addEventListener('click', ()=>{ if(!editando) entrarEdicao(); });

  btnBaixar.addEventListener('click', ()=>{
    if(!linhasSaida.length) return;
    const blob = new Blob([gerarCSV(linhasSaida)], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'residencia_classificacao_hercules_' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

/* Exposto para os testes automatizados (jsdom/Node) e para depuração. */
window.RH = {
  chaveNome, fmtNota, normalizarCPF, agruparLinhas, linhasDasPaginas,
  reconhecerEdital, editalParaTexto, reconhecerLista, listaParaTexto,
  lerQuadroEdital, lerQuadroLista, registroDaLinhaLista, extrairTelefone,
  ORDEM_VAGAS, tipoDaVaga, montarChamamento, modalidadeParaCotas,
  cruzar, gerarCSV, COLS_CSV, COLS_CONF,
  renumerarClassificacao, linhaManualVazia, normalizarLinhaEditada, assinaturaCSV
};

})();
