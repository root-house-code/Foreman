import { useState, useEffect } from "react";
import ComboInput from "./ComboInput.jsx";
import { storageGet } from "../lib/storage.js";

const MEMBERS_KEY = "foreman-household-members";

function loadMembers() {
  try { return storageGet(MEMBERS_KEY) ?? []; }
  catch { return []; }
}

/**
 * Multi-select assignee picker. Shows selected assignees as removable chips and
 * an autocomplete combo (sourced from household members) to add more. Custom
 * names not in the member list can be added by typing and pressing Enter.
 *
 * Props:
 *   value       — string[] of selected assignee names
 *   onChange    — (string[]) => void
 *   placeholder — input placeholder
 *   style       — extra styles merged onto the add-input
 */
export default function MultiAssigneeInput({ value = [], onChange, placeholder = "Add who…", style = {} }) {
  const [members, setMembers] = useState([]);
  const [draft, setDraft] = useState("");

  useEffect(() => { setMembers(loadMembers()); }, []);

  const selectedLower = value.map(v => v.toLowerCase());
  const memberNames = members.map(m => m.name);
  // Suggest members not already chosen
  const options = memberNames.filter(n => !selectedLower.includes(n.toLowerCase()));

  function addAssignee(name) {
    const clean = name.trim();
    if (!clean) return;
    if (selectedLower.includes(clean.toLowerCase())) { setDraft(""); return; }
    onChange([...value, clean]);
    setDraft("");
  }

  function removeAssignee(name) {
    onChange(value.filter(v => v !== name));
  }

  function handleDraftChange(v) {
    // Dropdown selection: value jumps to a full member name (length grows by >1),
    // vs. incremental typing which grows by ~1 char. Auto-commit the click-select.
    if (memberNames.some(n => n.toLowerCase() === v.toLowerCase()) && v.length - draft.length > 1) {
      addAssignee(v);
      return;
    }
    // Comma-separated entry: commit completed segments, keep the trailing remainder.
    if (v.includes(",")) {
      const parts = v.split(",");
      const remainder = parts.pop();
      parts.forEach(p => addAssignee(p));
      setDraft(remainder.trim());
      return;
    }
    setDraft(v);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addAssignee(draft);
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      // Quick-remove the last chip when the input is empty
      removeAssignee(value[value.length - 1]);
    }
  }

  const chipStyle = {
    alignItems: "center",
    background: "var(--fm-brass-bg, #c9a96e22)",
    border: "1px solid var(--fm-brass, #c9a96e)",
    borderRadius: "3px",
    color: "var(--fm-brass, #c9a96e)",
    display: "inline-flex",
    fontFamily: "var(--fm-mono, monospace)",
    fontSize: "0.7rem",
    gap: "0.35rem",
    padding: "0.12rem 0.2rem 0.12rem 0.45rem",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          {value.map(name => (
            <span key={name} style={chipStyle}>
              {name}
              <button
                type="button"
                onClick={() => removeAssignee(name)}
                aria-label={`Remove ${name}`}
                style={{ background: "transparent", border: "none", color: "var(--fm-brass, #c9a96e)", cursor: "pointer", fontFamily: "var(--fm-mono, monospace)", fontSize: "0.8rem", lineHeight: 1, padding: "0 0.15rem" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red, #e07b6a)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--fm-brass, #c9a96e)"}
              >×</button>
            </span>
          ))}
        </div>
      )}
      <ComboInput
        value={draft}
        onChange={handleDraftChange}
        onKeyDown={handleKeyDown}
        onBlur={() => addAssignee(draft)}
        options={options}
        placeholder={value.length > 0 ? "Add another…" : placeholder}
        style={style}
      />
    </div>
  );
}
