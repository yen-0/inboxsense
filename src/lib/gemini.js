
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


  export async function analyzeSentiment(messages) {
  const results = [];

  for (const msg of messages) {
    // build a prompt that returns just a number
    const prompt = `
On a scale from 0 (super grumpy) to 100 (super friendly), rate the sentiment of this email:

${msg.body}

Respond with only the number.`;

    const response = await fetch('/api/analyze-sentiment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    const text = await response.text();
    console.log('Sentiment response:', text);

    const matchArr = text.match(/\d{1,3}/);
    const score = matchArr
      ? Math.min(100, Math.max(0, parseInt(matchArr[0], 10)))
      : 50;

    results.push({
      ...msg,
      score,
    });
  }

  return results;
}

