# 出品者への売上金額反映不具合 - 原因特定と改修案

## 調査日
2025-12-27

## 問題の概要
- Stripe決済と出品者の口座登録は完了している
- 注文から配達完了までの流れで、出品者に売上金額が反映されない
- 具体的には以下が更新されていない：
  - ledgerデータ（売上台帳）
  - ordersのstripe_charge_id等のStripe関連フィールド
  - 出品者の残高（balanceページで確認すると残高0）

---

## データベース調査結果

### ordersテーブル
```sql
SELECT id, order_number, buyer_id, seller_id, total, payment_status
FROM orders ORDER BY created_at DESC LIMIT 3;
```

結果：
- seller_id: **すべてNULL（空）** ← これが問題の根本原因
- payment_status: 'paid'（決済は成功している）

### order_itemsテーブル
```sql
SELECT oi.order_id, oi.seller_id, u.name, u.partner_id, p.name as partner_name
FROM order_items oi
JOIN users u ON u.id = oi.seller_id
LEFT JOIN partners p ON p.id = u.partner_id;
```

結果：
- seller_id: **users.id（出品者のユーザーID）が正しく入っている**
- 出品者ユーザーは partner_id を持っている
- 例：テスト太郎、田村 幸也 → 両者とも partner_id: 050aef63-7b00-47bd-b156-5d4f5519ab38（田村ファーム）

---

## 原因の特定

### 1. **ordersテーブルのseller_idが設定されていない（最重要問題）**

**テーブル設計の意図：**
- ordersテーブルのseller_id = **partner_id**（出品者が所属するパートナー組織のID）
- order_itemsテーブルのseller_id = **users.id**（商品を出品したユーザーのID）

**問題箇所：** `server.js:8399-8417`

現在のコード（seller_idが含まれていない）：
```javascript
const oins = await client.query(
  `INSERT INTO orders
     (order_number, buyer_id, status,
      subtotal, discount, shipping_fee, total,
      payment_method, note, eta_at, coupon_code, ship_method, ship_time_code,
      payment_status, delivery_status)
   VALUES
     ($1, $2, 'pending',
      $3, $4, $5, $6,
      $7, $8, $9, $10, $11, $12,
      'unpaid', 'preparing')
   RETURNING id`,
  [
    orderNo, uid,
    subtotal, discount, shipping_fee, total,
    safePaymentMethod, (draft.orderNote || '').slice(0,1000), etaAt,
    coupon?.code || null, draft.shipMethod, rawShipTimeCode
  ]
);
```

**現象：**
- 注文作成時にseller_id（partner_id）を設定していない
- その結果、ordersテーブルのseller_idがNULLのままになる

**影響：**
- Stripe webhook処理（server.js:246）で`SELECT id, seller_id, total FROM orders`を実行すると、seller_idがNULLになる
- ledger.jsのrecordSaleAndFee関数（32行目）で`const { id: orderId, total, seller_id } = order;`としているが、seller_idがNULLなのでエラーまたは処理スキップになる
- その結果、ledgerテーブルへの売上計上が行われない
- ordersテーブルのstripe_payment_intent_id、stripe_charge_id等も更新されない

---

### 2. **ledger.jsのrecordSaleAndFee関数がpartner_idを期待している**

**問題箇所：** `services/ledger.js:32-49`

```javascript
async function recordSaleAndFee(order, paymentIntentId, chargeId) {
  const { id: orderId, total, seller_id } = order;  // ← seller_idを期待

  try {
    // seller_id (users.id) から partner_id を取得
    const users = await dbQuery(
      'SELECT partner_id FROM users WHERE id = $1',
      [seller_id]  // ← ここでseller_idをusers.idとして使っている
    );

    if (!users.length || !users[0].partner_id) {
      logger.warn('Partner not found for order seller', {
        orderId,
        sellerId: seller_id
      });
      return;  // ← partner_idが見つからないと処理を中断
    }

    const partnerId = users[0].partner_id;
    // ... 台帳計上処理
  }
}
```

**問題点：**
- この関数は`order.seller_id`がusers.id（出品者のユーザーID）であることを期待している
- しかし、ordersテーブルのseller_idには本来partner_idを入れるべき設計になっている
- 現在はordersテーブルのseller_idがNULLなので、この関数は動作しない

**設計の不整合：**
- ordersテーブル：seller_id = partner_id を想定
- ledger.js：order.seller_id = users.id を想定

---

## 改修案

### オプション1: ordersテーブルのseller_idにpartner_idを設定（推奨）

**理由：**
- テーブル設計の本来の意図に沿っている
- ledgerテーブルもpartner_id単位で管理されている
- 一つの注文は単一パートナーの商品のみで構成される（現在の実装）

**実装手順：**

#### 1-1. server.jsの注文作成処理を修正

`server.js:8390` 付近に以下のコードを追加：

```javascript
// 出品者のpartner_idを取得（最初の商品から）
const firstProd = byId.get(targetPairs[0].productId);
if (!firstProd?.seller_id) {
  throw new Error('商品の出品者IDが特定できません');
}

// 出品者ユーザーからpartner_idを取得
const sellerUsers = await dbQuery(
  'SELECT id, partner_id FROM users WHERE id = $1',
  [firstProd.seller_id]
);

if (!sellerUsers.length || !sellerUsers[0].partner_id) {
  throw new Error('出品者のパートナー情報が見つかりません。出品者がパートナーに所属していることを確認してください。');
}

const orderSellerId = sellerUsers[0].partner_id; // これがpartner_id
```

#### 1-2. INSERT文を修正

`server.js:8399-8417` を以下のように修正：

**変更後：**
```javascript
const oins = await client.query(
  `INSERT INTO orders
     (order_number, buyer_id, seller_id, status,
      subtotal, discount, shipping_fee, total,
      payment_method, note, eta_at, coupon_code, ship_method, ship_time_code,
      payment_status, delivery_status)
   VALUES
     ($1, $2, $3, 'pending',
      $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13,
      'unpaid', 'preparing')
   RETURNING id`,
  [
    orderNo, uid, orderSellerId,  // ← orderSellerId（partner_id）を追加
    subtotal, discount, shipping_fee, total,
    safePaymentMethod, (draft.orderNote || '').slice(0,1000), etaAt,
    coupon?.code || null, draft.shipMethod, rawShipTimeCode
  ]
);
```

#### 1-3. ledger.jsのrecordSaleAndFee関数を修正

`services/ledger.js:31-49` を修正：

**変更前：**
```javascript
async function recordSaleAndFee(order, paymentIntentId, chargeId) {
  const { id: orderId, total, seller_id } = order;

  try {
    // seller_id (users.id) から partner_id を取得
    const users = await dbQuery(
      'SELECT partner_id FROM users WHERE id = $1',
      [seller_id]
    );

    if (!users.length || !users[0].partner_id) {
      logger.warn('Partner not found for order seller', {
        orderId,
        sellerId: seller_id
      });
      return;
    }

    const partnerId = users[0].partner_id;
    // ...
  }
}
```

**変更後：**
```javascript
async function recordSaleAndFee(order, paymentIntentId, chargeId) {
  const { id: orderId, total, seller_id } = order;

  try {
    // seller_id は既に partner_id として保存されている
    const partnerId = seller_id;

    if (!partnerId) {
      logger.warn('Partner ID not found in order', {
        orderId
      });
      return;
    }

    // partner_idの存在確認
    const partners = await dbQuery(
      'SELECT id FROM partners WHERE id = $1',
      [partnerId]
    );

    if (!partners.length) {
      logger.warn('Partner not found', {
        orderId,
        partnerId
      });
      return;
    }

    const totalCents = total; // ordersテーブルのtotalは既に円単位
    const feeCents = calculatePlatformFee(totalCents);

    // 冪等性キー
    const saleIdempotencyKey = `sale-${orderId}`;
    const feeIdempotencyKey = `platform_fee-${orderId}`;

    logger.info('Recording sale and fee in ledger', {
      orderId,
      partnerId,
      totalCents,
      feeCents,
      paymentIntentId
    });

    // トランザクション開始
    await dbQuery('BEGIN');

    // 1. 売上エントリ作成（+total）
    const saleResult = await dbQuery(
      `INSERT INTO ledger (
         partner_id, order_id, type, amount_cents, currency,
         status, stripe_payment_intent_id, stripe_charge_id,
         idempotency_key, note
       ) VALUES ($1, $2, 'sale', $3, 'jpy', 'pending', $4, $5, $6, $7)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        partnerId,
        orderId,
        totalCents,
        paymentIntentId,
        chargeId,
        saleIdempotencyKey,
        `決済成功による売上計上 (注文ID: ${orderId})`
      ]
    );

    // 2. 手数料エントリ作成（-fee）
    const feeResult = await dbQuery(
      `INSERT INTO ledger (
         partner_id, order_id, type, amount_cents, currency,
         status, stripe_payment_intent_id, stripe_charge_id,
         idempotency_key, note
       ) VALUES ($1, $2, 'platform_fee', $3, 'jpy', 'pending', $4, $5, $6, $7)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        partnerId,
        orderId,
        -feeCents, // マイナス値
        paymentIntentId,
        chargeId,
        feeIdempotencyKey,
        `プラットフォーム手数料 6% (最低150円)`
      ]
    );

    // 3. ordersテーブルに台帳IDを保存
    if (saleResult.length && feeResult.length) {
      await dbQuery(
        `UPDATE orders SET
           ledger_sale_id = $1,
           ledger_fee_id = $2,
           stripe_payment_intent_id = $3,
           stripe_charge_id = $4,
           updated_at = now()
         WHERE id = $5`,
        [
          saleResult[0].id,
          feeResult[0].id,
          paymentIntentId,
          chargeId,
          orderId
        ]
      );

      logger.info('Sale and fee recorded in ledger successfully', {
        orderId,
        partnerId,
        totalCents,
        feeCents,
        saleId: saleResult[0].id,
        feeId: feeResult[0].id
      });
    } else {
      logger.info('Sale and fee already recorded (idempotency)', {
        orderId,
        saleExists: saleResult.length === 0,
        feeExists: feeResult.length === 0
      });
    }

    await dbQuery('COMMIT');
  } catch (error) {
    await dbQuery('ROLLBACK');
    logger.error('Failed to record sale and fee', {
      orderId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}
```

#### 1-4. routes-delivery-status.jsを修正

`routes-delivery-status.js:35-41` を修正：

**変更前：**
```javascript
const orders = await dbQuery(
  `SELECT o.id, o.seller_id, o.delivery_status, u.partner_id
   FROM orders o
   JOIN users u ON u.id = o.seller_id
   WHERE o.id = $1`,
  [orderId]
);
```

**変更後：**
```javascript
const orders = await dbQuery(
  `SELECT o.id, o.seller_id, o.delivery_status
   FROM orders o
   WHERE o.id = $1`,
  [orderId]
);
```

そして、権限チェック部分（54-62行目）を修正：

**変更前：**
```javascript
const isAdmin = currentUser.roles && currentUser.roles.includes('admin');
const isSeller = currentUser.id === order.seller_id;

if (!isAdmin && !isSeller) {
  return res.status(403).json({
    success: false,
    error: 'Forbidden'
  });
}
```

**変更後：**
```javascript
const isAdmin = currentUser.roles && currentUser.roles.includes('admin');

// 現在のユーザーのpartner_idを取得して、注文のseller_id（= partner_id）と比較
let isSeller = false;
if (currentUser.partner_id && currentUser.partner_id === order.seller_id) {
  isSeller = true;
}

if (!isAdmin && !isSeller) {
  return res.status(403).json({
    success: false,
    error: 'Forbidden'
  });
}
```

#### 1-5. 既存データの修正マイグレーション

`migrations/007_fix_orders_seller_id.sql`:

```sql
-- ============================================================
-- ordersテーブルのseller_idを修正
-- 既存データのseller_idをorder_itemsから取得したpartner_idで更新
-- ============================================================

BEGIN;

-- 既存データの seller_id を order_items から partner_id を取得して設定
UPDATE orders o
SET seller_id = (
  SELECT u.partner_id
  FROM order_items oi
  JOIN users u ON u.id = oi.seller_id
  WHERE oi.order_id = o.id
  LIMIT 1
)
WHERE o.seller_id IS NULL;

-- 確認クエリ
DO $$
DECLARE
  updated_count INTEGER;
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count FROM orders WHERE seller_id IS NOT NULL;
  SELECT COUNT(*) INTO null_count FROM orders WHERE seller_id IS NULL;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Orders with seller_id set: %', updated_count;
  RAISE NOTICE 'Orders with seller_id NULL: %', null_count;
  RAISE NOTICE '========================================';
END $$;

COMMIT;
```

---

### オプション2: ledger.jsを修正してorder_itemsから取得（非推奨）

この方法は、ordersテーブルの設計意図と異なるため推奨しません。

---

## 推奨される対応方針

**オプション1（ordersテーブルのseller_idにpartner_idを設定）を推奨します。**

理由：
1. テーブル設計の本来の意図に沿っている
2. ledgerテーブルもpartner_id単位で管理されている
3. 現在の実装が単一パートナー前提である
4. パフォーマンスが良い（JOINが不要）

---

## 実装の優先順位

### Phase 1: 緊急対応（即座に実施）

1. **既存データを修正**
   ```bash
   # マイグレーション実行
   PGPASSWORD=EQrC9Og1tnhQ7KHosXETOwSAkpYV85Z2 psql -h dpg-d57orkqli9vc739kf6fg-a.oregon-postgres.render.com -U setsumarut_user setsumarut -f migrations/007_fix_orders_seller_id.sql
   ```

2. **server.jsの注文作成処理を修正**
   - server.js:8390付近にpartner_id取得コードを追加
   - server.js:8399のINSERT文にseller_idを追加

3. **ledger.jsのrecordSaleAndFee関数を修正**
   - users.idからpartner_idを取得する処理を削除
   - seller_idを直接partner_idとして使用

4. **routes-delivery-status.jsを修正**
   - 不要なJOINを削除
   - 権限チェックロジックを修正

### Phase 2: 動作確認

1. 新規注文を作成してStripe決済を実行
2. ordersテーブルのseller_idにpartner_idが設定されることを確認
   ```sql
   SELECT id, order_number, seller_id, total, payment_status
   FROM orders ORDER BY created_at DESC LIMIT 1;
   ```

3. Stripe webhookログを確認してエラーがないことを確認
4. ledgerテーブルにsaleとplatform_feeのエントリが作成されることを確認
   ```sql
   SELECT * FROM ledger ORDER BY created_at DESC LIMIT 5;
   ```

5. ordersテーブルのstripe_payment_intent_id、stripe_charge_id等が更新されることを確認

### Phase 3: 配達完了処理の確認

1. routes-delivery-status.jsが正しく動作することを確認
2. 配達完了時にledgerのstatusがavailableに更新されることを確認

---

## 注意事項

### テーブル設計の意図

**明確化：**
- `orders.seller_id` = **partner_id**（パートナー組織のID）
- `order_items.seller_id` = **users.id**（出品者ユーザーのID）

この設計は、以下の理由で妥当です：
1. 一つの注文は単一パートナーの商品のみで構成される
2. 売上や手数料の管理はパートナー単位で行う
3. 複数のユーザーが同じパートナーに所属可能

### 既存データの対応

- マイグレーション実行時に、既存のordersレコードのseller_idをorder_itemsとusersテーブルから取得したpartner_idで自動的に設定します
- ただし、order_itemsが存在しない注文や、出品者がpartnerに所属していない場合はNULLのままになります
- 本番環境での実行前に、テスト環境で動作を確認してください

### ログ監視

- Stripe webhookのログを監視して、問題が解決したことを確認してください
- 特に以下のログメッセージに注意：
  - "Sale and fee recorded in ledger successfully"
  - "Partner not found in order"（これが出る場合は問題）

---

## 次のステップ

1. このPLAN.mdの内容をレビュー
2. マイグレーション007を実行して既存データを修正
3. server.jsの修正を実施
4. ledger.jsの修正を実施
5. routes-delivery-status.jsの修正を実施
6. テスト環境で動作確認
7. 本番環境にデプロイ
8. 実際の注文で動作確認
9. 出品者の残高が正しく反映されることを確認
