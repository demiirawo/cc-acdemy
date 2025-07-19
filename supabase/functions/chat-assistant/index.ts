import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, threadId, attachedFiles } = await req.json();
    console.log('Received message:', message, 'threadId:', threadId);

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Prepare the system message for Care Cuddle AI
    const systemMessage = `You are Care Cuddle AI, a comprehensive AI assistant specializing in the care industry.

Provide detailed, thorough, and comprehensive responses. When answering questions:

1. Give complete explanations with context and background information
2. Include practical examples and real-world scenarios from the care industry
3. Break down complex topics into clear, detailed steps
4. Provide thorough analysis and reasoning
5. Offer multiple perspectives or approaches when applicable
6. Include relevant best practices, CQC regulations, and recommendations
7. Be conversational but informative and professional
8. Draw from your knowledge of care industry standards, regulations, best practices, and real-world applications

There are NO limits on response length. Provide as much detail and information as necessary to thoroughly address the user's needs. Aim for comprehensive, valuable insights that fully explore the topic.

When discussing care industry topics, always consider:
- CQC fundamental standards and regulations
- Person-centered care approaches
- Risk assessment and management
- Documentation and record-keeping requirements
- Staff training and development
- Quality assurance processes
- Safeguarding procedures
- Health and safety considerations`;

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openAIApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: message }
              ],
              stream: true,
              max_tokens: 4000, // Allow for longer responses
              temperature: 0.7
            }),
          });

          if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.statusText}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('Failed to get response reader');
          }

          let buffer = '';
          let fullResponse = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += new TextDecoder().decode(value);
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  // Send the final response with thread info
                  const finalData = {
                    type: 'done',
                    response: fullResponse,
                    threadId: threadId || `thread_${Date.now()}`
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalData)}\n\n`));
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta?.content;
                  
                  if (delta) {
                    // Remove citation references
                    let cleanDelta = delta;
                    cleanDelta = cleanDelta.replace(/【[^】]*†[^】]*】/g, '');
                    cleanDelta = cleanDelta.replace(/\[[^\]]*†[^\]]*\]/g, '');
                    cleanDelta = cleanDelta.replace(/\[[^\]]*source[^\]]*\]/gi, '');
                    
                    fullResponse += cleanDelta;
                    
                    const streamData = {
                      type: 'delta',
                      content: cleanDelta
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(streamData)}\n\n`));
                  }
                } catch (e) {
                  console.error('Error parsing SSE data:', e);
                }
              }
            }
          }
        } catch (error) {
          console.error('Streaming error:', error);
          const errorData = {
            type: 'error',
            error: error.message
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

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