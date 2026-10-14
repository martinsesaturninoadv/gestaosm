/* =========================================================
   ANEXOS NO PRÓPRIO SISTEMA (sem depender do Drive)
   - o arquivo vai em pedaços de 2 MB (vídeos grandes passam pelo limite da hospedagem);
   - fica guardado fora da pasta pública e só abre para quem pode ver o registro.
   ========================================================= */
const ANX_PARTE=2*1024*1024;
const ANX_ENVIANDO=new Map(); // chave da caixa → texto do progresso
const tamTxt=n=>n>1073741824?num(n/1073741824,1)+' GB':n>1048576?num(n/1048576,1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
const anxIcone=m=>/^video/.test(m)?'🎬':/^image/.test(m)?'🖼️':/^audio/.test(m)?'🎵':/pdf/.test(m)?'📕':/word|document/.test(m)?'📝':'📄';
const anxUrl=(id,baixar)=>'api.php?acao=anexo&id='+encodeURIComponent(id)+(baixar?'&baixar=1':'');
async function enviarAnexo(file,col,reg,prog){
  const up=[...crypto.getRandomValues(new Uint8Array(8))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const base=`api.php?acao=upload&col=${encodeURIComponent(col)}&reg=${encodeURIComponent(reg)}&up=${up}&nome=${encodeURIComponent(file.name)}&total=${file.size}`;
  let ini=0,tent=0;
  while(true){
    const fim=Math.min(file.size,ini+ANX_PARTE);
    let r,j=null;
    try{r=await fetch(base+'&ini='+ini,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream','X-Requested-With':'gestao'},body:file.slice(ini,fim)});j=await r.json().catch(()=>null);}
    catch(e){if(++tent>4)throw {msg:'A conexão caiu durante o envio. Tente de novo.'};await new Promise(s=>setTimeout(s,1500*tent));continue;}
    if(r.status===409&&j&&j.continuar!=null){ini=j.continuar;continue;}
    if(!r.ok||!j||!j.ok){if(r.status>=500&&++tent<=4){await new Promise(s=>setTimeout(s,1500*tent));continue;}throw {msg:(j&&j.erro)||'Falha no envio ('+r.status+')'};}
    tent=0;if(j.anexo)return j.anexo;ini=j.recebido;prog&&prog(ini/file.size);
  }
}
/* caixa de anexos de um registro; tipos = [[chave,rótulo]] para separar (ex.: vídeo bruto × editado) */
function anexosBox(col,rec,op){op=op||ANX_OPCOES[col]||{};
  const tipos=op.tipos||[['','Arquivos']];const chave=col+'-'+rec.id;const lista=rec.anexos||[];
  const podeApagar=a=>ehAdmin()||norm(a.por)===meuEmail();
  return `<div class="anx" id="anx-${esc(chave)}">${tipos.map(([t,rot])=>{const its=lista.filter(a=>(a.tipo||'')===t);const k=chave+'|'+t;
    return `<div class="anx-grupo"><div class="anx-cab"><b>${esc(rot)}</b>${op.dica&&op.dica[t]?`<span class="small muted">${esc(op.dica[t])}</span>`:''}<span class="grow"></span>
      ${op.somenteLer?'':`<label class="btn btn-ghost btn-sm anx-add">📎 Anexar<input type="file" multiple hidden data-anexo="${esc(col)}|${esc(rec.id)}|${esc(t)}" ${op.aceitar&&op.aceitar[t]?`accept="${op.aceitar[t]}"`:''}></label>`}</div>
      ${ANX_ENVIANDO.get(k)?`<div class="anx-prog"><i style="width:${ANX_ENVIANDO.get(k).pct}%"></i><span>${esc(ANX_ENVIANDO.get(k).txt)}</span></div>`:''}
      ${its.map(a=>`<div class="anx-item"><span class="anx-ic">${anxIcone(a.mime)}</span><div class="grow"><a href="${anxUrl(a.id)}" data-act="anxVer" data-id="${esc(col)}|${esc(rec.id)}|${esc(a.id)}">${esc(a.nome)}</a><div class="small muted">${tamTxt(a.tamanho)} · ${esc(nomePorEmail(a.por))} · ${new Date(a.em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div></div>
        <a class="btn btn-ghost btn-sm" href="${anxUrl(a.id,1)}" title="Baixar" style="text-decoration:none">⬇</a>${podeApagar(a)&&!op.somenteLer?`<button class="btn btn-ghost btn-sm" data-act="anxApagar" data-id="${esc(col)}|${esc(rec.id)}|${esc(a.id)}" title="Apagar">🗑</button>`:''}</div>`).join('')||`<div class="small muted anx-vazio">${op.vazio||'Nenhum arquivo ainda'}</div>`}</div>`;}).join('')}</div>`;
}
const nomePorEmail=e=>db.usuarios.find(u=>norm(u.email)===norm(e))?.nome||e||'—';
function atualizarAnexosBox(col,id){const el=document.getElementById('anx-'+col+'-'+id);const rec=db[col]?.find(x=>x.id===id);if(!el||!rec)return;
  const tmp=document.createElement('div');tmp.innerHTML=anexosBox(col,rec);el.replaceWith(tmp.firstElementChild);}
const ANX_OPCOES={}; // opções por coleção (preenchido pelos módulos)
const ANX_DEPOIS={}; // ações depois de anexar, por coleção: fn(rec, anexo, tipo)
document.addEventListener('change',async ev=>{
  const inp=ev.target.closest&&ev.target.closest('input[data-anexo]');if(!inp||!inp.files.length)return;
  const [col,id,tipo]=inp.dataset.anexo.split('|');const arqs=[...inp.files];inp.value='';
  if(modo!=='servidor')return toast('Os anexos ficam guardados no servidor: funciona na versão hospedada. Na demonstração, use o link do Drive.',1);
  const k=col+'-'+id+'|'+tipo;
  for(const [i,f] of arqs.entries()){
    const rot=(arqs.length>1?`(${i+1}/${arqs.length}) `:'')+f.name;
    ANX_ENVIANDO.set(k,{pct:0,txt:'Enviando '+rot+'…'});atualizarAnexosBox(col,id);
    try{const a=await enviarAnexo(f,col,id,p=>{ANX_ENVIANDO.set(k,{pct:Math.round(p*100),txt:`Enviando ${rot}: ${Math.round(p*100)}% de ${tamTxt(f.size)}`});const bar=document.querySelector(`#anx-${CSS.escape(col+'-'+id)} .anx-prog`);if(bar){bar.querySelector('i').style.width=Math.round(p*100)+'%';bar.querySelector('span').textContent=ANX_ENVIANDO.get(k).txt;}});
      const rec=db[col].find(x=>x.id===id);if(rec){(rec.anexos=rec.anexos||[]).push({...a,tipo});ANX_DEPOIS[col]&&ANX_DEPOIS[col](rec,a,tipo);save();}
      toast('Arquivo anexado ✓ '+f.name);}
    catch(e){toast(e.msg||'Não foi possível enviar '+f.name,1);}
  }
  ANX_ENVIANDO.delete(k);atualizarAnexosBox(col,id);if(!$('#mbg.open'))render();
});
function verAnexo(a){
  const u=anxUrl(a.id);
  const corpo=/^video/.test(a.mime)?`<video src="${u}" controls playsinline preload="metadata" style="width:100%;max-height:70vh;background:#000;border-radius:8px"></video>`
    :/^image/.test(a.mime)?`<img src="${u}" alt="" style="max-width:100%;max-height:70vh;display:block;margin:auto;border-radius:8px">`
    :/^audio/.test(a.mime)?`<audio src="${u}" controls style="width:100%"></audio>`
    :/pdf/.test(a.mime)?`<iframe src="${u}" style="width:100%;height:70vh;border:0;border-radius:8px" title="${esc(a.nome)}"></iframe>`
    :`<div class="empty">Este tipo de arquivo não abre no navegador. Use o botão Baixar.</div>`;
  modal('📎 '+a.nome,`${corpo}<div class="small muted" style="margin-top:8px">${tamTxt(a.tamanho)} · enviado por ${esc(nomePorEmail(a.por))} em ${new Date(a.em).toLocaleString('pt-BR')}</div>`,
    [{l:'Fechar',c:'btn-ghost',fn:closeModal},{l:'⬇ Baixar',c:'btn-brand',fn:()=>{location.href=anxUrl(a.id,1);}}],true);
}
const ANX_ACOES={
  anxVer:k=>{const [col,id,aid]=k.split('|');const a=db[col]?.find(x=>x.id===id)?.anexos?.find(x=>x.id===aid);if(!a)return;
    if($('#mbg.open'))window.open(anxUrl(a.id),'_blank','noopener');else verAnexo(a);}, // com um formulário aberto, abre em outra aba para não perder o que foi digitado
  anxApagar:async k=>{const [col,id,aid]=k.split('|');const rec=db[col]?.find(x=>x.id===id);const a=rec?.anexos?.find(x=>x.id===aid);if(!a)return;
    if(!window.confirm('Apagar o arquivo "'+a.nome+'"? Não dá para desfazer.'))return;
    try{if(modo==='servidor')await api('anexoApagar',{id:aid});rec.anexos=rec.anexos.filter(x=>x.id!==aid);save();atualizarAnexosBox(col,id);if(!$('#mbg.open'))render();toast('Arquivo apagado');}
    catch(e){toast(e.msg||'Não foi possível apagar',1);}},
};
