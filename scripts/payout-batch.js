#!/usr/bin/env node
// scripts/payout-batch.js
// 隔週月曜送金バッチ処理
// ISO週番号が偶数の月曜日のみ実行される自動送金スクリプト

const stripe = require('../lib/stripe');
const { dbQuery } = require('../services/db');
const logger = require('../services/logger');

/**
 * ISO週番号を取得
 * @param {Date} date - 日付
 * @returns {number} ISO週番号
 */
function getISOWeekNumber(date) {
  const target = new Date(date.valueOf());
  const dayNum = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNum + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target) / 604800000);
}

/**
 * 指定日が月曜日かつISO週番号が偶数かを確認
 * @param {Date} date - 日付
 * @returns {boolean}
 */
function isValidPayoutDay(date) {
  const dayOfWeek = date.getDay();
  if (dayOfWeek !== 1) { // 1 = Monday
    logger.info('Not Monday, skipping payout', { dayOfWeek });
    return false;
  }

  const isoWeek = getISOWeekNumber(date);
  if (isoWeek % 2 !== 0) {
    logger.info('ISO week is odd number, skipping payout', { isoWeek });
    return false;
  }

  logger.info('Valid payout day confirmed', { isoWeek, date: date.toISOString() });
  return true;
}

/**
 * 送金バッチ実行のメイン処理
 */
async function executePayoutBatch() {
  const now = new Date();
  const isoWeek = getISOWeekNumber(now);
  const batchIdempotencyKey = `payout-batch-${now.getFullYear()}-W${String(isoWeek).padStart(2, '0')}`;

  logger.info('Starting payout batch execution', {
    executionTime: now.toISOString(),
    isoWeek,
    batchIdempotencyKey
  });

  try {
    // 1. 実行日の妥当性チェック
    if (!isValidPayoutDay(now)) {
      logger.info('Payout batch execution skipped (not valid day)');
      return {
        success: true,
        skipped: true,
        reason: 'Not a valid payout day (even ISO week Monday required)'
      };
    }

    // 2. 冪等性チェック（今週の実行履歴があるかチェック）
    const existingRuns = await dbQuery(
      `SELECT id FROM payout_runs WHERE idempotency_key = $1`,
      [batchIdempotencyKey]
    );

    if (existingRuns.length > 0) {
      logger.warn('Payout batch already executed this week', {
        batchIdempotencyKey,
        existingRunId: existingRuns[0].id
      });
      return {
        success: true,
        skipped: true,
        reason: 'Already executed for this ISO week',
        existingRunId: existingRuns[0].id
      };
    }

    // 3. payout_run レコード作成（開始）
    const runResult = await dbQuery(
      `INSERT INTO payout_runs (
         iso_week, status, idempotency_key, started_at
       ) VALUES ($1, 'running', $2, now())
       RETURNING id`,
      [isoWeek, batchIdempotencyKey]
    );

    const payoutRunId = runResult[0].id;

    logger.info('Payout run created', { payoutRunId, isoWeek });

    // 4. 送金対象の出品者を取得
    const eligiblePartners = await dbQuery(
      `SELECT
         p.id AS partner_id,
         p.name AS partner_name,
         p.stripe_account_id,
         p.payouts_enabled,
         p.debt_cents
       FROM partners p
       WHERE p.stripe_account_id IS NOT NULL
         AND p.payouts_enabled = true
         AND p.charges_enabled = true
         AND p.details_submitted = true
         AND p.debt_cents <= 10000
       ORDER BY p.id`
    );

    logger.info('Eligible partners retrieved', {
      count: eligiblePartners.length
    });

    const payoutResults = [];
    let totalPayoutAmount = 0;
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 5. 各出品者ごとに送金可能額を計算して送金
    for (const partner of eligiblePartners) {
      try {
        logger.info('Processing payout for partner', {
          partnerId: partner.partner_id,
          partnerName: partner.partner_name
        });

        // 5-1. 送金可能額を計算
        const balanceRows = await dbQuery(
          `SELECT
             l.id,
             l.amount_cents
           FROM ledger l
           WHERE l.partner_id = $1
             AND l.status = 'available'
             AND l.available_at <= now()
           ORDER BY l.available_at ASC`,
          [partner.partner_id]
        );

        if (balanceRows.length === 0) {
          logger.info('No available balance for partner', {
            partnerId: partner.partner_id
          });
          payoutResults.push({
            partnerId: partner.partner_id,
            partnerName: partner.partner_name,
            status: 'skipped',
            reason: 'No available balance'
          });
          skippedCount++;
          continue;
        }

        const availableAmount = balanceRows.reduce((sum, row) => sum + row.amount_cents, 0);
        const ledgerIdsToMark = balanceRows.map(row => row.id);

        logger.info('Available balance calculated', {
          partnerId: partner.partner_id,
          availableAmount,
          entryCount: balanceRows.length
        });

        // 5-2. 最低送金額チェック（3,000円）
        const minPayoutAmount = 3000;
        if (availableAmount < minPayoutAmount) {
          logger.info('Available balance below minimum threshold', {
            partnerId: partner.partner_id,
            availableAmount,
            minPayoutAmount
          });
          payoutResults.push({
            partnerId: partner.partner_id,
            partnerName: partner.partner_name,
            status: 'skipped',
            reason: `Below minimum threshold (${availableAmount} < ${minPayoutAmount})`,
            availableAmount
          });
          skippedCount++;
          continue;
        }

        // 5-3. トランザクション開始
        await dbQuery('BEGIN');

        // 5-4. Stripe Connect Payout作成
        logger.info('Creating Stripe payout', {
          partnerId: partner.partner_id,
          stripeAccountId: partner.stripe_account_id,
          amount: availableAmount
        });

        const payout = await stripe.payouts.create(
          {
            amount: availableAmount, // 円単位
            currency: 'jpy',
            metadata: {
              partner_id: partner.partner_id,
              partner_name: partner.partner_name,
              payout_run_id: payoutRunId,
              iso_week: String(isoWeek),
              ledger_entry_count: String(balanceRows.length)
            }
          },
          {
            stripeAccount: partner.stripe_account_id
          }
        );

        logger.info('Stripe payout created successfully', {
          partnerId: partner.partner_id,
          payoutId: payout.id,
          amount: availableAmount
        });

        // 5-5. 台帳にpayoutエントリを作成
        const payoutIdempotencyKey = `payout-${payout.id}`;
        await dbQuery(
          `INSERT INTO ledger (
             partner_id, type, amount_cents, currency,
             status, stripe_payout_id, idempotency_key, note
           ) VALUES ($1, 'payout', $2, 'jpy', 'paid', $3, $4, $5)
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [
            partner.partner_id,
            -availableAmount, // マイナス値（送金した分を差し引く）
            payout.id,
            payoutIdempotencyKey,
            `送金実行 (ISO週${isoWeek}, Payout: ${payout.id})`
          ]
        );

        // 5-6. 含まれる台帳エントリをpaidにマーク
        await dbQuery(
          `UPDATE ledger SET
             status = 'paid',
             stripe_payout_id = $1,
             updated_at = now()
           WHERE id = ANY($2::uuid[])
             AND status = 'available'`,
          [payout.id, ledgerIdsToMark]
        );

        logger.info('Ledger entries marked as paid', {
          partnerId: partner.partner_id,
          payoutId: payout.id,
          entryCount: ledgerIdsToMark.length
        });

        await dbQuery('COMMIT');

        // 結果記録
        payoutResults.push({
          partnerId: partner.partner_id,
          partnerName: partner.partner_name,
          status: 'success',
          payoutId: payout.id,
          amount: availableAmount,
          entryCount: balanceRows.length
        });

        totalPayoutAmount += availableAmount;
        successCount++;

        logger.info('Payout completed successfully', {
          partnerId: partner.partner_id,
          payoutId: payout.id,
          amount: availableAmount
        });

      } catch (partnerError) {
        await dbQuery('ROLLBACK');

        logger.error('Failed to process payout for partner', {
          partnerId: partner.partner_id,
          error: partnerError.message,
          stack: partnerError.stack
        });

        payoutResults.push({
          partnerId: partner.partner_id,
          partnerName: partner.partner_name,
          status: 'error',
          error: partnerError.message
        });

        errorCount++;
      }
    }

    // 6. payout_run を完了状態に更新
    await dbQuery(
      `UPDATE payout_runs SET
         status = 'completed',
         completed_at = now(),
         total_partners = $1,
         successful_payouts = $2,
         failed_payouts = $3,
         total_amount_cents = $4,
         updated_at = now()
       WHERE id = $5`,
      [
        eligiblePartners.length,
        successCount,
        errorCount,
        totalPayoutAmount,
        payoutRunId
      ]
    );

    logger.info('Payout batch completed successfully', {
      payoutRunId,
      isoWeek,
      totalPartners: eligiblePartners.length,
      successCount,
      skippedCount,
      errorCount,
      totalPayoutAmount
    });

    return {
      success: true,
      payoutRunId,
      isoWeek,
      summary: {
        totalPartners: eligiblePartners.length,
        successCount,
        skippedCount,
        errorCount,
        totalPayoutAmount
      },
      results: payoutResults
    };

  } catch (error) {
    logger.error('Payout batch execution failed', {
      error: error.message,
      stack: error.stack
    });

    // payout_run を失敗状態に更新
    try {
      await dbQuery(
        `UPDATE payout_runs SET
           status = 'failed',
           error_message = $1,
           completed_at = now(),
           updated_at = now()
         WHERE idempotency_key = $2`,
        [error.message, batchIdempotencyKey]
      );
    } catch (updateError) {
      logger.error('Failed to update payout_run status', {
        error: updateError.message
      });
    }

    throw error;
  }
}

/**
 * コマンドライン実行のエントリーポイント
 */
async function main() {
  try {
    console.log('=== Payout Batch Execution Started ===');
    console.log(`Execution time: ${new Date().toISOString()}\n`);

    const result = await executePayoutBatch();

    if (result.skipped) {
      console.log('\n=== Payout Batch Skipped ===');
      console.log(`Reason: ${result.reason}`);
      process.exit(0);
    }

    console.log('\n=== Payout Batch Completed Successfully ===');
    console.log(`Payout Run ID: ${result.payoutRunId}`);
    console.log(`ISO Week: ${result.isoWeek}`);
    console.log('\nSummary:');
    console.log(`  Total Partners: ${result.summary.totalPartners}`);
    console.log(`  Successful Payouts: ${result.summary.successCount}`);
    console.log(`  Skipped: ${result.summary.skippedCount}`);
    console.log(`  Errors: ${result.summary.errorCount}`);
    console.log(`  Total Amount: ¥${result.summary.totalPayoutAmount.toLocaleString()}`);
    console.log('\n=== End ===\n');

    process.exit(0);
  } catch (error) {
    console.error('\n=== Payout Batch Failed ===');
    console.error(`Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// コマンドラインから直接実行された場合のみmain()を実行
if (require.main === module) {
  main();
}

module.exports = {
  executePayoutBatch,
  getISOWeekNumber,
  isValidPayoutDay
};
