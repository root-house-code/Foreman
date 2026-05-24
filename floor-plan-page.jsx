import { useState, useMemo } from "react";
import FmHeader from "./src/components/FmHeader.jsx";
import { FloorPlan } from "./inventory-page.jsx";
import { loadData, loadCustomData, saveCustomData, loadOverrides, saveOverrides, defaultData } from "./lib/data.js";
import { loadDeletedCategories, saveDeletedCategories } from "./lib/deletedCategories.js";
import { loadDeletedItems } from "./lib/deletedItems.js";
import { loadCustomFieldValues, saveCustomFieldValues } from "./lib/customFields.js";
import { loadCategoryTypeOverrides, saveCategoryTypeOverrides } from "./lib/categoryTypes.js";
import { loadEntityTypes, isSpatial, resolveTypeId } from "./lib/entityTypes.js";
import { loadChores, saveChores } from "./lib/chores.js";
import { loadTodos, saveTodos } from "./lib/todos.js";
import { loadProjects, saveProjects } from "./lib/projects.js";

export default function FloorPlanPage({ navigate }) {
  const [rows, setRows] = useState(() => loadData());
  const [deletedCategories, setDeletedCategories] = useState(() => loadDeletedCategories());
  const [deletedItems, setDeletedItems] = useState(() => loadDeletedItems());
  const [customFieldValues, setCustomFieldValues] = useState(() => loadCustomFieldValues());
  const [categoryTypeOverrides, setCategoryTypeOverrides] = useState(() => loadCategoryTypeOverrides());
  const [entityTypeData] = useState(() => loadEntityTypes());

  const defaultCategoryTypes = useMemo(() => {
    const map = {};
    rows.forEach(row => {
      if (!row.category || !row.categoryType) return;
      if (!map[row.category] || row._isCustom) map[row.category] = row.categoryType;
    });
    return map;
  }, [rows]);

  const CATEGORY_ITEMS = useMemo(() => {
    const map = {};
    rows.forEach(row => {
      if (!row._isCustom && deletedCategories.has(row.category)) return;
      if (row._isBlankCategory) { if (row.category) map[row.category] = map[row.category] || []; return; }
      if (!row.category || !row.item) return;
      if (deletedItems.has(`${row.category}|${row.item}`)) return;
      if (!map[row.category]) map[row.category] = [];
      if (!map[row.category].includes(row.item)) map[row.category].push(row.item);
    });
    return map;
  }, [rows, deletedCategories, deletedItems]);

  const CATEGORIES = Object.keys(CATEGORY_ITEMS);

  const effectiveCategoryTypes = useMemo(() => {
    const result = {};
    CATEGORIES.forEach(cat => {
      result[cat] = categoryTypeOverrides[cat] ?? defaultCategoryTypes[cat] ?? "system";
    });
    return result;
  }, [CATEGORIES, categoryTypeOverrides, defaultCategoryTypes]);

  function reloadAll() {
    setRows(loadData());
    setDeletedCategories(loadDeletedCategories());
    setDeletedItems(loadDeletedItems());
    setCustomFieldValues(loadCustomFieldValues());
  }

  function handleCreateCategory(name, type) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const customs = loadCustomData();
    saveCustomData([...customs, {
      _id: `custom-${Date.now()}`, _isCustom: true, _defaultKey: null, _isBlankCategory: true,
      category: trimmed, item: "", task: "", schedule: "", season: null, categoryType: type,
    }]);
    reloadAll();
  }

  function handleRenameCategory(oldName, newName) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;

    const customs = loadCustomData();
    saveCustomData(customs.map(r => r.category === oldName ? { ...r, category: trimmed } : r));

    const overrides = loadOverrides();
    defaultData.forEach(row => {
      if (row.category === oldName) {
        const key = `${row.category}|${row.item}|${row.task}`;
        overrides[key] = { ...(overrides[key] || {}), category: trimmed };
      }
    });
    saveOverrides(overrides);

    if (categoryTypeOverrides[oldName] !== undefined) {
      const next = { ...categoryTypeOverrides, [trimmed]: categoryTypeOverrides[oldName] };
      delete next[oldName];
      saveCategoryTypeOverrides(next);
      setCategoryTypeOverrides(next);
    }

    const etData = loadEntityTypes();
    const typeId = resolveTypeId(oldName, effectiveCategoryTypes[oldName] || "system");
    const isRoom = isSpatial(typeId, etData);

    const chores = loadChores();
    const updChores = chores.map(c => c.room === oldName ? { ...c, room: trimmed } : c);
    if (updChores.some((c, i) => c.room !== chores[i].room)) saveChores(updChores);

    const todos = loadTodos();
    const updTodos = todos.map(t => {
      if (isRoom && t.linkedRoom === oldName) return { ...t, linkedRoom: trimmed };
      if (!isRoom && t.linkedSystem === oldName) return { ...t, linkedSystem: trimmed };
      if (t.linkedCategory === oldName) return { ...t, linkedCategory: trimmed };
      return t;
    });
    if (updTodos.some((t, i) => t !== todos[i])) saveTodos(updTodos);

    const projects = loadProjects();
    const updProjects = projects.map(p => {
      if (isRoom && p.linkedRoom === oldName) return { ...p, linkedRoom: trimmed };
      if (!isRoom && p.linkedSystem === oldName) return { ...p, linkedSystem: trimmed };
      return p;
    });
    if (updProjects.some((p, i) => p !== projects[i])) saveProjects(updProjects);

    reloadAll();
  }

  function handleDeleteCategory(category) {
    if (!window.confirm(`Delete "${category}"? This cannot be undone.`)) return;
    const isDefault = rows.some(r => r.category === category && !r._isCustom);
    if (isDefault) {
      const deleted = loadDeletedCategories();
      deleted.add(category);
      saveDeletedCategories(deleted);
    } else {
      const customs = loadCustomData();
      saveCustomData(customs.filter(r => r.category !== category));
    }
    reloadAll();
  }

  function handleFieldChange(category, item, fieldId, value) {
    const key = `${category}|${item}`;
    const cfVals = loadCustomFieldValues();
    const next = { ...cfVals, [key]: { ...(cfVals[key] || {}), [fieldId]: value } };
    saveCustomFieldValues(next);
    setCustomFieldValues(next);
  }

  function handleChangeCategoryType(categoryLabel, newType) {
    if (effectiveCategoryTypes[categoryLabel] === newType) return;
    const next = { ...categoryTypeOverrides };
    if (defaultCategoryTypes[categoryLabel] === newType) {
      delete next[categoryLabel];
    } else {
      next[categoryLabel] = newType;
    }
    saveCategoryTypeOverrides(next);
    setCategoryTypeOverrides(next);
  }

  function handleAddItem(category, itemName) {
    const trimmed = itemName.trim();
    if (!trimmed || !category) return;
    const customs = loadCustomData();
    saveCustomData([...customs, {
      _id: `custom-${Date.now()}`, _isCustom: true, _defaultKey: null,
      category, item: trimmed, task: "", schedule: "", season: null,
    }]);
    reloadAll();
  }

  function handleCreateLinkedItem(category, itemName) {
    const customs = loadCustomData();
    if (customs.some(r => r.category === category && r.item === itemName)) return;
    saveCustomData([...customs, {
      _id: `custom-${Date.now()}`, _isCustom: true, _defaultKey: null,
      category, item: itemName, task: "", schedule: "", season: null,
    }]);
    reloadAll();
  }

  function handleDeleteLinkedItem(category, itemName) {
    const customs = loadCustomData();
    saveCustomData(customs.filter(r => !(r.category === category && r.item === itemName && r._isCustom)));
    const cfVals = loadCustomFieldValues();
    const key = `${category}|${itemName}`;
    const { [key]: _removed, ...rest } = cfVals;
    saveCustomFieldValues(rest);
    reloadAll();
  }

  function handleRenameLinkedItem(category, oldName, newName) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    const customs = loadCustomData();
    saveCustomData(customs.map(r =>
      r.category === category && r.item === oldName && r._isCustom ? { ...r, item: trimmed } : r
    ));
    const cfVals = loadCustomFieldValues();
    const oldKey = `${category}|${oldName}`;
    const newKey = `${category}|${trimmed}`;
    if (cfVals[oldKey]) {
      const { [oldKey]: oldVals, ...rest } = cfVals;
      saveCustomFieldValues({ ...rest, [newKey]: oldVals });
    }
    reloadAll();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <FmHeader active="Floor Plan" tagline="Floor Plan" />
      <FloorPlan
        categories={CATEGORIES}
        categoryTypes={effectiveCategoryTypes}
        categoryItems={CATEGORY_ITEMS}
        entityTypeData={entityTypeData}
        onCreateCategory={handleCreateCategory}
        onRenameCategory={handleRenameCategory}
        onDeleteCategory={handleDeleteCategory}
        onFieldChange={handleFieldChange}
        onChangeCategoryType={handleChangeCategoryType}
        onAddItem={handleAddItem}
        customFieldValues={customFieldValues}
        onCreateLinkedItem={handleCreateLinkedItem}
        onDeleteLinkedItem={handleDeleteLinkedItem}
        onRenameLinkedItem={handleRenameLinkedItem}
      />
    </div>
  );
}
