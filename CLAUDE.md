# Alamitos - Sistema de Pedidos Web (Honduras)

Create React App + Supabase restaurant ordering system with WhatsApp Business API integration for order notifications.

## AI Assistant Rules

- **Never add Claude as co-author** on commits or PRs. Do not include `Co-Authored-By: Claude ...` in any commit message or PR body.

## Quick Start

```bash
# Use correct Node version
nvm use  # Node LTS/Gallium

# Install dependencies
cd package && npm install

# Start local Supabase (from project root)
cd .. && supabase start

# Start React dev server
cd package && npm start  # Runs on http://localhost:3000
```

## Key Commands

```bash
# Development (run from package/ directory)
npm start                  # Start React dev server
npm run build             # Production build
npm test                  # Run tests
npm run sass              # Watch SASS compilation

# Supabase (run from project root)
supabase start            # Start local instance
supabase stop             # Stop local instance
supabase db reset         # Reset database
supabase functions serve  # Serve Edge Functions locally
supabase functions deploy process-order  # Deploy Edge Function to production
```

## Architecture Overview

**Frontend:** Create React App (React 18 + React Router + Redux)
**Backend:** Supabase (PostgreSQL + Edge Functions + Storage + Realtime)
**Notifications:** WhatsApp Business API (Meta)
**Storage:** Supabase Storage bucket: `payments`

### Project Structure

```
package/
├── src/
│   ├── jsx/
│   │   ├── components/
│   │   │   ├── AppsMenu/Shop/      # Product management UI
│   │   │   ├── Dashboard/          # Dashboard components
│   │   │   └── Forms/              # Form components
│   │   ├── layouts/                # Layout components
│   │   └── index.js                # App entry point
│   └── supabaseClient.js           # Supabase config
└── package.json

supabase/
├── config.toml                     # Local Supabase config
└── functions/
    └── process-order/              # Order processing Edge Function
```

### Database Schema

All tables use English names:

```sql
zones                    -- Delivery zones with fees
├─ id
├─ name
├─ delivery_fee
└─ is_active

promotions               -- Time-based promotions
├─ id
├─ name
├─ description
├─ price
├─ image_url
├─ start_date (timestamp)
├─ end_date (timestamp)
└─ is_active             -- Only show if current_date BETWEEN start_date AND end_date

categories               -- Product categories
└─ id, name

products                 -- Menu items
└─ id, category_id, name, description, price, image_url

drinks                   -- Beverages (multiple per order item)
└─ id, name, price

orders                   -- Main order table
├─ id (UUID)
├─ customer_name
├─ phone_number
├─ zone_id (FK → zones)
├─ specific_address (TEXT, NOT NULL)
├─ notes
├─ total_amount
├─ payment_proof_url (TEXT, NOT NULL)  -- Link to Storage
├─ status (enum: pending, confirmed, preparing, rejected)
└─ created_at

order_items              -- Order line items
├─ id
├─ order_id (FK → orders)
├─ product_id (nullable, FK → products)
├─ promotion_id (nullable, FK → promotions)
├─ quantity
├─ unit_price
└─ notes                 -- Kitchen instructions per item

order_item_drinks        -- Many-to-many: items ↔ drinks
├─ id
├─ order_item_id (FK → order_items)
└─ drink_id (FK → drinks)
```

## Key Flows

### 1. Order Persistence & Tracking

**On App Load (React Router):**

```javascript
// Check localStorage for active order
const activeOrderId = localStorage.getItem('active_order_id');

if (activeOrderId) {
  // Fetch order from Supabase
  const { data: order } = await supabase.from('orders').select('*').eq('id', activeOrderId).single();

  // If order is still active, redirect to status page
  if (order && order.status !== 'rejected') {
    navigate(`/status/${activeOrderId}`);
  } else {
    // Order completed, clear localStorage
    localStorage.removeItem('active_order_id');
  }
}
```

### 2. Cart & Menu

- Products and promotions support **multiple drink selections**
- Each cart item captures **kitchen notes**
- Promotions filtered by date: `WHERE current_date BETWEEN start_date AND end_date`

### 3. Checkout Requirements (All Mandatory)

**Before submitting order:**

1. ✅ `zone_id` - Customer's delivery zone
2. ✅ `specific_address` - Full address text
3. ✅ `payment_proof` - Image uploaded to Supabase Storage `payments` bucket

**Upload Flow:**

```javascript
// 1. Upload payment proof to Storage FIRST
const { data: uploadData, error: uploadError } = await supabase.storage
  .from('payments')
  .upload(`${Date.now()}_${file.name}`, file);

// 2. Get public URL
const {
  data: { publicUrl },
} = supabase.storage.from('payments').getPublicUrl(uploadData.path);

// 3. Include publicUrl in order payload as payment_proof_url
```

### 4. Order Processing

**Edge Function: `process-order`**

**Responsibilities:**

1. Validate order payload
2. Insert order into DB (transaction):
   - Create `orders` record
   - Create `order_items` records
   - Create `order_item_drinks` records
3. Connect to WhatsApp Business API (Meta)
4. Send template message to restaurant:
   - Customer name, phone
   - Zone + specific address
   - Product list (with drinks and notes)
   - Total amount
   - Payment proof URL

**Invoke from React:**

```javascript
const { data, error } = await supabase.functions.invoke('process-order', {
  body: {
    customer_name,
    phone_number,
    zone_id,
    specific_address,
    notes,
    total_amount,
    payment_proof_url,
    items: [
      {
        product_id: 1,
        quantity: 2,
        unit_price: 150,
        notes: 'Sin cebolla',
        drinks: [1, 3], // Array of drink IDs
      },
    ],
  },
});

// Save order ID to localStorage for tracking
localStorage.setItem('active_order_id', data.order_id);
```

### 5. Status Page

**Real-time Order Updates:**

```javascript
// Subscribe to order changes
const channel = supabase
  .channel(`order:${orderId}`)
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'orders',
      filter: `id=eq.${orderId}`,
    },
    (payload) => {
      // Update UI with new status
      setOrderStatus(payload.new.status);
    },
  )
  .subscribe();
```

**Status Flow:**
`pending` → `confirmed` → `preparing`

**New Order Button:**

```javascript
const handleNewOrder = () => {
  localStorage.removeItem('active_order_id');
  navigate('/');
};
```

## Environment Variables

**Create `.env` file in `package/` directory:**

```bash
# Supabase (local development)
REACT_APP_SUPABASE_URL=http://127.0.0.1:54321
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Production Supabase
# REACT_APP_SUPABASE_URL=https://your-project.supabase.co
# REACT_APP_SUPABASE_ANON_KEY=your-production-anon-key
```

**Edge Function Environment (Supabase Dashboard → Edge Functions → Secrets):**

```bash
WHATSAPP_BUSINESS_PHONE_ID=<meta_phone_id>
WHATSAPP_ACCESS_TOKEN=<meta_access_token>
WHATSAPP_TEMPLATE_NAME=<approved_template_name>
RESTAURANT_PHONE_NUMBER=<recipient_number>
```

## Storage Buckets

**`payments` bucket configuration:**

- Public read access (so restaurant can view images)
- Create via Supabase Dashboard or CLI:

```bash
supabase storage create payments --public
```

## Gotchas

- **All DB tables/fields in English** - UI can be Spanish, schema is English
- **Payment proof is MANDATORY** - Upload to Storage BEFORE calling `process-order`
- **Order tracking via localStorage** - User blocked from new orders while active order exists
- **Promotions are date-filtered** - Backend query: `WHERE current_date BETWEEN start_date AND end_date`
- **WhatsApp uses Template Messages** - Must be pre-approved by Meta (cannot send arbitrary text)
- **Drinks are many-to-many** - One order item can have multiple drinks via `order_item_drinks` table
- **Supabase client is LOCAL by default** - Current `supabaseClient.js` hardcodes localhost URL. Use env vars for production.

## Testing

**Local Development:**

```bash
# 1. Start Supabase
supabase start

# 2. Seed test data (zones, products, drinks, promotions)
# TODO: Create seed script

# 3. Start React dev server
cd package && npm start

# 4. Test Edge Function locally
supabase functions serve process-order

# 5. Test end-to-end order flow
```

**Production Checklist:**

- [ ] WhatsApp template approved by Meta
- [ ] Edge Function environment variables configured
- [ ] Storage bucket `payments` created with public access
- [ ] Supabase production credentials in `.env`
- [ ] Database migrations applied
- [ ] Row Level Security (RLS) policies configured
- [ ] Edge Function `process-order` deployed

## Current Status

**Implemented:**

- React app structure (CRA with React Router + Redux)
- Supabase client configured (local)
- Product/promotion management UI components

**In Progress:**

- Database schema setup
- Order flow implementation
- WhatsApp Edge Function
- Real-time status tracking

**Next Steps:**

1. Create Supabase migrations for schema
2. Implement checkout flow with payment proof upload
3. Build `process-order` Edge Function
4. Set up WhatsApp Business API integration
5. Add Realtime subscriptions to status page
