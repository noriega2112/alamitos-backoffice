-- Zones
INSERT INTO zones (name, delivery_fee, is_active) VALUES
  ('Zona Centro', 40.00, true),
  ('Zona Norte', 60.00, true),
  ('Zona Sur', 50.00, true),
  ('Zona Este', 55.00, true);

-- Categories
INSERT INTO categories (name) VALUES
  ('Combos'),
  ('Hamburguesas'),
  ('Pollos'),
  ('Bebidas');

-- Products (using category IDs 1-4 in order of insert above)
INSERT INTO products (category_id, name, description, price, sale_price, image_url, is_active) VALUES
  (2, 'Hamburguesa Clásica', 'Carne 100% res, lechuga, tomate, cebolla', 120.00, 99.00, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400', true),
  (2, 'Hamburguesa BBQ', 'Carne, tocino, salsa BBQ, queso cheddar', 150.00, NULL, 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400', true),
  (3, 'Pollo Frito', '2 piezas de pollo frito crujiente', 130.00, NULL, 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400', true),
  (1, 'Combo Familiar', '2 hamburguesas + 1 pollo + 4 bebidas', 450.00, 390.00, 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=400', true);

-- Drinks
INSERT INTO drinks (name, price, is_active) VALUES
  ('Coca Cola', 25.00, true),
  ('Pepsi', 25.00, true),
  ('Agua', 15.00, true),
  ('Jugo de Naranja', 30.00, true),
  ('Limonada', 30.00, true);

-- Promotions (active NOW through 30 days from now)
INSERT INTO promotions (name, description, price, image_url, start_date, end_date, is_active) VALUES
  (
    'Promo Lunes: 2x1 Hamburguesas',
    '2 hamburguesas clásicas por el precio de 1. Solo los lunes.',
    120.00,
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400',
    NOW() - INTERVAL '1 day',
    NOW() + INTERVAL '30 days',
    true
  ),
  (
    'Combo Pareja',
    '2 hamburguesas BBQ + 2 bebidas a precio especial.',
    250.00,
    'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400',
    NOW() - INTERVAL '1 day',
    NOW() + INTERVAL '30 days',
    true
  );
