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
 * Groups business_hours rows into a schedule array.
 * Returns 7 entries (one per day), empty slots array if closed all day.
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
    }),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
