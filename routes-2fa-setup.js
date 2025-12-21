/**
 * このファイルはserver.jsに統合するための2FA設定ルートコードです
 * 手動でserver.jsにコピー&ペーストしてください
 */

// ============================================================
// 【追加】2FA設定関連のルート
// ============================================================

// GET /account/2fa/setup - 2FA設定画面
app.get('/account/2fa/setup', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;

    // ユーザーの2FA状態を確認
    const rows = await dbQuery(
      `SELECT two_factor_enabled FROM users WHERE id = $1`,
      [userId]
    );
    const user = rows[0];

    if (user.two_factor_enabled) {
      // すでに有効化済み
      return res.redirect('/account/profile#security');
    }

    // 新しい秘密鍵を生成
    const { secret, otpauth_url } = twoFA.generate2FASecret(req.session.user.email);

    // QRコードを生成
    const qrCodeDataURL = await twoFA.generateQRCode(otpauth_url);

    // セッションに一時保存（検証後に保存）
    req.session.pending2FASecret = secret;

    res.set('Cache-Control', 'no-store');
    res.render('account/2fa-setup', {
      title: '二要素認証の設定',
      qrCodeDataURL,
      secret,
      csrfToken: typeof req.csrfToken === 'function' ? req.csrfToken() : null
    });
  } catch (err) {
    next(err);
  }
});

// POST /account/2fa/enable - 2FA有効化
app.post('/account/2fa/enable', requireAuth, csrfProtect, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { token } = req.body;
    const secret = req.session.pending2FASecret;

    if (!secret) {
      return res.status(400).json({
        ok: false,
        message: 'セッションが期限切れです。もう一度設定画面を開いてください。'
      });
    }

    // トークン検証
    const valid = twoFA.verify2FAToken(secret, token, 2); // window=2 で少し緩めに検証

    if (!valid) {
      return res.status(401).json({
        ok: false,
        message: '認証コードが正しくありません。もう一度お試しください。'
      });
    }

    // バックアップコードを生成
    const backupCodes = await twoFA.generateBackupCodes();
    const hashedBackupCodes = await twoFA.hashBackupCodes(backupCodes);

    // 秘密鍵を暗号化
    const encryptedSecret = twoFA.encrypt2FASecret(secret);

    // DBに保存
    await dbQuery(
      `UPDATE users
       SET two_factor_enabled = true,
           two_factor_secret = $1,
           two_factor_backup_codes = $2,
           two_factor_enabled_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [encryptedSecret, hashedBackupCodes, userId]
    );

    // セッションから削除
    delete req.session.pending2FASecret;

    res.json({
      ok: true,
      backupCodes // プレーンテキストで返す（これが最後のチャンス）
    });
  } catch (err) {
    next(err);
  }
});

// POST /account/2fa/disable - 2FA無効化
app.post('/account/2fa/disable', requireAuth, csrfProtect, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { password } = req.body;

    // パスワード確認
    const rows = await dbQuery(
      `SELECT password_hash FROM users WHERE id = $1`,
      [userId]
    );
    const user = rows[0];

    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      return res.status(401).json({
        ok: false,
        message: 'パスワードが正しくありません。'
      });
    }

    // 2FAを無効化
    await dbQuery(
      `UPDATE users
       SET two_factor_enabled = false,
           two_factor_secret = NULL,
           two_factor_backup_codes = NULL,
           two_factor_enabled_at = NULL
       WHERE id = $1`,
      [userId]
    );

    // 信頼済みデバイスも削除
    await dbQuery(
      `DELETE FROM trusted_devices WHERE user_id = $1`,
      [userId]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /account/2fa/regenerate - バックアップコード再生成
app.post('/account/2fa/regenerate', requireAuth, csrfProtect, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { password } = req.body;

    // パスワード確認
    const rows = await dbQuery(
      `SELECT password_hash, two_factor_enabled FROM users WHERE id = $1`,
      [userId]
    );
    const user = rows[0];

    if (!user.two_factor_enabled) {
      return res.status(400).json({
        ok: false,
        message: '2FAが有効化されていません。'
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      return res.status(401).json({
        ok: false,
        message: 'パスワードが正しくありません。'
      });
    }

    // 新しいバックアップコードを生成
    const backupCodes = await twoFA.generateBackupCodes();
    const hashedBackupCodes = await twoFA.hashBackupCodes(backupCodes);

    // DBを更新
    await dbQuery(
      `UPDATE users
       SET two_factor_backup_codes = $1
       WHERE id = $2`,
      [hashedBackupCodes, userId]
    );

    res.json({
      ok: true,
      backupCodes
    });
  } catch (err) {
    next(err);
  }
});

// GET /account/trusted-devices - 信頼済みデバイス一覧
app.get('/account/trusted-devices', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;

    const devices = await dbQuery(
      `SELECT id, device_name, ip_address, last_used_at, expires_at, created_at
       FROM trusted_devices
       WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP
       ORDER BY last_used_at DESC`,
      [userId]
    );

    res.json({ ok: true, devices });
  } catch (err) {
    next(err);
  }
});

// DELETE /account/trusted-devices/:deviceId - 信頼済みデバイス削除
app.delete('/account/trusted-devices/:deviceId', requireAuth, csrfProtect, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const deviceId = req.params.deviceId;

    const result = await dbQuery(
      `DELETE FROM trusted_devices
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [deviceId, userId]
    );

    if (result.length === 0) {
      return res.status(404).json({
        ok: false,
        message: 'デバイスが見つかりません。'
      });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /account/login-history - ログイン履歴
app.get('/account/login-history', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const limit = parseInt(req.query.limit) || 20;

    const history = await dbQuery(
      `SELECT id, success, ip_address, user_agent, failure_reason,
              two_factor_used, created_at
       FROM login_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    res.json({ ok: true, history });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 【追加】管理者用：アカウントロック解除
// ============================================================

// POST /admin/users/:id/unlock - アカウントロック解除（管理者のみ）
app.post('/admin/users/:id/unlock', requireAuth, requireRole(['admin']), csrfProtect, async (req, res, next) => {
  try {
    const userId = req.params.id;

    // アカウントロック解除
    await dbQuery(
      `UPDATE users
       SET account_locked_at = NULL,
           account_locked_reason = NULL,
           failed_login_attempts = 0,
           last_failed_login_at = NULL
       WHERE id = $1`,
      [userId]
    );

    // ユーザーにメール通知
    const userRows = await dbQuery(
      `SELECT email, name FROM users WHERE id = $1`,
      [userId]
    );
    const user = userRows[0];

    if (user) {
      try {
        await gmailSend({
          to: user.email,
          subject: 'アカウントのロックが解除されました - セッツマルシェ',
          html: `
            <p>${user.name} 様</p>
            <p>管理者により、お客様のアカウントのロックが解除されました。</p>
            <p>再度ログインが可能になりました。</p>
            <p>もしロック解除に心当たりがない場合は、お問い合わせフォームよりご連絡ください。</p>
            <p>---<br>セッツマルシェ</p>
          `
        });
      } catch (mailErr) {
        console.error('Failed to send unlock email:', mailErr);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
