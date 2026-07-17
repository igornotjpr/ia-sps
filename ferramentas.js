/* Registro único de todas as ferramentas do portal.
   Alterar o título/eyebrow/rótulo AQUI reflete automaticamente no menu, no índice
   e no cabeçalho (h1) de cada página — não é preciso editar os HTMLs. */
const FERRAMENTAS=[
  {
    arquivo:"edital.html",
    rotulo:"Edital",
    ordem:0,
    eyebrow:"Abertura de processo seletivo",
    titulo:"Gerador do Edital de Abertura",
    descricao:"Lê o formulário de abertura do processo seletivo (PDF do SEI), permite conferir/editar as respostas e gera o texto completo do Edital de Abertura a partir do modelo adequado."
  },
  {
    arquivo:"ponto_18.html",
    ponto:"18",
    eyebrow:"Ferramenta de apoio",
    titulo:"Agrupador de E-mails",
    descricao:"Converte uma coluna de e-mails em uma lista separada por ponto e vírgula."
  },
  {
    arquivo:"ponto_20.html",
    ponto:"20",
    eyebrow:"Cruzamento de classificação e inscritos",
    titulo:"Elaboração do Edital de classificação final",
    descricao:"Cruza o Relatório de Classificação Final com o Relatório de Inscritos (planilhas da Fábrica de Provas), aplicando cotas de reserva e limite de aprovados."
  },
  {
    arquivo:"ponto_26.html",
    ponto:"26",
    eyebrow:"Processamento de classificação",
    titulo:"Gerar arquivo para importar no Hércules",
    descricao:"Cruza a classificação final (colada do edital) com os dados cadastrais dos candidatos (CSV), gerando a tabela para importação no Hércules."
  }
].sort((a,b)=>{
  const oa=(a.ordem!==undefined)?a.ordem:Number(a.ponto);
  const ob=(b.ordem!==undefined)?b.ordem:Number(b.ponto);
  return oa-ob;
});

// Rótulo curto exibido no menu/aba e no cartão do índice (ex.: "Edital" ou "Ponto 20")
function rotuloFerramenta(t){ return t.rotulo || ('Ponto '+t.ponto); }

// Localiza o registro da ferramenta correspondente a um arquivo (nome do .html)
function ferramentaPorArquivo(arquivo){
  return FERRAMENTAS.find(t=>t.arquivo===arquivo) || null;
}
