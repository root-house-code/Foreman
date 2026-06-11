import { useState, useContext } from 'react';
import { FmNavContext } from '../context/FmNavContext';
import { openCommandPalette } from '../../lib/commandPalette.js';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const KBD_HINT = IS_MAC ? '⌘K' : 'Ctrl K';

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

// Grouped navigation. Each group becomes a dropdown menu; singles render as
// direct buttons; meta pages sit apart on the right.
const NAV_GROUPS = [
  { label: 'Overview', pages: ['Dashboard', 'Calendar'] },
  { label: 'Property', pages: ['Floor Plan', 'Inventory', 'Lifecycle'] },
  { label: 'Upkeep',   pages: ['Maintenance', 'Services', 'Utilities', 'Supplies', 'Chores'] },
  { label: 'Work',     pages: ['To Dos', 'Projects'] },
];
const NAV_DIRECT = ['Notebook'];
const NAV_META   = ['Read Me', 'Preferences'];

function readOnlineMode() {
  try { return JSON.parse(localStorage.getItem('foreman-online-mode') ?? 'false'); }
  catch { return false; }
}

function GearIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const triggerStyle = (active) => ({
  padding: '5px 10px',
  borderRadius: 3,
  border: `1px solid ${active ? 'var(--fm-brass)' : 'var(--fm-hairline)'}`,
  background: active ? 'var(--fm-brass-bg)' : 'transparent',
  color: active ? 'var(--fm-brass)' : 'var(--fm-ink-dim)',
  fontFamily: 'var(--fm-mono)',
  fontSize: 10.5,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'color 0.15s',
});

function NavGroup({ group, currentActive, open, setOpen, navigate }) {
  const isOpen = open === group.label;
  const groupActive = group.pages.includes(currentActive);

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setOpen(group.label)}
      onMouseLeave={() => setOpen(o => (o === group.label ? null : o))}
    >
      <button
        onClick={() => setOpen(isOpen ? null : group.label)}
        style={{ ...triggerStyle(groupActive || isOpen), alignItems: 'center', display: 'inline-flex', gap: 4 }}
      >
        {group.label}
        <span style={{ fontSize: 8, opacity: 0.7, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.12s' }}>▾</span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 0,
            minWidth: 150,
            background: 'var(--fm-bg-raised)',
            border: '1px solid var(--fm-hairline2)',
            borderRadius: 4,
            boxShadow: '0 8px 24px #00000055',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            padding: 4,
            zIndex: 60,
          }}
        >
          {group.pages.map((page) => {
            const isActive = page === currentActive;
            return (
              <button
                key={page}
                onClick={() => { setOpen(null); if (!isActive) navigate(page); }}
                style={{
                  padding: '6px 10px',
                  borderRadius: 3,
                  border: 'none',
                  background: isActive ? 'var(--fm-brass-bg)' : 'transparent',
                  color: isActive ? 'var(--fm-brass)' : 'var(--fm-ink-dim)',
                  fontFamily: 'var(--fm-mono)',
                  fontSize: 10.5,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  textAlign: 'left',
                  cursor: isActive ? 'default' : 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.12s, background 0.12s',
                }}
                onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.color = 'var(--fm-ink)'; e.currentTarget.style.background = 'var(--fm-bg-panel)'; } }}
                onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.color = 'var(--fm-ink-dim)'; e.currentTarget.style.background = 'transparent'; } }}
              >
                {page}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FmHeader({ active, dateStrip = buildDateStrip(), tagline = 'your house, in order' }) {
  const nav = useContext(FmNavContext);
  const currentActive = active || nav.current;
  const onlineMode = readOnlineMode();
  const [open, setOpen] = useState(null);

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
        <button
          onClick={openCommandPalette}
          title={`Search (${KBD_HINT})`}
          style={{ alignItems: 'center', background: 'var(--fm-bg-sunk)', border: '1px solid var(--fm-hairline)', borderRadius: 3, color: 'var(--fm-ink-mute)', cursor: 'pointer', display: 'flex', fontFamily: 'var(--fm-mono)', fontSize: 10, gap: 6, marginRight: 6, padding: '5px 8px', transition: 'color 0.15s, border-color 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--fm-brass)'; e.currentTarget.style.color = 'var(--fm-ink-dim)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--fm-hairline)'; e.currentTarget.style.color = 'var(--fm-ink-mute)'; }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <span>Search</span>
          <span style={{ background: 'var(--fm-bg-raised)', border: '1px solid var(--fm-hairline2)', borderRadius: 2, color: 'var(--fm-ink-mute)', fontSize: 8.5, letterSpacing: '0.04em', padding: '1px 4px' }}>{KBD_HINT}</span>
        </button>
        {onlineMode && (
          <div style={{ alignItems: 'center', display: 'flex', gap: '0.3rem', marginRight: '0.5rem' }}>
            <span style={{ background: 'var(--fm-green)', borderRadius: '50%', display: 'inline-block', height: '5px', width: '5px' }} />
            <span style={{ color: 'var(--fm-green)', fontFamily: 'var(--fm-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Online</span>
          </div>
        )}

        {NAV_GROUPS.map((group) => (
          <NavGroup key={group.label} group={group} currentActive={currentActive} open={open} setOpen={setOpen} navigate={nav.navigate} />
        ))}

        {NAV_DIRECT.map((page) => {
          const isActive = page === currentActive;
          return (
            <button
              key={page}
              onClick={() => !isActive && nav.navigate(page)}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--fm-ink)'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--fm-ink-dim)'; }}
              style={{ ...triggerStyle(isActive), cursor: isActive ? 'default' : 'pointer' }}
            >
              {page}
            </button>
          );
        })}

        <span style={{ background: 'var(--fm-hairline)', height: 16, margin: '0 3px', width: 1 }} />

        {NAV_META.map((page) => {
          const isActive = page === currentActive;
          const isGear = page === 'Preferences';
          return (
            <button
              key={page}
              onClick={() => !isActive && nav.navigate(page)}
              title={page}
              aria-label={page}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--fm-ink-dim)'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--fm-ink-mute)'; }}
              style={{
                alignItems: 'center',
                display: 'inline-flex',
                padding: isGear ? '5px 6px' : '5px 8px',
                borderRadius: 3,
                border: `1px solid ${isActive ? 'var(--fm-brass)' : 'transparent'}`,
                background: isActive ? 'var(--fm-brass-bg)' : 'transparent',
                color: isActive ? 'var(--fm-brass)' : 'var(--fm-ink-mute)',
                fontFamily: 'var(--fm-mono)',
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: isActive ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
            >
              {isGear ? <GearIcon /> : page}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
