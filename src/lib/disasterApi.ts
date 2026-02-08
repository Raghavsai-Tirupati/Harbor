import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export async function fetchEonet(params: {
  bbox: string;
  status?: string;
  days?: string;
  start?: string;
  end?: string;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set('bbox', params.bbox);
  if (params.status) searchParams.set('status', params.status);
  if (params.days) searchParams.set('days', params.days);
  if (params.start) searchParams.set('start', params.start);
  if (params.end) searchParams.set('end', params.end);

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/eonet?${searchParams}`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`EONET API failed: ${response.status}`);
  }

  return response.json();
}

export async function fetchEarthquakes(params: {
  bbox: string;
  start: string;
  end: string;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set('bbox', params.bbox);
  searchParams.set('start', params.start);
  searchParams.set('end', params.end);

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/earthquakes?${searchParams}`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Earthquakes API failed: ${response.status}`);
  }

  return response.json();
}

export async function fetchEventNews(params: {
  title: string;
  lat: number;
  lon: number;
  days?: number;
  categoryId?: string;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set('title', params.title);
  searchParams.set('lat', String(params.lat));
  searchParams.set('lon', String(params.lon));
  if (params.days) searchParams.set('days', String(params.days));
  if (params.categoryId) searchParams.set('categoryId', params.categoryId);

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/event-news?${searchParams}`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Event news API failed: ${response.status}`);
  }

  return response.json();
}
