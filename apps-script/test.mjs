// 受付サーバーの原稿解析と jin.js 書き換えの確認: node apps-script/test.mjs
import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import assert from 'node:assert/strict';
const dir=path.dirname(new URL(import.meta.url).pathname),root=path.resolve(dir,'..');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(dir,'Code.gs'),'utf8'),ctx);
const jin=fs.readFileSync(path.join(root,'jin.js'),'utf8');
const JIN=new Function(jin+';return JIN')();
const cur=JSON.parse(JSON.stringify(ctx.blockOf(jin,'ishioka-inoue-kouhei')));
assert.ok(cur,'井上さんの囲みが読める');

// 2026-11-27 に届いた井上さんの原稿（フォームの f-pol / f-act に入っていた文）
const pol=`石岡で生まれ、石岡で育ちました。
石岡に生まれたことを、可能性に変えたい。学ぶ場所も、働く場所も、誇れる場所も、石岡で選べるように。

【12の地域政策】
${cur.pol.map(p=>p[0]+'\n'+p[1].join('\n')).join('\n\n')}`;
const act=`・1985年生まれ、41歳。石岡市総社生まれ・石岡育ち
・石岡獅子舞連合会 本部役員として祭りの現場に立つ。石岡の幌獅子をすべての町内に動かすことが目標
・石岡商工会議所青年部
・大手通信会社で通信インフラとまちづくりを経験
・2026年10月25日 事務所開き
・2026年11月 活動レポート（地域政策討議資料）発行

【SNS】
公式サイト https://www.inoue-kouhei.space/
Instagram https://www.instagram.com/inouekohei1985/
YouTube https://www.youtube.com/@inouekouhei1985
LINE https://lin.ee/Xn60ODO`;
const p=ctx.parseManuscript(pol,act);
assert.equal(p.pol.length,12);
assert.deepEqual(JSON.parse(JSON.stringify(p.pol)),cur.pol,'政策12項目が手作業の掲載と同じ');
assert.equal(p.msg,cur.msg,'メッセージが同じ');
assert.deepEqual(JSON.parse(JSON.stringify(p.sns)),cur.sns,'SNSが同じ');
// 略歴と重なる行は活動実績から外れる（publish と同じ処理）
const ck=cur.career.map(ctx.normLine);
const a2=p.act.split('\n').filter(l=>!ck.includes(ctx.normLine(l))).join('\n').trim();
console.log('活動実績（略歴と重複を除く）:\n'+a2);

// jin.js の書き換え：更新と追加。ほかの行は変わらない
const upd=ctx.putBlock(jin,{...cur,copy:'テスト'});
assert.equal(new Function(upd+';return JIN')()[0].copy,'テスト');
assert.equal(upd.split('\n').length,jin.split('\n').length);
const add=ctx.putBlock(jin,{id:'test-taro',n:'テスト太郎'});
const J2=new Function(add+';return JIN')();
assert.equal(J2.length,JIN.length+1);assert.equal(J2[1].n,'テスト太郎');
assert.ok(add.startsWith(jin.slice(0,jin.lastIndexOf('];'))));

// 告示日〜投票日の停止
const data=fs.readFileSync(path.join(root,'data.js'),'utf8');
assert.equal(ctx.freezeIn(data,['茨城県議会議員選挙'],'2026-12-03'),'');
assert.match(ctx.freezeIn(data,['茨城県議会議員選挙'],'2026-12-04'),/告示2026-12-04〜投票2026-12-13/);
assert.match(ctx.freezeIn(data,['茨城県議会議員選挙'],'2026-12-13'),/茨城県議会/);
assert.equal(ctx.freezeIn(data,['茨城県議会議員選挙'],'2026-12-14'),'');
// YouTube
assert.equal(ctx.ytId('https://www.youtube.com/watch?v=abcDEF12345'),'abcDEF12345');
assert.equal(ctx.ytId('https://youtu.be/abcDEF12345?si=x'),'abcDEF12345');
assert.equal(ctx.ytId('https://www.youtube.com/@inouekouhei1985'),'');
// 番号のない原稿はすべてメッセージ
assert.equal(ctx.parseManuscript('くらしの声を議会へ。\n\nよろしくお願いします。','').msg,'くらしの声を議会へ。\n\nよろしくお願いします。');
console.log('OK すべての確認に通りました');
