/* =========================================================
   PRODUÇÃO DE CONTEÚDO (tráfego orgânico: TikTok, Instagram, YouTube…)
   ========================================================= */
const CONT_ETAPAS=['Ideia','Roteiro','Gravação','Edição','Agendado','Publicado'];
const CONT_PLAT=['TikTok','Instagram','YouTube','Facebook','LinkedIn','WhatsApp (status)'];
const CONT_FORMATOS=['Vídeo curto (TikTok/Reels/Shorts)','Vídeo longo (YouTube)','Carrossel','Post estático','Stories','Live','Anúncio (Meta)'];
const CONT_TEMAS=['Salário-maternidade','INSS / previdenciário','BPC / LOAS','Trabalhista','Família','Consumidor','Dúvidas frequentes','Bastidores do escritório','Notícia / mudança na lei','Caso de sucesso (com autorização)'];
const CONT_ICON={TikTok:'🎵',Instagram:'📸',YouTube:'▶️',Facebook:'📘',LinkedIn:'💼','WhatsApp (status)':'💬'};
const corCont={Ideia:'p-gray',Roteiro:'p-blue',Gravação:'p-amber',Edição:'p-amber',Agendado:'p-green',Publicado:'p-green'};
const ROTEIRO_BASE=`GANCHO (0 a 3 segundos — a frase que prende):
…

DESENVOLVIMENTO (explique em linguagem simples, 3 pontos no máximo):
1. …
2. …
3. …

CHAMADA FINAL (CTA informativa):
Ex.: "Salva esse vídeo e manda pra quem está grávida" / "Ficou com dúvida? Comenta aqui"`;
const SUGESTOES_CONTEUDO=[
  ['Salário-maternidade','Desempregada tem direito a salário-maternidade? (período de graça explicado)'],
  ['Salário-maternidade','3 erros que fazem o INSS negar o salário-maternidade'],
  ['Salário-maternidade','MEI tem direito a salário-maternidade? Quantas contribuições precisa?'],
  ['Salário-maternidade','Salário-maternidade para quem trabalha na roça (segurada especial)'],
  ['Salário-maternidade','Adotou? Você também tem direito ao salário-maternidade'],
  ['Salário-maternidade','Quanto tempo o INSS demora para pagar o salário-maternidade?'],
  ['INSS / previdenciário','O que fazer quando o INSS nega o seu pedido'],
  ['INSS / previdenciário','Como tirar o CNIS pelo celular (passo a passo na tela)'],
  ['INSS / previdenciário','Auxílio-doença: o que levar na perícia'],
  ['BPC / LOAS','BPC/LOAS: quem tem direito e qual a renda máxima'],
  ['Dúvidas frequentes','Respondendo as perguntas mais comuns da semana'],
  ['Dúvidas frequentes','Mito ou verdade sobre direitos da gestante'],
  ['Bastidores do escritório','Um dia no escritório: como cuidamos de cada caso'],
  ['Bastidores do escritório','Apresentação da equipe (quem é quem)'],
  ['Notícia / mudança na lei','Mudou a regra? Explicando a novidade em 60 segundos'],
  ['Trabalhista','Grávida pode ser demitida? Estabilidade da gestante'],
];
const ehOrganico=l=>/org[aâ]nico|tiktok|youtube/i.test(l.origem||'');
function metaConteudo(){return +(db.escritorio.metaConteudoSemana||5);}
function semanaAtual(){const d0=new Date(today()+'T12:00');const dw=(d0.getDay()+6)%7;return [addDays(-dw,today()),addDays(6-dw,today())];}
function regHistCont(c){(c.historico=c.historico||[]).push({em:Date.now(),por:db.usuarioAtual,etapa:c.etapa});}
function editConteudo(id,pre){
  const c=id?db.conteudos.find(x=>x.id===id):{etapa:'Ideia',plataformas:['TikTok'],formato:CONT_FORMATOS[0],responsaveis:[db.usuarioAtual],roteiro:ROTEIRO_BASE,...pre};
  form(id?'Conteúdo':'Novo conteúdo',[
    {k:'titulo',l:'Tema / título do conteúdo',req:1,full:1,ph:'Ex.: Desempregada tem direito a salário-maternidade?'},
    {k:'etapa',l:'Etapa',t:'select',o:CONT_ETAPAS,req:1},{k:'tema',l:'Assunto',t:'select',o:CONT_TEMAS},
    {k:'formato',l:'Formato',t:'select',o:CONT_FORMATOS},{k:'plataformas',l:'Onde publicar',t:'multi',o:CONT_PLAT,full:1},
    {k:'responsaveis',l:'Quem grava / aparece',t:'multi',o:O.usuarios,full:1},{k:'editorId',l:'Quem edita',t:'select',o:O.usuarios},
    {t:'sec',l:'Roteiro'},
    {k:'gancho',l:'Gancho (a primeira frase)',full:1,ph:'Ex.: "Você foi demitida grávida? Então presta atenção…"'},
    {k:'roteiro',l:'Roteiro completo',t:'textarea',full:1,rows:8,dica:id?'Dica: use o botão <b>🤖 Roteiro com IA</b> no card do quadro para gerar um rascunho.':''},
    {k:'legenda',l:'Legenda / descrição',t:'textarea',full:1,rows:3},{k:'hashtags',l:'Hashtags',full:1,ph:'#salariomaternidade #inss #direitodagestante'},
    {k:'conformeOAB',l:'Revisado conforme o Provimento 205/2021 da OAB (sem promessa de resultado, sem preço, sem captação de clientela; conteúdo informativo)',t:'check',full:1},
    {t:'sec',l:'Produção e agendamento'},
    {k:'dataGravacao',l:'Gravar em',t:'date'},{k:'dataEdicao',l:'Edição pronta até',t:'date'},
    {k:'dataPublicacao',l:'Publicar em',t:'date'},{k:'hora',l:'Horário da postagem',t:'time'},
    {k:'linkBruto',l:'Vídeo bruto (pasta do Drive)',t:'url',full:1,ph:'https://drive.google.com/…'},
    {k:'linkEditado',l:'Vídeo editado / arte final',t:'url',full:1},
    {k:'linkPublicado',l:'Link da publicação',t:'url',full:1,ph:'https://www.tiktok.com/@…'},
    {t:'sec',l:'Resultados (preencha uns dias depois de publicar)'},
    {k:'views',l:'Visualizações',t:'number',vazio:''},{k:'curtidas',l:'Curtidas',t:'number',vazio:''},
    {k:'comentarios',l:'Comentários',t:'number',vazio:''},{k:'compart',l:'Compartilhamentos',t:'number',vazio:''},
    {k:'salvos',l:'Salvamentos',t:'number',vazio:''},{k:'seguidores',l:'Seguidores ganhos',t:'number',vazio:''},
    {k:'leadsGerados',l:'Pessoas que chamaram no WhatsApp',t:'number',vazio:''},
    {k:'obs',l:'Observações',t:'textarea',full:1,rows:2}],
    c,v=>{if(v.etapa==='Publicado'&&!v.dataPublicacao)v.dataPublicacao=today();
      if(id){const mudou=v.etapa!==c.etapa;Object.assign(c,v);if(mudou)regHistCont(c);}
      else{const n={id:uid(),criado:today(),criadoPor:db.usuarioAtual,historico:[],...v};regHistCont(n);db.conteudos.push(n);}
      if(v.etapa==='Publicado'&&!v.conformeOAB)setTimeout(()=>toast('Lembrete: confira as regras de publicidade da OAB antes de publicar.',1),300);},
    id&&(()=>{db.conteudos=db.conteudos.filter(x=>x.id!==id);}));
}
function moverConteudo(id,et){const c=db.conteudos.find(x=>x.id===id);if(!c||c.etapa===et)return;c.etapa=et;regHistCont(c);
  if(et==='Roteiro'&&!c.roteiro)c.roteiro=ROTEIRO_BASE;
  if(et==='Publicado'){if(!c.dataPublicacao||c.dataPublicacao>today())c.dataPublicacao=today();toast('Publicado ✓ Depois lance as visualizações para acompanhar os resultados 📈');}
  if(et==='Agendado'&&!c.dataPublicacao)setTimeout(()=>{toast('Escolha a data da postagem');editConteudo(id);},300);}
const contAtrasado=c=>c.etapa!=='Publicado'&&c.dataPublicacao&&diff(c.dataPublicacao)<=0;
const contProxData=c=>c.etapa==='Ideia'?'':c.etapa==='Roteiro'||c.etapa==='Gravação'?c.dataGravacao:c.etapa==='Edição'?c.dataEdicao:c.dataPublicacao;
async function roteiroIA(id){
  const c=db.conteudos.find(x=>x.id===id);if(!c)return;if(precisaServidor())return;
  if(!INTEG?.ia)return toast('Configure a chave da IA em Configurações → Integrações.',1);
  if(c.roteiro&&c.roteiro!==ROTEIRO_BASE&&!await confirmar('Este conteúdo já tem roteiro. Substituir pelo rascunho da IA? (o atual vai para as observações)','Substituir'))return;
  toast('Gerando o roteiro… (pode levar até 1 minuto)');
  const pedido=`Escreva o roteiro de um ${c.formato||'vídeo curto'} para ${(c.plataformas||['TikTok']).join(', ')} de um escritório de advocacia (${db.escritorio.nome||''}).
Tema: ${c.titulo}. Assunto: ${c.tema||'—'}.${c.gancho?' Gancho sugerido: '+c.gancho:''}${c.obs?' Observações: '+c.obs:''}`;
  try{const r=await api('ia',{modo:'conteudo',pedido});
    if(c.roteiro&&c.roteiro!==ROTEIRO_BASE)c.obs=((c.obs||'')+'\n\nRoteiro anterior:\n'+c.roteiro).trim();
    c.roteiro=r.texto.trim();const m=c.roteiro.match(/GANCHO[^\n]*\n+([^\n]+)/i);if(m&&!c.gancho)c.gancho=m[1].replace(/^["“]|["”]$/g,'').trim();
    if(c.etapa==='Ideia'){c.etapa='Roteiro';regHistCont(c);}
    save();render();editConteudo(id);toast('Roteiro gerado ✓ Revise antes de gravar');}
  catch(e){toast(e.msg||e.message||'Falha ao gerar',1);}
}
function calendarioConteudo(mes){
  const [y,m]=mes.split('-').map(Number);const ini=new Date(y,m-1,1);const dias=new Date(y,m,0).getDate();const off=ini.getDay();
  const porDia={};db.conteudos.filter(c=>c.dataPublicacao&&c.dataPublicacao.startsWith(mes)).forEach(c=>(porDia[+c.dataPublicacao.slice(8)]=porDia[+c.dataPublicacao.slice(8)]||[]).push(c));
  const grav={};db.conteudos.filter(c=>c.dataGravacao&&c.dataGravacao.startsWith(mes)&&['Ideia','Roteiro','Gravação'].includes(c.etapa)).forEach(c=>(grav[+c.dataGravacao.slice(8)]=grav[+c.dataGravacao.slice(8)]||[]).push(c));
  let cel='';for(let i=0;i<off;i++)cel+='<div class="cc vazio"></div>';
  for(let d=1;d<=dias;d++){const ds=`${mes}-${String(d).padStart(2,'0')}`;
    cel+=`<div class="cc${ds===today()?' hoje':''}"><div class="cn">${d}</div>${(grav[d]||[]).map(c=>`<div class="cp grav" data-act="editCont" data-id="${c.id}" title="Gravar">🎬 ${esc(c.titulo)}</div>`).join('')}${(porDia[d]||[]).sort((a,b)=>(a.hora||'').localeCompare(b.hora||'')).map(c=>`<div class="cp ${c.etapa==='Publicado'?'pub':contAtrasado(c)?'atr':''}" data-act="editCont" data-id="${c.id}">${(c.plataformas||[]).map(p=>CONT_ICON[p]||'').join('')} ${c.hora?esc(c.hora)+' ':''}${esc(c.titulo)}</div>`).join('')}</div>`;}
  return `<div class="cal-cont">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(x=>`<div class="ch">${x}</div>`).join('')}${cel}</div>`;
}
V.conteudo=()=>{
  const f=ui.f.cont||(ui.f.cont={ver:'quadro',plat:'',mes:today().slice(0,7)});
  const ls=db.conteudos.filter(c=>!f.plat||(c.plataformas||[]).includes(f.plat));
  const [s0,s1]=semanaAtual();const pubSem=db.conteudos.filter(c=>c.etapa==='Publicado'&&c.dataPublicacao>=s0&&c.dataPublicacao<=s1).length;
  const agSem=db.conteudos.filter(c=>c.etapa==='Agendado'&&c.dataPublicacao>=today()&&c.dataPublicacao<=s1).length;
  const atr=db.conteudos.filter(contAtrasado).length;const mesAt=today().slice(0,7);
  const leadsOrg=db.leads.filter(l=>ehOrganico(l)&&(l.criado||'').startsWith(mesAt)).length;
  const tabs=[['quadro','🎬 Quadro de produção'],['calendario','📅 Calendário de postagens'],['ideias','💡 Banco de ideias'],['resultados','📈 Resultados']];
  let corpo='';
  if(f.ver==='quadro'){
    const card=c=>{const dt=contProxData(c);return `<div class="t" data-act="editCont" data-id="${c.id}" style="cursor:pointer">${esc(c.titulo)}</div>
      <div class="small">${(c.plataformas||[]).map(p=>`<span title="${esc(p)}">${CONT_ICON[p]||''}</span>`).join(' ')} <span class="muted">${esc((c.formato||'').split(' (')[0])}</span></div>
      ${dt?`<div class="meta">${c.etapa==='Publicado'?'publicado '+fd(dt):prazoTxt(dt)+(c.etapa==='Agendado'&&c.hora?' · '+esc(c.hora):'')}</div>`:''}
      ${(c.responsaveis||[]).length?`<div class="small muted">🎥 ${esc(c.responsaveis.map(nomeUsr).join(', '))}${c.editorId?' · ✂️ '+esc(nomeUsr(c.editorId)):''}</div>`:''}
      ${c.etapa==='Publicado'&&+c.views?`<div class="small">👁 ${(+c.views).toLocaleString('pt-BR')}${+c.leadsGerados?' · 💬 '+c.leadsGerados+' contato(s)':''}</div>`:''}
      <div class="flx" style="gap:6px;margin-top:4px">${['Ideia','Roteiro'].includes(c.etapa)?`<button class="btn btn-ghost btn-sm" data-act="contIA" data-id="${c.id}">🤖 Roteiro com IA</button>`:''}${c.linkPublicado?`<a class="small" href="${esc(c.linkPublicado)}" target="_blank" rel="noopener">Ver post ↗</a>`:c.linkEditado?`<a class="small" href="${esc(c.linkEditado)}" target="_blank" rel="noopener">Vídeo editado ↗</a>`:c.linkBruto?`<a class="small" href="${esc(c.linkBruto)}" target="_blank" rel="noopener">Bruto ↗</a>`:''}</div>`;};
    corpo=`<div class="hint">Fluxo: <b>Ideia → Roteiro → Gravação → Edição → Agendado → Publicado</b>. Arraste os cards (ou use ◀ ▶). Antes de publicar, confira as regras de publicidade da OAB (Provimento 205/2021).</div>
      ${kanban(CONT_ETAPAS.map(s=>[s,s]),ls.map(c=>({...c,_col:c.etapa})).sort((a,b)=>(contProxData(a)||'9').localeCompare(contProxData(b)||'9')),'cont',card)}`;
  }else if(f.ver==='calendario'){
    const [y,m]=f.mes.split('-').map(Number);
    corpo=`<div class="toolbar"><button class="btn btn-ghost btn-sm" data-act="contMes" data-id="-1">‹</button><b>${MESES_L[m-1]} de ${y}</b><button class="btn btn-ghost btn-sm" data-act="contMes" data-id="1">›</button>
      <span class="small muted">🎬 gravação · ${Object.values(CONT_ICON).slice(0,3).join('')} postagem (verde = publicada, vermelho = atrasada)</span></div>${calendarioConteudo(f.mes)}`;
  }else if(f.ver==='ideias'){
    const ideias=db.conteudos.filter(c=>c.etapa==='Ideia');const ja=new Set(db.conteudos.map(c=>norm(c.titulo)));
    corpo=`<div class="grid g-2"><div class="card"><h3>💡 Anotar ideia rápida</h3>
      <div class="flx" style="gap:8px"><input id="cont-ideia" placeholder="Ex.: Vídeo respondendo 'MEI tem direito?'" style="flex:1"><select id="cont-ideia-tema"><option value="">Assunto</option>${CONT_TEMAS.map(t=>`<option>${esc(t)}</option>`).join('')}</select><button class="btn btn-brand" data-act="contIdeia">Adicionar</button></div>
      <div class="small muted" style="margin:6px 0 10px">Também dá para ditar pelo 🎙️ do teclado do celular.</div>
      ${ideias.map(c=>`<div class="ev"><span class="pic">💡</span><div class="body"><div class="small strong" data-act="editCont" data-id="${c.id}" style="cursor:pointer">${esc(c.titulo)}</div><div class="small muted">${esc(c.tema||'')} · por ${esc(nomeUsr(c.criadoPor))} em ${fd(c.criado)}</div></div><button class="btn btn-ghost btn-sm" data-act="contRoteirizar" data-id="${c.id}">Roteirizar ›</button></div>`).join('')||'<div class="empty">Nenhuma ideia anotada</div>'}</div>
      <div class="card"><h3>✨ Sugestões de temas <small>clique para adicionar</small></h3>${SUGESTOES_CONTEUDO.map(([t,s],i)=>ja.has(norm(s))?'':`<div class="ev"><span class="pic">＋</span><div class="body"><div class="small">${esc(s)}</div><div class="small muted">${esc(t)}</div></div><button class="btn btn-ghost btn-sm" data-act="contSug" data-id="${i}">Adicionar</button></div>`).join('')}</div></div>`;
  }else{
    const pubs=db.conteudos.filter(c=>c.etapa==='Publicado').sort((a,b)=>(+b.views||0)-(+a.views||0));
    const porPlat=CONT_PLAT.map(p=>{const cs=pubs.filter(c=>(c.plataformas||[]).includes(p));return [p,cs.length,sumBy(cs,c=>+c.views||0),sumBy(cs,c=>+c.seguidores||0),sumBy(cs,c=>+c.leadsGerados||0)];}).filter(x=>x[1]);
    const porTema={};pubs.forEach(c=>{const t=c.tema||'Sem assunto';porTema[t]=porTema[t]||[0,0];porTema[t][0]++;porTema[t][1]+=+c.views||0;});
    const fmt=n=>(+n||0).toLocaleString('pt-BR');
    corpo=`<div class="grid g-kpi">${kpi('Publicados (total)',pubs.length)}${kpi('Visualizações',fmt(sumBy(pubs,c=>+c.views||0)))}${kpi('Seguidores ganhos',fmt(sumBy(pubs,c=>+c.seguidores||0)))}${kpi('Contatos pelo WhatsApp',fmt(sumBy(pubs,c=>+c.leadsGerados||0)),'informados nos conteúdos')}${kpi('Atendimentos orgânicos no mês',leadsOrg,'origem orgânica no CRM')}</div>
      <div class="grid g-2"><div class="card"><h3>Por rede</h3><div class="rolar"><table class="tbl"><thead><tr><th>Rede</th><th>Posts</th><th>Visualizações</th><th>Média/post</th><th>Seguidores</th><th>Contatos</th></tr></thead><tbody>${porPlat.map(([p,n,v,s,l])=>`<tr><td>${CONT_ICON[p]||''} ${esc(p)}</td><td>${n}</td><td>${fmt(v)}</td><td>${fmt(Math.round(v/n))}</td><td>${fmt(s)}</td><td>${fmt(l)}</td></tr>`).join('')||'<tr><td colspan="6" class="muted">Lance as visualizações nos conteúdos publicados</td></tr>'}</tbody></table></div></div>
      <div class="card"><h3>Assuntos que mais funcionam</h3>${Object.entries(porTema).sort((a,b)=>b[1][1]/b[1][0]-a[1][1]/a[1][0]).map(([t,[n,v]])=>`<div class="ev"><span class="pic">🏷</span><div class="body small"><b>${esc(t)}</b> · ${n} post(s) · média ${fmt(Math.round(v/n))} visualizações</div></div>`).join('')||'<div class="empty">Sem dados ainda</div>'}</div></div>
      <div class="card"><h3>Ranking dos conteúdos</h3><div class="rolar"><table class="tbl"><thead><tr><th>Conteúdo</th><th>Data</th><th>Redes</th><th>👁</th><th>❤️</th><th>💬</th><th>🔁</th><th>🔖</th><th>Contatos</th></tr></thead><tbody>${pubs.map(c=>`<tr data-act="editCont" data-id="${c.id}" style="cursor:pointer"><td>${esc(c.titulo)}</td><td>${fd(c.dataPublicacao)}</td><td>${(c.plataformas||[]).map(p=>CONT_ICON[p]||'').join('')}</td><td>${fmt(c.views)}</td><td>${fmt(c.curtidas)}</td><td>${fmt(c.comentarios)}</td><td>${fmt(c.compart)}</td><td>${fmt(c.salvos)}</td><td>${fmt(c.leadsGerados)}</td></tr>`).join('')||'<tr><td colspan="9" class="muted">Nenhum conteúdo publicado ainda</td></tr>'}</tbody></table></div></div>`;
  }
  return `<div class="grid g-kpi">${kpi('Publicados nesta semana',pubSem+' / '+metaConteudo(),pubSem>=metaConteudo()?'meta batida 🎉':'meta da semana',pubSem>=metaConteudo()?'good':'')}${kpi('Agendados (até domingo)',agSem)}${kpi('Atrasados',atr,'data de postagem passou',atr?'bad':'good')}
    ${kpi('Em produção',db.conteudos.filter(c=>['Roteiro','Gravação','Edição'].includes(c.etapa)).length)}${kpi('Ideias no banco',db.conteudos.filter(c=>c.etapa==='Ideia').length)}</div>
  <div class="toolbar"><div class="tabs" style="margin:0;border:none">${tabs.map(([k,l])=>`<button class="tab ${f.ver===k?'active':''}" data-act="contVer" data-id="${k}">${l}</button>`).join('')}</div><span class="grow"></span>
    ${f.ver==='quadro'?`<select data-f="cont.plat"><option value="">Todas as redes</option>${CONT_PLAT.map(p=>`<option${f.plat===p?' selected':''}>${esc(p)}</option>`).join('')}</select>`:''}
    <button class="btn btn-ghost btn-sm" data-act="contMeta">Meta: ${metaConteudo()}/semana</button><button class="btn btn-gold" data-act="novoCont">+ Conteúdo</button></div>${corpo}`;
};
const CONT_ACOES={
  novoCont:()=>editConteudo(),editCont:id=>editConteudo(id),contIA:id=>roteiroIA(id),
  contVer:k=>{ui.f.cont.ver=k;render();},
  contMes:d=>{const f=ui.f.cont;f.mes=ymAdd(f.mes,+d);render();},
  contIdeia:()=>{const t=$('#cont-ideia').value.trim();if(!t)return toast('Escreva a ideia',1);const n={id:uid(),titulo:t,tema:$('#cont-ideia-tema').value,etapa:'Ideia',plataformas:['TikTok'],formato:CONT_FORMATOS[0],responsaveis:[db.usuarioAtual],criado:today(),criadoPor:db.usuarioAtual,historico:[]};regHistCont(n);db.conteudos.push(n);save();render();toast('Ideia anotada 💡');},
  contSug:i=>{const [tema,t]=SUGESTOES_CONTEUDO[+i];const n={id:uid(),titulo:t,tema,etapa:'Ideia',plataformas:['TikTok','Instagram'],formato:CONT_FORMATOS[0],responsaveis:[db.usuarioAtual],criado:today(),criadoPor:db.usuarioAtual,historico:[]};regHistCont(n);db.conteudos.push(n);save();render();toast('Adicionada ao banco de ideias 💡');},
  contRoteirizar:id=>{moverConteudo(id,'Roteiro');save();editConteudo(id);},
  contMeta:()=>form('Meta de publicações',[{k:'meta',l:'Quantos conteúdos publicar por semana?',t:'number',req:1}],{meta:metaConteudo()},v=>{if(!(v.meta>0))return;db.escritorio.metaConteudoSemana=Math.round(v.meta);}),
};
