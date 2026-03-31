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
