import { useState, useMemo, useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import { defaultData, loadCustomData, loadUseDefaultData } from "./lib/data.js";
import { getCategoryTree } from "./lib/categoryData.js";
import { loadDeletedRows, saveDeletedRows } from "./lib/deletedRows.js";
import { loadRoomSubtypes, formatRoomLabel } from "./lib/categoryTypes.js";
import { MANUFACTURERS_BY_ITEM } from "./lib/manufacturers.js";
import { getModels } from "./lib/models.js";
import { loadItemDetails } from "./lib/itemDetails.js";
import { loadCategoryFieldSchemas, loadItemFieldSchemas, loadItemFieldValues } from "./lib/customFields.js";
import { loadGuideNotes, saveGuideNotes } from "./lib/guideNotes.js";

const EDITOR_STYLES = `
.foreman-note-editor .ProseMirror {
  color: var(--fm-ink);
  font-family: var(--fm-sans);
  font-size: 0.82rem;
  line-height: 1.75;
  min-height: 60px;
  outline: none;
}
.foreman-note-editor .ProseMirror > * + * { margin-top: 0.4rem; }
.foreman-note-editor .ProseMirror p { margin: 0; }
.foreman-note-editor .ProseMirror strong { font-weight: 600; }
.foreman-note-editor .ProseMirror em { font-style: italic; }
.foreman-note-editor .ProseMirror s { color: var(--fm-ink-mute); text-decoration: line-through; }
.foreman-note-editor .ProseMirror code {
  background: var(--fm-bg-sunk);
  border: 1px solid var(--fm-hairline2);
  border-radius: 2px;
  color: var(--fm-ink-dim);
  font-family: var(--fm-mono);
  font-size: 0.75rem;
  padding: 0.1em 0.35em;
}
.foreman-note-editor .ProseMirror pre {
  background: var(--fm-bg-sunk);
  border: 1px solid var(--fm-hairline2);
  border-radius: 3px;
  margin: 0.4rem 0;
  overflow-x: auto;
  padding: 0.5rem 0.75rem;
}
.foreman-note-editor .ProseMirror pre code { background: none; border: none; padding: 0; }
.foreman-note-editor .ProseMirror blockquote {
  border-left: 3px solid var(--fm-brass);
  color: var(--fm-ink-dim);
  margin: 0;
  padding-left: 0.75rem;
}
.foreman-note-editor .ProseMirror ul { list-style: disc; margin: 0; padding-left: 1.2rem; }
.foreman-note-editor .ProseMirror ol { list-style: decimal; margin: 0; padding-left: 1.2rem; }
.foreman-note-editor .ProseMirror li + li { margin-top: 0.15rem; }
.foreman-note-editor .ProseMirror h1 {
  color: var(--fm-ink);
  font-family: var(--fm-serif);
  font-size: 1.05rem;
  font-weight: 400;
  margin: 0.8rem 0 0.3rem;
}
.foreman-note-editor .ProseMirror h2 {
  color: var(--fm-brass);
  font-family: var(--fm-serif);
  font-size: 0.92rem;
  font-weight: 400;
  margin: 0.7rem 0 0.2rem;
}
.foreman-note-editor .ProseMirror h3 {
  color: var(--fm-ink-dim);
  font-family: var(--fm-sans);
  font-size: 0.8rem;
  font-weight: 600;
  margin: 0.5rem 0 0.15rem;
}
.foreman-note-editor .ProseMirror.is-editor-empty:first-child::before {
  color: var(--fm-ink-mute);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}
`;

function timeAgo(isoStr) {
  if (!isoStr) return null;
  const diff = Date.now() - new Date(isoStr).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatPurchaseDate(isoStr) {
  if (!isoStr) return null;
  return new Date(isoStr).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function Spec({ label, value }) {
  return (
    <div>
      <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.5rem", letterSpacing: "0.12em", marginBottom: "0.1rem", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem" }}>{value}</div>
    </div>
  );
}

function NoteToolbar({ editor }) {
  if (!editor) return null;
  const btns = [
    { label: "B",  cmd: () => editor.chain().focus().toggleBold().run(),        isActive: editor.isActive("bold"),        title: "Bold",          style: { fontWeight: "bold" } },
    { label: "I",  cmd: () => editor.chain().focus().toggleItalic().run(),      isActive: editor.isActive("italic"),      title: "Italic",        style: { fontStyle: "italic" } },
    { label: "S",  cmd: () => editor.chain().focus().toggleStrike().run(),      isActive: editor.isActive("strike"),      title: "Strikethrough", style: { textDecoration: "line-through" } },
    { label: "<>", cmd: () => editor.chain().focus().toggleCode().run(),        isActive: editor.isActive("code"),        title: "Inline code",   style: {} },
    { label: '"',  cmd: () => editor.chain().focus().toggleBlockquote().run(),  isActive: editor.isActive("blockquote"),  title: "Blockquote",    style: {} },
    { label: "•",  cmd: () => editor.chain().focus().toggleBulletList().run(),  isActive: editor.isActive("bulletList"),  title: "Bullet list",   style: {} },
    { label: "1.", cmd: () => editor.chain().focus().toggleOrderedList().run(), isActive: editor.isActive("orderedList"), title: "Numbered list", style: {} },
  ];
  return (
    <div style={{ borderBottom: "var(--fm-border)", display: "flex", flexShrink: 0, gap: "0.1rem", padding: "0.3rem 0.65rem" }}>
      {btns.map(btn => (
        <button
          key={btn.label}
          onMouseDown={e => { e.preventDefault(); btn.cmd(); }}
          title={btn.title}
          style={{
            background: btn.isActive ? "var(--fm-brass-bg)" : "transparent",
            border: `1px solid ${btn.isActive ? "var(--fm-brass-dim)" : "transparent"}`,
            borderRadius: "3px",
            color: btn.isActive ? "var(--fm-brass)" : "var(--fm-ink-mute)",
            cursor: "pointer",
            fontFamily: "var(--fm-mono)",
            fontSize: "0.72rem",
            padding: "0.3rem 0.6rem",
            transition: "color 0.1s",
            ...btn.style,
          }}
          onMouseEnter={e => { if (!btn.isActive) e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
          onMouseLeave={e => { if (!btn.isActive) e.currentTarget.style.color = "var(--fm-ink-mute)"; }}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}

function NoteEditor({ initialContent, onSave, readOnly = false, contentPadding = "0.75rem 1rem" }) {
  const timerRef = useRef(null);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Start writing…", emptyEditorClass: "is-editor-empty" }),
      Markdown.configure({ html: false, transformCopiedText: true }),
    ],
    content: initialContent,
    editable: !readOnly,
    onUpdate({ editor }) {
      if (readOnly) return;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onSave(editor.storage.markdown.getMarkdown());
      }, 400);
    },
  });

  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
      if (!readOnly) setTimeout(() => editor.commands.focus("end"), 50);
    }
  }, [editor, readOnly]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className="foreman-note-editor" style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}>
      {!readOnly && <NoteToolbar editor={editor} />}
      <div style={{ flex: 1, overflowY: "auto", padding: contentPadding }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function RestoreButton({ onRestore }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onRestore}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "transparent",
        border: `1px solid ${hovered ? "var(--fm-brass)" : "var(--fm-hairline2)"}`,
        borderRadius: "var(--fm-radius)",
        color: hovered ? "var(--fm-brass)" : "var(--fm-ink-mute)",
        cursor: "pointer",
        fontFamily: "var(--fm-mono)",
        fontSize: "0.58rem",
        letterSpacing: "0.08em",
        padding: "0.15rem 0.5rem",
        transition: "all 0.15s",
      }}
    >
      Restore &rarr; Schedule
    </button>
  );
}

export default function GuidePage({ navigate }) {
  const [deletedRows, setDeletedRows] = useState(() => loadDeletedRows());
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [itemDetails]          = useState(() => loadItemDetails());
  const [categoryFieldSchemas] = useState(() => loadCategoryFieldSchemas());
  const [itemFieldSchemas]     = useState(() => loadItemFieldSchemas());
  const [customFieldValues]    = useState(() => loadItemFieldValues());
  const [notes, setNotes]      = useState(() => loadGuideNotes());
  const [roomSubtypes]         = useState(() => loadRoomSubtypes());

  const useDefaultData = useMemo(() => loadUseDefaultData(), []);

  const grouped = useMemo(() => {
    if (useDefaultData) return getCategoryTree();
    const customs = loadCustomData().filter(r => r.category && r.item && r.task && !r._isBlankCategory);
    const catOrder = [], catItems = {}, taskMap = {};
    customs.forEach(row => {
      if (!catOrder.includes(row.category)) { catOrder.push(row.category); catItems[row.category] = []; }
      if (!catItems[row.category].includes(row.item)) {
        catItems[row.category].push(row.item);
        taskMap[`${row.category}||${row.item}`] = [];
      }
      taskMap[`${row.category}||${row.item}`].push(row);
    });
    return catOrder.map(cat => ({
      category: cat,
      categoryType: null,
      items: catItems[cat].map(item => ({ item, tasks: taskMap[`${cat}||${item}`] })),
    }));
  }, [useDefaultData]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return grouped;
    const q = searchQuery.toLowerCase();
    return grouped
      .map(g => ({ ...g, items: g.items.filter(({ item }) => item.toLowerCase().includes(q)) }))
      .filter(g => g.items.length > 0 || formatRoomLabel(g.category, roomSubtypes).toLowerCase().includes(q));
  }, [grouped, searchQuery, roomSubtypes]);

  const deletedCount = useMemo(() =>
    useDefaultData
      ? defaultData.filter(row => deletedRows.has(`${row.category}|${row.item}|${row.task}`)).length
      : 0,
    [deletedRows, useDefaultData]
  );

  const articlesWithNotes = useMemo(() =>
    grouped.reduce((n, g) => n + g.items.filter(({ item }) => notes[`${g.category}|${item}`]?.content).length, 0),
    [grouped, notes]
  );

  const coverageItems = useMemo(() => Object.keys(MANUFACTURERS_BY_ITEM).sort(), []);

  function handleSelectItem(category, item) {
    setSelectedItem({ category, item });
    setIsEditing(false);
  }

  function handleRestore(key) {
    setDeletedRows(prev => {
      const next = new Set(prev);
      next.delete(key);
      saveDeletedRows(next);
      return next;
    });
  }

  function handleNoteSave(itemKey, content) {
    setNotes(prev => {
      const next = { ...prev, [itemKey]: { content, updatedAt: new Date().toISOString() } };
      saveGuideNotes(next);
      return next;
    });
  }

  // Article data for the selected item
  const itemKey = selectedItem && selectedItem.category !== "__coverage__"
    ? `${selectedItem.category}|${selectedItem.item}`
    : null;
  const noteData = itemKey ? (notes[itemKey] ?? { content: "", updatedAt: null }) : null;
  const d = itemKey ? ((itemDetails || {})[itemKey] || {}) : {};
  const catGroup = selectedItem ? grouped.find(g => g.category === selectedItem.category) : null;
  const itemGroup = catGroup ? catGroup.items.find(i => i.item === selectedItem?.item) : null;
  const articleTasks = itemGroup?.tasks || [];
  const deletedTasks = articleTasks.filter(t => deletedRows.has(`${t.category}|${t.item}|${t.task}`));
  const cfVals = itemKey ? (customFieldValues[itemKey] || {}) : {};
  const catFields = selectedItem ? (categoryFieldSchemas[selectedItem.category] || []) : [];
  const itmFields = itemKey ? (itemFieldSchemas[itemKey] || []) : [];
  const allCustomFields = [...catFields, ...itmFields];

  function formatCustomValue(field) {
    const v = cfVals[field.id];
    if (!v && v !== 0) return null;
    if (field.type === "date") {
      const parsed = new Date(v);
      return isNaN(parsed) ? v : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return String(v);
  }

  const hasSpecs = d.manufacturer || d.model || d.serial || d.purchaseDate
    || allCustomFields.some(f => formatCustomValue(f));

  return (
    <div style={{ background: "var(--fm-bg)", color: "var(--fm-ink)", display: "flex", flexDirection: "column", fontFamily: "var(--fm-sans)", height: "100vh", overflow: "hidden" }}>
      <style>{EDITOR_STYLES}</style>

      <FmHeader active="Notebook" tagline="Notebook" />
      <FmSubnav
        tabs={["Articles", "By system", "By item", "Drafts", "Guide"]}
        active="By system"
        stats={[
          { value: grouped.reduce((n, g) => n + g.items.length, 0), label: "items" },
          { value: grouped.length, label: "systems" },
          { value: articlesWithNotes, color: "var(--fm-brass)", label: "articles" },
        ]}
      />

      {!useDefaultData && grouped.length === 0 && (
        <div style={{ alignItems: "center", display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", padding: "4rem 2rem" }}>
          <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.2em", marginBottom: "0.75rem", textTransform: "uppercase" }}>Guide</div>
          <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.1rem", marginBottom: "0.5rem" }}>Your guide is empty</div>
          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.75rem", lineHeight: 1.7, maxWidth: "340px", textAlign: "center" }}>
            Your guide will populate as you add items and maintenance tasks to your inventory.
          </div>
        </div>
      )}

      {(useDefaultData || grouped.length > 0) && (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* Left panel: article tree */}
          <div style={{ borderRight: "var(--fm-border)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden", width: "260px" }}>
            {/* Search */}
            <div style={{ borderBottom: "var(--fm-border)", flexShrink: 0, padding: "0.65rem 0.85rem" }}>
              <input
                type="text"
                placeholder="Search items…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: "var(--fm-bg-sunk)",
                  border: "1px solid var(--fm-hairline2)",
                  borderRadius: "var(--fm-radius)",
                  boxSizing: "border-box",
                  color: "var(--fm-ink)",
                  fontFamily: "var(--fm-sans)",
                  fontSize: "0.72rem",
                  outline: "none",
                  padding: "0.4rem 0.65rem",
                  width: "100%",
                }}
                onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
                onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
              />
            </div>

            {/* Article list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0.4rem 0" }}>
              {filteredGroups.map(({ category, items }) => (
                <div key={category}>
                  <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.14em", padding: "0.55rem 1rem 0.2rem", textTransform: "uppercase" }}>
                    {formatRoomLabel(category, roomSubtypes)}
                  </div>
                  {items.map(({ item }) => {
                    const isActive = selectedItem?.category === category && selectedItem?.item === item;
                    const note = notes[`${category}|${item}`];
                    return (
                      <button
                        key={item}
                        onClick={() => handleSelectItem(category, item)}
                        style={{
                          background: isActive ? "var(--fm-bg-raised)" : "transparent",
                          border: "none",
                          borderLeft: `2px solid ${isActive ? "var(--fm-brass)" : "transparent"}`,
                          cursor: "pointer",
                          display: "block",
                          padding: "0.28rem 0.85rem 0.28rem 0.75rem",
                          textAlign: "left",
                          transition: "background 0.12s",
                          width: "100%",
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--fm-bg-raised)"; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                      >
                        <div style={{ color: isActive ? "var(--fm-ink)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item}
                        </div>
                        {note?.updatedAt && (
                          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.51rem", marginTop: "0.07rem" }}>
                            {timeAgo(note.updatedAt)}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* Model Coverage entry */}
              <div style={{ borderTop: "var(--fm-border)", margin: "0.5rem 0 0" }}>
                <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.14em", padding: "0.55rem 1rem 0.2rem", textTransform: "uppercase" }}>
                  Reference
                </div>
                {(() => {
                  const isActive = selectedItem?.category === "__coverage__";
                  return (
                    <button
                      onClick={() => handleSelectItem("__coverage__", "Model Coverage")}
                      style={{
                        background: isActive ? "var(--fm-bg-raised)" : "transparent",
                        border: "none",
                        borderLeft: `2px solid ${isActive ? "var(--fm-brass)" : "transparent"}`,
                        cursor: "pointer",
                        display: "block",
                        padding: "0.28rem 0.85rem 0.28rem 0.75rem",
                        textAlign: "left",
                        transition: "background 0.12s",
                        width: "100%",
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--fm-bg-raised)"; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{ color: isActive ? "var(--fm-ink)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.72rem" }}>Model Coverage</div>
                      <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.51rem", marginTop: "0.07rem" }}>{coverageItems.length} appliance types</div>
                    </button>
                  );
                })()}
              </div>

              {deletedCount > 0 && (
                <div style={{ borderTop: "var(--fm-border)", margin: "0.5rem 0 0", padding: "0.5rem 1rem" }}>
                  <span style={{ color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem" }}>
                    {deletedCount} removed from schedule
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Main panel */}
          <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}>

            {/* Empty state */}
            {!selectedItem && (
              <div style={{ alignItems: "center", display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>
                <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem" }}>
                  Select an item to read or edit its article
                </div>
              </div>
            )}

            {/* Model Coverage view */}
            {selectedItem?.category === "__coverage__" && (
              <div style={{ flex: 1, overflowY: "auto", padding: "2rem 2.5rem 4rem" }}>
                <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.14em", marginBottom: "0.5rem", textTransform: "uppercase" }}>Reference</div>
                <h1 style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.5rem", fontWeight: 400, margin: "0 0 0.5rem" }}>Model Coverage</h1>
                <p style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.75rem", lineHeight: 1.7, margin: "0 0 2rem", maxWidth: "640px" }}>
                  {coverageItems.length} appliance types · 1,420 models across 140 manufacturer pairings.
                </p>
                {coverageItems.map(item => {
                  const manufacturers = MANUFACTURERS_BY_ITEM[item];
                  return (
                    <div key={item} style={{ marginBottom: "1.5rem" }}>
                      <div style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-serif)", fontSize: "0.88rem", marginBottom: "0.35rem" }}>{item}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", paddingLeft: "1rem" }}>
                        {manufacturers.map(mfr => {
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
                    </div>
                  );
                })}
              </div>
            )}

            {/* Article view */}
            {selectedItem && selectedItem.category !== "__coverage__" && (
              <>
                {/* Article header */}
                <div style={{ borderBottom: "var(--fm-border)", flexShrink: 0, padding: "1.75rem 2.5rem 1.25rem" }}>
                  <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.14em", marginBottom: "0.4rem", textTransform: "uppercase" }}>
                    {formatRoomLabel(selectedItem.category, roomSubtypes)}
                  </div>
                  <h1 style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.4rem", fontWeight: 400, margin: "0 0 0.4rem" }}>
                    {selectedItem.item}
                  </h1>
                  <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem" }}>
                    {noteData?.updatedAt ? `Updated ${timeAgo(noteData.updatedAt)}` : "No notes yet"}
                    {articleTasks.length > 0 && ` · ${articleTasks.length} task${articleTasks.length !== 1 ? "s" : ""}`}
                  </div>
                  {hasSpecs && (
                    <div style={{ borderTop: "var(--fm-border)", display: "flex", flexWrap: "wrap", gap: "1.5rem", marginTop: "0.85rem", paddingTop: "0.75rem" }}>
                      {d.manufacturer && <Spec label="Manufacturer" value={d.manufacturer} />}
                      {d.model && <Spec label="Model" value={d.model} />}
                      {d.serial && <Spec label="Serial" value={d.serial} />}
                      {d.purchaseDate && <Spec label="Purchased" value={formatPurchaseDate(d.purchaseDate)} />}
                      {allCustomFields.map(field => {
                        const v = formatCustomValue(field);
                        return v ? <Spec key={field.id} label={field.name} value={v} /> : null;
                      })}
                    </div>
                  )}
                </div>

                {/* Article body */}
                <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}>
                  {noteData !== null && (
                    <NoteEditor
                      key={itemKey}
                      initialContent={noteData.content}
                      onSave={content => handleNoteSave(itemKey, content)}
                      readOnly={!isEditing}
                      contentPadding={isEditing ? "0.75rem 1rem" : "1.5rem 2.5rem"}
                    />
                  )}
                </div>

                {/* Deleted tasks */}
                {deletedTasks.length > 0 && (
                  <div style={{ borderTop: "var(--fm-border)", flexShrink: 0, padding: "0.75rem 1.5rem" }}>
                    <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.12em", marginBottom: "0.4rem", textTransform: "uppercase" }}>
                      Removed from schedule
                    </div>
                    {deletedTasks.map(t => {
                      const key = `${t.category}|${t.item}|${t.task}`;
                      return (
                        <div key={key} style={{ alignItems: "center", display: "flex", gap: "0.75rem", marginBottom: "0.3rem" }}>
                          <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.72rem", textDecoration: "line-through" }}>{t.task}</span>
                          <RestoreButton onRestore={() => handleRestore(key)} />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Footer */}
                <div style={{ borderTop: "var(--fm-border)", display: "flex", flexShrink: 0, gap: "0.65rem", justifyContent: "flex-end", padding: "0.65rem 1.5rem" }}>
                  {isEditing ? (
                    <button
                      onClick={() => setIsEditing(false)}
                      style={{
                        background: "var(--fm-brass)",
                        border: "none",
                        borderRadius: "var(--fm-radius)",
                        color: "var(--fm-bg)",
                        cursor: "pointer",
                        fontFamily: "var(--fm-mono)",
                        fontSize: "0.65rem",
                        letterSpacing: "0.08em",
                        padding: "0.4rem 1.1rem",
                        transition: "opacity 0.12s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                      onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                    >
                      Done
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsEditing(true)}
                      style={{
                        background: "transparent",
                        border: "var(--fm-border-2)",
                        borderRadius: "var(--fm-radius)",
                        color: "var(--fm-ink-dim)",
                        cursor: "pointer",
                        fontFamily: "var(--fm-mono)",
                        fontSize: "0.65rem",
                        letterSpacing: "0.08em",
                        padding: "0.4rem 1.1rem",
                        transition: "all 0.12s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
                    >
                      Edit article
                    </button>
                  )}
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
