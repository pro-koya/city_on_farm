#!/bin/bash

# Stripe Webhook設定テストスクリプト
# 使用方法: ./scripts/test-webhook-setup.sh

set -e

echo "========================================="
echo "Stripe Webhook設定テスト"
echo "========================================="
echo ""

# 1. Stripe CLIの確認
echo "1. Stripe CLIの確認..."
if command -v stripe &> /dev/null; then
    STRIPE_VERSION=$(stripe --version)
    echo "✅ Stripe CLI インストール済み: $STRIPE_VERSION"
else
    echo "❌ Stripe CLI がインストールされていません"
    echo "   インストール方法: https://docs.stripe.com/stripe-cli"
    exit 1
fi
echo ""

# 2. Stripe CLIログイン状態の確認
echo "2. Stripe CLIログイン状態の確認..."
if stripe config --list &> /dev/null; then
    echo "✅ Stripe CLIにログイン済み"
else
    echo "❌ Stripe CLIにログインしていません"
    echo "   実行してください: stripe login"
    exit 1
fi
echo ""

# 3. アプリケーションの起動確認
echo "3. アプリケーションの起動確認..."
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ アプリケーションが起動しています (http://localhost:3000)"
else
    echo "❌ アプリケーションが起動していません"
    echo "   実行してください: npm start または node server.js"
    exit 1
fi
echo ""

# 4. データベース接続の確認
echo "4. データベース接続の確認..."
echo "   最新の注文を確認..."

PGPASSWORD=EQrC9Og1tnhQ7KHosXETOwSAkpYV85Z2 psql \
  -h dpg-d57orkqli9vc739kf6fg-a.oregon-postgres.render.com \
  -U setsumarut_user \
  setsumarut \
  -c "SELECT COUNT(*) as order_count FROM orders;" \
  2>&1 | grep -q "order_count" && \
  echo "✅ データベース接続成功" || \
  (echo "❌ データベース接続失敗" && exit 1)
echo ""

# 5. 指示の表示
echo "========================================="
echo "次のステップ:"
echo "========================================="
echo ""
echo "1. 新しいターミナルウィンドウを開く"
echo ""
echo "2. 以下のコマンドを実行してStripe webhookリスナーを起動:"
echo "   stripe listen --forward-to localhost:3000/webhooks/stripe"
echo ""
echo "3. 出力されたwebhook secret (whsec_xxxxx) をコピー"
echo ""
echo "4. .envファイルのSTRIPE_WEBHOOK_SECRETを更新:"
echo "   STRIPE_WEBHOOK_SECRET=whsec_xxxxx"
echo ""
echo "5. アプリケーションを再起動"
echo ""
echo "6. 新しい注文を作成してテスト"
echo ""
echo "7. ログを確認:"
echo "   tail -f logs/combined.log | grep -i 'webhook\\|ledger\\|checkout'"
echo ""
echo "詳細は STRIPE_WEBHOOK_SETUP.md を参照してください。"
echo "========================================="
