// 選挙ごとの静的ページを作るスクリプト: node scripts/build.mjs
// data.js と index.html の画面部品から、/senkyo/年/選挙名/index.html と /senkyo/index.html（一覧）を作り、
// sitemap.xml を書き直します。Google などの検索エンジンが選挙ごとのページを見つけられるようにするためのものです。
// data.js や index.html を変えたら、このスクリプトを実行してから commit してください。
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
const dir=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const SITE='https://tohyobiyori.jp';
const data=fs.readFileSync(path.join(dir,'data.js'),'utf8');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const app=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(t=>t.includes('function route'));
const el=()=>({innerHTML:'',textContent:'',hidden:true,classList:{add(){},remove(){},toggle(){}},setAttribute(){},dataset:{},value:'',scrollIntoView(){}});
const out={};
const ctx={document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){},getElementById:el,title:''},location:{hash:''},addEventListener(){},window:{scrollTo(){}},scrollTo(){},matchMedia:()=>({matches:false}),MutationObserver:class{observe(){}},console,__out:out};
vm.createContext(ctx);
vm.runInContext(data+'\n'+app.trim().replace(/\}\s*$/,';__out.E=E;__out.election=election;__out.when=when;__out.fmt=fmt;__out.distOf=distOf;__out.UPDATED=UPDATED;}'),ctx);
const {E,election,when,fmt,distOf,UPDATED}=out;

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);

// 対象：架空サンプル以外のすべての選挙。URL は /senkyo/投票年/選挙名/（同じ年に同名があれば -2, -3 …）
const list=E.filter(e=>!e.smp).sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
const seen={};const url={};
for(const e of list){const base=`${e.date.slice(0,4)}/${e.name.replace(/[\/\\?#%\s]/g,'')}`;seen[base]=(seen[base]||0)+1;url[e.id]=`/senkyo/${base}${seen[base]>1?'-'+seen[base]:''}/`;}
const abs=u=>SITE+encodeURI(u);

// 共通部品（index.html から取り出す）
const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
const verify=(html.match(/<meta name="google-site-verification"[^>]*>/)||[''])[0];
const fixLinks=s=>s.replace(/href="#([^"]*)"/g,(m,id)=>`href="${url[id]||(id&&id!=='home'?'/#'+id:'/')}"`);
const header=fixLinks(html.match(/<header>[\s\S]*?<\/header>/)[0].replace(/<button class="ic" id="mbtn"[\s\S]*?<\/button>/,''));
const footer=fixLinks(html.match(/<footer>[\s\S]*?<\/footer>/)[0]);

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
<meta property="og:site_name" content="投票日和">
<meta name="twitter:card" content="summary">
<link rel="stylesheet" href="/senkyo/style.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g,'\\u003c')}</script>
</head>
<body>
${header}
<main id="app">${body}</main>
${footer}
</body>
</html>
`;
}

const crumbLd=items=>({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:items.map((x,i)=>({'@type':'ListItem',position:i+1,name:x[0],item:x[1]}))});

function describe(e){
  const ds=distOf(e)||[];
  const names=[...new Set(ds.flatMap(d=>(d.c||[]).map(c=>c.nm)))];
  const official=ds.some(d=>d.off);
  let s=`${e.pref}の${e.name}${e.dist?' '+e.dist:''}。投票日は${when(e)}`;
  if(e.kokuji)s+=`、告示日は${fmt(e.kokuji)}${e.mk?'（見込み）':''}`;
  if(e.seats)s+=`、定数${e.seats}`;
  s+='。';
  if(names.length)s+=`${official?'候補者':'立候補予定者'}：${names.slice(0,8).join('、')}${names.length>8?` ほか（計${names.length}人）`:''}。`;
  else s+='選挙区・定数・候補者の情報を掲載します。';
  return s;
}

// 書き出し
const outDir=path.join(dir,'senkyo');
fs.rmSync(outDir,{recursive:true,force:true});
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'style.css'),css.trim()+'\n');
for(const e of list){
  const u=url[e.id];
  const body=fixLinks(election(e)).replace(/<a href="\/">トップ<\/a> ＞ /,'<a href="/">トップ</a> ＞ <a href="/senkyo/">選挙一覧</a> ＞ ')
    +`<div class="wrap"><p class="src">このページは ${fmt(today)} 時点のデータです。<a href="/">トップページ</a>では、郵便番号から投票できる選挙を探せます。</p></div>`;
  const title=`${e.name}${e.dist?' '+e.dist:''}（${e.ap?e.date.slice(0,4)+'年'+e.ap:fmt(e.date)+'投票'}）候補者・日程・定数｜投票日和`;
  const f=path.join(dir,decodeURI(u),'index.html');
  fs.mkdirSync(path.dirname(f),{recursive:true});
  fs.writeFileSync(f,page({title,desc:describe(e),canon:abs(u),body,ld:crumbLd([['投票日和',SITE+'/'],['選挙一覧',SITE+'/senkyo/'],[e.name,abs(u)]])}));
}

// 一覧ページ（都道府県ごと、投票日順）
const byPref={};
for(const e of list){const p=e.pref.split(' ')[0];(byPref[p]=byPref[p]||[]).push(e);}
const order=['全国','北海道','青森','岩手','宮城','秋田','山形','福島','茨城','栃木','群馬','埼玉','千葉','東京','神奈川','新潟','富山','石川','福井','山梨','長野','岐阜','静岡','愛知','三重','滋賀','京都','大阪','兵庫','奈良','和歌山','鳥取','島根','岡山','広島','山口','徳島','香川','愛媛','高知','福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄'];
const prefs=Object.keys(byPref).sort((a,b)=>{const i=x=>{const k=order.findIndex(o=>x.startsWith(o));return k<0?99:k};return i(a)-i(b)||a.localeCompare(b)});
const idx=`<div class="wrap"><div class="crumb"><a href="/">トップ</a> ＞ 選挙一覧</div>
<h1>全国の選挙一覧</h1>
<p>投票日和に掲載している選挙（${list.length}件）を都道府県ごとに投票日順で並べています。各選挙のページで、日程・選挙区・定数・候補者を確認できます。</p>
${prefs.map(p=>`<h2>${esc(p)}</h2><ul>${byPref[p].map(e=>`<li><a href="${url[e.id]}">${esc(e.name)}${e.dist?' '+esc(e.dist):''}</a>　<span class="meta">${esc(when(e))}</span></li>`).join('')}</ul>`).join('\n')}
<p class="src">最終更新 ${fmt(UPDATED)}。日程は変更されることがあります。最新の情報は各選挙管理委員会でご確認ください。</p></div>`;
fs.writeFileSync(path.join(outDir,'index.html'),page({title:'全国の選挙一覧（日程・候補者）｜投票日和',desc:`全国の知事選・都道府県議選・市区町村長選・市区町村議選の一覧（${list.length}件）。各選挙の投票日・告示日・定数・候補者を掲載しています。`,canon:SITE+'/senkyo/',body:idx,ld:crumbLd([['投票日和',SITE+'/'],['選挙一覧',SITE+'/senkyo/']])}));

// sitemap.xml
const urls=[[SITE+'/','daily','1.0'],[SITE+'/senkyo/','daily','0.9'],...list.map(e=>[abs(url[e.id]),'daily','0.8'])];
fs.writeFileSync(path.join(dir,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([l,c,p])=>`  <url><loc>${l}</loc><lastmod>${today}</lastmod><changefreq>${c}</changefreq><priority>${p}</priority></url>`).join('\n')}
</urlset>
`);
console.log('選挙ページ',list.length,'件／一覧 1件／sitemap',urls.length,'URL を作成しました');
