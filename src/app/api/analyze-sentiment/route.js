// app/api/analyze-sentiment/route.js

export async function POST(request) {
  console.log('📩 /api/analyze-sentiment called');

  // Parse JSON body
  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.error('❌ Invalid JSON input', err);
    return new Response('50', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt : null;
  if (!prompt) {
    console.error('❌ Missing prompt');
    return new Response('50', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const apiKey = process.env.GENERATIVE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ API key not set');
    return new Response('50', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  try {
    // Call Gemini Text API using correct payload shape
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: prompt }] }
          ]
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error('❌ Gemini API error', res.status, errText);
      return new Response('50', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract numeric score
    const match = text.match(/\d{1,3}/);
    const score = match ? Math.min(100, Math.max(0, parseInt(match[0], 10))) : 50;

    return new Response(score.toString(), {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (error) {
    console.error('❌ Error calling Gemini', error);
    return new Response('50', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
