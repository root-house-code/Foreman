export default function FmSubnav({ tabs, active, stats, onTabChange, filter }) {
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
