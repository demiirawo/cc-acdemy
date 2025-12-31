import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ShiftPattern {
  staffName: string;
  userId: string;
  clientName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  shiftType: string;
  weekVariation: string; // 'Week1', 'Week2', or '' for weekly
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, data } = await req.json();
    console.log('Import rota action:', action);

    if (action === 'add-clients') {
      // Add missing clients
      const clientNames = data.clients as string[];
      const adminUserId = data.adminUserId as string;
      
      for (const name of clientNames) {
        const { error } = await supabase.from('clients').insert({
          name,
          created_by: adminUserId
        });
        if (error && !error.message.includes('duplicate')) {
          console.error('Error adding client:', name, error);
        } else {
          console.log('Added client:', name);
        }
      }
      
      return new Response(JSON.stringify({ success: true, message: `Added ${clientNames.length} clients` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'add-profiles') {
      // Create profiles for missing staff
      const profiles = data.profiles as { userId: string; displayName: string; email: string }[];
      
      for (const profile of profiles) {
        const { error } = await supabase.from('profiles').insert({
          user_id: profile.userId,
          display_name: profile.displayName,
          email: profile.email,
          role: 'viewer'
        });
        if (error) {
          console.error('Error adding profile:', profile.email, error);
        } else {
          console.log('Added profile:', profile.email);
        }
      }
      
      return new Response(JSON.stringify({ success: true, message: `Added ${profiles.length} profiles` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'import-patterns') {
      // Import recurring shift patterns
      const patterns = data.patterns as ShiftPattern[];
      const adminUserId = data.adminUserId as string;
      
      let successCount = 0;
      let errorCount = 0;
      
      // Group patterns by user, client, time, shift type, and week variation
      const groupedPatterns = new Map<string, ShiftPattern[]>();
      
      for (const pattern of patterns) {
        if (!pattern.userId) {
          console.log('Skipping pattern without userId:', pattern);
          continue;
        }
        
        // Create a key for grouping
        const key = `${pattern.userId}-${pattern.clientName}-${pattern.startTime}-${pattern.endTime}-${pattern.shiftType}-${pattern.weekVariation}`;
        
        if (!groupedPatterns.has(key)) {
          groupedPatterns.set(key, []);
        }
        groupedPatterns.get(key)!.push(pattern);
      }
      
      console.log(`Grouped into ${groupedPatterns.size} unique patterns`);
      
      for (const [key, groupedShifts] of groupedPatterns) {
        const firstShift = groupedShifts[0];
        const daysOfWeek = [...new Set(groupedShifts.map(s => s.dayOfWeek))].sort();
        
        // Determine recurrence interval
        let recurrenceInterval = 'weekly';
        if (firstShift.weekVariation === 'Week1' || firstShift.weekVariation === 'Week2') {
          recurrenceInterval = 'biweekly';
        }
        
        // Determine start date based on week variation
        // Week1 starts from Dec 31, 2025 (Wednesday)
        // Week2 starts from Jan 7, 2026 (Wednesday)
        let startDate = '2025-12-31'; // Default for Week1 or no variation
        if (firstShift.weekVariation === 'Week2') {
          startDate = '2026-01-07';
        }
        
        const patternData = {
          user_id: firstShift.userId,
          client_name: firstShift.clientName,
          days_of_week: daysOfWeek,
          start_time: firstShift.startTime,
          end_time: firstShift.endTime,
          shift_type: firstShift.shiftType,
          recurrence_interval: recurrenceInterval,
          start_date: startDate,
          created_by: adminUserId,
          is_overtime: false,
          currency: 'GBP'
        };
        
        console.log('Inserting pattern:', patternData);
        
        const { error } = await supabase.from('recurring_shift_patterns').insert(patternData);
        
        if (error) {
          console.error('Error inserting pattern:', error);
          errorCount++;
        } else {
          successCount++;
        }
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: `Imported ${successCount} patterns, ${errorCount} errors` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in import-rota:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
