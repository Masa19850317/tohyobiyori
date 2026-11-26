// データ確認スクリプト: node scripts/check.mjs
// data.js と index.html のスクリプトを読み込み、全ページを描画して壊れていないか確認します。
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
const dir=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const data=fs.readFileSync(path.join(dir,'data.js'),'utf8')+'\n'+(fs.existsSync(path.join(dir,'topics.js'))?fs.readFileSync(path.join(dir,'topics.js'),'utf8'):'');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const app=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(t=>t.includes('function route'));
const el=()=>({innerHTML:'',textContent:'',hidden:true,classList:{add(){},remove(){},toggle(){}},setAttribute(){},dataset:{},value:'',scrollIntoView(){}});
const ctx={document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){},getElementById:el,title:''},location:{hash:''},addEventListener(){},window:{scrollTo(){}},scrollTo(){},matchMedia:()=>({matches:false}),MutationObserver:class{observe(){}},console};
vm.createContext(ctx);
const test=`;const out=[home(),plans(),apply(),terms(),tokusho(),edit(),search(),columns(),newsAll(),kijiList(),...COLS.map(c=>c.f()),...TP_ARTS.map(artPage)];E.forEach(e=>out.push(election(e)));
const bad=out.filter(h=>/undefined|NaN/.test(h));
const seen={};const dup=E.filter(e=>!e.smp&&(seen[e.name+e.date]=(seen[e.name+e.date]||0)+1)>1).map(e=>e.name);
for(const [k,d] of Object.entries(DIST)){if(!E.some(e=>e.name===k.replace(/@\\d{4}$/,'')))console.log('警告: DISTの選挙名が日程にない:',k);
 for(const [c,x] of Object.entries(d.cands||{}))if(x&&x.c)for(const r of x.c.split('\\n')){const f=r.split('|');if(f.length===6||f.length>7||(f.length===7&&(f[6]!==''&&f[6]!=='当'||f[5]!==''&&isNaN(+f[5]))))console.log('警告: 候補者行の列数・得票欄が不正（氏名|年齢|党派|新現元|備考|得票数|当）:',k,c,r);}
 for(const p of (d.prev?(Array.isArray(d.prev)?d.prev:[d.prev]):[])){if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(p.date||''))console.log('警告: 過去の結果の日付が不正:',k,p.date);if(!p.src)console.log('警告: 過去の結果に出典がない:',k,p.date);if(p.c)for(const r of p.c.split('\\n')){const f=r.split('|');if(f.length!==6||(f[5]!==''&&f[5]!=='当')||(f[4]!==''&&isNaN(+f[4])))console.log('警告: 過去の結果の列数・得票欄が不正（氏名|年齢|党派|新現元|得票数|当）:',k,p.date,r);}}
 for(const c of Object.keys(d.cands||{}))if(!(d.list||'').split('\\n').some(l=>l.split('|')[0]===c))console.log('警告: 候補者の選挙区名が一覧にない:',k,c);}
const ids=new Set();let pd='9999';
for(const g of TP_DAILY){if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(g.date))console.log('警告: DAILYの日付が不正:',g.date);if(g.date>=pd)console.log('警告: DAILYは新しい日付から順に、同じ日付は1つに:',g.date);pd=g.date;
 if(!(g.items||[]).length)console.log('警告: DAILYの項目が空:',g.date);
 for(const x of g.items||[]){if(!CATC[x.cat])console.log('警告: DAILYの分類が不正（'+Object.keys(CATC).join('・')+'）:',g.date,x.cat);if(!x.t||!x.s)console.log('警告: DAILYの見出し・要約がない:',g.date,x.t);if(!(x.src||[]).length||x.src.some(a=>!a[0]||!/^https:\\/\\//.test(a[1]||'')))console.log('警告: DAILYの出典がない・URLがhttpsでない:',g.date,x.t);}}
for(const a of TP_ARTS){if(!/^k-[a-z0-9-]+$/.test(a.id||''))console.log('警告: ARTSのidは k-英数字 にする:',a.id);if(ids.has(a.id))console.log('警告: ARTSのidが重複:',a.id);ids.add(a.id);
 for(const f of ['kind','t','d','lead','body'])if(!a[f])console.log('警告: ARTSに',f,'がない:',a.id);if(!['選挙プレビュー','自治体ウォッチ','コラム','解説'].includes(a.kind))console.log('警告: ARTSのkindが不正:',a.id,a.kind);if(!/出典/.test(a.body||''))console.log('警告: ARTSの本文に出典の節がない:',a.id);}
{const h=(TP_FEAT.href||'').slice(1);if(!(h==='a-uscr'||h==='news-all'||h==='kiji'||ids.has(h)||COLS.some(c=>c.id===h)||E.some(e=>e.id===h)))console.log('警告: FEATUREのリンク先がない:',TP_FEAT.href);if(!TP_FEAT.bar||!TP_FEAT.t||!(TP_FEAT.kv||[]).length)console.log('警告: FEATUREの項目が足りない');}
console.log('ニュース',TP_DAILY.length,'日分／特集・解説',TP_ARTS.length,'件');
console.log('選挙',E.filter(e=>!e.smp).length,'件／ページ',out.length,'／エラー',bad.length,'／重複',dup.join(',')||'なし');
if(bad.length)throw new Error('表示にundefined/NaNがあります');`;
vm.runInContext(data+'\n'+app.trim().replace(/\}\s*$/,test+'}'),ctx);
