// app/api/tasks/route.js

export async function POST(request) {
  console.log('📩 /api/tasks called');

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.error('❌ Failed to parse JSON body in /api/tasks', err);
    return new Response(JSON.stringify({ error: 'Invalid JSON input.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages) {
    console.error('❌ Missing or invalid messages array');
    return new Response(JSON.stringify({ error: 'No messages provided.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Filter out promotional/auth emails
  messages = messages.filter(
    m =>
      !/(no-reply|noreply|promo|newsletter|feedback)/i.test(m.from || '') &&
      !/(promo|unsubscribe|verify|reset)/i.test(m.subject || '')
  );

  if (!messages.length) {
    console.error('❌ No messages left after filtering promotional emails');
    return new Response(JSON.stringify({ tasks: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Ensure Gemini API key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not set');
    return new Response(JSON.stringify({ error: 'Gemini API key is missing.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Build extraction prompt
  const prompt = `Extract tasks from the following email messages. For each task, provide a JSON object with keys: task (string), date (YYYY-MM-DD or null), time (HH:MM or null). There may be multiple tasks in one email. If the Email only says tomorrow, treat it as the next day from the day sent. Return an array of these JSON objects only. In Japanese. put them in the following order: first put those with both date and time, from earliest to latest, next put those with date only, from earliest to latest. 

${messages.map(msg => `MESSAGE:\n${msg.body}`).join('\n\n---\n\n')}`;

//console.log('📥 Sending prompt to Gemini:', prompt);

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
      console.error('❌ Gemini API error in /api/tasks', res.status, errText);
      return new Response(JSON.stringify({ error: 'Gemini API error.' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const data = await res.json();
    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Strip code fences or markdown wrappers
    raw = raw.replace(/^```\w*\s*/, '').replace(/\s*```$/,'').trim();
    // Attempt to parse the raw response as JSON
    let tasks;
    try {
      tasks = JSON.parse(raw);
      if (!Array.isArray(tasks)) throw new Error('Parsed value is not an array');
    } catch (e) {
      console.error('❌ Failed to parse tasks JSON:', e, 'Raw:', raw);
      return new Response(JSON.stringify({ error: 'Failed to parse tasks JSON.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return extracted tasks
    return new Response(JSON.stringify({ tasks }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('❌ Error in /api/tasks:', err);
    return new Response(JSON.stringify({ error: 'Internal server error extracting tasks.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
