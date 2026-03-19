INSERT INTO storage.buckets (id, name, public) VALUES ('payments', 'payments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow anonymous uploads to payments"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'payments');

CREATE POLICY "Public read payments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'payments');
