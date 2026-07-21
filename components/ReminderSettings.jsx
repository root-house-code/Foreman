import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useIsMobile from "../src/hooks/useIsMobile.js";
import { sheetOverlay, sheetPanel } from "./ModalShared.jsx";
import {
  getWebhookUrl, setWebhookUrl,
  getSendHourLocal, setSendHourLocal,
  getTimezone, setTimezone,
  getLeadDays, setLeadDays,
  getHouseholdId, getLastSyncIso,
  formatHour12,
  TIMEZONE_PRESETS,
  dispatchReminders,
} from "../lib/reminders.js";

const LABEL_STYLE = {
  color: "#8b7d6b",
  display: "block",
  fontFamily: "monospace",
  fontSize: "0.66rem",
  letterSpacing: "0.12em",
  marginBottom: "0.4rem",
  textTransform: "uppercase",
};

const INPUT_STYLE = {
  background: "#1a1f2e",
  border: "1px solid #a8a29c",
  borderRadius: "3px",
  boxSizing: "border-box",
  color: "#e8e4dd",
  fontFamily: "monospace",
  fontSize: "0.82rem",
  outline: "none",
  padding: "0.5rem 0.7rem",
  width: "100%",
};

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: formatHour12(h) }));

function isWebhookValid(url) {
  return /^https:\/\/discord\.com\/api\/webhooks\/[^/]+\/[^/]+/.test(url.trim());
}

export default function ReminderSettings({ open, onClose, onSync, enabledCount }) {
  const isMobile = useIsMobile();
  const [webhook, setWebhook]       = useState(() => getWebhookUrl());
  const [showWebhook, setShowWebhook] = useState(false);
  const [hour, setHour]             = useState(() => getSendHourLocal());
  const [tz, setTz]                 = useState(() => getTimezone());
  const [leadDays, setLead]         = useState(() => getLeadDays());
  const [busy, setBusy]             = useState(false);
  const [status, setStatus]         = useState(null);
  const [lastSync, setLastSync]     = useState(() => getLastSyncIso());
  const [showMeta, setShowMeta]     = useState(false);

  const webhookRef       = useRef(null);
  const dialogRef        = useRef(null);
  const previousFocusRef = useRef(null);

  // On open: stash who had focus, autofocus first input. On close: restore focus.
  // Esc closes. Tab is trapped inside the dialog so keyboard users don't
  // wander into the (visually obscured but DOM-present) page behind it.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;
    setTimeout(() => webhookRef.current?.focus(), 0);

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleSaveAndClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Restore focus to whoever opened the modal (typically REMINDERS button)
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === "function") {
        try { prev.focus(); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Hooks must run in the same order every render — keep useMemo above the
  // `if (!open) return null` short-circuit below.
  const tzOptions = useMemo(() => {
    const presetValues = new Set(TIMEZONE_PRESETS.map(p => p.value));
    const extras = !presetValues.has(tz) ? [{ value: tz, label: `${tz} (detected)` }] : [];
    return [...extras, ...TIMEZONE_PRESETS];
  }, [tz]);

  if (!open) return null;

  const trimmedWebhook = webhook.trim();
  const webhookValid = trimmedWebhook === "" || isWebhookValid(trimmedWebhook);

  function persist() {
    setWebhookUrl(trimmedWebhook);
    setSendHourLocal(hour);
    setTimezone(tz);
    setLeadDays(leadDays);
  }

  async function handleSync() {
    if (!isWebhookValid(trimmedWebhook)) {
      setStatus({ ok: false, message: "That doesn't look like a Discord webhook URL — it should start with https://discord.com/api/webhooks/" });
      return;
    }
    persist();
    setBusy(true);
    setStatus(null);
    try {
      const result = await onSync();
      setStatus({ ok: true, message: `Synced ${result.count} task${result.count === 1 ? "" : "s"}.` });
      setLastSync(new Date().toISOString());
    } catch (err) {
      setStatus({ ok: false, message: err.message || String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleTestNow() {
    setBusy(true);
    setStatus(null);
    try {
      const result = await dispatchReminders();
      const d = result.dispatched || {};
      if (d.posted) {
        setStatus({ ok: true, message: `Sent — ${d.dayOf} due today, ${d.digest} coming up.` });
      } else if (enabledCount === 0) {
        setStatus({ ok: true, message: "No tasks have reminders turned on yet. Enable some bells and sync." });
      } else {
        setStatus({ ok: true, message: 'Nothing matched right now. Make sure tasks have a next-due date, or widen "Heads-up days".' });
      }
    } catch (err) {
      setStatus({ ok: false, message: err.message || String(err) });
    } finally {
      setBusy(false);
    }
  }

  function handleSaveAndClose() {
    persist();
    onClose();
  }

  const lastSyncText = lastSync ? new Date(lastSync).toLocaleString() : "never";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-settings-title"
      aria-describedby="reminder-settings-desc"
      className="foreman-reminder-modal"
      onClick={handleSaveAndClose}
      style={{
        alignItems: "center",
        background: "rgba(0,0,0,0.6)",
        bottom: 0,
        display: "flex",
        justifyContent: "center",
        left: 0,
        position: "fixed",
        right: 0,
        top: 0,
        zIndex: 1000,
        ...(isMobile ? sheetOverlay : null),
      }}
    >
      <div
        ref={dialogRef}
        onClick={e => e.stopPropagation()}
        className={isMobile ? "fm-sheet-panel" : undefined}
        style={{
          background: "#0f1117",
          border: "1px solid #a8a29c",
          borderRadius: "6px",
          maxWidth: "560px",
          padding: "1.75rem 2rem",
          width: "92%",
          ...(isMobile ? sheetPanel : null),
        }}
      >
        <div style={{ alignItems: "baseline", display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
          <div id="reminder-settings-title" style={{
            color: "#c9a96e",
            fontFamily: "monospace",
            fontSize: "0.72rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}>
            Reminder Agent
          </div>
          <div style={{
            color: "#a8a29c",
            fontFamily: "monospace",
            fontSize: "0.66rem",
            letterSpacing: "0.04em",
          }}>
            {enabledCount} task{enabledCount === 1 ? "" : "s"} enabled
          </div>
        </div>
        <p id="reminder-settings-desc" style={{ color: "#a8a29c", fontFamily: "monospace", fontSize: "0.72rem", lineHeight: 1.6, margin: "0 0 1.5rem" }}>
          Get a daily summary of upcoming maintenance, plus pings the day a task is due. Use the bell on each row to choose how (or if) it reminds you, then sync.
        </p>

        <div style={{ marginBottom: "1.1rem" }}>
          <label style={LABEL_STYLE} htmlFor="webhook-input">Discord webhook URL</label>
          <div style={{ alignItems: "stretch", display: "flex", gap: "0.4rem" }}>
            <input
              id="webhook-input"
              ref={webhookRef}
              type={showWebhook ? "text" : "password"}
              value={webhook}
              onChange={e => setWebhook(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              aria-invalid={!webhookValid}
              aria-describedby={webhookValid ? "webhook-help" : "webhook-error"}
              style={{
                ...INPUT_STYLE,
                borderColor: webhookValid ? "#a8a29c" : "#f87171",
              }}
            />
            <button
              type="button"
              onClick={() => setShowWebhook(s => !s)}
              aria-label={showWebhook ? "Hide webhook URL" : "Show webhook URL"}
              aria-pressed={showWebhook}
              style={{
                background: "transparent",
                border: "1px solid #a8a29c",
                borderRadius: "3px",
                color: "#a8a29c",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: "0.66rem",
                letterSpacing: "0.06em",
                padding: "0 0.7rem",
                textTransform: "uppercase",
              }}
            >
              {showWebhook ? "Hide" : "Show"}
            </button>
          </div>
          {!webhookValid && (
            <p id="webhook-error" style={{ color: "#f87171", fontFamily: "monospace", fontSize: "0.66rem", lineHeight: 1.5, margin: "0.4rem 0 0" }}>
              That doesn't look like a Discord webhook URL — it should start with https://discord.com/api/webhooks/
            </p>
          )}
          <p id="webhook-help" style={{ color: "#a8a29c", fontFamily: "monospace", fontSize: "0.66rem", lineHeight: 1.5, margin: "0.4rem 0 0" }}>
            In Discord: Server Settings → Integrations → Webhooks → New Webhook → Copy URL. The URL stays in your browser; only your reminder service sees it.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: "1rem", marginBottom: "1.1rem" }}>
          <div style={{ flex: 1 }}>
            <label style={LABEL_STYLE} htmlFor="hour-select">Send time</label>
            <select
              id="hour-select"
              value={hour}
              onChange={e => setHour(parseInt(e.target.value, 10))}
              style={INPUT_STYLE}
            >
              {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1.4 }}>
            <label style={LABEL_STYLE} htmlFor="tz-select">Timezone</label>
            <select
              id="tz-select"
              value={tz}
              onChange={e => setTz(e.target.value)}
              style={INPUT_STYLE}
            >
              {tzOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: "1.1rem" }}>
          <label style={LABEL_STYLE} htmlFor="lead-input">Heads-up days</label>
          <input
            id="lead-input"
            type="number"
            min="0" max="365"
            value={leadDays}
            onChange={e => setLead(parseInt(e.target.value, 10) || 0)}
            style={{ ...INPUT_STYLE, width: "120px" }}
          />
          <p style={{ color: "#a8a29c", fontFamily: "monospace", fontSize: "0.66rem", margin: "0.4rem 0 0" }}>
            Tasks appear in your daily summary this many days before they're due. With 30, a task due June 30 starts showing up June 1.
          </p>
        </div>

        {status && (
          <div
            role={status.ok ? "status" : "alert"}
            aria-live={status.ok ? "polite" : "assertive"}
            style={{
              background: status.ok ? "#10b98118" : "#f8717118",
              border: `1px solid ${status.ok ? "#10b981" : "#f87171"}`,
              borderRadius: "3px",
              color: status.ok ? "#10b981" : "#f87171",
              fontFamily: "monospace",
              fontSize: "0.72rem",
              margin: "0 0 1rem",
              padding: "0.55rem 0.8rem",
            }}
          >
            {status.message}
          </div>
        )}

        <div style={{ alignItems: "center", display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button
            onClick={handleSaveAndClose}
            disabled={busy}
            style={{
              background: "transparent",
              border: "none",
              color: "#a8a29c",
              cursor: busy ? "default" : "pointer",
              fontFamily: "monospace",
              fontSize: "0.72rem",
              marginRight: "auto",
              opacity: busy ? 0.5 : 1,
              padding: "0.45rem 0.5rem",
              textDecoration: "underline",
            }}
          >
            Close
          </button>
          <button
            onClick={handleTestNow}
            disabled={busy}
            style={{
              background: "transparent",
              border: "1px solid #a8a29c",
              borderRadius: "4px",
              color: "#8b7d6b",
              cursor: busy ? "default" : "pointer",
              fontFamily: "monospace",
              fontSize: "0.72rem",
              letterSpacing: "0.06em",
              opacity: busy ? 0.5 : 1,
              padding: "0.45rem 0.9rem",
              textTransform: "uppercase",
            }}
          >
            {busy ? "Sending…" : "Send Test"}
          </button>
          <button
            onClick={handleSync}
            disabled={busy || !webhookValid || !trimmedWebhook}
            style={{
              background: "#c9a96e18",
              border: "1px solid #c9a96e",
              borderRadius: "4px",
              color: "#c9a96e",
              cursor: (busy || !webhookValid || !trimmedWebhook) ? "default" : "pointer",
              fontFamily: "monospace",
              fontSize: "0.72rem",
              letterSpacing: "0.08em",
              opacity: (busy || !webhookValid || !trimmedWebhook) ? 0.5 : 1,
              padding: "0.45rem 1.1rem",
              textTransform: "uppercase",
            }}
          >
            {busy ? "Syncing…" : "Save & Sync"}
          </button>
        </div>

        <details
          open={showMeta}
          onToggle={e => setShowMeta(e.currentTarget.open)}
          style={{ borderTop: "1px solid #1e2330", marginTop: "1.5rem", paddingTop: "1rem" }}
        >
          <summary style={{
            color: "#a8a29c",
            cursor: "pointer",
            fontFamily: "monospace",
            fontSize: "0.66rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            Connection details
          </summary>
          <div style={{
            color: "#a8a29c",
            fontFamily: "monospace",
            fontSize: "0.66rem",
            lineHeight: 1.6,
            marginTop: "0.6rem",
          }}>
            <div>Household ID: <span style={{ color: "#8b7d6b" }}>{getHouseholdId()}</span></div>
            <div>Last sync: <span style={{ color: "#8b7d6b" }}>{lastSyncText}</span></div>
          </div>
        </details>
      </div>
    </div>,
    document.body
  );
}
