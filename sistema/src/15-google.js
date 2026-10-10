/* =========================================================
   GOOGLE — Agenda, Drive e Docs
   - Sem configuração: links "Adicionar ao Google Agenda" e arquivo .ics.
   - Com o "Client ID do Google" (Configurações → Integrações Google), na versão
     hospedada (https): sincroniza compromissos e tarefas com o Google Agenda,
     cria pastas dos clientes no Drive, anexa arquivos e gera documentos no Google Docs.
   ========================================================= */
const GIS_URL='https://accounts.google.com/gsi/client';
const G_SCOPES='https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive';
const G={token:null,exp:0};
function gIndisponivel(){
  if(window.claude)return 'Na página de demonstração não é possível conectar o Google. Use a versão hospedada do sistema.';
  if(!/^https?:$/.test(location.protocol))return 'Abra o sistema pelo endereço da hospedagem (https://…) para conectar o Google.';
  if(!db.escritorio.googleClientId)return 'Falta configurar o "Client ID do Google" em Configurações → Integrações Google (veja o guia docs/GOOGLE.md).';
  return '';
}
const gConectado=()=>!!G.token&&Date.now()<G.exp-60000;
function carregarScript(src){
  return new Promise((res,rej)=>{if(window.google&&window.google.accounts)return res();
    const s=document.createElement('script');s.src=src;s.async=true;s.onload=()=>res();s.onerror=()=>rej(new Error('Não foi possível carregar o login do Google.'));document.head.appendChild(s);});
}
async function gToken(){
  const m=gIndisponivel();if(m)throw new Error(m);
  if(gConectado())return G.token;
  await carregarScript(GIS_URL);
  return new Promise((res,rej)=>{
    const c=google.accounts.oauth2.initTokenClient({client_id:db.escritorio.googleClientId,scope:G_SCOPES,
      callback:r=>{if(r.error)return rej(new Error('Google: '+r.error));G.token=r.access_token;G.exp=Date.now()+(+r.expires_in||3600)*1000;render();res(G.token);},
      error_callback:()=>rej(new Error('A conexão com o Google foi cancelada.'))});
    c.requestAccessToken({prompt:G.token?'':'consent',login_hint:sessao?.email||undefined});
  });
}
async function gFetch(url,opts={},retry=true){
  const t=await gToken();
  const r=await fetch(url,{...opts,headers:{...(opts.headers||{}),Authorization:'Bearer '+t}});
  if(r.status===401&&retry){G.token=null;return gFetch(url,opts,false);}
  if(!r.ok){let m='';try{m=(await r.json()).error.message;}catch(e){}throw new Error('Google respondeu '+r.status+(m?': '+m:''));}
  return r.status===204?null:r.json();
}
const gErro=e=>toast(e&&e.message||'Falha na comunicação com o Google',1);

/* ---------- Google Agenda ---------- */
function gcalLink(titulo,data,hora,desc){
  const d=data.replace(/-/g,'');let dates;
  if(hora){const ini=new Date(data+'T'+hora);const fim=new Date(ini.getTime()+3600e3);const f=x=>iso(x).replace(/-/g,'')+'T'+String(x.getHours()).padStart(2,'0')+String(x.getMinutes()).padStart(2,'0')+'00';dates=f(ini)+'/'+f(fim);}
  else dates=d+'/'+addDays(1,data).replace(/-/g,'');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(titulo)+'&dates='+dates+'&details='+encodeURIComponent(desc||'')+'&ctz=America/Sao_Paulo';
}
function descItem(o){const p=proc(o.processoId);return [o.tipo?'Tipo: '+o.tipo:'',o.clienteId?'Cliente: '+nomeCli(o.clienteId):'',p?'Processo: '+p.numero:'',o.obs||'','— '+(db.escritorio.nome||'Gestão do escritório')].filter(Boolean).join('\n');}
const linkGcalEvento=e=>gcalLink((e.tipo?e.tipo+': ':'')+e.titulo,e.data,e.hora,descItem(e));
const linkGcalTarefa=t=>gcalLink('Tarefa: '+t.titulo,t.prazo,'',descItem(t));
function itensAgenda(todos){
  const meu=x=>todos||ehResp(x,db.usuarioAtual);
  return db.eventos.filter(e=>meu(e)&&e.data>=addDays(-7)).map(o=>['evento',o]).concat(db.tarefas.filter(t=>meu(t)&&t.prazo&&t.prazo>=addDays(-7)).map(o=>['tarefa',o]));
}
function corpoGcal(tipo,o){
  const titulo=tipo==='evento'?(o.tipo?o.tipo+': ':'')+o.titulo:'Tarefa: '+o.titulo;const data=tipo==='evento'?o.data:o.prazo;const hora=tipo==='evento'?o.hora:'';
  const b={summary:titulo,description:descItem(o),reminders:{useDefault:true}};
  if(hora){const ini=new Date(data+'T'+hora),fim=new Date(ini.getTime()+3600e3);const f=x=>iso(x)+'T'+String(x.getHours()).padStart(2,'0')+':'+String(x.getMinutes()).padStart(2,'0')+':00';
    b.start={dateTime:f(ini),timeZone:'America/Sao_Paulo'};b.end={dateTime:f(fim),timeZone:'America/Sao_Paulo'};}
  else{b.start={date:data};b.end={date:addDays(1,data)};}
  return b;
}
async function sincronizarGoogleAgenda(todos){
  const cal=encodeURIComponent(localStorage.getItem('gcal_cal')||'primary');const base='https://www.googleapis.com/calendar/v3/calendars/'+cal+'/events';
  const em=meuEmail();let criados=0,atualizados=0,removidos=0;
  setSync('sincronizando com o Google Agenda…');
  for(const [tipo,o] of itensAgenda(todos)){
    o.gcal=o.gcal||{};const id=o.gcal[em];const fim=tipo==='evento'?o.feito:o.status==='done';
    if(fim){if(id){try{await gFetch(base+'/'+encodeURIComponent(id),{method:'DELETE'});}catch(e){}delete o.gcal[em];removidos++;}continue;}
    const body=JSON.stringify(corpoGcal(tipo,o));const H={'Content-Type':'application/json'};
    if(id){try{await gFetch(base+'/'+encodeURIComponent(id),{method:'PATCH',headers:H,body});atualizados++;continue;}catch(e){if(!/ 404| 410/.test(e.message))throw e;}}
    const r=await gFetch(base,{method:'POST',headers:H,body});o.gcal[em]=r.id;criados++;
  }
  save();render();toast(`Google Agenda: ${criados} criado(s), ${atualizados} atualizado(s), ${removidos} removido(s) ✓`);
}
function exportarICS(todos){
  const L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Gestao do Escritorio//PT-BR','CALSCALE:GREGORIAN'];
  const escI=s=>String(s||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/[,;]/g,m=>'\\'+m);
  itensAgenda(todos).forEach(([tipo,o])=>{if(tipo==='evento'?o.feito:o.status==='done')return;
    const data=(tipo==='evento'?o.data:o.prazo).replace(/-/g,''),hora=tipo==='evento'&&o.hora?o.hora.replace(':','')+'00':'';
    L.push('BEGIN:VEVENT','UID:'+o.id+'@gestao','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z',
      hora?'DTSTART;TZID=America/Sao_Paulo:'+data+'T'+hora:'DTSTART;VALUE=DATE:'+data,
      'SUMMARY:'+escI(tipo==='evento'?(o.tipo?o.tipo+': ':'')+o.titulo:'Tarefa: '+o.titulo),'DESCRIPTION:'+escI(descItem(o)),'END:VEVENT');});
  L.push('END:VCALENDAR');download('agenda-escritorio.ics',L.join('\r\n'),'text/calendar');
}

/* ---------- Google Drive ---------- */
const DRIVE='https://www.googleapis.com/drive/v3/files',DRIVE_UP='https://www.googleapis.com/upload/drive/v3/files';
function driveCriarPasta(nome,pai){
  return gFetch(DRIVE+'?fields=id,webViewLink&supportsAllDrives=true',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:nome,mimeType:'application/vnd.google-apps.folder',parents:pai?[pai]:undefined})});
}
async function drivePastaRaiz(){
  const e=db.escritorio;
  if(e.driveRaizId){try{const r=await gFetch(DRIVE+'/'+e.driveRaizId+'?fields=id,trashed&supportsAllDrives=true');if(!r.trashed)return e.driveRaizId;}catch(x){}}
  const r=await driveCriarPasta((e.nome||'Escritório')+' — Clientes');e.driveRaizId=r.id;e.driveRaizLink=r.webViewLink;save();return r.id;
}
async function drivePastaCliente(cid){
  const c=cli(cid);if(!c)throw new Error('Cliente não encontrado');
  if(c.driveId)return c.driveId;
  const r=await driveCriarPasta(c.nome,await drivePastaRaiz());c.driveId=r.id;c.driveLink=r.webViewLink;save();return r.id;
}
function driveUpload(blob,nome,pasta,converterPara){
  const meta={name:nome,parents:[pasta]};if(converterPara)meta.mimeType=converterPara;
  const fdt=new FormData();fdt.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));fdt.append('file',blob);
  return gFetch(DRIVE_UP+'?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true',{method:'POST',body:fdt});
}
function abrirLinkModal(titulo,url,texto){
  modal(titulo,`<p class="small" style="margin-bottom:12px">${texto||'Pronto!'}</p><a class="btn btn-brand" href="${esc(url)}" target="_blank" rel="noopener" style="text-decoration:none">Abrir</a>`);
}
