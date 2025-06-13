// app/api/generate/route.js

export async function POST(request) {
  console.log('📩 /api/generate called');

  // Parse JSON body: expect { instruction: string, threadId: string, messages: Array }
  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.error('❌ Invalid JSON in /api/generate', err);
    return new Response(JSON.stringify({ error: 'Invalid JSON.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { instruction, threadId, messages } = body;
  if (typeof instruction !== 'string' || !threadId) {
    console.error('❌ Missing instruction or threadId');
    return new Response(JSON.stringify({ error: 'instruction and threadId are required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // messages optional but include body if provided
  let threadContent = '';
  if (Array.isArray(messages) && messages.length) {
    threadContent = messages.map(m => (
      `FROM: ${m.from}\nDATE: ${new Date(m.date).toLocaleString()}\nMESSAGE:\n${m.body}`
    )).join('\n\n---\n\n');
  }

  // Ensure API key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not set');
    return new Response(JSON.stringify({ error: 'API key missing.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Build prompt including thread context and instruction
const prompt =
  `You are composing a professional reply to the following email.` +
  (threadContent ? `\n\nEmail thread:\n${threadContent}\n\n` : '') +
  `Please consider the context and write a response based on the instruction below.\n` +
  `The reply must:\n` +
  `- Match the language used in the original email (Japanese or English)\n` +
  `- Maintain a professional and respectful tone, even if the user instruction is casual or informal\n` +
  `- Address the sender by name if available\n` +
  `- Include no extra explanations or brackets—just the reply email content itself\n` +
  `- If the sender's name is known, end the email with 'From [Your Name]'; otherwise, omit the sign-off\n\n` +
  `User instruction: "${instruction}"\n\n` +
  `Write the email reply below:\n`;
console.log('📜 Generated prompt:', prompt)
  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error('❌ Gemini API error:', res.status, errText);
      throw new Error(errText);
    }

    const data = await res.json();
    const generated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    return new Response(JSON.stringify({ response: generated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('❌ Error in /api/generate:', err);
    return new Response(JSON.stringify({ error: 'Generation failed.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
