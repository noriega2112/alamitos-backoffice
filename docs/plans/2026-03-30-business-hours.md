# Business Hours Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow the restaurant to configure weekly business hours in Supabase, show a non-dismissible modal when closed, and block all cart/checkout interactions while still letting customers browse the menu.

**Architecture:** Two new Supabase tables (`restaurant_config` for global override, `business_hours` for per-day time slots). A single `useBusinessHours` react-query hook fetches both and computes `isOpen` using Honduras timezone (America/Tegucigalpa). A `ClosedModal` component is rendered in MenuPage, CartPage, and CheckoutPage — blocking interaction without hiding the content.

**Tech Stack:** React 18, @tanstack/react-query, Supabase JS client, React Bootstrap Modal, Intl.DateTimeFormat (built-in, no extra deps)

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260330000001_business_hours.sql`

**Step 1: Create the migration file**

```sql
-- restaurant_config: single-row global settings (id always = 1)
CREATE TABLE IF NOT EXISTS restaurant_config (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_open     BOOLEAN NOT NULL DEFAULT TRUE,
  timezone    TEXT NOT NULL DEFAULT 'America/Tegucigalpa',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with default open state
INSERT INTO restaurant_config (id, is_open) VALUES (1, TRUE)
ON CONFLICT (id) DO NOTHING;

-- business_hours: one row per time slot per day
-- day_of_week: 0=Sunday, 1=Monday, ..., 6=Saturday
CREATE TABLE IF NOT EXISTS business_hours (
  id           SERIAL PRIMARY KEY,
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time    TIME NOT NULL,
  close_time   TIME NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT valid_time_range CHECK (close_time > open_time)
);

-- RLS: public read (customers check hours), no write from client
ALTER TABLE restaurant_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read restaurant_config"
  ON restaurant_config FOR SELECT USING (TRUE);

CREATE POLICY "Public read business_hours"
  ON business_hours FOR SELECT USING (TRUE);

-- Seed with a sample schedule (Mon-Sat, two slots: 10-14 and 17-21)
INSERT INTO business_hours (day_of_week, open_time, close_time) VALUES
  (1, '10:00', '14:00'), (1, '17:00', '21:00'),
  (2, '10:00', '14:00'), (2, '17:00', '21:00'),
  (3, '10:00', '14:00'), (3, '17:00', '21:00'),
  (4, '10:00', '14:00'), (4, '17:00', '21:00'),
  (5, '10:00', '14:00'), (5, '17:00', '21:00'),
  (6, '10:00', '22:00')
ON CONFLICT DO NOTHING;
```

**Step 2: Apply the migration**

```bash
# From project root
supabase db reset
# OR if you don't want to reset:
supabase migration up
```

Expected: migration runs without errors, tables visible in Supabase Studio.

**Step 3: Verify in Supabase Studio**

Open `http://localhost:54323` → Table Editor → check `restaurant_config` and `business_hours` tables exist with seed data.

**Step 4: Commit**

```bash
git add supabase/migrations/20260330000001_business_hours.sql
git commit -m "feat(db): add restaurant_config and business_hours tables"
```

---

## Task 2: useBusinessHours Hook

**Files:**
- Create: `package/src/queries/useBusinessHours.js`

**Step 1: Create the hook**

```js
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';

const TIMEZONE = 'America/Tegucigalpa';

/**
 * Returns the current local time in Honduras as { dayOfWeek, minutes }.
 * dayOfWeek: 0=Sun, 1=Mon ... 6=Sat
 * minutes: minutes since midnight (e.g. 10:30 = 630)
 */
function getHondurasTime() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;

  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[get('weekday')];
  const hour = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);
  const minutes = hour * 60 + minute;
  return { dayOfWeek, minutes };
}

/**
 * Converts "HH:MM" string to minutes since midnight.
 */
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Computes isOpen from fetched data and current Honduras time.
 */
function computeIsOpen(config, slots) {
  if (!config?.is_open) return false;

  const { dayOfWeek, minutes } = getHondurasTime();
  const todaySlots = slots.filter(
    (s) => s.is_active && s.day_of_week === dayOfWeek
  );

  return todaySlots.some(
    (s) =>
      minutes >= timeToMinutes(s.open_time) &&
      minutes < timeToMinutes(s.close_time)
  );
}

/**
 * Groups business_hours rows into a schedule object keyed by day_of_week.
 * Returns array of { dayOfWeek, dayName, slots: [{open_time, close_time}] }
 * for all 7 days (empty slots array if no active slots for that day).
 */
function buildSchedule(slots) {
  const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return DAY_NAMES.map((dayName, dayOfWeek) => ({
    dayOfWeek,
    dayName,
    slots: slots
      .filter((s) => s.is_active && s.day_of_week === dayOfWeek)
      .map((s) => ({ open_time: s.open_time, close_time: s.close_time }))
      .sort((a, b) => timeToMinutes(a.open_time) - timeToMinutes(b.open_time)),
  }));
}

export const useBusinessHours = () =>
  useQuery({
    queryKey: ['business-hours'],
    queryFn: async () => {
      const [configRes, slotsRes] = await Promise.all([
        supabase.from('restaurant_config').select('*').eq('id', 1).single(),
        supabase.from('business_hours').select('*').order('day_of_week').order('open_time'),
      ]);
      if (configRes.error) throw configRes.error;
      if (slotsRes.error) throw slotsRes.error;
      return { config: configRes.data, slots: slotsRes.data };
    },
    select: ({ config, slots }) => ({
      isOpen: computeIsOpen(config, slots),
      schedule: buildSchedule(slots),
      isManuallyForced: config?.is_open === false,
    }),
    staleTime: 60 * 1000,       // re-check every 60s
    refetchInterval: 60 * 1000, // poll every minute so open/close is automatic
  });
```

**Step 2: Manual test in browser**

Temporarily set `is_open = FALSE` in Supabase Studio for restaurant_config id=1. Call the hook from MenuPage (next task) and confirm `isOpen` returns false.

**Step 3: Commit**

```bash
git add package/src/queries/useBusinessHours.js
git commit -m "feat(hours): add useBusinessHours react-query hook"
```

---

## Task 3: ClosedModal Component

**Files:**
- Create: `package/src/jsx/components/BusinessHours/ClosedModal.js`

**Step 1: Create the modal**

```jsx
import React from 'react';
import { Modal } from 'react-bootstrap';

const DAY_TODAY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Tegucigalpa',
  weekday: 'short',
}).format(new Date());
const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const TODAY_DOW = DAY_MAP[DAY_TODAY];

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

const ClosedModal = ({ show, schedule = [] }) => {
  return (
    <Modal show={show} centered backdrop="static" keyboard={false}>
      <Modal.Header className="border-0 pb-0">
        <Modal.Title className="w-100 text-center">
          <span style={{ fontSize: 40 }}>🍽️</span>
          <h4 className="mt-2 mb-0">Estamos cerrados</h4>
          <p className="text-muted fs-14 mt-1 mb-0">
            En este momento no estamos recibiendo pedidos.
          </p>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <h6 className="fw-bold mb-3 text-center">Horarios de atención</h6>
        <div className="table-responsive">
          <table className="table table-sm mb-0">
            <tbody>
              {schedule.map(({ dayOfWeek, dayName, slots }) => (
                <tr
                  key={dayOfWeek}
                  className={dayOfWeek === TODAY_DOW ? 'table-warning' : ''}
                >
                  <td className="fw-semibold" style={{ width: '35%' }}>
                    {dayOfWeek === TODAY_DOW ? <strong>{dayName}</strong> : dayName}
                  </td>
                  <td>
                    {slots.length === 0 ? (
                      <span className="text-muted">Cerrado</span>
                    ) : (
                      slots.map((s, i) => (
                        <span key={i}>
                          {formatTime(s.open_time)} – {formatTime(s.close_time)}
                          {i < slots.length - 1 && <br />}
                        </span>
                      ))
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal.Body>
    </Modal>
  );
};

export default ClosedModal;
```

**Step 2: Commit**

```bash
git add package/src/jsx/components/BusinessHours/ClosedModal.js
git commit -m "feat(hours): add ClosedModal component with weekly schedule"
```

---

## Task 4: Integrate into MenuPage

The menu must stay browsable. "Agregar +" should show the ClosedModal instead of the add-to-cart modal when closed.

**Files:**
- Modify: `package/src/jsx/pages/MenuPage.js`

**Step 1: Add hook and modal imports at top of file (after existing imports)**

```js
import { useBusinessHours } from '../../queries/useBusinessHours';
import ClosedModal from '../components/BusinessHours/ClosedModal';
```

**Step 2: Add hook call inside MenuPage component (after existing hooks)**

```js
const { data: hoursData } = useBusinessHours();
const isOpen = hoursData?.isOpen ?? true; // default open while loading
const schedule = hoursData?.schedule ?? [];
const [showClosedModal, setShowClosedModal] = useState(false);
```

**Step 3: Modify `openModal` to check hours first**

Replace the existing `openModal` function:

```js
const openModal = (item, type) => {
  if (!isOpen) {
    setShowClosedModal(true);
    return;
  }
  setModalItem(item);
  setModalType(type);
};
```

**Step 4: Add ClosedModal to the JSX return (alongside the existing AddToCartModal)**

Add this after the existing `<AddToCartModal ... />` line:

```jsx
<ClosedModal show={showClosedModal || !isOpen} schedule={schedule} />
```

Note: `show={showClosedModal || !isOpen}` means it auto-appears when closed AND re-appears if user clicks Agregar.

**Step 5: Verify in browser**

1. Set `is_open = FALSE` in Supabase Studio
2. Open the menu page — modal should appear immediately
3. Dismiss attempt: modal has no close button (backdrop="static")
4. Set `is_open = TRUE` — within 60s (refetchInterval) modal disappears

**Step 6: Commit**

```bash
git add package/src/jsx/pages/MenuPage.js
git commit -m "feat(hours): block add-to-cart when restaurant is closed"
```

---

## Task 5: Integrate into CartPage

Cart is still visible. Checkout button is blocked.

**Files:**
- Modify: `package/src/jsx/pages/CartPage.js`

**Step 1: Add imports**

```js
import { useBusinessHours } from '../../queries/useBusinessHours';
import ClosedModal from '../components/BusinessHours/ClosedModal';
```

**Step 2: Add hook inside CartPage component**

```js
const { data: hoursData } = useBusinessHours();
const isOpen = hoursData?.isOpen ?? true;
const schedule = hoursData?.schedule ?? [];
const [showClosedModal, setShowClosedModal] = useState(false);
```

**Step 3: Find the "Proceder al checkout" / checkout button and wrap its onClick**

The checkout button currently navigates to `/checkout`. Replace its `onClick`:

```jsx
onClick={() => {
  if (!isOpen) {
    setShowClosedModal(true);
    return;
  }
  navigate('/checkout');
}}
```

**Step 4: Add ClosedModal to CartPage JSX return**

```jsx
<ClosedModal show={showClosedModal} schedule={schedule} />
```

**Step 5: Commit**

```bash
git add package/src/jsx/pages/CartPage.js
git commit -m "feat(hours): block checkout from cart when restaurant is closed"
```

---

## Task 6: Integrate into CheckoutPage

If a customer navigates directly to `/checkout` while closed, block the submit button and show the modal.

**Files:**
- Modify: `package/src/jsx/pages/CheckoutPage.js`

**Step 1: Add imports**

```js
import { useBusinessHours } from '../../queries/useBusinessHours';
import ClosedModal from '../components/BusinessHours/ClosedModal';
```

**Step 2: Add hook inside CheckoutPage component**

```js
const { data: hoursData } = useBusinessHours();
const isOpen = hoursData?.isOpen ?? true;
const schedule = hoursData?.schedule ?? [];
```

**Step 3: Add ClosedModal to CheckoutPage JSX**

Add near the top of the return, before the form:

```jsx
<ClosedModal show={!isOpen} schedule={schedule} />
```

Since `backdrop="static"` and `keyboard={false}`, the customer is blocked from submitting even if they somehow reached the page directly.

**Step 4: Optionally disable the submit button**

Find the submit button and add `disabled={!isOpen}`:

```jsx
<button
  type="submit"
  disabled={isSubmitting || !isOpen}
  className="btn btn-primary w-100"
>
  {isSubmitting ? 'Enviando...' : 'Enviar Pedido'}
</button>
```

**Step 5: Commit**

```bash
git add package/src/jsx/pages/CheckoutPage.js
git commit -m "feat(hours): block order submission when restaurant is closed"
```

---

## Task 7: End-to-End Test

**Step 1: Test closed state**

1. In Supabase Studio: set `restaurant_config.is_open = FALSE`
2. Open app at `/` (MenuPage) — ClosedModal should appear with full week schedule
3. Try scrolling behind the modal — menu is still visible
4. Click on any product "Agregar +" — modal stays/reappears
5. Navigate to `/cart` — modal appears, checkout button blocked
6. Navigate to `/checkout` directly — modal appears, submit disabled

**Step 2: Test schedule-based closing**

1. Set `is_open = TRUE`
2. In `business_hours`, delete all slots for today's day_of_week (or make them all outside current time)
3. Wait up to 60s for refetch — modal should appear automatically
4. Add a slot that covers the current time — within 60s modal disappears

**Step 3: Test manual override re-open**

1. During a time with no business_hours slot, set `is_open = FALSE`
2. Confirm modal appears
3. Set `is_open = FALSE` (already was) — stays closed
4. Set `is_open = TRUE` — still closed (because schedule says closed)
   - Note: `is_open = FALSE` overrides schedule to FORCE CLOSED
   - `is_open = TRUE` means "follow the schedule" (default)

**Step 4: Commit final**

```bash
git add -A
git commit -m "feat(hours): complete business hours integration"
```

---

## Admin Usage Guide (for Supabase Studio)

**To close immediately (emergency):**
```sql
UPDATE restaurant_config SET is_open = FALSE WHERE id = 1;
```

**To re-open (follow schedule again):**
```sql
UPDATE restaurant_config SET is_open = TRUE WHERE id = 1;
```

**To add a time slot:**
```sql
INSERT INTO business_hours (day_of_week, open_time, close_time)
VALUES (0, '12:00', '20:00'); -- Sunday 12pm-8pm
```

**To disable a slot without deleting:**
```sql
UPDATE business_hours SET is_active = FALSE WHERE id = <slot_id>;
```

**Day of week reference:** 0=Domingo, 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado
