CREATE OR REPLACE FUNCTION create_order(
  p_customer_name TEXT,
  p_phone_number TEXT,
  p_delivery_type delivery_type,
  p_zone_id BIGINT,
  p_specific_address TEXT,
  p_subtotal DECIMAL,
  p_delivery_fee DECIMAL,
  p_tax_amount DECIMAL,
  p_total_amount DECIMAL,
  p_payment_proof_url TEXT,
  p_notes TEXT,
  p_items JSONB
) RETURNS TABLE(id UUID) AS $$
DECLARE
  v_order_id UUID;
  v_item JSONB;
  v_order_item_id BIGINT;
  v_drink_id BIGINT;
BEGIN
  INSERT INTO orders (
    customer_name, phone_number, delivery_type, zone_id, specific_address,
    subtotal, delivery_fee, tax_amount, total_amount, payment_proof_url, notes, status
  ) VALUES (
    p_customer_name, p_phone_number, p_delivery_type, p_zone_id, p_specific_address,
    p_subtotal, p_delivery_fee, p_tax_amount, p_total_amount, p_payment_proof_url, p_notes, 'pending'
  ) RETURNING orders.id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (
      order_id, product_id, promotion_id, quantity, unit_price, notes
    ) VALUES (
      v_order_id,
      NULLIF((v_item->>'product_id'), '')::BIGINT,
      NULLIF((v_item->>'promotion_id'), '')::BIGINT,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::DECIMAL,
      v_item->>'notes'
    ) RETURNING order_items.id INTO v_order_item_id;

    IF v_item->'drinks' IS NOT NULL AND jsonb_array_length(v_item->'drinks') > 0 THEN
      FOR v_drink_id IN
        SELECT jsonb_array_elements_text(v_item->'drinks')::BIGINT
      LOOP
        INSERT INTO order_item_drinks (order_item_id, drink_id, drink_price)
        SELECT v_order_item_id, d.id, d.price
        FROM drinks d WHERE d.id = v_drink_id;
      END LOOP;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
