-- ============================================================
-- ordersテーブルのseller_idを修正
-- 既存データのseller_idをorder_itemsから取得したpartner_idで更新
-- ============================================================
--
-- 背景:
-- - ordersテーブルのseller_idにはpartner_id（パートナー組織のID）を格納する設計
-- - しかし、注文作成時にseller_idを設定していなかったため、すべてNULL
-- - このマイグレーションで既存の注文データを修正する
--
-- 実行日: 2025-12-27
-- ============================================================

BEGIN;

-- 実行前の状態を確認
DO $$
DECLARE
  total_orders INTEGER;
  null_seller_orders INTEGER;
  non_null_seller_orders INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_orders FROM orders;
  SELECT COUNT(*) INTO null_seller_orders FROM orders WHERE seller_id IS NULL;
  SELECT COUNT(*) INTO non_null_seller_orders FROM orders WHERE seller_id IS NOT NULL;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'マイグレーション実行前の状態:';
  RAISE NOTICE '  総注文数: %', total_orders;
  RAISE NOTICE '  seller_id NULL: %', null_seller_orders;
  RAISE NOTICE '  seller_id 設定済み: %', non_null_seller_orders;
  RAISE NOTICE '========================================';
END $$;

-- 既存データの seller_id を order_items から partner_id を取得して設定
--
-- ロジック:
-- 1. order_itemsテーブルから最初の商品の seller_id (users.id) を取得
-- 2. そのユーザーの partner_id を users テーブルから取得
-- 3. ordersテーブルの seller_id に partner_id を設定
UPDATE orders o
SET seller_id = (
  SELECT u.partner_id
  FROM order_items oi
  JOIN users u ON u.id = oi.seller_id
  WHERE oi.order_id = o.id
    AND u.partner_id IS NOT NULL
  LIMIT 1
),
updated_at = now()
WHERE o.seller_id IS NULL;

-- 実行後の状態を確認
DO $$
DECLARE
  total_orders INTEGER;
  null_seller_orders INTEGER;
  non_null_seller_orders INTEGER;
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_orders FROM orders;
  SELECT COUNT(*) INTO null_seller_orders FROM orders WHERE seller_id IS NULL;
  SELECT COUNT(*) INTO non_null_seller_orders FROM orders WHERE seller_id IS NOT NULL;

  -- 更新された件数を計算（実行前は全てNULLだったので、non_null_seller_ordersが更新数）
  updated_count := non_null_seller_orders;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'マイグレーション実行後の状態:';
  RAISE NOTICE '  総注文数: %', total_orders;
  RAISE NOTICE '  seller_id NULL: %', null_seller_orders;
  RAISE NOTICE '  seller_id 設定済み: %', non_null_seller_orders;
  RAISE NOTICE '  更新された注文数: %', updated_count;
  RAISE NOTICE '========================================';

  -- 警告: seller_idがまだNULLの注文がある場合
  IF null_seller_orders > 0 THEN
    RAISE WARNING 'seller_idがNULLのままの注文が % 件あります。', null_seller_orders;
    RAISE WARNING 'これらの注文には order_items が存在しないか、出品者がパートナーに所属していない可能性があります。';
  END IF;
END $$;

-- データ検証: seller_idが設定された注文のサンプルを確認
DO $$
DECLARE
  sample_record RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'サンプルデータ確認（最新5件）:';

  FOR sample_record IN
    SELECT
      o.id,
      o.order_number,
      o.seller_id,
      p.name as partner_name,
      o.total,
      o.created_at
    FROM orders o
    LEFT JOIN partners p ON p.id = o.seller_id
    WHERE o.seller_id IS NOT NULL
    ORDER BY o.created_at DESC
    LIMIT 5
  LOOP
    RAISE NOTICE 'Order: % | Partner: % (%) | Total: %円 | Created: %',
      sample_record.order_number,
      sample_record.partner_name,
      sample_record.seller_id,
      sample_record.total,
      sample_record.created_at;
  END LOOP;

  RAISE NOTICE '========================================';
END $$;

COMMIT;

-- ============================================================
-- マイグレーション完了
-- ============================================================

-- 確認クエリ（手動実行用）
--
-- 全注文の seller_id 設定状況を確認:
-- SELECT
--   COUNT(*) as total_orders,
--   COUNT(seller_id) as orders_with_seller,
--   COUNT(*) - COUNT(seller_id) as orders_without_seller
-- FROM orders;
--
-- 最新の注文とパートナー情報を確認:
-- SELECT
--   o.id,
--   o.order_number,
--   o.seller_id,
--   p.name as partner_name,
--   o.total,
--   o.payment_status,
--   o.created_at
-- FROM orders o
-- LEFT JOIN partners p ON p.id = o.seller_id
-- ORDER BY o.created_at DESC
-- LIMIT 10;
