# Database Schema (generated)

> Generated at: 2026-02-15T18:37:04.862Z

---

## Schema: `public`

### `public.addresses`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `scope` | `text` | NO |  |  |
| 3 | `user_id` | `uuid` | YES |  |  |
| 4 | `order_id` | `uuid` | YES |  |  |
| 5 | `address_type` | `text` | NO | 'shipping'::text |  |
| 6 | `full_name` | `text` | NO |  |  |
| 7 | `company` | `text` | YES |  |  |
| 8 | `phone` | `text` | YES |  |  |
| 9 | `postal_code` | `text` | NO |  |  |
| 10 | `prefecture` | `text` | NO |  |  |
| 11 | `city` | `text` | NO |  |  |
| 12 | `address_line1` | `text` | NO |  |  |
| 13 | `address_line2` | `text` | YES |  |  |
| 14 | `country` | `text` | NO | 'JP'::text |  |
| 15 | `is_default` | `boolean` | NO | false |  |
| 16 | `note` | `text` | YES |  |  |
| 17 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 18 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `addresses_address_line1_not_null`, `addresses_address_type_check`, `addresses_address_type_not_null`, `addresses_check`, `addresses_city_not_null`, `addresses_country_not_null`, `addresses_created_at_not_null`, `addresses_full_name_not_null`, `addresses_id_not_null`, `addresses_is_default_not_null`, `addresses_postal_code_not_null`, `addresses_prefecture_not_null`, `addresses_scope_check`, `addresses_scope_not_null`, `addresses_updated_at_not_null`
- **FOREIGN KEY**: `addresses_order_id_fkey`, `addresses_user_id_fkey`
- **PRIMARY KEY**: `addresses_pkey`

**Indexes**

- `addresses_pkey`
  
  ```sql
  CREATE UNIQUE INDEX addresses_pkey ON public.addresses USING btree (id)
  ```
- `ix_addresses_order_scope`
  
  ```sql
  CREATE INDEX ix_addresses_order_scope ON public.addresses USING btree (order_id, scope, address_type)
  ```
- `ix_addresses_user_scope`
  
  ```sql
  CREATE INDEX ix_addresses_user_scope ON public.addresses USING btree (user_id, scope, address_type)
  ```
- `ux_user_default_address`
  
  ```sql
  CREATE UNIQUE INDEX ux_user_default_address ON public.addresses USING btree (user_id, address_type) WHERE ((scope = 'user'::text) AND (is_default = true))
  ```

---

### `public.campaigns`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `slug` | `text` | YES |  |  |
| 3 | `title` | `text` | NO |  |  |
| 4 | `eyebrow` | `text` | YES |  |  |
| 5 | `teaser_text` | `text` | YES |  |  |
| 6 | `hero_image_url` | `text` | YES |  |  |
| 7 | `body_html` | `text` | NO |  |  |
| 8 | `body_raw` | `text` | YES |  |  |
| 9 | `status` | `text` | NO | 'draft'::text |  |
| 10 | `published_at` | `timestamp with time zone` | YES |  |  |
| 11 | `starts_at` | `timestamp with time zone` | YES |  |  |
| 12 | `ends_at` | `timestamp with time zone` | YES |  |  |
| 13 | `created_by` | `uuid` | YES |  |  |
| 14 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 15 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 16 | `table_labels` | `jsonb` | YES | '[]'::jsonb | キャンペーン詳細表のラベル配列 |
| 17 | `table_values` | `jsonb` | YES | '[]'::jsonb | キャンペーン詳細表の値配列 |

**Constraints**

- **CHECK**: `campaigns_body_html_not_null`, `campaigns_created_at_not_null`, `campaigns_id_not_null`, `campaigns_status_not_null`, `campaigns_title_not_null`, `campaigns_updated_at_not_null`
- **FOREIGN KEY**: `campaigns_created_by_fkey`
- **PRIMARY KEY**: `campaigns_pkey`
- **UNIQUE**: `campaigns_slug_key`

**Indexes**

- `campaigns_pkey`
  
  ```sql
  CREATE UNIQUE INDEX campaigns_pkey ON public.campaigns USING btree (id)
  ```
- `campaigns_slug_key`
  
  ```sql
  CREATE UNIQUE INDEX campaigns_slug_key ON public.campaigns USING btree (slug)
  ```
- `idx_campaigns_status_published`
  
  ```sql
  CREATE INDEX idx_campaigns_status_published ON public.campaigns USING btree (status, published_at DESC)
  ```

---

### `public.cart_items`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `cart_id` | `uuid` | NO |  |  |
| 3 | `product_id` | `uuid` | NO |  |  |
| 4 | `quantity` | `integer` | NO |  |  |
| 5 | `saved_for_later` | `boolean` | NO | false |  |
| 6 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 7 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 8 | `user_id` | `uuid` | YES |  |  |
| 9 | `seller_id` | `uuid` | YES |  |  |
| 10 | `seller_name` | `text` | YES |  |  |

**Constraints**

- **CHECK**: `cart_items_cart_id_not_null`, `cart_items_created_at_not_null`, `cart_items_id_not_null`, `cart_items_product_id_not_null`, `cart_items_quantity_check`, `cart_items_quantity_not_null`, `cart_items_saved_for_later_not_null`, `cart_items_updated_at_not_null`
- **FOREIGN KEY**: `cart_items_cart_id_fkey`, `cart_items_product_id_fkey`, `cart_items_user_id_fkey`
- **PRIMARY KEY**: `cart_items_pkey`
- **UNIQUE**: `cart_items_cart_id_product_id_key`

**Indexes**

- `cart_items_cart_id_product_id_key`
  
  ```sql
  CREATE UNIQUE INDEX cart_items_cart_id_product_id_key ON public.cart_items USING btree (cart_id, product_id)
  ```
- `cart_items_pkey`
  
  ```sql
  CREATE UNIQUE INDEX cart_items_pkey ON public.cart_items USING btree (id)
  ```
- `idx_cart_items_cart`
  
  ```sql
  CREATE INDEX idx_cart_items_cart ON public.cart_items USING btree (cart_id)
  ```
- `idx_cart_items_product`
  
  ```sql
  CREATE INDEX idx_cart_items_product ON public.cart_items USING btree (product_id)
  ```
- `idx_cart_items_seller`
  
  ```sql
  CREATE INDEX idx_cart_items_seller ON public.cart_items USING btree (seller_id)
  ```
- `idx_cart_items_user`
  
  ```sql
  CREATE INDEX idx_cart_items_user ON public.cart_items USING btree (user_id)
  ```

---

### `public.carts`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `user_id` | `uuid` | NO |  |  |
| 3 | `coupon_code` | `text` | YES |  |  |
| 4 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 5 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `carts_created_at_not_null`, `carts_id_not_null`, `carts_updated_at_not_null`, `carts_user_id_not_null`
- **FOREIGN KEY**: `carts_user_id_fkey`
- **PRIMARY KEY**: `carts_pkey`
- **UNIQUE**: `carts_user_id_key`

**Indexes**

- `carts_pkey`
  
  ```sql
  CREATE UNIQUE INDEX carts_pkey ON public.carts USING btree (id)
  ```
- `carts_user_id_key`
  
  ```sql
  CREATE UNIQUE INDEX carts_user_id_key ON public.carts USING btree (user_id)
  ```

---

### `public.categories`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `integer` | NO | nextval('categories_id_seq'::regclass) |  |
| 2 | `slug` | `text` | NO |  |  |
| 3 | `name` | `text` | NO |  |  |
| 4 | `sort_order` | `integer` | NO | 100 |  |
| 5 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 6 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `categories_created_at_not_null`, `categories_id_not_null`, `categories_name_not_null`, `categories_slug_not_null`, `categories_sort_order_not_null`, `categories_updated_at_not_null`
- **PRIMARY KEY**: `categories_pkey`
- **UNIQUE**: `categories_name_key`, `categories_slug_key`

**Indexes**

- `categories_name_key`
  
  ```sql
  CREATE UNIQUE INDEX categories_name_key ON public.categories USING btree (name)
  ```
- `categories_pkey`
  
  ```sql
  CREATE UNIQUE INDEX categories_pkey ON public.categories USING btree (id)
  ```
- `categories_slug_key`
  
  ```sql
  CREATE UNIQUE INDEX categories_slug_key ON public.categories USING btree (slug)
  ```

---

### `public.contact_messages`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `contact_id` | `uuid` | NO |  |  |
| 3 | `sender_id` | `uuid` | YES |  |  |
| 4 | `sender_type` | `text` | NO |  |  |
| 5 | `body` | `text` | NO |  |  |
| 6 | `is_internal` | `boolean` | NO | false |  |
| 7 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 8 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `contact_messages_body_not_null`, `contact_messages_contact_id_not_null`, `contact_messages_created_at_not_null`, `contact_messages_id_not_null`, `contact_messages_is_internal_not_null`, `contact_messages_sender_type_not_null`, `contact_messages_updated_at_not_null`
- **FOREIGN KEY**: `contact_messages_contact_id_fkey`, `contact_messages_sender_id_fkey`
- **PRIMARY KEY**: `contact_messages_pkey`

**Indexes**

- `contact_messages_pkey`
  
  ```sql
  CREATE UNIQUE INDEX contact_messages_pkey ON public.contact_messages USING btree (id)
  ```
- `idx_contact_messages_contact_id`
  
  ```sql
  CREATE INDEX idx_contact_messages_contact_id ON public.contact_messages USING btree (contact_id, created_at)
  ```
- `idx_contact_messages_sender`
  
  ```sql
  CREATE INDEX idx_contact_messages_sender ON public.contact_messages USING btree (sender_type, sender_id)
  ```

---

### `public.contacts`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `name` | `text` | NO |  |  |
| 3 | `email` | `text` | NO |  |  |
| 4 | `type` | `text` | NO |  |  |
| 5 | `message` | `text` | NO |  |  |
| 6 | `status` | `text` | NO | 'open'::text |  |
| 7 | `handled_by` | `uuid` | YES |  |  |
| 8 | `handled_at` | `timestamp with time zone` | YES |  |  |
| 9 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 10 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 11 | `subject` | `text` | YES |  |  |
| 12 | `category` | `contact_category_enum` *(enum)* | YES | 'other'::contact_category_enum |  |
| 13 | `user_id` | `uuid` | YES |  |  |

> **Enum `contact_category_enum` values**: `listing_registration`, `ordering_trading`, `site_bug`, `site_request`, `press_partnership`, `other`

**Constraints**

- **CHECK**: `contacts_created_at_not_null`, `contacts_email_not_null`, `contacts_id_not_null`, `contacts_message_not_null`, `contacts_name_not_null`, `contacts_status_check`, `contacts_status_not_null`, `contacts_type_not_null`, `contacts_updated_at_not_null`
- **FOREIGN KEY**: `contacts_handled_by_fkey`, `contacts_user_id_fkey`
- **PRIMARY KEY**: `contacts_pkey`

**Indexes**

- `contacts_pkey`
  
  ```sql
  CREATE UNIQUE INDEX contacts_pkey ON public.contacts USING btree (id)
  ```
- `idx_contacts_category`
  
  ```sql
  CREATE INDEX idx_contacts_category ON public.contacts USING btree (category)
  ```
- `idx_contacts_created_at`
  
  ```sql
  CREATE INDEX idx_contacts_created_at ON public.contacts USING btree (created_at DESC)
  ```
- `idx_contacts_email`
  
  ```sql
  CREATE INDEX idx_contacts_email ON public.contacts USING btree (email)
  ```
- `idx_contacts_status`
  
  ```sql
  CREATE INDEX idx_contacts_status ON public.contacts USING btree (status)
  ```
- `idx_contacts_subject_body_trgm`
  
  ```sql
  CREATE INDEX idx_contacts_subject_body_trgm ON public.contacts USING gin ((((COALESCE(subject, ''::text) || ' '::text) || COALESCE(message, ''::text))) gin_trgm_ops)
  ```
- `idx_contacts_subject_trgm`
  
  ```sql
  CREATE INDEX idx_contacts_subject_trgm ON public.contacts USING gin (subject gin_trgm_ops)
  ```
- `idx_contacts_type`
  
  ```sql
  CREATE INDEX idx_contacts_type ON public.contacts USING btree (type)
  ```
- `idx_contacts_user_id`
  
  ```sql
  CREATE INDEX idx_contacts_user_id ON public.contacts USING btree (user_id)
  ```

---

### `public.coupons`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `code` | `text` | NO |  |  |
| 3 | `name` | `text` | YES |  |  |
| 4 | `description` | `text` | YES |  |  |
| 5 | `discount_type` | `text` | NO |  |  |
| 6 | `discount_value` | `integer` | NO |  |  |
| 7 | `min_subtotal` | `integer` | NO | 0 |  |
| 8 | `max_discount` | `integer` | YES |  |  |
| 9 | `applies_to` | `text` | NO | 'order'::text |  |
| 10 | `global_limit` | `integer` | YES |  |  |
| 11 | `per_user_limit` | `integer` | YES |  |  |
| 12 | `starts_at` | `timestamp with time zone` | YES |  |  |
| 13 | `ends_at` | `timestamp with time zone` | YES |  |  |
| 14 | `is_active` | `boolean` | NO | true |  |
| 15 | `metadata` | `jsonb` | YES |  |  |
| 16 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 17 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `coupons_applies_to_check`, `coupons_applies_to_not_null`, `coupons_check`, `coupons_code_not_null`, `coupons_created_at_not_null`, `coupons_discount_type_check`, `coupons_discount_type_not_null`, `coupons_discount_value_check`, `coupons_discount_value_not_null`, `coupons_id_not_null`, `coupons_is_active_not_null`, `coupons_max_discount_check`, `coupons_min_subtotal_check`, `coupons_min_subtotal_not_null`, `coupons_updated_at_not_null`
- **PRIMARY KEY**: `coupons_pkey`
- **UNIQUE**: `coupons_code_key`

**Indexes**

- `coupons_code_key`
  
  ```sql
  CREATE UNIQUE INDEX coupons_code_key ON public.coupons USING btree (code)
  ```
- `coupons_pkey`
  
  ```sql
  CREATE UNIQUE INDEX coupons_pkey ON public.coupons USING btree (id)
  ```
- `ix_coupons_active_window`
  
  ```sql
  CREATE INDEX ix_coupons_active_window ON public.coupons USING btree (is_active, starts_at, ends_at, code)
  ```

---

### `public.email_verifications`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `user_id` | `uuid` | NO |  |  |
| 3 | `email` | `text` | NO |  |  |
| 4 | `token` | `text` | NO |  |  |
| 5 | `expires_at` | `timestamp with time zone` | NO |  |  |
| 6 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 7 | `used_at` | `timestamp with time zone` | YES |  |  |

**Constraints**

- **CHECK**: `email_verifications_created_at_not_null`, `email_verifications_email_not_null`, `email_verifications_expires_at_not_null`, `email_verifications_id_not_null`, `email_verifications_token_not_null`, `email_verifications_user_id_not_null`
- **PRIMARY KEY**: `email_verifications_pkey`
- **UNIQUE**: `uq_email_verifications_token`

**Indexes**

- `email_verifications_pkey`
  
  ```sql
  CREATE UNIQUE INDEX email_verifications_pkey ON public.email_verifications USING btree (id)
  ```
- `idx_email_verifications_email`
  
  ```sql
  CREATE INDEX idx_email_verifications_email ON public.email_verifications USING btree (email)
  ```
- `idx_email_verifications_expires`
  
  ```sql
  CREATE INDEX idx_email_verifications_expires ON public.email_verifications USING btree (expires_at)
  ```
- `idx_email_verifications_user`
  
  ```sql
  CREATE INDEX idx_email_verifications_user ON public.email_verifications USING btree (user_id)
  ```
- `uq_email_verifications_token`
  
  ```sql
  CREATE UNIQUE INDEX uq_email_verifications_token ON public.email_verifications USING btree (token)
  ```

---

### `public.favorites`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `user_id` | `uuid` | NO |  |  |
| 3 | `product_id` | `uuid` | NO |  |  |
| 4 | `created_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `favorites_created_at_not_null`, `favorites_id_not_null`, `favorites_product_id_not_null`, `favorites_user_id_not_null`
- **FOREIGN KEY**: `fk_favorites_product`, `fk_favorites_user`
- **PRIMARY KEY**: `favorites_pkey`

**Indexes**

- `favorites_pkey`
  
  ```sql
  CREATE UNIQUE INDEX favorites_pkey ON public.favorites USING btree (id)
  ```
- `ix_favorites_product`
  
  ```sql
  CREATE INDEX ix_favorites_product ON public.favorites USING btree (product_id)
  ```
- `ix_favorites_user`
  
  ```sql
  CREATE INDEX ix_favorites_user ON public.favorites USING btree (user_id, created_at DESC)
  ```
- `ux_favorites_user_product`
  
  ```sql
  CREATE UNIQUE INDEX ux_favorites_user_product ON public.favorites USING btree (user_id, product_id)
  ```

---

### `public.global_allowed_payment_methods`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `method` | `payment_method` *(enum)* | NO |  |  |

> **Enum `payment_method` values**: `card`, `bank_transfer`, `convenience_store`, `cod`, `bank`, `paypay`

**Constraints**

- **CHECK**: `global_allowed_payment_methods_method_not_null`
- **PRIMARY KEY**: `global_allowed_payment_methods_pkey`

**Indexes**

- `global_allowed_payment_methods_pkey`
  
  ```sql
  CREATE UNIQUE INDEX global_allowed_payment_methods_pkey ON public.global_allowed_payment_methods USING btree (method)
  ```

---

### `public.gmail_tokens`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `smallint` | NO | 1 |  |
| 2 | `token_json` | `jsonb` | NO |  |  |
| 3 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `gmail_tokens_id_not_null`, `gmail_tokens_token_json_not_null`, `gmail_tokens_updated_at_not_null`
- **PRIMARY KEY**: `gmail_tokens_pkey`

**Indexes**

- `gmail_tokens_pkey`
  
  ```sql
  CREATE UNIQUE INDEX gmail_tokens_pkey ON public.gmail_tokens USING btree (id)
  ```

---

### `public.ledger`

出品者売上台帳テーブル。金額の完全なトレーサビリティを確保するため、全ての金額変動を記録

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `partner_id` | `uuid` | NO |  |  |
| 3 | `order_id` | `uuid` | YES |  |  |
| 4 | `type` | `text` | NO |  | sale:売上, platform_fee:手数料, refund:返金, payout:送金実行, adjustment:調整, carry_over:繰越 |
| 5 | `amount_cents` | `integer` | NO |  | 金額（円単位）: プラス=収入、マイナス=控除 |
| 6 | `currency` | `text` | NO | 'jpy'::text |  |
| 7 | `status` | `text` | NO | 'pending'::text | pending:猶予中, available:送金可能, paid:送金済み, void:無効 |
| 8 | `available_at` | `timestamp without time zone` | YES |  | 送金可能日時（配送完了+7日後に設定される） |
| 9 | `stripe_payment_intent_id` | `text` | YES |  |  |
| 10 | `stripe_charge_id` | `text` | YES |  |  |
| 11 | `stripe_refund_id` | `text` | YES |  |  |
| 12 | `stripe_transfer_id` | `text` | YES |  |  |
| 13 | `stripe_payout_id` | `text` | YES |  |  |
| 14 | `idempotency_key` | `text` | NO |  | 二重計上防止用のユニークキー。webhook再実行時も安全 |
| 15 | `metadata` | `jsonb` | YES | '{}'::jsonb |  |
| 16 | `note` | `text` | YES |  |  |
| 17 | `created_at` | `timestamp without time zone` | YES | now() |  |
| 18 | `updated_at` | `timestamp without time zone` | YES | now() |  |

**Constraints**

- **CHECK**: `ledger_amount_cents_not_null`, `ledger_amount_check`, `ledger_currency_not_null`, `ledger_id_not_null`, `ledger_idempotency_key_not_null`, `ledger_partner_id_not_null`, `ledger_status_check`, `ledger_status_not_null`, `ledger_type_check`, `ledger_type_not_null`
- **FOREIGN KEY**: `ledger_order_id_fkey`, `ledger_partner_id_fkey`
- **PRIMARY KEY**: `ledger_pkey`
- **UNIQUE**: `ledger_idempotency_key_key`

**Indexes**

- `idx_ledger_available_at`
  
  ```sql
  CREATE INDEX idx_ledger_available_at ON public.ledger USING btree (available_at)
  ```
- `idx_ledger_created_at`
  
  ```sql
  CREATE INDEX idx_ledger_created_at ON public.ledger USING btree (created_at DESC)
  ```
- `idx_ledger_idempotency`
  
  ```sql
  CREATE INDEX idx_ledger_idempotency ON public.ledger USING btree (idempotency_key)
  ```
- `idx_ledger_order`
  
  ```sql
  CREATE INDEX idx_ledger_order ON public.ledger USING btree (order_id)
  ```
- `idx_ledger_order_id`
  
  ```sql
  CREATE INDEX idx_ledger_order_id ON public.ledger USING btree (order_id)
  ```
- `idx_ledger_partner_id`
  
  ```sql
  CREATE INDEX idx_ledger_partner_id ON public.ledger USING btree (partner_id)
  ```
- `idx_ledger_partner_status`
  
  ```sql
  CREATE INDEX idx_ledger_partner_status ON public.ledger USING btree (partner_id, status, available_at)
  ```
- `idx_ledger_status`
  
  ```sql
  CREATE INDEX idx_ledger_status ON public.ledger USING btree (status)
  ```
- `idx_ledger_stripe_payment_intent`
  
  ```sql
  CREATE INDEX idx_ledger_stripe_payment_intent ON public.ledger USING btree (stripe_payment_intent_id)
  ```
- `idx_ledger_stripe_payment_intent_id`
  
  ```sql
  CREATE INDEX idx_ledger_stripe_payment_intent_id ON public.ledger USING btree (stripe_payment_intent_id)
  ```
- `idx_ledger_stripe_payout_id`
  
  ```sql
  CREATE INDEX idx_ledger_stripe_payout_id ON public.ledger USING btree (stripe_payout_id)
  ```
- `idx_ledger_type`
  
  ```sql
  CREATE INDEX idx_ledger_type ON public.ledger USING btree (type)
  ```
- `ledger_idempotency_key_key`
  
  ```sql
  CREATE UNIQUE INDEX ledger_idempotency_key_key ON public.ledger USING btree (idempotency_key)
  ```
- `ledger_pkey`
  
  ```sql
  CREATE UNIQUE INDEX ledger_pkey ON public.ledger USING btree (id)
  ```

---

### `public.login_history`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `user_id` | `uuid` | YES |  |  |
| 3 | `email` | `varchar(255)` | NO |  |  |
| 4 | `success` | `boolean` | NO |  |  |
| 5 | `ip_address` | `inet` | YES |  |  |
| 6 | `user_agent` | `text` | YES |  |  |
| 7 | `failure_reason` | `text` | YES |  |  |
| 8 | `two_factor_used` | `boolean` | YES | false |  |
| 9 | `created_at` | `timestamp without time zone` | YES | CURRENT_TIMESTAMP |  |

**Constraints**

- **CHECK**: `login_history_email_not_null`, `login_history_id_not_null`, `login_history_success_not_null`
- **FOREIGN KEY**: `login_history_user_id_fkey`
- **PRIMARY KEY**: `login_history_pkey`

**Indexes**

- `idx_login_history_created_at`
  
  ```sql
  CREATE INDEX idx_login_history_created_at ON public.login_history USING btree (created_at)
  ```
- `idx_login_history_ip`
  
  ```sql
  CREATE INDEX idx_login_history_ip ON public.login_history USING btree (ip_address)
  ```
- `idx_login_history_success`
  
  ```sql
  CREATE INDEX idx_login_history_success ON public.login_history USING btree (success, created_at)
  ```
- `idx_login_history_user_id`
  
  ```sql
  CREATE INDEX idx_login_history_user_id ON public.login_history USING btree (user_id)
  ```
- `login_history_pkey`
  
  ```sql
  CREATE UNIQUE INDEX login_history_pkey ON public.login_history USING btree (id)
  ```

---

### `public.notification_reads`

ユーザーごとの通知既読状態

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `bigint` | NO | nextval('notification_reads_id_seq'::regclass) |  |
| 2 | `notification_id` | `uuid` | NO |  |  |
| 3 | `user_id` | `uuid` | NO |  |  |
| 4 | `read_at` | `timestamp with time zone` | NO | now() | 既読にした日時 |

**Constraints**

- **CHECK**: `notification_reads_id_not_null`, `notification_reads_notification_id_not_null`, `notification_reads_read_at_not_null`, `notification_reads_user_id_not_null`
- **FOREIGN KEY**: `notification_reads_notification_id_fkey`, `notification_reads_user_id_fkey`
- **PRIMARY KEY**: `notification_reads_pkey`
- **UNIQUE**: `notification_reads_uniq`

**Indexes**

- `idx_notification_reads_notification`
  
  ```sql
  CREATE INDEX idx_notification_reads_notification ON public.notification_reads USING btree (notification_id)
  ```
- `idx_notification_reads_user`
  
  ```sql
  CREATE INDEX idx_notification_reads_user ON public.notification_reads USING btree (user_id, read_at DESC)
  ```
- `notification_reads_pkey`
  
  ```sql
  CREATE UNIQUE INDEX notification_reads_pkey ON public.notification_reads USING btree (id)
  ```
- `notification_reads_uniq`
  
  ```sql
  CREATE UNIQUE INDEX notification_reads_uniq ON public.notification_reads USING btree (notification_id, user_id)
  ```

---

### `public.notification_targets`

通知の配信対象（ユーザー単位 / ロール単位 / 全体）

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `bigint` | NO | nextval('notification_targets_id_seq'::regclass) |  |
| 2 | `notification_id` | `uuid` | NO |  |  |
| 3 | `user_id` | `uuid` | YES |  | 個別ユーザー向けの通知対象 |
| 4 | `role` | `text` | YES |  | ロール向け通知（buyer, seller など） |
| 5 | `audience` | `text` | YES |  | 全体・特定セグメント向け識別子（all など） |
| 6 | `created_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `notification_targets_created_at_not_null`, `notification_targets_id_not_null`, `notification_targets_notification_id_not_null`, `notification_targets_one_dimension_chk`
- **FOREIGN KEY**: `notification_targets_notification_id_fkey`, `notification_targets_user_id_fkey`
- **PRIMARY KEY**: `notification_targets_pkey`

**Indexes**

- `idx_notification_targets_audience`
  
  ```sql
  CREATE INDEX idx_notification_targets_audience ON public.notification_targets USING btree (audience)
  ```
- `idx_notification_targets_notification_id`
  
  ```sql
  CREATE INDEX idx_notification_targets_notification_id ON public.notification_targets USING btree (notification_id)
  ```
- `idx_notification_targets_role`
  
  ```sql
  CREATE INDEX idx_notification_targets_role ON public.notification_targets USING btree (role)
  ```
- `idx_notification_targets_user_id`
  
  ```sql
  CREATE INDEX idx_notification_targets_user_id ON public.notification_targets USING btree (user_id)
  ```
- `notification_targets_pkey`
  
  ```sql
  CREATE UNIQUE INDEX notification_targets_pkey ON public.notification_targets USING btree (id)
  ```

---

### `public.notifications`

お知らせ（全体・ロール別・個別ユーザー向け）

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `type` | `text` | NO |  | 通知種別（system, contact_reply, campaign など） |
| 3 | `title` | `text` | NO |  | お知らせタイトル |
| 4 | `body` | `text` | NO |  | お知らせ本文（テキスト or markdown） |
| 5 | `link_url` | `text` | YES |  | 詳細ページなどへのリンクURL（任意） |
| 6 | `visible_from` | `timestamp with time zone` | YES |  | 掲載開始日時（null の場合、常に表示対象） |
| 7 | `visible_to` | `timestamp with time zone` | YES |  | 掲載終了日時（null の場合、無期限） |
| 8 | `created_by` | `uuid` | YES |  | 作成した管理ユーザーID |
| 9 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 10 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `notifications_body_not_null`, `notifications_created_at_not_null`, `notifications_id_not_null`, `notifications_title_not_null`, `notifications_type_not_null`, `notifications_updated_at_not_null`
- **FOREIGN KEY**: `notifications_created_by_fkey`
- **PRIMARY KEY**: `notifications_pkey`

**Indexes**

- `idx_notifications_created_at`
  
  ```sql
  CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC)
  ```
- `idx_notifications_type`
  
  ```sql
  CREATE INDEX idx_notifications_type ON public.notifications USING btree (type)
  ```
- `idx_notifications_visible_window`
  
  ```sql
  CREATE INDEX idx_notifications_visible_window ON public.notifications USING btree (visible_from, visible_to)
  ```
- `notifications_pkey`
  
  ```sql
  CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id)
  ```

---

### `public.option_labels`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `category` | `text` | NO |  |  |
| 2 | `value` | `text` | NO |  |  |
| 3 | `label_ja` | `text` | NO |  |  |
| 4 | `label_en` | `text` | NO |  |  |
| 5 | `sort` | `integer` | NO | 0 |  |
| 6 | `active` | `boolean` | NO | true |  |
| 7 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 8 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `option_labels_active_not_null`, `option_labels_category_not_null`, `option_labels_created_at_not_null`, `option_labels_label_en_not_null`, `option_labels_label_ja_not_null`, `option_labels_sort_not_null`, `option_labels_updated_at_not_null`, `option_labels_value_not_null`
- **PRIMARY KEY**: `option_labels_pkey`
- **UNIQUE**: `option_labels_unique`

**Indexes**

- `option_labels_pkey`
  
  ```sql
  CREATE UNIQUE INDEX option_labels_pkey ON public.option_labels USING btree (category, value)
  ```
- `option_labels_unique`
  
  ```sql
  CREATE UNIQUE INDEX option_labels_unique ON public.option_labels USING btree (category, value)
  ```
- `ux_option_labels_category_value`
  
  ```sql
  CREATE UNIQUE INDEX ux_option_labels_category_value ON public.option_labels USING btree (category, value)
  ```

---

### `public.order_addresses`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `order_id` | `uuid` | NO |  |  |
| 3 | `address_type` | `order_address_type` *(enum)* | NO |  |  |
| 4 | `full_name` | `text` | NO |  |  |
| 5 | `phone` | `text` | NO |  |  |
| 6 | `postal_code` | `text` | NO |  |  |
| 7 | `prefecture` | `text` | NO |  |  |
| 8 | `city` | `text` | NO |  |  |
| 9 | `address_line1` | `text` | NO |  |  |
| 10 | `address_line2` | `text` | YES |  |  |
| 11 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 12 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 13 | `country` | `text` | NO | 'JP'::text |  |
| 14 | `company` | `text` | YES |  |  |

> **Enum `order_address_type` values**: `shipping`, `billing`

**Constraints**

- **CHECK**: `order_addresses_address_line1_not_null`, `order_addresses_address_type_not_null`, `order_addresses_city_not_null`, `order_addresses_country_not_null`, `order_addresses_created_at_not_null`, `order_addresses_full_name_not_null`, `order_addresses_id_not_null`, `order_addresses_order_id_not_null`, `order_addresses_phone_not_null`, `order_addresses_postal_code_not_null`, `order_addresses_prefecture_not_null`, `order_addresses_updated_at_not_null`
- **FOREIGN KEY**: `order_addresses_order_id_fkey`
- **PRIMARY KEY**: `order_addresses_pkey`

**Indexes**

- `idx_order_addresses_order`
  
  ```sql
  CREATE INDEX idx_order_addresses_order ON public.order_addresses USING btree (order_id)
  ```
- `idx_order_addresses_type`
  
  ```sql
  CREATE INDEX idx_order_addresses_type ON public.order_addresses USING btree (address_type)
  ```
- `ix_order_addresses_order_id`
  
  ```sql
  CREATE INDEX ix_order_addresses_order_id ON public.order_addresses USING btree (order_id)
  ```
- `ix_order_addresses_type`
  
  ```sql
  CREATE INDEX ix_order_addresses_type ON public.order_addresses USING btree (address_type)
  ```
- `order_addresses_pkey`
  
  ```sql
  CREATE UNIQUE INDEX order_addresses_pkey ON public.order_addresses USING btree (id)
  ```

---

### `public.order_groups`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `user_id` | `uuid` | NO |  |  |
| 3 | `group_number` | `text` | YES |  |  |
| 4 | `total_amount` | `integer` | NO | 0 |  |
| 5 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 6 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `order_groups_created_at_not_null`, `order_groups_id_not_null`, `order_groups_total_amount_not_null`, `order_groups_updated_at_not_null`, `order_groups_user_id_not_null`
- **FOREIGN KEY**: `order_groups_user_id_fkey`
- **PRIMARY KEY**: `order_groups_pkey`
- **UNIQUE**: `order_groups_group_number_key`

**Indexes**

- `idx_order_groups_user_created`
  
  ```sql
  CREATE INDEX idx_order_groups_user_created ON public.order_groups USING btree (user_id, created_at DESC)
  ```
- `order_groups_group_number_key`
  
  ```sql
  CREATE UNIQUE INDEX order_groups_group_number_key ON public.order_groups USING btree (group_number)
  ```
- `order_groups_pkey`
  
  ```sql
  CREATE UNIQUE INDEX order_groups_pkey ON public.order_groups USING btree (id)
  ```

---

### `public.order_items`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `integer` | NO | nextval('order_items_id_seq'::regclass) |  |
| 2 | `order_id` | `uuid` | NO |  |  |
| 3 | `product_id` | `uuid` | NO |  |  |
| 4 | `price` | `integer` | NO |  |  |
| 5 | `quantity` | `integer` | NO |  |  |
| 6 | `seller_id` | `uuid` | YES |  |  |
| 7 | `product_title` | `text` | YES |  |  |
| 8 | `unit` | `text` | YES |  |  |

**Constraints**

- **CHECK**: `order_items_id_not_null`, `order_items_order_id_not_null`, `order_items_price_check`, `order_items_price_not_null`, `order_items_product_id_not_null`, `order_items_quantity_check`, `order_items_quantity_not_null`
- **FOREIGN KEY**: `order_items_order_id_fkey`, `order_items_product_id_fkey`, `order_items_seller_id_fkey`
- **PRIMARY KEY**: `order_items_pkey`

**Indexes**

- `idx_order_items_order`
  
  ```sql
  CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id)
  ```
- `idx_order_items_product`
  
  ```sql
  CREATE INDEX idx_order_items_product ON public.order_items USING btree (product_id)
  ```
- `ix_order_items_product`
  
  ```sql
  CREATE INDEX ix_order_items_product ON public.order_items USING btree (product_id)
  ```
- `ix_order_items_seller_product`
  
  ```sql
  CREATE INDEX ix_order_items_seller_product ON public.order_items USING btree (seller_id, product_id)
  ```
- `order_items_pkey`
  
  ```sql
  CREATE UNIQUE INDEX order_items_pkey ON public.order_items USING btree (id)
  ```

---

### `public.orders`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `buyer_id` | `uuid` | NO |  |  |
| 3 | `status` | `order_status` *(enum)* | NO | 'pending'::order_status |  |
| 4 | `subtotal` | `integer` | NO | 0 |  |
| 5 | `discount` | `integer` | NO | 0 |  |
| 6 | `shipping_fee` | `integer` | NO | 0 |  |
| 7 | `total` | `integer` | NO |  |  |
| 8 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 9 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 10 | `order_number` | `text` | YES |  |  |
| 11 | `eta_at` | `timestamp with time zone` | YES |  |  |
| 12 | `note` | `text` | YES |  |  |
| 13 | `reviewed` | `boolean` | YES | false |  |
| 14 | `payment_method` | `payment_method` *(enum)* | YES | 'cod'::payment_method |  |
| 15 | `payment_status` | `payment_status` *(enum)* | NO | 'unpaid'::payment_status |  |
| 16 | `payment_txid` | `text` | YES |  |  |
| 17 | `ship_method` | `ship_method` *(enum)* | YES |  |  |
| 18 | `ship_days` | `text` | YES |  |  |
| 19 | `ship_tracking_no` | `text` | YES |  |  |
| 20 | `shipment_status` | `text` | NO | 'unshipped'::text |  |
| 21 | `tax` | `integer` | NO | 0 |  |
| 22 | `coupon_code` | `text` | YES |  |  |
| 23 | `coupon_discount` | `integer` | NO | 0 |  |
| 24 | `bill_same` | `boolean` | NO | true |  |
| 25 | `group_id` | `uuid` | YES |  |  |
| 26 | `seller_id` | `uuid` | YES |  |  |
| 27 | `seller_name` | `text` | YES |  |  |
| 28 | `delivery_status` | `shipment_status` *(enum)* | YES |  |  |
| 29 | `ship_to` | `jsonb` | YES | '{}'::jsonb |  |
| 30 | `payment_provider` | `text` | YES |  |  |
| 31 | `payment_external_id` | `text` | YES |  |  |
| 32 | `ship_time_code` | `text` | YES |  |  |
| 33 | `receipt_name` | `text` | YES |  | 領収書の宛名（1〜40文字） |
| 34 | `transfer_id` | `uuid` | YES |  | 紐付けられた送金記録のID |
| 35 | `transfer_status` | `varchar(20)` | YES | 'pending'::character varying | pending: 未送金, included: 送金記録に含まれた, transferred: 送金完了 |
| 36 | `stripe_payment_intent_id` | `text` | YES |  | Stripe PaymentIntent ID（決済識別用） |
| 37 | `stripe_charge_id` | `text` | YES |  | Stripe Charge ID（返金時に使用） |
| 38 | `delivery_completed_at` | `timestamp without time zone` | YES |  | 配送/受取完了日時（delivery_status=deliveredになった日時） |
| 39 | `ledger_sale_id` | `uuid` | YES |  | 売上台帳エントリのID（ledger.idを参照） |
| 40 | `ledger_fee_id` | `uuid` | YES |  | 手数料台帳エントリのID（ledger.idを参照） |
| 41 | `stripe_refund_id` | `text` | YES |  |  |

> **Enum `order_status` values**: `pending`, `paid`, `shipped`, `cancelled`, `confirmed`, `processing`, `delivered`, `canceled`, `refunded`, `fulfilled`
> **Enum `payment_method` values**: `card`, `bank_transfer`, `convenience_store`, `cod`, `bank`, `paypay`
> **Enum `payment_status` values**: `pending`, `completed`, `failed`, `authorized`, `paid`, `canceled`, `refunded`, `unpaid`, `cancelled`
> **Enum `ship_method` values**: `pickup`, `delivery`
> **Enum `shipment_status` values**: `pending`, `preparing`, `shipped`, `delivered`, `cancelled`, `returned`, `lost`, `canceled`, `in_transit`

**Constraints**

- **CHECK**: `orders_amounts_check`, `orders_bill_same_not_null`, `orders_buyer_id_not_null`, `orders_coupon_discount_not_null`, `orders_created_at_not_null`, `orders_discount_not_null`, `orders_id_not_null`, `orders_payment_status_not_null`, `orders_receipt_name_length_check`, `orders_shipment_status_not_null`, `orders_shipping_fee_not_null`, `orders_status_not_null`, `orders_subtotal_not_null`, `orders_tax_not_null`, `orders_total_not_null`, `orders_updated_at_not_null`
- **FOREIGN KEY**: `orders_buyer_id_fkey`, `orders_group_id_fkey`, `orders_seller_id_fkey`, `orders_transfer_id_fkey`
- **PRIMARY KEY**: `orders_pkey`
- **UNIQUE**: `orders_order_number_key`, `uq_orders_order_number`

**Indexes**

- `idx_orders_buyer`
  
  ```sql
  CREATE INDEX idx_orders_buyer ON public.orders USING btree (buyer_id)
  ```
- `idx_orders_buyer_created_at`
  
  ```sql
  CREATE INDEX idx_orders_buyer_created_at ON public.orders USING btree (buyer_id, created_at DESC)
  ```
- `idx_orders_created`
  
  ```sql
  CREATE INDEX idx_orders_created ON public.orders USING btree (created_at DESC)
  ```
- `idx_orders_delivery_completed`
  
  ```sql
  CREATE INDEX idx_orders_delivery_completed ON public.orders USING btree (delivery_completed_at)
  ```
- `idx_orders_group`
  
  ```sql
  CREATE INDEX idx_orders_group ON public.orders USING btree (group_id)
  ```
- `idx_orders_ledger_sale`
  
  ```sql
  CREATE INDEX idx_orders_ledger_sale ON public.orders USING btree (ledger_sale_id)
  ```
- `idx_orders_order_number`
  
  ```sql
  CREATE INDEX idx_orders_order_number ON public.orders USING btree (order_number)
  ```
- `idx_orders_payment_status`
  
  ```sql
  CREATE INDEX idx_orders_payment_status ON public.orders USING btree (payment_status)
  ```
- `idx_orders_seller_created`
  
  ```sql
  CREATE INDEX idx_orders_seller_created ON public.orders USING btree (seller_id, created_at DESC)
  ```
- `idx_orders_shipment_status`
  
  ```sql
  CREATE INDEX idx_orders_shipment_status ON public.orders USING btree (shipment_status)
  ```
- `idx_orders_status`
  
  ```sql
  CREATE INDEX idx_orders_status ON public.orders USING btree (status)
  ```
- `idx_orders_status_updated_at`
  
  ```sql
  CREATE INDEX idx_orders_status_updated_at ON public.orders USING btree (status, updated_at DESC)
  ```
- `idx_orders_stripe_charge`
  
  ```sql
  CREATE INDEX idx_orders_stripe_charge ON public.orders USING btree (stripe_charge_id)
  ```
- `idx_orders_stripe_payment_intent`
  
  ```sql
  CREATE INDEX idx_orders_stripe_payment_intent ON public.orders USING btree (stripe_payment_intent_id)
  ```
- `idx_orders_transfer_id`
  
  ```sql
  CREATE INDEX idx_orders_transfer_id ON public.orders USING btree (transfer_id)
  ```
- `idx_orders_transfer_status`
  
  ```sql
  CREATE INDEX idx_orders_transfer_status ON public.orders USING btree (transfer_status)
  ```
- `ix_orders_order_number`
  
  ```sql
  CREATE INDEX ix_orders_order_number ON public.orders USING btree (order_number)
  ```
- `ix_orders_payment_external`
  
  ```sql
  CREATE INDEX ix_orders_payment_external ON public.orders USING btree (payment_provider, payment_external_id)
  ```
- `ix_orders_payment_status`
  
  ```sql
  CREATE INDEX ix_orders_payment_status ON public.orders USING btree (payment_status)
  ```
- `ix_orders_status_created`
  
  ```sql
  CREATE INDEX ix_orders_status_created ON public.orders USING btree (status, created_at)
  ```
- `orders_order_number_key`
  
  ```sql
  CREATE UNIQUE INDEX orders_order_number_key ON public.orders USING btree (order_number)
  ```
- `orders_pkey`
  
  ```sql
  CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id)
  ```
- `uq_orders_order_number`
  
  ```sql
  CREATE UNIQUE INDEX uq_orders_order_number ON public.orders USING btree (order_number)
  ```

---

### `public.orders_with_legacy_address`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | YES |  |  |
| 2 | `buyer_id` | `uuid` | YES |  |  |
| 3 | `status` | `order_status` *(enum)* | YES |  |  |
| 4 | `subtotal` | `integer` | YES |  |  |
| 5 | `discount` | `integer` | YES |  |  |
| 6 | `shipping_fee` | `integer` | YES |  |  |
| 7 | `total` | `integer` | YES |  |  |
| 8 | `created_at` | `timestamp with time zone` | YES |  |  |
| 9 | `updated_at` | `timestamp with time zone` | YES |  |  |
| 10 | `order_number` | `text` | YES |  |  |
| 11 | `eta_at` | `timestamp with time zone` | YES |  |  |
| 12 | `note` | `text` | YES |  |  |
| 13 | `reviewed` | `boolean` | YES |  |  |
| 14 | `payment_method` | `text` | YES |  |  |
| 15 | `payment_status` | `text` | YES |  |  |
| 16 | `payment_txid` | `text` | YES |  |  |
| 17 | `ship_method` | `text` | YES |  |  |
| 18 | `ship_days` | `text` | YES |  |  |
| 19 | `ship_tracking_no` | `text` | YES |  |  |
| 20 | `shipment_status` | `text` | YES |  |  |
| 21 | `tax` | `integer` | YES |  |  |
| 22 | `coupon_code` | `text` | YES |  |  |
| 23 | `coupon_discount` | `integer` | YES |  |  |
| 24 | `bill_same` | `boolean` | YES |  |  |
| 25 | `shipping_name` | `text` | YES |  |  |
| 26 | `shipping_email` | `text` | YES |  |  |
| 27 | `shipping_phone` | `text` | YES |  |  |
| 28 | `shipping_postal_code` | `text` | YES |  |  |
| 29 | `shipping_prefecture` | `text` | YES |  |  |
| 30 | `shipping_city` | `text` | YES |  |  |
| 31 | `shipping_address1` | `text` | YES |  |  |
| 32 | `shipping_address2` | `text` | YES |  |  |
| 33 | `billing_name` | `text` | YES |  |  |
| 34 | `billing_email` | `text` | YES |  |  |
| 35 | `billing_phone` | `text` | YES |  |  |
| 36 | `billing_postal_code` | `text` | YES |  |  |
| 37 | `billing_prefecture` | `text` | YES |  |  |
| 38 | `billing_city` | `text` | YES |  |  |
| 39 | `billing_address1` | `text` | YES |  |  |
| 40 | `billing_address2` | `text` | YES |  |  |

> **Enum `order_status` values**: `pending`, `paid`, `shipped`, `cancelled`, `confirmed`, `processing`, `delivered`, `canceled`, `refunded`, `fulfilled`

**Constraints**

_No constraints_

**Indexes**

_No indexes_

---

### `public.partner_allowed_payment_methods`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `partner_id` | `uuid` | NO |  |  |
| 2 | `method` | `payment_method` *(enum)* | NO |  |  |
| 3 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 4 | `updated_at` | `timestamp with time zone` | NO | now() |  |

> **Enum `payment_method` values**: `card`, `bank_transfer`, `convenience_store`, `cod`, `bank`, `paypay`

**Constraints**

- **CHECK**: `partner_allowed_payment_methods_created_at_not_null`, `partner_allowed_payment_methods_method_not_null`, `partner_allowed_payment_methods_partner_id_not_null`, `partner_allowed_payment_methods_updated_at_not_null`
- **FOREIGN KEY**: `partner_allowed_payment_methods_partner_id_fkey`
- **PRIMARY KEY**: `partner_allowed_payment_methods_pkey`

**Indexes**

- `idx_papm_partner`
  
  ```sql
  CREATE INDEX idx_papm_partner ON public.partner_allowed_payment_methods USING btree (partner_id)
  ```
- `partner_allowed_payment_methods_pkey`
  
  ```sql
  CREATE UNIQUE INDEX partner_allowed_payment_methods_pkey ON public.partner_allowed_payment_methods USING btree (partner_id, method)
  ```

---

### `public.partner_allowed_ship_methods`

パートナーごとの許可された配送方法（配送 or 畑受け取り）

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `partner_id` | `uuid` | NO |  | パートナーID |
| 2 | `method` | `ship_method` *(enum)* | NO |  | 配送方法（delivery: 配送, pickup: 畑受け取り） |
| 3 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 4 | `updated_at` | `timestamp with time zone` | NO | now() |  |

> **Enum `ship_method` values**: `pickup`, `delivery`

**Constraints**

- **CHECK**: `partner_allowed_ship_methods_created_at_not_null`, `partner_allowed_ship_methods_method_not_null`, `partner_allowed_ship_methods_partner_id_not_null`, `partner_allowed_ship_methods_updated_at_not_null`
- **FOREIGN KEY**: `partner_allowed_ship_methods_partner_id_fkey`
- **PRIMARY KEY**: `partner_allowed_ship_methods_pkey`

**Indexes**

- `idx_pasm_partner`
  
  ```sql
  CREATE INDEX idx_pasm_partner ON public.partner_allowed_ship_methods USING btree (partner_id)
  ```
- `partner_allowed_ship_methods_pkey`
  
  ```sql
  CREATE UNIQUE INDEX partner_allowed_ship_methods_pkey ON public.partner_allowed_ship_methods USING btree (partner_id, method)
  ```

---

### `public.partner_bank_accounts`

取引先の銀行口座情報（売上送金先）

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `partner_id` | `uuid` | NO |  |  |
| 3 | `bank_name` | `varchar(100)` | NO |  |  |
| 4 | `bank_code` | `varchar(4)` | YES |  |  |
| 5 | `branch_name` | `varchar(100)` | NO |  |  |
| 6 | `branch_code` | `varchar(3)` | YES |  |  |
| 7 | `account_type` | `varchar(20)` | NO |  | 口座種別: ordinary(普通), current(当座), savings(貯蓄) |
| 8 | `account_number` | `varchar(7)` | NO |  |  |
| 9 | `account_holder_name` | `varchar(100)` | NO |  |  |
| 10 | `is_verified` | `boolean` | YES | false | 管理者による確認済みフラグ |
| 11 | `verified_at` | `timestamp without time zone` | YES |  |  |
| 12 | `verified_by` | `uuid` | YES |  |  |
| 13 | `note` | `text` | YES |  |  |
| 14 | `created_at` | `timestamp without time zone` | YES | now() |  |
| 15 | `updated_at` | `timestamp without time zone` | YES | now() |  |

**Constraints**

- **CHECK**: `partner_bank_accounts_account_holder_name_not_null`, `partner_bank_accounts_account_number_not_null`, `partner_bank_accounts_account_type_not_null`, `partner_bank_accounts_bank_name_not_null`, `partner_bank_accounts_branch_name_not_null`, `partner_bank_accounts_id_not_null`, `partner_bank_accounts_partner_id_not_null`
- **FOREIGN KEY**: `partner_bank_accounts_partner_id_fkey`, `partner_bank_accounts_verified_by_fkey`
- **PRIMARY KEY**: `partner_bank_accounts_pkey`
- **UNIQUE**: `partner_bank_accounts_partner_id_key`

**Indexes**

- `idx_partner_bank_accounts_partner_id`
  
  ```sql
  CREATE INDEX idx_partner_bank_accounts_partner_id ON public.partner_bank_accounts USING btree (partner_id)
  ```
- `idx_partner_bank_accounts_verified`
  
  ```sql
  CREATE INDEX idx_partner_bank_accounts_verified ON public.partner_bank_accounts USING btree (is_verified)
  ```
- `partner_bank_accounts_partner_id_key`
  
  ```sql
  CREATE UNIQUE INDEX partner_bank_accounts_partner_id_key ON public.partner_bank_accounts USING btree (partner_id)
  ```
- `partner_bank_accounts_pkey`
  
  ```sql
  CREATE UNIQUE INDEX partner_bank_accounts_pkey ON public.partner_bank_accounts USING btree (id)
  ```

---

### `public.partner_date_availabilities`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `partner_id` | `uuid` | NO |  |  |
| 3 | `kind` | `ship_method` *(enum)* | NO |  |  |
| 4 | `date` | `date` | NO |  |  |
| 5 | `start_time` | `time without time zone` | NO | '00:00:00'::time without time zone |  |
| 6 | `end_time` | `time without time zone` | NO | '23:59:00'::time without time zone |  |
| 7 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 8 | `updated_at` | `timestamp with time zone` | NO | now() |  |

> **Enum `ship_method` values**: `pickup`, `delivery`

**Constraints**

- **CHECK**: `partner_date_availabilities_created_at_not_null`, `partner_date_availabilities_date_not_null`, `partner_date_availabilities_end_time_not_null`, `partner_date_availabilities_id_not_null`, `partner_date_availabilities_kind_not_null`, `partner_date_availabilities_partner_id_not_null`, `partner_date_availabilities_start_time_not_null`, `partner_date_availabilities_updated_at_not_null`
- **FOREIGN KEY**: `partner_date_availabilities_partner_id_fkey`
- **PRIMARY KEY**: `partner_date_availabilities_pkey`
- **UNIQUE**: `uq_partner_date`

**Indexes**

- `idx_partner_date_availabilities_partner`
  
  ```sql
  CREATE INDEX idx_partner_date_availabilities_partner ON public.partner_date_availabilities USING btree (partner_id, kind, date)
  ```
- `partner_date_availabilities_pkey`
  
  ```sql
  CREATE UNIQUE INDEX partner_date_availabilities_pkey ON public.partner_date_availabilities USING btree (id)
  ```
- `uq_partner_date`
  
  ```sql
  CREATE UNIQUE INDEX uq_partner_date ON public.partner_date_availabilities USING btree (partner_id, kind, date, start_time, end_time)
  ```

---

### `public.partner_transfers`

取引先への送金履歴（手動送金の記録）

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `partner_id` | `uuid` | NO |  |  |
| 3 | `bank_account_id` | `uuid` | YES |  |  |
| 4 | `transfer_period_start` | `date` | NO |  |  |
| 5 | `transfer_period_end` | `date` | NO |  |  |
| 6 | `transfer_scheduled_date` | `date` | NO |  | 送金予定日（隔週月曜日） |
| 7 | `total_order_amount` | `integer` | NO |  |  |
| 8 | `platform_fee_rate` | `numeric(5,2)` | YES | 0.00 |  |
| 9 | `platform_fee_amount` | `integer` | YES | 0 |  |
| 10 | `transfer_amount` | `integer` | NO |  |  |
| 11 | `order_count` | `integer` | NO |  |  |
| 12 | `order_ids` | `ARRAY` | NO |  | 送金対象の注文ID配列 |
| 13 | `status` | `varchar(20)` | NO | 'pending'::character varying | pending: 送金待ち, processing: 処理中, completed: 完了, failed: 失敗, cancelled: キャンセル |
| 14 | `transferred_at` | `timestamp without time zone` | YES |  |  |
| 15 | `transferred_by` | `uuid` | YES |  |  |
| 16 | `transfer_note` | `text` | YES |  |  |
| 17 | `error_message` | `text` | YES |  |  |
| 18 | `created_at` | `timestamp without time zone` | YES | now() |  |
| 19 | `updated_at` | `timestamp without time zone` | YES | now() |  |

**Constraints**

- **CHECK**: `check_order_count`, `check_transfer_amount`, `check_transfer_period`, `partner_transfers_id_not_null`, `partner_transfers_order_count_not_null`, `partner_transfers_order_ids_not_null`, `partner_transfers_partner_id_not_null`, `partner_transfers_status_not_null`, `partner_transfers_total_order_amount_not_null`, `partner_transfers_transfer_amount_not_null`, `partner_transfers_transfer_period_end_not_null`, `partner_transfers_transfer_period_start_not_null`, `partner_transfers_transfer_scheduled_date_not_null`
- **FOREIGN KEY**: `partner_transfers_bank_account_id_fkey`, `partner_transfers_partner_id_fkey`, `partner_transfers_transferred_by_fkey`
- **PRIMARY KEY**: `partner_transfers_pkey`

**Indexes**

- `idx_partner_transfers_partner_id`
  
  ```sql
  CREATE INDEX idx_partner_transfers_partner_id ON public.partner_transfers USING btree (partner_id)
  ```
- `idx_partner_transfers_period`
  
  ```sql
  CREATE INDEX idx_partner_transfers_period ON public.partner_transfers USING btree (transfer_period_start, transfer_period_end)
  ```
- `idx_partner_transfers_scheduled_date`
  
  ```sql
  CREATE INDEX idx_partner_transfers_scheduled_date ON public.partner_transfers USING btree (transfer_scheduled_date)
  ```
- `idx_partner_transfers_status`
  
  ```sql
  CREATE INDEX idx_partner_transfers_status ON public.partner_transfers USING btree (status)
  ```
- `partner_transfers_pkey`
  
  ```sql
  CREATE UNIQUE INDEX partner_transfers_pkey ON public.partner_transfers USING btree (id)
  ```

---

### `public.partner_weekday_availabilities`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `partner_id` | `uuid` | NO |  |  |
| 3 | `kind` | `ship_method` *(enum)* | NO |  |  |
| 4 | `weekday` | `integer` | NO |  |  |
| 5 | `start_time` | `time without time zone` | NO | '00:00:00'::time without time zone |  |
| 6 | `end_time` | `time without time zone` | NO | '23:59:00'::time without time zone |  |
| 7 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 8 | `updated_at` | `timestamp with time zone` | NO | now() |  |

> **Enum `ship_method` values**: `pickup`, `delivery`

**Constraints**

- **CHECK**: `partner_weekday_availabilities_created_at_not_null`, `partner_weekday_availabilities_end_time_not_null`, `partner_weekday_availabilities_id_not_null`, `partner_weekday_availabilities_kind_not_null`, `partner_weekday_availabilities_partner_id_not_null`, `partner_weekday_availabilities_start_time_not_null`, `partner_weekday_availabilities_updated_at_not_null`, `partner_weekday_availabilities_weekday_check`, `partner_weekday_availabilities_weekday_not_null`
- **FOREIGN KEY**: `partner_weekday_availabilities_partner_id_fkey`
- **PRIMARY KEY**: `partner_weekday_availabilities_pkey`
- **UNIQUE**: `uq_partner_weekday`

**Indexes**

- `idx_partner_weekday_availabilities_partner`
  
  ```sql
  CREATE INDEX idx_partner_weekday_availabilities_partner ON public.partner_weekday_availabilities USING btree (partner_id, kind, weekday)
  ```
- `partner_weekday_availabilities_pkey`
  
  ```sql
  CREATE UNIQUE INDEX partner_weekday_availabilities_pkey ON public.partner_weekday_availabilities USING btree (id)
  ```
- `uq_partner_weekday`
  
  ```sql
  CREATE UNIQUE INDEX uq_partner_weekday ON public.partner_weekday_availabilities USING btree (partner_id, kind, weekday, start_time, end_time)
  ```

---

### `public.partners`

取引先（主に飲食店などの法人・団体・個人事業主）

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `name` | `text` | NO |  |  |
| 3 | `kana` | `text` | YES |  |  |
| 4 | `type` | `partner_type` *(enum)* | NO | 'restaurant'::partner_type | 取引先の区分（restaurant 等） |
| 5 | `status` | `partner_status` *(enum)* | NO | 'active'::partner_status | 稼働状態（active/inactive/prospect/suspended） |
| 6 | `email` | `text` | YES |  |  |
| 7 | `phone` | `text` | YES |  |  |
| 8 | `website` | `text` | YES |  |  |
| 9 | `billing_email` | `text` | YES |  |  |
| 10 | `billing_terms` | `text` | YES |  |  |
| 11 | `tax_id` | `text` | YES |  |  |
| 12 | `postal_code` | `text` | YES |  |  |
| 13 | `prefecture` | `text` | YES |  |  |
| 14 | `city` | `text` | YES |  |  |
| 15 | `address1` | `text` | YES |  |  |
| 16 | `address2` | `text` | YES |  |  |
| 17 | `note` | `text` | YES |  |  |
| 18 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 19 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 20 | `name_key` | `text` | YES |  |  |
| 21 | `postal_norm` | `text` | YES |  | 郵便番号（数字のみ7桁など） |
| 22 | `phone_norm` | `text` | YES |  | 電話番号（数字のみ） |
| 23 | `partner_key` | `text` | YES |  |  |
| 24 | `payment_methods` | `ARRAY` | NO | ARRAY['card'::payment_method] |  |
| 25 | `min_order_amount` | `integer` | NO | 0 |  |
| 26 | `shipping_policy` | `jsonb` | NO | '{}'::jsonb |  |
| 27 | `seller_intro_summary` | `text` | YES |  |  |
| 28 | `icon_url` | `text` | YES |  |  |
| 29 | `icon_r2_key` | `text` | YES |  |  |
| 30 | `pickup_address_id` | `uuid` | YES |  | 畑受け取りで使用する住所ID（addresses.idを参照） |
| 31 | `stripe_account_id` | `text` | YES |  | Stripe ConnectアカウントID（Express） |
| 32 | `payouts_enabled` | `boolean` | YES | false | 自動送金有効フラグ（trueの場合、隔週月曜に自動送金） |
| 33 | `debt_cents` | `integer` | YES | 0 | 負債額（円単位）。返金等で残高不足の場合に計上 |
| 34 | `stop_reason` | `text` | YES |  | 送金停止理由（debt_over_10000 等） |
| 35 | `stripe_onboarding_completed` | `boolean` | YES | false |  |
| 36 | `stripe_details_submitted` | `boolean` | YES | false |  |
| 37 | `stripe_payouts_enabled` | `boolean` | YES | false |  |
| 38 | `stripe_charges_enabled` | `boolean` | YES | false |  |
| 39 | `stripe_account_updated_at` | `timestamp without time zone` | YES |  |  |
| 40 | `stripe_account_type` | `text` | YES | 'express'::text |  |
| 41 | `stripe_payouts_enabled_at` | `timestamp without time zone` | YES |  |  |
| 42 | `details_submitted` | `boolean` | YES | false |  |
| 43 | `charges_enabled` | `boolean` | YES | false |  |
| 44 | `requirements_due_by` | `timestamp without time zone` | YES |  |  |

> **Enum `partner_type` values**: `restaurant`, `retailer`, `wholesale`, `corporate`, `individual`, `other`
> **Enum `partner_status` values**: `active`, `inactive`, `prospect`, `suspended`

**Constraints**

- **CHECK**: `partners_created_at_not_null`, `partners_id_not_null`, `partners_min_order_amount_not_null`, `partners_name_not_null`, `partners_payment_methods_not_null`, `partners_shipping_policy_not_null`, `partners_status_not_null`, `partners_type_not_null`, `partners_updated_at_not_null`
- **PRIMARY KEY**: `partners_pkey`
- **UNIQUE**: `partners_stripe_account_id_key`, `ux_partners_partner_key`

**Indexes**

- `idx_partners_city_trgm`
  
  ```sql
  CREATE INDEX idx_partners_city_trgm ON public.partners USING gin (city gin_trgm_ops)
  ```
- `idx_partners_debt`
  
  ```sql
  CREATE INDEX idx_partners_debt ON public.partners USING btree (debt_cents)
  ```
- `idx_partners_name`
  
  ```sql
  CREATE INDEX idx_partners_name ON public.partners USING btree (name)
  ```
- `idx_partners_payouts_enabled`
  
  ```sql
  CREATE INDEX idx_partners_payouts_enabled ON public.partners USING btree (payouts_enabled)
  ```
- `idx_partners_postal_norm`
  
  ```sql
  CREATE INDEX idx_partners_postal_norm ON public.partners USING btree (postal_norm)
  ```
- `idx_partners_prefecture_city`
  
  ```sql
  CREATE INDEX idx_partners_prefecture_city ON public.partners USING btree (prefecture, city)
  ```
- `idx_partners_status`
  
  ```sql
  CREATE INDEX idx_partners_status ON public.partners USING btree (status)
  ```
- `idx_partners_status_type`
  
  ```sql
  CREATE INDEX idx_partners_status_type ON public.partners USING btree (status, type)
  ```
- `idx_partners_stripe_account`
  
  ```sql
  CREATE INDEX idx_partners_stripe_account ON public.partners USING btree (stripe_account_id)
  ```
- `idx_partners_type`
  
  ```sql
  CREATE INDEX idx_partners_type ON public.partners USING btree (type)
  ```
- `partners_pkey`
  
  ```sql
  CREATE UNIQUE INDEX partners_pkey ON public.partners USING btree (id)
  ```
- `partners_stripe_account_id_key`
  
  ```sql
  CREATE UNIQUE INDEX partners_stripe_account_id_key ON public.partners USING btree (stripe_account_id)
  ```
- `ux_partners_partner_key`
  
  ```sql
  CREATE UNIQUE INDEX ux_partners_partner_key ON public.partners USING btree (partner_key)
  ```

---

### `public.password_reset_tokens`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `user_id` | `uuid` | NO |  |  |
| 3 | `token_hash` | `text` | NO |  |  |
| 4 | `expires_at` | `timestamp with time zone` | NO |  |  |
| 5 | `used` | `boolean` | NO | false |  |
| 6 | `created_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `password_reset_tokens_created_at_not_null`, `password_reset_tokens_expires_at_not_null`, `password_reset_tokens_id_not_null`, `password_reset_tokens_token_hash_not_null`, `password_reset_tokens_used_not_null`, `password_reset_tokens_user_id_not_null`
- **FOREIGN KEY**: `password_reset_tokens_user_id_fkey`
- **PRIMARY KEY**: `password_reset_tokens_pkey`

**Indexes**

- `idx_prt_exp_used`
  
  ```sql
  CREATE INDEX idx_prt_exp_used ON public.password_reset_tokens USING btree (expires_at, used)
  ```
- `idx_prt_user`
  
  ```sql
  CREATE INDEX idx_prt_user ON public.password_reset_tokens USING btree (user_id)
  ```
- `idx_prt_user_token`
  
  ```sql
  CREATE INDEX idx_prt_user_token ON public.password_reset_tokens USING btree (user_id, token_hash)
  ```
- `password_reset_tokens_pkey`
  
  ```sql
  CREATE UNIQUE INDEX password_reset_tokens_pkey ON public.password_reset_tokens USING btree (id)
  ```

---

### `public.payments`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `integer` | NO | nextval('payments_id_seq'::regclass) |  |
| 2 | `order_id` | `uuid` | NO |  |  |
| 3 | `amount` | `integer` | NO |  |  |
| 4 | `method` | `payment_method` *(enum)* | NO |  |  |
| 5 | `status` | `payment_status` *(enum)* | NO | 'pending'::payment_status |  |
| 6 | `transaction_id` | `text` | YES |  |  |
| 7 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 8 | `updated_at` | `timestamp with time zone` | NO | now() |  |

> **Enum `payment_method` values**: `card`, `bank_transfer`, `convenience_store`, `cod`, `bank`, `paypay`
> **Enum `payment_status` values**: `pending`, `completed`, `failed`, `authorized`, `paid`, `canceled`, `refunded`, `unpaid`, `cancelled`

**Constraints**

- **CHECK**: `payments_amount_check`, `payments_amount_not_null`, `payments_created_at_not_null`, `payments_id_not_null`, `payments_method_not_null`, `payments_order_id_not_null`, `payments_status_not_null`, `payments_updated_at_not_null`
- **FOREIGN KEY**: `payments_order_id_fkey`
- **PRIMARY KEY**: `payments_pkey`
- **UNIQUE**: `payments_transaction_id_key`

**Indexes**

- `idx_payments_created`
  
  ```sql
  CREATE INDEX idx_payments_created ON public.payments USING btree (created_at DESC)
  ```
- `idx_payments_order`
  
  ```sql
  CREATE INDEX idx_payments_order ON public.payments USING btree (order_id)
  ```
- `idx_payments_order_updated`
  
  ```sql
  CREATE INDEX idx_payments_order_updated ON public.payments USING btree (order_id, updated_at DESC)
  ```
- `idx_payments_status`
  
  ```sql
  CREATE INDEX idx_payments_status ON public.payments USING btree (status)
  ```
- `payments_pkey`
  
  ```sql
  CREATE UNIQUE INDEX payments_pkey ON public.payments USING btree (id)
  ```
- `payments_transaction_id_key`
  
  ```sql
  CREATE UNIQUE INDEX payments_transaction_id_key ON public.payments USING btree (transaction_id)
  ```

---

### `public.payout_runs`

送金バッチ実行履歴テーブル。冪等性と監査のため、全実行を記録

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `run_id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `run_date` | `date` | NO |  | 実行日。UNIQUE制約により同日の重複実行を防止 |
| 3 | `iso_week` | `integer` | NO |  | ISO週番号。偶数週のみ実行される（2, 4, 6, ...） |
| 4 | `iso_year` | `integer` | NO |  |  |
| 5 | `status` | `text` | NO | 'pending'::text |  |
| 6 | `partners_processed` | `integer` | YES | 0 |  |
| 7 | `partners_succeeded` | `integer` | YES | 0 |  |
| 8 | `partners_failed` | `integer` | YES | 0 |  |
| 9 | `total_payout_amount_cents` | `integer` | YES | 0 |  |
| 10 | `started_at` | `timestamp without time zone` | YES |  |  |
| 11 | `completed_at` | `timestamp without time zone` | YES |  |  |
| 12 | `log` | `jsonb` | YES | '[]'::jsonb | 各出品者の処理結果を記録したJSON配列 |
| 13 | `error_message` | `text` | YES |  |  |
| 14 | `created_at` | `timestamp without time zone` | YES | now() |  |
| 15 | `updated_at` | `timestamp without time zone` | YES | now() |  |

**Constraints**

- **CHECK**: `payout_runs_iso_week_not_null`, `payout_runs_iso_year_not_null`, `payout_runs_run_date_not_null`, `payout_runs_run_id_not_null`, `payout_runs_status_check`, `payout_runs_status_not_null`
- **PRIMARY KEY**: `payout_runs_pkey`
- **UNIQUE**: `payout_runs_run_date_key`

**Indexes**

- `idx_payout_runs_created_at`
  
  ```sql
  CREATE INDEX idx_payout_runs_created_at ON public.payout_runs USING btree (created_at DESC)
  ```
- `idx_payout_runs_date`
  
  ```sql
  CREATE INDEX idx_payout_runs_date ON public.payout_runs USING btree (run_date DESC)
  ```
- `idx_payout_runs_iso_week`
  
  ```sql
  CREATE INDEX idx_payout_runs_iso_week ON public.payout_runs USING btree (iso_week)
  ```
- `idx_payout_runs_status`
  
  ```sql
  CREATE INDEX idx_payout_runs_status ON public.payout_runs USING btree (status)
  ```
- `idx_payout_runs_week`
  
  ```sql
  CREATE INDEX idx_payout_runs_week ON public.payout_runs USING btree (iso_year, iso_week)
  ```
- `payout_runs_pkey`
  
  ```sql
  CREATE UNIQUE INDEX payout_runs_pkey ON public.payout_runs USING btree (run_id)
  ```
- `payout_runs_run_date_key`
  
  ```sql
  CREATE UNIQUE INDEX payout_runs_run_date_key ON public.payout_runs USING btree (run_date)
  ```

---

### `public.product_images`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `product_id` | `uuid` | NO |  |  |
| 3 | `url` | `text` | NO |  |  |
| 4 | `alt` | `text` | YES |  |  |
| 5 | `position` | `integer` | NO | 0 |  |
| 6 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 7 | `r2_key` | `text` | YES |  |  |
| 8 | `mime` | `text` | YES |  |  |
| 9 | `bytes` | `integer` | YES |  |  |
| 10 | `width` | `integer` | YES |  |  |
| 11 | `height` | `integer` | YES |  |  |
| 12 | `checksum` | `text` | YES |  |  |

**Constraints**

- **CHECK**: `product_images_created_at_not_null`, `product_images_id_not_null`, `product_images_position_not_null`, `product_images_product_id_not_null`, `product_images_url_not_null`
- **FOREIGN KEY**: `product_images_product_id_fkey`
- **PRIMARY KEY**: `product_images_pkey`
- **UNIQUE**: `product_images_r2_key_key`

**Indexes**

- `idx_product_images_position`
  
  ```sql
  CREATE INDEX idx_product_images_position ON public.product_images USING btree (product_id, "position")
  ```
- `idx_product_images_product`
  
  ```sql
  CREATE INDEX idx_product_images_product ON public.product_images USING btree (product_id)
  ```
- `ix_product_images_position`
  
  ```sql
  CREATE INDEX ix_product_images_position ON public.product_images USING btree ("position")
  ```
- `ix_product_images_product_id`
  
  ```sql
  CREATE INDEX ix_product_images_product_id ON public.product_images USING btree (product_id)
  ```
- `product_images_pkey`
  
  ```sql
  CREATE UNIQUE INDEX product_images_pkey ON public.product_images USING btree (id)
  ```
- `product_images_r2_key_key`
  
  ```sql
  CREATE UNIQUE INDEX product_images_r2_key_key ON public.product_images USING btree (r2_key)
  ```

---

### `public.product_popularity_stats`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `product_id` | `uuid` | NO |  |  |
| 3 | `period_type` | `text` | NO |  |  |
| 4 | `range_start` | `timestamp with time zone` | NO |  |  |
| 5 | `range_end` | `timestamp with time zone` | NO |  |  |
| 6 | `order_count` | `integer` | NO | 0 |  |
| 7 | `quantity_sold` | `integer` | NO | 0 |  |
| 8 | `sales_amount` | `integer` | NO | 0 |  |
| 9 | `favorite_count` | `integer` | NO | 0 |  |
| 10 | `snapshot_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `product_popularity_stats_favorite_count_not_null`, `product_popularity_stats_id_not_null`, `product_popularity_stats_order_count_not_null`, `product_popularity_stats_period_type_not_null`, `product_popularity_stats_product_id_not_null`, `product_popularity_stats_quantity_sold_not_null`, `product_popularity_stats_range_end_not_null`, `product_popularity_stats_range_start_not_null`, `product_popularity_stats_sales_amount_not_null`, `product_popularity_stats_snapshot_at_not_null`
- **PRIMARY KEY**: `product_popularity_stats_pkey`

**Indexes**

- `ix_popularity_product_period`
  
  ```sql
  CREATE INDEX ix_popularity_product_period ON public.product_popularity_stats USING btree (period_type, range_end DESC, product_id)
  ```
- `product_popularity_stats_pkey`
  
  ```sql
  CREATE UNIQUE INDEX product_popularity_stats_pkey ON public.product_popularity_stats USING btree (id)
  ```

---

### `public.product_rating_stats`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `product_id` | `uuid` | YES |  |  |
| 2 | `review_count` | `integer` | YES |  |  |
| 3 | `rating_avg` | `numeric` | YES |  |  |

**Constraints**

_No constraints_

**Indexes**

_No indexes_

---

### `public.product_reviews`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `product_id` | `uuid` | NO |  |  |
| 3 | `user_id` | `uuid` | NO |  |  |
| 4 | `rating` | `integer` | NO |  |  |
| 5 | `title` | `text` | YES |  |  |
| 6 | `body` | `text` | NO |  |  |
| 7 | `status` | `review_status` *(enum)* | NO | 'published'::review_status |  |
| 8 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 9 | `updated_at` | `timestamp with time zone` | NO | now() |  |

> **Enum `review_status` values**: `published`, `pending`, `hidden`

**Constraints**

- **CHECK**: `product_reviews_body_not_null`, `product_reviews_created_at_not_null`, `product_reviews_id_not_null`, `product_reviews_product_id_not_null`, `product_reviews_rating_check`, `product_reviews_rating_not_null`, `product_reviews_status_not_null`, `product_reviews_updated_at_not_null`, `product_reviews_user_id_not_null`
- **FOREIGN KEY**: `product_reviews_product_id_fkey`, `product_reviews_user_id_fkey`
- **PRIMARY KEY**: `product_reviews_pkey`
- **UNIQUE**: `uq_product_reviews_user`

**Indexes**

- `idx_product_reviews_product_created`
  
  ```sql
  CREATE INDEX idx_product_reviews_product_created ON public.product_reviews USING btree (product_id, created_at DESC)
  ```
- `idx_product_reviews_status`
  
  ```sql
  CREATE INDEX idx_product_reviews_status ON public.product_reviews USING btree (status)
  ```
- `product_reviews_pkey`
  
  ```sql
  CREATE UNIQUE INDEX product_reviews_pkey ON public.product_reviews USING btree (id)
  ```
- `uq_product_reviews_user`
  
  ```sql
  CREATE UNIQUE INDEX uq_product_reviews_user ON public.product_reviews USING btree (product_id, user_id)
  ```

---

### `public.product_specs`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `product_id` | `uuid` | NO |  |  |
| 3 | `label` | `text` | NO |  |  |
| 4 | `value` | `text` | NO |  |  |
| 5 | `position` | `integer` | NO | 0 |  |
| 6 | `created_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `product_specs_created_at_not_null`, `product_specs_id_not_null`, `product_specs_label_not_null`, `product_specs_position_not_null`, `product_specs_product_id_not_null`, `product_specs_value_not_null`
- **FOREIGN KEY**: `product_specs_product_id_fkey`
- **PRIMARY KEY**: `product_specs_pkey`

**Indexes**

- `idx_product_specs_pos`
  
  ```sql
  CREATE INDEX idx_product_specs_pos ON public.product_specs USING btree (product_id, "position")
  ```
- `idx_product_specs_product`
  
  ```sql
  CREATE INDEX idx_product_specs_product ON public.product_specs USING btree (product_id)
  ```
- `product_specs_pkey`
  
  ```sql
  CREATE UNIQUE INDEX product_specs_pkey ON public.product_specs USING btree (id)
  ```

---

### `public.product_tags`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `product_id` | `uuid` | NO |  |  |
| 2 | `tag_id` | `integer` | NO |  |  |

**Constraints**

- **CHECK**: `product_tags_product_id_not_null`, `product_tags_tag_id_not_null`
- **FOREIGN KEY**: `product_tags_product_id_fkey`, `product_tags_tag_id_fkey`
- **PRIMARY KEY**: `product_tags_pkey`

**Indexes**

- `product_tags_pkey`
  
  ```sql
  CREATE UNIQUE INDEX product_tags_pkey ON public.product_tags USING btree (product_id, tag_id)
  ```

---

### `public.products`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `seller_id` | `uuid` | NO |  |  |
| 3 | `category_id` | `integer` | YES |  |  |
| 4 | `slug` | `text` | NO |  |  |
| 5 | `title` | `text` | NO |  |  |
| 6 | `description_md` | `text` | YES |  |  |
| 7 | `description_html` | `text` | YES |  |  |
| 8 | `price` | `integer` | NO |  |  |
| 9 | `unit` | `text` | NO |  |  |
| 10 | `stock` | `integer` | NO | 0 |  |
| 11 | `is_organic` | `boolean` | NO | false |  |
| 12 | `is_seasonal` | `boolean` | NO | false |  |
| 13 | `ship_method` | `text` | NO |  |  |
| 14 | `ship_days` | `text` | NO |  |  |
| 15 | `status` | `product_status` *(enum)* | NO | 'public'::product_status |  |
| 16 | `published_at` | `timestamp with time zone` | YES |  |  |
| 17 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 18 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 19 | `description_raw` | `text` | YES |  |  |
| 20 | `favorite_count` | `integer` | NO | 0 |  |

> **Enum `product_status` values**: `draft`, `private`, `public`

**Constraints**

- **CHECK**: `products_created_at_not_null`, `products_favorite_count_not_null`, `products_id_not_null`, `products_is_organic_not_null`, `products_is_seasonal_not_null`, `products_price_check`, `products_price_not_null`, `products_seller_id_not_null`, `products_ship_days_check`, `products_ship_days_not_null`, `products_ship_method_check`, `products_ship_method_not_null`, `products_slug_not_null`, `products_status_not_null`, `products_stock_check`, `products_stock_not_null`, `products_title_not_null`, `products_unit_not_null`, `products_updated_at_not_null`
- **FOREIGN KEY**: `products_category_id_fkey`, `products_seller_id_fkey`
- **PRIMARY KEY**: `products_pkey`
- **UNIQUE**: `products_slug_key`

**Indexes**

- `idx_products_category`
  
  ```sql
  CREATE INDEX idx_products_category ON public.products USING btree (category_id)
  ```
- `idx_products_price`
  
  ```sql
  CREATE INDEX idx_products_price ON public.products USING btree (price)
  ```
- `idx_products_published_at`
  
  ```sql
  CREATE INDEX idx_products_published_at ON public.products USING btree (published_at DESC)
  ```
- `idx_products_status`
  
  ```sql
  CREATE INDEX idx_products_status ON public.products USING btree (status)
  ```
- `idx_products_stock`
  
  ```sql
  CREATE INDEX idx_products_stock ON public.products USING btree (stock)
  ```
- `idx_products_trgm`
  
  ```sql
  CREATE INDEX idx_products_trgm ON public.products USING gin ((((COALESCE(title, ''::text) || ' '::text) || COALESCE(description_md, ''::text))) gin_trgm_ops)
  ```
- `products_pkey`
  
  ```sql
  CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id)
  ```
- `products_slug_key`
  
  ```sql
  CREATE UNIQUE INDEX products_slug_key ON public.products USING btree (slug)
  ```

---

### `public.r2_assets`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `key` | `text` | NO |  |  |
| 2 | `sha256` | `text` | YES |  |  |
| 3 | `mime` | `text` | YES |  |  |
| 4 | `bytes` | `integer` | YES |  |  |
| 5 | `width` | `integer` | YES |  |  |
| 6 | `height` | `integer` | YES |  |  |
| 7 | `seller_id` | `uuid` | YES |  |  |
| 8 | `created_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `r2_assets_created_at_not_null`, `r2_assets_key_not_null`
- **PRIMARY KEY**: `r2_assets_pkey`

**Indexes**

- `r2_assets_key_uidx`
  
  ```sql
  CREATE UNIQUE INDEX r2_assets_key_uidx ON public.r2_assets USING btree (key)
  ```
- `r2_assets_pkey`
  
  ```sql
  CREATE UNIQUE INDEX r2_assets_pkey ON public.r2_assets USING btree (key)
  ```
- `r2_assets_seller_idx`
  
  ```sql
  CREATE INDEX r2_assets_seller_idx ON public.r2_assets USING btree (seller_id)
  ```
- `r2_assets_sha256_idx`
  
  ```sql
  CREATE INDEX r2_assets_sha256_idx ON public.r2_assets USING btree (sha256)
  ```

---

### `public.seller_profile_values`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `seller_profile_id` | `uuid` | NO |  |  |
| 2 | `value_code` | `text` | NO |  |  |

**Constraints**

- **CHECK**: `seller_profile_values_seller_profile_id_not_null`, `seller_profile_values_value_code_not_null`
- **FOREIGN KEY**: `seller_profile_values_seller_profile_id_fkey`, `seller_profile_values_value_code_fkey`
- **PRIMARY KEY**: `seller_profile_values_pkey`

**Indexes**

- `seller_profile_values_pkey`
  
  ```sql
  CREATE UNIQUE INDEX seller_profile_values_pkey ON public.seller_profile_values USING btree (seller_profile_id, value_code)
  ```

---

### `public.seller_profiles`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `last_updated_by_user_id` | `uuid` | NO |  |  |
| 3 | `title` | `text` | YES |  |  |
| 4 | `body_html` | `text` | YES |  |  |
| 5 | `hero_image` | `text` | YES |  |  |
| 6 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 7 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 8 | `partner_id` | `uuid` | NO |  |  |
| 9 | `headline` | `text` | YES |  |  |
| 10 | `summary` | `text` | YES |  |  |
| 11 | `intro_html` | `text` | YES |  |  |
| 12 | `hero_image_url` | `text` | YES |  |  |
| 13 | `hashtags` | `ARRAY` | YES |  |  |

**Constraints**

- **CHECK**: `seller_profiles_created_at_not_null`, `seller_profiles_id_not_null`, `seller_profiles_last_updated_by_user_id_not_null`, `seller_profiles_partner_id_not_null`, `seller_profiles_updated_at_not_null`
- **FOREIGN KEY**: `fk_seller_profiles_partner`, `seller_profiles_user_id_fkey`
- **PRIMARY KEY**: `seller_profiles_pkey`
- **UNIQUE**: `ux_seller_profiles_partner`

**Indexes**

- `idx_seller_profiles_last_updated_by_user`
  
  ```sql
  CREATE INDEX idx_seller_profiles_last_updated_by_user ON public.seller_profiles USING btree (last_updated_by_user_id)
  ```
- `idx_seller_profiles_partner_id`
  
  ```sql
  CREATE INDEX idx_seller_profiles_partner_id ON public.seller_profiles USING btree (partner_id)
  ```
- `seller_profiles_pkey`
  
  ```sql
  CREATE UNIQUE INDEX seller_profiles_pkey ON public.seller_profiles USING btree (id)
  ```
- `ux_seller_profiles_partner`
  
  ```sql
  CREATE UNIQUE INDEX ux_seller_profiles_partner ON public.seller_profiles USING btree (partner_id)
  ```

---

### `public.seller_shipping_rules`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `seller_id` | `uuid` | NO |  |  |
| 3 | `scope` | `shipping_scope` *(enum)* | NO |  |  |
| 4 | `prefecture` | `text` | YES |  |  |
| 5 | `city` | `text` | YES |  |  |
| 6 | `shipping_fee` | `integer` | YES |  |  |
| 7 | `can_ship` | `boolean` | NO | true |  |
| 8 | `priority` | `integer` | NO | 0 |  |
| 9 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 10 | `updated_at` | `timestamp with time zone` | NO | now() |  |

> **Enum `shipping_scope` values**: `all`, `prefecture`, `city`

**Constraints**

- **CHECK**: `chk_shipping_scope_consistency`, `seller_shipping_rules_can_ship_not_null`, `seller_shipping_rules_created_at_not_null`, `seller_shipping_rules_id_not_null`, `seller_shipping_rules_priority_not_null`, `seller_shipping_rules_scope_not_null`, `seller_shipping_rules_seller_id_not_null`, `seller_shipping_rules_updated_at_not_null`
- **FOREIGN KEY**: `seller_shipping_rules_seller_id_fkey`
- **PRIMARY KEY**: `seller_shipping_rules_pkey`

**Indexes**

- `seller_shipping_rules_pkey`
  
  ```sql
  CREATE UNIQUE INDEX seller_shipping_rules_pkey ON public.seller_shipping_rules USING btree (id)
  ```
- `ux_seller_shipping_default`
  
  ```sql
  CREATE UNIQUE INDEX ux_seller_shipping_default ON public.seller_shipping_rules USING btree (seller_id) WHERE (scope = 'all'::shipping_scope)
  ```
- `ux_seller_shipping_region`
  
  ```sql
  CREATE UNIQUE INDEX ux_seller_shipping_region ON public.seller_shipping_rules USING btree (seller_id, scope, prefecture, city) WHERE (scope <> 'all'::shipping_scope)
  ```

---

### `public.seller_value_tags`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `code` | `text` | NO |  |  |
| 2 | `label_ja` | `text` | NO |  |  |
| 3 | `sort_order` | `integer` | NO | 100 |  |

**Constraints**

- **CHECK**: `seller_value_tags_code_not_null`, `seller_value_tags_label_ja_not_null`, `seller_value_tags_sort_order_not_null`
- **PRIMARY KEY**: `seller_value_tags_pkey`

**Indexes**

- `seller_value_tags_pkey`
  
  ```sql
  CREATE UNIQUE INDEX seller_value_tags_pkey ON public.seller_value_tags USING btree (code)
  ```

---

### `public.shipments`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `integer` | NO | nextval('shipments_id_seq'::regclass) |  |
| 2 | `order_id` | `uuid` | NO |  |  |
| 3 | `status` | `shipment_status` *(enum)* | NO | 'pending'::shipment_status |  |
| 4 | `tracking_number` | `text` | YES |  |  |
| 5 | `carrier` | `text` | YES |  |  |
| 6 | `shipped_at` | `timestamp with time zone` | YES |  |  |
| 7 | `delivered_at` | `timestamp with time zone` | YES |  |  |
| 8 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 9 | `updated_at` | `timestamp with time zone` | NO | now() |  |

> **Enum `shipment_status` values**: `pending`, `preparing`, `shipped`, `delivered`, `cancelled`, `returned`, `lost`, `canceled`, `in_transit`

**Constraints**

- **CHECK**: `shipments_created_at_not_null`, `shipments_id_not_null`, `shipments_order_id_not_null`, `shipments_status_not_null`, `shipments_updated_at_not_null`
- **FOREIGN KEY**: `shipments_order_id_fkey`
- **PRIMARY KEY**: `shipments_pkey`
- **UNIQUE**: `shipments_tracking_number_key`

**Indexes**

- `idx_shipments_created`
  
  ```sql
  CREATE INDEX idx_shipments_created ON public.shipments USING btree (created_at DESC)
  ```
- `idx_shipments_order`
  
  ```sql
  CREATE INDEX idx_shipments_order ON public.shipments USING btree (order_id)
  ```
- `idx_shipments_order_updated`
  
  ```sql
  CREATE INDEX idx_shipments_order_updated ON public.shipments USING btree (order_id, updated_at DESC)
  ```
- `idx_shipments_status`
  
  ```sql
  CREATE INDEX idx_shipments_status ON public.shipments USING btree (status)
  ```
- `ix_shipments_order`
  
  ```sql
  CREATE INDEX ix_shipments_order ON public.shipments USING btree (order_id)
  ```
- `ix_shipments_status`
  
  ```sql
  CREATE INDEX ix_shipments_status ON public.shipments USING btree (status)
  ```
- `shipments_pkey`
  
  ```sql
  CREATE UNIQUE INDEX shipments_pkey ON public.shipments USING btree (id)
  ```
- `shipments_tracking_number_key`
  
  ```sql
  CREATE UNIQUE INDEX shipments_tracking_number_key ON public.shipments USING btree (tracking_number)
  ```

---

### `public.tags`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `integer` | NO | nextval('tags_id_seq'::regclass) |  |
| 2 | `slug` | `text` | NO |  |  |
| 3 | `name` | `text` | NO |  |  |
| 4 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 5 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `tags_created_at_not_null`, `tags_id_not_null`, `tags_name_not_null`, `tags_slug_not_null`, `tags_updated_at_not_null`
- **PRIMARY KEY**: `tags_pkey`
- **UNIQUE**: `tags_name_key`, `tags_slug_key`

**Indexes**

- `idx_tags_name`
  
  ```sql
  CREATE INDEX idx_tags_name ON public.tags USING btree (name)
  ```
- `tags_name_key`
  
  ```sql
  CREATE UNIQUE INDEX tags_name_key ON public.tags USING btree (name)
  ```
- `tags_pkey`
  
  ```sql
  CREATE UNIQUE INDEX tags_pkey ON public.tags USING btree (id)
  ```
- `tags_slug_key`
  
  ```sql
  CREATE UNIQUE INDEX tags_slug_key ON public.tags USING btree (slug)
  ```

---

### `public.trusted_devices`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `user_id` | `uuid` | YES |  |  |
| 3 | `device_token` | `varchar(255)` | NO |  |  |
| 4 | `device_name` | `text` | YES |  |  |
| 5 | `ip_address` | `inet` | YES |  |  |
| 6 | `last_used_at` | `timestamp without time zone` | YES |  |  |
| 7 | `expires_at` | `timestamp without time zone` | NO |  |  |
| 8 | `created_at` | `timestamp without time zone` | YES | CURRENT_TIMESTAMP |  |

**Constraints**

- **CHECK**: `trusted_devices_device_token_not_null`, `trusted_devices_expires_at_not_null`, `trusted_devices_id_not_null`
- **FOREIGN KEY**: `trusted_devices_user_id_fkey`
- **PRIMARY KEY**: `trusted_devices_pkey`
- **UNIQUE**: `trusted_devices_device_token_key`

**Indexes**

- `idx_trusted_devices_expires`
  
  ```sql
  CREATE INDEX idx_trusted_devices_expires ON public.trusted_devices USING btree (expires_at)
  ```
- `idx_trusted_devices_token`
  
  ```sql
  CREATE INDEX idx_trusted_devices_token ON public.trusted_devices USING btree (device_token)
  ```
- `idx_trusted_devices_user_id`
  
  ```sql
  CREATE INDEX idx_trusted_devices_user_id ON public.trusted_devices USING btree (user_id)
  ```
- `trusted_devices_device_token_key`
  
  ```sql
  CREATE UNIQUE INDEX trusted_devices_device_token_key ON public.trusted_devices USING btree (device_token)
  ```
- `trusted_devices_pkey`
  
  ```sql
  CREATE UNIQUE INDEX trusted_devices_pkey ON public.trusted_devices USING btree (id)
  ```

---

### `public.user_allowed_payment_methods`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `user_id` | `uuid` | NO |  |  |
| 2 | `method` | `payment_method` *(enum)* | NO |  |  |
| 3 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 4 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 5 | `synced_from_partner` | `boolean` | NO | true |  |

> **Enum `payment_method` values**: `card`, `bank_transfer`, `convenience_store`, `cod`, `bank`, `paypay`

**Constraints**

- **CHECK**: `user_allowed_payment_methods_created_at_not_null`, `user_allowed_payment_methods_method_not_null`, `user_allowed_payment_methods_synced_from_partner_not_null`, `user_allowed_payment_methods_updated_at_not_null`, `user_allowed_payment_methods_user_id_not_null`
- **FOREIGN KEY**: `user_allowed_payment_methods_user_id_fkey`
- **PRIMARY KEY**: `user_allowed_payment_methods_pkey`

**Indexes**

- `idx_uapm_user`
  
  ```sql
  CREATE INDEX idx_uapm_user ON public.user_allowed_payment_methods USING btree (user_id)
  ```
- `user_allowed_payment_methods_pkey`
  
  ```sql
  CREATE UNIQUE INDEX user_allowed_payment_methods_pkey ON public.user_allowed_payment_methods USING btree (user_id, method)
  ```

---

### `public.user_recent_products`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `user_id` | `uuid` | NO |  |  |
| 2 | `product_id` | `uuid` | NO |  |  |
| 3 | `viewed_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `user_recent_products_product_id_not_null`, `user_recent_products_user_id_not_null`, `user_recent_products_viewed_at_not_null`
- **FOREIGN KEY**: `user_recent_products_product_id_fkey`, `user_recent_products_user_id_fkey`
- **PRIMARY KEY**: `user_recent_products_pkey`

**Indexes**

- `idx_user_recent_products_user_time`
  
  ```sql
  CREATE INDEX idx_user_recent_products_user_time ON public.user_recent_products USING btree (user_id, viewed_at DESC)
  ```
- `user_recent_products_pkey`
  
  ```sql
  CREATE UNIQUE INDEX user_recent_products_pkey ON public.user_recent_products USING btree (user_id, product_id)
  ```

---

### `public.users`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `name` | `text` | NO |  |  |
| 3 | `email` | `text` | NO |  |  |
| 4 | `password_hash` | `text` | NO |  |  |
| 5 | `roles` | `ARRAY` | NO | ARRAY['buyer'::text] |  |
| 6 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 7 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 8 | `partner_id` | `uuid` | YES |  | 所属取引先への外部キー（partners.id） |
| 9 | `postal_code` | `text` | YES |  | 郵便番号（ハイフン付き可） |
| 10 | `prefecture` | `text` | YES |  | 都道府県 |
| 11 | `city` | `text` | YES |  | 市区町村 |
| 12 | `address1` | `text` | YES |  | 番地・丁目まで |
| 13 | `address2` | `text` | YES |  | 建物名・部屋番号など任意 |
| 14 | `postal_norm` | `text` | YES |  | 郵便番号（数字のみ7桁など） |
| 15 | `phone` | `text` | YES |  | 電話番号（ハイフン付き可） |
| 16 | `phone_norm` | `text` | YES |  | 電話番号（数字のみ） |
| 17 | `seller_intro_summary` | `text` | YES |  | 商品ページなどに表示する出品者紹介の概要テキスト |
| 18 | `account_type` | `text` | NO | 'individual'::text |  |
| 19 | `email_verified_at` | `timestamp with time zone` | YES |  |  |
| 20 | `email_verify_token` | `text` | YES |  |  |
| 21 | `two_factor_secret` | `varchar(255)` | YES |  |  |
| 22 | `two_factor_enabled` | `boolean` | YES | false |  |
| 23 | `two_factor_backup_codes` | `ARRAY` | YES |  |  |
| 24 | `two_factor_enabled_at` | `timestamp without time zone` | YES |  |  |
| 25 | `account_locked_at` | `timestamp without time zone` | YES |  |  |
| 26 | `account_locked_reason` | `text` | YES |  |  |
| 27 | `failed_login_attempts` | `integer` | YES | 0 |  |
| 28 | `last_failed_login_at` | `timestamp without time zone` | YES |  |  |
| 29 | `webauthn_enabled` | `boolean` | YES | false |  |
| 30 | `webauthn_enabled_at` | `timestamp without time zone` | YES |  |  |

**Constraints**

- **CHECK**: `users_account_type_check`, `users_account_type_not_null`, `users_created_at_not_null`, `users_email_not_null`, `users_id_not_null`, `users_name_not_null`, `users_password_hash_not_null`, `users_roles_not_null`, `users_updated_at_not_null`
- **PRIMARY KEY**: `users_pkey`
- **UNIQUE**: `users_email_key`

**Indexes**

- `idx_users_account_locked`
  
  ```sql
  CREATE INDEX idx_users_account_locked ON public.users USING btree (account_locked_at) WHERE (account_locked_at IS NOT NULL)
  ```
- `idx_users_city_trgm`
  
  ```sql
  CREATE INDEX idx_users_city_trgm ON public.users USING gin (city gin_trgm_ops)
  ```
- `idx_users_partner`
  
  ```sql
  CREATE INDEX idx_users_partner ON public.users USING btree (partner_id)
  ```
- `idx_users_postal_norm`
  
  ```sql
  CREATE INDEX idx_users_postal_norm ON public.users USING btree (postal_norm)
  ```
- `idx_users_prefecture_city`
  
  ```sql
  CREATE INDEX idx_users_prefecture_city ON public.users USING btree (prefecture, city)
  ```
- `idx_users_two_factor_enabled`
  
  ```sql
  CREATE INDEX idx_users_two_factor_enabled ON public.users USING btree (two_factor_enabled)
  ```
- `idx_users_webauthn_enabled`
  
  ```sql
  CREATE INDEX idx_users_webauthn_enabled ON public.users USING btree (webauthn_enabled) WHERE (webauthn_enabled = true)
  ```
- `users_email_key`
  
  ```sql
  CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)
  ```
- `users_pkey`
  
  ```sql
  CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)
  ```

---

### `public.webauthn_challenges`

WebAuthn認証用チャレンジ一時保存

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `user_id` | `uuid` | NO |  |  |
| 3 | `challenge` | `text` | NO |  | 認証時のチャレンジ（ランダム文字列） |
| 4 | `type` | `varchar(20)` | NO |  | チャレンジの種類（registration/authentication） |
| 5 | `used` | `boolean` | YES | false |  |
| 6 | `expires_at` | `timestamp without time zone` | NO |  |  |
| 7 | `created_at` | `timestamp without time zone` | YES | CURRENT_TIMESTAMP |  |

**Constraints**

- **CHECK**: `webauthn_challenges_challenge_not_null`, `webauthn_challenges_expires_at_not_null`, `webauthn_challenges_id_not_null`, `webauthn_challenges_type_not_null`, `webauthn_challenges_user_id_not_null`
- **FOREIGN KEY**: `webauthn_challenges_user_id_fkey`
- **PRIMARY KEY**: `webauthn_challenges_pkey`

**Indexes**

- `idx_webauthn_challenges_expires`
  
  ```sql
  CREATE INDEX idx_webauthn_challenges_expires ON public.webauthn_challenges USING btree (expires_at)
  ```
- `idx_webauthn_challenges_user`
  
  ```sql
  CREATE INDEX idx_webauthn_challenges_user ON public.webauthn_challenges USING btree (user_id)
  ```
- `webauthn_challenges_pkey`
  
  ```sql
  CREATE UNIQUE INDEX webauthn_challenges_pkey ON public.webauthn_challenges USING btree (id)
  ```

---

### `public.webauthn_credentials`

WebAuthn認証器（生体認証・セキュリティキー）情報

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `user_id` | `uuid` | NO |  |  |
| 3 | `credential_id` | `text` | NO |  | 認証器の一意識別子 |
| 4 | `public_key` | `text` | NO |  | 認証器の公開鍵（署名検証用） |
| 5 | `counter` | `bigint` | YES | 0 | リプレイ攻撃防止用カウンター |
| 6 | `aaguid` | `text` | YES |  |  |
| 7 | `credential_type` | `varchar(50)` | YES | 'public-key'::character varying |  |
| 8 | `transports` | `ARRAY` | YES |  |  |
| 9 | `device_name` | `text` | NO |  | ユーザーが設定したデバイス名 |
| 10 | `device_type` | `varchar(50)` | YES |  |  |
| 11 | `last_used_at` | `timestamp without time zone` | YES |  |  |
| 12 | `created_at` | `timestamp without time zone` | YES | CURRENT_TIMESTAMP |  |
| 13 | `updated_at` | `timestamp without time zone` | YES | CURRENT_TIMESTAMP |  |

**Constraints**

- **CHECK**: `webauthn_credentials_credential_id_not_null`, `webauthn_credentials_device_name_not_null`, `webauthn_credentials_id_not_null`, `webauthn_credentials_public_key_not_null`, `webauthn_credentials_user_id_not_null`
- **FOREIGN KEY**: `webauthn_credentials_user_id_fkey`
- **PRIMARY KEY**: `webauthn_credentials_pkey`
- **UNIQUE**: `webauthn_credentials_credential_id_key`

**Indexes**

- `idx_webauthn_credential_id`
  
  ```sql
  CREATE INDEX idx_webauthn_credential_id ON public.webauthn_credentials USING btree (credential_id)
  ```
- `idx_webauthn_last_used`
  
  ```sql
  CREATE INDEX idx_webauthn_last_used ON public.webauthn_credentials USING btree (last_used_at)
  ```
- `idx_webauthn_user_id`
  
  ```sql
  CREATE INDEX idx_webauthn_user_id ON public.webauthn_credentials USING btree (user_id)
  ```
- `webauthn_credentials_credential_id_key`
  
  ```sql
  CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON public.webauthn_credentials USING btree (credential_id)
  ```
- `webauthn_credentials_pkey`
  
  ```sql
  CREATE UNIQUE INDEX webauthn_credentials_pkey ON public.webauthn_credentials USING btree (id)
  ```

---

## ENUM Types (global)

- `public.contact_category_enum`: `listing_registration`, `ordering_trading`, `site_bug`, `site_request`, `press_partnership`, `other`
- `public.order_address_type`: `shipping`, `billing`
- `public.order_status`: `pending`, `paid`, `shipped`, `cancelled`, `confirmed`, `processing`, `delivered`, `canceled`, `refunded`, `fulfilled`
- `public.partner_status`: `active`, `inactive`, `prospect`, `suspended`
- `public.partner_type`: `restaurant`, `retailer`, `wholesale`, `corporate`, `individual`, `other`
- `public.payment_method`: `card`, `bank_transfer`, `convenience_store`, `cod`, `bank`, `paypay`
- `public.payment_status`: `pending`, `completed`, `failed`, `authorized`, `paid`, `canceled`, `refunded`, `unpaid`, `cancelled`
- `public.product_status`: `draft`, `private`, `public`
- `public.review_status`: `published`, `pending`, `hidden`
- `public.ship_method`: `pickup`, `delivery`
- `public.shipment_status`: `pending`, `preparing`, `shipped`, `delivered`, `cancelled`, `returned`, `lost`, `canceled`, `in_transit`
- `public.shipping_scope`: `all`, `prefecture`, `city`

