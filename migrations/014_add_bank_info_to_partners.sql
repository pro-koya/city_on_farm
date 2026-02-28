-- 014: 出品者の銀行振込先情報を partners テーブルに追加
-- 掛売り（請求書払い）の振込先として請求書PDFに表示する

ALTER TABLE partners ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS bank_branch_name TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS bank_branch_code TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS bank_account_type TEXT DEFAULT 'ordinary'; -- ordinary(普通), current(当座), savings(貯蓄)
ALTER TABLE partners ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS bank_account_holder TEXT;
