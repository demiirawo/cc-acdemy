import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
    // Create admin client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get the authenticated user from the request
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      throw new Error('Insufficient permissions. Only admins can diagnose users.');
    }

    console.log(`Admin ${user.email} requesting user diagnosis`);

    // Get all users from auth.users
    const { data: authUsers, error: authUsersError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (authUsersError) {
      throw new Error(`Failed to get auth users: ${authUsersError.message}`);
    }

    // Get all profiles
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('*');

    if (profilesError) {
      throw new Error(`Failed to get profiles: ${profilesError.message}`);
    }

    // Find users who exist in auth but not in profiles
    const orphanedAuthUsers = authUsers.users.filter(authUser => 
      !profiles.some(profile => profile.user_id === authUser.id)
    );

    // Find profiles who don't have corresponding auth users
    const orphanedProfiles = profiles.filter(profile => 
      !authUsers.users.some(authUser => authUser.id === profile.user_id)
    );

    // Look specifically for Faizay
    const faizayInAuth = authUsers.users.find(u => u.email === 'faizay.irawo@care-cuddle.co.uk');
    const faizayInProfiles = profiles.find(p => p.email === 'faizay.irawo@care-cuddle.co.uk');

    const diagnosis = {
      totalAuthUsers: authUsers.users.length,
      totalProfiles: profiles.length,
      orphanedAuthUsers: orphanedAuthUsers.map(u => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        email_confirmed_at: u.email_confirmed_at
      })),
      orphanedProfiles: orphanedProfiles.map(p => ({
        id: p.id,
        user_id: p.user_id,
        email: p.email,
        display_name: p.display_name
      })),
      faizayStatus: {
        inAuth: faizayInAuth ? {
          id: faizayInAuth.id,
          email: faizayInAuth.email,
          created_at: faizayInAuth.created_at,
          email_confirmed_at: faizayInAuth.email_confirmed_at
        } : null,
        inProfiles: faizayInProfiles ? {
          id: faizayInProfiles.id,
          user_id: faizayInProfiles.user_id,
          email: faizayInProfiles.email,
          display_name: faizayInProfiles.display_name
        } : null
      }
    };

    console.log('User diagnosis:', diagnosis);

    return new Response(
      JSON.stringify({ 
        success: true, 
        diagnosis 
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Diagnosis error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 400,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});