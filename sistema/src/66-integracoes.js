/* =========================================================
   INTEGRAÇÕES: assinatura eletrônica (ZapSign), cobrança (Asaas), andamentos (Escavador) e peças com IA (Claude)
   As chaves ficam guardadas só no servidor (nunca vão para o navegador).
   ========================================================= */
let INTEG=null;
async function carregarIntegracoes(){
  if(modo!=='servidor'){INTEG={ok:true};return INTEG;}
  try{INTEG=await api('integracoes');}catch(e){INTEG={ok:false};}
  return INTEG;
}
const precisaServidor=()=>modo!=='servidor'?(toast('Esta função usa serviços externos e só funciona na versão hospedada.',1),true):false;
function b64DeBlob(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]);r.onerror=rej;r.readAsDataURL(blob);});}

/* ---------- configurações (somente administrador) ---------- */
function cardIntegracoes(){
  if(!ehAdmin())return '';
  if(!INTEG){carregarIntegracoes().then(()=>{if(ui.page==='config')render();});}
  const I=INTEG||{},m=I.mascaras||{};
  const campo=(k,l,ajuda)=>`<label class="full">${l}<input id="sg_${k}" type="password" autocomplete="off" placeholder="${m[k]?'configurado ('+esc(m[k])+') — deixe vazio para manter':'não configurado'}"><span class="small muted" style="font-weight:400">${ajuda}</span></label>`;
  return `<div class="card"><h3>🔌 Integrações (assinatura, cobrança, andamentos e IA)</h3>
    ${modo!=='servidor'?'<div class="hint">As integrações funcionam na versão hospedada.</div>':''}
    <div class="small muted" style="margin-bottom:6px">As chaves ficam guardadas só no servidor, e ninguém da equipe consegue vê-las depois de salvas. Para apagar uma chave, digite <b>-</b> no campo e salve.</div>
    <div class="fgrid">
      ${campo('zapsignToken','✍️ ZapSign — token da API',`app.zapsign.com.br → Configurações → Integração → Token de acesso. ${I.zapsign?'✅ ativa':''}`)}
      <label class="chk small full"><input type="checkbox" id="sg_zapsignSandbox"${I.zapsignSandbox?' checked':''}> ZapSign em modo de teste (sandbox)</label>
      ${campo('asaasToken','💳 Asaas — chave da API',`Asaas → Integrações → Chave de API. ${I.asaas?'✅ ativa':''}`)}
      ${campo('asaasWebhookToken','Asaas — token do webhook (você escolhe; cole o mesmo no Asaas)','Asaas → Integrações → Webhooks → "Token de autenticação". É o que dá baixa automática quando o cliente paga.')}
      <label class="chk small full"><input type="checkbox" id="sg_asaasSandbox"${I.asaasSandbox?' checked':''}> Asaas em modo de teste (sandbox)</label>
      ${campo('escavadorToken','⚖️ Escavador — token da API',`api.escavador.com → Tokens de acesso (serviço pago por consulta). ${I.escavador?'✅ ativo':''}`)}
      ${campo('anthropicKey','🤖 IA (Claude) — chave da API',`console.anthropic.com → API Keys (cobrança por uso). ${I.ia?'✅ ativa':''}`)}
    </div>
    ${I.webhooks?`<div class="small" style="margin-top:10px;line-height:1.7"><b>Endereços para colar nos serviços (webhooks):</b><br>Asaas: <code style="word-break:break-all">${esc(I.webhooks.asaas)}</code><br>ZapSign: <code style="word-break:break-all">${esc(I.webhooks.zapsign)}</code></div>`:''}
    <div class="mfoot"><button class="btn btn-brand" data-act="sgSalvar">Salvar integrações</button></div></div>`;
}

/* ---------- ZapSign ---------- */
function assinarDocumento(){
  if(precisaServidor())return;
  if(!INTEG?.zapsign)return toast('Configure a ZapSign em Configurações → Integrações.',1);
  const f=ui.f.doc||{};const c=cli(f.mcli)||{};
  const linhas=[{nome:c.nome||'',email:c.email||'',tel:c.tel||''},{nome:'',email:'',tel:''}];
  modal('✍️ Enviar para assinatura (ZapSign)',`<p class="small muted">O documento da folha (com o papel timbrado) vai para a ZapSign. Cada pessoa recebe o link para assinar pelo celular. Deixe em branco as linhas que não usar.</p>
    ${linhas.map((s,i)=>`<div class="fgrid" style="grid-template-columns:2fr 2fr 1.4fr;margin-top:8px"><label>Signatário ${i+1}<input id="zs_n${i}" value="${esc(s.nome)}"></label><label>E-mail<input id="zs_e${i}" type="email" value="${esc(s.email)}"></label><label>WhatsApp<input id="zs_t${i}" value="${esc(s.tel)}"></label></div>`).join('')}
    <label class="small" style="display:block;margin-top:10px">Nome do documento<input id="zs_nome" value="${esc(nomeArquivoDoc())}" style="width:100%"></label>`,
    [{l:'Cancelar',c:'btn-ghost',fn:closeModal},{l:'Enviar para assinatura',c:'btn-brand',fn:async()=>{
      const sig=[0,1].map(i=>({nome:$('#zs_n'+i).value.trim(),email:$('#zs_e'+i).value.trim(),tel:$('#zs_t'+i).value.trim()})).filter(s=>s.nome);
      if(!sig.length)return toast('Informe ao menos um signatário',1);const nome=$('#zs_nome').value.trim()||'Documento';
      try{toast('Enviando para a ZapSign…');const docx=await b64DeBlob(await gerarDocx());const id=uid();
        const r=await api('zapsign',{nome,docx,signatarios:sig,documentoId:id});
        db.documentos.push({id,clienteId:f.mcli||'',nome:'✍️ '+nome+' (assinatura eletrônica)',recebido:false,obs:'',criado:today(),assinatura:{servico:'zapsign',token:r.token,status:r.status,signatarios:r.signatarios,enviadoEm:today()}});
        save();closeModal();mostrarLinksAssinatura(id);}
      catch(e){toast(e.msg||e.message||'Não foi possível enviar',1);}}}]);
}
function mostrarLinksAssinatura(docId){
  const d=db.documentos.find(x=>x.id===docId);const a=d?.assinatura;if(!a)return;const c=cli(d.clienteId);
  modal('✍️ Links de assinatura',`<p class="small muted">Situação: <b>${esc(statusAss(a.status))}</b>. Quem tem e-mail recebe o link automaticamente. Envie também pelo WhatsApp:</p>
    ${(a.signatarios||[]).map(s=>{const txt=`Olá, ${(s.nome||'').split(' ')[0]}! Segue o link para assinar o documento "${d.nome.replace(/^✍️ | \(assinatura eletrônica\)$/g,'')}" pelo celular: ${s.url}`;
      const tel=s.nome===c?.nome?c?.tel:'';return `<div class="ev"><div class="body"><div class="t">${esc(s.nome)}</div><div class="small muted">${esc(statusAss(s.status))}</div></div><div class="flx">${s.url?`<button class="btn btn-ghost btn-sm" data-act="portalCopiar" data-id="${esc(s.url)}">Copiar link</button>${tel?`<a class="btn btn-sm" style="background:#1F9D55;color:#fff;text-decoration:none" target="_blank" rel="noopener" href="${esc(waLink(tel,txt))}">WhatsApp</a>`:''}`:''}</div></div>`;}).join('')}`,
    [{l:'Fechar',c:'btn-ghost',fn:closeModal},{l:'↻ Atualizar situação',c:'btn-brand',fn:()=>A.assStatus(docId)}]);
}
const statusAss=s=>({pending:'aguardando assinaturas',new:'aguardando',signed:'✅ assinado',refused:'recusado',link_opened:'link aberto'}[s]||s||'—');

/* ---------- Asaas ---------- */
async function cobrarAsaas(lid){
  if(precisaServidor())return;
  if(!INTEG?.asaas)return toast('Configure o Asaas em Configurações → Integrações.',1);
  const l=db.lancamentos.find(x=>x.id===lid);if(!l)return;
  if(!l.cobranca&&!await confirmar(`Gerar a cobrança de ${brl(l.valor)} (PIX, boleto ou cartão) para ${nomeCli(l.clienteId)} com vencimento em ${fd(l.venc)}?`,'Gerar cobrança'))return;
  try{if(!l.cobranca){toast('Gerando a cobrança no Asaas…');await enviarAgora();const r=await api('asaas',{lancamentoId:lid});l.cobranca=r.cobranca;save();render();}
    const c=cli(l.clienteId);const txt=`Olá, ${(c?.nome||'').split(' ')[0]}! Segue o link para pagamento de ${l.descricao} (${brl(l.valor)}, vencimento ${fd(l.venc)}) por PIX, boleto ou cartão: ${l.cobranca.link}`;
    modal('💳 Cobrança gerada',`<p class="small muted">Quando o cliente pagar, a parcela é baixada sozinha no sistema (pelo webhook do Asaas).</p><input readonly value="${esc(l.cobranca.link)}" style="width:100%;margin:10px 0" onclick="this.select()">
      <div class="flx">${botoesEnvio(c,txt,'Pagamento de honorários','noop','')}<button class="btn btn-ghost btn-sm" data-act="portalCopiar" data-id="${esc(l.cobranca.link)}">Copiar link</button></div>`,[{l:'Fechar',c:'btn-ghost',fn:closeModal}]);}
  catch(e){toast(e.msg||e.message||'Não foi possível gerar a cobrança',1);}
}
/* manda já as alterações pendentes (o servidor precisa ter o lançamento antes de cobrar) */
async function enviarAgora(){clearTimeout(tEnvio);enviar();for(let i=0;i<100&&(enviando||pendente);i++)await new Promise(r=>setTimeout(r,100));}

/* ---------- Escavador ---------- */
async function andamentosEscavador(pid){
  if(precisaServidor())return;
  if(!INTEG?.escavador)return toast('Configure o Escavador em Configurações → Integrações.',1);
  const p=proc(pid);if(!p)return;
  try{toast('Consultando o Escavador…');const r=await api('escavador',{numero:p.numero});
    const tem=new Set((p.andamentos||[]).map(a=>a.data+'|'+norm(a.texto).slice(0,80)));let n=0;
    (r.movimentacoes||[]).forEach(m=>{if(!m.texto)return;const k=(m.data||today())+'|'+norm(m.texto).slice(0,80);if(tem.has(k))return;tem.add(k);
      (p.andamentos=p.andamentos||[]).push({id:uid(),data:m.data||today(),texto:m.texto+(m.fonte?` (${m.fonte})`:''),autor:'',origem:'escavador'});n++;});
    p.escavadorEm=today();save();render();toast(n?`${n} andamento(s) novo(s) ✓`:'Nenhum andamento novo');}
  catch(e){toast(e.msg||e.message||'Falha na consulta',1);}
}

/* ---------- Peças com IA ---------- */
const PECAS_IA=[['inicial_sm','Petição inicial — salário-maternidade (JEF)','Redija a petição inicial de concessão de salário-maternidade contra o INSS no Juizado Especial Federal, com pedido de tutela quando cabível.'],
  ['recurso_inss','Recurso administrativo ao INSS (CRPS)','Redija o recurso ordinário à Junta de Recursos do CRPS contra o indeferimento do benefício.'],
  ['inicial_pix','Petição inicial — golpe do PIX / fraude bancária','Redija a petição inicial de ação de restituição e indenização por danos morais contra a instituição financeira (golpe do PIX / fraude), com pedido de tutela de urgência e inversão do ônus da prova (CDC).'],
  ['notificacao','Notificação extrajudicial','Redija uma notificação extrajudicial.'],['contestacao','Contestação','Redija a contestação.'],
  ['manifestacao','Manifestação / petição intermediária','Redija a petição intermediária.'],['livre','Outro (descreva abaixo)','']];
function contextoIA(cid,pid,smId){
  const c=cli(cid)||{},p=proc(pid),s=db.sm.find(x=>x.id===smId)||db.sm.find(x=>x.clienteId===cid),e=db.escritorio;
  const ctx=contextoModelo(cid,pid,'',0,'');const L=[];
  L.push(`Escritório: ${e.nome}${e.oab?' (OAB '+e.oab+')':''}; advogados: ${ctx.advogados}; cidade: ${e.cidade||''}.`);
  if(c.nome)L.push(`Cliente: ${ctx.qualificacao}.${c.nascimento?' Nascimento: '+fd(c.nascimento)+'.':''}${c.sexo?' Sexo: '+c.sexo+'.':''}${c.renda?' Renda: '+brl(c.renda)+'.':''}`);
  if(p)L.push(`Processo: ${p.numero} — ${p.tipo}, área ${p.area}, órgão ${p.orgao||'-'}, parte contrária ${p.parteContraria||'-'}, objeto: ${p.objeto||'-'}, fase: ${p.fase}. Valor da causa: ${p.valorCausa?brl(p.valorCausa):'-'}. Últimos andamentos: ${(p.andamentos||[]).slice(-5).map(a=>fd(a.data)+' '+a.texto).join(' | ')||'-'}.`);
  if(s){const pg=(s.guias||[]).filter(g=>g.pagaEm);L.push(`Caso de salário-maternidade: categoria ${s.categoria}; estratégia ${s.estrategia||'-'}; etapa ${s.status}; ${s.dataParto?'parto em '+fd(s.dataParto):'DPP '+fd(s.dpp)}${s.crianca?' (criança: '+s.crianca+')':''}; carência exigida ${s.carenciaMeses||0} meses; contribuições pagas: ${pg.length}${pg.length?' ('+pg.map(g=>mLabel(g.competencia)).join(', ')+')':''}; qualidade de segurada até ${fd(s.qualidadeAte)}; NB ${s.nb||'-'}; DER ${fd(s.der)}; benefício estimado ${brl(s.beneficioEstimado)}. Observações: ${s.obs||'-'}.`);}
  return L.join('\n');
}
function htmlPecasIA(tabs){
  const f=ui.f.ia||(ui.f.ia={tipo:'inicial_sm',cli:'',proc:'',instr:''});
  const procs=db.processos.filter(p=>!f.cli||p.clienteId===f.cli);
  return tabs+`<div class="grid g-2"><div class="card"><h3>🤖 Gerar peça com IA</h3>
    <div class="fgrid" style="grid-template-columns:1fr">
      <label>Tipo de peça<select data-f="ia.tipo">${PECAS_IA.map(([k,l])=>`<option value="${k}"${f.tipo===k?' selected':''}>${esc(l)}</option>`).join('')}</select></label>
      <label>Cliente<select data-f="ia.cli"><option value="">—</option>${O.clientes().map(([id,n])=>`<option value="${id}"${f.cli===id?' selected':''}>${esc(n)}</option>`).join('')}</select></label>
      <label>Processo (opcional)<select data-f="ia.proc"><option value="">—</option>${procs.map(p=>`<option value="${p.id}"${f.proc===p.id?' selected':''}>${esc(p.numero)} — ${esc(p.objeto||'')}</option>`).join('')}</select></label>
      <label>Instruções e fatos importantes<textarea id="ia-instr" rows="6" placeholder="Ex.: segurada desempregada, último vínculo até 03/2025, parto em 10/08/2026, INSS indeferiu por falta de qualidade de segurada…">${esc(f.instr||'')}</textarea></label>
    </div>
    <div class="exp-btns"><button class="btn btn-brand" data-act="iaGerar">✨ Gerar minuta</button></div>
    <div class="small muted" style="margin-top:10px">A minuta abre no <b>Gerador de documentos</b>, já no papel timbrado, para você revisar e editar antes de baixar em Word/PDF ou enviar para assinatura. <b>Sempre revise</b>: a IA pode errar. Os dados do cliente selecionado são enviados ao serviço de IA (Anthropic) apenas para gerar o texto.</div></div>
    <div class="card"><h3>O que vai para a IA</h3><pre class="small" style="white-space:pre-wrap;margin:0;max-height:420px;overflow:auto">${esc(f.cli?contextoIA(f.cli,f.proc):'Escolha o cliente para ver os dados que serão usados.')}</pre></div></div>`;
}
async function gerarPecaIA(){
  if(precisaServidor())return;
  if(!INTEG?.ia)return toast('Configure a chave da IA em Configurações → Integrações.',1);
  const f=ui.f.ia;f.instr=$('#ia-instr').value;const tp=PECAS_IA.find(x=>x[0]===f.tipo)||PECAS_IA[0];
  if(!f.cli&&f.tipo!=='livre')return toast('Escolha o cliente',1);
  const pedido=[tp[2],f.instr?'Instruções do advogado: '+f.instr:''].filter(Boolean).join('\n');
  if(!pedido.trim())return toast('Descreva a peça nas instruções',1);
  const b=document.querySelector('[data-act="iaGerar"]');if(b){b.disabled=true;b.textContent='Gerando… (pode levar 1 a 2 minutos)';}
  try{const r=await api('ia',{pedido,contexto:f.cli?contextoIA(f.cli,f.proc):''});
    ui.f.doc={...(ui.f.doc||{}),modelo:'__ia',iaTexto:r.texto,iaNome:tp[1],mcli:f.cli,mproc:f.proc};ui.tabDoc='gerador';render();
    toast(r.cortado?'Minuta gerada (ficou longa e pode ter sido cortada no fim)':'Minuta gerada ✓ Revise antes de usar',r.cortado?1:0);}
  catch(e){toast(e.msg||e.message||'Falha ao gerar',1);if(b){b.disabled=false;b.textContent='✨ Gerar minuta';}}
}

const INTEG_ACOES={
  sgSalvar:async()=>{const b={};['zapsignToken','asaasToken','asaasWebhookToken','escavadorToken','anthropicKey'].forEach(k=>b[k]=$('#sg_'+k).value.trim());
    b.zapsignSandbox=$('#sg_zapsignSandbox').checked;b.asaasSandbox=$('#sg_asaasSandbox').checked;
    if(precisaServidor())return;
    try{await api('segredos',b);await carregarIntegracoes();render();toast('Integrações salvas ✓');}catch(e){toast(e.msg||'Não foi possível salvar',1);}},
  docAssinar:()=>assinarDocumento(),
  assLinks:id=>mostrarLinksAssinatura(id),
  assStatus:async id=>{const d=db.documentos.find(x=>x.id===id);if(!d?.assinatura||precisaServidor())return;
    try{const r=await api('zapsignStatus',{token:d.assinatura.token});d.assinatura.status=r.status;d.assinatura.signatarios=r.signatarios.length?r.signatarios:d.assinatura.signatarios;
      if(r.status==='signed'){d.recebido=true;d.data=today();if(r.signed_file)d.link=r.signed_file;}save();closeModal();render();toast('Situação: '+statusAss(r.status));}
    catch(e){toast(e.msg||'Falha ao consultar',1);}},
  asaasCobrar:id=>cobrarAsaas(id),
  escavador:id=>andamentosEscavador(id),
  iaGerar:()=>gerarPecaIA(),
  noop:()=>{},
};
