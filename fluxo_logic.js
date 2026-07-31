/* Editor do Fluxo do Processo Seletivo — TJPR
   Fluxo concebido por João Pedro de Paula Soares Valente, Chefe da Divisão;
   aqui adaptado ao portal de ferramentas da DSERFTA.

   Diferente das demais ferramentas do portal, esta não gera um documento a
   partir de arquivos enviados: ela É o documento. O quadro fica gravado numa
   linha única do Supabase e é compartilhado por toda a equipe — quem abre a
   página vê a última versão salva por qualquer pessoa.

   Estrutura do arquivo:
     A) utilidades
     B) fases sugeridas e quadro semente
     C) gravação: nuvem (Supabase) e cópia local
     D) desenho da grade
     E) edição: campos, acrescentar, excluir, mover
     F) arrastar e soltar
     G) cópia de segurança (baixar e restaurar)
     H) PDF
     I) ligação com a página
*/

(function(){
'use strict';

/* ========================= A) utilidades ========================= */

function $(id){ return document.getElementById(id); }

/* Esta página não carrega o core.js (não usa nada de lá além do escape), então
   traz as duas versões de que precisa: uma para texto e outra para valor de
   atributo, que também precisa neutralizar aspas. */
function esc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(s){
  return esc(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function limpar(v){ return String(v==null?'':v).trim(); }

// O <input type="color"> só aceita #rrggbb; qualquer outra coisa o zera em
// silêncio e a fase perderia a cor ao ser redesenhada.
function corValida(v, padrao){
  const m = /^#?([0-9a-fA-F]{6})$/.exec(limpar(v));
  return m ? ('#' + m[1].toLowerCase()) : padrao;
}

/* ============ B) fases sugeridas e quadro semente ============ */

// Fase -> cor sugerida. Digitar (ou escolher) uma destas fases já pinta a
// linha; qualquer outro nome é aceito e mantém a cor que estiver no seletor.
const CORES_POR_FASE = {
  'Triagem inicial':                        '#5b6573',
  'Validação inicial':                      '#1f4e78',
  'Preparação da minuta':                   '#5b9bd5',
  'Publicação e configuração':              '#2f75b5',
  'Inscrições e prova':                     '#c69214',
  'Entrevistas e resultado':                '#8064a2',
  'Cadastro e aproveitamento':              '#70ad47',
  'Retificações, assinaturas e exceções':   '#c0504d'
};

const CLASSIFICACOES = ['Ponto', 'Tag', 'Vinculação'];
const COR_PADRAO = '#5b6573';

/* Quadro exibido quando não há nada gravado — nem na nuvem, nem neste
   navegador. Serve de ponto de partida para uma instalação nova; no uso
   normal ele nunca aparece, porque a nuvem responde primeiro. */
const QUADRO_SEMENTE = [
  { phase:'Triagem',                   color:'#0080c0', activity:'Triagem dos processos', owners:'Vini', stage:'-1', classifications:[] },
  { phase:'Validação inicial',         color:'#1f4e78', activity:'Tag e ponto de controle - análise de abertura do processo seletivo', owners:'Sandra, Kátia', stage:'00', classifications:['Ponto','Tag'] },
  { phase:'Preparação da minuta',      color:'#5b9bd5', activity:'Redigir minuta do Edital de Abertura', owners:'Ana', stage:'01', classifications:['Ponto','Tag'] },
  { phase:'Preparação da minuta',      color:'#5b9bd5', activity:'Edição da Minuta no Athos', owners:'Kátia', stage:'01', classifications:['Ponto','Tag'] },
  { phase:'Preparação da minuta',      color:'#5b9bd5', activity:'Encaminhar minuta para aprovação da unidade', owners:'Kátia', stage:'02', classifications:['Tag'] },
  { phase:'Retificações',              color:'#c0504d', activity:'Retificações no Edital de Abertura: periodicidade, prazo de inscrições, cursos...', owners:'Ana e João', stage:'S/N', classifications:['Tag','Vinculação'] },
  { phase:'Publicação e configuração', color:'#2f75b5', activity:'Ajustar e publicar o Edital de Abertura', owners:'Ana', stage:'08', classifications:['Ponto','Tag'] },
  { phase:'Inscrições e prova',        color:'#c69214', activity:'Configurar aplicação na Fábrica;Cadastrar servidor responsável pelas questões da prova;Criar link de inscrições na Fábrica e publicar no portal do TJ.', owners:'Mário', stage:'09', classifications:['Ponto','Vinculação'] },
  { phase:'Inscrições e prova',        color:'#c69214', activity:'Aguardar o término das inscrições', owners:'Vini', stage:'12', classifications:['Ponto','Vinculação'] },
  { phase:'Inscrições e prova',        color:'#c69214', activity:'Elaborar relatório de candidatos inscritos', owners:'Vini, Mi', stage:'13', classifications:['Ponto','Vinculação'] },
  { phase:'Prova',                     color:'#000000', activity:'Criar aplicação presencial ou online e publicar Edital de Ensalamento', owners:'Ray', stage:'14', classifications:['Ponto','Tag'] },
  { phase:'Prova',                     color:'#000000', activity:'Encaminhar e-mails aos candidatos', owners:'Mário', stage:'15', classifications:['Ponto','Vinculação'] },
  { phase:'Entrevistas e resultado',   color:'#8064a2', activity:'Convocar candidatos para entrevistas', owners:'Amanda', stage:'18', classifications:['Ponto','Tag','Vinculação'] },
  { phase:'Classificação Final',       color:'#8064a2', activity:'Redigir Edital de Classificação Final', owners:'Igor, Paty', stage:'21', classifications:['Ponto','Tag','Vinculação'] },
  { phase:'Cadastro e aproveitamento', color:'#70ad47', activity:'Cadastrar lista classificação final no Hércules', owners:'Amanda, Ray, Vini', stage:'26', classifications:['Ponto','Vinculação'] },
  { phase:'Cadastro e aproveitamento', color:'#70ad47', activity:'Cadastrar unidades com interesse em aproveitar processos seletivos instituídos por unidades distintas.', owners:'Kalleb', stage:'27', classifications:['Tag','Vinculação'] },
  { phase:'Assinaturas e exceções',    color:'#c45c5a', activity:'Pepinos, informações para o Heitor, assinatura dos blocos', owners:'João', stage:'--', classifications:['Vinculação'] }
];

/* ============ C) gravação: nuvem e cópia local ============ */

/* Endereço, chave, tabela, linha e formato do estado são EXATAMENTE os da
   versão original da ferramenta — é o que garante que o quadro já salvo
   continue sendo lido e gravado no mesmo lugar, sem migração.

   A chave é publicável (a proteção fica nas policies de RLS da tabela) e o
   acesso é feito pela API REST do próprio Supabase, com fetch: a página não
   carrega script de origem externa, como manda o core.css. */
const SUPABASE_URL = 'https://xmuduqgwwplrtnfbfgtf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_O3f7DXw4K3DYf34k3QaF6w_ZJgpwExw';
const TABELA_NUVEM = 'fluxo_estado';
const LINHA_NUVEM  = 'estado';
const CHAVE_LOCAL  = 'tjpr_fluxo_processo_seletivo_v4_fase_editavel';
const VERSAO_ESTADO = 4;

function cabecalhosNuvem(extra){
  return Object.assign({
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY
  }, extra || {});
}

async function lerDaNuvem(){
  const url = SUPABASE_URL + '/rest/v1/' + TABELA_NUVEM
    + '?select=data&id=eq.' + encodeURIComponent(LINHA_NUVEM) + '&limit=1';
  const r = await fetch(url, { headers: cabecalhosNuvem({ 'Accept':'application/json' }) });
  if(!r.ok) throw new Error('HTTP ' + r.status);
  const linhas = await r.json();
  return (linhas && linhas[0] && linhas[0].data) || null;
}

// Grava por upsert na chave primária (id) — mesma operação que o SDK fazia.
async function gravarNaNuvem(estado){
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + TABELA_NUVEM, {
    method:'POST',
    headers: cabecalhosNuvem({
      'Content-Type':'application/json',
      'Prefer':'resolution=merge-duplicates,return=minimal'
    }),
    body: JSON.stringify([{ id:LINHA_NUVEM, data:estado, updated_at:new Date().toISOString() }])
  });
  if(!r.ok){
    const detalhe = await r.text().catch(()=>'');
    throw new Error('HTTP ' + r.status + (detalhe ? ' — ' + detalhe.slice(0,140) : ''));
  }
  return true;
}

/* Formato gravado — NÃO alterar os nomes dos campos: é o contrato do que já
   está salvo. Por isso o estado interno usa as mesmas chaves em inglês do
   original, em vez de traduzir e ter de mapear nos dois sentidos. */
function normalizarLinha(bruta){
  const o = bruta || {};
  const fase = limpar(o.phase) || 'Triagem inicial';
  return {
    phase: fase,
    color: corValida(o.color, CORES_POR_FASE[fase] || COR_PADRAO),
    activity: String(o.activity == null ? '' : o.activity),
    owners: String(o.owners == null ? '' : o.owners),
    stage: String(o.stage == null ? '' : o.stage),
    // só valores conhecidos entram: um rótulo estranho vindo de uma cópia
    // antiga viraria uma marca invisível, impossível de desmarcar na tela
    classifications: Array.isArray(o.classifications)
      ? CLASSIFICACOES.filter(c => o.classifications.indexOf(c) >= 0)
      : []
  };
}

function lerEstado(bruto){
  if(!bruto || !Array.isArray(bruto.rows) || !bruto.rows.length) return null;
  return bruto.rows.map(normalizarLinha);
}

function montarEstado(linhas){
  return {
    version: VERSAO_ESTADO,
    savedAt: new Date().toISOString(),
    rows: linhas.map(l => ({
      phase: l.phase, color: l.color, activity: l.activity,
      owners: l.owners, stage: l.stage, classifications: l.classifications.slice()
    }))
  };
}

/* ============ estado da página ============ */

const estado = {
  linhas: [],
  excluidas: [],   // pilha para "Desfazer exclusão"
  tocado: false,   // a pessoa já editou algo nesta sessão?
  seq: 0
};

function novoId(){ return ++estado.seq; }
function comId(linha){ linha._id = novoId(); return linha; }
function indicePorId(id){
  for(let i=0;i<estado.linhas.length;i++){ if(estado.linhas[i]._id === id) return i; }
  return -1;
}

let temporizadorGravacao = null;
let temporizadorAviso = null;

function avisar(texto, tipo){
  const caixa = $('fxAviso');
  if(!caixa) return;
  caixa.textContent = texto;
  caixa.className = 'fluxo-aviso aparece' + (tipo ? ' ' + tipo : '');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(()=> caixa.classList.remove('aparece'), 3400);
}

// Nota da caixa de cópia de segurança: diz em que pé está a gravação, que é o
// que decide se vale a pena baixar uma cópia agora.
function anotarNaCaixa(texto){
  const nota = $('fxCaixaNota');
  if(nota) nota.textContent = texto;
}

function guardarCopiaLocal(pacote){
  try{ localStorage.setItem(CHAVE_LOCAL, JSON.stringify(pacote)); }catch(e){}
}

async function gravar(avisarSucesso){
  const pacote = montarEstado(estado.linhas);
  guardarCopiaLocal(pacote);          // cópia local primeiro: vale mesmo se a rede cair
  const hora = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
  try{
    await gravarNaNuvem(pacote);
    anotarNaCaixa('salvo para todos às ' + hora);
    if(avisarSucesso) avisar('Alterações salvas para todos às ' + hora + '.');
    return true;
  }catch(erro){
    console.error('Falha ao gravar o fluxo na nuvem:', erro);
    anotarNaCaixa('às ' + hora + ' a nuvem falhou — só há cópia local');
    avisar('Não foi possível salvar na nuvem. As alterações ficaram só neste navegador.', 'erro');
    return false;
  }
}

function agendarGravacao(){
  estado.tocado = true;
  clearTimeout(temporizadorGravacao);
  temporizadorGravacao = setTimeout(()=> gravar(false), 1000);
}

/* ============ D) desenho da grade ============ */

function campoTexto(classe, campo, valor, extra){
  return '<textarea class="fluxo-campo' + (classe ? ' ' + classe : '') + '"'
    + ' data-campo="' + escAttr(campo) + '" rows="1"'
    + (extra || '') + '>' + esc(valor) + '</textarea>';
}

/* O nome da fase é um <textarea>, e não um <input>: nomes como "Retificações,
   assinaturas e exceções" não cabem numa linha e ficavam cortados no meio.
   Digitar o nome exato de uma das fases padronizadas continua aplicando a cor
   dela (ver ligarEventosDaGrade). */
function celulaFase(linha){
  return '<td class="fluxo-fase" style="--fase:' + escAttr(linha.color) + ';">'
    + '<div class="fluxo-fase-linha">'
    + '<input type="color" class="fluxo-cor" value="' + escAttr(linha.color) + '"'
    + ' title="Alterar a cor desta fase" aria-label="Cor da fase">'
    + '<textarea class="fluxo-fase-nome" rows="1" data-campo="phase"'
    + ' placeholder="Digite a fase" title="Nome da fase — texto livre"'
    + ' aria-label="Nome da fase">' + esc(linha.phase) + '</textarea>'
    + '</div></td>';
}

function celulaClassificacao(linha){
  let h = '<td>';
  CLASSIFICACOES.forEach(c=>{
    const marcado = linha.classifications.indexOf(c) >= 0;
    h += '<label class="fluxo-classe">'
      + '<input type="checkbox" class="fluxo-check" value="' + escAttr(c) + '"'
      + (marcado ? ' checked' : '') + '>'
      + '<span>' + esc(c) + '</span></label>';
  });
  return h + '</td>';
}

function celulaAcoes(linha, i, total){
  return '<td><div class="fluxo-acoes">'
    + '<button type="button" class="drag-handle" data-id="' + linha._id + '" tabindex="0"'
    + ' title="Arraste para mudar a posição (ou Alt+↑ / Alt+↓)"'
    + ' aria-label="Remanejar a etapa ' + escAttr(linha.activity || 'sem descrição') + '">⠿</button>'
    + '<button type="button" class="fluxo-mover" data-passo="-1" title="Mover para cima"'
    + ' aria-label="Mover para cima"' + (i === 0 ? ' disabled' : '') + '>↑</button>'
    + '<button type="button" class="fluxo-mover" data-passo="1" title="Mover para baixo"'
    + ' aria-label="Mover para baixo"' + (i === total-1 ? ' disabled' : '') + '>↓</button>'
    + '<button type="button" class="row-del-btn" title="Excluir esta etapa"'
    + ' aria-label="Excluir a etapa">✕</button>'
    + '</div></td>';
}

function desenhar(){
  const corpo = $('fxCorpo');
  const total = estado.linhas.length;

  if(!total){
    corpo.innerHTML = '<tr><td colspan="6"><p class="empty-hint" style="text-align:center;">'
      + 'Nenhuma etapa no quadro. Use “Adicionar etapa” para começar.</p></td></tr>';
  } else {
    corpo.innerHTML = estado.linhas.map((linha,i)=>
      '<tr data-id="' + linha._id + '" draggable="false">'
      + celulaFase(linha)
      + '<td>' + campoTexto('', 'activity', linha.activity) + '</td>'
      + '<td>' + campoTexto('', 'owners', linha.owners) + '</td>'
      + '<td>' + campoTexto('centro', 'stage', linha.stage) + '</td>'
      + celulaClassificacao(linha)
      + celulaAcoes(linha, i, total)
      + '</tr>'
    ).join('');
  }

  $('fxContagem').textContent = total + (total === 1 ? ' etapa no fluxo.' : ' etapas no fluxo.');
  $('fxDesfazer').disabled = estado.excluidas.length === 0;

  ligarEventosDaGrade();
  ajustarTodasAsAlturas();   // agora, para não haver salto visível
  agendarAjusteDeAlturas();  // e de novo com a tabela já montada
}

/* Os campos crescem com o texto: a atividade pode ter uma linha ou cinco, e uma
   barra de rolagem dentro da célula esconderia justamente o que se quer ler.
   Zeramos a altura antes de medir, e não usamos 'auto', que dentro de uma
   célula de tabela pode ser resolvido como a altura da própria célula. */
function ajustarAltura(campo){
  campo.style.height = '0px';
  campo.style.height = (campo.scrollHeight + 2) + 'px';
}

/* Quantas linhas o texto ocupa depende da largura final da coluna, e essa
   largura só existe depois de o navegador montar a tabela. Medir junto com o
   desenho pegava uma coluna ainda estreita: o texto "quebrava" em muitas
   linhas e a altura travava grande — era o que esticava o campo da fase até o
   pé da linha. Por isso medimos de novo no quadro seguinte, já com a tabela
   montada, e a cada redimensionamento da janela, porque a tabela é fluida e as
   colunas mudam de largura junto com ela. */
function ajustarTodasAsAlturas(){
  const corpo = $('fxCorpo');
  if(!corpo) return;
  Array.prototype.forEach.call(
    corpo.querySelectorAll('.fluxo-campo, .fluxo-fase-nome'), ajustarAltura);
}

function agendarAjusteDeAlturas(){
  if(typeof requestAnimationFrame === 'function') requestAnimationFrame(ajustarTodasAsAlturas);
  else ajustarTodasAsAlturas();
}

/* ============ E) edição ============ */

function linhaDoElemento(el){
  const tr = el.closest('tr[data-id]');
  if(!tr) return null;
  const i = indicePorId(Number(tr.dataset.id));
  return i < 0 ? null : estado.linhas[i];
}

function ligarEventosDaGrade(){
  const corpo = $('fxCorpo');

  /* A grade NÃO é redesenhada a cada tecla: só o objeto da linha é atualizado.
     Redesenhar tiraria o cursor do campo no meio da digitação. Só mudanças de
     estrutura (mover, excluir, acrescentar) redesenham. */
  Array.prototype.forEach.call(corpo.querySelectorAll('.fluxo-campo'), function(campo){
    campo.addEventListener('input', function(){
      const linha = linhaDoElemento(campo);
      if(!linha) return;
      linha[campo.dataset.campo] = campo.value;
      ajustarAltura(campo);
      agendarGravacao();
    });
  });

  Array.prototype.forEach.call(corpo.querySelectorAll('.fluxo-fase-nome'), function(campo){
    const aplicarCorSugerida = function(){
      const linha = linhaDoElemento(campo);
      if(!linha) return;
      linha.phase = campo.value;
      ajustarAltura(campo);
      const sugerida = CORES_POR_FASE[limpar(campo.value)];
      // a cor só é trocada quando o nome bate com uma fase conhecida; uma cor
      // escolhida à mão nunca é sobrescrita por causa de um nome novo
      if(sugerida){ linha.color = sugerida; pintarFase(campo, linha); }
      agendarGravacao();
    };
    campo.addEventListener('input', aplicarCorSugerida);
    campo.addEventListener('change', aplicarCorSugerida);
  });

  Array.prototype.forEach.call(corpo.querySelectorAll('.fluxo-cor'), function(seletor){
    seletor.addEventListener('input', function(){
      const linha = linhaDoElemento(seletor);
      if(!linha) return;
      linha.color = corValida(seletor.value, COR_PADRAO);
      pintarFase(seletor, linha);
      agendarGravacao();
    });
  });

  Array.prototype.forEach.call(corpo.querySelectorAll('.fluxo-check'), function(caixa){
    caixa.addEventListener('change', function(){
      const linha = linhaDoElemento(caixa);
      if(!linha) return;
      const marcadas = new Set(linha.classifications);
      if(caixa.checked) marcadas.add(caixa.value); else marcadas.delete(caixa.value);
      // reordena pela ordem canônica, para o gravado não depender de em que
      // sequência as caixas foram clicadas
      linha.classifications = CLASSIFICACOES.filter(c => marcadas.has(c));
      agendarGravacao();
    });
  });

  Array.prototype.forEach.call(corpo.querySelectorAll('.fluxo-mover'), function(botao){
    botao.addEventListener('click', function(){
      const tr = botao.closest('tr[data-id]');
      if(tr) mover(Number(tr.dataset.id), Number(botao.dataset.passo));
    });
  });

  Array.prototype.forEach.call(corpo.querySelectorAll('.row-del-btn'), function(botao){
    botao.addEventListener('click', function(){
      const tr = botao.closest('tr[data-id]');
      if(tr) excluir(Number(tr.dataset.id));
    });
  });

  ligarArrastarSoltar(corpo);
}

// Repinta a célula da fase sem redesenhar a grade (o foco fica onde estava).
function pintarFase(elementoDaCelula, linha){
  const td = elementoDaCelula.closest('.fluxo-fase');
  if(!td) return;
  td.style.setProperty('--fase', linha.color);
  const seletor = td.querySelector('.fluxo-cor');
  if(seletor && seletor.value !== linha.color) seletor.value = linha.color;
}

function acrescentar(){
  const nova = comId(normalizarLinha({ phase:'Triagem inicial', activity:'', owners:'', stage:'--' }));
  estado.linhas.push(nova);
  desenhar();
  agendarGravacao();
  const tr = $('fxCorpo').querySelector('tr[data-id="' + nova._id + '"]');
  const alvo = tr && tr.querySelector('.fluxo-campo[data-campo="activity"]');
  if(alvo) alvo.focus();
}

function excluir(id){
  const i = indicePorId(id);
  if(i < 0) return;
  // guarda a posição junto com o conteúdo: desfazer devolve a etapa ao lugar
  // de onde ela saiu, e não ao fim da lista
  estado.excluidas.push({ linha: estado.linhas[i], indice: i });
  estado.linhas.splice(i, 1);
  desenhar();
  agendarGravacao();
}

function desfazerExclusao(){
  const item = estado.excluidas.pop();
  if(!item) return;
  const destino = Math.max(0, Math.min(item.indice, estado.linhas.length));
  estado.linhas.splice(destino, 0, item.linha);
  desenhar();
  agendarGravacao();
}

function mover(id, passo){
  const i = indicePorId(id);
  if(i < 0) return;
  const j = i + passo;
  if(j < 0 || j >= estado.linhas.length) return;
  const linha = estado.linhas[i];
  estado.linhas.splice(i, 1);
  estado.linhas.splice(j, 0, linha);
  desenhar();
  agendarGravacao();
  const alca = $('fxCorpo').querySelector('.drag-handle[data-id="' + id + '"]');
  if(alca) alca.focus();
}

/* ============ F) arrastar e soltar ============

   Mesmo comportamento das demais grades do portal: o <tr> só vira "draggable"
   enquanto o ponteiro está sobre a alça. Sem isso, arrastar para selecionar o
   texto de um campo começaria um arraste de linha por engano. */
function ligarArrastarSoltar(corpo){
  let origemId = null;

  function limparMarcas(manterArrastada){
    Array.prototype.forEach.call(corpo.querySelectorAll('tr'), function(tr){
      tr.classList.remove('drop-before','drop-after');
      if(!manterArrastada) tr.classList.remove('row-dragging');
    });
  }

  Array.prototype.forEach.call(corpo.querySelectorAll('.drag-handle'), function(alca){
    const tr = alca.closest('tr');
    alca.addEventListener('mousedown', function(){ tr.setAttribute('draggable','true'); });
    alca.addEventListener('mouseup',   function(){ tr.setAttribute('draggable','false'); });
    alca.addEventListener('keydown', function(ev){
      if(!ev.altKey || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
      ev.preventDefault();
      mover(Number(alca.dataset.id), ev.key === 'ArrowUp' ? -1 : 1);
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
      if(origemId === null) return;
      ev.preventDefault();
      try{ ev.dataTransfer.dropEffect = 'move'; }catch(e){}
      limparMarcas(true);
      const r = tr.getBoundingClientRect();
      tr.classList.add(((ev.clientY - r.top) > r.height/2) ? 'drop-after' : 'drop-before');
    });
    tr.addEventListener('drop', function(ev){
      ev.preventDefault();
      if(origemId === null) return;
      const de = indicePorId(origemId);
      const alvo = indicePorId(Number(tr.dataset.id));
      origemId = null;
      limparMarcas();
      if(de < 0 || alvo < 0) return;
      const r = tr.getBoundingClientRect();
      const depois = (ev.clientY - r.top) > r.height/2;
      soltarEm(de, alvo + (depois ? 1 : 0));
    });
  });
}

// Move a linha de `de` para `destino` (índice medido ANTES da remoção).
function soltarEm(de, destino){
  const linha = estado.linhas[de];
  if(!linha) return;
  if(de < destino) destino--;
  estado.linhas.splice(de, 1);
  destino = Math.max(0, Math.min(destino, estado.linhas.length));
  estado.linhas.splice(destino, 0, linha);
  desenhar();
  agendarGravacao();
}

/* ============ G) cópia de segurança ============ */

function baixarArquivo(conteudo, nome, tipo){
  const url = URL.createObjectURL(new Blob([conteudo], {type:tipo}));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=> URL.revokeObjectURL(url), 1500);
}

function baixarCopia(){
  const pacote = montarEstado(estado.linhas);
  guardarCopiaLocal(pacote);
  const data = new Date().toISOString().slice(0,10);
  baixarArquivo(JSON.stringify(pacote, null, 2),
    'fluxo_processo_seletivo_' + data + '.json',
    'application/json;charset=utf-8');
  anotarNaCaixa('cópia baixada com ' + estado.linhas.length + ' etapa(s)');
  avisar('Cópia baixada com o fluxo atual (' + estado.linhas.length + ' etapas).');
}

function restaurarCopia(arquivo){
  const leitor = new FileReader();
  leitor.onload = function(){
    let linhas = null;
    try{ linhas = lerEstado(JSON.parse(String(leitor.result))); }
    catch(e){ linhas = null; }
    if(!linhas){
      avisar('Este arquivo não é uma cópia válida do fluxo. Nada foi alterado.', 'erro');
      return;
    }
    // restaurar substitui o quadro de todo mundo: a confirmação é obrigatória,
    // e sai daqui dizendo o tamanho dos dois lados para a escolha ser informada
    const ok = window.confirm(
      'Restaurar a cópia substitui o fluxo atual para todas as pessoas.\n\n'
      + 'Agora: ' + estado.linhas.length + ' etapa(s).\n'
      + 'Na cópia: ' + linhas.length + ' etapa(s).\n\n'
      + 'Deseja continuar?');
    if(!ok){ avisar('Restauração cancelada. Nada foi alterado.'); return; }

    estado.linhas = linhas.map(comId);
    estado.excluidas = [];
    desenhar();
    gravar(true);
  };
  leitor.onerror = function(){ avisar('Não foi possível ler o arquivo escolhido.', 'erro'); };
  leitor.readAsText(arquivo, 'utf-8');
}

/* ============ H) PDF ============ */

function documentoImpresso(){
  const gerado = new Date().toLocaleString('pt-BR');
  const linhas = estado.linhas.map(l=>{
    const classes = l.classifications.length ? l.classifications.join(' • ') : '—';
    return '<tr>'
      + '<td class="fase" style="background:' + escAttr(l.color) + ';">' + esc(l.phase) + '</td>'
      + '<td>' + esc(l.activity) + '</td>'
      + '<td class="forte">' + esc(l.owners) + '</td>'
      + '<td class="forte meio">' + esc(l.stage) + '</td>'
      + '<td class="classe">' + esc(classes) + '</td>'
      + '</tr>';
  }).join('');

  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">'
    + '<title>Fluxo do Processo Seletivo</title><style>'
    + '@page{size:A4 landscape;margin:12mm;}'
    // sem isto o navegador "economiza tinta" e descarta os fundos das fases,
    // que são justamente o que dá leitura ao fluxo
    + '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
    + "body{margin:0;font-family:'Barlow',system-ui,Arial,sans-serif;color:#14232a;}"
    + 'h1{margin:0 0 3px;font-size:19px;color:#002a3a;letter-spacing:0.01em;}'
    + '.faixa{height:5px;margin:0 0 10px;background:linear-gradient(90deg,#002a3a 0 20%,#008c95 20% 40%,#49c5b1 40% 60%,#eeb134 60% 80%,#eb553b 80% 100%);}'
    + '.meta{margin:0 0 12px;font-size:10px;color:#4d5e64;}'
    + 'table{width:100%;border-collapse:collapse;table-layout:fixed;}'
    + 'th{background:#002a3a;color:#fff;padding:7px;font-size:10px;text-align:left;letter-spacing:0.03em;}'
    + 'td{border:1px solid #c7d2d5;padding:6px;font-size:9.5px;vertical-align:top;overflow-wrap:anywhere;line-height:1.4;}'
    + 'tr{page-break-inside:avoid;}'
    + 'th:nth-child(1),td:nth-child(1){width:20%;} th:nth-child(2),td:nth-child(2){width:34%;}'
    + 'th:nth-child(3),td:nth-child(3){width:15%;} th:nth-child(4),td:nth-child(4){width:7%;}'
    + 'th:nth-child(5),td:nth-child(5){width:18%;}'
    // letra branca na fase, como na tela — a cor de fundo vem inline por linha
    + 'td.fase{font-weight:700;color:#ffffff;} td.forte{font-weight:600;} td.meio{text-align:center;}'
    + 'td.classe{font-weight:600;color:#002a3a;}'
    + 'footer{margin-top:12px;font-size:8.5px;color:#4d5e64;}'
    + '</style></head><body>'
    + '<div class="faixa"></div>'
    + '<h1>Fluxo do Processo Seletivo</h1>'
    + '<p class="meta">Tribunal de Justiça do Estado do Paraná — SG-SGP-CDHO-DSERFTA · versão gerada em ' + esc(gerado) + '.</p>'
    + '<table><thead><tr><th>Fase</th><th>Atividade</th><th>Responsável(is)</th><th>Etapa</th><th>Classificação</th></tr></thead>'
    + '<tbody>' + linhas + '</tbody></table>'
    + '<footer>Fluxo elaborado por João Pedro de Paula Soares Valente, Chefe da Divisão.</footer>'
    + '</body></html>';
}

function salvarPdf(){
  gravar(false);
  const janela = window.open('', '_blank');
  if(!janela){
    avisar('O navegador bloqueou a janela de impressão. Permita pop-ups para esta página e tente de novo.', 'erro');
    return;
  }
  janela.document.write(documentoImpresso());
  janela.document.close();
  janela.focus();
  setTimeout(function(){ janela.print(); }, 350);
}

/* ============ I) ligação com a página ============ */

// Caixa flutuante de cópia de segurança — mesmo comportamento da caixa de
// rascunho do Ponto 18: recolhe para uma aba estreita quando atrapalha.
function ligarCaixaFlutuante(){
  const caixa = $('fxCaixa'), botao = $('fxCaixaToggle');
  if(!caixa || !botao) return;
  botao.addEventListener('click', function(){
    const recolhida = caixa.classList.toggle('collapsed');
    botao.textContent = recolhida ? '+' : '–';
    botao.title = recolhida ? 'Abrir' : 'Recolher';
    botao.setAttribute('aria-expanded', recolhida ? 'false' : 'true');
  });
}

async function carregar(){
  // 1) mostra imediatamente o que houver localmente — a página fica utilizável
  //    mesmo antes de a nuvem responder (ou se ela nunca responder)
  let inicial = null;
  try{
    const bruto = localStorage.getItem(CHAVE_LOCAL);
    if(bruto) inicial = lerEstado(JSON.parse(bruto));
  }catch(e){}
  estado.linhas = (inicial || QUADRO_SEMENTE.map(normalizarLinha)).map(comId);
  desenhar();

  // 2) busca a versão da nuvem, que é a boa
  try{
    const daNuvem = lerEstado(await lerDaNuvem());
    if(!daNuvem){
      avisar('Ainda não há um fluxo salvo na nuvem — o que você editar aqui será o primeiro.');
      return;
    }
    if(estado.tocado){
      // a resposta demorou e a pessoa já começou a mexer: sobrescrever seria
      // apagar o que ela acabou de digitar, então preferimos avisar
      avisar('Há uma versão mais recente na nuvem, mas você já começou a editar. Recarregue a página para vê-la (perdendo o que digitou agora).', 'erro');
      return;
    }
    estado.linhas = daNuvem.map(comId);
    estado.excluidas = [];
    desenhar();
    avisar('Versão mais recente carregada da nuvem.');
  }catch(erro){
    console.error('Falha ao carregar o fluxo da nuvem:', erro);
    avisar(inicial
      ? 'Sem conexão com a nuvem — mostrando a última cópia deste navegador.'
      : 'Sem conexão com a nuvem — mostrando o fluxo padrão. Não salve por cima antes de conferir.', 'erro');
  }
}

document.addEventListener('DOMContentLoaded', function(){
  if(!$('fxCorpo')) return;

  ligarCaixaFlutuante();

  $('fxAdicionar').addEventListener('click', acrescentar);
  $('fxDesfazer').addEventListener('click', desfazerExclusao);
  $('fxSalvar').addEventListener('click', function(){ gravar(true); });
  $('fxBaixarCopia').addEventListener('click', baixarCopia);
  $('fxPdf').addEventListener('click', salvarPdf);

  // a tabela ocupa a largura da janela: mudou a janela, mudaram as colunas e
  // com elas a quantidade de linhas que cada texto ocupa
  let temporizadorLargura = null;
  window.addEventListener('resize', function(){
    clearTimeout(temporizadorLargura);
    temporizadorLargura = setTimeout(ajustarTodasAsAlturas, 150);
  });

  const arquivo = $('fxArquivoCopia');
  $('fxRestaurar').addEventListener('click', function(){ arquivo.click(); });
  arquivo.addEventListener('change', function(){
    const f = arquivo.files && arquivo.files[0];
    // limpa o campo para que escolher o MESMO arquivo de novo torne a disparar
    arquivo.value = '';
    if(f) restaurarCopia(f);
  });

  carregar();
});

/* Exposto para depuração e para os testes automatizados. */
window.Fluxo = {
  estado, corValida, normalizarLinha, lerEstado, montarEstado,
  soltarEm, mover, excluir, desfazerExclusao, acrescentar, desenhar,
  documentoImpresso, restaurarCopia, gravar, carregar, lerDaNuvem, gravarNaNuvem,
  CLASSIFICACOES, CORES_POR_FASE, QUADRO_SEMENTE, CHAVE_LOCAL, VERSAO_ESTADO
};

})();
