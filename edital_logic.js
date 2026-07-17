/* Gerador do Edital de Abertura — Seção de Processo Seletivo (TJPR)
   Requer: edital_modelos.js (EDITAL_PARAS) e vendor/pdf.min.js + vendor/pdf.worker.min.js */
(function(){
'use strict';

/* ============================== EIXOS ============================== */
const AXES_DEF = {
  obrig:    {label:'Tipo de estágio', opts:[['N','Não obrigatório (com remuneração)'],['S','Obrigatório (sem remuneração)']]},
  modal:    {label:'Modalidade da prova', opts:[['PR','Presencial'],['ON','On-line']]},
  nivel:    {label:'Nível de ensino', opts:[['M','Nível Médio'],['G','Graduação'],['P','Pós-Graduação']]},
  entrev:   {label:'2ª fase (entrevista)', opts:[['S','Com entrevista'],['N','Sem entrevista']]},
  consulta: {label:'Consulta durante a prova', opts:[['N','Sem consulta'],['S','Com consulta']]},
  webcam:   {label:'Webcam obrigatória (prova on-line sem consulta)', opts:[['N','Sem webcam'],['S','Com webcam']]}
};
const axes = {obrig:'N', modal:'PR', nivel:'G', entrev:'S', consulta:'N', webcam:'-'};

/* ============================== CAMPOS ============================== */
const CURSOS = ["em Administração","em Análise e Desenvolvimento de Software","em Arquitetura e Urbanismo","em Ciência da Computação","em Ciências Contábeis","em Ciências Sociais / Sociologia","em Design","em Design Digital","em Design Gráfico","em Design de Produto","em Direito","em Economia","em Educação Física","em Elétrica, Eletrônica e Eletrotécnica","em Enfermagem","em Engenharia Civil e Edificações","em Engenharia Mecatrônica","em Engenharia Mecânica","em Engenharia da Computação","em Engenharia de Software","em Estatística","em Gestão Pública","em Gestão da Tecnologia da Informação","em Gestão de Recursos Humanos","em História","em Informática","em Jornalismo","em Pedagogia","em Processamento de Dados","em Psicologia","em Publicidade e Propaganda","em Redes de Computadores","em Relações Públicas","em Secretariado Executivo","em Serviço Social","em Serviços Jurídicos","em Sistema de Informação","em Sistemas para Internet","em Tecnologia da Informação","em Tecnologia em Análise e Desenvolvimento de Sistemas","em Tecnologia em Sistemas de Redes","em Telecomunicação"];
const ORDINAIS = ["1º (primeiro)","2º (segundo)","3º (terceiro)","4º (quarto)","5º (quinto)","6º (sexto)","7º (sétimo)","8º (oitavo)","9º (nono)","10º (décimo)"];
const LIMITES_121 = ["todos os candidatos que atingirem a pontuação mínima","apenas os 5 (cinco) melhores classificados","apenas os 10 (dez) melhores classificados","apenas os 15 (quinze) melhores classificados","apenas os 20 (vinte) melhores classificados"];
const LIMITES_61 = ["a todos os candidatos que atingirem a nota mínima","a todos os candidatos que atingirem a pontuação mínima","limitada apenas aos 5 (cinco) melhores classificados","limitada apenas aos 10 (dez) melhores classificados","limitada apenas aos 15 (quinze) melhores classificados","limitada apenas aos 20 (vinte) melhores classificados"];

/* def: valor inicial | grupo: agrupamento visual | show(): visibilidade conforme eixos */
const FIELDS = {
  UNIDADE:            {grupo:'ident', label:'Unidade solicitante (nome por extenso, para o título do edital)', type:'text', def:'', hint:'Ex.: VARA DE EXECUÇÕES PENAIS E CORREGEDORIA DOS PRESÍDIOS DE FRANCISCO BELTRÃO'},
  NUM_EDITAL:         {grupo:'ident', label:'Número do edital (Nº/ano)', type:'text', def:'', hint:'Ex.: 2870/2026', hintHtml:'Para obter a numeração do Edital, abra o sistema Athos do TJPR (<a href="https://portal.tjpr.jus.br/tjpr-athos/index.do" target="_blank" rel="noopener">portal.tjpr.jus.br/tjpr-athos</a>). Navegue até o menu "Documento" e selecione a opção "Novo".<br>Na nova tela, escolha a opção "DIVISÃO DE ESTÁGIO - DIRETORIA - DEPARTAMENTO DE GESTÃO DE RECURSOS HUMANOS - Edital de Processo Seletivo de Estagiários" e salve o documento para gerar automaticamente a numeração do edital que será utilizada abaixo.'},
  NUM_SEI:            {grupo:'ident', label:'Número do processo SEI', type:'text', def:'', hint:'Ex.: 0031724-38.2026.8.16.6000'},
  ORGAO:              {grupo:'corpo', label:'Órgão que assina o preâmbulo', type:'text', def:'A Secretaria de Gestão de Pessoas'},
  CURSO:              {grupo:'corpo', label:'Curso (área de conhecimento)', type:'datalist', opts:CURSOS, def:'', hint:'Formato "em [Curso]" — ex.: em Direito'},
  PERIODO_INICIAL:    {grupo:'corpo', label:'Semestre inicial', type:'select', opts:['',...ORDINAIS], def:'', hint:'Deixe vazio para omitir o trecho "cursando do ... ao ... semestre" (ex.: pós-graduação)'},
  PERIODO_FINAL:      {grupo:'corpo', label:'Semestre final', type:'select', opts:['',...ORDINAIS], def:''},
  LIMITE_CLASSIFICADOS:{grupo:'corpo', label:'Item 1.2.1 — Quem constará na classificação final', type:'preset', opts:LIMITES_121, def:'apenas os 10 (dez) melhores classificados'},
  VIGENCIA:           {grupo:'corpo', label:'Vigência do processo seletivo', type:'select', opts:['1 (um) ano, não prorrogável','6 (seis) meses, prorrogável por igual período','3 (três) meses, prorrogável por igual período'], def:'1 (um) ano, não prorrogável'},
  URL_INSCRICAO:      {grupo:'corpo', label:'Endereço eletrônico das inscrições (item 4.2)', type:'select', opts:['https://www.tjpr.jus.br/concursos/estagiario','http://tjpr.mestregr.com.br/'], def:'https://www.tjpr.jus.br/concursos/estagiario'},
  PERIODO_INSCRICOES: {grupo:'corpo', label:'Item 4.3 — Disponibilidade das inscrições', type:'preset', opts:['a partir do quinto dia útil subsequente à publicação deste edital no Diário da Justiça Eletrônico (e-DJ), conforme o artigo 12 do Decreto Judiciário nº 345/2019','das 00h00min de [DATA DEFINIR] às 23h59min de [DATA DEFINIR]'], def:'a partir do quinto dia útil subsequente à publicação deste edital no Diário da Justiça Eletrônico (e-DJ), conforme o artigo 12 do Decreto Judiciário nº 345/2019', hint:'O texto do modelo original usa datas fixas; a opção do "quinto dia útil" segue os editais publicados recentemente'},
  INSCRICOES_SUBITEM: {grupo:'corpo', label:'Item 4.3.1 — Prazo das inscrições (deixe vazio para omitir o subitem)', type:'text', def:''},
  COMPOSICAO_PROVA:   {grupo:'prova', label:'Composição da prova (item 5.2)', type:'textarea', def:'', hint:'Ex.: 10 (dez) questões objetivas avaliadas em 0,5 (zero vírgula cinco) ponto cada e 1 (uma) questão discursiva avaliada em 5 (cinco) pontos'},
  DURACAO_PROVA:      {grupo:'prova', label:'Duração da prova', type:'text', def:'03h00min'},
  DATA_PROVA_PRESENCIAL:{grupo:'prova', label:'Data, horário e local da prova presencial', type:'preset', opts:['A data, o horário e o local de aplicação da prova serão divulgados por meio de Edital de Ensalamento, a ser disponibilizado na respectiva página do processo seletivo, no portal do TJPR.','A data, o horário e o local de aplicação da prova serão divulgados por meio de documento oficial de ensalamento.','A prova será realizada presencialmente em 00/00/0000, das 00h00min às 00h00min, no [LOCAL], situado à [ENDEREÇO].','A prova será realizada presencialmente em 00/00/0000, das 00h00min às 00h00min. O local de aplicação da prova será divulgado por meio de documento oficial de ensalamento.'], def:'A data, o horário e o local de aplicação da prova serão divulgados por meio de Edital de Ensalamento, a ser disponibilizado na respectiva página do processo seletivo, no portal do TJPR.', show:a=>a.modal==='PR'},
  DATA_PROVA_ONLINE:  {grupo:'prova', label:'Data e horário da prova on-line', type:'preset', opts:['A prova será realizada na modalidade à distância, e ficará disponível em 00/00/0000, das 00h00min às 00h00min.','A prova será realizada na modalidade à distância, e ficará disponível das 00h00min de 00/00/0000 às 00h00min de 00/00/0000.'], def:'A prova será realizada na modalidade à distância, e ficará disponível em 00/00/0000, das 00h00min às 00h00min.', show:a=>a.modal==='ON'},
  LIMITE_CONVOCADOS:  {grupo:'prova', label:'Item 6.1 — Quem será convocado para a entrevista', type:'preset', opts:LIMITES_61, def:'a todos os candidatos que atingirem a nota mínima', show:a=>a.entrev==='S'},
  DESEMPATE_INTRO:    {grupo:'prova', label:'Item 6.1.1 — Situação de empate (início do item)', type:'text', def:'Havendo candidatos empatados com a nota de corte do último classificado', show:a=>a.entrev==='S'},
  DESEMPATE_TEXTO:    {grupo:'prova', label:'Item 6.1.1 — Regra aplicada ao empate', type:'preset', opts:['serão convocados para entrevista todos aqueles empatados com a mesma nota do último classificado','será utilizado critério de desempate (data de nascimento)'], def:'serão convocados para entrevista todos aqueles empatados com a mesma nota do último classificado', show:a=>a.entrev==='S'},
  LIMITE_FINAL:       {grupo:'prova', label:'Item da classificação final — limite de classificados', type:'preset', opts:LIMITES_61, def:'limitada apenas aos 10 (dez) melhores classificados'},
  INCLUIR_COTA_NEGROS:{grupo:'prova', label:'Incluir item 6.1.3 — candidatos cotistas admitidos à entrevista com nota até 20% inferior à mínima (prática dos editais recentes)', type:'check', def:true, show:a=>a.entrev==='S'},
  INCLUIR_SANITARIOS: {grupo:'prova', label:'Incluir itens de protocolos sanitários (máscara, álcool gel, distanciamento) — constam dos modelos, mas foram omitidos nos editais recentes', type:'check', def:false, show:a=>a.modal==='PR'},
  CONTEUDO_PROGRAMATICO:{grupo:'anexo', label:'Conteúdo programático (ANEXO I) — um item por linha', type:'textarea', def:'', hint:'A linha "Código de Ética e Conduta do Poder Judiciário" já consta do modelo e não precisa ser repetida'},
  DATA_ASSINATURA:    {grupo:'assin', label:'Local e data da assinatura', type:'text', def:''},
  ASSINANTE_NOME:     {grupo:'assin', label:'Nome de quem assina', type:'text', def:'JOÃO PEDRO DE PAULA SOARES VALENTE'},
  ASSINANTE_CARGO:    {grupo:'assin', label:'Cargo/unidade de quem assina (uma linha por linha do bloco)', type:'textarea', def:'Chefe da Divisão de Seleção de Estagiários e Residentes, Formação de Talentos e Ambientação\nCoordenadoria de Desenvolvimento Humano e Organizacional\nSecretaria de Gestão de Pessoas'}
};
const GRUPOS = [['ident','Identificação do edital'],['corpo','Campos do corpo do edital'],['prova','Prova, entrevista e classificação'],['anexo','Anexo I — Conteúdo programático'],['assin','Assinatura']];
const values = {};
Object.keys(FIELDS).forEach(k => values[k] = FIELDS[k].def);

/* ============================== UTIL ============================== */
const $ = id => document.getElementById(id);
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function hojeExtenso(){
  const M=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const d=new Date(); return 'Curitiba, '+d.getDate()+' de '+M[d.getMonth()]+' de '+d.getFullYear();
}
const UNID=['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
const DEZN=['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
function extensoInt(n){
  n=Math.floor(Math.abs(n));
  if(n<20) return UNID[n];
  if(n<100){ const d=Math.floor(n/10), u=n%10; return DEZN[d]+(u?' e '+UNID[u]:''); }
  if(n===100) return 'cem';
  return String(n);
}
function extensoNota(v){ // "0,5" -> "zero vírgula cinco" | "5" -> "cinco"
  v=String(v).trim().replace('.',',');
  if(!/^\d+(,\d+)?$/.test(v)) return '';
  const [i,d]=v.split(',');
  let s=extensoInt(parseInt(i,10));
  if(d && parseInt(d,10)>0){
    const dd=d.replace(/0+$/,'')||'0';
    s+=' vírgula '+(dd.length===1?UNID[parseInt(dd,10)]:extensoInt(parseInt(dd,10)));
  }
  return s;
}
function fmtNota(x){ // número -> string pt-BR sem zeros inúteis
  let s=(Math.round(x*100)/100).toString().replace('.',',');
  return s;
}
function sugestaoComposicao(qObj, qDis, pesoDis){
  const num1 = v => { const m=String(v||'').match(/\d+/); return m?parseInt(m[0],10):0; };
  const numF = v => { const m=String(v||'').replace(',','.').match(/\d+(\.\d+)?/); return m?parseFloat(m[0]):0; };
  qObj=num1(qObj); qDis=num1(qDis);
  const pd=numF(pesoDis);
  const fem = n => n===1?'uma':(n===2?'duas':extensoInt(n));
  const partes=[];
  if(qObj>0){
    let po=null;
    if(pd>0 && qDis>0) po=(10 - qDis*pd)/qObj;      // sugestão assumindo nota total 10
    const poS = (po && po>0) ? fmtNota(po) : '0,00';
    const poExt = extensoNota(poS) || 'zero vírgula zero zero';
    partes.push(qObj+' ('+fem(qObj)+') '+(qObj===1?'questão objetiva avaliada':'questões objetivas avaliadas')
      +' em '+poS+' ('+poExt+') '+(qObj===1?'ponto':'ponto cada'));
  }
  if(qDis>0){
    const pdS = pd>0 ? fmtNota(pd) : '0,00';
    const pdExt = extensoNota(pdS) || 'zero vírgula zero zero';
    partes.push(qDis+' ('+fem(qDis)+') '+(qDis===1?'questão discursiva avaliada':'questões discursivas avaliadas')
      +' em '+pdS+' ('+pdExt+') '+(pd===1?'ponto':'pontos'));
  }
  return partes.join(' e ');
}
function duracaoFmt(h){
  const m=String(h||'').match(/\d+/);
  const n=m?parseInt(m[0],10):0;
  if(!n) return '';
  return String(n).padStart(2,'0')+'h00min';
}

/* ============================== LEITURA DO PDF ============================== */
async function pdfParaTexto(file){
  if(typeof pdfjsLib==='undefined') throw new Error('Biblioteca pdf.js não carregada (vendor/pdf.min.js).');
  try{ pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.js'; }catch(e){}
  const buf=await file.arrayBuffer();
  const doc=await pdfjsLib.getDocument({data:buf}).promise;
  let out='';
  for(let p=1;p<=doc.numPages;p++){
    const page=await doc.getPage(p);
    const tc=await page.getTextContent();
    // agrupar itens por linha (coordenada Y) e ordenar por X
    const linhas={};
    tc.items.forEach(it=>{
      if(!it.str) return;
      const y=Math.round(it.transform[5]);
      (linhas[y]=linhas[y]||[]).push({x:it.transform[4], t:it.str});
    });
    const ys=Object.keys(linhas).map(Number).sort((a,b)=>b-a);
    ys.forEach(y=>{
      const l=linhas[y].sort((a,b)=>a.x-b.x).map(o=>o.t).join(' ').replace(/\s+/g,' ').trim();
      if(l) out+=l+'\n';
    });
    out+='\n';
  }
  return out;
}

/* rótulos do formulário SEI, na ordem do documento */
const LABELS = [
 ['unidade_sigla',['Unidade titular o processo seletivo (SIGLA SEI):','Unidade titular o processo seletivo']],
 ['telefone',['Telefone para contato (caso a Divisão de Estágio necessite mais informações):','Telefone para contato']],
 ['modalidade_ps',['Modalidade do processo seletivo:']],
 ['modalidade_estagio',['Modalidade de estágio:']],
 ['nivel',['Nível de ensino:']],
 ['curso',['Área de conhecimento (curso):','Área de conhecimento']],
 ['semestres',['Semestre inicial e final que o estagiário deverá estar cursando (pós-graduação não se aplica):','Semestre inicial e final']],
 ['vigencia',['Vigência do processo seletivo:']],
 ['prazo_inscricao',['Prazo em dias para inscrição dos candidatos:']],
 ['prazo_prova',['Prazo em horas para realização da prova:']],
 ['horas_prova',['Quantas horas o candidato terá para realizar a prova, a partir do seu início:','Quantas horas o candidato terá para realizar a prova']],
 ['local_prova',['Local ou unidade para a realização da prova presencial:']],
 ['endereco_prova',['Endereço do local ou unidade para a realização da prova presencial:']],
 ['tipo_questoes',['Tipo das questões da prova:']],
 ['q_objetivas',['Quantidade de questões objetivas (se houver):','Quantidade de questões objetivas']],
 ['q_discursivas',['Quantidade de questões discursivas (se houver):','Quantidade de questões discursivas']],
 ['peso_discursivas',['Peso das questões discursivas:']],
 ['observacoes',['Eventuais observações sobre tipo das questões/peso:','Eventuais observações']],
 ['mecanismos',['Mecanismos de segurança da prova on-line:']],
 ['email_resp',['Email do(s) responsável(eis) pelo acesso / correção das questões discursivas na plataforma on-line:','Email do(s) responsável(eis)']],
 ['entrevista',['Haverá 2ª fase (entrevista) com os candidatos?','Haverá 2ª fase (entrevista) com os candidatos']],
 ['qtd_convocados',['Quantidade de candidatos que serão convocados para entrevista:']],
 ['qtd_convocados_outra',['Informar quantidade:']],
 ['desempate_entrevista',['Critério de desempate']],
 ['qtd_final',['Quantidade de candidatos que constarão na classificação final:']],
 ['qtd_final_outra',['Informar quantidade:']],
 ['desempate_final',['Critério de desempate']],
 ['conteudo',['Conteúdo programático:']]
];

function parseFormulario(texto){
  // nº SEI vem do texto bruto (aparece no cabeçalho/rodapé das páginas)
  const mSei = texto.match(/\d{7}-\d{2}\.\d{4}\.8\.16\.\d{4}/);
  // limpar cabeçalhos/rodapés de página do SEI
  const linhas = texto.split('\n').filter(l=>{
    const t=l.trim();
    if(!t) return false;
    if(/^#?\s*Abertura de Processo Seletivo de Estagiários/i.test(t)) return false;
    if(/SEI\s+\d{7}-\d{2}\.\d{4}\.8\.16\.\d{4}\s*\/\s*pg\./i.test(t)) return false;
    if(/^Documento assinado eletronicamente/i.test(t)) return false;
    if(/^A autenticidade do documento/i.test(t)) return false;
    if(/^informando o código verificador/i.test(t)) return false;
    if(/^(Gerar Formulário|Salvar|Voltar)$/i.test(t)) return false;
    return true;
  });
  const corpo = linhas.join('\n');

  // C: corpo com espaços em branco colapsados, com mapa de volta para os índices de `corpo`
  let C=''; const mapa=[]; let emEspaco=false;
  for(let i=0;i<corpo.length;i++){
    const ch=corpo[i];
    if(/\s/.test(ch)){
      if(!emEspaco){ C+=' '; mapa.push(i); emEspaco=true; }
    } else { C+=ch; mapa.push(i); emEspaco=false; }
  }
  mapa.push(corpo.length);
  // normalização 1:1 (mesmo comprimento de C): minúsculas + sem acentos, caractere a caractere
  const norm1 = s => Array.from(s).map(c=>{
    const d=c.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return (d.length===1?d:c).toLowerCase();
  }).join('');
  const CN = norm1(C);
  const normLabel = s => norm1(s.replace(/\s+/g,' ').trim());

  // localizar cada rótulo em ordem
  const achados=[]; let cursor=0;
  LABELS.forEach(([chave,rotulos])=>{
    let idx=-1, alvo='';
    for(const r of rotulos){
      alvo=normLabel(r);
      idx=CN.indexOf(alvo, cursor);
      if(idx!==-1) break;
    }
    if(idx===-1){ achados.push({chave, ini:-1}); return; }
    let fim = idx + alvo.length;
    while(fim<C.length && C[fim]!==':' && C[fim]!=='?' && !/\s/.test(C[fim])) fim++;
    while(fim<C.length && (C[fim]===':'||C[fim]==='?'||C[fim]===' ')) fim++;
    achados.push({chave, ini:idx, fim});
    cursor=fim;
  });
  let fimCorpo = CN.indexOf(normLabel('Assinar e enviar para a unidade'));
  if(fimCorpo===-1) fimCorpo=C.length;

  const dados={};
  for(let i=0;i<achados.length;i++){
    const a=achados[i];
    if(a.ini===-1){ dados[a.chave]=null; continue; }
    let prox=fimCorpo;
    for(let j=i+1;j<achados.length;j++){ if(achados[j].ini!==-1){ prox=Math.min(fimCorpo, achados[j].ini); break; } }
    if(prox<a.fim) prox=a.fim;
    // recortar do texto ORIGINAL usando o mapa (preserva quebras de linha)
    const iniOrig=mapa[Math.min(a.fim, mapa.length-1)];
    const fimOrig=mapa[Math.min(prox, mapa.length-1)];
    let v=corpo.slice(iniOrig, fimOrig).replace(/^\s*[:?]\s*/,'').trim();
    v=v.split('\n').map(l=>l.trim()).filter(Boolean).join('\n');
    dados[a.chave]=v;
  }
  dados.num_sei = mSei ? mSei[0] : '';
  return dados;
}

function aplicarDados(d, avisos){
  const norm = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  // eixos
  if(d.modalidade_ps){ axes.modal = /on-?line/i.test(d.modalidade_ps) ? 'ON' : 'PR'; }
  else avisos.push('Modalidade do processo seletivo não localizada — confira o eixo "Modalidade da prova".');
  if(d.modalidade_estagio){ axes.obrig = /nao obrigat/i.test(norm(d.modalidade_estagio)) ? 'N' : (/obrigat/i.test(norm(d.modalidade_estagio)) ? 'S' : 'N'); }
  if(d.nivel){
    const n=norm(d.nivel);
    axes.nivel = /medio/.test(n) ? 'M' : (/pos/.test(n) ? 'P' : 'G');
  }
  if(axes.obrig==='S' && axes.nivel!=='G'){ avisos.push('Estágio obrigatório só possui modelo para Graduação — nível ajustado para Graduação.'); axes.nivel='G'; }
  if(d.entrevista){ axes.entrev = /sim/i.test(d.entrevista) ? 'S' : 'N'; }
  else avisos.push('Resposta sobre 2ª fase (entrevista) não localizada — confira o eixo.');
  // consulta/webcam
  if(axes.modal==='ON'){
    const mec=norm(d.mecanismos||'');
    if(/consulta livre/.test(mec)){ axes.consulta='S'; axes.webcam='-'; }
    else if(/webcam/.test(mec) && !/sem necessidade/.test(mec)){ axes.consulta='N'; axes.webcam='S'; }
    else if(/travamento/.test(mec)){ axes.consulta='N'; axes.webcam='N'; }
    else { axes.consulta='N'; axes.webcam='N'; avisos.push('Mecanismos de segurança da prova on-line não identificados — assumido "sem consulta, sem webcam". Confira.'); }
  } else {
    axes.webcam='-';
    axes.consulta='N';
    avisos.push('O formulário não informa se a prova presencial permite consulta — assumido "sem consulta". Confira o eixo.');
  }
  // campos
  values.NUM_SEI = d.num_sei || values.NUM_SEI;
  if(d.curso){
    const c=d.curso.replace(/^em\s+/i,'').trim();
    const achado=CURSOS.find(x=>norm(x)===norm('em '+c));
    values.CURSO = achado || (c ? 'em '+c : '');
    if(!achado && c) avisos.push('Curso "'+c+'" não consta da lista oficial de cursos dos modelos — texto mantido como digitado.');
  }
  if(d.semestres){
    const nums=d.semestres.match(/\d+/g);
    if(nums && nums.length>=2){
      const o1=ORDINAIS[parseInt(nums[0],10)-1], o2=ORDINAIS[parseInt(nums[1],10)-1];
      if(o1) values.PERIODO_INICIAL=o1;
      if(o2) values.PERIODO_FINAL=o2;
    } else { values.PERIODO_INICIAL=''; values.PERIODO_FINAL=''; }
  }
  if(axes.nivel==='P'){ values.PERIODO_INICIAL=''; values.PERIODO_FINAL='';
    avisos.push('Pós-graduação: o trecho "cursando do ... ao ... semestre" será omitido (semestres vazios).'); }
  if(d.vigencia){
    const v=norm(d.vigencia);
    if(/1 \(um\) ano|um ano/.test(v)) values.VIGENCIA='1 (um) ano, não prorrogável';
    else if(/6 \(seis\)|seis meses/.test(v)) values.VIGENCIA='6 (seis) meses, prorrogável por igual período';
    else if(/3 \(tres\)|tres meses/.test(v)) values.VIGENCIA='3 (três) meses, prorrogável por igual período';
  }
  if(d.qtd_final){
    const q=norm(d.qtd_final);
    if(/apenas os (\d+)/.test(q)){
      const n=q.match(/apenas os (\d+)/)[1];
      const op=LIMITES_121.find(x=>x.indexOf('apenas os '+n+' ')===0);
      if(op){ values.LIMITE_CLASSIFICADOS=op; values.LIMITE_FINAL='limitada apenas aos '+op.replace('apenas os ',''); }
    } else if(/todos/.test(q)){
      values.LIMITE_CLASSIFICADOS='todos os candidatos que atingirem a pontuação mínima';
      values.LIMITE_FINAL='a todos os candidatos que atingirem a pontuação mínima';
    } else if(/outra/.test(q) && d.qtd_final_outra){
      avisos.push('Classificação final com "outra quantidade": "'+d.qtd_final_outra+'" — ajuste os itens 1.2.1 e da classificação final manualmente.');
    }
  }
  if(axes.entrev==='S' && d.desempate_entrevista && /idade|nascimento/i.test(d.desempate_entrevista)){
    values.DESEMPATE_TEXTO='será utilizado critério de desempate (data de nascimento)';
  }
  if(axes.entrev==='S' && d.qtd_convocados){
    const q=norm(d.qtd_convocados);
    if(/todos os que atingirem a nota minima/.test(q)) values.LIMITE_CONVOCADOS='a todos os candidatos que atingirem a nota mínima';
    else if(/apenas os (\d+)/.test(q)){
      const n=q.match(/apenas os (\d+)/)[1];
      const op=LIMITES_121.find(x=>x.indexOf('apenas os '+n+' ')===0);
      if(op) values.LIMITE_CONVOCADOS='limitada apenas aos '+op.replace('apenas os ','');
    } else if(/outra/.test(q)){
      const info=(d.qtd_convocados_outra||'').split('\n')[0]||'(não informado)';
      avisos.push('Convocação para entrevista com "outra quantidade": "'+info+'" — ajuste o item 6.1 manualmente.');
    }
  }
  if(d.prazo_inscricao){
    const m=String(d.prazo_inscricao).match(/\d+/);
    if(m){ const n=parseInt(m[0],10);
      values.INSCRICOES_SUBITEM='As inscrições ficarão disponíveis por '+n+' ('+extensoInt(n)+') dias na página do processo seletivo, no portal do TJPR.'; }
  }
  const dur = d.horas_prova || d.prazo_prova;
  if(dur && duracaoFmt(dur)) values.DURACAO_PROVA=duracaoFmt(dur);
  values.COMPOSICAO_PROVA = sugestaoComposicao(d.q_objetivas, d.q_discursivas, d.peso_discursivas) || values.COMPOSICAO_PROVA;
  if(values.COMPOSICAO_PROVA && d.q_objetivas && d.q_discursivas && d.peso_discursivas)
    avisos.push('Composição da prova sugerida assumindo nota total 10 — confira o peso das questões objetivas.');
  if(axes.modal==='PR' && d.local_prova && d.local_prova!=='-'){
    // acrescenta uma opção pronta com o local informado pela unidade, sem trocar o padrão (ensalamento)
    FIELDS.DATA_PROVA_PRESENCIAL.opts = FIELDS.DATA_PROVA_PRESENCIAL.opts.concat(
      'A prova será realizada presencialmente em 00/00/0000, das 00h00min às 00h00min, no '
      + d.local_prova + (d.endereco_prova && d.endereco_prova!=='-' ? ', situado à '+d.endereco_prova : '') + '.');
    avisos.push('Local informado pela unidade: "'+d.local_prova+'". O item 5.3 ficou com a opção do Edital de Ensalamento; se preferir citar data e local no edital, escolha o texto pronto correspondente e preencha data/horário.');
  }
  if(d.conteudo){
    values.CONTEUDO_PROGRAMATICO = d.conteudo.split('\n').map(l=>l.trim()).filter(l=>l && l!=='-'
      && !/^conteudo programatico:?$/.test(norm(l))
      && !/^codigo de etica e conduta do poder judiciario\.?$/.test(norm(l))).join('\n');
  }
  if(!values.DATA_ASSINATURA) values.DATA_ASSINATURA = hojeExtenso();
}

/* ============================== TELA DE CONFIRMAÇÃO ============================== */
function renderConfirma(avisos){
  const box=$('edConfirma');
  let h='';
  if(avisos && avisos.length){
    h+='<div class="stamp-wrap show" style="margin-bottom:20px;"><div class="stamp warn">REVISAR</div><div class="stamp-text"><strong>Pontos de atenção da leitura:</strong><ul class="warn-list">'+avisos.map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul></div></div>';
  }
  // bloco de eixos (montado numa variável para poder ser posicionado após a Identificação)
  let hEixos='<div class="ed-grupo"><p class="ed-grupo-tit">Modelo de edital (eixos)</p><div class="ed-grid">';
  Object.keys(AXES_DEF).forEach(ax=>{
    const def=AXES_DEF[ax];
    const disabled = (ax==='webcam' && !(axes.modal==='ON' && axes.consulta==='N')) ||
                     (ax==='nivel' && axes.obrig==='S');
    hEixos+='<label class="ed-campo"><span>'+esc(def.label)+':</span><select data-eixo="'+ax+'"'+(disabled?' disabled':'')+'>';
    def.opts.forEach(([v,t])=>{ hEixos+='<option value="'+v+'"'+(axes[ax]===v?' selected':'')+'>'+esc(t)+'</option>'; });
    hEixos+='</select></label>';
  });
  hEixos+='</div><p class="ed-modelo-nome" id="edModeloNome"></p></div>';

  // monta um grupo de campos (retorna '' se não houver campos visíveis)
  function grupoHtml(gid, gtit){
    const campos=Object.keys(FIELDS).filter(k=>FIELDS[k].grupo===gid && (!FIELDS[k].show || FIELDS[k].show(axes)));
    if(!campos.length) return '';
    let g='<div class="ed-grupo"><p class="ed-grupo-tit">'+esc(gtit)+'</p><div class="ed-grid">';
    campos.forEach(k=>{
      const f=FIELDS[k]; const v=values[k]||'';
      g+='<label class="ed-campo'+(f.type==='textarea'||f.type==='preset'?' ed-campo-full':'')+'"><span>'+esc(f.label)+':</span>';
      if(f.type==='select'){
        g+='<select data-campo="'+k+'">'+f.opts.map(o=>'<option'+(o===v?' selected':'')+'>'+esc(o)+'</option>').join('')+'</select>';
      } else if(f.type==='datalist'){
        g+='<input type="text" data-campo="'+k+'" list="dl_'+k+'" value="'+esc(v).replace(/"/g,'&quot;')+'"><datalist id="dl_'+k+'">'+f.opts.map(o=>'<option value="'+esc(o).replace(/"/g,'&quot;')+'">').join('')+'</datalist>';
      } else if(f.type==='preset'){
        g+='<select data-preset="'+k+'"><option value="">— escolher texto padrão —</option>'+f.opts.map(o=>'<option>'+esc(o)+'</option>').join('')+'</select>';
        g+='<textarea data-campo="'+k+'" rows="2">'+esc(v)+'</textarea>';
      } else if(f.type==='textarea'){
        g+='<textarea data-campo="'+k+'" rows="4">'+esc(v)+'</textarea>';
      } else if(f.type==='check'){
        g+='<span style="font-weight:400;"><input type="checkbox" data-check="'+k+'"'+(v?' checked':'')+' style="width:auto;margin-right:8px;vertical-align:middle;">'+'Sim, incluir</span>';
      } else {
        g+='<input type="text" data-campo="'+k+'" value="'+esc(v).replace(/"/g,'&quot;')+'">';
      }
      if(f.hintHtml) g+='<small>'+f.hintHtml+'</small>';
      else if(f.hint) g+='<small>'+esc(f.hint)+'</small>';
      g+='</label>';
    });
    g+='</div></div>';
    return g;
  }

  // ordem final: Identificação do edital -> eixos -> demais grupos
  GRUPOS.forEach(([gid,gtit])=>{ if(gid==='ident') h+=grupoHtml(gid,gtit); });
  h+=hEixos;
  GRUPOS.forEach(([gid,gtit])=>{ if(gid!=='ident') h+=grupoHtml(gid,gtit); });
  box.innerHTML=h;
  box.querySelectorAll('[data-eixo]').forEach(el=>el.addEventListener('change',()=>{
    axes[el.dataset.eixo]=el.value;
    if(axes.modal!=='ON' || axes.consulta!=='N') axes.webcam='-';
    else if(axes.webcam==='-') axes.webcam='N';
    if(axes.obrig==='S') axes.nivel='G';
    renderConfirma();
  }));
  box.querySelectorAll('[data-campo]').forEach(el=>el.addEventListener('input',()=>{ values[el.dataset.campo]=el.value; }));
  box.querySelectorAll('[data-check]').forEach(el=>el.addEventListener('change',()=>{ values[el.dataset.check]=el.checked; }));
  box.querySelectorAll('[data-preset]').forEach(el=>el.addEventListener('change',()=>{
    if(!el.value) return;
    const k=el.dataset.preset;
    values[k]=el.value;
    const ta=box.querySelector('textarea[data-campo="'+k+'"]'); if(ta) ta.value=el.value;
    el.value='';
  }));
  const nome=[];
  nome.push(axes.obrig==='S'?'Estágio Obrigatório':'Não obrigatório');
  nome.push(axes.modal==='ON'?'On-line':'Presencial');
  nome.push({M:'Nível Médio',G:'Graduação',P:'Pós-Graduação'}[axes.nivel]);
  nome.push(axes.entrev==='S'?'Com entrevista':'Sem entrevista');
  nome.push(axes.consulta==='S'?'Com consulta':'Sem consulta');
  if(axes.modal==='ON'&&axes.consulta==='N') nome.push(axes.webcam==='S'?'Com webcam':'Sem webcam');
  $('edModeloNome').textContent='Modelo identificado: '+nome.join(' · ');
  $('edEtapa2').style.display='block';
}

/* ============================== GERAÇÃO ============================== */
function linkify(h){
  // transforma URLs (http/https) já presentes no texto em links clicáveis,
  // preservando pontuação final (., ,) fora do href
  return h.replace(/(https?:\/\/[^\s<]+?)([.,;:]?)(?=\s|<|$)/g, function(m, url, punct){
    return '<a href="'+url+'" target="_blank" rel="noopener">'+url+'</a>'+punct;
  });
}
function condOk(c){ if(!c) return true; return Object.keys(c).every(ax=>c[ax].indexOf(axes[ax])!==-1); }
function subTokens(h){
  // remoção do trecho de semestres quando vazios
  if(!values.PERIODO_INICIAL && !values.PERIODO_FINAL){
    h=h.replace(/, cursando do \{\{PERIODO_INICIAL\}\} ao \{\{PERIODO_FINAL\}\} semestre no ato da inscrição/g,'');
  }
  // item 4.3: quando o texto começa com "a partir", a preposição "das" do modelo sai
  if(/^a partir/i.test(values.PERIODO_INSCRICOES||'')){
    h=h.replace('disponíveis das {{PERIODO_INSCRICOES}}','disponíveis {{PERIODO_INSCRICOES}}');
  }
  // item 7.1: com a cota do item 6.1.3, os editais recentes acrescentam a ressalva
  if(values.INCLUIR_COTA_NEGROS && axes.entrev==='S' && h.indexOf('média aritmética')!==-1 && h.indexOf('{{LIMITE_FINAL}}')!==-1){
    h=h.replace(', {{LIMITE_FINAL}}',', ressalvado o item 6.1.3, {{LIMITE_FINAL}}');
  }
  h=h.replace(/\{\{(\w+)\}\}/g,(m,k)=>{
    if(k==='DESEMPATE_INTRO'||k==='DESEMPATE_TEXTO') return esc(values[k]||'');
    return esc(values[k]!==undefined?values[k]:m);
  });
  return linkify(h);
}
function gerarEditalHTML(){
  const partes=[];
  // bloco de título
  partes.push('<p class="ed-c ed-b">TRIBUNAL DE JUSTIÇA DO ESTADO DO PARANÁ</p>');
  partes.push('<p class="ed-c ed-b">EDITAL DE ABERTURA</p>');
  partes.push('<p class="ed-c ed-b">PROCESSO SELETIVO DE ESTAGIÁRIOS</p>');
  if(values.UNIDADE) partes.push('<p class="ed-c ed-b">'+esc(values.UNIDADE.toUpperCase())+'</p>');
  partes.push('<p class="ed-c">&nbsp;</p>');
  if(values.NUM_EDITAL) partes.push('<p class="ed-c ed-b">EDITAL N° '+esc(values.NUM_EDITAL)+'</p>');
  if(values.NUM_SEI) partes.push('<p class="ed-c ed-b">SEI!TJPR N° '+esc(values.NUM_SEI)+'</p>');
  partes.push('<p class="ed-c">&nbsp;</p>');
  // corpo numerado
  let n1=0,n2=0,n3=0,letra=0;
  const SANITARIOS=['Ao adentrar nas dependências','o uso adequado de máscara','a higienização das mãos','evitar aglomerações'];
  function emitir(l, html){
    let num='';
    if(l===0){ n1++; n2=0; n3=0; letra=0; num=n1+'.'; partes.push('<p class="ed-j ed-b">'+num+' '+html.replace(/<\/?b>/g,'')+'</p>'); return; }
    if(l===1){ n2++; n3=0; letra=0; num=n1+'.'+n2+'.'; }
    else if(l===2){ n3++; letra=0; num=n1+'.'+n2+'.'+n3+'.'; }
    else if(l===3){ letra++; num=String.fromCharCode(96+letra)+')'; }
    partes.push('<p class="ed-j"><b>'+num+'</b> '+html+'</p>');
  }
  EDITAL_PARAS.forEach(p=>{
    if(!condOk(p.c)) return;
    if(!values.INCLUIR_SANITARIOS && SANITARIOS.some(s=>p.h.indexOf(s)===0)) return;
    if(p.h.indexOf('{{DESEMPATE_INTRO}}')!==-1 && !(values.DESEMPATE_INTRO||'').trim() && !(values.DESEMPATE_TEXTO||'').trim()) return;
    const html=subTokens(p.h);
    if(p.l==='free'){ partes.push('<p class="ed-j">'+html+'</p>'); return; }
    emitir(p.l, html);
    // subitem 4.3.1 (prazo das inscrições)
    if(p.h.indexOf('{{PERIODO_INSCRICOES}}')!==-1 && (values.INSCRICOES_SUBITEM||'').trim()){
      emitir(2, esc(values.INSCRICOES_SUBITEM.trim()));
    }
    // item 6.1.3 (cota de nota para candidatos negros)
    if(values.INCLUIR_COTA_NEGROS && axes.entrev==='S' && p.h.indexOf('O candidato que não comparecer à convocação para entrevista')===0){
      emitir(2, 'Quanto aos candidatos cotistas, bastará o alcance de nota 20% inferior à nota mínima estabelecida para os demais candidatos, para serem admitidos na próxima fase do certame.');
    }
  });
  // ANEXO I: conteúdo programático — numerado, começando pelo item fixo (Código de Ética).
  // Remove numeração que o usuário possa ter colado no início da linha (ex.: "1.", "2)", "3 -",
  // ou até "2. 1." colado de um edital antigo), para não duplicar com a numeração da ferramenta.
  // O padrão exige um marcador curto (1-2 dígitos + separador) no começo, então números do
  // conteúdo real (ex.: "Lei 9.099/95", "Lei 12.153/09") são preservados.
  const tiraNumeracao = t => {
    let ant;
    do { ant=t; t=t.replace(/^\s*\d{1,2}\s*[.)\u2013\u2014\u00ba\u00b0-]\s+/, ''); } while(t!==ant);
    return t.trim();
  };
  const itensAnexo = ['Código de Ética e Conduta do Poder Judiciário']
    .concat((values.CONTEUDO_PROGRAMATICO||'').split('\n')
      .map(l=>tiraNumeracao(l.trim()))
      .filter(l => l && !/^c[óo]digo de [ée]tica e conduta do poder judici[áa]rio\.?$/i.test(l.normalize('NFD').replace(/[\u0300-\u036f]/g,''))));
  itensAnexo.forEach((l, i)=>{
    partes.push('<p class="ed-j">'+(i+1)+'. '+esc(l)+'</p>');
  });
  // assinatura
  partes.push('<p class="ed-c">&nbsp;</p>');
  if(values.DATA_ASSINATURA) partes.push('<p class="ed-c">'+esc(values.DATA_ASSINATURA)+'.</p>');
  partes.push('<p class="ed-c">&nbsp;</p>');
  if(values.ASSINANTE_NOME) partes.push('<p class="ed-c ed-b">'+esc(values.ASSINANTE_NOME.toUpperCase())+'</p>');
  (values.ASSINANTE_CARGO||'').split('\n').map(l=>l.trim()).filter(Boolean).forEach(l=>{
    partes.push('<p class="ed-c ed-b">'+esc(l)+'</p>');
  });
  return partes.join('\n');
}

/* ============================== AÇÕES DA ETAPA 3 ============================== */
// Converte as classes internas (ed-c/ed-b/ed-j) em estilos inline, para que a
// formatação (centralizado, negrito, justificado) sobreviva ao colar no Word/SEI,
// onde as classes CSS desta página não existem.
function htmlComEstilosInline(){
  const clone = $('edSaida').cloneNode(true);
  clone.querySelectorAll('p').forEach(pEl=>{
    const est=[];
    if(pEl.classList.contains('ed-c')) est.push('text-align:center');
    if(pEl.classList.contains('ed-j')) est.push('text-align:justify');
    if(pEl.classList.contains('ed-b')) est.push('font-weight:bold');
    est.push('margin:0 0 8pt');
    pEl.setAttribute('style', est.join(';'));
    pEl.removeAttribute('class');
  });
  return '<div style="font-family:Calibri,\'Carlito\',Arial,sans-serif;font-size:11pt;line-height:1.35;">'
    + clone.innerHTML + '</div>';
}
async function copiarTudo(){
  const el=$('edSaida');
  const html=htmlComEstilosInline();
  const texto=el.innerText;
  try{
    if(navigator.clipboard && window.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html],{type:'text/html'}),
        'text/plain': new Blob([texto],{type:'text/plain'})
      })]);
    } else { throw new Error('sem ClipboardItem'); }
    avisoCopiado('Texto copiado com formatação — cole no Word ou no editor do SEI.');
  }catch(e){
    // fallback: seleção + execCommand
    const r=document.createRange(); r.selectNodeContents(el);
    const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    const ok=document.execCommand('copy'); sel.removeAllRanges();
    avisoCopiado(ok?'Texto copiado — cole no Word ou no editor do SEI.':'Não foi possível copiar automaticamente. Selecione o texto e use Ctrl+C.');
  }
}
function avisoCopiado(msg){ const n=$('edMsgAcao'); n.textContent=msg; setTimeout(()=>{ if(n.textContent===msg) n.textContent=''; },6000); }

function baixarPDF(){
  const w=window.open('','_blank');
  if(!w){ avisoCopiado('O navegador bloqueou a janela de impressão — permita pop-ups para esta página.'); return; }
  w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Edital de Abertura</title><style>'
    +'@page{margin:2.5cm 2cm;} body{font-family:Calibri,"Carlito",Arial,sans-serif;font-size:11pt;line-height:1.35;color:#000;}'
    +'a{color:#000;text-decoration:underline;}'
    +'</style></head><body>'+htmlComEstilosInline()+'</body></html>');
  w.document.close();
  w.focus();
  setTimeout(()=>{ w.print(); },300);
}

function alternarEdicao(){
  const el=$('edSaida'), btn=$('edBtnEditar');
  const ligado = el.getAttribute('contenteditable')==='true';
  el.setAttribute('contenteditable', ligado?'false':'true');
  btn.textContent = ligado?'Editar texto':'Concluir edição';
  el.classList.toggle('ed-editando', !ligado);
  if(!ligado) el.focus();
}

/* ============================== FLUXO ============================== */
let dadosLidos=null;
async function lerFormulario(){
  const file=$('edPdfFile').files && $('edPdfFile').files[0];
  const colado=$('edTextoColado').value.trim();
  const avisos=[];
  let texto='';
  try{
    if(file){ $('edBtnLer').disabled=true; $('edBtnLer').textContent='Lendo PDF...'; texto=await pdfParaTexto(file); }
    else if(colado){ texto=colado; }
    else { alert('Envie o PDF do formulário ou cole o texto dele no campo alternativo.'); return; }
  }catch(e){
    alert('Não foi possível ler o PDF ('+e.message+').\nSe o arquivo for uma digitalização (imagem), copie o texto do formulário e cole no campo alternativo.');
    return;
  }finally{ $('edBtnLer').disabled=false; $('edBtnLer').textContent='Ler formulário e conferir'; }
  if(texto.replace(/\s+/g,'').length<80){
    avisos.push('O PDF quase não contém texto extraível (pode ser digitalização/imagem). Confira todos os campos ou cole o texto manualmente.');
  }
  dadosLidos=parseFormulario(texto);
  const naoLidos=LABELS.filter(([k])=>dadosLidos[k]===null).map(([k,r])=>r[0]);
  if(naoLidos.length) avisos.push('Perguntas não localizadas no arquivo: '+naoLidos.join('; ')+'.');
  aplicarDados(dadosLidos, avisos);
  renderConfirma(avisos);
  $('edEtapa2').scrollIntoView({behavior:'smooth'});
}

function gerar(){
  $('edSaida').innerHTML=gerarEditalHTML();
  $('edEtapa3').style.display='block';
  $('edEtapa3').scrollIntoView({behavior:'smooth'});
}

document.addEventListener('DOMContentLoaded',()=>{
  $('edFileBtn').addEventListener('click',()=>$('edPdfFile').click());
  $('edPdfFile').addEventListener('change',()=>{
    $('edFileName').textContent = $('edPdfFile').files[0] ? $('edPdfFile').files[0].name : 'Nenhum arquivo selecionado';
  });
  $('edBtnLer').addEventListener('click',lerFormulario);
  $('edBtnGerar').addEventListener('click',gerar);
  $('edBtnCopiar').addEventListener('click',copiarTudo);
  $('edBtnPDF').addEventListener('click',baixarPDF);
  $('edBtnEditar').addEventListener('click',alternarEdicao);
  $('edBtnColar').addEventListener('click',()=>{
    const area=$('edColarWrap');
    area.style.display = area.style.display==='none' ? 'block' : 'none';
  });
  if(!values.DATA_ASSINATURA) values.DATA_ASSINATURA=hojeExtenso();
});

/* hook para testes/depuração */
if (typeof window!=='undefined') window.__ED_TEST__={parseFormulario, aplicarDados, gerarEditalHTML, sugestaoComposicao, axes, values};
})();
