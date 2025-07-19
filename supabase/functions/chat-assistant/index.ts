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

            // Get recent messages from project conversations for deeper context
            const { data: recentMessages } = await supabase
              .from('chat_messages')
              .select(`
                content,
                role,
                created_at,
                conversations!inner(folder_id, title)
              `)
              .eq('conversations.folder_id', conversation.folder_id)
              .order('created_at', { ascending: false })
              .limit(20);

            // Build project context
            projectContext = `
ACTIVE PROJECT: "${project.name}"
${project.description ? `Project Description: ${project.description}` : ''}

RECENT PROJECT CONVERSATIONS:
${projectConversations?.map(c => `- ${c.title} (${new Date(c.created_at).toLocaleDateString()})`).join('\n') || 'No previous conversations'}

RECENT PROJECT DISCUSSION CONTEXT:
${recentMessages?.slice(0, 10).map(m => `${m.role}: ${m.content.substring(0, 200)}...`).join('\n') || 'No previous messages'}

INSTRUCTIONS: You are Care Cuddle AI working within the "${project.name}" project. Use the context above to provide relevant, informed responses that build upon previous discussions in this project. Reference past conversations when relevant and maintain project continuity.`;

            console.log('Project context loaded for:', project.name);
          }
        }
      } catch (error) {
        console.error('Error loading project context:', error);
        // Continue without project context if there's an error
      }
    }

    // Prepare system message with project context
    const systemMessage = `You are Care Cuddle AI, a specialized assistant for care industry professionals. You help with care planning, compliance, documentation, and industry best practices.

${projectContext}

Key responsibilities:
- Provide expert guidance on care industry topics
- Help with care plans, risk assessments, and documentation
- Assist with CQC compliance and regulatory matters
- Support with staff training and development
- Offer practical solutions for care delivery challenges

Always be professional, empathetic, and focus on person-centered care principles.`;

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

    // Add system message to provide project context
    if (projectContext) {
      const systemMessageResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({
          role: 'user',
          content: `[SYSTEM CONTEXT UPDATE]\n${systemMessage}\n\nUser message: ${message}`
        })
      });

      if (!systemMessageResponse.ok) {
        console.warn('Failed to add system context, proceeding without it');
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