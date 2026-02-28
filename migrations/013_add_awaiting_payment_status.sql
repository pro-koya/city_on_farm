-- 013: order_status に awaiting_payment を追加、payment_status に expired を追加
-- Stripe決済中の注文ステータス管理に必要

-- order_status enum に awaiting_payment を追加（IF NOT EXISTS で冪等）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'awaiting_payment'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'order_status')
  ) THEN
    ALTER TYPE order_status ADD VALUE 'awaiting_payment';
  END IF;
END$$;

-- payment_status enum に expired を追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'expired'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'payment_status')
  ) THEN
    ALTER TYPE payment_status ADD VALUE 'expired';
  END IF;
END$$;
