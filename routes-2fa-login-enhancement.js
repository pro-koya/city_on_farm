/**
 * このファイルはserver.jsに統合するためのコードスニペット集です
 * 手動でserver.jsにコピー&ペーストしてください
 */

// ============================================================
// 【追加】ファイル冒頭のrequire文に以下を追加
// ============================================================
/*
const twoFA = require('./utils/2fa');
*/

// ============================================================
// 【追加】ヘルパー関数（server.jsのログイン処理の前に追加）
// ============================================================

/**
 * ログイン履歴を記録
 */
async function recordLoginAttempt(dbQuery, {
  userId = null,
  email,
  success,
  ipAddress,
  userAgent,
  failureReason = null,
  twoFactorUsed = false
}) {
  try {
    await dbQuery(
      `INSERT INTO login_history
       (user_id, email, success, ip_address, user_agent, failure_reason, two_factor_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, email, success, ipAddress, userAgent, failureReason, twoFactorUsed]
    );
  } catch (err) {
    console.error('Failed to record login attempt:', err);
  }
}

/**
 * アカウントがロックされているかチェック
 */
function isAccountLocked(user) {
  return user.account_locked_at !== null && user.account_locked_at !== undefined;
}

// ============================================================
// 【置換】既存の POST /login を以下のコードで置き換え
// ============================================================

// POST /login - 強化版（2FA対応、ログイン履歴記録、アカウントロック）
app.post(
  '/login',
  loginLimiter,
  csrfProtect,
  [
    body('email').trim().isEmail().withMessage('有効なメールアドレスを入力してください。').normalizeEmail({
      gmail_remove_dots: false,
      gmail_remove_subaddress: false,
      gmail_convert_googlemaildotcom: false
    }),
    body('password').isLength({ min: 8 }).withMessage('パスワードは8文字以上で入力してください。')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      const { email, password, trustDevice } = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || '';

      if (!errors.isEmpty()) {
        const fieldErrors = {};
        for (const e of errors.array()) if (!fieldErrors[e.path]) fieldErrors[e.path] = e.msg;
        return res.status(422).render('auth/login', {
          title: 'ログイン',
          csrfToken: req.csrfToken(),
          values: { email },
          fieldErrors,
          globalError: '',
          showResendLink: false
        });
      }

      // ユーザー情報取得（2FA関連カラムも含める）
      const rows = await dbQuery(
        `SELECT id, name, email, password_hash, roles, seller_intro_summary, email_verified_at,
                two_factor_enabled, two_factor_secret, two_factor_backup_codes,
                account_locked_at, account_locked_reason, failed_login_attempts
         FROM users
         WHERE email = $1
         LIMIT 1`,
        [email]
      );
      const user = rows[0];

      // パスワード検証
      const ok = user ? await bcrypt.compare(password, user.password_hash) : false;

      if (!ok) {
        // ログイン失敗を記録
        await recordLoginAttempt(dbQuery, {
          userId: user?.id,
          email,
          success: false,
          ipAddress,
          userAgent,
          failureReason: 'パスワード誤り'
        });

        // 失敗回数をインクリメント
        if (user) {
          const failedAttempts = (user.failed_login_attempts || 0) + 1;
          await dbQuery(
            `UPDATE users
             SET failed_login_attempts = $1,
                 last_failed_login_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [failedAttempts, user.id]
          );

          // 10回失敗でアカウントロック
          if (failedAttempts >= 10) {
            await dbQuery(
              `UPDATE users
               SET account_locked_at = CURRENT_TIMESTAMP,
                   account_locked_reason = 'ログイン試行回数超過'
               WHERE id = $1`,
              [user.id]
            );

            // ロック通知メール送信（非同期）
            try {
              await gmailSend({
                to: user.email,
                subject: '【重要】アカウントがロックされました - セッツマルシェ',
                html: `
                  <p>${user.name} 様</p>
                  <p>セキュリティのため、お客様のアカウントをロックしました。</p>
                  <p><strong>理由:</strong> ログイン試行回数が上限（10回）に達しました。</p>
                  <p>もしお客様ご自身によるログイン試行でない場合は、第三者による不正アクセスの可能性があります。</p>
                  <p>アカウントのロック解除については、お問い合わせフォームよりご連絡ください。</p>
                  <p>---<br>セッツマルシェ</p>
                `
              });
            } catch (mailErr) {
              console.error('Failed to send account lock email:', mailErr);
            }
          }
        }

        const msg = 'メールアドレスまたはパスワードが正しくありません。';
        return res.status(401).render('auth/login', {
          title: 'ログイン',
          csrfToken: req.csrfToken(),
          values: { email },
          fieldErrors: { email: msg, password: msg },
          globalError: '',
          showResendLink: false
        });
      }

      // アカウントロックチェック
      if (isAccountLocked(user)) {
        await recordLoginAttempt(dbQuery, {
          userId: user.id,
          email,
          success: false,
          ipAddress,
          userAgent,
          failureReason: 'アカウントロック中'
        });

        return res.status(403).render('auth/login', {
          title: 'ログイン',
          csrfToken: req.csrfToken(),
          values: { email },
          fieldErrors: {},
          globalError: `アカウントがロックされています。理由: ${user.account_locked_reason || '不明'}。お問い合わせフォームよりご連絡ください。`,
          showResendLink: false
        });
      }

      // メールアドレス未検証チェック
      if (!user.email_verified_at) {
        await recordLoginAttempt(dbQuery, {
          userId: user.id,
          email,
          success: false,
          ipAddress,
          userAgent,
          failureReason: 'メールアドレス未検証'
        });

        req.session.pendingVerifyUserId = user.id;
        req.session.pendingVerifyEmail = user.email;
        const msg = 'メールアドレスの確認が完了していません。メールアドレスを認証してください。';
        return res.render('auth/login', {
          title: 'ログイン',
          csrfToken: req.csrfToken(),
          values: { email },
          fieldErrors: { email: msg, password: msg },
          showResendLink: true
        });
      }

      // パスワード認証成功 - 失敗回数をリセット
      await dbQuery(
        `UPDATE users
         SET failed_login_attempts = 0,
             last_failed_login_at = NULL
         WHERE id = $1`,
        [user.id]
      );

      // 2FA有効化チェック
      if (user.two_factor_enabled) {
        // 信頼済みデバイスチェック
        const deviceToken = req.cookies['trusted_device'];
        let isTrustedDevice = false;

        if (deviceToken) {
          const trustedDevices = await dbQuery(
            `SELECT id FROM trusted_devices
             WHERE user_id = $1
               AND device_token = $2
               AND expires_at > CURRENT_TIMESTAMP`,
            [user.id, deviceToken]
          );

          if (trustedDevices.length > 0) {
            isTrustedDevice = true;
            // 最終使用日時を更新
            await dbQuery(
              `UPDATE trusted_devices
               SET last_used_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [trustedDevices[0].id]
            );
          }
        }

        if (!isTrustedDevice) {
          // 2FA検証が必要 - 一時セッションに保存
          req.session.pending2FA = {
            userId: user.id,
            email: user.email,
            name: user.name,
            roles: user.roles || [],
            trustDevice: trustDevice === 'on'
          };

          return res.redirect('/login/2fa');
        }
      }

      // ログイン成功を記録
      await recordLoginAttempt(dbQuery, {
        userId: user.id,
        email,
        success: true,
        ipAddress,
        userAgent,
        twoFactorUsed: user.two_factor_enabled
      });

      // セッションにユーザー情報を保存
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles || []
      };

      await mergeSessionCartToDb(req, user.id);
      await mergeSessionRecentToDb(req);
      await attachContactsToUserAfterLogin(user);

      const roles = user.roles || [];
      return res.redirect(roles.includes('seller') ? '/dashboard/seller' : '/dashboard/buyer');
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// 【追加】2FAログイン検証画面とルート
// ============================================================

// GET /login/2fa - 2FA検証画面
app.get('/login/2fa', (req, res) => {
  if (!req.session.pending2FA) {
    return res.redirect('/login');
  }

  res.set('Cache-Control', 'no-store');
  res.render('auth/login-2fa', {
    title: '二要素認証',
    csrfToken: typeof req.csrfToken === 'function' ? req.csrfToken() : null,
    email: req.session.pending2FA.email,
    error: '',
    useBackupCode: false
  });
});

// POST /login/2fa/verify - 2FAトークン検証
app.post(
  '/login/2fa/verify',
  csrfProtect,
  rateLimit({
    windowMs: 60 * 1000,  // 1分
    max: 5,                // 最大5回
    message: '試行回数が上限に達しました。1分後に再試行してください。'
  }),
  async (req, res, next) => {
    try {
      if (!req.session.pending2FA) {
        return res.redirect('/login');
      }

      const { token } = req.body;
      const { userId, email, name, roles, trustDevice } = req.session.pending2FA;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || '';

      // ユーザー情報取得
      const rows = await dbQuery(
        `SELECT two_factor_secret FROM users WHERE id = $1`,
        [userId]
      );
      const user = rows[0];

      if (!user || !user.two_factor_secret) {
        return res.status(400).render('auth/login-2fa', {
          title: '二要素認証',
          csrfToken: req.csrfToken(),
          email,
          error: '2FA設定が見つかりません。',
          useBackupCode: false
        });
      }

      // 秘密鍵を復号化
      const secret = twoFA.decrypt2FASecret(user.two_factor_secret);

      // トークン検証
      const valid = twoFA.verify2FAToken(secret, token);

      if (!valid) {
        await recordLoginAttempt(dbQuery, {
          userId,
          email,
          success: false,
          ipAddress,
          userAgent,
          failureReason: '2FA検証失敗'
        });

        return res.status(401).render('auth/login-2fa', {
          title: '二要素認証',
          csrfToken: req.csrfToken(),
          email,
          error: '認証コードが正しくありません。',
          useBackupCode: false
        });
      }

      // 2FA検証成功
      await recordLoginAttempt(dbQuery, {
        userId,
        email,
        success: true,
        ipAddress,
        userAgent,
        twoFactorUsed: true
      });

      // 信頼済みデバイスとして保存
      if (trustDevice) {
        const deviceToken = twoFA.generateDeviceToken();
        const deviceName = twoFA.parseDeviceName(userAgent);

        await dbQuery(
          `INSERT INTO trusted_devices
           (user_id, device_token, device_name, ip_address, last_used_at, expires_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days')`,
          [userId, deviceToken, deviceName, ipAddress]
        );

        // Cookieに保存（30日間）
        res.cookie('trusted_device', deviceToken, {
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30日
          httpOnly: true,
          secure: isProd,
          sameSite: 'lax'
        });
      }

      // セッションにユーザー情報を保存
      req.session.user = { id: userId, name, email, roles };
      delete req.session.pending2FA;

      await mergeSessionCartToDb(req, userId);
      await mergeSessionRecentToDb(req);

      return res.redirect(roles.includes('seller') ? '/dashboard/seller' : '/dashboard/buyer');
    } catch (err) {
      next(err);
    }
  }
);

// POST /login/2fa/backup - バックアップコード検証
app.post(
  '/login/2fa/backup',
  csrfProtect,
  rateLimit({
    windowMs: 60 * 1000,
    max: 3,
    message: '試行回数が上限に達しました。1分後に再試行してください。'
  }),
  async (req, res, next) => {
    try {
      if (!req.session.pending2FA) {
        return res.redirect('/login');
      }

      const { backupCode } = req.body;
      const { userId, email, name, roles } = req.session.pending2FA;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || '';

      // ユーザー情報取得
      const rows = await dbQuery(
        `SELECT two_factor_backup_codes FROM users WHERE id = $1`,
        [userId]
      );
      const user = rows[0];

      if (!user || !user.two_factor_backup_codes) {
        return res.status(400).render('auth/login-2fa', {
          title: '二要素認証',
          csrfToken: req.csrfToken(),
          email,
          error: 'バックアップコードが見つかりません。',
          useBackupCode: true
        });
      }

      // バックアップコード検証
      const result = await twoFA.verifyBackupCode(backupCode, user.two_factor_backup_codes);

      if (!result.valid) {
        await recordLoginAttempt(dbQuery, {
          userId,
          email,
          success: false,
          ipAddress,
          userAgent,
          failureReason: 'バックアップコード検証失敗'
        });

        return res.status(401).render('auth/login-2fa', {
          title: '二要素認証',
          csrfToken: req.csrfToken(),
          email,
          error: 'バックアップコードが正しくありません。',
          useBackupCode: true
        });
      }

      // バックアップコード使用成功 - 使用済みコードを削除
      const updatedCodes = user.two_factor_backup_codes.filter((_, index) => index !== result.index);
      await dbQuery(
        `UPDATE users SET two_factor_backup_codes = $1 WHERE id = $2`,
        [updatedCodes, userId]
      );

      await recordLoginAttempt(dbQuery, {
        userId,
        email,
        success: true,
        ipAddress,
        userAgent,
        twoFactorUsed: true
      });

      req.session.user = { id: userId, name, email, roles };
      delete req.session.pending2FA;

      await mergeSessionCartToDb(req, userId);
      await mergeSessionRecentToDb(req);

      return res.redirect(roles.includes('seller') ? '/dashboard/seller' : '/dashboard/buyer');
    } catch (err) {
      next(err);
    }
  }
);
