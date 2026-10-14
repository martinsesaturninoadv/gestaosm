/* =========================================================
   SEGURANÇA E ROTINA: verificação em duas etapas, backup automático,
   instalar no celular (PWA) e notificações do aparelho
   ========================================================= */
const QR_URL='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
function carregarQR(){return window.QRCode?Promise.resolve():new Promise((res,rej)=>{const s=document.createElement('script');s.src=QR_URL;s.onload=res;s.onerror=()=>rej(new Error('Não foi possível carregar o gerador de QR code.'));document.head.appendChild(s);});}

function card2FA(){
  const on=!!sessao?.doisFatores;
  return `<div class="card"><h3>🛡️ Verificação em duas etapas ${on?pill('Ativada','p-green'):pill('Desativada','p-gray')}</h3>
    <p class="small muted">Além da senha, o login pede um código de 6 dígitos do aplicativo autenticador do celular (Google Authenticator, Microsoft Authenticator ou similar). Mesmo que alguém descubra a senha, não entra sem o celular.</p>
    <div class="mfoot">${on?'<button class="btn btn-ghost" data-act="tfaDesativar">Desativar</button>':'<button class="btn btn-brand" data-act="tfaAtivar">Ativar no meu acesso</button>'}</div></div>`;
}
let BACKUPS=null;
function cardBackup(){
  if(!ehAdmin())return '';
  if(BACKUPS===null&&modo==='servidor'){BACKUPS=[];api('backups').then(r=>{BACKUPS=r.backups;if(ui.page==='config')render();}).catch(()=>{});}
  const kb=n=>n>1048576?num(n/1048576,1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
  return `<div class="card"><h3>💾 Backup automático diário</h3>
    <p class="small muted">Todo dia, no primeiro acesso, o servidor guarda uma cópia completa do banco (últimos 30 dias, fora da pasta pública) e, se você informar um e-mail abaixo, envia a cópia para ele. Dica: no Gmail, um filtro pode salvar esses anexos no Google Drive.</p>
    <div class="fgrid"><label class="full">E-mail que recebe o backup diário<input id="bk-email" type="email" value="${esc(db.escritorio.backupEmail||'')}" placeholder="ex.: backup@seudominio.com.br"></label></div>
    <div class="mfoot"><button class="btn btn-ghost" data-act="bkAgora">Fazer backup agora</button><button class="btn btn-brand" data-act="bkSalvar">Salvar e-mail</button></div>
    ${modo!=='servidor'?'<div class="hint">O backup automático funciona na versão hospedada. Aqui use "Exportar backup (.json)".</div>':(BACKUPS||[]).length?`<div class="small" style="margin-top:8px">${BACKUPS.slice(0,7).map(b=>`<div class="ev"><div class="body"><div class="t">${esc(b.arquivo.replace(/^backup-|\.json\.gz$/g,'').split('-').reverse().join('/'))}</div><div class="small muted">${kb(b.tamanho)}</div></div><a class="btn btn-ghost btn-sm" href="api.php?acao=backup&f=${encodeURIComponent(b.arquivo)}" style="text-decoration:none">⬇ Baixar</a></div>`).join('')}</div>`:''}</div>`;
}
function cardAppCelular(){
  const perm=window.Notification?Notification.permission:'indisponivel';
  return `<div class="card"><h3>📱 Aplicativo no celular e notificações</h3>
    <p class="small">${ehIOS()?'No iPhone: abra o sistema no <b>Safari</b>, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.':'No Android (Chrome): toque no menu <b>⋮</b> e depois em <b>Instalar app</b> (ou "Adicionar à tela inicial").'} O ícone do escritório aparece junto com os outros aplicativos e abre em tela cheia.</p>
    ${PWA.prompt?'<button class="btn btn-gold" data-act="pwaInstalar">Instalar o aplicativo agora</button>':''}
    <p class="small muted" style="margin-top:10px">Avisos com o sistema aberto (mesmo em segundo plano): mensagens do escritório virtual, "bater na porta", tarefas novas e os prazos do dia.</p>
    ${cardPush()}
    <div class="mfoot">${perm==='granted'?pill('Notificações ativadas','p-green')+' <button class="btn btn-ghost btn-sm" data-act="notifTeste">Testar</button>':perm==='denied'?'<span class="small muted">Notificações bloqueadas no navegador: libere nas configurações do site.</span>':perm==='indisponivel'?'<span class="small muted">Este navegador não suporta notificações.</span>':'<button class="btn btn-brand" data-act="notifAtivar">Ativar notificações</button>'}</div></div>`;
}
const ehIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);

/* ---------- PWA (instalar como aplicativo) ---------- */
const PWA={prompt:null,reg:null};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();PWA.prompt=e;if(ui.page==='config'&&db)render();});
if('serviceWorker' in navigator&&window.isSecureContext&&/^https?:$/.test(location.protocol)&&!window.claude){
  navigator.serviceWorker.register('sw.js').then(r=>PWA.reg=r).catch(()=>{});
}
function notificar(titulo,corpo,tag){
  try{if(!window.Notification||Notification.permission!=='granted')return;
    const op={body:corpo,tag:tag||undefined,icon:'icon-192.png',badge:'icon-192.png'};
    if(PWA.reg&&PWA.reg.showNotification)PWA.reg.showNotification(titulo,op);else new Notification(titulo,op);}catch(e){}
}
/* tarefas novas atribuídas a mim e resumo dos prazos do dia */
function verificarAvisosAparelho(){
  if(!db||!sessao||!window.Notification||Notification.permission!=='granted')return;
  const me=db.usuarioAtual;if(!me)return;const k='msadv_tar_vistas_'+norm(sessao.email);
  let vistas=null;try{vistas=JSON.parse(localStorage.getItem(k)||'null');}catch(e){}
  const minhas=db.tarefas.filter(t=>t.status!=='done'&&ehResp(t,me));
  if(vistas){minhas.filter(t=>!vistas.includes(t.id)&&t.criadoPor!==me).slice(0,3).forEach(t=>notificar('☑ Nova tarefa para você',t.titulo+(t.prazo?' — prazo '+fd(t.prazo):''),'tar-'+t.id));}
  try{localStorage.setItem(k,JSON.stringify(minhas.map(t=>t.id).slice(-500)));}catch(e){}
  const kd='msadv_resumo_dia_'+norm(sessao.email);
  if(localStorage.getItem(kd)!==today()){try{localStorage.setItem(kd,today());}catch(e){}
    const hoje=db.eventos.filter(e=>!e.feito&&ehResp(e,me)&&diff(e.data)===0).length,venc=db.eventos.filter(e=>!e.feito&&ehResp(e,me)&&diff(e.data)<0).length+minhas.filter(t=>t.prazo&&diff(t.prazo)<0).length;
    if(hoje||venc)notificar('📅 Seu dia no escritório',`${hoje} prazo(s)/compromisso(s) hoje${venc?` · ${venc} em atraso`:''}`,'resumo-dia');}
}

/* ---------- notificações PUSH (chegam com o sistema fechado) ---------- */
const PUSH_TIPOS=[['tarefa','☑ Tarefas e petições para mim (e urgências)'],['prazo','📅 Prazos, audiências e o "bom dia" com o que vence'],['msg','💬 Mensagens do escritório virtual'],['portal','📨 Mensagens e arquivos de clientes no portal'],['meta','🏆 Metas (50%, 75%, 90% e batida) e ranking'],['conquista','🎉 Conquistas da equipe (contrato fechado, deferimento, acordo, tarefa que você pediu concluída)'],['resumo','📋 Resumo do dia da equipe (18h)']];
let PUSH=null;
const pushSuportado=()=>'serviceWorker' in navigator&&'PushManager' in window&&!!window.Notification&&window.isSecureContext;
function b64uParaU8(s){const b=atob((s+'='.repeat((4-s.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0));}
async function pushAssinatura(){try{const reg=await navigator.serviceWorker.ready;return await reg.pushManager.getSubscription();}catch(e){return null;}}
async function carregarPush(){
  if(modo!=='servidor'||!pushSuportado()){PUSH={indisponivel:true};return;}
  try{const sub=await pushAssinatura();const r=await api('push',{op:'estado',endpoint:sub?.endpoint||''});PUSH={...r,ativo:!!(sub&&r.assinado)};}
  catch(e){PUSH={erro:true};}
  if(ui.page==='config')render();
}
/* ao entrar: se este aparelho já recebe push, confirma no servidor que é desta pessoa */
async function sincronizarPush(){
  if(modo!=='servidor'||!pushSuportado()||Notification.permission!=='granted')return;
  const sub=await pushAssinatura();if(!sub)return;
  try{await api('push',{op:'assinar',sub:sub.toJSON(),aparelho:nomeAparelho(),prefs:PUSH?.prefs||undefined});}catch(e){}
}
const nomeAparelho=()=>{const u=navigator.userAgent;return (/iphone|ipad/i.test(u)?'iPhone/iPad':/android/i.test(u)?'Android':/windows/i.test(u)?'Windows':/mac/i.test(u)?'Mac':'Navegador')+(matchMedia('(display-mode: standalone)').matches?' (app)':'');};
function cardPush(){
  if(modo!=='servidor')return '<div class="hint" style="margin-top:10px">🔔 As notificações push (que chegam com o sistema fechado) funcionam na versão hospedada.</div>';
  if(!pushSuportado())return `<div class="hint" style="margin-top:10px">🔔 Este navegador não recebe notificações push.${ehIOS()?' No iPhone, primeiro adicione o sistema à Tela de Início (Safari → Compartilhar) e abra pelo ícone; depois ative aqui.':''}</div>`;
  if(PUSH===null){carregarPush();return '<div class="small muted" style="margin-top:10px">Verificando notificações push…</div>';}
  if(PUSH.erro)return '<div class="small muted" style="margin-top:10px">Não foi possível verificar as notificações push agora.</div>';
  if(PUSH.suportado===false)return '<div class="hint" style="margin-top:10px">🔔 O servidor da hospedagem não tem OpenSSL/cURL com suporte a notificações push. Fale com o suporte da HostGator.</div>';
  const pr=PUSH.prefs||{};
  return `<div class="push-box"><div class="strong">🔔 Notificações push neste aparelho ${PUSH.ativo?pill('Ativadas','p-green'):pill('Desativadas','p-gray')}</div>
    <p class="small muted" style="margin:4px 0 8px">Chegam como as de WhatsApp, <b>mesmo com o sistema fechado</b>. Ative em cada celular e computador que você usa.${ehIOS()?' No iPhone, só funciona com o sistema adicionado à Tela de Início.':''}</p>
    ${PUSH.ativo?`<div class="multi" id="push-prefs">${PUSH_TIPOS.map(([k,l])=>`<label class="chk"><input type="checkbox" value="${k}"${pr[k]!==false?' checked':''}> ${esc(l)}</label>`).join('')}</div>
      <div class="mfoot"><button class="btn btn-ghost btn-sm" data-act="pushDesativar">Desativar neste aparelho</button><button class="btn btn-ghost btn-sm" data-act="pushTestar">Enviar teste</button><button class="btn btn-brand btn-sm" data-act="pushPrefs">Salvar preferências</button></div>`
      :`<div class="mfoot"><button class="btn btn-gold" data-act="pushAtivar">🔔 Ativar notificações push</button></div>`}
    ${PUSH.cron?`<details class="small" style="margin-top:8px"><summary>Administração: avisos mesmo quando ninguém está com o sistema aberto (${PUSH.aparelhos} aparelho(s) cadastrados)</summary>
      <p>Os avisos de horário (tarefa vencendo, audiência em 1 hora, "bom dia" e resumo das 18h) são verificados a cada 5 minutos enquanto alguém usa o sistema. Para funcionarem também à noite e no fim de semana, crie uma tarefa agendada no cPanel: <b>Trabalhos Cron</b> → <b>A cada 5 minutos</b> → comando:</p>
      <code style="display:block;word-break:break-all;background:var(--bg2,#f3efe6);padding:8px;border-radius:6px">curl -s "${esc(PUSH.cron)}" &gt;/dev/null</code>
      <button class="btn btn-ghost btn-sm" style="margin-top:6px" data-act="pushCopiarCron">Copiar comando</button></details>`:''}</div>`;
}
/* metas e ranking: quem perceber primeiro avisa a equipe (o servidor evita aviso repetido) */
let ultAvisoMeta=0;
function avisosMetaRanking(){
  if(modo!=='servidor'||!sessao||ehExterno()||!db||Date.now()-ultAvisoMeta<120000)return;ultAvisoMeta=Date.now();
  const ym=today().slice(0,7);const ja=k=>{try{if(localStorage.getItem('av|'+k))return true;localStorage.setItem('av|'+k,'1');}catch(e){}return false;};
  const enviar=(tipo,chave,titulo,texto)=>{if(!ja(chave))api('avisar',{tipo,chave,titulo,texto}).catch(()=>{});};
  // as metas (50%, 75%, 90% e batida) são avisadas pelo servidor quando o contrato/atendimento é salvo
  const prod=produtividade(ym);const l=prod[0];
  if(l&&l.pontos>0&&(!prod[1]||prod[1].pontos<l.pontos)){let ant=null;try{ant=localStorage.getItem('rk_lider|'+ym);localStorage.setItem('rk_lider|'+ym,l.u.id);}catch(e){}
    if(ant&&ant!==l.u.id)enviar('ranking','ranking:'+today()+':'+l.u.id,'🥇 '+l.u.nome+' assumiu a liderança do ranking!',l.pontos+' pontos no mês'+(prod[1]?' · '+prod[1].u.nome+' vem logo atrás com '+prod[1].pontos:'')+'. Quem vai recuperar? 💪');}
}
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.ir){location.hash=String(e.data.ir).replace(/^#/,'');}});

const SEG_ACOES={
  pushAtivar:async()=>{
    try{const p=await Notification.requestPermission();if(p!=='granted')return toast('As notificações foram bloqueadas. Libere nas configurações do navegador para este site.',1);
      const reg=await navigator.serviceWorker.ready;const r=await api('push',{op:'estado'});
      let sub=await reg.pushManager.getSubscription();
      if(sub&&sub.options&&sub.options.applicationServerKey){const atual=btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');if(atual!==r.pub){await sub.unsubscribe();sub=null;}}
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uParaU8(r.pub)});
      await api('push',{op:'assinar',sub:sub.toJSON(),aparelho:nomeAparelho()});
      await carregarPush();toast('Notificações push ativadas ✓ Toque em "Enviar teste" para conferir.');}
    catch(e){toast(e.msg||'Não foi possível ativar: '+(e.message||e),1);}},
  pushPrefs:async()=>{const sub=await pushAssinatura();if(!sub)return;const prefs={};PUSH_TIPOS.forEach(([k])=>prefs[k]=!!document.querySelector(`#push-prefs input[value="${k}"]`)?.checked);
    try{await api('push',{op:'prefs',endpoint:sub.endpoint,prefs});PUSH.prefs=prefs;toast('Preferências salvas ✓');}catch(e){toast(e.msg||'Falha ao salvar',1);}},
  pushTestar:async()=>{try{const r=await api('push',{op:'testar'});toast(r.enviados?'Teste enviado ✓ A notificação deve chegar em alguns segundos.':'Nenhum aparelho recebeu. Desative e ative de novo.',r.enviados?0:1);}catch(e){toast(e.msg||'Falha no teste',1);}},
  pushDesativar:async()=>{const sub=await pushAssinatura();try{if(sub){await api('push',{op:'remover',endpoint:sub.endpoint});await sub.unsubscribe();}}catch(e){}await carregarPush();toast('Notificações push desativadas neste aparelho');},
  pushCopiarCron:()=>{navigator.clipboard?.writeText(`curl -s "${PUSH.cron}" >/dev/null`).then(()=>toast('Comando copiado ✓'));},
  tfaAtivar:async()=>{if(precisaServidor())return;
    try{const r=await api('doisfatores',{etapa:'iniciar'});await carregarQR();
      modal('🛡️ Ativar verificação em duas etapas',`<ol class="small" style="line-height:1.7;padding-left:18px;margin:0"><li>Instale no celular o <b>Google Authenticator</b> ou o <b>Microsoft Authenticator</b>.</li><li>No aplicativo, toque em <b>+</b> e <b>Ler QR code</b>, e aponte para o código abaixo.</li><li>Digite o código de 6 dígitos que aparecer no aplicativo.</li></ol>
        <div id="tfa-qr" style="display:grid;place-items:center;margin:14px 0"></div><div class="small muted" style="text-align:center">Sem câmera? Digite a chave: <code style="word-break:break-all">${esc(r.segredo.replace(/(.{4})/g,'$1 ').trim())}</code></div>
        <label class="small" style="display:block;margin-top:12px">Código de 6 dígitos<input id="tfa-cod" inputmode="numeric" maxlength="6" style="width:100%;font-size:20px;letter-spacing:4px;text-align:center"></label>`,
        [{l:'Cancelar',c:'btn-ghost',fn:closeModal},{l:'Ativar',c:'btn-brand',fn:async()=>{try{await api('doisfatores',{etapa:'ativar',codigo:$('#tfa-cod').value});sessao.doisFatores=true;closeModal();render();toast('Verificação em duas etapas ativada ✓');}catch(e){toast(e.msg||'Código inválido',1);}}}]);
      new QRCode($('#tfa-qr'),{text:r.uri,width:190,height:190});}
    catch(e){toast(e.msg||e.message||'Não foi possível iniciar',1);}},
  tfaDesativar:()=>{if(precisaServidor())return;
    modal('Desativar verificação em duas etapas','<label class="small">Confirme a sua senha<input id="tfa-senha" type="password" style="width:100%"></label>',
      [{l:'Cancelar',c:'btn-ghost',fn:closeModal},{l:'Desativar',c:'btn-danger-solid',fn:async()=>{try{await api('doisfatores',{etapa:'desativar',senha:$('#tfa-senha').value});sessao.doisFatores=false;closeModal();render();toast('Desativada');}catch(e){toast(e.msg||'Não foi possível',1);}}}]);},
  bkSalvar:()=>{db.escritorio.backupEmail=$('#bk-email').value.trim();save();render();toast('E-mail do backup salvo ✓');},
  bkAgora:async()=>{if(precisaServidor())return;try{toast('Gerando backup…');const r=await api('backupAgora',{});BACKUPS=r.backups;render();toast('Backup feito ✓');}catch(e){toast(e.msg||'Falha no backup',1);}},
  pwaInstalar:async()=>{if(!PWA.prompt)return;PWA.prompt.prompt();await PWA.prompt.userChoice.catch(()=>{});PWA.prompt=null;render();},
  notifAtivar:async()=>{if(!window.Notification)return;const p=await Notification.requestPermission();render();if(p==='granted'){notificar('Notificações ativadas ✓','Você vai receber os avisos do escritório neste aparelho.','teste');}},
  notifTeste:()=>notificar('Teste de notificação','Está funcionando! 🎉','teste'),
};
