import useIsMobile from '../hooks/useIsMobile.js';

export default function FmSubnav({ tabs, active, stats, onTabChange, filter }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    // Phone: tabs and stats become horizontally scrolling strips (momentum
    // scroll, hidden scrollbar via .fm-hscroll) with taller touch targets.
    return (
      <div style={{ background: 'var(--fm-bg-raised)', borderBottom: 'var(--fm-border)' }}>
        <div className="fm-hscroll" style={{ gap: 4, padding: '0 10px' }}>
          {tabs.map((t) => {
            const isActive = t === active;
            return (
              <button
                key={t}
                onClick={() => !isActive && onTabChange?.(t)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--fm-brass)' : '2px solid transparent',
                  color: isActive ? 'var(--fm-brass)' : 'var(--fm-ink-dim)',
                  flexShrink: 0,
                  fontFamily: 'var(--fm-mono)',
                  fontSize: 11.5,
                  letterSpacing: '0.12em',
                  minHeight: 44,
                  padding: '0 10px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
        {(stats || filter) && (
          <div className="fm-hscroll" style={{ alignItems: 'center', borderTop: '1px solid var(--fm-hairline)', gap: 20, padding: '7px 14px' }}>
            {stats?.map((s, i) => (
              <span key={i} style={{ color: 'var(--fm-ink-dim)', flexShrink: 0, fontFamily: 'var(--fm-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                <b style={{ color: s.color || 'var(--fm-ink)', fontFamily: 'var(--fm-serif)', fontSize: 13.5, fontWeight: 500 }}>{s.value}</b>{' '}
                {s.label}
              </span>
            ))}
            {filter && <span style={{ flexShrink: 0 }}>{filter}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '10px clamp(12px, 3.5vw, 30px)',
        borderBottom: 'var(--fm-border)',
        display: 'flex',
        flexWrap: 'wrap',   // phones: stats wrap below the tabs instead of overflowing
        rowGap: 8,
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--fm-bg-raised)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, rowGap: 6 }}>
        {tabs.map((t) => {
          const isActive = t === active;
          return (
            <span
              key={t}
                onClick={() => !isActive && onTabChange?.(t)}
              style={{
                fontFamily: 'var(--fm-mono)',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: isActive ? 'var(--fm-brass)' : 'var(--fm-ink-dim)',
                borderBottom: isActive ? '1px solid var(--fm-brass)' : '1px solid transparent',
                paddingBottom: 4,
                cursor: isActive ? 'default' : 'pointer',
              }}
            >
              {t}
            </span>
          );
        })}
      </div>
      {filter && <div style={{ display: 'flex', alignItems: 'center' }}>{filter}</div>}
      {stats && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 28,
            rowGap: 6,
            fontFamily: 'var(--fm-mono)',
            fontSize: 10.5,
            color: 'var(--fm-ink-dim)',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}
        >
          {stats.map((s, i) => (
            <span key={i}>
              <b
                style={{
                  color: s.color || 'var(--fm-ink)',
                  fontFamily: 'var(--fm-serif)',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                {s.value}
              </b>{' '}
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
