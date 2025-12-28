# Stripe Connect 送金システム クイックスタートガイド

すぐにテストを開始するための最短手順です。

## 🚀 5ステップで開始

### ステップ 1: データベースマイグレーション実行（1分）

```bash
# PostgreSQL接続文字列を環境変数に設定
export PGURL="postgresql://setsumarudb_user:rsw8uBWkcnoSaQMjII0238nHfCs9W48k@dpg-d4k2cea4d50c73d7htd0-a.oregon-postgres.render.com:5432/setsumarudb?sslmode=require"

# マイグレーション実行
psql "$PGURL" -v ON_ERROR_STOP=1 -f migrations/005_stripe_connect_payout_system.sql

# 成功メッセージ確認
# "ALTER TABLE" や "CREATE TABLE" が複数表示されればOK
```

### ステップ 2: Stripe Dashboardでの設定（5分）

#### 2-1. Stripe Dashboard にログイン
- テスト環境: https://dashboard.stripe.com/test/dashboard

#### 2-2. Connect を有効化
1. 左メニュー「Connect」→「Get started」をクリック
2. プラットフォーム情報を入力（会社名など）
3. 「Continue」をクリック

#### 2-3. Client ID を取得
1. 「Settings」→「Connect settings」に移動
2. 「OAuth settings」セクションの **Test mode client ID** をコピー
   - `ca_` で始まる文字列です

#### 2-4. Webhook を設定
1. 「Developers」→「Webhooks」→「Add endpoint」をクリック
2. エンドポイントURL: `http://localhost:3000/webhook`
   - **ローカルテスト用には Stripe CLI を使用（推奨）**
3. イベントを選択:
   - ✅ `checkout.session.completed`
   - ✅ `charge.refunded`
   - ✅ `account.updated`
4. Webhook signing secret をコピー（`whsec_` で始まる）

**ローカルテスト用のStripe CLI設定（推奨）:**
```bash
# Stripe CLI のインストール（未インストールの場合）
brew install stripe/stripe-cli/stripe

# Stripeにログイン
stripe login

# Webhookをローカルにフォワード（新しいターミナルで実行）
stripe listen --forward-to localhost:3000/webhook

# ✓ Ready! ... と表示され、webhook signing secret (whsec_xxx) が表示されます
```

### ステップ 3: 環境変数の設定（1分）

`.env` ファイルに以下を追加:

```env
# Stripe Connect Client ID（ステップ2-3で取得）
STRIPE_CONNECT_CLIENT_ID=ca_XXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Webhook Secret（Stripe CLIの場合は表示されたもの）
STRIPE_WEBHOOK_SECRET=whsec_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# 既存の設定も確認
STRIPE_SECRET_KEY=sk_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### ステップ 4: サーバー起動（1分）

```bash
# サーバーを起動（または再起動）
npm start

# ブラウザで http://localhost:3000 にアクセス
# 管理者としてログイン
```

### ステップ 5: 画面上でテスト開始

#### 5-1. 出品者詳細ページへ移動
1. 管理画面 → 取引先一覧
2. テスト対象の出品者をクリック

#### 5-2. Stripe Connect アカウント接続
1. **「Stripe Connect 送金設定」** カードを確認
2. 「Stripe アカウントを接続」ボタンをクリック
3. Stripeのオンボーディング画面で情報入力:
   - **テストモードの場合**: ダミーデータでOK
   - 氏名、生年月日、住所、銀行口座情報など
4. 完了後、元のページに戻る
5. バッジが「本人確認完了」「決済可能」「送金有効」になることを確認

#### 5-3. テスト注文の作成
1. 一般ユーザーとしてログイン（またはゲスト購入）
2. 対象出品者の商品をカートに追加
3. チェックアウトページでStripe決済
   - **テストカード**: `4242 4242 4242 4242`
   - 有効期限: 未来の日付（例: 12/34）
   - CVC: 任意の3桁（例: 123）
4. 決済完了を確認

#### 5-4. 台帳の確認
1. 出品者詳細ページに戻る
2. 「残高・台帳を確認」ボタンをクリック
3. 以下が表示されることを確認:
   - **売上エントリ**: +注文金額（ステータス: 保留中）
   - **手数料エントリ**: -手数料額（ステータス: 保留中）

#### 5-5. 配送完了と送金可能化
1. 管理画面 → 注文詳細ページ
2. 配送ステータスを「配送完了」に変更
3. 台帳ページを再確認:
   - ステータスが「送金可能」に変更されている
   - 送金可能日が表示されている（7日後）

**テスト用に即座に送金可能にする場合:**
```sql
-- PostgreSQLで以下のクエリを実行
UPDATE ledger
SET available_at = now()
WHERE partner_id = 'YOUR_PARTNER_ID'
  AND status = 'available';
```

#### 5-6. 送金バッチの実行
```bash
# scripts/payout-batch.js を実行
node scripts/payout-batch.js

# 結果を確認:
# - 送金可能額が 3,000円 以上の場合、送金が実行される
# - Stripe Dashboard で Payout が作成されたことを確認
```

**注意**: 本日が月曜日かつISO週番号が偶数でない場合、スキップされます。テスト用に `isValidPayoutDay` 関数を一時的に修正してください（`TESTING_GUIDE.md` 参照）。

#### 5-7. 返金テスト（オプション）
1. 注文詳細ページから「返金」ボタンをクリック
2. 返金額と理由を入力して実行
3. 台帳に返金エントリ（マイナス値）が追加されることを確認
4. 残高がマイナスの場合、負債として記録される

---

## ✅ 動作確認チェックリスト

- [ ] データベースマイグレーション成功
- [ ] Stripe Connect Client ID を `.env` に設定
- [ ] Webhook Secret を `.env` に設定
- [ ] サーバー起動成功
- [ ] 出品者詳細ページに「Stripe Connect 送金設定」カードが表示される
- [ ] Stripeオンボーディング完了（本人確認完了）
- [ ] テスト注文の決済成功
- [ ] 台帳に売上・手数料エントリが記録される
- [ ] 配送完了後、ステータスが「送金可能」に変更される
- [ ] 送金バッチ実行成功
- [ ] Stripe Dashboard で Payout 確認

---

## 🆘 トラブルシューティング

### エラー: "STRIPE_CONNECT_CLIENT_ID is not set"
→ `.env` ファイルに `STRIPE_CONNECT_CLIENT_ID` が設定されているか確認
→ サーバーを再起動

### Stripe Connect オンボーディングボタンをクリックしても反応しない
→ ブラウザの開発者ツール（Console）でエラーを確認
→ CSRFトークンが正しく設定されているか確認

### Webhook が処理されない
→ Stripe CLI で `stripe listen` を実行しているか確認
→ Webhook signing secret が正しく設定されているか確認
→ ログファイル（`logs/combined.log`）でエラーを確認

### 台帳にエントリが作成されない
→ Webhookが正常に処理されているか確認
→ `checkout.session.completed` イベントがトリガーされているか確認
→ データベースのledgerテーブルを直接確認

### 送金バッチが実行されない
→ 本日が月曜日かつISO週番号が偶数か確認
→ 送金可能額が 3,000円 以上あるか確認
→ 出品者の `payouts_enabled` が `true` か確認
→ テスト用に `isValidPayoutDay` 関数を修正

---

## 📚 詳細ドキュメント

- **完全なテスト手順**: `TESTING_GUIDE.md`
- **Cron設定**: `CRON_SETUP.md`
- **実装計画**: `STRIPE_CONNECT_IMPLEMENTATION_PLAN.md`

---

## 💡 次のステップ

全てのテストが成功したら:

1. 本番環境用の設定を準備
   - 本番用の Stripe API キー
   - 本番用の Webhook エンドポイント
   - 本番用の Client ID

2. Cron ジョブを設定
   - 毎週月曜日 9:00 AM に自動実行

3. 監視・アラートの設定
   - payout_runs テーブルの監視
   - エラー発生時の通知

4. ドキュメントの整備
   - 運用手順書
   - エラー対応手順書

---

**テストを楽しんでください！** 🎉
