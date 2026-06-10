// Reliable in-app confirmation dialog. Replaces window.confirm, which is
// disabled / silently returns false in the desktop and IDE webview runtimes.

const overlay = {
  alignItems: "center",
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  inset: 0,
  justifyContent: "center",
  position: "fixed",
  zIndex: 400,
};

const box = {
  background: "var(--fm-bg-panel)",
  border: "var(--fm-border)",
  borderRadius: "var(--fm-radius-lg)",
  boxShadow: "0 12px 40px #00000060",
  maxWidth: 400,
  padding: "1.5rem 1.75rem",
  width: "90%",
};

const ghostBtn = {
  background: "transparent",
  border: "1px solid var(--fm-hairline2)",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-ink-dim)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  padding: "0.4rem 0.9rem",
};

const dangerBtn = {
  background: "transparent",
  border: "1px solid var(--fm-red)",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-red)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  padding: "0.4rem 0.9rem",
};

const primaryBtn = {
  background: "var(--fm-brass-bg)",
  border: "1px solid var(--fm-brass)",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-brass)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  padding: "0.4rem 0.9rem",
};

export default function ConfirmDialog({
  open,
  title = "Confirm",
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onCancel?.(); }}>
      <div style={box}>
        <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.1rem", marginBottom: "0.5rem" }}>{title}</div>
        {message && (
          <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", lineHeight: 1.6, marginBottom: "1.25rem" }}>{message}</div>
        )}
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={ghostBtn}>{cancelLabel}</button>
          <button type="button" onClick={onConfirm} style={danger ? dangerBtn : primaryBtn} autoFocus>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
