CREATE TYPE delivery_type AS ENUM ('delivery', 'pickup');
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'rejected');

CREATE TABLE zones (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  delivery_fee DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_zones_active ON zones(is_active);

CREATE TABLE categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT REFERENCES categories(id),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  sale_price DECIMAL(10,2),
  sale_start_date TIMESTAMPTZ,
  sale_end_date TIMESTAMPTZ,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_sale_dates CHECK (
    (sale_start_date IS NULL OR sale_end_date IS NULL)
    OR (sale_end_date > sale_start_date)
  )
);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active);

CREATE TABLE promotions (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_date_range CHECK (end_date > start_date)
);
CREATE INDEX idx_promotions_active_dates ON promotions(is_active, start_date, end_date);

CREATE TABLE drinks (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  delivery_type delivery_type NOT NULL DEFAULT 'delivery',
  zone_id BIGINT REFERENCES zones(id),
  specific_address TEXT,
  notes TEXT,
  subtotal DECIMAL(10,2) NOT NULL,
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  payment_proof_url TEXT NOT NULL,
  status order_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT delivery_requires_zone CHECK (
    (delivery_type = 'pickup') OR
    (delivery_type = 'delivery' AND zone_id IS NOT NULL AND specific_address IS NOT NULL)
  ),
  CONSTRAINT pickup_no_delivery_fee CHECK (
    (delivery_type = 'delivery') OR
    (delivery_type = 'pickup' AND delivery_fee = 0)
  ),
  CONSTRAINT valid_total CHECK (
    total_amount = subtotal + delivery_fee + tax_amount
  )
);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_phone ON orders(phone_number);

CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id),
  promotion_id BIGINT REFERENCES promotions(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT item_type_check CHECK (
    (product_id IS NOT NULL AND promotion_id IS NULL)
    OR (product_id IS NULL AND promotion_id IS NOT NULL)
  )
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE order_item_drinks (
  id BIGSERIAL PRIMARY KEY,
  order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  drink_id BIGINT NOT NULL REFERENCES drinks(id),
  drink_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_item_id, drink_id)
);
CREATE INDEX idx_order_item_drinks_item ON order_item_drinks(order_item_id);
