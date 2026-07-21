/* Registro único de todas as seções e ferramentas do portal.
   Alterar título/eyebrow/rótulo/seção AQUI reflete automaticamente no menu,
   no índice e no cabeçalho (h1) de cada página — não é preciso editar os HTMLs.

   PARA ADICIONAR UMA FERRAMENTA NOVA:
   1. criar o arquivo .html da ferramenta na mesma pasta;
   2. acrescentar um objeto na lista FERRAMENTAS abaixo, informando `secao`
      ("sps" ou "residencia") e `ordem` (ou `ponto`, no caso da SPS);
   3. pronto — o menu suspenso e o cartão do índice aparecem sozinhos, na
      posição correta.

   PARA ADICIONAR UMA SEÇÃO NOVA: acrescentar um objeto em SECOES. */

const SECOES=[
  {
    id:"sps",
    ordem:0,
    rotulo:"Processo Seletivo",          // texto do item principal do menu
    emoji:"🗂️",
    cor:"--teal",
    eyebrow:"Seção de Processo Seletivo",
    titulo:"Ferramentas do Processo Seletivo",
    descricao:"Apoio operacional ao processo seletivo de estágio: elaboração de editais, cruzamento de listas da Fábrica de Provas e preparo de dados para o Hércules.",
    sufixoTitulo:" — Seção de Processo Seletivo (TJPR)",
    emBreve:"Novas ferramentas do processo seletivo aparecerão aqui conforme forem desenvolvidas."
  },
  {
    id:"residencia",
    ordem:1,
    rotulo:"Residência",
    emoji:"⚖️",
    cor:"--gold",
    eyebrow:"Divisão de Residência",
    titulo:"Ferramentas da Residência",
    descricao:"Apoio operacional à residência jurídica: leitura dos PDFs e relatórios da Fábrica de Provas para gerar editais prontos para copiar ou baixar.",
    sufixoTitulo:" — Divisão de Residência (TJPR)",
    emBreve:"Novas ferramentas da residência aparecerão aqui conforme forem desenvolvidas."
  }
].sort((a,b)=>(a.ordem||0)-(b.ordem||0));

const FERRAMENTAS=[
  /* ---------- Seção de Processo Seletivo ---------- */
  {
    arquivo:"edital.html",
    secao:"sps",
    rotulo:"Edital",
    ordem:0,
    emoji:"📜",
    cor:"--coral",
    eyebrow:"Abertura de processo seletivo",
    titulo:"Gerador do Edital de Abertura",
    descricao:"Lê o formulário de abertura do processo seletivo (PDF do SEI), permite conferir/editar as respostas e gera o texto completo do Edital de Abertura a partir do modelo adequado."
  },
  {
    arquivo:"ponto_18.html",
    secao:"sps",
    ponto:"18",
    emoji:"📧",
    cor:"--teal",
    eyebrow:"Ferramenta de apoio",
    titulo:"Agrupador de E-mails",
    descricao:"Converte uma coluna de e-mails em uma lista separada por ponto e vírgula."
  },
  {
    arquivo:"ponto_20.html",
    secao:"sps",
    ponto:"20",
    emoji:"🏅",
    cor:"--mint",
    eyebrow:"Cruzamento de classificação e inscritos",
    titulo:"Elaboração do Edital de classificação final",
    descricao:"Cruza o Relatório de Classificação Final com o Relatório de Inscritos (planilhas da Fábrica de Provas), aplicando cotas de reserva e limite de aprovados."
  },
  {
    arquivo:"ponto_26.html",
    secao:"sps",
    ponto:"26",
    emoji:"📥",
    cor:"--gold",
    eyebrow:"Processamento de classificação",
    titulo:"Gerar arquivo para importar no Hércules",
    descricao:"Cruza a classificação final (extraída do PDF do edital) com os dados cadastrais dos candidatos (CSV), gerando a tabela para importação no Hércules."
  },

  /* ---------- Divisão de Residência ---------- */
  {
    arquivo:"residencia_ensalamento.html",
    secao:"residencia",
    rotulo:"Ensalamento",
    ordem:0,
    emoji:"🏫",
    cor:"--teal",
    eyebrow:"Aplicação de provas",
    titulo:"Gerador do Edital de Ensalamento",
    descricao:"Cruzará a relação de inscritos com os locais e salas de prova para gerar o Edital de Ensalamento pronto para copiar ou baixar. (Em desenvolvimento.)"
  },
  {
    arquivo:"residencia_classificacao.html",
    secao:"residencia",
    rotulo:"Classificação Final",
    ordem:1,
    emoji:"🏆",
    cor:"--mint",
    eyebrow:"Resultado do certame",
    titulo:"Gerador do Edital de Classificação Final",
    descricao:"Cruzará o relatório de classificação da Fábrica de Provas com os dados dos inscritos para gerar o Edital de Classificação Final. (Em desenvolvimento.)"
  }
];

/* ---------- funções de apoio (usadas pelo layout.js) ---------- */

// Seção de uma ferramenta (com padrão "sps" para registros antigos sem o campo)
function secaoDaFerramenta(t){ return t.secao || 'sps'; }

// Registro da seção pelo id
function secaoPorId(id){ return SECOES.find(s=>s.id===id) || null; }

// Ordem interna: usa `ordem` quando existe, senão o número do Ponto
function ordemFerramenta(t){
  return (t.ordem!==undefined) ? Number(t.ordem) : Number(t.ponto);
}

// Ordenação global: primeiro pela ordem da seção, depois pela ordem interna.
// Assim, basta acrescentar a ferramenta na lista acima — a posição no menu e
// no índice é calculada sozinha.
FERRAMENTAS.sort((a,b)=>{
  const sa=secaoPorId(secaoDaFerramenta(a)), sb=secaoPorId(secaoDaFerramenta(b));
  const oa=sa?(sa.ordem||0):99, ob=sb?(sb.ordem||0):99;
  if(oa!==ob) return oa-ob;
  return ordemFerramenta(a)-ordemFerramenta(b);
});

// Ferramentas de uma seção, já na ordem correta
function ferramentasDaSecao(id){
  return FERRAMENTAS.filter(t=>secaoDaFerramenta(t)===id);
}

// Rótulo curto exibido no menu/aba e no cartão do índice (ex.: "Edital" ou "Ponto 20")
function rotuloFerramenta(t){ return t.rotulo || ('Ponto '+t.ponto); }

// Localiza o registro da ferramenta correspondente a um arquivo (nome do .html)
function ferramentaPorArquivo(arquivo){
  return FERRAMENTAS.find(t=>t.arquivo===arquivo) || null;
}
