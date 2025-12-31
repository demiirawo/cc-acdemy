import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Fetch latest exchange rates from Frankfurter API (free, no API key needed)
    // Base is EUR by default, we'll convert everything to GBP
    const response = await fetch('https://api.frankfurter.app/latest?to=GBP,USD,EUR,INR,AED,AUD,CAD,PHP,ZAR,NGN');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rates: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Frankfurter API response:', data);
    
    // The API returns rates relative to EUR, we need to convert to GBP base
    const eurToGbp = data.rates.GBP;
    
    // Calculate rates relative to GBP (how much 1 unit of each currency is worth in GBP)
    const gbpRates: Record<string, number> = {
      GBP: 1,
      EUR: eurToGbp, // 1 EUR = X GBP
      USD: eurToGbp / data.rates.USD, // Convert via EUR
      INR: eurToGbp / data.rates.INR,
      AED: eurToGbp / data.rates.AED,
      AUD: eurToGbp / data.rates.AUD,
      CAD: eurToGbp / data.rates.CAD,
      PHP: eurToGbp / data.rates.PHP,
      ZAR: eurToGbp / data.rates.ZAR,
      NGN: eurToGbp / data.rates.NGN,
    };
    
    console.log('Calculated GBP rates:', gbpRates);

    return new Response(JSON.stringify({ 
      rates: gbpRates,
      base: 'GBP',
      date: data.date,
      success: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false,
      // Fallback rates if API fails
      rates: {
        GBP: 1,
        EUR: 0.85,
        USD: 0.79,
        INR: 0.0095,
        AED: 0.21,
        AUD: 0.52,
        CAD: 0.58,
        PHP: 0.014,
        ZAR: 0.044,
        NGN: 0.00052,
      }
    }), {
      status: 200, // Return 200 with fallback rates
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
