ALTER TABLE orders ADD COLUMN whatsapp_message_id TEXT;
CREATE INDEX idx_orders_wamid ON orders(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;
