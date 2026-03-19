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
