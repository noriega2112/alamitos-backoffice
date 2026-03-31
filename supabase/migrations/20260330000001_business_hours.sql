-- restaurant_config: single-row global settings (id always = 1)
CREATE TABLE IF NOT EXISTS restaurant_config (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_open     BOOLEAN NOT NULL DEFAULT TRUE,
  timezone    TEXT NOT NULL DEFAULT 'America/Tegucigalpa',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_restaurant_config_updated_at
  BEFORE UPDATE ON restaurant_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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
  CONSTRAINT valid_time_range CHECK (close_time > open_time),
  CONSTRAINT unique_slot UNIQUE (day_of_week, open_time, close_time)
);

CREATE INDEX IF NOT EXISTS idx_business_hours_day ON business_hours(day_of_week, is_active);

-- RLS: public read (customers check hours), no write from client
-- Note: admin writes go through Supabase Studio (postgres role, bypasses RLS).
ALTER TABLE restaurant_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read restaurant_config"
  ON restaurant_config FOR SELECT TO anon USING (TRUE);

CREATE POLICY "Public read business_hours"
  ON business_hours FOR SELECT TO anon USING (TRUE);

-- Seed with a sample schedule (Mon-Sat with split shifts Mon-Fri; Sunday day 0 intentionally omitted)
INSERT INTO business_hours (day_of_week, open_time, close_time) VALUES
  (1, '10:00', '14:00'), (1, '17:00', '21:00'),
  (2, '10:00', '14:00'), (2, '17:00', '21:00'),
  (3, '10:00', '14:00'), (3, '17:00', '21:00'),
  (4, '10:00', '14:00'), (4, '17:00', '21:00'),
  (5, '10:00', '14:00'), (5, '17:00', '21:00'),
  (6, '10:00', '22:00')
ON CONFLICT (day_of_week, open_time, close_time) DO NOTHING;
