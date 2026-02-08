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
    
    if (!bbox) {
      return new Response(
        JSON.stringify({ error: 'bbox required (minLon,maxLat,maxLon,minLat)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const status = url.searchParams.get('status') || 'open';
    const days = url.searchParams.get('days') || (status === 'closed' ? '730' : '14');
    const limit = url.searchParams.get('limit') || '500';
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');

    let eonetUrl = `https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=${status}&limit=${limit}&bbox=${bbox}`;
    if (start && end) {
      eonetUrl += `&start=${start}&end=${end}`;
    } else {
      eonetUrl += `&days=${days}`;
    }

    const response = await fetch(eonetUrl);
    if (!response.ok) {
      throw new Error(`EONET API returned ${response.status}`);
    }
    
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('EONET proxy error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch EONET data' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
