import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const bbox = url.searchParams.get('bbox');
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');

    if (!bbox || !start || !end) {
      return new Response(
        JSON.stringify({ error: 'bbox, start, end required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const [minLon, maxLat, maxLon, minLat] = bbox.split(',').map(Number);
    const usgsUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${start}&endtime=${end}&minmagnitude=4&maxlatitude=${maxLat}&minlatitude=${minLat}&maxlongitude=${maxLon}&minlongitude=${minLon}&limit=200`;

    const response = await fetch(usgsUrl);
    if (!response.ok) {
      throw new Error(`USGS API returned ${response.status}`);
    }
    
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('USGS proxy error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch earthquake data' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
