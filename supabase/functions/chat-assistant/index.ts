import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, threadId, conversationId } = await req.json();
    console.log('Received message:', message, 'threadId:', threadId, 'conversationId:', conversationId);

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Initialize Supabase client for project context
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
    
    // Get comprehensive knowledge base context
    let knowledgeBaseContext = '';
    try {
      // Search for relevant pages based on the user's message
      const { data: relevantPages } = await supabase
        .from('pages')
        .select('id, title, content, tags, created_at, is_public')
        .or(`title.ilike.%${message.substring(0, 50)}%,content.ilike.%${message.substring(0, 50)}%`)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(5);

      // Also get the most recently updated pages for general context
      const { data: recentPages } = await supabase
        .from('pages')
        .select('id, title, content, tags, updated_at')
        .eq('is_public', true)
        .order('updated_at', { ascending: false })
        .limit(10);

      // Get all spaces for structural context
      const { data: spaces } = await supabase
        .from('spaces')
        .select('id, name, description')
        .order('name');

      // Get user profiles for team context
      const { data: profiles } = await supabase
        .from('profiles')
        .select('display_name, role, email')
        .order('display_name');

      // Build comprehensive knowledge base context
      const relevantContent = relevantPages?.map(page => 
        `Page: "${page.title}"\nContent: ${page.content.substring(0, 500)}...\nTags: ${page.tags?.join(', ') || 'None'}\n`
      ).join('\n') || '';

      const recentContent = recentPages?.slice(0, 5).map(page => 
        `- ${page.title} (Updated: ${new Date(page.updated_at).toLocaleDateString()})`
      ).join('\n') || '';

      const spacesList = spaces?.map(space => 
        `- ${space.name}: ${space.description || 'No description'}`
      ).join('\n') || '';

      const teamMembers = profiles?.map(profile => 
        `- ${profile.display_name || 'Unknown'} (${profile.role || 'viewer'}) - ${profile.email}`
      ).join('\n') || '';

      knowledgeBaseContext = `
CARE CUDDLE ACADEMY KNOWLEDGE BASE CONTEXT:

=== RELEVANT CONTENT FOR YOUR QUERY ===
${relevantContent}

=== RECENT PAGES IN KNOWLEDGE BASE ===
${recentContent}

=== AVAILABLE SPACES/SECTIONS ===
${spacesList}

=== TEAM MEMBERS ===
${teamMembers}

=== INSTRUCTIONS ===
You have access to the Care Cuddle Academy knowledge base above. Use this information to:
1. Provide specific, accurate answers based on the actual content
2. Reference relevant pages and resources when applicable
3. Suggest related content the user might find helpful
4. If information isn't in the knowledge base, clearly state that and offer to help create content
5. Maintain the care industry focus while being helpful and professional

When referencing content, mention the specific page titles so users know where to find more information.`;

      console.log('Knowledge base context loaded - relevant pages:', relevantPages?.length || 0);
    } catch (error) {
      console.error('Error loading knowledge base context:', error);
      knowledgeBaseContext = 'Knowledge base context temporarily unavailable.';
    }
    
    // Get project context if conversation belongs to a project
    let projectContext = '';
    if (conversationId) {
      try {
        // Get conversation details to find project folder
        const { data: conversation } = await supabase
          .from('conversations')
          .select('folder_id, title')
          .eq('id', conversationId)
          .single();

        if (conversation?.folder_id) {
          // Get project information
          const { data: project } = await supabase
            .from('chat_folders')
            .select('name, description, settings')
            .eq('id', conversation.folder_id)
            .single();

          if (project) {
            // Get recent conversations from the same project for context
            const { data: projectConversations } = await supabase
              .from('conversations')
              .select('title, created_at')
              .eq('folder_id', conversation.folder_id)
              .order('last_message_at', { ascending: false })
              .limit(5);

            // Build project context
            projectContext = `
ACTIVE PROJECT: "${project.name}"
${project.description ? `Project Description: ${project.description}` : ''}

RECENT PROJECT CONVERSATIONS:
${projectConversations?.map(c => `- ${c.title} (${new Date(c.created_at).toLocaleDateString()})`).join('\n') || 'No previous conversations'}

PROJECT INSTRUCTIONS: You are working within the "${project.name}" project. Use both the knowledge base and project context to provide informed responses.`;

            console.log('Project context loaded for:', project.name);
          }
        }
      } catch (error) {
        console.error('Error loading project context:', error);
        // Continue without project context if there's an error
      }
    }

    // Prepare system message with both knowledge base and project context
    const systemMessage = `You are Care Cuddle AI, a specialized assistant for care industry professionals with access to the complete Care Cuddle Academy knowledge base.

${knowledgeBaseContext}

${projectContext}

Key responsibilities:
- Use the knowledge base content to provide accurate, specific answers
- Reference actual pages and documents when relevant
- Help with care planning, compliance, documentation, and industry best practices
- Assist with CQC compliance and regulatory matters based on available resources
- Support with staff training and development using academy content
- Offer practical solutions for care delivery challenges
- When users ask about topics, check if there are relevant pages in the knowledge base first
- If information isn't available in the knowledge base, offer to help create or find the content

Always be professional, empathetic, and focus on person-centered care principles. When referencing knowledge base content, mention specific page titles so users can easily find and access the full information.`;

    let currentThreadId = threadId;

    // Create thread if none exists
    if (!currentThreadId) {
      console.log('Creating new thread');
      const threadResponse = await fetch('https://api.openai.com/v1/threads', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({})
      });

      if (!threadResponse.ok) {
        throw new Error(`Failed to create thread: ${threadResponse.statusText}`);
      }

      const thread = await threadResponse.json();
      currentThreadId = thread.id;
      console.log('Created thread:', currentThreadId);
    }

    // Add system message with context to provide comprehensive information
    if (knowledgeBaseContext || projectContext) {
      const systemMessageResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({
          role: 'user',
          content: `[KNOWLEDGE BASE & CONTEXT UPDATE]\n${systemMessage}\n\nUser message: ${message}`
        })
      });

      if (!systemMessageResponse.ok) {
        console.warn('Failed to add context, proceeding without it');
      }
    } else {
      // Add user message to thread
      console.log('Adding message to thread');
      const messageResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({
          role: 'user',
          content: message
        })
      });

      if (!messageResponse.ok) {
        throw new Error(`Failed to add message: ${messageResponse.statusText}`);
      }
    }

    // Run the assistant
    console.log('Running assistant');
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        assistant_id: 'asst_42BXexIUNRaigCU0QeembwTd'
      })
    });

    if (!runResponse.ok) {
      throw new Error(`Failed to run assistant: ${runResponse.statusText}`);
    }

    const run = await runResponse.json();
    let runStatus = run.status;
    console.log('Initial run status:', runStatus);

    // Poll for completion
    while (runStatus === 'queued' || runStatus === 'in_progress') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs/${run.id}`, {
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });

      if (!statusResponse.ok) {
        throw new Error(`Failed to check run status: ${statusResponse.statusText}`);
      }

      const statusData = await statusResponse.json();
      runStatus = statusData.status;
      console.log('Run status:', runStatus);
    }

    if (runStatus !== 'completed') {
      throw new Error(`Run failed with status: ${runStatus}`);
    }

    // Get messages
    console.log('Fetching messages');
    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });

    if (!messagesResponse.ok) {
      throw new Error(`Failed to get messages: ${messagesResponse.statusText}`);
    }

    const messages = await messagesResponse.json();
    const assistantMessage = messages.data[0];
    
    let responseText = '';
    if (assistantMessage && assistantMessage.content && assistantMessage.content[0]) {
      responseText = assistantMessage.content[0].text.value;
      
      // Remove citation references
      responseText = responseText.replace(/【[^】]*†[^】]*】/g, '');
      responseText = responseText.replace(/\[[^\]]*†[^\]]*\]/g, '');
      responseText = responseText.replace(/\[[^\]]*source[^\]]*\]/gi, '');
    }

    console.log('Assistant response:', responseText);

    return new Response(
      JSON.stringify({ 
        response: responseText,
        threadId: currentThreadId
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error in chat-assistant function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An unexpected error occurred' 
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }, 
        status: 500 
      }
    );
  }
});