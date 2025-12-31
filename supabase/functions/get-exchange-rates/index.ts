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
    // Frankfurter API only supports major currencies, not AED or NGN
    // We'll fetch what's available and add manual rates for others
    const response = await fetch('https://api.frankfurter.app/latest?to=GBP,USD,INR,AUD,CAD,PHP,ZAR');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rates: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Frankfurter API response:', data);
    
    // The API returns rates relative to EUR, we need to convert to GBP base
    const eurToGbp = data.rates.GBP;
    
    // Calculate rates relative to GBP (how much 1 unit of each currency is worth in GBP)
    // For currencies not in Frankfurter, use approximate fixed rates based on current market
    const gbpRates: Record<string, number> = {
      GBP: 1,
      EUR: eurToGbp, // 1 EUR = X GBP
      USD: eurToGbp / data.rates.USD,
      INR: eurToGbp / data.rates.INR,
      AUD: eurToGbp / data.rates.AUD,
      CAD: eurToGbp / data.rates.CAD,
      PHP: eurToGbp / data.rates.PHP,
      ZAR: eurToGbp / data.rates.ZAR,
      // AED and NGN are not supported by Frankfurter, use approximate rates
      // AED is pegged to USD at ~3.67, so 1 AED = 1 USD / 3.67
      AED: (eurToGbp / data.rates.USD) / 3.6725,
      // NGN fluctuates significantly - using approximate rate of ~1600 NGN per GBP
      NGN: 1 / 1600,
    };
    
    console.log('Calculated GBP rates:', gbpRates);

    return new Response(JSON.stringify({ 
      rates: gbpRates,
      base: 'GBP',
      date: data.date,
      success: true,
      note: 'AED and NGN rates are approximate (not available from primary API)'
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
