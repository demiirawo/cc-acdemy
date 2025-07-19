import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const assistantId = 'asst_42BXexIUNRaigCU0QeembwTd';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, threadId } = await req.json();
    console.log('Received message:', message, 'threadId:', threadId);

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

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

    // Add message to thread
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
        assistant_id: assistantId,
        additional_instructions: `Please provide comprehensive, detailed, and thorough responses. When answering questions:

1. Give complete explanations with context and background information
2. Include practical examples and scenarios where relevant
3. Break down complex topics into clear, detailed steps
4. Provide thorough analysis and reasoning
5. Offer multiple perspectives or approaches when applicable
6. Include relevant best practices and recommendations
7. Be conversational but informative, ensuring responses are substantial and helpful

Avoid brief or minimal responses. Aim for comprehensive answers that fully address the user's needs and provide valuable insights.`
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
      
      // Remove citation references like [4:7†source], 【4:2†source】, etc.
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