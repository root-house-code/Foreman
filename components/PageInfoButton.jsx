// "About this page" affordance: an icon button in the header (left of Search) that
// opens a modal describing the current page — its value proposition, how to use it,
// and which other pages share its data. Content comes from the shared source in
// lib/pageInfo.js (also used by the Read Me → Instructions tab).

import { useState, useEffect } from "react";
import { getPageInfoByTitle, pageTitle } from "../lib/pageInfo.js";

function InfoIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

// Inline header button — matches the adjacent Search button's chrome.
const headerBtn = {
  alignItems: "center",
  background: "var(--fm-bg-sunk)",
  border: "1px solid var(--fm-hairline)",
  borderRadius: 3,
  color: "var(--fm-ink-mute)",
  cursor: "pointer",
  display: "flex",
  justifyContent: "center",
  padding: "5px 7px",
  transition: "color 0.15s, border-color 0.15s",
};

const overlay = {
  alignItems: "center",
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  inset: 0,
  justifyContent: "center",
  position: "fixed",
  zIndex: 1100,
};

const box = {
  background: "var(--fm-bg-panel)",
  border: "var(--fm-border)",
  borderRadius: "var(--fm-radius-lg)",
  boxShadow: "0 12px 40px #00000060",
  maxHeight: "85vh",
  maxWidth: 460,
  overflowY: "auto",
  padding: "1.4rem 1.6rem 1.6rem",
  width: "90%",
};

const eyebrow = {
  color: "var(--fm-brass-dim)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.55rem",
  letterSpacing: "0.18em",
  marginBottom: "0.3rem",
  textTransform: "uppercase",
};

const titleStyle = {
  color: "var(--fm-ink)",
  fontFamily: "var(--fm-serif)",
  fontSize: "1.25rem",
  letterSpacing: "-0.01em",
  lineHeight: 1.2,
};

const sectionLabel = {
  color: "var(--fm-ink-mute)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.55rem",
  letterSpacing: "0.15em",
  marginBottom: "0.4rem",
  textTransform: "uppercase",
};

const bodyText = {
  color: "var(--fm-ink-dim)",
  fontFamily: "var(--fm-sans)",
  fontSize: "0.85rem",
  lineHeight: 1.65,
  margin: 0,
};

const sectionWrap = { marginTop: "1.1rem" };

const closeBtn = {
  background: "transparent",
  border: "none",
  color: "var(--fm-ink-mute)",
  cursor: "pointer",
  fontSize: "1.25rem",
  lineHeight: 1,
  marginLeft: "1rem",
  padding: "0 0.2rem",
};

const relRow = {
  background: "transparent",
  border: "none",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-ink-dim)",
  cursor: "pointer",
  display: "block",
  fontFamily: "var(--fm-sans)",
  fontSize: "0.8rem",
  lineHeight: 1.5,
  margin: 0,
  padding: "0.3rem 0.4rem",
  textAlign: "left",
  width: "100%",
};

export default function PageInfoButton({ title, navigate }) {
  const [open, setOpen] = useState(false);
  const info = getPageInfoByTitle(title);

  // Close on Escape while the modal is open (mirrors CommandPalette).
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!info) return null;

  function go(key) {
    setOpen(false);
    navigate?.(key);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="About this page"
        aria-label="About this page"
        style={headerBtn}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--fm-brass)";
          e.currentTarget.style.color = "var(--fm-ink-dim)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--fm-hairline)";
          e.currentTarget.style.color = "var(--fm-ink-mute)";
        }}
      >
        <InfoIcon size={13} />
      </button>

      {open && (
        <div
          style={overlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div style={box}>
            <div style={{ alignItems: "flex-start", display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={eyebrow}>Page guide</div>
                <div style={titleStyle}>{info.title}</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={closeBtn}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fm-ink)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fm-ink-mute)"; }}
              >
                ×
              </button>
            </div>

            <div style={sectionWrap}>
              <div style={sectionLabel}>What it's for</div>
              <p style={bodyText}>{info.valueProp}</p>
            </div>

            {info.howTo?.length > 0 && (
              <div style={sectionWrap}>
                <div style={sectionLabel}>How to use it</div>
                <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {info.howTo.map((step, i) => (
                    <li key={i} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.35rem" }}>
                      <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", minWidth: "0.95rem", paddingTop: "0.15rem" }}>{i + 1}.</span>
                      <span style={bodyText}>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {info.sharedWith?.length > 0 && (
              <div style={sectionWrap}>
                <div style={sectionLabel}>Shares data with</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem", marginLeft: "-0.4rem" }}>
                  {info.sharedWith.map((rel) => (
                    <button
                      key={rel.key}
                      type="button"
                      onClick={() => go(rel.key)}
                      title={`Go to ${pageTitle(rel.key)}`}
                      style={relRow}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--fm-bg-sunk)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{pageTitle(rel.key)}</span>
                      <span style={{ color: "var(--fm-ink-mute)" }}> — {rel.why}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
