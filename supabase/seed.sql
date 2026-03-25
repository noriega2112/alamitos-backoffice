-- Zones
INSERT INTO zones (name, delivery_fee, is_active) VALUES
  ('Zona Centro', 40.00, true),
  ('Zona Norte', 60.00, true),
  ('Zona Sur', 50.00, true),
  ('Zona Este', 55.00, true);

-- Categories (sort_order controls display order, lower = first)
INSERT INTO categories (id, name, sort_order, is_drink_category) VALUES
  (1, 'Bebidas', 10, true),
  (2, 'Entradas', 6, false),
  (3, 'Snacks', 7, false),
  (4, 'Asados', 8, false),
  (5, 'Para Compartir', 9, false),
  (6, 'Come por L359', 3, false),
  (7, 'Promos a Mitad de Precio', 4, false),
  (8, 'Promos 2x1', 5, false),
  (9, 'Come por L139', 1, false),
  (10, 'Come por L199', 2, false)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, is_drink_category = EXCLUDED.is_drink_category;

SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories));

-- Bebidas
INSERT INTO products (category_id, name, description, price) VALUES
  (1, 'Canada Dry', 'Disfruta de nuestras gaseosas.', 50.00),
  (1, 'Limonada', 'Disfruta de nuestra Limonada.', 50.00),
  (1, 'Te frío', 'Disfruta de nuestro delicioso te frio.', 50.00),
  (1, 'Cerveza Miller Lite', 'Disfruta de nuestras cervezas.', 70.00),
  (1, 'Bebida Coors Light', 'Disfruta de nuestras cervezas.', 70.00),
  (1, 'Bebida Barena', NULL, 60.00),
  (1, 'Bebida Salva Vida', NULL, 60.00),
  (1, 'Cerveza Imperial', 'Disfruta de nuestras cervezas.', 60.00),
  (1, 'Cerveza Ultra', NULL, 75.00),
  (1, 'Cerveza Corona', NULL, 80.00),
  (1, 'Cerveza Miller Draft', NULL, 80.00);

-- Entradas
INSERT INTO products (category_id, name, description, price) VALUES
  (2, 'Fundido', 'Una mezcla de frijoles, queso y nachos de la casa.', 185.00),
  (2, 'Fundido mixto', 'Una mezcla de frijoles, queso, chorizo y nachos de la casa.', 195.00);

-- Snacks
INSERT INTO products (category_id, name, description, price) VALUES
  (3, 'Alitas de pollo', 'Bañadas con tu salsa favorita (barbacoa o búfalo), acompañadas de papas fritas.', 275.00),
  (3, 'Boneless de pollo', 'Boneless bañados con tu salsa favorita (barbacoa o búfalo), acompañados de papas fritas.', 255.00),
  (3, 'Chicken fingers', 'Deditos de pollo empanizados, servidos con papas fritas y salsa ranch.', 245.00),
  (3, 'Nacho Jr', 'Nachos con barbacoa, chimol, frijoles, mantequilla y pollo.', 195.00),
  (3, 'Mega Nacho', 'Nachos con barbacoa, chimol, mantequilla, frijoles y pollo.', 265.00);

-- Asados
INSERT INTO products (category_id, name, description, price) VALUES
  (4, 'Costilla de cerdo', 'Costilla de cerdo en salsa bbq acompañada de tajadas de guineo verde, frijoles, encurtido y chimol.', 315.00),
  (4, 'Chuleta de cerdo', 'Acompañada de tajadas de guineo verde, frijoles fritos, encurtido y chimol.', 315.00),
  (4, 'Pollo asado', 'Pechuga deshuesada, acompañada de tajadas de guineo verde, frijoles, encurtido y chimol.', 315.00),
  (4, 'Asado de filete de res', 'Filete de res, acompañado de tajadas de guineo verde, frijoles fritos, encurtido y chimol.', 345.00),
  (4, 'Asado mixto de pollo + chuleta', 'Pollo asado, chuleta de cerdo, acompañados de tajadas de guineo verde, frijoles, encurtido y chimol.', 365.00);

-- Para Compartir
INSERT INTO products (category_id, name, description, price) VALUES
  (5, 'Parrillada de 3-4', '2 chuletas, 2 costillas, 2 chorizos, 2 pollos y tajadas.', 1850.00),
  (5, 'Alamitos Sampler', '10 Boneless bufalo o bbq, 6 alitas bufalo o bbq, 2 mozarella sticks, papas fritas.', 635.00);

-- Come por L359
INSERT INTO products (category_id, name, description, price, sale_price) VALUES
  (6, 'Asado 3 carnes', 'Elige 3 de tus carnes favoritas, y acompañalas con una orden de tajadas.', 845.00, 359.00);

-- Promos a Mitad de Precio
INSERT INTO products (category_id, name, description, price, sale_price) VALUES
  (7, 'Chicken fingers', '4 dedos de pollo empanizados, acompañados de papas, aderezo ranch.', 245.00, 122.50),
  (7, 'Sampler', '6 alitas bañadas en salsa de tu preferencia, 10 boneless bañados en salsa de tu preferencia.', 635.00, NULL);

-- Promos 2x1
INSERT INTO products (category_id, name, description, price) VALUES
  (8, '2x1 Boneless', 'Dos platos de boneless de 5 unds bañados en tu salsa favorita bbq o búfalo, acompañados de papas fritas.', 275.00);

-- Come por L139
INSERT INTO products (category_id, name, description, price, sale_price) VALUES
  (9, 'Pollo asado por L139', 'Disfruta de un delicioso pollo asado con tajadas de guineo verde, aderezo.', 265.00, 139.00),
  (9, 'Mega nachos', 'Mega nachos de pollo, bañados en salsa barbacoa, chimol, mantequilla.', 265.00, 139.00),
  (9, 'Chicken fingers', 'Deditos de pollo empanizados, servidos con papas fritas, salsa ranch.', 245.00, 139.00);

-- Come por L199
INSERT INTO products (category_id, name, description, price, sale_price) VALUES
  (10, 'Alitas+boneless por 199', '6 alitas y 5 boneless bañados en tu salsa favorita bbq o búfalo con una orden de papas fritas, ranch y ketchup.', 530.00, 199.00),
  (10, 'Mega nacho+refresco', 'Mega nachos incluye pollo, mantequilla, chimol, frijoles fritos y refresco.', 325.00, 199.00),
  (10, 'Costilla+refresco', '1 costilla de cerdo bañadas de bbq, acompañada de tajadas de guineos verdes y refresco.', 395.00, 199.00),
  (10, 'Boneless+refresco', 'Boneless de 5 unidades, bañados en tu salsa favorita bbq o bufalo, acompañados de papas fritas y refresco.', 255.00, 199.00),
  (10, '2 chuletas a 199', 'Disfruta de 2 chuletas con tajadas de guineo verde, aderezo y frijoles.', 530.00, 199.00);

-- Drinks (add-ons for order items — same as Bebidas products)
INSERT INTO drinks (name, price, is_active) VALUES
  ('Canada Dry', 50.00, true),
  ('Limonada', 50.00, true),
  ('Te frío', 50.00, true),
  ('Cerveza Miller Lite', 70.00, true),
  ('Coors Light', 70.00, true),
  ('Barena', 60.00, true),
  ('Salva Vida', 60.00, true),
  ('Cerveza Imperial', 60.00, true),
  ('Cerveza Ultra', 75.00, true),
  ('Cerveza Corona', 80.00, true),
  ('Cerveza Miller Draft', 80.00, true);

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
