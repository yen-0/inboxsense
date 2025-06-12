'use client';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { fetchSendersFromThreads, fetchMessagesFromThreads, fetchThreadSubjects } from '../lib/gmail';
import { summarizeWithGemini } from '../lib/gemini';
import Tabs from './components/Tab';
import { analyzeSentiment } from '../lib/gemini';

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

  const [loadingSentiment, setLoadingSentiment] = useState(false);

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
        setSummary(null);
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
              {allThreadIds.map((threadId) => (
                <li
                  key={threadId}
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
                  key={m.threadId || idx}
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
    { id: 'tasks', label: 'Tasks', content: <p>Manage your tasks from emails.</p> },

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
      id: 'details', label: 'Details', content: messages ? (
        <div className="flex flex-col space-y-4">
          <button
            onClick={() => {
              setMessages(null);
              setSummary(null);
              setActiveTab('inbox');
            }}
            className="mb-4 px-3 py-1 text-sm bg-gray-300 rounded w-fit"
          >
            ← Back to Inbox
          </button>
          <div className="mb-4 flex gap-2">
            {!summary ? (
              <button
                onClick={async () => {
                  setLoadingSummary(true);
                  const text = await summarizeWithGemini(messages);
                  setSummary(text);
                  setLoadingSummary(false);
                }}
                className="px-3 py-1 text-sm bg-yellow-400 hover:bg-yellow-300 rounded"
              >
                ✨ Summarize
              </button>
            ) : (
              <button
                onClick={() => setSummary(null)}
                className="px-3 py-1 text-sm bg-gray-300 rounded"
              >
                ↩️ Full Thread
              </button>
            )}
            {loadingSummary && <p className="text-sm text-gray-500">…loading…</p>}
          </div>
          {summary ? (
            <div className="p-4 bg-yellow-100 border rounded text-sm whitespace-pre-wrap">
              {summary}
            </div>
          ) : (
            Object.entries(
              groupMessagesByThreadAndSender(messages).reduce((acc, group) => {
                const label = formatDateLabel(group.date);
                (acc[label] ||= []).push(group);
                return acc;
              }, {})
            ).map(([dateLabel, groupList]) => (
              <div key={dateLabel}>
                <div className="text-center text-sm text-gray-500 my-4">
                  ── {dateLabel} ──
                </div>
                {groupList.map((grp, i) => {
                  const isUser = grp.sender.includes(session.user.email);
                  return (
                    <div
                      key={`${grp.threadId}-${i}`}
                      className={`flex items-start gap-2 ${isUser ? 'justify-end flex-row-reverse' : 'justify-start'
                        }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-400 text-white flex items-center justify-center text-sm font-bold">
                        {grp.sender.slice(0, 1).toUpperCase()}
                      </div>
                      <div
                        className={`max-w-lg p-3 rounded-lg shadow text-sm whitespace-pre-wrap space-y-1 ${isUser ? 'bg-blue-100 text-right' : 'bg-gray-100 text-left'
                          }`}
                      >
                        {grp.messages.map((line, j) => (
                          <p key={j}>{line}</p>
                        ))}
                        <p className="mt-1 text-[11px] text-gray-400">
                          {new Date(grp.date).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Select a thread to see its details.</p>
      ),
    },
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