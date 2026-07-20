
(function(){
  const fileBtn = document.getElementById('fileBtn');
  const fileInput = document.getElementById('tabela2File');
  const fileName = document.getElementById('fileName');
  const processBtn = document.getElementById('processBtn');
  const tabela1Input = document.getElementById('tabela1Input');
  const resultArea = document.getElementById('resultArea');
  const downloadRow = document.getElementById('downloadRow');
  const downloadBtn = document.getElementById('downloadBtn');
  const countNote = document.getElementById('countNote');
  const stampWrap = document.getElementById('stampWrap');
  const stampBadge = document.getElementById('stampBadge');
  const stampText = document.getElementById('stampText');

  // Passo 1 — upload do PDF do edital e colagem manual (alternativa)
  const pdfFileBtn = document.getElementById('pdfFileBtn');
  const pdfFileInput = document.getElementById('pdfFileInput');
  const pdfFileName = document.getElementById('pdfFileName');
  const pdfStatusMsg = document.getElementById('pdfStatusMsg');
  const btnColarManual = document.getElementById('btnColarManual');
  const colarWrap = document.getElementById('colarWrap');

  let outputRows = [];

  const OUT_COLS = ["Classificação","CPF","Nome do candidato","Nota final","E-mail","Telefone celular","Telefone fixo","PNE","VS","AFRO","INDÍGENA"];
  const COTAS = ["PNE","VS","AFRO","INDÍGENA"];

  // Utilitários compartilhados vêm de core.js (carregado antes deste script).
  const { escapeHtml, csvEscape, normName, parseCSV } = TJPRCore;

  pdfFileBtn.addEventListener('click', () => pdfFileInput.click());

  // Um novo upload sempre descarta o estado anterior (extração, resultado do
  // cruzamento, download) — evita mistura de dados quando o usuário troca o
  // arquivo, por exemplo após enviar o PDF errado.
  function resetarEstado(){
    tabela1Input.value = '';
    outputRows = [];
    pdfStatusMsg.style.display = 'none';
    pdfStatusMsg.className = 'notice-banner';
    colarWrap.style.display = 'none';
    stampWrap.classList.remove('show');
    resultArea.innerHTML = '<p class="empty-hint">A tabela final aparecerá aqui após o processamento.</p>';
    downloadRow.style.display = 'none';
    checkReady();
  }

  // A extração começa automaticamente assim que o arquivo é escolhido —
  // sem botão intermediário.
  pdfFileInput.addEventListener('change', () => {
    const file = pdfFileInput.files && pdfFileInput.files[0];
    pdfFileName.textContent = file ? file.name : 'Nenhum arquivo selecionado';
    resetarEstado();
    if(file) lerPdf();
  });

  btnColarManual.addEventListener('click', () => {
    colarWrap.style.display = colarWrap.style.display === 'none' ? 'block' : 'none';
  });

  fileBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    if(fileInput.files && fileInput.files[0]){
      fileName.textContent = fileInput.files[0].name;
      checkReady();
    } else {
      fileName.textContent = 'Nenhum arquivo selecionado';
    }
  });

  tabela1Input.addEventListener('input', checkReady);

  function checkReady(){
    const hasTabela1 = tabela1Input.value.trim().length > 0;
    const hasTabela2 = fileInput.files && fileInput.files[0];
    processBtn.disabled = !(hasTabela1 && hasTabela2);
  }

  // ==========================================================================
  // Tabela 1 — edital de classificação final
  // ==========================================================================

  // Table 1 always has the fixed shape ORDEM / INSCRIÇÃO / NOME / NOTA / RESERVA(opcional).
  // Rather than splitting on delimiters (fragile when names have single spaces and the
  // paste is plain aligned text, not real tabs), each data line is matched against a
  // pattern that recognizes the two leading numbers, a trailing decimal (NOTA), and an
  // optional trailing X.X.X code (RESERVA) — everything in between is the NOME.
  const ROW_RE = /^(\d+)\s+(\d+)\s+(.+?)\s+(\d{1,3}(?:[.,]\d{1,2})?)(?:\s+(\d(?:[.,]\d){1,3}))?\s*$/;

  function parseTabela1(text){
    const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').map(l=>l.trim()).filter(l => l !== '');
    if(lines.length < 2) return { rows: [], errors: [] };

    // skip the header line (identified by containing "ORDEM"); if not found, assume line 0 is header anyway
    let startIdx = 0;
    if(/ORDEM/i.test(lines[0])) startIdx = 1;

    const rows = [];
    const errors = [];
    for(let i=startIdx;i<lines.length;i++){
      const line = lines[i];
      const m = line.match(ROW_RE);
      if(!m){
        errors.push(line);
        continue;
      }
      rows.push({
        ORDEM: m[1],
        INSCRICAO: m[2],
        NOME: m[3].trim(),
        NOTA: m[4].replace(',', '.'),
        RESERVA: m[5] || ''
      });
    }
    return { rows, errors };
  }

  // A extração do PDF (via pdf.js, em core.js) devolve o texto agrupado por
  // linha visual do documento. Quando o nome do candidato é longo, a própria
  // tabela do edital "quebra" a célula em duas linhas — nesse caso o PDF entrega
  // ORDEM+INSCRIÇÃO numa linha, o NOME na linha seguinte e a NOTA (e RESERVA,
  // se houver) numa terceira linha. Por isso, em vez de tentar casar cada linha
  // isoladamente, acumulamos o texto de cada registro até a próxima linha que
  // comece com "ORDEM INSCRIÇÃO" (ou o fim da tabela) e só então remontamos uma
  // única linha por registro — que é reaproveitada pelo mesmo parseTabela1() já
  // usado na colagem manual (ROW_RE já sabe separar NOME, NOTA e RESERVA).
  const PDF_ROW_START_RE = /^(\d{1,3})\s+(\d{4,9})\s*(.*)$/;
  const PDF_BOILERPLATE_RE = /^(TRIBUNAL DE JUSTIÇA|Pç\.|SEI!TJPR|SEI!DOC|EDITAL[\s\u00baº°]|PROCESSO SELETIVO|GABINETE|VARA |JUIZADO|SERVI[ÇC]O DE|SECRETARIA DA|DIVIS[ÃA]O |Documento assinado|A autenticidade|assinatura|www\.tjpr)/i;

  function pdfTextToTabela1Lines(rawText){
    const allLines = rawText.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').map(l => l.trim()).filter(l => l !== '');

    // a tabela termina onde começa o bloco de assinatura ("Curitiba, ...")
    const fimIdx = allLines.findIndex(l => /^curitiba\b/i.test(l));
    const scanLines = fimIdx === -1 ? allLines : allLines.slice(0, fimIdx);

    const rows = [];
    let current = null;
    scanLines.forEach(line => {
      // pula linhas de cabeçalho da tabela (podem se repetir em páginas seguintes)
      if(/ORDEM/i.test(line) && /NOME/i.test(line)) return;
      // pula cabeçalho/rodapé institucional do edital
      if(PDF_BOILERPLATE_RE.test(line)) return;

      const m = line.match(PDF_ROW_START_RE);
      if(m){
        if(current) rows.push(current);
        current = { ordem: m[1], inscricao: m[2], buffer: (m[3] || '').trim() };
      } else if(current){
        current.buffer = (current.buffer + ' ' + line).trim();
      }
      // linhas antes do primeiro registro reconhecido (nome da unidade, número do
      // edital etc.) são ignoradas
    });
    if(current) rows.push(current);

    return rows.map(r => r.ordem + '\t' + r.inscricao + '\t' + r.buffer);
  }

  function mostrarStatus(html, tipo){ // tipo: '' (andamento) | 'ok' | 'warn'
    pdfStatusMsg.className = 'notice-banner' + (tipo ? ' ' + tipo : '');
    pdfStatusMsg.innerHTML = html;
    pdfStatusMsg.style.display = 'block';
  }

  async function lerPdf(){
    const file = pdfFileInput.files && pdfFileInput.files[0];
    if(!file) return;
    mostrarStatus('Lendo o PDF e extraindo a tabela de classificação...');
    try{
      const texto = await TJPRCore.pdfToText(file);
      if(texto.replace(/\s+/g,'').length < 30){
        throw new Error('o arquivo quase não contém texto extraível (provável digitalização/imagem)');
      }
      const linhas = pdfTextToTabela1Lines(texto);
      if(linhas.length === 0){
        mostrarStatus('<strong>Não foi possível localizar a tabela de classificação neste PDF.</strong> Confira se o arquivo é o Edital de Classificação Final, ou cole o conteúdo manualmente pelo botão "Colar tabela manualmente".', 'warn');
        return;
      }

      tabela1Input.value = 'ORDEM\tINSCRIÇÃO\tNOME\tNOTA\tRESERVA\n' + linhas.join('\n');

      // reaproveita o parser já usado na colagem manual para conferir e avisar
      // o usuário de eventuais linhas não reconhecidas, antes do Passo 2
      const conferencia = parseTabela1(tabela1Input.value);
      if(conferencia.errors.length > 0){
        mostrarStatus('<strong>' + conferencia.rows.length + ' registro(s)</strong> extraído(s) do PDF, mas <strong>' + conferencia.errors.length + ' linha(s) não reconhecida(s)</strong> — confira e corrija no quadro abaixo antes de processar.', 'warn');
      } else {
        mostrarStatus('<strong>' + conferencia.rows.length + ' registro(s)</strong> extraído(s) do PDF. Confira os dados no quadro abaixo (pode editar se necessário) e envie o relatório de inscritos no Passo 2.', 'ok');
      }
      colarWrap.style.display = 'block'; // abre a tabela para conferência do usuário

      checkReady();
    }catch(e){
      mostrarStatus('<strong>Não foi possível ler o PDF</strong> (' + TJPRCore.escapeHtml(e.message) + '). Se o arquivo for uma digitalização (imagem), copie o texto da tabela e cole manualmente pelo botão "Colar tabela manualmente".', 'warn');
    }
  }

  // ==========================================================================
  // Tabela 2 — cadastro dos inscritos (.xlsx bruto ou .csv legado)
  // ==========================================================================

  function findCol(headers, candidates){
    for(const cand of candidates){
      const idx = headers.findIndex(h => normName(h) === normName(cand));
      if(idx !== -1) return headers[idx];
    }
    return null;
  }

  // O Hércules exige o CPF com 11 dígitos. Quando o relatório é aberto/salvo no
  // Excel, o CPF vira número e perde o zero à esquerda (09298466994 -> 9298466994),
  // o que quebra a importação. Reconstituímos o zero aqui.
  function normalizarCPF(valor){
    const digitos = String(valor === undefined || valor === null ? '' : valor).replace(/\D/g,'');
    if(digitos === '') return { cpf: '', erro: 'CPF vazio' };
    if(digitos.length > 11) return { cpf: digitos, erro: 'CPF com ' + digitos.length + ' dígitos' };
    return { cpf: digitos.padStart(11,'0'), erro: null };
  }

  function limpar(v){
    return String(v === undefined || v === null ? '' : v).trim();
  }

  // Conversão da reserva textual do cadastro para as flags S/N do Hércules.
  // O relatório traz a cota por extenso ("Preto ou pardo", "Pessoa com
  // Deficiência"); casamos por radical para tolerar variações de redação do
  // sistema de inscrição. Valor não reconhecido NUNCA vira "N" em silêncio —
  // é devolvido em `desconhecido` e reportado ao usuário.
  const MAPA_RESERVA = [
    { cota: 'AFRO',     re: /(PRETO|PARDO|NEGR|AFRO|ETNICO|ETNICO RACIAL)/ },
    { cota: 'PNE',      re: /(DEFICI|PCD|PNE|PORTADOR DE NECESSIDADE)/ },
    { cota: 'INDÍGENA', re: /(INDIGEN)/ },
    { cota: 'VS',       re: /(VULNERAB|HIPOSSUF|BAIXA RENDA|CADUNICO|CAD UNICO|SOCIOECONOMIC|ESCOLA PUBLICA)/ }
  ];

  function reservaTextoParaCotas(texto){
    const flags = { PNE:'N', VS:'N', AFRO:'N', 'INDÍGENA':'N' };
    const bruto = limpar(texto);
    if(bruto === '' || bruto === '-') return { flags, desconhecido: null };

    // normName remove acentos e põe em maiúsculas
    const chave = normName(bruto);
    let achou = false;
    MAPA_RESERVA.forEach(m => {
      if(m.re.test(chave)){ flags[m.cota] = 'S'; achou = true; }
    });
    return { flags, desconhecido: achou ? null : bruto };
  }

  // Códigos de reserva usados na coluna RESERVA do edital.
  const MAPA_CODIGO = { '2.1.1':'AFRO', '2.1.2':'PNE', '2.1.3':'INDÍGENA', '2.1.4':'VS' };

  function codigoEditalParaCotas(reserva){
    const flags = { PNE:'N', VS:'N', AFRO:'N', 'INDÍGENA':'N' };
    let temCodigo = false;
    Object.keys(MAPA_CODIGO).forEach(cod => {
      if(String(reserva || '').indexOf(cod) !== -1){ flags[MAPA_CODIGO[cod]] = 'S'; temCodigo = true; }
    });
    return { flags, temCodigo };
  }

  // Lê o arquivo do Passo 2 e devolve uma lista de registros normalizados,
  // independentemente de a origem ser o .xlsx bruto (Relatório de Inscritos) ou
  // o .csv já formatado do fluxo antigo (VBA > Importação Classificados).
  async function lerTabela2(file){
    const ehPlanilha = /\.(xlsx|xlsm|xls)$/i.test(file.name);
    let headers, linhas;

    if(ehPlanilha){
      if(typeof XLSX === 'undefined'){
        throw new Error('Biblioteca de leitura de planilhas não carregada (vendor/xlsx.min.js).');
      }
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type:'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if(!ws) throw new Error('a planilha não contém nenhuma aba legível.');
      // raw:false devolve tudo como texto — evita que o CPF chegue como número
      const objs = XLSX.utils.sheet_to_json(ws, { defval:'', raw:false });
      if(objs.length === 0) throw new Error('a planilha está vazia (nenhuma linha de dados abaixo do cabeçalho).');
      headers = Object.keys(objs[0]).map(h => String(h).trim());
      linhas = objs.map(o => {
        const norm = {};
        Object.keys(o).forEach(k => norm[String(k).trim()] = o[k]);
        return norm;
      });
    } else {
      let text = await file.text();
      if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      const csvRows = parseCSV(text);
      if(csvRows.length < 2) throw new Error('o arquivo CSV parece vazio ou inválido.');
      headers = csvRows[0].map(h => h.trim());
      linhas = csvRows.slice(1).map(r => {
        const obj = {};
        headers.forEach((h,i) => obj[h] = r[i] !== undefined ? r[i] : '');
        return obj;
      });
    }

    const colNome     = findCol(headers, ['Nome do candidato','Nome']);
    const colCPF      = findCol(headers, ['CPF']);
    const colEmail    = findCol(headers, ['E-mail','Email']);
    const colCel      = findCol(headers, ['Telefone celular','Telefone','Celular']);
    const colFixo     = findCol(headers, ['Telefone fixo','Fixo']);
    const colReserva  = findCol(headers, ['Reserva especial','Reserva','Cota']);
    const colSituacao = findCol(headers, ['Situação da inscrição','Situação','Situacao']);
    const colsCota    = {
      'PNE': findCol(headers, ['PNE','PCD']),
      'VS': findCol(headers, ['VS']),
      'AFRO': findCol(headers, ['AFRO']),
      'INDÍGENA': findCol(headers, ['INDÍGENA','INDIGENA'])
    };

    if(!colNome) throw new Error('não foi encontrada a coluna de nome do candidato ("Nome" ou "Nome do candidato"). Cabeçalho lido: ' + headers.join(' | '));
    if(!colCPF)  throw new Error('não foi encontrada a coluna "CPF". Cabeçalho lido: ' + headers.join(' | '));

    const temColunasCotaProntas = colsCota['PNE'] && colsCota['AFRO'];

    const registros = linhas.map(r => {
      const cpfInfo = normalizarCPF(r[colCPF]);
      const celular = limpar(colCel ? r[colCel] : '');

      let flags, desconhecido = null, reservaBruta = '';
      if(colReserva){
        // origem preferencial: texto da reserva no relatório bruto
        reservaBruta = limpar(r[colReserva]);
        const conv = reservaTextoParaCotas(reservaBruta);
        flags = conv.flags;
        desconhecido = conv.desconhecido;
      } else if(temColunasCotaProntas){
        // CSV legado, que já traz as colunas S/N prontas
        flags = {};
        COTAS.forEach(c => {
          const col = colsCota[c];
          flags[c] = col && /^S/i.test(limpar(r[col])) ? 'S' : 'N';
        });
      } else {
        flags = { PNE:'N', VS:'N', AFRO:'N', 'INDÍGENA':'N' };
      }

      return {
        nome: limpar(r[colNome]),
        cpf: cpfInfo.cpf,
        cpfErro: cpfInfo.erro,
        email: limpar(colEmail ? r[colEmail] : ''),
        celular: celular,
        // O formato do Hércules replica o celular no campo de telefone fixo.
        // Se a origem já trouxer um fixo preenchido, ele tem prioridade.
        fixo: limpar(colFixo ? r[colFixo] : '') || celular,
        flags: flags,
        reservaBruta: reservaBruta,
        reservaDesconhecida: desconhecido,
        situacao: limpar(colSituacao ? r[colSituacao] : '').toUpperCase()
      };
    });

    return { registros, temSituacao: !!colSituacao, temReservaTexto: !!colReserva };
  }

  // ==========================================================================
  // Cruzamento
  // ==========================================================================

  async function processFiles(){
    const t1 = parseTabela1(tabela1Input.value);
    if(t1.rows.length === 0){
      alert('Não foi possível interpretar nenhuma linha da Tabela 1. Verifique se cada linha começa com ORDEM e INSCRIÇÃO numéricos, seguidos do nome e de uma nota (ex: 1  5116156  KADU LAIBIDA CORREA  8.00).');
      return;
    }

    const file = fileInput.files[0];
    let dados;
    try{
      dados = await lerTabela2(file);
    }catch(e){
      alert('Não foi possível ler o arquivo do Passo 2: ' + e.message);
      return;
    }

    // Índices por nome normalizado. Deferidas e indeferidas ficam em índices
    // separados para que um classificado que só exista como INDEFERIDA seja
    // reportado com o motivo exato, em vez de virar um "sem correspondência".
    const lookup = {};
    const indeferidas = {};
    const dupNames = new Set();
    dados.registros.forEach(r => {
      const key = normName(r.nome);
      if(!key) return;
      const ehIndeferida = dados.temSituacao && r.situacao.indexOf('INDEFERIDA') !== -1;
      if(ehIndeferida){ indeferidas[key] = r; return; }
      if(lookup[key]) dupNames.add(key);
      else lookup[key] = r;
    });

    const semCorrespondencia = [];
    const soIndeferidas = [];
    const divergencias = [];
    const reservasDesconhecidas = [];
    const cpfsSuspeitos = [];

    outputRows = t1.rows.map(r1 => {
      const nome1 = r1.NOME || '';
      const key = normName(nome1);
      const match = lookup[key];

      if(!match){
        if(indeferidas[key]) soIndeferidas.push(nome1);
        else semCorrespondencia.push(nome1);
      }

      // Fonte das cotas: o cadastro. O código do edital é usado apenas para
      // conferência — divergência vira aviso, não sobrescreve o cadastro.
      const doEdital = codigoEditalParaCotas(r1.RESERVA);
      const flags = match ? match.flags : doEdital.flags;

      if(match && doEdital.temCodigo){
        const difere = COTAS.filter(c => flags[c] !== doEdital.flags[c]);
        if(difere.length > 0){
          divergencias.push({
            nome: nome1,
            campos: difere,
            cadastro: match.reservaBruta || '(sem reserva no cadastro)',
            edital: r1.RESERVA
          });
        }
      }

      if(match && match.reservaDesconhecida){
        reservasDesconhecidas.push({ nome: nome1, valor: match.reservaDesconhecida });
      }
      if(match && match.cpfErro){
        cpfsSuspeitos.push({ nome: nome1, motivo: match.cpfErro });
      }

      return {
        "Classificação": r1.ORDEM || '',
        "CPF": match ? match.cpf : '',
        // o formato de importação usa o nome em caixa alta
        "Nome do candidato": (match ? match.nome : nome1).toUpperCase(),
        "Nota final": (r1.NOTA || '').replace('.', ','),
        "E-mail": match ? match.email : '',
        "Telefone celular": match ? match.celular : '',
        "Telefone fixo": match ? match.fixo : '',
        "PNE": flags['PNE'],
        "VS": flags['VS'],
        "AFRO": flags['AFRO'],
        "INDÍGENA": flags['INDÍGENA'],
        "_unmatched": !match
      };
    });

    renderResults({
      semCorrespondencia, soIndeferidas, divergencias,
      reservasDesconhecidas, cpfsSuspeitos,
      dupCount: dupNames.size, parseErrors: t1.errors,
      temReservaTexto: dados.temReservaTexto
    });
  }

  function listaHtml(itens, render, limite){
    limite = limite || 10;
    return '<ul class="warn-list">' +
      itens.slice(0,limite).map(render).join('') +
      (itens.length > limite ? '<li>… e mais ' + (itens.length - limite) + '</li>' : '') +
      '</ul>';
  }

  function renderResults(d){
    const problemas =
      d.semCorrespondencia.length + d.soIndeferidas.length + d.divergencias.length +
      d.reservasDesconhecidas.length + d.cpfsSuspeitos.length + d.parseErrors.length;

    stampWrap.classList.add('show');

    if(problemas === 0){
      stampBadge.classList.remove('warn');
      stampBadge.textContent = 'CONFERIDO';
      let ok = '<strong>' + outputRows.length + ' registros</strong> cruzados com sucesso. Todos os nomes da Tabela 1 foram encontrados no cadastro.';
      if(!d.temReservaTexto){
        ok += '<br>Observação: o arquivo do Passo 2 não traz a coluna "Reserva especial" — as cotas vieram das colunas S/N já existentes no arquivo.';
      }
      stampText.innerHTML = ok;
    } else {
      stampBadge.classList.add('warn');
      stampBadge.textContent = 'REVISAR';
      let html = '<strong>' + outputRows.length + ' registros</strong> gerados — confira os pontos abaixo antes de importar.';

      if(d.semCorrespondencia.length > 0){
        html += '<br><br><strong style="color:var(--stamp-red)">' + d.semCorrespondencia.length +
          ' classificado(s) sem correspondência no cadastro</strong> (linhas destacadas; campos cadastrais em branco):';
        html += listaHtml(d.semCorrespondencia, n => '<li>' + escapeHtml(n) + '</li>');
      }

      if(d.soIndeferidas.length > 0){
        html += '<br><strong style="color:var(--stamp-red)">' + d.soIndeferidas.length +
          ' classificado(s) constam no cadastro como INDEFERIDA(S)</strong> — um candidato indeferido não deveria figurar na classificação final. Verifique o edital ou a situação da inscrição:';
        html += listaHtml(d.soIndeferidas, n => '<li>' + escapeHtml(n) + '</li>');
      }

      if(d.divergencias.length > 0){
        html += '<br><strong style="color:var(--stamp-red)">' + d.divergencias.length +
          ' divergência(s) de cota entre o cadastro e o edital</strong> — foi usado o valor do <strong>cadastro</strong>:';
        html += listaHtml(d.divergencias, x =>
          '<li>' + escapeHtml(x.nome) + ' — campo(s) ' + escapeHtml(x.campos.join(', ')) +
          ': cadastro diz "' + escapeHtml(x.cadastro) + '", edital traz o código ' + escapeHtml(x.edital) + '</li>');
      }

      if(d.reservasDesconhecidas.length > 0){
        html += '<br><strong style="color:var(--stamp-red)">' + d.reservasDesconhecidas.length +
          ' reserva(s) não reconhecida(s)</strong> — o texto abaixo não corresponde a nenhuma cota conhecida e foi lançado como "N" em todas as colunas. Preencha manualmente e me avise para incluir o termo na ferramenta:';
        html += listaHtml(d.reservasDesconhecidas, x =>
          '<li>' + escapeHtml(x.nome) + ' — "' + escapeHtml(x.valor) + '"</li>');
      }

      if(d.cpfsSuspeitos.length > 0){
        html += '<br><strong style="color:var(--stamp-red)">' + d.cpfsSuspeitos.length +
          ' CPF(s) fora do padrão de 11 dígitos</strong> — confira antes de importar:';
        html += listaHtml(d.cpfsSuspeitos, x =>
          '<li>' + escapeHtml(x.nome) + ' — ' + escapeHtml(x.motivo) + '</li>');
      }

      if(d.dupCount > 0){
        html += '<br>Atenção: ' + d.dupCount + ' nome(s) duplicado(s) no cadastro — usada a primeira ocorrência.';
      }

      if(d.parseErrors.length > 0){
        html += '<br><strong style="color:var(--stamp-red)">' + d.parseErrors.length +
          ' linha(s) da Tabela 1 não reconhecida(s)</strong> e ignorada(s) — confira o formato (ORDEM  INSCRIÇÃO  NOME  NOTA  RESERVA):';
        html += listaHtml(d.parseErrors, n => '<li>' + escapeHtml(n) + '</li>', 8);
      }

      stampText.innerHTML = html;
    }

    // table
    let html = '<div class="table-scroll"><table><thead><tr>' +
      OUT_COLS.map(c => '<th>'+c+'</th>').join('') +
      '</tr></thead><tbody>';
    outputRows.forEach(r => {
      html += '<tr' + (r._unmatched ? ' class="unmatched"' : '') + '>' +
        OUT_COLS.map(c => '<td>'+escapeHtml(r[c] || '')+'</td>').join('') +
        '</tr>';
    });
    html += '</tbody></table></div>';
    resultArea.innerHTML = html;

    downloadRow.style.display = 'flex';
    countNote.textContent = outputRows.length + ' linha(s) — CSV separado por ";" (abre em colunas automaticamente no Excel PT-BR).';
  }

  // escapeHtml e csvEscape vêm do TJPRCore (ver bloco compartilhado acima).

  function downloadCSV(){
    const lines = [];
    lines.push(OUT_COLS.map(csvEscape).join(';'));
    outputRows.forEach(r => {
      lines.push(OUT_COLS.map(c => csvEscape(r[c])).join(';'));
    });
    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const stamp = now.toISOString().slice(0,10);
    a.href = url;
    a.download = 'tabela_final_classificacao_' + stamp + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  processBtn.addEventListener('click', processFiles);
  downloadBtn.addEventListener('click', downloadCSV);
})();
