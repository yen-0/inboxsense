'use client';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { fetchSendersFromThreads, fetchMessagesFromThreads, fetchThreadSubjects } from '../lib/gmail';
import { summarizeWithGemini } from '../lib/gemini';
import Tabs from './components/Tab';
import { analyzeSentiment } from '../lib/gemini';
import {decode as decodeBase64} from 'js-base64';
function linkifyText(text) {
  const urlRegex = /((https?:\/\/[^\s]+))/g;
  return text.replace(urlRegex, (url) => {
    return `<a href="${url}" class="text-blue-600 underline" target="_blank" rel="noopener noreferrer">LINK</a>`;
  });
}

function groupMessagesByThreadAndSender(messages) {
  const grouped = [];
  let lastGroupKey = '';

  for (const msg of messages) {
    const key = `${msg.threadId}-${msg.from}`;

    if (key !== lastGroupKey) {
      grouped.push({
        sender: msg.from,
        date: msg.date,
        threadId: msg.threadId,
        messages: [msg.body],
      });
      lastGroupKey = key;
    } else {
      grouped[grouped.length - 1].messages.push(msg.body);
    }
  }

  return grouped;
}

function formatDateLabel(date) {
  const today = new Date();
  const d = new Date(date);

  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, yesterday)) return 'Yesterday';

  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function Home() {
  const { data: session } = useSession();
  const [senders, setSenders] = useState([]);
  const [messages, setMessages] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [activeTab, setActiveTab] = useState('inbox');
  const [sentimentResults, setSentimentResults] = useState(null);
const [tasksResults, setTasksResults] = useState(null);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingSentiment, setLoadingSentiment] = useState(false);
  const [showGenInput, setShowGenInput] = useState(false);
  const [genInstruction, setGenInstruction] = useState('');
  const [generatedResp, setGeneratedResp] = useState('');
  const [loadingGen, setLoadingGen] = useState(false);
const [toAddress,   setToAddress]   = useState('');
const [emailSubject, setEmailSubject] = useState('');
const [htmlPreview, setHtmlPreview] = useState(''); 
  // Function to analyze sentiment of messages
  const loadAndAnalyzeSentiment = async () => {
    if (!allThreadIds.length) return;
    setLoadingSentiment(true);

    let flatMessages;
    try {
      // fetch all threads in one shot if your helper supports it:
      const msgs = await fetchMessagesFromThreads(allThreadIds, session.accessToken);

      // validate
      if (!Array.isArray(msgs)) {
        throw new Error('Expected array, got ' + typeof msgs);
      }
      // ensure each item is an object with a `body` field
      if (msgs.some((m) => typeof m !== 'object' || !('body' in m))) {
        throw new Error('Message items are missing required fields');
      }

      flatMessages = msgs;
    } catch (err) {
      console.error('❌ Invalid messages format:', err);
      alert('Failed to load messages for sentiment analysis.');
      setLoadingSentiment(false);
      return;
    }

    // filter out auth/promotional
    const filtered = flatMessages.filter(
      (m) =>
        !/(no-reply|noreply|promo|newsletter|verification|reset)/i.test(m.from || '') &&
        !/(promo|unsubscribe|reset|verify)/i.test(m.subject || '')
    );

    // if nothing left after filter, bail
    if (filtered.length === 0) {
      alert('No analyzable messages found.');
      setLoadingSentiment(false);
      return;
    }

    // get sentiment scores
    let scored;
    try {
      scored = await analyzeSentiment(filtered);
    } catch (err) {
      console.error('❌ Sentiment analysis failed:', err);
      alert('Sentiment analysis failed.');
      setLoadingSentiment(false);
      return;
    }

    // sort ascending
    scored.sort((a, b) => a.score - b.score);
    setSentimentResults(scored);
    setLoadingSentiment(false);
  };

  // Open a thread and fetch its messages
  const openThread = (threadIds) => {
    fetchMessagesFromThreads(threadIds, session.accessToken)
      .then((msgs) => {
        setMessages(msgs);
        const htmlMessage = msgs.find((m) => m.mimeType === 'text/html' || m.body?.mimetype === 'text/html');
        let htmlContent = '';
        if (htmlMessage?.body?.data) {
          try {
            htmlContent = decodeBase64(htmlMessage.body.data);
          } catch (err) {
            console.error('❌ Failed to decode HTML message:', err);
          }
        }
        setHtmlPreview(htmlContent);
        // Auto-fill recipient email (extract address only)
        const others = Array.from(
          new Set(msgs.map(m => m.from).filter(f => f !== session.user.email))
        );
        const raw = others[0] || '';
        const emailMatch = raw.match(/<([^>]+)>/);
        setToAddress(emailMatch ? emailMatch[1] : raw);
        // Auto-fill subject as Re: original
        const origSubj = subjects[msgs[0].threadId] || '';
        setEmailSubject(`Re: ${origSubj || '(no subject)'}`);
        setSummary(null);
        setGeneratedResp('');
        setShowGenInput(false);
        setGenInstruction('');
        setActiveTab('details');
      })
      .catch(console.error);
  };



  useEffect(() => {
    if (!session?.accessToken) return;

    fetchSendersFromThreads(session.accessToken, 20)
      .then((data) => {
        const list = Object.entries(data).map(([sender, v]) => ({
          sender,
          count: v.count,
          threadIds: v.threadIds,
        }));
        setSenders(list);

        // now fetch subjects for every thread
        const allIds = list.flatMap((s) => s.threadIds);
        if (allIds.length > 0) {
          setLoadingSubjects(true);
          fetchThreadSubjects(allIds, session.accessToken)
            .then((map) => setSubjects(map))
            .catch(console.error)
            .finally(() => setLoadingSubjects(false));
        }
      })
      .catch(console.error);
  }, [session]);

  const allThreadIds = senders.flatMap(s => s.threadIds);
const loadAndExtractTasks = async () => {
    if (!allThreadIds.length) return;
    setLoadingTasks(true);
    try {
      const msgs = await fetchMessagesFromThreads(allThreadIds, session.accessToken);
      const filtered = msgs.filter(m =>
        !/(no-reply|promo|newsletter|noreply|notifications|feedback|messages|team)/i.test(m.from) &&
        !/(unsubscribe|verify)/i.test(m.subject || '')
      );

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: filtered }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setTasksResults(data.tasks);
    } catch (err) {
      console.error('❌ Failed to extract tasks', err);
    } finally {
      setLoadingTasks(false);
    }
  };

  const generateResponse = async () => {
    if (!genInstruction || !messages) return;
    setLoadingGen(true);
    try {
      // You might want to include thread context or last message
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: genInstruction, threadId: messages[0]?.threadId , messages: messages }),
      });
      if (!res.ok) throw new Error(`Generate API error ${res.status}`);
      const data = await res.json();
      setGeneratedResp(data.response || '');
    } catch (err) {
      console.error('❌ generateResponse failed', err);
      setGeneratedResp('Failed to generate response.');
    } finally {
      setLoadingGen(false);
    }
  };

  // Function to send email (stub)
  const sendEmail = async () => {
  if (!toAddress || !emailSubject || !generatedResp) {
    alert('Fill in recipient, subject, and message first.');
    return;
  }

  // Build a raw RFC-2822 message string
  const rawMessage = 
    `To: ${toAddress}\r\n` +
    `Subject: ${emailSubject}\r\n\r\n` +
    generatedResp;

  // Base64-url encode
  const encoded = btoa(rawMessage)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    }
  );

  if (!res.ok) {
    console.error('Send failed', await res.text());
    alert('Failed to send email.');
  } else {
    alert('Email sent!');
    // clear out fields
    setToAddress('');
    setEmailSubject('');
    setGeneratedResp('');
    setShowGenInput(false);
  }
};


  const tabs = [
    {
      id: 'inbox',
      label: 'Inbox',
      content:
        // 1) still loading senders?
        senders.length === 0 ? (
          <p>Loading threads…</p>
        ) :
          // 2) threads loaded but subjects still fetching?
          loadingSubjects ? (
            <p>Loading subjects…</p>
          ) : (
            <ul className="space-y-2">
              {allThreadIds.map((threadId, idx) => (
                <li
                  key={`${threadId}-${idx}`}
                  onClick={() => openThread([threadId])}
                  className="border p-3 rounded shadow hover:bg-gray-100 cursor-pointer"
                >
                  <p>
                    <strong>
                      {subjects[threadId] ?? '(no subject)'}
                    </strong>
                  </p>
                </li>
              ))}
            </ul>
          ),
    },
     {
      id: 'sentiment',
      label: 'Sentiment',
      content: (
        <>
          {!sentimentResults ? (
            <button
              onClick={loadAndAnalyzeSentiment}
              disabled={loadingSentiment}
              className="px-4 py-2 bg-green-500 text-white rounded"
            >
              {loadingSentiment ? 'Analyzing…' : 'Analyze Sentiment'}
            </button>
          ) : (
            <ul className="space-y-2 mt-4">
              {sentimentResults.map((m, idx) => (
                <li
                  key={`${m.threadId ?? 'msg'}-${idx}`}
                  onClick={() => openThread([m.threadId])}
                  className="flex justify-between items-center border p-2 rounded hover:bg-gray-100 cursor-pointer"
                >
                  <span className="truncate">{m.subject || m.body.slice(0, 50) + '…'}</span>
                  <span className="flex items-center gap-1">
                    {m.score}% {m.score < 30 && <span title="Low sentiment">⚠️</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ),
    },
{
  id: 'tasks',
  label: 'Tasks',
  content: !tasksResults ? (
    <button
      onClick={loadAndExtractTasks}
      disabled={loadingTasks}
      className="px-4 py-2 bg-blue-500 text-white rounded"
    >
      {loadingTasks ? 'Extracting Tasks…' : 'Extract Tasks'}
    </button>
  ) : (
    <ul className="space-y-2 mt-4">
      {tasksResults.map((t, idx) => (
        <li key={`task-${idx}`} className="border p-3 rounded">
          <label className="flex items-center space-x-4">
            <input
              type="checkbox"
              className="form-checkbox h-5 w-5 text-blue-600"
            />
            <div
              className="flex-1 grid grid-cols-3 gap-4 cursor-pointer"
              onClick={() => openThread([t.threadId])}
            >
              <div className="font-medium text-gray-800">{t.date || '—'}</div>
              <div className="font-medium text-gray-800">{t.time || '—'}</div>
              <div className="font-normal text-gray-700">{t.task}</div>
            </div>
          </label>
        </li>
      ))}
    </ul>
  ),
},
    {
      id: 'senders', label: 'Senders', content: <ul className="space-y-2">
        {senders.map((s, i) => (
          <li
            key={`${s.sender}-${i}`}
            onClick={() => openThread(s.threadIds)}
            className="border p-3 rounded shadow hover:bg-gray-100 cursor-pointer"
          >
            <p><strong>{s.sender}</strong></p>
            <p className="text-sm text-gray-500">{s.count} thread(s)</p>
          </li>
        ))}
      </ul>
    },


  {
  id: 'details',
  label: 'Details',
  content: messages ? (
    <div className="flex flex-col space-y-6">
      {/* Back */}
      <button
        onClick={() => {
          setMessages(null);
          setSummary(null);
          setGeneratedResp('');
          setShowGenInput(false);
          setGenInstruction('');
          setActiveTab('inbox');
        }}
        className="px-3 py-1 bg-gray-300 rounded w-fit"
      >
        ← Back to Inbox
      </button>

      {/* Summarize / Full Thread */}
      <div className="flex gap-2">
        {!summary ? (
          <button
            onClick={async () => {
              setLoadingSummary(true);
              const text = await summarizeWithGemini(messages);
              setSummary(text);
              setLoadingSummary(false);
            }}
            className="px-3 py-1 bg-yellow-400 rounded"
          >
            ✨ Summarize
          </button>
        ) : (
          <button
            onClick={() => setSummary(null)}
            className="px-3 py-1 bg-gray-300 rounded"
          >
            ↩️ Full Thread
          </button>
        )}
        {loadingSummary && <span className="text-sm text-gray-500">…loading…</span>}
      </div>

      {/* Summary or Thread */}
      {summary ? (
        <div className="p-4 bg-yellow-100 border rounded text-sm whitespace-pre-wrap">
          {summary}
        </div>
      ) : (
        Object.entries(
          groupMessagesByThreadAndSender(messages).reduce((acc, grp) => {
            const label = formatDateLabel(grp.date);
            (acc[label] ||= []).push(grp);
            return acc;
          }, {})
        ).map(([dateLabel, list]) => (
          <div key={dateLabel}>
            <div className="text-center text-sm text-gray-500 my-4">
              ── {dateLabel} ──
            </div>
            {list.map((grp, i) => {
              const isUser = grp.sender.includes(session.user.email);
              return (
                <div
                  key={`${grp.threadId}-${i}`}
                  className={`flex w-full items-start gap-2 ${
                    isUser ? 'justify-end flex-row-reverse' : 'justify-start'
                  }`}
                >
                                    <div className="w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center text-white font-bold">
                    {grp.sender.charAt(0).toUpperCase()}
                  </div>
                  <div
                    className={`max-w-3xl p-3 rounded-lg shadow whitespace-pre-wrap ${
                      isUser ? 'bg-blue-100 text-right' : 'bg-gray-100 text-left'
                    }`}
                  >
                    {htmlPreview ? (
  <div
    className="prose max-w-full"
    dangerouslySetInnerHTML={{ __html: htmlPreview }}
  />
) : (
  <div
    className="prose max-w-full whitespace-pre-wrap"
    dangerouslySetInnerHTML={{
    __html: linkifyText(
      grp.messages.join('\n').replace(/\n{2,}/g, '\n') // collapse \n\n\n... → \n
    ),
  }}
  />
)}
                    <div className="text-[11px] text-gray-400 mt-1">
                      {new Date(grp.date).toLocaleTimeString()}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        ))
      )}

      {/* Generate Response */}
          {/* Generate Response Section */}
          <div className="mt-6 space-y-4">
            {/* Toggle input */}
            {!showGenInput ? (
              <button
                onClick={() => setShowGenInput(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded"
              >
                Generate Response
              </button>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={genInstruction}
                  onChange={e => setGenInstruction(e.target.value)}
                  placeholder="Enter your instructions..."
                  className="w-full p-2 border rounded h-24"
                />
                <button
                  onClick={generateResponse}
                  disabled={loadingGen}
                  className="px-4 py-2 bg-indigo-600 text-white rounded"
                >
                  {loadingGen ? 'Generating…' : 'Generate'}
                </button>
              </div>
            )}

            {/* Post-generation editable email composer */}
            {generatedResp && (
              <div className="space-y-2">
                <input
                  type="email"
                  value={toAddress}
                  placeholder="Recipient email"
                  className="w-full p-2 border rounded"
                  onChange={e => setToAddress(e.target.value)}
                />
                <input
                  type="text"
                  value={emailSubject}
                  placeholder="Email subject"
                  className="w-full p-2 border rounded"
                  onChange={e => setEmailSubject(e.target.value)}
                />
                <textarea
                  value={generatedResp}
                  onChange={e => setGeneratedResp(e.target.value)}
                  className="w-full p-2 border rounded h-32"
                />
                <button
                  onClick={sendEmail}
                  className="px-4 py-2 bg-green-500 text-white rounded"
                >
                  Send Email
                </button>
              </div>
            )}
          </div>
    </div>
  ) : (
    <p className="text-sm text-gray-500">Select a thread to see its details.</p>
  ),
}
  ];
  return (
    <main className="p-10">
      {!session ? (
        <button onClick={() => signIn('google')} className="px-4 py-2 bg-blue-500 text-white rounded-lg">
          Sign in with Google
        </button>
      ) : (
        <>
          <div className="mb-6">
            <p>Signed in as {session.user.email}</p>
            <button onClick={() => signOut()} className="mt-2 px-4 py-2 bg-gray-300 rounded-lg">
              Sign out
            </button>
          </div>
          <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />



        </>
      )}
    </main>
  );
}