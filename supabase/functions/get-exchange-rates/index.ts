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
    // Use ExchangeRate-API's free open access endpoint
    // This API supports NGN, AED, and all major currencies
    // Documentation: https://www.exchangerate-api.com/docs/free
    const response = await fetch('https://open.er-api.com/v6/latest/GBP');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rates: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('ExchangeRate-API response:', JSON.stringify(data).substring(0, 500));
    
    if (data.result !== 'success') {
      throw new Error('API returned error: ' + (data['error-type'] || 'Unknown error'));
    }
    
    // The API returns rates relative to GBP (our base)
    // We need to invert them to get "how much 1 unit of currency = X GBP"
    const supportedCurrencies = ['GBP', 'EUR', 'USD', 'INR', 'AED', 'AUD', 'CAD', 'PHP', 'ZAR', 'NGN'];
    
    const gbpRates: Record<string, number> = {};
    
    for (const currency of supportedCurrencies) {
      if (currency === 'GBP') {
        gbpRates[currency] = 1;
      } else if (data.rates[currency]) {
        // The API gives us: 1 GBP = X currency
        // We need: 1 currency = X GBP (inverted)
        gbpRates[currency] = 1 / data.rates[currency];
      }
    }
    
    console.log('Calculated GBP rates:', gbpRates);

    return new Response(JSON.stringify({ 
      rates: gbpRates,
      base: 'GBP',
      date: data.time_last_update_utc,
      success: true,
      provider: 'ExchangeRate-API'
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
