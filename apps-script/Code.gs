/**
 * 投票日和 受付サーバー（Google Apps Script）
 *
 * サイトの「陣営ページの編集」「陣営プランのお申し込み」「無料会員登録」の送信先です。
 *  - 原稿と写真を受け取り、Google スプレッドシート（受付・契約）と Google ドライブに保存します
 *  - 契約済みの陣営（「契約」シートに氏名とメールが登録済み）の原稿は、登録メールに確認リンクを送り、
 *    陣営がリンクを押すと jin.js と img/ を GitHub にコミットして自動で公開します
 *  - 初めての陣営の原稿は、運営に「承認して公開」リンクを送ります（入金・本人確認のあと押す）
 *  - 告示日から投票日までは公開を止めます（利用規約どおり）。投票日の翌日以降に運営が再開します
 *
 * 設置手順は apps-script/README.md を見てください。
 * スクリプト プロパティ：GH_TOKEN（必須）, ADMIN_MAIL（必須）, GH_REPO, GH_BRANCH, SITE, AUTO_PUBLISH
 * （SECRET・SHEET_ID・FOLDER_ID は setup() が作ります）
 */

const DEF = {GH_REPO: 'Masa19850317/tohyobiyori', GH_BRANCH: 'main', SITE: 'https://tohyobiyori.jp', AUTO_PUBLISH: 'true'};
function cfg(k) { return PropertiesService.getScriptProperties().getProperty(k) || DEF[k] || ''; }

/* ───────── 初回だけ実行 ───────── */
function setup() {
  const pr = PropertiesService.getScriptProperties();
  if (!pr.getProperty('SECRET')) pr.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  if (!pr.getProperty('SHEET_ID')) {
    const ss = SpreadsheetApp.create('投票日和 受付');
    const a = ss.getSheets()[0]; a.setName('受付');
    a.appendRow(['受付日時', '受付番号', '種類', '氏名', 'メール', '電話', 'プラン', '状態', '内容(JSON)', '写真ファイルID', 'ページID']);
    const c = ss.insertSheet('契約');
    c.appendRow(['ページID', '氏名', 'メール', '電話', '登録日', 'メモ']);
    // 手作業で掲載済みの陣営（リポジトリは公開なので、メール・電話はシートに直接入れる）
    c.appendRow(['ishioka-inoue-kouhei', '井上耕兵', '', '', '2026-11-27', '受付番号 TE26112799YV。メール欄に申込メールのアドレスを入れる']);
    ss.insertSheet('会員').appendRow(['登録日時', 'メール', '郵便番号']);
    pr.setProperty('SHEET_ID', ss.getId());
  }
  if (!pr.getProperty('FOLDER_ID')) pr.setProperty('FOLDER_ID', DriveApp.createFolder('投票日和 陣営写真').getId());
  // GitHub につながるか確認
  const r = ghGet('jin.js');
  Logger.log('GitHub: ' + (r ? 'OK（jin.js を読めました）' : '読めません。GH_TOKEN と GH_REPO を確認してください'));
  Logger.log('スプレッドシート: https://docs.google.com/spreadsheets/d/' + pr.getProperty('SHEET_ID'));
}

/* ───────── 受け取り ───────── */
function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (_) { return json({ok: false, msg: '送信内容を読み取れませんでした'}); }
  if (d.hp) return json({ok: true, msg: ''}); // ボット対策（見えない入力欄）
  if (e.postData.contents.length > 4e6) return json({ok: false, msg: '送信内容が大きすぎます（写真を小さくしてください）'});
  try {
    if (d.type === 'edit') return json(handleEdit(d));
    if (d.type === 'apply') return json(handleApply(d));
    if (d.type === 'join') return json(handleJoin(d));
    return json({ok: false, msg: '種類が不明です'});
  } catch (err) {
    notifyAdmin('【投票日和】受付エラー', String(err && err.stack || err) + '\n\n' + JSON.stringify(strip(d)).slice(0, 5000));
    return json({ok: false, msg: '受付でエラーが起きました。時間をおいてもう一度お試しください'});
  }
}

function handleEdit(d) {
  const s = clean(d);
  if (!s.n || !/@/.test(s.mail)) return {ok: false, msg: '氏名とメールアドレスを入力してください'};
  const sub = {id: /^TE\d{6}[A-Z0-9]{4}$/.test(d.id || '') ? d.id : newId('TE'), plan: d.plan === 'pre' ? 'pre' : d.plan === 'lite' ? 'lite' : 'free', ...s};
  let photoId = '';
  if (/^data:image\/(jpeg|png);base64,/.test(d.photo || '')) {
    const [head, b64] = d.photo.split(',');
    const type = head.slice(5, head.indexOf(';'));
    photoId = DriveApp.getFolderById(cfg('FOLDER_ID')).createFile(Utilities.newBlob(Utilities.base64Decode(b64), type, sub.id + (type === 'image/png' ? '.png' : '.jpg'))).getId();
  }
  const ct = contractOf(sub.n);
  const parsed = parseManuscript(sub.pol, sub.act);
  const summary = manuscriptText(sub, parsed, !!photoId);
  const row = addRow([now(), sub.id, '原稿', sub.n, sub.mail, sub.tel, sub.plan, '', JSON.stringify(sub), photoId, ct ? ct.id : '']);

  if (sub.plan !== 'pre') {
    setStatus(row, '運営確認（' + sub.plan + '）');
    notifyAdmin('【投票日和】原稿（' + sub.plan + '）' + sub.id + ' ' + sub.n, 'フリー／ライトの原稿は自動公開の対象外です。内容を確認して data.js に反映してください。\n\n' + summary);
    return {ok: true, msg: '受け付けました。運営が確認してから反映します。'};
  }
  if (ct && ct.mail.toLowerCase() === sub.mail.toLowerCase() && cfg('AUTO_PUBLISH') === 'true') {
    const fz = freezeFor(ct.id);
    if (fz) {
      setStatus(row, '保留（告示期間中：' + fz + '）');
      notifyAdmin('【投票日和】告示期間中の原稿（保留）' + sub.id + ' ' + sub.n, fz + ' の告示日〜投票日のため公開を止めています。投票日の翌日以降、スプレッドシートの受付番号 ' + sub.id + ' を確認してください。\n\n' + summary);
      return {ok: true, msg: '受け付けました。告示日から投票日までは内容を変更できないため、投票日の翌日以降に反映します。'};
    }
    setStatus(row, '本人確認待ち');
    const link = webUrl() + '?a=confirm&s=' + sub.id + '&t=' + sign('confirm', sub.id);
    MailApp.sendEmail({to: ct.mail, name: '投票日和', subject: '【投票日和】陣営ページの公開確認 ' + sub.id,
      body: sub.n + ' 様\n\n陣営ページの原稿を受け付けました（受付番号 ' + sub.id + '）。\n下のリンクを開き「公開する」を押すと、数分でサイトに反映されます。\n\n' + link +
        '\n\nお心当たりがない場合は、このメールを破棄し、運営（' + cfg('ADMIN_MAIL') + '）までご連絡ください。\n\n――― 受け付けた内容 ―――\n' + summary});
    notifyAdmin('【投票日和】原稿受付（陣営の確認待ち）' + sub.id + ' ' + sub.n, '契約済みの陣営です。登録メール ' + ct.mail + ' に確認リンクを送りました。陣営が押すと自動で公開されます。\n\n' + summary);
    return {ok: true, msg: '受け付けました。登録済みのメールアドレスに確認メールを送りました。メールのリンクから「公開する」を押すと、数分でサイトに反映されます。'};
  }
  // 初めての陣営、または登録メールと違うアドレス
  setStatus(row, '運営承認待ち');
  const warn = ct ? '⚠ 契約済みの「' + ct.n + '」と同じ氏名ですが、メールアドレスが登録（' + ct.mail + '）と違います。なりすましの可能性があるので、ご本人に電話で確認してください。\n\n' : '';
  notifyAdmin('【投票日和】新しい陣営の原稿 ' + sub.id + ' ' + sub.n,
    warn + '入金と本人確認が済んだら、下のリンクから掲載情報（ページID・選挙・契約期間など）を確認して「承認して公開」を押してください。\n\n' +
    webUrl() + '?a=approve&s=' + sub.id + '&t=' + sign('approve', sub.id) + '\n\n' + summary);
  return {ok: true, msg: '受け付けました。運営が本人確認（お電話）と内容の確認をしてから公開します。'};
}

function handleApply(d) {
  const s = {};
  ['id', 'tier', '区分', '支払方法', 'name', 'area', 'st', 'who', 'mail', 'tel', 'memo', 'at', 'message'].forEach(k => s[k] = str(d[k], 4000));
  if (!s.name || !/@/.test(s.mail)) return {ok: false, msg: 'お名前とメールアドレスを入力してください'};
  addRow([now(), s.id || newId('TB'), '申込', s.name, s.mail, s.tel, s.tier, '入金・本人確認待ち', JSON.stringify(s), '', '']);
  notifyAdmin('【投票日和】陣営プラン申込 ' + s.id + ' ' + s.name, s.message || JSON.stringify(s, null, 1));
  MailApp.sendEmail({to: s.mail, name: '投票日和', subject: '【投票日和】陣営プランのお申し込みを受け付けました ' + s.id,
    body: s.name + ' 様\n\nお申し込みありがとうございます。運営から本人確認のお電話とお支払いのご案内をします。\n\n' + (s.message || '')});
  return {ok: true, msg: ''};
}

function handleJoin(d) {
  const mail = str(d.email, 200), zip = str(d.zip, 10).replace(/\D/g, '');
  if (!/@/.test(mail)) return {ok: false, msg: 'メールアドレスを入力してください'};
  SpreadsheetApp.openById(cfg('SHEET_ID')).getSheetByName('会員').appendRow([now(), mail, zip]);
  return {ok: true, msg: ''};
}

/* ───────── リンクから開く画面 ───────── */
function doGet(e) {
  const a = e.parameter.a, s = e.parameter.s, t = e.parameter.t;
  if (!a || !s || !t || t !== sign(a, s)) return page('リンクが正しくありません', '<p>メールのリンクをもう一度開いてください。</p>');
  const r = findRow(s);
  if (!r) return page('受付が見つかりません', '');
  const sub = JSON.parse(r.v[8]);
  const st = r.v[7];
  if (/^公開済み/.test(st)) return page('公開済みです', '<p><a href="' + cfg('SITE') + '/#j-' + r.v[10] + '" target="_top">ページを見る</a></p>');
  const parsed = parseManuscript(sub.pol, sub.act);
  const photo = r.v[9] ? photoDataUrl(r.v[9]) : '';
  const pre = '<div class="box">' + (photo ? '<img src="' + photo + '" style="width:120px;border-radius:10px;float:right;margin-left:10px">' : '') +
    '<b>' + h(sub.n) + '</b><br>' + h(sub.kata) + '<br><span class="bub">' + h(sub.copy) + '</span><br>政策 ' + parsed.pol.length + '項目／SNS ' + parsed.sns.length + '件' + (photo ? '／写真あり' : '／写真なし') + '<div style="clear:both"></div></div>' +
    '<details><summary>原稿の全文</summary><pre>' + h(manuscriptText(sub, parsed, !!photo)) + '</pre></details>';
  const btn = (label, call) => '<button id="go" onclick="this.disabled=true;this.textContent=\'公開しています…\';' + call +
    '">' + label + '</button><p id="msg"></p><script>function ok(m){document.getElementById("msg").innerHTML=m;document.getElementById("go").textContent="完了"}function ng(e){document.getElementById("msg").textContent="エラー："+(e&&e.message||e);var b=document.getElementById("go");b.disabled=false;b.textContent="もう一度"}</script>';
  if (a === 'confirm') {
    return page('陣営ページを公開します', pre + btn('公開する', 'google.script.run.withSuccessHandler(ok).withFailureHandler(ng).publishConfirmed(' + JSON.stringify(s) + ',' + JSON.stringify(t) + ')'));
  }
  if (a === 'approve') {
    const jf = r.v[10] && ghGet('jin.js'), ex = jf ? (blockOf(jf.text, r.v[10]) || {}) : {};
    const guess = guessMeta(sub);
    const m = Object.assign(guess, pick(ex, ['id', 'k', 'party', 'area', 'elect', 'tier', 'from', 'until', 'career']));
    const f = (k, label, v, ph) => '<label>' + label + '<input name="' + k + '" value="' + h(v || '') + '" placeholder="' + h(ph || '') + '"></label>';
    const tiers = [['kokusei', '国政'], ['shucho', '首長'], ['pref', '都道府県議会'], ['seirei', '政令市議会'], ['tokubetsu', '東京23区'], ['chukaku', '中核市議会'], ['shi', '一般市議会'], ['chouson', '町村議会']];
    const form = '<form id="f" onsubmit="return false">' +
      f('id', 'ページID（英小文字・数字・ハイフン。URL #j-○○ になる）', m.id, '例：ishioka-inoue-kouhei') +
      f('k', 'ふりがな', m.k, 'いのうえ こうへい') + f('party', '党派', m.party || '無所属') + f('area', '地域', m.area, '茨城県石岡市') +
      f('elect', '選挙名（data.js と同じ。複数は「,」区切り）', (m.elect || []).join(','), '茨城県議会議員選挙') +
      '<label>料金区分<select name="tier">' + tiers.map(x => '<option value="' + x[0] + '"' + (x[0] === m.tier ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
      f('from', '掲載開始日', m.from) + f('until', '掲載終了日', m.until) +
      '<label>略歴（1行1項目。空なら活動実績のみ）<textarea name="career" rows="4">' + h((m.career || []).join('\n')) + '</textarea></label></form>';
    return page('承認して公開', '<p class="warn">入金と本人確認（電話）が済んでいることを確かめてから押してください。</p>' + pre + form +
      btn('承認して公開', 'google.script.run.withSuccessHandler(ok).withFailureHandler(ng).publishApproved(' + JSON.stringify(s) + ',' + JSON.stringify(t) + ',Object.fromEntries(new FormData(document.getElementById(\'f\'))))'));
  }
  return page('不明な操作です', '');
}

/* 陣営が確認リンクから押す */
function publishConfirmed(s, t) {
  if (t !== sign('confirm', s)) throw new Error('リンクが正しくありません');
  const r = findRow(s); if (!r) throw new Error('受付が見つかりません');
  const sub = JSON.parse(r.v[8]);
  const ct = contractOf(sub.n);
  if (!ct || ct.mail.toLowerCase() !== sub.mail.toLowerCase()) throw new Error('契約情報と一致しません。運営にご連絡ください');
  const fz = freezeFor(ct.id);
  if (fz) { setStatus(r.row, '保留（告示期間中：' + fz + '）'); throw new Error('告示日から投票日までは変更できません（' + fz + '）。投票日の翌日以降に運営が反映します'); }
  const id = publish(sub, r, ct.id, null);
  return '公開しました。数分でサイトに反映されます。<br><a href="' + cfg('SITE') + '/#j-' + id + '" target="_top">ページを見る</a>';
}

/* 運営が承認リンクから押す */
function publishApproved(s, t, m) {
  if (t !== sign('approve', s)) throw new Error('リンクが正しくありません');
  const r = findRow(s); if (!r) throw new Error('受付が見つかりません');
  const sub = JSON.parse(r.v[8]);
  const meta = {
    id: String(m.id || '').trim(), k: str(m.k, 60), party: str(m.party, 40), area: str(m.area, 80), tier: str(m.tier, 20),
    elect: String(m.elect || '').split(/[,、，]/).map(x => x.trim()).filter(Boolean),
    from: String(m.from || '').trim(), until: String(m.until || '').trim(),
    career: String(m.career || '').split('\n').map(x => x.trim()).filter(Boolean)
  };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.id)) throw new Error('ページIDは英小文字・数字・ハイフンで入れてください');
  if (!meta.elect.length) throw new Error('選挙名を入れてください');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.from) || !/^\d{4}-\d{2}-\d{2}$/.test(meta.until)) throw new Error('掲載期間は YYYY-MM-DD で入れてください');
  const id = publish(sub, r, meta.id, meta);
  const ct = contractOf(sub.n);
  if (!ct) SpreadsheetApp.openById(cfg('SHEET_ID')).getSheetByName('契約').appendRow([id, sub.n, sub.mail, sub.tel, today(), '受付番号 ' + sub.id]);
  return '公開しました。数分でサイトに反映されます。次回からは陣営が送った原稿は、陣営のメール確認だけで自動公開されます。<br><a href="' + cfg('SITE') + '/#j-' + id + '" target="_top">ページを見る</a>';
}

/* ───────── 公開（GitHub にコミット） ───────── */
function publish(sub, r, id, meta) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const f = ghGet('jin.js'); if (!f) throw new Error('GitHub の jin.js を読めません');
    const ex = blockOf(f.text, id) || {};
    const p = parseManuscript(sub.pol, sub.act);
    const career = meta ? meta.career : (ex.career || []);
    const ck = career.map(normLine);
    const o = {
      id: id, n: sub.n, k: meta ? meta.k : ex.k || '',
      kata: sub.kata || ex.kata || '', party: meta ? meta.party : ex.party || '', area: meta ? meta.area : ex.area || '',
      elect: meta ? meta.elect : ex.elect || [], tier: meta ? meta.tier : ex.tier || '',
      from: meta ? meta.from : ex.from || today(), until: meta ? meta.until : ex.until || '',
      photo: ex.photo || '', copy: sub.copy, career: career, pol: p.pol, msg: p.msg,
      act: p.act.split('\n').filter(l => !ck.includes(normLine(l))).join('\n').trim(),
      sns: p.sns.length ? p.sns : (ex.sns || []), yt: ytId(sub.yt), src: '受付番号 ' + sub.id
    };
    if (r.v[9]) {
      const file = DriveApp.getFileById(r.v[9]);
      const path = 'img/' + id + '.jpg';
      const cur = ghGet(path);
      ghPut(path, Utilities.base64Encode(file.getBlob().getBytes()), cur && cur.sha, '陣営プラン写真：' + sub.n + '（' + sub.id + '）');
      o.photo = cfg('SITE') + '/' + path + '?v=' + Date.now().toString(36);
    }
    const next = putBlock(f.text, o);
    ghPut('jin.js', Utilities.base64Encode(next, Utilities.Charset.UTF_8), f.sha, '陣営プラン：' + sub.n + ' を' + (blockOf(f.text, id) ? '更新' : '掲載') + '（' + sub.id + '）');
    setStatus(r.row, '公開済み ' + now()); r.sh.getRange(r.row, 11).setValue(id);
    notifyAdmin('【投票日和】公開しました ' + sub.n + '（' + sub.id + '）', cfg('SITE') + '/#j-' + id);
    MailApp.sendEmail({to: sub.mail, name: '投票日和', subject: '【投票日和】陣営ページを公開しました', body: sub.n + ' 様\n\n陣営ページを公開しました（反映まで数分かかることがあります）。\n' + cfg('SITE') + '/#j-' + id});
    return id;
  } finally { lock.releaseLock(); }
}

/* ───────── 原稿の解析（テストあり：apps-script/test.mjs） ───────── */
// 政策：「1. 見出し」の行から次の空行までを1項目。番号のない文はメッセージ。【…】の行は見出しとして読み飛ばす
// 活動実績：【SNS】の下の「名前 URL」行を SNS に。それ以外は活動実績の本文
function parseManuscript(pol, act) {
  const pl = [], msg = []; let cur = null;
  String(pol || '').replace(/\r/g, '').split('\n').forEach(raw => {
    const l = raw.trim();
    if (!l || /^【.*】$/.test(l)) { cur = null; if (!l && msg.length && msg[msg.length - 1] !== '') msg.push(''); return; }
    const m = l.match(/^(\d{1,2})\s*[.．、)）]\s*(.+)$/);
    if (m) { cur = [m[1] + '. ' + m[2], []]; pl.push(cur); return; }
    if (cur) cur[1].push(l.replace(/^[・\-－*]\s*/, ''));
    else msg.push(l);
  });
  const sns = [], al = []; let inSns = false;
  String(act || '').replace(/\r/g, '').split('\n').forEach(raw => {
    const l = raw.trim();
    const hd = l.match(/^【(.*)】$/);
    if (hd) { inSns = /SNS|リンク|ホームページ|サイト/i.test(hd[1]); return; }
    const u = l.match(/https?:\/\/[^\s　]+/);
    if (inSns) { if (u) sns.push([l.replace(u[0], '').replace(/[:：\s　]+$/, '').trim() || hostOf(u[0]), u[0]]); return; }
    al.push(l);
  });
  return {pol: pl, msg: msg.join('\n').replace(/\n+$/, ''), act: al.join('\n').replace(/^\n+|\n+$/g, '').replace(/\n{3,}/g, '\n\n'), sns: sns};
}
function ytId(u) { const m = String(u || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{6,20})/); return m ? m[1] : (/^[\w-]{6,20}$/.test(String(u || '').trim()) ? String(u).trim() : ''); }
function hostOf(u) { return u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]; }
function normLine(s) { return String(s || '').trim().replace(/^[・\-－*]\s*/, '').replace(/[\s　]/g, ''); }

/* jin.js の1件ずつを「// <jin:ID>」〜「// </jin:ID>」で囲んで管理する */
function blockRe(id) { return new RegExp('// <jin:' + id.replace(/[^a-z0-9-]/g, '') + '>\\n([\\s\\S]*?)\\n// </jin:' + id.replace(/[^a-z0-9-]/g, '') + '>'); }
function blockOf(js, id) { const m = String(js).match(blockRe(id)); return m ? JSON.parse(m[1].replace(/,\s*$/, '')) : null; }
function putBlock(js, o) {
  const b = '// <jin:' + o.id + '>\n' + JSON.stringify(o, null, 1) + ',\n// </jin:' + o.id + '>';
  if (blockRe(o.id).test(js)) return js.replace(blockRe(o.id), () => b);
  if (!/\n\];\s*$/.test(js)) throw new Error('jin.js の末尾（];）が見つかりません');
  return js.replace(/\n\];\s*$/, () => '\n' + b + '\n];\n');
}

/* 告示日〜投票日なら選挙名を返す */
function freezeFor(id) {
  const f = ghGet('jin.js'); const ex = f && blockOf(f.text, id);
  if (!ex || !(ex.elect || []).length) return '';
  const d = UrlFetchApp.fetch('https://raw.githubusercontent.com/' + cfg('GH_REPO') + '/' + cfg('GH_BRANCH') + '/data.js', {muteHttpExceptions: true}).getContentText();
  return freezeIn(d, ex.elect, today());
}
function freezeIn(dataText, names, t) {
  for (const nm of names) {
    const re = new RegExp('^(\\d{4}-\\d{2}-\\d{2})\\|([\\d-]{5,10})\\|' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\|', 'm');
    const m = String(dataText).match(re); if (!m) continue;
    const vote = m[1]; let k = m[2];
    if (k.length === 5) k = (k > vote.slice(5) ? (+vote.slice(0, 4) - 1) : vote.slice(0, 4)) + '-' + k;
    if (k <= t && t <= vote) return nm + '（告示' + k + '〜投票' + vote + '）';
  }
  return '';
}

/* ───────── 承認画面の初期値 ───────── */
function guessMeta(sub) {
  const t = today(), u = new Date(Date.now() + 9 * 3600e3); u.setUTCMonth(u.getUTCMonth() + 6); u.setUTCDate(u.getUTCDate() - 1);
  let elect = [];
  try {
    const d = UrlFetchApp.fetch('https://raw.githubusercontent.com/' + cfg('GH_REPO') + '/' + cfg('GH_BRANCH') + '/data.js', {muteHttpExceptions: true}).getContentText();
    const names = [...new Set([...d.matchAll(/^\d{4}-[\d-]+\|[^|\n]*\|([^|\n]+)\|/gm)].map(x => x[1]))];
    elect = names.filter(n => String(sub.area).includes(n)).sort((a, b) => b.length - a.length).slice(0, 1);
  } catch (_) {}
  const e = elect[0] || '';
  const tier = /衆議院|参議院/.test(e) ? 'kokusei' : /長選挙/.test(e) ? 'shucho' : /[都道府県]議会/.test(e) ? 'pref' : /[町村]議会/.test(e) ? 'chouson' : /区議会/.test(e) ? 'tokubetsu' : /市議会/.test(e) ? 'shi' : 'pref';
  const area = String(sub.area).split(/[／\/]/)[0].trim();
  return {id: '', k: '', party: '無所属', area: area, elect: elect, tier: tier, from: t, until: u.toISOString().slice(0, 10), career: []};
}

/* ───────── GitHub ───────── */
function gh(method, path, body) {
  const r = UrlFetchApp.fetch('https://api.github.com/repos/' + cfg('GH_REPO') + '/contents/' + path.split('/').map(encodeURIComponent).join('/') + (method === 'get' ? '?ref=' + cfg('GH_BRANCH') : ''), {
    method: method, muteHttpExceptions: true, contentType: 'application/json',
    headers: {Authorization: 'Bearer ' + cfg('GH_TOKEN'), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'},
    payload: body ? JSON.stringify(body) : undefined
  });
  return {code: r.getResponseCode(), body: r.getContentText()};
}
function ghGet(path) {
  const r = gh('get', path);
  if (r.code !== 200) return null;
  const j = JSON.parse(r.body);
  return {sha: j.sha, text: Utilities.newBlob(Utilities.base64Decode(j.content.replace(/\n/g, ''))).getDataAsString('UTF-8')};
}
function ghPut(path, b64, sha, message) {
  const r = gh('put', path, {message: message + '\n\n受付サーバー（Apps Script）による自動公開', content: b64, sha: sha || undefined, branch: cfg('GH_BRANCH')});
  if (r.code !== 200 && r.code !== 201) throw new Error('GitHub への書き込みに失敗しました（' + r.code + '）' + r.body.slice(0, 200));
}

/* ───────── 小物 ───────── */
function clean(d) {
  return {n: str(d.n, 40), kata: str(d.kata, 80), area: str(d.area, 120), mail: str(d.mail, 200), tel: str(d.tel, 40),
    copy: str(d.copy, 40), pol: str(d.pol, 20000), act: str(d.act, 10000), yt: str(d.yt, 300)};
}
function str(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max); }
function strip(d) { const o = Object.assign({}, d); delete o.photo; return o; }
function pick(o, ks) { const r = {}; ks.forEach(k => { if (o[k] != null && o[k] !== '') r[k] = o[k]; }); return r; }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sign(a, s) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(a + '|' + s, cfg('SECRET'))).replace(/=+$/, ''); }
function webUrl() { return ScriptApp.getService().getUrl(); }
function now() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'); }
function today() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'); }
function newId(p) { return p + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyMMdd') + Utilities.getUuid().replace(/-/g, '').slice(0, 4).toUpperCase(); }
function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])); }
function notifyAdmin(subject, body) { MailApp.sendEmail({to: cfg('ADMIN_MAIL'), name: '投票日和 受付', subject: subject, body: body}); }
function sheet() { return SpreadsheetApp.openById(cfg('SHEET_ID')).getSheetByName('受付'); }
function addRow(v) { const sh = sheet(); sh.appendRow(v); return sh.getLastRow(); }
function setStatus(row, st) { sheet().getRange(row, 8).setValue(st); }
function findRow(id) {
  const sh = sheet(), v = sh.getDataRange().getValues();
  for (let i = v.length - 1; i >= 1; i--) if (v[i][1] === id) return {sh: sh, row: i + 1, v: v[i]};
  return null;
}
function contractOf(n) {
  const k = String(n).replace(/[\s　]/g, '');
  const v = SpreadsheetApp.openById(cfg('SHEET_ID')).getSheetByName('契約').getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][1]).replace(/[\s　]/g, '') === k && v[i][0]) return {id: String(v[i][0]), n: v[i][1], mail: String(v[i][2]).trim()};
  return null;
}
function photoDataUrl(fid) { try { const b = DriveApp.getFileById(fid).getBlob(); return 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()); } catch (_) { return ''; } }
function manuscriptText(s, p, photo) {
  return '受付番号: ' + s.id + '\nプラン: ' + s.plan + '\n氏名: ' + s.n + '\n肩書: ' + s.kata + '\n自治体・選挙: ' + s.area + '\nメール: ' + s.mail + '\n電話: ' + s.tel +
    '\n写真: ' + (photo ? 'あり（受信済み）' : 'なし') + '\nキャッチコピー: ' + s.copy + '\n\n【メッセージ】\n' + p.msg + '\n\n【政策 ' + p.pol.length + '項目】\n' +
    p.pol.map(x => x[0] + '\n' + x[1].join('\n')).join('\n\n') + '\n\n【活動実績】\n' + p.act + '\n\n【SNS】\n' + p.sns.map(x => x[0] + ' ' + x[1]).join('\n') + '\n\nYouTube: ' + s.yt;
}
function page(title, body) {
  return HtmlService.createHtmlOutput('<style>body{font-family:sans-serif;max-width:640px;margin:20px auto;padding:0 16px;line-height:1.7;color:#1b2333}h1{font-size:22px}.box{border:1px solid #d5dbe6;border-radius:12px;padding:12px;margin:12px 0}.bub{display:inline-block;background:#eef4ff;border-radius:10px;padding:2px 8px;margin-top:4px}label{display:block;margin:10px 0;font-size:14px}input,select,textarea{display:block;width:100%;font-size:16px;padding:8px;border:1px solid #c5ccd8;border-radius:8px;box-sizing:border-box}button{width:100%;font-size:18px;padding:14px;border:0;border-radius:12px;background:#1d5fd0;color:#fff;margin-top:12px}pre{white-space:pre-wrap;font-size:13px;background:#f5f7fb;padding:10px;border-radius:8px}.warn{background:#fff4e0;padding:10px;border-radius:8px}</style><h1>' + h(title) + '</h1>' + body)
    .setTitle('投票日和 ' + title).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
