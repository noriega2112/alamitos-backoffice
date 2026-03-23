-- Add sort_order column to categories for controlling display order
ALTER TABLE categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Set initial sort order (Bebidas last)
UPDATE categories SET sort_order = CASE name
  WHEN 'Come por L139' THEN 1
  WHEN 'Come por L199' THEN 2
  WHEN 'Come por L359' THEN 3
  WHEN 'Promos a Mitad de Precio' THEN 4
  WHEN 'Promos 2x1' THEN 5
  WHEN 'Entradas' THEN 6
  WHEN 'Snacks' THEN 7
  WHEN 'Asados' THEN 8
  WHEN 'Para Compartir' THEN 9
  WHEN 'Bebidas' THEN 10
  ELSE 99
END;

CREATE INDEX idx_categories_sort_order ON categories(sort_order);
