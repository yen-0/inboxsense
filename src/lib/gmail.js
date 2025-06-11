export async function fetchGmailThreads(accessToken) {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=10', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  
    if (!res.ok) {
      throw new Error(`Failed to fetch Gmail threads: ${res.status}`);
    }
  
    const data = await res.json();
    const threads = data.threads || [];
  
    // Fetch detailed info for each thread
    const detailed = await Promise.all(
      threads.map(async (thread) => {
        const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread.id}?format=metadata`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const threadData = await res.json();
        const message = threadData.messages?.[0];
  
        const headers = message?.payload?.headers || [];
  
        const getHeader = (name) =>
          headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || 'N/A';
  
        return {
          id: thread.id,
          subject: getHeader('Subject'),
          from: getHeader('From'),
          date: getHeader('Date'),
        };
      })
    );
  
    return detailed;
  }
  export async function fetchFullThread(threadId, accessToken) {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  
    if (!res.ok) throw new Error(`Failed to fetch thread ${threadId}`);
  
    const data = await res.json();
  
    const messages = data.messages.map((msg) => {
      const headers = msg.payload.headers;
      const getHeader = (name) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || 'N/A';
  
      const from = getHeader('From');
      const date = getHeader('Date');
      const subject = getHeader('Subject');
  
      const bodyPart =
        msg.payload.parts?.find((p) => p.mimeType === 'text/plain') || msg.payload;
      function decodeBase64UrlSafe(data) {
          if (!data) return '';
          const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
          const decoded = atob(base64);
          return decodeURIComponent(escape(decoded)); // for UTF-8 safety
      }
          
      const body = decodeBase64UrlSafe(bodyPart.body?.data || '');  
  
      return {
        id: msg.id,
        from,
        date,
        subject,
        body,
      };
    });
  
    return messages;
  }
  export async function fetchSendersFromThreads(accessToken, limit = 20) {
    // Step 1: List thread IDs
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
  
    if (!listRes.ok) throw new Error(`Failed to list threads: ${listRes.status}`);
    const { threads = [] } = await listRes.json();
  
    // Step 2: For each thread, get metadata and extract sender
    const senderMap = {};
  
    for (const thread of threads) {
      const metaRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread.id}?format=metadata`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
  
      if (!metaRes.ok) continue;
      const threadData = await metaRes.json();
      const headers = threadData.messages?.[0]?.payload?.headers || [];
  
      const fromHeader = headers.find((h) => h.name.toLowerCase() === 'from');
      const sender = fromHeader?.value || 'Unknown Sender';
  
      // Count messages per sender
      if (!senderMap[sender]) {
        senderMap[sender] = {
          count: 1,
          threadIds: [thread.id],
        };
      } else {
        senderMap[sender].count += 1;
        senderMap[sender].threadIds.push(thread.id);
      }
    }
  
    return senderMap;
  }

  export async function fetchMessagesFromThreads(threadIds, accessToken) {
    const allMessages = [];
  
    for (const threadId of threadIds) {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
  
      if (!res.ok) continue;
  
      const data = await res.json();
      const messages = data.messages || [];
  
      for (const msg of messages) {
        const headers = msg.payload.headers;
        const getHeader = (name) =>
          headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || 'N/A';
  
        const from = getHeader('From');
        const date = getHeader('Date');
        const subject = getHeader('Subject');
  
        const bodyPart =
          msg.payload.parts?.find((p) => p.mimeType === 'text/plain') || msg.payload;
  
        const decoded = decodeBase64UrlSafe(bodyPart.body?.data || '');
  
        allMessages.push({
          id: msg.id,
          threadId: threadId,
          from,
          date: new Date(date),
          subject,
          body: decoded,
        });
      }
    }
  
    // Sort all messages by date (ascending)
    return allMessages.sort((a, b) => a.date - b.date);
  }
  
  function decodeBase64UrlSafe(data) {
    if (!data) return '';
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    try {
      const decoded = atob(base64);
      return decodeURIComponent(escape(decoded));
    } catch (e) {
      return '[Unable to decode message]';
    }
  }
  