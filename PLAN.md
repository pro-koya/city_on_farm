Stripe 決済導入 実装タスク

0. 前提・方針
	•	カード情報は自社で保持しない（PCI負荷を避ける）
	•	Stripe Checkout でカード情報を収集（3DS/CVCはStripeが標準対応）
	•	決済状態の確定は Webhook を正 とする（フロントは参考）
	•	既存の orders に payment_status / payment_provider / payment_external_id / payment_txid 等がある前提で拡張
	•	まずは 単一注文（出品者別checkout） を決済対象とする（Connectは後回し）

⸻

1. 依存関係の追加

1-1. パッケージ
	•	stripe SDK を追加
	例）npm i stripe

1-2. 環境変数（開発/本番で分離）

.env（例）
	•	STRIPE_SECRET_KEY=sk_test_...
	•	STRIPE_WEBHOOK_SECRET=whsec_...
	•	APP_URL=http://localhost:3000（本番は https://…）
	•	STRIPE_SUCCESS_URL=/checkout/complete?no={ORDER_NO}（最終的にURL合成）
	•	STRIPE_CANCEL_URL=/checkout?seller={SELLER_ID}

2. DB設計（最小追加）

2-1. ordersに追加（なければ）
	•	payment_provider text（‘stripe’）
	•	payment_external_id text（Checkout Session ID or PaymentIntent ID）
	•	payment_txid text（Charge ID等）
	•	payment_status payment_status enum（既存利用）
	•	status order_status enum（既存利用）

2-2. インデックス追加（Webhook高速化）
	•	orders(payment_provider, payment_external_id) に index
	•	orders(order_number) に index（なければ）
	•	既にある orders.coupon_code indexは別途対応済み想定

SQL例：
CREATE INDEX IF NOT EXISTS ix_orders_payment_external
ON public.orders (payment_provider, payment_external_id);

CREATE INDEX IF NOT EXISTS ix_orders_order_number
ON public.orders (order_number);


3. サーバ側：Stripe クライアント初期化
	•	lib/stripe.js を作る（共通化）
	例）
const Stripe = require('stripe');
module.exports = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

4. 画面遷移：決済フロー設計

4-1. 現状フローに Stripe を挿入
	•	/checkout/confirm で注文をDBに作成（現状）
	•	支払い方法が card の場合：
	•	注文作成後に Stripe Checkout Session を作る
	•	orders.payment_provider='stripe'
	•	orders.payment_external_id = session.id
	•	orders.payment_status='unpaid'
	•	res.redirect(session.url) で Stripe へ遷移
	•	支払い方法が cod の場合：
	•	これまで通り /checkout/complete?no=... へ

⸻

5. Checkout Session 作成（/checkout/confirm 内）

5-1. line_items 生成
	•	DBに保存した order_items を参照して line_items を構築（改ざん防止）
	•	金額は 整数（JPY）
	•	商品名：title
	•	単価：price
	•	数量：quantity

5-2. 送料・割引の扱い（推奨）
	•	送料：Checkoutの shipping_options か line_items に “送料” として追加
	•	割引：最初は line_items に “割引” を負の金額で入れない（Stripe的に非推奨）
	•	まずは **Stripe側に割引を出さず、合計が一致するよう「注文合計=Stripe合計」**を最優先
	•	可能なら Stripe Coupon / Promotion Code に寄せる（将来）

※現段階の要件では「既存のクーポン適用済 totals を Stripe に反映」できればOK
実装は「商品合計 + 送料 - 割引 = Stripe請求額」になるよう line_items を組む（割引用 line_item を作る方式）

5-3. metadata に識別子を入れる
	•	metadata: { order_id, order_number, seller_id, user_id }
	•	Webhookで照合するため必須

5-4. success/cancel URL
	•	success: ${APP_URL}/checkout/complete?no=${orderNo}
	•	cancel: ${APP_URL}/checkout?seller=${sellerId}

⸻

6. Webhook 実装（最重要）

6-1. 受信用エンドポイント
	•	POST /webhooks/stripe
	•	Raw body を検証する必要がある（express.json()の前に）
	•	例：app.post('/webhooks/stripe', express.raw({type:'application/json'}), handler)
	•	stripe.webhooks.constructEvent(req.body, sig, webhookSecret) で検証

6-2. ハンドリング対象イベント（最低限）
	•	checkout.session.completed
	•	支払い成功（ただし非同期支払いの可能性もある）
	•	orders.payment_status='paid' に更新（または processing）
	•	payment_intent.succeeded
	•	最終成功として扱う
	•	payment_status='paid', status の更新もここを正にするのが安全
	•	payment_intent.payment_failed
	•	payment_status='failed'
	•	charge.refunded or refund.updated
	•	payment_status='refunded'（既存enumに合わせる）

6-3. DB更新のルール
	•	orders.payment_provider='stripe' AND payment_external_id=session.id で対象注文取得
	•	取得できない場合は metadata.order_number でも検索
	•	payment_txid は PaymentIntent / Charge ID を保存

6-4. 冪等性（必須）
	•	Webhookは複数回届く
	•	更新SQLは「同じ状態なら上書きしても安全」な形に
	•	可能なら stripe_events テーブルを作り event.id を保存して重複排除（推奨）
	•	最小構成なら「payment_external_id をキーに update」でも可

⸻

7. 注文ステータス（あなたのトリガーと整合）
	•	Webhookで payment_status を更新すると、既存トリガーで orders.status が変わる想定
	•	トリガー仕様に合わせて Webhook の更新値を統一
	•	成功：payment_status='paid'
	•	失敗：payment_status='failed'
	•	返金：payment_status='refunded'
	•	キャンセル：payment_status='canceled'（必要時）
	•	配送側は別運用（納品書や配送完了時に更新）

⸻

8. UI（最小変更）

8-1. checkout画面の支払い方法に「クレジットカード」を追加
	•	allowedPayments の設定に card を追加
	•	表示ラベル：クレジットカード

8-2. /checkout/complete の文言（任意）
	•	payment_method === 'card' の場合
	•	「決済が完了しました」または「決済確認中です（数分）」の説明
	•	Webhook遅延に備えて「処理中」の表示を許容

⸻

9. テスト観点（必須）

9-1. ローカル
	•	Stripe CLI を使用して Webhook を転送
	•	stripe listen --forward-to localhost:3000/webhooks/stripe
	•	テスト決済で
	•	paid
	•	failed
	•	refund
が orders に反映されること

9-2. 本番前
	•	Webhook Secret を本番用に差し替え
	•	APP_URL を本番ドメインに
	•	success/cancel URL を本番で動作確認

⸻

10. 実装チェックリスト（完了条件）
	•	Stripe SDK導入 & env設定
	•	ordersのインデックス追加（payment_external等）
	•	/checkout/confirm で card 決済時に Checkout Session 作成→Stripeへリダイレクト
	•	Webhookで payment_status 更新（paid/failed/refunded）
	•	冪等性の考慮（最低限：安全な更新）
	•	ローカルで Stripe CLI による疎通確認
	•	既存トリガーとステータス整合が取れている