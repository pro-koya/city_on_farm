-- 015: 各種ステータスの日本語ラベルを option_labels に登録
-- jaLabel() 関数がこのテーブルを参照して日本語表示を行う

-- ===== order_status =====
INSERT INTO option_labels (category, value, label_ja, label_en, sort, active)
VALUES
  ('order_status', 'pending',          '保留中',     'Pending',          10, true),
  ('order_status', 'confirmed',        '確認済',     'Confirmed',        20, true),
  ('order_status', 'processing',       '処理中',     'Processing',       30, true),
  ('order_status', 'paid',             '支払済',     'Paid',             40, true),
  ('order_status', 'awaiting_payment', '決済待ち',   'Awaiting Payment', 45, true),
  ('order_status', 'shipped',          '発送済',     'Shipped',          50, true),
  ('order_status', 'delivered',        '配達完了',   'Delivered',        60, true),
  ('order_status', 'fulfilled',        '完了',       'Fulfilled',        70, true),
  ('order_status', 'canceled',         'キャンセル', 'Canceled',         80, true),
  ('order_status', 'cancelled',        'キャンセル', 'Cancelled',        81, true),
  ('order_status', 'refunded',         '返金済',     'Refunded',         90, true)
ON CONFLICT (category, value) DO UPDATE SET label_ja = EXCLUDED.label_ja, label_en = EXCLUDED.label_en, sort = EXCLUDED.sort;

-- ===== payment_status =====
INSERT INTO option_labels (category, value, label_ja, label_en, sort, active)
VALUES
  ('payment_status', 'pending',    '処理中',     'Pending',    10, true),
  ('payment_status', 'unpaid',     '未入金',     'Unpaid',     15, true),
  ('payment_status', 'authorized', '認証済',     'Authorized', 20, true),
  ('payment_status', 'paid',       '入金済',     'Paid',       30, true),
  ('payment_status', 'completed',  '完了',       'Completed',  40, true),
  ('payment_status', 'failed',     '失敗',       'Failed',     50, true),
  ('payment_status', 'canceled',   'キャンセル', 'Canceled',   60, true),
  ('payment_status', 'cancelled',  'キャンセル', 'Cancelled',  61, true),
  ('payment_status', 'refunded',   '返金済',     'Refunded',   70, true),
  ('payment_status', 'expired',    '期限切れ',   'Expired',    80, true)
ON CONFLICT (category, value) DO UPDATE SET label_ja = EXCLUDED.label_ja, label_en = EXCLUDED.label_en, sort = EXCLUDED.sort;

-- ===== shipment_status =====
INSERT INTO option_labels (category, value, label_ja, label_en, sort, active)
VALUES
  ('shipment_status', 'pending',   '未発送',     'Pending',   10, true),
  ('shipment_status', 'preparing', '準備中',     'Preparing', 20, true),
  ('shipment_status', 'shipped',   '発送済',     'Shipped',   30, true),
  ('shipment_status', 'in_transit','配送中',     'In Transit',40, true),
  ('shipment_status', 'delivered', '配達完了',   'Delivered', 50, true),
  ('shipment_status', 'returned',  '返品',       'Returned',  60, true),
  ('shipment_status', 'lost',      '紛失',       'Lost',      70, true),
  ('shipment_status', 'canceled',  'キャンセル', 'Canceled',  80, true),
  ('shipment_status', 'cancelled', 'キャンセル', 'Cancelled', 81, true)
ON CONFLICT (category, value) DO UPDATE SET label_ja = EXCLUDED.label_ja, label_en = EXCLUDED.label_en, sort = EXCLUDED.sort;

-- ===== payment_method =====
INSERT INTO option_labels (category, value, label_ja, label_en, sort, active)
VALUES
  ('payment_method', 'card',              'クレジットカード', 'Credit Card',       10, true),
  ('payment_method', 'bank_transfer',     '銀行振込',         'Bank Transfer',     20, true),
  ('payment_method', 'bank',              '銀行振込',         'Bank Transfer',     21, true),
  ('payment_method', 'cod',               '代金引換',         'Cash on Delivery',  30, true),
  ('payment_method', 'convenience_store', 'コンビニ払い',     'Convenience Store', 40, true),
  ('payment_method', 'paypay',            'PayPay',            'PayPay',            50, true)
ON CONFLICT (category, value) DO UPDATE SET label_ja = EXCLUDED.label_ja, label_en = EXCLUDED.label_en, sort = EXCLUDED.sort;

-- ===== ship_method =====
INSERT INTO option_labels (category, value, label_ja, label_en, sort, active)
VALUES
  ('ship_method', 'delivery', '配送',       'Delivery', 10, true),
  ('ship_method', 'pickup',   '畑受け取り', 'Pickup',   20, true)
ON CONFLICT (category, value) DO UPDATE SET label_ja = EXCLUDED.label_ja, label_en = EXCLUDED.label_en, sort = EXCLUDED.sort;
