// 選挙ごとの静的ページを作るスクリプト: node scripts/build.mjs
// data.js と index.html の画面部品から、次のページを作り、sitemap.xml を書き直します。
//   /senkyo/                     全国の選挙一覧（都道府県へのリンク、近日の選挙）
//   /senkyo/都道府県/             都道府県ごとの選挙一覧
//   /senkyo/都道府県/市区町村/     市区町村ごとの選挙一覧
//   /senkyo/投票年/選挙名/         選挙ごとのページ
// あわせて index.html の「都道府県から選挙をさがす」リンク（<!--pref-links--> の間）を書き直します。
// 検索エンジンが選挙ごとのページを見つけられるようにするためのものです。
// data.js や index.html を変えたら、このスクリプトを実行してから commit してください。
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
const dir=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const SITE='https://tohyobiyori.jp';
const data=fs.readFileSync(path.join(dir,'data.js'),'utf8')+'\n'+(fs.existsSync(path.join(dir,'topics.js'))?fs.readFileSync(path.join(dir,'topics.js'),'utf8'):'');
let html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const app=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(t=>t.includes('function route'));
const el=()=>({innerHTML:'',textContent:'',hidden:true,classList:{add(){},remove(){},toggle(){}},setAttribute(){},dataset:{},value:'',scrollIntoView(){}});
const out={};
const ctx={document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){},getElementById:el,title:''},location:{hash:''},addEventListener(){},window:{scrollTo(){}},scrollTo(){},matchMedia:()=>({matches:false}),MutationObserver:class{observe(){}},console,__out:out};
vm.createContext(ctx);
vm.runInContext(data+'\n'+app.trim().replace(/\}\s*$/,';Object.assign(__out,{E,election,ecard,when,fmt,distOf,days,UPDATED,DIST,DD,TP_FEAT,TP_DAILY,TP_ARTS,dItem,dDate,artPage});}'),ctx);
const {E,election,ecard,when,fmt,distOf,days,UPDATED,DIST,DD,TP_FEAT,TP_DAILY,TP_ARTS,dItem,dDate,artPage}=out;

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
const clean=s=>s.replace(/[\/\\?#%\s]/g,'');
const abs=u=>SITE+encodeURI(u);
const md=d=>{const [,m,dd]=d.split('-');return `${+m}月${+dd}日`};
const addDay=(d,n)=>{const t=new Date(d+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)};
const wd=d=>'日月火水木金土'[new Date(d+'T00:00:00Z').getUTCDay()];
const fmtw=d=>`${fmt(d)}（${wd(d)}）`;

// 対象：架空サンプル以外のすべての選挙
const list=E.filter(e=>!e.smp).sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
const PREF_ORDER=['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const prefOf=e=>e.pref.split(' ')[0];
const muniOf=e=>e.pref.split(' ')[1]||'';
const isPref=p=>PREF_ORDER.includes(p);
// 略称：〇〇議会議員選挙→〇〇議選、〇〇長選挙→〇〇長選、〇〇知事選挙→〇〇知事選
const short=n=>n.replace(/議会議員(補欠)?選挙/,(m,h)=>h?'議補選':'議選').replace(/(長|知事)選挙/,'$1選');
const year=e=>e.date.slice(0,4);
const past=e=>!e.ap&&days(e.date)<0;

// URL
const url={};const seen={};
for(const e of list){const base=`${year(e)}/${clean(e.name)}`;seen[base]=(seen[base]||0)+1;url[e.id]=`/senkyo/${base}${seen[base]>1?'-'+seen[base]:''}/`;}
const prefUrl=p=>`/senkyo/${clean(p)}/`;
const muniUrl=(p,m)=>`/senkyo/${clean(p)}/${clean(m)}/`;

// まとめ
const byPref={},byMuni={};
for(const e of list){const p=prefOf(e),m=muniOf(e);if(!isPref(p))continue;(byPref[p]=byPref[p]||[]).push(e);if(m){const k=p+'|'+m;(byMuni[k]=byMuni[k]||[]).push(e);}}
const prefs=PREF_ORDER.filter(p=>byPref[p]);
const munisOf=p=>Object.keys(byMuni).filter(k=>k.startsWith(p+'|')).map(k=>k.split('|')[1]).sort((a,b)=>a.localeCompare(b,'ja'));
const prefLevel=p=>(byPref[p]||[]).filter(e=>!muniOf(e));
const upFirst=a=>[...a.filter(e=>!past(e)),...a.filter(past).reverse()];

// 共通部品（index.html から取り出す）
const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
const verify=(html.match(/<meta name="google-site-verification"[^>]*>/)||[''])[0];
const fixLinks=s=>s.replace(/href="#([^"]*)"/g,(m,id)=>`href="${url[id]?encodeURI(url[id]):(id&&id!=='home'?'/#'+id:'/')}"`);
const header=fixLinks(html.match(/<header>[\s\S]*?<\/header>/)[0].replace(/<button class="ic" id="mbtn"[\s\S]*?<\/button>/,''));
const footer=fixLinks(html.match(/<footer>[\s\S]*?<\/footer>/)[0]);
const OG=SITE+'/og.png';
const cards=a=>`<div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${a.map(e=>fixLinks(ecard(e))).join('')}</div>`;
const crumb=items=>`<div class="crumb">${items.map(([n,u],i)=>i<items.length-1?`<a href="${encodeURI(u)}">${esc(n)}</a>`:esc(n)).join(' ＞ ')}</div>`;
const crumbLd=items=>({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:items.map(([n,u],i)=>({'@type':'ListItem',position:i+1,name:n,item:SITE+encodeURI(u)}))});
const prefNav=()=>`<nav class="wrap" aria-label="都道府県から選挙をさがす" style="padding-block:24px"><h2 style="font-size:18px;margin:0 0 10px">都道府県から選挙をさがす</h2><p style="display:flex;flex-wrap:wrap;gap:6px 14px;margin:0">${prefs.map(p=>`<a href="${encodeURI(prefUrl(p))}">${esc(p)}</a>`).join('')}<a href="/senkyo/">全国の選挙一覧</a></p></nav>`;

function page({title,desc,canon,body,ld}){
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${verify}
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canon}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canon}">
<meta property="og:image" content="${OG}">
<meta property="og:site_name" content="投票日和">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/senkyo/style.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g,'\\u003c')}</script>
</head>
<body>
${header}
<main id="app">${body}</main>
${prefNav()}
${footer}
</body>
</html>
`;
}

// 選挙ごとのページ
function candNames(e){const ds=distOf(e)||[];return {names:[...new Set(ds.flatMap(d=>(d.c||[]).map(c=>c.nm)))],official:ds.some(d=>d.off)};}
function describe(e){
  const {names,official}=candNames(e);
  let s=`${e.name}（${short(e.name)}）は${e.pref}の選挙。投票日は${when(e)}`;
  if(e.kokuji)s+=`、告示日は${fmt(e.kokuji)}${e.mk?'（見込み）':''}`;
  if(e.seats)s+=`、定数${e.seats}`;
  s+='。';
  if(names.length)s+=`${official?'候補者':'立候補予定者'}：${names.slice(0,8).join('、')}${names.length>8?` ほか（計${names.length}人）`:''}。`;
  else s+='日程・定数・候補者を掲載しています。';
  return s;
}
function schedule(e){
  if(e.ap)return `<p>投票日・告示日はまだ決まっていません（${esc(year(e))}年${esc(e.ap)}の見込み）。決まりしだい更新します。</p>`;
  const mk=e.mk?'（見込み）':'';
  const rows=[];
  if(e.kokuji)rows.push(['告示日',fmtw(e.kokuji)+mk,'立候補の届出を受け付け、選挙運動が始まる日です。']);
  if(e.kokuji&&e.kokuji<e.date)rows.push(['期日前投票',`${fmtw(addDay(e.kokuji,1))}〜${fmtw(addDay(e.date,-1))}${mk}`,'投票日に投票所へ行けない人は、この期間に期日前投票所で投票できます。']);
  rows.push(['投票日',fmtw(e.date)+mk,'投票所入場券に書かれた投票所で投票します。']);
  return `<table class="info"><tbody>${rows.map(r=>`<tr><th>${r[0]}</th><td><b>${esc(r[1])}</b><br><span class="meta">${r[2]}</span></td></tr>`).join('')}</tbody></table>`;
}
function faq(e){
  const {names,official}=candNames(e);const s=short(e.name);const done=past(e);
  const local=isPref(prefOf(e));
  const qa=[];
  qa.push([`${s}の投票日はいつですか？`,e.ap?`まだ決まっていません。${year(e)}年${e.ap}の見込みです。`:`${fmtw(e.date)}${e.mk?'（見込み）':''}${done?'に行われました':'です'}。${e.kokuji?`告示日は${fmtw(e.kokuji)}${e.mk?'（見込み）':''}です。`:''}`]);
  if(!e.ap&&e.kokuji&&e.kokuji<e.date&&!done)qa.push(['期日前投票はいつからできますか？',`告示日の翌日の${fmtw(addDay(e.kokuji,1))}から、投票日の前日の${fmtw(addDay(e.date,-1))}までです${e.mk?'（日程は見込み）':''}。期日前投票所の場所と時間は、選挙管理委員会のお知らせで確認してください。`]);
  if(e.seats)qa.push([`定数は何人ですか？`,`${e.seats}人です。`]);
  const pv0=DD(e)&&DD(e).prev;const pv=Array.isArray(pv0)?pv0.slice().sort((x,y)=>(y.date||'').localeCompare(x.date||''))[0]:pv0;
  if(pv&&pv.date)qa.push([`前回の${s}はどうでしたか？`,`前回は${fmt(pv.date)}に行われました。${pv.turnout?`投票率は${pv.turnout}でした。`:''}${pv.note||''}`]);
  qa.push([`誰が立候補していますか？`,names.length?`${official?'届出のあった候補者':'報道などで立候補の意向が伝えられている人'}は、${names.slice(0,12).join('、')}${names.length>12?` ほか（計${names.length}人）`:''}です。${official?'':'告示日の届出で正式に決まります。'}`:`このサイトではまだ掲載していません。${e.kokuji?`告示日（${fmt(e.kokuji)}${e.mk?'・見込み':''}）の立候補届出後に掲載します。`:''}`]);
  if(local&&e.type!=='統一地方選（後半）')qa.push(['投票できるのはどんな人ですか？','日本国民で満18歳以上、その自治体に引き続き3か月以上住所がある人です。選挙人名簿に登録されている必要があります。']);
  qa.push(['どこで投票できますか？','自宅に届く投票所入場券に書かれた投票所で投票します。入場券を忘れても、本人であることが確認できれば投票できます。']);
  return `<h2 style="font-size:22px;margin-top:28px">よくある質問</h2>${qa.map(([q,a])=>`<h3 style="font-size:17px;margin:16px 0 4px">${esc(q)}</h3><p style="margin:0">${esc(a)}</p>`).join('')}`;
}
function related(e){
  const p=prefOf(e),m=muniOf(e);
  const same=m?(byMuni[p+'|'+m]||[]).filter(x=>x!==e):[];
  const sameDay=list.filter(x=>x!==e&&!same.includes(x)&&x.date===e.date&&prefOf(x)===p).slice(0,12);
  const pl=m?prefLevel(p).filter(x=>!past(x)).slice(0,4):[];
  const groups=[[m?`${m}のほかの選挙`:'',same],[`同じ日に行われる${p}の選挙`,sameDay],[`${p}の選挙`,pl]].filter(g=>g[0]&&g[1].length);
  const links=[isPref(p)?`<a href="${encodeURI(prefUrl(p))}">${esc(p)}の選挙一覧</a>`:'',m&&isPref(p)?`<a href="${encodeURI(muniUrl(p,m))}">${esc(m)}の選挙一覧</a>`:'','<a href="/">郵便番号で、あなたが投票できる選挙をさがす</a>'].filter(Boolean);
  return `${groups.map(([t,a])=>`<h2 style="font-size:22px;margin-top:28px">${esc(t)}</h2>${cards(a)}`).join('')}<p style="display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:20px">${links.join('')}</p>`;
}

const outDir=path.join(dir,'senkyo');
fs.rmSync(outDir,{recursive:true,force:true});
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'style.css'),css.trim()+'\n');
const write=(u,s)=>{const f=path.join(dir,u,'index.html');fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);};
const sm=[];

for(const e of list){
  const u=url[e.id],p=prefOf(e),m=muniOf(e);
  const items=[['トップ','/'],['選挙一覧','/senkyo/'],...(isPref(p)?[[p,prefUrl(p)]]:[]),...(m&&isPref(p)?[[m,muniUrl(p,m)]]:[]),[e.name,u]];
  const body=fixLinks(election(e))
    .replace(/<div class="crumb">[\s\S]*?<\/div>/,crumb(items))
    .replace(/<h1>([\s\S]*?)<\/h1>/,(x,t)=>`<h1>${t}（${year(e)}年）</h1><p class="meta" style="margin:4px 0 0">${esc(short(e.name))} ${year(e)}｜${esc(e.ap?year(e)+'年'+e.ap:fmt(e.date)+'投票')}</p>`)
    .replace(/<p class="src">出典：[\s\S]*<\/div>$/,m0=>`<h2 style="font-size:22px;margin-top:28px">日程</h2>${schedule(e)}${faq(e)}${related(e)}${m0.replace(/<\/div>$/,'')}<p class="src">このページは ${fmt(today)} 時点のデータです。</p></div>`);
  const title=`${short(e.name)} ${year(e)}｜${e.ap?'日程・候補者':'候補者・日程・定数'}（${e.ap?year(e)+'年'+e.ap:md(e.date)+'投票'}）｜投票日和`;
  write(u,page({title,desc:describe(e),canon:abs(u),body,ld:crumbLd(items)}));
  sm.push([abs(u),'0.8']);
}

// 都道府県ページ・市区町村ページ
for(const p of prefs){
  const pu=prefUrl(p),items=[['トップ','/'],['選挙一覧','/senkyo/'],[p,pu]];
  const pl=upFirst(prefLevel(p)),ms=munisOf(p);
  const up=byPref[p].filter(e=>!past(e));
  const body=`<div class="wrap">${crumb(items)}
<h1>${esc(p)}の選挙</h1>
<p>${esc(p)}で行われる知事選挙・議会議員選挙と、市区町村長・市区町村議会議員の選挙の日程・定数・候補者をまとめています（掲載${byPref[p].length}件、うちこれから行われる選挙${up.length}件）。</p>
${pl.length?`<h2 style="font-size:22px;margin-top:24px">${esc(p)}全体の選挙</h2>${cards(pl)}`:''}
${up.filter(e=>muniOf(e)).length?`<h2 style="font-size:22px;margin-top:24px">これから行われる市区町村の選挙</h2>${cards(up.filter(e=>muniOf(e)))}`:''}
${ms.length?`<h2 style="font-size:22px;margin-top:24px">市区町村から選ぶ</h2><p style="display:flex;flex-wrap:wrap;gap:6px 14px">${ms.map(m=>`<a href="${encodeURI(muniUrl(p,m))}">${esc(m)}</a>`).join('')}</p>`:''}
<p class="src">最終更新 ${fmt(UPDATED)}。日程は変更されることがあります。最新の情報は各選挙管理委員会でご確認ください。</p></div>`;
  write(pu,page({title:`${p}の選挙日程・候補者一覧｜投票日和`,desc:`${p}の知事選・議会議員選挙、市区町村長選・市区町村議選の日程と候補者（${byPref[p].length}件）。${up.slice(0,5).map(e=>short(e.name)).join('、')}${up.length>5?'など':''}。`,canon:abs(pu),body,ld:crumbLd(items)}));
  sm.push([abs(pu),'0.7']);
  for(const m of ms){
    const mu=muniUrl(p,m),its=[...items,[m,mu]];const a=upFirst(byMuni[p+'|'+m]);const pp=prefLevel(p).filter(x=>!past(x));
    const types=[...new Set(a.map(e=>short(e.name).replace(m.slice(0,-1),'')))].join('・');
    const b=`<div class="wrap">${crumb(its)}
<h1>${esc(m)}の選挙（${esc(p)}）</h1>
<p>${esc(p)}${esc(m)}の${esc(types)}の日程・定数・候補者です。${esc(m)}の有権者が投票する${esc(p)}全体の選挙もあわせて載せています。</p>
<h2 style="font-size:22px;margin-top:24px">${esc(m)}の選挙</h2>${cards(a)}
${pp.length?`<h2 style="font-size:22px;margin-top:24px">${esc(m)}でも投票する${esc(p)}の選挙</h2>${cards(pp)}`:''}
<p style="margin-top:20px"><a href="${encodeURI(pu)}">${esc(p)}の選挙一覧</a>　<a href="/">郵便番号で、あなたが投票できる選挙をさがす</a></p>
<p class="src">最終更新 ${fmt(UPDATED)}。日程は変更されることがあります。最新の情報は${esc(m)}の選挙管理委員会でご確認ください。</p></div>`;
    const nx=a.filter(e=>!past(e)).slice(0,3);
    write(mu,page({title:`${m}の選挙（${types}）日程・候補者｜${p}｜投票日和`,desc:`${p}${m}の${types}の日程・定数・候補者。${nx.map(e=>`${short(e.name)}は${when(e)}投票`).join('、')}${nx.length?'。':''}`,canon:abs(mu),body:b,ld:crumbLd(its)}));
    sm.push([abs(mu),'0.6']);
  }
}

// 全国の一覧
const upAll=list.filter(e=>!past(e)).slice(0,40);
const other=list.filter(e=>!isPref(prefOf(e)));
const idx=`<div class="wrap">${crumb([['トップ','/'],['選挙一覧','/senkyo/']])}
<h1>全国の選挙一覧</h1>
<p>投票日和に掲載している全国の選挙（${list.length}件）を、都道府県・市区町村ごとにまとめています。各選挙のページで、日程・選挙区・定数・候補者を確認できます。</p>
<h2 style="font-size:22px;margin-top:24px">都道府県から選ぶ</h2>
<p style="display:flex;flex-wrap:wrap;gap:6px 14px">${prefs.map(p=>`<a href="${encodeURI(prefUrl(p))}">${esc(p)}（${byPref[p].length}）</a>`).join('')}</p>
${other.length?`<h2 style="font-size:22px;margin-top:24px">全国の選挙</h2>${cards(other)}`:''}
<h2 style="font-size:22px;margin-top:24px">近日の選挙</h2>${cards(upAll)}
<p class="src">最終更新 ${fmt(UPDATED)}。日程は変更されることがあります。最新の情報は各選挙管理委員会でご確認ください。</p></div>`;
write('/senkyo/',page({title:'全国の選挙一覧（日程・候補者）｜投票日和',desc:`全国の知事選・都道府県議選・市区町村長選・市区町村議選の一覧（${list.length}件）。各選挙の投票日・告示日・定数・候補者を掲載しています。`,canon:SITE+'/senkyo/',body:idx,ld:crumbLd([['トップ','/'],['選挙一覧','/senkyo/']])}));

// ニュース（/news/、/news/YYYY-MM-DD/）と特集・解説（/kiji/ID/）
for(const d of ['news','kiji'])fs.rmSync(path.join(dir,d),{recursive:true,force:true});
const strip=h=>h.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
const kurl=a=>`/kiji/${a.id.replace(/^k-/,'')}/`;
const fixK=s=>fixLinks(s).replace(/href="\/#(k-[a-z0-9-]+)"/g,(m,id)=>{const a=TP_ARTS.find(x=>x.id===id);return a?`href="${kurl(a)}"`:m;});
if(TP_DAILY.length){
  const ni=[['トップ','/'],['政治・選挙ニュース','/news/']];
  const day=g=>`<h2 style="font-size:22px;margin-top:28px"><a href="/news/${g.date}/">${g.date.slice(0,4)}年${dDate(g.date)}</a></h2><ul class="dnews">${g.items.map(x=>fixK(dItem(x))).join('')}</ul>`;
  write('/news/',page({title:'政治・選挙ニュース（毎日更新）｜投票日和',desc:`国政・選挙・自治体の動きを毎朝まとめています。${TP_DAILY[0].items.slice(0,3).map(x=>x.t).join('／')}`,canon:SITE+'/news/',ld:crumbLd(ni),body:`<div class="wrap">${crumb(ni)}<h1>政治・選挙ニュース</h1><p>国政・選挙・自治体の動きを、毎朝、報道機関と公的機関の発表から選んで短くまとめています。特定の政党や候補者を支持・推薦するものではありません。</p>${TP_DAILY.slice(0,14).map(day).join('')}<p class="src">最終更新 ${fmt(TP_DAILY[0].date)}</p></div>`}));
  sm.push([SITE+'/news/','0.9']);
  for(const g of TP_DAILY){const u=`/news/${g.date}/`,it=[...ni,[`${g.date.slice(0,4)}年${dDate(g.date)}`,u]];
    write(u,page({title:`${g.date.slice(0,4)}年${dDate(g.date)}の政治・選挙ニュース｜投票日和`,desc:g.items.map(x=>x.t).join('／').slice(0,150),canon:abs(u),ld:crumbLd(it),body:`<div class="wrap">${crumb(it)}<h1>${g.date.slice(0,4)}年${dDate(g.date)}の政治・選挙ニュース</h1><ul class="dnews">${g.items.map(x=>fixK(dItem(x))).join('')}</ul><p style="margin-top:20px"><a href="/news/">政治・選挙ニュースの一覧</a>　<a href="/">トップへ</a></p></div>`}));
    sm.push([abs(u),'0.6']);}
}
for(const a of TP_ARTS){const u=kurl(a),it=[['トップ','/'],[a.kind==='コラム'?'コラム':'特集・解説',a.kind==='コラム'?'/#column':'/#kiji'],[a.t,u]];
  write(u,page({title:`${a.t}｜投票日和`,desc:strip(a.lead).slice(0,150),canon:abs(u),ld:[crumbLd(it),{'@context':'https://schema.org','@type':'Article',headline:a.t,datePublished:a.d.replace(/\//g,'-'),author:{'@type':'Organization',name:'投票日和 編集部'},publisher:{'@type':'Organization',name:'投票日和'},image:OG}],body:fixK(artPage(a))}));
  sm.push([abs(u),'0.7']);}

// index.html の特集バー
html=html.replace(/<a class="topnews" href="[^"]*">([\s\S]*?)<b>[\s\S]*?<\/b>/,(m,pre)=>`<a class="topnews" href="${esc(TP_FEAT.href)}">${pre}<b>${esc(TP_FEAT.bar)}</b>`);

// index.html の都道府県リンク
const nav=`<!--pref-links-->${prefNav()}<!--/pref-links-->`;
html=/<!--pref-links-->[\s\S]*?<!--\/pref-links-->/.test(html)?html.replace(/<!--pref-links-->[\s\S]*?<!--\/pref-links-->/,nav):html.replace('</main>\n','</main>\n'+nav+'\n');
fs.writeFileSync(path.join(dir,'index.html'),html);

// sitemap.xml
const urls=[[SITE+'/','1.0'],[SITE+'/senkyo/','0.9'],...sm];
fs.writeFileSync(path.join(dir,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([l,p])=>`  <url><loc>${l}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>${p}</priority></url>`).join('\n')}
</urlset>
`);
console.log(`ニュース ${TP_DAILY.length} 日分・特集 ${TP_ARTS.length} 件／選挙ページ ${list.length} 件／都道府県 ${prefs.length} 件／市区町村 ${Object.keys(byMuni).length} 件／sitemap ${urls.length} URL を作成しました`);
