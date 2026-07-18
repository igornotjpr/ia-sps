/* Ponto 18 — Agrupador de E-mails */
(function(){
  const inp = document.getElementById('input');
  const out = document.getElementById('output');
  const btnCopy = document.getElementById('copy');

  document.getElementById('process').addEventListener('click', () => {
    const valores = inp.value.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
    out.value = valores.length ? valores.join('; ') + ';' : '';
  });

  btnCopy.addEventListener('click', async () => {
    if(!out.value) return;
    function feito(){
      const original = 'Copiar resultado';
      btnCopy.textContent = 'Copiado!';
      setTimeout(() => { btnCopy.textContent = original; }, 1800);
    }
    try{
      await navigator.clipboard.writeText(out.value);
      feito();
    }catch(e){
      // fallback para navegadores sem clipboard assíncrono
      out.select();
      try{ if(document.execCommand('copy')) feito(); }catch(e2){}
      window.getSelection().removeAllRanges();
    }
  });
})();
