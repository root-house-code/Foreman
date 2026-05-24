import { useContext } from 'react';
import { FmNavContext } from '../context/FmNavContext';

const FOREMAN_PAGES = [
  { key: 'Read Me' },
  { key: 'Dashboard' },
  { key: 'Calendar' },
  { key: 'Floor Plan' },
  { key: 'Inventory' },
  { key: 'Maintenance' },
  { key: 'Chores' },
  { key: 'To Dos' },
  { key: 'Projects' },
  { key: 'Notebook' },
  { key: 'Preferences' },
];

export default function FmHeader({ active, dateStrip = 'WED · MAY 14 · 2026 · WEEK 20', tagline = 'your house, in order' }) {
  const nav = useContext(FmNavContext);
  const currentActive = active || nav.current;

  return (
    <header
      style={{
        padding: '16px 30px 14px',
        borderBottom: 'var(--fm-border)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        background: 'var(--fm-bg)',
      }}
    >
      <div>
        <div
          style={{
            color: 'var(--fm-ink-mute)',
            fontFamily: 'var(--fm-mono)',
            fontSize: 10,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            marginBottom: 2,
          }}
        >
          {dateStrip}
        </div>
        <h1
          style={{
            font: "500 28px var(--fm-serif)",
            color: 'var(--fm-ink)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          Foreman{' '}
          <span style={{ color: 'var(--fm-brass)' }}>/</span>{' '}
          <span style={{ color: 'var(--fm-brass-dim)', fontStyle: 'italic' }}>{tagline}</span>
        </h1>
      </div>
      <nav style={{ display: 'flex', gap: 6 }}>
        {FOREMAN_PAGES.map((p) => {
          const isActive = p.key === currentActive;
          return (
            <button
              key={p.key}
              onClick={() => !isActive && nav.navigate(p.key)}
              style={{
                padding: '5px 10px',
                borderRadius: 3,
                border: `1px solid ${isActive ? 'var(--fm-brass)' : 'var(--fm-hairline)'}`,
                background: isActive ? 'var(--fm-brass-bg)' : 'transparent',
                color: isActive ? 'var(--fm-brass)' : 'var(--fm-ink-dim)',
                fontFamily: 'var(--fm-mono)',
                fontSize: 10.5,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                cursor: isActive ? 'default' : 'pointer',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--fm-ink)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--fm-ink-dim)';
              }}
            >
              {p.key}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
