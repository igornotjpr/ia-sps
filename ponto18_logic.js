const i=document.getElementById('input'),o=document.getElementById('output');
document.getElementById('process').onclick=()=>{const r=i.value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);o.value=r.length?r.join('; ')+';':'';};
document.getElementById('copy').onclick=async()=>{if(!o.value)return;await navigator.clipboard.writeText(o.value);};