import { useState, useMemo, useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import { defaultData, loadData, loadUseDefaultData } from "./lib/data.js";
import { loadDeletedRows, saveDeletedRows } from "./lib/deletedRows.js";
import { loadDeletedItems } from "./lib/deletedItems.js";
import { loadDeletedCategories } from "./lib/deletedCategories.js";
import { loadRoomSubtypes, formatRoomLabel, loadCategoryTypeOverrides, loadLocationCategories, loadFunctionalCategories } from "./lib/categoryTypes.js";
import { getManufacturers } from "./lib/manufacturers.js";
import { getModels } from "./lib/models.js";
import { loadItemDetails } from "./lib/itemDetails.js";
import { loadCategoryFieldSchemas, loadItemFieldSchemas, saveItemFieldSchemas } from "./lib/customFields.js";
import { getItemStableKey } from "./lib/itemKeys.js";
import { UNIVERSAL_FIELDS, ITEM_FIELDS, TYPE_FIELDS } from "./lib/fieldLibrary.js";
import { FilterDropdown, FilterPill } from "./components/FilterPill.jsx";
import ModelComboField from "./components/ModelComboField.jsx";
import { buildSections, loadNotebookGrouping, saveNotebookGrouping, loadNotebookOrder, saveNotebookOrder, NOTEBOOK_GROUPINGS } from "./lib/notebookOrg.js";
import { useForemanStore } from "./lib/store.js";
import { loadGuideNotes, saveGuideNotes } from "./lib/guideNotes.js";
import { loadStandaloneArticles, saveStandaloneArticles, standaloneNoteKey } from "./lib/standaloneArticles.js";
import { loadProjects } from "./lib/projects.js";
import { loadArticleAssociations, saveArticleAssociations, setAssociationIn } from "./lib/articleAssociations.js";

// Structural fields stay Inventory-managed; keep them out of the article's add-field menu.
const STRUCTURAL_FIELD_IDS = new Set(["item_type", "item_subtype"]);

function stableKeyForItem(category, item, tasks) {
  return tasks && tasks[0] ? getItemStableKey(tasks[0]) : `default:${category}|${item}`;
}

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

function NoteEditor({ initialContent, onSave, readOnly = false, contentPadding = "0.75rem 1rem", onBeginEdit }) {
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
    <div
      className="foreman-note-editor"
      style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}
      // In read mode, double-clicking the body drops you into editing — mirrors
      // the sidebar's double-click-to-edit. No-op while already editing so the
      // native double-click (word select) keeps working.
      onDoubleClick={readOnly && onBeginEdit ? () => onBeginEdit() : undefined}
    >
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
  const [deletedItems]      = useState(() => loadDeletedItems());
  const [deletedCategories] = useState(() => loadDeletedCategories());
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [itemDetails]          = useState(() => loadItemDetails());
  const [categoryFieldSchemas] = useState(() => loadCategoryFieldSchemas());
  const [itemFieldSchemas, setItemFieldSchemas] = useState(() => loadItemFieldSchemas());
  const _itemFieldValues    = useForemanStore(s => s.itemFieldValues);
  const _spatialAssignments = useForemanStore(s => s.spatialAssignments);
  const entityTypeData      = useForemanStore(s => s.entityTypes);
  const [notes, setNotes]      = useState(() => loadGuideNotes());
  const [roomSubtypes]         = useState(() => loadRoomSubtypes());
  const [catTypeOverrides]     = useState(() => loadCategoryTypeOverrides());
  const [standaloneArticles, setStandaloneArticles] = useState(() => loadStandaloneArticles());
  const [associations, setAssociations] = useState(() => loadArticleAssociations());

  // Article organization (Part A) + Notebook upgrades (Part C)
  const [grouping, setGrouping]             = useState(() => loadNotebookGrouping());
  const [customOrder, setCustomOrder]       = useState(() => loadNotebookOrder());
  const [onlyDocumented, setOnlyDocumented] = useState(false);
  const [dragKey, setDragKey]               = useState(null);
  const [dragOverKey, setDragOverKey]       = useState(null);
  const [confirmDeleteArticle, setConfirmDeleteArticle] = useState(false);

  // Inline add-field state for the article spec editor (Part B)
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [newField, setNewField] = useState({ name: "", type: "text", options: "" });

  function setGroupingPersist(mode) { setGrouping(mode); saveNotebookGrouping(mode); }

  const useDefaultData = useMemo(() => loadUseDefaultData(), []);

  // Every inventory item gets an article. Enumerate items exactly like Inventory
  // (loadData + deletion filters, no task required) so defaults, custom items, and
  // task-less items all appear, and carry each item's stable key so the article
  // wires to the same custom-field storage Inventory writes to.
  const grouped = useMemo(() => {
    const rows = loadData();
    const catOrder = [], catItems = {}, byItem = {};
    rows.forEach(row => {
      if (!row._isCustom && deletedCategories.has(row.category)) return;
      if (row._isBlankCategory || !row.category || !row.item) return;
      if (deletedItems.has(getItemStableKey(row))) return;
      const mk = `${row.category}||${row.item}`;
      if (!byItem[mk]) {
        if (!catItems[row.category]) { catOrder.push(row.category); catItems[row.category] = []; }
        catItems[row.category].push(row.item);
        // First row wins (defaults precede customs in loadData), matching Inventory's stable key.
        byItem[mk] = { item: row.item, stableKey: getItemStableKey(row), tasks: [] };
      }
      if (row.task) byItem[mk].tasks.push(row);
    });
    return catOrder.map(cat => ({
      category: cat,
      categoryType: null,
      items: catItems[cat].map(item => byItem[`${cat}||${item}`]),
    }));
  }, [useDefaultData, deletedItems, deletedCategories]);

  // Item-less articles, shaped like grouped entries so they flow through the same
  // section/search/order pipeline. They carry no stable key (no inventory item).
  const standaloneEntries = useMemo(() =>
    standaloneArticles.map(a => ({
      category: "Articles",
      item: a.title || "Untitled article",
      tasks: [],
      stableKey: null,
      refKey: standaloneNoteKey(a.id),
      articleId: a.id,
      isStandalone: true,
      updatedAt: a.updatedAt,
    })),
    [standaloneArticles]
  );

  // Authoritative functional-category set (typed via `override ?? row.categoryType`),
  // the SAME source as the system picker — never the override-only map, which would
  // default un-overridden default rooms to "system" and misclassify them.
  const functionalCategorySet = useMemo(() => new Set(loadFunctionalCategories()), [catTypeOverrides, entityTypeData]);

  // Effective inventory system for an item entry — shared by the By System grouping
  // and the header "systems" stat (so they always agree). An explicit
  // systemCategory/system value, else the item's own category when that category is
  // itself functional (so default HVAC/Plumbing/etc. items resolve without an
  // explicit value). "" → Unassigned.
  function systemForEntry(entry) {
    const sk = entry.stableKey || stableKeyForItem(entry.category, entry.item, entry.tasks);
    const fv = _itemFieldValues[sk] || {};
    return fv.systemCategory || fv.system || (functionalCategorySet.has(entry.category) ? entry.category : "");
  }

  const baseSections = useMemo(
    () => buildSections(grouping, grouped, {
      notes,
      spatialAssignments: _spatialAssignments,
      customOrder,
      stableKeyFor: stableKeyForItem,
      standalone: standaloneEntries,
      systemFor: systemForEntry,
    }),
    [grouping, grouped, notes, _spatialAssignments, _itemFieldValues, customOrder, standaloneEntries, functionalCategorySet]
  );

  // Content-aware search (item name, category, note body, spec values) + documented filter.
  const sections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return baseSections
      .map(sec => ({
        ...sec,
        items: sec.items.filter(({ category, item, stableKey, refKey }) => {
          if (onlyDocumented && !notes[refKey]?.content) return false;
          if (!q) return true;
          if (item.toLowerCase().includes(q)) return true;
          if (category.toLowerCase().includes(q)) return true;
          if (notes[refKey]?.content?.toLowerCase().includes(q)) return true;
          if (stableKey) {
            const vals = { ...(_spatialAssignments[stableKey] || {}), ...(_itemFieldValues[stableKey] || {}) };
            if (Object.values(vals).some(v => v != null && String(v).toLowerCase().includes(q))) return true;
          }
          return false;
        }),
      }))
      .filter(sec => sec.items.length > 0);
  }, [baseSections, searchQuery, onlyDocumented, notes, _spatialAssignments, _itemFieldValues]);

  // Custom-mode drag reorder: persist the full ordering. Rebuild from the
  // unfiltered list so a hidden (searched/undocumented) item isn't dropped.
  function reorderCustom(targetKey) {
    if (!dragKey || dragKey === targetKey) return;
    const keys = (baseSections[0]?.items || []).map(e => e.refKey);
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(targetKey);
    if (from === -1 || to === -1) return;
    const next = [...keys];
    next.splice(from, 1);
    next.splice(to, 0, dragKey);
    setCustomOrder(next);
    saveNotebookOrder(next);
  }

  const deletedCount = useMemo(() =>
    useDefaultData
      ? defaultData.filter(row => deletedRows.has(`${row.category}|${row.item}|${row.task}`)).length
      : 0,
    [deletedRows, useDefaultData]
  );

  // Distinct inventory systems spanned by the items (matches the By System sections,
  // minus Unassigned) — the header "systems" stat. NOT grouped.length, which counts
  // every category (rooms + exteriors + safety), not just systems.
  const systemCount = useMemo(() => {
    const set = new Set();
    grouped.forEach(g => g.items.forEach(it => {
      const sys = systemForEntry({ category: g.category, item: it.item, tasks: it.tasks, stableKey: it.stableKey });
      if (sys) set.add(sys);
    }));
    return set.size;
  }, [grouped, _itemFieldValues, functionalCategorySet]);

  function handleSelect(entry) {
    setSelectedItem(entry);
    setIsEditing(false);
    setConfirmDeleteArticle(false);
  }

  // Double-clicking an article jumps straight into edit mode (parallels the
  // "Edit Article" button); selects it first so the right article is edited.
  function handleEditArticle(entry) {
    setSelectedItem(entry);
    setIsEditing(true);
    setConfirmDeleteArticle(false);
  }

  // Create a blank standalone (user-authored) article and open it in edit mode.
  function handleCreateArticle() {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    setStandaloneArticles(prev => {
      const next = [...prev, { id, title: "", createdAt: now, updatedAt: now }];
      saveStandaloneArticles(next);
      return next;
    });
    setSelectedItem({ category: "Articles", item: "Untitled article", refKey: standaloneNoteKey(id), articleId: id, isStandalone: true });
    setIsEditing(true);
    setConfirmDeleteArticle(false);
  }

  function handleRenameArticle(id, title) {
    setStandaloneArticles(prev => {
      const next = prev.map(a => a.id === id ? { ...a, title } : a);
      saveStandaloneArticles(next);
      return next;
    });
  }

  function handleDeleteArticle(id) {
    setStandaloneArticles(prev => {
      const next = prev.filter(a => a.id !== id);
      saveStandaloneArticles(next);
      return next;
    });
    setNotes(prev => {
      const noteKey = standaloneNoteKey(id);
      if (!prev[noteKey]) return prev;
      const next = { ...prev };
      delete next[noteKey];
      saveGuideNotes(next);
      return next;
    });
    setSelectedItem(null);
    setIsEditing(false);
    setConfirmDeleteArticle(false);
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

  // Selected-article identity. Item articles are keyed `${category}|${item}`;
  // standalone (user-created) articles by `standalone:<id>`, reading their live
  // title from the record so renames reflect immediately.
  const isStandalone = !!selectedItem?.isStandalone;
  const articleId = selectedItem?.articleId ?? null;
  const standaloneRecord = isStandalone ? standaloneArticles.find(a => a.id === articleId) : null;
  const refKey = selectedItem
    ? (isStandalone ? standaloneNoteKey(articleId) : `${selectedItem.category}|${selectedItem.item}`)
    : null;
  const articleTitle = isStandalone ? (standaloneRecord?.title || "Untitled article") : (selectedItem?.item || "");
  const articleEyebrow = isStandalone ? "Article" : (selectedItem?.category || "");
  // Stored associations for this article (project/task always; plus item/location/
  // system for standalone). Read early so the effective item can resolve below.
  const assoc = refKey ? (associations[refKey] || {}) : {};

  const noteData = refKey ? (notes[refKey] ?? { content: "", updatedAt: null }) : null;

  // The item this article is "about": intrinsic for item articles, or the optional
  // Item association for a standalone article. When present, its details IMPUTE the
  // article's Location/System and populate the separate "Item Details" section.
  // Reconciles with Inventory's custom-field storage via the item's stable key,
  // preferring the key carried from `grouped` (correct for task-less custom items).
  const effectiveItem = (() => {
    if (isStandalone) {
      if (!assoc.item) return null;
      const [cat, ...rest] = assoc.item.split("|");
      const item = rest.join("|");
      const it = grouped.find(g => g.category === cat)?.items.find(i => i.item === item);
      return { category: cat, item, stableKey: it?.stableKey ?? null, tasks: it?.tasks || [] };
    }
    if (!selectedItem) return null;
    const it = grouped.find(g => g.category === selectedItem.category)?.items.find(i => i.item === selectedItem.item);
    const tasks = it?.tasks || [];
    const sk = it?.stableKey ?? (refKey ? stableKeyForItem(selectedItem.category, selectedItem.item, tasks) : null);
    return { category: selectedItem.category, item: selectedItem.item, stableKey: sk, tasks };
  })();
  const effCategory = effectiveItem?.category || "";
  const effItem = effectiveItem?.item || "";
  const articleTasks = effectiveItem?.tasks || [];
  const deletedTasks = articleTasks.filter(t => deletedRows.has(`${t.category}|${t.item}|${t.task}`));
  const stableKey = effectiveItem?.stableKey ?? null;
  // Legacy item-detail specs (manufacturer/model/serial/purchase) keyed `${category}|${item}`.
  const d = effectiveItem ? ((itemDetails || {})[`${effCategory}|${effItem}`] || {}) : {};
  const cfVals = stableKey
    ? { ...(_spatialAssignments[stableKey] || {}), ...(_itemFieldValues[stableKey] || {}) }
    : {};
  const catFields = effectiveItem ? (categoryFieldSchemas[effCategory] || []) : [];
  const itmFields = stableKey ? (itemFieldSchemas[stableKey] || []) : [];
  // Fields common to this item's type (parallels Inventory's "Common" section).
  const inheritedFields = (TYPE_FIELDS[cfVals.item_type || ""] || [])
    .filter(f => !itmFields.some(s => s.id === f.id) && !catFields.some(s => s.id === f.id));
  // Surface known library fields that have stored values but no schema or inherited entry.
  const _schemaIds = new Set([...catFields, ...inheritedFields, ...itmFields].map(f => f.id));
  const orphanedArticleFields = stableKey && effectiveItem
    ? [...UNIVERSAL_FIELDS.filter(f => !STRUCTURAL_FIELD_IDS.has(f.id)), ...(ITEM_FIELDS[effItem] || [])].filter(
        f => !_schemaIds.has(f.id) && cfVals[f.id] != null && cfVals[f.id] !== ""
      )
    : [];
  const allCustomFields = [...catFields, ...inheritedFields, ...orphanedArticleFields, ...itmFields];

  // Location (room/exterior) options — the COMPLETE set, mirroring Inventory's
  // Location combo: every spatial category (rooms + exteriors) from the full
  // taxonomy (not just categories that happen to have items), unioned with any
  // labels already assigned to items. Exteriors are tracked in extSet so a write
  // routes to exteriorLabel vs roomLabel.
  const locationOptions = useMemo(() => {
    const { list, extSet } = loadLocationCategories();
    const all = new Set(list);
    const ext = new Set(extSet);
    Object.values(_spatialAssignments || {}).forEach(v => {
      if (v?.roomLabel) all.add(v.roomLabel);
      if (v?.exteriorLabel) { all.add(v.exteriorLabel); ext.add(v.exteriorLabel); }
    });
    return { list: [...all].sort(), extSet: ext };
  }, [_spatialAssignments, catTypeOverrides, entityTypeData]);
  const locationValue = cfVals.roomLabel || cfVals.exteriorLabel || "";

  // --- Article associations (classification layer) ---
  // Item articles read item/location/system live from the inventory item (above);
  // only project/task (and, for standalone, item/location/system) persist here.
  // `assoc` is resolved earlier (needed by effectiveItem).
  function setAssociation(key, value) {
    if (!refKey) return;
    setAssociations(prev => {
      const next = setAssociationIn(prev, refKey, key, value);
      saveArticleAssociations(next);
      return next;
    });
  }
  const projects = useMemo(() => loadProjects(), []);
  const projectOptions = useMemo(() => projects.map(p => ({ value: p.id, label: p.name })), [projects]);
  // Functional categories double as "systems" (mirrors Inventory's system picker).
  // Same full-taxonomy source as locationOptions, so rooms never leak in as systems
  // and item-less functional categories still appear.
  const systemSelectOptions = useMemo(() =>
    loadFunctionalCategories().sort().map(c => ({ value: c, label: c })),
    [catTypeOverrides, entityTypeData]
  );
  const locationSelectOptions = useMemo(() => locationOptions.list.map(l => ({ value: l, label: l })), [locationOptions]);
  const itemOptions = useMemo(() =>
    grouped.flatMap(g => g.items.map(it => ({ value: `${g.category}|${it.item}`, label: it.item }))),
    [grouped]
  );
  const allTaskOptions = useMemo(() =>
    grouped.flatMap(g => g.items.flatMap(it => (it.tasks || []).map(t => ({ value: `${t.category}|${t.item}|${t.task}`, label: `${t.task} · ${t.item}` })))),
    [grouped]
  );

  function setFieldValue(fieldId, value) {
    if (stableKey) useForemanStore.getState().setCustomField(stableKey, fieldId, value);
  }
  function handleLocationChange(v) {
    if (locationOptions.extSet.has(v)) {
      setFieldValue("exteriorLabel", v || null);
      if (cfVals.roomLabel) setFieldValue("roomLabel", null);
    } else {
      setFieldValue("roomLabel", v || null);
      if (cfVals.exteriorLabel) setFieldValue("exteriorLabel", null);
    }
  }
  function handleAddArticleField(field) {
    if (!stableKey) return;
    const next = { ...itemFieldSchemas, [stableKey]: [...(itemFieldSchemas[stableKey] || []), field] };
    setItemFieldSchemas(next);
    saveItemFieldSchemas(next);
  }
  function handleDeleteArticleField(fieldId) {
    if (!stableKey) return;
    const next = { ...itemFieldSchemas, [stableKey]: (itemFieldSchemas[stableKey] || []).filter(f => f.id !== fieldId) };
    setItemFieldSchemas(next);
    saveItemFieldSchemas(next);
  }
  function openInInventory() {
    if (!selectedItem) return;
    useForemanStore.getState().openItemDetail(`${selectedItem.category}|${selectedItem.item}`);
    navigate("inventory");
  }

  function formatCustomValue(field) {
    const v = cfVals[field.id];
    if (!v && v !== 0) return null;
    if (field.type === "date") {
      const parsed = new Date(v);
      return isNaN(parsed) ? v : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return String(v);
  }

  const articleFieldStyle = { background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", boxSizing: "border-box", color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", outline: "none", padding: "0.3rem 0.5rem", width: "100%" };
  const specLabelStyle = { color: "var(--fm-ink-dim)", display: "block", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.12em", marginBottom: "0.25rem", textTransform: "uppercase" };
  const chipBtn = { background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "3px", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.04em", padding: "0.2rem 0.55rem", transition: "all 0.12s" };
  const svgArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235a5460'/%3E%3C/svg%3E")`;
  // Section heading separating the "Article" classification fields from "Item Details".
  const groupHeadingStyle = { color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.14em", marginBottom: "0.6rem", textTransform: "uppercase" };

  function renderArticleFieldInput(field) {
    const val = cfVals[field.id] ?? "";
    const onChange = v => setFieldValue(field.id, v);
    if (field.id === "manufacturer") {
      return <ModelComboField value={val} models={getManufacturers(effItem)} fieldStyle={articleFieldStyle} onChange={onChange} />;
    }
    if (field.id === "model") {
      return <ModelComboField value={val} models={getModels(cfVals.manufacturer || "", effItem)} fieldStyle={articleFieldStyle} onChange={onChange} />;
    }
    if (field.type === "list" && field.options?.length > 0) {
      return (
        <select value={val} onChange={e => onChange(e.target.value)} style={{ ...articleFieldStyle, appearance: "none", backgroundImage: svgArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center", cursor: "pointer", paddingRight: "1.5rem" }} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}>
          <option value="">—</option>
          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (field.type === "receipt") {
      const receipt = cfVals[field.id];
      return receipt
        ? <img src={receipt} alt="Receipt" onClick={() => window.open(receipt, "_blank")} style={{ border: "1px solid var(--fm-hairline2)", borderRadius: "3px", cursor: "pointer", height: 44, objectFit: "cover", width: 66 }} />
        : <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem" }}>Manage from Inventory</span>;
    }
    return <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={val} onChange={e => onChange(e.target.value)} placeholder="—" style={articleFieldStyle} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"} />;
  }

  // Native <select> styled like the article's other fields, for associations.
  function renderAssocSelect(label, value, options, onChange) {
    return (
      <div style={{ width: "150px" }}>
        <span style={specLabelStyle}>{label}</span>
        <select
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          style={{ ...articleFieldStyle, appearance: "none", backgroundImage: svgArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center", cursor: "pointer", paddingRight: "1.5rem" }}
          onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
          onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
        >
          <option value="">—</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }

  // Read-only field styled like the others — for associations imputed from the item.
  function renderStaticField(label, value) {
    return (
      <div style={{ width: "150px" }}>
        <span style={specLabelStyle}>{label}</span>
        <div title={value || ""} style={{ ...articleFieldStyle, color: value ? "var(--fm-ink-dim)" : "var(--fm-ink-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || "—"}
        </div>
      </div>
    );
  }

  const presentFieldIds = new Set(allCustomFields.map(f => f.id));
  const universalAvail = UNIVERSAL_FIELDS.filter(f => !STRUCTURAL_FIELD_IDS.has(f.id) && !presentFieldIds.has(f.id));
  const itemLibAvail = effectiveItem ? (ITEM_FIELDS[effItem] || []).filter(f => !presentFieldIds.has(f.id)) : [];

  // An article is "associated with an item" when it resolves to an inventory stable
  // key — intrinsically (item article) or via the Item association (standalone).
  // `itemIsIntrinsic` distinguishes the item article, whose Location stays editable
  // and two-way synced with Inventory; a standalone merely *references* its item, so
  // its imputed Location/System are shown read-only (edit them in Inventory).
  const hasItem = !!stableKey;
  const itemIsIntrinsic = hasItem && !isStandalone;
  const systemValue = cfVals.systemCategory || cfVals.system || "";

  // Task picker options: an article with an item defaults to that item's tasks;
  // an item-less article can reference any task across the inventory.
  const itemTaskOptions = articleTasks.map(t => ({ value: `${t.category}|${t.item}|${t.task}`, label: t.task }));
  const taskSelectOptions = hasItem ? itemTaskOptions : allTaskOptions;

  // Read-mode values, split into the two groups the editor uses.
  // Article (classification): Location/System impute from the item when present,
  // else fall back to the stored standalone association.
  const locationDisplay = hasItem ? locationValue : (assoc.location || "");
  const systemDisplay = hasItem ? systemValue : (assoc.system || "");
  const articleChips = [];
  if (isStandalone && effItem) articleChips.push({ label: "Item", value: effItem });
  if (locationDisplay) articleChips.push({ label: "Location", value: locationDisplay });
  if (systemDisplay) articleChips.push({ label: "System", value: systemDisplay });
  if (assoc.project) {
    const p = projects.find(pr => pr.id === assoc.project);
    if (p) articleChips.push({ label: "Project", value: p.name });
  }
  if (assoc.task) articleChips.push({ label: "Task", value: assoc.task.split("|").slice(2).join("|") || assoc.task });
  // Item Details (specs of the associated item).
  const hasItemSpecs = hasItem && (cfVals.item_type
    || d.manufacturer || d.model || d.serial || d.purchaseDate
    || allCustomFields.some(f => formatCustomValue(f)));
  const showDetail = isEditing || articleChips.length > 0 || hasItemSpecs;

  return (
    <div style={{ background: "var(--fm-bg)", color: "var(--fm-ink)", display: "flex", flexDirection: "column", fontFamily: "var(--fm-sans)", height: "100vh", overflow: "hidden" }}>
      <style>{EDITOR_STYLES}</style>

      <FmHeader active="Notebook" tagline="Notebook" />
      <FmSubnav
        tabs={["Notebook"]}
        active="Notebook"
        stats={[
          { value: grouped.reduce((n, g) => n + g.items.length, 0), label: "items" },
          { value: systemCount, label: "systems" },
          { value: standaloneArticles.length, color: "var(--fm-brass)", label: "articles" },
        ]}
      />

      {!useDefaultData && grouped.length === 0 && standaloneArticles.length === 0 && (
        <div style={{ alignItems: "center", display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", padding: "4rem 2rem" }}>
          <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.2em", marginBottom: "0.75rem", textTransform: "uppercase" }}>Guide</div>
          <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.1rem", marginBottom: "0.5rem" }}>Your guide is empty</div>
          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.75rem", lineHeight: 1.7, maxWidth: "340px", textAlign: "center" }}>
            Your guide will populate as you add items and maintenance tasks to your inventory — or start a standalone article now.
          </div>
          <button
            onClick={handleCreateArticle}
            style={{ background: "var(--fm-brass)", border: "none", borderRadius: "var(--fm-radius)", color: "var(--fm-bg)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", letterSpacing: "0.08em", marginTop: "1.25rem", padding: "0.5rem 1.2rem", transition: "opacity 0.12s" }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >+ New Article</button>
        </div>
      )}

      {(useDefaultData || grouped.length > 0 || standaloneArticles.length > 0) && (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* Left panel: article tree */}
          <div style={{ borderRight: "var(--fm-border)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden", width: "300px" }}>
            {/* Search + organization controls */}
            <div style={{ borderBottom: "var(--fm-border)", display: "flex", flexDirection: "column", flexShrink: 0, gap: "0.45rem", padding: "0.65rem 0.85rem" }}>
              <input
                type="text"
                placeholder="Search items, notes, specs…"
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
              <div style={{ alignItems: "center", display: "flex", gap: "0.35rem", justifyContent: "space-between" }}>
                <FilterDropdown
                  value={grouping}
                  options={NOTEBOOK_GROUPINGS}
                  onChange={setGroupingPersist}
                  defaultValue="system"
                  minWidth={130}
                />
                <FilterPill active={onlyDocumented} onClick={() => setOnlyDocumented(v => !v)}>
                  Exclude Blanks
                </FilterPill>
              </div>
              <button
                onClick={handleCreateArticle}
                style={{ alignItems: "center", background: "var(--fm-bg-sunk)", border: "1px dashed var(--fm-hairline2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", cursor: "pointer", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", justifyContent: "center", letterSpacing: "0.06em", padding: "0.4rem", transition: "all 0.12s", width: "100%" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
              >+ New Article</button>
            </div>

            {/* Article list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0.4rem 0" }}>
              {sections.length === 0 && (
                <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.7rem", padding: "0.9rem 1rem", textAlign: "center" }}>
                  No articles match.
                </div>
              )}
              {sections.map(({ label, items }) => (
                <div key={label}>
                  <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.14em", padding: "0.55rem 1rem 0.2rem", textTransform: "uppercase" }}>
                    {label}
                  </div>
                  {items.map(entry => {
                    const key = entry.refKey;
                    const isActive = key === refKey;
                    const note = notes[key];
                    const isCustom = grouping === "custom";
                    const isDragging = dragKey === key;
                    const isDragOver = dragOverKey === key && dragKey && dragKey !== key;
                    const subParts = [];
                    // Show the item's category as context, except when it would just
                    // repeat the section header (e.g. an HVAC item under the "HVAC"
                    // system, or a standalone under "Articles").
                    if (entry.category && entry.category !== label) subParts.push(entry.category);
                    if (note?.updatedAt) subParts.push(timeAgo(note.updatedAt));
                    return (
                      <button
                        key={key}
                        draggable={isCustom}
                        onDragStart={isCustom ? () => setDragKey(key) : undefined}
                        onDragOver={isCustom ? (e => { e.preventDefault(); setDragOverKey(key); }) : undefined}
                        onDrop={isCustom ? (e => { e.preventDefault(); reorderCustom(key); setDragKey(null); setDragOverKey(null); }) : undefined}
                        onDragEnd={isCustom ? (() => { setDragKey(null); setDragOverKey(null); }) : undefined}
                        onClick={() => handleSelect(entry)}
                        onDoubleClick={() => handleEditArticle(entry)}
                        style={{
                          background: isActive ? "var(--fm-bg-raised)" : "transparent",
                          border: "none",
                          borderLeft: `2px solid ${isActive ? "var(--fm-brass)" : "transparent"}`,
                          borderTop: `2px solid ${isDragOver ? "var(--fm-brass)" : "transparent"}`,
                          cursor: isCustom ? "grab" : "pointer",
                          display: "block",
                          opacity: isDragging ? 0.3 : 1,
                          padding: "0.26rem 0.85rem 0.26rem 0.75rem",
                          textAlign: "left",
                          transition: "background 0.12s",
                          width: "100%",
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--fm-bg-raised)"; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                      >
                        <div style={{ alignItems: "center", display: "flex", gap: "0.3rem" }}>
                          {isCustom && (
                            <span style={{ color: "var(--fm-ink-mute)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.7rem", lineHeight: 1 }}>⠿</span>
                          )}
                          <div style={{ color: isActive ? "var(--fm-ink)" : "var(--fm-ink-dim)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {entry.item}
                          </div>
                          {note?.content && (
                            <span title="Documented" style={{ background: "var(--fm-brass)", borderRadius: "50%", flexShrink: 0, height: 5, width: 5 }} />
                          )}
                        </div>
                        {subParts.length > 0 && (
                          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.51rem", marginTop: "0.07rem", overflow: "hidden", paddingLeft: isCustom ? "1rem" : 0, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {subParts.join(" · ")}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}

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
                  Select an article to read or edit it
                </div>
              </div>
            )}

            {/* Article view */}
            {selectedItem && (
              <>
                {/* Article header */}
                <div style={{ borderBottom: "var(--fm-border)", flexShrink: 0, padding: "1.75rem 2.5rem 1.25rem" }}>
                  <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.14em", marginBottom: "0.4rem", textTransform: "uppercase" }}>
                    {articleEyebrow}
                  </div>
                  {isStandalone && isEditing ? (
                    <input
                      value={standaloneRecord?.title || ""}
                      placeholder="Untitled article"
                      onChange={e => handleRenameArticle(articleId, e.target.value)}
                      style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: "var(--fm-radius)", boxSizing: "border-box", color: "var(--fm-ink)", display: "block", fontFamily: "var(--fm-serif)", fontSize: "1.4rem", margin: "0 0 0.4rem", maxWidth: "520px", outline: "none", padding: "0.2rem 0.5rem", width: "100%" }}
                      onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
                      onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
                    />
                  ) : (
                    <h1 style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.4rem", fontWeight: 400, margin: "0 0 0.4rem" }}>
                      {articleTitle}
                    </h1>
                  )}
                  <div style={{ alignItems: "center", color: "var(--fm-ink-mute)", display: "flex", flexWrap: "wrap", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", gap: "0.6rem" }}>
                    <span>
                      {noteData?.updatedAt ? `Updated ${timeAgo(noteData.updatedAt)}` : "No notes yet"}
                      {articleTasks.length > 0 && ` · ${articleTasks.length} task${articleTasks.length !== 1 ? "s" : ""}`}
                    </span>
                    {!isStandalone && (
                      <button
                        onClick={openInInventory}
                        style={{ background: "none", border: "none", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.04em", padding: 0, transition: "color 0.12s" }}
                        onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
                        onMouseLeave={e => e.currentTarget.style.color = "var(--fm-brass-dim)"}
                      >Open in Inventory →</button>
                    )}
                  </div>
                  {showDetail && (
                    <div style={{ borderTop: "var(--fm-border)", marginTop: "0.85rem", paddingTop: "0.85rem" }}>
                      {isEditing ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                          {/* Article — the classification fields, grouped on their own */}
                          <div>
                            <div style={groupHeadingStyle}>Article</div>
                            <div style={{ alignItems: "flex-start", columnGap: "1rem", display: "flex", flexWrap: "wrap", rowGap: "0.65rem" }}>
                              {isStandalone && renderAssocSelect("Item", assoc.item, itemOptions, v => setAssociation("item", v))}
                              {itemIsIntrinsic ? (
                                <div style={{ width: "150px" }}>
                                  <span style={specLabelStyle}>Location</span>
                                  <ModelComboField value={locationValue} models={locationOptions.list} fieldStyle={articleFieldStyle} onChange={handleLocationChange} />
                                </div>
                              ) : hasItem ? (
                                renderStaticField("Location", locationValue)
                              ) : (
                                renderAssocSelect("Location", assoc.location, locationSelectOptions, v => setAssociation("location", v))
                              )}
                              {hasItem
                                ? renderStaticField("System", systemValue)
                                : renderAssocSelect("System", assoc.system, systemSelectOptions, v => setAssociation("system", v))}
                              {renderAssocSelect("Project", assoc.project, projectOptions, v => setAssociation("project", v))}
                              {renderAssocSelect("Task", assoc.task, taskSelectOptions, v => setAssociation("task", v))}
                            </div>
                          </div>

                          {/* Item Details — specs of the associated inventory item */}
                          {hasItem && (
                            <div>
                              <div style={groupHeadingStyle}>Item Details</div>
                              <div style={{ alignItems: "flex-start", columnGap: "1rem", display: "flex", flexWrap: "wrap", rowGap: "0.65rem" }}>
                                {allCustomFields.map(field => {
                                  const deletable = itmFields.some(s => s.id === field.id);
                                  return (
                                    <div key={field.id} style={{ width: "150px" }}>
                                      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
                                        <span style={specLabelStyle}>{field.name}</span>
                                        {deletable && (
                                          <button onClick={() => handleDeleteArticleField(field.id)} title="Remove field" style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.85rem", lineHeight: 1, marginBottom: "0.25rem", padding: "0 0.1rem", transition: "color 0.15s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>×</button>
                                        )}
                                      </div>
                                      {renderArticleFieldInput(field)}
                                    </div>
                                  );
                                })}
                              </div>
                              <div style={{ marginTop: "0.75rem", maxWidth: "460px" }}>
                                {showFieldPicker ? (
                                  <div style={{ background: "var(--fm-bg)", border: "1px solid var(--fm-hairline)", borderRadius: "4px", padding: "0.6rem 0.75rem" }}>
                                    {universalAvail.length > 0 && (
                                      <>
                                        <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.12em", marginBottom: "0.4rem", textTransform: "uppercase" }}>Common</div>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem" }}>
                                          {universalAvail.map(f => (
                                            <button key={f.id} onClick={() => handleAddArticleField(f)} style={chipBtn} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}>{f.name}</button>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                    {itemLibAvail.length > 0 && (
                                      <>
                                        <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.12em", marginBottom: "0.4rem", textTransform: "uppercase" }}>For {effItem}</div>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem" }}>
                                          {itemLibAvail.map(f => (
                                            <button key={f.id} onClick={() => handleAddArticleField(f)} style={chipBtn} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}>{f.name}</button>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                    {universalAvail.length === 0 && itemLibAvail.length === 0 && (
                                      <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", marginBottom: "0.5rem" }}>All library fields added</div>
                                    )}
                                    <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.12em", marginBottom: "0.4rem", textTransform: "uppercase" }}>Custom</div>
                                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: newField.type === "list" ? "0.4rem" : "0.5rem" }}>
                                      <input autoFocus placeholder="Field name" value={newField.name} onChange={e => setNewField(f => ({ ...f, name: e.target.value }))} style={{ ...articleFieldStyle, flex: 1 }} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"} onKeyDown={e => { if (e.key === "Escape") { setShowFieldPicker(false); setNewField({ name: "", type: "text", options: "" }); } }} />
                                      <select value={newField.type} onChange={e => setNewField(f => ({ ...f, type: e.target.value }))} style={{ ...articleFieldStyle, appearance: "none", backgroundImage: svgArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.4rem center", cursor: "pointer", flex: "0 0 76px", paddingRight: "1.25rem" }} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}>
                                        <option value="text">Text</option>
                                        <option value="number">Number</option>
                                        <option value="date">Date</option>
                                        <option value="list">List</option>
                                      </select>
                                    </div>
                                    {newField.type === "list" && (
                                      <input placeholder="Options, comma-separated" value={newField.options} onChange={e => setNewField(f => ({ ...f, options: e.target.value }))} style={{ ...articleFieldStyle, marginBottom: "0.5rem" }} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"} />
                                    )}
                                    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "space-between" }}>
                                      <button onClick={() => { setShowFieldPicker(false); setNewField({ name: "", type: "text", options: "" }); }} style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: "0.25rem 0" }}>Close</button>
                                      <button onClick={() => { if (!newField.name.trim()) return; handleAddArticleField({ id: crypto.randomUUID(), name: newField.name.trim(), type: newField.type, options: newField.type === "list" ? newField.options.split(",").map(s => s.trim()).filter(Boolean) : [] }); setNewField({ name: "", type: "text", options: "" }); }} disabled={!newField.name.trim()} style={{ background: newField.name.trim() ? "var(--fm-brass)18" : "transparent", border: `1px solid ${newField.name.trim() ? "var(--fm-brass)40" : "var(--fm-ink-dim)"}`, borderRadius: "3px", color: newField.name.trim() ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: newField.name.trim() ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: "0.25rem 0.65rem" }}>+ Add custom</button>
                                    </div>
                                  </div>
                                ) : (
                                  <button onClick={() => setShowFieldPicker(true)} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", letterSpacing: "0.05em", padding: "0.2rem 0", transition: "color 0.15s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>+ Add Field</button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                          {articleChips.length > 0 && (
                            <div>
                              <div style={groupHeadingStyle}>Article</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem" }}>
                                {articleChips.map(c => <Spec key={c.label} label={c.label} value={c.value} />)}
                              </div>
                            </div>
                          )}
                          {hasItemSpecs && (
                            <div>
                              <div style={groupHeadingStyle}>Item Details</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem" }}>
                                {cfVals.item_type && <Spec label="Type" value={cfVals.item_type} />}
                                {allCustomFields.map(field => {
                                  const v = formatCustomValue(field);
                                  return v ? <Spec key={field.id} label={field.name} value={v} /> : null;
                                })}
                                {!presentFieldIds.has("manufacturer") && d.manufacturer && <Spec label="Manufacturer" value={d.manufacturer} />}
                                {!presentFieldIds.has("model") && d.model && <Spec label="Model" value={d.model} />}
                                {!presentFieldIds.has("serial") && d.serial && <Spec label="Serial" value={d.serial} />}
                                {!presentFieldIds.has("purchase_date") && d.purchaseDate && <Spec label="Purchased" value={formatPurchaseDate(d.purchaseDate)} />}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Article body */}
                <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}>
                  {noteData !== null && (
                    <NoteEditor
                      key={refKey}
                      initialContent={noteData.content}
                      onSave={content => handleNoteSave(refKey, content)}
                      readOnly={!isEditing}
                      contentPadding={isEditing ? "0.75rem 1rem" : "1.5rem 2.5rem"}
                      onBeginEdit={() => setIsEditing(true)}
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
                <div style={{ alignItems: "center", borderTop: "var(--fm-border)", display: "flex", flexShrink: 0, gap: "0.65rem", justifyContent: "space-between", padding: "0.65rem 1.5rem" }}>
                  <div style={{ alignItems: "center", display: "flex", gap: "0.5rem" }}>
                    {isStandalone && isEditing && (
                      confirmDeleteArticle ? (
                        <>
                          <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>Delete this article?</span>
                          <button
                            onClick={() => handleDeleteArticle(articleId)}
                            style={{ background: "var(--fm-red)", border: "none", borderRadius: "var(--fm-radius)", color: "#fff", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.06em", padding: "0.35rem 0.9rem" }}
                          >Delete</button>
                          <button
                            onClick={() => setConfirmDeleteArticle(false)}
                            style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", padding: "0.35rem 0.5rem" }}
                          >Cancel</button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteArticle(true)}
                          style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.4rem 0", transition: "color 0.12s" }}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                        >Delete article</button>
                      )
                    )}
                  </div>
                  {isEditing ? (
                    <button
                      onClick={() => { setIsEditing(false); setConfirmDeleteArticle(false); }}
                      style={{ background: "var(--fm-brass)", border: "none", borderRadius: "var(--fm-radius)", color: "var(--fm-bg)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.08em", padding: "0.4rem 1.1rem", transition: "opacity 0.12s" }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                      onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                    >
                      Done
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsEditing(true)}
                      style={{ background: "transparent", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.08em", padding: "0.4rem 1.1rem", transition: "all 0.12s" }}
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
