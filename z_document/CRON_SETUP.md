# 送金バッチ Cron ジョブ設定

## 概要

`scripts/payout-batch.js` を毎週月曜日 9:00 AM (JST) に自動実行するための設定手順です。

スクリプトは内部でISO週番号が偶数かどうかをチェックするため、**毎週月曜日に実行**しても問題ありません。奇数週の場合は自動的にスキップされます。

## 前提条件

- Node.js がインストールされていること
- プロジェクトの依存関係がインストール済み (`npm install`)
- データベース接続が正常に機能していること
- Stripe API キーが `.env` に設定されていること

## Cron ジョブの設定

### 1. Cron ジョブの登録

サーバーの crontab を編集します:

```bash
crontab -e
```

### 2. Cron エントリの追加

以下のエントリを追加します（JST 9:00 AM = UTC 0:00 AM の場合）:

```cron
# 送金バッチ: 毎週月曜日 9:00 AM (JST)
0 0 * * 1 cd /path/to/新・今日の食卓 && /usr/bin/node scripts/payout-batch.js >> logs/payout-batch.log 2>&1
```

**重要**:
- `/path/to/新・今日の食卓` を実際のプロジェクトパスに置き換えてください
- `/usr/bin/node` を実際の Node.js パスに置き換えてください (`which node` で確認)
- タイムゾーンに応じて時刻を調整してください

### 3. タイムゾーン別の設定例

#### JST (UTC+9) で月曜日 9:00 AM に実行する場合

```cron
# UTC時刻で指定: 月曜 0:00 (= JST月曜 9:00)
0 0 * * 1 cd /path/to/新・今日の食卓 && /usr/bin/node scripts/payout-batch.js >> logs/payout-batch.log 2>&1
```

#### サーバーのタイムゾーンがJSTの場合

```cron
# JST時刻で直接指定: 月曜 9:00
0 9 * * 1 cd /path/to/新・今日の食卓 && /usr/bin/node scripts/payout-batch.js >> logs/payout-batch.log 2>&1
```

### 4. ログディレクトリの作成

```bash
mkdir -p logs
touch logs/payout-batch.log
```

### 5. 実行権限の付与

```bash
chmod +x scripts/payout-batch.js
```

### 6. Cron ジョブの確認

```bash
crontab -l
```

## 手動実行とテスト

### 手動実行

```bash
node scripts/payout-batch.js
```

### 実行結果の確認

```bash
# 標準出力
tail -f logs/payout-batch.log

# アプリケーションログ
tail -f logs/app.log
```

### データベースで確認

```sql
-- 送金実行履歴を確認
SELECT * FROM payout_runs ORDER BY created_at DESC LIMIT 10;

-- 今週の送金を確認
SELECT * FROM payout_runs WHERE iso_week = EXTRACT(WEEK FROM CURRENT_DATE);

-- 台帳の送金エントリを確認
SELECT * FROM ledger WHERE type = 'payout' ORDER BY created_at DESC LIMIT 20;

-- 出品者ごとの送金状況を確認
SELECT
  p.id,
  p.name,
  COUNT(l.id) AS payout_count,
  SUM(-l.amount_cents) AS total_payout_amount
FROM partners p
LEFT JOIN ledger l ON l.partner_id = p.id AND l.type = 'payout'
GROUP BY p.id, p.name
ORDER BY total_payout_amount DESC;
```

## トラブルシューティング

### Cron ジョブが実行されない場合

1. **cron サービスの状態確認**
```bash
# Linux/Ubuntu
sudo systemctl status cron

# macOS
sudo launchctl list | grep cron
```

2. **環境変数の問題**

Cron は限られた環境変数しか持ちません。絶対パスを使用し、必要な環境変数を明示的に設定してください:

```cron
0 0 * * 1 cd /path/to/新・今日の食卓 && PATH=/usr/local/bin:/usr/bin:/bin NODE_ENV=production /usr/bin/node scripts/payout-batch.js >> logs/payout-batch.log 2>&1
```

3. **`.env` ファイルの読み込み**

スクリプトが `.env` を正しく読み込んでいることを確認してください。

### ログファイルが大きくなりすぎる場合

logrotate を使用してログをローテーションします:

```bash
# /etc/logrotate.d/payout-batch を作成
sudo nano /etc/logrotate.d/payout-batch
```

内容:
```
/path/to/新・今日の食卓/logs/payout-batch.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 your-user your-group
}
```

### エラー通知の設定

送金バッチが失敗した場合にメール通知を送る設定:

```cron
MAILTO=admin@example.com
0 0 * * 1 cd /path/to/新・今日の食卓 && /usr/bin/node scripts/payout-batch.js >> logs/payout-batch.log 2>&1 || echo "Payout batch failed at $(date)" | mail -s "Payout Batch Failure" admin@example.com
```

## 実行スケジュール例

| ISO週番号 | 実行日（例） | 実行結果 |
|-----------|-------------|----------|
| 1週（奇数） | 2025-01-06 (月) | スキップ |
| 2週（偶数） | 2025-01-13 (月) | **実行** |
| 3週（奇数） | 2025-01-20 (月) | スキップ |
| 4週（偶数） | 2025-01-27 (月) | **実行** |

## セキュリティ考慮事項

1. **Cron ジョブの権限**: 最小限の権限で実行してください
2. **ログファイルの権限**: 機密情報が含まれる可能性があるため、適切なパーミッション設定
3. **環境変数の保護**: `.env` ファイルが読み取り専用であることを確認

```bash
chmod 600 .env
```

## 監視とアラート

### 推奨される監視項目

1. **実行成功率**: payout_runs テーブルの status='completed' の割合
2. **エラー率**: failed_payouts の数
3. **実行時間**: 処理時間が異常に長くなっていないか
4. **送金総額の異常**: 通常と比べて極端に多い/少ないケース

### 監視クエリ例

```sql
-- 過去10回の実行結果サマリ
SELECT
  id,
  iso_week,
  status,
  total_partners,
  successful_payouts,
  failed_payouts,
  total_amount_cents,
  started_at,
  completed_at,
  EXTRACT(EPOCH FROM (completed_at - started_at)) AS duration_seconds
FROM payout_runs
ORDER BY created_at DESC
LIMIT 10;
```

## PM2 を使用した実行（オプション）

Cron の代わりに PM2 の cron 機能を使用することもできます:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'payout-batch',
    script: './scripts/payout-batch.js',
    cron_restart: '0 0 * * 1', // 毎週月曜 0:00
    autorestart: false,
    watch: false,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
```

実行:
```bash
pm2 start ecosystem.config.js
pm2 save
```

## 参考資料

- [Cron HowTo - Ubuntu](https://help.ubuntu.com/community/CronHowto)
- [ISO Week Date - Wikipedia](https://en.wikipedia.org/wiki/ISO_week_date)
- [Stripe Payouts API](https://stripe.com/docs/api/payouts)
