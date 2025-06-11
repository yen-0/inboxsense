export async function summarizeWithGemini(messages) {
    const res = await fetch('/api/summarize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // ✅ THIS IS THE FIX: send messages, not contents!
      body: JSON.stringify({ messages }),
    });
  
    if (!res.ok) {
      const errorText = await res.text();
      console.error('❌ Gemini API error:', res.status, errorText);
      return 'Failed to summarize: ' + (errorText || 'Unknown error.');
    }
  
    const data = await res.json();
    return data.summary || 'No summary returned.';
  }
  