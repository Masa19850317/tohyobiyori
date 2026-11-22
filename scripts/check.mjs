// データ確認スクリプト: node scripts/check.mjs
// data.js と index.html のスクリプトを読み込み、全ページを描画して壊れていないか確認します。
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
const dir=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const data=fs.readFileSync(path.join(dir,'data.js'),'utf8');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const app=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(t=>t.includes('function route'));
const el=()=>({innerHTML:'',textContent:'',hidden:true,classList:{add(){},remove(){},toggle(){}},setAttribute(){},dataset:{},value:'',scrollIntoView(){}});
const ctx={document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){},getElementById:el,title:''},location:{hash:''},addEventListener(){},window:{scrollTo(){}},scrollTo(){},matchMedia:()=>({matches:false}),MutationObserver:class{observe(){}},console};
vm.createContext(ctx);
const test=`;const out=[home(),plans(),edit(),search()];E.forEach(e=>out.push(election(e)));
const bad=out.filter(h=>/undefined|NaN/.test(h));
const seen={};const dup=E.filter(e=>!e.smp&&(seen[e.name+e.date]=(seen[e.name+e.date]||0)+1)>1).map(e=>e.name);
for(const [k,d] of Object.entries(DIST)){if(!E.some(e=>e.name===k))console.log('警告: DISTの選挙名が日程にない:',k);
 for(const [c,x] of Object.entries(d.cands||{}))if(x&&x.c)for(const r of x.c.split('\\n')){const f=r.split('|');if(f.length===6||f.length>7||(f.length===7&&(f[6]!==''&&f[6]!=='当'||f[5]!==''&&isNaN(+f[5]))))console.log('警告: 候補者行の列数・得票欄が不正（氏名|年齢|党派|新現元|備考|得票数|当）:',k,c,r);}
 for(const c of Object.keys(d.cands||{}))if(!d.list.split('\\n').some(l=>l.split('|')[0]===c))console.log('警告: 候補者の選挙区名が一覧にない:',k,c);}
console.log('選挙',E.filter(e=>!e.smp).length,'件／ページ',out.length,'／エラー',bad.length,'／重複',dup.join(',')||'なし');
if(bad.length)throw new Error('表示にundefined/NaNがあります');`;
vm.runInContext(data+'\n'+app.trim().replace(/\}\s*$/,test+'}'),ctx);
