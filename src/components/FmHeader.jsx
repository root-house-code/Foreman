import { useContext } from 'react';
import { FmNavContext } from '../context/FmNavContext';

function buildDateStrip() {
  const now = new Date();
  const DOW   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const MONTH = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const day = DOW[now.getDay()];
  const mon = MONTH[now.getMonth()];
  const date = now.getDate();
  const year = now.getFullYear();
  // ISO week number
  const tmp = new Date(Date.UTC(year, now.getMonth(), date));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const weekStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp - weekStart) / 86400000 + 1) / 7);
  return `${day} · ${mon} ${date} · ${year} · WEEK ${week}`;
}

const FOREMAN_PAGES = [
  { key: 'Read Me' },
  { key: 'Dashboard' },
  { key: 'Calendar' },
  { key: 'Floor Plan' },
  { key: 'Inventory' },
  { key: 'Maintenance' },
  { key: 'Services' },
  { key: 'Chores' },
  { key: 'To Dos' },
  { key: 'Projects' },
  { key: 'Lifecycle' },
  { key: 'Notebook' },
  { key: 'Preferences' },
];

function readOnlineMode() {
  try { return JSON.parse(localStorage.getItem('foreman-online-mode') ?? 'false'); }
  catch { return false; }
}

export default function FmHeader({ active, dateStrip = buildDateStrip(), tagline = 'your house, in order' }) {
  const nav = useContext(FmNavContext);
  const currentActive = active || nav.current;
  const onlineMode = readOnlineMode();

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
      <nav style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {onlineMode && (
          <div style={{ alignItems: 'center', display: 'flex', gap: '0.3rem', marginRight: '0.5rem' }}>
            <span style={{ background: 'var(--fm-green)', borderRadius: '50%', display: 'inline-block', height: '5px', width: '5px' }} />
            <span style={{ color: 'var(--fm-green)', fontFamily: 'var(--fm-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Online</span>
          </div>
        )}
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
