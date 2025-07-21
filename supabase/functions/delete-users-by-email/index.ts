import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { emails } = await req.json()

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email array is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 400 
        }
      )
    }

    // Create admin client for auth operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log(`Starting deletion process for emails: ${emails.join(', ')}`)

    const results = []

    for (const email of emails) {
      try {
        // First, find users by email in auth.users
        const { data: authUsers, error: authFindError } = await supabaseAdmin.auth.admin.listUsers()
        
        if (authFindError) {
          console.error(`Error finding auth users: ${authFindError.message}`)
          results.push({ email, success: false, error: `Failed to find auth users: ${authFindError.message}` })
          continue
        }

        const userToDelete = authUsers.users.find(user => user.email === email)
        
        if (!userToDelete) {
          console.log(`No auth user found with email: ${email}`)
          results.push({ email, success: false, error: 'User not found in auth' })
          continue
        }

        const userId = userToDelete.id

        // Delete the profile from the profiles table
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .delete()
          .eq('user_id', userId)

        if (profileError) {
          console.error(`Error deleting profile for ${email}:`, profileError)
          results.push({ email, success: false, error: `Failed to delete profile: ${profileError.message}` })
          continue
        }

        console.log(`Profile deleted successfully for ${email}`)

        // Then, delete the user from auth.users
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (authError) {
          console.error(`Error deleting auth user for ${email}:`, authError)
          results.push({ email, success: false, error: `Failed to delete auth user: ${authError.message}` })
          continue
        }

        console.log(`Auth user deleted successfully for ${email}`)
        results.push({ email, success: true, message: 'User completely deleted from both profiles and auth' })

      } catch (error) {
        console.error(`Error processing ${email}:`, error)
        results.push({ email, success: false, error: error.message })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Processed ${emails.length} emails. ${successCount} successful, ${failCount} failed.`,
        results
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in delete-users-by-email function:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    )
  }
})