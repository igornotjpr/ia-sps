/* Registro dos jogos da seção secreta (TJPR Jogos).
   Mesmo formato de ferramentas.js: alterar título/eyebrow/rótulo AQUI reflete
   automaticamente na grade de jogos.html e no cabeçalho de cada página de jogo. */
const JOGOS=[
  {
    arquivo:"flappy.html",
    rotulo:"Flappy Bird",
    ordem:0,
    emoji:"🐤",
    cor:"--navy",
    eyebrow:"ASCII arcade",
    titulo:"Flappy Bird (ASCII)",
    descricao:"Desvie dos obstáculos batendo asas com a barra de espaço — a pontuação é o tempo sobrevivido. Recorde salvo neste navegador."
  }
].sort((a,b)=>(a.ordem||0)-(b.ordem||0));

// Rótulo curto exibido no cartão do jogo (ex.: "Flappy Bird")
function rotuloJogo(j){ return j.rotulo; }

// Localiza o registro do jogo correspondente a um arquivo (nome do .html)
function jogoPorArquivo(arquivo){
  return JOGOS.find(j=>j.arquivo===arquivo) || null;
}
