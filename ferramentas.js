/* Registro único de todas as seções e ferramentas do portal.
   Alterar título/eyebrow/rótulo/seção AQUI reflete automaticamente no menu,
   no índice e no cabeçalho (h1) de cada página — não é preciso editar os HTMLs.

   PARA ADICIONAR UMA FERRAMENTA NOVA:
   1. criar o arquivo .html da ferramenta na mesma pasta;
   2. acrescentar um objeto na lista FERRAMENTAS abaixo, informando `secao`
      ("sps" ou "residencia") e `ordem` (ou `ponto`, no caso da SPS);
   3. pronto — o menu suspenso e o cartão do índice aparecem sozinhos, na
      posição correta.

   PARA ADICIONAR UMA SEÇÃO NOVA: acrescentar um objeto em SECOES.

   Duas propriedades de seção mudam o desenho sozinhas:
   - `emBreve` — só quando presente a seção ganha o cartão "Próxima ferramenta"
     no índice. Hoje só a de Processo Seletivo o tem (é a porta dos jogos).
   - uma seção com UMA ferramenta só vira link direto no menu, sem submenu. */

// Versão exibida no canto do cabeçalho (formato "v. x.y.z"). Atualizar aqui a
// cada commit versionado, acompanhando o número usado na mensagem do commit.
const VERSAO_APP='3.19';

const SECOES=[
  {
    id:"sps",
    ordem:0,
    rotulo:"Estágio",                    // texto do item principal do menu
    emoji:"🗂️",
    cor:"--teal",
    eyebrow:"Seção de Estágio",
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
    sufixoTitulo:" — Divisão de Residência (TJPR)"
  },
  {
    id:"fluxo",
    ordem:2,
    rotulo:"Fluxo",
    emoji:"🧭",
    cor:"--coral",
    eyebrow:"Mapa do processo seletivo",
    titulo:"Fluxo de Processo Seletivo",
    descricao:"Visão do processo seletivo de ponta a ponta: em que fase cada atividade acontece, quem responde por ela e como é classificada em Ponto, Tag e Vinculação.",
    sufixoTitulo:" — Fluxo do Processo Seletivo (TJPR)"
  },
  {
    id:"gestao",
    ordem:3,
    rotulo:"Divisão de Gestão",
    emoji:"🗃️",
    cor:"--navy",
    eyebrow:"Divisão de Gestão de Estágios, Residência e Voluntariado",
    titulo:"Ferramentas da Divisão de Gestão",
    descricao:"Apoio ao controle das vagas de estágio (permanentes e provisórias) das unidades do TJPR: consulta interna do quantitativo disponível, ocupado e total por unidade.",
    sufixoTitulo:" — Divisão de Gestão de Estágios, Residência e Voluntariado (TJPR)"
  },
  {
    id:"externas",
    ordem:4,
    rotulo:"UE",
    emoji:"🏢",
    cor:"--mint",
    eyebrow:"Unidades gestoras de processo seletivo",
    titulo:"Ferramentas para Unidades Externas",
    descricao:"Ferramentas de apoio às comarcas e unidades do TJPR que conduzem o próprio processo seletivo de estágio — a começar pela geração da tabela de resultado final no formato padrão, sem depender da Fábrica de Provas.",
    // o título da ferramenta já termina em "Unidades externas": um sufixo
    // repetindo a seção deixaria a aba do navegador redundante
    sufixoTitulo:" — TJPR"
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
    arquivo:"ponto_14.html",
    secao:"sps",
    ponto:"14",
    emoji:"🪑",
    cor:"--navy",
    eyebrow:"Ponto 14",
    titulo:"Gerador do Edital de Ensalamento",
    descricao:"Lê o formulário de abertura (PDF do SEI) e o Relatório de inscritos da Fábrica de Provas, monta a tabela dos candidatos com inscrição deferida e gera o Edital de Ensalamento em blocos, prontos para colar no Athos."
  },
  {
    arquivo:"ponto_18.html",
    secao:"sps",
    ponto:"18",
    emoji:"📣",
    cor:"--teal",
    eyebrow:"Ponto 18",
    titulo:"Convocação para Entrevista",
    descricao:"Lê o Relatório de convocação para entrevistas da Fábrica de Provas, monta a tabela dos convocados (com reserva, datas, horários e links), gera a convocação pronta para salvar em PDF, os blocos para publicar no Athos e a lista de e-mails para envio pelo SEI."
  },
  {
    arquivo:"ponto_20.html",
    secao:"sps",
    ponto:"20",
    emoji:"🏅",
    cor:"--mint",
    eyebrow:"Ponto 20",
    titulo:"Elaboração do Edital de classificação final",
    descricao:"Cruza o Relatório de Classificação Final com o Relatório de Inscritos (planilhas da Fábrica de Provas), aplicando cotas de reserva e limite de aprovados."
  },
  {
    arquivo:"ponto_26.html",
    secao:"sps",
    ponto:"26",
    emoji:"📥",
    cor:"--gold",
    eyebrow:"Ponto 26",
    titulo:"Gerar arquivo para importar no Hércules",
    descricao:"Cruza a classificação final (extraída do PDF do edital) com os dados cadastrais dos candidatos (CSV), gerando a tabela para importação no Hércules."
  },

  /* ---------- Divisão de Residência ---------- */
  {
    arquivo:"residencia_convocacao.html",
    secao:"residencia",
    rotulo:"Convocação p/ Entrevista",
    ordem:0,
    emoji:"📣",
    cor:"--teal",
    eyebrow:"Convocação para a entrevista",
    titulo:"Gerador do Edital de Convocação para Entrevista",
    descricao:"Lê a Lista de dados dos inscritos, separa os candidatos marcados por cota de reserva em tabelas editáveis por arrastar e soltar, com nota e horário digitados à mão, e gera o Edital de Convocação para Entrevista pronto para copiar ou salvar em PDF."
  },
  {
    arquivo:"residencia_hercules.html",
    secao:"residencia",
    rotulo:"Arquivo do Hércules",
    ordem:2,
    emoji:"📥",
    cor:"--gold",
    eyebrow:"Importação da classificação",
    titulo:"Gerar arquivo para importar no Hércules",
    descricao:"Lê o Edital de Classificação Final e a Lista de dados dos inscritos (ambos em PDF), aplica a ordem de chamamento das vagas reservadas sem repetir nomes e gera o CSV de importação no Hércules."
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
    descricao:"Lê a Lista de dados dos inscritos, separa os candidatos marcados por cota de reserva em tabelas editáveis por arrastar e soltar, com nota da prova, da entrevista e final digitadas à mão, e gera o Edital de Classificação Final pronto para copiar no Athos."
  },

  /* ---------- Fluxo de Processo Seletivo ---------- */
  {
    arquivo:"fluxo.html",
    secao:"fluxo",
    rotulo:"Editor do Fluxo",
    ordem:0,
    emoji:"🗺️",
    cor:"--coral",
    eyebrow:"Ponto, Tag e Vinculação",
    titulo:"Editor do Fluxo do Processo Seletivo",
    descricao:"Quadro compartilhado com as etapas do processo seletivo — fase, atividade, responsáveis, número da etapa e a marcação de Ponto, Tag e Vinculação. Permite reordenar as etapas arrastando, salvar para todos de uma vez, baixar uma cópia de segurança e gerar o PDF do fluxo."
  },

  /* ---------- Divisão de Gestão de Estágios, Residência e Voluntariado ---------- */
  {
    arquivo:"vagas_consulta.html",
    secao:"gestao",
    rotulo:"Consulta de Vagas",
    ordem:0,
    emoji:"🔎",
    cor:"--navy",
    eyebrow:"Vagas por unidade",
    titulo:"Consulta de Vagas Disponíveis por Unidade",
    descricao:"Busca por sigla, comarca, tipo ou nome da unidade e mostra o quantitativo de vagas de estágio — permanentes e provisórias, disponíveis, ocupadas e totais — com prazo, motivo e SEI das vagas provisórias. Os dados são compartilhados e atualizáveis por upload da planilha de controle."
  },

  /* ---------- Unidades Externas ---------- */
  {
    arquivo:"resultado_final.html",
    secao:"externas",
    rotulo:"Resultado Final",
    ordem:0,
    emoji:"📋",
    cor:"--mint",
    eyebrow:"Resultado final do processo seletivo",
    titulo:"Criação da tabela de resultado final - Unidades externas",
    descricao:"Cadastro das notas dos candidatos no modelo da classificação final da Fábrica de Provas, com tabela editável por arrastar e soltar, classificação e nota final automáticas, gravação compartilhada por SEI + unidade, e exportação em PDF com cabeçalho institucional e CSV compatível com o Ponto 20."
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
