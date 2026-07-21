import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { storageGet } from "../lib/storage.js";
import { loadGmailImportSettings, saveGmailImportSettings, DEFAULT_LABEL } from "../lib/gmailImport.js";
import { runGmailSync, ReauthRequiredError, LabelNotFoundError, OnlineModeError, NotConnectedError } from "../lib/gmailSync.js";
import { loadGroqApiKey } from "../lib/groqConfig.js";
import GmailBillReview from "./GmailBillReview.jsx";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const smallInput = {
  background: "var(--fm-bg-sunk)", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)",
  boxSizing: "border-box", color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem",
  outline: "none", padding: "0.4rem 0.6rem", width: "100%",
};
const smallLabel = {
  color: "var(--fm-ink-mute)", display: "block", fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem", letterSpacing: "0.1em", marginBottom: "0.3rem", textTransform: "uppercase",
};

// Foreman ships no shared Gmail OAuth client — each user creates their own tiny
// Google Cloud app and pastes the Client ID/Secret in here. Kept in its own
// component since it's a self-contained setup step gating everything below it.
function GoogleCredentialsForm({ onSaved }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await window.foreman.gmailSetClientConfig({ clientId, clientSecret });
      if (res?.ok) onSaved();
      else setError(res?.error || "Could not save credentials.");
    } catch (err) {
      setError(err?.message || "Could not save credentials.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <details style={{ marginBottom: "1rem" }}>
        <summary style={{ color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", letterSpacing: "0.04em" }}>
          How to get a Google Client ID &amp; Secret (free, one-time, ~2 minutes)
        </summary>
        <ol style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.66rem", lineHeight: 1.8, margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
          <li>At <span style={{ color: "var(--fm-brass-dim)" }}>console.cloud.google.com</span>, create a project and enable the <strong>Gmail API</strong>.</li>
          <li>OAuth consent screen: type <strong>External</strong>, publishing status <strong>Testing</strong>, add your own Gmail address as a test user.</li>
          <li>Credentials → Create Credentials → OAuth client ID → type <strong>Desktop app</strong>.</li>
          <li>Copy the Client ID and Client Secret it generates into the fields below.</li>
        </ol>
      </details>

      {error && (
        <div style={{ background: "#f8717118", border: "1px solid #f8717140", borderRadius: "4px", color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", lineHeight: 1.5, marginBottom: "0.85rem", padding: "0.6rem 0.85rem" }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: "0.85rem" }}>
        <label style={smallLabel}>Client ID</label>
        <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="xxxxxxxx.apps.googleusercontent.com" style={smallInput} />
      </div>
      <div style={{ marginBottom: "1rem" }}>
        <label style={smallLabel}>Client Secret</label>
        <input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} style={smallInput} />
      </div>
      <button
        onClick={handleSave}
        disabled={saving || !clientId.trim() || !clientSecret.trim()}
        style={{ background: "#c9a96e18", border: "1px solid var(--fm-brass)", borderRadius: "3px", color: "var(--fm-brass)", cursor: saving ? "default" : "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", opacity: (saving || !clientId.trim() || !clientSecret.trim()) ? 0.5 : 1, padding: "0.5rem 1.25rem", transition: "all 0.15s" }}
      >
        {saving ? "Saving…" : "Save Credentials"}
      </button>
    </div>
  );
}

export default function GmailBillsImport() {
  const onlineMode = storageGet("foreman-online-mode") === true;

  const [clientConfig, setClientConfig] = useState({ configured: false, clientId: null });
  const [editingConfig, setEditingConfig] = useState(false);
  const [status, setStatus] = useState({ connected: false, email: null, connectedAt: null });
  const [label, setLabel] = useState(() => loadGmailImportSettings().label || DEFAULT_LABEL);
  const [parseMode, setParseMode] = useState(() => loadGmailImportSettings().parseMode);
  const groqConfigured = !!loadGroqApiKey();
  // "idle" | "connecting" | "scanning" | "review" | "success" | "reauth" | "error"
  const [phase, setPhase] = useState("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [candidates, setCandidates] = useState([]);
  const [message, setMessage] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    window.foreman?.gmailGetClientConfigStatus?.().then(s => s && setClientConfig(s)).catch(() => {});
    window.foreman?.gmailStatus?.().then(s => s && setStatus(s)).catch(() => {});
  }, []);

  async function handleConfigSaved() {
    const s = await window.foreman.gmailGetClientConfigStatus();
    setClientConfig(s);
    setEditingConfig(false);
    // A changed client invalidates any prior connection (see gmailAuth.cjs) — refresh.
    const st = await window.foreman.gmailStatus();
    setStatus(st);
  }

  async function handleClearConfig() {
    await window.foreman.gmailClearClientConfig();
    setClientConfig({ configured: false, clientId: null });
    setStatus({ connected: false, email: null, connectedAt: null });
    setEditingConfig(true);
  }

  function commitLabel(v) {
    setLabel(v);
    saveGmailImportSettings({ label: v.trim() || DEFAULT_LABEL });
  }

  function commitParseMode(v) {
    setParseMode(v);
    saveGmailImportSettings({ parseMode: v });
  }

  async function handleConnect() {
    setPhase("connecting");
    setMessage(null);
    try {
      const res = await window.foreman.gmailConnect();
      if (res?.ok) {
        const s = await window.foreman.gmailStatus();
        setStatus(s);
        setPhase("idle");
      } else {
        setMessage(res?.error || "Could not connect to Gmail.");
        setPhase("error");
      }
    } catch (err) {
      setMessage(err?.message || "Could not connect to Gmail.");
      setPhase("error");
    }
  }

  async function handleDisconnect() {
    const s = await window.foreman.gmailDisconnect();
    setStatus(s);
    setPhase("idle");
    setMessage(null);
  }

  async function handleSync() {
    setPhase("scanning");
    setProgress({ done: 0, total: 0 });
    setMessage(null);
    try {
      const result = await runGmailSync({ onProgress: setProgress });
      if (result.candidates.length === 0) {
        setSummary({ scanned: result.scannedCount, imported: 0, nothingNew: true });
        setPhase("success");
      } else {
        setCandidates(result.candidates);
        setPhase("review");
      }
    } catch (err) {
      if (err instanceof ReauthRequiredError) {
        setStatus({ connected: false, email: null, connectedAt: null });
        setPhase("reauth");
      } else if (err instanceof LabelNotFoundError) {
        setMessage(`The label "${err.label}" doesn't exist in your Gmail. Create it as a filter/label first, then try again.`);
        setPhase("error");
      } else if (err instanceof OnlineModeError) {
        setMessage("Online Mode is required for Gmail import.");
        setPhase("error");
      } else if (err instanceof NotConnectedError) {
        setStatus({ connected: false, email: null, connectedAt: null });
        setPhase("idle");
      } else {
        setMessage(err?.message || "Sync failed. Try again shortly.");
        setPhase("error");
      }
    }
  }

  function handleReviewDone(importedCount) {
    setCandidates([]);
    setSummary({ imported: importedCount, nothingNew: false });
    setPhase("success");
  }

  const isElectron = window.foreman?.isElectron === true;
  if (!isElectron) return null;

  return (
    <>
      <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "6px", padding: "1.1rem 1.25rem" }}>
        <div style={{ alignItems: "center", display: "flex", gap: "0.6rem", marginBottom: "0.4rem" }}>
          <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem" }}>Gmail Bill Import</span>
          {status.connected && (
            <div style={{ alignItems: "center", display: "flex", gap: "0.35rem", marginLeft: "auto" }}>
              <span style={{ background: "var(--fm-green)", borderRadius: "50%", display: "inline-block", height: "6px", width: "6px" }} />
              <span style={{ color: "var(--fm-green)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.08em" }}>Connected</span>
            </div>
          )}
        </div>
        <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", lineHeight: 1.55, margin: "0 0 1.1rem" }}>
          Connect your Gmail account and Foreman will scan a single label you choose (for utility-bill emails you route there with a Gmail filter), then suggest bills for your review before adding any to Utilities. Foreman only ever reads that one label.
        </p>

        {!onlineMode ? (
          <div style={{ alignItems: "center", background: "var(--fm-bg)", border: "1px solid var(--fm-hairline)", borderRadius: "4px", display: "flex", gap: "0.65rem", padding: "0.75rem 0.9rem" }}>
            <span style={{ color: "var(--fm-ink-mute)", fontSize: "1.1rem" }}>○</span>
            <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", lineHeight: 1.5 }}>
              Gmail import uses external services (Gmail and an AI parser). Enable Online Mode above to use this feature.
            </div>
          </div>
        ) : (
          <>
          {(message && (phase === "error" || phase === "reauth")) && (
            <div style={{ background: phase === "reauth" ? "#c9a96e18" : "#f8717118", border: `1px solid ${phase === "reauth" ? "#c9a96e40" : "#f8717140"}`, borderRadius: "4px", color: phase === "reauth" ? "var(--fm-brass)" : "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", lineHeight: 1.5, marginBottom: "1rem", padding: "0.6rem 0.85rem" }}>
              {message}
            </div>
          )}

          {phase === "reauth" && (
            <div style={{ background: "#c9a96e14", border: "1px solid #c9a96e30", borderRadius: "4px", color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", lineHeight: 1.5, marginBottom: "1rem", padding: "0.6rem 0.85rem" }}>
              Your Gmail connection expired. Reconnect to keep syncing bills.
            </div>
          )}

          {(!clientConfig.configured || editingConfig) ? (
            <GoogleCredentialsForm onSaved={handleConfigSaved} />
          ) : (
            <div style={{ alignItems: "center", display: "flex", gap: "0.6rem", justifyContent: "space-between", marginBottom: status.connected ? "1rem" : 0 }}>
              <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem" }}>
                Google API credentials saved · <span style={{ color: "var(--fm-brass-dim)" }}>{clientConfig.clientId?.slice(0, 12)}…</span>
              </div>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button onClick={() => setEditingConfig(true)} style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: 0 }}>Change</button>
                <button onClick={handleClearConfig} style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: 0 }} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>Remove</button>
              </div>
            </div>
          )}

          {clientConfig.configured && !editingConfig && (!status.connected ? (
            <button
              onClick={handleConnect}
              disabled={phase === "connecting"}
              style={{ background: "#c9a96e18", border: "1px solid var(--fm-brass)", borderRadius: "3px", color: "var(--fm-brass)", cursor: phase === "connecting" ? "default" : "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", opacity: phase === "connecting" ? 0.6 : 1, padding: "0.5rem 1.25rem", transition: "all 0.15s" }}
            >
              {phase === "connecting" ? "Opening browser…" : "Connect Gmail"}
            </button>
          ) : (
            <>
              <div style={{ alignItems: "center", display: "flex", gap: "0.6rem", justifyContent: "space-between", marginBottom: "1rem" }}>
                <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem" }}>
                  Connected as <span style={{ color: "var(--fm-brass-dim)" }}>{status.email || "—"}</span> since {fmtDate(status.connectedAt)}
                </div>
                <button
                  onClick={handleDisconnect}
                  style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.67rem", padding: 0, transition: "color 0.12s" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                >Disconnect</button>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ color: "var(--fm-ink-mute)", display: "block", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", marginBottom: "0.3rem", textTransform: "uppercase" }}>Gmail label</label>
                <input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  onBlur={e => commitLabel(e.target.value)}
                  placeholder={DEFAULT_LABEL}
                  style={{ background: "var(--fm-bg-sunk)", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", maxWidth: 280, outline: "none", padding: "0.4rem 0.6rem", width: "100%" }}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ color: "var(--fm-ink-mute)", display: "block", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", marginBottom: "0.3rem", textTransform: "uppercase" }}>Parsing</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={() => commitParseMode("local")}
                    style={{ background: parseMode === "local" ? "#c9a96e18" : "transparent", border: `1px solid ${parseMode === "local" ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: "3px", color: parseMode === "local" ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.66rem", letterSpacing: "0.04em", padding: "0.35rem 0.75rem" }}
                  >
                    Local (private)
                  </button>
                  <button
                    onClick={() => groqConfigured && commitParseMode("ai")}
                    disabled={!groqConfigured}
                    title={groqConfigured ? "" : "Add a Groq API key above to enable AI parsing"}
                    style={{ background: parseMode === "ai" ? "#c9a96e18" : "transparent", border: `1px solid ${parseMode === "ai" ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: "3px", color: !groqConfigured ? "var(--fm-ink-mute)" : (parseMode === "ai" ? "var(--fm-brass)" : "var(--fm-ink-dim)"), cursor: groqConfigured ? "pointer" : "not-allowed", fontFamily: "var(--fm-mono)", fontSize: "0.66rem", letterSpacing: "0.04em", opacity: groqConfigured ? 1 : 0.6, padding: "0.35rem 0.75rem" }}
                  >
                    AI (Groq)
                  </button>
                </div>
                <p style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", lineHeight: 1.5, margin: "0.4rem 0 0" }}>
                  {parseMode === "local"
                    ? "Regex-based extraction, entirely on this device — bill content is never sent anywhere."
                    : "Sends each candidate email's text to Groq for extraction — more accurate on odd formats, but leaves the device."}
                </p>
              </div>

              {phase === "scanning" ? (
                <div style={{ alignItems: "center", background: "var(--fm-bg)", border: "1px solid var(--fm-hairline)", borderRadius: "4px", display: "flex", gap: "0.5rem", padding: "0.65rem 0.85rem" }}>
                  <span style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem" }}>
                    {progress.total > 0 ? `Scanning… (${progress.done} of ${progress.total})` : "Searching label…"}
                  </span>
                </div>
              ) : (
                <button
                  onClick={handleSync}
                  style={{ background: "#c9a96e18", border: "1px solid var(--fm-brass)", borderRadius: "3px", color: "var(--fm-brass)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.5rem 1.25rem", transition: "all 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#c9a96e28"}
                  onMouseLeave={e => e.currentTarget.style.background = "#c9a96e18"}
                >
                  Sync Now
                </button>
              )}

              {phase === "success" && summary && (
                <div style={{ background: "#4ade8012", border: "1px solid #4ade8030", borderRadius: "4px", marginTop: "1rem", padding: "0.75rem 1rem" }}>
                  <div style={{ color: "var(--fm-green)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {summary.nothingNew ? "Nothing new" : "Import complete"}
                  </div>
                  <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", marginTop: "0.35rem" }}>
                    {summary.nothingNew
                      ? `Scanned ${summary.scanned} ${summary.scanned === 1 ? "email" : "emails"}, no new bills found.`
                      : `Added ${summary.imported} ${summary.imported === 1 ? "bill" : "bills"} to your Utilities.`}
                  </div>
                </div>
              )}
            </>
          ))}
          </>
        )}
      </div>

      {phase === "review" && candidates.length > 0 && createPortal(
        <GmailBillReview
          candidates={candidates}
          onDone={handleReviewDone}
          onCancel={() => { setCandidates([]); setPhase("idle"); }}
        />,
        document.body
      )}
    </>
  );
}
