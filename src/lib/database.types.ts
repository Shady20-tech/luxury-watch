
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "addresses": {
                  Row: {
                    "city": string,"country_code": string,"created_at": string,"id": string,"is_default": boolean,"label": string | null,"line1": string,"line2": string | null,"phone": string | null,"postal_code": string | null,"recipient_name": string,"region": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "city": string,"country_code": string,"created_at"?: string,"id"?: string,"is_default"?: boolean,"label"?: string | null,"line1": string,"line2"?: string | null,"phone"?: string | null,"postal_code"?: string | null,"recipient_name": string,"region"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "city"?: string,"country_code"?: string,"created_at"?: string,"id"?: string,"is_default"?: boolean,"label"?: string | null,"line1"?: string,"line2"?: string | null,"phone"?: string | null,"postal_code"?: string | null,"recipient_name"?: string,"region"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"admin_audit_logs": {
                  Row: {
                    "action": string,"actor_email": string | null,"actor_id": string | null,"changes": Json | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": string,"ip_hash": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_email"?: string | null,"actor_id"?: string | null,"changes"?: Json | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: string,"ip_hash"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_email"?: string | null,"actor_id"?: string | null,"changes"?: Json | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"ip_hash"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"announcements": {
                  Row: {
                    "created_at": string,"ends_at": string | null,"id": string,"is_active": boolean,"link_label": string | null,"link_url": string | null,"message": string,"sort_order": number,"starts_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_at"?: string | null,"id"?: string,"is_active"?: boolean,"link_label"?: string | null,"link_url"?: string | null,"message": string,"sort_order"?: number,"starts_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"ends_at"?: string | null,"id"?: string,"is_active"?: boolean,"link_label"?: string | null,"link_url"?: string | null,"message"?: string,"sort_order"?: number,"starts_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"appointments": {
                  Row: {
                    "assigned_to": string | null,"created_at": string,"customer_note": string | null,"email": string,"id": string,"location": string | null,"name": string,"phone": string | null,"purpose": string | null,"requested_at": string,"scheduled_at": string | null,"staff_note": string | null,"status": Database["public"]['Enums']["appointment_status"],"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"created_at"?: string,"customer_note"?: string | null,"email": string,"id"?: string,"location"?: string | null,"name": string,"phone"?: string | null,"purpose"?: string | null,"requested_at": string,"scheduled_at"?: string | null,"staff_note"?: string | null,"status"?: Database["public"]['Enums']["appointment_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "assigned_to"?: string | null,"created_at"?: string,"customer_note"?: string | null,"email"?: string,"id"?: string,"location"?: string | null,"name"?: string,"phone"?: string | null,"purpose"?: string | null,"requested_at"?: string,"scheduled_at"?: string | null,"staff_note"?: string | null,"status"?: Database["public"]['Enums']["appointment_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"brands": {
                  Row: {
                    "country": string | null,"created_at": string,"description": string | null,"founded_year": number | null,"hero_image_url": string | null,"id": string,"is_active": boolean,"logo_url": string | null,"name": string,"seo_description": string | null,"seo_title": string | null,"slug": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "country"?: string | null,"created_at"?: string,"description"?: string | null,"founded_year"?: number | null,"hero_image_url"?: string | null,"id"?: string,"is_active"?: boolean,"logo_url"?: string | null,"name": string,"seo_description"?: string | null,"seo_title"?: string | null,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "country"?: string | null,"created_at"?: string,"description"?: string | null,"founded_year"?: number | null,"hero_image_url"?: string | null,"id"?: string,"is_active"?: boolean,"logo_url"?: string | null,"name"?: string,"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cart_items": {
                  Row: {
                    "cart_id": string,"created_at": string,"id": string,"product_id": string,"quantity": number,"unit_price_cents": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cart_id": string,"created_at"?: string,"id"?: string,"product_id": string,"quantity"?: number,"unit_price_cents"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "cart_id"?: string,"created_at"?: string,"id"?: string,"product_id"?: string,"quantity"?: number,"unit_price_cents"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cart_items_cart_id_fkey"
      columns: ["cart_id"]
isOneToOne: false
      referencedRelation: "carts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cart_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"carts": {
                  Row: {
                    "created_at": string,"currency": string,"discount_code": string | null,"id": string,"session_token": string | null,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string,"discount_code"?: string | null,"id"?: string,"session_token"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"discount_code"?: string | null,"id"?: string,"session_token"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [

                  ]
                },"collection_products": {
                  Row: {
                    "collection_id": string,"created_at": string,"product_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "collection_id": string,"created_at"?: string,"product_id": string,"sort_order"?: number
                  }
                  Update: {
                    "collection_id"?: string,"created_at"?: string,"product_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "collection_products_collection_id_fkey"
      columns: ["collection_id"]
isOneToOne: false
      referencedRelation: "collections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collection_products_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"collections": {
                  Row: {
                    "created_at": string,"description": string | null,"hero_image_url": string | null,"id": string,"is_active": boolean,"kind": Database["public"]['Enums']["collection_kind"],"seo_description": string | null,"seo_title": string | null,"slug": string,"sort_order": number,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"hero_image_url"?: string | null,"id"?: string,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["collection_kind"],"seo_description"?: string | null,"seo_title"?: string | null,"slug": string,"sort_order"?: number,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"hero_image_url"?: string | null,"id"?: string,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["collection_kind"],"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string,"sort_order"?: number,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"contact_submissions": {
                  Row: {
                    "created_at": string,"email": string,"handled_at": string | null,"handled_by": string | null,"id": string,"ip_hash": string | null,"is_handled": boolean,"message": string,"name": string,"phone": string | null,"subject": string | null,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"ip_hash"?: string | null,"is_handled"?: boolean,"message": string,"name": string,"phone"?: string | null,"subject"?: string | null,"user_agent"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"ip_hash"?: string | null,"is_handled"?: boolean,"message"?: string,"name"?: string,"phone"?: string | null,"subject"?: string | null,"user_agent"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"discount_codes": {
                  Row: {
                    "code": string,"created_at": string,"description": string | null,"ends_at": string | null,"id": string,"is_enabled": boolean,"kind": Database["public"]['Enums']["discount_kind"],"label": string,"max_discount_cents": number | null,"min_subtotal_cents": number,"starts_at": string | null,"times_redeemed": number,"updated_at": string,"usage_limit": number | null,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"description"?: string | null,"ends_at"?: string | null,"id"?: string,"is_enabled"?: boolean,"kind"?: Database["public"]['Enums']["discount_kind"],"label": string,"max_discount_cents"?: number | null,"min_subtotal_cents"?: number,"starts_at"?: string | null,"times_redeemed"?: number,"updated_at"?: string,"usage_limit"?: number | null,"value"?: number
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string | null,"ends_at"?: string | null,"id"?: string,"is_enabled"?: boolean,"kind"?: Database["public"]['Enums']["discount_kind"],"label"?: string,"max_discount_cents"?: number | null,"min_subtotal_cents"?: number,"starts_at"?: string | null,"times_redeemed"?: number,"updated_at"?: string,"usage_limit"?: number | null,"value"?: number
                  }
                  Relationships: [

                  ]
                },"delivery_options": {
                  Row: {
                    "code": string,"created_at": string,"description": string | null,"fee_cents": number,"id": string,"is_enabled": boolean,"label": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"description"?: string | null,"fee_cents"?: number,"id"?: string,"is_enabled"?: boolean,"label": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string | null,"fee_cents"?: number,"id"?: string,"is_enabled"?: boolean,"label"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"faqs": {
                  Row: {
                    "answer": string,"category": string | null,"created_at": string,"id": string,"is_published": boolean,"question": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer": string,"category"?: string | null,"created_at"?: string,"id"?: string,"is_published"?: boolean,"question": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "answer"?: string,"category"?: string | null,"created_at"?: string,"id"?: string,"is_published"?: boolean,"question"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"homepage_sections": {
                  Row: {
                    "body": string | null,"created_at": string,"cta_href": string | null,"cta_label": string | null,"id": string,"image_url": string | null,"is_active": boolean,"section_key": string,"settings": NonNullable<Json>,"sort_order": number,"subtitle": string | null,"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"cta_href"?: string | null,"cta_label"?: string | null,"id"?: string,"image_url"?: string | null,"is_active"?: boolean,"section_key": string,"settings"?: NonNullable<Json>,"sort_order"?: number,"subtitle"?: string | null,"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"cta_href"?: string | null,"cta_label"?: string | null,"id"?: string,"image_url"?: string | null,"is_active"?: boolean,"section_key"?: string,"settings"?: NonNullable<Json>,"sort_order"?: number,"subtitle"?: string | null,"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"inquiries": {
                  Row: {
                    "assigned_to": string | null,"created_at": string,"email": string,"id": string,"ip_hash": string | null,"message": string,"name": string,"phone": string | null,"product_id": string | null,"reference": string,"status": Database["public"]['Enums']["inquiry_status"],"type": Database["public"]['Enums']["inquiry_type"],"updated_at": string,"user_agent": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"created_at"?: string,"email": string,"id"?: string,"ip_hash"?: string | null,"message": string,"name": string,"phone"?: string | null,"product_id"?: string | null,"reference"?: string,"status"?: Database["public"]['Enums']["inquiry_status"],"type": Database["public"]['Enums']["inquiry_type"],"updated_at"?: string,"user_agent"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "assigned_to"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"ip_hash"?: string | null,"message"?: string,"name"?: string,"phone"?: string | null,"product_id"?: string | null,"reference"?: string,"status"?: Database["public"]['Enums']["inquiry_status"],"type"?: Database["public"]['Enums']["inquiry_type"],"updated_at"?: string,"user_agent"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inquiries_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"inquiry_replies": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"id": string,"inquiry_id": string,"is_internal": boolean,"sent_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"id"?: string,"inquiry_id": string,"is_internal"?: boolean,"sent_at"?: string | null
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"inquiry_id"?: string,"is_internal"?: boolean,"sent_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inquiry_replies_inquiry_id_fkey"
      columns: ["inquiry_id"]
isOneToOne: false
      referencedRelation: "inquiries"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory": {
                  Row: {
                    "id": string,"location": string | null,"low_stock_threshold": number,"product_id": string,"quantity": number,"reserved_quantity": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"location"?: string | null,"low_stock_threshold"?: number,"product_id": string,"quantity"?: number,"reserved_quantity"?: number,"updated_at"?: string
                  }
                  Update: {
                    "id"?: string,"location"?: string | null,"low_stock_threshold"?: number,"product_id"?: string,"quantity"?: number,"reserved_quantity"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_reservations": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"order_request_id": string,"product_id": string,"quantity": number,"release_reason": string | null,"released_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"order_request_id": string,"product_id": string,"quantity"?: number,"release_reason"?: string | null,"released_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"order_request_id"?: string,"product_id"?: string,"quantity"?: number,"release_reason"?: string | null,"released_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_reservations_order_request_id_fkey"
      columns: ["order_request_id"]
isOneToOne: false
      referencedRelation: "order_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_reservations_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_transactions": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"id": string,"kind": Database["public"]['Enums']["inventory_transaction_kind"],"note": string | null,"order_request_id": string | null,"product_id": string,"quantity_delta": number,"reserved_delta": number
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["inventory_transaction_kind"],"note"?: string | null,"order_request_id"?: string | null,"product_id": string,"quantity_delta": number,"reserved_delta"?: number
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["inventory_transaction_kind"],"note"?: string | null,"order_request_id"?: string | null,"product_id"?: string,"quantity_delta"?: number,"reserved_delta"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_transactions_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"media": {
                  Row: {
                    "alt_text": string | null,"caption": string | null,"created_at": string,"file_name": string,"height": number | null,"id": string,"mime_type": string,"size_bytes": number | null,"storage_bucket": string,"storage_path": string,"updated_at": string,"uploaded_by": string | null,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alt_text"?: string | null,"caption"?: string | null,"created_at"?: string,"file_name": string,"height"?: number | null,"id"?: string,"mime_type": string,"size_bytes"?: number | null,"storage_bucket"?: string,"storage_path": string,"updated_at"?: string,"uploaded_by"?: string | null,"width"?: number | null
                  }
                  Update: {
                    "alt_text"?: string | null,"caption"?: string | null,"created_at"?: string,"file_name"?: string,"height"?: number | null,"id"?: string,"mime_type"?: string,"size_bytes"?: number | null,"storage_bucket"?: string,"storage_path"?: string,"updated_at"?: string,"uploaded_by"?: string | null,"width"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"messages": {
                  Row: {
                    "body": string,"created_at": string,"entity_id": string | null,"entity_type": string | null,"id": string,"is_read": boolean,"read_at": string | null,"recipient_id": string | null,"sender_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"is_read"?: boolean,"read_at"?: string | null,"recipient_id"?: string | null,"sender_id"?: string | null
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"is_read"?: boolean,"read_at"?: string | null,"recipient_id"?: string | null,"sender_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"models": {
                  Row: {
                    "brand_id": string,"created_at": string,"description": string | null,"hero_image_url": string | null,"id": string,"is_active": boolean,"name": string,"seo_description": string | null,"seo_title": string | null,"slug": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"created_at"?: string,"description"?: string | null,"hero_image_url"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"seo_description"?: string | null,"seo_title"?: string | null,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "brand_id"?: string,"created_at"?: string,"description"?: string | null,"hero_image_url"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "models_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    }
                  ]
                },"navigation_items": {
                  Row: {
                    "created_at": string,"group_label": string | null,"href": string,"id": string,"is_active": boolean,"label": string,"location": Database["public"]['Enums']["navigation_location"],"parent_id": string | null,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"group_label"?: string | null,"href": string,"id"?: string,"is_active"?: boolean,"label": string,"location": Database["public"]['Enums']["navigation_location"],"parent_id"?: string | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"group_label"?: string | null,"href"?: string,"id"?: string,"is_active"?: boolean,"label"?: string,"location"?: Database["public"]['Enums']["navigation_location"],"parent_id"?: string | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "navigation_items_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "navigation_items"
      referencedColumns: ["id"]
    }
                  ]
                },"newsletter_subscribers": {
                  Row: {
                    "confirmed_at": string | null,"created_at": string,"email": string,"id": string,"ip_hash": string | null,"is_confirmed": boolean,"source": string | null,"token": string,"unsubscribed_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confirmed_at"?: string | null,"created_at"?: string,"email": string,"id"?: string,"ip_hash"?: string | null,"is_confirmed"?: boolean,"source"?: string | null,"token"?: string,"unsubscribed_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "confirmed_at"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"ip_hash"?: string | null,"is_confirmed"?: boolean,"source"?: string | null,"token"?: string,"unsubscribed_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"id": string,"is_read": boolean,"kind": Database["public"]['Enums']["notification_kind"],"link_url": string | null,"read_at": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"is_read"?: boolean,"kind": Database["public"]['Enums']["notification_kind"],"link_url"?: string | null,"read_at"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"is_read"?: boolean,"kind"?: Database["public"]['Enums']["notification_kind"],"link_url"?: string | null,"read_at"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"order_request_events": {
                  Row: {
                    "actor_id": string | null,"actor_label": string | null,"created_at": string,"from_status": Database["public"]['Enums']["order_status"] | null,"id": string,"note": string | null,"order_request_id": string,"to_status": Database["public"]['Enums']["order_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"actor_label"?: string | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["order_status"] | null,"id"?: string,"note"?: string | null,"order_request_id": string,"to_status": Database["public"]['Enums']["order_status"]
                  }
                  Update: {
                    "actor_id"?: string | null,"actor_label"?: string | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["order_status"] | null,"id"?: string,"note"?: string | null,"order_request_id"?: string,"to_status"?: Database["public"]['Enums']["order_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_request_events_order_request_id_fkey"
      columns: ["order_request_id"]
isOneToOne: false
      referencedRelation: "order_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"order_request_items": {
                  Row: {
                    "created_at": string,"id": string,"image_url_snapshot": string | null,"line_total_cents": number,"order_request_id": string,"product_id": string | null,"product_title_snapshot": string,"quantity": number,"sku_snapshot": string,"slug_snapshot": string | null,"unit_price_cents": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"image_url_snapshot"?: string | null,"line_total_cents"?: number,"order_request_id": string,"product_id"?: string | null,"product_title_snapshot": string,"quantity"?: number,"sku_snapshot": string,"slug_snapshot"?: string | null,"unit_price_cents"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"image_url_snapshot"?: string | null,"line_total_cents"?: number,"order_request_id"?: string,"product_id"?: string | null,"product_title_snapshot"?: string,"quantity"?: number,"sku_snapshot"?: string,"slug_snapshot"?: string | null,"unit_price_cents"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_request_items_order_request_id_fkey"
      columns: ["order_request_id"]
isOneToOne: false
      referencedRelation: "order_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_request_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"order_requests": {
                  Row: {
                    "admin_note": string | null,"created_at": string,"currency": string,"customer_email": string,"customer_name": string,"customer_note": string | null,"customer_phone": string | null,"delivery_address": Json | null,"delivery_fee_cents": number,"fulfilment_type": Database["public"]['Enums']["fulfilment_type"],"id": string,"ip_hash": string | null,"payment_method_code": string | null,"pickup_location": string | null,"reference": string,"settled_offline_at": string | null,"settled_offline_by": string | null,"status": Database["public"]['Enums']["order_status"],"subtotal_cents": number,"total_cents": number,"updated_at": string,"user_agent": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_note"?: string | null,"created_at"?: string,"currency"?: string,"customer_email": string,"customer_name": string,"customer_note"?: string | null,"customer_phone"?: string | null,"delivery_address"?: Json | null,"delivery_fee_cents"?: number,"fulfilment_type": Database["public"]['Enums']["fulfilment_type"],"id"?: string,"ip_hash"?: string | null,"payment_method_code"?: string | null,"pickup_location"?: string | null,"reference"?: string,"settled_offline_at"?: string | null,"settled_offline_by"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"subtotal_cents"?: number,"total_cents"?: number,"updated_at"?: string,"user_agent"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "admin_note"?: string | null,"created_at"?: string,"currency"?: string,"customer_email"?: string,"customer_name"?: string,"customer_note"?: string | null,"customer_phone"?: string | null,"delivery_address"?: Json | null,"delivery_fee_cents"?: number,"fulfilment_type"?: Database["public"]['Enums']["fulfilment_type"],"id"?: string,"ip_hash"?: string | null,"payment_method_code"?: string | null,"pickup_location"?: string | null,"reference"?: string,"settled_offline_at"?: string | null,"settled_offline_by"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"subtotal_cents"?: number,"total_cents"?: number,"updated_at"?: string,"user_agent"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_requests_payment_method_code_fkey"
      columns: ["payment_method_code"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["code"]
    }
                  ]
                },"pages": {
                  Row: {
                    "content": NonNullable<Json>,"created_at": string,"excerpt": string | null,"hero_image_url": string | null,"id": string,"is_system": boolean,"published_at": string | null,"seo_description": string | null,"seo_title": string | null,"slug": string,"status": Database["public"]['Enums']["page_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"excerpt"?: string | null,"hero_image_url"?: string | null,"id"?: string,"is_system"?: boolean,"published_at"?: string | null,"seo_description"?: string | null,"seo_title"?: string | null,"slug": string,"status"?: Database["public"]['Enums']["page_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"excerpt"?: string | null,"hero_image_url"?: string | null,"id"?: string,"is_system"?: boolean,"published_at"?: string | null,"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string,"status"?: Database["public"]['Enums']["page_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payment_methods": {
                  Row: {
                    "code": string,"created_at": string,"description": string | null,"id": string,"instructions": string | null,"is_enabled": boolean,"label": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"description"?: string | null,"id"?: string,"instructions"?: string | null,"is_enabled"?: boolean,"label": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"instructions"?: string | null,"is_enabled"?: boolean,"label"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"product_images": {
                  Row: {
                    "alt_text": string,"created_at": string,"external_url": string | null,"height": number | null,"id": string,"is_primary": boolean,"product_id": string,"sort_order": number,"storage_path": string | null,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alt_text": string,"created_at"?: string,"external_url"?: string | null,"height"?: number | null,"id"?: string,"is_primary"?: boolean,"product_id": string,"sort_order"?: number,"storage_path"?: string | null,"width"?: number | null
                  }
                  Update: {
                    "alt_text"?: string,"created_at"?: string,"external_url"?: string | null,"height"?: number | null,"id"?: string,"is_primary"?: boolean,"product_id"?: string,"sort_order"?: number,"storage_path"?: string | null,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_images_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_questions": {
                  Row: {
                    "answer": string | null,"answered_at": string | null,"answered_by": string | null,"created_at": string,"email": string,"id": string,"is_published": boolean,"name": string,"product_id": string,"question": string,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "answer"?: string | null,"answered_at"?: string | null,"answered_by"?: string | null,"created_at"?: string,"email": string,"id"?: string,"is_published"?: boolean,"name": string,"product_id": string,"question": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "answer"?: string | null,"answered_at"?: string | null,"answered_by"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"is_published"?: boolean,"name"?: string,"product_id"?: string,"question"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_questions_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_specs": {
                  Row: {
                    "id": string,"label": string,"product_id": string,"sort_order": number,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"label": string,"product_id": string,"sort_order"?: number,"value": string
                  }
                  Update: {
                    "id"?: string,"label"?: string,"product_id"?: string,"sort_order"?: number,"value"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_specs_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "bezel": string | null,"box_and_papers": boolean | null,"bracelet_material": string | null,"brand_id": string | null,"case_material": string | null,"case_size_mm": number | null,"compare_at_cents": number | null,"condition": Database["public"]['Enums']["product_condition"] | null,"cost_cents": number | null,"created_at": string,"currency": string,"description": string | null,"dial_color": string | null,"gender": string | null,"id": string,"is_featured": boolean,"model_id": string | null,"movement": string | null,"og_image_url": string | null,"price_cents": number | null,"price_on_request": boolean,"production_year": number | null,"published_at": string | null,"reference_number": string | null,"seo_description": string | null,"seo_title": string | null,"short_description": string | null,"sku": string,"slug": string,"sort_order": number,"status": Database["public"]['Enums']["product_status"],"title": string,"updated_at": string,"water_resistance_m": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bezel"?: string | null,"box_and_papers"?: boolean | null,"bracelet_material"?: string | null,"brand_id"?: string | null,"case_material"?: string | null,"case_size_mm"?: number | null,"compare_at_cents"?: number | null,"condition"?: Database["public"]['Enums']["product_condition"] | null,"cost_cents"?: number | null,"created_at"?: string,"currency"?: string,"description"?: string | null,"dial_color"?: string | null,"gender"?: string | null,"id"?: string,"is_featured"?: boolean,"model_id"?: string | null,"movement"?: string | null,"og_image_url"?: string | null,"price_cents"?: number | null,"price_on_request"?: boolean,"production_year"?: number | null,"published_at"?: string | null,"reference_number"?: string | null,"seo_description"?: string | null,"seo_title"?: string | null,"short_description"?: string | null,"sku": string,"slug": string,"sort_order"?: number,"status"?: Database["public"]['Enums']["product_status"],"title": string,"updated_at"?: string,"water_resistance_m"?: number | null
                  }
                  Update: {
                    "bezel"?: string | null,"box_and_papers"?: boolean | null,"bracelet_material"?: string | null,"brand_id"?: string | null,"case_material"?: string | null,"case_size_mm"?: number | null,"compare_at_cents"?: number | null,"condition"?: Database["public"]['Enums']["product_condition"] | null,"cost_cents"?: number | null,"created_at"?: string,"currency"?: string,"description"?: string | null,"dial_color"?: string | null,"gender"?: string | null,"id"?: string,"is_featured"?: boolean,"model_id"?: string | null,"movement"?: string | null,"og_image_url"?: string | null,"price_cents"?: number | null,"price_on_request"?: boolean,"production_year"?: number | null,"published_at"?: string | null,"reference_number"?: string | null,"seo_description"?: string | null,"seo_title"?: string | null,"short_description"?: string | null,"sku"?: string,"slug"?: string,"sort_order"?: number,"status"?: Database["public"]['Enums']["product_status"],"title"?: string,"updated_at"?: string,"water_resistance_m"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_model_id_fkey"
      columns: ["model_id"]
isOneToOne: false
      referencedRelation: "models"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"email": string | null,"full_name": string | null,"id": string,"marketing_opt_in": boolean,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id": string,"marketing_opt_in"?: boolean,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id"?: string,"marketing_opt_in"?: boolean,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limit_counters": {
                  Row: {
                    "bucket": string,"count": number,"id": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket": string,"count"?: number,"id"?: string,"window_start": string
                  }
                  Update: {
                    "bucket"?: string,"count"?: number,"id"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"repair_requests": {
                  Row: {
                    "brand_name": string | null,"created_at": string,"id": string,"inquiry_id": string,"is_watch_insured": boolean | null,"issue_summary": string | null,"model_name": string | null,"preferred_contact_method": string | null,"reference_number": string | null,"service_type": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_name"?: string | null,"created_at"?: string,"id"?: string,"inquiry_id": string,"is_watch_insured"?: boolean | null,"issue_summary"?: string | null,"model_name"?: string | null,"preferred_contact_method"?: string | null,"reference_number"?: string | null,"service_type"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "brand_name"?: string | null,"created_at"?: string,"id"?: string,"inquiry_id"?: string,"is_watch_insured"?: boolean | null,"issue_summary"?: string | null,"model_name"?: string | null,"preferred_contact_method"?: string | null,"reference_number"?: string | null,"service_type"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "repair_requests_inquiry_id_fkey"
      columns: ["inquiry_id"]
isOneToOne: false
      referencedRelation: "inquiries"
      referencedColumns: ["id"]
    }
                  ]
                },"repair_updates": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"id": string,"is_customer_visible": boolean,"repair_request_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"id"?: string,"is_customer_visible"?: boolean,"repair_request_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"is_customer_visible"?: boolean,"repair_request_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "repair_updates_repair_request_id_fkey"
      columns: ["repair_request_id"]
isOneToOne: false
      referencedRelation: "repair_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"sell_trade_images": {
                  Row: {
                    "alt_text": string | null,"created_at": string,"height": number | null,"id": string,"sell_trade_request_id": string,"sort_order": number,"storage_path": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alt_text"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"sell_trade_request_id": string,"sort_order"?: number,"storage_path": string,"width"?: number | null
                  }
                  Update: {
                    "alt_text"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"sell_trade_request_id"?: string,"sort_order"?: number,"storage_path"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sell_trade_images_sell_trade_request_id_fkey"
      columns: ["sell_trade_request_id"]
isOneToOne: false
      referencedRelation: "sell_trade_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"sell_trade_offers": {
                  Row: {
                    "amount_cents": number,"created_at": string,"created_by": string | null,"currency": string,"id": string,"note": string | null,"offered_by": string,"sell_trade_request_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"id"?: string,"note"?: string | null,"offered_by": string,"sell_trade_request_id": string,"status"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"id"?: string,"note"?: string | null,"offered_by"?: string,"sell_trade_request_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sell_trade_offers_sell_trade_request_id_fkey"
      columns: ["sell_trade_request_id"]
isOneToOne: false
      referencedRelation: "sell_trade_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"sell_trade_requests": {
                  Row: {
                    "asking_price_cents": number | null,"brand_name": string | null,"condition_notes": string | null,"created_at": string,"currency": string,"has_box": boolean | null,"has_papers": boolean | null,"id": string,"inquiry_id": string,"model_name": string | null,"production_year": number | null,"reference_number": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "asking_price_cents"?: number | null,"brand_name"?: string | null,"condition_notes"?: string | null,"created_at"?: string,"currency"?: string,"has_box"?: boolean | null,"has_papers"?: boolean | null,"id"?: string,"inquiry_id": string,"model_name"?: string | null,"production_year"?: number | null,"reference_number"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "asking_price_cents"?: number | null,"brand_name"?: string | null,"condition_notes"?: string | null,"created_at"?: string,"currency"?: string,"has_box"?: boolean | null,"has_papers"?: boolean | null,"id"?: string,"inquiry_id"?: string,"model_name"?: string | null,"production_year"?: number | null,"reference_number"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sell_trade_requests_inquiry_id_fkey"
      columns: ["inquiry_id"]
isOneToOne: false
      referencedRelation: "inquiries"
      referencedColumns: ["id"]
    }
                  ]
                },"site_settings": {
                  Row: {
                    "address_city": string | null,"address_country": string | null,"address_line1": string | null,"address_line2": string | null,"address_postal_code": string | null,"address_region": string | null,"age_gate_enabled": boolean,"age_gate_minimum_age": number,"business_name": string,"contact_email": string | null,"contact_phone": string | null,"default_currency": string,"id": boolean,"logo_url": string | null,"order_confirmation_note": string | null,"social_facebook": string | null,"social_instagram": string | null,"social_x": string | null,"social_youtube": string | null,"tagline": string | null,"updated_at": string,"whatsapp_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address_city"?: string | null,"address_country"?: string | null,"address_line1"?: string | null,"address_line2"?: string | null,"address_postal_code"?: string | null,"address_region"?: string | null,"age_gate_enabled"?: boolean,"age_gate_minimum_age"?: number,"business_name"?: string,"contact_email"?: string | null,"contact_phone"?: string | null,"default_currency"?: string,"id"?: boolean,"logo_url"?: string | null,"order_confirmation_note"?: string | null,"social_facebook"?: string | null,"social_instagram"?: string | null,"social_x"?: string | null,"social_youtube"?: string | null,"tagline"?: string | null,"updated_at"?: string,"whatsapp_url"?: string | null
                  }
                  Update: {
                    "address_city"?: string | null,"address_country"?: string | null,"address_line1"?: string | null,"address_line2"?: string | null,"address_postal_code"?: string | null,"address_region"?: string | null,"age_gate_enabled"?: boolean,"age_gate_minimum_age"?: number,"business_name"?: string,"contact_email"?: string | null,"contact_phone"?: string | null,"default_currency"?: string,"id"?: boolean,"logo_url"?: string | null,"order_confirmation_note"?: string | null,"social_facebook"?: string | null,"social_instagram"?: string | null,"social_x"?: string | null,"social_youtube"?: string | null,"tagline"?: string | null,"updated_at"?: string,"whatsapp_url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"sourcing_requests": {
                  Row: {
                    "bracelet_type": string | null,"brand_name": string | null,"case_size_mm": number | null,"created_at": string,"currency": string,"dial_color": string | null,"id": string,"inquiry_id": string,"max_budget_cents": number | null,"max_year": number | null,"min_year": number | null,"model_name": string | null,"reference_number": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bracelet_type"?: string | null,"brand_name"?: string | null,"case_size_mm"?: number | null,"created_at"?: string,"currency"?: string,"dial_color"?: string | null,"id"?: string,"inquiry_id": string,"max_budget_cents"?: number | null,"max_year"?: number | null,"min_year"?: number | null,"model_name"?: string | null,"reference_number"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "bracelet_type"?: string | null,"brand_name"?: string | null,"case_size_mm"?: number | null,"created_at"?: string,"currency"?: string,"dial_color"?: string | null,"id"?: string,"inquiry_id"?: string,"max_budget_cents"?: number | null,"max_year"?: number | null,"min_year"?: number | null,"model_name"?: string | null,"reference_number"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sourcing_requests_inquiry_id_fkey"
      columns: ["inquiry_id"]
isOneToOne: false
      referencedRelation: "inquiries"
      referencedColumns: ["id"]
    }
                  ]
                },"sourcing_updates": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"id": string,"is_customer_visible": boolean,"sourcing_request_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"id"?: string,"is_customer_visible"?: boolean,"sourcing_request_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"is_customer_visible"?: boolean,"sourcing_request_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sourcing_updates_sourcing_request_id_fkey"
      columns: ["sourcing_request_id"]
isOneToOne: false
      referencedRelation: "sourcing_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"testimonials": {
                  Row: {
                    "author": string,"created_at": string,"id": string,"is_published": boolean,"location": string | null,"quote": string,"rating": number | null,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author": string,"created_at"?: string,"id"?: string,"is_published"?: boolean,"location"?: string | null,"quote": string,"rating"?: number | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "author"?: string,"created_at"?: string,"id"?: string,"is_published"?: boolean,"location"?: string | null,"quote"?: string,"rating"?: number | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_roles": {
                  Row: {
                    "expires_at": string | null,"granted_at": string,"granted_by": string | null,"id": string,"role": Database["public"]['Enums']["staff_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "expires_at"?: string | null,"granted_at"?: string,"granted_by"?: string | null,"id"?: string,"role": Database["public"]['Enums']["staff_role"],"user_id": string
                  }
                  Update: {
                    "expires_at"?: string | null,"granted_at"?: string,"granted_by"?: string | null,"id"?: string,"role"?: Database["public"]['Enums']["staff_role"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"wishlist_items": {
                  Row: {
                    "created_at": string,"id": string,"product_id": string,"wishlist_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"product_id": string,"wishlist_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"product_id"?: string,"wishlist_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wishlist_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wishlist_items_wishlist_id_fkey"
      columns: ["wishlist_id"]
isOneToOne: false
      referencedRelation: "wishlists"
      referencedColumns: ["id"]
    }
                  ]
                },"wishlists": {
                  Row: {
                    "created_at": string,"id": string,"is_default": boolean,"name": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_default"?: boolean,"name"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_default"?: boolean,"name"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "cart_pricing":
{ Args: { "p_currency"?: string,"p_discount_code"?: string,"p_items"?: Json }; Returns: Json
                           },
"catalogue_by_ids":
{ Args: { "p_product_ids": (string)[] }; Returns: {
              "box_and_papers": boolean | null,
"bracelet_material": string | null,
"brand_name": string | null,
"brand_slug": string | null,
"case_material": string | null,
"case_size_mm": number | null,
"condition": string | null,
"currency": string | null,
"dial_color": string | null,
"gender": string | null,
"id": string,
"image_alt": string | null,
"image_external_url": string | null,
"image_storage_path": string | null,
"is_available": boolean | null,
"is_featured": boolean | null,
"model_name": string | null,
"model_slug": string | null,
"movement": string | null,
"price_cents": number | null,
"price_on_request": boolean | null,
"production_year": number | null,
"published_at": string | null,
"reference_number": string | null,
"slug": string,
"title": string
            }[]
                           },
"catalogue_condition_label":
{ Args: { "p_value": string }; Returns: string
                           },
"catalogue_facets":
{ Args: { "p_available_only"?: boolean,"p_box_and_papers"?: boolean,"p_bracelets"?: string[],"p_brands"?: string[],"p_case_materials"?: string[],"p_case_max"?: number,"p_case_min"?: number,"p_collections"?: string[],"p_conditions"?: string[],"p_dial_colors"?: string[],"p_genders"?: string[],"p_models"?: string[],"p_movements"?: string[],"p_price_max"?: number,"p_price_min"?: number,"p_price_mode"?: string,"p_query"?: string,"p_scope"?: string,"p_scope_slug"?: string,"p_year_max"?: number,"p_year_min"?: number }; Returns: Json
                           },
"catalogue_like_pattern":
{ Args: { "p_value": string }; Returns: string
                           },
"catalogue_search":
{ Args: { "p_available_only"?: boolean,"p_box_and_papers"?: boolean,"p_bracelets"?: string[],"p_brands"?: string[],"p_case_materials"?: string[],"p_case_max"?: number,"p_case_min"?: number,"p_collections"?: string[],"p_conditions"?: string[],"p_dial_colors"?: string[],"p_genders"?: string[],"p_limit"?: number,"p_models"?: string[],"p_movements"?: string[],"p_offset"?: number,"p_price_max"?: number,"p_price_min"?: number,"p_price_mode"?: string,"p_query"?: string,"p_scope"?: string,"p_scope_slug"?: string,"p_sort"?: string,"p_year_max"?: number,"p_year_min"?: number }; Returns: {
              "box_and_papers": boolean | null,
"bracelet_material": string | null,
"brand_name": string | null,
"brand_slug": string | null,
"case_material": string | null,
"case_size_mm": number | null,
"condition": string | null,
"currency": string | null,
"dial_color": string | null,
"gender": string | null,
"id": string,
"image_alt": string | null,
"image_external_url": string | null,
"image_storage_path": string | null,
"is_available": boolean | null,
"is_featured": boolean | null,
"model_name": string | null,
"model_slug": string | null,
"movement": string | null,
"price_cents": number | null,
"price_on_request": boolean | null,
"production_year": number | null,
"published_at": string | null,
"reference_number": string | null,
"slug": string,
"title": string,
"total_count": number | null
            }[]
                           },
"catalogue_similar":
{ Args: { "p_limit"?: number,"p_product_id": string }; Returns: {
              "box_and_papers": boolean | null,
"bracelet_material": string | null,
"brand_name": string | null,
"brand_slug": string | null,
"case_material": string | null,
"case_size_mm": number | null,
"condition": string | null,
"currency": string | null,
"dial_color": string | null,
"gender": string | null,
"id": string,
"image_alt": string | null,
"image_external_url": string | null,
"image_storage_path": string | null,
"is_available": boolean | null,
"is_featured": boolean | null,
"match_reason": string | null,
"model_name": string | null,
"model_slug": string | null,
"movement": string | null,
"price_cents": number | null,
"price_on_request": boolean | null,
"production_year": number | null,
"published_at": string | null,
"reference_number": string | null,
"slug": string,
"title": string
            }[]
                           },
"catalogue_suggest":
{ Args: { "p_limit"?: number,"p_query"?: string }; Returns: {
              "detail": string | null,
"href": string,
"kind": string,
"label": string
            }[]
                           },
"confirm_reservation":
{ Args: { "p_order_request_id": string,"p_product_id": string }; Returns: boolean
                           },
"generate_order_reference":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"has_permission":
{ Args: { "required": string }; Returns: boolean
                           },
"has_role":
{ Args: { "required": Database["public"]['Enums']["staff_role"] }; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_product_available":
{ Args: { "p_product_id": string }; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"normalize_slug":
{ Args: { "input": string }; Returns: string
                           },
"product_availability":
{ Args: { "p_product_ids": (string)[] }; Returns: {
              "is_available": boolean,"product_id": string
            }[]
                           },
"published_product_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "brand_id": string,"product_count": number
            }[]
                           },
"read_order_request":
{ Args: { "p_access_token": string,"p_reference": string }; Returns: Json
                           },
"release_reservation":
{ Args: { "p_order_request_id": string,"p_product_id": string,"p_reason"?: string }; Returns: boolean
                           },
"reserve_inventory":
{ Args: { "p_order_request_id": string,"p_product_id": string,"p_quantity": number }; Returns: {
              "created_at": string,
"id": string,
"is_active": boolean,
"order_request_id": string,
"product_id": string,
"quantity": number,
"release_reason": string | null,
"released_at": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "inventory_reservations"
        isOneToOne: true
        isSetofReturn: false
      } },
"role_permissions":
{ Args: { "r": Database["public"]['Enums']["staff_role"] }; Returns: (string)[]
                           },
"submit_product_question":
{ Args: { "p_email": string,"p_message": string,"p_name": string,"p_phone"?: string,"p_product_slug": string }; Returns: string
                           },
"submit_order_request":
{ Args: { "p_access_token_hash"?: string,"p_customer_email": string,"p_customer_name": string,"p_customer_note"?: string,"p_customer_phone": string,"p_delivery_address"?: Json,"p_delivery_option_code"?: string,"p_discount_code"?: string,"p_fulfilment_type": Database["public"]['Enums']["fulfilment_type"],"p_idempotency_key"?: string,"p_items": Json,"p_payment_method_code": string,"p_pickup_location"?: string,"p_terms_acknowledged"?: boolean,"p_user_agent"?: string }; Returns: {
              "admin_note": string | null,
"created_at": string,
"currency": string,
"customer_email": string,
"customer_name": string,
"customer_note": string | null,
"customer_phone": string | null,
"delivery_address": Json | null,
"delivery_fee_cents": number,
"fulfilment_type": Database["public"]['Enums']["fulfilment_type"],
"id": string,
"ip_hash": string | null,
"payment_method_code": string | null,
"pickup_location": string | null,
"reference": string,
"settled_offline_at": string | null,
"settled_offline_by": string | null,
"status": Database["public"]['Enums']["order_status"],
"subtotal_cents": number,
"total_cents": number,
"updated_at": string,
"user_agent": string | null,
"user_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "order_requests"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "appointment_status": "requested"|"confirmed"|"completed"|"cancelled","collection_kind": "taxonomy"|"merchandising"|"featured"|"novelty","discount_kind": "percentage"|"fixed_amount"|"free_delivery","fulfilment_type": "delivery"|"pickup","inquiry_status": "new"|"in_review"|"responded"|"closed"|"spam","inquiry_type": "sell_trade"|"sourcing"|"repair"|"general"|"product_question","inventory_transaction_kind": "acquisition"|"adjustment"|"reservation"|"reservation_release"|"sale"|"return"|"correction","navigation_location": "header"|"footer"|"topbar","notification_kind": "order_request"|"inquiry"|"appointment"|"system","order_status": "submitted"|"under_review"|"confirmed"|"awaiting_payment"|"paid_offline"|"fulfilled"|"cancelled"|"rejected","page_status": "draft"|"published"|"archived","product_condition": "new"|"unworn"|"pre_owned"|"vintage","product_status": "draft"|"published"|"archived","staff_role": "SUPER_ADMIN"|"ADMIN"|"SALES_MANAGER"|"INVENTORY_MANAGER"|"WATCH_EXPERT"|"CUSTOMER_SUPPORT"|"CONTENT_MANAGER"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "appointment_status": ["requested", "confirmed", "completed", "cancelled"],"collection_kind": ["taxonomy", "merchandising", "featured", "novelty"],"discount_kind": ["percentage", "fixed_amount", "free_delivery"],"fulfilment_type": ["delivery", "pickup"],"inquiry_status": ["new", "in_review", "responded", "closed", "spam"],"inquiry_type": ["sell_trade", "sourcing", "repair", "general", "product_question"],"inventory_transaction_kind": ["acquisition", "adjustment", "reservation", "reservation_release", "sale", "return", "correction"],"navigation_location": ["header", "footer", "topbar"],"notification_kind": ["order_request", "inquiry", "appointment", "system"],"order_status": ["submitted", "under_review", "confirmed", "awaiting_payment", "paid_offline", "fulfilled", "cancelled", "rejected"],"page_status": ["draft", "published", "archived"],"product_condition": ["new", "unworn", "pre_owned", "vintage"],"product_status": ["draft", "published", "archived"],"staff_role": ["SUPER_ADMIN", "ADMIN", "SALES_MANAGER", "INVENTORY_MANAGER", "WATCH_EXPERT", "CUSTOMER_SUPPORT", "CONTENT_MANAGER"]
          }
        }
} as const
