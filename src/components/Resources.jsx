import { useState, useRef } from "react";
import { Pencil, GripVertical } from "lucide-react";
import { ConfirmButton } from "./ui.jsx";
import { RESOURCE_GROUPS, sortStructureScores } from "../lib/constants.js";
import { normalizeStructureScore, structureScaleRange } from "../lib/helpers.js";

// `normalize` (tùy chọn) kiểm và viết lại giá trị trước khi thêm/đổi tên: trả { value } hoặc
// { error }. `sorted` = danh sách tự xếp thứ tự, nên tắt kéo-thả — kéo được mà thả xong nó
// nhảy về chỗ cũ thì trông như hỏng.
export function ResourceListEditor({ list, hint, onAdd, onRemove, onSetList, placeholder, normalize, sorted }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editValue, setEditValue] = useState("");
  const [dragOverIndex, setDragOverIndex] = useState(-1);
  const dragIndexRef = useRef(null);
  const clean = (raw) => (normalize ? normalize(raw) : { value: String(raw || "").trim() });

  const add = () => {
    const r = clean(draft);
    if (r.error) { setError(r.error); return; }
    setError("");
    const v = r.value;
    if (!v || list.includes(v)) { setDraft(""); return; }
    onAdd(v); setDraft("");
  };
  const startEdit = (i) => { setEditingIndex(i); setEditValue(list[i]); setError(""); };
  const saveEdit = () => {
    const r = clean(editValue);
    if (r.error) { setError(r.error); setEditingIndex(-1); return; }
    const v = r.value;
    if (v && v !== list[editingIndex] && !list.includes(v)) {
      const oldName = list[editingIndex];
      const next = [...list];
      next[editingIndex] = v;
      // Báo kèm tên cũ để bên ngoài đổi luôn trong các lệnh đã ghi — nếu chỉ đổi trong
      // danh sách thì lệnh cũ vẫn giữ tên cũ và rơi khỏi thống kê/bộ lọc.
      onSetList(next, { renamedFrom: oldName, renamedTo: v });
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
        <input className="input" value={draft} onChange={(e) => { setDraft(e.target.value); if (error) setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && add()} placeholder={placeholder} />
        <button type="button" className="btn btn-primary" onClick={add}>Thêm</button>
      </div>
      {error ? <p className="error-text" style={{ marginTop: -4, marginBottom: 10 }}>{error}</p> : null}
      <div className="resource-list">
        {list.length === 0 ? <p className="empty-note">Chưa có mục nào.</p> : null}
        {list.map((item, i) => (
          <div key={i} className={`resource-item ${sorted ? "" : "resource-item-draggable"} ${dragOverIndex === i ? "resource-item-dragover" : ""}`}
            draggable={!sorted}
            onDragStart={() => { if (!sorted) dragIndexRef.current = i; }}
            onDragOver={(e) => { e.preventDefault(); if (dragOverIndex !== i) setDragOverIndex(i); }}
            onDragLeave={() => setDragOverIndex((cur) => (cur === i ? -1 : cur))}
            onDrop={(e) => { e.preventDefault(); handleDrop(i); }}
            onDragEnd={() => { dragIndexRef.current = null; setDragOverIndex(-1); }}
          >
            {sorted ? null : <span className="drag-handle" title="Kéo để đổi thứ tự"><GripVertical size={14} /></span>}
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

// Thêm nguyên một dải điểm một lần, VD 7.5 → 12 bước 0.5 là 10 mức — gõ tay từng cái thì
// chán và dễ sót. GỘP vào thang đang có chứ không thay thế: không mất mức nào bạn đã thêm.
function StructureRangeFiller({ list, onApply }) {
  const nums = list.map(Number).filter(Number.isFinite);
  const [from, setFrom] = useState(nums.length ? String(Math.min(...nums)) : "0");
  const [to, setTo] = useState("12");
  const [step, setStep] = useState("0.5");
  const [msg, setMsg] = useState(null);
  const run = () => {
    const r = structureScaleRange(from, to, step);
    if (r.error) { setMsg({ error: r.error }); return; }
    const added = r.values.filter((v) => !list.includes(v));
    if (!added.length) { setMsg({ info: "Thang đã có đủ các mức này rồi." }); return; }
    onApply(sortStructureScores([...list, ...r.values]));
    setMsg({ info: `Đã thêm ${added.length} mức: ${added.join(", ")}.` });
  };
  return (
    <div className="range-filler">
      <span className="range-filler-label">Thêm nhanh cả dải</span>
      <label>từ <input className="input" inputMode="decimal" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label>đến <input className="input" inputMode="decimal" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <label>bước <input className="input" inputMode="decimal" value={step} onChange={(e) => setStep(e.target.value)} /></label>
      <button type="button" className="btn btn-ghost" onClick={run}>Thêm dải</button>
      {msg ? <p className={msg.error ? "error-text" : "field-hint"} style={{ flexBasis: "100%", margin: 0 }}>{msg.error || msg.info}</p> : null}
    </div>
  );
}

export function ResourceManager({ resources, onChange }) {
  const [activeGroup, setActiveGroup] = useState(RESOURCE_GROUPS[0].key);
  const group = RESOURCE_GROUPS.find((g) => g.key === activeGroup);
  const [activeChild, setActiveChild] = useState(group.children ? group.children[0].key : null);
  const selectGroup = (g) => { setActiveGroup(g.key); setActiveChild(g.children ? g.children[0].key : null); };
  const childDef = group.children ? (group.children.find((c) => c.key === activeChild) || group.children[0]) : null;
  // Thang số luôn tự xếp tăng dần, kể cả sau khi đổi tên một mức (sửa 7 thành 7.5 thì nó phải
  // nhảy đúng chỗ). Danh sách chữ thì giữ nguyên thứ tự bạn kéo.
  const arrange = (list) => (childDef && childDef.numeric ? sortStructureScores(list) : list);

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
          {childDef.numeric ? (
            <StructureRangeFiller key={`${childDef.key}-range`} list={resources[childDef.key] || []}
              onApply={(next) => onChange({ ...resources, [childDef.key]: next })} />
          ) : null}
          <ResourceListEditor key={childDef.key} list={resources[childDef.key] || []} hint={childDef.hint}
            placeholder={childDef.numeric ? "Thêm một mức điểm, VD 12 hoặc 11.5..." : `Thêm mục cho "${childDef.label}"...`}
            normalize={childDef.numeric ? normalizeStructureScore : undefined}
            sorted={!!childDef.numeric}
            onAdd={(v) => onChange({ ...resources, [childDef.key]: arrange([...(resources[childDef.key] || []), v]) })}
            onRemove={(item) => onChange({ ...resources, [childDef.key]: (resources[childDef.key] || []).filter((x) => x !== item) })}
            onSetList={(next, rename) => onChange({ ...resources, [childDef.key]: arrange(next) }, rename ? { ...rename, resourceKey: childDef.key } : null)} />
        </div>
      </div>
    </div>
  );
}
