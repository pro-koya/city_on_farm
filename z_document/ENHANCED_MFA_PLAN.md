# 多要素認証（MFA）強化計画

## 1. 現状分析

### 現在の2FA実装
- **方式**: TOTP（Time-based One-Time Password）
- **フロー**:
  1. QRコードをスキャン
  2. 認証アプリ（Google Authenticator等）で6桁コードを生成
  3. ログイン時に6桁コードを入力
- **問題点**:
  - QRコードのスキャンが面倒
  - 毎回6桁のコードを入力する必要がある
  - スマホを取り出す手間がかかる
  - 認証アプリのインストールが必要

### 既存機能
- ✅ 信頼済みデバイス機能（30日間有効）
- ✅ ログイン履歴追跡
- ✅ アカウントロック機能
- ✅ バックアップコード

---

## 2. 目標

### ユーザー体験の向上
- 生体認証による**ワンタッチ認証**
- SMSやメールによる**コードレス認証**
- デバイスごとに最適な認証方法を選択可能

### セキュリティの維持・向上
- フィッシング耐性の向上（WebAuthn）
- 複数の認証方法による冗長性
- デバイス紛失時の柔軟な対応

---

## 3. 追加する認証方法

### 3.1 WebAuthn（生体認証・パスキー）【推奨】

#### 概要
- W3C標準の認証プロトコル（FIDO2）
- 生体認証（FaceID、TouchID、指紋認証、Windows Hello）に対応
- セキュリティキー（YubiKey等）にも対応

#### 特徴
- ✅ **最高のセキュリティ**: フィッシング耐性あり
- ✅ **最高のUX**: ワンタッチで認証完了
- ✅ **追加コストなし**: ブラウザAPI使用
- ✅ **クロスプラットフォーム**: iOS/Android/Windows/Mac対応
- ⚠️ 古いブラウザは非対応（IE11等）

#### 技術スタック
- フロントエンド: Web Authentication API (navigator.credentials)
- バックエンド: `@simplewebauthn/server` (Node.js)
- データベース: 認証器情報の保存

#### フロー
1. **登録時**:
   - ユーザーが「生体認証を追加」をクリック
   - ブラウザが生体認証を要求（FaceID等）
   - 公開鍵をサーバーに保存
2. **認証時**:
   - ログイン後、生体認証を要求
   - デバイスで認証（FaceID等）
   - 秘密鍵で署名を生成し、サーバーで検証

---

### 3.2 SMS認証

#### 概要
- 携帯電話番号に6桁のコードをSMS送信
- 受信したコードを入力して認証

#### 特徴
- ✅ **簡単**: スマホさえあればOK
- ✅ **馴染みがある**: 多くのサービスで使用
- ⚠️ **コストあり**: 1通あたり約5-10円（Twilio等）
- ⚠️ **セキュリティリスク**: SIMスワップ攻撃のリスク
- ⚠️ **電波依存**: 圏外では使用不可

#### 技術スタック
- SMS送信サービス: Twilio / AWS SNS / Vonage
- 推奨: **Twilio** (日本で広く使用、安定性高い)

#### コスト見積もり（Twilio）
- 初期費用: 無料
- SMS送信: 約7円/通（日本国内）
- 月額最低料金: なし
- 月間100回認証: 約700円
- 月間1,000回認証: 約7,000円

---

### 3.3 メール認証

#### 概要
- メールアドレスに6桁のコードまたはマジックリンクを送信
- 受信したコードを入力、またはリンクをクリックして認証

#### 特徴
- ✅ **追加コストなし**: 既存のSMTP使用
- ✅ **簡単**: メールさえあればOK
- ✅ **通知が残る**: 不正ログインの検知に有効
- ⚠️ **メール遅延**: 数秒〜数分かかる場合あり
- ⚠️ **迷惑メールフィルタ**: 届かない可能性

#### 技術スタック
- 既存のGmail SMTP使用
- テンプレートエンジン: EJS（既存）

#### 実装方式（2種類）
1. **コード方式**: 6桁のコードをメール送信 → ユーザーが入力
2. **マジックリンク方式**: ワンタイムURLを送信 → クリックで認証完了

---

## 4. データベース設計

### 4.1 新規テーブル: `webauthn_credentials`

```sql
CREATE TABLE webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- WebAuthn固有フィールド
  credential_id TEXT UNIQUE NOT NULL,          -- Base64エンコードされた認証器ID
  public_key TEXT NOT NULL,                     -- Base64エンコードされた公開鍵
  counter BIGINT DEFAULT 0,                     -- リプレイ攻撃防止カウンター

  -- 認証器情報
  authenticator_type VARCHAR(50),               -- 'platform'（内蔵）or 'cross-platform'（外部キー）
  transports TEXT[],                            -- ['usb', 'nfc', 'ble', 'internal']

  -- ユーザー管理用
  device_name TEXT,                             -- ユーザーが設定するデバイス名（例: "iPhone 14"）
  last_used_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webauthn_user_id ON webauthn_credentials(user_id);
CREATE INDEX idx_webauthn_credential_id ON webauthn_credentials(credential_id);
```

### 4.2 新規テーブル: `mfa_otp_codes`

```sql
CREATE TABLE mfa_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- コード情報
  code VARCHAR(6) NOT NULL,                     -- 6桁の数字
  code_type VARCHAR(20) NOT NULL,               -- 'sms' or 'email'

  -- 送信先
  sent_to TEXT NOT NULL,                        -- 電話番号 or メールアドレス

  -- ステータス
  used_at TIMESTAMP,                            -- 使用済みの場合
  expires_at TIMESTAMP NOT NULL,                -- 有効期限（5分後）

  -- セキュリティ
  attempt_count INTEGER DEFAULT 0,              -- 試行回数（5回まで）
  ip_address INET,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mfa_otp_user_id ON mfa_otp_codes(user_id);
CREATE INDEX idx_mfa_otp_expires ON mfa_otp_codes(expires_at);
```

### 4.3 既存テーブルの拡張: `users`

```sql
-- 認証方法の有効化フラグ
ALTER TABLE users ADD COLUMN webauthn_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN sms_2fa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN email_2fa_enabled BOOLEAN DEFAULT FALSE;

-- SMS認証用
ALTER TABLE users ADD COLUMN phone_number VARCHAR(20);
ALTER TABLE users ADD COLUMN phone_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN phone_verified_at TIMESTAMP;

-- 優先認証方法
ALTER TABLE users ADD COLUMN preferred_mfa_method VARCHAR(20); -- 'totp', 'webauthn', 'sms', 'email'

CREATE INDEX idx_users_phone_number ON users(phone_number) WHERE phone_number IS NOT NULL;
```

---

## 5. 実装フロー

### 5.1 WebAuthn登録フロー

```
【ユーザー】                【ブラウザ】              【サーバー】
    |                           |                        |
    | 1. "生体認証を追加"クリック  |                        |
    |-------------------------->|                        |
    |                           | 2. チャレンジ要求        |
    |                           |----------------------->|
    |                           |                        | 3. チャレンジ生成
    |                           | 4. チャレンジ返却        | (ランダム文字列)
    |                           |<-----------------------|
    |                           |                        |
    | 5. 生体認証（FaceID等）     |                        |
    |<--------------------------|                        |
    | 6. 認証OK                  |                        |
    |-------------------------->|                        |
    |                           | 7. 公開鍵＋署名送信      |
    |                           |----------------------->|
    |                           |                        | 8. 署名検証
    |                           |                        | 9. 公開鍵保存
    |                           | 10. 登録完了通知         |
    |                           |<-----------------------|
    | 11. 完了メッセージ表示      |                        |
    |<--------------------------|                        |
```

### 5.2 WebAuthn認証フロー

```
【ユーザー】                【ブラウザ】              【サーバー】
    |                           |                        |
    | 1. ログイン（ID/PW）       |                        |
    |-------------------------->|                        |
    |                           | 2. 1st認証成功          |
    |                           |<-----------------------|
    |                           | 3. MFAチャレンジ要求     |
    |                           |----------------------->|
    |                           |                        | 4. チャレンジ生成
    |                           | 5. チャレンジ返却        |
    |                           |<-----------------------|
    | 6. 生体認証（FaceID等）     |                        |
    |<--------------------------|                        |
    | 7. 認証OK                  |                        |
    |-------------------------->|                        |
    |                           | 8. 署名送信             |
    |                           |----------------------->|
    |                           |                        | 9. 署名検証
    |                           |                        | 10. セッション確立
    |                           | 11. ログイン完了         |
    |                           |<-----------------------|
    | 12. ダッシュボード表示      |                        |
    |<--------------------------|                        |
```

### 5.3 SMS/メール認証フロー

```
【ユーザー】                【サーバー】              【SMS/メール】
    |                           |                        |
    | 1. ログイン（ID/PW）       |                        |
    |-------------------------->|                        |
    |                           | 2. 1st認証成功          |
    |                           | 3. 6桁コード生成         |
    |                           | 4. SMS/メール送信        |
    |                           |----------------------->|
    |                           |                        | 5. 受信
    | 6. コード入力              |                        |
    |-------------------------->|                        |
    |                           | 7. コード検証            |
    |                           | 8. セッション確立        |
    | 9. ログイン完了            |                        |
    |<--------------------------|                        |
```

---

## 6. UI/UX設計

### 6.1 設定画面（アカウント設定 > セキュリティ）

```
┌─────────────────────────────────────────────┐
│ セキュリティ設定                              │
├─────────────────────────────────────────────┤
│                                             │
│ 二要素認証（2FA）                            │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│ 📱 認証アプリ（TOTP）              [✓ 有効] │
│   Google Authenticator等で6桁コード生成      │
│   └ [再設定] [無効化]                        │
│                                             │
│ 🔐 生体認証・セキュリティキー     [推奨]     │
│   FaceID、指紋認証、YubiKeyなど              │
│   └ 登録済みデバイス (2個)                   │
│      • iPhone 14 (最終使用: 2時間前)         │
│      • MacBook Pro (最終使用: 1日前)         │
│      [+ 新しいデバイスを追加]                │
│                                             │
│ 📧 メール認証                      [  無効] │
│   example@gmail.comにコードを送信            │
│   └ [有効化]                                │
│                                             │
│ 📱 SMS認証                        [  無効] │
│   携帯電話にコードを送信                     │
│   └ [電話番号を登録して有効化]               │
│                                             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│ 優先認証方法: 生体認証 [変更]                │
│                                             │
│ 💡 ヒント: 複数の方法を有効化することで、     │
│    デバイス紛失時も安心です                  │
│                                             │
└─────────────────────────────────────────────┘
```

### 6.2 ログイン画面（2FA選択）

```
┌─────────────────────────────────────────────┐
│ 二要素認証                                   │
├─────────────────────────────────────────────┤
│                                             │
│ ログインを完了するために認証してください       │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 🔐 生体認証で認証              [推奨]   │ │
│ │                                         │ │
│ │   [Touch IDで認証する]                  │ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ その他の認証方法:                            │
│ • [📱 認証アプリのコードを入力]              │
│ • [📧 メールでコードを受け取る]              │
│ • [💬 SMSでコードを受け取る]                 │
│                                             │
│ [バックアップコードを使用]                   │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 7. セキュリティ考慮事項

### 7.1 WebAuthn
- ✅ チャレンジの再利用防止（使用後即削除）
- ✅ カウンター検証（リプレイ攻撃防止）
- ✅ オリジン検証（フィッシング防止）
- ✅ HTTPS必須

### 7.2 SMS/メール
- ✅ コードの有効期限: 5分
- ✅ 試行回数制限: 5回まで
- ✅ レート制限: 同一ユーザーに1分間に1回まで送信
- ✅ 使用後即無効化
- ✅ IPアドレス記録

### 7.3 共通
- ✅ ログイン履歴の記録
- ✅ 不正アクセス検知
- ✅ 信頼済みデバイス機能の継続
- ✅ セッション管理の強化

---

## 8. 段階的実装計画

### フェーズ1: WebAuthn実装（推奨優先）
**期間**: 2週間
**理由**: 最高のUX・セキュリティ、追加コストなし

#### タスク
1. **Week 1**:
   - [ ] データベース設計（webauthn_credentials テーブル）
   - [ ] マイグレーション実行
   - [ ] `@simplewebauthn/server` セットアップ
   - [ ] 登録API実装（チャレンジ生成、公開鍵保存）
   - [ ] 認証API実装（チャレンジ検証、署名検証）

2. **Week 2**:
   - [ ] フロントエンド実装（登録UI）
   - [ ] フロントエンド実装（認証UI）
   - [ ] 設定画面の改修（デバイス管理）
   - [ ] テスト（iOS、Android、Mac、Windows）
   - [ ] ドキュメント作成

#### 成果物
- 生体認証による2FA
- デバイス管理画面
- テストレポート

---

### フェーズ2: メール認証実装
**期間**: 1週間
**理由**: 追加コストなし、既存SMTP利用

#### タスク
1. **Week 1**:
   - [ ] データベース設計（mfa_otp_codes テーブル）
   - [ ] マイグレーション実行
   - [ ] コード生成ロジック実装
   - [ ] メール送信テンプレート作成
   - [ ] 認証API実装
   - [ ] フロントエンド実装
   - [ ] レート制限実装
   - [ ] テスト

#### 成果物
- メールによる2FA
- メールテンプレート
- レート制限機能

---

### フェーズ3: SMS認証実装（オプション）
**期間**: 1週間
**理由**: コストかかるが、ユーザーニーズ次第

#### タスク
1. **事前準備**:
   - [ ] Twilioアカウント作成
   - [ ] 電話番号取得（日本の番号推奨）
   - [ ] テスト環境セットアップ

2. **Week 1**:
   - [ ] users テーブル拡張（phone_number等）
   - [ ] マイグレーション実行
   - [ ] Twilio SDK統合
   - [ ] 電話番号登録・検証フロー実装
   - [ ] SMS送信ロジック実装
   - [ ] 認証API実装
   - [ ] フロントエンド実装
   - [ ] レート制限・コスト監視実装
   - [ ] テスト

#### 成果物
- SMS認証機能
- 電話番号管理
- コスト監視ダッシュボード

---

## 9. 技術スタック詳細

### 9.1 WebAuthn

#### npm パッケージ
```json
{
  "@simplewebauthn/server": "^9.0.0",
  "@simplewebauthn/browser": "^9.0.0"
}
```

#### サーバーサイド例
```javascript
const { generateRegistrationOptions, verifyRegistrationResponse } = require('@simplewebauthn/server');

// 登録時: チャレンジ生成
const options = await generateRegistrationOptions({
  rpName: 'セッツマルシェ',
  rpID: 'localhost', // 本番: yourdomain.com
  userID: user.id,
  userName: user.email,
  attestationType: 'none',
  authenticatorSelection: {
    residentKey: 'preferred',
    userVerification: 'preferred'
  }
});
```

#### クライアントサイド例
```javascript
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

// 登録
const credential = await startRegistration(options);

// 認証
const assertion = await startAuthentication(options);
```

---

### 9.2 SMS（Twilio）

#### npm パッケージ
```json
{
  "twilio": "^4.19.0"
}
```

#### サーバーサイド例
```javascript
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// SMS送信
await client.messages.create({
  body: `セッツマルシェ認証コード: ${code}`,
  from: process.env.TWILIO_PHONE_NUMBER,
  to: user.phone_number
});
```

---

### 9.3 メール認証

#### サーバーサイド例
```javascript
const nodemailer = require('nodemailer'); // 既存

// コード生成
const code = Math.floor(100000 + Math.random() * 900000).toString();

// メール送信
await transporter.sendMail({
  from: process.env.MAIL_FROM,
  to: user.email,
  subject: 'セッツマルシェ 認証コード',
  html: `
    <h1>認証コード</h1>
    <p>以下のコードを入力してログインを完了してください：</p>
    <h2 style="letter-spacing: 0.5em; font-size: 2rem;">${code}</h2>
    <p>このコードは5分間有効です。</p>
  `
});
```

---

## 10. コスト見積もり

### 初期開発コスト
| フェーズ | 工数 | 説明 |
|---------|------|------|
| WebAuthn実装 | 2週間 | 生体認証・パスキー |
| メール認証実装 | 1週間 | 既存SMTP利用 |
| SMS認証実装 | 1週間 | Twilio統合 |
| **合計** | **4週間** | |

### 運用コスト（月額）

#### WebAuthn
- **¥0** - ブラウザAPIのため無料

#### メール認証
- **¥0** - 既存Gmail SMTP利用（無料枠内）

#### SMS認証（Twilioの場合）
| 利用量 | 月額コスト |
|--------|-----------|
| 100通/月 | 約700円 |
| 500通/月 | 約3,500円 |
| 1,000通/月 | 約7,000円 |
| 5,000通/月 | 約35,000円 |

**推奨**: まずWebAuthnとメール認証のみ実装（コスト¥0）し、ユーザーからSMS認証の要望が多ければ追加検討

---

## 11. ユーザー採用戦略

### 段階的ロールアウト
1. **Week 1-2**: 管理者ユーザーでベータテスト
2. **Week 3**: 出品者ユーザーに展開
3. **Week 4**: 全ユーザーに展開

### 既存ユーザー向け
- 既存のTOTP認証は継続サポート
- 「生体認証を試す」バナー表示
- 設定画面で簡単に追加可能

### 新規ユーザー向け
- 初回ログイン時に「生体認証を設定しますか？」と提案
- スキップ可能（強制しない）

---

## 12. リスク管理

### 技術的リスク
| リスク | 影響 | 対策 |
|--------|------|------|
| 古いブラウザでWebAuthn非対応 | 中 | フォールバック（TOTP）提供 |
| SMS遅延・不達 | 中 | メール認証も提供、タイムアウト延長 |
| メール迷惑メールフィルタ | 低 | SPF/DKIM設定、送信元ドメイン信頼性向上 |

### ビジネスリスク
| リスク | 影響 | 対策 |
|--------|------|------|
| SMS認証コスト増大 | 中 | 月次レポート、上限アラート設定 |
| ユーザーの混乱 | 低 | 丁寧なオンボーディング、ヘルプドキュメント |

---

## 13. 成功指標（KPI）

### ユーザー体験
- [ ] 2FA認証時間: 平均30秒 → **5秒以下**（WebAuthn）
- [ ] 2FA有効化率: 現在20% → **50%以上**
- [ ] WebAuthn採用率: **新規有効化の70%以上**
- [ ] ユーザー満足度: **4.5/5以上**

### セキュリティ
- [ ] 不正ログイン試行の検知・ブロック率: **95%以上**
- [ ] アカウント乗っ取り被害: **0件**

---

## 14. 次のステップ

### 即座に実施
1. ✅ この計画書をレビュー
2. [ ] 優先順位の確認（WebAuthn優先で合意？）
3. [ ] フェーズ1（WebAuthn）の開始承認

### フェーズ1開始時
1. [ ] データベースマイグレーション実行
2. [ ] `@simplewebauthn` パッケージインストール
3. [ ] 開発環境でHTTPS設定（localhost:3000 → https://localhost:3000）
4. [ ] テストデバイス準備（iPhone/Android/Mac/Windows）

---

## 付録A: 参考リンク

### WebAuthn
- [WebAuthn Guide](https://webauthn.guide/)
- [SimpleWebAuthn Documentation](https://simplewebauthn.dev/)
- [MDN: Web Authentication API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API)

### Twilio
- [Twilio SMS Quickstart](https://www.twilio.com/docs/sms/quickstart/node)
- [Twilio Pricing (Japan)](https://www.twilio.com/ja-jp/pricing)

### セキュリティ
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [NIST Digital Identity Guidelines](https://pages.nist.gov/800-63-3/)

---

## 付録B: FAQ

**Q: 既存のTOTP認証は無効化しますか？**
A: いいえ、継続サポートします。ユーザーが好きな方法を選択できます。

**Q: 全ての認証方法を有効化する必要がありますか？**
A: いいえ、最低1つの方法が有効であればOKです。複数有効化を推奨します。

**Q: デバイスを紛失した場合は？**
A: バックアップコード、または別の有効化済み認証方法を使用できます。

**Q: 生体認証は本当に安全ですか？**
A: はい。WebAuthnは公開鍵暗号を使用し、生体情報自体はデバイスから出ません。

**Q: SMS認証のコストが心配です**
A: まずWebAuthn＋メール認証のみ実装し、様子を見ることを推奨します。

---

**作成日**: 2026-01-04
**バージョン**: 1.0
**ステータス**: レビュー待ち
