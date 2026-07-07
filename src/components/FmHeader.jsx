import { useState, useContext, useMemo, useEffect, useRef } from 'react';
import { FmNavContext } from '../context/FmNavContext';
import { openCommandPalette } from '../../lib/commandPalette.js';
import PageInfoButton from '../../components/PageInfoButton.jsx';
import useIsMobile from '../hooks/useIsMobile.js';
import { useForemanStore } from '../../lib/store.js';
import { buildAlerts, summarizeAlerts } from '../../lib/alerts.js';
import { loadChoreNextDates } from '../../lib/chores.js';
import { storageGet } from '../../lib/storage.js';

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
  const tmp = new Date(Date.UTC(year, now.getMonth(), date));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const weekStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp - weekStart) / 86400000 + 1) / 7);
  return `${day} · ${mon} ${date} · ${year} · WEEK ${week}`;
}

const NAV_TOP    = ['Workbench', 'Dashboard', 'Calendar'];
const NAV_GROUPS = [
  { label: 'Property', pages: ['Floor Plan', 'Inventory', 'Item Lifespans', 'Supplies'] },
  { label: 'Finances', pages: ['Spending', 'Forecast', 'Services', 'Utilities', 'Mortgage'] },
  { label: 'Work',     pages: ['Maintenance', 'Chores', 'To Dos', 'Projects'] },
];
const NAV_DIRECT = ['Notebook'];
const NAV_META   = ['Read Me', 'Preferences'];

const KIND_LABEL = {
  maintenance: 'MAINT', chore: 'CHORE', warranty: 'WARR',
  supply: 'SUPPLY', service: 'SVC', planned: 'PLAN', mortgage: 'MORTG',
};

const KIND_COLOR = {
  maintenance: 'var(--fm-brass)',
  chore:       'var(--fm-green)',
  warranty:    'var(--fm-cyan)',
  supply:      'var(--fm-amber)',
  service:     'var(--fm-ink-dim)',
  planned:     'var(--fm-ink-dim)',
  mortgage:    'var(--fm-red)',
};

const TRAY_SECTIONS = [
  { severity: 'overdue', label: 'Overdue',  color: 'var(--fm-red)'   },
  { severity: 'soon',    label: 'Due Soon', color: 'var(--fm-amber)' },
  { severity: 'info',    label: 'Heads-Up', color: 'var(--fm-brass)' },
];

function fmtTrayDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function readOnlineMode() {
  try { return JSON.parse(localStorage.getItem('foreman-online-mode') ?? 'false'); }
  catch { return false; }
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function BellIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }} aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function GearIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ── Alerts Tray ───────────────────────────────────────────────────────────────

function AlertsTray({ navigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const itemFieldValues = useForemanStore(s => s.itemFieldValues);
  const inventory       = useForemanStore(s => s.inventory);
  const supplies        = useForemanStore(s => s.supplies);
  const services        = useForemanStore(s => s.services);
  const chores          = useForemanStore(s => s.chores);
  const budget          = useForemanStore(s => s.budget);
  const [choreNextDates] = useState(() => loadChoreNextDates());
  const nextDatesMap = useMemo(() => storageGet('maintenance-next-dates') ?? {}, []);

  const alerts = useMemo(
    () => buildAlerts({ itemFieldValues, inventory, supplies, services, chores, choreNextDates, nextDatesMap, budget }),
    [itemFieldValues, inventory, supplies, services, chores, choreNextDates, nextDatesMap, budget]
  );
  const summary = useMemo(() => summarizeAlerts(alerts), [alerts]);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const badgeCount = summary.overdue + summary.soon;
  const badgeColor = summary.overdue > 0 ? 'var(--fm-red)' : 'var(--fm-amber)';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Alerts"
        aria-label={`Alerts${badgeCount > 0 ? ` — ${badgeCount} pending` : ''}`}
        style={{
          alignItems: 'center',
          background: open ? 'var(--fm-bg-sunk)' : 'transparent',
          border: `1px solid ${badgeCount > 0 ? badgeColor + '66' : 'var(--fm-hairline)'}`,
          borderRadius: 3,
          color: badgeCount > 0 ? badgeColor : 'var(--fm-ink-mute)',
          cursor: 'pointer',
          display: 'flex',
          gap: 5,
          padding: '5px 7px',
          transition: 'color 0.15s, border-color 0.15s',
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.borderColor = 'var(--fm-hairline2)'; e.currentTarget.style.color = badgeCount > 0 ? badgeColor : 'var(--fm-ink-dim)'; } }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.borderColor = badgeCount > 0 ? badgeColor + '66' : 'var(--fm-hairline)'; e.currentTarget.style.color = badgeCount > 0 ? badgeColor : 'var(--fm-ink-mute)'; } }}
      >
        <BellIcon size={12} />
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor,
            borderRadius: 8,
            color: '#0a0c11',
            fontFamily: 'var(--fm-mono)',
            fontSize: 8,
            fontWeight: 700,
            lineHeight: 1,
            minWidth: 14,
            padding: '2px 4px',
            textAlign: 'center',
          }}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          background: 'var(--fm-bg-raised)',
          border: '1px solid var(--fm-hairline2)',
          borderRadius: 4,
          boxShadow: '0 8px 32px #00000066',
          maxHeight: 440,
          maxWidth: 'calc(100vw - 24px)',
          minWidth: 'min(300px, calc(100vw - 24px))',
          overflowY: 'auto',
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 6px)',
          zIndex: 70,
        }}>
          {alerts.length === 0 ? (
            <div style={{ color: 'var(--fm-green)', fontFamily: 'var(--fm-serif)', fontSize: '0.88rem', padding: '1.25rem 1rem', textAlign: 'center' }}>
              All clear
            </div>
          ) : (
            TRAY_SECTIONS.map(({ severity, label, color }) => {
              const items = alerts.filter(a => a.severity === severity);
              if (items.length === 0) return null;
              return (
                <div key={severity} style={{ paddingBottom: '0.35rem' }}>
                  <div style={{
                    color,
                    fontFamily: 'var(--fm-mono)',
                    fontSize: '0.55rem',
                    letterSpacing: '0.14em',
                    padding: '0.55rem 0.85rem 0.2rem',
                    textTransform: 'uppercase',
                  }}>
                    {label} · {items.length}
                  </div>
                  {items.slice(0, 8).map(a => (
                    <button
                      key={a.id}
                      onClick={() => { setOpen(false); navigate(a.nav?.page || 'workbench'); }}
                      style={{
                        alignItems: 'center',
                        background: 'transparent',
                        border: 'none',
                        borderLeft: `2px solid ${color}`,
                        cursor: 'pointer',
                        display: 'flex',
                        gap: '0.5rem',
                        padding: '0.32rem 0.85rem',
                        textAlign: 'left',
                        transition: 'background 0.1s',
                        width: '100%',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--fm-bg-panel)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{
                        background: KIND_COLOR[a.kind] + '18',
                        border: `1px solid ${KIND_COLOR[a.kind]}44`,
                        borderRadius: 2,
                        color: KIND_COLOR[a.kind],
                        flexShrink: 0,
                        fontFamily: 'var(--fm-mono)',
                        fontSize: '0.5rem',
                        letterSpacing: '0.06em',
                        padding: '1px 4px',
                      }}>
                        {KIND_LABEL[a.kind] ?? a.kind.toUpperCase()}
                      </span>
                      <span style={{
                        color: 'var(--fm-ink)',
                        flex: 1,
                        fontFamily: 'var(--fm-mono)',
                        fontSize: '0.68rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {a.title}
                      </span>
                      {a.date && (
                        <span style={{ color, flexShrink: 0, fontFamily: 'var(--fm-mono)', fontSize: '0.6rem' }}>
                          {fmtTrayDate(a.date)}
                        </span>
                      )}
                    </button>
                  ))}
                  {items.length > 8 && (
                    <div style={{ color: 'var(--fm-ink-mute)', fontFamily: 'var(--fm-mono)', fontSize: '0.58rem', padding: '0.15rem 0.85rem 0.2rem' }}>
                      +{items.length - 8} more
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ borderTop: '1px solid var(--fm-hairline)', marginTop: '0.25rem', padding: '0.45rem 0.85rem 0.5rem' }}>
            <button
              onClick={() => { setOpen(false); navigate('workbench'); }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--fm-brass)',
                cursor: 'pointer',
                fontFamily: 'var(--fm-mono)',
                fontSize: '0.62rem',
                letterSpacing: '0.06em',
                padding: 0,
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--fm-ink)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--fm-brass)'}
            >
              View all in Workbench →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Nav helpers ───────────────────────────────────────────────────────────────

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
        <div style={{
          background: 'var(--fm-bg-raised)',
          border: '1px solid var(--fm-hairline2)',
          borderRadius: 4,
          boxShadow: '0 8px 24px #00000055',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          left: 0,
          marginTop: 0,
          minWidth: 150,
          padding: 4,
          position: 'absolute',
          top: '100%',
          zIndex: 60,
        }}>
          {group.pages.map((page) => {
            const isActive = page === currentActive;
            return (
              <button
                key={page}
                onClick={() => { setOpen(null); if (!isActive) navigate(page); }}
                style={{
                  background: isActive ? 'var(--fm-brass-bg)' : 'transparent',
                  border: 'none',
                  borderRadius: 3,
                  color: isActive ? 'var(--fm-brass)' : 'var(--fm-ink-dim)',
                  cursor: isActive ? 'default' : 'pointer',
                  fontFamily: 'var(--fm-mono)',
                  fontSize: 10.5,
                  letterSpacing: '0.08em',
                  padding: '6px 10px',
                  textAlign: 'left',
                  textTransform: 'uppercase',
                  transition: 'color 0.12s, background 0.12s',
                  whiteSpace: 'nowrap',
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

// ── Mobile chrome ─────────────────────────────────────────────────────────────
// Phone-width variant: compact sticky top bar + thumb-reach bottom tab bar +
// slide-up "Pages" sheet covering the full page list. Desktop is untouched.

const BOTTOM_TABS = [
  { page: 'Workbench', label: 'Workbench', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ) },
  { page: 'Dashboard', label: 'Dashboard', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  ) },
  { page: 'Calendar', label: 'Calendar', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ) },
  { page: 'Maintenance', label: 'Maint', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ) },
];

const PagesIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
  </svg>
);

function MobilePagesSheet({ currentActive, navigate, dateStrip, onClose }) {
  const sections = [
    ...NAV_GROUPS,
    { label: 'More', pages: [...NAV_DIRECT, ...NAV_META] },
  ];
  return (
    <div
      className="fm-sheet-backdrop"
      onClick={onClose}
      style={{ background: 'rgba(0,0,0,0.6)', inset: 0, position: 'fixed', zIndex: 90 }}
    >
      <div
        className="fm-sheet-panel"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--fm-bg-raised)',
          borderTop: '1px solid var(--fm-hairline2)',
          borderRadius: '14px 14px 0 0',
          bottom: 0,
          left: 0,
          maxHeight: '78vh',
          overflowY: 'auto',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          position: 'fixed',
          right: 0,
        }}
      >
        <div style={{ background: 'var(--fm-hairline2)', borderRadius: 2, height: 4, margin: '10px auto 4px', width: 36 }} />
        <div style={{ color: 'var(--fm-ink-mute)', fontFamily: 'var(--fm-mono)', fontSize: 9.5, letterSpacing: '0.2em', padding: '6px 20px 2px', textTransform: 'uppercase' }}>
          {dateStrip}
        </div>
        {sections.map(group => (
          <div key={group.label} style={{ padding: '10px 8px 0' }}>
            <div style={{ color: 'var(--fm-brass-dim)', fontFamily: 'var(--fm-mono)', fontSize: 9.5, letterSpacing: '0.18em', padding: '4px 12px 6px', textTransform: 'uppercase' }}>
              {group.label}
            </div>
            {group.pages.map(page => {
              const isActive = page === currentActive;
              return (
                <button
                  key={page}
                  onClick={() => { onClose(); if (!isActive) navigate(page); }}
                  style={{
                    alignItems: 'center',
                    background: isActive ? 'var(--fm-brass-bg)' : 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    color: isActive ? 'var(--fm-brass)' : 'var(--fm-ink-dim)',
                    display: 'flex',
                    fontFamily: 'var(--fm-mono)',
                    fontSize: 13,
                    justifyContent: 'space-between',
                    letterSpacing: '0.08em',
                    minHeight: 46,
                    padding: '0 12px',
                    textTransform: 'uppercase',
                    width: '100%',
                  }}
                >
                  {page}
                  {isActive && <span style={{ fontSize: 11 }}>●</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileHeader({ currentActive, tagline, dateStrip, navigate }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const iconBtn = {
    alignItems: 'center',
    background: 'transparent',
    border: '1px solid var(--fm-hairline)',
    borderRadius: 6,
    color: 'var(--fm-ink-dim)',
    display: 'flex',
    height: 38,
    justifyContent: 'center',
    width: 38,
  };

  return (
    <>
      <header style={{
        alignItems: 'center',
        background: 'var(--fm-bg)',
        borderBottom: 'var(--fm-border)',
        display: 'flex',
        gap: 8,
        justifyContent: 'space-between',
        padding: '10px 14px',
        paddingTop: 'calc(10px + env(safe-area-inset-top))',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <h1 style={{ color: 'var(--fm-ink)', font: '500 17px var(--fm-serif)', letterSpacing: '-0.01em', margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Foreman <span style={{ color: 'var(--fm-brass)' }}>/</span>{' '}
          <span style={{ color: 'var(--fm-brass-dim)', fontStyle: 'italic' }}>{tagline}</span>
        </h1>
        <div style={{ alignItems: 'center', display: 'flex', flexShrink: 0, gap: 8 }}>
          <button onClick={openCommandPalette} title="Search" aria-label="Search" style={iconBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          </button>
          <AlertsTray navigate={navigate} />
        </div>
      </header>

      {/* Bottom tab bar — thumb-first primary navigation */}
      <nav style={{
        background: 'var(--fm-bg-raised)',
        borderTop: '1px solid var(--fm-hairline2)',
        bottom: 0,
        display: 'flex',
        left: 0,
        paddingBottom: 'env(safe-area-inset-bottom)',
        position: 'fixed',
        right: 0,
        zIndex: 80,
      }}>
        {BOTTOM_TABS.map(({ page, label, icon }) => {
          const isActive = page === currentActive;
          return (
            <button
              key={page}
              onClick={() => { setSheetOpen(false); if (!isActive) navigate(page); }}
              aria-label={page}
              style={{
                alignItems: 'center',
                background: 'transparent',
                border: 'none',
                borderTop: `2px solid ${isActive ? 'var(--fm-brass)' : 'transparent'}`,
                color: isActive ? 'var(--fm-brass)' : 'var(--fm-ink-mute)',
                display: 'flex',
                flex: 1,
                flexDirection: 'column',
                gap: 3,
                minHeight: 56,
                justifyContent: 'center',
                padding: '6px 0 8px',
              }}
            >
              {icon}
              <span style={{ fontFamily: 'var(--fm-mono)', fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setSheetOpen(o => !o)}
          aria-label="All pages"
          style={{
            alignItems: 'center',
            background: 'transparent',
            border: 'none',
            borderTop: `2px solid ${sheetOpen ? 'var(--fm-brass)' : 'transparent'}`,
            color: sheetOpen ? 'var(--fm-brass)' : 'var(--fm-ink-mute)',
            display: 'flex',
            flex: 1,
            flexDirection: 'column',
            gap: 3,
            minHeight: 56,
            justifyContent: 'center',
            padding: '6px 0 8px',
          }}
        >
          {PagesIcon}
          <span style={{ fontFamily: 'var(--fm-mono)', fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Pages</span>
        </button>
      </nav>

      {sheetOpen && (
        <MobilePagesSheet
          currentActive={currentActive}
          navigate={navigate}
          dateStrip={dateStrip}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

export default function FmHeader({ active, dateStrip = buildDateStrip(), tagline = 'your house, in order' }) {
  const nav = useContext(FmNavContext);
  const currentActive = active || nav.current;
  const onlineMode = readOnlineMode();
  const [open, setOpen] = useState(null);
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileHeader currentActive={currentActive} tagline={tagline} dateStrip={dateStrip} navigate={nav.navigate} />;
  }

  return (
    <header style={{
      alignItems: 'flex-end',
      background: 'var(--fm-bg)',
      borderBottom: 'var(--fm-border)',
      display: 'flex',
      flexWrap: 'wrap',       // phones: nav drops below the title instead of overflowing off-screen
      justifyContent: 'space-between',
      padding: '16px clamp(12px, 3.5vw, 30px) 14px',
      rowGap: 10,
    }}>
      <div>
        <div style={{
          color: 'var(--fm-ink-mute)',
          fontFamily: 'var(--fm-mono)',
          fontSize: 10,
          letterSpacing: '0.22em',
          marginBottom: 2,
          textTransform: 'uppercase',
        }}>
          {dateStrip}
        </div>
        <h1 style={{ color: 'var(--fm-ink)', font: '500 clamp(20px, 5vw, 28px) var(--fm-serif)', letterSpacing: '-0.02em', margin: 0 }}>
          Foreman{' '}
          <span style={{ color: 'var(--fm-brass)' }}>/</span>{' '}
          <span style={{ color: 'var(--fm-brass-dim)', fontStyle: 'italic' }}>{tagline}</span>
        </h1>
      </div>

      <nav style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 6, rowGap: 6 }}>
        <PageInfoButton title={currentActive} navigate={nav.navigate} />

        {/* Search */}
        <button
          onClick={openCommandPalette}
          title={`Search (${KBD_HINT})`}
          style={{ alignItems: 'center', background: 'var(--fm-bg-sunk)', border: '1px solid var(--fm-hairline)', borderRadius: 3, color: 'var(--fm-ink-mute)', cursor: 'pointer', display: 'flex', fontFamily: 'var(--fm-mono)', fontSize: 10, gap: 6, marginRight: 2, padding: '5px 8px', transition: 'color 0.15s, border-color 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--fm-brass)'; e.currentTarget.style.color = 'var(--fm-ink-dim)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--fm-hairline)'; e.currentTarget.style.color = 'var(--fm-ink-mute)'; }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <span>Search</span>
          <span style={{ background: 'var(--fm-bg-raised)', border: '1px solid var(--fm-hairline2)', borderRadius: 2, color: 'var(--fm-ink-mute)', fontSize: 8.5, letterSpacing: '0.04em', padding: '1px 4px' }}>{KBD_HINT}</span>
        </button>

        {/* Alerts tray */}
        <AlertsTray navigate={nav.navigate} />

        {/* Top-level nav: Workbench, Dashboard */}
        {NAV_TOP.map((page) => {
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

        {onlineMode && (
          <div style={{ alignItems: 'center', display: 'flex', gap: '0.3rem', marginRight: '0.25rem' }}>
            <span style={{ background: 'var(--fm-green)', borderRadius: '50%', display: 'inline-block', height: '5px', width: '5px' }} />
            <span style={{ color: 'var(--fm-green)', fontFamily: 'var(--fm-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Online</span>
          </div>
        )}

        {/* Grouped nav */}
        {NAV_GROUPS.map((group) => (
          <NavGroup key={group.label} group={group} currentActive={currentActive} open={open} setOpen={setOpen} navigate={nav.navigate} />
        ))}

        {/* Notebook */}
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

        {/* Meta: Read Me + Preferences gear */}
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
                background: isActive ? 'var(--fm-brass-bg)' : 'transparent',
                border: `1px solid ${isActive ? 'var(--fm-brass)' : 'transparent'}`,
                borderRadius: 3,
                color: isActive ? 'var(--fm-brass)' : 'var(--fm-ink-mute)',
                cursor: isActive ? 'default' : 'pointer',
                display: 'inline-flex',
                fontFamily: 'var(--fm-mono)',
                fontSize: 10,
                letterSpacing: '0.08em',
                padding: isGear ? '5px 6px' : '5px 8px',
                textTransform: 'uppercase',
                transition: 'color 0.15s',
                whiteSpace: 'nowrap',
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
