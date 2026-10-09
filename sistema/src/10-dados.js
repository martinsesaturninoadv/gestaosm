/* =========================================================
   DADOS E PERSISTÊNCIA
   Os dados sempre passam pela mesma "API":
   - modo "servidor": api.php na hospedagem (banco MySQL, compartilhado pela equipe);
   - modo "local" (demonstração): uma API simulada no próprio navegador, com as
     MESMAS regras de login e permissão do servidor.
   ========================================================= */
let db;
let modo='local',sessao=null;
const ui={page:'painel',id:null,agendaView:'lista',agendaMes:today().slice(0,7),f:{},tabCli:'processos',tabProc:'Judicial',procView:'lista',tabSm:'casos',tabDoc:'gerador'};
const COLS=['clientes','processos','eventos','tarefas','leads','lancamentos','documentos','notas','contratos','despesasFixas','usuarios','sm','scripts','modelos'];
const SINGLES=['escritorio','metas','produtos','tiposEvento','indAjustes','indExtras'];
const COLS_FIN=['lancamentos','contratos','despesasFixas'];
const COLS_PARC=['clientes','processos','eventos','tarefas','leads','documentos','notas','contratos','lancamentos','sm'];
const COLS_LIVRES_PARC=['usuarios','scripts','modelos'];
const CONFIG_PARC=['escritorio','produtos','tiposEvento'];

function vazio(){return {versao:6,escritorio:{nome:'Martins & Saturnino Advocacia e Consultoria',cnpj:'',oab:'',email:'',tel:'',endereco:'',cidade:'',saldoInicial:0,saldoInicialData:'',logo:'',googleClientId:'',salarioMinimo:1518},
  metas:{...METAS_PADRAO},produtos:PRODUTOS_PADRAO.slice(),tiposEvento:TIPOS_EVT_PADRAO.map(([nome,cor])=>({nome,cor})),indAjustes:{},indExtras:[],
  usuarioAtual:'',usuarios:[],clientes:[],processos:[],eventos:[],tarefas:[],leads:[],lancamentos:[],documentos:[],notas:[],contratos:[],despesasFixas:[],sm:[],scripts:[],modelos:[]};}
function migrar(d){
  const v=vazio();for(const k in v)if(d[k]===undefined||d[k]===null)d[k]=v[k];
  d.escritorio={...v.escritorio,...d.escritorio};if(d.escritorio.nome==='Martins & Saturnino Advocacia')d.escritorio.nome=v.escritorio.nome;d.metas={...METAS_PADRAO,...d.metas};
  if(!Array.isArray(d.produtos))d.produtos=PRODUTOS_PADRAO.slice();
  if(!Array.isArray(d.tiposEvento)||!d.tiposEvento.length)d.tiposEvento=v.tiposEvento;
  if(typeof d.indAjustes!=='object'||Array.isArray(d.indAjustes))d.indAjustes={};
  if(!Array.isArray(d.indExtras))d.indExtras=[];
  const mapa={'Honorários contratuais':'H.O. iniciais','Honorários de êxito':'H.O. finais — êxito','Honorários mensais — partido':'Honorários mensais (partido)','Aluguel e condomínio':'Aluguel','Folha / pró-labore':'Folha de pagamento','Software e sistemas':'Sistemas','Marketing / tráfego pago':'Tráfego — Facebook/Instagram','Material e escritório':'Material de expediente'};
  d.lancamentos.forEach(l=>{if(mapa[l.categoria])l.categoria=mapa[l.categoria];if(!l.criado)l.criado=l.venc;});
  d.clientes.forEach(c=>{if(c.cidade&&!c.uf){const m=String(c.cidade).match(/^(.*)\/\s*([A-Za-z]{2})$/);if(m){c.cidade=m[1].trim();c.uf=m[2].toUpperCase();}}});
  const fm={'Administrativo — análise':'Protocolado — em análise','Administrativo — exigência':'Em exigência','Contestação':'Contestação / réplica'};
  d.processos.forEach(p=>{if(fm[p.fase])p.fase=fm[p.fase];if(!fasesDe(p.tipo).includes(p.fase))p.fase=fasesDe(p.tipo)[0];});
  d.eventos.forEach(e=>{if(e.tipo==='Reunião')e.tipo='Reunião com cliente';if(e.tipo==='Outro')e.tipo='Atendimento / consulta';
    if(e.tipo&&!d.tiposEvento.some(t=>norm(t.nome)===norm(e.tipo)))d.tiposEvento.push({nome:e.tipo,cor:'#6B6B6B'});});
  d.versao=6;return d;
}
/* acrescenta ao conjunto de dados o que é novo na versão 6 (sem apagar nada) */
function enriquecerV6(d){
  migrar(d);
  if(!d.produtos.some(p=>norm(p)==='direito digital'))d.produtos.push('Direito digital');
  if(!d.modelos.length)d.modelos=modelosPadrao();
  if(!d.scripts.length)d.scripts=scriptsPadrao();
  const slug=n=>norm(n).replace(/^(adv|dr|dra)\.?\s+/,'').replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,'')||'usuario';
  d.usuarios.forEach((u,i)=>{if(!u.email)u.email=(i===0?'admin':slug(u.nome))+'@escritorio.com';});
  if(!d.usuarios.some(u=>/vit[oó]ria/i.test(u.nome)))d.usuarios.push({id:'u5',nome:'Dra. Vitória',papel:'Advogado(a)',oab:'OAB/SP 000.005',email:'vitoria@escritorio.com'});
  if(!d.usuarios.some(u=>/parceir/i.test(u.papel)))d.usuarios.push({id:'u6',nome:'Dr. Rafael Costa',papel:'Parceiro',oab:'OAB/RJ 000.006',email:'parceiro@costaadv.com'});
  return d;
}
function papelDeMembro(u,i){const p=norm(u.papel);if(/parceir/.test(p))return 'parceiro';if(/estagi/.test(p))return 'estagiario';if(/administrativo|financ|secret/.test(p))return 'financeiro';if(i===0||/socio|admin/.test(p))return 'admin';return 'advogado';}

/* ---------- regras de acesso (iguais às do api.php) ---------- */
function regraLeitura(u,col,id,dados){
  if(u.papel==='estagiario'&&COLS_FIN.includes(col))return false;
  if(u.papel==='parceiro'){
    if(col==='config')return CONFIG_PARC.includes(id);
    if(COLS_LIVRES_PARC.includes(col))return true;
    if(COLS_PARC.includes(col))return !!dados&&norm(dados.parceiro)===norm(u.email);
    return false;}
  return true;
}
function regraEscrita(u,col,id,novo,antigo){
  if(col!=='config'&&!COLS.includes(col))return false;
  if(col==='config'&&!SINGLES.includes(id))return false;
  if(u.papel==='estagiario'&&(COLS_FIN.includes(col)||(col==='config'&&id==='metas')))return false;
  if(u.papel==='parceiro'){
    if(!COLS_PARC.includes(col)||col==='contratos'||col==='lancamentos')return false;
    const dele=x=>x&&norm(x.parceiro)===norm(u.email);
    return (novo===null||dele(novo))&&(!antigo||dele(antigo));}
  return true;
}

/* ---------- API simulada (modo demonstração, guarda no navegador) ---------- */
const demo={store:null};
function demoSave(){try{localStorage.setItem(KEY_STORE,JSON.stringify(demo.store));}catch(e){toast('Sem espaço para salvar neste navegador',1);}}
function demoLoad(){
  try{const r=localStorage.getItem(KEY_STORE);if(r){const s=JSON.parse(r);if(s&&s.contas&&s.registros){demo.store=s;return;}}}catch(e){}
  let base=null;
  try{const r=localStorage.getItem(KEY_V5)||localStorage.getItem(KEY_V4);if(r){const d=JSON.parse(r);if(d&&Array.isArray(d.clientes))base=enriquecerV6(d);}}catch(e){}
  if(!base)base=seed();
  demoReset(base);
}
function demoReset(base){
  const t=Date.now();const reg={};
  COLS.forEach(c=>(base[c]||[]).forEach(o=>{if(o&&o.id)reg[c+'|'+o.id]={d:o,x:0,t};}));
  SINGLES.forEach(k=>reg['config|'+k]={d:base[k],x:0,t});
  const contas=base.usuarios.filter(u=>u.email).map((u,i)=>({id:i+1,nome:u.nome,email:norm(u.email),senha:hashDemo('demo1234'),papel:papelDeMembro(u,i),ativo:true}));
  demo.store={contas,registros:reg};demoSave();
}
function fakeApi(acao,corpo,params){
  return new Promise((res,rej)=>{try{res(fakeApiSync(acao,corpo||{},new URLSearchParams(params||'')));}catch(e){rej(e);}})
    .catch(e=>{if(e&&e.status===401&&!['login','sessao'].includes(acao))mostrarLogin('Sua sessão expirou. Entre novamente.');throw e;});
}
function fakeApiSync(acao,b,q){
  const S=demo.store;const err=(status,msg)=>{throw {status,msg};};
  const pub=c=>({id:c.id,nome:c.nome,email:c.email,papel:c.papel,ativo:!!c.ativo});
  const sid=localStorage.getItem(KEY_SESSAO);const u=S.contas.find(c=>String(c.id)===sid&&c.ativo);
  const precisa=()=>{if(!u)err(401,'Faça login para continuar.');return u;};
  switch(acao){
    case 'sessao':precisa();return {ok:true,usuario:pub(u),agora:Date.now()};
    case 'login':{const c=S.contas.find(c=>c.email===norm(b.email));if(!c||!c.ativo||c.senha!==hashDemo(String(b.senha||'')))err(401,'E-mail ou senha incorretos.');
      localStorage.setItem(KEY_SESSAO,String(c.id));return {ok:true,usuario:pub(c),agora:Date.now()};}
    case 'sair':localStorage.removeItem(KEY_SESSAO);return {ok:true};
    case 'dados':{precisa();const desde=+q.get('desde')||0;const out=[];
      for(const k in S.registros){const r=S.registros[k];if(r.t<=desde||(desde===0&&r.x))continue;const i=k.indexOf('|'),col=k.slice(0,i),id=k.slice(i+1);
        if(!regraLeitura(u,col,id,r.d))continue;out.push({colecao:col,id,excluido:!!r.x,dados:r.x?null:JSON.parse(JSON.stringify(r.d))});}
      return {ok:true,agora:Date.now(),registros:out};}
    case 'salvar':{precisa();const t=Date.now();let n=0;
      (b.upserts||[]).forEach(r=>{const k=r.colecao+'|'+r.id;const ant=S.registros[k];if(!r.id||!regraEscrita(u,r.colecao,r.id,r.dados,ant&&!ant.x?ant.d:null))return;
        S.registros[k]={d:JSON.parse(JSON.stringify(r.dados)),x:0,t,p:u.id};n++;});
      (b.exclusoes||[]).forEach(r=>{const k=r.colecao+'|'+r.id;const ant=S.registros[k];if(!ant||ant.x||!regraEscrita(u,r.colecao,r.id,null,ant.d))return;S.registros[k]={d:ant.d,x:1,t,p:u.id};n++;});
      demoSave();return {ok:true,agora:t,gravados:n};}
    case 'senha':{precisa();if(u.senha!==hashDemo(String(b.atual||'')))err(400,'Senha atual incorreta.');if(String(b.nova||'').length<8)err(400,'A nova senha deve ter pelo menos 8 caracteres.');
      u.senha=hashDemo(b.nova);demoSave();return {ok:true};}
    case 'contas':precisa();if(u.papel!=='admin')err(403,'Somente administradores.');return {ok:true,contas:S.contas.map(pub).sort((a,b)=>a.nome.localeCompare(b.nome))};
    case 'conta':{precisa();if(u.papel!=='admin')err(403,'Somente administradores.');
      const nome=String(b.nome||'').trim(),email=norm(b.email),papel=PAPEIS.some(p=>p[0]===b.papel)?b.papel:'advogado',ativo=!!b.ativo,senha=String(b.senha||'');
      if(!nome||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))err(400,'Informe nome e e-mail válidos.');
      if(senha&&senha.length<8)err(400,'A senha deve ter pelo menos 8 caracteres.');
      if(S.contas.some(c=>c.email===email&&c.id!==+b.id))err(400,'Já existe um acesso com este e-mail.');
      let c=S.contas.find(c=>c.id===+b.id);
      if(c){if(c.id===u.id&&(papel!=='admin'||!ativo))err(400,'Você não pode remover o seu próprio acesso de administrador.');Object.assign(c,{nome,email,papel,ativo});if(senha)c.senha=hashDemo(senha);}
      else{if(!senha)err(400,'Defina uma senha inicial.');c={id:Math.max(0,...S.contas.map(x=>x.id))+1,nome,email,papel,ativo,senha:hashDemo(senha)};S.contas.push(c);}
      demoSave();return {ok:true,id:c.id};}
  }
  err(404,'Ação desconhecida.');
}

/* ---------- comunicação (servidor real ou simulado) ---------- */
let snap={},ultimoSync=0,enviando=false,pendente=false,tEnvio=null,precisaRender=false,tPuxar=null;
function api(acao,corpo,params){
  if(modo==='local')return fakeApi(acao,corpo,params);
  return fetch('api.php?acao='+acao+(params||''),{method:corpo?'POST':'GET',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json','X-Requested-With':'gestao'},body:corpo?JSON.stringify(corpo):undefined})
  .then(async r=>{let j=null;try{j=await r.json();}catch(e){throw {status:r.status,naoApi:true};}
    if(!r.ok||!j||!j.ok){if(r.status===401&&!['login','sessao'].includes(acao))mostrarLogin('Sua sessão expirou. Entre novamente.');throw {status:r.status,msg:j&&j.erro};}
    return j;});
}
function save(){propagarParceiro();agendarEnvio();}
/* registros ligados a um cliente de parceria herdam o parceiro (é o que permite ao parceiro vê-los) */
function propagarParceiro(){
  if(!db)return;
  ['processos','eventos','tarefas','documentos','notas','contratos','lancamentos','sm'].forEach(c=>(db[c]||[]).forEach(o=>{
    let cid=o.clienteId;if(!cid&&o.processoId)cid=proc(o.processoId)?.clienteId;
    const c=cid&&cli(cid);if(c){const p=c.parceiro||'';if((o.parceiro||'')!==p)o.parceiro=p;}}));
}
function chaves(){const m={};COLS.forEach(c=>(db[c]||[]).forEach(o=>{if(o&&o.id)m[c+'|'+o.id]=o;}));SINGLES.forEach(k=>m['config|'+k]=db[k]);return m;}
function setSync(t,cls){const s=$('#sync');if(s){s.textContent=t;s.className='sync '+(cls||'');}}
function agendarEnvio(){clearTimeout(tEnvio);setSync('salvando…');tEnvio=setTimeout(enviar,modo==='local'?60:350);}
function enviar(){
  if(!sessao)return;
  if(enviando){pendente=true;return;}
  const atual=chaves(),ups=[],exc=[],novos={};
  for(const k in atual){const j=JSON.stringify(atual[k]);if(snap[k]!==j){const i=k.indexOf('|');ups.push({colecao:k.slice(0,i),id:k.slice(i+1),dados:atual[k]});novos[k]=j;}}
  for(const k in snap)if(!(k in atual)){const i=k.indexOf('|');exc.push({colecao:k.slice(0,i),id:k.slice(i+1)});}
  if(!ups.length&&!exc.length){setSync(modo==='local'?'✓ salvo (demonstração)':'✓ salvo','ok');return;}
  enviando=true;
  api('salvar',{upserts:ups,exclusoes:exc}).then(()=>{Object.assign(snap,novos);exc.forEach(e=>delete snap[e.colecao+'|'+e.id]);setSync(modo==='local'?'✓ salvo (demonstração)':'✓ salvo','ok');})
  .catch(e=>{setSync(e&&e.status===403?'sem permissão':'⚠ sem conexão — tentando de novo','err');if(e&&e.status!==401&&e.status!==403)setTimeout(enviar,6000);})
  .finally(()=>{enviando=false;if(pendente){pendente=false;enviar();}});
}
function puxar(inicial){
  if(!sessao)return Promise.resolve();
  return api('dados',null,'&desde='+(inicial?0:Math.max(0,ultimoSync-3000))).then(r=>{
    let mudou=false;const atual=inicial?{}:chaves();
    r.registros.forEach(x=>{
      const k=x.colecao+'|'+x.id;
      if(!inicial&&k in atual&&snap[k]!==JSON.stringify(atual[k]))return; // alteração local ainda não enviada: a local vence
      const novo=x.excluido?null:JSON.stringify(x.dados);
      if(!inicial&&snap[k]===novo)return;
      mudou=true;
      if(x.colecao==='config'){if(!x.excluido&&SINGLES.includes(x.id))db[x.id]=x.dados;}
      else if(COLS.includes(x.colecao)){const arr=db[x.colecao];const i=arr.findIndex(o=>o.id===x.id);
        if(x.excluido){if(i>=0)arr.splice(i,1);}else if(i>=0)arr[i]=x.dados;else arr.push(x.dados);}
      if(x.excluido)delete snap[k];else snap[k]=novo;
    });
    ultimoSync=r.agora;
    if(mudou&&!inicial){migrar(db);renderSeguro();}
  }).catch(()=>{});
}
function renderSeguro(){
  const a=document.activeElement;
  if($('#mbg').classList.contains('open')||(a&&a.closest&&a.closest('#view')&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))){precisaRender=true;return;}
  render();
}
function mostrarLogin(msg){
  sessao=null;$('#login').hidden=false;$('#l-err').textContent=msg||'';
  $('#l-demo').innerHTML=modo==='local'?`<div class="small muted" style="margin-bottom:6px">Demonstração — todos com a senha <b>demo1234</b>:</div><div class="ldemo">${(demo.store?.contas||[]).filter(c=>c.ativo).map(c=>`<button type="button" data-login="${esc(c.email)}"><b>${esc(c.nome)}</b><small>${esc(papelNome(c.papel))}</small></button>`).join('')}</div>`:'';
  setTimeout(()=>$('#l-email').focus(),50);
}
async function entrar(u){
  sessao=u;$('#login').hidden=true;
  db=vazio();snap={};ultimoSync=0;ui.f={};
  setSync('carregando…');
  await puxar(true);migrar(db);
  // primeira vez no banco: grava a configuração padrão
  let m=db.usuarios.find(x=>x.email&&norm(x.email)===norm(u.email));
  if(!m&&u.papel!=='parceiro'){m={id:uid(),nome:u.nome,papel:papelNome(u.papel).replace(/ —.*/,''),oab:'',email:u.email};db.usuarios.push(m);}
  db.usuarioAtual=m?m.id:'';
  if(['admin','advogado'].includes(u.papel)){if(!db.modelos.length)db.modelos=modelosPadrao();if(!db.scripts.length)db.scripts=scriptsPadrao();
    if(!db.produtos.some(p=>norm(p)==='direito digital'))db.produtos.push('Direito digital');}
  save();if(!location.hash)location.hash='painel';render();
  clearInterval(tPuxar);if(modo==='servidor')tPuxar=setInterval(()=>puxar(false),20000);
  setTimeout(checarMetas,600);
}
async function iniciar(){
  // dentro da página publicada no Claude (window.claude) não há servidor: modo demonstração
  if(/^https?:$/.test(location.protocol)&&!window.claude){
    try{
      modo='servidor';
      const s=await Promise.race([api('sessao'),new Promise((_,rej)=>setTimeout(()=>rej({timeout:1}),5000))]);
      await entrar(s.usuario);return;
    }catch(e){
      if(e&&e.status===401){db=vazio();render();mostrarLogin();return;}
      if(e&&e.status===503&&!e.naoApi){db=vazio();$('#view').innerHTML='<div class="card"><h3>Sistema ainda não configurado</h3><p>Crie o arquivo <b>config.php</b> a partir de <b>config.exemplo.php</b> com os dados do banco de dados e depois abra <b>instalar.php</b>. Veja o guia de hospedagem.</p></div>';return;}
      if(e&&e.status===500&&!e.naoApi){db=vazio();$('#view').innerHTML='<div class="card"><h3>Erro de conexão com o banco de dados</h3><p>Confira host, nome do banco, usuário e senha no <b>config.php</b>.</p></div>';return;}
    }
  }
  modo='local';demoLoad();
  try{const s=await api('sessao');await entrar(s.usuario);}
  catch(e){db=vazio();render();mostrarLogin();}
}
const papel=()=>sessao?sessao.papel:'';
const podeFin=()=>['admin','advogado','financeiro'].includes(papel());
const ehAdmin=()=>papel()==='admin';
const ehParceiro=()=>papel()==='parceiro';
const meuEmail=()=>sessao?norm(sessao.email):'';
const parceiros=()=>db.usuarios.filter(u=>/parceir/i.test(u.papel)&&u.email);

/* ---------- consultas ---------- */
const cli=id=>db.clientes.find(c=>c.id===id);
const proc=id=>db.processos.find(p=>p.id===id);
const usr=id=>db.usuarios.find(u=>u.id===id);
const ctr=id=>db.contratos.find(k=>k.id===id);
const nomeCli=id=>cli(id)?.nome||'—';
const nomeUsr=id=>usr(id)?.nome||'—';
const cidadeUF=c=>[c?.cidade,c?.uf].filter(Boolean).join('/');
function idadeDe(c){if(!c)return null;if(c.nascimento){const n=new Date(c.nascimento+'T00:00'),h=new Date();let a=h.getFullYear()-n.getFullYear();if(h<new Date(h.getFullYear(),n.getMonth(),n.getDate()))a--;return a;}return c.idade?+c.idade:null;}
function lancStatus(l){return l.pago?'Pago':diff(l.venc)<0?'Atrasado':'Em aberto';}
const dataCaixa=l=>l.pagoEm||l.venc;
function areaLanc(l){const p=proc(l.processoId)||db.processos.find(p=>p.clienteId===l.clienteId);return p?p.area:'Sem processo';}
function prodLanc(l){return l.produto||(l.contratoId&&ctr(l.contratoId)?.produto)||cli(l.clienteId)?.produto||'';}
function proxEvento(pid){return db.eventos.filter(e=>e.processoId===pid&&!e.feito).sort((a,b)=>a.data.localeCompare(b.data))[0];}
function saldoAberto(cid){return sumBy(db.lancamentos.filter(l=>l.tipo==='receita'&&l.clienteId===cid&&!l.pago),l=>l.valor);}
const valorParcela=k=>+k.valorParcela||(k.parcelas?Math.round((k.valorTotal-(k.entrada||0))/k.parcelas*100)/100:0);
function recebidoContrato(k){const v=sumBy(db.lancamentos.filter(l=>l.tipo==='receita'&&l.pago&&l.contratoId===k.id),l=>l.valor);return v||(+k.recebidoImportado||0);}
function recebidoCliente(cid){return sumBy(db.lancamentos.filter(l=>l.tipo==='receita'&&l.pago&&l.clienteId===cid),l=>l.valor);}
function receitasPagas(ini,fim,f){return db.lancamentos.filter(l=>l.tipo==='receita'&&l.pago&&dataCaixa(l)>=ini&&dataCaixa(l)<=fim&&(!f||f(l)));}
function despesasPagas(ini,fim,f){return db.lancamentos.filter(l=>l.tipo==='despesa'&&l.pago&&dataCaixa(l)>=ini&&dataCaixa(l)<=fim&&(!f||f(l)));}
function saldoAntes(dataIni){
  const e=db.escritorio;let s=+e.saldoInicial||0;const ini=e.saldoInicialData||'0000-00-00';
  db.lancamentos.forEach(l=>{if(!l.pago)return;const d=dataCaixa(l);if(d>=ini&&d<dataIni)s+=l.tipo==='receita'?l.valor:-l.valor;});return s;
}

/* ---------- contratos → parcelas no financeiro ---------- */
function proxDia(dataIso,dia){return diaNoMes(addMonths(dataIso.slice(0,7)+'-01',1).slice(0,7),dia||10);}
function gerarParcelas(k,pago){
  const out=[];pago=pago||(()=>false);
  const base={tipo:'receita',categoria:'H.O. iniciais',clienteId:k.clienteId,processoId:k.processoId||'',contratoId:k.id,forma:k.forma||'PIX',produto:'',obs:'',criado:k.data};
  if(+k.entrada>0){const v=k.data,p=pago(v);out.push({...base,id:uid(),descricao:'H.O. iniciais — entrada',valor:+k.entrada,venc:v,pago:p,pagoEm:p?v:''});}
  const n=Math.max(0,Math.round(+k.parcelas||0)),vp=valorParcela(k);
  if(n>0&&vp>0){const first=k.primeiroVenc||proxDia(k.data,+k.diaVenc||10);
    for(let i=0;i<n;i++){const v=addMonths(first,i),p=pago(v);out.push({...base,id:uid(),descricao:`H.O. iniciais — parcela ${i+1}/${n}`,valor:vp,venc:v,pago:p,pagoEm:p?v:''});}}
  return out;
}

/* ---------- dados de demonstração ---------- */
function seed(){
  const d=vazio();const t0=today();
  d.escritorio.saldoInicial=15000;d.escritorio.saldoInicialData=monthDate(-5,1);d.escritorio.cidade='São Paulo/SP';
  d.usuarios=[{id:'u1',nome:'Adv. Martins',papel:'Sócio(a)',oab:'OAB/SP 000.001',email:''},{id:'u2',nome:'Adv. Saturnino',papel:'Sócio(a)',oab:'OAB/SP 000.002',email:''},
    {id:'u3',nome:'Estagiário(a)',papel:'Estagiário(a)',oab:'',email:''},{id:'u4',nome:'Secretaria',papel:'Administrativo / financeiro',oab:'',email:''}];
  d.usuarioAtual='u1';
  d.clientes=[
    ['c1','PF','Ana Paula Silva','123.456.789-00','(11) 99999-0001','ana.paula@email.com','São Paulo','SP','Facebook / Instagram Ads','Salário-maternidade','Ativo',-100,'Feminino',29,'Vendedora',2200],
    ['c2','PF','Fernanda Lima','345.678.901-22','(31) 97777-0003','fernanda@email.com','Belo Horizonte','MG','Google Ads','Salário-maternidade','Ativo',-70,'Feminino',33,'Auxiliar administrativa',2600],
    ['c3','PF','José Carlos Pereira','222.333.444-55','(11) 98888-1234','jose.c@email.com','Guarulhos','SP','Indicação de cliente','Trabalhista','Ativo',-170,'Masculino',47,'Metalúrgico',3800],
    ['c4','PJ','Padaria Pão Dourado Ltda.','12.345.678/0001-90','(11) 3333-4444','contato@paodourado.com','São Paulo','SP','Indicação de parceiro','Empresarial','Ativo',-120,'',null,'',0],
    ['c5','PF','Isabela Cruz','890.123.456-77','(84) 92222-0008','isabela@email.com','Natal','RN','Instagram orgânico','Salário-maternidade','Ativo',-45,'Feminino',24,'Agricultora',1400],
    ['c6','PF','Marcos Antônio Rocha','555.666.777-88','(21) 97777-5555','marcos@email.com','Niterói','RJ','Site','Família','Ativo',-140,'Masculino',52,'Engenheiro',9000],
    ['c7','PJ','TechNova Soluções ME','98.765.432/0001-10','(19) 4002-8922','fin@technova.com','Campinas','SP','Indicação de parceiro','Tributário','Ativo',-25,'',null,'',0],
    ['c8','PF','Juliana Melo','567.890.123-44','(62) 95555-0005','juliana@email.com','Goiânia','GO','Facebook / Instagram Ads','Salário-maternidade','Inativo',-160,'Feminino',31,'Professora',3100],
    ['c9','PF','Roberta Alves','111.222.333-44','(81) 96666-7777','roberta@email.com','Recife','PE','Facebook / Instagram Ads','Salário-maternidade','Ativo',-3,'Feminino',27,'Atendente',1900],
    ['c10','PF','Diego Fernandes','999.888.777-66','(41) 95555-4444','diego@email.com','Curitiba','PR','Google Ads','Trabalhista','Ativo',-1,'Masculino',35,'Motorista',3200],
  ].map(a=>({id:a[0],tipo:a[1],nome:a[2],doc:a[3],tel:a[4],email:a[5],cidade:a[6],uf:a[7],origem:a[8],produto:a[9],status:a[10],criado:addDays(a[11]),
    primeiroContato:addDays(a[11]-6),ultimoContato:addDays(a[11]),sexo:a[12],idade:a[13],profissao:a[14],renda:a[15],obs:''}));
  d.processos=[
    ['p1','c1','1002345-67.2026.4.03.6301','Previdenciário','Judicial','JEF Cível de São Paulo','INSS','Salário-maternidade','Instrução','Em andamento','u1',8400,-90],
    ['p2','c2','NB 215.678.901-2','Previdenciário','Administrativo','INSS — APS Belo Horizonte','INSS','Salário-maternidade (via vínculo)','Administrativo — exigência','Em andamento','u1',7200,-60],
    ['p3','c3','0012345-11.2025.5.02.0001','Trabalhista','Judicial','1ª Vara do Trabalho de São Paulo','Metalúrgica Alfa S.A.','Verbas rescisórias e horas extras','Sentença','Em andamento','u2',48000,-160],
    ['p4','c4','1023456-78.2026.8.26.0100','Cível','Judicial','5ª Vara Cível — Foro Central SP','Distribuidora Beta Ltda.','Ação de cobrança','Citação','Em andamento','u2',23500,-25],
    ['p5','c5','NB 198.765.432-1','Previdenciário','Administrativo','INSS — APS Natal','INSS','Salário-maternidade rural','Administrativo — análise','Em andamento','u1',6500,-40],
    ['p6','c6','1004567-89.2025.8.19.0002','Família','Judicial','2ª Vara de Família — Niterói','Cláudia Rocha','Revisão de alimentos','Instrução','Em andamento','u2',0,-130],
    ['p7','c7','5001234-56.2026.4.03.6105','Tributário','Judicial','2ª Vara Federal de Campinas','União Federal','Exclusão do ICMS da base do PIS/COFINS','Inicial / Distribuição','Em andamento','u2',120000,-10],
    ['p8','c8','NB 187.654.321-0','Previdenciário','Administrativo','INSS — APS Goiânia','INSS','Salário-maternidade','Encerrado','Ganho','u1',7800,-155],
    ['p9','c3','1009876-54.2026.8.26.0224','Consumidor','Judicial','JEC de Guarulhos','Banco Gama S.A.','Danos morais — negativação indevida','Instrução','Em andamento','u1',15000,-8],
  ].map(a=>({id:a[0],clienteId:a[1],numero:a[2],area:a[3],tipo:a[4],orgao:a[5],parteContraria:a[6],objeto:a[7],fase:a[8],status:a[9],responsavelId:a[10],valorCausa:a[11],distribuicao:addDays(a[12]),andamentos:[]}));
  const and=(pid,off,txt)=>d.processos.find(p=>p.id===pid).andamentos.push({id:uid(),data:addDays(off),texto:txt});
  and('p1',-90,'Petição inicial distribuída.');and('p1',-35,'Citação do INSS.');and('p1',-8,'Laudo pericial juntado aos autos — prazo para manifestação.');
  and('p2',-60,'Requerimento protocolado no Meu INSS.');and('p2',-6,'Exigência emitida: CNIS atualizado e declaração de vínculo.');
  and('p3',-160,'Distribuição.');and('p3',-60,'Audiência de instrução realizada.');and('p3',-4,'Sentença publicada — procedência parcial.');
  and('p4',-25,'Distribuição.');and('p4',-5,'Mandado de citação expedido.');and('p5',-40,'Requerimento protocolado.');
  and('p6',-130,'Distribuição.');and('p6',-30,'Contestação apresentada pela parte contrária.');and('p7',-10,'Distribuição com pedido de tutela.');
  and('p8',-155,'Requerimento protocolado.');and('p8',-130,'Benefício deferido.');and('p9',-8,'Distribuição.');
  d.eventos=[
    ['Prazo','Manifestação sobre o laudo pericial','p1','c1',-1,'','u1',false],['Exigência INSS','Cumprir exigência — CNIS e declaração de vínculo','p2','c2',0,'','u3',false],
    ['Reunião','Reunião — documentos societários','p7','c7',2,'10:00','u2',false],['Audiência','Audiência de conciliação','p9','c3',3,'14:00','u1',false],
    ['Prazo','Recurso ordinário — prazo final','p3','c3',5,'','u2',false],['Prazo','Réplica à contestação','p4','c4',9,'','u2',false],
    ['Perícia','Perícia médica — acompanhar cliente','p1','c1',12,'09:30','u1',false],['Audiência','Audiência de instrução','p6','c6',18,'15:00','u2',false],
    ['Prazo','Emenda à inicial','p7','c7',-6,'','u2',true],
  ].map(a=>({id:uid(),tipo:a[0],titulo:a[1],processoId:a[2],clienteId:a[3],data:addDays(a[4]),hora:a[5],responsavelId:a[6],feito:a[7],obs:''}));
  d.tarefas=[
    ['Cobrar CNIS atualizado — Fernanda','todo',0,'Alta','u3','c2','p2'],['Minutar recurso ordinário — José Carlos','doing',3,'Alta','u2','c3','p3'],
    ['Preparar quesitos para perícia — Ana Paula','todo',8,'Média','u1','c1','p1'],['Enviar contrato para assinatura — Diego','todo',1,'Alta','u4','c10',''],
    ['Conferir autodeclaração rural — Isabela','doing',4,'Média','u3','c5','p5'],['Emitir recibos do mês','todo',-2,'Baixa','u4','',''],
    ['Protocolar réplica — Pão Dourado','todo',8,'Alta','u2','c4','p4'],['Protocolar requerimento — Roberta','todo',2,'Alta','u1','c9',''],
  ].map(a=>({id:uid(),titulo:a[0],status:a[1],prazo:addDays(a[2]),prioridade:a[3],responsavelId:a[4],clienteId:a[5],processoId:a[6]}));
  d.leads=[
    ['Kátia Sousa','(11) 94444-0006','Salário-maternidade','Facebook / Instagram Ads','Novo contato',2500,-1,'Gestante, trabalhou como CLT até o 5º mês.','Feminino',30,'SP','São Paulo'],
    ['Larissa Neves','(31) 93333-0007','Salário-maternidade','Indicação de cliente','Em atendimento',2400,-5,'MEI, verificar carência.','Feminino',28,'MG','Contagem'],
    ['Roberto Dias','(11) 95555-1111','Trabalhista','Google Ads','Proposta enviada',6000,-9,'Demissão sem pagamento de verbas.','Masculino',41,'SP','Osasco'],
    ['Mercado Bom Preço','(11) 3222-1000','Empresarial','Indicação de parceiro','Proposta enviada',3500,-12,'Assessoria mensal (partido).','',null,'SP','São Paulo'],
    ['Patrícia Gomes','(85) 96666-2222','Família','Instagram orgânico','Em recuperação',2500,-20,'Divórcio consensual — sumiu após a proposta.','Feminino',38,'CE','Fortaleza'],
    ['Carlos Eduardo','(41) 98888-3333','Consumidor','Site','Perdido',1800,-25,'Optou por outro escritório.','Masculino',45,'PR','Curitiba'],
    ['Simone Araújo','(21) 97777-4444','Salário-maternidade','Facebook / Instagram Ads','Novo contato',2500,0,'','Feminino',26,'RJ','Rio de Janeiro'],
    ['Paulo Henrique','(51) 98877-6655','Criminal','Google Ads','Encaminhado a parceiro',0,-15,'Área não atendida — enviado a escritório parceiro.','Masculino',39,'RS','Porto Alegre'],
  ].map(a=>({id:uid(),nome:a[0],tel:a[1],produto:a[2],origem:a[3],etapa:a[4],valor:a[5],criado:addDays(a[6]),primeiroContato:addDays(a[6]),ultimoContato:addDays(Math.min(0,a[6]+2)),
    obs:a[7],sexo:a[8],idade:a[9],uf:a[10],cidade:a[11],email:'',profissao:'',renda:0,proposta:a[5]?brl(a[5])+' (entrada + parcelas)':''}));
  // contratos e parcelas
  const K=[
    ['k1','c3','p3',-170,'Trabalhista','Judicial',12000,4000,6,'Boleto',0,120,10,30],['k2','c8','p8',-160,'Salário-maternidade','Administrativo',2400,600,3,'PIX',85,0,20,30],
    ['k3','c6','p6',-140,'Família','Judicial',7200,1800,6,'Boleto',0,60,20,0],['k4','c4','p4',-120,'Empresarial','Judicial',9600,2400,4,'Boleto',0,250,10,0],
    ['k5','c1','p1',-100,'Salário-maternidade','Judicial',3200,800,3,'PIX',92,45,10,30],['k6','c2','p2',-70,'Salário-maternidade','Administrativo',2400,600,3,'PIX',110,0,30,30],
    ['k7','c5','p5',-45,'Salário-maternidade','Administrativo',2700,900,3,'Cartão',75,0,20,30],['k8','c7','p7',-25,'Tributário','Judicial',18000,6000,8,'Boleto',0,0,10,20],
    ['k9','c3','p9',-8,'Consumidor','Judicial',3000,1000,4,'PIX',0,30,30,30],['k10','c9','',-3,'Salário-maternidade','Administrativo',2500,700,3,'PIX',98,0,10,30],
    ['k11','c10','',-1,'Trabalhista','Judicial',4500,1500,5,'Cartão',140,0,20,30],
  ];
  K.forEach(a=>{const k={id:a[0],clienteId:a[1],processoId:a[2],data:addDays(a[3]),produto:a[4],ambito:a[5],valorTotal:a[6],entrada:a[7],parcelas:a[8],forma:a[9],cac:a[10],custos:a[11],
      custosDesc:a[11]?'Correios e deslocamento':'',diaVenc:a[12],exitoPct:a[13],valorParcela:0,hoAcordo:0,hoExito:0,sucumbencia:0,titular:'',proposta:'',obs:''};
    k.valorParcela=valorParcela(k);d.contratos.push(k);
    d.lancamentos.push(...gerarParcelas(k,v=>v<=t0&&!(k.id==='k6'&&v>addDays(-40))));});
  const L=(tipo,descricao,categoria,clienteId,processoId,valor,venc,forma,pago,extra)=>{const p=pago===undefined?venc<=t0:pago;d.lancamentos.push({id:uid(),tipo,descricao,categoria,clienteId,processoId,valor,venc,pago:p,pagoEm:p?venc:'',forma,produto:'',obs:'',contratoId:'',criado:venc,...(extra||{})});};
  // despesas fixas (previsto) e lançamentos mensais (real)
  d.despesasFixas=[['Aluguel','Aluguel',3800,5],['Energia elétrica','Energia elétrica',420,12],['Telefone e internet','Telefonia / internet',290,12],['Sistemas (jurídico, assinatura eletrônica, e-mail)','Sistemas',480,10],
    ['Google Ads — salário-maternidade','Tráfego — Google',800,15,'Salário-maternidade'],['Meta Ads — salário-maternidade','Tráfego — Facebook/Instagram',1200,15,'Salário-maternidade'],['Contador','Contador',990,10],
    ['Folha de pagamento','Folha de pagamento',4500,5],['Simples Nacional','Impostos',1100,20],['Taxas de cartão','Taxa de cartão',180,25],['Tarifas bancárias','Tarifas bancárias',120,25],['Copa (água, café)','Copa',180,8]]
    .map(a=>({id:uid(),descricao:a[0],categoria:a[1],previsto:a[2],dia:a[3],produto:a[4]||'',ativo:true}));
  for(let m=-5;m<=0;m++){const ym=monthDate(m,1).slice(0,7);
    d.despesasFixas.forEach((f,i)=>{const venc=diaNoMes(ym,f.dia);const real=Math.round(f.previsto*(1+(((i*7+m*3)%9+9)%9-4)/100)*100)/100;
      L('despesa',f.descricao,f.categoria,'','',venc<=t0?real:f.previsto,venc,'Boleto',undefined,{fixaId:f.id,produto:f.produto});});
    L('receita','Honorários mensais — partido','Honorários mensais (partido)','c4','',2500,diaNoMes(ym,10),'Boleto',m<0?true:false);
    if(m>=-1)L('receita','Honorários mensais — partido','Honorários mensais (partido)','c7','p7',3500,diaNoMes(ym,10),'PIX');
    L('receita','Consulta jurídica','Consulta','','',600+((m+6)%3)*300,diaNoMes(ym,6),'PIX');
    if(m<0){L('despesa','Distribuição de lucros aos sócios',LUCROS,'','',2500,diaNoMes(ym,28),'Transferência');
      L('receita','H.O. finais — êxito (benefícios concedidos)','H.O. finais — êxito','','',5200+((m+6)*730)%2600,diaNoMes(ym,18),'PIX',undefined,{produto:'Salário-maternidade'});}
  }
  L('receita','H.O. finais — êxito (salário-maternidade)','H.O. finais — êxito','c8','p8',2340,addDays(-125),'PIX');
  L('receita','Sucumbência','Sucumbência','c8','p8',780,addDays(-95),'Transferência');
  L('receita','H.O. finais — acordo','H.O. finais — acordo','c6','p6',2000,addDays(-20),'PIX');
  L('receita','Parceria — execução delegada','Parceria (execução delegada)','','',1800,addDays(-35),'Transferência');
  L('receita','H.O. finais — êxito (estimado 30%)','H.O. finais — êxito','c3','p3',14400,addDays(75),'Transferência',false,{contratoId:'k1'});
  L('despesa','Custas — preparo do recurso','Custas processuais','c3','p3',680,addDays(4),'Boleto',false);
  L('despesa','Conserto do ar-condicionado','Manutenção / extraordinárias','','',950,addDays(-40),'PIX');
  L('despesa','Correios — envio de documentos','Correios','c5','p5',45.7,addDays(-30),'Cartão');
  d.documentos=[['c1','RG e CPF',1],['c1','Certidão de nascimento da criança',1],['c1','CNIS atualizado',0],['c1','Comprovante de residência',1],
    ['c2','CNIS atualizado',0],['c2','Declaração de vínculo do empregador',0],['c2','RG e CPF',1],['c5','Autodeclaração do segurado especial (rural)',0],['c5','Contrato de comodato / ITR',0],['c5','RG e CPF',1],
    ['c4','Contrato social e alterações',1],['c4','Notas fiscais e duplicatas',1],['c7','Contrato social',1],['c7','Apurações PIS/COFINS (5 anos)',0],['c3','CTPS',1],['c3','Termo de rescisão (TRCT)',1],
    ['c9','RG e CPF',0],['c9','Certidão de nascimento da criança',0]].map(a=>({id:uid(),clienteId:a[0],nome:a[1],recebido:!!a[2],data:a[2]?addDays(-20):''}));
  d.notas=[{id:uid(),clienteId:'c1',data:addDays(-9),autor:'u1',texto:'Cliente informou que o parto foi antecipado. Atualizar documentos.'},
    {id:uid(),clienteId:'c3',data:addDays(-4),autor:'u2',texto:'Explicada a sentença por telefone; cliente autorizou o recurso.'},
    {id:uid(),clienteId:'c7',data:addDays(-25),autor:'u2',texto:'Contrato assinado + partido de R$ 3.500/mês.'}];
  seedV6(d);
  return d;
}

