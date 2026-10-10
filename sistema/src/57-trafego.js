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
    conversas:c('conversas por mensagem iniciadas','messaging conversations started'),leads:c('leads','cadastros')};
}
function nichoDaCampanha(nome){
  const prev=db.trafego.find(t=>t.campanha===nome&&t.nicho);if(prev)return prev.nicho;
  const n=norm(nome);
  for(const p of db.produtos){const ws=norm(p).split(/[^a-z0-9]+/).filter(w=>w.length>=5);if(ws.some(w=>n.includes(w.slice(0,6))))return p;}
  if(/\bsm\b|matern|gestant/.test(n))return db.produtos.find(p=>/matern/i.test(p))||'';
  return '';
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
    const conta=s(r,'conta');
    linhas.push({id:'tr'+hashTxt([conta,campanha,conjunto,anuncio,inicio,fim].join('|')).toString(36),conta,campanha:campanha||'(sem nome)',conjunto,anuncio,inicio,fim,
      gasto:n(r,'gasto'),impressoes:n(r,'impressoes'),alcance:n(r,'alcance'),cliques:n(r,'cliques'),resultados:n(r,'resultados'),tipo:s(r,'tipo'),conversas:n(r,'conversas'),leads:n(r,'leads')});});
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
  const ids=new Set(db.trafego.map(t=>t.id));const novas=r.linhas.filter(l=>!ids.has(l.id)).length;
  const per=[r.linhas.reduce((a,l)=>l.inicio<a?l.inicio:a,'9'),r.linhas.reduce((a,l)=>l.fim>a?l.fim:a,'')];
  modal('Importar tráfego — '+file.name,`<dl class="dl" style="grid-template-columns:200px 1fr"><dt>Linhas (${r.nivel})</dt><dd>${r.linhas.length}</dd><dt>Período</dt><dd>${fd(per[0])} a ${fd(per[1])}</dd>
    <dt>Investimento</dt><dd><b>${brl(sumBy(r.linhas,l=>l.gasto))}</b></dd><dt>Resultados</dt><dd>${num(sumBy(r.linhas,l=>l.resultados),0)}</dd><dt>Novas / atualizadas</dt><dd>${novas} / ${r.linhas.length-novas}</dd></dl>
    <p class="small muted" style="margin-top:10px">Importar de novo o mesmo período <b>atualiza</b> os números (não duplica). Dica: exporte <b>mês a mês</b> ou com o detalhamento por <b>Dia</b>, para cada mês ficar com o seu investimento.</p>`,
    [{l:'Cancelar',c:'btn-ghost',fn:closeModal},{l:'Importar',c:'btn-brand',fn:()=>{
      r.linhas.forEach(l=>{const i=db.trafego.findIndex(t=>t.id===l.id);const nicho=i>=0?db.trafego[i].nicho:nichoDaCampanha(l.campanha);
        const o={...l,nicho,importado:today()};if(i>=0)db.trafego[i]=o;else db.trafego.push(o);});
      ui.f.traf={...(ui.f.traf||{}),mes:per[1].slice(0,7)};closeModal();save();render();toast('Tráfego importado ✓');}}]);
}

/* ---------- números do mês ---------- */
function resumoTrafego(ym){
  const ls=db.trafego.filter(t=>t.inicio.startsWith(ym));
  const camp={};
  ls.forEach(t=>{const c=camp[t.campanha]||(camp[t.campanha]={campanha:t.campanha,nicho:t.nicho||'',gasto:0,impressoes:0,alcance:0,cliques:0,resultados:0,tipo:t.tipo});
    ['gasto','impressoes','alcance','cliques','resultados'].forEach(k=>c[k]+=+t[k]||0);if(t.nicho)c.nicho=t.nicho;});
  const cs=Object.values(camp).map(c=>({...c,cpr:c.resultados?c.gasto/c.resultados:null,ctr:c.impressoes?c.cliques/c.impressoes*100:null,freq:c.alcance?c.impressoes/c.alcance:null})).sort((a,b)=>b.gasto-a.gasto);
  const gasto=sumBy(cs,c=>c.gasto),res=sumBy(cs,c=>c.resultados);
  const leads=db.leads.filter(l=>ehDeAnuncio(l.origem)&&(l.primeiroContato||l.criado||'').startsWith(ym));
  const ctrs=db.contratos.filter(k=>(k.data||'').startsWith(ym)&&ehDeAnuncio(cli(k.clienteId)?.origem));
  const hon=sumBy(ctrs,k=>+k.valorTotal||0);
  const nichos={};
  const N=p=>nichos[p||'Sem nicho']||(nichos[p||'Sem nicho']={nicho:p||'Sem nicho',gasto:0,resultados:0,leads:0,contratos:0,hon:0});
  cs.forEach(c=>{const x=N(c.nicho);x.gasto+=c.gasto;x.resultados+=c.resultados;});
  leads.forEach(l=>N(l.produto||l.area).leads++);
  ctrs.forEach(k=>{const x=N(k.produto||cli(k.clienteId)?.produto);x.contratos++;x.hon+=+k.valorTotal||0;});
  return {ls,cs,gasto,res,cpr:res?gasto/res:null,leads,ctrs,hon,cac:ctrs.length?gasto/ctrs.length:null,roi:gasto?hon/gasto:null,nichos:Object.values(nichos).sort((a,b)=>b.gasto-a.gasto)};
}
function sugestoesTrafego(r){
  const s=[];if(!r.cs.length)return s;
  const media=r.cpr;
  r.cs.forEach(c=>{
    if(c.gasto>0&&!c.resultados&&(!media||c.gasto>=media*2))s.push(['r',`<b>${esc(c.campanha)}</b> gastou ${brl(c.gasto)} sem nenhum resultado. Pause ou revise público e criativo.`]);
    else if(media&&c.cpr&&c.cpr>media*1.5&&c.gasto>media)s.push(['a',`<b>${esc(c.campanha)}</b>: custo por resultado de ${brl(c.cpr)}, ${Math.round((c.cpr/media-1)*100)}% acima da média (${brl(media)}). Revise segmentação e anúncios.`]);
    if(media&&c.cpr&&c.cpr<media*.7&&c.resultados>=3)s.push(['g',`<b>${esc(c.campanha)}</b> é a mais eficiente (${brl(c.cpr)} por resultado). Considere aumentar a verba em ~20% e acompanhar por 3–4 dias.`]);
    if(c.freq&&c.freq>3.2)s.push(['a',`<b>${esc(c.campanha)}</b> tem frequência ${num(c.freq,1)}: o público já viu muitas vezes. Troque os criativos ou amplie o público.`]);
    if(c.ctr!=null&&c.ctr<.8&&c.impressoes>2000)s.push(['a',`<b>${esc(c.campanha)}</b> tem CTR de ${num(c.ctr,2)}%: o anúncio chama pouca atenção. Teste outra imagem/vídeo e outra chamada.`]);});
  if(r.gasto>0&&!r.leads.length)s.push(['b','Nenhum atendimento do CRM está com origem <b>Facebook / Instagram Ads</b> neste mês. Marque a origem nos atendimentos (ou ao importar do WhatsApp) para o sistema calcular custo por cliente e retorno.']);
  else if(r.gasto>0&&r.leads.length&&!r.ctrs.length)s.push(['b',`${r.leads.length} atendimento(s) vieram dos anúncios, mas nenhum contrato fechado ainda. Vale reforçar o follow-up (scripts de pós-atendimento) dos leads em aberto.`]);
  r.nichos.forEach(n=>{if(n.contratos&&n.gasto&&n.hon<n.gasto)s.push(['r',`Nicho <b>${esc(n.nicho)}</b>: investiu ${brl(n.gasto)} e fechou ${brl(n.hon)} em honorários. Está dando prejuízo neste mês.`]);
    else if(n.contratos&&n.gasto&&n.hon/n.gasto>=4)s.push(['g',`Nicho <b>${esc(n.nicho)}</b>: cada R$ 1 investido virou ${brl(n.hon/n.gasto)} em honorários. Bom candidato a mais verba.`]);});
  return s;
}

/* ---------- página ---------- */
V.trafego=()=>{
  if(!podeFin())return semPermissao();
  const f=ui.f.traf||(ui.f.traf={mes:(db.trafego.reduce((a,t)=>t.inicio>a?t.inicio:a,'')||today()).slice(0,7)});
  const r=resumoTrafego(f.mes);const sug=sugestoesTrafego(r);
  const meses=Array.from({length:6},(_,i)=>ymAdd(f.mes,i-5));
  const hist=meses.map(m=>{const x=resumoTrafego(m);return [x.gasto,x.hon];});
  const toolbar=`<div class="toolbar">${mesSel('traf',f.mes)}<span class="grow"></span>
    <button class="btn btn-ghost" data-act="trafIA">🤖 Gerar análise para o Claude</button>${r.gasto?`<button class="btn btn-ghost" data-act="trafLancar">Lançar no financeiro</button>`:''}<button class="btn btn-gold" data-act="trafImportar">⇪ Importar do Meta Ads</button></div>`;
  if(!db.trafego.length)return toolbar+`<div class="card"><h3>📣 Comece importando o relatório do Meta Ads</h3><ol class="small" style="line-height:1.8;margin:0;padding-left:18px">
    <li>Abra o <b>Gerenciador de Anúncios</b> (adsmanager.facebook.com) na aba <b>Campanhas</b>.</li><li>Escolha o período (ex.: <b>Mês passado</b> ou <b>Este mês</b>).</li>
    <li>Clique em <b>Relatórios → Exportar dados da tabela</b> e escolha <b>.csv</b> ou <b>.xlsx</b>.</li><li>Aqui, clique em <b>⇪ Importar do Meta Ads</b> e envie o arquivo.</li></ol>
    <p class="small muted" style="margin-top:10px">O sistema cruza os números com os atendimentos que têm origem <b>Facebook / Instagram Ads</b> e com os contratos desses clientes, e mostra quanto custa cada cliente e quanto volta em honorários.</p></div>`;
  const cor=v=>v==null?'':v;
  return toolbar+`<div class="grid g-kpi">${kpi('Investimento',brl(r.gasto),r.cs.length+' campanha(s)')}${kpi('Resultados (Meta)',num(r.res,0),r.cpr!=null?brl(r.cpr)+' por resultado':'—')}
    ${kpi('Atendimentos no CRM',r.leads.length,r.leads.length&&r.gasto?brl(r.gasto/r.leads.length)+' por atendimento':'com origem Facebook / Instagram Ads')}
    ${kpi('Contratos fechados',r.ctrs.length,r.cac!=null?'CAC '+brl(r.cac)+' por cliente':'de clientes vindos dos anúncios')}
    ${kpi('Honorários contratados',brl(r.hon),r.roi!=null?'retorno de '+num(r.roi,1)+'× o investido':'',r.roi!=null?(r.roi>=1?'good':'bad'):'')}</div>
  ${sug.length?`<div class="card" style="margin-bottom:14px"><h3>💡 Sugestões para este mês</h3><div class="pend-lista">${sug.map(([sv,t])=>`<div class="pend pend-${sv==='g'?'b':sv}"><span class="pic">${{r:'⛔',a:'⚠️',g:'🚀',b:'ℹ️'}[sv]}</span><div class="small">${t}</div></div>`).join('')}</div></div>`:''}
  <div class="card" style="margin-bottom:14px"><h3>Campanhas — ${MESES_L[+f.mes.slice(5)-1]}/${f.mes.slice(0,4)}</h3>${r.cs.length?`<div class="tbl"><table><thead><tr><th>Campanha</th><th>Nicho</th><th class="num">Investido</th><th class="num hide-m">Impressões</th><th class="num hide-m">Freq.</th><th class="num hide-m">CTR</th><th class="num">Resultados</th><th class="num">Custo/result.</th></tr></thead><tbody>
    ${r.cs.map(c=>{const caro=r.cpr&&c.cpr&&c.cpr>r.cpr*1.5,bom=r.cpr&&c.cpr&&c.cpr<r.cpr*.7;return `<tr><td class="strong">${esc(c.campanha)}<div class="small muted">${esc(c.tipo||'')}</div></td>
      <td><select data-traf-nicho="${esc(c.campanha)}" style="max-width:170px"><option value="">—</option>${db.produtos.map(p=>`<option${c.nicho===p?' selected':''}>${esc(p)}</option>`).join('')}</select></td>
      <td class="num">${brl(c.gasto)}</td><td class="num hide-m">${num(c.impressoes,0)}</td><td class="num hide-m ${c.freq>3.2?'c-bad':''}">${c.freq?num(c.freq,1):'—'}</td><td class="num hide-m ${c.ctr!=null&&c.ctr<.8?'c-bad':''}">${c.ctr!=null?num(c.ctr,2)+'%':'—'}</td>
      <td class="num">${num(c.resultados,0)}</td><td class="num strong" style="color:${caro?'var(--red)':bom?'var(--green)':'inherit'}">${c.cpr!=null?brl(c.cpr):'—'}</td></tr>`;}).join('')}</tbody></table></div>`:'<div class="empty">Nenhum dado de tráfego neste mês. Importe o relatório do período.</div>'}</div>
  <div class="grid g-2">
    <div class="card"><h3>Por nicho <small>investimento × resultado no escritório</small></h3>${r.nichos.length?`<div class="tbl"><table><thead><tr><th>Nicho</th><th class="num">Investido</th><th class="num">Atend.</th><th class="num">Contratos</th><th class="num">CAC</th><th class="num">Honorários</th></tr></thead><tbody>
      ${r.nichos.map(n=>`<tr><td class="strong">${esc(n.nicho)}</td><td class="num">${brl(n.gasto)}</td><td class="num">${n.leads}</td><td class="num">${n.contratos}</td><td class="num">${n.contratos&&n.gasto?brl(n.gasto/n.contratos):'—'}</td><td class="num" style="color:${n.hon>=n.gasto?'var(--green)':'var(--red)'}">${brl(n.hon)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Sem dados</div>'}
      <div class="small muted" style="margin-top:8px">Defina o nicho de cada campanha na tabela acima (o sistema tenta adivinhar pelo nome).</div></div>
    <div class="card"><h3>Investimento × honorários — 6 meses</h3>${barras([{nome:'Investimento',cor:'#C0392B',vals:hist.map(h=>h[0])},{nome:'Honorários contratados',cor:'#2E7D4E',vals:hist.map(h=>h[1])}],meses.map(m=>MESES[+m.slice(5)-1]),x=>brl(x))}</div>
  </div>`;
};
function textoAnaliseTrafego(){
  const ym=ui.f.traf?.mes||today().slice(0,7);const r=resumoTrafego(ym);const ant=resumoTrafego(ymAdd(ym,-1));
  const L=[];L.push(`Sou de um escritório de advocacia (${db.escritorio.nome||'escritório'}) e uso anúncios no Meta (Facebook/Instagram) para captar clientes. Nichos: ${db.produtos.join(', ')}.`);
  L.push(`Analise o desempenho de ${MESES_L[+ym.slice(5)-1]}/${ym.slice(0,4)} e me diga, de forma prática: (1) o que pausar, (2) onde colocar mais verba, (3) ideias de criativos e textos por nicho, respeitando as regras de publicidade da OAB (Provimento 205/2021), e (4) como melhorar a conversão de atendimento em contrato.`);
  L.push('','RESUMO DO MÊS',`Investimento: ${brl(r.gasto)} (mês anterior: ${brl(ant.gasto)})`,`Resultados no Meta: ${num(r.res,0)}${r.cpr?' — '+brl(r.cpr)+' por resultado':''}`,
    `Atendimentos no CRM vindos dos anúncios: ${r.leads.length} (mês anterior: ${ant.leads.length})`,`Contratos fechados desses clientes: ${r.ctrs.length}${r.cac?' — CAC '+brl(r.cac):''}`,`Honorários contratados: ${brl(r.hon)}${r.roi!=null?' — retorno '+num(r.roi,1)+'x':''}`);
  L.push('','CAMPANHAS (investido | impressões | frequência | CTR | resultados | custo por resultado | nicho)');
  r.cs.forEach(c=>L.push(`- ${c.campanha}: ${brl(c.gasto)} | ${num(c.impressoes,0)} | ${c.freq?num(c.freq,1):'-'} | ${c.ctr!=null?num(c.ctr,2)+'%':'-'} | ${num(c.resultados,0)} ${c.tipo||''} | ${c.cpr?brl(c.cpr):'-'} | ${c.nicho||'sem nicho'}`));
  L.push('','POR NICHO (investido | atendimentos | contratos | honorários)');
  r.nichos.forEach(n=>L.push(`- ${n.nicho}: ${brl(n.gasto)} | ${n.leads} | ${n.contratos} | ${brl(n.hon)}`));
  const etapas={};r.leads.forEach(l=>etapas[l.etapa]=(etapas[l.etapa]||0)+1);
  L.push('','FUNIL DOS ATENDIMENTOS DOS ANÚNCIOS: '+(Object.entries(etapas).map(([e,n])=>e+': '+n).join(' · ')||'sem dados'));
  return L.join('\n');
}
const TRAF_ACOES={
  trafImportar:()=>$('#file-trafego').click(),
  trafIA:()=>{const t=textoAnaliseTrafego();
    modal('🤖 Análise para o Claude',`<p class="small muted">Copie o texto abaixo e cole numa conversa com o Claude. Como o Meta Ads de vocês está conectado ao Claude (Supermetrics), você também pode pedir lá para ele <b>puxar os dados atualizados</b> e comparar.</p>
      <textarea id="traf-txt" rows="14" readonly style="width:100%;font-family:inherit;font-size:12px;margin-top:8px">${esc(t)}</textarea>`,
      [{l:'Fechar',c:'btn-ghost',fn:closeModal},{l:'Abrir o Claude',c:'btn-ghost',fn:()=>window.open('https://claude.ai/new','_blank','noopener')},
       {l:'Copiar texto',c:'btn-brand',fn:()=>{const el=$('#traf-txt');el.select();(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('Copiado ✓ Agora cole no Claude')).catch(()=>{document.execCommand('copy');toast('Copiado ✓');});}}]);},
  trafLancar:async()=>{const ym=ui.f.traf.mes;const r=resumoTrafego(ym);const ref='trafego:'+ym;
    if(db.lancamentos.some(l=>l.trafegoRef===ref))return toast('O investimento deste mês já foi lançado no financeiro',1);
    if(!await confirmar(`Lançar ${brl(r.gasto)} como despesa "Tráfego — Facebook/Instagram" em ${MESES_L[+ym.slice(5)-1]}? Só faça isso se o gasto ainda não estiver no financeiro.`,'Lançar'))return;
    db.lancamentos.push({id:uid(),tipo:'despesa',descricao:'Tráfego pago — Meta Ads ('+MESES[+ym.slice(5)-1]+'/'+ym.slice(0,4)+')',categoria:'Tráfego — Facebook/Instagram',clienteId:'',processoId:'',contratoId:'',valor:Math.round(r.gasto*100)/100,venc:fimMes(ym),pago:true,pagoEm:fimMes(ym),forma:'Cartão',produto:'',obs:'Importado da tela Tráfego pago',criado:today(),trafegoRef:ref});
    save();render();toast('Despesa lançada ✓');},
};
document.addEventListener('change',ev=>{const s=ev.target.closest('[data-traf-nicho]');if(!s)return;const c=s.dataset.trafNicho;
  db.trafego.forEach(t=>{if(t.campanha===c)t.nicho=s.value;});save();render();toast('Nicho da campanha atualizado ✓');});
