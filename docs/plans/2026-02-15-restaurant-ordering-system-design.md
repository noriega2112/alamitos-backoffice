# Alamitos - Sistema de Pedidos Web - Design Document

**Fecha:** 2026-02-15
**Versión:** 1.0
**Stack:** Create React App + Supabase + WhatsApp Business API

---

## 1. Executive Summary & Goals

### Overview
Sistema web de pedidos para restaurante en Honduras. Los clientes navegan el menú, arman su pedido con productos/promociones y bebidas, suben comprobante de pago por transferencia bancaria, y realizan el pedido. El restaurante recibe notificación automática vía WhatsApp con todos los detalles. El cliente puede rastrear el estado de su pedido en tiempo real.

### Key Goals
1. **Simplicidad operativa:** El restaurante no necesita dashboard web. Todo se gestiona desde WhatsApp + Supabase Studio.
2. **Automatización:** Cero intervención manual para procesar y notificar pedidos.
3. **Seguridad:** Validación backend, pago anticipado obligatorio, datos auditables.
4. **Persistencia:** Cliente no puede hacer nuevo pedido hasta que el actual se complete/rechace.

### Success Criteria
- Cliente puede realizar pedido end-to-end en < 3 minutos
- Restaurante recibe WhatsApp en < 30 segundos post-checkout
- Sistema soporta 50+ pedidos concurrentes sin degradación
- Cero pedidos perdidos (transacciones atómicas)

### Non-Goals (YAGNI)
- ❌ Dashboard web para restaurante (se usa WhatsApp + Supabase Studio)
- ❌ Sistema de usuarios/login para clientes
- ❌ Pagos en línea integrados (solo comprobante de transferencia)
- ❌ Chat en vivo
- ❌ Programa de lealtad/puntos

---

## 2. System Architecture Overview

### Tech Stack
- **Frontend:** Create React App (React 18 + React Router v6 + Redux Toolkit)
- **Backend:** Supabase (PostgreSQL 15 + Edge Functions + Storage + Realtime)
- **Notifications:** WhatsApp Business API (Meta Cloud API)
- **Hosting:** Vercel (frontend) + Supabase Cloud (backend)
- **Development:** Local Supabase via Docker

### Architecture Pattern: Edge Function-Centric

```
┌─────────────┐
│   Browser   │
│  (React)    │
└──────┬──────┘
       │
       │ 1. Upload payment proof
       ├──────────────────────────────┐
       │                              │
       │                         ┌────▼─────┐
       │                         │ Storage  │
       │                         │ (payments)│
       │                         └──────────┘
       │
       │ 2. Invoke Edge Function
       │    with order payload
       │
  ┌────▼────────────────┐
  │  Edge Function      │
  │  process-order      │
  │                     │
  │  - Validate         │
  │  - DB Transaction   │
  │  - Send WhatsApp    │
  └────┬────────────────┘
       │
       ├───────────┬──────────────┐
       │           │              │
   ┌───▼───┐  ┌───▼────┐   ┌─────▼──────┐
   │orders │  │order_  │   │  WhatsApp  │
   │table  │  │items   │   │    API     │
   └───┬───┘  └────────┘   └────────────┘
       │
       │ 3. Realtime updates
       │
  ┌────▼──────────┐
  │  Browser      │
  │  (Status page)│
  └───────────────┘
```

### Key Principles
1. **Single Source of Truth:** Edge Function es el único punto de entrada para crear pedidos
2. **Atomic Transactions:** Order + items + drinks se crean en una sola transacción
3. **Fail-Safe:** Si WhatsApp falla, rollback completo de DB
4. **Stateless Frontend:** Todo el estado crítico vive en Supabase

---

## 3. Database Schema

### Enums

```sql
CREATE TYPE delivery_type AS ENUM ('delivery', 'pickup');
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'rejected');
```

### Tables

**zones** - Delivery zones with fixed fees
```sql
CREATE TABLE zones (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  delivery_fee DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_zones_active ON zones(is_active);
```

**categories** - Product categories
```sql
CREATE TABLE categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**products** - Regular menu items with optional sale pricing
```sql
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT REFERENCES categories(id),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,           -- "Precio regular" (puede ser inflado)
  sale_price DECIMAL(10,2),               -- "Precio de oferta" (precio real)
  sale_start_date TIMESTAMPTZ,            -- NULL = oferta permanente
  sale_end_date TIMESTAMPTZ,              -- NULL = sin fecha fin
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Solo validar que si hay fechas, end > start
  CONSTRAINT valid_sale_dates CHECK (
    (sale_start_date IS NULL OR sale_end_date IS NULL)
    OR
    (sale_end_date > sale_start_date)
  )
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_on_sale ON products(sale_price) WHERE sale_price IS NOT NULL;
```

**promotions** - Time-limited special combos
```sql
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
```

**drinks** - Beverages (always additional cost)
```sql
CREATE TABLE drinks (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**orders** - Main order table
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,

  -- Delivery info (nullable para pickup)
  delivery_type delivery_type NOT NULL DEFAULT 'delivery',
  zone_id BIGINT REFERENCES zones(id),           -- NULL si pickup
  specific_address TEXT,                         -- NULL si pickup
  notes TEXT,

  -- Pricing
  subtotal DECIMAL(10,2) NOT NULL,
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0, -- 0 si pickup
  tax_amount DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,

  payment_proof_url TEXT NOT NULL,
  status order_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Validación condicional
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
```

**order_items** - Line items (product OR promotion, mutually exclusive)
```sql
CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id),      -- Nullable
  promotion_id BIGINT REFERENCES promotions(id),  -- Nullable
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL,              -- Precio del producto/promo al momento del pedido
  notes TEXT,                                     -- Ej: "Sin cebolla", "Término medio"
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Debe tener product_id O promotion_id, no ambos
  CONSTRAINT item_type_check CHECK (
    (product_id IS NOT NULL AND promotion_id IS NULL)
    OR
    (product_id IS NULL AND promotion_id IS NOT NULL)
  )
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
```

**order_item_drinks** - Many-to-many: items ↔ drinks
```sql
CREATE TABLE order_item_drinks (
  id BIGSERIAL PRIMARY KEY,
  order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  drink_id BIGINT NOT NULL REFERENCES drinks(id),
  drink_price DECIMAL(10,2) NOT NULL,  -- Precio de la bebida al momento del pedido
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(order_item_id, drink_id)  -- Evitar duplicados
);

CREATE INDEX idx_order_item_drinks_item ON order_item_drinks(order_item_id);
```

---

## 4. Frontend Architecture (React)

### Página Principal: Dashboard (reutilizar DashboardDark.js)

**Ruta:** `/`

**Layout:**
```
┌─────────────────────────────────────┐
│  BannerSlider (promociones)         │  ← Reutilizar, conectar a Supabase
├─────────────────────────────────────┤
│  CategorySlider                     │  ← Reutilizar, conectar a Supabase
├─────────────────────────────────────┤
│  PopularDishesSlider (productos)    │  ← Reutilizar, conectar a Supabase
└─────────────────────────────────────┘
```

### Componentes del Template a Reutilizar

**1. Quantity Control** (DashboardDark.js)
```jsx
<div className="quntity">
  <button data-decrease onClick={() => handleCountMinus(id)}>-</button>
  <input data-value type="text" value={quantity} readOnly />
  <button data-increase onClick={() => handleCountAdd(id)}>+</button>
</div>
```

**2. Product Card** (PopularDishesSlider.js)
```jsx
<div className="card dishe-bx">
  <div className="card-header">
    <span className="badge badge-danger">15% Off</span>
    <i className="fa-solid fa-heart c-heart active"></i>
  </div>
  <div className="card-body text-center">
    <img src={product.image_url} />
  </div>
  <div className="card-footer">
    <ul className="star-rating">{/* 5 estrellas */}</ul>
    <div className="common">
      <h4>{product.name}</h4>
      {product.sale_price ? (
        <>
          <span className="text-muted" style={{textDecoration: 'line-through'}}>
            L. {product.price}
          </span>
          <h3 className="text-primary">L. {product.sale_price}</h3>
        </>
      ) : (
        <h3 className="text-primary">L. {product.price}</h3>
      )}
      <div className="plus active" onClick={openModal}>
        {/* Botón + para agregar */}
      </div>
    </div>
  </div>
</div>
```

**3. ProductDetail → ProductDetailModal**
```jsx
<Modal show={isOpen} onHide={onClose} size="xl">
  <Modal.Body>
    {/* Reutilizar diseño existente de ProductDetail */}
    <ProductDetailContent product={selectedProduct} />

    {/* AGREGAR: */}
    <DrinkSelector drinks={drinks} onChange={setSelectedDrinks} />
    <NotesInput value={notes} onChange={setNotes} />
    <div className="quntity">
      <button data-decrease>-</button>
      <input data-value type="text" value={qty} />
      <button data-increase>+</button>
    </div>
    <button className="btn btn-primary btn-block" onClick={addToCart}>
      Agregar al Carrito - L. {calculateTotal()}
    </button>
  </Modal.Body>
</Modal>
```

**4. Checkout Form** (adaptar CheckoutPage.js)
```jsx
const CheckoutPage = () => {
  const [deliveryType, setDeliveryType] = useState('delivery');
  const [selectedZone, setSelectedZone] = useState(null);

  const deliveryFee = deliveryType === 'delivery'
    ? selectedZone?.delivery_fee || 0
    : 0;

  const total = subtotal + deliveryFee + taxAmount;

  return (
    <div className="row">
      <div className="col-xl-8">
        {/* 1. Delivery Type Selector */}
        <div className="form-check">
          <input type="radio" value="delivery" checked={deliveryType === 'delivery'} />
          <label>🚚 Entrega a domicilio</label>
        </div>
        <div className="form-check">
          <input type="radio" value="pickup" checked={deliveryType === 'pickup'} />
          <label>🏪 Pasar recogiendo</label>
        </div>

        {/* 2. Customer Info */}
        <input className="form-control" placeholder="Nombre completo" required />
        <input className="form-control" placeholder="Teléfono" required />

        {/* 3. Delivery Info (solo si delivery) */}
        {deliveryType === 'delivery' && (
          <>
            <Select options={zones} placeholder="Selecciona tu zona" />
            <textarea placeholder="Dirección específica" required />
          </>
        )}

        {/* 4. Payment Upload */}
        <PaymentUploadComponent />
      </div>

      <div className="col-xl-4">
        {/* Resumen */}
        <ul>
          <li>Subtotal: L. {subtotal.toFixed(2)}</li>
          {deliveryType === 'delivery' && (
            <li>Delivery: L. {deliveryFee.toFixed(2)}</li>
          )}
          <li>ISV (15%): L. {taxAmount.toFixed(2)}</li>
          <li><strong>Total: L. {total.toFixed(2)}</strong></li>
        </ul>
      </div>
    </div>
  );
};
```

### Data Fetching: TanStack Query

```javascript
// queries/useCatalog.js
export const useProducts = () => {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true);
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
};

export const usePromotions = () => {
  return useQuery({
    queryKey: ['promotions'],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from('promotions')
        .select('*')
        .eq('is_active', true)
        .gte('end_date', now)
        .lte('start_date', now);
      return data;
    },
  });
};
```

### State Management: Redux (solo para cart)

```javascript
// cartSlice.js
{
  items: [
    {
      id: 'uuid',
      type: 'product' | 'promotion',
      itemId: 123,
      itemData: {...}, // snapshot del producto/promo
      quantity: 2,
      drinks: [{id: 1, name: 'Coca Cola', price: 15}],
      notes: 'Sin cebolla'
    }
  ]
}

// orderSlice.js
{
  activeOrderId: 'uuid' | null, // synced con localStorage
  orderStatus: 'pending' | 'confirmed' | ...
}
```

---

## 5. Backend Architecture - Edge Functions

### Edge Function 1: `process-order`

**Ubicación:** `supabase/functions/process-order/index.ts`

**Flow:**
```typescript
serve(async (req) => {
  try {
    // 1. Parse & validate payload
    const payload = await req.json();
    validateOrderPayload(payload);

    // 2. Check rate limit
    await checkRateLimit(payload.phone_number);

    // 3. Calculate totals (re-validate prices from DB)
    const totals = await recalculateTotals(
      payload.items,
      payload.delivery_type,
      payload.zone_id
    );

    // 4. Create order (transaction via stored procedure)
    const { data: order } = await supabase.rpc('create_order', {
      ...payload,
      ...totals
    });

    // 5. Send WhatsApp with interactive buttons
    try {
      await sendWhatsAppNotification(order);
    } catch (whatsappError) {
      // Log but don't fail order
      console.error('WhatsApp failed:', whatsappError);
    }

    return new Response(JSON.stringify({ order_id: order.id }), {
      status: 200
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400
    });
  }
});
```

**WhatsApp Integration:**
```typescript
async function sendWhatsAppNotification(order) {
  const deliveryInfo = order.delivery_type === 'delivery'
    ? `📍 Zona: ${order.zone_name}\n🏠 Dirección: ${order.specific_address}`
    : `🏪 PARA RECOGER EN LOCAL`;

  await fetch(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: RESTAURANT_PHONE_NUMBER,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: `🆕 NUEVO PEDIDO #${order.id.slice(0, 8)}

👤 Cliente: ${order.customer_name}
📱 Teléfono: ${order.phone_number}

${deliveryInfo}

📦 Productos:
${formatOrderSummary(order)}

💰 Total: L. ${order.total_amount}
   • Subtotal: L. ${order.subtotal}
   • Delivery: L. ${order.delivery_fee}
   • ISV (15%): L. ${order.tax_amount}

💳 Comprobante: ${order.payment_proof_url}`
          },
          action: {
            buttons: [
              {
                type: 'reply',
                reply: { id: `accept_${order.id}`, title: '✅ Aceptar' }
              },
              {
                type: 'reply',
                reply: { id: `reject_${order.id}`, title: '❌ Rechazar' }
              }
            ]
          }
        }
      })
    }
  );
}
```

### Edge Function 2: `whatsapp-webhook`

**Responsabilidad:** Recibir clicks en botones de WhatsApp

```typescript
serve(async (req) => {
  try {
    // Webhook verification (GET)
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
    const body = await req.json();
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (message?.type === 'interactive') {
      const buttonId = message.interactive.button_reply.id;
      const [action, orderId] = buttonId.split('_');

      // Update order status
      const newStatus = action === 'accept' ? 'confirmed' : 'rejected';

      await supabase
        .from('orders')
        .update({ status: newStatus, updated_at: new Date() })
        .eq('id', orderId);

      // Cliente verá cambio en tiempo real via Supabase Realtime
    }

    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('OK', { status: 200 }); // Always return 200 to WhatsApp
  }
});
```

### Database Function: `create_order`

```sql
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
  -- Insert order
  INSERT INTO orders (
    customer_name, phone_number, delivery_type, zone_id, specific_address,
    subtotal, delivery_fee, tax_amount, total_amount, payment_proof_url, notes, status
  ) VALUES (
    p_customer_name, p_phone_number, p_delivery_type, p_zone_id, p_specific_address,
    p_subtotal, p_delivery_fee, p_tax_amount, p_total_amount, p_payment_proof_url, p_notes, 'pending'
  ) RETURNING id INTO v_order_id;

  -- Insert order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (
      order_id, product_id, promotion_id, quantity, unit_price, notes
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::BIGINT,
      (v_item->>'promotion_id')::BIGINT,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::DECIMAL,
      v_item->>'notes'
    ) RETURNING id INTO v_order_item_id;

    -- Insert drinks for this item
    FOR v_drink_id IN
      SELECT jsonb_array_elements_text(v_item->'drinks')::BIGINT
    LOOP
      INSERT INTO order_item_drinks (order_item_id, drink_id, drink_price)
      SELECT v_order_item_id, v_drink_id, price
      FROM drinks WHERE id = v_drink_id;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_order_id;
END;
$$ LANGUAGE plpgsql;
```

---

## 6. User Flows

### Flow 1: Order Placement

```
1. Cliente entra → App verifica localStorage['active_order_id']
2. Si existe orden activa (status ≠ delivered/rejected) → Redirect a /status
3. Si no, mostrar Home con promociones + productos
4. Click en producto → Abre modal con detalles
5. Selecciona bebidas, cantidad, notas → "Agregar al Carrito"
6. Redux: dispatch(addToCart)
7. Ir a /cart → Review items
8. Click "Checkout"
9. Seleccionar delivery/pickup
10. Si delivery: zona + dirección
11. Subir comprobante de pago
12. Click "Realizar Pedido"
13. Frontend: upload comprobante → invoke process-order
14. Edge Function: crea orden + envía WhatsApp
15. localStorage['active_order_id'] = order_id
16. Redirect a /status/:orderId
```

### Flow 2: Status Tracking

```
1. Cliente en /status/:orderId
2. Fetch order + Subscribe a Realtime updates
3. Mostrar status visual (stepper)
4. Cuando restaurante acepta (WhatsApp) → status cambia en tiempo real
5. Cuando status = delivered → Botón "Hacer Nuevo Pedido"
6. Click → clear localStorage, redirect a /
```

### Flow 3: Restaurant Management

```
1. Restaurante recibe WhatsApp con botones
2. Click "✅ Aceptar" → Webhook actualiza DB
3. Cliente ve cambio instantáneo
4. Restaurante actualiza manualmente: confirmed → preparing → delivery → delivered
5. Actualización desde Supabase Studio o futuro admin panel
```

---

## 7. Security & Validation

### Row Level Security (RLS)

```sql
-- Orders: Solo lectura por phone_number
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clientes ven sus órdenes"
ON orders FOR SELECT
USING (phone_number = current_setting('app.phone_number', true));

-- Products/Promotions/Drinks: Lectura pública
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura pública de productos activos"
ON products FOR SELECT
USING (is_active = true);

-- Sin INSERT/UPDATE directo desde frontend
-- Solo Edge Functions (service_role) pueden escribir
```

### Storage Bucket: `payments`

```sql
-- Bucket público
INSERT INTO storage.buckets (id, name, public) VALUES ('payments', 'payments', true);

-- Policy: Upload anónimo
CREATE POLICY "Permitir uploads anónimos"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'payments');

-- Policy: Lectura pública
CREATE POLICY "Lectura pública"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'payments');
```

### Frontend Validation

```javascript
const validateCheckout = () => {
  if (!customerName || !phoneNumber || !paymentProofUrl) {
    throw new Error('Campos requeridos faltantes');
  }

  if (!/^\d{8}$/.test(phoneNumber.replace(/[-\s]/g, ''))) {
    throw new Error('Teléfono debe tener 8 dígitos');
  }

  if (deliveryType === 'delivery' && (!zoneId || !specificAddress)) {
    throw new Error('Zona y dirección requeridos para delivery');
  }
};
```

### Backend Validation

```typescript
// Re-calcular totales (nunca confiar en frontend)
async function recalculateTotals(items, delivery_type, zone_id) {
  let subtotal = 0;

  for (const item of items) {
    const table = item.product_id ? 'products' : 'promotions';
    const { data } = await supabase
      .from(table)
      .select('price, sale_price')
      .eq('id', item.product_id || item.promotion_id)
      .single();

    const effectivePrice = data.sale_price || data.price;

    if (Math.abs(effectivePrice - item.unit_price) > 0.01) {
      throw new Error('Precio no coincide con DB');
    }

    subtotal += effectivePrice * item.quantity;
  }

  // ... calcular delivery_fee, tax_amount, total
  return { subtotal, delivery_fee, tax_amount, total_amount };
}
```

### Rate Limiting

```typescript
const RATE_LIMIT = 3; // 3 órdenes por hora
const WINDOW = 3600000; // 1 hora

async function checkRateLimit(phone_number) {
  const oneHourAgo = new Date(Date.now() - WINDOW).toISOString();

  const { count } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('phone_number', phone_number)
    .gte('created_at', oneHourAgo);

  if (count >= RATE_LIMIT) {
    throw new Error('Límite de pedidos excedido. Intenta en 1 hora.');
  }
}
```

---

## 8. Error Handling

### Frontend

```javascript
const { data, isLoading, error, refetch } = useQuery({
  queryKey: ['products'],
  queryFn: fetchProducts,
  retry: 3,
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
});

if (isLoading) return <LoadingSpinner />;
if (error) return <ErrorMessage message="Error al cargar" retry={refetch} />;
```

### Edge Function

```typescript
try {
  // Process order
} catch (error) {
  console.error('Error:', error);

  return new Response(
    JSON.stringify({ error: error.message }),
    { status: 400 }
  );
}
```

### WhatsApp Failures

```typescript
try {
  await sendWhatsAppNotification(order);
} catch (whatsappError) {
  // Log pero NO fallar la orden
  console.error('WhatsApp failed:', whatsappError);

  // Marcar en notes para seguimiento manual
  await supabase
    .from('orders')
    .update({ notes: 'WHATSAPP_FAILED: ' + (order.notes || '') })
    .eq('id', order.id);

  // Continuar - orden fue creada exitosamente
}
```

---

## 9. WhatsApp Business API Setup

### Quick Start

1. **Crear Meta Developer Account**
   - https://developers.facebook.com
   - Create App → Business Type

2. **Agregar WhatsApp Product**
   - Add Product → WhatsApp
   - Get Phone Number ID + Access Token

3. **Configurar Webhook**
   ```
   URL: https://your-project.supabase.co/functions/v1/whatsapp-webhook
   Verify Token: (generar random secret)
   Subscribe to: messages
   ```

4. **Deploy Edge Functions**
   ```bash
   supabase secrets set WHATSAPP_PHONE_ID=...
   supabase secrets set WHATSAPP_ACCESS_TOKEN=...
   supabase secrets set WEBHOOK_VERIFY_TOKEN=...
   supabase secrets set RESTAURANT_PHONE_NUMBER=...

   supabase functions deploy process-order
   supabase functions deploy whatsapp-webhook
   ```

5. **Test Interactive Buttons**
   ```bash
   curl -X POST \
     "https://graph.facebook.com/v18.0/{PHONE_ID}/messages" \
     -H "Authorization: Bearer {TOKEN}" \
     -d '{
       "messaging_product": "whatsapp",
       "to": "50412345678",
       "type": "interactive",
       "interactive": {
         "type": "button",
         "body": { "text": "Test" },
         "action": {
           "buttons": [
             { "type": "reply", "reply": { "id": "btn1", "title": "Botón 1" }}
           ]
         }
       }
     }'
   ```

### Production Checklist

```
☐ Business verification completada
☐ Número propio configurado (no test number)
☐ Webhook verificado y subscrito
☐ Interactive messages funcionan
☐ Botones actualizan DB correctamente
☐ Rate limits configurados
```

---

## 10. Deployment

### Local Development

```bash
# 1. Start Supabase
supabase start

# 2. Run migrations
supabase db reset

# 3. Start React
cd package && npm start
```

### Production

**Frontend (Vercel):**
```bash
cd package
vercel --prod

# Environment Variables:
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJ...
```

**Backend (Supabase):**
```bash
# Link project
supabase link --project-ref your-ref

# Push migrations
supabase db push

# Deploy functions
supabase functions deploy process-order
supabase functions deploy whatsapp-webhook
```

**Pre-Deploy Checklist:**
```
☐ Migrations aplicadas
☐ RLS policies configuradas
☐ Storage bucket 'payments' creado
☐ Edge Functions deployadas con secrets
☐ WhatsApp webhook configurado
☐ Frontend build sin errores
☐ Rate limiting testeado
```

---

## 11. Testing

### Manual Testing Checklist

**Happy Path (Delivery):**
```
☐ Ver promociones en banner
☐ Click producto → modal abre
☐ Seleccionar bebidas + notas
☐ Agregar al carrito
☐ Checkout → delivery
☐ Seleccionar zona + dirección
☐ Subir comprobante
☐ Realizar pedido
☐ Redirect a /status
☐ WhatsApp llega con botones
☐ Click "Aceptar" → status cambia
☐ Cliente ve cambio en tiempo real
```

**Happy Path (Pickup):**
```
☐ Checkout → pickup
☐ Campos de zona/dirección ocultos
☐ Delivery fee = 0
☐ WhatsApp muestra "PARA RECOGER"
```

**Error Cases:**
```
☐ Checkout sin comprobante → error
☐ 4to pedido en 1 hora → rate limit
☐ Upload archivo grande → error
☐ Sin conexión → error + retry
```

---

## 12. Future Considerations

### Phase 2 Features

- Admin dashboard web (gestión de menú, órdenes, reportes)
- Customer login (historial, re-order)
- Payment gateways (Tigo Money, PayPal, Stripe)
- GPS delivery tracking
- Email/SMS notifications
- Loyalty program

### Performance

- PWA (Progressive Web App)
- CDN para imágenes
- Materialized views para reportes
- Database partitioning si > 100k órdenes

### Scalability

- Multi-restaurant platform
- Regional deployment
- Read replicas

### Known Limitations (MVP)

```
✗ No login/authentication
✗ No admin dashboard (use Supabase Studio)
✗ No delivery tracking
✗ No payment gateway
✗ Single restaurant only
```

**Acceptable for MVP:**
```
✓ Supabase Studio suficiente para gestión
✓ WhatsApp canal principal
✓ Comprobante manual seguro
✓ Rate limiting previene abuso
```

---

## Conclusion

Este design doc presenta un sistema completo de pedidos web con:

- **Frontend:** React app usando componentes existentes del template
- **Backend:** Supabase Edge Functions con validación robusta
- **Notifications:** WhatsApp con botones interactivos
- **Security:** RLS, validación backend, rate limiting
- **Scalability:** Diseño preparado para crecer

**Next Steps:**
1. Crear migraciones de base de datos
2. Implementar frontend (adaptar componentes template)
3. Desarrollar Edge Functions
4. Configurar WhatsApp Business API
5. Testing end-to-end
6. Deploy a producción

**Estimated Timeline:** 2-3 semanas para MVP completo.
