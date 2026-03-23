-- Remove 'out_for_delivery' and 'delivered' from order_status enum.
-- PostgreSQL doesn't support DROP VALUE from enums, so we recreate the type.

-- Update any existing rows that use removed statuses
UPDATE orders SET status = 'preparing' WHERE status IN ('out_for_delivery', 'delivered');

ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;

ALTER TYPE order_status RENAME TO order_status_old;

CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'preparing', 'rejected');

ALTER TABLE orders
  ALTER COLUMN status TYPE order_status USING status::text::order_status;

ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending';

DROP TYPE order_status_old;
