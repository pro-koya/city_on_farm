# プロジェクト構成ドキュメント

## 概要

「新・今日の食卓（セッツマルシェ）」は、Node.js/Express.jsベースのECプラットフォームです。
約20,600行のコード、103個のEJSテンプレート、46個のCSSファイル、40個のJavaScriptファイルで構成されています。

---

## 1. フォルダ構成

```
/新・今日の食卓/
│
├── server.js                    # メインサーバー（14,153行）
├── package.json                 # 依存パッケージ定義
├── .env                         # 環境変数設定
├── r2.js                        # Cloudflare R2設定
├── Dockerfile                   # Docker設定
│
├── /routes-*.js                 # 外部化されたルートファイル
│   ├── routes-2fa-setup.js
│   ├── routes-2fa-login-enhancement.js
│   ├── routes-webauthn.js
│   ├── routes-stripe-connect.js
│   ├── routes-refund.js
│   ├── routes-delivery-status.js
│   └── routes-admin-finance.js
│
├── /middlewares                 # Expressミドルウェア
│   ├── requireAuth.js           # 認証チェック
│   └── requireRole.js           # ロールベースアクセス制御
│
├── /services                    # ビジネスロジック
│   ├── db.js                    # PostgreSQL接続管理
│   ├── logger.js                # Winstonロギング
│   ├── 2fa.js                   # 2要素認証
│   ├── webauthn.js              # WebAuthn/生体認証
│   ├── login-security.js        # ログインセキュリティ
│   ├── stripe-connect.js        # Stripe Connect決済
│   ├── refund.js                # 返金処理
│   ├── mailer.js                # メール送信
│   ├── gmailClient.js           # Gmail API統合
│   ├── sellerProfileService.js  # セラープロフィール管理
│   ├── shippingRulesService.js  # 配送ルール設定
│   ├── productService.js        # 商品関連
│   ├── productDbService.js      # 商品DB操作
│   ├── partnerAvailability.js   # パートナー在庫管理
│   ├── noteService.js           # Noteブログ連携
│   ├── blogService.js           # ブログ関連
│   └── userService.js           # ユーザー関連
│
├── /lib                         # ライブラリ
│   └── stripe.js                # Stripe設定
│
├── /views                       # EJSテンプレート（103ファイル）
│   ├── /layouts                 # レイアウト
│   ├── /partials                # 共通コンポーネント
│   ├── /auth                    # 認証関連
│   ├── /account                 # アカウント設定
│   ├── /dashboard               # ダッシュボード
│   ├── /products                # 商品関連
│   ├── /checkout                # チェックアウト
│   ├── /orders                  # 注文関連
│   ├── /seller                  # セラー機能
│   ├── /admin                   # 管理者機能
│   ├── /pages                   # 静的ページ
│   └── /errors                  # エラーページ
│
├── /public                      # 静的ファイル
│   ├── /styles                  # CSS（46ファイル）
│   ├── /js                      # JavaScript（40ファイル）
│   └── /images                  # 画像
│
├── /migrations                  # DBマイグレーション
├── /table-info                  # スキーマドキュメント
├── /scripts                     # ユーティリティスクリプト
├── /logs                        # アプリケーションログ
└── /z_document                  # ドキュメント
```

---

## 2. 主要ファイルの役割

### 2.1 エントリーポイント

| ファイル | 行数 | 役割 |
|---------|------|------|
| **server.js** | 14,153 | メインサーバー、全ルート定義、ミドルウェア設定 |

### 2.2 外部ルートファイル

| ファイル | 役割 |
|---------|------|
| routes-2fa-setup.js | 2要素認証セットアップ |
| routes-2fa-login-enhancement.js | ログイン強化機能 |
| routes-webauthn.js | WebAuthn/生体認証 |
| routes-stripe-connect.js | Stripe Connect連携 |
| routes-refund.js | 返金処理 |
| routes-delivery-status.js | 配送ステータス更新 |
| routes-admin-finance.js | 管理者向け財務管理 |

### 2.3 サービスレイヤー

| ファイル | 役割 |
|---------|------|
| db.js | PostgreSQL接続、コネクションプール管理 |
| logger.js | Winston ロギング |
| 2fa.js | TOTP生成、QRコード生成、検証 |
| webauthn.js | WebAuthn登録、認証 |
| login-security.js | ログイン試行管理、ロック |
| stripe-connect.js | Stripe Connect決済、口座管理 |
| refund.js | 返金処理、部分返金 |
| mailer.js | Nodemailer、メール送信 |
| gmailClient.js | Gmail API統合 |
| sellerProfileService.js | セラープロフィール管理 |
| shippingRulesService.js | 配送ルール設定 |
| productService.js | 商品関連処理 |
| productDbService.js | 商品DB操作 |

### 2.4 ミドルウェア

| ファイル | 役割 |
|---------|------|
| requireAuth.js | セッションベース認証チェック |
| requireRole.js | ロールベースアクセス制御（admin, seller） |

---

## 3. ルーティング構造

### 3.1 認証・ユーザー関連

| メソッド | パス | 機能 |
|---------|------|------|
| GET | /login | ログインページ |
| POST | /login | ログイン処理 |
| POST | /login/2fa | 2FAコード検証 |
| POST | /logout | ログアウト |
| GET | /signup | サインアップページ |
| POST | /signup | サインアップ処理 |
| GET | /auth/verify-email | メール認証 |
| POST | /auth/verify/resend | 認証メール再送 |
| GET | /password/forgot | パスワード忘却ページ |
| POST | /password/forgot | パスワード忘却処理 |
| GET | /password/reset | リセットページ |
| POST | /password/reset | リセット処理 |

### 3.2 アカウント・セキュリティ

| メソッド | パス | 機能 |
|---------|------|------|
| GET | /account/profile | プロフィール表示 |
| GET | /account/2fa/setup | 2FA設定ページ |
| POST | /account/2fa/enable | 2FA有効化 |
| POST | /account/2fa/disable | 2FA無効化 |
| GET | /account/webauthn/setup | WebAuthn設定 |
| GET | /account/trusted-devices | 信頼デバイス一覧 |
| GET | /account/login-history | ログイン履歴 |

### 3.3 ショッピング・カート

| メソッド | パス | 機能 |
|---------|------|------|
| GET | / | ホームページ |
| GET | /products | 商品一覧 |
| GET | /products/:id | 商品詳細 |
| GET | /cart | カート表示 |
| POST | /cart/add | カートに追加 |
| PATCH | /cart/:id | カート更新 |
| DELETE | /cart/:id | カート削除 |

### 3.4 チェックアウト・注文

| メソッド | パス | 機能 |
|---------|------|------|
| GET | /checkout | チェックアウトページ |
| POST | /checkout | 注文確定 |
| GET | /checkout/confirm | 確認画面 |
| POST | /checkout/confirm | 確認処理 |
| GET | /checkout/complete | 完了画面 |
| GET | /orders/:no | 注文詳細 |
| GET | /orders/recent | 最近の注文 |
| GET | /orders/:no/invoice.pdf | 請求書PDF |
| GET | /orders/:no/delivery-note.pdf | 配送伝票PDF |

### 3.5 セラー機能

| メソッド | パス | 機能 |
|---------|------|------|
| GET | /seller/listings | リスティング一覧 |
| POST | /seller/listings | リスティング作成 |
| POST | /seller/listings/:id/status | ステータス更新 |
| POST | /seller/listings/:id/delete | 削除 |
| GET | /seller/trades | 取引一覧 |
| GET | /seller/trades/:id | 取引詳細 |
| POST | /seller/trades/:id/shipment | 配送ステータス更新 |
| GET | /seller/analytics | 分析ダッシュボード |
| GET | /seller/shipping-rules | 配送ルール |
| POST | /seller/shipping-rules | 配送ルール保存 |

### 3.6 管理者機能

| メソッド | パス | 機能 |
|---------|------|------|
| GET | /admin/users | ユーザー一覧 |
| GET | /admin/users/:id | ユーザー詳細 |
| GET | /admin/orders | 注文管理 |
| GET | /admin/contacts | 問い合わせ管理 |
| GET | /admin/partners | パートナー管理 |
| GET | /admin/campaigns | キャンペーン管理 |
| GET | /admin/coupons | クーポン管理 |

### 3.7 静的・情報ページ

| メソッド | パス | 機能 |
|---------|------|------|
| GET | /about | 概要 |
| GET | /tokusho | 特定商取引法 |
| GET | /privacy | プライバシーポリシー |
| GET | /terms | 利用規約 |
| GET | /contact | お問い合わせ |

---

## 4. ビュー（EJS）構成

### 4.1 ディレクトリ構成

```
/views
├── /layouts
│   └── list.ejs                 # 基本レイアウト
│
├── /partials                    # 共通コンポーネント
│   ├── header.ejs               # ヘッダー・ナビゲーション
│   ├── footer.ejs               # フッター
│   ├── breadcrumb.ejs           # パンくず
│   ├── productCard.ejs          # 商品カード
│   ├── productCardTall.ejs      # 商品カード（背高版）
│   └── productsFilterBar.ejs    # フィルタバー
│
├── /auth                        # 認証関連
│   ├── login.ejs                # ログイン
│   ├── login-2fa.ejs            # 2FAログイン
│   ├── signup.ejs               # サインアップ
│   ├── password-forgot.ejs      # パスワード忘却
│   ├── password-reset.ejs       # パスワードリセット
│   └── verify-pending.ejs       # 認証待ち
│
├── /account                     # アカウント設定
│   ├── profile.ejs              # プロフィール
│   ├── 2fa-setup.ejs            # 2FA設定
│   └── webauthn-setup.ejs       # WebAuthn設定
│
├── /dashboard                   # ダッシュボード
│   ├── admin.ejs                # 管理者用
│   ├── buyer.ejs                # バイヤー用
│   ├── seller.ejs               # セラー用
│   └── layout.ejs               # レイアウト
│
├── /products                    # 商品関連
│   ├── list.ejs                 # 商品一覧
│   ├── show.ejs                 # 商品詳細
│   └── index.ejs                # インデックス
│
├── /checkout                    # チェックアウト
│   ├── index.ejs                # カート/チェックアウト
│   ├── confirm.ejs              # 確認画面
│   └── complete.ejs             # 完了画面
│
├── /orders                      # 注文
│   ├── recent.ejs               # 最近の注文
│   └── show.ejs                 # 注文詳細
│
├── /seller                      # セラー機能
│   ├── profile-show.ejs         # プロフィール表示
│   ├── profile-edit.ejs         # プロフィール編集
│   ├── listings.ejs             # リスティング一覧
│   ├── listing-new.ejs          # リスティング作成
│   ├── listing-edit.ejs         # リスティング編集
│   ├── shipping.ejs             # 配送設定
│   ├── analytics.ejs            # 分析
│   └── /trades                  # 取引管理
│
├── /admin                       # 管理者機能
│   ├── /users                   # ユーザー管理
│   ├── /contacts                # 問い合わせ管理
│   ├── /partners                # パートナー管理
│   ├── /campaigns               # キャンペーン管理
│   ├── /coupons                 # クーポン管理
│   └── /transfers               # 送金管理
│
├── /pages                       # 静的ページ
│   ├── about.ejs                # 概要
│   ├── tokusho.ejs              # 特商法
│   ├── privacy.ejs              # プライバシー
│   └── terms.ejs                # 利用規約
│
└── /errors                      # エラーページ
    ├── 404.ejs                  # 404エラー
    └── 403.ejs                  # 403エラー
```

---

## 5. データベース構成

### 5.1 主要テーブル

| テーブル | 役割 |
|---------|------|
| users | ユーザー情報（認証、ロール含む） |
| seller_profiles | セラープロフィール |
| products | 商品情報 |
| orders | 注文情報 |
| order_items | 注文明細 |
| cart_items | カート内商品 |
| coupons | クーポン情報 |
| campaigns | キャンペーン情報 |
| webauthn_credentials | WebAuthn認証器情報 |
| login_history | ログイン履歴 |
| trusted_devices | 信頼デバイス |
| shipping_rules | 配送ルール |
| contacts | お問い合わせ |
| notifications | 通知 |

### 5.2 マイグレーションファイル

| ファイル | 内容 |
|---------|------|
| 004_create_login_history.sql | ログイン履歴テーブル |
| 005_create_trusted_devices.sql | 信頼デバイステーブル |
| 006_add_2fa_columns.sql | 2FAカラム追加 |
| 007_stripe_connect_payout_system.sql | Stripe Connect決済 |
| 008_verify_and_add_missing_columns.sql | スキーマ検証 |
| 009_fix_orders_seller_id.sql | ordersテーブル修正 |
| 010_fix_seller_profiles_user_id_index.sql | インデックス修正 |
| 011_add_webauthn_support.sql | WebAuthnテーブル |

---

## 6. 静的ファイル構成

### 6.1 CSS（46ファイル）

| ファイル | 用途 |
|---------|------|
| styles.css | グローバルスタイル |
| auth.css | 認証ページ |
| account.css | アカウントページ |
| products.css | 商品一覧 |
| product-show.css | 商品詳細 |
| checkout.css | チェックアウト |
| cart.css | カート |
| orders.css | 注文管理 |
| seller-*.css | セラー機能 |
| admin-*.css | 管理画面 |
| dashboard.css | ダッシュボード |

### 6.2 JavaScript（40ファイル）

| ファイル | 用途 |
|---------|------|
| base.js | グローバル機能 |
| auth-login.js | ログイン |
| auth-signup.js | サインアップ |
| account.js | アカウント設定 |
| cart.js | カート機能 |
| checkout.js | チェックアウト |
| product-show.js | 商品詳細 |
| listing-new.js | リスティング作成 |
| listing-edit.js | リスティング編集 |
| seller-listings.js | セラー管理 |
| uploader-r2.js | ファイルアップロード |
| analytics-charts.js | グラフ表示 |

---

## 7. ファイル間の関連図

### 7.1 リクエストフロー

```
ブラウザ
   │
   ▼
server.js（ルーティング）
   │
   ├─→ middlewares/requireAuth.js（認証チェック）
   │
   ├─→ middlewares/requireRole.js（権限チェック）
   │
   ├─→ services/*.js（ビジネスロジック）
   │     ├── db.js → PostgreSQL
   │     ├── stripe-connect.js → Stripe API
   │     ├── mailer.js → Gmail API
   │     └── その他サービス
   │
   └─→ views/*.ejs（テンプレート）
         │
         ├── partials/header.ejs
         ├── partials/footer.ejs
         └── public/（CSS, JS, 画像）
               │
               ▼
           ブラウザ
```

### 7.2 認証フロー

```
ログインページ (/login)
        │
        ▼
    POST /login
        │
        ├── services/login-security.js（試行回数チェック）
        │
        ├── services/db.js（ユーザー検索）
        │
        ├── bcryptjs（パスワード検証）
        │
        └── 2FAが有効な場合
              │
              ▼
        /login/2fa（2FAコード入力）
              │
              ├── services/2fa.js（TOTP検証）
              │
              └── または services/webauthn.js（生体認証）
                    │
                    ▼
              セッション作成 → ダッシュボードへ
```

### 7.3 注文フロー

```
商品詳細 (/products/:id)
        │
        ▼
    カートに追加 (POST /cart/add)
        │
        ▼
    カート確認 (/cart)
        │
        ▼
    チェックアウト (/checkout)
        │
        ├── 配送先入力
        ├── クーポン適用
        │
        ▼
    確認画面 (/checkout/confirm)
        │
        ├── Stripe決済処理
        │     └── services/stripe-connect.js
        │
        ├── 注文作成
        │     └── services/db.js
        │
        ├── 通知送信
        │     └── services/mailer.js
        │
        ▼
    完了画面 (/checkout/complete)
```

### 7.4 セラー機能フロー

```
セラーダッシュボード (/dashboard/seller)
        │
        ├── リスティング管理 (/seller/listings)
        │     ├── 新規作成 (/seller/listings/new)
        │     │     └── public/js/listing-new.js
        │     │     └── public/js/uploader-r2.js → R2ストレージ
        │     │
        │     └── 編集 (/seller/listings/:id/edit)
        │           └── public/js/listing-edit.js
        │
        ├── 取引管理 (/seller/trades)
        │     └── 配送ステータス更新
        │           └── routes-delivery-status.js
        │
        ├── 配送設定 (/seller/shipping-rules)
        │     └── services/shippingRulesService.js
        │
        └── 分析 (/seller/analytics)
              └── public/js/analytics-charts.js
```

---

## 8. 外部サービス連携

| サービス | 用途 | 設定ファイル |
|---------|------|-------------|
| **Stripe** | 決済処理 | lib/stripe.js |
| **Stripe Connect** | セラー個別決済 | services/stripe-connect.js |
| **Google OAuth2** | ユーザー認証 | server.js |
| **Gmail API** | メール送信 | services/gmailClient.js |
| **Cloudflare R2** | ファイルストレージ | r2.js |
| **Redis** | セッション管理 | server.js |
| **PostgreSQL** | データベース | services/db.js |
| **Note** | ブログ連携 | services/noteService.js |

---

## 9. セキュリティ実装

### 9.1 認証・認可

- **セッション**: ExpressSession + Redis
- **パスワード**: bcryptjs ハッシング
- **2FA**: TOTP + Speakeasy
- **WebAuthn**: SimpleWebAuthn ライブラリ
- **ロール**: admin, seller, buyer

### 9.2 保護機制

- **CSRF**: csurf トークン検証
- **セキュリティヘッダー**: Helmet
- **入力検証**: express-validator
- **レート制限**: express-rate-limit
- **ログイン試行制限**: login-security.js

---

## 10. 主要な依存パッケージ

```json
{
  "express": "^5.1.0",
  "pg": "^8.16.3",
  "express-session": "^1.18.2",
  "connect-redis": "^9.0.0",
  "ioredis": "^5.7.0",
  "ejs": "^3.1.10",
  "helmet": "^8.1.0",
  "csurf": "^1.11.0",
  "express-validator": "^7.2.1",
  "bcryptjs": "^3.0.2",
  "stripe": "^20.0.0",
  "@simplewebauthn/server": "^9.0.3",
  "speakeasy": "^2.0.0",
  "nodemailer": "^7.0.6",
  "googleapis": "^164.1.0",
  "@aws-sdk/client-s3": "^3.894.0",
  "multer": "^2.0.2",
  "puppeteer": "^22.13.1",
  "winston": "^3.19.0",
  "dotenv": "^17.2.2"
}
```

---

## 更新履歴

- 2026-02-15: 初版作成
