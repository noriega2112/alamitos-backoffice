-- Add is_drink_category flag to categories table
ALTER TABLE categories ADD COLUMN is_drink_category BOOLEAN NOT NULL DEFAULT false;

-- Set flag for existing "Bebidas" category
UPDATE categories SET is_drink_category = true WHERE name = 'Bebidas';
