-- migrations/add_stripe_indexes.sql
-- Stripe決済機能のためのインデックス追加

-- orders テーブルに payment_provider と payment_external_id の複合インデックスを追加
-- Webhook処理の高速化のため
CREATE INDEX IF NOT EXISTS ix_orders_payment_external
ON public.orders (payment_provider, payment_external_id);

-- order_number のインデックスを追加（存在しない場合）
-- 注文番号での検索を高速化
CREATE INDEX IF NOT EXISTS ix_orders_order_number
ON public.orders (order_number);

-- payment_status のインデックスを追加（決済状態での絞り込みを高速化）
CREATE INDEX IF NOT EXISTS ix_orders_payment_status
ON public.orders (payment_status);
