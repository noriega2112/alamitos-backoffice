-- Orders: public read
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read orders"
ON orders FOR SELECT TO anon USING (true);

-- Products: public read active only
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active products"
ON products FOR SELECT TO anon USING (is_active = true);

-- Promotions: public read active and date-filtered
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active promotions"
ON promotions FOR SELECT TO anon USING (
  is_active = true AND NOW() BETWEEN start_date AND end_date
);

-- Drinks: public read active
ALTER TABLE drinks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active drinks"
ON drinks FOR SELECT TO anon USING (is_active = true);

-- Zones: public read active
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active zones"
ON zones FOR SELECT TO anon USING (is_active = true);

-- Categories: public read
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read categories"
ON categories FOR SELECT TO anon USING (true);

-- order_items: public read
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read order_items"
ON order_items FOR SELECT TO anon USING (true);

-- order_item_drinks: public read
ALTER TABLE order_item_drinks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read order_item_drinks"
ON order_item_drinks FOR SELECT TO anon USING (true);
