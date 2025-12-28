# Stripe Webhook設定ガイド（ローカル開発環境）

## 問題の概要

**現象:**
- 注文作成とStripe決済は成功している
- しかし、ledgerエントリ（売上台帳）が作成されていない
- stripe_payment_intent_id、stripe_charge_id等が更新されていない

**原因:**
ローカル開発環境（localhost:3000）で実行しているため、Stripeのサーバーから直接webhookイベントを受信できない。

**解決策:**
Stripe CLIを使用してwebhookイベントをlocalhostにトンネリングする。

---

## 解決手順

### Step 1: Stripe CLIにログイン

```bash
stripe login
```

ブラウザが開き、Stripeアカウントでの認証を求められます。

### Step 2: Webhookリスナーを起動

新しいターミナルウィンドウを開いて、以下のコマンドを実行します：

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

**重要:** このコマンドを実行すると、以下のような出力が表示されます：

```
> Ready! You are using Stripe API Version [2023-10-16]. Your webhook signing secret is whsec_xxxxxxxxxxxxx (^C to quit)
```

この`whsec_xxxxxxxxxxxxx`の部分が**新しいwebhook secret**です。

### Step 3: Webhook Secretを.envに設定

上記で取得したwebhook secretを`.env`ファイルに設定します：

```.env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

**注意:** Stripe CLIのwebhook secretは、`stripe listen`を実行するたびに変わる可能性があります。

### Step 4: アプリケーションを再起動

.envを更新したら、Node.jsアプリケーションを再起動します：

```bash
# 現在実行中のプロセスを停止（Ctrl+C）
# その後、再起動
npm start
# または
node server.js
```

---

## テスト手順

### 1. Stripe CLIでイベントをトリガー（テスト用）

別のターミナルで、以下のコマンドを実行してテストイベントを送信できます：

```bash
# checkout.session.completedイベントをトリガー
stripe trigger checkout.session.completed
```

### 2. 実際の注文でテスト

1. アプリケーションで新しい注文を作成
2. Stripe Checkoutで決済を完了
3. Stripe CLIを実行しているターミナルで、以下のようなログが表示されるはずです：

```
2024-01-01 12:34:56   --> checkout.session.completed [evt_xxxxx]
2024-01-01 12:34:56  <--  [200] POST http://localhost:3000/webhooks/stripe [evt_xxxxx]
```

4. アプリケーションログ（logs/combined.log）を確認：

```bash
tail -f logs/combined.log | grep -i "webhook\|ledger\|checkout"
```

期待されるログ：
- ✅ "Stripe webhook signature verified"
- ✅ "Checkout session completed"
- ✅ "Ledger entries created for order"
- ✅ "Sale and fee recorded in ledger successfully"

### 3. データベースで確認

```sql
-- 最新の注文を確認
SELECT
  id, order_number, seller_id, total, payment_status,
  stripe_payment_intent_id, stripe_charge_id,
  ledger_sale_id, ledger_fee_id
FROM orders
ORDER BY created_at DESC LIMIT 1;

-- ledgerエントリを確認
SELECT
  l.id, l.type, l.amount_cents, l.status,
  o.order_number, p.name as partner_name
FROM ledger l
JOIN orders o ON o.id = l.order_id
JOIN partners p ON p.id = l.partner_id
ORDER BY l.created_at DESC LIMIT 5;
```

期待される結果：
- ✅ stripe_payment_intent_id, stripe_charge_idが設定されている
- ✅ ledger_sale_id, ledger_fee_idが設定されている
- ✅ ledgerテーブルに2つのエントリ（sale, platform_fee）が作成されている

---

## トラブルシューティング

### 問題: "Webhook signature verification failed"

**原因:**
- Stripe CLIが実行されていない
- .envのSTRIPE_WEBHOOK_SECRETが古い
- アプリケーションを再起動していない

**解決:**
1. `stripe listen`が実行中か確認
2. `stripe listen`の出力から最新のwebhook secretを取得
3. .envを更新
4. アプリケーションを再起動

### 問題: Stripe CLIで "Ready!" と表示されるが、イベントが届かない

**原因:**
- アプリケーションが実行されていない
- ポートが間違っている

**解決:**
1. `http://localhost:3000`でアプリケーションにアクセスできるか確認
2. Stripe CLIの`--forward-to`オプションが正しいか確認

### 問題: ledgerエントリは作成されるが、seller_idがNULL

**原因:**
- 古い注文データ（修正前に作成されたもの）

**解決:**
- 新しい注文を作成してテスト
- 既存の注文は、マイグレーション007で修正済み

---

## 本番環境への移行

本番環境（Render、Heroku等）にデプロイする場合：

1. **Stripeダッシュボードでwebhookエンドポイントを設定:**
   - URL: `https://your-domain.com/webhooks/stripe`
   - イベント: `checkout.session.completed`

2. **Webhook secretを取得:**
   - Stripeダッシュボードから取得したsecretを使用

3. **環境変数を設定:**
   ```
   STRIPE_WEBHOOK_SECRET=whsec_本番用のsecret
   ```

4. **Stripe CLIは使用しない:**
   - 本番環境では、Stripeが直接公開URLにwebhookを送信

---

## チェックリスト

開発環境でのwebhook設定：
- [ ] Stripe CLIがインストールされている（`stripe --version`）
- [ ] Stripe CLIにログインしている（`stripe login`）
- [ ] `stripe listen --forward-to localhost:3000/webhooks/stripe`が実行中
- [ ] .envのSTRIPE_WEBHOOK_SECRETが最新
- [ ] アプリケーションが実行中（`http://localhost:3000`）
- [ ] 新しい注文でテスト済み
- [ ] ログで"Ledger entries created"を確認
- [ ] データベースでledgerエントリを確認

---

## 参考リンク

- [Stripe CLI Documentation](https://docs.stripe.com/stripe-cli)
- [Stripe Webhooks Guide](https://docs.stripe.com/webhooks)
- [Testing Webhooks with Stripe CLI](https://docs.stripe.com/webhooks/test)
