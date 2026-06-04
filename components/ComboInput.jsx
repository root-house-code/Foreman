import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Shared text input with a styled suggestion dropdown.
 * Replaces browser-native <datalist> and ad-hoc portal patterns across the app.
 *
 * Props:
 *   value        — controlled string value
 *   onChange     — (string) => void
 *   onBlur       — optional () => void, called when input loses focus
 *   options      — string[] — full suggestion list (filtered by current value)
 *   placeholder  — input placeholder string
 *   style        — extra styles merged onto the <input>
 *   autoFocus    — boolean
 */
export default function ComboInput({ value = "", onChange, onBlur, onKeyDown, options = [], placeholder, style = {}, autoFocus }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState({ top: 0, left: 0, width: 0 });
  const inputRef        = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = options.filter(o =>
    !value || o.toLowerCase().includes(value.toLowerCase())
  );

  const openDrop = useCallback(() => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: r.width });
    setOpen(true);
  }, []);

  const select = useCallback((opt) => {
    onChange(opt);
    setOpen(false);
  }, [onChange]);

  const inputBase = {
    background: "var(--fm-bg-sunk, #0a0c11)",
    border: "1px solid var(--fm-hairline2, #2b3140)",
    borderRadius: "3px",
    boxSizing: "border-box",
    color: "var(--fm-ink, #e8e4dd)",
    fontFamily: "var(--fm-mono, monospace)",
    fontSize: "0.75rem",
    outline: "none",
    padding: "0.3rem 0.5rem",
    transition: "border-color 0.15s",
    width: "100%",
    ...style,
  };

  return (
    <>
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); openDrop(); }}
        onFocus={e => { e.currentTarget.style.borderColor = "var(--fm-brass, #c9a96e)"; openDrop(); }}
        onBlur={e => {
          e.currentTarget.style.borderColor = "var(--fm-hairline2, #2b3140)";
          setTimeout(() => setOpen(false), 150);
          onBlur?.();
        }}
        onKeyDown={e => { if (e.key === "Escape") setOpen(false); onKeyDown?.(e); }}
        style={inputBase}
      />
      {open && filtered.length > 0 && createPortal(
        <div
          onMouseDown={e => e.preventDefault()}
          style={{
            background: "var(--fm-bg-panel, #171a23)",
            border: "1px solid var(--fm-hairline2, #2b3140)",
            borderRadius: "0 0 4px 4px",
            boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
            left: pos.left,
            maxHeight: 220,
            minWidth: 200,
            overflowY: "auto",
            position: "absolute",
            top: pos.top,
            width: pos.width,
            zIndex: 9999,
          }}
        >
          {filtered.map(opt => (
            <div
              key={opt}
              onMouseDown={() => select(opt)}
              style={{
                color: "var(--fm-ink, #e8e4dd)",
                cursor: "pointer",
                fontFamily: "var(--fm-sans, system-ui, sans-serif)",
                fontSize: "0.88rem",
                padding: "0.55rem 0.75rem",
                transition: "background 0.08s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--fm-bg-raised, #1e222e)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              {opt}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
