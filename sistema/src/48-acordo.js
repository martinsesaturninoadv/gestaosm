/* =========================================================
   ACORDO NOS PROCESSOS JUDICIAIS: dados, parcelas e honorários
   ========================================================= */
function parcelasAcordo(p){
  const n=Math.max(1,Math.round(+p.parcelasAcordo||1)),total=+p.valorAcordo||0,pct=+p.honorariosAcordoPct||0;
  const ini=p.primeiraParcelaAcordo||p.dataAcordo||today();
  return Array.from({length:n},(_,i)=>{const v=Math.round(total/n*100)/100;return {n:i+1,venc:addMonths(ini,i),valor:v,honorarios:Math.round(v*pct)/100};});
}
function editAcordo(pid){
  const p=proc(pid);if(!p)return;
  form('🤝 Acordo — '+(p.numero||''),[
    {k:'dataAcordo',l:'Data do acordo',t:'date',req:1},{k:'valorAcordo',l:'Valor total do acordo (R$)',t:'number',req:1},
    {k:'parcelasAcordo',l:'Número de parcelas',t:'number',d:1},{k:'primeiraParcelaAcordo',l:'Vencimento da 1ª parcela',t:'date'},
    {k:'formaAcordo',l:'Como será pago',t:'select',o:['Depósito judicial / alvará','Pagamento direto ao cliente','Pagamento na conta do escritório','Desconto em folha','Outro']},
    {k:'honorariosAcordoPct',l:'Honorários do escritório sobre o acordo (%)',t:'number',dica:'Usado para lançar os honorários no financeiro.'},
    {k:'homologado',l:'Acordo homologado pelo juiz',t:'check'},{k:'dataHomologacao',l:'Data da homologação',t:'date'},
    {k:'obsAcordo',l:'Condições / observações (multa, obrigações de fazer…)',t:'textarea',full:1,rows:3}],
    {dataAcordo:today(),parcelasAcordo:1,primeiraParcelaAcordo:'',...p},v=>{
      Object.assign(p,v);if(p.status==='Em andamento')p.status='Acordo';
      const fs=fasesDe(p.tipo);if(fs.indexOf(p.fase)<fs.indexOf('Acordo'))p.fase='Acordo';
      if(!(p.andamentos||[]).some(a=>a.acordo)){(p.andamentos=p.andamentos||[]).push({id:uid(),data:v.dataAcordo,texto:'Acordo celebrado'+(podeFin()?': '+brl(v.valorAcordo)+(+v.parcelasAcordo>1?' em '+v.parcelasAcordo+' parcelas':''):'')+'.',autor:db.usuarioAtual,acordo:true});}
      setTimeout(()=>celebrarEvento('acordo','Acordo fechado!',nomeCli(p.clienteId)),200);});
}
function cardAcordo(p){
  if(p.tipo!=='Judicial'||(p.status!=='Acordo'&&!p.valorAcordo))return '';
  if(!p.valorAcordo)return `<div class="card acordo"><h3>🤝 Acordo</h3><div class="empty">Dados do acordo não preenchidos</div><div class="mfoot"><button class="btn btn-brand" data-act="editAcordo" data-id="${p.id}">Preencher acordo</button></div></div>`;
  const ps=parcelasAcordo(p),fin=podeFin();
  const lanc=db.lancamentos.filter(l=>l.acordoProc===p.id);
  return `<div class="card acordo"><h3>🤝 Acordo ${p.homologado?pill('Homologado','p-green'):pill('Aguardando homologação','p-amber')}<button class="btn btn-ghost btn-sm" data-act="editAcordo" data-id="${p.id}">Editar</button></h3>
    <dl class="dl"><dt>Data</dt><dd>${fd(p.dataAcordo)}</dd>${fin?`<dt>Valor</dt><dd><b>${brl(p.valorAcordo)}</b>${ps.length>1?' em '+ps.length+'x de '+brl(ps[0].valor):''}</dd>`:''}<dt>Pagamento</dt><dd>${esc(p.formaAcordo||'—')}</dd>
    ${p.dataHomologacao?`<dt>Homologação</dt><dd>${fd(p.dataHomologacao)}</dd>`:''}${fin&&+p.honorariosAcordoPct?`<dt>Honorários</dt><dd>${num(+p.honorariosAcordoPct,0)}% = ${brl(sumBy(ps,x=>x.honorarios))}</dd>`:''}</dl>
    ${p.obsAcordo?`<div class="small" style="margin-top:6px">📝 ${esc(p.obsAcordo)}</div>`:''}
    ${fin?`<div class="tbl" style="margin-top:10px"><table><thead><tr><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th>${+p.honorariosAcordoPct?'<th class="num">Honorários</th>':''}</tr></thead><tbody>${ps.map(x=>`<tr><td>${x.n}/${ps.length}</td><td>${fd(x.venc)}</td><td class="num">${brl(x.valor)}</td>${+p.honorariosAcordoPct?`<td class="num">${brl(x.honorarios)}</td>`:''}</tr>`).join('')}</tbody></table></div>
    <div class="mfoot">${lanc.length?`<span class="small muted">✓ ${lanc.length} lançamento(s) de honorários no financeiro</span>`:+p.honorariosAcordoPct?`<button class="btn btn-gold" data-act="lancarAcordo" data-id="${p.id}">Lançar honorários no financeiro</button>`:'<span class="small muted">Informe o % de honorários para lançar no financeiro.</span>'}</div>`:''}</div>`;
}
const ACORDO_ACOES={
  editAcordo:id=>editAcordo(id),
  novoAcordo:id=>editAcordo(id),
  lancarAcordo:id=>{const p=proc(id);if(!p||!podeFin())return;const ps=parcelasAcordo(p);
    ps.forEach(x=>{if(x.honorarios>0)db.lancamentos.push({id:uid(),tipo:'receita',descricao:`H.O. acordo — parcela ${x.n}/${ps.length} — ${nomeCli(p.clienteId)}`,categoria:'H.O. finais — acordo',clienteId:p.clienteId,processoId:p.id,acordoProc:p.id,valor:x.honorarios,venc:x.venc,pago:false,pagoEm:'',forma:'PIX',obs:'Gerado a partir do acordo de '+fd(p.dataAcordo),criado:today()});});
    save();render();toast('Honorários do acordo lançados ✓ ('+ps.length+' parcela(s))');},
};
