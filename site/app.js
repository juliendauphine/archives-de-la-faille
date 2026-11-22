const S=[['kda','KDA',2],['gd15','Écart d’or @15',0,1],['gpm','Or/min',0],['cs15','CS @15',0],['csd15','Écart CS @15',0,1],
['cspm','CS/min',2],['k15','Kills @15',2],['kp','Part. kills %',0],['dpm','Dégâts/min',0],['dpm15','Dégâts/min @15',0]];
const ROLES={TOP:'Top',JUNGLE:'Jungle',MIDDLE:'Mid',BOTTOM:'ADC',UTILITY:'Support'},RORD=['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'];
const QN={0:'Personnalisée',400:'Normale draft',420:'Classée solo/duo',430:'Normale blind',440:'Classée flex',450:'ARAM',700:'Clash',710:'5c5 ranked',1700:'Arena'};
const qn=g=>QN[g.queueId]||g.queue;
const roleName=p=>ROLES[p]||'Inconnu';
let VER='15.1.1';
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
[['index.html','Historique','h'],['players.html','Joueurs','p'],['champions.html','Champions','c'],['records.html','Records','r']]
.map(x=>'<a href="'+x[0]+'" class="'+((document.body.dataset.page==='j'?'p':document.body.dataset.page)===x[2]?'on':'')+'">'+x[1]+'</a>').join('')+'</nav></header>');
 
Promise.all([
  fetch('data.json').then(r=>{if(!r.ok)throw 0;return r.json()}),
  fetch('https://ddragon.leagueoflegends.com/api/versions.json').then(r=>r.json()).then(v=>v[0]).catch(()=>null)
]).then(async([D,v])=>{if(v){VER=v;try{const j=await(await fetch('https://ddragon.leagueoflegends.com/cdn/'+v+'/data/en_US/champion.json')).json();for(const k in j.data)NAMES[k]=j.data[k].name}catch(_){}}D.roles=D.roles||{};D.rows=D.rows.filter(r=>{const R=D.roles[r.p];return !R||!R.length||R.includes(r.pos)});({j:player,h:history,p:players,c:champions,r:records})[document.body.dataset.page](D)})
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
  const m=Math.max(1000,...g.gd.map(Math.abs)),n=g.gd.length-1||1,id='c'+g.id.replace(/\W/g,'');
  const pts=g.gd.map((v,i)=>(i/n*600).toFixed(1)+','+(60-v/m*52).toFixed(1)).join(' ');
  const area='0,60 '+pts+' 600,60';
  return '<div class="chart"><small>Avance en or (bleu au-dessus = blue side devant, rouge en dessous, max '+num(m)+')</small><svg viewBox="0 0 600 120" preserveAspectRatio="none"><defs><clipPath id="'+id+'u"><rect x="0" y="0" width="600" height="60"/></clipPath><clipPath id="'+id+'d"><rect x="0" y="60" width="600" height="60"/></clipPath></defs>'+
  '<polygon points="'+area+'" fill="var(--blue)" fill-opacity=".45" clip-path="url(#'+id+'u)"/><polygon points="'+area+'" fill="var(--red)" fill-opacity=".45" clip-path="url(#'+id+'d)"/>'+
  '<line x1="0" x2="600" y1="60" y2="60" stroke="var(--mute)" stroke-width="1" vector-effect="non-scaling-stroke"/><polyline fill="none" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" points="'+pts+'"/></svg></div>';
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
 
function champions(D){
  const cnt={};D.rows.forEach(r=>cnt[r.pos]=(cnt[r.pos]||0)+1);
  const oi=r=>RORD.indexOf(r)<0?9:RORD.indexOf(r);
  const roles=Object.keys(cnt).sort((a,b)=>oi(a)-oi(b));
  if(!roles.length){app.innerHTML='<p class="empty">Aucune donnée pour l’instant.</p>';return}
  let role=[...roles].sort((a,b)=>cnt[b]-cnt[a])[0],pl='',key='n',dir=-1,min=1;
  const cols=[['n','Parties',0],['wr','Victoires %',0],...S];
  const draw=()=>{
    const PL=D.tracked.filter(t=>{const R=D.roles[t];return !R||!R.length||R.includes(role)});
    if(pl&&!PL.includes(pl))pl='';
    const m={};D.rows.filter(r=>r.pos===role&&(!pl||r.p===pl)).forEach(r=>(m[r.champ]??=[]).push(r));
    const L=Object.entries(m).map(([c,x])=>({c,...summ(x)})).filter(o=>o.n>=min);
    const H={};cols.slice(1).forEach(c=>H[c[0]]=heat(L.map(o=>o[c[0]])));
    L.sort((a,b)=>key==='c'?a.c.localeCompare(b.c)*dir:dir*((b[key]??-1e9)-(a[key]??-1e9))*-1);
    app.innerHTML='<h1>Champions</h1><div class="bar"><label>Rôle <select id="r">'+roles.map(r=>'<option value="'+r+'"'+(r===role?' selected':'')+'>'+roleName(r)+'</option>').join('')+'</select></label>'+
    '<label>Joueur <select id="p"><option value="">Tous les joueurs</option>'+PL.map(t=>'<option'+(t===pl?' selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label>'+
    '<label>Parties minimum <input id="m" type="number" min="1" value="'+min+'" style="width:64px"></label></div>'+
    (L.length?'<div class="scroll"><table><thead><tr><th class="s'+(key==='c'?' cur':'')+'" data-k="c">Champion</th>'+cols.map(c=>'<th class="s'+(c[0]===key?' cur':'')+'" data-k="'+c[0]+'">'+c[1]+(c[0]===key?(dir<0?' ▾':' ▴'):'')+'</th>').join('')+'</tr></thead><tbody>'+
    L.map(o=>'<tr><td><span class="cell">'+img(o.c,28)+'<span>'+esc(o.c)+'</span></span></td>'+cols.map(c=>'<td style="'+(c[0]==='n'?'':H[c[0]](o[c[0]]))+'">'+fs(o[c[0]],c)+'</td>').join('')+'</tr>').join('')+
    '</tbody></table></div><p class="legend">Moyennes par champion pour le rôle choisi. Couleurs : rouge = plus bas, bleu = plus haut, doré = meilleur du tableau. Les stats @15 ne comptent que les parties de 15 min ou plus avec timeline.</p>'
    :'<p class="empty">Aucun champion pour ce filtre.</p>');
    $('#r').onchange=e=>{role=e.target.value;draw()};
    $('#p').onchange=e=>{pl=e.target.value;draw()};
    $('#m').onchange=e=>{min=Math.max(1,+e.target.value||1);draw()};
    app.querySelectorAll('th.s').forEach(th=>th.onclick=()=>{const k=th.dataset.k;if(k===key)dir=-dir;else{key=k;dir=k==='c'?1:-1}draw()});
  };draw();
}
 
const TEAM={name:'Vanilla Gaming',logo:'assets/vanilla.png'};
const FR='<svg viewBox="0 0 3 2" width="22" height="15" style="border-radius:2px;vertical-align:middle"><rect width="1" height="2" fill="#0055a4"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#ef4135"/></svg>';
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
  const L=Object.entries(m).map(([c,x])=>({c,...summ(x)})).sort((a,b)=>b.n-a.n);
  const cols=[['n','Parties',0],['wr','Victoires %',0],...S],H={};cols.slice(1).forEach(c=>H[c[0]]=heat(L.map(x=>x[c[0]])));
  app.innerHTML='<p><a class="ext" href="players.html">← Joueurs</a></p>'+
  '<section class="hero"><div class="pic"><img class="ph" src="assets/players/'+encodeURIComponent(name)+'.png" alt="" onerror="this.onerror=null;this.src=\'assets/player.svg\'"><img class="tl" src="'+TEAM.logo+'" alt="'+TEAM.name+'"></div>'+
  '<div class="hi"><div class="meta">'+(last?'<b>'+last.getFullYear()+'</b>':'')+'<span>'+roleName(role)+'</span><span><img src="'+TEAM.logo+'" alt=""><b>'+TEAM.name+'</b></span><span>'+FR+' France</span></div>'+
  '<h1>'+esc(name)+'</h1><p>'+R.length+' parties avec '+TEAM.name+(first?' depuis '+first.toLocaleDateString('fr-FR',{month:'long',year:'numeric'}):'')+' · '+esc(p.slice(name.length))+'</p>'+
  (others.length?'<p style="margin-top:8px">Autres rôles : '+others.map(r=>'<a class="ext" href="player.html?p='+encodeURIComponent(p)+'&r='+r+'">'+roleName(r)+'</a>').join(' · ')+'</p>':'')+'</div>'+
  '<div class="stats"><div class="st"><small>Parties</small><b>'+R.length+'</b><small>'+w+' V · '+(R.length-w)+' D</small></div>'+
  '<div class="st"><small>Victoires</small><b>'+num(o.wr)+' %</b><small>'+w+' sur '+R.length+'</small></div>'+
  '<div class="st"><small>KDA</small><b>'+num(o.kda,2)+'</b><small>'+av('k')+' / '+av('d')+' / '+av('a')+'</small></div></div></section>'+
  '<h2 style="margin:24px 0 10px">Champions joués en '+roleName(role)+'</h2><div class="scroll"><table><thead><tr><th>Champion</th>'+cols.map(c=>'<th>'+c[1]+'</th>').join('')+'</tr></thead><tbody>'+
  L.map(x=>'<tr><td><span class="cell">'+img(x.c,28)+'<span>'+esc(x.c)+'</span></span></td>'+cols.map(c=>'<td style="'+(c[0]==='n'?'':H[c[0]](x[c[0]]))+'">'+fs(x[c[0]],c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+
  '<p class="legend">Stats de '+esc(name)+' uniquement en '+roleName(role)+'. Couleurs comparées entre ses champions.</p>';
}
 