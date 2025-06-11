"use client";

import { useState, useEffect } from 'react';

export default function Tabs({ tabs, activeTab, onTabChange }) {
  // initialize local activeId from prop or first tab
  const [activeId, setActiveId] = useState(activeTab ?? tabs[0].id);

  // whenever parent changes activeTab, sync it
  useEffect(() => {
    if (activeTab && activeTab !== activeId) {
      setActiveId(activeTab);
    }
  }, [activeTab]);

  function handleClick(id) {
    setActiveId(id);
    onTabChange?.(id);
  }

  return (
    <div>
      <nav className="flex border-b">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => handleClick(id)}
            className={
              "px-4 py-2 -mb-px focus:outline-none " +
              (activeId === id
                ? "border-b-2 border-blue-600 font-semibold"
                : "text-gray-500 hover:text-gray-700")
            }
          >
            {label}
          </button>
        ))}
      </nav>
      <section className="p-4">
        {tabs.map(({ id, content }) =>
          activeId === id ? <div key={id}>{content}</div> : null
        )}
      </section>
    </div>
  );
}
