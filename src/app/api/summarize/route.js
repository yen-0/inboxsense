export async function POST(req) {
    console.log('📩 summarize API was called');
  
    let body;
    try {
      body = await req.json();
    } catch (err) {
      console.error('❌ Failed to parse JSON body');
      return new Response(JSON.stringify({ summary: 'Invalid JSON input.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  
    console.log('📥 Received body:', body);
  
    if (!body.messages || !Array.isArray(body.messages)) {
      console.log('❌ Invalid messages format');
      return new Response(
        JSON.stringify({ summary: 'No messages to summarize.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  
    const messages = body.messages;
  
    if (!process.env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ summary: 'Gemini API key is missing.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  
    if (messages.length === 0) {
      return new Response(JSON.stringify({ summary: 'Message list is empty.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  
    const limitedMessages = messages.slice(0, 100);
  
    const prompt = `Summarize the following email conversation in 3–5 bullet points.
  Focus on the key points, actions, and requests.
  
  ${limitedMessages
      .map(
        (msg) => `FROM: ${msg.from}
  DATE: ${new Date(msg.date).toLocaleString()}
  MESSAGE:
  ${msg.body}`
      )
      .join('\n\n---\n\n')}`;
  
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
        }),
      });
  
      const data = await res.json();
      console.log('Gemini response:', JSON.stringify(data, null, 2));
  
      const summary =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        data.candidates?.[0]?.content?.parts?.[0]?.stringValue ||
        'No summary available.';
  
      return new Response(JSON.stringify({ summary }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Gemini error:', error);
      return new Response(
        JSON.stringify({ summary: 'An error occurred while summarizing.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
  