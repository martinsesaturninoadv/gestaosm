/* =========================================================
   TRÁFEGO PAGO (Meta Ads)
   - importa a planilha exportada do Gerenciador de Anúncios (.csv ou .xlsx);
   - cruza com o CRM e os contratos: custo por atendimento, CAC e retorno por campanha e por nicho;
   - sugestões automáticas e uma análise pronta para colar no Claude.
   ========================================================= */
const ORIGEM_ADS=/facebook|instagram|meta/i;
const ehDeAnuncio=o=>ORIGEM_ADS.test(o||'');
function mapaColsTrafego(head){
  const c=(...a)=>idxCol(head,...a);
  return {conta:c('nome da conta','account name'),campanha:c('nome da campanha','campaign name','campanha'),conjunto:c('nome do conjunto','ad set name','conjunto'),
    anuncio:c('nome do anuncio','ad name'),inicio:c('inicio dos relatorios','reporting starts','dia','day','data'),fim:c('termino dos relatorios','reporting ends'),
    gasto:c('valor usado','amount spent','valor gasto','gasto'),impressoes:c('impressoes','impressions'),alcance:c('alcance','reach'),
    cliques:c('cliques no link','link clicks','cliques (todos)','clicks (all)','cliques'),resultados:c('resultados','results'),tipo:c('indicador de resultado','result indicator','tipo de resultado'),
    conversas:c('conversas por mensagem iniciadas','messaging conversations started'),leads:c('leads','cadastros'),
    veic:c('veiculacao','delivery','status da campanha','campaign status','status')};
}
function nichoDaCampanha(nome){
  const prev=db.trafego.find(t=>t.campanha===nome&&t.nicho);if(prev)return prev.nicho;
  const n=norm(nome);
  for(const p of db.produtos){const ws=norm(p).split(/[^a-z0-9]+/).filter(w=>w.length>=5);if(ws.some(w=>n.includes(w.slice(0,6))))return p;}
  if(/\bsm\b|matern|gestant/.test(n))return db.produtos.find(p=>/matern/i.test(p))||'';
  return '';
}
function tipoDaCampanha(nome){
  const prev=db.trafego.find(t=>t.campanha===nome&&t.tipoCamp);if(prev)return prev.tipoCamp;
  const n=norm(nome);return /teste|test\b|\[t\]|validac/.test(n)?'Teste':/escala|scale|\[e\]/.test(n)?'Escala':'';
}
function lerTrafego(rows){
  let h=-1;for(let i=0;i<Math.min(rows.length,15);i++){const r=(rows[i]||[]).map(x=>norm(String(x??'')));if(r.some(x=>/^(valor usado|amount spent|valor gasto)/.test(x))){h=i;break;}}
  if(h<0)return {erro:'Não encontrei a coluna "Valor usado (BRL)". Exporte o relatório pelo Gerenciador de Anúncios (Relatórios → Exportar → .csv ou .xlsx).'};
  const ix=mapaColsTrafego(rows[h]);
  if(ix.campanha<0&&ix.conjunto<0&&ix.anuncio<0)return {erro:'A planilha precisa ter a coluna "Nome da campanha".'};
  const s=(r,k)=>ix[k]>=0&&r[ix[k]]!=null?String(r[ix[k]]).trim():'';const n=(r,k)=>ix[k]>=0?parseNum(String(r[ix[k]]??'').replace('%','')):0;
  const linhas=[];
  rows.slice(h+1).forEach(r=>{if(!r)return;const campanha=s(r,'campanha'),conjunto=s(r,'conjunto'),anuncio=s(r,'anuncio');
    if(!campanha&&!conjunto&&!anuncio)return; // linha de total
    const inicio=parseData(ix.inicio>=0?r[ix.inicio]:'')||today(),fim=parseData(ix.fim>=0?r[ix.fim]:'')||inicio;
    const conta=s(r,'conta');const v=norm(s(r,'veic'));
    const ativa=!v?null:/inactiv|inativ|desativ|nao |not |off\b|pausad|paused|conclu|complet|arquiv|encerr|rejeit|excluid|deleted/.test(v)?false:/activ|ativ|veicul|on\b/.test(v)?true:null;
    linhas.push({id:'tr'+hashTxt([conta,campanha,conjunto,anuncio,inicio,fim].join('|')).toString(36),conta,campanha:campanha||'(sem nome)',conjunto,anuncio,inicio,fim,
      gasto:n(r,'gasto'),impressoes:n(r,'impressoes'),alcance:n(r,'alcance'),cliques:n(r,'cliques'),resultados:n(r,'resultados'),tipo:s(r,'tipo'),conversas:n(r,'conversas'),leads:n(r,'leads'),ativa});});
  return {linhas,nivel:ix.anuncio>=0?'anúncio':ix.conjunto>=0?'conjunto':'campanha'};
}
async function lerArquivoTrafego(file){
  let rows;
  try{const X=await carregarXLSX();const buf=await file.arrayBuffer();let wb;
    if(/\.(csv|txt)$/i.test(file.name)){let t=new TextDecoder('utf-8').decode(buf);if(t.includes('�'))t=new TextDecoder('windows-1252').decode(buf);wb=X.read(t.replace(/^﻿/,''),{type:'string',raw:true});}
    else wb=X.read(buf,{type:'array'});
    rows=X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:null});}
  catch(e){toast(e.message||'Não foi possível ler a planilha',1);return;}
  const r=lerTrafego(rows);if(r.erro)return toast(r.erro,1);
  if(!r.linhas.length)return toast('Nenhuma linha com dados na planilha',1);
  const chave=t=>[t.conta,t.campanha,t.conjunto,t.anuncio].join('|');
  const ids=new Set(r.linhas.map(l=>l.id));
  // períodos que se sobrepõem (ex.: mês inteiro e depois dia a dia) são substituídos para não somar duas vezes
  const sobrepostas=db.trafego.filter(t=>!ids.has(t.id)&&r.linhas.some(l=>chave(l)===chave(t)&&l.inicio<=t.fim&&t.inicio<=l.fim));
  const existentes=new Set(db.trafego.map(t=>t.id));const novas=r.linhas.filter(l=>!existentes.has(l.id)).length;
  const per=[r.linhas.reduce((a,l)=>l.inicio<a?l.inicio:a,'9'),r.linhas.reduce((a,l)=>l.fim>a?l.fim:a,'')];
  const diario=r.linhas.every(l=>l.inicio===l.fim);
  modal('Importar tráfego — '+file.name,`<dl class="dl" style="grid-template-columns:200px 1fr"><dt>Linhas (${r.nivel})</dt><dd>${r.linhas.length}${diario?' · <b>dia a dia</b>':''}</dd><dt>Período</dt><dd>${fd(per[0])} a ${fd(per[1])}</dd>
    <dt>Investimento</dt><dd><b>${brl(sumBy(r.linhas,l=>l.gasto))}</b></dd><dt>Resultados</dt><dd>${num(sumBy(r.linhas,l=>l.resultados),0)}</dd><dt>Novas / atualizadas</dt><dd>${novas} / ${r.linhas.length-novas}</dd>
    ${sobrepostas.length?`<dt>Substituídas</dt><dd>${sobrepostas.length} linha(s) antigas do mesmo período</dd>`:''}</dl>
    <p class="small muted" style="margin-top:10px">${diario?'Ótimo: com o detalhamento por dia, os cálculos dia a dia ficam exatos.':'Dica: no Gerenciador, use <b>Detalhamento → Por tempo → Dia</b> antes de exportar. Sem isso, o sistema distribui o investimento igualmente pelos dias do período.'} Importar de novo atualiza os números (não duplica).</p>`,
    [{l:'Cancelar',c:'btn-ghost',fn:closeModal},{l:'Importar',c:'btn-brand',fn:()=>{
      const fora=new Set(sobrepostas.map(t=>t.id));db.trafego=db.trafego.filter(t=>!fora.has(t.id));
      r.linhas.forEach(l=>{const i=db.trafego.findIndex(t=>t.id===l.id);const ant=i>=0?db.trafego[i]:null;
        const o={...l,nicho:ant?.nicho??nichoDaCampanha(l.campanha),tipoCamp:ant?.tipoCamp??tipoDaCampanha(l.campanha),importado:today()};if(i>=0)db.trafego[i]=o;else db.trafego.push(o);});
      ui.f.traf={...filtroTrafego(),de:per[0],ate:per[1]};closeModal();save();render();toast('Tráfego importado ✓');}}]);
}

/* ---------- período, filtros e números ---------- */
const diasEntre=(a,b)=>Math.round((new Date(b+'T12:00')-new Date(a+'T12:00'))/864e5);
function filtroTrafego(){
  if(!ui.f.traf){const ult=db.trafego.reduce((a,t)=>t.fim>a?t.fim:a,'')||today();ui.f.traf={de:ult.slice(0,7)+'-01',ate:ult,status:'',tipoCamp:''};}
  return ui.f.traf;
}
/* parte de uma linha que cai no período (proporcional aos dias, quando a linha cobre vários dias) */
function fracao(t,de,ate){const ini=t.inicio>de?t.inicio:de,fim=t.fim<ate?t.fim:ate;if(ini>fim)return 0;return (diasEntre(ini,fim)+1)/(diasEntre(t.inicio,t.fim)+1);}
/* status de cada campanha = o da importação mais recente */
function statusCampanhas(){const m={};db.trafego.forEach(t=>{const x=m[t.campanha];if(t.ativa!=null&&(!x||t.fim>=x.fim))m[t.campanha]={fim:t.fim,ativa:t.ativa};});return m;}
const leadsMeta=()=>db.leads.filter(l=>ehDeAnuncio(l.origem));
const dataChegada=l=>l.primeiroContato||l.criado||'';
const dataFechou=l=>l.etapa==='Fechado'?(l.dataFechamento||l.ultimoContato||''):'';
const valorFechou=l=>+l.valorFechado||+l.valor||0;
function resumoTrafego(de,ate,f){
  f=f||{};const st=statusCampanhas();
  const passa=c=>(!f.status||(f.status==='ativas'?st[c]?.ativa===true:st[c]?.ativa!==true))&&(!f.tipoCamp||(f.tipoCamp==='sem'?!db.trafego.find(t=>t.campanha===c)?.tipoCamp:db.trafego.find(t=>t.campanha===c)?.tipoCamp===f.tipoCamp));
  const filtrando=!!(f.status||f.tipoCamp);
  const camp={};
  db.trafego.forEach(t=>{if(!passa(t.campanha))return;const fr=fracao(t,de,ate);if(!fr)return;
    const c=camp[t.campanha]||(camp[t.campanha]={campanha:t.campanha,nicho:t.nicho||'',tipoCamp:t.tipoCamp||'',ativa:st[t.campanha]?.ativa,gasto:0,impressoes:0,alcance:0,cliques:0,resultados:0,tipo:t.tipo});
    ['gasto','impressoes','alcance','cliques','resultados'].forEach(k=>c[k]+=(+t[k]||0)*fr);if(t.nicho)c.nicho=t.nicho;if(t.tipoCamp)c.tipoCamp=t.tipoCamp;});
  const nomes=new Set(Object.keys(camp));
  const L=leadsMeta().filter(l=>!filtrando||nomes.has(l.campanha));
  const chegaram=L.filter(l=>dataChegada(l)>=de&&dataChegada(l)<=ate),fechados=L.filter(l=>{const d=dataFechou(l);return d&&d>=de&&d<=ate;});
  const cs=Object.values(camp).map(c=>{const lc=chegaram.filter(l=>l.campanha===c.campanha),fc=fechados.filter(l=>l.campanha===c.campanha);
    return {...c,cpr:c.resultados?c.gasto/c.resultados:null,ctr:c.impressoes?c.cliques/c.impressoes*100:null,freq:c.alcance?c.impressoes/c.alcance:null,crm:lc.length,fech:fc.length,hon:sumBy(fc,valorFechou)};}).sort((a,b)=>b.gasto-a.gasto);
  const gasto=sumBy(cs,c=>c.gasto),res=sumBy(cs,c=>c.resultados),hon=sumBy(fechados,valorFechou);
  const nichos={};const N=p=>nichos[p||'Sem nicho']||(nichos[p||'Sem nicho']={nicho:p||'Sem nicho',gasto:0,resultados:0,leads:0,fech:0,hon:0});
  cs.forEach(c=>{const x=N(c.nicho);x.gasto+=c.gasto;x.resultados+=c.resultados;});
  chegaram.forEach(l=>N(l.produto||l.area).leads++);fechados.forEach(l=>{const x=N(l.produto||l.area);x.fech++;x.hon+=valorFechou(l);});
  return {de,ate,cs,gasto,res,cpr:res?gasto/res:null,chegaram,fechados,hon,semCampanha:chegaram.filter(l=>!l.campanha).length,
    cpa:chegaram.length?gasto/chegaram.length:null,cac:fechados.length?gasto/fechados.length:null,roi:gasto?hon/gasto:null,conv:chegaram.length?fechados.length/chegaram.length*100:null,
    nichos:Object.values(nichos).filter(n=>n.gasto||n.leads||n.fech).sort((a,b)=>b.gasto-a.gasto)};
}
function diaADia(de,ate,f){
  const n=Math.min(diasEntre(de,ate),92);const out=[];
  for(let i=0;i<=n;i++){const d=addDays(i,de);const r=resumoTrafego(d,d,f);out.push({d,gasto:r.gasto,res:r.res,crm:r.chegaram.length,fech:r.fechados.length,hon:r.hon});}
  return out;
}
function sugestoesTrafego(r,ant){
  const s=[];if(!r.cs.length)return s;
  const media=r.cpr;const antC={};(ant?.cs||[]).forEach(c=>antC[c.campanha]=c);
  const escala=r.cs.filter(c=>c.tipoCamp==='Escala'&&c.crm),cpaEsc=escala.length?sumBy(escala,c=>c.gasto)/sumBy(escala,c=>c.crm):null;
  r.cs.forEach(c=>{
    if(c.gasto>0&&!c.resultados&&(!media||c.gasto>=media*2))s.push(['r',`<b>${esc(c.campanha)}</b> gastou ${brl(c.gasto)} sem nenhum resultado. Pause ou revise público e criativo.`]);
    else if(media&&c.cpr&&c.cpr>media*1.5&&c.gasto>media)s.push(['a',`<b>${esc(c.campanha)}</b>: custo por resultado de ${brl(c.cpr)}, ${Math.round((c.cpr/media-1)*100)}% acima da média (${brl(media)}).`]);
    const a=antC[c.campanha];if(a&&a.cpr&&c.cpr&&c.cpr>a.cpr*1.3&&c.resultados>=3)s.push(['a',`<b>${esc(c.campanha)}</b>: o custo por resultado subiu ${Math.round((c.cpr/a.cpr-1)*100)}% em relação ao período anterior (${brl(a.cpr)} → ${brl(c.cpr)}).`]);
    if(c.tipoCamp==='Teste'&&c.crm>=3&&cpaEsc&&c.gasto/c.crm<cpaEsc*.8)s.push(['g',`Teste <b>${esc(c.campanha)}</b> trouxe atendimentos a ${brl(c.gasto/c.crm)} cada, mais barato que a média das campanhas de escala (${brl(cpaEsc)}). Candidata a <b>escalar</b>.`]);
    else if(media&&c.cpr&&c.cpr<media*.7&&c.resultados>=3)s.push(['g',`<b>${esc(c.campanha)}</b> é a mais eficiente (${brl(c.cpr)} por resultado). Considere aumentar a verba em ~20% e acompanhar por 3–4 dias.`]);
    if(c.tipoCamp==='Escala'&&c.crm>=5&&!c.fech)s.push(['a',`Escala <b>${esc(c.campanha)}</b>: ${c.crm} atendimentos e nenhum fechamento no período. Confira a qualidade dos leads e o follow-up.`]);
    if(c.freq&&c.freq>3.2)s.push(['a',`<b>${esc(c.campanha)}</b> tem frequência ${num(c.freq,1)}: o público já viu muitas vezes. Troque os criativos ou amplie o público.`]);
    if(c.ctr!=null&&c.ctr<.8&&c.impressoes>2000)s.push(['a',`<b>${esc(c.campanha)}</b> tem CTR de ${num(c.ctr,2)}%: o anúncio chama pouca atenção. Teste outra imagem/vídeo e outra chamada.`]);});
  if(r.gasto>0&&!r.chegaram.length)s.push(['b','Nenhum atendimento do CRM com origem <b>Facebook / Instagram Ads</b> chegou neste período. Marque a origem nos atendimentos (ou ao importar do WhatsApp).']);
  else if(r.semCampanha&&r.cs.length>1)s.push(['b',`${r.semCampanha} atendimento(s) do Meta estão sem <b>campanha</b> marcada. Preencha o campo "Campanha (Meta)" no atendimento para ver o resultado de cada campanha.`]);
  r.nichos.forEach(n=>{if(n.fech&&n.gasto&&n.hon<n.gasto)s.push(['r',`Nicho <b>${esc(n.nicho)}</b>: investiu ${brl(n.gasto)} e fechou ${brl(n.hon)} em honorários no período.`]);
    else if(n.fech&&n.gasto&&n.hon/n.gasto>=4)s.push(['g',`Nicho <b>${esc(n.nicho)}</b>: cada R$ 1 investido virou ${brl(n.hon/n.gasto)} em honorários. Bom candidato a mais verba.`]);});
  return s;
}

/* ---------- página ---------- */
V.trafego=()=>{
  if(!podeFin())return semPermissao();
  const f=filtroTrafego();if(f.de>f.ate)[f.de,f.ate]=[f.ate,f.de];
  const r=resumoTrafego(f.de,f.ate,f);const dur=diasEntre(f.de,f.ate)+1;
  const ant=resumoTrafego(addDays(-dur,f.de),addDays(-1,f.de),f);const sug=sugestoesTrafego(r,ant);
  const dias=diaADia(f.de,f.ate,f);
  const mesInteiro=f.de.slice(8)==='01'&&f.ate===fimMes(f.de.slice(0,7));
  const var_=(a,b,inv)=>{if(!b)return '';const p=(a/b-1)*100;if(!isFinite(p))return '';const bom=inv?p<0:p>0;return ` <span style="color:${bom?'var(--green)':'var(--red)'}">${p>0?'▲':'▼'}${Math.abs(Math.round(p))}%</span>`;};
  const atalhos=[['hoje','Hoje'],['7','7 dias'],['30','30 dias'],['mes','Este mês'],['mesant','Mês passado']];
  const toolbar=`<div class="toolbar"><label class="small">De <input type="date" data-f="traf.de" value="${esc(f.de)}"></label><label class="small">até <input type="date" data-f="traf.ate" value="${esc(f.ate)}"></label>
    <div class="tabs" style="margin:0;border:none">${atalhos.map(([k,l])=>`<button class="tab" data-act="trafPer" data-id="${k}">${l}</button>`).join('')}</div>
    <select data-f="traf.status"><option value="">Todas as campanhas</option><option value="ativas"${f.status==='ativas'?' selected':''}>🟢 Só ativas</option><option value="inativas"${f.status==='inativas'?' selected':''}>⚪ Só inativas</option></select>
    <select data-f="traf.tipoCamp"><option value="">Teste e escala</option><option value="Teste"${f.tipoCamp==='Teste'?' selected':''}>🧪 Só testes</option><option value="Escala"${f.tipoCamp==='Escala'?' selected':''}>🚀 Só escala</option><option value="sem"${f.tipoCamp==='sem'?' selected':''}>Sem tipo</option></select>
    <span class="grow"></span><button class="btn btn-ghost" data-act="trafIA">🤖 Análise para o Claude</button>${r.gasto&&mesInteiro?`<button class="btn btn-ghost" data-act="trafLancar">Lançar no financeiro</button>`:''}<button class="btn btn-gold" data-act="trafImportar">⇪ Importar do Meta Ads</button></div>`;
  if(!db.trafego.length)return toolbar+`<div class="card"><h3>📣 Comece importando o relatório do Meta Ads</h3><ol class="small" style="line-height:1.8;margin:0;padding-left:18px">
    <li>Abra o <b>Gerenciador de Anúncios</b> (adsmanager.facebook.com) na aba <b>Campanhas</b>.</li><li>Escolha o período e, em <b>Detalhamento → Por tempo</b>, marque <b>Dia</b> (para o cálculo dia a dia).</li>
    <li>Clique em <b>Relatórios → Exportar dados da tabela</b> (.csv ou .xlsx).</li><li>Aqui, clique em <b>⇪ Importar do Meta Ads</b>.</li></ol>
    <p class="small muted" style="margin-top:10px">Os fechamentos vêm do <b>CRM</b>: atendimentos com origem <b>Facebook / Instagram Ads</b> que você marcar como <b>Fechado</b>, na data de fechamento, com o valor dos honorários.</p></div>`;
  const filtrando=f.status||f.tipoCamp;
  return toolbar+`${filtrando?`<div class="hint">Filtro aplicado: no CRM entram só os atendimentos com a <b>campanha</b> marcada (${r.chegaram.length} no período).</div>`:''}
  <div class="grid g-kpi">${kpi('Investimento',brl(r.gasto)+var_(r.gasto,ant.gasto),`${fd(f.de)} a ${fd(f.ate)} · ${dur} dia(s)`)}
    ${kpi('Conversas / resultados (Meta)',num(r.res,0)+var_(r.res,ant.res),r.cpr!=null?brl(r.cpr)+' por resultado':'—')}
    ${kpi('Chegaram no CRM',r.chegaram.length+var_(r.chegaram.length,ant.chegaram.length),r.cpa!=null?brl(r.cpa)+' por atendimento':'origem Facebook / Instagram Ads')}
    ${kpi('Fechados (CRM)',r.fechados.length+var_(r.fechados.length,ant.fechados.length),r.cac!=null?'CAC '+brl(r.cac)+(r.conv!=null?' · conversão '+num(r.conv,0)+'%':''):'pela data de fechamento')}
    ${kpi('Honorários fechados',brl(r.hon),r.roi!=null?'retorno de '+num(r.roi,1)+'× o investido':'',r.roi!=null?(r.roi>=1?'good':'bad'):'')}</div>
  ${sug.length?`<div class="card" style="margin-bottom:14px"><h3>💡 Sugestões</h3><div class="pend-lista">${sug.map(([sv,t])=>`<div class="pend pend-${sv==='g'?'b':sv}"><span class="pic">${{r:'⛔',a:'⚠️',g:'🚀',b:'ℹ️'}[sv]}</span><div class="small">${t}</div></div>`).join('')}</div></div>`:''}
  <div class="grid g-2" style="margin-bottom:14px">
    <div class="card"><h3>Dia a dia — investimento</h3>${barras([{nome:'Investimento',cor:'#C0392B',vals:dias.map(x=>x.gasto)}],dias.map(x=>x.d.slice(8)+'/'+x.d.slice(5,7)),x=>brl(x))}</div>
    <div class="card"><h3>Dia a dia — CRM</h3>${barras([{nome:'Chegaram no CRM',cor:'#1E5FA8',vals:dias.map(x=>x.crm)},{nome:'Fechados',cor:'#2E7D4E',vals:dias.map(x=>x.fech)}],dias.map(x=>x.d.slice(8)+'/'+x.d.slice(5,7)))}</div>
  </div>
  <div class="card" style="margin-bottom:14px"><h3>Campanhas</h3>${r.cs.length?`<div class="tbl"><table><thead><tr><th>Campanha</th><th>Tipo</th><th class="hide-m">Nicho</th><th class="num">Investido</th><th class="num hide-m">Freq.</th><th class="num hide-m">CTR</th><th class="num">Result.</th><th class="num">Custo/res.</th><th class="num">CRM</th><th class="num">Fech.</th><th class="num">CAC</th></tr></thead><tbody>
    ${r.cs.map(c=>{const caro=r.cpr&&c.cpr&&c.cpr>r.cpr*1.5,bom=r.cpr&&c.cpr&&c.cpr<r.cpr*.7;return `<tr><td class="strong">${c.ativa===true?'🟢':c.ativa===false?'⚪':''} ${esc(c.campanha)}<div class="small muted">${esc(c.tipo||'')}</div></td>
      <td><select data-traf-tipo="${esc(c.campanha)}"><option value="">—</option>${['Teste','Escala'].map(x=>`<option${c.tipoCamp===x?' selected':''}>${x}</option>`).join('')}</select></td>
      <td class="hide-m"><select data-traf-nicho="${esc(c.campanha)}" style="max-width:150px"><option value="">—</option>${db.produtos.map(p=>`<option${c.nicho===p?' selected':''}>${esc(p)}</option>`).join('')}</select></td>
      <td class="num">${brl(c.gasto)}</td><td class="num hide-m ${c.freq>3.2?'c-bad':''}">${c.freq?num(c.freq,1):'—'}</td><td class="num hide-m ${c.ctr!=null&&c.ctr<.8?'c-bad':''}">${c.ctr!=null?num(c.ctr,2)+'%':'—'}</td>
      <td class="num">${num(c.resultados,0)}</td><td class="num strong" style="color:${caro?'var(--red)':bom?'var(--green)':'inherit'}">${c.cpr!=null?brl(c.cpr):'—'}</td>
      <td class="num">${c.crm||'—'}</td><td class="num">${c.fech||'—'}</td><td class="num">${c.fech?brl(c.gasto/c.fech):'—'}</td></tr>`;}).join('')}</tbody></table></div>
    <div class="small muted" style="margin-top:8px">🟢 ativa · ⚪ inativa (conforme a última importação). CRM e fechamentos por campanha usam o campo <b>"Campanha (Meta)"</b> do atendimento.${r.semCampanha?` ${r.semCampanha} atendimento(s) do período estão sem campanha.`:''}</div>`:'<div class="empty">Nenhuma campanha neste período / filtro.</div>'}</div>
  <div class="grid g-2">
    <div class="card"><h3>Por nicho</h3>${r.nichos.length?`<div class="tbl"><table><thead><tr><th>Nicho</th><th class="num">Investido</th><th class="num">Chegaram</th><th class="num">Fechados</th><th class="num">CAC</th><th class="num">Honorários</th></tr></thead><tbody>
      ${r.nichos.map(n=>`<tr><td class="strong">${esc(n.nicho)}</td><td class="num">${brl(n.gasto)}</td><td class="num">${n.leads}</td><td class="num">${n.fech}</td><td class="num">${n.fech&&n.gasto?brl(n.gasto/n.fech):'—'}</td><td class="num" style="color:${!n.gasto?'inherit':n.hon>=n.gasto?'var(--green)':'var(--red)'}">${brl(n.hon)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Sem dados</div>'}</div>
    <div class="card"><h3>Fechados no período <small>CRM · origem Meta</small></h3>${r.fechados.length?r.fechados.sort((a,b)=>dataFechou(b).localeCompare(dataFechou(a))).map(l=>`<div class="ev"><div class="body" data-act="editLead" data-id="${l.id}"><div class="t">${esc(l.nome)}</div><div class="small muted">${fd(dataFechou(l))} · ${esc(l.produto||'')}${l.campanha?' · '+esc(l.campanha):''}</div></div><div class="num strong">${brl(valorFechou(l))}</div></div>`).join(''):'<div class="empty">Nenhum fechamento no período</div>'}</div>
  </div>`;
};
function textoAnaliseTrafego(){
  const f=filtroTrafego();const r=resumoTrafego(f.de,f.ate,f);const dur=diasEntre(f.de,f.ate)+1;const ant=resumoTrafego(addDays(-dur,f.de),addDays(-1,f.de),f);
  const L=[];L.push(`Sou de um escritório de advocacia (${db.escritorio.nome||'escritório'}) e uso anúncios no Meta (Facebook/Instagram) para captar clientes. Nichos: ${db.produtos.join(', ')}. Estamos separando campanhas de TESTE e de ESCALA.`);
  L.push(`Analise o período de ${fd(f.de)} a ${fd(f.ate)}${f.status?' (só campanhas '+f.status+')':''}${f.tipoCamp?' (só '+f.tipoCamp+')':''} e me diga, de forma prática: (1) o que pausar, (2) quais testes devem ir para escala e quanto aumentar de verba, (3) ideias de criativos e textos por nicho, respeitando as regras de publicidade da OAB (Provimento 205/2021), e (4) como melhorar a conversão de atendimento em contrato.`);
  L.push('','RESUMO (período anterior entre parênteses)',`Investimento: ${brl(r.gasto)} (${brl(ant.gasto)})`,`Resultados no Meta: ${num(r.res,0)} (${num(ant.res,0)})${r.cpr?' — '+brl(r.cpr)+' por resultado':''}`,
    `Chegaram no CRM: ${r.chegaram.length} (${ant.chegaram.length})${r.cpa?' — '+brl(r.cpa)+' por atendimento':''}`,`Fechados no CRM: ${r.fechados.length} (${ant.fechados.length})${r.cac?' — CAC '+brl(r.cac):''}${r.conv!=null?' — conversão '+num(r.conv,0)+'%':''}`,`Honorários fechados: ${brl(r.hon)}${r.roi!=null?' — retorno '+num(r.roi,1)+'x':''}`);
  L.push('','CAMPANHAS (status | tipo | investido | frequência | CTR | resultados | custo por resultado | chegaram no CRM | fechados | nicho)');
  r.cs.forEach(c=>L.push(`- ${c.campanha}: ${c.ativa===true?'ativa':c.ativa===false?'inativa':'-'} | ${c.tipoCamp||'-'} | ${brl(c.gasto)} | ${c.freq?num(c.freq,1):'-'} | ${c.ctr!=null?num(c.ctr,2)+'%':'-'} | ${num(c.resultados,0)} ${c.tipo||''} | ${c.cpr?brl(c.cpr):'-'} | ${c.crm} | ${c.fech} | ${c.nicho||'sem nicho'}`));
  L.push('','DIA A DIA (data | investido | chegaram no CRM | fechados)');
  diaADia(f.de,f.ate,f).forEach(d=>L.push(`- ${fd(d.d)}: ${brl(d.gasto)} | ${d.crm} | ${d.fech}`));
  L.push('','POR NICHO (investido | chegaram | fechados | honorários)');r.nichos.forEach(n=>L.push(`- ${n.nicho}: ${brl(n.gasto)} | ${n.leads} | ${n.fech} | ${brl(n.hon)}`));
  const etapas={};r.chegaram.forEach(l=>etapas[l.etapa]=(etapas[l.etapa]||0)+1);
  L.push('','FUNIL DE QUEM CHEGOU NO PERÍODO: '+(Object.entries(etapas).map(([e,n])=>e+': '+n).join(' · ')||'sem dados'));
  return L.join('\n');
}
const TRAF_ACOES={
  trafImportar:()=>$('#file-trafego').click(),
  trafPer:k=>{const f=filtroTrafego(),h=today();
    if(k==='hoje'){f.de=h;f.ate=h;}else if(k==='7'){f.de=addDays(-6,h);f.ate=h;}else if(k==='30'){f.de=addDays(-29,h);f.ate=h;}
    else if(k==='mes'){f.de=h.slice(0,7)+'-01';f.ate=h;}else if(k==='mesant'){const m=ymAdd(h.slice(0,7),-1);f.de=m+'-01';f.ate=fimMes(m);}render();},
  trafIA:()=>{const t=textoAnaliseTrafego();
    modal('🤖 Análise para o Claude',`<p class="small muted">Copie o texto abaixo e cole numa conversa com o Claude. Como o Meta Ads de vocês está conectado ao Claude (Supermetrics), você também pode pedir lá para ele <b>puxar os dados atualizados</b> e comparar.</p>
      <textarea id="traf-txt" rows="14" readonly style="width:100%;font-family:inherit;font-size:12px;margin-top:8px">${esc(t)}</textarea>`,
      [{l:'Fechar',c:'btn-ghost',fn:closeModal},{l:'Abrir o Claude',c:'btn-ghost',fn:()=>window.open('https://claude.ai/new','_blank','noopener')},
       {l:'Copiar texto',c:'btn-brand',fn:()=>{const el=$('#traf-txt');el.select();(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('Copiado ✓ Agora cole no Claude')).catch(()=>{document.execCommand('copy');toast('Copiado ✓');});}}]);},
  trafLancar:async()=>{const f=filtroTrafego();const ym=f.de.slice(0,7);const r=resumoTrafego(f.de,f.ate,{});const ref='trafego:'+ym;
    if(db.lancamentos.some(l=>l.trafegoRef===ref))return toast('O investimento deste mês já foi lançado no financeiro',1);
    if(!await confirmar(`Lançar ${brl(r.gasto)} como despesa "Tráfego — Facebook/Instagram" em ${MESES_L[+ym.slice(5)-1]}? Só faça isso se o gasto ainda não estiver no financeiro.`,'Lançar'))return;
    db.lancamentos.push({id:uid(),tipo:'despesa',descricao:'Tráfego pago — Meta Ads ('+MESES[+ym.slice(5)-1]+'/'+ym.slice(0,4)+')',categoria:'Tráfego — Facebook/Instagram',clienteId:'',processoId:'',contratoId:'',valor:Math.round(r.gasto*100)/100,venc:fimMes(ym),pago:true,pagoEm:fimMes(ym),forma:'Cartão',produto:'',obs:'Importado da tela Tráfego pago',criado:today(),trafegoRef:ref});
    save();render();toast('Despesa lançada ✓');},
};
document.addEventListener('change',ev=>{
  const s=ev.target.closest('[data-traf-nicho]');if(s){const c=s.dataset.trafNicho;db.trafego.forEach(t=>{if(t.campanha===c)t.nicho=s.value;});save();render();toast('Nicho da campanha atualizado ✓');return;}
  const t=ev.target.closest('[data-traf-tipo]');if(t){const c=t.dataset.trafTipo;db.trafego.forEach(x=>{if(x.campanha===c)x.tipoCamp=t.value;});save();render();toast('Tipo da campanha atualizado ✓');}
});
