レスポンス本文
{
  "id": "cs_test_b1hFlBoymhWrTfOhRLSdIQpOZa1RgLZYHLN9uduKjPRo00dHdj9RLUBpf1",
  "object": "checkout.session",
  "adaptive_pricing": {
    "enabled": true
  },
  "after_expiration": null,
  "allow_promotion_codes": null,
  "amount_subtotal": 1180,
  "amount_total": 1180,
  "automatic_tax": {
    "enabled": false,
    "liability": null,
    "provider": null,
    "status": null
  },
  "billing_address_collection": null,
  "branding_settings": {
    "background_color": "#ffffff",
    "border_style": "rounded",
    "button_color": "#0074d4",
    "display_name": "野菜EC販売 サンドボックス",
    "font_family": "default",
    "icon": null,
    "logo": null
  },
  "cancel_url": "http://localhost:3000/checkout?seller=050aef63-7b00-47bd-b156-5d4f5519ab38",
  "client_reference_id": null,
  "client_secret": null,
  "collected_information": null,
  "consent": null,
  "consent_collection": null,
  "created": 1765721376,
  "currency": "jpy",
  "currency_conversion": null,
  "custom_fields": [],
  "custom_text": {
    "after_submit": null,
    "shipping_address": null,
    "submit": null,
    "terms_of_service_acceptance": null
  },
  "customer": null,
  "customer_account": null,
  "customer_creation": "if_required",
  "customer_details": null,
  "customer_email": null,
  "discounts": [],
  "expires_at": 1765807776,
  "invoice": null,
  "invoice_creation": {
    "enabled": false,
    "invoice_data": {
      "account_tax_ids": null,
      "custom_fields": null,
      "description": null,
      "footer": null,
      "issuer": null,
      "metadata": {},
      "rendering_options": null
    }
  },
  "livemode": false,
  "locale": null,
  "metadata": {
    "order_number": "ORD-20251214-S5JLBG",
    "user_id": "7a2899c9-d4aa-400c-af10-602023cefe38",
    "order_id": "8b0ef53d-5f6a-43ec-9033-56fda4ad103a",
    "seller_id": "050aef63-7b00-47bd-b156-5d4f5519ab38"
  },
  "mode": "payment",
  "origin_context": null,
  "payment_intent": null,
  "payment_link": null,
  "payment_method_collection": "if_required",
  "payment_method_configuration_details": null,
  "payment_method_options": {
    "card": {
      "request_three_d_secure": "automatic"
    }
  },
  "payment_method_types": [
    "card"
  ],
  "payment_status": "unpaid",
  "permissions": null,
  "phone_number_collection": {
    "enabled": false
  },
  "recovered_from": null,
  "saved_payment_method_options": null,
  "setup_intent": null,
  "shipping_address_collection": null,
  "shipping_cost": null,
  "shipping_details": null,
  "shipping_options": [],
  "status": "open",
  "submit_type": null,
  "subscription": null,
  "success_url": "http://localhost:3000/checkout/complete?no=ORD-20251214-S5JLBG",
  "total_details": {
    "amount_discount": 0,
    "amount_shipping": 0,
    "amount_tax": 0
  },
  "ui_mode": "hosted",
  "url": "https://checkout.stripe.com/c/pay/cs_test_b1hFlBoymhWrTfOhRLSdIQpOZa1RgLZYHLN9uduKjPRo00dHdj9RLUBpf1#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdkdWxOYHwnPyd1blpxYHZxWjA0VmBEPFRNdGBqQDJLfDZAMFVERG9HY2dfXUtTTmpCMW9gQXYwaHBiSklHXXZLdURqdTBQYmQxVVxzUVFXR2dWbmJsd0pqQ0hsTHFhMlNyMkdtXUhqVEZQNTVxfHRLVkNIaCcpJ2N3amhWYHdzYHcnP3F3cGApJ2dkZm5id2pwa2FGamlqdyc%2FJyZjY2NjY2MnKSdpZHxqcHFRfHVgJz8naHBpcWxabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYHgl",
  "wallet_options": null
}

POST本文のリクエスト
{
  "cancel_url": "http://localhost:3000/checkout?seller=050aef63-7b00-47bd-b156-5d4f5519ab38",
  "line_items": {
    "0": {
      "price_data": {
        "currency": "jpy",
        "product_data": {
          "name": "えのき"
        },
        "unit_amount": "180"
      },
      "quantity": "1"
    },
    "1": {
      "price_data": {
        "currency": "jpy",
        "product_data": {
          "name": "送料"
        },
        "unit_amount": "1000"
      },
      "quantity": "1"
    }
  },
  "metadata": {
    "order_id": "8b0ef53d-5f6a-43ec-9033-56fda4ad103a",
    "order_number": "ORD-20251214-S5JLBG",
    "seller_id": "050aef63-7b00-47bd-b156-5d4f5519ab38",
    "user_id": "7a2899c9-d4aa-400c-af10-602023cefe38"
  },
  "mode": "payment",
  "payment_method_types": {
    "0": "card"
  },
  "success_url": "http://localhost:3000/checkout/complete?no=ORD-20251214-S5JLBG"
}