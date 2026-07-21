import { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { storageGet, storageSet, storageDel } from "./lib/storage.js";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import useIsMobile, { MOBILE_SHELL_HEIGHT } from "./src/hooks/useIsMobile.js";
import {
  PROFILE_DATA_KEYS,
  getAllProfiles, loadUserProfiles,
  loadActiveProfile, switchProfile,
  exportProfile, importProfileData, hasProfileSnapshot,
  createProfile, deleteUserProfile, renameUserProfile,
} from "./lib/profiles.js";
import { defaultData, loadData, loadCustomData, saveCustomData } from "./lib/data.js";
import { loadDeletedCategories } from "./lib/deletedCategories.js";
import { loadDeletedItems } from "./lib/deletedItems.js";
import { loadItemFieldValues, saveItemFieldValues } from "./lib/customFields.js";
import { extractPdfText, renderSpecificPages, chunkPageTexts } from "./lib/pdfExtract.js";
import { extractChunk, mergeResults, resolveAppliance, associateImages } from "./lib/inspectionGroq.js";
import { storeImageFromDataUrl } from "./lib/images.js";
import { loadTodos, saveTodos, createTodo } from "./lib/todos.js";
import { loadProjects, saveProjects, createProject } from "./lib/projects.js";
import { useForemanStore } from "./lib/store.js";
import { loadCategoryTypeOverrides, saveCategoryTypeOverrides } from "./lib/categoryTypes.js";
import {
  loadEntityTypes, saveEntityTypes,
  createType, createSubtype, renameType, deleteType,
  getBehaviorClass, getSubtypes, getRootTypesForClass, getLabelForType,
  BUILT_IN_TYPES,
} from "./lib/entityTypes.js";
import { BUILT_IN_ITEM_TYPES } from "./lib/itemTypes.js";
import { MANUFACTURERS_BY_ITEM } from "./lib/manufacturers.js";
import { getModels } from "./lib/models.js";
import { expectedYears, EXPECTED_LIFESPAN } from "./lib/lifespans.js";
import InspectionReview from "./components/InspectionReview.jsx";
import GmailBillsImport from "./components/GmailBillsImport.jsx";
import { loadGroqApiKey, saveGroqApiKey } from "./lib/groqConfig.js";
import {
  getWebhookUrl, setWebhookUrl,
  getSendHourLocal, setSendHourLocal,
  getTimezone, setTimezone,
  getLeadDays, setLeadDays,
  getHouseholdId, getLastSyncIso,
  formatHour12, TIMEZONE_PRESETS,
  loadReminderModes, syncReminders,
  dispatchReminders,
} from "./lib/reminders.js";

// ─── Settings nav items ───────────────────────────────────────────────────────

const NAV_ITEMS = [
  { key: "profile",        label: "Profile",           available: true  },
  { key: "automation",     label: "Automation",         available: true  },
  { key: "integrations",   label: "Integrations",       available: true  },
  { key: "display",        label: "Display",            available: true  },
  { key: "importexport",   label: "Import / Export",    available: true  },
  { key: "info",           label: "Default Values",     available: true  },
];

const INSPECTION_META_KEY   = "foreman-inspection-meta";
const HOUSEHOLD_ADDRESS_KEY = "foreman-household-address";
const HOUSEHOLD_MEMBERS_KEY = "foreman-household-members";

const EMPTY_ADDRESS = { street: "", street2: "", city: "", state: "", zip: "" };

function loadAddress() {
  try { return { ...EMPTY_ADDRESS, ...(storageGet(HOUSEHOLD_ADDRESS_KEY) ?? {}) }; }
  catch { return { ...EMPTY_ADDRESS }; }
}

function saveAddress(addr) {
  storageSet(HOUSEHOLD_ADDRESS_KEY, addr);
}

function loadMembers() {
  try { return storageGet(HOUSEHOLD_MEMBERS_KEY) ?? []; }
  catch { return []; }
}

function saveMembers(members) {
  storageSet(HOUSEHOLD_MEMBERS_KEY, members);
}

const HOUSEHOLD_PROVIDERS_KEY = "foreman-service-providers";

function loadServiceProviders() {
  try { return storageGet(HOUSEHOLD_PROVIDERS_KEY) ?? []; }
  catch { return []; }
}

function saveServiceProviders(providers) {
  storageSet(HOUSEHOLD_PROVIDERS_KEY, providers);
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const labelStyle = {
  color: "var(--fm-ink-dim)", display: "block", fontFamily: "var(--fm-mono)",
  fontSize: "0.62rem", letterSpacing: "0.1em", marginBottom: "0.4rem", textTransform: "uppercase",
};

const selectStyle = {
  appearance: "none",
  background: "var(--fm-bg-panel)",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235a5460'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.75rem center",
  border: "1px solid var(--fm-hairline2)",
  borderRadius: "4px",
  boxSizing: "border-box",
  color: "var(--fm-ink)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.82rem",
  outline: "none",
  padding: "0.5rem 2rem 0.5rem 0.75rem",
  width: "220px",
};

const subheadStyle = {
  color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem",
  letterSpacing: "0.12em", marginBottom: "0.5rem", textTransform: "uppercase",
};

const bodyTextStyle = {
  color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem",
  lineHeight: 1.55, margin: "0 0 0.9rem",
};

function inputStyle(focused) {
  return {
    background: "var(--fm-bg-panel)",
    border: `1px solid ${focused ? "var(--fm-brass)" : "var(--fm-ink-dim)"}`,
    borderRadius: "4px",
    boxSizing: "border-box",
    color: "var(--fm-ink)",
    fontFamily: "var(--fm-mono)",
    fontSize: "0.82rem",
    outline: "none",
    padding: "0.5rem 0.75rem",
    width: "100%",
  };
}

// ─── ProfileSettings ──────────────────────────────────────────────────────────

function ProfileSettings() {
  const [onlineMode, setOnlineMode]   = useState(() => storageGet("foreman-online-mode") === true);
  const [activeProfile]  = useState(() => loadActiveProfile());
  const [allProfiles, setAllProfiles] = useState(() => getAllProfiles());
  const activeMeta = allProfiles.find(p => p.key === activeProfile);

  // ── Profile switcher ──
  const [selected, setSelected]   = useState(activeProfile);
  const [switching, setSwitching] = useState(false);
  const selectedMeta = allProfiles.find(p => p.key === selected);
  const isDirty      = selected !== activeProfile;
  const isUserProfile = selectedMeta?.isUser === true;

  function handleSwitch() { setSwitching(true); switchProfile(selected); }
  function handleCancelSwitch() { setSelected(activeProfile); }

  // ── Rename ──
  const [renamingKey, setRenamingKey]   = useState(null);
  const [renameValue, setRenameValue]   = useState("");
  const [renameFocused, setRenameFocused] = useState(false);

  function handleStartRename() {
    setRenamingKey(selected);
    setRenameValue(selectedMeta?.label ?? "");
  }

  function handleCommitRename() {
    if (renamingKey && renameValue.trim()) {
      renameUserProfile(renamingKey, renameValue.trim());
      setAllProfiles(getAllProfiles());
    }
    setRenamingKey(null);
  }

  // ── Delete ──
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDeleteProfile() {
    setConfirmDelete(false);
    deleteUserProfile(selected);
    // deleteUserProfile reloads if active; otherwise update local list.
    if (selected !== activeProfile) {
      setAllProfiles(getAllProfiles());
      setSelected(activeProfile);
    }
  }

  // ── Create new profile ──
  const [showCreate, setShowCreate]     = useState(false);
  const [newName, setNewName]           = useState("");
  const [seedInventory, setSeedInventory] = useState(true);
  const [seedTasks, setSeedTasks]       = useState(true);
  const [creating, setCreating]         = useState(false);
  const [nameFocused, setNameFocused]   = useState(false);

  function buildSnap() {
    const snap = {};
    for (const k of PROFILE_DATA_KEYS) snap[k] = null;
    snap["foreman-chores"]           = JSON.stringify([]);
    snap["foreman-todos"]            = JSON.stringify([]);
    snap["foreman-projects"]         = JSON.stringify([]);
    snap["foreman-use-default-data"] = JSON.stringify(seedInventory);

    if (seedInventory && !seedTasks) {
      const taskKeys = defaultData
        .filter(r => r.category && r.item && r.task)
        .map(r => `${r.category}|${r.item}|${r.task}`);
      snap["foreman-deleted-rows"] = JSON.stringify(taskKeys);
    }
    return snap;
  }

  function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    createProfile(newName.trim(), buildSnap());
    // createProfile calls switchProfile which reloads — no further state needed.
  }

  function handleCancelCreate() {
    setShowCreate(false);
    setNewName("");
    setSeedInventory(true);
    setSeedTasks(true);
  }

  // ── Address ──
  const [address, setAddressState]       = useState(() => loadAddress());
  const [editingAddress, setEditingAddress] = useState(false);
  const [draft, setDraft]                = useState(EMPTY_ADDRESS);
  const [focusedField, setFocusedField]  = useState(null);

  const hasAddress = address.street.trim() !== "" || address.city.trim() !== "";

  function startEditAddress() { setDraft({ ...address }); setEditingAddress(true); }

  function handleSaveAddress() {
    const cleaned = {
      street:  draft.street.trim(),
      street2: draft.street2.trim(),
      city:    draft.city.trim(),
      state:   draft.state.trim().toUpperCase().slice(0, 2),
      zip:     draft.zip.trim().slice(0, 10),
    };
    saveAddress(cleaned);
    setAddressState(cleaned);
    setEditingAddress(false);
  }

  function handleClearAddress() {
    saveAddress(EMPTY_ADDRESS);
    setAddressState({ ...EMPTY_ADDRESS });
    setEditingAddress(false);
  }

  function field(key, placeholder, opts = {}) {
    return (
      <input
        value={draft[key]}
        placeholder={placeholder}
        onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
        onFocus={() => setFocusedField(key)}
        onBlur={() => setFocusedField(null)}
        onKeyDown={e => {
          if (e.key === "Escape") { e.preventDefault(); setEditingAddress(false); }
        }}
        maxLength={opts.maxLength}
        style={{ ...inputStyle(focusedField === key), ...opts.style }}
      />
    );
  }

  return (
    <div style={{ maxWidth: "560px" }}>
      <h2 style={{ color: "var(--fm-ink)", borderBottom: "var(--fm-border)", fontFamily: "var(--fm-serif)", fontSize: "1.25rem", fontWeight: 400, margin: "0 0 1.25rem", paddingBottom: "0.6rem" }}>Profile</h2>
      <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", margin: "0 0 2rem" }}>
        Switch between profiles to use different data sets. Each profile's data is saved independently — switching away and back restores it exactly as you left it.
      </p>

      {/* ── Active profile selector + Address ── */}
      <div style={{ alignItems: "flex-start", display: "flex", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <div style={{ flexShrink: 0 }}>
          <label style={labelStyle}>Active Profile</label>
          {allProfiles.length > 0 ? (
            <select
              value={selected}
              onChange={e => { setSelected(e.target.value); setSwitching(false); setRenamingKey(null); setConfirmDelete(false); }}
              style={selectStyle}
            >
              {allProfiles.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          ) : (
            <div style={{ ...selectStyle, alignItems: "center", color: "var(--fm-ink-mute)", cursor: "default", display: "flex" }}>None yet</div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <label style={labelStyle}>Address</label>
          {editingAddress ? (
            <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "6px", padding: "1.1rem 1.25rem" }}>
              <div style={{ marginBottom: "0.7rem" }}>
                {field("street", "Street address", { style: { width: "100%" } })}
              </div>
              <div style={{ marginBottom: "0.7rem" }}>
                {field("street2", "Apt, suite, unit (optional)", { style: { width: "100%" } })}
              </div>
              <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "1fr 72px 100px", marginBottom: "1rem" }}>
                {field("city", "City")}
                {field("state", "ST", { maxLength: 2, style: { textTransform: "uppercase" } })}
                {field("zip", "ZIP", { maxLength: 10 })}
              </div>
              <div style={{ display: "flex", gap: "0.6rem", justifyContent: "space-between" }}>
                <div>
                  {hasAddress && (
                    <button
                      onClick={handleClearAddress}
                      style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.67rem", padding: 0, transition: "color 0.12s" }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                    >Clear address</button>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.6rem" }}>
                  <button
                    onClick={() => setEditingAddress(false)}
                    style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "0.4rem 0.9rem", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
                  >Cancel</button>
                  <button
                    onClick={handleSaveAddress}
                    style={{ background: "#c9a96e22", border: "1px solid #c9a96e", borderRadius: "3px", color: "var(--fm-brass)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", letterSpacing: "0.05em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#c9a96e35"}
                    onMouseLeave={e => e.currentTarget.style.background = "#c9a96e22"}
                  >Save</button>
                </div>
              </div>
            </div>
          ) : hasAddress ? (
            <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "6px", padding: "1.1rem 1.25rem" }}>
              <div style={{ alignItems: "flex-start", display: "flex", gap: "1rem", justifyContent: "space-between" }}>
                <address style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.78rem", fontStyle: "normal", lineHeight: 1.65 }}>
                  <div style={{ color: "var(--fm-ink)" }}>{address.street}</div>
                  {address.street2 && <div>{address.street2}</div>}
                  <div>{[address.city, address.state].filter(Boolean).join(", ")}{address.zip ? ` ${address.zip}` : ""}</div>
                </address>
                <button
                  onClick={startEditAddress}
                  style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.67rem", letterSpacing: "0.05em", padding: 0, transition: "color 0.12s" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                >Edit</button>
              </div>
            </div>
          ) : (
            <button
              onClick={startEditAddress}
              style={{ alignItems: "center", background: "var(--fm-bg-raised)", border: "1px dashed #2a3040", borderRadius: "6px", color: "#4a4458", cursor: "pointer", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", gap: "0.5rem", letterSpacing: "0.05em", padding: "1rem 1.25rem", textAlign: "left", transition: "all 0.15s", width: "100%" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#c9a96e50"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "#4a4458"; }}
            >
              + Add address
            </button>
          )}
        </div>
      </div>

      {/* Profile description card */}
      {allProfiles.length > 0 ? (
        <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "4px", marginBottom: "1.5rem", padding: "0.9rem 1rem" }}>
          {renamingKey === selected ? (
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onFocus={() => setRenameFocused(true)}
              onBlur={() => { setRenameFocused(false); handleCommitRename(); }}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); handleCommitRename(); }
                if (e.key === "Escape") { e.preventDefault(); setRenamingKey(null); }
              }}
              style={{ ...inputStyle(renameFocused), marginBottom: "0.35rem" }}
            />
          ) : (
            <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.12em", marginBottom: "0.35rem", textTransform: "uppercase" }}>
              {selectedMeta?.label}
            </div>
          )}
          <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.78rem", lineHeight: 1.55, margin: 0 }}>
            {selectedMeta?.description}
          </p>
          <div style={{ alignItems: "center", display: "flex", gap: "0.75rem", marginTop: "0.6rem" }}>
            {selected === activeProfile && (
              <div style={{ alignItems: "center", display: "flex", gap: "0.4rem" }}>
                <span style={{ background: "var(--fm-brass)", borderRadius: "50%", display: "inline-block", height: "6px", width: "6px" }} />
                <span style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.08em" }}>Currently active</span>
              </div>
            )}
            {isUserProfile && (
              <>
                <button
                  onClick={handleStartRename}
                  style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.05em", padding: 0, transition: "color 0.12s" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                >Rename</button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.05em", padding: 0, transition: "color 0.12s" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                >Delete</button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div style={{ background: "var(--fm-bg-raised)", border: "1px dashed var(--fm-hairline2)", borderRadius: "4px", marginBottom: "1.5rem", padding: "0.9rem 1rem" }}>
          <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.12em", marginBottom: "0.35rem", textTransform: "uppercase" }}>
            No profile yet
          </div>
          <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.78rem", lineHeight: 1.55, margin: 0 }}>
            Your data isn't tied to a named profile until you create one. Use + New Profile below to get started — a guided setup is on the way.
          </p>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ background: "var(--fm-bg-panel)", border: "1px solid #f8717140", borderRadius: "4px", marginBottom: "1.5rem", padding: "1rem 1.1rem" }}>
          <div style={{ color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.78rem", marginBottom: "0.4rem" }}>
            Delete "{selectedMeta?.label}"?
          </div>
          <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", lineHeight: 1.5, margin: "0 0 0.9rem" }}>
            {selected !== activeProfile
              ? "All saved data for this profile will be permanently removed. This cannot be undone."
              : selected === "foreman"
              ? "This will delete the profile and reset it to a clean slate. This cannot be undone."
              : "This will delete the profile and switch you to Foreman. This cannot be undone."}
          </p>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button
              onClick={handleDeleteProfile}
              style={{ background: "#f8717118", border: "1px solid #f8717140", borderRadius: "3px", color: "var(--fm-red)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", letterSpacing: "0.05em", padding: "0.45rem 1.1rem", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#f8717130"; e.currentTarget.style.borderColor = "var(--fm-red)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#f8717118"; e.currentTarget.style.borderColor = "#f8717140"; }}
            >Delete</button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "0.45rem 1rem", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* Inline switch confirmation */}
      {isDirty && !confirmDelete && (
        <div style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "4px", marginBottom: "1.5rem", padding: "1rem 1.1rem" }}>
          <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.78rem", marginBottom: "0.4rem" }}>
            Switch to <strong style={{ color: "var(--fm-brass)" }}>{selectedMeta?.label}</strong>?
          </div>
          <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", lineHeight: 1.5, margin: "0 0 0.9rem" }}>
            Your current <strong style={{ color: "var(--fm-brass-dim)" }}>{activeMeta?.label}</strong> data will be saved automatically. The page will reload with {selectedMeta?.label} data.
          </p>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button
              onClick={handleSwitch} disabled={switching}
              style={{ background: switching ? "transparent" : "#c9a96e22", border: `1px solid ${switching ? "var(--fm-ink-dim)" : "var(--fm-brass)"}`, borderRadius: "3px", color: switching ? "var(--fm-ink-dim)" : "var(--fm-brass)", cursor: switching ? "default" : "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", letterSpacing: "0.05em", padding: "0.45rem 1.1rem", transition: "all 0.15s" }}
              onMouseEnter={e => { if (!switching) e.currentTarget.style.background = "#c9a96e35"; }}
              onMouseLeave={e => { if (!switching) e.currentTarget.style.background = "#c9a96e22"; }}
            >
              {switching ? "Switching…" : `Switch to ${selectedMeta?.label}`}
            </button>
            <button
              onClick={handleCancelSwitch} disabled={switching}
              style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-ink-dim)", cursor: switching ? "default" : "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "0.45rem 1rem", transition: "all 0.15s" }}
              onMouseEnter={e => { if (!switching) { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; } }}
              onMouseLeave={e => { if (!switching) { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; } }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* ── Create new profile ── */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          style={{ background: "transparent", border: "1px solid var(--fm-hairline)", borderRadius: "3px", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.05em", marginBottom: "2rem", padding: "0.4rem 0.9rem", transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
        >+ New Profile</button>
      ) : (
        <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "4px", marginBottom: "2rem", padding: "1rem 1.1rem" }}>
          <div style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.12em", marginBottom: "0.85rem", textTransform: "uppercase" }}>New Profile</div>

          <div style={{ marginBottom: "0.85rem" }}>
            <label style={labelStyle}>Profile Name</label>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              placeholder="e.g. Rental Property"
              onKeyDown={e => {
                if (e.key === "Enter" && newName.trim()) handleCreate();
                if (e.key === "Escape") handleCancelCreate();
              }}
              style={inputStyle(nameFocused)}
            />
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label style={labelStyle}>Starting Content</label>
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", lineHeight: 1.5, margin: "0 0 0.65rem" }}>
              New profiles always start with no chores, to dos, or projects. Choose whether to include default maintenance content.
            </p>
            <label style={{ alignItems: "flex-start", cursor: "pointer", display: "flex", gap: "0.6rem", marginBottom: "0.5rem" }}>
              <input
                type="checkbox"
                checked={seedInventory}
                onChange={e => { setSeedInventory(e.target.checked); if (!e.target.checked) setSeedTasks(false); }}
                style={{ accentColor: "var(--fm-brass)", flexShrink: 0, marginTop: "0.15rem" }}
              />
              <div>
                <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem" }}>Default categories & items</div>
                <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", marginTop: "0.1rem" }}>Include the default inventory structure (HVAC, Plumbing, Exterior, etc.)</div>
              </div>
            </label>
            <label style={{ alignItems: "flex-start", cursor: seedInventory ? "pointer" : "default", display: "flex", gap: "0.6rem", opacity: seedInventory ? 1 : 0.4 }}>
              <input
                type="checkbox"
                checked={seedTasks && seedInventory}
                disabled={!seedInventory}
                onChange={e => setSeedTasks(e.target.checked)}
                style={{ accentColor: "var(--fm-brass)", flexShrink: 0, marginTop: "0.15rem" }}
              />
              <div>
                <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem" }}>Default maintenance tasks</div>
                <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", marginTop: "0.1rem" }}>Include pre-built task schedules for each item (requires categories & items)</div>
              </div>
            </label>
          </div>

          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              style={{ background: newName.trim() && !creating ? "#c9a96e22" : "transparent", border: `1px solid ${newName.trim() && !creating ? "var(--fm-brass)" : "var(--fm-ink-dim)"}`, borderRadius: "3px", color: newName.trim() && !creating ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: newName.trim() && !creating ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", letterSpacing: "0.05em", padding: "0.45rem 1.1rem", transition: "all 0.15s" }}
              onMouseEnter={e => { if (newName.trim() && !creating) e.currentTarget.style.background = "#c9a96e35"; }}
              onMouseLeave={e => { if (newName.trim() && !creating) e.currentTarget.style.background = "#c9a96e22"; }}
            >{creating ? "Creating…" : "Create Profile"}</button>
            <button
              onClick={handleCancelCreate}
              disabled={creating}
              style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-ink-dim)", cursor: creating ? "default" : "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "0.45rem 1rem", transition: "all 0.15s" }}
              onMouseEnter={e => { if (!creating) { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; } }}
              onMouseLeave={e => { if (!creating) { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; } }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* ── Online / Offline Mode ── */}
      <div style={{ borderTop: "1px solid var(--fm-hairline)", marginTop: "2rem", paddingTop: "1.5rem" }}>
        <div style={subheadStyle}>Connectivity</div>
        <label style={{ alignItems: "flex-start", cursor: "pointer", display: "flex", gap: "0.6rem" }}>
          <input
            type="checkbox"
            checked={onlineMode}
            onChange={e => {
              const val = e.target.checked;
              setOnlineMode(val);
              if (val) storageSet("foreman-online-mode", true);
              else storageDel("foreman-online-mode");
            }}
            style={{ accentColor: "var(--fm-green)", flexShrink: 0, marginTop: "0.15rem" }}
          />
          <div>
            <div style={{ alignItems: "center", display: "flex", gap: "0.4rem" }}>
              <span style={{ background: onlineMode ? "var(--fm-green)" : "var(--fm-ink-mute)", borderRadius: "50%", display: "inline-block", flexShrink: 0, height: "6px", transition: "background 0.2s", width: "6px" }} />
              <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem" }}>
                {onlineMode ? "Online Mode" : "Offline Mode"}
              </span>
            </div>
            <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", lineHeight: 1.5, marginTop: "0.2rem" }}>
              {onlineMode
                ? "Network features enabled — Discord reminders and AI Inspection are active."
                : "No network requests made. Enable to use integrations and AI features."}
            </div>
          </div>
        </label>

        <div style={{ marginTop: "1rem" }}>
          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.12em", marginBottom: "0.45rem", textTransform: "uppercase" }}>
            Deactivated in Offline Mode
          </div>
          <ul style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", lineHeight: 1.6, margin: 0, paddingLeft: "1.1rem" }}>
            <li style={{ marginBottom: "0.3rem" }}>
              <span style={{ color: "var(--fm-ink)" }}>Discord reminders</span> — daily reminder digests sent to your webhook
            </li>
            <li style={{ marginBottom: "0.3rem" }}>
              <span style={{ color: "var(--fm-ink)" }}>AI Inspection</span> — photo-based home analysis via an external AI service
            </li>
            <li>
              <span style={{ color: "var(--fm-ink)" }}>All outbound network requests</span> — nothing leaves your device
            </li>
          </ul>
        </div>
      </div>

    </div>
  );
}


// ─── AutomationSettings ───────────────────────────────────────────────────────

function AutomationSettings() {
  const [autoTodo, setAutoTodo] = useState(
    () => storageGet("foreman-auto-todo-overdue") === true
  );

  function handleAutoTodoChange(checked) {
    setAutoTodo(checked);
    if (checked) {
      storageSet("foreman-auto-todo-overdue", true);
    } else {
      storageDel("foreman-auto-todo-overdue");
    }
  }

  return (
    <div style={{ maxWidth: "560px" }}>
      <h2 style={{ color: "var(--fm-ink)", borderBottom: "var(--fm-border)", fontFamily: "var(--fm-serif)", fontSize: "1.25rem", fontWeight: 400, margin: "0 0 1.25rem", paddingBottom: "0.6rem" }}>Automation</h2>
      <div style={subheadStyle}>To Dos</div>
      <label style={{ alignItems: "flex-start", cursor: "pointer", display: "flex", gap: "0.6rem", marginBottom: "0.5rem" }}>
        <input
          type="checkbox"
          checked={autoTodo}
          onChange={e => handleAutoTodoChange(e.target.checked)}
          style={{ accentColor: "var(--fm-brass)", flexShrink: 0, marginTop: "0.15rem" }}
        />
        <div>
          <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem" }}>
            Auto-generate To Dos for overdue maintenance
          </div>
          <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", lineHeight: 1.5, marginTop: "0.2rem" }}>
            When a maintenance task or chore becomes overdue, automatically create a To Do for it. Off by default — turn on to opt in.
          </div>
        </div>
      </label>
    </div>
  );
}

// ─── MultiDeviceCard ──────────────────────────────────────────────────────────
// LAN sharing (desktop app only): the Electron main process serves the app +
// live data to browsers on the same wifi. This is local-network only — not an
// internet feature — so it is not gated behind Online Mode.

function MultiDeviceCard() {
  const [status, setStatus] = useState(null); // { running, enabled, port, token, addresses, error? }
  const [qr, setQr] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.foreman?.lanStatus?.().then(setStatus).catch(() => {});
  }, []);

  const shareUrl = status?.running && status.addresses?.length
    ? `http://${status.addresses[0]}:${status.port}/#pair=${status.token}`
    : null;

  // Standard dark-on-white QR for reliable phone-camera scanning.
  useEffect(() => {
    if (!shareUrl) { setQr(null); return; }
    QRCode.toDataURL(shareUrl, { margin: 2, width: 168, color: { dark: "#0f1117", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [shareUrl]);

  async function handleToggle(on) {
    if (busy) return;
    setBusy(true);
    try { setStatus(on ? await window.foreman.lanStart() : await window.foreman.lanStop()); }
    catch {} finally { setBusy(false); }
  }

  async function handleRegenerate() {
    if (busy) return;
    setBusy(true);
    try { setStatus(await window.foreman.lanRegenerate()); }
    catch {} finally { setBusy(false); }
  }

  function handleCopy() {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  const running = !!status?.running;

  return (
    <div style={{ background: "var(--fm-bg-raised)", border: `1px solid ${running ? "var(--fm-green)" : "var(--fm-hairline)"}`, borderRadius: "6px", padding: "1.1rem 1.25rem", transition: "border-color 0.2s" }}>
      <div style={{ alignItems: "center", display: "flex", gap: "0.75rem", justifyContent: "space-between", marginBottom: "0.4rem" }}>
        <div style={{ alignItems: "center", display: "flex", gap: "0.6rem" }}>
          <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem" }}>Multi-Device Sharing</span>
          {running && (
            <div style={{ alignItems: "center", display: "flex", gap: "0.35rem" }}>
              <span style={{ background: "var(--fm-green)", borderRadius: "50%", display: "inline-block", height: "6px", width: "6px" }} />
              <span style={{ color: "var(--fm-green)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.08em" }}>Sharing</span>
            </div>
          )}
        </div>
        <label style={{ cursor: busy ? "default" : "pointer", flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={running}
            disabled={busy}
            onChange={e => handleToggle(e.target.checked)}
            style={{ accentColor: "var(--fm-green)", height: "16px", width: "16px" }}
          />
        </label>
      </div>
      <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", lineHeight: 1.55, margin: 0 }}>
        Use Foreman from your phone or another computer on the same wifi network. This computer hosts your data; other devices open the app in a browser. Nothing leaves your network, and devices need this app running to connect.
      </p>
      {status?.error && (
        <p style={{ color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", margin: "0.6rem 0 0" }}>Couldn't start sharing: {status.error}</p>
      )}

      {running && shareUrl && (
        <div style={{ alignItems: "flex-start", display: "flex", gap: "1.1rem", marginTop: "1rem" }}>
          {qr && (
            <img src={qr} alt="Pairing QR code" style={{ background: "#fff", borderRadius: "6px", flexShrink: 0, height: 128, width: 128 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.1em", marginBottom: "0.3rem", textTransform: "uppercase" }}>Scan from your phone, or open:</div>
            <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", overflowWrap: "anywhere", userSelect: "all" }}>{shareUrl}</div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.7rem" }}>
              <button
                onClick={handleCopy}
                style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", letterSpacing: "0.06em", padding: "0.3rem 0.7rem", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
              >{copied ? "Copied ✓" : "Copy link"}</button>
              <button
                onClick={handleRegenerate}
                title="Invalidates the old link — devices must re-scan to reconnect"
                style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", letterSpacing: "0.06em", padding: "0.3rem 0.7rem", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-red)"; e.currentTarget.style.color = "var(--fm-red)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
              >Regenerate pairing code</button>
            </div>
            <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", lineHeight: 1.6, marginTop: "0.6rem" }}>
              The link carries a pairing code — only devices with it can read your data. Windows may ask to allow Foreman through the firewall the first time.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ThisPhoneCard ────────────────────────────────────────────────────────────
// Android app only: shows which mode this phone is in (standalone with its own
// on-device data, or connected as a live window into a desktop host) and hands
// off to the native mode chooser to switch. The native side owns the actual
// mode state; window.foreman.getAppInfo() reads it synchronously.

function ThisPhoneCard() {
  const info = (() => {
    try { return window.foreman?.getAppInfo?.() ?? {}; } catch { return {}; }
  })();
  const connected = info.mode === "connected";

  return (
    <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "6px", padding: "1.1rem 1.25rem" }}>
      <div style={{ alignItems: "center", display: "flex", gap: "0.6rem", marginBottom: "0.4rem" }}>
        <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem" }}>This Phone</span>
        <div style={{ alignItems: "center", display: "flex", gap: "0.35rem", marginLeft: "auto" }}>
          <span style={{ background: connected ? "var(--fm-cyan)" : "var(--fm-green)", borderRadius: "50%", display: "inline-block", height: "6px", width: "6px" }} />
          <span style={{ color: connected ? "var(--fm-cyan)" : "var(--fm-green)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.08em" }}>
            {connected ? "Connected to desktop" : "Standalone"}
          </span>
        </div>
      </div>
      <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", lineHeight: 1.55, margin: 0 }}>
        {connected
          ? `Live window into the desktop host${info.hostUrl ? ` at ${info.hostUrl.replace(/\/#.*$/, "")}` : ""}. Data lives on that computer; this phone shows and edits it in real time.`
          : "Full Foreman running on this phone. Data is stored on the device as real files, with the same atomic writes and rolling backups as the desktop app."}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.7rem" }}>
        <button
          onClick={() => window.foreman?.openModeSettings?.()}
          style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", letterSpacing: "0.06em", padding: "0.3rem 0.7rem", transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
        >{connected ? "Change host / go standalone" : "Connect to a desktop host"}</button>
      </div>
      {!connected && info.dataDir && (
        <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", lineHeight: 1.6, marginTop: "0.6rem", overflowWrap: "anywhere" }}>
          Data: {info.dataDir}
        </div>
      )}
    </div>
  );
}

// ─── IntegrationsSettings ─────────────────────────────────────────────────────

const REMINDER_HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: formatHour12(h) }));

function isWebhookValid(url) {
  return /^https:\/\/discord\.com\/api\/webhooks\/[^/]+\/[^/]+/.test(url.trim());
}

function IntegrationsSettings() {
  const isMobile = useIsMobile();
  const [onlineMode, setOnlineMode]       = useState(() => storageGet("foreman-online-mode") === true);
  const [groqKey, setGroqKey]             = useState(() => loadGroqApiKey());
  const [showGroqKey, setShowGroqKey]     = useState(false);
  const [groqKeyFocused, setGroqKeyFocused] = useState(false);
  const [webhook, setWebhook]             = useState(() => getWebhookUrl());
  const [showWebhook, setShowWebhook]     = useState(false);
  const [hour, setHour]                   = useState(() => getSendHourLocal());
  const [tz, setTz]                       = useState(() => getTimezone());
  const [leadDays, setLead]               = useState(() => getLeadDays());
  const [busy, setBusy]                   = useState(false);
  const [status, setStatus]               = useState(null);
  const [lastSync, setLastSync]           = useState(() => getLastSyncIso());
  const [webhookFocused, setWebhookFocused] = useState(false);

  function handleOnlineModeToggle(enabled) {
    setOnlineMode(enabled);
    if (enabled) storageSet("foreman-online-mode", true);
    else storageDel("foreman-online-mode");
  }

  const trimmedWebhook = webhook.trim();
  const webhookValid   = trimmedWebhook === "" || isWebhookValid(trimmedWebhook);
  const isConnected    = !!trimmedWebhook;

  const tzOptions = (() => {
    const presetValues = new Set(TIMEZONE_PRESETS.map(p => p.value));
    const extras = !presetValues.has(tz) ? [{ value: tz, label: `${tz} (detected)` }] : [];
    return [...extras, ...TIMEZONE_PRESETS];
  })();

  function persist() {
    setWebhookUrl(trimmedWebhook);
    setSendHourLocal(hour);
    setTimezone(tz);
    setLeadDays(leadDays);
  }

  function handleDisconnect() {
    setWebhook("");
    setWebhookUrl("");
    setStatus(null);
  }

  const trimmedGroqKey = groqKey.trim();
  const groqKeyDirty = trimmedGroqKey !== loadGroqApiKey();
  function handleGroqKeySave() {
    saveGroqApiKey(trimmedGroqKey);
  }
  function handleGroqKeyClear() {
    setGroqKey("");
    saveGroqApiKey("");
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
      const rows      = loadData();
      const nextDates = storageGet("maintenance-next-dates") ?? {};
      const modes     = loadReminderModes();
      const result    = await syncReminders({ rows, nextDates, modes });
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
      } else {
        setStatus({ ok: true, message: 'Nothing matched right now. Make sure tasks have a next-due date, or widen "Heads-up days".' });
      }
    } catch (err) {
      setStatus({ ok: false, message: err.message || String(err) });
    } finally {
      setBusy(false);
    }
  }

  const lastSyncText = lastSync ? new Date(lastSync).toLocaleString() : "never";

  return (
    <div style={{ maxWidth: "560px" }}>
      <h2 style={{ color: "var(--fm-ink)", borderBottom: "var(--fm-border)", fontFamily: "var(--fm-serif)", fontSize: "1.25rem", fontWeight: 400, margin: "0 0 1.25rem", paddingBottom: "0.6rem" }}>Integrations</h2>
      <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", margin: "0 0 1.5rem" }}>
        Connect Foreman with external tools to get your data where it needs to go.
      </p>

      {/* ── Online / Offline Mode toggle ── */}
      <div style={{ background: "var(--fm-bg-raised)", border: `1px solid ${onlineMode ? "var(--fm-green)" : "var(--fm-hairline)"}`, borderRadius: "6px", marginBottom: "1.5rem", padding: "1.1rem 1.25rem", transition: "border-color 0.2s" }}>
        <div style={{ alignItems: "center", display: "flex", gap: "0.75rem", justifyContent: "space-between" }}>
          <div style={{ flex: 1 }}>
            <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", marginBottom: "0.35rem" }}>
              <span style={{ background: onlineMode ? "var(--fm-green)" : "var(--fm-ink-mute)", borderRadius: "50%", display: "inline-block", flexShrink: 0, height: "7px", transition: "background 0.2s", width: "7px" }} />
              <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem", fontWeight: 500 }}>
                {onlineMode ? "Online Mode" : "Offline Mode"}
              </span>
            </div>
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", lineHeight: 1.5, margin: 0 }}>
              {onlineMode
                ? "Foreman can make network requests. Discord reminders and AI-powered features are enabled."
                : "Foreman makes no network requests. All data stays on your device. Enable Online Mode to use integrations."}
            </p>
          </div>
          <label style={{ cursor: "pointer", flexShrink: 0, marginLeft: "0.5rem" }}>
            <input
              type="checkbox"
              checked={onlineMode}
              onChange={e => handleOnlineModeToggle(e.target.checked)}
              style={{ accentColor: "var(--fm-green)", height: "16px", width: "16px" }}
            />
          </label>
        </div>
      </div>

      {/* Multi-Device Sharing (desktop app only) — LAN-local, so not gated by Online Mode */}
      {window.foreman?.isElectron && (
        <div style={{ marginBottom: "1.5rem" }}>
          <MultiDeviceCard />
        </div>
      )}

      {/* This Phone (Android app only) — standalone vs connected-to-desktop mode */}
      {window.foreman?.isAndroid && (
        <div style={{ marginBottom: "1.5rem" }}>
          <ThisPhoneCard />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {/* Groq API Key — powers AI Inspection, item task suggestions, and Gmail Bill Import */}
        <div style={{ opacity: onlineMode ? 1 : 0.45, pointerEvents: onlineMode ? "auto" : "none", transition: "opacity 0.2s" }}>
        <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "6px", padding: "1.1rem 1.25rem" }}>
          <div style={{ alignItems: "center", display: "flex", gap: "0.6rem", marginBottom: "0.4rem" }}>
            <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem" }}>Groq (AI features)</span>
            {trimmedGroqKey && (
              <div style={{ alignItems: "center", display: "flex", gap: "0.35rem", marginLeft: "auto" }}>
                <span style={{ background: "var(--fm-green)", borderRadius: "50%", display: "inline-block", height: "6px", width: "6px" }} />
                <span style={{ color: "var(--fm-green)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.08em" }}>Configured</span>
              </div>
            )}
          </div>
          <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", lineHeight: 1.5, margin: "0 0 1.1rem" }}>
            Powers AI Inspection import, manufacturer task suggestions, and Gmail Bill Import. Get a free key at console.groq.com/keys — it's stored locally on this device only, never shipped in the app itself.
          </p>
          <div style={{ marginBottom: "0.75rem" }}>
            <label style={labelStyle} htmlFor="integ-groq-input">API Key</label>
            <div style={{ alignItems: "stretch", display: "flex", gap: "0.4rem" }}>
              <input
                id="integ-groq-input"
                type={showGroqKey ? "text" : "password"}
                value={groqKey}
                onChange={e => setGroqKey(e.target.value)}
                onFocus={() => setGroqKeyFocused(true)}
                onBlur={() => setGroqKeyFocused(false)}
                placeholder="gsk_..."
                style={inputStyle(groqKeyFocused)}
              />
              <button
                type="button"
                onClick={() => setShowGroqKey(s => !s)}
                style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.66rem", letterSpacing: "0.06em", padding: "0 0.7rem", textTransform: "uppercase", whiteSpace: "nowrap" }}
              >
                {showGroqKey ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <div style={{ alignItems: "center", display: "flex", gap: "0.6rem", justifyContent: "space-between" }}>
            <div>
              {trimmedGroqKey && (
                <button
                  onClick={handleGroqKeyClear}
                  style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.67rem", padding: 0, transition: "color 0.12s" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                >Remove</button>
              )}
            </div>
            <button
              onClick={handleGroqKeySave}
              disabled={!groqKeyDirty}
              style={{ background: groqKeyDirty ? "#c9a96e22" : "transparent", border: `1px solid ${groqKeyDirty ? "var(--fm-brass)" : "var(--fm-ink-dim)"}`, borderRadius: "3px", color: groqKeyDirty ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: groqKeyDirty ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.05em", padding: "0.4rem 1rem", transition: "all 0.15s" }}
            >
              Save
            </button>
          </div>
        </div>
        </div>

        {/* Discord / Reminder Agent card */}
        <div style={{ opacity: onlineMode ? 1 : 0.45, pointerEvents: onlineMode ? "auto" : "none", transition: "opacity 0.2s" }}>
        <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "6px", padding: "1.1rem 1.25rem" }}>
          <div style={{ alignItems: "center", display: "flex", gap: "0.6rem", marginBottom: "0.4rem" }}>
            <svg width="18" height="18" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, opacity: 0.7 }}>
              <path d="M60.1 4.9A58.5 58.5 0 0 0 45.8.7a.2.2 0 0 0-.2.1 40.7 40.7 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A38.3 38.3 0 0 0 25.8.8a.2.2 0 0 0-.2-.1A58.4 58.4 0 0 0 11.3 5a.2.2 0 0 0-.1.1C1.6 19.1-1 32.8.3 46.4a.2.2 0 0 0 .1.2 58.8 58.8 0 0 0 17.7 9 .2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4c.4-.3.7-.6 1.1-.9a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0c.4.3.8.6 1.1.9a.2.2 0 0 1 0 .4 36 36 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.2 47.2 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.7 58.7 0 0 0 17.8-9 .2.2 0 0 0 .1-.2C73.5 30.6 69.2 17 60.2 5a.2.2 0 0 0-.1-.1ZM23.7 38.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.9 7.2-6.4 7.2Zm23.7 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.9 7.2-6.4 7.2Z" fill="#5865F2"/>
            </svg>
            <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem" }}>Discord</span>
            {isConnected && (
              <div style={{ alignItems: "center", display: "flex", gap: "0.35rem", marginLeft: "auto" }}>
                <span style={{ background: "var(--fm-green)", borderRadius: "50%", display: "inline-block", height: "6px", width: "6px" }} />
                <span style={{ color: "var(--fm-green)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.08em" }}>Connected</span>
              </div>
            )}
          </div>
          <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", lineHeight: 1.5, margin: "0 0 1.1rem" }}>
            Get a daily summary of upcoming maintenance, plus a ping the day a task is due. Use the bell icon on each row in Maintenance to choose how (or if) it reminds you, then sync.
          </p>

          <div style={{ marginBottom: "1.1rem" }}>
            <label style={labelStyle} htmlFor="integ-webhook-input">Webhook URL</label>
            <div style={{ alignItems: "stretch", display: "flex", gap: "0.4rem" }}>
              <input
                id="integ-webhook-input"
                type={showWebhook ? "text" : "password"}
                value={webhook}
                onChange={e => setWebhook(e.target.value)}
                onFocus={() => setWebhookFocused(true)}
                onBlur={() => setWebhookFocused(false)}
                placeholder="https://discord.com/api/webhooks/..."
                style={{ ...inputStyle(webhookFocused), borderColor: webhookValid ? undefined : "var(--fm-red)" }}
              />
              <button
                type="button"
                onClick={() => setShowWebhook(s => !s)}
                style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.66rem", letterSpacing: "0.06em", padding: "0 0.7rem", textTransform: "uppercase", whiteSpace: "nowrap" }}
              >
                {showWebhook ? "Hide" : "Show"}
              </button>
            </div>
            {!webhookValid && (
              <p style={{ color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", lineHeight: 1.5, margin: "0.35rem 0 0" }}>
                Should start with https://discord.com/api/webhooks/
              </p>
            )}
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", lineHeight: 1.5, margin: "0.35rem 0 0" }}>
              Server Settings → Integrations → Webhooks → New Webhook → Copy URL
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: "1rem", marginBottom: "1.1rem" }}>
            <div>
              <label style={labelStyle} htmlFor="integ-hour-select">Send time</label>
              <select
                id="integ-hour-select"
                value={hour}
                onChange={e => setHour(parseInt(e.target.value, 10))}
                style={{ ...selectStyle, width: isMobile ? "100%" : "150px" }}
              >
                {REMINDER_HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle} htmlFor="integ-tz-select">Timezone</label>
              <select
                id="integ-tz-select"
                value={tz}
                onChange={e => setTz(e.target.value)}
                style={{ ...selectStyle, width: "100%" }}
              >
                {tzOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: "1.25rem" }}>
            <label style={labelStyle} htmlFor="integ-lead-input">Heads-up days</label>
            <div style={{ alignItems: "center", display: "flex", gap: "0.6rem" }}>
              <input
                id="integ-lead-input"
                type="number"
                min={0}
                max={365}
                value={leadDays}
                onChange={e => setLead(Math.max(0, Math.min(365, parseInt(e.target.value, 10) || 0)))}
                style={{ ...inputStyle(false), width: "90px" }}
              />
              <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem" }}>days before a task is due</span>
            </div>
          </div>

          {status && (
            <div style={{ background: status.ok ? "#10b98118" : "#f8717118", border: `1px solid ${status.ok ? "#10b981" : "var(--fm-red)"}`, borderRadius: "3px", color: status.ok ? "#10b981" : "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", margin: "0 0 1rem", padding: "0.55rem 0.8rem" }}>
              {status.message}
            </div>
          )}

          <div style={{ alignItems: "center", display: "flex", gap: "0.6rem", justifyContent: "space-between" }}>
            <div>
              {isConnected && (
                <button
                  onClick={handleDisconnect}
                  style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.67rem", padding: 0, transition: "color 0.12s" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                >Disconnect</button>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button
                onClick={handleTestNow}
                disabled={busy}
                style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: busy ? "var(--fm-ink-dim)" : "var(--fm-brass-dim)", cursor: busy ? "default" : "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.05em", opacity: busy ? 0.5 : 1, padding: "0.4rem 0.9rem", transition: "all 0.15s" }}
                onMouseEnter={e => { if (!busy) { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; } }}
                onMouseLeave={e => { if (!busy) { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; } }}
              >
                {busy ? "Sending…" : "Send Test"}
              </button>
              <button
                onClick={handleSync}
                disabled={busy || !webhookValid || !trimmedWebhook}
                style={{ background: (busy || !webhookValid || !trimmedWebhook) ? "transparent" : "#c9a96e22", border: `1px solid ${(busy || !webhookValid || !trimmedWebhook) ? "var(--fm-ink-dim)" : "var(--fm-brass)"}`, borderRadius: "3px", color: (busy || !webhookValid || !trimmedWebhook) ? "var(--fm-ink-dim)" : "var(--fm-brass)", cursor: (busy || !webhookValid || !trimmedWebhook) ? "default" : "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.05em", opacity: busy ? 0.5 : 1, padding: "0.4rem 1rem", transition: "all 0.15s" }}
                onMouseEnter={e => { if (!busy && webhookValid && trimmedWebhook) e.currentTarget.style.background = "#c9a96e35"; }}
                onMouseLeave={e => { if (!busy && webhookValid && trimmedWebhook) e.currentTarget.style.background = "#c9a96e22"; }}
              >
                {busy ? "Syncing…" : "Save & Sync"}
              </button>
            </div>
          </div>

          <details style={{ borderTop: "1px solid var(--fm-hairline)", marginTop: "1.25rem", paddingTop: "0.85rem" }}>
            <summary style={{ color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Connection details
            </summary>
            <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", lineHeight: 1.7, marginTop: "0.5rem" }}>
              <div>Household ID: <span style={{ color: "var(--fm-brass-dim)" }}>{getHouseholdId()}</span></div>
              <div>Last sync: <span style={{ color: "var(--fm-brass-dim)" }}>{lastSyncText}</span></div>
            </div>
          </details>
        </div>
        </div>

        {/* Gmail Bill Import (desktop app only — self-gates via window.foreman?.isElectron) */}
        <div style={{ opacity: onlineMode ? 1 : 0.45, pointerEvents: onlineMode ? "auto" : "none", transition: "opacity 0.2s" }}>
          <GmailBillsImport />
        </div>

        {/* ICS Export card */}
        <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "6px", padding: "1.1rem 1.25rem" }}>
          <div style={{ alignItems: "center", display: "flex", gap: "0.75rem", marginBottom: "0.4rem" }}>
            <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem" }}>ICS Export</span>
            <span style={{ background: "var(--fm-hairline)", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.1em", padding: "0.15rem 0.5rem", textTransform: "uppercase" }}>Coming Soon</span>
          </div>
          <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", lineHeight: 1.55, margin: 0 }}>
            Export your maintenance schedule and chore due dates as a .ics file for import into Google Calendar, Apple Calendar, Outlook, or any other calendar application.
          </p>
        </div>

        {/* Google Calendar card */}
        <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "6px", padding: "1.1rem 1.25rem" }}>
          <div style={{ alignItems: "center", display: "flex", gap: "0.75rem", marginBottom: "0.4rem" }}>
            <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem" }}>Google Calendar</span>
            <span style={{ background: "var(--fm-hairline)", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.1em", padding: "0.15rem 0.5rem", textTransform: "uppercase" }}>Coming Soon</span>
          </div>
          <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", lineHeight: 1.55, margin: 0 }}>
            Push maintenance due dates and completion reminders directly to Google Calendar so Foreman fits into the tools your household already uses.
          </p>
        </div>

        {/* Home Assistant card */}
        <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "6px", padding: "1.1rem 1.25rem" }}>
          <div style={{ alignItems: "center", display: "flex", gap: "0.75rem", marginBottom: "0.4rem" }}>
            <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem" }}>Home Assistant</span>
            <span style={{ background: "var(--fm-hairline)", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.1em", padding: "0.15rem 0.5rem", textTransform: "uppercase" }}>Coming Soon</span>
          </div>
          <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", lineHeight: 1.55, margin: 0 }}>
            Connect Foreman's maintenance and inventory data with Home Assistant's device registry and automation engine. Sensor anomalies can trigger tasks in Foreman; completing a task in Foreman can trigger automations in Home Assistant.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── HouseholdSettings ───────────────────────────────────────────────────────

function HouseholdSettings() {
  // ── Service Providers ──
  const [providers, setProvidersState]           = useState(() => loadServiceProviders());
  const [addingProvider, setAddingProvider]       = useState(false);
  const [newProviderName, setNewProviderName]     = useState("");
  const [newProviderTrade, setNewProviderTrade]   = useState("");
  const [editingProviderId, setEditingProviderId] = useState(null);
  const [editingProviderName, setEditingProviderName]   = useState("");
  const [editingProviderTrade, setEditingProviderTrade] = useState("");
  const [hoveredProviderId, setHoveredProviderId] = useState(null);
  const [confirmDeleteProviderId, setConfirmDeleteProviderId] = useState(null);
  const [newProviderNameFocused, setNewProviderNameFocused]   = useState(false);
  const [newProviderTradeFocused, setNewProviderTradeFocused] = useState(false);
  const [editProviderNameFocused, setEditProviderNameFocused]   = useState(false);
  const [editProviderTradeFocused, setEditProviderTradeFocused] = useState(false);

  function persistProviders(next) { setProvidersState(next); saveServiceProviders(next); }

  function handleAddProvider() {
    const name = newProviderName.trim();
    if (!name) return;
    persistProviders([...providers, { id: `sp-${Date.now()}`, name, trade: newProviderTrade.trim() }]);
    setNewProviderName("");
    setNewProviderTrade("");
    setAddingProvider(false);
  }

  function handleCommitProviderEdit() {
    const name = editingProviderName.trim();
    if (name) persistProviders(providers.map(p => p.id === editingProviderId ? { ...p, name, trade: editingProviderTrade.trim() } : p));
    setEditingProviderId(null);
  }

  function handleDeleteProvider(id) {
    persistProviders(providers.filter(p => p.id !== id));
    setConfirmDeleteProviderId(null);
  }

  // ── Members ──
  const [members, setMembersState]     = useState(() => loadMembers());
  const [addingMember, setAddingMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editingMemberValue, setEditingMemberValue] = useState("");
  const [hoveredMemberId, setHoveredMemberId]   = useState(null);
  const [confirmDeleteId, setConfirmDeleteId]   = useState(null);
  const [newMemberFocused, setNewMemberFocused] = useState(false);
  const [editMemberFocused, setEditMemberFocused] = useState(false);

  function persist(next) { setMembersState(next); saveMembers(next); }

  function handleAddMember() {
    const name = newMemberName.trim();
    if (!name) return;
    persist([...members, { id: `m-${Date.now()}`, name }]);
    setNewMemberName("");
    setAddingMember(false);
  }

  function handleCommitRename() {
    const name = editingMemberValue.trim();
    if (name) persist(members.map(m => m.id === editingMemberId ? { ...m, name } : m));
    setEditingMemberId(null);
  }

  function handleDeleteMember(id) {
    persist(members.filter(m => m.id !== id));
    setConfirmDeleteId(null);
  }

  return (
    <div style={{ maxWidth: "560px" }}>
      <h2 style={{ color: "var(--fm-ink)", borderBottom: "var(--fm-border)", fontFamily: "var(--fm-serif)", fontSize: "1.25rem", fontWeight: 400, margin: "0 0 1.25rem", paddingBottom: "0.6rem" }}>People</h2>
      <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", margin: "0 0 2.25rem" }}>
        Residents and the service providers who have worked on this home.
      </p>

      {/* ── Members ── */}
      <div>
        <div style={subheadStyle}>Household Members</div>
        <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", lineHeight: 1.5, margin: "0 0 0.85rem" }}>
          People who live in this home. Double-click a name to edit it.
        </p>

        <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "6px", overflow: "hidden" }}>
          {members.length === 0 && !addingMember && (
            <div style={{ color: "#4a4458", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "1.25rem 1rem", textAlign: "center" }}>
              No members added yet
            </div>
          )}

          {members.map((member, idx) => (
            <div key={member.id}>
              {/* Delete confirmation inline */}
              {confirmDeleteId === member.id ? (
                <div style={{ alignItems: "center", background: "#1a1218", borderBottom: idx < members.length - 1 || addingMember ? "1px solid var(--fm-hairline)" : "none", display: "flex", gap: "0.75rem", padding: "0.6rem 1rem" }}>
                  <span style={{ color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", flex: 1 }}>
                    Remove {member.name}?
                  </span>
                  <button
                    onClick={() => handleDeleteMember(member.id)}
                    style={{ background: "transparent", border: "none", color: "var(--fm-red)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", padding: "0.15rem 0.3rem", transition: "color 0.12s" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#fca5a5"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--fm-red)"}
                  >Remove</button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", padding: "0.15rem 0.3rem", transition: "color 0.12s" }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                  >Cancel</button>
                </div>
              ) : editingMemberId === member.id ? (
                <div style={{ alignItems: "center", background: "#161920", borderBottom: idx < members.length - 1 || addingMember ? "1px solid var(--fm-hairline)" : "none", display: "flex", gap: "0.5rem", padding: "0.45rem 1rem" }}>
                  <input
                    autoFocus
                    value={editingMemberValue}
                    onChange={e => setEditingMemberValue(e.target.value)}
                    onFocus={() => setEditMemberFocused(true)}
                    onBlur={() => { setEditMemberFocused(false); handleCommitRename(); }}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); handleCommitRename(); }
                      if (e.key === "Escape") { e.preventDefault(); setEditingMemberId(null); }
                    }}
                    style={{ ...inputStyle(editMemberFocused), flex: 1, padding: "0.25rem 0.5rem" }}
                  />
                </div>
              ) : (
                <div
                  onMouseEnter={() => setHoveredMemberId(member.id)}
                  onMouseLeave={() => setHoveredMemberId(null)}
                  onDoubleClick={() => { setEditingMemberId(member.id); setEditingMemberValue(member.name); }}
                  style={{ alignItems: "center", background: idx % 2 === 0 ? "var(--fm-bg-raised)" : "#161920", borderBottom: idx < members.length - 1 || addingMember ? "1px solid var(--fm-hairline)" : "none", cursor: "default", display: "flex", gap: "0.75rem", padding: "0.6rem 1rem", userSelect: "none" }}
                >
                  <div style={{ alignItems: "center", background: "var(--fm-hairline)", borderRadius: "50%", color: "var(--fm-ink-dim)", display: "flex", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.62rem", height: "24px", justifyContent: "center", width: "24px" }}>
                    {member.name.slice(0, 1).toUpperCase()}
                  </div>
                  <span style={{ color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-mono)", fontSize: "0.78rem" }}>
                    {member.name}
                  </span>
                  {hoveredMemberId === member.id && (
                    <button
                      onClick={() => setConfirmDeleteId(member.id)}
                      style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.85rem", lineHeight: 1, padding: "0.1rem 0.2rem", transition: "color 0.12s" }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                    >×</button>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Add member row */}
          {addingMember ? (
            <div style={{ alignItems: "center", borderTop: members.length > 0 ? "1px solid var(--fm-hairline)" : "none", display: "flex", gap: "0.5rem", padding: "0.45rem 1rem" }}>
              <input
                autoFocus
                value={newMemberName}
                placeholder="Name"
                onChange={e => setNewMemberName(e.target.value)}
                onFocus={() => setNewMemberFocused(true)}
                onBlur={() => setNewMemberFocused(false)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); handleAddMember(); }
                  if (e.key === "Escape") { e.preventDefault(); setAddingMember(false); setNewMemberName(""); }
                }}
                style={{ ...inputStyle(newMemberFocused), flex: 1, padding: "0.25rem 0.5rem" }}
              />
              <button
                onClick={handleAddMember}
                disabled={!newMemberName.trim()}
                style={{ background: newMemberName.trim() ? "#c9a96e22" : "transparent", border: `1px solid ${newMemberName.trim() ? "var(--fm-brass)" : "var(--fm-ink-dim)"}`, borderRadius: "3px", color: newMemberName.trim() ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: newMemberName.trim() ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.3rem 0.65rem", transition: "all 0.15s", whiteSpace: "nowrap" }}
              >Add</button>
              <button
                onClick={() => { setAddingMember(false); setNewMemberName(""); }}
                style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.85rem", lineHeight: 1, padding: "0.1rem 0.2rem", transition: "color 0.12s" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
              >×</button>
            </div>
          ) : (
            <div style={{ borderTop: members.length > 0 ? "1px solid var(--fm-hairline)" : "none", padding: "0.45rem 1rem" }}>
              <button
                onClick={() => setAddingMember(true)}
                style={{ background: "none", border: "none", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.05em", padding: "0.2rem 0", transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--fm-brass-dim)"}
              >+ Add Member</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Service Providers ── */}
      <div style={{ marginTop: "2.5rem" }}>
        <div style={subheadStyle}>Service Providers</div>
        <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", lineHeight: 1.5, margin: "0 0 0.85rem" }}>
          Contractors, tradespeople, and vendors who have worked on this home. Double-click a row to edit.
        </p>

        <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "6px", overflow: "hidden" }}>
          {providers.length === 0 && !addingProvider && (
            <div style={{ color: "#4a4458", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "1.25rem 1rem", textAlign: "center" }}>
              No service providers added yet
            </div>
          )}

          {providers.map((provider, idx) => (
            <div key={provider.id}>
              {confirmDeleteProviderId === provider.id ? (
                <div style={{ alignItems: "center", background: "#1a1218", borderBottom: idx < providers.length - 1 || addingProvider ? "1px solid var(--fm-hairline)" : "none", display: "flex", gap: "0.75rem", padding: "0.6rem 1rem" }}>
                  <span style={{ color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", flex: 1 }}>
                    Remove {provider.name}?
                  </span>
                  <button
                    onClick={() => handleDeleteProvider(provider.id)}
                    style={{ background: "transparent", border: "none", color: "var(--fm-red)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", padding: "0.15rem 0.3rem", transition: "color 0.12s" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#fca5a5"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--fm-red)"}
                  >Remove</button>
                  <button
                    onClick={() => setConfirmDeleteProviderId(null)}
                    style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", padding: "0.15rem 0.3rem", transition: "color 0.12s" }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                  >Cancel</button>
                </div>
              ) : editingProviderId === provider.id ? (
                <div style={{ alignItems: "center", background: "#161920", borderBottom: idx < providers.length - 1 || addingProvider ? "1px solid var(--fm-hairline)" : "none", display: "flex", gap: "0.5rem", padding: "0.45rem 1rem" }}>
                  <input
                    autoFocus
                    value={editingProviderName}
                    placeholder="Name"
                    onChange={e => setEditingProviderName(e.target.value)}
                    onFocus={() => setEditProviderNameFocused(true)}
                    onBlur={() => setEditProviderNameFocused(false)}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); handleCommitProviderEdit(); }
                      if (e.key === "Escape") { e.preventDefault(); setEditingProviderId(null); }
                    }}
                    style={{ ...inputStyle(editProviderNameFocused), flex: 1, padding: "0.25rem 0.5rem" }}
                  />
                  <input
                    value={editingProviderTrade}
                    placeholder="Trade / specialty"
                    onChange={e => setEditingProviderTrade(e.target.value)}
                    onFocus={() => setEditProviderTradeFocused(true)}
                    onBlur={() => { setEditProviderTradeFocused(false); handleCommitProviderEdit(); }}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); handleCommitProviderEdit(); }
                      if (e.key === "Escape") { e.preventDefault(); setEditingProviderId(null); }
                    }}
                    style={{ ...inputStyle(editProviderTradeFocused), flex: 1, padding: "0.25rem 0.5rem" }}
                  />
                </div>
              ) : (
                <div
                  onMouseEnter={() => setHoveredProviderId(provider.id)}
                  onMouseLeave={() => setHoveredProviderId(null)}
                  onDoubleClick={() => { setEditingProviderId(provider.id); setEditingProviderName(provider.name); setEditingProviderTrade(provider.trade ?? ""); }}
                  style={{ alignItems: "center", background: idx % 2 === 0 ? "var(--fm-bg-raised)" : "#161920", borderBottom: idx < providers.length - 1 || addingProvider ? "1px solid var(--fm-hairline)" : "none", cursor: "default", display: "flex", gap: "0.75rem", padding: "0.6rem 1rem", userSelect: "none" }}
                >
                  <div style={{ alignItems: "center", background: "var(--fm-hairline)", borderRadius: "50%", color: "var(--fm-ink-dim)", display: "flex", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.62rem", height: "24px", justifyContent: "center", width: "24px" }}>
                    {provider.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {provider.name}
                    </div>
                    {provider.trade && (
                      <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.04em", marginTop: "0.1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {provider.trade}
                      </div>
                    )}
                  </div>
                  {hoveredProviderId === provider.id && (
                    <button
                      onClick={() => setConfirmDeleteProviderId(provider.id)}
                      style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.85rem", lineHeight: 1, padding: "0.1rem 0.2rem", transition: "color 0.12s" }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                    >×</button>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Add provider row */}
          {addingProvider ? (
            <div style={{ alignItems: "center", borderTop: providers.length > 0 ? "1px solid var(--fm-hairline)" : "none", display: "flex", gap: "0.5rem", padding: "0.45rem 1rem" }}>
              <input
                autoFocus
                value={newProviderName}
                placeholder="Name"
                onChange={e => setNewProviderName(e.target.value)}
                onFocus={() => setNewProviderNameFocused(true)}
                onBlur={() => setNewProviderNameFocused(false)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); handleAddProvider(); }
                  if (e.key === "Escape") { e.preventDefault(); setAddingProvider(false); setNewProviderName(""); setNewProviderTrade(""); }
                }}
                style={{ ...inputStyle(newProviderNameFocused), flex: 1, padding: "0.25rem 0.5rem" }}
              />
              <input
                value={newProviderTrade}
                placeholder="Trade / specialty"
                onChange={e => setNewProviderTrade(e.target.value)}
                onFocus={() => setNewProviderTradeFocused(true)}
                onBlur={() => setNewProviderTradeFocused(false)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); handleAddProvider(); }
                  if (e.key === "Escape") { e.preventDefault(); setAddingProvider(false); setNewProviderName(""); setNewProviderTrade(""); }
                }}
                style={{ ...inputStyle(newProviderTradeFocused), flex: 1, padding: "0.25rem 0.5rem" }}
              />
              <button
                onClick={handleAddProvider}
                disabled={!newProviderName.trim()}
                style={{ background: newProviderName.trim() ? "#c9a96e22" : "transparent", border: `1px solid ${newProviderName.trim() ? "var(--fm-brass)" : "var(--fm-ink-dim)"}`, borderRadius: "3px", color: newProviderName.trim() ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: newProviderName.trim() ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.3rem 0.65rem", transition: "all 0.15s", whiteSpace: "nowrap" }}
              >Add</button>
              <button
                onClick={() => { setAddingProvider(false); setNewProviderName(""); setNewProviderTrade(""); }}
                style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.85rem", lineHeight: 1, padding: "0.1rem 0.2rem", transition: "color 0.12s" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
              >×</button>
            </div>
          ) : (
            <div style={{ borderTop: providers.length > 0 ? "1px solid var(--fm-hairline)" : "none", padding: "0.45rem 1rem" }}>
              <button
                onClick={() => setAddingProvider(true)}
                style={{ background: "none", border: "none", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.05em", padding: "0.2rem 0", transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--fm-brass-dim)"}
              >+ Add Provider</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ImportExportSettings (was UploadInspectionSettings) ──────────────────────

function ImportExportSettings() {
  // ── Profile backup export / import ──
  const [activeProfile]   = useState(() => loadActiveProfile());
  const [allProfiles]     = useState(() => getAllProfiles());
  const activeMeta        = allProfiles.find(p => p.key === activeProfile);
  const [exportTarget, setExportTarget] = useState(activeProfile);
  const exportHasData     = hasProfileSnapshot(exportTarget);
  const jsonFileInputRef  = useRef(null);
  const [importFile, setImportFile]     = useState(null);
  const [importTarget, setImportTarget] = useState(activeProfile);
  const [importing, setImporting]       = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const importTargetMeta  = allProfiles.find(p => p.key === importTarget);

  function handleJsonFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (!parsed?._foreman || parsed.version !== 1) { setImportFile("error"); return; }
        setImportFile({ name: file.name, data: parsed });
        setImportSuccess(false);
      } catch {
        setImportFile("error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function pickImportFile() {
    setImportFile(null);
    if (window.foreman?.showOpenDialog) {
      // Electron: native open dialog
      const { canceled, filePaths } = await window.foreman.showOpenDialog({
        filters: [{ name: "Foreman Backup", extensions: ["json"] }],
        properties: ["openFile"],
      });
      if (canceled || !filePaths?.length) return;
      const filePath = filePaths[0];
      const fileName = filePath.split(/[\\/]/).pop();
      try {
        const text = await window.foreman.readFile(filePath);
        const parsed = JSON.parse(text);
        if (!parsed?._foreman || parsed.version !== 1) { setImportFile("error"); return; }
        setImportFile({ name: fileName, data: parsed });
        setImportSuccess(false);
      } catch {
        setImportFile("error");
      }
    } else {
      // Browser: hidden file input
      jsonFileInputRef.current?.click();
    }
  }

  function handleProfileImport() {
    if (!importFile || importFile === "error") return;
    setImporting(true);
    const err = importProfileData(importFile.data, importTarget);
    if (err) {
      setImportFile("error");
      setImporting(false);
    } else if (importTarget !== activeProfile) {
      setImportFile(null);
      setImporting(false);
      setImportSuccess(true);
    }
  }

  function handleCancelImport() {
    setImportFile(null);
    setImporting(false);
    setImportTarget(activeProfile);
  }

  // ── Inspection upload ──
  const onlineMode = storageGet("foreman-online-mode") === true;
  const fileInputRef = useRef(null);

  const [meta, setMeta] = useState(() => storageGet(INSPECTION_META_KEY) ?? null);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState("idle"); // "idle"|"extracting"|"calling"|"review"|"success"
  const [extractedData, setExtractedData] = useState(null);
  const [progress, setProgress] = useState({ chunk: 0, total: 0 });
  const [importSummary, setImportSummary] = useState(null);
  const [processError, setProcessError] = useState(null);

  const { reviewCategories, reviewCategoryItems, reviewProjects } = (() => {
    const rows = loadCustomData();
    const deletedCats = loadDeletedCategories();
    const deletedItems = loadDeletedItems();
    const map = {};
    rows.forEach(row => {
      if (deletedCats.has(row.category)) return;
      if (row._isBlankCategory || !row.category || !row.item) return;
      if (deletedItems.has(`${row.category}|${row.item}`)) return;
      if (!map[row.category]) map[row.category] = [];
      if (!map[row.category].includes(row.item)) map[row.category].push(row.item);
    });
    return {
      reviewCategories: Object.keys(map),
      reviewCategoryItems: map,
      reviewProjects: loadProjects(),
    };
  })();

  function saveMeta(m) {
    setMeta(m);
    if (m) storageSet(INSPECTION_META_KEY, m);
    else storageDel(INSPECTION_META_KEY);
  }

  function handleFile(f) {
    if (!f || f.type !== "application/pdf") return;
    setFile(f);
    setPhase("idle");
    setProcessError(null);
    setImportSummary(null);
    saveMeta({ name: f.name, sizeMb: (f.size / 1024 / 1024).toFixed(1), uploadedAt: new Date().toISOString() });
  }

  function handleInputChange(e) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  function handleRemove() {
    setFile(null);
    setPhase("idle");
    setProcessError(null);
    setImportSummary(null);
    saveMeta(null);
  }

  async function handleProcess() {
    if (!file) return;
    const apiKey = loadGroqApiKey();
    if (!apiKey) { setProcessError("Groq API key not configured. Add one in Preferences → Integrations."); return; }

    setProcessError(null);
    setPhase("extracting");
    let pages;
    try {
      pages = await extractPdfText(file);
    } catch (err) {
      setProcessError(`Failed to read PDF: ${err.message}`);
      setPhase("idle");
      return;
    }

    const chunks = chunkPageTexts(pages);
    setProgress({ chunk: 0, total: chunks.length });
    setPhase("calling");

    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      setProgress({ chunk: i + 1, total: chunks.length });
      try {
        results.push(await extractChunk(chunks[i], apiKey));
      } catch (err) {
        const msg = err?.message || String(err);
        // Rate limit or auth error — stop immediately and tell the user
        if (msg.includes("429") || msg.includes("401") || msg.includes("403")) {
          setProcessError(`Groq API error: ${msg}`);
          setPhase("idle");
          return;
        }
        // Other errors (timeout, parse failure) — skip chunk but continue
        results.push({ appliances: [], todos: [], projects: [] });
      }
    }

    const merged = mergeResults(results);

    // Render only the pages Groq identified as containing findings
    const neededPages = new Set();
    [...merged.todos, ...merged.projects].forEach(item => {
      (item.sourcePages || []).forEach(p => neededPages.add(p));
    });

    const renderedPages = await renderSpecificPages(file, [...neededPages]);

    const pageImageIds = new Map();
    for (const [pageNum, dataUrl] of renderedPages) {
      const id = storeImageFromDataUrl(dataUrl, `inspection-p${pageNum}.jpg`);
      pageImageIds.set(pageNum, [id]);
    }

    setExtractedData(associateImages(merged, pageImageIds));
    setPhase("review");
  }

  function handleImport(selected) {
    // Appliances → custom inventory rows + field values
    const customRows = loadCustomData();
    const existingKeys = new Set(customRows.map(r => `${r.category}|${r.item}`));
    const newRows = [];
    const cfValues = loadItemFieldValues();

    selected.appliances.forEach(a => {
      const resolved = resolveAppliance(a);
      const catKey = `${resolved.category}|`;
      const itemKey = `${resolved.category}|${resolved.item}`;

      if (!existingKeys.has(catKey) && !customRows.some(r => r.category === resolved.category && r._isBlankCategory)) {
        newRows.push({ _id: `insp-cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, _isCustom: true, _isBlankCategory: true, category: resolved.category, item: "", task: "", schedule: "", season: null, categoryType: "system" });
      }
      if (!existingKeys.has(itemKey)) {
        newRows.push({ _id: `insp-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, _isCustom: true, category: resolved.category, item: resolved.item, task: "", schedule: "", season: null, categoryType: "system" });
        existingKeys.add(itemKey);
      }

      const cfKey = `${resolved.category}|${resolved.item}`;
      cfValues[cfKey] = {
        ...(cfValues[cfKey] || {}),
        ...(a.manufacturer ? { manufacturer: a.manufacturer } : {}),
        ...(a.model        ? { model: a.model }               : {}),
        ...(a.age          ? { age_note: a.age }               : {}),
      };
    });

    if (newRows.length > 0) saveCustomData([...customRows, ...newRows]);
    saveItemFieldValues(cfValues);
    useForemanStore.getState().reloadAll();

    // Category type overrides for new categories
    if (selected.appliances.length > 0) {
      const overrides = loadCategoryTypeOverrides();
      const updated = { ...overrides };
      const defaultCatTypes = {};
      defaultData.forEach(r => { if (r.category && r.categoryType) defaultCatTypes[r.category] = r.categoryType; });
      selected.appliances.forEach(a => {
        const resolved = resolveAppliance(a);
        if (!updated[resolved.category]) {
          updated[resolved.category] = defaultCatTypes[resolved.category] || "system";
        }
      });
      saveCategoryTypeOverrides(updated);
    }

    // To Dos
    if (selected.todos.length > 0) {
      const newTodos = selected.todos.map(t => createTodo({
        title: t.title,
        description: t.description || "",
        priority: t.priority,
        status: "not-started",
        linkedCategory: t.linkedCategory || null,
        linkedItem: t.linkedItem || null,
        labels: t.labels || [],
      }));
      saveTodos([...loadTodos(), ...newTodos]);
    }

    // Projects
    if (selected.projects.length > 0) {
      const newProjects = selected.projects.map(p => ({
        ...createProject({ name: p.name, linkedCategory: p.linkedCategory || null, linkedItem: p.linkedItem || null }),
        description: p.description || "",
        priority: p.priority || "medium",
        status: "not-started",
      }));
      saveProjects([...loadProjects(), ...newProjects]);
    }

    setImportSummary({
      appliances: selected.appliances.length,
      todos: selected.todos.length,
      projects: selected.projects.length,
    });
    setPhase("success");
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const hasFile = !!file;
  const hasMeta = !!meta;
  const needsReupload = hasMeta && !hasFile;

  return (
    <div style={{ maxWidth: "560px" }}>
      {phase === "review" && extractedData && createPortal(
        <InspectionReview
          data={extractedData}
          categories={reviewCategories}
          categoryItems={reviewCategoryItems}
          allProjects={reviewProjects}
          onImport={handleImport}
          onCancel={() => setPhase("idle")}
        />,
        document.body
      )}

      <h2 style={{ color: "var(--fm-ink)", borderBottom: "var(--fm-border)", fontFamily: "var(--fm-serif)", fontSize: "1.25rem", fontWeight: 400, margin: "0 0 1.25rem", paddingBottom: "0.6rem" }}>Import / Export</h2>

      {/* ── Export ── */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={subheadStyle}>Export</div>
        <p style={bodyTextStyle}>
          Download a profile's data as a JSON backup file. Store it somewhere safe — it can be used to restore your data at any time.
        </p>
        <div style={{ alignItems: "flex-end", display: "flex", gap: "0.6rem" }}>
          <div>
            <label style={labelStyle}>Profile</label>
            <select value={exportTarget} onChange={e => setExportTarget(e.target.value)} style={selectStyle}>
              {allProfiles.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <button
            onClick={() => exportProfile(exportTarget)}
            disabled={!exportHasData}
            style={{
              background: exportHasData ? "var(--fm-bg-panel)" : "transparent",
              border: `1px solid ${exportHasData ? "var(--fm-ink-dim)" : "var(--fm-hairline)"}`,
              borderRadius: "3px",
              color: exportHasData ? "var(--fm-brass-dim)" : "var(--fm-ink-dim)",
              cursor: exportHasData ? "pointer" : "default",
              fontFamily: "var(--fm-mono)", fontSize: "0.75rem",
              letterSpacing: "0.05em", padding: "0.5rem 1.1rem", transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (exportHasData) { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; } }}
            onMouseLeave={e => { if (exportHasData) { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; } }}
          >
            Download
          </button>
        </div>
        {!exportHasData && (
          <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.67rem", margin: "0.5rem 0 0" }}>
            No data saved for this profile yet. Switch to it first to generate data.
          </p>
        )}
      </div>

      {/* ── Import (JSON backup) ── */}
      <div style={{ marginBottom: "2.5rem" }}>
        <div style={subheadStyle}>Import</div>
        <p style={bodyTextStyle}>
          Restore from a previously exported backup file. Choose which profile slot to load the data into.
        </p>

        {importSuccess && (
          <div style={{ alignItems: "center", background: "#4ade8010", border: "1px solid #4ade8030", borderRadius: "4px", display: "flex", gap: "0.5rem", marginBottom: "0.9rem", padding: "0.6rem 0.85rem" }}>
            <span style={{ color: "var(--fm-green)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem" }}>Import complete — data saved to {importTargetMeta?.label}.</span>
            <button onClick={() => setImportSuccess(false)} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", marginLeft: "auto", padding: 0 }}>×</button>
          </div>
        )}

        {!importFile ? (
          <button
            onClick={pickImportFile}
            style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", letterSpacing: "0.05em", padding: "0.5rem 1.1rem", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
          >
            Choose File…
          </button>
        ) : importFile === "error" ? (
          <div style={{ background: "#f8717110", border: "1px solid #f8717130", borderRadius: "4px", padding: "0.75rem 1rem" }}>
            <div style={{ color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", marginBottom: "0.5rem" }}>
              Invalid file — make sure you're importing a Foreman backup.
            </div>
            <button
              onClick={pickImportFile}
              style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.67rem", padding: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass-dim)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
            >
              Try again
            </button>
          </div>
        ) : (
          <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "4px", padding: "0.9rem 1rem" }}>
            <div style={{ alignItems: "baseline", display: "flex", gap: "0.5rem", marginBottom: "0.9rem" }}>
              <span style={{ color: "var(--fm-green)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem" }}>✓</span>
              <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem" }}>{importFile.name}</span>
              {importFile.data.label && (
                <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem" }}>· from {importFile.data.label}</span>
              )}
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={labelStyle}>Load into</label>
              <select value={importTarget} onChange={e => setImportTarget(e.target.value)} style={selectStyle}>
                {allProfiles.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", lineHeight: 1.5, margin: "0 0 0.85rem" }}>
              {importTarget === activeProfile
                ? `This will replace all current ${activeMeta?.label} data. The page will reload.`
                : `This will replace the saved ${importTargetMeta?.label} snapshot. No reload needed.`
              }
            </p>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button
                onClick={handleProfileImport} disabled={importing}
                style={{ background: importing ? "transparent" : "#c9a96e22", border: `1px solid ${importing ? "var(--fm-ink-dim)" : "var(--fm-brass)"}`, borderRadius: "3px", color: importing ? "var(--fm-ink-dim)" : "var(--fm-brass)", cursor: importing ? "default" : "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", letterSpacing: "0.05em", padding: "0.45rem 1.1rem", transition: "all 0.15s" }}
                onMouseEnter={e => { if (!importing) e.currentTarget.style.background = "#c9a96e35"; }}
                onMouseLeave={e => { if (!importing) e.currentTarget.style.background = "#c9a96e22"; }}
              >
                {importing ? "Importing…" : `Import into ${importTargetMeta?.label}`}
              </button>
              <button
                onClick={handleCancelImport} disabled={importing}
                style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-ink-dim)", cursor: importing ? "default" : "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "0.45rem 1rem", transition: "all 0.15s" }}
                onMouseEnter={e => { if (!importing) { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; } }}
                onMouseLeave={e => { if (!importing) { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; } }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <input ref={jsonFileInputRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleJsonFileSelect} />
      </div>

      <div style={{ borderTop: "1px solid var(--fm-hairline)", margin: "0 0 2rem" }} />

      <div style={subheadStyle}>Upload Inspection</div>
      <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", margin: "0 0 2rem" }}>
        Upload a PDF copy of your home inspection report. Foreman will extract appliances, to dos, and projects for your review before adding anything to your profile.
      </p>

      {!onlineMode ? (
        <div style={{ alignItems: "center", background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "6px", display: "flex", gap: "0.85rem", padding: "1.25rem 1.5rem" }}>
          <span style={{ color: "var(--fm-ink-mute)", fontSize: "1.25rem" }}>○</span>
          <div>
            <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Online Mode required</div>
            <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", lineHeight: 1.5 }}>
              AI Inspection uses an external AI service to analyze your report. Enable Online Mode in{" "}
              <span
                style={{ color: "var(--fm-brass)", cursor: "pointer", textDecoration: "underline" }}
                onClick={() => {}}
              >Integrations</span>{" "}
              to use this feature.
            </div>
          </div>
        </div>
      ) : hasFile ? (
        /* ── File loaded ── */
        <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "6px", padding: "1.25rem" }}>
          <div style={{ alignItems: "flex-start", display: "flex", gap: "0.75rem" }}>
            <div style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "4px", flexShrink: 0, padding: "0.5rem 0.6rem" }}>
              <svg width="20" height="24" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 1H3a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8l-7-7Z" stroke="var(--fm-ink-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 1v7h7" stroke="var(--fm-ink-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <text x="3.5" y="19" fill="var(--fm-brass)" fontFamily="monospace" fontSize="5.5" fontWeight="600" letterSpacing="0.05em">PDF</text>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.78rem", marginBottom: "0.15rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {meta.name}
              </div>
              <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>
                {meta.sizeMb} MB · Uploaded {formatDate(meta.uploadedAt)}
              </div>
            </div>
            {phase === "idle" || phase === "success" ? (
              <button
                onClick={handleRemove}
                title="Remove"
                style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.85rem", lineHeight: 1, padding: "0.1rem 0.2rem", transition: "color 0.12s" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
              >×</button>
            ) : null}
          </div>

          {/* Phase-specific content below the file card */}
          {phase === "idle" && (
            <div style={{ marginTop: "1rem" }}>
              {processError && (
                <div style={{ background: "#f8717118", border: "1px solid #f8717140", borderRadius: "4px", color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", marginBottom: "0.75rem", padding: "0.6rem 0.85rem" }}>
                  {processError}
                </div>
              )}
              <button
                onClick={handleProcess}
                style={{ background: "#c9a96e18", border: "1px solid #c9a96e", borderRadius: "3px", color: "var(--fm-brass)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.1em", padding: "0.55rem 1.5rem", textTransform: "uppercase", transition: "all 0.15s", width: "100%" }}
                onMouseEnter={e => e.currentTarget.style.background = "#c9a96e28"}
                onMouseLeave={e => e.currentTarget.style.background = "#c9a96e18"}
              >
                Process Report →
              </button>
            </div>
          )}

          {(phase === "extracting" || phase === "calling") && (
            <div style={{ alignItems: "center", background: "var(--fm-bg)", border: "1px solid var(--fm-hairline)", borderRadius: "4px", display: "flex", gap: "0.5rem", marginTop: "1rem", padding: "0.65rem 0.85rem" }}>
              <span style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem" }}>
                {phase === "extracting"
                  ? "Reading PDF…"
                  : `Analyzing with AI… (chunk ${progress.chunk} of ${progress.total})`}
              </span>
            </div>
          )}

          {phase === "success" && importSummary && (
            <div style={{ background: "#4ade8012", border: "1px solid #4ade8030", borderRadius: "4px", marginTop: "1rem", padding: "0.75rem 1rem" }}>
              <div style={{ color: "var(--fm-green)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", letterSpacing: "0.06em", marginBottom: "0.35rem", textTransform: "uppercase" }}>
                Import complete
              </div>
              <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem" }}>
                Added {importSummary.appliances} {importSummary.appliances === 1 ? "appliance" : "appliances"}, {importSummary.todos} {importSummary.todos === 1 ? "to do" : "to dos"}, and {importSummary.projects} {importSummary.projects === 1 ? "project" : "projects"} to your profile.
              </div>
              <button
                onClick={() => { setPhase("idle"); setImportSummary(null); }}
                style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", marginTop: "0.5rem", padding: 0, transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
              >
                Process another report
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ── Upload area ── */
        <>
          {needsReupload && (
            <div style={{ alignItems: "center", background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "4px", display: "flex", gap: "0.5rem", marginBottom: "1rem", padding: "0.65rem 0.85rem" }}>
              <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem" }}>
                Previously uploaded: <strong style={{ color: "var(--fm-ink)" }}>{meta.name}</strong> on {formatDate(meta.uploadedAt)} · Re-upload to continue.
              </span>
              <button
                onClick={handleRemove}
                style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.72rem", marginLeft: "auto", padding: 0, transition: "color 0.12s" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
              >Clear</button>
            </div>
          )}

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{
              alignItems: "center",
              background: dragOver ? "#1a2035" : "var(--fm-bg-raised)",
              border: `2px dashed ${dragOver ? "var(--fm-brass)" : "var(--fm-hairline2)"}`,
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              padding: "2.5rem 1.5rem",
              textAlign: "center",
              transition: "all 0.15s",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={dragOver ? "var(--fm-brass)" : "#4a4458"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.15s" }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <div>
              <div style={{ color: dragOver ? "var(--fm-brass)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.78rem", marginBottom: "0.3rem", transition: "color 0.15s" }}>
                Drop your inspection PDF here
              </div>
              <div style={{ color: "#4a4458", fontFamily: "var(--fm-mono)", fontSize: "0.65rem" }}>
                or click to browse
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: "none" }}
            onChange={handleInputChange}
          />
        </>
      )}
    </div>
  );
}

// ─── CategoryTypesSettings ───────────────────────────────────────────────────

function TypeNode({ type, data, depth, onRename, onDelete, onAddSubtype }) {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(type.label);
  const [addingChild, setAddingChild] = useState(false);
  const [childLabel, setChildLabel] = useState("");
  const children = getSubtypes(type.id, data);
  const behaviorClass = getBehaviorClass(type.id, data);
  const classColor = behaviorClass === "spatial" ? "var(--fm-cyan)" : "var(--fm-amber)";

  function commitRename() {
    const trimmed = editLabel.trim();
    if (trimmed && trimmed !== type.label) onRename(type.id, trimmed);
    setEditing(false);
  }

  function commitAddChild() {
    const trimmed = childLabel.trim();
    if (trimmed) onAddSubtype(type.id, trimmed);
    setAddingChild(false);
    setChildLabel("");
  }

  return (
    <div style={{ marginLeft: depth > 0 ? "1.25rem" : 0 }}>
      <div style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", gap: "0.5rem", padding: "0.45rem 0" }}>
        {/* Indent line */}
        {depth > 0 && <span style={{ color: "var(--fm-hairline2)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem" }}>└</span>}
        {/* Label / edit input */}
        {editing ? (
          <input
            autoFocus
            value={editLabel}
            onChange={e => setEditLabel(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditing(false); setEditLabel(type.label); } }}
            onBlur={commitRename}
            style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 3, color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.78rem", outline: "none", padding: "0.15rem 0.4rem" }}
          />
        ) : (
          <span style={{ color: classColor, flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.78rem" }}>{type.label}</span>
        )}
        {/* Built-in badge */}
        {type.builtIn && (
          <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.08em" }}>built-in</span>
        )}
        {/* Actions */}
        {!editing && (
          <div style={{ display: "flex", flexShrink: 0, gap: "0.35rem" }}>
            <button
              onClick={() => { setEditing(true); setEditLabel(type.label); }}
              style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", padding: "0 0.2rem", transition: "color 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
              title="Rename"
            >✎</button>
            <button
              onClick={() => setAddingChild(true)}
              style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0 0.2rem", transition: "color 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
              title="Add subtype"
            >+</button>
            {!type.builtIn && (
              <button
                onClick={() => onDelete(type.id)}
                style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0 0.2rem", transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                title="Delete"
              >×</button>
            )}
          </div>
        )}
      </div>

      {/* Add subtype input */}
      {addingChild && (
        <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", marginLeft: depth > 0 ? "1.25rem" : "0", padding: "0.3rem 0" }}>
          <span style={{ color: "var(--fm-hairline2)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem" }}>└</span>
          <input
            autoFocus
            value={childLabel}
            onChange={e => setChildLabel(e.target.value)}
            placeholder="New subtype name"
            onKeyDown={e => { if (e.key === "Enter") commitAddChild(); if (e.key === "Escape") { setAddingChild(false); setChildLabel(""); } }}
            onBlur={commitAddChild}
            style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 3, color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.78rem", outline: "none", padding: "0.15rem 0.4rem" }}
          />
        </div>
      )}

      {/* Children */}
      {children.map(child => (
        <TypeNode key={child.id} type={child} data={data} depth={depth + 1}
          onRename={onRename} onDelete={onDelete} onAddSubtype={onAddSubtype} />
      ))}
    </div>
  );
}

function CategoryTypesSettings() {
  const [data, setData] = useState(() => loadEntityTypes());
  const [addingClass, setAddingClass] = useState(null); // "spatial" | "functional" | null
  const [newLabel, setNewLabel] = useState("");

  function refresh() { const d = loadEntityTypes(); setData(d); useForemanStore.getState().setEntityTypes(d); }

  function handleRename(typeId, label) {
    renameType(typeId, label);
    refresh();
  }

  function handleDelete(typeId) {
    try { deleteType(typeId); refresh(); } catch (e) { alert(e.message); }
  }

  function handleAddSubtype(parentId, label) {
    createSubtype(label, parentId);
    refresh();
  }

  function commitNewRoot() {
    const trimmed = newLabel.trim();
    if (trimmed && addingClass) createType(trimmed, addingClass, null);
    setAddingClass(null);
    setNewLabel("");
    refresh();
  }

  const spatialRoots = getRootTypesForClass("spatial", data);
  const functionalRoots = getRootTypesForClass("functional", data);

  const sectionHead = (label, cls) => (
    <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginTop: "1.5rem", paddingBottom: "0.4rem" }}>
      <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1rem" }}>{label}</span>
      <button
        onClick={() => { setAddingClass(cls); setNewLabel(""); }}
        style={{ background: "none", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", padding: "0.2rem 0.6rem", transition: "all 0.15s" }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
      >+ Add type</button>
    </div>
  );

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ color: "var(--fm-ink)", borderBottom: "var(--fm-border)", fontFamily: "var(--fm-serif)", fontSize: "1.25rem", fontWeight: 400, margin: "0 0 1.25rem", paddingBottom: "0.6rem" }}>Category Types</h2>
      <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", lineHeight: 1.6, marginBottom: "0.5rem", marginTop: 0 }}>
        Define how your categories are organized. <strong style={{ color: "var(--fm-cyan)" }}>Spatial</strong> types (rooms, exterior areas) can be drawn on the floor plan. <strong style={{ color: "var(--fm-amber)" }}>Functional</strong> types (systems, structures) are maintenance groupings.
      </p>

      {sectionHead("Spatial", "spatial")}
      <div style={{ border: "1px solid var(--fm-hairline)", borderRadius: 4, padding: "0 0.75rem" }}>
        {spatialRoots.map(t => (
          <TypeNode key={t.id} type={t} data={data} depth={0}
            onRename={handleRename} onDelete={handleDelete} onAddSubtype={handleAddSubtype} />
        ))}
        {addingClass === "spatial" && (
          <div style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", gap: "0.5rem", padding: "0.45rem 0" }}>
            <input
              autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)}
              placeholder="New spatial type name"
              onKeyDown={e => { if (e.key === "Enter") commitNewRoot(); if (e.key === "Escape") { setAddingClass(null); } }}
              onBlur={commitNewRoot}
              style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 3, color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.78rem", outline: "none", padding: "0.15rem 0.4rem" }}
            />
          </div>
        )}
      </div>

      {sectionHead("Functional", "functional")}
      <div style={{ border: "1px solid var(--fm-hairline)", borderRadius: 4, padding: "0 0.75rem" }}>
        {functionalRoots.map(t => (
          <TypeNode key={t.id} type={t} data={data} depth={0}
            onRename={handleRename} onDelete={handleDelete} onAddSubtype={handleAddSubtype} />
        ))}
        {addingClass === "functional" && (
          <div style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", gap: "0.5rem", padding: "0.45rem 0" }}>
            <input
              autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)}
              placeholder="New functional type name"
              onKeyDown={e => { if (e.key === "Enter") commitNewRoot(); if (e.key === "Escape") { setAddingClass(null); } }}
              onBlur={commitNewRoot}
              style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 3, color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.78rem", outline: "none", padding: "0.15rem 0.4rem" }}
            />
          </div>
        )}
      </div>

      {/* ── Items (read-only v1) ── */}
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginTop: "1.5rem", paddingBottom: "0.4rem" }}>
        <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1rem" }}>Items</span>
      </div>
      <div style={{ border: "1px solid var(--fm-hairline)", borderRadius: 4, padding: "0 0.75rem" }}>
        {/* "Type" parent row */}
        <div style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", gap: "0.5rem", padding: "0.45rem 0" }}>
          <span style={{ color: "var(--fm-amber)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.78rem" }}>Type</span>
          <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.08em" }}>built-in</span>
        </div>
        {/* Children nested under Type */}
        <div style={{ marginLeft: "1.25rem" }}>
          {BUILT_IN_ITEM_TYPES.map((label, idx) => (
            <div key={label} style={{ alignItems: "center", borderBottom: idx < BUILT_IN_ITEM_TYPES.length - 1 ? "1px solid var(--fm-hairline)" : "none", display: "flex", gap: "0.5rem", padding: "0.45rem 0" }}>
              <span style={{ color: "var(--fm-hairline2)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem" }}>└</span>
              <span style={{ color: "var(--fm-amber)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.78rem" }}>{label}</span>
              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.08em" }}>built-in</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Theme definitions ────────────────────────────────────────────────────────

const THEMES = [
  {
    key: "foreman",
    name: "Foreman",
    description: "The original. Dense, dark, and precise — built for serious work.",
    fonts: [
      { name: "Newsreader",     family: "Newsreader, Georgia, serif" },
      { name: "Inter",          family: "Inter, system-ui, sans-serif" },
      { name: "JetBrains Mono", family: "'JetBrains Mono', 'IBM Plex Mono', monospace" },
    ],
    colors: ["#0e1014", "#c9a96e", "#e8e4dd", "#e07b6a", "#7fb087", "#7ab5d9"],
    radius: "2px",
    available: true,
  },
  {
    key: "daylight",
    name: "Daylight",
    description: "Light mode. Warm, airy, and readable in bright environments.",
    fonts: [
      { name: "Newsreader",     family: "Newsreader, Georgia, serif" },
      { name: "Inter",          family: "Inter, system-ui, sans-serif" },
      { name: "JetBrains Mono", family: "'JetBrains Mono', 'IBM Plex Mono', monospace" },
    ],
    colors: ["#f8f6f1", "#8b6914", "#1a1712", "#c0392b", "#2e7d32", "#1565c0"],
    radius: "4px",
    available: true,
  },
  {
    key: "obsidian",
    name: "Obsidian",
    description: "True black with cool undertones — optimized for OLED displays.",
    fonts: [
      { name: "Newsreader",     family: "Newsreader, Georgia, serif" },
      { name: "Inter",          family: "Inter, system-ui, sans-serif" },
      { name: "JetBrains Mono", family: "'JetBrains Mono', 'IBM Plex Mono', monospace" },
    ],
    colors: ["#000000", "#818cf8", "#f1f5f9", "#f87171", "#4ade80", "#a78bfa"],
    radius: "2px",
    available: true,
  },
];

// ─── ThemeModal ───────────────────────────────────────────────────────────────

function ThemeModal({ activeTheme, onSelect, onClose }) {
  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ alignItems: "flex-start", background: "rgba(0,0,0,0.75)", bottom: 0, display: "flex", justifyContent: "center", left: 0, overflowY: "auto", padding: "3rem 1.5rem", position: "fixed", right: 0, top: 0, zIndex: 1000 }}
    >
      <div style={{ background: "var(--fm-bg)", border: "1px solid var(--fm-hairline2)", borderRadius: "8px", maxWidth: "720px", padding: "1.75rem", width: "100%" }}>
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <span style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>Select Theme</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "1rem", lineHeight: 1, padding: "0.1rem 0.3rem", transition: "color 0.12s" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
          >×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {THEMES.map(theme => {
            const isActive = theme.key === activeTheme;
            return (
              <div
                key={theme.key}
                onClick={() => theme.available && onSelect(theme.key)}
                style={{
                  background: isActive ? "#c9a96e0a" : "var(--fm-bg-raised)",
                  border: `1px solid ${isActive ? "var(--fm-brass)" : "var(--fm-hairline)"}`,
                  borderRadius: "6px",
                  cursor: theme.available ? "pointer" : "default",
                  display: "flex",
                  gap: "1.5rem",
                  opacity: theme.available ? 1 : 0.6,
                  padding: "1rem 1.25rem",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={e => { if (theme.available && !isActive) e.currentTarget.style.borderColor = "var(--fm-hairline2)"; }}
                onMouseLeave={e => { if (theme.available && !isActive) e.currentTarget.style.borderColor = "var(--fm-hairline)"; }}
              >
                {/* Left: name + indicators */}
                <div style={{ flexShrink: 0, paddingTop: "0.1rem", width: "130px" }}>
                  <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", marginBottom: "0.35rem" }}>
                    <div style={{
                      background: isActive ? "var(--fm-brass)" : "transparent",
                      border: `1.5px solid ${isActive ? "var(--fm-brass)" : "var(--fm-hairline2)"}`,
                      borderRadius: "50%",
                      flexShrink: 0,
                      height: "10px",
                      transition: "all 0.15s",
                      width: "10px",
                    }} />
                    <span style={{ color: isActive ? "var(--fm-brass)" : "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "0.95rem" }}>
                      {theme.name}
                    </span>
                  </div>
                  {isActive && (
                    <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.1em", marginLeft: "1.4rem", textTransform: "uppercase" }}>
                      Active
                    </div>
                  )}
                  {!theme.available && (
                    <div style={{ background: "var(--fm-hairline)", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-ink-mute)", display: "inline-block", fontFamily: "var(--fm-mono)", fontSize: "0.5rem", letterSpacing: "0.1em", marginLeft: "1.4rem", marginTop: "0.2rem", padding: "0.1rem 0.4rem", textTransform: "uppercase" }}>
                      Coming Soon
                    </div>
                  )}
                </div>

                {/* Right: details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Description */}
                  <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", lineHeight: 1.5, margin: "0 0 0.65rem" }}>
                    {theme.description}
                  </p>

                  {/* Fonts in their own typeface */}
                  <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.65rem" }}>
                    {theme.fonts.map((f, i) => (
                      <span key={f.name} style={{ alignItems: "center", display: "flex", gap: "0.5rem" }}>
                        <span style={{ color: "var(--fm-ink)", fontFamily: f.family, fontSize: "0.8rem" }}>{f.name}</span>
                        {i < theme.fonts.length - 1 && (
                          <span style={{ color: "var(--fm-hairline2)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem" }}>·</span>
                        )}
                      </span>
                    ))}
                  </div>

                  {/* Colors + radius */}
                  <div style={{ alignItems: "center", display: "flex", gap: "1rem" }}>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      {theme.colors.map(hex => (
                        <div key={hex} style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                          <div style={{ background: hex, border: "1px solid rgba(255,255,255,0.07)", borderRadius: "2px", height: "16px", width: "16px" }} />
                          <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.46rem", letterSpacing: "0.01em" }}>{hex}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                      <div style={{ background: "var(--fm-hairline2)", borderRadius: theme.radius, height: "16px", width: "24px" }} />
                      <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.46rem" }}>{theme.radius}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── DisplaySettings ──────────────────────────────────────────────────────────

function DisplaySettings() {
  const [activeTheme, setActiveTheme] = useState(() => storageGet("foreman-theme") ?? "foreman");
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [activeDensity, setActiveDensity] = useState(() => storageGet("foreman-density") ?? "default");

  function handleSelectDensity(val) {
    setActiveDensity(val);
    storageSet("foreman-density", val);
    if (val === "default") {
      delete document.documentElement.dataset.density;
    } else {
      document.documentElement.dataset.density = val;
    }
  }

  function handleSelectTheme(key) {
    setActiveTheme(key);
    storageSet("foreman-theme", key);
    if (key === "foreman") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = key;
    }
    setShowThemeModal(false);
  }

  const activeThemeMeta = THEMES.find(t => t.key === activeTheme) ?? THEMES[0];

  return (
    <div style={{ maxWidth: "560px" }}>
      <h2 style={{ color: "var(--fm-ink)", borderBottom: "var(--fm-border)", fontFamily: "var(--fm-serif)", fontSize: "1.25rem", fontWeight: 400, margin: "0 0 1.25rem", paddingBottom: "0.6rem" }}>Display</h2>

      {/* ── Theme ── */}
      <div style={{ marginBottom: "2.5rem" }}>
        <div style={subheadStyle}>Theme</div>
        <p style={bodyTextStyle}>The visual personality of the application: colors, typefaces, and corner radius.</p>

        <div style={{ alignItems: "center", background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "6px", display: "flex", gap: "1rem", justifyContent: "space-between", padding: "0.85rem 1.1rem" }}>
          <div>
            <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "0.95rem", marginBottom: "0.2rem" }}>{activeThemeMeta.name}</div>
            <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>{activeThemeMeta.description}</div>
          </div>
          <button
            onClick={() => setShowThemeModal(true)}
            style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-brass-dim)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.68rem", letterSpacing: "0.05em", padding: "0.4rem 0.85rem", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
          >
            Change
          </button>
        </div>
      </div>

      {/* ── Density ── */}
      <div>
        <div style={{ marginBottom: "0.5rem" }}>
          <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>Density</span>
        </div>
        <p style={bodyTextStyle}>Control the spacing and size of UI elements across the application.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {[
            ["compact",     "Compact",     "Tighter spacing and smaller text for maximum information density."],
            ["default",     "Default",     "Balanced spacing for everyday use."],
            ["comfortable", "Comfortable", "Larger touch targets and more breathing room."],
          ].map(([val, label, desc]) => (
            <label key={val} style={{ alignItems: "flex-start", cursor: "pointer", display: "flex", gap: "0.6rem" }}>
              <input
                type="radio"
                name="density"
                value={val}
                checked={activeDensity === val}
                onChange={() => handleSelectDensity(val)}
                style={{ accentColor: "var(--fm-brass)", flexShrink: 0, marginTop: "0.15rem" }}
              />
              <div>
                <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem" }}>{label}</div>
                <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", lineHeight: 1.5, marginTop: "0.1rem" }}>{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {showThemeModal && (
        <ThemeModal
          activeTheme={activeTheme}
          onSelect={handleSelectTheme}
          onClose={() => setShowThemeModal(false)}
        />
      )}
    </div>
  );
}

// ─── PreferencesPage ──────────────────────────────────────────────────────────

// ─── DefaultValuesSettings ────────────────────────────────────────────────────

// Editable expected-lifespan cell, keyed by item name. Writes through the store so
// the same value is editable from the Replacement Forecast tab. Empty clears the
// override back to the curated default.
function LifespanInput({ item }) {
  const overrides = useForemanStore(s => s.lifespanOverrides);
  const setOverride = useForemanStore(s => s.setLifespanOverride);
  const effective = expectedYears(item, overrides); // override ?? curated ?? null
  const overridden = overrides[item] != null;
  const [val, setVal] = useState(effective == null ? "" : String(effective));
  useEffect(() => { setVal(effective == null ? "" : String(effective)); }, [effective]);

  return (
    <div style={{ alignItems: "center", display: "flex", gap: "0.4rem" }}>
      <input
        type="number" min="0" step="1"
        value={val}
        placeholder="—"
        onChange={e => setVal(e.target.value)}
        onBlur={() => setOverride(item, val.trim() === "" ? null : parseFloat(val))}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
        title="Expected service life in years — blank to reset to the curated default"
        style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: overridden ? "var(--fm-brass)" : "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", outline: "none", padding: "0.2rem 0.4rem", textAlign: "right", width: 56 }}
      />
      <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>yr</span>
    </div>
  );
}

function DefaultValuesSettings() {
  // Union of model-coverage items and curated-lifespan items, so every forecastable
  // type's default lifespan is editable here even without model coverage.
  const items = useMemo(
    () => [...new Set([...Object.keys(MANUFACTURERS_BY_ITEM), ...Object.keys(EXPECTED_LIFESPAN)])].sort(),
    []
  );
  const [query, setQuery] = useState("");
  const th = { borderBottom: "1px solid var(--fm-hairline2)", color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", fontWeight: 400, letterSpacing: "0.12em", padding: "0 1.25rem 0.55rem 0", textAlign: "left", textTransform: "uppercase", whiteSpace: "nowrap" };
  const td = { borderBottom: "1px solid var(--fm-hairline)", padding: "0.7rem 1.25rem 0.7rem 0", verticalAlign: "top" };

  // Match against the item name, its manufacturers, and their models so a brand or
  // model number finds its row too.
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return items;
    return items.filter(item => {
      if (item.toLowerCase().includes(q)) return true;
      return (MANUFACTURERS_BY_ITEM[item] || []).some(mfr =>
        mfr.toLowerCase().includes(q) || getModels(mfr, item).some(m => m.toLowerCase().includes(q))
      );
    });
  }, [items, q]);

  return (
    <div style={{ maxWidth: "900px" }}>
      <h2 style={{ color: "var(--fm-ink)", borderBottom: "var(--fm-border)", fontFamily: "var(--fm-serif)", fontSize: "1.25rem", fontWeight: 400, margin: "0 0 1rem", paddingBottom: "0.6rem" }}>Default Values</h2>
      <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", lineHeight: 1.6, margin: "0 0 1.25rem" }}>
        Defaults that power Foreman. The estimated lifespan here is the default applied to a new item of that type when it's created — change a specific item's value from its details or the Replacement Forecast and that item keeps its own. Model coverage powers the manufacturer and model suggestions when you fill in an item's details. {items.length} item types.
      </p>
      <div style={{ alignItems: "center", display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search items, manufacturers, or models…"
          style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", maxWidth: 360, outline: "none", padding: "0.4rem 0.6rem", width: "100%" }}
        />
        {q && (
          <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", whiteSpace: "nowrap" }}>
            {filtered.length} of {items.length}
          </span>
        )}
      </div>
      {filtered.length === 0 ? (
        <p style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", padding: "0.5rem 0" }}>
          No items match “{query.trim()}”.
        </p>
      ) : (
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>Item</th>
            <th style={th}>Estimated Lifespan</th>
            <th style={{ ...th, paddingRight: 0 }}>Model Coverage</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(item => (
            <tr key={item}>
              <td style={{ ...td, color: "var(--fm-brass)", fontFamily: "var(--fm-serif)", fontSize: "0.88rem", whiteSpace: "nowrap" }}>{item}</td>
              <td style={{ ...td, whiteSpace: "nowrap" }}><LifespanInput item={item} /></td>
              <td style={{ ...td, paddingRight: 0 }}>
                {(MANUFACTURERS_BY_ITEM[item] || []).length === 0 ? (
                  <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>—</span>
                ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {MANUFACTURERS_BY_ITEM[item].map(mfr => {
                    const models = getModels(mfr, item);
                    return (
                      <div key={mfr}>
                        <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.72rem" }}>{mfr}</span>
                        {models.length > 0 && (
                          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", lineHeight: 1.6, marginTop: "0.05rem" }}>
                            {models.join("  ·  ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </div>
  );
}

export default function PreferencesPage({ navigate }) {
  const isMobile = useIsMobile();
  const [activeSection, setActiveSection] = useState("profile");

  const activeLabel = NAV_ITEMS.find(i => i.key === activeSection)?.label ?? NAV_ITEMS[0].label;

  function handleTabChange(label) {
    const item = NAV_ITEMS.find(i => i.label === label);
    if (item?.available) setActiveSection(item.key);
  }

  return (
    <div style={{ background: "var(--fm-bg)", color: "var(--fm-ink)", display: "flex", flexDirection: "column", fontFamily: "var(--fm-sans)", height: isMobile ? MOBILE_SHELL_HEIGHT : "100vh", overflow: "hidden" }}>

      <FmHeader active="Preferences" tagline="Preferences" />
      <FmSubnav
        tabs={NAV_ITEMS.map(i => i.label)}
        active={activeLabel}
        onTabChange={handleTabChange}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "1rem 0.9rem calc(1.5rem + env(safe-area-inset-bottom))" : "2rem 2.5rem" }}>
        {activeSection === "profile" && (
          <div style={{ alignItems: "start", display: "grid", gap: isMobile ? "1.75rem" : "0 3rem", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr" }}>
            <ProfileSettings />
            <HouseholdSettings />
            <CategoryTypesSettings />
          </div>
        )}
        {activeSection === "automation"     && <AutomationSettings />}
        {activeSection === "integrations"   && <IntegrationsSettings />}
        {activeSection === "display"        && <DisplaySettings />}
        {activeSection === "importexport"   && <ImportExportSettings />}
        {activeSection === "info"           && <DefaultValuesSettings />}
      </div>

    </div>
  );
}
