import { useState, useRef } from "react";
import { Pencil, GripVertical } from "lucide-react";
import { ConfirmButton } from "./ui.jsx";
import { RESOURCE_GROUPS } from "../lib/constants.js";

export function ResourceListEditor({ list, hint, onAdd, onRemove, onSetList, placeholder }) {
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editValue, setEditValue] = useState("");
  const [dragOverIndex, setDragOverIndex] = useState(-1);
  const dragIndexRef = useRef(null);

  const add = () => {
    const v = draft.trim();
    if (!v || list.includes(v)) { setDraft(""); return; }
    onAdd(v); setDraft("");
  };
  const startEdit = (i) => { setEditingIndex(i); setEditValue(list[i]); };
  const saveEdit = () => {
    const v = editValue.trim();
    if (v && v !== list[editingIndex] && !list.includes(v)) {
      const next = [...list];
      next[editingIndex] = v;
      onSetList(next);
    }
    setEditingIndex(-1);
  };
  const handleDrop = (targetIndex) => {
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(-1);
    if (from === null || from === targetIndex) return;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    onSetList(next);
  };

  return (
    <div>
      {hint ? <p className="field-hint" style={{ marginBottom: 12 }}>{hint}</p> : null}
      <div className="resource-add">
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()} placeholder={placeholder} />
        <button type="button" className="btn btn-primary" onClick={add}>Thêm</button>
      </div>
      <div className="resource-list">
        {list.length === 0 ? <p className="empty-note">Chưa có mục nào.</p> : null}
        {list.map((item, i) => (
          <div key={i} className={`resource-item resource-item-draggable ${dragOverIndex === i ? "resource-item-dragover" : ""}`}
            draggable
            onDragStart={() => { dragIndexRef.current = i; }}
            onDragOver={(e) => { e.preventDefault(); if (dragOverIndex !== i) setDragOverIndex(i); }}
            onDragLeave={() => setDragOverIndex((cur) => (cur === i ? -1 : cur))}
            onDrop={(e) => { e.preventDefault(); handleDrop(i); }}
            onDragEnd={() => { dragIndexRef.current = null; setDragOverIndex(-1); }}
          >
            <span className="drag-handle" title="Kéo để đổi thứ tự"><GripVertical size={14} /></span>
            {editingIndex === i ? (
              <input className="input input-inline" style={{ flex: 1 }} value={editValue} autoFocus
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                onBlur={saveEdit} />
            ) : (
              <span style={{ flex: 1, cursor: "text" }} onClick={() => startEdit(i)}>{item}</span>
            )}
            <span style={{ display: "flex", gap: 4 }}>
              <button type="button" className="row-btn" onClick={() => startEdit(i)} aria-label="Sửa"><Pencil size={13} /></button>
              <ConfirmButton onConfirm={() => onRemove(item)} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResourceManager({ resources, onChange }) {
  const [activeGroup, setActiveGroup] = useState(RESOURCE_GROUPS[0].key);
  const group = RESOURCE_GROUPS.find((g) => g.key === activeGroup);
  const [activeChild, setActiveChild] = useState(group.children ? group.children[0].key : null);
  const selectGroup = (g) => { setActiveGroup(g.key); setActiveChild(g.children ? g.children[0].key : null); };
  const childDef = group.children ? (group.children.find((c) => c.key === activeChild) || group.children[0]) : null;

  return (
    <div className="resource-wrap">
      <div className="resource-tabs">
        {RESOURCE_GROUPS.map((g) => (
          <button key={g.key} className={`resource-tab ${activeGroup === g.key ? "resource-tab-active" : ""}`} onClick={() => selectGroup(g)}>{g.label}</button>
        ))}
      </div>
      <div className="resource-panel">
        <div>
          {group.children.length > 1 ? (
            <div className="subtabs">
              {group.children.map((c) => (
                <button key={c.key} className={`subtab ${activeChild === c.key ? "subtab-active" : ""}`} onClick={() => setActiveChild(c.key)}>{c.label}</button>
              ))}
            </div>
          ) : null}
          <ResourceListEditor list={resources[childDef.key] || []} hint={childDef.hint} placeholder={`Thêm mục cho "${childDef.label}"...`}
            onAdd={(v) => onChange({ ...resources, [childDef.key]: [...(resources[childDef.key] || []), v] })}
            onRemove={(item) => onChange({ ...resources, [childDef.key]: (resources[childDef.key] || []).filter((x) => x !== item) })}
            onSetList={(next) => onChange({ ...resources, [childDef.key]: next })} />
        </div>
      </div>
    </div>
  );
}
