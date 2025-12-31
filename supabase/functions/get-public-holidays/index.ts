import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Islamic holidays with estimated dates (need to be updated annually)
const ISLAMIC_HOLIDAYS: Record<number, Array<{ date: string; name: string }>> = {
  2025: [
    { date: "2025-03-30", name: "Eid-el-Fitr (Estimated)" },
    { date: "2025-03-31", name: "Eid-el-Fitr Holiday (Estimated)" },
    { date: "2025-06-06", name: "Eid-el-Kabir (Estimated)" },
    { date: "2025-06-07", name: "Eid-el-Kabir Holiday (Estimated)" },
    { date: "2025-09-05", name: "Eid-el-Maulud (Estimated)" },
  ],
  2026: [
    { date: "2026-03-20", name: "Eid-el-Fitr (Estimated)" },
    { date: "2026-03-21", name: "Eid-el-Fitr Holiday (Estimated)" },
    { date: "2026-05-27", name: "Eid-el-Kabir (Estimated)" },
    { date: "2026-05-28", name: "Eid-el-Kabir Holiday (Estimated)" },
    { date: "2026-08-25", name: "Eid-el-Maulud (Estimated)" },
  ],
  2027: [
    { date: "2027-03-09", name: "Eid-el-Fitr (Estimated)" },
    { date: "2027-03-10", name: "Eid-el-Fitr Holiday (Estimated)" },
    { date: "2027-05-16", name: "Eid-el-Kabir (Estimated)" },
    { date: "2027-05-17", name: "Eid-el-Kabir Holiday (Estimated)" },
    { date: "2027-08-14", name: "Eid-el-Maulud (Estimated)" },
  ],
};

// Fallback holidays if API fails
const FALLBACK_HOLIDAYS: Record<number, Array<{ date: string; name: string }>> = {
  2025: [
    { date: "2025-01-01", name: "New Year's Day" },
    { date: "2025-04-18", name: "Good Friday" },
    { date: "2025-04-21", name: "Easter Monday" },
    { date: "2025-05-01", name: "Workers' Day" },
    { date: "2025-05-27", name: "Children's Day" },
    { date: "2025-06-12", name: "Democracy Day" },
    { date: "2025-10-01", name: "Independence Day" },
    { date: "2025-12-25", name: "Christmas Day" },
    { date: "2025-12-26", name: "Boxing Day" },
  ],
  2026: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-01", name: "Workers' Day" },
    { date: "2026-05-27", name: "Children's Day" },
    { date: "2026-06-12", name: "Democracy Day" },
    { date: "2026-10-01", name: "Independence Day" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "Boxing Day" },
  ],
};

interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  counties: string[] | null;
  launchYear: number | null;
  types: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const yearParam = url.searchParams.get('year');
    const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();

    console.log(`Fetching public holidays for Nigeria, year: ${year}`);

    let holidays: Array<{ date: string; name: string; isEstimated?: boolean }> = [];
    let source = 'api';

    try {
      // Fetch from Nager.Date API
      const response = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/NG`, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const apiHolidays: NagerHoliday[] = await response.json();
      
      // Map API response to our format
      holidays = apiHolidays.map(h => ({
        date: h.date,
        name: h.localName || h.name,
        isEstimated: false,
      }));

      console.log(`Fetched ${holidays.length} holidays from Nager.Date API`);
    } catch (apiError) {
      console.error('Failed to fetch from Nager.Date API:', apiError);
      
      // Use fallback data
      const fallback = FALLBACK_HOLIDAYS[year] || FALLBACK_HOLIDAYS[2025];
      holidays = fallback.map(h => ({
        ...h,
        isEstimated: false,
      }));
      source = 'fallback';
      
      console.log(`Using fallback holidays for year ${year}`);
    }

    // Add Islamic holidays (these aren't in the Nager.Date API for Nigeria)
    const islamicHolidays = ISLAMIC_HOLIDAYS[year] || [];
    const islamicHolidaysWithFlag = islamicHolidays.map(h => ({
      ...h,
      isEstimated: true,
    }));

    // Merge and sort by date
    const allHolidays = [...holidays, ...islamicHolidaysWithFlag]
      .sort((a, b) => a.date.localeCompare(b.date));

    // Remove duplicates (in case API includes some Islamic holidays)
    const uniqueHolidays = allHolidays.filter((holiday, index, self) =>
      index === self.findIndex(h => h.date === holiday.date)
    );

    console.log(`Returning ${uniqueHolidays.length} total holidays (source: ${source})`);

    return new Response(
      JSON.stringify({
        year,
        holidays: uniqueHolidays,
        source,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in get-public-holidays function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
