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
[['index.html','Historique','h'],['players.html','Joueurs','p'],['champions.html','Champions','c'],['adversaires.html','Adversaires','a'],['records.html','Records','r']]
.map(x=>'<a href="'+x[0]+'" class="'+((document.body.dataset.page==='j'?'p':document.body.dataset.page)===x[2]?'on':'')+'">'+x[1]+'</a>').join('')+'</nav></header>');

Promise.all([
  fetch('data.json').then(r=>{if(!r.ok)throw 0;return r.json()}),
  fetch('https://ddragon.leagueoflegends.com/api/versions.json').then(r=>r.json()).then(v=>v[0]).catch(()=>null),
  fetch('benchmarks.json').then(r=>r.ok?r.json():null).catch(()=>null)
]).then(async([D,v,B])=>{BENCH=fixBench(B||{});if(v){VER=v;try{const j=await(await fetch('https://ddragon.leagueoflegends.com/cdn/'+v+'/data/en_US/champion.json')).json();for(const k in j.data)NAMES[k]=j.data[k].name}catch(_){}}D.roles=D.roles||{};D.rows=D.rows.filter(r=>{const R=D.roles[r.p];return !R||!R.length||R.includes(r.pos)});({j:player,a:opponents,h:history,p:players,c:champions,r:records})[document.body.dataset.page](D)})
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
    R.map(r=>'<tr><td>'+(r.pos==null?who(r.p):'<a class="pl" href="player.html?p='+encodeURIComponent(r.p)+'&r='+r.pos+'">'+who(r.p)+'</a>')+'</td><td>'+(r.pos==null?'–':roleName(r.pos))+'</td>'+cols.map(c=>{
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
function history(D){
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

function playerRecords(D,R){
  if(!R.length)return '';
  const best=(fn,filter=()=>true)=>{
    const L=R.filter(r=>filter(r)&&fn(r)!=null);
    return L.length?L.reduce((a,b)=>fn(b)>fn(a)?b:a):null;
  };
  const fmtDate=d=>d?new Date(d).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):'';
  const sub=r=>{
    if(!r)return '';
    const g=(D.games||[]).find(x=>x.id===r.game);
    const q=g?qn(g):'';
    return '<a class="rec-sub" href="index.html#'+esc(r.game)+'">'+img(r.champ,18,1)+'<span>'+esc(NAMES[r.champ]||r.champ)+(q?' · '+esc(q):'')+(r.date?' · '+fmtDate(r.date):'')+'</span></a>';
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
  const q=new URLSearchParams(location.search),p=q.get('p')||'',role=q.get('r')||'';
  const R=D.rows.filter(r=>r.p===p&&r.pos===role);
  if(!R.length){app.innerHTML='<p class="empty">Joueur introuvable. <a class="ext" href="players.html">Retour aux joueurs</a></p>';return}
  const o=summ(R),name=p.split('#')[0],w=R.filter(r=>r.win).length,dts=R.map(r=>r.date).filter(Boolean);
  const first=dts.length?new Date(Math.min(...dts)):null,last=dts.length?new Date(Math.max(...dts)):null;
  const t=k=>R.reduce((a,r)=>a+r[k],0),av=k=>num(t(k)/R.length,1);
  const others=[...new Set(D.rows.filter(r=>r.p===p&&r.pos!==role).map(r=>r.pos))];
  document.title=name+' – Archives de la Faille';
  const m={};R.forEach(r=>(m[r.champ]??=[]).push(r));
  const L=Object.entries(m).map(([c,x])=>({c,...summ(x)}));
  const cols=[['n','Parties',0],['wr','Victoires %',0],...S];
  const fav=D.champs&&D.champs[p];
  document.querySelectorAll('.splash').forEach(e=>e.remove());
  if(fav)document.body.insertAdjacentHTML('beforeend','<div class="splash"><img src="https://ddragon.leagueoflegends.com/cdn/img/champion/splash/'+encodeURIComponent(champId(fav))+'_0.jpg" alt="" onerror="this.parentNode.remove()"></div>');
  app.innerHTML='<p><a class="ext" href="players.html">← Joueurs</a></p>'+
  '<section class="hero"><div class="pic"><img class="ph" src="assets/players/'+encodeURIComponent(name)+'.png" alt="" onerror="this.onerror=null;this.src=\'assets/player.svg\'"><img class="tl" src="'+TEAM.logo+'" alt="'+TEAM.name+'"></div>'+
  '<div class="hi"><div class="meta">'+(last?'<b>'+last.getFullYear()+'</b>':'')+'<span>'+roleName(role)+'</span><span><img src="'+TEAM.logo+'" alt=""><b>'+TEAM.name+'</b></span><span>'+FR+' France</span></div>'+
  '<h1>'+esc(name)+'</h1><p>'+R.length+' parties avec '+TEAM.name+(first?' depuis '+first.toLocaleDateString('fr-FR',{month:'long',year:'numeric'}):'')+' · '+esc(p.slice(name.length))+'</p>'+
  (others.length?'<p style="margin-top:8px">Autres rôles : '+others.map(r=>'<a class="ext" href="player.html?p='+encodeURIComponent(p)+'&r='+r+'">'+roleName(r)+'</a>').join(' · ')+'</p>':'')+'</div>'+
  '<div class="stats"><div class="st"><small>Parties</small><b>'+R.length+'</b><small>'+w+' V · '+(R.length-w)+' D</small></div>'+
  '<div class="st"><small>Victoires</small><b>'+num(o.wr)+' %</b><small>'+w+' sur '+R.length+'</small></div>'+
  '<div class="st"><small>KDA</small><b>'+num(o.kda,2)+'</b><small>'+av('k')+' / '+av('d')+' / '+av('a')+'</small></div></div></section>'+
  emeraldBadges(D,p,role,R)+
  playerRecords(D,R)+
  '<div id="radar"></div><div id="scatter"></div><h2 style="margin:24px 0 10px">Champions joués en '+roleName(role)+'</h2><div id="ct"></div>'+
  '<p class="legend">Stats de '+esc(name)+' uniquement en '+roleName(role)+'. Clique sur un en-tête pour trier. Couleurs comparées entre ses champions.</p>';
  ctable($('#ct'),L,{key:'n',dir:-1},cols);
  chartBlock($('#radar'),D,p,role,'Radar',radarRender(D,p,role));
  chartBlock($('#scatter'),D,p,role,'Champions : winrate et écart d’or @15',scatterRender(p,role));
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
      const restore=()=>{
        const parent=pts[0]?.parentNode;
        if(!parent)return;
        [...pts].sort((a,b)=>+a.dataset.idx-+b.dataset.idx).forEach(el=>parent.appendChild(el));
      };
      const focusIdx=idx=>{
        const target=pts.find(el=>+el.dataset.idx===idx);
        if(!target||!target.parentNode)return;
        target.parentNode.appendChild(target);
        target.classList.add('is-focus');
      };
      const unfocusIdx=idx=>{
        const target=pts.find(el=>+el.dataset.idx===idx);
        if(target)target.classList.remove('is-focus');
        restore();
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