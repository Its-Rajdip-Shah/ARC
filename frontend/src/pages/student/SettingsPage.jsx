import { useState } from 'react'

const TABS = [
  { id: 'integration', label: 'Integration' },
  { id: 'account', label: 'Account' },
]

export default function SettingsPage() {
  const [tab, setTab] = useState('integration')

  return (
    <div className="mx-auto max-w-2xl px-6 pb-16 pt-24">
      <header className="mb-8">
        <h1 className="font-display text-3xl text-arc-text">Settings</h1>
        <p className="mt-2 text-sm text-arc-text-secondary">
          Canvas connection and scheduler intensity.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Settings sections"
        className="mb-6 flex gap-1 rounded-[28px] border border-[#4a496b] bg-arc-panel p-1"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`h-[26px] flex-1 rounded-[28px] text-[15px] transition-colors ${
              tab === item.id
                ? 'bg-arc-blue text-arc-text'
                : 'text-arc-text hover:bg-arc-blue/30'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'integration' ? (
        <p className="text-sm text-arc-text-muted">Canvas integration.</p>
      ) : (
        <p className="text-sm text-arc-text-muted">Scheduler flavour.</p>
      )}
    </div>
  )
}
