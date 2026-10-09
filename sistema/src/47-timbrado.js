/* =========================================================
   PAPEL TIMBRADO — logotipo + marca d'água em todos os documentos
   Padrão: layout do escritório (MS_ADVOCACIA). O Word (.docx) é gerado a
   partir do próprio modelo do escritório (ASSET_DOCX), com cabeçalho e marca d'água.
   ========================================================= */
const JSZIP_URL='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
let jszipP=null;
function carregarJSZip(){
  if(window.JSZip)return Promise.resolve(window.JSZip);
  return jszipP||(jszipP=new Promise((res,rej)=>{const s=document.createElement('script');s.src=JSZIP_URL;s.onload=()=>res(window.JSZip);
    s.onerror=()=>{jszipP=null;rej(new Error('Não foi possível carregar o gerador de Word. Verifique a conexão com a internet.'));};document.head.appendChild(s);}));
}
const logoSrc=()=>db.escritorio.logo||ASSET_LOGO;
const marcaSrc=()=>db.escritorio.semMarca?'':(db.escritorio.marcaDagua||ASSET_MARCA);
/* folha A4 na tela: a marca d'água (imagem de página inteira) se repete a cada página */
const estiloFolha=()=>{const m=marcaSrc();return m?`background-image:url('${m}')`:'';};
function documentoHTML(corpo){
  return `<div class="doc-cab" contenteditable="false"><img src="${logoSrc()}" alt="${esc(db.escritorio.nome)}" class="doc-logo"></div><div class="doc-corpo">${corpo}</div>`;
}
/* ---------- impressão / PDF: cabeçalho e marca d'água em todas as páginas ---------- */
function imprimirDocumento(){
  const corpo=$('#doc-preview .doc-corpo');if(!corpo)return;
  let el=$('#print-doc');if(!el){el=document.createElement('div');el.id='print-doc';document.body.appendChild(el);}
  const m=marcaSrc();
  el.innerHTML=`${m?`<img class="pd-marca" src="${m}" alt="">`:''}<table class="pd-tab"><thead><tr><td><div class="pd-cab"><img src="${logoSrc()}" alt=""></div></td></tr></thead>
    <tbody><tr><td><div class="pd-corpo">${corpo.innerHTML}</div></td></tr></tbody><tfoot><tr><td><div class="pd-rod"></div></td></tr></tfoot></table>`;
  document.body.classList.add('imprimindo');
  const fim=()=>{document.body.classList.remove('imprimindo');window.removeEventListener('afterprint',fim);};
  window.addEventListener('afterprint',fim);
  const imgs=[...el.querySelectorAll('img')];
  Promise.all(imgs.map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r;}))).then(()=>{window.print();setTimeout(fim,1500);});
}
/* ---------- Word (.docx) a partir do modelo do escritório ---------- */
const xmlEsc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function runsDocx(no,fmt){
  let out='';
  no.childNodes.forEach(n=>{
    if(n.nodeType===3){const partes=n.nodeValue.replace(/ /g,' ').split('\n');
      partes.forEach((t,i)=>{if(i)out+='<w:r><w:br/></w:r>';if(t)out+=`<w:r>${rPr(fmt)}<w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;});return;}
    if(n.nodeType!==1)return;
    const tag=n.tagName;
    if(tag==='BR'){out+='<w:r><w:br/></w:r>';return;}
    if(tag==='IMG')return;
    const st=n.style||{};const f={...fmt};
    if(tag==='B'||tag==='STRONG'||+st.fontWeight>=600||st.fontWeight==='bold')f.b=1;
    if(tag==='I'||tag==='EM'||st.fontStyle==='italic')f.i=1;
    if(tag==='U'||/underline/.test(st.textDecoration||''))f.u=1;
    out+=runsDocx(n,f);
  });
  return out;
}
const rPr=f=>f.b||f.i||f.u||f.sz?`<w:rPr>${f.b?'<w:b/>':''}${f.i?'<w:i/>':''}${f.u?'<w:u w:val="single"/>':''}${f.sz?`<w:sz w:val="${f.sz}"/><w:szCs w:val="${f.sz}"/>`:''}</w:rPr>`:'';
function paragrafosDocx(corpo){
  const ps=[];
  const bloco=(el)=>{
    const tit=el.classList&&el.classList.contains('doc-tit')||/^H[1-3]$/.test(el.tagName);
    const ass=el.classList&&el.classList.contains('doc-ass');
    const al=el.style&&el.style.textAlign;
    const jc=tit||ass||al==='center'?'center':al==='right'?'right':al==='left'?'left':'both';
    const runs=runsDocx(el,tit?{b:1,sz:24}:{});
    ps.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="${tit?240:160}" w:line="276" w:lineRule="auto"/><w:jc w:val="${jc}"/></w:pPr>${runs}</w:p>`);
  };
  [...corpo.childNodes].forEach(n=>{
    if(n.nodeType===3){if(n.nodeValue.trim()){const p=document.createElement('p');p.textContent=n.nodeValue;bloco(p);}return;}
    if(n.nodeType!==1)return;
    if(/^(P|DIV|H1|H2|H3|LI)$/.test(n.tagName)){
      if(n.tagName==='DIV'&&n.querySelector('p,div,h1,h2,h3')){[...n.children].forEach(bloco);return;}
      bloco(n);}
    else if(/^(UL|OL)$/.test(n.tagName))[...n.children].forEach(bloco);
    else{const p=document.createElement('p');p.appendChild(n.cloneNode(true));bloco(p);}
  });
  return ps.join('')||'<w:p/>';
}
const dataUrlB64=u=>String(u).split(',')[1]||'';
const dimsImg=src=>new Promise(r=>{const i=new Image();i.onload=()=>r([i.naturalWidth,i.naturalHeight]);i.onerror=()=>r([1,1]);i.src=src;});
async function gerarDocx(){
  const corpo=$('#doc-preview .doc-corpo');if(!corpo)throw new Error('Nada para exportar');
  const JSZip=await carregarJSZip();
  const zip=await JSZip.loadAsync(ASSET_DOCX,{base64:true});
  let doc=await zip.file('word/document.xml').async('string');
  const ps=paragrafosDocx(corpo);doc=doc.replace(/<w:body>[\s\S]*?<w:sectPr/,()=>'<w:body>'+ps+'<w:sectPr');
  zip.file('word/document.xml',doc);
  let hd=await zip.file('word/header1.xml').async('string');const e=db.escritorio;
  if(e.logo){ // logotipo personalizado: troca a imagem e ajusta a proporção (largura de 6,75 cm, altura máx. 3 cm)
    const [w,h]=await dimsImg(e.logo);let cx=2428875,cy=Math.round(cx*h/w);const max=1080000;if(cy>max){cx=Math.round(cx*max/cy);cy=max;}
    zip.file('word/media/image2.png',dataUrlB64(e.logo),{base64:true});
    hd=hd.replace(/<a:srcRect[^>]*\/>/,'<a:srcRect/>').replace(/<wp:extent cx="\d+" cy="\d+"\/>/,`<wp:extent cx="${cx}" cy="${cy}"/>`).replace(/<a:ext cx="\d+" cy="\d+"\/>/,`<a:ext cx="${cx}" cy="${cy}"/>`);
  }
  if(e.semMarca)hd=hd.replace(/<w:pict>[\s\S]*?<\/w:pict>/,'');
  else if(e.marcaDagua){ // marca d'água personalizada: imagem de página inteira (A4)
    zip.file('word/media/image1.png',dataUrlB64(e.marcaDagua),{base64:true});
    hd=hd.replace(/croptop="\d+f"/,'').replace(/height:[\d.]+pt/,'height:841.7pt').replace(/margin-top:[\d.]+pt/,'margin-top:0pt');
  }
  zip.file('word/header1.xml',hd);
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
}
function nomeArquivoDoc(){const f=ui.f.doc||{};const m=db.modelos.find(x=>x.id===f.modelo);return (m?.nome||'documento')+(f.mcli?' '+nomeCli(f.mcli).split(' ')[0]:'');}
/* imagem enviada → PNG redimensionado (dataURL) */
function lerImagem(file,maxLado){
  return new Promise((res,rej)=>{const rd=new FileReader();rd.onload=()=>{const img=new Image();img.onload=()=>{
    const k=Math.min(1,maxLado/Math.max(img.width,img.height));const cv=document.createElement('canvas');cv.width=Math.round(img.width*k);cv.height=Math.round(img.height*k);
    cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);res(cv.toDataURL('image/png'));};img.onerror=()=>rej(new Error('Imagem inválida'));img.src=rd.result;};rd.readAsDataURL(file);});
}
