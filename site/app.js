const S=[['kda','KDA',2],['gd15','Écart d’or @15',0,1],['gpm','Or/min',0],['cs15','CS @15',0],['csd15','Écart CS @15',0,1],
['cspm','CS/min',2],['k15','Kills @15',2],['kp','Part. kills %',0],['dpm','Dégâts/min',0],['dpm15','Dégâts/min @15',0]];
const ROLES={TOP:'Top',JUNGLE:'Jungle',MIDDLE:'Mid',BOTTOM:'ADC',UTILITY:'Support'},RORD=['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'];
const QN={0:'Personnalisée',400:'Normale draft',420:'Classée solo/duo',430:'Normale blind',440:'Classée flex',450:'ARAM',700:'Clash',710:'5c5 ranked',1700:'Arena'};
const qn=g=>QN[g.queueId]||g.queue;
const roleName=p=>ROLES[p]||'Inconnu';
let VER='15.1.1',BENCH={};
const $=s=>document.querySelector(s),app=$('#app');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const num=(v,d=0,sg)=>v==null?'–':(sg&&v>0?'+':'')+v.toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d});
const fs=(v,s)=>num(v,s[2],s[3]);
const who=l=>{const i=l.indexOf('#');return i<0?esc(l):esc(l.slice(0,i))+'<small>'+esc(l.slice(i))+'</small>'};
const dt=t=>t?new Date(t).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'';
const mmss=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
const img=(c,sz,rd)=>'<img class="ch'+(rd?' rd':'')+'" width="'+sz+'" height="'+sz+'" src="https://ddragon.leagueoflegends.com/cdn/'+VER+'/img/champion/'+encodeURIComponent(c)+'.png" alt="'+esc(c)+'" title="'+esc(c)+'" loading="lazy" onerror="imgErr(this)">';
function imgErr(el){const s=document.createElement('span');s.className='chf';s.style.width=el.width+'px';s.style.height=el.height+'px';s.title=el.alt;s.textContent=el.alt.slice(0,2);if(el.classList.contains('rd'))s.style.borderRadius='50%';el.replaceWith(s)}
// dégradé rouge -> bleu, doré pour le meilleur
const heat=vals=>{
  const a=vals.filter(x=>x!=null);if(a.length<2)return()=>'';
  const mn=Math.min(...a),mx=Math.max(...a);if(mn===mx)return()=>'';
  return v=>v==null?'':v===mx?'background:color-mix(in srgb,var(--gold) 55%,transparent);font-weight:700;color:var(--ink)'
    :'background:color-mix(in srgb,color-mix(in srgb,var(--blue) '+Math.round((v-mn)/(mx-mn)*100)+'%,var(--red)) 32%,transparent)'};

document.body.insertAdjacentHTML('afterbegin','<header><b>Archives de la Faille</b><nav style="display:flex;gap:18px">'+
[['index.html','Historique','h'],['players.html','Joueurs','p'],['champions.html','Champions','c'],['champion.html','Fiche champion','m'],['adversaires.html','Adversaires','a'],['records.html','Records','r']]
.map(x=>'<a href="'+x[0]+'" class="'+((document.body.dataset.page==='j'?'p':document.body.dataset.page)===x[2]?'on':'')+'">'+x[1]+'</a>').join('')+'</nav></header>');

Promise.all([
  fetch('data.json').then(r=>{if(!r.ok)throw 0;return r.json()}),
  fetch('https://ddragon.leagueoflegends.com/api/versions.json').then(r=>r.json()).then(v=>v[0]).catch(()=>null),
  fetch('benchmarks.json').then(r=>r.ok?r.json():null).catch(()=>null)
]).then(async([D,v,B])=>{BENCH=fixBench(B||{});if(v){VER=v;try{const j=await(await fetch('https://ddragon.leagueoflegends.com/cdn/'+v+'/data/en_US/champion.json')).json();for(const k in j.data)NAMES[k]=j.data[k].name}catch(_){}}D.roles=D.roles||{};D.rows=D.rows.filter(r=>{const R=D.roles[r.p];return !R||!R.length||R.includes(r.pos)});({j:player,a:opponents,h:historyPage,p:players,c:champions,r:records,m:metaChampion})[document.body.dataset.page](D)})
.catch(e=>{console.error(e);app.innerHTML='<p class="empty">Impossible de charger les données. Lance <code>python serve.py</code> puis ouvre http://localhost:8000</p>'});

function summ(R){
  const o={n:R.length,wr:100*R.filter(r=>r.win).length/R.length};
  S.forEach(s=>{const v=R.map(r=>r[s[0]]).filter(x=>x!=null);o[s[0]]=v.length?v.reduce((a,b)=>a+b)/v.length:null});
  const t=k=>R.reduce((a,r)=>a+r[k],0);o.kda=(t('k')+t('a'))/Math.max(1,t('d'));return o}
// Une ligne par (joueur, rôle) pour ne pas mélanger des rôles différents
function agg(D){
  const m={};D.rows.forEach(r=>(m[r.p+'|'+r.pos]??=[]).push(r));
  const out=Object.values(m).map(R=>({p:R[0].p,pos:R[0].pos,...summ(R)}));
  D.tracked.forEach(p=>{if(!out.some(o=>o.p===p))out.push({p,pos:null,n:0,wr:null})});
  return out;
}

function players(D){
  let key='n',dir=-1,role='';
  const A=agg(D);
  if(!A.length){app.innerHTML='<p class="empty">Ajoute des joueurs dans players.txt.</p>';return}
  const cols=[['n','Parties',0],['wr','Victoires %',0],...S];
  const H={};  // couleurs calculées par rôle
  RORD.concat(['']).forEach(r=>{const g=A.filter(a=>a.n&&(a.pos||'')===r);H[r]={};cols.slice(1).forEach(c=>H[r][c[0]]=heat(g.map(a=>a[c[0]])))});
  const draw=()=>{
    const roles=RORD.filter(r=>A.some(a=>a.pos===r));
    let R=A.filter(a=>!role||a.pos===role);
    R=[...R].sort((a,b)=>key==='p'?(a.p.localeCompare(b.p)||RORD.indexOf(a.pos)-RORD.indexOf(b.pos))*dir:dir*((b[key]??-1e9)-(a[key]??-1e9))*-1);
    app.innerHTML='<h1>Joueurs</h1><div class="bar"><label>Rôle <select id="r"><option value="">Tous</option>'+roles.map(r=>'<option value="'+r+'"'+(r===role?' selected':'')+'>'+ROLES[r]+'</option>').join('')+'</select></label></div>'+
    '<div class="scroll"><table><thead><tr><th class="s'+(key==='p'?' cur':'')+'" data-k="p">Joueur</th><th>Rôle</th>'+cols.map(c=>'<th class="s'+(c[0]===key?' cur':'')+'" data-k="'+c[0]+'">'+c[1]+(c[0]===key?(dir<0?' ▾':' ▴'):'')+'</th>').join('')+'</tr></thead><tbody>'+
    R.map(r=>'<tr><td><a class="pl" href="player.html?p='+encodeURIComponent(r.p)+(r.pos==null?'':'&r='+r.pos)+'"'+(r.pos==null?' title="Aucune partie dans le dossier : page basée sur la SoloQ / Flex de la saison"':'')+'>'+who(r.p)+'</a></td><td>'+(r.pos==null?'–':roleName(r.pos))+'</td>'+cols.map(c=>{
      const k=c[0],st=k==='n'||!r.n?'':(H[r.pos||'']?.[k]?.(r[k])||'');
      return '<td style="'+st+'">'+(k==='n'?r.n:fs(r[k],c))+'</td>'}).join('')+'</tr>').join('')+
    '</tbody></table></div><p class="legend">Une ligne par joueur et par rôle joué. Les couleurs comparent chaque stat entre joueurs du même rôle (rouge = plus bas, bleu = plus haut, doré = meilleur). Les stats @15 ne comptent que les parties de 15 min ou plus avec timeline. KDA = total (K+A) / total des morts.</p>';
    app.querySelectorAll('th.s').forEach(th=>th.onclick=()=>{const k=th.dataset.k;if(k===key)dir=-dir;else{key=k;dir=k==='p'?1:-1}draw()});
    $('#r').onchange=e=>{role=e.target.value;draw()};
  };draw();
}

function records(D){
  let mode='game',min=3;
  const draw=()=>{
    let h='<h1>Records</h1><div class="bar"><button data-m="game" class="'+(mode==='game'?'on':'')+'">En une partie</button><button data-m="avg" class="'+(mode==='avg'?'on':'')+'">Meilleures moyennes (par rôle)</button>'+
    (mode==='avg'?'<label>Parties minimum <input id="min" type="number" min="1" value="'+min+'" style="width:64px"></label>':'')+'</div><div class="cards">';
    const A=mode==='avg'?agg(D).filter(a=>a.n&&a.n>=min):null;
    S.forEach(s=>{
      const k=s[0];
      const L=(mode==='game'?D.rows:A).filter(r=>r[k]!=null).sort((a,b)=>b[k]-a[k]).slice(0,3);
      h+='<div class="card"><h2>'+s[1]+'</h2>'+(L.length?'<ol>'+L.map((r,i)=>'<li><span>'+(i+1)+'.</span><span>'+
        (mode==='game'?'<a href="index.html#'+esc(r.game)+'" class="cell">'+img(r.champ,32,1)+'<span>'+who(r.p)+' <small>'+roleName(r.pos)+' · '+dt(r.date).split(' ')[0]+'</small></span></a>'
        :'<span class="cell"><span>'+who(r.p)+' <small>'+roleName(r.pos)+' · '+r.n+' parties</small></span></span>')+
        '</span><b>'+fs(r[k],s)+'</b></li>').join('')+'</ol>':'<small>Pas de données</small>')+'</div>';
    });
    app.innerHTML=h+'</div>';
    app.querySelectorAll('button[data-m]').forEach(b=>b.onclick=()=>{mode=b.dataset.m;draw()});
    const mi=$('#min');if(mi)mi.onchange=()=>{min=Math.max(1,+mi.value||1);draw()};
  };draw();
}

function chart(g){
  if(!g.gd.length)return '<p><small>Pas de timeline : courbe d’or indisponible.</small></p>';
  const T=g.gdt&&g.gdt.length===g.gd.length?g.gdt:g.gd.map((_,i)=>i*60),maxT=T[T.length-1]||1,m=Math.max(1000,...g.gd.map(Math.abs)),id='c'+g.id.replace(/\W/g,'');
  const W=700,H=210,L=56,Rt=14,Tp=10,B=32,pw=W-L-Rt,ph=H-Tp-B,mid=Tp+ph/2;
  const X=t=>+(L+t/maxT*pw).toFixed(1),Y=v=>+(mid-v/m*(ph/2-4)).toFixed(1);
  const pts=g.gd.map((v,i)=>X(T[i])+','+Y(v)).join(' '),area=X(0)+','+mid+' '+pts+' '+X(maxT)+','+mid;
  let ax='';
  for(let t=0;t<=maxT;t+=60){
    const big=t%300===0,x=X(t);
    ax+='<line x1="'+x+'" x2="'+x+'" y1="'+(big?Tp:H-B)+'" y2="'+(H-B+(big?6:3))+'" stroke="var(--line)" opacity="'+(big?.9:.6)+'"/>';
    if(big)ax+='<text x="'+x+'" y="'+(H-10)+'" text-anchor="middle" font-size="11" fill="var(--mute)">'+mmss(t)+'</text>';
  }
  const lastBig=Math.floor(maxT/300)*300;
  if(maxT-lastBig>=60)ax+='<text x="'+X(maxT)+'" y="'+(H-10)+'" text-anchor="middle" font-size="11" fill="var(--mute)">'+mmss(Math.round(maxT))+'</text>';
  const yl=(v,y)=>'<text x="'+(L-8)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="var(--mute)">'+(v>0?'+':v<0?'−':'')+num(Math.abs(v))+'</text>';
  const hov=g.gd.map((v,i)=>'<circle cx="'+X(T[i])+'" cy="'+Y(v)+'" r="6" fill="transparent"><title>'+mmss(Math.round(T[i]))+' · '+(v>=0?'Blue':'Red')+' side +'+num(Math.abs(v))+' or</title></circle>').join('');
  return '<div class="chart"><small>Avance en or (bleu au-dessus = blue side devant, rouge en dessous). Survole la courbe pour voir l’écart à chaque minute.</small><svg viewBox="0 0 '+W+' '+H+'"><defs><clipPath id="'+id+'u"><rect x="0" y="0" width="'+W+'" height="'+mid+'"/></clipPath><clipPath id="'+id+'d"><rect x="0" y="'+mid+'" width="'+W+'" height="'+H+'"/></clipPath></defs>'+ax+
  '<polygon points="'+area+'" fill="var(--blue)" fill-opacity=".45" clip-path="url(#'+id+'u)"/><polygon points="'+area+'" fill="var(--red)" fill-opacity=".45" clip-path="url(#'+id+'d)"/>'+
  '<line x1="'+L+'" x2="'+(W-Rt)+'" y1="'+mid+'" y2="'+mid+'" stroke="var(--mute)"/><polyline fill="none" stroke="var(--ink)" stroke-width="1.5" points="'+pts+'"/>'+yl(m,Tp+4)+yl(0,mid)+yl(-m,H-B-4)+hov+'</svg></div>';
}
const COLS=[['KDA',p=>p.s.kda,2],['Dégâts',p=>p.dmg,0],['DPM',p=>p.s.dpm,0],['Or',p=>p.gold,0],['CS',p=>p.cs,0],['Vision',p=>p.vis,0],['KP %',p=>p.s.kp,0],['Écart or @15',p=>p.s.gd15,0,1]];
function team(g,id,Hs){
  const T=g.players.filter(p=>p.team===id);
  return '<h3 style="color:var(--'+(id===100?'blue':'red')+')">'+(id===100?'Blue side':'Red side')+' – '+g.kills[id]+' kills</h3><div class="scroll"><table><thead><tr><th>Joueur</th><th>K/D/A</th>'+COLS.map(c=>'<th>'+c[0]+'</th>').join('')+'</tr></thead><tbody>'+
  T.map(p=>'<tr class="'+(p.tr?'tr':'')+'"><td><span class="cell">'+img(p.champ,28)+'<span>'+who(p.name+'#'+p.tag)+'</span></span></td><td>'+p.k+'/'+p.d+'/'+p.a+'</td>'+
    COLS.map((c,i)=>{const v=c[1](p);return '<td style="'+Hs[i](v)+'">'+num(v,c[2],c[3])+'</td>'}).join('')+'</tr>').join('')+'</tbody></table></div>';
}
const ours=(g,sel)=>{
  if(sel){const p=g.players.find(x=>(x.name+'#'+x.tag).toLowerCase()===sel.toLowerCase());if(p)return p.team}
  const c={100:0,200:0};g.players.forEach(p=>p.tr&&c[p.team]++);return c[200]>c[100]?200:100};
const pick=(g,t)=>{const c=g.players.filter(p=>p.team===t&&p.tr);if(!c.length)return null;let h=0;for(const ch of g.id)h=(h*31+ch.charCodeAt(0))>>>0;return c[h%c.length]};
const nz=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
const champId=n=>{const k=nz(n);for(const id in NAMES)if(nz(id)===k||nz(NAMES[id])===k)return id;return String(n).replace(/[^A-Za-z0-9]/g,'')};
const NAMES={},LANES=['Top','Jungle','Middle','Bottom','Support'];
const draftUrl=g=>{
  const side=t=>{
    const slots=[null,null,null,null,null],rest=[];
    g.players.filter(p=>p.team===t).forEach(p=>{const i=RORD.indexOf(p.pos);if(i>=0&&!slots[i])slots[i]=p;else rest.push(p)});
    rest.forEach(p=>{const i=slots.indexOf(null);if(i>=0)slots[i]=p});
    return slots.map((p,i)=>p?{champion:NAMES[p.champ]||p.champ,image:p.champ,lane:LANES[i]}:null)};
  return 'https://team-draft.onrender.com/?draft='+encodeURIComponent(JSON.stringify({version:1,team1:side(100),team2:side(200)}))};
const dpmUrl=(g,t)=>{const p=pick(g,t);return p?'https://dpm.lol/'+encodeURIComponent(p.name)+'-'+encodeURIComponent(p.tag)+'?match='+g.id.split('_').pop():null};
const won=(g,sel)=>g.players.find(p=>p.team===ours(g,sel)).win;
function historyPage(D){  // pas « history » : masquerait window.history
  let sel='';
  const mine=p=>p.tr&&(!sel||(p.name+'#'+p.tag).toLowerCase()===sel.toLowerCase());
  const chip=(t,G)=>{
    const w=G.filter(g=>won(g,sel)).length,wr=G.length?100*w/G.length:0;
    return '<div class="chip"><span>'+esc(t)+'</span><b class="'+(wr>50?'win':wr<50?'loss':'')+'">'+num(wr)+' %</b><small>'+w+'V – '+(G.length-w)+'D</small></div>'};
  const pie=(t,G)=>{
    const X=G.filter(g=>ours(g,sel)===t),n=X.length,w=X.filter(g=>won(g,sel)).length,wr=n?100*w/n:0,c=t===100?'blue':'red';
    return '<div class="chip pie"><div class="pl8" style="color:var(--'+c+')">'+(t===100?'Blue':'Red')+' side</div>'+
      '<div class="pc" style="--ring:var(--'+c+');background:'+(n?'conic-gradient(var(--win) 0 '+wr+'%,var(--red) '+wr+'% 100%)':'var(--line)')+'"><span class="'+(!n?'':wr>50?'win':wr<50?'loss':'')+'">'+(n?num(wr)+' %':'–')+'</span></div>'+
      '<div class="pn8">'+n+' partie'+(n>1?'s':'')+'</div><small>'+w+'V – '+(n-w)+'D</small></div>'};
  const draw=()=>{
    const G=D.games.filter(g=>g.players.some(mine)||(!sel&&!g.players.some(p=>p.tr)));
    const qs=[...new Set(G.map(qn))];
    app.innerHTML='<h1>Historique</h1><div class="bar"><label>Joueur <select id="f"><option value="">Tous</option>'+D.tracked.map(t=>'<option'+(t===sel?' selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label><span>'+G.length+' partie(s)</span></div>'+
    (G.length?'<div class="top"><div class="left"><div class="chips">'+chip('Winrate équipe',G)+(qs.length>1?qs.map(q=>chip(q,G.filter(g=>qn(g)===q))).join(''):'')+'</div><img class="vnl" src="assets/vanilla.png" alt="Vanilla Gaming"></div><div class="pies">'+pie(100,G)+pie(200,G)+'</div></div>'+
    G.map(g=>{
      const t=ours(g,sel),w=won(g,sel),us=g.players.filter(p=>p.team===t),op=g.players.filter(p=>p.team!==t);
      return '<div class="g '+(w?'w':'l')+'" id="'+esc(g.id)+'"><div class="gh" tabindex="0"><span class="side '+(t===100?'b':'r')+'">'+(t===100?'Blue':'Red')+' side</span><b class="'+(w?'win':'loss')+'">'+(w?'Victoire':'Défaite')+'</b><span class="tm">'+us.map(p=>img(p.champ,36)).join('')+'<i>vs</i>'+op.map(p=>img(p.champ,36)).join('')+'</span><span class="meta">'+esc(qn(g))+' · '+mmss(g.dur)+' · '+dt(g.date)+(dpmUrl(g,t)?' · <a class="ext" href="'+dpmUrl(g,t)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">dpm.lol ↗</a>':'')+' · <a class="ext" href="'+draftUrl(g)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">Draft ↗</a></span></div><div class="gd"></div></div>';
    }).join(''):'<p class="empty">Aucune partie. Télécharge-en avec download.py (voir l’en-tête du fichier).</p>');
    $('#f').onchange=e=>{sel=e.target.value;draw()};
    app.querySelectorAll('.g').forEach(el=>{
      const open=()=>{const b=el.querySelector('.gd');if(!b.innerHTML){
        const g=D.games.find(x=>x.id===el.id),Hs=COLS.map(c=>heat(g.players.map(c[1])));
        b.innerHTML=team(g,100,Hs)+team(g,200,Hs)+'<p class="legend">Couleurs : rouge = plus bas, bleu = plus haut de la partie, doré = meilleur des 10 joueurs.</p>'+chart(g)}
        el.classList.toggle('open')};
      const h=el.querySelector('.gh');h.onclick=open;h.onkeydown=e=>{if(e.target===h&&(e.key==='Enter'||e.key===' ')){e.preventDefault();open()}};
    });
  };draw();
  const id=decodeURIComponent(location.hash.slice(1)),el=id&&document.getElementById(id);
  if(el){el.querySelector('.gh').click();el.scrollIntoView()}
}

// Tableau de champions triable (clic sur un en-tête). st = {key,dir} conservé entre les rendus
function ctable(host,L,st,cols){
  const H={};cols.slice(1).forEach(c=>H[c[0]]=heat(L.map(o=>o[c[0]])));
  const R=[...L].sort((a,b)=>st.key==='c'?a.c.localeCompare(b.c)*st.dir:st.dir*((b[st.key]??-1e9)-(a[st.key]??-1e9))*-1);
  const arrow=k=>k===st.key?(st.dir<0?' ▾':' ▴'):'';
  host.innerHTML='<div class="scroll"><table><thead><tr><th class="s'+(st.key==='c'?' cur':'')+'" data-k="c">Champion'+arrow('c')+'</th>'+cols.map(c=>'<th class="s'+(c[0]===st.key?' cur':'')+'" data-k="'+c[0]+'">'+c[1]+arrow(c[0])+'</th>').join('')+'</tr></thead><tbody>'+
  R.map(o=>'<tr><td><span class="cell">'+img(o.c,28)+'<span>'+esc(o.c)+'</span></span></td>'+cols.map(c=>'<td style="'+(c[0]==='n'?'':H[c[0]](o[c[0]]))+'">'+fs(o[c[0]],c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  host.querySelectorAll('th.s').forEach(th=>{
    const go=()=>{const k=th.dataset.k;if(k===st.key)st.dir=-st.dir;else{st.key=k;st.dir=k==='c'?1:-1}ctable(host,L,st,cols)};
    th.tabIndex=0;th.onclick=go;th.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}};
  });
}

function champions(D){
  const cnt={};D.rows.forEach(r=>cnt[r.pos]=(cnt[r.pos]||0)+1);
  const oi=r=>RORD.indexOf(r)<0?9:RORD.indexOf(r);
  const roles=Object.keys(cnt).sort((a,b)=>oi(a)-oi(b));
  if(!roles.length){app.innerHTML='<p class="empty">Aucune donnée pour l’instant.</p>';return}
  let role=[...roles].sort((a,b)=>cnt[b]-cnt[a])[0],pl='',min=1;const st={key:'n',dir:-1};
  const cols=[['n','Parties',0],['wr','Victoires %',0],...S];
  const draw=()=>{
    const PL=D.tracked.filter(t=>{const R=D.roles[t];return !R||!R.length||R.includes(role)});
    if(pl&&!PL.includes(pl))pl='';
    const m={};D.rows.filter(r=>r.pos===role&&(!pl||r.p===pl)).forEach(r=>(m[r.champ]??=[]).push(r));
    const L=Object.entries(m).map(([c,x])=>({c,...summ(x)})).filter(o=>o.n>=min);
    app.innerHTML='<h1>Champions</h1><div class="bar"><label>Rôle <select id="r">'+roles.map(r=>'<option value="'+r+'"'+(r===role?' selected':'')+'>'+roleName(r)+'</option>').join('')+'</select></label>'+
    '<label>Joueur <select id="p"><option value="">Tous les joueurs</option>'+PL.map(t=>'<option'+(t===pl?' selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label>'+
    '<label>Parties minimum <input id="m" type="number" min="1" value="'+min+'" style="width:64px"></label></div>'+
    (L.length?'<div id="ct"></div><p class="legend">Moyennes par champion pour le rôle choisi. Clique sur un en-tête pour trier. Couleurs : rouge = plus bas, bleu = plus haut, doré = meilleur du tableau. Les stats @15 ne comptent que les parties de 15 min ou plus avec timeline.</p>':'<p class="empty">Aucun champion pour ce filtre.</p>');
    $('#r').onchange=e=>{role=e.target.value;draw()};
    $('#p').onchange=e=>{pl=e.target.value;draw()};
    $('#m').onchange=e=>{min=Math.max(1,+e.target.value||1);draw()};
    if(L.length)ctable($('#ct'),L,st,cols);
  };draw();
}

// Champions affrontés : stats cumulées des adversaires (parties où au moins un joueur suivi a joué)
function opponents(D){
  const rows=[];
  D.games.forEach(g=>{
    if(!g.players.some(p=>p.tr))return;
    const t=ours(g,''),w=won(g,'');
    g.players.filter(p=>p.team!==t).forEach(p=>rows.push({c:p.champ,pos:p.pos,win:w,k:p.k,d:p.d,a:p.a,...p.s}));
  });
  if(!rows.length){app.innerHTML='<h1>Adversaires</h1><p class="empty">Aucune partie pour l’instant.</p>';return}
  const roles=RORD.filter(r=>rows.some(x=>x.pos===r));
  let role='',min=1;const st={key:'n',dir:-1};
  const cols=[['n','Parties',0],['wr','Nos victoires %',0],...S];
  const draw=()=>{
    const m={};rows.filter(r=>!role||r.pos===role).forEach(r=>(m[r.c]??=[]).push(r));
    const L=Object.entries(m).map(([c,x])=>({c,...summ(x)})).filter(o=>o.n>=min);
    app.innerHTML='<h1>Adversaires</h1><div class="bar"><label>Rôle <select id="r"><option value="">Tous (ALL)</option>'+roles.map(r=>'<option value="'+r+'"'+(r===role?' selected':'')+'>'+ROLES[r]+'</option>').join('')+'</select></label>'+
    '<label>Parties minimum <input id="m" type="number" min="1" value="'+min+'" style="width:64px"></label><span>'+L.length+' champion(s)</span></div>'+
    (L.length?'<div id="ct"></div><p class="legend">Champions affrontés. « Nos victoires % » = notre winrate contre ce champion ; les autres colonnes sont les moyennes du champion adverse. Clique sur un en-tête pour trier. Rouge = plus bas, bleu = plus haut, doré = meilleur du tableau.</p>':'<p class="empty">Aucun champion pour ce filtre.</p>');
    $('#r').onchange=e=>{role=e.target.value;draw()};
    $('#m').onchange=e=>{min=Math.max(1,+e.target.value||1);draw()};
    if(L.length)ctable($('#ct'),L,st,cols);
  };draw();
}

function playerRecords(D,R,p,qOf){
  if(!R.length)return '';
  const best=(fn,filter=()=>true)=>{
    const L=R.filter(r=>filter(r)&&fn(r)!=null);
    return L.length?L.reduce((a,b)=>fn(b)>fn(a)?b:a):null;
  };
  const fmtDate=d=>d?new Date(d).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):'';
  const sub=r=>{
    if(!r)return '';
    const g=(D.games||[]).find(x=>x.id===r.game);
    const q=g?qn(g):(qOf&&qOf(r))||'';
    // partie du dossier -> historique du site ; partie SoloQ / Flex -> dpm.lol
    const [nm,tg]=(p||'').split('#');
    const href=g?'index.html#'+esc(r.game):'https://dpm.lol/'+encodeURIComponent(nm)+'-'+encodeURIComponent(tg||'')+'?match='+String(r.game).split('_').pop();
    return '<a class="rec-sub" href="'+href+'"'+(g?'':' target="_blank" rel="noopener"')+'>'+img(r.champ,18,1)+'<span>'+esc(NAMES[r.champ]||r.champ)+(q?' · '+esc(q):'')+(r.date?' · '+fmtDate(r.date):'')+'</span></a>';
  };
  const cards=[
    {t:'Plus de kills',r:best(r=>r.k),v:r=>num(r.k)},
    {t:'Plus d’assists',r:best(r=>r.a),v:r=>num(r.a)},
    {t:'Meilleur KDA',r:best(r=>r.kda),v:r=>num(r.kda,1)+' · '+r.k+'/'+r.d+'/'+r.a},
    {t:'Plus gros écart d’or @15',r:best(r=>r.gd15,r=>r.gd15!=null),v:r=>num(r.gd15,0,1)}
  ].filter(c=>c.r);
  if(!cards.length)return '';
  return '<section class="prec"><h2>Ses records personnels</h2><div class="prec-grid">'+
    cards.map(c=>'<div class="prec-card"><small>'+c.t+'</small><b>'+c.v(c.r)+'</b>'+sub(c.r)+'</div>').join('')+
    '</div></section>';
}

const TEAM={name:'Vanilla Gaming',logo:'assets/vanilla.png'};
const FR='<svg viewBox="0 0 3 2" width="22" height="15" style="border-radius:2px;vertical-align:middle"><rect width="1" height="2" fill="#0055a4"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#ef4135"/></svg>';

const EM_BADGES = {
  kda:          [null,            'Mauvais Kda',    'Bon Kda',            'Upset'],
  kp:           ['Rage Splitter', 'Isolé',          'Sociable',           'Membre de la secte'],
  fb_pct:       [null,            null,           'Warwick',            'Jankos'],
  solo_kills:   [null,            null,             'Maitre du 1v1',      'Ruler'],
  dpm:          ['Pacifiste',     'Économe en sorts','Artillerie lourde', 'Viper'],
  dmg_per_gold: ['Fils à papa',   null,             'Efficace',           'Gumayusi'],
  dmg_share:    ['Invisible',     'Timide',         'Menace',             '1v9'],
  gpm:          ['2008',          'Récession',      'Mozart de la finance','Banque centrale'],
  csd15:        ['Bad Laner',     'difficult lane', 'easy lane',          'Good Laner'],
  cspm:         ['No Farm',       'Fizz',           'Karthus',            'Stardew Valley'],
  vspm:         ['Lee sin',       'Lunettes',        'Bonne vision',       'Teemo']
};

function getRankedQueueRows(D, p, role, kind) {
  const byPlayer = D?.ranked?.[p];
  if (!byPlayer || typeof byPlayer !== 'object') return [];

  const entryKey = Object.keys(byPlayer).find(k => {
    const lk = k.toLowerCase();
    return kind === 'solo'
      ? (lk.includes('solo') && !lk.includes('flex'))
      : lk.includes('flex');
  });

  const rows = entryKey ? (byPlayer[entryKey]?.rows || []) : [];
  if (!role || role === 'all') return rows;

  const hasRole = rows.some(r => r && (r.role || r.pos || r.position));
  if (!hasRole) return rows;

  return rows.filter(r => (r.role || r.pos || r.position) === role);
}

function weightedStatMean(D, p, role, R, k) {
  const soloRows = getRankedQueueRows(D, p, role, 'solo');
  const flexRows = getRankedQueueRows(D, p, role, 'flex');
  const minGames = 10;
  const soloWeight   = (soloRows?.length || 0) >= minGames ? 3 : 0;
  const flexWeight   = (flexRows?.length || 0) >= minGames ? 1 : 0;
  const dossierWeight = (R?.length || 0) >= minGames ? 3 : 0;
  const parts = [
    { val: mean(soloRows, k), w: soloWeight },
    { val: mean(flexRows, k), w: flexWeight },
    { val: mean(R, k),        w: dossierWeight }
  ].filter(x => x.val != null && !isNaN(x.val));

  if (!parts.length) return null;
  const wSum = parts.reduce((acc, x) => acc + x.w, 0);
  return parts.reduce((acc, x) => acc + x.val * x.w, 0) / wSum;
}

function emeraldBadges(D, p, role, R){
  const emRanks = BENCH[role]?.ranks?.Emerald || {};
  const items = [];

  Object.entries(EM_BADGES).forEach(([k, tiers])=>{
    const val = weightedStatMean(D, p, role, R, k);
    const em = emRanks[k];
    if (val == null || isNaN(val) || em == null || isNaN(em)) return;

    const [mn, mx] = bounds(D, role, 'dossier', k);
    if (mx == null || mn == null || mx === mn) return;

    const toPct = v => Math.min(100, Math.max(0, ((v - mn) / (mx - mn)) * 100));
    const pVal = toPct(val);
    const pEm  = toPct(em);
    const delta = pVal - pEm; // distance en points sur l'axe 0-100 du graphe

    let idx = -1, tone = '';
    if (delta <= -30)      { idx = 0; tone = 'low'; }
    else if (delta <= -15) { idx = 1; tone = 'low'; }
    else if (delta >= 30)  { idx = 3; tone = 'high'; }
    else if (delta >= 10)  { idx = 2; tone = 'high'; }

    if (idx < 0) return;
    const label = tiers[idx];
    if (!label || label === 'None') return;

    const vFmt  = num(val, rdec(k));
    const emFmt = num(em, rdec(k));
    const dFmt  = (delta >= 0 ? '+' : '') + Math.round(delta) + ' pts sur le graphe';
    const reason = `${RLAB[k]} pondéré à ${vFmt} (${dFmt} vs Émeraude à ${emFmt}).`;

    items.push({ label, tone, reason });
  });

  if (!items.length) return '';
  return '<section class="embadges"><h2>Profil vs Émeraude</h2><div class="embadges-list">' +
    items.map(it=>'<span class="ebadge ' + it.tone + '" data-tip="' + esc(it.reason) + '">' +
      esc(it.label) + '</span>').join('') +
    '</div></section>';
}

function player(D){
  const q=new URLSearchParams(location.search),p=q.get('p')||'';
  const RK=(D.ranked||{})[p]||{};
  const nRanked=r=>srcRows(D,p,r,'soloq').length+srcRows(D,p,r,'flex').length;
  const cnt=L=>{const c={};L.forEach(x=>{if(x)c[x]=(c[x]||0)+1});return Object.keys(c).sort((a,b)=>c[b]-c[a])};
  const dosRoles=cnt(D.rows.filter(r=>r.p===p).map(r=>r.pos));
  let role=q.get('r')||'';
  // pas de rôle dans l'URL : rôle le plus joué dans le dossier, sinon 1er rôle de players.txt avec 10+ parties classées, sinon le plus joué en classée
  if(!role)role=dosRoles[0]||(D.roles[p]||[]).find(r=>nRanked(r)>=10)||cnt(Object.values(RK).flatMap(c=>c.rows||[]).map(r=>r.pos))[0]||'';
  const R=D.rows.filter(r=>r.p===p&&r.pos===role);
  // aucune partie dans le dossier à ce rôle : la page se base sur la SoloQ / Flex de la saison
  const fromRanked=!R.length,B=fromRanked?[...srcRows(D,p,role,'soloq'),...srcRows(D,p,role,'flex')]:R;
  if(!B.length){app.innerHTML='<p class="empty">'+(D.tracked.includes(p)?'Aucune partie pour '+esc(p.split('#')[0])+(role?' en '+roleName(role):'')+' (ni dans le dossier, ni en SoloQ / Flex cette saison).':'Joueur introuvable.')+' <a class="ext" href="players.html">Retour aux joueurs</a></p>';return}
  const soloIds=new Set((RK.soloq?.rows||[]).map(r=>r.game)),qOf=r=>soloIds.has(r.game)?'Classée solo/duo':'Classée flex';
  const o=summ(B),name=p.split('#')[0],w=B.filter(r=>r.win).length,dts=B.map(r=>r.date).filter(Boolean);
  const first=dts.length?new Date(Math.min(...dts)):null,last=dts.length?new Date(Math.max(...dts)):null;
  const t=k=>B.reduce((a,r)=>a+r[k],0),av=k=>num(t(k)/B.length,1);
  const others=RORD.filter(r=>r!==role&&(dosRoles.includes(r)||((D.roles[p]||[]).includes(r)&&nRanked(r))));
  document.title=name+' – Archives de la Faille';
  const m={};B.forEach(r=>(m[r.champ]??=[]).push(r));
  const L=Object.entries(m).map(([c,x])=>({c,...summ(x)}));
  const cols=[['n','Parties',0],['wr','Victoires %',0],...S];
  const fav=D.champs&&D.champs[p];
  document.querySelectorAll('.splash').forEach(e=>e.remove());
  if(fav)document.body.insertAdjacentHTML('beforeend','<div class="splash"><img src="https://ddragon.leagueoflegends.com/cdn/img/champion/splash/'+encodeURIComponent(champId(fav))+'_0.jpg" alt="" onerror="this.parentNode.remove()"></div>');
  app.innerHTML='<p><a class="ext" href="players.html">← Joueurs</a></p>'+
  '<section class="hero"><div class="pic"><img class="ph" src="assets/players/'+encodeURIComponent(name)+'.png" alt="" onerror="this.onerror=null;this.src=\'assets/player.svg\'"><img class="tl" src="'+TEAM.logo+'" alt="'+TEAM.name+'"></div>'+
  '<div class="hi"><div class="meta">'+(last?'<b>'+last.getFullYear()+'</b>':'')+'<span>'+roleName(role)+'</span><span><img src="'+TEAM.logo+'" alt=""><b>'+TEAM.name+'</b></span><span>'+FR+' France</span></div>'+
  '<h1>'+esc(name)+'</h1><p>'+(fromRanked
    ?'Aucune partie avec '+TEAM.name+' pour l’instant · stats SoloQ / Flex de la saison ('+B.length+' parties)'
    :R.length+' parties avec '+TEAM.name+(first?' depuis '+first.toLocaleDateString('fr-FR',{month:'long',year:'numeric'}):''))+' · '+esc(p.slice(name.length))+'</p>'+
  (others.length?'<p style="margin-top:8px">Autres rôles : '+others.map(r=>'<a class="ext" href="player.html?p='+encodeURIComponent(p)+'&r='+r+'">'+roleName(r)+'</a>').join(' · ')+'</p>':'')+'</div>'+
  '<div class="stats"><div class="st"><small>'+(fromRanked?'Parties classées':'Parties')+'</small><b>'+B.length+'</b><small>'+w+' V · '+(B.length-w)+' D</small></div>'+
  '<div class="st"><small>Victoires</small><b>'+num(o.wr)+' %</b><small>'+w+' sur '+B.length+'</small></div>'+
  '<div class="st"><small>KDA</small><b>'+num(o.kda,2)+'</b><small>'+av('k')+' / '+av('d')+' / '+av('a')+'</small></div></div></section>'+
  '<nav class="ptabs" role="tablist"><button role="tab" data-t="data">Statistiques</button><button role="tab" data-t="pool">Champion pool</button></nav>'+
  '<div class="tabp" data-t="data">'+
  emeraldBadges(D,p,role,R)+
  playerRecords(D,B,p,qOf)+
  '<div id="radar"></div><div id="scatter"></div><h2 style="margin:24px 0 10px">Champions joués en '+roleName(role)+(fromRanked?' <small>(SoloQ + Flex de la saison)</small>':'')+'</h2><div id="ct"></div>'+
  '<p class="legend">Stats de '+esc(name)+' uniquement en '+roleName(role)+(fromRanked?', sur ses parties SoloQ et Flex de la saison (aucune partie dans le dossier)':'')+'. Clique sur un en-tête pour trier. Couleurs comparées entre ses champions.</p></div>'+
  '<div class="tabp" data-t="pool">'+championPool(D,p,role)+'</div>';
  const tab=t=>{app.querySelectorAll('.ptabs button').forEach(b=>{const on=b.dataset.t===t;b.classList.toggle('on',on);b.setAttribute('aria-selected',on)});
    app.querySelectorAll('.tabp').forEach(x=>x.hidden=x.dataset.t!==t)};
  app.querySelectorAll('.ptabs button').forEach(b=>b.onclick=()=>{tab(b.dataset.t);location.hash=b.dataset.t==='pool'?'pool':'stats'});
  tab(location.hash==='#pool'?'pool':'data');
  ctable($('#ct'),L,{key:'n',dir:-1},cols);
  chartBlock($('#radar'),D,p,role,'Radar',radarRender(D,p,role));
  chartBlock($('#scatter'),D,p,role,'Champions : winrate et écart d’or @15',scatterRender(p,role));
  adviceBlock($('#advice'),D,p,role);
  blindChart($('#blind'),D,p,role);
}

// lien vers la fiche champion (champion.html) ; role = clé Riot (TOP…UTILITY) ou lane (top…support)
const champHref=(c,role)=>'champion.html?c='+encodeURIComponent(c)+'&r='+encodeURIComponent(BROLE[role]||role);
const champLink=(c,role,label)=>'<a class="cplink" href="'+champHref(c,role)+'" title="Fiche de '+esc(NAMES[champId(c)]||c)+'">'+label+'</a>';

// ---------- champion pool (méthode B) ----------
// Score = ln(1+n) × (wr_liss / 0.5)^α × Perf, sur toutes les parties du rôle (dossier + SoloQ + Flex de la saison)
// wr_liss = (w + 0.5·m) / (n + m) ; Perf = clip(1 + β·z_perf, 0.85, 1.15), z_perf = écart à la moyenne du joueur sur ce rôle
const POOL={min:3,m:8,alpha:1.5,beta:.1,clip:[.85,1.15],top:5,stats:['kda','kp','dpm','gpm','cspm','gd15','csd15']};
function poolScores(D,p,role){
  const seen=new Set(),G=[];
  ['dossier','soloq','flex'].forEach(k=>srcRows(D,p,role,k).forEach(r=>{if(!seen.has(r.game)){seen.add(r.game);G.push(r)}}));
  if(!G.length)return {G,L:[]};
  const mu={},sd={};
  POOL.stats.forEach(k=>{const v=G.map(r=>r[k]).filter(x=>x!=null);if(v.length<2)return;
    mu[k]=v.reduce((a,b)=>a+b,0)/v.length;sd[k]=Math.sqrt(v.reduce((a,b)=>a+(b-mu[k])**2,0)/(v.length-1))});
  const zg=r=>{const z=POOL.stats.filter(k=>sd[k]&&r[k]!=null).map(k=>(r[k]-mu[k])/sd[k]);return z.length?z.reduce((a,b)=>a+b,0)/z.length:null};
  const m={};G.forEach(r=>(m[r.champ]??=[]).push(r));
  const L=Object.entries(m).filter(([,x])=>x.length>=POOL.min).map(([c,x])=>{
    const n=x.length,w=x.filter(r=>r.win).length,t=k=>x.reduce((a,r)=>a+r[k],0);
    const zs=x.map(zg).filter(v=>v!=null),z=zs.length?zs.reduce((a,b)=>a+b,0)/zs.length:0;
    const liss=(w+.5*POOL.m)/(n+POOL.m),perf=Math.min(POOL.clip[1],Math.max(POOL.clip[0],1+POOL.beta*z));
    return {c,n,w,wr:100*w/n,liss:100*liss,kda:(t('k')+t('a'))/Math.max(1,t('d')),k:t('k')/n,d:t('d')/n,a:t('a')/n,perf,
      score:Math.log(1+n)*Math.pow(liss/.5,POOL.alpha)*perf};
  }).sort((a,b)=>b.score-a.score);
  return {G,L};
}
function championPool(D,p,role){
  const {G,L}=poolScores(D,p,role),top=L.slice(0,POOL.top);
  if(!top.length)return '<p class="empty">Aucun champion joué au moins '+POOL.min+' fois en '+roleName(role)+' cette saison.</p><div id="advice"></div><div id="blind"></div>';
  const max=top[0].score,share=o=>Math.round(100*o.n/G.length);
  const wrc=v=>v>=55?'var(--win)':v>=50?'var(--blue)':v>=45?'var(--gold)':'var(--red)';
  const kdc=v=>v>=4?'var(--win)':v>=3?'var(--blue)':v>=2?'var(--gold)':'var(--red)';
  const ring=v=>'<svg class="cp-ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" pathLength="100"/><circle cx="18" cy="18" r="15.9" pathLength="100" style="stroke:'+wrc(v)+'" stroke-dasharray="'+v.toFixed(1)+' 100"/></svg>';
  return '<section class="pool"><h2>Champion pool en '+roleName(role)+' <small>'+G.length+' parties · dossier + SoloQ + Flex de la saison</small></h2>'+
    '<div class="pool-grid">'+top.map((o,i)=>'<article class="cp'+(i===0?' main':'')+'">'+
      '<div class="cp-art" style="background-image:url(\'https://ddragon.leagueoflegends.com/cdn/img/champion/loading/'+encodeURIComponent(champId(o.c))+'_0.jpg\')"><span class="cp-rank">#'+(i+1)+'</span>'+(i===0?'<span class="cp-tag">Main</span>':'')+'</div>'+
      '<div class="cp-body"><h3>'+champLink(o.c,role,esc(NAMES[o.c]||o.c))+'</h3>'+
      '<div class="cp-stats">'+
        '<div><b>'+o.n+'</b><small>parties · '+share(o)+' % du rôle</small></div>'+
        '<div class="cp-wr">'+ring(o.wr)+'<span><b style="color:'+wrc(o.wr)+'">'+num(o.wr)+' %</b><small>'+o.w+' V · '+(o.n-o.w)+' D</small></span></div>'+
        '<div><b style="color:'+kdc(o.kda)+'">'+num(o.kda,2)+' KDA</b><small>'+num(o.k,1)+' / '+num(o.d,1)+' / '+num(o.a,1)+'</small></div>'+
      '</div>'+
      '<div class="cp-score" title="Score '+num(o.score,2)+' · WR lissé '+num(o.liss,1)+' % · Perf ×'+num(o.perf,3)+'"><i style="width:'+Math.round(100*o.score/max)+'%"></i></div>'+
      '</div></article>').join('')+'</div>'+
    '<p class="legend">Classement par score : ln(1 + parties) × (WR lissé / 50 %)<sup>1,5</sup> × performance. Le WR lissé ajoute '+POOL.m+' parties fictives à 50 % pour neutraliser les petits échantillons ; la performance (KDA, KP, DPM, or/min, CS/min, écarts @15) est comparée à sa moyenne en '+roleName(role)+' et bornée entre ×0,85 et ×1,15. Minimum '+POOL.min+' parties. La barre dorée indique le score relatif au n°1 (survol pour le détail).</p></section><div id="advice"></div><div id="blind"></div>';
}

// ---------- champion pool conseillé (percentiles/data/pool_advice.json, généré par python pool_advice.py) ----------
let ADVICE;
const getAdvice=()=>ADVICE??=fetch('pool_advice.json').then(r=>r.ok?r.json():null).catch(()=>null);
// courbes de scaling (winrate par durée de partie, dernier patch lolalytics) de tous les champions d'une lane
const SCAL={};const getScaling=l=>SCAL[l]??=fetch('champion_api?scaling='+l).then(r=>r.ok?r.json():null).catch(()=>null);
const LANE_FR={top:'Top',jungle:'Jungle',middle:'Mid',bottom:'ADC',support:'Support'};
const ATERM={lane:'Matchup lane',out:'Matchups hors lane',syn:'Synergie globale',util:'Couverture synergies',mastery:'Maîtrise'};
// échelle divergente orange -> blanc -> vert
function divColor(v,lim){
  const st=[[-1,[211,84,0]],[-.5,[240,178,122]],[0,[247,247,242]],[.5,[127,209,179]],[1,[11,138,100]]];
  const t=Math.max(-1,Math.min(1,v/lim));
  for(let i=1;i<st.length;i++)if(t<=st[i][0]){const [a,ca]=st[i-1],[b,cb]=st[i],f=(t-a)/(b-a);
    return 'rgb('+ca.map((c,k)=>Math.round(c+(cb[k]-c)*f)).join(',')+')'}
  return 'rgb(11,138,100)';
}
function adviceBlock(host,D,p,role){
  if(!host)return;
  getAdvice().then(A=>{
    let P=A&&A.players&&A.players[p]&&A.players[p][role],RD=A&&A.roles&&A.roles[role];
    if(!P||!RD||!P.pools.length){host.remove();return}
    const P0=P,RD0=RD;
    // bans choisis sur la page : retirés des deux équipes, recalcul côté serveur (/pool_advice_api)
    const byName=(a,b)=>(NAMES[champId(a)]||a).localeCompare(NAMES[champId(b)]||b);
    const allChamps=[...new Set([...RD0.opps,...Object.keys(RD0.p_counter)])].sort(byName);
    // locks : en plus, tout champion des données Δ2 du rôle (hors méta : jamais proposé par la recherche, seulement s'il est imposé)
    const metaSet=new Set(allChamps),lockChamps=[...new Set([...allChamps,...(RD0.lockable||[])])].sort(byName);
    // locks : champions imposés (au départ les obligatoires automatiques, retirables) ; bans : retirés des deux équipes
    const autoLock=P0.must.map(m=>m.c),autoWhy={};P0.must.forEach(m=>autoWhy[m.c]=m.reason);
    // mode du blind pick : chance d'être contré « matchups seuls » ou « + synergies alliées » (défaut = pool_advice.json)
    const bm0=A.params.blind_mode||'matchups_synergies',BMODES=[['matchups_synergies','+ synergies alliées'],['matchups','Matchups seuls']];
    const bmName=m=>(BMODES.find(x=>x[0]===m)||[0,m])[1];
    let ban=[],lock=[...autoLock],appBan=[],appLock=[...autoLock],bm=bm0,appBm=bm0,busy=false,err='',focusK=null,quiet=false;
    const isDefault=(b,l,m)=>!b.length&&String(l)===String(autoLock)&&m===bm0;
    const {G}=poolScores(D,p,role),byC={};
    G.forEach(r=>{const o=byC[champId(r.champ)]??={n:0,w:0,k:0,d:0,a:0};o.n++;o.w+=r.win?1:0;o.k+=r.k;o.d+=r.d;o.a+=r.a});
    let must={};const setMust=()=>{must={};P.must.forEach(m=>must[m.c]=m.reason)};setMust();
    const X=A.params.top_x,nm=c=>esc(NAMES[champId(c)]||c);
    const wrc=v=>v>=55?'var(--win)':v>=50?'var(--blue)':v>=45?'var(--gold)':'var(--red)';
    const pcc=v=>v<.3?'var(--win)':v<.5?'var(--gold)':'var(--red)';
    // pool détecté (champion pool actuel du joueur) en tête de liste, pour comparer sa couverture : ce n'est pas un conseil
    const LIST=()=>(P.start&&P.start.z?[{...P.start,detected:true}]:[]).concat(P.pools),off=()=>LIST().length-P.pools.length;
    const sel0=()=>off();   // sélection par défaut : le pool conseillé n°1
    const ptitle=(q,i)=>q.detected?'Pool détecté':'Pool conseillé #'+(i+1-off());
    let sel=sel0();
    const icon=(c,x,y,s,extra)=>'<image href="https://ddragon.leagueoflegends.com/cdn/'+VER+'/img/champion/'+encodeURIComponent(champId(c))+'.png" x="'+x+'" y="'+y+'" width="'+s+'" height="'+s+'"'+(extra||'')+'><title>'+nm(c)+'</title></image>';
    const cards=pool=>'<div class="pool-grid">'+pool.champs.map(c=>{
      const o=byC[champId(c)],isMain=c===pool.main,isBlind=c===pool.blind,pc=RD.p_counter[c];
      return '<article class="cp'+(isMain?' main':isBlind?' blindp':'')+'">'+
        '<div class="cp-art" style="background-image:url(\'https://ddragon.leagueoflegends.com/cdn/img/champion/loading/'+encodeURIComponent(champId(c))+'_0.jpg\')">'+
        (must[c]?'<span class="cp-rank" title="Obligatoire ('+esc(must[c])+')">★</span>':'')+
        '<span class="cp-tags">'+(isMain?'<span class="cp-tag">Main</span>':'')+(isBlind?'<span class="cp-tag blind">Blind pick</span>':'')+'</span></div>'+
        '<div class="cp-body"><h3>'+champLink(c,role,nm(c))+'</h3><div class="cp-stats">'+
        (o?'<div><b>'+o.n+'</b><small>parties en '+roleName(role)+'</small></div>'+
           '<div><b style="color:'+wrc(100*o.w/o.n)+'">'+num(100*o.w/o.n)+' %</b><small>'+o.w+' V · '+(o.n-o.w)+' D · '+num((o.k+o.a)/Math.max(1,o.d),2)+' KDA</small></div>'
          :'<div><b class="cp-new">À apprendre</b><small>jamais joué en '+roleName(role)+'</small></div>')+
        '<div><b style="color:'+pcc(pc)+'">'+(pc==null?'–':num(100*pc)+' %')+'</b><small>chance d’être contré'+(pc<.3?' · très bon blind':pc<.5?' · blind correct':'')+'</small></div>'+
        (must[c]?'<div><small>Obligatoire : '+esc(must[c])+'</small></div>':'')+
        '</div></div></article>'}).join('')+'</div>';
    const graph=pool=>{
      const champs=pool.champs.filter(c=>RD.d2[c]),k=champs.length,opps=RD.opps;
      const rows=champs.map(c=>RD.d2[c]);
      const cover=opps.map((_,j)=>{const v=rows.map(r=>r[j]).filter(x=>x!=null).sort((a,b)=>b-a).slice(0,X);return v.length?v.reduce((a,b)=>a+b,0)/v.length:0});
      const ord=opps.map((_,j)=>j).sort((a,b)=>cover[b]-cover[a]);
      const all=rows.flat().filter(x=>x!=null).map(Math.abs).sort((a,b)=>a-b);
      const lim=Math.max(2.5,all[Math.floor(all.length*.95)]||0);
      const cw=40,L=220,n=ord.length,W=L+n*cw+80,yPR=10,hPR=110,yCV=yPR+hPR+18,hCV=150,yHM=yCV+hCV+18,ch=38,yIC=yHM+k*ch+12,H=yIC+cw+110;
      const maxPR=Math.max(...RD.pr),cvMax=Math.max(lim*.6,...cover.map(Math.abs));
      const cy=v=>yCV+hCV/2-(v/cvMax)*(hCV/2);
      let s='<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" class="adv-svg" role="img" aria-label="Couverture des matchups du pool conseillé">';
      s+='<text x="'+(L-10)+'" y="'+(yPR+hPR/2+4)+'" class="al" text-anchor="end">Pick rate %</text>';
      s+='<text x="'+(L-10)+'" y="'+(yCV+hCV/2+4)+'" class="al" text-anchor="end">Couverture top-'+X+'</text>';
      s+='<line x1="'+L+'" x2="'+(L+n*cw)+'" y1="'+cy(0)+'" y2="'+cy(0)+'" class="ax"/>';
      ord.forEach((j,c)=>{const x=L+c*cw,o=opps[j],pr=RD.pr[j],v=cover[j],hp=hPR*pr/maxPR;
        s+='<rect x="'+(x+3)+'" y="'+(yPR+hPR-hp).toFixed(1)+'" width="'+(cw-6)+'" height="'+hp.toFixed(1)+'" class="apr"><title>'+esc(o)+' · '+num(pr,2)+' %</title></rect>';
        s+='<rect x="'+(x+3)+'" y="'+Math.min(cy(v),cy(0)).toFixed(1)+'" width="'+(cw-6)+'" height="'+Math.abs(cy(v)-cy(0)).toFixed(1)+'" fill="'+divColor(v,lim)+'" class="acv"><title>'+esc(o)+' · top-'+X+' '+num(v,2,1)+'</title></rect>';
        champs.forEach((ch_,i)=>{const d=rows[i][j],y=yHM+i*ch;
          s+=d==null?'<rect x="'+(x+1)+'" y="'+(y+1)+'" width="'+(cw-2)+'" height="'+(ch-2)+'" class="ana"><title>Même champion : impossible en draft</title></rect><text x="'+(x+cw/2)+'" y="'+(y+ch/2+4)+'" class="at amute" text-anchor="middle">—</text>'
            :'<rect x="'+(x+1)+'" y="'+(y+1)+'" width="'+(cw-2)+'" height="'+(ch-2)+'" fill="'+divColor(d,lim)+'"><title>'+nm(ch_)+' vs '+esc(o)+' : '+num(d,1,1)+' pts</title></rect><text x="'+(x+cw/2)+'" y="'+(y+ch/2+4)+'" class="at" text-anchor="middle" fill="'+(Math.abs(d)>lim*.6?'#fff':'#222')+'">'+num(d,1,1)+'</text>'});
        const weak=v<0;
        s+=icon(o,x+2,yIC,cw-4,' clip-path="url(#aclip)"')+(weak?'<rect x="'+(x+1)+'" y="'+(yIC-1)+'" width="'+(cw-2)+'" height="'+(cw-2)+'" class="awk"/>':'');
        s+='<text transform="translate('+(x+cw/2+5)+','+(yIC+cw+6)+') rotate(-90)" text-anchor="end" class="an'+(weak?' aw':'')+'">'+esc(o)+'</text>'});
      champs.forEach((c,i)=>{const y=yHM+i*ch;
        s+=icon(c,L-ch-2,y+1,ch-2);
        s+='<text x="'+(L-ch-10)+'" y="'+(y+ch/2+5)+'" text-anchor="end" class="ar">'+(must[c]?'★ ':'')+nm(c)+' <tspan class="amute">'+(RD.p_counter[c]==null?'–':num(100*RD.p_counter[c])+' %')+'</tspan></text>'});
      // légende de couleur
      const gx=L+n*cw+18;
      [-lim,-lim/2,0,lim/2,lim].forEach((v,i)=>{s+='<rect x="'+gx+'" y="'+(yHM+i*(k*ch/5))+'" width="16" height="'+(k*ch/5)+'" fill="'+divColor(-v,lim)+'"/>'});
      s+='<text x="'+(gx+20)+'" y="'+(yHM+10)+'" class="al">+'+num(lim,1)+'</text><text x="'+(gx+16)+'" y="'+(yHM+k*ch)+'" class="al">−'+num(lim,1)+'</text><text x="'+gx+'" y="'+(yHM-4)+'" class="al">Δ pts</text>';
      return s+'<defs><clipPath id="aclip" clipPathUnits="objectBoundingBox"><rect width="1" height="1" rx=".12"/></clipPath></defs></svg>';
    };
    // bans : les 3 adversaires de la même lane qui menacent le plus le pool, pondérés par leur pick rate
    const BREASON={blind:['Counter du blind','rb'],global:['Counter global','rg'],both:['Blind + global','rbg']};
    const banTip=(b,blind)=>'<span class="tip" role="tooltip"><b>'+nm(b.c)+'</b> · '+roleName(role)+' · '+num(b.pr,1)+' % de pick<br>'+
      (b.reason==='global'?'Le pool répond mal à ce champion : même avec ses '+b.best.length+' meilleures réponses, la couverture reste faible.'
        :'Contre ton blind pick <b>'+nm(blind)+'</b>, pické en premier et donc exposé au counter-pick.')+
      '<br><span class="tl">Contre '+nm(blind)+' (blind)</span> '+(b.blind_d2==null?'–':'<b style="color:'+(b.blind_d2<0?'var(--red)':'var(--win)')+'">'+num(b.blind_d2,1,1)+' pts</b>')+
      '<br><span class="tl">Meilleures réponses</span> '+b.best.map(([c,d])=>nm(c)+' <b style="color:'+(d<0?'var(--red)':'var(--win)')+'">'+num(d,1,1)+'</b>').join(' · ')+
      '<br><span class="tl">Couverture top-'+X+'</span> <b>'+num(b.cover,1,1)+' pts</b>'+
      '<br><span class="tl">Menace</span> blind '+(b.t_blind==null?'–':num(b.t_blind,1))+' · globale '+num(b.t_global,1)+' <small>(pick rate × −Δ2)</small></span>';
    // bans : en priorité les counters du blind, puis les counters globaux (adversaires de la même lane)
    const bansBox=(title,champs,B)=>'<div class="adv-ban"><div class="adv-ban-h"><b>'+title+'</b><span>'+champs.map(c=>img(champId(c),20,1)).join('')+'</span></div>'+
      (B&&B.list&&B.list.length?'<small class="adv-ban-b">Blind : '+nm(B.blind)+' '+num(100*(RD.p_counter[B.blind]??1))+' %'+((RD.p_counter[B.blind]??1)>=A.params.blind_max_p?' · aucun vrai blind dans ce pool, c’est son champion le moins contrable':'')+'</small><ol>'+B.list.map(b=>{const [lab,cls]=BREASON[b.reason];
        return '<li tabindex="0" class="'+((b.reason==='global'&&b.t_global<=0)?'low':'')+'">'+img(champId(b.c),38,1)+
        '<span><b>'+champLink(b.c,role,nm(b.c))+' <em class="rs '+cls+'">'+lab+'</em></b><small>'+num(b.pr,1)+' % pick · '+(b.reason==='global'?'couverture <span style="color:'+(b.cover<0?'var(--red)':'var(--win)')+'">'+num(b.cover,1,1)+' pts</span>':'vs '+nm(B.blind)+' <span style="color:var(--red)">'+num(b.blind_d2,1,1)+' pts</span>')+'</small></span>'+banTip(b,B.blind)+'</li>'}).join('')+'</ol>'
        :'<p class="legend">Pas de champion pool actuel (aucun champion joué au moins '+POOL.min+' fois).</p>')+'</div>';
    // qui jouer : pour chaque adversaire de lane (trié par pick rate), les champions du pool placés selon leur Δ2 ; le n°1 est la réponse prioritaire
    const pickGuide=pool=>{
      const champs=pool.champs.filter(c=>RD.d2[c]),opps=RD.opps.map((o,j)=>({o,j,pr:RD.pr[j]})).sort((a,b)=>b.pr-a.pr);
      const vals=champs.flatMap(c=>RD.d2[c]).filter(v=>v!=null).map(Math.abs).sort((a,b)=>a-b);
      // échelle sur le max (et pas un percentile) : sinon les gros Δ2 débordent dans la colonne de droite
      const lim=Math.max(3,Math.ceil(vals[vals.length-1]||3));
      const L=230,AW=560,R=230,W=L+AW+R,rh=40,top=50,H=top+opps.length*rh+10,ic=28;
      const xv=v=>L+AW/2+(v/lim)*(AW/2-ic/2);
      let s='<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" class="adv-svg pg-svg" role="img" aria-label="Champion à jouer en priorité contre chaque adversaire">';
      for(let t=-lim;t<=lim;t++){const x=xv(t);s+='<line x1="'+x+'" x2="'+x+'" y1="'+(top-6)+'" y2="'+(H-6)+'" class="'+(t?'pgg':'pg0')+'"/>'+(t%Math.max(1,Math.round(lim/3))===0?'<text x="'+x+'" y="'+(top-12)+'" text-anchor="middle" class="al">'+(t>0?'+':t<0?'−':'')+Math.abs(t)+'</text>':'')}
      s+='<text x="'+(L+AW/2)+'" y="14" text-anchor="middle" class="al">Δ2 en lane (pts de winrate) — à droite = bon matchup pour toi</text>';
      s+='<text x="'+(L+AW+16)+'" y="'+(top-12)+'" class="al">À jouer en priorité</text>';
      opps.forEach(({o,j,pr},r)=>{
        const y=top+r*rh,cy=y+rh/2;
        if(r%2)s+='<rect x="0" y="'+y+'" width="'+W+'" height="'+rh+'" class="pgz"/>';
        s+=icon(o,8,cy-ic/2,ic)+'<text x="'+(8+ic+8)+'" y="'+(cy-1)+'" class="ar"><a href="'+champHref(o,role)+'" class="cplink">'+esc(o)+'</a></text><text x="'+(8+ic+8)+'" y="'+(cy+13)+'" class="al">'+num(pr,1)+' % pick</text>';
        const pts=champs.map(c=>({c,v:RD.d2[c][j]})).filter(p=>p.v!=null).sort((a,b)=>b.v-a.v);
        if(!pts.length)return;
        // icônes : du pire au meilleur pour que le n°1 soit dessiné au-dessus ; décalage vertical si elles se chevauchent
        const pos=pts.map(p=>({...p,x:xv(p.v)}));let last=-1e9,flip=1;
        [...pos].reverse().forEach((p,k)=>{p.dy=Math.abs(p.x-last)<ic*.8?(flip=-flip)*6:0;last=p.x;
          const best=p===pos[0],sz=best?ic+4:ic-4;
          s+='<g class="'+(best?'pgb':'pgo')+'">'+(best?'<rect x="'+(p.x-sz/2-2)+'" y="'+(cy+p.dy-sz/2-2)+'" width="'+(sz+4)+'" height="'+(sz+4)+'" rx="5" class="pgr" style="stroke:'+(p.v>=0?'var(--gold)':'#e67e22')+'"/>':'')+
            icon(p.c,p.x-sz/2,cy+p.dy-sz/2,sz).replace('</title>',' : '+num(p.v,1,1)+' pts contre '+esc(o)+'</title>')+'</g>'});
        const b=pos[0],b2=pos[1];
        s+=icon(b.c,L+AW+16,cy-ic/2,ic)+'<text x="'+(L+AW+16+ic+8)+'" y="'+(cy-1)+'" class="ar"><a href="'+champHref(b.c,role)+'" class="cplink">'+nm(b.c)+'</a> <tspan style="fill:'+(b.v>=0?'var(--win)':'#e67e22')+';font-weight:700">'+num(b.v,1,1)+'</tspan></text>'+
          '<text x="'+(L+AW+16+ic+8)+'" y="'+(cy+13)+'" class="al">'+(b.v<0?'aucune bonne réponse':b2?'puis '+nm(b2.c)+' '+num(b2.v,1,1):'')+'</text>';
      });
      return s+'</svg>';
    };
    // scaling : winrate par durée de partie de chaque champion du pool, face à la moyenne du rôle
    const SCOL=['--sc1','--sc2','--sc3','--sc4','--sc5','--sc6'];
    const scaling=(pool,S)=>{
      if(!S||!S.role||!S.role.length)return '<p class="legend">Courbes de scaling indisponibles (données du patch absentes ou serveur à redémarrer).</p>';
      const B=S.role.map(b=>b.game_length),RA=S.role.map(b=>b.winrate);
      const ser=pool.champs.map((c,k)=>({c,col:'var('+SCOL[k%SCOL.length]+')',v:S.champs[c]?B.map(g=>(S.champs[c].find(x=>x.game_length===g)||{}).winrate??null):null})).filter(o=>o.v);
      if(!ser.length)return '<p class="legend">Aucun champion du pool dans les données du patch '+esc(S.patch||'')+'.</p>';
      // indice de scaling : winrate des parties ≥ 30 min − winrate 15-25 min (0-15 exclu : remakes et FF)
      const avg=(v,ks)=>{const a=ks.map(i=>v[i]).filter(x=>x!=null);return a.length?a.reduce((x,y)=>x+y,0)/a.length:null};
      const early=B.map((g,i)=>/^(15|20)-/.test(g)?i:-1).filter(i=>i>=0),late=B.map((g,i)=>/^(30|35)-|\+$/.test(g)?i:-1).filter(i=>i>=0);
      ser.forEach(o=>{const e=avg(o.v,early),l=avg(o.v,late);o.slope=e==null||l==null?null:l-e});
      const vals=[...RA,...ser.flatMap(o=>o.v)].filter(v=>v!=null);
      const lo=Math.floor(Math.min(...vals)-1),hi=Math.ceil(Math.max(...vals)+1);
      const W=880,H=330,l=50,r=190,t=18,b=46,pw=W-l-r,cw=pw/B.length,X=i=>l+(i+.5)*cw,Y=v=>t+(hi-v)/(hi-lo)*(H-t-b),f=v=>v.toFixed(1);
      let s='<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" class="adv-svg sc-svg" role="img" aria-label="Winrate selon la durée de partie des champions du pool">';
      const step=hi-lo>12?4:hi-lo>6?2:1;
      for(let v=Math.ceil(lo/step)*step;v<=hi;v+=step)s+='<line x1="'+l+'" x2="'+(l+pw)+'" y1="'+f(Y(v))+'" y2="'+f(Y(v))+'" class="'+(v===50?'sc0':'scg')+'"/><text x="'+(l-8)+'" y="'+f(Y(v)+4)+'" text-anchor="end" class="al">'+v+' %</text>';
      B.forEach((g,i)=>s+='<text x="'+f(X(i))+'" y="'+(H-b+20)+'" text-anchor="middle" class="al">'+esc(g)+'</text>');
      s+='<text x="'+(l+pw/2)+'" y="'+(H-6)+'" text-anchor="middle" class="al">durée de partie (min)</text>';
      const pts=v=>v.map((y,i)=>y==null?null:f(X(i))+','+f(Y(y))).filter(Boolean).join(' ');
      s+='<polyline points="'+pts(RA)+'" class="scr"/>';
      ser.forEach(o=>{s+='<g class="scs" data-c="'+esc(o.c)+'"><polyline points="'+pts(o.v)+'" style="stroke:'+o.col+'" class="scl"/>'+
        o.v.map((y,i)=>y==null?'':'<circle cx="'+f(X(i))+'" cy="'+f(Y(y))+'" r="4" style="fill:'+o.col+'" class="scp"/>').join('')+'</g>'});
      // étiquettes de fin de ligne (icône + nom), écartées verticalement pour ne pas se chevaucher
      const lab=[...ser.map(o=>({o,y:Y(o.v[o.v.length-1]??RA[RA.length-1])})),{o:null,y:Y(RA[RA.length-1])}].sort((a,b)=>a.y-b.y),gap=24;
      lab.forEach((a,i)=>{a.ly=Math.max(a.y,i?lab[i-1].ly+gap:t+8)});
      for(let i=lab.length-1;i>=0;i--)lab[i].ly=Math.min(lab[i].ly,i<lab.length-1?lab[i+1].ly-gap:H-b-4);
      const xe=X(B.length-1),xl=l+pw+14;
      lab.forEach(a=>{s+='<line x1="'+f(xe+6)+'" y1="'+f(a.y)+'" x2="'+(xl-4)+'" y2="'+f(a.ly)+'" class="scc"/>';
        s+=a.o?'<g class="scs" data-c="'+esc(a.o.c)+'">'+icon(a.o.c,xl,f(a.ly-10),20)+'<text x="'+(xl+26)+'" y="'+f(a.ly+5)+'" class="an">'+nm(a.o.c)+'</text></g>'
          :'<text x="'+xl+'" y="'+f(a.ly+5)+'" class="al">moy. '+roleName(role)+'</text>'});
      // survol : une colonne par tranche de durée, avec toutes les valeurs
      B.forEach((g,i)=>{s+='<rect x="'+f(l+i*cw)+'" y="'+t+'" width="'+f(cw)+'" height="'+(H-t-b)+'" class="sch"><title>'+esc(g)+' min\nmoy. '+roleName(role)+' : '+num(RA[i],2)+' %'+
        ser.map(o=>'\n'+(NAMES[champId(o.c)]||o.c)+' : '+(o.v[i]==null?'–':num(o.v[i],2)+' % ('+num(o.v[i]-RA[i],1,1)+')')).join('')+'</title></rect>'});
      s+='</svg>';
      const lg='<div class="sc-leg">'+ser.map(o=>'<button type="button" data-c="'+esc(o.c)+'" title="Mettre en avant '+nm(o.c)+'"><i style="background:'+o.col+'"></i>'+img(champId(o.c),20,1)+nm(o.c)+
        '<small>'+(o.slope==null?'':'scaling <b style="color:'+(o.slope>=1?'var(--win)':o.slope<=-1?'var(--red)':'var(--mute)')+'">'+num(o.slope,1,1)+' pts</b>')+'</small></button>').join('')+
        '<span class="sc-key"><i></i>moyenne du rôle</span></div>';
      return s+lg;
    };
    const fillScaling=(h,pool)=>{
      getScaling(BROLE[role]).then(S=>{h.innerHTML=scaling(pool,S);const svg=h.querySelector('.sc-svg');if(!svg)return;
        h.querySelectorAll('.sc-leg button').forEach(b=>b.onclick=()=>{const on=!b.classList.contains('on');
          h.querySelectorAll('.sc-leg button').forEach(x=>x.classList.toggle('on',on&&x===b));
          svg.classList.toggle('focus',on);svg.querySelectorAll('.scs').forEach(g=>g.classList.toggle('on',on&&g.dataset.c===b.dataset.c))})});
    };
    const draw=()=>{
      const PL=LIST();if(!PL[sel])sel=sel0();
      const pool=PL[sel];
      BLIND_POOL={champs:pool.champs,label:pool.detected?'pool détecté':'pool conseillé #'+(sel+1-off()),mode:appBm};if(BLIND_REDRAW)BLIND_REDRAW();
      host.innerHTML='<section class="pool adv"><h2>Champion pool conseillé en '+roleName(role)+' <small>'+P.pools.length+' meilleurs pools · top-'+X+' · méta '+(A.params.meta_patches||[]).join(', ')+'</small></h2>'+
        '<div class="adv-banpick">'+
          [['lock','Champions lockés',lock],['ban','Champions bannis',ban]].map(([k,lab,list])=>'<div class="adv-row" data-k="'+k+'"><b>'+lab+'</b>'+
            '<span class="chips">'+(list.length?list.map(c=>'<span class="chip '+k+'"'+(k==='lock'&&autoWhy[c]?' title="Lock automatique : '+esc(autoWhy[c])+'"':'')+'>'+img(champId(c),20,1)+(k==='lock'&&autoWhy[c]?'★ ':'')+nm(c)+
              '<button type="button" data-rm="'+esc(c)+'" data-k="'+k+'" aria-label="Retirer '+nm(c)+'">×</button></span>').join(''):'<small>aucun</small>')+'</span>'+
            '<span class="adv-ac"><input placeholder="'+(k==='lock'?'Locker un champion…':'Bannir un champion…')+'" aria-label="'+lab+'" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="adv-ac-'+k+'" autocomplete="off"'+(busy?' disabled':'')+'>'+
            '<ul id="adv-ac-'+k+'" class="adv-ac-list" role="listbox" hidden></ul></span></div>').join('')+
          '<div class="adv-row adv-mode"><b>Blind pick</b><span class="chips">'+BMODES.map(([k,t])=>'<button type="button" data-bm="'+k+'" class="'+(k===bm?'on':'')+'"'+(busy?' disabled':'')+' title="Blind pick jugé sur la chance d’être contré '+(k==='matchups'?'par les adversaires seulement (alliés choisis ensemble, clash)':'par les adversaires et les anti-synergies alliées (soloQ)')+'">'+t+'</button>').join('')+'</span><span></span></div>'+
          '<div class="adv-actions">'+
            (!isDefault(appBan,appLock,appBm)?'<small class="adv-applied">Top recalculé'+(appBm!==bm0?' · blind : '+bmName(appBm).toLowerCase():'')+(String(appLock)!==String(autoLock)?' · lockés : '+(appLock.map(nm).join(', ')||'aucun'):'')+(appBan.length?' · sans '+appBan.map(nm).join(', '):'')+'</small>':'')+
            (err?'<small class="adv-err">'+esc(err)+'</small>':'')+
            (!isDefault(ban,lock,bm)||!isDefault(appBan,appLock,appBm)?'<button type="button" class="adv-reset"'+(busy?' disabled':'')+'>Réinitialiser</button>':'')+
            '<button type="button" class="adv-go"'+(busy||(String(ban)===String(appBan)&&String(lock)===String(appLock)&&bm===appBm)?' disabled':'')+'>'+(busy?'Calcul…':'Valider')+'</button>'+
          '</div></div>'+
        '<div class="adv-pick" role="tablist">'+PL.map((q,i)=>'<button role="tab" data-i="'+i+'" class="'+(i===sel?'on':'')+(q.detected?' det':'')+'" aria-selected="'+(i===sel)+'" title="'+(q.detected?'Ton champion pool actuel (pas un conseil)':ptitle(q,i))+'"><b>'+(q.detected?'Actuel':'#'+(i+1-off()))+'</b><span>'+q.champs.map(c=>img(champId(c),22,1)).join('')+'</span><small>'+num(q.z.total,2,1)+' σ</small></button>').join('')+'</div>'+
        (pool.detected?'<p class="adv-det"><b>Pool détecté — ce n’est pas un pool conseillé.</b> Ce sont les '+pool.champs.length+' champions que '+esc(p.split('#')[0])+' joue le plus en '+roleName(role)+' (champion pool ci-dessus), notés comme les pools conseillés pour comparer leur couverture.'+(pool.valid===false?' Il ne contient aucun blind correct (chance d’être contré &lt; '+num(100*A.params.blind_max_p)+' %) : un pool conseillé en exige un.':'')+'</p>':'')+
        cards(pool)+
        '<div class="adv-terms">'+Object.keys(ATERM).filter(t=>A.params.weights[role]?.[t]).map(t=>{const v=pool.z[t];return '<span title="poids '+num(A.params.weights[role][t],1)+'"><small>'+ATERM[t]+'</small><b style="color:'+(v>=0?'var(--win)':'var(--red)')+'">'+num(v,2,1)+' σ</b></span>'}).join('')+'<span><small>Total</small><b>'+num(pool.z.total,2,1)+' σ</b></span></div>'+
        '<h3 class="adv-sub">Top 5 bans <small>survole un ban pour le détail</small></h3><div class="adv-bans">'+bansBox(ptitle(pool,sel)+(pool.detected?' (pas un conseil)':''),pool.champs,pool.bans)+'</div>'+
        '<div class="cbody adv-graph"><div class="scroll">'+graph(pool)+'</div></div>'+
        '<h3 class="adv-sub">Qui jouer en priorité <small>pour chaque champion adverse en '+roleName(role)+', trié par pick rate</small></h3>'+
        '<div class="cbody adv-graph"><div class="scroll">'+pickGuide(pool)+'</div></div>'+
        '<h3 class="adv-sub">Courbes de scaling <small>winrate selon la durée de partie, dernier patch · clique un champion pour le mettre en avant</small></h3>'+
        '<div class="cbody adv-graph"><div class="scroll sc-host"><p class="legend">Chargement…</p></div></div>'+
        '<p class="legend">Pool calculé sur les données méta (matchups et synergies Δ2) autour des champions obligatoires de '+esc(p.split('#')[0])+' (★ : '+(P.must.map(m=>nm(m.c)+' – '+esc(m.reason)).join(', ')||'aucun')+'). '+
        'Chaque terme est exprimé en écarts-types par rapport à des pools aléatoires ; il faut au moins un blind correct (chance d’être contré &lt; '+num(100*A.params.blind_max_p)+' %). '+
        'Graphe : adversaires de lane triés par couverture (moyenne des '+X+' meilleures réponses du pool), Δ2 en points de winrate ; encadrés en orange, les adversaires mal couverts ; « — » = même champion, impossible en draft. Main = champion du pool le mieux maîtrisé. '+
        'Bans (adversaires de la même lane) : d’abord jusqu’à 3 counters du blind pick (Δ2 ≤ −1 pt contre lui, classés par pick rate × Δ2), puis les counters globaux (pick rate × couverture négative du pool) ; « Actuel » = pool détecté (champion pool classique ci-dessus), montré pour comparaison, pas comme un conseil.</p></section>';
      fillScaling(host.querySelector('.sc-host'),pool);
      host.querySelectorAll('.adv-pick button').forEach(b=>b.onclick=()=>{sel=+b.dataset.i;draw()});
      // complétion (image + nom, filtrée à la frappe) pour chaque ligne ; un clic ou Entrée ajoute le champion
      const label=c=>NAMES[champId(c)]||c;
      const lists={lock:()=>lock,ban:()=>ban};
      const addC=(k,c)=>{
        if(!c||lists[k]().includes(c))return;
        if(k==='lock'&&lock.length>=A.params.pool_size){err='Au plus '+A.params.pool_size+' champions lockés.';draw();return}
        if(k==='lock'){lock=[...lock,c];ban=ban.filter(x=>x!==c)}else{ban=[...ban,c];lock=lock.filter(x=>x!==c)}
        err='';focusK=k;draw();
      };
      host.querySelectorAll('.adv-row[data-k]').forEach(row=>{
        const k=row.dataset.k,inp=row.querySelector('input'),ul=row.querySelector('.adv-ac-list');
        let hits=[],hi=0;
        const render=()=>{
          const q=nz(inp.value);
          hits=(k==='lock'?lockChamps:allChamps).filter(c=>!lists[k]().includes(c)&&(!q||nz(label(c)).includes(q)||nz(c).includes(q)))
            .sort((a,b)=>(q?(nz(label(b)).startsWith(q)-nz(label(a)).startsWith(q)):0)||label(a).localeCompare(label(b)));
          hi=Math.min(hi,Math.max(0,hits.length-1));
          ul.innerHTML=hits.length?hits.map((c,i)=>'<li role="option" data-c="'+esc(c)+'" class="'+(i===hi?'on':'')+'" aria-selected="'+(i===hi)+'">'+img(champId(c),24,1)+'<span>'+esc(label(c))+'</span>'+
            (RD0.opps.includes(c)?'<small>'+num(RD0.pr[RD0.opps.indexOf(c)]??0,1)+' %</small>':!metaSet.has(c)?'<small title="Pas dans la méta du rôle : seulement si tu le lockes">hors méta</small>':'')+'</li>').join(''):'<li class="none">Aucun champion</li>';
          ul.hidden=false;inp.setAttribute('aria-expanded','true');
          const on=ul.querySelector('li.on');if(on)on.scrollIntoView({block:'nearest'});
        };
        const close=()=>{ul.hidden=true;inp.setAttribute('aria-expanded','false')};
        // après un ajout, le champ reprend le focus sans rouvrir la liste (elle recouvrirait la ligne du dessous)
        inp.onfocus=()=>{if(quiet){quiet=false;return}hi=0;render()};
        inp.onclick=()=>{if(ul.hidden){hi=0;render()}};
        inp.oninput=()=>{hi=0;render()};
        inp.onblur=()=>setTimeout(close,120);
        inp.onkeydown=e=>{
          if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(ul.hidden)return render();hi=(hi+(e.key==='ArrowDown'?1:-1)+hits.length)%Math.max(1,hits.length);render()}
          else if(e.key==='Enter'){e.preventDefault();if(hits[hi])addC(k,hits[hi])}
          else if(e.key==='Escape'){close()}};
        ul.onmousedown=e=>{const li=e.target.closest('li[data-c]');if(li){e.preventDefault();addC(k,li.dataset.c)}};
      });
      if(focusK){const f=host.querySelector('.adv-row[data-k="'+focusK+'"] input');focusK=null;if(f){quiet=true;f.focus()}}
      host.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{const c=b.dataset.rm;if(b.dataset.k==='lock')lock=lock.filter(x=>x!==c);else ban=ban.filter(x=>x!==c);err='';draw()});
      // changer le mode du blind pick relance tout de suite le calcul (avec les bans / locks en cours)
      host.querySelectorAll('[data-bm]').forEach(b=>b.onclick=()=>{if(b.dataset.bm===bm)return;bm=b.dataset.bm;err='';draw();host.querySelector('.adv-go').onclick()});
      const reset=host.querySelector('.adv-reset');
      if(reset)reset.onclick=()=>{ban=[];lock=[...autoLock];appBan=[];appLock=[...autoLock];bm=appBm=bm0;P=P0;RD=RD0;setMust();sel=sel0();err='';draw()};
      host.querySelector('.adv-go').onclick=async()=>{
        if(isDefault(ban,lock,bm)){P=P0;RD=RD0;appBan=[];appLock=[...autoLock];appBm=bm0;setMust();sel=sel0();err='';draw();return}
        busy=true;err='';draw();
        try{
          const r=await fetch('pool_advice_api?p='+encodeURIComponent(p)+'&r='+encodeURIComponent(role)+'&ban='+encodeURIComponent(ban.join(','))+'&lock='+encodeURIComponent(lock.join(','))+'&bm='+encodeURIComponent(bm));
          if(r.status===404)throw new Error('le serveur ne connaît pas encore /pool_advice_api, redémarre python serve.py');
          const j=await r.json().catch(()=>{throw new Error('réponse invalide du serveur ('+r.status+')')});if(!r.ok||j.error)throw new Error(j.error||r.status);
          if(!j.pools.length)throw new Error('aucun pool possible : il faut au moins un blind pick (chance d’être contré < '+num(100*A.params.blind_max_p)+' %) parmi les places libres ou les lockés');
          P=j;RD=j.role;appBan=[...ban];appLock=[...lock];appBm=bm;setMust();sel=sel0();
          if(j.locks_ignored&&j.locks_ignored.length)err='Lock ignoré (pas de données en '+roleName(role)+') : '+j.locks_ignored.join(', ');
        }catch(e){err='Recalcul impossible : '+(e.message||e)}
        busy=false;draw();
      };
    };
    draw();
  });
}

// ---------- blindabilité du pool (percentiles/data/blindability_data.json, notebook blindability_roles) ----------
// Beeswarm de tous les champions méta du rôle : P(au moins un counter dans les pools adverses / alliés).
// Les champions du pool du joueur sont mis en avant, les autres restent en transparence à l'arrière-plan.
const BROLE={TOP:'top',JUNGLE:'jungle',MIDDLE:'middle',BOTTOM:'bottom',UTILITY:'support'};
const BCOL={top:'#3b8eea',jungle:'#e8622c',middle:'#d99a0e',bottom:'#1fa774',support:'#e0517d'};
const BLAB={top:'TOP',jungle:'JUNGLE',middle:'MID',bottom:'BOT',support:'SUPPORT'};
let BLIND;
const getBlind=()=>BLIND??=fetch('blindability.json').then(r=>r.ok?r.json():null).catch(()=>null);
// positions x (px) de cercles de diamètre d sans chevauchement, au plus près de 0 (comme beeswarm_x du notebook)
function beeswarm(ys,d){
  const xs=new Array(ys.length).fill(0),placed=[];
  ys.map((y,i)=>[y,i]).sort((a,b)=>a[0]-b[0]).forEach(([y,i])=>{
    const forb=[];
    placed.forEach(([xj,yj])=>{const dy=Math.abs(y-yj);if(dy<d){const h=Math.sqrt(d*d-dy*dy);forb.push([xj-h,xj+h])}});
    const c=[0,...forb.flat()].sort((a,b)=>Math.abs(a)-Math.abs(b));
    xs[i]=c.find(v=>forb.every(([a,b])=>!(a+1e-6<v&&v<b-1e-6)))??0;
    placed.push([xs[i],y]);
  });
  return xs;
}
// pool affiché par le graphe de blindabilité : celui sélectionné dans le champion pool conseillé (adviceBlock),
// sinon le champion pool détecté. BLIND_REDRAW redessine le graphe quand la sélection change.
let BLIND_POOL=null,BLIND_REDRAW=null;
function blindChart(host,D,p,role){
  const rk=BROLE[role];if(!host||!rk)return;
  getBlind().then(B=>{
    const R=B&&B.roles&&B.roles[rk];if(!R){host.remove();return}
    const detected=poolScores(D,p,role).L.slice(0,POOL.top).map(o=>o.c);
    let mode='matchups_synergies',syncMode=null;
    const draw=()=>{
      if(!host.isConnected){BLIND_REDRAW=null;return}
      // suit le mode de blind pick choisi dans le champion pool conseillé (les boutons du graphe restent utilisables)
      if(BLIND_POOL&&BLIND_POOL.mode&&BLIND_POOL.mode!==syncMode){mode=syncMode=BLIND_POOL.mode}
      const cur=BLIND_POOL?BLIND_POOL.champs:detected,plabel=BLIND_POOL?BLIND_POOL.label:'champion pool',rank={};
      cur.forEach((c,i)=>rank[champId(c)]=i+1);
      const P=B.params||{},col=BCOL[rk],thr=P.counter_threshold??-2;
      const L=Object.entries(R).map(([n,v])=>({n,id:champId(n),v:100*(v['p_counter_'+mode]??0)})).sort((a,b)=>a.v-b.v);
      const mine=L.filter(o=>rank[o.id]).sort((a,b)=>rank[a.id]-rank[b.id]);
      const missing=cur.filter(c=>!L.some(x=>x.id===champId(c))).map(c=>esc(NAMES[champId(c)]||c));
      // géométrie (unités du viewBox)
      const W=960,H=540,top=14,bot=H-14,left=56,pw=W-left,yv=v=>top+(1-v/104)*(bot-top);
      const cx=left+pw*.36,half=pw*.29;
      let d=32,xs;
      for(;;){xs=beeswarm(L.map(o=>yv(o.v)),d*1.02);if(Math.max(...xs.map(Math.abs))+d/2<=half||d<12)break;d*=.92}
      const f=v=>v.toFixed(1);
      const icon=(o,x,y,s,cls,badge)=>{const ring=Math.max(1.5,s*.07),inn=s-2*ring,im=inn/.88;
        return '<g class="'+cls+'"><title>'+esc(NAMES[o.id]||o.n)+' — '+num(o.v)+' %</title>'+
          '<circle cx="'+f(x)+'" cy="'+f(y)+'" r="'+f(s/2)+'" fill="'+col+'"/>'+
          '<circle cx="'+f(x)+'" cy="'+f(y)+'" r="'+f(inn/2)+'" fill="var(--line)"/>'+
          '<image href="https://ddragon.leagueoflegends.com/cdn/'+VER+'/img/champion/'+encodeURIComponent(o.id)+'.png" x="'+f(x-im/2)+'" y="'+f(y-im/2)+'" width="'+f(im)+'" height="'+f(im)+'" clip-path="url(#bclip)"/>'+
          (badge?'<circle cx="'+f(x+s*.36)+'" cy="'+f(y+s*.36)+'" r="9" fill="var(--gold)"/><text x="'+f(x+s*.36)+'" y="'+f(y+s*.36+4)+'" text-anchor="middle" class="bb">'+badge+'</text>':'')+'</g>'};
      let svg='<svg viewBox="0 0 '+W+' '+H+'" class="blind-svg" role="img" aria-label="Probabilité d’être contré par champion en '+roleName(role)+'"><defs><clipPath id="bclip" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".44"/></clipPath></defs>';
      [0,25,50,75,100].forEach(t=>svg+='<line x1="'+left+'" x2="'+W+'" y1="'+f(yv(t))+'" y2="'+f(yv(t))+'" class="bg"/><text x="'+(left-8)+'" y="'+f(yv(t)+4)+'" text-anchor="end" class="bt">'+t+' %</text>');
      // champions non retenus en arrière-plan, puis ceux du pool par-dessus
      L.forEach((o,i)=>{if(!rank[o.id])svg+=icon(o,cx+xs[i],yv(o.v),d,'bo')});
      const avg=L.reduce((a,o)=>a+o.v,0)/L.length,hw=Math.max(Math.max(...xs.map(Math.abs))+d*.7,3*d);
      svg+='<line x1="'+f(cx-hw)+'" x2="'+f(cx+hw)+'" y1="'+f(yv(avg))+'" y2="'+f(yv(avg))+'" class="bm"/><text x="'+f(cx-hw-8)+'" y="'+f(yv(avg)+4)+'" text-anchor="end" class="bl">moy. rôle '+num(avg)+' %</text>';
      if(mine.length){
        const pavg=mine.reduce((a,o)=>a+o.v,0)/mine.length,close=Math.abs(yv(pavg)-yv(avg))<14;
        svg+='<line x1="'+f(cx-hw)+'" x2="'+f(cx+hw)+'" y1="'+f(yv(pavg))+'" y2="'+f(yv(pavg))+'" class="bp"/><text x="'+f(cx-hw-8)+'" y="'+f(yv(pavg)+(close?(pavg<avg?-8:16):4))+'" text-anchor="end" class="bl bpl">moy. pool '+num(pavg)+' %</text>';
        mine.slice().reverse().forEach(o=>{const i=L.indexOf(o);svg+=icon(o,cx+xs[i],yv(o.v),d*1.3,'bi',rank[o.id])});
        // crochet entre le meilleur et le pire blind du pool
        const lo=mine.reduce((a,o)=>o.v<a.v?o:a),hi=mine.reduce((a,o)=>o.v>a.v?o:a),bx=cx+hw+26,big=Math.min(56,d*1.7);
        let yh=yv(hi.v),yl=yv(lo.v);
        if(yl-yh<big+6){const m=(yh+yl)/2;yh=m-(big+6)/2;yl=m+(big+6)/2}
        svg+='<path d="M'+f(bx-9)+' '+f(yv(hi.v))+'H'+f(bx)+'V'+f(yv(lo.v))+'H'+f(bx-9)+'" class="bk" style="stroke:'+col+'"/>';
        if(lo!==hi)svg+='<text x="'+f(bx+14)+'" y="'+f((yv(lo.v)+yv(hi.v))/2+9)+'" class="bd" style="fill:'+col+'">'+num(hi.v-lo.v)+' %</text>';
        [[hi,yh],[lo,yl]].forEach(([o,y],k)=>{if(k&&lo===hi)return;const x=bx+100+big/2;
          svg+=icon(o,x,y,big,'bi')+'<text x="'+f(x+big/2+10)+'" y="'+f(y+5)+'" class="bn">'+esc(NAMES[o.id]||o.n)+'  '+num(o.v)+' %</text>'});
      }
      svg+='</svg>';
      const pools=Object.entries(P.pool_sizes||{}).map(([l,n])=>(BLAB[l]||l)+' '+n).join(', ');
      host.innerHTML='<section class="blind"><h2>Blindability <small class="blind-of">'+esc(plabel)+' : '+cur.map(c=>img(champId(c),20,1)).join('')+'</small></h2><div class="bar"><b>Chance d’un counter <span style="color:var(--blue)">'+num(thr,0,1).replace('-','−')+' %</span> '+(mode==='matchups'?'(toutes lanes)':'(toutes lanes + alliés)')+' — <span style="color:'+col+'">'+BLAB[rk]+'</span></b>'+
        [['matchups_synergies','+ synergies alliées'],['matchups','Matchups seuls']].map(([k,l])=>'<button data-m="'+k+'" class="'+(k===mode?'on':'')+'">'+l+'</button>').join('')+'</div>'+
        '<div class="cbody">'+svg+'</div>'+
        '<p class="legend">Probabilité qu’au moins un adversaire'+(mode==='matchups'?'':' (ou un allié)')+' ait dans son pool un champion qui fait perdre au moins '+Math.abs(thr)+' pts de winrate (sous la moyenne du champion). Plus c’est bas, plus le champion se blind pick facilement. '+
        'En couleur : les '+mine.length+' champions du '+esc(plabel)+' de '+esc(p.split('#')[0])+(BLIND_POOL?' (sélectionné dans le champion pool conseillé ci-dessus)':'')+' (numéro = rang dans le pool), le crochet relie son meilleur et son pire blind ; les autres champions du rôle sont en transparence. '+
        (missing.length?'Hors données (pick rate &lt; '+num(P.min_playrate??.5,1)+' % en '+roleName(role)+') : '+missing.join(', ')+'. ':'')+
        L.length+' champions · méta '+(P.meta_patches||[]).join(', ')+' · méthode '+esc(P.method||'')+' · pool : '+pools+'.</p></section>';
      host.querySelectorAll('button[data-m]').forEach(b=>b.onclick=()=>{mode=b.dataset.m;draw()});
    };
    BLIND_REDRAW=draw;
    draw();
  });
}

// ---------- graphiques de la page joueur ----------
// benchmarks.json : « Kill part. » et « Damage share » peuvent être en fraction (0.44) ou en % (44) ; le site travaille en %
function fixBench(B){
  const map = { kp: 'Kill part.', dmg_share: 'Damage share' };
  for(const role in B){
    const b=B[role]||{};
    Object.entries(map).forEach(([k,lbl])=>{
      const vals=[
        b.max&&b.max[k], b.max&&b.max[lbl],
        ...Object.values(b.ranks||{}).map(r=>r[k])
      ].filter(x=>x!=null);
      if(vals.length&&Math.max(...vals)<=1.5){
        ['min','max'].forEach(t=>{
          if(b[t]){
            if(b[t][k]!=null)b[t][k]*=100;
            if(b[t][lbl]!=null)b[t][lbl]*=100;
          }
        });
        Object.values(b.ranks||{}).forEach(r=>{if(r[k]!=null)r[k]*=100});
      }
    });
  }
  return B;
}
const SRC=[['soloq','SoloQ (saison)'],['flex','Flex (saison)'],['dossier','Parties du dossier']];
const srcRows=(D,p,role,k)=>k==='dossier'?D.rows.filter(r=>r.p===p&&r.pos===role):(((D.ranked||{})[p]||{})[k]?.rows||[]).filter(r=>r.pos===role);
// SoloQ / Flex : proposés seulement à partir de 10 parties de la saison à ce rôle. Dossier : aucun minimum.
function chartBlock(host,D,p,role,title,render){
  let src='dossier';
  const avail={};SRC.forEach(([k])=>{const n=srcRows(D,p,role,k).length;avail[k]={n,ok:k==='dossier'?n>0:n>=10}});
  const draw=()=>{
    const c=src!=='dossier'&&((D.ranked||{})[p]||{})[src];
    host.innerHTML='<div class="cblock"><div class="bar"><b>'+title+'</b>'+SRC.map(([k,l])=>'<button data-s="'+k+'" class="'+(k===src?'on':'')+'"'+(avail[k].ok?'':' disabled title="'+(k==='dossier'?'Aucune partie dans le dossier à ce rôle':'Moins de 10 parties cette saison à ce rôle (lance python ranked.py pour mettre à jour le cache)')+'"')+'>'+l+' ('+avail[k].n+')</button>').join('')+'</div><div class="cbody"></div>'+
      (c&&c.checked?'<small>Cache mis à jour le '+new Date(c.checked*1000).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})+' (python ranked.py pour actualiser).</small>':'')+'</div>';
    host.querySelectorAll('button[data-s]').forEach(b=>b.onclick=()=>{src=b.dataset.s;draw()});
    render(host.querySelector('.cbody'),srcRows(D,p,role,src),src);
  };
  if(!avail.dossier.ok){const f=SRC.find(([k])=>avail[k].ok);if(f)src=f[0]}
  draw();
}

const RS13=['kda','kp','fb_pct','solo_kills','dpm','dmg_per_gold','dmg_share','gpm','gold15','cs15','csd15','cspm','vspm'];
const RSTATS={BOTTOM:RS13,MIDDLE:RS13,TOP:RS13,UTILITY:['kda','kp','fb_pct','dpm','dmg_per_gold','dmg_share','gpm','gold15','vspm'],
  JUNGLE:['kda','kp','fb_pct','dpm','dmg_per_gold','dmg_share','gpm','gold15','cs15','csd15','cspm','vspm']};
const RLAB={kda:'KDA',kp:'Kill part.',fb_pct:'First Blood %',solo_kills:'Solo kills',dpm:'DPM',dmg_per_gold:'Dmg/gold',dmg_share:'Damage share',gpm:'Gold/min',gold15:'Gold @15',cs15:'CS @15',csd15:'CS diff @15',cspm:'CS/min',vspm:'Vision/min'};
const rdec=k=>['kda','dmg_per_gold','cspm','vspm','solo_kills'].includes(k)?2:0;
function mean(R,k){
  if(!R.length)return null;
  if(k==='kda'){const t=x=>R.reduce((a,r)=>a+r[x],0);return (t('k')+t('a'))/Math.max(1,t('d'))}
  const v=R.map(r=>r[k]).filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b)/v.length:null;
}
// bornes du radar : benchmarks.json si présent, sinon 10e–90e percentile des parties de tous les joueurs suivis
function bounds(D,role,src,k){
  const b=BENCH[role],lbl=RLAB[k];
  if(b&&b.min&&b.max&&b.min[lbl]!=null&&b.max[lbl]!=null)return[b.min[lbl],b.max[lbl],'benchmarks'];
  const v=[];D.tracked.forEach(q=>srcRows(D,q,role,src).forEach(r=>{if(r[k]!=null)v.push(r[k])}));v.sort((a,b)=>a-b);
  if(!v.length)return[0,1,'repli'];
  const lo=v[Math.floor(.1*(v.length-1))],hi=v[Math.ceil(.9*(v.length-1))];return hi>lo?[lo,hi,'repli']:[lo-1,hi+1,'repli'];
}



function radarRender(D,p,role){
  let cmp=[];
  return (host,R,src)=>{
    const keys=RSTATS[role];
    if(!keys){host.innerHTML='<p class="empty">Radar indisponible pour ce rôle.</p>';return}
    const others=D.tracked.filter(q=>q!==p&&srcRows(D,q,role,src).length);
    cmp=cmp.filter(q=>others.includes(q));
    const draw=()=>{
      const B=BENCH[role]||{},bd=keys.map(k=>bounds(D,role,src,k)),N=keys.length;
      const nm=(v,i)=>v==null||isNaN(v)?0:Math.min(1,Math.max(0,(v-bd[i][0])/(bd[i][1]-bd[i][0])));
      const series=[];
      [['Emerald','#2ecc71'],['Diamond','#3498db'],['Master+','#e67e22']].forEach(([n,c])=>{const v=B.ranks&&B.ranks[n];if(v)series.push({n:n+' average',c,dash:1,vals:keys.map(k=>v[k]??null)})});
      const pal=['#5b9bf0','#ef6b61','#a78bfa','#4cc58a','#e8a33d','#ec6fb0'];
      cmp.forEach((q,i)=>series.push({n:q.split('#')[0],c:pal[i%pal.length],fill:1,vals:keys.map(k=>mean(srcRows(D,q,role,src),k))}));
      series.push({n:p.split('#')[0],c:'var(--gold)',fill:1,main:1,vals:keys.map(k=>mean(R,k))});
      const W=760,H=520,cx=270,cy=265,rad=170,ang=i=>-Math.PI/2+2*Math.PI*i/N,pt=(i,v)=>[cx+rad*v*Math.cos(ang(i)),cy+rad*v*Math.sin(ang(i))];
      let svg='';
      [.2,.4,.6,.8,1].forEach(f=>svg+='<polygon points="'+keys.map((_,i)=>pt(i,f).map(x=>x.toFixed(1)).join(',')).join(' ')+'" fill="none" stroke="var(--line)" stroke-dasharray="3 3"/>');
      keys.forEach((k,i)=>{
        const [x,y]=pt(i,1),c=Math.cos(ang(i)),[lx,ly]=pt(i,1.13),main=series[series.length-1].vals[i];
        svg+='<line x1="'+cx+'" y1="'+cy+'" x2="'+x.toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="var(--line)"/>'+
          '<text text-anchor="'+(c>.2?'start':c<-.2?'end':'middle')+'" font-size="12" fill="var(--ink)"><tspan x="'+lx.toFixed(1)+'" y="'+(ly+4).toFixed(1)+'">'+RLAB[k]+'</tspan><tspan x="'+lx.toFixed(1)+'" dy="14" fill="var(--gold)" font-size="11">'+(main==null?'–':num(main,rdec(k)))+'</tspan></text>';
      });
      series.forEach(s=>{
        const pts=s.vals.map((v,i)=>pt(i,nm(v,i)).map(x=>x.toFixed(1)).join(',')).join(' ');
        svg+='<polygon points="'+pts+'" fill="'+(s.fill?s.c:'none')+'" fill-opacity="'+(s.main?.18:.08)+'" stroke="'+s.c+'" stroke-width="'+(s.main?2.5:2)+'"'+(s.dash?' stroke-dasharray="6 4"':'')+'/>';
        if(!s.dash)s.vals.forEach((v,i)=>{const [x,y]=pt(i,nm(v,i));svg+='<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="3.5" fill="'+s.c+'"><title>'+esc(s.n)+' · '+RLAB[keys[i]]+' : '+(v==null?'–':num(v,rdec(keys[i])))+'</title></circle>'});
      });
      series.slice().reverse().forEach((s,i)=>svg+='<line x1="560" x2="590" y1="'+(40+i*24)+'" y2="'+(40+i*24)+'" stroke="'+s.c+'" stroke-width="2.5"'+(s.dash?' stroke-dasharray="6 4"':'')+'/><text x="598" y="'+(44+i*24)+'" font-size="12" fill="var(--ink)">'+esc(s.n)+'</text>');
      const nv=(v,i)=>v==null?'–':num(v,Math.abs(v)<10?2:0),rk=series.filter(x=>x.dash),mainS=series[series.length-1];
      const fall=keys.filter((_,i)=>bd[i][2]==='repli').map(k=>RLAB[k]);
      const missing=keys.filter((k,i)=>mainS.vals[i]==null).map(k=>RLAB[k]);
      const warn=(R.length&&R.some(r=>r.fb_pct===undefined)?'<p class="warn">⚠ Les données ne contiennent pas les nouvelles stats (Vision/min, First Blood %, Dmg/gold, Damage share, Gold @15) : remplace <code>stats.py</code> puis recharge la page.</p>':'')+
        (fall.length?'<p class="warn">⚠ Échelle de repli (min/max absents de <code>benchmarks.json</code> pour ce rôle) : '+fall.join(', ')+'.</p>':'')+
        (missing.length&&!(R.length&&R.some(r=>r.fb_pct===undefined))?'<p class="warn">⚠ Pas de valeur pour : '+missing.join(', ')+' (tracées à 0).</p>':'');
      const det='<details class="dtl"><summary>Détails de l’échelle du radar</summary><div class="scroll"><table><thead><tr><th>Stat</th><th>Min</th><th>Max</th><th>Source</th><th>'+esc(p.split('#')[0])+'</th>'+rk.map(x=>'<th>'+esc(x.n)+'</th>').join('')+'</tr></thead><tbody>'+
        keys.map((k,i)=>'<tr><td>'+RLAB[k]+'</td><td>'+nv(bd[i][0])+'</td><td>'+nv(bd[i][1])+'</td><td>'+bd[i][2]+'</td><td>'+nv(mainS.vals[i])+'</td>'+rk.map(x=>{const v=x.vals[i];return '<td>'+nv(v)+(v!=null&&(v<bd[i][0]||v>bd[i][1])?' ⚠':'')+'</td>'}).join('')+'</tr>').join('')+
        '</tbody></table></div><p class="legend">⚠ = la moyenne du rang sort de l’échelle min–max (point collé au centre ou au bord du radar).</p></details>';
      host.innerHTML=(others.length?'<div class="bar"><span>Comparer avec :</span>'+others.map(q=>'<button data-c="'+esc(q)+'" class="'+(cmp.includes(q)?'on':'')+'">'+esc(q.split('#')[0])+'</button>').join('')+'</div>':'')+
        '<div class="scroll"><svg class="chartsvg" viewBox="0 0 '+W+' '+H+'">'+svg+'</svg></div>'+
        '<p class="legend">'+esc(p.split('#')[0])+' – '+roleName(role)+' : '+R.length+' partie(s). Les chiffres dorés sont ses moyennes.'+(BENCH[role]?'':' Pas de <code>site/benchmarks.json</code> pour ce rôle : l’échelle du radar vient des parties des joueurs suivis et les moyennes Emerald / Diamond / Master+ ne sont pas affichées.')+'</p>'+warn+det;
      host.querySelectorAll('button[data-c]').forEach(b=>b.onclick=()=>{const q=b.dataset.c;cmp=cmp.includes(q)?cmp.filter(x=>x!==q):[...cmp,q];draw()});
    };
    draw();
  };
}

function scatterRender(p,role){
  let min=1;
  return (host,R,src)=>{
    const tot=R.length,m={};R.forEach(r=>(m[r.champ]??=[]).push(r));
    const all=Object.entries(m).map(([c,x])=>{const g=x.filter(r=>r.gd15!=null);return{c,n:x.length,wr:100*x.filter(r=>r.win).length/x.length,gd:g.length?g.reduce((a,r)=>a+r.gd15,0)/g.length:null,rate:100*x.length/tot}});
    const bind=()=>{const i=host.querySelector('#smin');if(i)i.onchange=()=>{min=Math.max(1,+i.value||1);draw()}};
    const draw=()=>{
      const L=all.filter(o=>o.n>=min&&o.gd!=null).sort((a,b)=>b.rate-a.rate);
      const head='<div class="bar"><label>Parties minimum par champion <input id="smin" type="number" min="1" value="'+min+'" style="width:64px"></label><span>'+tot+' parties</span></div>';
      const badges='<div class="bar" style="flex-wrap:wrap;gap:6px"><small>Champions :</small>'+
        L.map((o,i)=>'<button type="button" class="sc-badge" data-idx="'+i+'">'+esc(o.c)+' <small>('+o.n+')</small></button>').join('')+'</div>';
      
        if(!L.length){host.innerHTML=head+'<p class="empty">Aucun champion avec au moins '+min+' partie(s) et des stats @15.</p>';bind();return}
      const rmax=Math.max(...L.map(o=>o.rate)),size=r=>26+54*Math.sqrt(r/rmax);
      const xh=Math.min(50,Math.max(Math.max(...L.map(o=>Math.abs(o.wr-50)))*1.25,5));
      const yh=Math.max(Math.max(...L.map(o=>Math.abs(o.gd)))*1.25,100);
      const x0=72,x1=640,y0=16,y1=462;
      const X=v=>x0+Math.min(1,Math.max(0,(v-(50-xh))/(2*xh)))*(x1-x0);
      const Y=v=>y1-Math.min(1,Math.max(0,(v+yh)/(2*yh)))*(y1-y0);
      let s='';
      [-1,-.5,0,.5,1].forEach(f=>{
        const wv=Math.min(100,Math.max(0,Math.round(50+f*xh)));
        s+='<text x="'+X(wv).toFixed(1)+'" y="'+(y1+17)+'" text-anchor="middle" font-size="11" fill="var(--mute)">'+wv+' %</text>'+
           '<text x="'+(x0-8)+'" y="'+(Y(f*yh)+4).toFixed(1)+'" text-anchor="end" font-size="11" fill="var(--mute)">'+num(f*yh,0,1)+'</text>';
      });
      s+='<line x1="'+X(50).toFixed(1)+'" x2="'+X(50).toFixed(1)+'" y1="'+y0+'" y2="'+y1+'" stroke="var(--mute)"/><line x1="'+x0+'" x2="'+x1+'" y1="'+Y(0).toFixed(1)+'" y2="'+Y(0).toFixed(1)+'" stroke="var(--mute)" stroke-dasharray="5 4"/>';
      L.forEach((o,i)=>{
        const cx=X(o.wr).toFixed(1),cy=Y(o.gd).toFixed(1),d=size(o.rate),rr=(d/2).toFixed(1);
        s+='<g class="sc-pt" data-idx="'+i+'"><title>'+esc(o.c)+' : '+o.n+' partie(s), winrate '+num(o.wr)+' %, écart d’or @15 '+num(o.gd,0,1)+', playrate '+num(o.rate,1)+' %</title><clipPath id="sc'+i+'"><circle cx="'+cx+'" cy="'+cy+'" r="'+rr+'"/></clipPath>'+
          '<circle cx="'+cx+'" cy="'+cy+'" r="'+rr+'" fill="var(--line)"/><image href="https://ddragon.leagueoflegends.com/cdn/'+VER+'/img/champion/'+encodeURIComponent(o.c)+'.png" x="'+(cx-d/2).toFixed(1)+'" y="'+(cy-d/2).toFixed(1)+'" width="'+d.toFixed(1)+'" height="'+d.toFixed(1)+'" clip-path="url(#sc'+i+')" preserveAspectRatio="xMidYMid slice"/>'+
          '<circle cx="'+cx+'" cy="'+cy+'" r="'+rr+'" fill="none" stroke="var(--mute)" stroke-width="1.5"/><text x="'+cx+'" y="'+(+cy+d/2+12).toFixed(1)+'" text-anchor="middle" font-size="10" fill="var(--ink)">'+esc(o.c)+'</text></g>';
      });
      s+='<text x="730" y="26" text-anchor="middle" font-size="11" fill="var(--mute)">Playrate</text><text x="730" y="40" text-anchor="middle" font-size="11" fill="var(--mute)">sur le rôle</text>';
      let ly=56;
      [...new Set([1,.5,.2].map(f=>Math.max(1,Math.round(rmax*f))))].sort((a,b)=>b-a).forEach(v=>{
        const d=size(v);s+='<circle cx="730" cy="'+(ly+d/2).toFixed(1)+'" r="'+(d/2).toFixed(1)+'" fill="var(--line)" stroke="var(--mute)" stroke-width="1.5"/><text x="730" y="'+(ly+d+14).toFixed(1)+'" text-anchor="middle" font-size="11" fill="var(--ink)">'+v+' %</text>';ly+=d+34;
      });
      s+='<text x="'+((x0+x1)/2)+'" y="506" text-anchor="middle" font-size="12" fill="var(--mute)">← Perd plus qu’il ne gagne     Winrate du champion (%)     Gagne plus →</text>'+
         '<text transform="translate(16,'+((y0+y1)/2)+') rotate(-90)" text-anchor="middle" font-size="12" fill="var(--mute)">← Perd sa lane     Écart d’or @ 15 min     Gagne sa lane →</text>';
      host.innerHTML=head+badges+'<div class="scroll"><svg class="chartsvg" viewBox="0 0 800 520">'+s+'</svg></div><p class="legend">'+esc(p.split('#')[0])+' – '+roleName(role)+' : '+L.length+' champion(s), minimum '+min+' partie(s). Taille de l’icône = playrate du champion sur ce rôle. Survole une icône pour le détail.</p>';
      const pts=[...host.querySelectorAll('.sc-pt')];
      // Chrome/Brave : déplacer un nœud dans le DOM (appendChild) remet son style à zéro et annule
      // la transition CSS. On ne déplace donc l'élément qu'à l'entrée (pour le passer au premier plan),
      // on force le calcul du style à scale(1) AVANT d'ajouter .is-focus pour que l'agrandissement
      // soit animé, et on ne réordonne plus rien à la sortie pour que le rétrécissement le soit aussi.
      const focusIdx=idx=>{
        const target=pts.find(el=>+el.dataset.idx===idx);
        const parent=target?.parentNode;
        if(!parent)return;
        if(parent.lastElementChild!==target){
          parent.appendChild(target);
          void getComputedStyle(target).transform;
        }
        target.classList.add('is-focus');
      };
      const unfocusIdx=idx=>{
        const target=pts.find(el=>+el.dataset.idx===idx);
        if(target)target.classList.remove('is-focus');
      };
      pts.forEach(g=>{
        const idx=+g.dataset.idx;
        g.addEventListener('mouseenter',()=>focusIdx(idx));
        g.addEventListener('mouseleave',()=>unfocusIdx(idx));
      });
      host.querySelectorAll('.sc-badge').forEach(b=>{
        const idx=+b.dataset.idx;
        b.addEventListener('mouseenter',()=>focusIdx(idx));
        b.addEventListener('mouseleave',()=>unfocusIdx(idx));
      });
      bind();
    };
    draw();
  };
}

// ---------- fiche champion (méta : /champion_api, champion_meta.py) ----------
// Winrate et true winrate du dernier patch lolalytics, blindabilité, Δ2 multi-patchs des matchups et synergies.
const MLANES=['top','jungle','middle','bottom','support'];
const META_PR=.5;   // pick rate minimum (%) d'un adversaire / allié pour le filtre « méta »
const mApi=q=>fetch('champion_api?'+q).then(async r=>{
  if(r.status===404)throw new Error('le serveur ne connaît pas /champion_api : redémarre python serve.py');
  const j=await r.json().catch(()=>({error:'réponse invalide ('+r.status+')'}));if(!r.ok||j.error)throw new Error(j.error||r.status);return j});
function metaChampion(){
  const q=new URLSearchParams(location.search);
  let LIST=null,C=null,champ=q.get('c')||'',role=MLANES.includes(q.get('r'))?q.get('r'):'',kind='matchups',lane=null,metaOnly=true,sk='d2',sdir=1;
  const nm=c=>esc(NAMES[champId(c)]||c),ic=(c,s)=>img(champId(c),s,1);
  const link=(c,l)=>'champion.html?c='+encodeURIComponent(c)+'&r='+l;
  const pct=(v,d=1)=>v==null?'–':num(v,d)+' %';
  const d2c=v=>v<=-2?'var(--red)':v<0?'#e67e22':v<2?'var(--blue)':'var(--win)';
  const fail=e=>{app.innerHTML='<h1>Fiche champion</h1><p class="empty">Impossible de charger les données : '+esc(e.message||e)+'</p>'};
  const defLane=k=>k==='matchups'?C.role:C.role==='support'?'bottom':C.role==='bottom'?'support':C.role==='jungle'?'middle':'jungle';
  const load=(c,r)=>mApi('c='+encodeURIComponent(c)+'&r='+r).then(d=>{
    C=d;champ=d.champ;role=d.role;lane=defLane(kind);
    history.replaceState(null,'',link(champ,role));document.title=(NAMES[champId(champ)]||champ)+' – Fiche champion';draw();
  }).catch(fail);
  mApi('').then(L=>{LIST=L;
    if(!role)role='middle';
    if(!champ)champ=(L.roles[role].find(o=>o.d2)||L.roles[role][0]||{}).c||'';
    load(champ,role)}).catch(fail);

  // ---------- blocs ----------
  const tile=(t,v,sub,col)=>'<div class="st"><small>'+t+'</small><b'+(col?' style="color:'+col+'"':'')+'>'+v+'</b><small>'+sub+'</small></div>';
  const hero=()=>{
    const P=C.patch,B=C.blind,tier=P?.tier_wr;
    const wrCol=v=>v==null||tier==null?'':v>=tier+1?'var(--win)':v<=tier-1?'var(--red)':'';
    const pc=B?.p_counter_matchups_synergies,pm=B?.p_counter_matchups;
    const bcol=v=>v==null?'':v<.3?'var(--win)':v<.5?'var(--gold)':'var(--red)';
    const btier=v=>v==null?'':v<.3?'très bon blind':v<.5?'blind correct':'contre-pick';
    return '<section class="hero mhero"><div class="pic">'+ic(champ,112)+'</div><div class="hi"><div class="meta"><b>'+lname(role)+'</b>'+
      (P?'<span>Patch '+esc(P.patch)+'</span>'+(P.note?'<span>Tier '+esc(P.note)+'</span>':'')+(P.role_rank?'<span>Rang '+esc(P.role_rank)+'</span>':''):'<span>Pas de données de patch</span>')+'</div>'+
      '<h1>'+nm(champ)+'</h1>'+
      (C.roles.length>1?'<p>Aussi joué : '+C.roles.filter(l=>l!==role).map(l=>'<a class="ext" href="'+link(champ,l)+'" data-go="'+l+'">'+lname(l)+'</a>').join(' · ')+'</p>':'')+'</div>'+
      '<div class="stats">'+
      tile('Winrate',pct(P?.wr,2),P?num(P.games)+' parties · moy. '+pct(tier,2):'patch indisponible',wrCol(P?.wr))+
      tile('True winrate',pct(P?.true_wr,2),P?'ajusté · '+num(P.true_wr-P.wr,2,1)+' pts vs brut':'patch indisponible',wrCol(P?.true_wr))+
      tile('Pick / ban',P?num(P.pr,1)+' %':'–',P?'ban '+pct(P.br):'')+
      tile('Blindabilité',pc==null?'–':num(100*pc)+' %',pc==null?'hors méta (blindability)':btier(pc)+' · '+B.rank_matchups_synergies+'e / '+B.n_role,bcol(pc))+
      tile('Sans synergies',pm==null?'–':num(100*pm)+' %',pm==null?'':btier(pm)+' · '+B.rank_matchups+'e / '+B.n_role,bcol(pm))+
      '</div></section>';
  };
  const biasBox=()=>{
    const P=C.patch;if(!P)return '<p class="legend">Aucune donnée pour '+nm(champ)+' en '+lname(role)+' dans le fichier lolalytics du dernier patch : winrate et true winrate indisponibles.</p>';
    const chips=[...MLANES.map(l=>['vs '+lname(l),P.bias.matchups[l]]),...MLANES.filter(l=>l!==role).map(l=>['avec '+lname(l),P.bias.synergies[l]])];
    return '<details class="dtl mbias"><summary>Du winrate au true winrate : biais de sélection retirés ('+num(P.wr-P.true_wr,2,1)+' pts au total)</summary><div class="adv-terms">'+
      chips.map(([t,v])=>'<span><small>'+t+'</small><b style="color:'+(v>.05?'var(--red)':v<-.05?'var(--win)':'var(--mute)')+'">'+num(v,2,1)+'</b></span>').join('')+'</div>'+
      '<p class="legend">Biais d’un rôle = winrate brut − winrate repondéré par les pick rates du patch dans ce rôle. Positif : '+nm(champ)+' est plus souvent pris face à (ou avec) des champions qui l’arrangent qu’au hasard du méta. True winrate = brut − somme des biais.</p></details>';
  };
  const rows=k=>MLANES.flatMap(l=>(C[k][l]||[]).map(r=>({l,o:r[0],d:r[1],ci:r[2],pr:r[3],wr:r[4],g:r[5]})));
  const keep=r=>!metaOnly||(r.pr!=null&&r.pr>=META_PR);
  const topBox=(title,k,sign)=>{
    const L=rows(k).filter(keep).sort((a,b)=>sign*(a.d-b.d)).slice(0,5);
    return '<div class="adv-ban mtop"><div class="adv-ban-h"><b>'+title+'</b><small>'+(k==='matchups'?'tous rôles adverses':'tous rôles alliés')+'</small></div>'+
      (L.length?'<ol>'+L.map(r=>'<li>'+ic(r.o,38)+'<span><b><a class="pl" href="'+link(r.o,r.l)+'">'+nm(r.o)+'</a> <em class="rs mlane">'+lname(r.l)+'</em></b><small>'+
        (r.pr==null?'hors patch':num(r.pr,1)+' % pick')+(r.wr!=null?' · '+num(r.wr,1)+' % sur '+num(r.g)+' parties (patch)':'')+'</small></span><b class="mval" style="color:'+d2c(r.d)+'">'+num(r.d,1,1)+'<small>±'+num(r.ci,1)+'</small></b></li>').join('')+'</ol>'
        :'<p class="legend">Aucune donnée.</p>')+'</div>';
  };
  // nuage : icônes placées selon le Δ2, empilées sans chevauchement
  const strip=L=>{
    if(!L.length)return '<p class="empty">Aucun champion pour ce filtre.</p>';
    const abs=L.map(r=>Math.abs(r.d)).sort((a,b)=>a-b),lim=Math.max(4,Math.ceil(abs[Math.floor(.97*(abs.length-1))]));
    const W=960,pl=24,pr_=24,X=v=>pl+(Math.max(-lim,Math.min(lim,v))+lim)/(2*lim)*(W-pl-pr_);
    let d=34,off;for(;;){off=beeswarm(L.map(r=>X(r.d)),d*1.04);if(Math.max(...off.map(Math.abs))+d/2<=150||d<16)break;d*=.9}
    const half=Math.max(...off.map(Math.abs))+d/2+6,top=34,mid=top+half,H=mid+half+34,f=v=>v.toFixed(1);
    const w=L.reduce((a,r)=>a+(r.pr||0),0),mean=w?L.reduce((a,r)=>a+r.d*(r.pr||0),0)/w:null,thr=C.blind?.params?.counter_threshold??-2;
    let s='<svg viewBox="0 0 '+W+' '+H+'" class="mstrip" role="img" aria-label="Δ2 de '+nm(champ)+' '+(kind==='matchups'?'face aux':'avec les')+' '+lname(lane)+'">'+
      '<defs><clipPath id="mclip" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath></defs>'+
      '<rect x="'+pl+'" y="'+(top-6)+'" width="'+f(X(thr)-pl)+'" height="'+f(2*half+12)+'" class="mbad"/>';
    for(let t=-lim;t<=lim;t++){const x=X(t);s+='<line x1="'+f(x)+'" x2="'+f(x)+'" y1="'+(top-6)+'" y2="'+f(H-28)+'" class="'+(t?'mg':'m0')+'"/>'+
      (t%(lim>6?2:1)===0?'<text x="'+f(x)+'" y="'+f(H-10)+'" text-anchor="middle" class="ml">'+(t>0?'+':t<0?'−':'')+Math.abs(t)+'</text>':'')}
    s+='<text x="'+f(X(thr))+'" y="'+(top-12)+'" text-anchor="middle" class="ml mthr">seuil '+num(thr,0,1).replace('-','−')+'</text>';
    if(mean!=null)s+='<line x1="'+f(X(mean))+'" x2="'+f(X(mean))+'" y1="'+(top-6)+'" y2="'+f(H-28)+'" class="mmean"/><text x="'+f(X(mean))+'" y="16" text-anchor="middle" class="ml mmt">moy. pondérée '+num(mean,2,1)+'</text>';
    L.forEach((r,i)=>{const x=X(r.d),y=mid+off[i];
      s+='<a href="'+link(r.o,lane)+'"><g class="mpt"><title>'+nm(r.o)+' : '+num(r.d,2,1)+' ± '+num(r.ci,2)+' pts'+(r.pr!=null?' · '+num(r.pr,1)+' % pick':'')+(r.wr!=null?' · '+num(r.wr,1)+' % ('+num(r.g)+' parties, patch)':'')+'</title>'+
        '<circle cx="'+f(x)+'" cy="'+f(y)+'" r="'+f(d/2)+'" fill="'+d2c(r.d)+'"/>'+
        '<image href="https://ddragon.leagueoflegends.com/cdn/'+VER+'/img/champion/'+encodeURIComponent(champId(r.o))+'.png" x="'+f(x-d/2+2.5)+'" y="'+f(y-d/2+2.5)+'" width="'+f(d-5)+'" height="'+f(d-5)+'" clip-path="url(#mclip)"'+(r.pr!=null&&r.pr>=META_PR?'':' opacity=".45"')+'/></g></a>'});
    return s+'</svg>';
  };
  const table=L=>{
    if(!L.length)return '';
    const lim=Math.max(...L.map(r=>Math.abs(r.d)+r.ci),1),pos=v=>50+50*Math.max(-1,Math.min(1,v/lim));
    const S=[...L].sort((a,b)=>sk==='o'?sdir*nm(a.o).localeCompare(nm(b.o)):sdir*((a[sk]??-1e9)-(b[sk]??-1e9)));
    const th=(k,t)=>'<th class="s'+(k===sk?' cur':'')+'" data-k="'+k+'">'+t+(k===sk?(sdir>0?' ▴':' ▾'):'')+'</th>';
    return '<div class="scroll"><table class="mtab"><thead><tr>'+th('o',kind==='matchups'?'Adversaire':'Allié')+th('pr','Pick rate')+'<th class="mbarh">Δ2 (pts de winrate, multi-patchs)</th>'+th('d','Δ2')+th('wr','Winrate patch')+'</tr></thead><tbody>'+
      S.map(r=>{const a=pos(Math.min(0,r.d)),b=pos(Math.max(0,r.d));
        return '<tr class="'+(r.pr!=null&&r.pr>=META_PR?'':'moff')+'"><td><a class="cell pl" href="'+link(r.o,lane)+'">'+ic(r.o,26)+'<span>'+nm(r.o)+'</span></a></td><td>'+(r.pr==null?'–':num(r.pr,2)+' %')+'</td>'+
        '<td class="mbarc"><div class="mbar"><i style="left:'+a.toFixed(1)+'%;width:'+(b-a).toFixed(1)+'%;background:'+d2c(r.d)+'"></i><u style="left:'+pos(r.d-r.ci).toFixed(1)+'%;width:'+(pos(r.d+r.ci)-pos(r.d-r.ci)).toFixed(1)+'%"></u></div></td>'+
        '<td style="color:'+d2c(r.d)+';font-weight:700">'+num(r.d,2,1)+' <small>±'+num(r.ci,2)+'</small></td><td>'+(r.wr==null?'–':num(r.wr,1)+' % <small>'+num(r.g)+'</small>')+'</td></tr>'}).join('')+'</tbody></table></div>';
  };
  const explorer=()=>{
    const lanes=MLANES.filter(l=>kind==='matchups'||l!==role);
    if(!lanes.includes(lane))lane=defLane(kind);
    const all=(C[kind][lane]||[]).map(r=>({o:r[0],d:r[1],ci:r[2],pr:r[3],wr:r[4],g:r[5]})),L=all.filter(keep);
    return '<section class="mexp"><h2>Δ2 '+(kind==='matchups'?'des matchups':'des synergies')+'</h2><div class="bar">'+
      [['matchups','Matchups'],['synergies','Synergies']].map(([k,t])=>'<button data-kind="'+k+'" class="'+(k===kind?'on':'')+'">'+t+'</button>').join('')+
      '<span class="msep"></span>'+lanes.map(l=>'<button data-lane="'+l+'" class="'+(l===lane?'on':'')+'">'+(kind==='matchups'?'vs ':'avec ')+lname(l)+'</button>').join('')+
      '<label class="mchk"><input type="checkbox" id="mmeta"'+(metaOnly?' checked':'')+'> Méta uniquement (pick ≥ '+num(META_PR,1)+' %)</label><span>'+L.length+' / '+all.length+'</span></div>'+
      '<div class="cbody">'+strip(L)+'</div>'+table(L)+
      '<p class="legend">Δ2 = winrate réel de la paire − winrate attendu d’après les true winrates des deux champions, moyenné sur les patchs (± = intervalle à 95 %). '+
      (kind==='matchups'?'À droite : bon matchup pour '+nm(champ)+'. ':'À droite : bonne synergie. ')+'Zone rouge : sous le seuil de counter. Taille du méta : pick rate du patch '+esc(C.patch?.patch||'–')+' (icônes pâles = hors méta). Clic sur un champion : sa fiche.</p></section>';
  };

  // ---------- profil du patch : stats brutes, winrate par durée, base de joueurs ----------
  const RAW_FR={'Kills':'Kills','Deaths':'Morts','Assists':'Assists','Max Kill Spree':'Meilleure série','Gold':'Or','Minions Killed':'Sbires tués',
    'Jungle CS':'CS jungle','Total Damage':'Dégâts totaux','Physical Damage':'Dégâts physiques','Magic Damage':'Dégâts magiques','True Damage':'Dégâts bruts',
    'Damage Taken':'Dégâts subis','Healing':'Soins'};
  const rawBox=P=>{
    const R=P.raw_stats;if(!R)return '';const N=P.raw_n||1;
    const keys=Object.keys(RAW_FR).filter(k=>R[k]).concat(Object.keys(R).filter(k=>!RAW_FR[k]));
    return '<div class="mraw">'+keys.map(k=>{const [v,rk]=R[k],p=N>1?100*(N-rk)/(N-1):50;
      return '<div class="mrs" title="'+esc(k)+' : rang '+rk+' sur '+N+' en '+lname(role)+' (1 = valeur la plus élevée)"><small>'+esc(RAW_FR[k]||k)+'</small><b>'+num(v,v>=100?0:2)+'</b>'+
        '<span class="mrk"><i style="width:'+p.toFixed(0)+'%"></i></span><small>'+rk+'<sup>e</sup> / '+N+'</small></div>'}).join('')+'</div>';
  };
  const lengthBox=P=>{
    const L=P.wr_length||[];if(!L.length)return '<p class="legend">Pas de winrate par durée de partie.</p>';
    const RA={};(P.role_wr_length||[]).forEach(b=>RA[b.game_length]=b.winrate);
    const vals=[...L.map(b=>b.winrate),...Object.values(RA),P.wr].filter(v=>v!=null);
    const lo=Math.floor(Math.min(...vals)-1),hi=Math.ceil(Math.max(...vals)+1);
    const W=480,H=250,l=42,r=12,t=16,b=36,X=i=>l+(i+.5)*(W-l-r)/L.length,Y=v=>t+(hi-v)/(hi-lo)*(H-t-b),f=v=>v.toFixed(1);
    let s='<svg viewBox="0 0 '+W+' '+H+'" class="mlen" role="img" aria-label="Winrate selon la durée de partie">';
    const step=hi-lo>12?4:hi-lo>6?2:1;
    for(let v=Math.ceil(lo/step)*step;v<=hi;v+=step)s+='<line x1="'+l+'" x2="'+(W-r)+'" y1="'+f(Y(v))+'" y2="'+f(Y(v))+'" class="'+(v===50?'m0':'mg')+'"/><text x="'+(l-6)+'" y="'+f(Y(v)+4)+'" text-anchor="end" class="ml">'+v+' %</text>';
    const line=(pts,cls)=>'<polyline points="'+pts.map(([x,y])=>f(x)+','+f(y)).join(' ')+'" class="'+cls+'"/>';
    const ra=L.map((b,i)=>RA[b.game_length]==null?null:[X(i),Y(RA[b.game_length])]).filter(Boolean);
    if(ra.length)s+=line(ra,'mlr');
    s+=line(L.map((b,i)=>[X(i),Y(b.winrate)]),'mlc');
    L.forEach((b,i)=>{const d=RA[b.game_length];
      s+='<g><title>'+esc(b.game_length)+' min : '+num(b.winrate,2)+' %'+(d!=null?' (moy. du rôle '+num(d,2)+' %)':'')+'</title><circle cx="'+f(X(i))+'" cy="'+f(Y(b.winrate))+'" r="5" class="mlp" style="fill:'+(d==null?'var(--gold)':b.winrate>=d+1?'var(--win)':b.winrate<=d-1?'var(--red)':'var(--gold)')+'"/>'+
        '<text x="'+f(X(i))+'" y="'+f(Y(b.winrate)-10)+'" text-anchor="middle" class="mlv">'+num(b.winrate,1)+'</text>'+
        '<text x="'+f(X(i))+'" y="'+(H-14)+'" text-anchor="middle" class="ml">'+esc(b.game_length)+'</text></g>'});
    s+='<text x="'+((l+W-r)/2)+'" y="'+(H-1)+'" text-anchor="middle" class="ml">durée de partie (min)</text>';
    return s+'</svg><p class="legend"><span class="mkey mkc"></span>'+nm(champ)+' <span class="mkey mkr"></span>moyenne du rôle (pondérée par les parties). Point vert / rouge : au moins 1 pt au-dessus / en dessous de la moyenne du rôle.</p>';
  };
  const PBQ=(b,d)=>b>=1?(d>=1?['Populaire','beaucoup de joueurs, qui le jouent beaucoup']:['Large','beaucoup de joueurs, qui le jouent peu']):(d>=1?['Niche','peu de joueurs, mais fidèles']:['Impopulaire','peu de joueurs, qui le jouent peu']);
  const baseBox=P=>{
    const pb=P.playerbase,A=P.role_playerbase||[];if(!pb||!A.length)return '<p class="legend">Pas de données de base de joueurs.</p>';
    const bs=A.map(a=>a[1]).concat(pb.breadth),ds=A.map(a=>a[2]).concat(pb.depth),lg=Math.log;
    const span=(v,m)=>Math.max(Math.abs(lg(Math.min(...v))),Math.abs(lg(Math.max(...v))))*1.1||m;
    const sb=span(bs,1),sd=span(ds,.3),W=480,H=320,l=14,r=14,t=14,b=30;
    const X=v=>l+(lg(v)/sb+1)/2*(W-l-r),Y=v=>t+(1-lg(v)/sd)/2*(H-t-b),f=v=>v.toFixed(1);
    let s='<svg viewBox="0 0 '+W+' '+H+'" class="mpb" role="img" aria-label="Base de joueurs normalisée">';
    [['Niche',l+8,t+16,'start'],['Populaire',W-r-8,t+16,'end'],['Impopulaire',l+8,H-b-8,'start'],['Large',W-r-8,H-b-8,'end']].forEach(([q,x,y,a])=>
      s+='<text x="'+x+'" y="'+y+'" text-anchor="'+a+'" class="mq'+(q===PBQ(pb.breadth,pb.depth)[0]?' on':'')+'">'+q+'</text>');
    s+='<line x1="'+f(X(1))+'" x2="'+f(X(1))+'" y1="'+t+'" y2="'+(H-b)+'" class="m0"/><line x1="'+l+'" x2="'+(W-r)+'" y1="'+f(Y(1))+'" y2="'+f(Y(1))+'" class="m0"/>';
    A.filter(a=>a[0]!==champ).forEach(a=>s+='<a href="'+link(a[0],role)+'"><circle cx="'+f(X(a[1]))+'" cy="'+f(Y(a[2]))+'" r="'+f(3+Math.sqrt(a[3]||0)*1.6)+'" class="mpo"><title>'+nm(a[0])+' · breadth '+num(a[1],2)+' · depth '+num(a[2],2)+(a[3]!=null?' · '+num(a[3],1)+' % pick':'')+'</title></circle></a>');
    const x=X(pb.breadth),y=Y(pb.depth),d=34;
    s+='<circle cx="'+f(x)+'" cy="'+f(y)+'" r="'+(d/2+2)+'" fill="var(--gold)"/><image href="https://ddragon.leagueoflegends.com/cdn/'+VER+'/img/champion/'+encodeURIComponent(champId(champ))+'.png" x="'+f(x-d/2)+'" y="'+f(y-d/2)+'" width="'+d+'" height="'+d+'" clip-path="url(#mpclip)"><title>'+nm(champ)+'</title></image>';
    s+='<text x="'+((l+W-r)/2)+'" y="'+(H-8)+'" text-anchor="middle" class="ml">breadth (nombre de joueurs) →</text>'+
      '<text x="'+f(X(1)+6)+'" y="'+(t+36)+'" class="ml">↑ depth (parties par joueur)</text>';
    return s+'<defs><clipPath id="mpclip" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath></defs></svg>';
  };
  const profile=()=>{
    const P=C.patch;if(!P||!(P.raw_stats||P.wr_length||P.playerbase))return '';
    const q=P.playerbase?PBQ(P.playerbase.breadth,P.playerbase.depth):null;
    return '<section class="mprof"><h2>Profil du patch '+esc(P.patch)+' <small>données lolalytics, '+lname(role)+'</small></h2>'+
      (P.raw_stats?'<h3 class="adv-sub">Stats moyennes par partie <small>barre = position dans le rôle, du plus bas au plus haut</small></h3>'+rawBox(P):'')+
      '<div class="mcols"><div class="cbody"><h3 class="adv-sub">Winrate selon la durée de partie</h3>'+lengthBox(P)+'</div>'+
      '<div class="cbody"><h3 class="adv-sub">Base de joueurs normalisée'+(q?' <small>'+q[0]+'</small>':'')+'</h3>'+baseBox(P)+
      (q?'<p class="legend"><b>'+q[0]+'</b> : '+q[1]+' (breadth '+num(P.playerbase.breadth,2)+' · depth '+num(P.playerbase.depth,2)+'). Breadth = nombre de joueurs différents qui le jouent, depth = parties jouées par joueur ; 1 = moyenne, échelles logarithmiques. Points : les autres champions du rôle (taille = pick rate).</p>':'')+'</div></div></section>';
  };

  // ---------- rendu ----------
  const draw=()=>{
    document.querySelectorAll('.splash').forEach(e=>e.remove());
    document.body.insertAdjacentHTML('beforeend','<div class="splash"><img src="https://ddragon.leagueoflegends.com/cdn/img/champion/splash/'+encodeURIComponent(champId(champ))+'_0.jpg" alt="" onerror="this.parentNode.remove()"></div>');
    const opts=(LIST?.roles[role]||[]);
    app.innerHTML='<h1>Fiche champion</h1><div class="bar mpick"><label>Rôle <select id="mrole">'+MLANES.map(l=>'<option value="'+l+'"'+(l===role?' selected':'')+'>'+lname(l)+'</option>').join('')+'</select></label>'+
      '<span class="adv-ac"><input id="msearch" placeholder="Chercher un champion…" aria-label="Champion" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="mlist" autocomplete="off"><ul id="mlist" class="adv-ac-list" role="listbox" hidden></ul></span>'+
      '<small>'+opts.length+' champions en '+lname(role)+(LIST?.patch?' · patch '+esc(LIST.patch):'')+'</small></div>'+
      hero()+biasBox()+profile()+
      '<div class="adv-bans mtops">'+topBox('5 plus gros counters','matchups',1)+topBox('5 meilleures synergies','synergies',-1)+'</div>'+
      explorer();
    // navigation
    $('#mrole').onchange=e=>{const r=e.target.value,o=LIST.roles[r];load(o.some(x=>x.c===champ)?champ:(o.find(x=>x.d2)||o[0]).c,r)};
    app.querySelectorAll('[data-go]').forEach(a=>a.onclick=e=>{e.preventDefault();load(champ,a.dataset.go)});
    app.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{kind=b.dataset.kind;lane=defLane(kind);draw()});
    app.querySelectorAll('[data-lane]').forEach(b=>b.onclick=()=>{lane=b.dataset.lane;draw()});
    $('#mmeta').onchange=e=>{metaOnly=e.target.checked;draw()};
    app.querySelectorAll('.mtab th.s').forEach(th=>th.onclick=()=>{const k=th.dataset.k;if(k===sk)sdir=-sdir;else{sk=k;sdir=k==='pr'||k==='wr'?-1:1}draw()});
    // recherche : champions du rôle choisi (triés par pick rate), Entrée ou clic pour ouvrir
    const inp=$('#msearch'),ul=$('#mlist');let hits=[],hi=0;
    const render=()=>{const s=nz(inp.value);
      hits=opts.filter(o=>!s||nz(NAMES[champId(o.c)]||o.c).includes(s)||nz(o.c).includes(s)).slice(0,40);hi=Math.min(hi,Math.max(0,hits.length-1));
      ul.innerHTML=hits.length?hits.map((o,i)=>'<li role="option" data-c="'+esc(o.c)+'" class="'+(i===hi?'on':'')+'" aria-selected="'+(i===hi)+'">'+ic(o.c,24)+'<span>'+nm(o.c)+'</span><small>'+(o.pr==null?'–':num(o.pr,1)+' %')+'</small></li>').join(''):'<li class="none">Aucun champion</li>';
      ul.hidden=false;inp.setAttribute('aria-expanded','true');const on=ul.querySelector('li.on');if(on)on.scrollIntoView({block:'nearest'})};
    const close=()=>{ul.hidden=true;inp.setAttribute('aria-expanded','false')};
    inp.onfocus=()=>{hi=0;render()};inp.oninput=()=>{hi=0;render()};inp.onblur=()=>setTimeout(close,120);
    inp.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();hi=(hi+(e.key==='ArrowDown'?1:-1)+hits.length)%Math.max(1,hits.length);render()}
      else if(e.key==='Enter'){e.preventDefault();if(hits[hi])load(hits[hi].c,role)}else if(e.key==='Escape')close()};
    ul.onmousedown=e=>{const li=e.target.closest('li[data-c]');if(li){e.preventDefault();load(li.dataset.c,role)}};
  };
}
const lname=l=>LANE_FR[l]||l;
