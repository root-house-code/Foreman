import { useState, useEffect } from "react";
import ComboInput from "./ComboInput.jsx";
import { storageGet } from "../lib/storage.js";

const MEMBERS_KEY = "foreman-household-members";

function loadMembers() {
  try { return storageGet(MEMBERS_KEY) ?? []; }
  catch { return []; }
}

export default function AssigneeInput({ value, onChange, onBlurCommit, placeholder = "Assign to…", style = {} }) {
  const [members, setMembers] = useState([]);

  useEffect(() => { setMembers(loadMembers()); }, []);

  const options = members
    .filter(m => !value || m.name.toLowerCase().includes(value.toLowerCase()))
    .map(m => m.name);

  return (
    <ComboInput
      value={value}
      onChange={onChange}
      onBlur={onBlurCommit}
      options={members.map(m => m.name)}
      placeholder={placeholder}
      style={style}
    />
  );
}

// Click-to-edit wrapper for table cells — shows plain text, click switches to AssigneeInput
export function AssigneeCellInput({ value, placeholder = "—", onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit(v) {
    onChange(v);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div
        onClick={() => { setDraft(value); setEditing(true); }}
        style={{
          color: value ? "var(--fm-ink, #e8e0d5)" : "var(--fm-ink-mute, #6b6481)",
          fontFamily: "var(--fm-mono, monospace)",
          fontSize: "0.82rem",
          cursor: "text",
          minHeight: "1.2em",
          padding: "0.1rem 0",
          userSelect: "none",
        }}
      >
        {value || placeholder}
      </div>
    );
  }

  return (
    <AssigneeInput
      value={draft}
      onChange={v => setDraft(v)}
      onBlurCommit={() => commit(draft)}
      placeholder={placeholder}
      style={{ fontSize: "0.8rem", padding: "0.2rem 0.4rem" }}
    />
  );
}
