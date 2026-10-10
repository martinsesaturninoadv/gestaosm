/* =========================================================
   IMPORTAR CONTATOS DO WHATSAPP (exportação do WaSpeed ou similar)
   - dois números: Salário-maternidade e Geral (o canal fica gravado no atendimento);
   - lê .xlsx ou .csv e reconhece as colunas pelo nome (nome, telefone, etiquetas…);
   - não duplica: o mesmo telefone (com ou sem 55 / 9º dígito) atualiza o atendimento existente;
   - quem já é cliente não vira atendimento.
   ========================================================= */
const CANAIS=['WhatsApp — Geral','WhatsApp — Salário-maternidade'];
const ehCanalSm=c=>/matern/i.test(c||'');
/* chave do telefone: DDD + 8 últimos dígitos (ignora +55 e o 9º dígito) */
function chaveTel(v){let d=digits(String(v??'').split('@')[0]);if(d.startsWith('55')&&d.length>=12)d=d.slice(2);if(d.startsWith('0'))d=d.slice(1);return d.length>=10?d.slice(0,2)+d.slice(-8):'';}
function lerContatosWa(rows){
  let h=-1;
  for(let i=0;i<Math.min(rows.length,15);i++){const r=(rows[i]||[]).map(x=>norm(String(x??'')));
    if(r.some(c=>/^(telefone|phone|numero|celular|whatsapp|fone|contato|number|id)/.test(c)))
      {h=i;break;}}
  const head=h>=0?rows[h]:[];const c=(...a)=>idxCol(head,...a);
  const ix={nome:c('nome','name','contato','contact','push'),tel:c('telefone','phone','numero','celular','whatsapp','fone','number','id'),
    etq:c('etiqueta','tag','label','funil','etapa','coluna','status'),email:c('e-mail','email'),obs:c('anotac','observ','nota','note','descri'),data:c('ultima','last','data','date','criad')};
  const corpo=rows.slice(h+1);
  // sem cabeçalho: acha a coluna com cara de telefone
  if(ix.tel<0&&corpo.length){const n=Math.max(...corpo.slice(0,20).map(r=>(r||[]).length));
    for(let j=0;j<n;j++)if(corpo.slice(0,20).filter(r=>r&&chaveTel(r[j])).length>=Math.min(3,corpo.length)){ix.tel=j;break;}
    if(ix.nome<0)ix.nome=ix.tel===0?1:0;}
  const s=(r,k)=>ix[k]>=0&&r[ix[k]]!=null?String(r[ix[k]]).trim():'';
  return corpo.filter(r=>r&&ix.tel>=0&&!/@g\.us/.test(String(r[ix.tel]??''))).map(r=>({nome:s(r,'nome'),telBruto:r[ix.tel],chave:chaveTel(r[ix.tel]),etiquetas:s(r,'etq'),email:s(r,'email'),obs:s(r,'obs'),data:ix.data>=0?parseData(r[ix.data]):''}))
    .filter(x=>x.chave);
}
function planoImportWa(contatos,canal){
  const leadsPor=new Map(),cliPor=new Set();
  db.leads.forEach(l=>{const k=chaveTel(l.tel);if(k&&!leadsPor.has(k))leadsPor.set(k,l);});
  db.clientes.forEach(c=>{const k=chaveTel(c.tel);if(k)cliPor.add(k);});
  const vistos=new Set(),novos=[],atual=[];let clientes=0,repetidos=0;
  contatos.forEach(x=>{if(vistos.has(x.chave)){repetidos++;return;}vistos.add(x.chave);
    if(cliPor.has(x.chave)){clientes++;return;}
    const l=leadsPor.get(x.chave);if(l)atual.push([l,x]);else novos.push(x);});
  return {novos,atual,clientes,repetidos,canal};
}
function aplicarImportWa(p){
  const hoje=today(),sm=ehCanalSm(p.canal),prodSm=db.produtos.find(x=>/matern/i.test(x))||'Salário-maternidade';
  p.novos.forEach(x=>{const d=x.data&&x.data<=hoje?x.data:hoje;
    db.leads.push({id:uid(),nome:x.nome||telTxt(x.telBruto)||'Contato do WhatsApp',tel:telTxt(digits(String(x.telBruto).split('@')[0]).replace(/^55(?=\d{10,11}$)/,'')),email:x.email,
      canal:p.canal,origem:'',produto:sm?prodSm:'',etapa:x.etiquetas?mapEtapa(x.etiquetas):'Novo contato',etiquetas:x.etiquetas,
      primeiroContato:d,ultimoContato:d,valor:0,proposta:'',obs:x.obs,criado:d,criadoPor:db.usuarioAtual||'',importadoWa:hoje});});
  p.atual.forEach(([l,x])=>{if(x.etiquetas){l.etiquetas=x.etiquetas;const e=mapEtapa(x.etiquetas);if(l.etapa==='Novo contato'&&e!=='Novo contato')l.etapa=e;}if(!l.canal)l.canal=p.canal;if(x.data&&x.data<=hoje&&x.data>(l.ultimoContato||''))l.ultimoContato=x.data;
    if(!l.nome||/^contato do whatsapp$/i.test(l.nome))l.nome=x.nome||l.nome;if(x.email&&!l.email)l.email=x.email;});
}
function importarWhatsApp(){
  const ult=db.escritorio.ultimaImportWa||{};
  modal('Importar contatos do WhatsApp',`<p class="small muted">Exporte os contatos no WaSpeed (planilha .xlsx ou .csv) e envie aqui. Contatos que já estão no CRM são <b>atualizados</b> (não duplicam) e quem já é cliente é ignorado.</p>
    <div class="imp-list">${CANAIS.map((c,i)=>`<label><input type="radio" name="wa-canal" value="${esc(c)}"${i===0?' checked':''}><span><b>${esc(c)}</b>${ult[c]?`última importação: ${fd(ult[c])}`:'ainda não importado'}${ehCanalSm(c)?' · os contatos entram com o produto Salário-maternidade':''}</span></label>`).join('')}</div>`,
    [{l:'Cancelar',c:'btn-ghost',fn:closeModal},{l:'Escolher planilha…',c:'btn-brand',fn:()=>{ui.waCanal=document.querySelector('input[name="wa-canal"]:checked').value;$('#file-wa').click();}}]);
}
async function lerArquivoWa(file){
  let rows;
  try{const X=await carregarXLSX();const buf=await file.arrayBuffer();let wb;
    if(/\.(csv|txt)$/i.test(file.name)){ // CSV: respeita acentos em UTF-8 ou no padrão do Excel (Windows-1252)
      let t=new TextDecoder('utf-8').decode(buf);if(t.includes('\uFFFD'))t=new TextDecoder('windows-1252').decode(buf);
      wb=X.read(t.replace(/^\uFEFF/,''),{type:'string',raw:true});}
    else wb=X.read(buf,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];rows=X.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});}
  catch(e){toast(e.message||'Não foi possível ler a planilha',1);return;}
  const canal=ui.waCanal||CANAIS[0];const contatos=lerContatosWa(rows);
  if(!contatos.length){toast('Não encontrei telefones nesta planilha. Confira se é a exportação de contatos.',1);return;}
  const p=planoImportWa(contatos,canal);
  modal('Importar — '+canal,`<p class="small muted">Arquivo: <b>${esc(file.name)}</b> · ${contatos.length} contato(s) com telefone</p>
    <dl class="dl" style="grid-template-columns:220px 1fr;margin-top:10px"><dt>Novos atendimentos</dt><dd><b>${p.novos.length}</b></dd><dt>Já estavam no CRM (atualizados)</dt><dd>${p.atual.length}</dd><dt>Já são clientes (ignorados)</dt><dd>${p.clientes}</dd><dt>Repetidos na planilha</dt><dd>${p.repetidos}</dd></dl>
    ${p.novos.length&&p.novos.some(x=>x.etiquetas)?`<label class="small" style="display:flex;gap:8px;margin-top:12px"><input type="checkbox" id="wa-so-etq"> Criar atendimento só para contatos <b>com etiqueta</b> (${p.novos.filter(x=>x.etiquetas).length} de ${p.novos.length}) — útil quando a exportação traz todos os contatos do celular</label>`:''}
    ${p.novos.length?`<div class="small muted" style="margin-top:10px">Exemplos: ${p.novos.slice(0,5).map(x=>esc(x.nome||telTxt(x.telBruto))).join(', ')}${p.novos.length>5?'…':''}</div>`:''}`,
    [{l:'Cancelar',c:'btn-ghost',fn:closeModal},{l:'Importar',c:'btn-brand',fn:()=>{if($('#wa-so-etq')?.checked)p.novos=p.novos.filter(x=>x.etiquetas);aplicarImportWa(p);db.escritorio.ultimaImportWa={...(db.escritorio.ultimaImportWa||{}),[canal]:today()};
      closeModal();save();render();toast(`${p.novos.length} novo(s) atendimento(s) · ${p.atual.length} atualizado(s) ✓`);}}]);
}
