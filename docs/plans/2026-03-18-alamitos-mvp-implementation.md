# Alamitos MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a complete restaurant ordering system where customers browse the menu, add items to cart, upload payment proof, and receive real-time order status updates while the restaurant gets WhatsApp notifications.

**Architecture:** React frontend (CRA + Redux for cart state + TanStack Query for server state) → Supabase Storage (payment proof upload) → Supabase Edge Function `process-order` (validates, creates DB transaction, sends WhatsApp) → Supabase Realtime (status page subscribes to order updates).

**Tech Stack:** React 18, React Router v6, Redux Toolkit, TanStack Query v5, Supabase JS v2, Supabase Edge Functions (Deno), PostgreSQL, WhatsApp Business API (Meta)

---

## Prerequisites

```bash
# Always work from:
cd /Users/edwinnoriega/Desktop/EN/alamitos

# Node version
nvm use  # uses .nvmrc → Node LTS/Gallium

# Supabase must be running for DB tasks
supabase start

# React dev server (separate terminal)
cd package && npm start
```

---

## Task 1: Install Frontend Dependencies

**Files:**
- Modify: `package/package.json`

**Step 1: Install TanStack Query**

```bash
cd package && npm install @tanstack/react-query @tanstack/react-query-devtools
```

**Step 2: Verify install**

```bash
cat package.json | grep tanstack
# Expected: "@tanstack/react-query": "^5.x.x"
```

**Step 3: Commit**

```bash
git add package/package.json package/package-lock.json
git commit -m "feat: add TanStack Query dependency"
```

---

## Task 2: Create Database Migrations

**Files:**
- Create: `supabase/migrations/20260318000001_initial_schema.sql`
- Create: `supabase/migrations/20260318000002_rls_policies.sql`
- Create: `supabase/migrations/20260318000003_storage_bucket.sql`
- Create: `supabase/migrations/20260318000004_create_order_function.sql`

**Step 1: Create schema migration**

```sql
-- supabase/migrations/20260318000001_initial_schema.sql

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
```

**Step 2: Create RLS migration**

```sql
-- supabase/migrations/20260318000002_rls_policies.sql

-- Orders: public read by anyone (needed for status page without login)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read orders"
ON orders FOR SELECT TO anon USING (true);

-- Products: public read for active only
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active products"
ON products FOR SELECT TO anon USING (is_active = true);

-- Promotions: public read for active and current date
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active promotions"
ON promotions FOR SELECT TO anon USING (
  is_active = true AND NOW() BETWEEN start_date AND end_date
);

-- Drinks: public read for active
ALTER TABLE drinks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active drinks"
ON drinks FOR SELECT TO anon USING (is_active = true);

-- Zones: public read for active
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active zones"
ON zones FOR SELECT TO anon USING (is_active = true);

-- Categories: public read
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read categories"
ON categories FOR SELECT TO anon USING (true);

-- order_items: public read (needed for status page detail)
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read order_items"
ON order_items FOR SELECT TO anon USING (true);

-- order_item_drinks: public read
ALTER TABLE order_item_drinks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read order_item_drinks"
ON order_item_drinks FOR SELECT TO anon USING (true);
```

**Step 3: Create storage bucket migration**

```sql
-- supabase/migrations/20260318000003_storage_bucket.sql

INSERT INTO storage.buckets (id, name, public) VALUES ('payments', 'payments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow anonymous uploads to payments"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'payments');

CREATE POLICY "Public read payments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'payments');
```

**Step 4: Create `create_order` stored procedure migration**

```sql
-- supabase/migrations/20260318000004_create_order_function.sql

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
```

**Step 5: Apply migrations**

```bash
# From project root
supabase db reset
# Expected: "Finished supabase db reset."
```

**Step 6: Verify tables exist**

```bash
supabase db diff
# Expected: no diff (all migrations applied)
```

**Step 7: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add database schema, RLS policies, storage bucket, and create_order function"
```

---

## Task 3: Seed Test Data

**Files:**
- Create: `supabase/seed.sql`

**Step 1: Create seed file**

```sql
-- supabase/seed.sql

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

-- Products
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

-- Promotions (active for 30 days from now)
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
```

**Step 2: Apply seed data**

```bash
supabase db reset
# This runs migrations + seed.sql automatically
```

**Step 3: Verify data**

```bash
supabase studio
# Go to Table Editor → verify products, zones, drinks, promotions have rows
```

**Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: add test seed data for development"
```

---

## Task 4: Setup TanStack Query Provider

**Files:**
- Modify: `package/src/index.js` (the main App entry, not jsx/index.js)

**Step 1: Find the App root**

```bash
cat package/src/index.js
# This is where ReactDOM.render or createRoot is called
```

**Step 2: Wrap app with QueryClientProvider**

```javascript
// package/src/index.js - add after existing imports:
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools'; // optional

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min
      retry: 2,
    },
  },
});

// Wrap the existing <App /> (or <BrowserRouter>) with:
// <QueryClientProvider client={queryClient}>
//   {/* existing JSX */}
// </QueryClientProvider>
```

**Step 3: Verify app still loads**

```bash
cd package && npm start
# Open http://localhost:3000 — no console errors
```

**Step 4: Commit**

```bash
git add package/src/index.js
git commit -m "feat: add TanStack Query provider to app root"
```

---

## Task 5: Create Redux Cart Slice

**Files:**
- Create: `package/src/store/slices/cartSlice.js`
- Create: `package/src/store/slices/orderSlice.js`
- Modify: `package/src/store/reducers/rootReducers.js`

**Step 1: Create cartSlice.js**

```javascript
// package/src/store/slices/cartSlice.js
import { createSlice, nanoid } from '@reduxjs/toolkit';

const cartSlice = createSlice({
  name: 'cart',
  initialState: { items: [] },
  reducers: {
    addToCart: (state, action) => {
      // action.payload: { type: 'product'|'promotion', itemId, itemData, quantity, drinks, notes }
      const item = { ...action.payload, id: nanoid() };
      state.items.push(item);
    },
    removeFromCart: (state, action) => {
      state.items = state.items.filter(i => i.id !== action.payload);
    },
    updateQuantity: (state, action) => {
      // action.payload: { id, quantity }
      const item = state.items.find(i => i.id === action.payload.id);
      if (item) item.quantity = action.payload.quantity;
    },
    clearCart: (state) => {
      state.items = [];
    },
  },
});

export const { addToCart, removeFromCart, updateQuantity, clearCart } = cartSlice.actions;

// Selectors
export const selectCartItems = (state) => state.cart.items;
export const selectCartCount = (state) =>
  state.cart.items.reduce((sum, i) => sum + i.quantity, 0);
export const selectCartSubtotal = (state) =>
  state.cart.items.reduce((sum, item) => {
    const itemTotal = item.itemData.sale_price || item.itemData.price;
    const drinksTotal = item.drinks.reduce((d, drink) => d + drink.price, 0);
    return sum + (itemTotal + drinksTotal) * item.quantity;
  }, 0);

export default cartSlice.reducer;
```

**Step 2: Create orderSlice.js**

```javascript
// package/src/store/slices/orderSlice.js
import { createSlice } from '@reduxjs/toolkit';

const STORAGE_KEY = 'active_order_id';

const orderSlice = createSlice({
  name: 'order',
  initialState: {
    activeOrderId: localStorage.getItem(STORAGE_KEY) || null,
    orderStatus: null,
  },
  reducers: {
    setActiveOrder: (state, action) => {
      // action.payload: { orderId, status }
      state.activeOrderId = action.payload.orderId;
      state.orderStatus = action.payload.status;
      localStorage.setItem(STORAGE_KEY, action.payload.orderId);
    },
    updateOrderStatus: (state, action) => {
      state.orderStatus = action.payload;
    },
    clearActiveOrder: (state) => {
      state.activeOrderId = null;
      state.orderStatus = null;
      localStorage.removeItem(STORAGE_KEY);
    },
  },
});

export const { setActiveOrder, updateOrderStatus, clearActiveOrder } = orderSlice.actions;
export const selectActiveOrderId = (state) => state.order.activeOrderId;
export const selectOrderStatus = (state) => state.order.orderStatus;

export default orderSlice.reducer;
```

**Step 3: Register slices in rootReducers.js**

Open `package/src/store/reducers/rootReducers.js` and add:
```javascript
import cartReducer from '../slices/cartSlice';
import orderReducer from '../slices/orderSlice';

// In combineReducers (or configureStore), add:
// cart: cartReducer,
// order: orderReducer,
```

**Step 4: Verify app compiles**

```bash
cd package && npm start
# No build errors in console
```

**Step 5: Commit**

```bash
git add package/src/store/slices/ package/src/store/reducers/rootReducers.js
git commit -m "feat: add cart and order Redux slices"
```

---

## Task 6: Create Data Query Hooks

**Files:**
- Create: `package/src/queries/useCatalog.js`
- Create: `package/src/queries/useZones.js`

**Step 1: Create useCatalog.js**

```javascript
// package/src/queries/useCatalog.js
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';

export const useProducts = () =>
  useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name)')
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

export const usePromotions = () =>
  useQuery({
    queryKey: ['promotions'],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('promotions')
        .select('*')
        .eq('is_active', true)
        .lte('start_date', now)
        .gte('end_date', now);
      if (error) throw error;
      return data;
    },
  });

export const useDrinks = () =>
  useQuery({
    queryKey: ['drinks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drinks')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000,
  });
```

**Step 2: Create useZones.js**

```javascript
// package/src/queries/useZones.js
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';

export const useZones = () =>
  useQuery({
    queryKey: ['zones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zones')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000,
  });
```

**Step 3: Commit**

```bash
git add package/src/queries/
git commit -m "feat: add TanStack Query hooks for products, promotions, drinks, and zones"
```

---

## Task 7: Build AddToCartModal Component

**Files:**
- Create: `package/src/jsx/components/Menu/AddToCartModal.js`

This modal opens when the user clicks "+" on a product or promotion card.

**Step 1: Create the component**

```jsx
// package/src/jsx/components/Menu/AddToCartModal.js
import React, { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { useDispatch } from 'react-redux';
import { addToCart } from '../../../store/slices/cartSlice';
import { useDrinks } from '../../../queries/useCatalog';

const AddToCartModal = ({ show, onHide, item, type }) => {
  // item: product or promotion object
  // type: 'product' | 'promotion'
  const dispatch = useDispatch();
  const { data: drinks = [] } = useDrinks();
  const [quantity, setQuantity] = useState(1);
  const [selectedDrinks, setSelectedDrinks] = useState([]);
  const [notes, setNotes] = useState('');

  const effectivePrice = item?.sale_price || item?.price || 0;
  const drinksTotal = selectedDrinks.reduce((sum, d) => sum + d.price, 0);
  const lineTotal = (effectivePrice + drinksTotal) * quantity;

  const toggleDrink = (drink) => {
    setSelectedDrinks(prev =>
      prev.find(d => d.id === drink.id)
        ? prev.filter(d => d.id !== drink.id)
        : [...prev, drink]
    );
  };

  const handleAdd = () => {
    dispatch(addToCart({
      type,
      itemId: item.id,
      itemData: item,
      quantity,
      drinks: selectedDrinks,
      notes,
    }));
    // Reset state
    setQuantity(1);
    setSelectedDrinks([]);
    setNotes('');
    onHide();
  };

  if (!item) return null;

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>{item.name}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {item.image_url && (
          <img
            src={item.image_url}
            alt={item.name}
            className="img-fluid rounded mb-3"
            style={{ maxHeight: 200, width: '100%', objectFit: 'cover' }}
          />
        )}
        <p className="text-muted">{item.description}</p>

        {/* Price */}
        <div className="mb-3">
          {item.sale_price ? (
            <>
              <span className="text-muted text-decoration-line-through me-2">
                L. {item.price}
              </span>
              <strong className="text-primary fs-5">L. {item.sale_price}</strong>
            </>
          ) : (
            <strong className="text-primary fs-5">L. {item.price}</strong>
          )}
        </div>

        {/* Drinks */}
        {drinks.length > 0 && (
          <div className="mb-3">
            <p className="fw-bold mb-2">Agregar bebidas:</p>
            <div className="d-flex flex-wrap gap-2">
              {drinks.map(drink => (
                <button
                  key={drink.id}
                  type="button"
                  className={`btn btn-sm ${selectedDrinks.find(d => d.id === drink.id) ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => toggleDrink(drink)}
                >
                  {drink.name} +L.{drink.price}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="mb-3">
          <label className="form-label">Notas para cocina:</label>
          <input
            type="text"
            className="form-control"
            placeholder="Ej: Sin cebolla, término medio..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {/* Quantity */}
        <div className="d-flex align-items-center gap-3 mb-3">
          <label className="form-label mb-0">Cantidad:</label>
          <div className="d-flex align-items-center gap-2">
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
            >-</button>
            <span className="px-3 fw-bold">{quantity}</span>
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setQuantity(q => q + 1)}
            >+</button>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button className="btn btn-secondary" onClick={onHide}>Cancelar</button>
        <button className="btn btn-primary w-100" onClick={handleAdd}>
          Agregar al Carrito — L. {lineTotal.toFixed(2)}
        </button>
      </Modal.Footer>
    </Modal>
  );
};

export default AddToCartModal;
```

**Step 2: Commit**

```bash
git add package/src/jsx/components/Menu/
git commit -m "feat: add AddToCartModal with drink selection and quantity control"
```

---

## Task 8: Build Home / Menu Page

**Files:**
- Create: `package/src/jsx/pages/MenuPage.js`
- Modify: `package/src/jsx/index.js`

**Step 1: Create MenuPage.js**

```jsx
// package/src/jsx/pages/MenuPage.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useProducts, usePromotions } from '../../queries/useCatalog';
import { selectActiveOrderId } from '../../store/slices/orderSlice';
import AddToCartModal from '../components/Menu/AddToCartModal';
import { supabase } from '../../supabaseClient';

const MenuPage = () => {
  const navigate = useNavigate();
  const activeOrderId = useSelector(selectActiveOrderId);
  const { data: products = [], isLoading: productsLoading } = useProducts();
  const { data: promotions = [], isLoading: promoLoading } = usePromotions();

  const [modalItem, setModalItem] = useState(null);
  const [modalType, setModalType] = useState('product');

  // On mount: if there's an active order, check its status
  useEffect(() => {
    if (!activeOrderId) return;
    const checkOrder = async () => {
      const { data: order } = await supabase
        .from('orders')
        .select('id, status')
        .eq('id', activeOrderId)
        .single();
      if (order && !['delivered', 'rejected'].includes(order.status)) {
        navigate(`/status/${activeOrderId}`);
      }
    };
    checkOrder();
  }, [activeOrderId, navigate]);

  const openModal = (item, type) => {
    setModalItem(item);
    setModalType(type);
  };

  if (productsLoading || promoLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 200 }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <div className="container py-4">
      {/* Promotions Section */}
      {promotions.length > 0 && (
        <section className="mb-5">
          <h3 className="mb-3">Promociones</h3>
          <div className="row g-3">
            {promotions.map(promo => (
              <div key={promo.id} className="col-12 col-sm-6 col-md-4">
                <div className="card h-100 shadow-sm">
                  {promo.image_url && (
                    <img
                      src={promo.image_url}
                      className="card-img-top"
                      alt={promo.name}
                      style={{ height: 180, objectFit: 'cover' }}
                    />
                  )}
                  <div className="card-body">
                    <h5 className="card-title">{promo.name}</h5>
                    <p className="card-text text-muted small">{promo.description}</p>
                    <p className="fw-bold text-primary fs-5">L. {promo.price}</p>
                  </div>
                  <div className="card-footer bg-transparent">
                    <button
                      className="btn btn-primary w-100"
                      onClick={() => openModal(promo, 'promotion')}
                    >
                      Agregar +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Products Section */}
      <section>
        <h3 className="mb-3">Menú</h3>
        <div className="row g-3">
          {products.map(product => (
            <div key={product.id} className="col-12 col-sm-6 col-md-4">
              <div className="card h-100 shadow-sm">
                {product.image_url && (
                  <img
                    src={product.image_url}
                    className="card-img-top"
                    alt={product.name}
                    style={{ height: 180, objectFit: 'cover' }}
                  />
                )}
                <div className="card-body">
                  <h5 className="card-title">{product.name}</h5>
                  <p className="card-text text-muted small">{product.description}</p>
                  <div>
                    {product.sale_price ? (
                      <>
                        <span className="text-muted text-decoration-line-through me-2">
                          L. {product.price}
                        </span>
                        <span className="fw-bold text-primary">L. {product.sale_price}</span>
                      </>
                    ) : (
                      <span className="fw-bold text-primary">L. {product.price}</span>
                    )}
                  </div>
                </div>
                <div className="card-footer bg-transparent">
                  <button
                    className="btn btn-primary w-100"
                    onClick={() => openModal(product, 'product')}
                  >
                    Agregar +
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Cart FAB */}
      <CartFAB />

      {/* Modal */}
      <AddToCartModal
        show={!!modalItem}
        onHide={() => setModalItem(null)}
        item={modalItem}
        type={modalType}
      />
    </div>
  );
};

// Floating cart button
const CartFAB = () => {
  const navigate = useNavigate();
  const cartCount = useSelector(state =>
    state.cart.items.reduce((sum, i) => sum + i.quantity, 0)
  );
  if (cartCount === 0) return null;
  return (
    <button
      className="btn btn-primary rounded-circle position-fixed"
      style={{ bottom: 24, right: 24, width: 64, height: 64, fontSize: 20, zIndex: 1000 }}
      onClick={() => navigate('/cart')}
    >
      🛒 <span className="badge bg-danger">{cartCount}</span>
    </button>
  );
};

export default MenuPage;
```

**Step 2: Register route in jsx/index.js**

Open `package/src/jsx/index.js` and add:
```javascript
import MenuPage from './pages/MenuPage';

// In allroutes array, update the '' (home) route:
{ url: '', component: <MenuPage /> },
{ url: 'menu', component: <MenuPage /> },
```

**Step 3: Verify in browser**

```
http://localhost:3000
# Should show promotions and products from Supabase
# Clicking "Agregar +" should open modal with drink selection
```

**Step 4: Commit**

```bash
git add package/src/jsx/pages/MenuPage.js package/src/jsx/index.js
git commit -m "feat: add MenuPage with products, promotions, and add-to-cart modal"
```

---

## Task 9: Build Cart Page

**Files:**
- Create: `package/src/jsx/pages/CartPage.js`
- Modify: `package/src/jsx/index.js`

**Step 1: Create CartPage.js**

```jsx
// package/src/jsx/pages/CartPage.js
import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  selectCartItems,
  selectCartSubtotal,
  removeFromCart,
  updateQuantity,
} from '../../store/slices/cartSlice';

const CartPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const items = useSelector(selectCartItems);
  const subtotal = useSelector(selectCartSubtotal);
  const TAX_RATE = 0.15;
  const taxAmount = subtotal * TAX_RATE;

  if (items.length === 0) {
    return (
      <div className="text-center py-5">
        <h4>Tu carrito está vacío</h4>
        <button className="btn btn-primary mt-3" onClick={() => navigate('/')}>
          Ver Menú
        </button>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <h3 className="mb-4">Tu Pedido</h3>
      <div className="row">
        <div className="col-lg-8">
          {items.map(item => {
            const unitPrice = item.itemData.sale_price || item.itemData.price;
            const drinksTotal = item.drinks.reduce((s, d) => s + d.price, 0);
            const lineTotal = (unitPrice + drinksTotal) * item.quantity;
            return (
              <div key={item.id} className="card mb-3">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <h5 className="mb-1">{item.itemData.name}</h5>
                      {item.drinks.length > 0 && (
                        <p className="text-muted small mb-1">
                          Bebidas: {item.drinks.map(d => d.name).join(', ')}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-muted small mb-1">Nota: {item.notes}</p>
                      )}
                      <p className="mb-0">L. {unitPrice} + L. {drinksTotal} bebidas</p>
                    </div>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => dispatch(removeFromCart(item.id))}
                    >×</button>
                  </div>
                  <div className="d-flex align-items-center gap-2 mt-2">
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => dispatch(updateQuantity({ id: item.id, quantity: Math.max(1, item.quantity - 1) }))}
                    >-</button>
                    <span className="fw-bold">{item.quantity}</span>
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => dispatch(updateQuantity({ id: item.id, quantity: item.quantity + 1 }))}
                    >+</button>
                    <span className="ms-auto fw-bold text-primary">L. {lineTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="col-lg-4">
          <div className="card">
            <div className="card-body">
              <h5>Resumen</h5>
              <ul className="list-unstyled">
                <li className="d-flex justify-content-between mb-2">
                  <span>Subtotal</span>
                  <span>L. {subtotal.toFixed(2)}</span>
                </li>
                <li className="d-flex justify-content-between mb-2">
                  <span>ISV (15%)</span>
                  <span>L. {taxAmount.toFixed(2)}</span>
                </li>
                <li className="d-flex justify-content-between mb-2 text-muted small">
                  <span>Delivery</span>
                  <span>Se calcula en checkout</span>
                </li>
                <hr />
                <li className="d-flex justify-content-between fw-bold fs-5">
                  <span>Total (sin delivery)</span>
                  <span>L. {(subtotal + taxAmount).toFixed(2)}</span>
                </li>
              </ul>
              <button
                className="btn btn-primary w-100 mt-3"
                onClick={() => navigate('/checkout')}
              >
                Proceder al Checkout
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartPage;
```

**Step 2: Register route in jsx/index.js**

```javascript
import CartPage from './pages/CartPage';
// Add to allroutes:
{ url: 'cart', component: <CartPage /> },
```

**Step 3: Verify in browser**

```
1. Go to http://localhost:3000
2. Add items to cart
3. Click cart FAB → should navigate to /cart
4. Verify quantities, remove, and price totals work
```

**Step 4: Commit**

```bash
git add package/src/jsx/pages/CartPage.js package/src/jsx/index.js
git commit -m "feat: add Cart page with quantity controls and order summary"
```

---

## Task 10: Build Checkout Page

**Files:**
- Create: `package/src/jsx/pages/CheckoutPage.js`
- Modify: `package/src/jsx/index.js`

**Step 1: Create CheckoutPage.js**

```jsx
// package/src/jsx/pages/CheckoutPage.js
import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useZones } from '../../queries/useZones';
import {
  selectCartItems,
  selectCartSubtotal,
  clearCart,
} from '../../store/slices/cartSlice';
import { setActiveOrder } from '../../store/slices/orderSlice';
import { supabase } from '../../supabaseClient';

const TAX_RATE = 0.15;

const CheckoutPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const items = useSelector(selectCartItems);
  const subtotal = useSelector(selectCartSubtotal);
  const { data: zones = [] } = useZones();

  const [deliveryType, setDeliveryType] = useState('delivery');
  const [customerName, setCustomerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [specificAddress, setSpecificAddress] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentFile, setPaymentFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const selectedZone = zones.find(z => z.id === parseInt(selectedZoneId));
  const deliveryFee = deliveryType === 'delivery' ? (selectedZone?.delivery_fee || 0) : 0;
  const taxAmount = subtotal * TAX_RATE;
  const totalAmount = subtotal + deliveryFee + taxAmount;

  const validate = () => {
    if (!customerName.trim()) return 'Nombre requerido';
    if (!/^\d{8}$/.test(phoneNumber.replace(/[-\s]/g, ''))) return 'Teléfono debe tener 8 dígitos';
    if (deliveryType === 'delivery' && !selectedZoneId) return 'Selecciona una zona';
    if (deliveryType === 'delivery' && !specificAddress.trim()) return 'Dirección requerida';
    if (!paymentFile) return 'Debes subir el comprobante de pago';
    if (items.length === 0) return 'Tu carrito está vacío';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Upload payment proof
      const fileExt = paymentFile.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('payments')
        .upload(fileName, paymentFile);
      if (uploadError) throw new Error(`Error subiendo comprobante: ${uploadError.message}`);

      const { data: { publicUrl } } = supabase.storage
        .from('payments')
        .getPublicUrl(uploadData.path);

      // 2. Build items payload
      const orderItems = items.map(item => ({
        product_id: item.type === 'product' ? item.itemId : null,
        promotion_id: item.type === 'promotion' ? item.itemId : null,
        quantity: item.quantity,
        unit_price: item.itemData.sale_price || item.itemData.price,
        notes: item.notes || '',
        drinks: item.drinks.map(d => d.id),
      }));

      // 3. Invoke Edge Function
      const { data, error: fnError } = await supabase.functions.invoke('process-order', {
        body: {
          customer_name: customerName,
          phone_number: phoneNumber.replace(/[-\s]/g, ''),
          delivery_type: deliveryType,
          zone_id: deliveryType === 'delivery' ? parseInt(selectedZoneId) : null,
          specific_address: deliveryType === 'delivery' ? specificAddress : null,
          notes: orderNotes,
          subtotal,
          delivery_fee: deliveryFee,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          payment_proof_url: publicUrl,
          items: orderItems,
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (!data?.order_id) throw new Error('No se recibió ID de orden');

      // 4. Save to Redux + localStorage
      dispatch(setActiveOrder({ orderId: data.order_id, status: 'pending' }));
      dispatch(clearCart());

      // 5. Navigate to status page
      navigate(`/status/${data.order_id}`);

    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-5">
        <h4>Tu carrito está vacío</h4>
        <button className="btn btn-primary mt-3" onClick={() => navigate('/')}>Ver Menú</button>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <h3 className="mb-4">Checkout</h3>
      {error && <div className="alert alert-danger">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="row">
          <div className="col-lg-8">

            {/* Delivery Type */}
            <div className="card mb-3">
              <div className="card-body">
                <h5>Tipo de entrega</h5>
                <div className="form-check mb-2">
                  <input className="form-check-input" type="radio" value="delivery"
                    checked={deliveryType === 'delivery'} onChange={e => setDeliveryType(e.target.value)} />
                  <label className="form-check-label">🚚 Entrega a domicilio</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="radio" value="pickup"
                    checked={deliveryType === 'pickup'} onChange={e => setDeliveryType(e.target.value)} />
                  <label className="form-check-label">🏪 Pasar recogiendo</label>
                </div>
              </div>
            </div>

            {/* Customer Info */}
            <div className="card mb-3">
              <div className="card-body">
                <h5>Tus datos</h5>
                <div className="mb-3">
                  <label className="form-label">Nombre completo *</label>
                  <input type="text" className="form-control" value={customerName}
                    onChange={e => setCustomerName(e.target.value)} required />
                </div>
                <div className="mb-3">
                  <label className="form-label">Teléfono (8 dígitos) *</label>
                  <input type="tel" className="form-control" value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)} placeholder="9999-9999" required />
                </div>
              </div>
            </div>

            {/* Delivery Info */}
            {deliveryType === 'delivery' && (
              <div className="card mb-3">
                <div className="card-body">
                  <h5>Dirección de entrega</h5>
                  <div className="mb-3">
                    <label className="form-label">Zona *</label>
                    <select className="form-select" value={selectedZoneId}
                      onChange={e => setSelectedZoneId(e.target.value)} required>
                      <option value="">Selecciona tu zona</option>
                      {zones.map(zone => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name} — L. {zone.delivery_fee}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Dirección específica *</label>
                    <textarea className="form-control" rows={3} value={specificAddress}
                      onChange={e => setSpecificAddress(e.target.value)}
                      placeholder="Barrio, calle, referencia..." required />
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="card mb-3">
              <div className="card-body">
                <label className="form-label">Notas adicionales (opcional)</label>
                <textarea className="form-control" rows={2} value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  placeholder="Instrucciones especiales para el pedido..." />
              </div>
            </div>

            {/* Payment Proof */}
            <div className="card mb-3">
              <div className="card-body">
                <h5>Comprobante de pago *</h5>
                <p className="text-muted small">
                  Realiza la transferencia al número de cuenta y sube la captura de pantalla.
                </p>
                <input
                  type="file"
                  className="form-control"
                  accept="image/*"
                  onChange={e => setPaymentFile(e.target.files[0])}
                  required
                />
                {paymentFile && (
                  <p className="text-success small mt-1">✓ {paymentFile.name}</p>
                )}
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="col-lg-4">
            <div className="card sticky-top" style={{ top: 20 }}>
              <div className="card-body">
                <h5>Resumen del Pedido</h5>
                {items.map(item => (
                  <div key={item.id} className="d-flex justify-content-between mb-1 small">
                    <span>{item.itemData.name} x{item.quantity}</span>
                    <span>L. {((item.itemData.sale_price || item.itemData.price) * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <hr />
                <ul className="list-unstyled">
                  <li className="d-flex justify-content-between mb-1">
                    <span>Subtotal</span><span>L. {subtotal.toFixed(2)}</span>
                  </li>
                  {deliveryType === 'delivery' && (
                    <li className="d-flex justify-content-between mb-1">
                      <span>Delivery</span>
                      <span>{selectedZone ? `L. ${deliveryFee.toFixed(2)}` : '—'}</span>
                    </li>
                  )}
                  <li className="d-flex justify-content-between mb-1">
                    <span>ISV (15%)</span><span>L. {taxAmount.toFixed(2)}</span>
                  </li>
                  <hr />
                  <li className="d-flex justify-content-between fw-bold fs-5">
                    <span>Total</span><span>L. {totalAmount.toFixed(2)}</span>
                  </li>
                </ul>
                <button
                  type="submit"
                  className="btn btn-primary w-100 mt-3"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Procesando...' : 'Realizar Pedido'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default CheckoutPage;
```

**Step 2: Register route in jsx/index.js**

```javascript
import CheckoutPage from './pages/CheckoutPage';
// Update existing checkout route (url: 'checkout') or add new:
{ url: 'checkout', component: <CheckoutPage /> },
```

**Step 3: Commit**

```bash
git add package/src/jsx/pages/CheckoutPage.js package/src/jsx/index.js
git commit -m "feat: add Checkout page with delivery/pickup, zone selection, and payment proof upload"
```

---

## Task 11: Create process-order Edge Function

**Files:**
- Create: `supabase/functions/process-order/index.ts`

**Step 1: Create the function directory and file**

```bash
mkdir -p supabase/functions/process-order
```

```typescript
// supabase/functions/process-order/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 3600000; // 1 hour

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const payload = await req.json();
    const {
      customer_name, phone_number, delivery_type, zone_id, specific_address,
      notes, payment_proof_url, items, subtotal, delivery_fee, tax_amount, total_amount
    } = payload;

    // 1. Validate required fields
    if (!customer_name || !phone_number || !payment_proof_url || !items?.length) {
      throw new Error('Campos requeridos faltantes');
    }

    // 2. Rate limiting
    const oneHourAgo = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('phone_number', phone_number)
      .gte('created_at', oneHourAgo);
    if ((count ?? 0) >= RATE_LIMIT) {
      throw new Error('Límite de pedidos excedido. Intenta en 1 hora.');
    }

    // 3. Re-validate prices from DB
    let calculatedSubtotal = 0;
    for (const item of items) {
      const table = item.product_id ? 'products' : 'promotions';
      const id = item.product_id || item.promotion_id;
      const { data: record, error } = await supabase
        .from(table)
        .select('price, sale_price')
        .eq('id', id)
        .single();
      if (error || !record) throw new Error(`Producto no encontrado: ${id}`);
      const effectivePrice = record.sale_price || record.price;
      calculatedSubtotal += effectivePrice * item.quantity;

      // Add drinks to subtotal
      if (item.drinks?.length) {
        for (const drinkId of item.drinks) {
          const { data: drink } = await supabase
            .from('drinks')
            .select('price')
            .eq('id', drinkId)
            .single();
          if (drink) calculatedSubtotal += drink.price * item.quantity;
        }
      }
    }

    // 4. Validate delivery fee
    let calculatedDeliveryFee = 0;
    if (delivery_type === 'delivery' && zone_id) {
      const { data: zone } = await supabase
        .from('zones')
        .select('delivery_fee')
        .eq('id', zone_id)
        .single();
      calculatedDeliveryFee = zone?.delivery_fee || 0;
    }

    const calculatedTax = Math.round(calculatedSubtotal * 0.15 * 100) / 100;
    const calculatedTotal = Math.round((calculatedSubtotal + calculatedDeliveryFee + calculatedTax) * 100) / 100;

    // Allow small floating point difference
    if (Math.abs(calculatedTotal - total_amount) > 0.02) {
      throw new Error(`Total no coincide. Esperado: ${calculatedTotal}, Recibido: ${total_amount}`);
    }

    // 5. Create order via stored procedure
    const { data: orderResult, error: orderError } = await supabase.rpc('create_order', {
      p_customer_name: customer_name,
      p_phone_number: phone_number,
      p_delivery_type: delivery_type,
      p_zone_id: zone_id || null,
      p_specific_address: specific_address || null,
      p_subtotal: calculatedSubtotal,
      p_delivery_fee: calculatedDeliveryFee,
      p_tax_amount: calculatedTax,
      p_total_amount: calculatedTotal,
      p_payment_proof_url: payment_proof_url,
      p_notes: notes || '',
      p_items: JSON.stringify(items),
    });

    if (orderError) throw new Error(`Error creando orden: ${orderError.message}`);
    const orderId = orderResult[0]?.id || orderResult?.id;
    if (!orderId) throw new Error('No se obtuvo ID de orden');

    // 6. Send WhatsApp notification (non-blocking)
    const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_BUSINESS_PHONE_ID');
    const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const RESTAURANT_PHONE = Deno.env.get('RESTAURANT_PHONE_NUMBER');

    if (WHATSAPP_PHONE_ID && WHATSAPP_TOKEN && RESTAURANT_PHONE) {
      try {
        const deliveryInfo = delivery_type === 'delivery'
          ? `📍 Zona ID: ${zone_id}\n🏠 Dirección: ${specific_address}`
          : `🏪 PARA RECOGER EN LOCAL`;

        const itemsSummary = items.map((item: any) => {
          const label = item.product_id ? `Producto #${item.product_id}` : `Promo #${item.promotion_id}`;
          const drinks = item.drinks?.length ? ` + bebidas: ${item.drinks.join(', ')}` : '';
          const note = item.notes ? ` (${item.notes})` : '';
          return `• x${item.quantity} ${label}${drinks}${note}`;
        }).join('\n');

        await fetch(
          `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: RESTAURANT_PHONE,
              type: 'interactive',
              interactive: {
                type: 'button',
                body: {
                  text: `🆕 NUEVO PEDIDO #${String(orderId).slice(0, 8)}\n\n👤 ${customer_name}\n📱 ${phone_number}\n\n${deliveryInfo}\n\n📦 Productos:\n${itemsSummary}\n\n💰 Subtotal: L. ${calculatedSubtotal}\n🚚 Delivery: L. ${calculatedDeliveryFee}\n📊 ISV: L. ${calculatedTax}\n✅ TOTAL: L. ${calculatedTotal}\n\n💳 Comprobante: ${payment_proof_url}`,
                },
                action: {
                  buttons: [
                    { type: 'reply', reply: { id: `accept_${orderId}`, title: '✅ Aceptar' } },
                    { type: 'reply', reply: { id: `reject_${orderId}`, title: '❌ Rechazar' } },
                  ],
                },
              },
            }),
          }
        );
      } catch (whatsappError) {
        console.error('WhatsApp failed:', whatsappError);
        // Mark in notes but don't fail the order
        await supabase
          .from('orders')
          .update({ notes: `WHATSAPP_FAILED | ${notes || ''}` })
          .eq('id', orderId);
      }
    }

    return new Response(
      JSON.stringify({ order_id: orderId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('process-order error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
```

**Step 2: Test the function locally**

```bash
# From project root
supabase functions serve process-order --env-file .env.local
# Expected: "Serving functions on http://localhost:54321/functions/v1/"
```

**Step 3: Test with curl**

```bash
curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/process-order' \
  --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7kyqd7O_owF5LqRGnFyBBbMLuMa3uQFvxbE' \
  --header 'Content-Type: application/json' \
  --data '{
    "customer_name": "Test User",
    "phone_number": "99999999",
    "delivery_type": "pickup",
    "zone_id": null,
    "specific_address": null,
    "notes": "",
    "subtotal": 120,
    "delivery_fee": 0,
    "tax_amount": 18,
    "total_amount": 138,
    "payment_proof_url": "https://example.com/test.jpg",
    "items": [{"product_id": 1, "promotion_id": null, "quantity": 1, "unit_price": 120, "notes": "", "drinks": []}]
  }'
# Expected: {"order_id": "uuid..."}
```

**Step 4: Commit**

```bash
git add supabase/functions/process-order/
git commit -m "feat: add process-order Edge Function with price validation, rate limiting, and WhatsApp notification"
```

---

## Task 12: Create whatsapp-webhook Edge Function

**Files:**
- Create: `supabase/functions/whatsapp-webhook/index.ts`

**Step 1: Create the function**

```bash
mkdir -p supabase/functions/whatsapp-webhook
```

```typescript
// supabase/functions/whatsapp-webhook/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const WEBHOOK_VERIFY_TOKEN = Deno.env.get('WEBHOOK_VERIFY_TOKEN');

  // Webhook verification (GET request from Meta)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  // Handle webhook events (POST)
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (message?.type === 'interactive') {
      const buttonId = message.interactive?.button_reply?.id;
      if (buttonId) {
        const parts = buttonId.split('_');
        const action = parts[0]; // 'accept' or 'reject'
        const orderId = parts.slice(1).join('_'); // UUID (may contain underscores)

        const newStatus = action === 'accept' ? 'confirmed' : 'rejected';

        const { error } = await supabase
          .from('orders')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', orderId);

        if (error) {
          console.error('Failed to update order status:', error);
        } else {
          console.log(`Order ${orderId} updated to ${newStatus}`);
        }
      }
    }

    // Always return 200 to WhatsApp to acknowledge receipt
    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('OK', { status: 200 });
  }
});
```

**Step 2: Commit**

```bash
git add supabase/functions/whatsapp-webhook/
git commit -m "feat: add whatsapp-webhook Edge Function for order accept/reject from WhatsApp buttons"
```

---

## Task 13: Build Order Status Page

**Files:**
- Create: `package/src/jsx/pages/OrderStatusPage.js`
- Modify: `package/src/jsx/index.js`

**Step 1: Create OrderStatusPage.js**

```jsx
// package/src/jsx/pages/OrderStatusPage.js
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { supabase } from '../../supabaseClient';
import { clearActiveOrder } from '../../store/slices/orderSlice';

const STATUS_STEPS = [
  { key: 'pending',           label: 'Pedido Recibido',    icon: '📋' },
  { key: 'confirmed',         label: 'Confirmado',         icon: '✅' },
  { key: 'preparing',         label: 'Preparando',         icon: '👨‍🍳' },
  { key: 'out_for_delivery',  label: 'En Camino',          icon: '🚚' },
  { key: 'delivered',         label: 'Entregado',          icon: '🎉' },
];

const OrderStatusPage = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Initial fetch
    const fetchOrder = async () => {
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();
      if (fetchError) { setError(fetchError.message); }
      else { setOrder(data); }
      setLoading(false);
    };
    fetchOrder();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`order:${orderId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      }, (payload) => {
        setOrder(prev => ({ ...prev, ...payload.new }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  const handleNewOrder = () => {
    dispatch(clearActiveOrder());
    navigate('/');
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 300 }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="text-center py-5">
        <h4>Pedido no encontrado</h4>
        <button className="btn btn-primary mt-3" onClick={() => navigate('/')}>Inicio</button>
      </div>
    );
  }

  const isRejected = order.status === 'rejected';
  const isDelivered = order.status === 'delivered';
  const currentStepIndex = STATUS_STEPS.findIndex(s => s.key === order.status);

  return (
    <div className="container py-4">
      <div className="row justify-content-center">
        <div className="col-md-8">
          <div className="card shadow">
            <div className="card-body p-4">
              <h3 className="text-center mb-1">Estado de tu Pedido</h3>
              <p className="text-center text-muted small mb-4">
                #{String(orderId).slice(0, 8).toUpperCase()}
              </p>

              {isRejected ? (
                <div className="text-center py-4">
                  <div style={{ fontSize: 60 }}>❌</div>
                  <h4 className="text-danger mt-3">Pedido Rechazado</h4>
                  <p className="text-muted">El restaurante no pudo procesar tu pedido en este momento.</p>
                  <button className="btn btn-primary mt-3" onClick={handleNewOrder}>
                    Hacer Nuevo Pedido
                  </button>
                </div>
              ) : (
                <>
                  {/* Status Stepper */}
                  <div className="d-flex justify-content-between align-items-start mb-4 position-relative">
                    <div
                      className="position-absolute bg-secondary"
                      style={{ top: 24, left: '10%', right: '10%', height: 2, zIndex: 0 }}
                    />
                    {STATUS_STEPS.map((step, index) => {
                      const isDone = index <= currentStepIndex;
                      const isCurrent = index === currentStepIndex;
                      return (
                        <div key={step.key} className="text-center flex-fill position-relative" style={{ zIndex: 1 }}>
                          <div
                            className={`rounded-circle d-inline-flex align-items-center justify-content-center mb-2 ${isDone ? 'bg-primary text-white' : 'bg-light border'}`}
                            style={{ width: 48, height: 48, fontSize: 20 }}
                          >
                            {step.icon}
                          </div>
                          <div
                            className={`small ${isCurrent ? 'fw-bold text-primary' : isDone ? 'text-success' : 'text-muted'}`}
                          >
                            {step.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Order details */}
                  <div className="bg-light rounded p-3 mb-3">
                    <div className="row">
                      <div className="col-6"><strong>Cliente:</strong> {order.customer_name}</div>
                      <div className="col-6"><strong>Teléfono:</strong> {order.phone_number}</div>
                      <div className="col-6 mt-2">
                        <strong>Tipo:</strong> {order.delivery_type === 'delivery' ? '🚚 Delivery' : '🏪 Pickup'}
                      </div>
                      <div className="col-6 mt-2">
                        <strong>Total:</strong> L. {parseFloat(order.total_amount).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {isDelivered && (
                    <div className="text-center mt-3">
                      <p className="text-success fw-bold">¡Tu pedido fue entregado! 🎉</p>
                      <button className="btn btn-primary" onClick={handleNewOrder}>
                        Hacer Nuevo Pedido
                      </button>
                    </div>
                  )}

                  {!isDelivered && (
                    <p className="text-center text-muted small mt-3">
                      Esta página se actualiza automáticamente
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderStatusPage;
```

**Step 2: Register route in jsx/index.js**

```javascript
import OrderStatusPage from './pages/OrderStatusPage';
// Add to allroutes - note: this needs a param, add it OUTSIDE allroutes in the Routes section
```

Since the status route uses a URL param (`/status/:orderId`), it needs to be added directly to the Routes section in `jsx/index.js`:

```jsx
// In the Routes section:
<Route element={<MainLayout />}>
  {allroutes.map((data, i) => (
    <Route key={i} exact path={`${data.url}`} element={data.component} />
  ))}
  <Route path="status/:orderId" element={<OrderStatusPage />} />
</Route>
```

**Step 3: Verify real-time works**

```
1. Go to http://localhost:3000 and place a test order (use pickup to skip zone)
2. You should be redirected to /status/:orderId
3. In Supabase Studio → Table Editor → orders
4. Manually update the status field on the order
5. The status page should update in real time without refresh
```

**Step 4: Commit**

```bash
git add package/src/jsx/pages/OrderStatusPage.js package/src/jsx/index.js
git commit -m "feat: add Order Status page with real-time Supabase Realtime updates and status stepper"
```

---

## Task 14: Configure .env and Test End-to-End Flow

**Files:**
- Create: `package/.env` (NOT committed)
- Modify: `package/.gitignore`

**Step 1: Get local Supabase credentials**

```bash
supabase status
# Copy: API URL and anon key
```

**Step 2: Create .env file**

```bash
# package/.env (do NOT commit)
REACT_APP_SUPABASE_URL=http://127.0.0.1:54321
REACT_APP_SUPABASE_ANON_KEY=<anon_key_from_supabase_status>
```

**Step 3: Ensure .env is gitignored**

Open `package/.gitignore` and verify `.env` is listed. If not:
```
# Add to package/.gitignore:
.env
.env.local
.env.production
```

**Step 4: Restart dev server**

```bash
cd package && npm start
```

**Step 5: Run full end-to-end test**

```
Happy path - Pickup:
☐ Open http://localhost:3000
☐ See promotions and products (from Supabase seed data)
☐ Click "Agregar +" on a product → modal opens
☐ Select a drink, add notes, set quantity to 2
☐ Click "Agregar al Carrito"
☐ Cart FAB appears with count
☐ Click FAB → navigate to /cart
☐ Verify items, subtotal, tax totals
☐ Click "Proceder al Checkout"
☐ Select "Pasar recogiendo"
☐ Enter name: "Juan Test", phone: "99999999"
☐ Upload any image as payment proof
☐ Click "Realizar Pedido"
☐ Redirected to /status/:orderId
☐ Status stepper shows "Pedido Recibido"

Happy path - Active order redirect:
☐ Reload the page → still on /status/:orderId (persisted)
☐ Navigate to / → immediately redirected back to /status
☐ In Supabase Studio, update status to 'delivered'
☐ Status page updates in real time to show delivered
☐ "Hacer Nuevo Pedido" button appears
☐ Click it → redirected to /, can make new order

Edge case - Delivery:
☐ From /, select a product and go to checkout
☐ Select "Entrega a domicilio"
☐ Select a zone → delivery fee appears in summary
☐ Fill address and submit
☐ Order created with zone and address
```

**Step 6: Commit .gitignore update**

```bash
git add package/.gitignore
git commit -m "chore: ensure .env files are gitignored"
```

---

## Task 15: Deploy to Production (Optional)

**Step 1: Create production Supabase project**

```
1. Go to https://app.supabase.com
2. New Project → fill details
3. Copy Project URL and anon key
```

**Step 2: Link and push migrations**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
# Apply seed data manually via Supabase Studio SQL editor
```

**Step 3: Configure Edge Function secrets**

```bash
supabase secrets set WHATSAPP_BUSINESS_PHONE_ID=<id>
supabase secrets set WHATSAPP_ACCESS_TOKEN=<token>
supabase secrets set WEBHOOK_VERIFY_TOKEN=<random_secret>
supabase secrets set RESTAURANT_PHONE_NUMBER=<504XXXXXXXX>
```

**Step 4: Deploy Edge Functions**

```bash
supabase functions deploy process-order
supabase functions deploy whatsapp-webhook
```

**Step 5: Deploy frontend to Vercel**

```bash
cd package
vercel --prod
# Set env vars in Vercel dashboard:
# REACT_APP_SUPABASE_URL=https://your-project.supabase.co
# REACT_APP_SUPABASE_ANON_KEY=your-production-anon-key
```

**Step 6: Configure WhatsApp Webhook**

```
In Meta Developers Console:
- Callback URL: https://your-project.supabase.co/functions/v1/whatsapp-webhook
- Verify Token: (same as WEBHOOK_VERIFY_TOKEN secret)
- Subscribed fields: messages
```

---

## Implementation Order Summary

| # | Task | Estimated Effort | Dependencies |
|---|------|-----------------|--------------|
| 1 | Install dependencies | 5 min | None |
| 2 | Database migrations | 20 min | None |
| 3 | Seed data | 10 min | Task 2 |
| 4 | TanStack Query setup | 10 min | Task 1 |
| 5 | Redux slices | 20 min | Task 1 |
| 6 | Query hooks | 15 min | Task 4 |
| 7 | AddToCartModal | 30 min | Tasks 5, 6 |
| 8 | MenuPage | 30 min | Tasks 6, 7 |
| 9 | CartPage | 20 min | Task 5 |
| 10 | CheckoutPage | 45 min | Tasks 5, 6 |
| 11 | process-order function | 45 min | Task 2 |
| 12 | whatsapp-webhook function | 20 min | Task 2 |
| 13 | OrderStatusPage | 30 min | None |
| 14 | E2E test | 20 min | All tasks |
| 15 | Production deploy | 60 min | All tasks |
