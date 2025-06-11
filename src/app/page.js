'use client';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { fetchSendersFromThreads, fetchMessagesFromThreads } from '../lib/gmail';
import { summarizeWithGemini } from '../lib/gemini';
import Tabs from './components/Tab';


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
const [activeTab, setActiveTab] = useState('inbox');
 const openThread = (threadIds) => {
   fetchMessagesFromThreads(threadIds, session.accessToken)
     .then((msgs) => {
       setMessages(msgs);
       setSummary(null);
       setActiveTab('details');
     })
     .catch(console.error);
 };


  const tabs = [
    { id: 'inbox', label: 'Inbox', content: <p></p> },
    { id: 'Sentiment Analysis', label: 'Sentiment Analysis', content: <p>Analyze the sentiment of your emails.</p> },
    { id: 'tasks', label: 'Tasks', content: <p>Manage your tasks from emails.</p> },
 
    { id: 'senders', label: 'Senders', content: <ul className="space-y-2">
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
        </ul> },
    { id: 'details', label: 'Details', content: messages ? (
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
                      className={`flex items-start gap-2 ${
                        isUser ? 'justify-end flex-row-reverse' : 'justify-start'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-400 text-white flex items-center justify-center text-sm font-bold">
                        {grp.sender.slice(0, 1).toUpperCase()}
                      </div>
                      <div
                        className={`max-w-lg p-3 rounded-lg shadow text-sm whitespace-pre-wrap space-y-1 ${
                          isUser ? 'bg-blue-100 text-right' : 'bg-gray-100 text-left'
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
  useEffect(() => {
    if (session?.accessToken) {
      fetchSendersFromThreads(session.accessToken, 20)
        .then((data) => {
          const senderList = Object.entries(data).map(([sender, value]) => ({
            sender,
            count: value.count,
            threadIds: value.threadIds,
          }));
          setSenders(senderList);
        })
        .catch(console.error);
    }
  }, [session]);

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
          {!messages && (
            <>
              <h2 className="text-xl font-bold mb-4">Your Gmail senders</h2>
              {senders.length === 0 ? (
                <p>Loading senders...</p>
              ) : (
                <ul className="space-y-2">
                  {senders.map((s, i) => (
                    <li 
                      key={`${s.sender}-${i}`}
                      onClick={() => {
                        fetchMessagesFromThreads(s.threadIds, session.accessToken)
                          .then(setMessages)
                          .catch(console.error);
                      }}
                      className="border p-3 rounded shadow hover:bg-gray-100 cursor-pointer"
                    >
                      <p><strong>{s.sender}</strong></p>
                      <p className="text-sm text-gray-500">{s.count} thread(s)</p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {Array.isArray(messages) && messages.length > 0 && (
            <div className="mt-10 flex flex-col space-y-4">
              <button
                onClick={() => {
                  setMessages(null);
                  setSummary(null);
                }}
                className="mb-4 px-3 py-1 text-sm bg-gray-300 rounded w-fit"
              >
                ← Back to Inbox
              </button>

              <div className="mb-4 flex flex-col gap-2">
                {!summary && (
                  <button
                    onClick={async () => {
                      setLoadingSummary(true);
                      const text = await summarizeWithGemini(messages);
                      setSummary(text);
                      setLoadingSummary(false);
                    }}
                    className="px-3 py-1 text-sm bg-yellow-400 hover:bg-yellow-300 rounded w-fit"
                  >
                    ✨ Summarize Conversation
                  </button>
                )}

                {summary && (
                  <button
                    onClick={() => setSummary(null)}
                    className="px-3 py-1 text-sm bg-gray-300 rounded w-fit"
                  >
                    ↩️ Show Full Thread
                  </button>
                )}

                {loadingSummary && <p className="text-sm text-gray-500">Generating summary...</p>}

                {summary && (
                  <div className="p-4 bg-yellow-100 border rounded text-sm whitespace-pre-wrap">
                    {summary}
                  </div>
                )}
              </div>

              {!summary && (() => {
                const grouped = groupMessagesByThreadAndSender(messages);
                const messagesByDate = {};
                grouped.forEach((group) => {
                  const label = formatDateLabel(group.date);
                  if (!messagesByDate[label]) messagesByDate[label] = [];
                  messagesByDate[label].push(group);
                });

                return Object.entries(messagesByDate).map(([dateLabel, groupList]) => (
                  <div key={dateLabel}>
                    <div className="text-center text-sm text-gray-500 my-4">
                      ── {dateLabel} ──
                    </div>
                    {groupList.map((group, i) => {
                      const isUser = group.sender.includes(session.user.email);
                      const initials = group.sender.slice(0, 1).toUpperCase();
                      return (
                        <div
                          key={`${group.threadId}-${i}`}
                          className={`flex items-start gap-2 ${
                            isUser ? 'justify-end flex-row-reverse' : 'justify-start'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-gray-400 text-white flex items-center justify-center text-sm font-bold">
                            {initials}
                          </div>
                          <div
                            className={`max-w-lg p-3 rounded-lg shadow text-sm whitespace-pre-wrap space-y-1 ${
                              isUser ? 'bg-blue-100 text-right' : 'bg-gray-100 text-left'
                            }`}
                          >
                            {group.messages.map((line, j) => (
                              <p key={j}>{line}</p>
                            ))}
                            <p className="mt-1 text-[11px] text-gray-400">
                              {group.date.toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          )}
        </>
      )}
    </main>
  );
}