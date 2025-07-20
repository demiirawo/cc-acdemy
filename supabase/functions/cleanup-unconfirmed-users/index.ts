import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create admin client using service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    console.log('Starting cleanup of unconfirmed users...');

    // Calculate the cutoff time (15 minutes ago)
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - 15);
    
    console.log(`Looking for unconfirmed users created before: ${cutoffTime.toISOString()}`);

    // Get unconfirmed users older than 15 minutes
    const { data: unconfirmedUsers, error: fetchError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000 // Adjust if you expect more than 1000 unconfirmed users
    });

    if (fetchError) {
      console.error('Error fetching users:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${unconfirmedUsers.users.length} total users`);

    // Filter for unconfirmed users older than 15 minutes
    const usersToDelete = unconfirmedUsers.users.filter(user => {
      const isUnconfirmed = !user.email_confirmed_at;
      const isOlderThan15Minutes = new Date(user.created_at) < cutoffTime;
      
      if (isUnconfirmed && isOlderThan15Minutes) {
        console.log(`User ${user.email} (${user.id}) will be deleted - created at ${user.created_at}, unconfirmed`);
        return true;
      }
      
      return false;
    });

    console.log(`Found ${usersToDelete.length} users to delete`);

    let deletedCount = 0;
    const errors: string[] = [];

    // Delete each unconfirmed user
    for (const user of usersToDelete) {
      try {
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
        
        if (deleteError) {
          console.error(`Error deleting user ${user.email}:`, deleteError);
          errors.push(`Failed to delete ${user.email}: ${deleteError.message}`);
        } else {
          console.log(`Successfully deleted user: ${user.email}`);
          deletedCount++;
        }
      } catch (error) {
        console.error(`Exception deleting user ${user.email}:`, error);
        errors.push(`Exception deleting ${user.email}: ${error.message}`);
      }
    }

    const result = {
      success: true,
      message: `Cleanup completed. Deleted ${deletedCount} unconfirmed users.`,
      deletedCount,
      totalUnconfirmedFound: usersToDelete.length,
      errors: errors.length > 0 ? errors : null,
      cutoffTime: cutoffTime.toISOString()
    };

    console.log('Cleanup result:', result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error('Error in cleanup-unconfirmed-users function:', error);
    
    const errorResult = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };

    return new Response(
      JSON.stringify(errorResult),
      {
        status: 500,
        headers: { 
          'Content-Type': 'application/json', 
          ...corsHeaders 
        },
      }
    );
  }
};

serve(handler);