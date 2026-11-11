/* =========================================================
   FUNIL EDITÁVEL, ORIGEM DO ANÚNCIO, RELATÓRIO POR ANÚNCIO
   e o painel "API e conector do Claude" (chaves, WaSpeed, OAuth, migração)
   ========================================================= */
const TIPOS_DOC_GERADO={procuracao:'Procuração',declaracao_hipossuficiencia:'Declaração de hipossuficiência',contrato_honorarios:'Contrato de honorários',outro:'Outro'};
const chaveCodigo=c=>{const m=String(c||'').toUpperCase().trim().match(/^([A-Z]{2,5})-(\d+)$/);return m?m[1]+'-'+(+m[2]):String(c||'').toUpperCase().trim();};
const anuncioPorCodigo=c=>c?db.anuncios.find(a=>chaveCodigo(a.codigo)===chaveCodigo(c)):null;
/* mesmo critério do servidor: [BPC-01] com colchetes vale sempre; sem colchetes, só se o código estiver cadastrado */
function codigoDaMensagem(txt){
  txt=String(txt||'');let m=txt.match(/\[\s*([A-Za-z]{2,5})\s*[-–_]\s*(\d{1,3})\s*\]/);if(m)return m[1].toUpperCase()+'-'+m[2];
  const re=/(^|[^A-Za-z0-9])([A-Za-z]{2,5})\s?[-–]\s?(\d{1,3})(?![0-9])/g;while((m=re.exec(txt))){const c=m[2].toUpperCase()+'-'+m[3];if(anuncioPorCodigo(c))return c;}
  return '';
}
/* preenche campanha, conjunto, anúncio e origem a partir do código */
function aplicarAnuncio(l){
  const a=anuncioPorCodigo(l.codigoAnuncio);
  if(a){l.codigoAnuncio=a.codigo;['campanha','conjunto','anuncio'].forEach(k=>{if(a[k])l[k]=a[k];});if(!l.produto&&a.area)l.produto=a.area;if(!l.plataforma)l.plataforma=a.plataforma||'Meta';}
  if(l.codigoAnuncio){if(!l.origem||l.origem===ORIGEM_ORGANICA)l.origem=/google/i.test(l.plataforma||'')?'Google Ads':'Facebook / Instagram Ads';}
  else if(!l.origem)l.origem=ORIGEM_ORGANICA;
}
function registrarEtapaLead(l,de,para,motivo){
  if(de===para)return;const u=db.usuarios.find(x=>x.id===db.usuarioAtual);
  (l.historicoEtapas=l.historicoEtapas||[]).push({de:de||'',para,data:today(),em:Date.now(),por:u?.nome||sessao?.nome||'',origem:'tela',motivo:motivo||''});
}
function pedirMotivoPerda(l,col){
  modal('Mover para "'+col+'"',`<p class="small">Por que este atendimento não fechou? O motivo aparece nos relatórios.</p>
    <div class="flx" style="flex-wrap:wrap;gap:6px;margin-bottom:8px">${['Achou caro','Não tem direito','Sem retorno','Fechou com outro escritório','Desistiu','Fora da nossa área'].map(m=>`<button class="btn btn-ghost btn-sm" type="button" onclick="document.getElementById('mp-txt').value=this.textContent">${m}</button>`).join('')}</div>
    <textarea id="mp-txt" rows="2" style="width:100%" placeholder="Motivo">${esc(l.motivoPerda||'')}</textarea>`,
    [{l:'Cancelar',c:'btn-ghost',fn:()=>{closeModal();render();}},{l:'Confirmar',c:'btn-danger-solid',fn:()=>{const m=$('#mp-txt').value.trim();if(!m)return toast('Informe o motivo',1);
      registrarEtapaLead(l,l.etapa,col,m);l.etapa=col;l.motivoPerda=m;l.dataFechamento='';l.ultimoContato=today();closeModal();save();render();toast('Movido para "'+col+'"');}}]);
}
function htmlLeadHistorico(l){
  const h=(l.historicoEtapas||[]).slice(-12).reverse(),its=(l.interacoes||[]).slice().reverse();
  return `<div class="lead-hist" id="lead-hist-${esc(l.id)}"><div class="dgroup" style="margin:8px 0 4px">💬 Interações</div>
    ${its.map(i=>`<div class="ev"><span class="pic">💬</span><div class="body small"><b>${fd(i.data)}</b> · ${esc(i.canal||'')}${i.por?' · '+esc(i.por):''}<div>${esc(i.resumo)}</div>${i.proximoPasso?`<div class="muted">➜ ${esc(i.proximoPasso)}${i.dataFollowUp?' até '+fd(i.dataFollowUp):''}</div>`:''}</div></div>`).join('')||'<div class="small muted">Nenhuma interação registrada</div>'}
    <div class="fgrid" style="margin-top:6px"><label class="full">Nova interação<input id="li-resumo" placeholder="Resumo da conversa"></label><label>Próximo passo<input id="li-prox"></label><label>Retomar em (cria tarefa)<input id="li-follow" type="date"></label></div>
    <button class="btn btn-ghost btn-sm" type="button" data-act="leadAddInt" data-id="${esc(l.id)}">+ Registrar interação</button>
    <div class="dgroup" style="margin:12px 0 4px">↔ Histórico de etapas</div>
    ${h.map(x=>`<div class="small" style="padding:3px 0">${fd(x.data)} · ${esc(x.de||'—')} → <b>${esc(x.para)}</b>${x.motivo?' ('+esc(x.motivo)+')':''} <span class="muted">· ${esc(x.por||'')}${x.origem&&x.origem!=='tela'?' via '+esc(x.origem):''}</span></div>`).join('')||'<div class="small muted">Sem mudanças registradas</div>'}</div>`;
}

/* ---------- etapas do funil (editáveis) ---------- */
function editFunil(){
  const linhas=funil().map(e=>({...e,orig:e.nome}));
  const desenhar=()=>{$('#fn-lista').innerHTML=linhas.map((e,i)=>`<div class="fn-linha"><span class="small muted">${i+1}</span><input data-fn="${i}" value="${esc(e.nome)}">
    <select data-fnt="${i}">${TIPOS_ETAPA.map(([k,l])=>`<option value="${k}"${e.tipo===k?' selected':''}>${l}</option>`).join('')}</select>
    <button type="button" class="btn btn-ghost btn-sm" data-fnm="${i}|-1">▲</button><button type="button" class="btn btn-ghost btn-sm" data-fnm="${i}|1">▼</button><button type="button" class="btn btn-ghost btn-sm" data-fnx="${i}">✕</button>
    <span class="small muted">${db.leads.filter(l=>l.etapa===e.orig).length||''}</span></div>`).join('');};
  const ler=()=>{document.querySelectorAll('[data-fn]').forEach(el=>linhas[+el.dataset.fn].nome=el.value.trim());document.querySelectorAll('[data-fnt]').forEach(el=>linhas[+el.dataset.fnt].tipo=el.value);};
  modal('⚙ Etapas do funil de atendimento',`<p class="small muted">A primeira etapa recebe os leads novos (inclusive os que chegam pela API e pelo WaSpeed). O tipo diz o que a etapa significa: <b>ganho</b> conta como cliente fechado, <b>perdido</b> pede o motivo. Renomear muda a etapa dos leads junto. O número à direita é quantos leads estão na etapa.</p>
    <div id="fn-lista"></div><button type="button" class="btn btn-ghost btn-sm" id="fn-add">+ Etapa</button>`,
    [{l:'Cancelar',c:'btn-ghost',fn:closeModal},{l:'Salvar etapas',c:'btn-brand',fn:()=>{ler();
      const nomes=linhas.map(e=>e.nome);if(nomes.some(n=>!n))return toast('Dê nome a todas as etapas',1);
      if(new Set(nomes.map(norm)).size!==nomes.length)return toast('Há etapas com o mesmo nome',1);
      if(!linhas.some(e=>e.tipo==='ganho')||!linhas.some(e=>e.tipo==='perdido'))return toast('Precisa existir pelo menos uma etapa de ganho e uma de perda',1);
      if(linhas[0].tipo!=='andamento')return toast('A primeira etapa deve ser do tipo "Em andamento"',1);
      const removidas=funil().filter(e=>!linhas.some(x=>x.orig===e.nome)).map(e=>e.nome).filter(n=>db.leads.some(l=>l.etapa===n));
      if(removidas.length)return toast('Antes de remover "'+removidas.join('", "')+'", mova os leads que estão nela',1);
      linhas.forEach(e=>{if(e.orig&&e.orig!==e.nome)db.leads.forEach(l=>{if(l.etapa===e.orig)l.etapa=e.nome;});});
      db.funil={etapas:linhas.map(({nome,tipo})=>({nome,tipo}))};closeModal();save();render();toast('Etapas salvas ✓');}}]);
  desenhar();
  $('#fn-add').onclick=()=>{ler();linhas.splice(Math.max(1,linhas.findIndex(e=>e.tipo!=='andamento')),0,{nome:'Nova etapa',tipo:'andamento',orig:''});desenhar();};
  $('#fn-lista').onclick=ev=>{const m=ev.target.closest('[data-fnm]'),x=ev.target.closest('[data-fnx]');if(!m&&!x)return;ler();
    if(m){const [i,d]=m.dataset.fnm.split('|').map(Number);const j=i+d;if(j<0||j>=linhas.length)return;[linhas[i],linhas[j]]=[linhas[j],linhas[i]];}
    if(x){if(linhas.length<=3)return toast('O funil precisa de pelo menos 3 etapas',1);linhas.splice(+x.dataset.fnx,1);}desenhar();};
}

/* ---------- anúncios e relatório ---------- */
function editAnuncio(id){
  const a=id?db.anuncios.find(x=>x.id===id):{plataforma:'Meta',inicio:today()};
  form(id?'Anúncio '+a.codigo:'Novo anúncio',[
    {k:'codigo',l:'Código',req:1,ph:'ex.: BPC-01',dica:'2 a 5 letras, hífen e 2 ou 3 números. Vai na mensagem pré-preenchida do anúncio.'},{k:'plataforma',l:'Plataforma',list:['Meta','Instagram','Facebook','Google','TikTok']},
    {k:'campanha',l:'Campanha',req:1,list:()=>[...new Set(db.anuncios.map(x=>x.campanha).concat(db.trafego.map(t=>t.campanha)).filter(Boolean))].sort()},{k:'conjunto',l:'Conjunto de anúncios'},
    {k:'anuncio',l:'Anúncio (nome do criativo)'},{k:'area',l:'Área do direito',t:'select',o:O.produtos},
    {k:'inicio',l:'Início da veiculação',t:'date'},{k:'fim',l:'Fim da veiculação',t:'date'},
    {k:'investimento',l:'Investimento total (R$)',t:'number',vazio:'',dica:'Opcional: permite calcular o custo por lead e por cliente fechado.'},
    {k:'mensagem',l:'Mensagem pré-preenchida do WhatsApp',full:1,dica:'Cole esta frase no anúncio da Meta (botão "Enviar mensagem").'},{k:'obs',l:'Observações',t:'textarea',full:1,rows:2}],
    a,v=>{v.codigo=String(v.codigo||'').toUpperCase().replace(/\s/g,'');if(!/^[A-Z]{2,5}-\d{2,3}$/.test(v.codigo)){toast('Código inválido. Exemplo: BPC-01',1);return false;}
      const dup=db.anuncios.find(x=>x.id!==id&&chaveCodigo(x.codigo)===chaveCodigo(v.codigo));if(dup){toast('Já existe o anúncio '+dup.codigo,1);return false;}
      if(!v.mensagem)v.mensagem='Olá! Vim pelo anúncio ['+v.codigo+']';
      upsert('anuncios',id,v,{criado:today()});
      db.leads.forEach(l=>{if(!l.codigoAnuncio&&l.primeiraMensagem){const c=codigoDaMensagem(l.primeiraMensagem);if(c&&chaveCodigo(c)===chaveCodigo(v.codigo)){l.codigoAnuncio=c;aplicarAnuncio(l);}}});},
    id&&(()=>{db.anuncios=db.anuncios.filter(x=>x.id!==id);}));
}
function relatorioAnuncios(desde,ate){
  const linhas={},camp={};const ini=(k,b)=>linhas[k]||(linhas[k]={...b,leads:0,fechados:0,perdidos:0,andamento:0});
  db.anuncios.forEach(a=>ini(chaveCodigo(a.codigo),{codigo:a.codigo,campanha:a.campanha||'',conjunto:a.conjunto||'',anuncio:a.anuncio||'',investimento:+a.investimento||0,id:a.id}));
  db.leads.forEach(l=>{const d=l.primeiroContato||l.criado||'';if((desde&&d<desde)||(ate&&d>ate))return;
    const k=l.codigoAnuncio?chaveCodigo(l.codigoAnuncio):ORIGEM_ORGANICA;const r=ini(k,{codigo:l.codigoAnuncio||ORIGEM_ORGANICA,campanha:l.campanha||'',conjunto:l.conjunto||'',anuncio:l.anuncio||'',investimento:0});
    r.leads++;const t=tipoEtapa(l.etapa);if(t==='ganho'||l.convertido)r.fechados++;else if(t==='perdido'||t==='parceiro')r.perdidos++;else r.andamento++;});
  const ls=Object.values(linhas).map(r=>({...r,taxa:r.leads?r.fechados/r.leads*100:0}));
  ls.forEach(r=>{const c=r.codigo===ORIGEM_ORGANICA?ORIGEM_ORGANICA:r.campanha||'Sem campanha cadastrada';const x=camp[c]||(camp[c]={campanha:c,anuncios:0,leads:0,fechados:0,perdidos:0,investimento:0});
    x.anuncios++;['leads','fechados','perdidos','investimento'].forEach(k=>x[k]+=r[k]);});
  return {anuncios:ls.sort((a,b)=>b.leads-a.leads||String(a.codigo).localeCompare(b.codigo)),campanhas:Object.values(camp).map(c=>({...c,taxa:c.leads?c.fechados/c.leads*100:0})).sort((a,b)=>b.leads-a.leads)};
}
V.anuncios=()=>{
  const f=ui.f.anu||(ui.f.anu={ver:'relatorio',desde:addDays(-90),ate:''});
  const r=relatorioAnuncios(f.desde,f.ate);const tl=sumBy(r.anuncios,x=>x.leads),tf=sumBy(r.anuncios,x=>x.fechados);
  const fin=podeFin();const cpc=x=>fin&&x.investimento&&x.fechados?brl(x.investimento/x.fechados):'—';
  const tab=`<div class="tabs" style="margin:0;border:none">${[['relatorio','📊 Relatório por anúncio'],['lista','📣 Anúncios cadastrados']].map(([k,l])=>`<button class="tab ${f.ver===k?'active':''}" data-act="anuVer" data-id="${k}">${l}</button>`).join('')}</div>`;
  const filtro=`<label class="small">De <input type="date" data-f="anu.desde" value="${esc(f.desde)}"></label><label class="small">até <input type="date" data-f="anu.ate" value="${esc(f.ate)}"></label>`;
  const barra=(v,max)=>`<div class="barra-mini"><i style="width:${max?Math.round(v/max*100):0}%"></i></div>`;const maxL=Math.max(1,...r.anuncios.map(x=>x.leads));
  const corpo=f.ver==='lista'?`<div class="card tbl"><table><thead><tr><th>Código</th><th>Campanha</th><th>Conjunto</th><th>Anúncio</th><th>Área</th><th>Veiculação</th>${fin?'<th class="num">Investimento</th>':''}<th>Mensagem pré-preenchida</th></tr></thead><tbody>
      ${db.anuncios.slice().sort((a,b)=>a.codigo.localeCompare(b.codigo)).map(a=>`<tr data-act="editAnuncio" data-id="${a.id}" style="cursor:pointer"><td class="strong">${esc(a.codigo)}</td><td>${esc(a.campanha||'')}</td><td>${esc(a.conjunto||'')}</td><td>${esc(a.anuncio||'')}</td><td>${esc(a.area||'')}</td>
        <td class="small">${fd(a.inicio)}${a.fim?' a '+fd(a.fim):a.inicio?' →':''}</td>${fin?`<td class="num">${a.investimento?brl(+a.investimento):'—'}</td>`:''}<td class="small"><code>${esc(a.mensagem||'')}</code></td></tr>`).join('')||`<tr><td colspan="8" class="empty">Nenhum anúncio. Cadastre cada anúncio da Meta com um código (ex.: BPC-01) e use a mensagem pré-preenchida.</td></tr>`}</tbody></table></div>`
    :`<div class="grid g-kpi">${kpi('Leads no período',tl)}${kpi('Clientes fechados',tf)}${kpi('Taxa de conversão',(tl?num(tf/tl*100,1):0)+'%')}${kpi('Sem anúncio identificado',r.anuncios.find(x=>x.codigo===ORIGEM_ORGANICA)?.leads||0,ORIGEM_ORGANICA)}</div>
    <div class="card tbl"><h3>Por anúncio</h3><table><thead><tr><th>Código</th><th>Campanha / anúncio</th><th class="num">Leads</th><th></th><th class="num">Fechados</th><th class="num">Perdidos</th><th class="num">Conversão</th>${fin?'<th class="num">Custo por cliente</th>':''}</tr></thead><tbody>
      ${r.anuncios.map(x=>`<tr><td class="strong">${esc(x.codigo)}</td><td>${esc(x.campanha)}<div class="small muted">${esc([x.conjunto,x.anuncio].filter(Boolean).join(' · '))}</div></td><td class="num">${x.leads}</td><td style="width:120px">${barra(x.leads,maxL)}</td><td class="num">${x.fechados}</td><td class="num">${x.perdidos}</td><td class="num strong">${num(x.taxa,1)}%</td>${fin?`<td class="num">${cpc(x)}</td>`:''}</tr>`).join('')||'<tr><td colspan="8" class="empty">Sem leads no período</td></tr>'}</tbody></table></div>
    <div class="card tbl"><h3>Por campanha</h3><table><thead><tr><th>Campanha</th><th class="num">Anúncios</th><th class="num">Leads</th><th class="num">Fechados</th><th class="num">Conversão</th>${fin?'<th class="num">Investimento</th><th class="num">Custo por cliente</th>':''}</tr></thead><tbody>
      ${r.campanhas.map(c=>`<tr><td class="strong">${esc(c.campanha)}</td><td class="num">${c.anuncios}</td><td class="num">${c.leads}</td><td class="num">${c.fechados}</td><td class="num strong">${num(c.taxa,1)}%</td>${fin?`<td class="num">${c.investimento?brl(c.investimento):'—'}</td><td class="num">${cpc(c)}</td>`:''}</tr>`).join('')}</tbody></table></div>`;
  return `<div class="toolbar">${tab}<span class="grow"></span>${f.ver==='relatorio'?filtro:''}<button class="btn btn-gold" data-act="novoAnuncio">+ Anúncio</button></div>
    <div class="hint">Cada anúncio da Meta leva uma mensagem pré-preenchida com o código, por exemplo <code>Olá! Vim pelo anúncio [BPC-01]</code>. O sistema lê o código na primeira mensagem do lead (pela API, pelo WaSpeed ou digitado aqui) e preenche campanha, conjunto e anúncio. Sem código, a origem fica "${ORIGEM_ORGANICA}".</div>${corpo}`;
};

/* ---------- cliente: documentos gerados (links do Google Docs) ---------- */
function htmlDocsGerados(c){
  const ds=(c.docsGerados||[]).slice().sort((a,b)=>String(b.data).localeCompare(String(a.data)));if(!ds.length)return '';
  return `<div class="card" style="margin-bottom:12px"><h3>📄 Documentos gerados</h3>${ds.map(d=>`<div class="ev"><span class="pic">📄</span><div class="body"><a href="${esc(d.url)}" target="_blank" rel="noopener" class="strong">${esc(d.titulo||TIPOS_DOC_GERADO[d.tipo]||d.tipo)}</a><div class="small muted">${esc(TIPOS_DOC_GERADO[d.tipo]||d.tipo)} · ${fd(d.data)}${d.por?' · '+esc(d.por):''}</div></div></div>`).join('')}</div>`;
}

/* ---------- Configurações → API e conector do Claude (só administração) ---------- */
let INTAPI=null;
async function carregarIntegracaoApi(){try{INTAPI=await api('integracaoApi',null,'&op=estado');}catch(e){INTAPI={erro:e.msg||'Não foi possível carregar'};}if(ui.page==='config')render();}
const copiarTexto=t=>(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('Copiado ✓')).catch(()=>toast('Selecione e copie',1));
function cardIntegracaoApi(){
  if(!ehAdmin())return '';
  const tit='<h3>🔌 API, WaSpeed e conector do Claude</h3>';
  if(modo!=='servidor')return `<div class="card">${tit}<p class="small muted">A API, o webhook do WaSpeed e o conector do Claude funcionam na versão hospedada.</p></div>`;
  if(INTAPI===null){carregarIntegracaoApi();return `<div class="card">${tit}<p class="small muted">Carregando…</p></div>`;}
  if(INTAPI.erro)return `<div class="card">${tit}<p class="small" style="color:var(--red)">${esc(INTAPI.erro)}</p></div>`;
  const m=INTAPI.migracao;const dt=ms=>ms?new Date(+ms).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
  const cp=(t,rot)=>`<div class="flx" style="gap:6px;margin:4px 0"><code class="cod-url">${esc(t)}</code><button class="btn btn-ghost btn-sm" data-act="copiarTxt" data-id="${esc(t)}">${rot||'Copiar'}</button></div>`;
  if(!m.aplicada)return `<div class="card">${tit}
    <p class="small">Para ativar a API, o webhook e o conector, aplique a migração do banco. Ela:</p>
    <ul class="small"><li>faz um <b>backup completo</b> antes (fica na pasta de backups do servidor);</li><li>cria as tabelas novas (chaves, logs, OAuth, índice de telefones);</li><li>passa os leads para o funil novo (Novo lead, Em triagem, Aguardando documentos, Proposta enviada, Negociação, Contrato enviado, Cliente fechado, Perdido, Encaminhado a parceiro);</li><li>pode ser <b>revertida</b> por aqui.</li></ul>
    <div class="mfoot"><button class="btn btn-ghost" data-act="migPrevia">Ver prévia (não grava nada)</button><button class="btn btn-brand" data-act="migAplicar">Aplicar migração</button></div></div>`;
  const ch=INTAPI.chaves||[],au=INTAPI.autorizacoes||[];
  return `<div class="card intapi">${tit}
    <div class="small" style="color:var(--green)">✓ Migração aplicada em ${dt(m.aplicada_em)}${m.detalhes?.backup?' · backup: '+esc(m.detalhes.backup.join(', ')):''}</div>
    ${INTAPI.subpasta?'<div class="hint" style="color:var(--red)">O sistema está numa subpasta: o conector do Claude precisa do sistema na raiz do domínio (como gestao.seudominio.com.br).</div>':''}
    <div class="dgroup">🤖 Conector do Claude (MCP)</div>
    ${cp(INTAPI.mcp)}
    <p class="small muted">No claude.ai: <b>Personalizar → Conectores → Adicionar conector personalizado</b>, cole o endereço acima, deixe "Entrar agora" (OAuth) e conecte. O Claude abre a tela de login do sistema: entre com uma conta de <b>administradora</b> e autorize.</p>
    ${au.length?`<div class="small strong" style="margin-top:6px">Autorizações ativas</div>${au.map(a=>`<div class="ev"><span class="pic">🤖</span><div class="body small"><b>${esc(a.cliente||'Claude')}</b> · autorizado por ${esc(a.nome||'—')} em ${dt(a.desde)}<div class="muted">último uso/renovação ${dt(a.ultimo)}</div></div><button class="btn btn-ghost btn-sm" data-act="oauthRevogar" data-id="${esc(a.familia)}">Revogar</button></div>`).join('')}`:'<p class="small muted">Nenhuma autorização ativa.</p>'}
    <div class="dgroup">🔑 Chaves de API <small class="muted">(para outras automações: Authorization: Bearer &lt;chave&gt;)</small></div>
    ${cp(INTAPI.api,'Copiar endereço da API')}
    ${ch.map(k=>`<div class="ev"><span class="pic">🔑</span><div class="body small"><b>${esc(k.nome)}</b> <code>${esc(k.prefixo)}…</code> ${k.revogada_em?pill('Revogada','p-red'):pill('Ativa','p-green')}<div class="muted">${esc(k.escopos)} · criada ${dt(k.criado_em)} · último uso ${dt(k.ultimo_uso)}</div></div>${k.revogada_em?'':`<button class="btn btn-ghost btn-sm" data-act="chaveRevogar" data-id="${k.id}">Revogar</button>`}</div>`).join('')||'<p class="small muted">Nenhuma chave criada.</p>'}
    <button class="btn btn-ghost btn-sm" data-act="chaveNova">+ Nova chave de API</button>
    <div class="dgroup">💬 Webhook do WaSpeed</div>
    ${cp(INTAPI.webhook)}
    <p class="small muted">Token: ${INTAPI.webhookToken?'<b>gerado</b> (por segurança não aparece de novo; gere outro se perdeu)':'<b>ainda não gerado</b>'}.</p>
    <div class="flx" style="flex-wrap:wrap;gap:6px"><button class="btn btn-ghost btn-sm" data-act="wspToken">${INTAPI.webhookToken?'Gerar novo token':'Gerar token'}</button><button class="btn btn-ghost btn-sm" data-act="wspMapa">Colunas do WaSpeed → etapas</button><button class="btn btn-ghost btn-sm" data-act="wspLog">Eventos recebidos</button><button class="btn btn-ghost btn-sm" data-act="wspTestar">Testar um JSON</button></div>
    <div class="dgroup">📜 Registro de acesso (LGPD)</div>
    <div class="flx" style="flex-wrap:wrap;gap:6px"><button class="btn btn-ghost btn-sm" data-act="apiLogVer">Ver as últimas chamadas</button><a class="btn btn-ghost btn-sm" href="api/v1/openapi.yaml" target="_blank" rel="noopener" style="text-decoration:none">Documentação (OpenAPI)</a><button class="btn btn-ghost btn-sm" data-act="migPrevia">Prévia da migração</button><button class="btn btn-ghost btn-sm" data-act="migReverter" style="color:var(--red)">Reverter migração</button></div></div>`;
}
function mostrarPrevia(p){
  modal('Prévia da migração (nada foi gravado)',`<p class="small">${p.total_leads} lead(s) no sistema.</p>
    <div class="tbl"><table><thead><tr><th>Etapa atual → nova</th><th class="num">Leads</th></tr></thead><tbody>${Object.entries(p.mapeamento).map(([k,v])=>`<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`).join('')||'<tr><td colspan="2" class="empty">Nenhum lead</td></tr>'}</tbody></table></div>
    ${Object.keys(p.etapas_desconhecidas||{}).length?`<p class="small" style="color:var(--amber)">Etapas fora da lista (vão para "Novo lead"): ${esc(Object.keys(p.etapas_desconhecidas).join(', '))}</p>`:''}
    <p class="small"><b>${p.telefones_duplicados.length}</b> telefone(s) em mais de um lead${p.telefones_duplicados.length?' (não são juntados; confira):':'.'}</p>
    ${p.telefones_duplicados.slice(0,30).map(d=>`<div class="small">📞 ${esc(d.telefone)}: ${d.leads.map(l=>esc(l.nome)+' ('+esc(l.etapa)+')').join(' · ')}</div>`).join('')}
    <p class="small">${p.leads_sem_telefone} lead(s) sem telefone válido.</p><p class="small muted">${esc(p.observacao)}</p>`,[{l:'Fechar',c:'btn-ghost',fn:closeModal}],true);
}
function editWaspeedMapa(){
  const w=db.waspeed||{colunas:{},caminhos:{}};
  const linhas=Object.entries(w.colunas||{}).map(([c,e])=>c+' = '+e).join('\n');
  const campos=[['telefone','Telefone'],['nome','Nome'],['mensagem','Mensagem'],['coluna','Coluna do Kanban'],['etiquetas','Etiquetas'],['evento','Tipo de evento'],['de_mim','Mensagem enviada por nós (fromMe)']];
  modal('WaSpeed → sistema',`<p class="small"><b>Colunas do Kanban do WaSpeed</b>: uma por linha, no formato <code>Coluna no WaSpeed = Etapa no sistema</code>. Colunas com o mesmo nome de uma etapa não precisam estar aqui.</p>
    <textarea id="wsp-col" rows="7" style="width:100%" placeholder="Atendendo = Em triagem&#10;Esperando documentos = Aguardando documentos&#10;Fechou = Cliente fechado&#10;Sem interesse = Perdido">${esc(linhas)}</textarea>
    <p class="small muted">Etapas: ${esc(etapasLead().join(' · '))}</p>
    <details class="small"><summary><b>Avançado:</b> onde está cada dado no JSON do WaSpeed (só se o teste mostrar campos vazios)</summary>
      <p class="muted">Caminho com pontos, por exemplo <code>data.contact.phone</code> ou <code>messages[0].text</code>. Em branco, o sistema procura sozinho.</p>
      <div class="fgrid">${campos.map(([k,l])=>`<label>${l}<input id="wsp-c-${k}" value="${esc(w.caminhos?.[k]||'')}" placeholder="automático"></label>`).join('')}</div></details>`,
    [{l:'Cancelar',c:'btn-ghost',fn:closeModal},{l:'Salvar',c:'btn-brand',fn:()=>{
      const cols={};let erro='';$('#wsp-col').value.split('\n').map(x=>x.trim()).filter(Boolean).forEach(x=>{const i=x.indexOf('=');if(i<1){erro=x;return;}const c=x.slice(0,i).trim(),e=x.slice(i+1).trim();
        const et=etapasLead().find(n=>norm(n)===norm(e));if(!et){erro=x;return;}cols[c]=et;});
      if(erro)return toast('Linha inválida ou etapa inexistente: "'+erro+'"',1);
      const cam={};campos.forEach(([k])=>{const v=$('#wsp-c-'+k).value.trim();if(v)cam[k]=v;});
      db.waspeed={colunas:cols,caminhos:cam};closeModal();save();toast('Mapeamento salvo ✓');}}],true);
}
const FUNIL_API_ACOES={
  editFunil:()=>editFunil(),
  leadAddInt:id=>{const l=db.leads.find(x=>x.id===id);const r=$('#li-resumo')?.value.trim();if(!l||!r)return toast('Escreva o resumo da interação',1);
    const u=db.usuarios.find(x=>x.id===db.usuarioAtual);const it={id:uid(),data:today(),canal:'WhatsApp',resumo:r,proximoPasso:$('#li-prox').value.trim(),dataFollowUp:$('#li-follow').value,em:Date.now(),por:u?.nome||''};
    if(it.dataFollowUp){const t={id:uid(),titulo:'Follow-up: '+l.nome+(it.proximoPasso?' — '+it.proximoPasso.slice(0,80):''),status:'todo',prioridade:'Média',prazo:it.dataFollowUp,hora:'',responsavelId:l.responsavelId||db.usuarioAtual,responsaveis:[l.responsavelId||db.usuarioAtual],clienteId:l.clienteId||'',processoId:'',leadId:l.id,obs:r,criadoPor:db.usuarioAtual};db.tarefas.push(t);it.tarefaId=t.id;}
    (l.interacoes=l.interacoes||[]).push(it);l.ultimoContato=today();save();
    const el=document.getElementById('lead-hist-'+l.id);if(el){const t=document.createElement('div');t.innerHTML=htmlLeadHistorico(l);el.replaceWith(t.firstElementChild);}
    toast(it.dataFollowUp?'Interação registrada ✓ e tarefa de follow-up criada':'Interação registrada ✓');},
  anuVer:k=>{ui.f.anu.ver=k;render();},novoAnuncio:()=>editAnuncio(),editAnuncio:id=>editAnuncio(id),
  copiarTxt:t=>copiarTexto(t),
  migPrevia:async()=>{try{const r=await api('integracaoApi',null,'&op=previa');mostrarPrevia(r.previa);}catch(e){toast(e.msg||'Falha ao gerar a prévia',1);}},
  migAplicar:async()=>{if(!await confirmar('Aplicar a migração? Antes, o sistema faz um backup completo do banco. Os leads passam para o funil novo. Dá para reverter depois.','Aplicar',false))return;
    try{toast('Aplicando… (backup + migração)');const r=await api('integracaoApi',{op:'aplicar'});toast('Migração aplicada ✓ '+r.leads_convertidos+' lead(s) no funil novo');INTAPI=null;await puxar(false);render();}catch(e){toast(e.msg||'A migração falhou (nada foi alterado)',1);}},
  migReverter:async()=>{if(!await confirmar('Reverter a migração? Os leads voltam para as etapas antigas e a API, o webhook e o conector param de funcionar. Um backup é feito antes.','Reverter'))return;
    try{const r=await api('integracaoApi',{op:'reverter'});toast('Migração revertida ✓ ('+r.leads_revertidos+' leads)');INTAPI=null;await puxar(false);render();}catch(e){toast(e.msg||'Não foi possível reverter',1);}},
  chaveNova:()=>{const nomes={'clientes:ler':'Ler clientes','clientes:gravar':'Cadastrar/editar clientes','leads:ler':'Ler leads','leads:gravar':'Registrar/mover leads','anuncios:ler':'Ler anúncios','anuncios:gravar':'Cadastrar anúncios','relatorios:ler':'Relatórios','financeiro:ler':'Ler contas a receber/pagar','financeiro:gravar':'Lançar receitas, despesas e tráfego'};
    modal('Nova chave de API',`<label class="small">Nome (para quem é a chave)<input id="ck-nome" placeholder="ex.: Automação de leads" style="width:100%"></label><div class="multi" style="margin-top:10px">${INTAPI.escopos.map(e=>`<label class="chk"><input type="checkbox" value="${e}" checked> ${esc(nomes[e]||e)}</label>`).join('')}</div>`,
      [{l:'Cancelar',c:'btn-ghost',fn:closeModal},{l:'Criar',c:'btn-brand',fn:async()=>{const nome=$('#ck-nome').value.trim();const esc_=[...document.querySelectorAll('#mbg .multi input:checked')].map(i=>i.value);
        if(!nome)return toast('Dê um nome à chave',1);try{const r=await api('integracaoApi',{op:'criarChave',nome,escopos:esc_});INTAPI=null;
          modal('🔑 Chave criada',`<p class="small"><b>Copie agora</b>: por segurança ela não aparece de novo (o sistema guarda só um resumo criptográfico).</p><code class="cod-url" style="display:block;padding:10px">${esc(r.chave)}</code>`,[{l:'Copiar',c:'btn-brand',fn:()=>copiarTexto(r.chave)},{l:'Fechar',c:'btn-ghost',fn:()=>{closeModal();render();}}]);}catch(e){toast(e.msg||'Falha',1);}}}]);},
  chaveRevogar:async id=>{if(!await confirmar('Revogar esta chave? As automações que a usam param na hora.','Revogar'))return;await api('integracaoApi',{op:'revogarChave',id:+id}).catch(()=>{});INTAPI=null;render();toast('Chave revogada');},
  oauthRevogar:async f=>{if(!await confirmar('Desconectar o Claude desta autorização? Será preciso conectar de novo no claude.ai.','Revogar'))return;await api('integracaoApi',{op:'revogarAutorizacao',familia:f}).catch(()=>{});INTAPI=null;render();toast('Autorização revogada');},
  wspToken:async()=>{if(INTAPI.webhookToken&&!await confirmar('Gerar um novo token? O antigo para de funcionar e será preciso colar o novo no WaSpeed.','Gerar novo'))return;
    try{const r=await api('integracaoApi',{op:'tokenWebhook'});INTAPI=null;
      modal('Token do webhook do WaSpeed',`<p class="small"><b>Copie agora</b>: o token não aparece de novo.</p><p class="small strong">URL do webhook</p><code class="cod-url" style="display:block;padding:8px">${esc(r.url)}</code>
        <p class="small strong">Token (cabeçalho <code>X-Webhook-Token</code>)</p><code class="cod-url" style="display:block;padding:8px">${esc(r.token)}</code>
        <p class="small strong">Ou, se o WaSpeed só tiver o campo URL, use a URL com o token:</p><code class="cod-url" style="display:block;padding:8px;word-break:break-all">${esc(r.urlComToken)}</code>`,
        [{l:'Copiar token',c:'btn-ghost',fn:()=>copiarTexto(r.token)},{l:'Copiar URL com token',c:'btn-brand',fn:()=>copiarTexto(r.urlComToken)},{l:'Fechar',c:'btn-ghost',fn:()=>{closeModal();render();}}],true);}catch(e){toast(e.msg||'Falha',1);}},
  wspMapa:()=>editWaspeedMapa(),
  wspLog:async()=>{try{const r=await api('integracaoApi',null,'&op=webhookLog');
    modal('Eventos recebidos do WaSpeed (últimos 40)',r.itens.map(x=>`<details class="wsp-ev"><summary><b>${new Date(+x.em).toLocaleString('pt-BR')}</b> ${pill(x.status,x.status==='ok'?'p-green':x.status==='ignorado'?'p-amber':'p-red')} ${esc(x.evento||'')} <span class="small muted">${esc(x.detalhe||'')}</span></summary>
      ${x.payload?`<pre class="small">${esc(JSON.stringify(JSON.parse(x.payload),null,2))}</pre><button class="btn btn-ghost btn-sm" data-act="copiarTxt" data-id="${esc(x.payload)}">Copiar JSON</button>`:'<div class="small muted">Sem conteúdo (pedido recusado).</div>'}</details>`).join('')||'<div class="empty">Nenhum evento recebido ainda. Confira a URL e o token no painel do WaSpeed e mande uma mensagem de teste.</div>',[{l:'Fechar',c:'btn-ghost',fn:closeModal}],true);}catch(e){toast(e.msg||'Falha',1);}},
  wspTestar:()=>modal('Testar um JSON do WaSpeed (não grava nada)','<textarea id="wsp-json" rows="10" style="width:100%;font-family:monospace;font-size:12px" placeholder="Cole aqui o JSON de um evento (por exemplo, copiado de Eventos recebidos)"></textarea><div id="wsp-res"></div>',
    [{l:'Fechar',c:'btn-ghost',fn:closeModal},{l:'Testar',c:'btn-brand',fn:async()=>{try{const r=await api('integracaoApi',{op:'testarWebhook',payload:$('#wsp-json').value});const x=r.extraido;
      $('#wsp-res').innerHTML=`<div class="tbl" style="margin-top:8px"><table><tbody>${[['Evento',x.evento],['Telefone',x.telefone+(x.telefone_e164?' → '+x.telefone_e164:' (não reconhecido)')],['Nome',x.nome],['Mensagem',x.mensagem],['Código do anúncio',x.codigo_anuncio||'—'],['Coluna',x.coluna],['Etapa no sistema',x.etapa||'—'],['Etiquetas',(x.etiquetas||[]).join(', ')],['Enviada por nós',x.de_mim?'sim':'não']].map(([k,v])=>`<tr><td class="strong">${k}</td><td>${esc(v||'')}</td></tr>`).join('')}</tbody></table></div>`;}catch(e){toast(e.msg||'JSON inválido',1);}}}],true),
  apiLogVer:async()=>{try{const r=await api('integracaoApi',null,'&op=apiLog');
    modal('Registro de acesso à API (últimas 200 chamadas)',`<div class="tbl"><table><thead><tr><th>Quando</th><th>Quem</th><th>Chamada</th><th>Status</th><th>Registro</th></tr></thead><tbody>${r.itens.map(x=>`<tr><td class="small">${new Date(+x.em).toLocaleString('pt-BR')}</td><td class="small">${esc(x.quem)}<div class="muted">${esc(x.auth)} · ${esc(x.ip||'')}</div></td><td class="small"><code>${esc(x.metodo)} ${esc(x.rota)}</code></td><td>${pill(x.status,x.status<300?'p-green':x.status<500?'p-amber':'p-red')}</td><td class="small">${esc(x.recurso||'')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Nenhuma chamada ainda</td></tr>'}</tbody></table></div><p class="small muted">O registro guarda quem acessou, quando e o quê, sem dados pessoais da consulta. Fica 12 meses; o conteúdo bruto do webhook, 30 dias.</p>`,[{l:'Fechar',c:'btn-ghost',fn:closeModal}],true);}catch(e){toast(e.msg||'Falha',1);}},
};
