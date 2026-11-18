# 陣営ログインの準備（Supabase）

陣営ログイン・編集・運営の承認画面は、Supabase（無料枠あり）を使います。
次の手順が終わるまで、サイトの「陣営ログイン」は「準備中」と表示されます。

## 1. プロジェクトを作る
1. https://supabase.com でアカウントを作り、「New project」を押す
2. 名前（例：tohyobiyori）、データベースのパスワード、リージョン「Northeast Asia (Tokyo)」を選んで作成する

## 2. データベースを設定する
1. 左メニュー「SQL Editor」を開く
2. このフォルダの `schema.sql` の中身をすべて貼り付けて「Run」を押す

## 3. ログインメールを設定する
1. 「Authentication」→「URL Configuration」の Site URL を `https://tohyobiyori.jp` にする
2. 「Authentication」→「Email Templates」→「Magic Link」の本文に、6桁のコードを入れる
   例：`<p>投票日和の確認コード：<strong>{{ .Token }}</strong></p><p>このコードをログイン画面に入力してください。</p>`
3. 本番では「Authentication」→「SMTP Settings」で独自のメール送信を設定する（Supabase 標準の送信は1時間に数通までの制限があります）

## 4. サイトとつなぐ
1. 「Project Settings」→「API」で **Project URL** と **anon public key** をコピーする
2. `index.html` の `const SB={url:'',key:''};` に入れる
   - anon key は公開してよい値です。**service_role key は絶対にサイトやチャットに書かない**でください

## 5. 運営（管理者）を登録する
1. サイトの「陣営ログイン」から、運営のメールアドレスで一度ログインする
2. Supabase の「Authentication」→「Users」で、そのユーザーの ID をコピーする
3. 「SQL Editor」で次を実行する（ID を置き換える）
   `insert into public.admins (user_id) values ('ここにID');`
4. サイトの `#admin` を開くと、陣営の申し込みを承認できます

## 仕組み
- 陣営はメールアドレスと確認コードでログインし、陣営登録を申し込む（状態：本人確認中）
- 運営が本人確認をして「承認済み」にし、プランを設定する（支払いとの自動連動は次の段階）
- 承認済みの陣営は、プランで使える項目を編集・保存できる。保存した内容は選挙ページの候補者欄と陣営ページ（`#k-ID`）にすぐ表示される
- 陣営は状態・プラン・運営メモを変更できない（データベース側で防いでいます）。プランで使えない項目は自動で空になります
