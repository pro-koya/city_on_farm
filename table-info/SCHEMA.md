# Database Schema (generated)

> Generated at: 2025-10-12T20:44:43.301Z

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

- **CHECK**: `2200_16629_10_not_null`, `2200_16629_11_not_null`, `2200_16629_12_not_null`, `2200_16629_14_not_null`, `2200_16629_15_not_null`, `2200_16629_17_not_null`, `2200_16629_18_not_null`, `2200_16629_1_not_null`, `2200_16629_2_not_null`, `2200_16629_5_not_null`, `2200_16629_6_not_null`, `2200_16629_9_not_null`, `addresses_address_type_check`, `addresses_check`, `addresses_scope_check`
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

**Constraints**

- **CHECK**: `2200_16643_1_not_null`, `2200_16643_2_not_null`, `2200_16643_3_not_null`, `2200_16643_4_not_null`, `2200_16643_5_not_null`, `2200_16643_6_not_null`, `2200_16643_7_not_null`, `cart_items_quantity_check`
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

- **CHECK**: `2200_16651_1_not_null`, `2200_16651_2_not_null`, `2200_16651_4_not_null`, `2200_16651_5_not_null`
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

- **CHECK**: `2200_16659_1_not_null`, `2200_16659_2_not_null`, `2200_16659_3_not_null`, `2200_16659_4_not_null`, `2200_16659_5_not_null`, `2200_16659_6_not_null`
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

**Constraints**

- **CHECK**: `2200_16668_10_not_null`, `2200_16668_1_not_null`, `2200_16668_2_not_null`, `2200_16668_3_not_null`, `2200_16668_4_not_null`, `2200_16668_5_not_null`, `2200_16668_6_not_null`, `2200_16668_9_not_null`, `contacts_status_check`, `contacts_type_check`
- **FOREIGN KEY**: `contacts_handled_by_fkey`
- **PRIMARY KEY**: `contacts_pkey`

**Indexes**

- `contacts_pkey`
  
  ```sql
  CREATE UNIQUE INDEX contacts_pkey ON public.contacts USING btree (id)
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
- `idx_contacts_type`
  
  ```sql
  CREATE INDEX idx_contacts_type ON public.contacts USING btree (type)
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

- **CHECK**: `2200_16679_14_not_null`, `2200_16679_16_not_null`, `2200_16679_17_not_null`, `2200_16679_1_not_null`, `2200_16679_2_not_null`, `2200_16679_5_not_null`, `2200_16679_6_not_null`, `2200_16679_7_not_null`, `2200_16679_9_not_null`, `coupons_applies_to_check`, `coupons_check`, `coupons_discount_type_check`, `coupons_discount_value_check`, `coupons_max_discount_check`, `coupons_min_subtotal_check`
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

- **CHECK**: `2200_16696_1_not_null`, `2200_16696_2_not_null`, `2200_16696_3_not_null`, `2200_16696_4_not_null`, `2200_16696_5_not_null`, `2200_16696_6_not_null`, `2200_16696_7_not_null`, `2200_16696_8_not_null`
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

- **CHECK**: `2200_16705_11_not_null`, `2200_16705_12_not_null`, `2200_16705_13_not_null`, `2200_16705_1_not_null`, `2200_16705_2_not_null`, `2200_16705_3_not_null`, `2200_16705_4_not_null`, `2200_16705_5_not_null`, `2200_16705_6_not_null`, `2200_16705_7_not_null`, `2200_16705_8_not_null`, `2200_16705_9_not_null`
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

- **CHECK**: `2200_16714_1_not_null`, `2200_16714_2_not_null`, `2200_16714_3_not_null`, `2200_16714_4_not_null`, `2200_16714_5_not_null`, `order_items_price_check`, `order_items_quantity_check`
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

> **Enum `order_status` values**: `pending`, `paid`, `shipped`, `cancelled`, `confirmed`, `processing`, `delivered`, `canceled`, `refunded`, `fulfilled`
> **Enum `payment_method` values**: `card`, `bank_transfer`, `convenience_store`, `cod`, `bank`, `paypay`
> **Enum `payment_status` values**: `pending`, `completed`, `failed`, `authorized`, `paid`, `canceled`, `refunded`, `unpaid`, `cancelled`
> **Enum `ship_method` values**: `normal`, `cool`

**Constraints**

- **CHECK**: `2200_16722_15_not_null`, `2200_16722_1_not_null`, `2200_16722_20_not_null`, `2200_16722_21_not_null`, `2200_16722_23_not_null`, `2200_16722_24_not_null`, `2200_16722_2_not_null`, `2200_16722_3_not_null`, `2200_16722_4_not_null`, `2200_16722_5_not_null`, `2200_16722_6_not_null`, `2200_16722_7_not_null`, `2200_16722_8_not_null`, `2200_16722_9_not_null`, `orders_amounts_check`
- **FOREIGN KEY**: `orders_buyer_id_fkey`
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
- `idx_orders_order_number`
  
  ```sql
  CREATE INDEX idx_orders_order_number ON public.orders USING btree (order_number)
  ```
- `idx_orders_payment_status`
  
  ```sql
  CREATE INDEX idx_orders_payment_status ON public.orders USING btree (payment_status)
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

- **CHECK**: `2200_16747_1_not_null`, `2200_16747_2_not_null`, `2200_16747_3_not_null`, `2200_16747_4_not_null`, `2200_16747_5_not_null`, `2200_16747_7_not_null`, `2200_16747_8_not_null`, `payments_amount_check`
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

- **CHECK**: `2200_16757_1_not_null`, `2200_16757_2_not_null`, `2200_16757_3_not_null`, `2200_16757_5_not_null`, `2200_16757_6_not_null`
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

- **CHECK**: `2200_16765_1_not_null`, `2200_16765_2_not_null`, `2200_16765_3_not_null`, `2200_16765_4_not_null`, `2200_16765_5_not_null`, `2200_16765_6_not_null`
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

- **CHECK**: `2200_16773_1_not_null`, `2200_16773_2_not_null`
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

> **Enum `product_status` values**: `draft`, `private`, `public`

**Constraints**

- **CHECK**: `2200_16776_10_not_null`, `2200_16776_11_not_null`, `2200_16776_12_not_null`, `2200_16776_13_not_null`, `2200_16776_14_not_null`, `2200_16776_15_not_null`, `2200_16776_17_not_null`, `2200_16776_18_not_null`, `2200_16776_1_not_null`, `2200_16776_2_not_null`, `2200_16776_4_not_null`, `2200_16776_5_not_null`, `2200_16776_8_not_null`, `2200_16776_9_not_null`, `products_price_check`, `products_ship_days_check`, `products_ship_method_check`, `products_stock_check`
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

- **CHECK**: `2200_17067_1_not_null`, `2200_17067_8_not_null`
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

- **CHECK**: `2200_16792_1_not_null`, `2200_16792_2_not_null`, `2200_16792_3_not_null`, `2200_16792_8_not_null`, `2200_16792_9_not_null`
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

- **CHECK**: `2200_16801_1_not_null`, `2200_16801_2_not_null`, `2200_16801_3_not_null`, `2200_16801_4_not_null`, `2200_16801_5_not_null`
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

### `public.user_recent_products`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `user_id` | `uuid` | NO |  |  |
| 2 | `product_id` | `uuid` | NO |  |  |
| 3 | `viewed_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `2200_16809_1_not_null`, `2200_16809_2_not_null`, `2200_16809_3_not_null`
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

**Constraints**

- **CHECK**: `2200_16813_1_not_null`, `2200_16813_2_not_null`, `2200_16813_3_not_null`, `2200_16813_4_not_null`, `2200_16813_5_not_null`, `2200_16813_6_not_null`, `2200_16813_7_not_null`
- **PRIMARY KEY**: `users_pkey`
- **UNIQUE**: `users_email_key`

**Indexes**

- `users_email_key`
  
  ```sql
  CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)
  ```
- `users_pkey`
  
  ```sql
  CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)
  ```

---

## ENUM Types (global)

- `public.order_address_type`: `shipping`, `billing`
- `public.order_status`: `pending`, `paid`, `shipped`, `cancelled`, `confirmed`, `processing`, `delivered`, `canceled`, `refunded`, `fulfilled`
- `public.payment_method`: `card`, `bank_transfer`, `convenience_store`, `cod`, `bank`, `paypay`
- `public.payment_status`: `pending`, `completed`, `failed`, `authorized`, `paid`, `canceled`, `refunded`, `unpaid`, `cancelled`
- `public.product_status`: `draft`, `private`, `public`
- `public.ship_method`: `normal`, `cool`
- `public.shipment_status`: `pending`, `preparing`, `shipped`, `delivered`, `cancelled`, `returned`, `lost`, `canceled`, `in_transit`

