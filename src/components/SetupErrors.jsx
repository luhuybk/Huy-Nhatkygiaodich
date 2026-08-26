import { useMemo, useState } from "react";
import { Bug, Check, Pencil, Plus, X } from "lucide-react";
import { ConfirmButton, StatCard } from "./ui.jsx";
import { emptySetupError, fmt, fmtR, setupErrorStats, stripSetupError, uid } from "../lib/helpers.js";

const SHARED = "__chung__";
const SHARED_LABEL = "Chung (mọi setup)";

// Setup nào cũng phải hiện ra, kể cả setup đã bị xóa khỏi Tài nguyên mà bộ lỗi còn treo lại —
// không thì cả bộ lỗi đó biến mất khỏi màn hình và không còn cách nào sửa.
function setupNames(resources, errors) {
  const set = new Set((resources.setups || []).filter(Boolean));
  (errors || []).forEach((e) => { if (e.setup) set.add(e.setup); });
  return Array.from(set);
}

function SetupPicker({ names, value, onChange }) {
  return (
    <div className="chip-group" style={{ marginBottom: 12 }}>
      <button type="button" className={`chip-btn ${value === "" ? "chip-active" : ""}`} onClick={() => onChange("")}>Tất cả setup</button>
      {names.map((n) => (
        <button key={n} type="button" className={`chip-btn ${value === n ? "chip-active" : ""}`} onClick={() => onChange(n)}>{n}</button>
      ))}
      <button type="button" className={`chip-btn ${value === SHARED ? "chip-active" : ""}`} onClick={() => onChange(SHARED)}>{SHARED_LABEL}</button>
    </div>
  );
}

function ErrorRow({ item, usedCount, showSetup, onSave, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [note, setNote] = useState(item.note || "");
  const start = () => { setName(item.name); setNote(item.note || ""); setEditing(true); };
  const save = () => {
    const v = name.trim();
    if (v) onSave({ ...item, name: v, note: note.trim() });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="resource-item err-item-edit">
        <input className="input input-inline" value={name} autoFocus onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Tên lỗi" />
        <input className="input input-inline" value={note} onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Mô tả ngắn (không bắt buộc)" />
        <span style={{ display: "flex", gap: 4 }}>
          <button type="button" className="row-btn" onClick={save} aria-label="Lưu"><Check size={13} /></button>
          <button type="button" className="row-btn" onClick={() => setEditing(false)} aria-label="Hủy"><X size={13} /></button>
        </span>
      </div>
    );
  }
  return (
    <div className="resource-item">
      <span style={{ flex: 1, cursor: "text", minWidth: 0 }} onClick={start}>
        <b>{item.name}</b>
        {showSetup ? <span className="err-note"> · {item.setup || "chung"}</span> : null}
        {item.note ? <span className="err-note"> — {item.note}</span> : null}
      </span>
      <span className="err-used">{usedCount ? `${usedCount} lệnh` : "chưa dùng"}</span>
      <span style={{ display: "flex", gap: 4 }}>
        <button type="button" className="row-btn" onClick={start} aria-label="Sửa"><Pencil size={13} /></button>
        <ConfirmButton onConfirm={() => onRemove(item)} />
      </span>
    </div>
  );
}

function CatalogTab({ errors, trades, resources, setup, onSetup, onChange, onRemove }) {
  const names = setupNames(resources, errors);
  const showAll = setup === "";
  const target = setup === SHARED ? "" : setup;
  const [draft, setDraft] = useState("");

  const own = showAll ? (errors || []) : (errors || []).filter((e) => (e.setup || "") === target);
  const shared = showAll || !target ? [] : (errors || []).filter((e) => !e.setup);
  const usage = useMemo(() => {
    const map = {};
    (trades || []).forEach((t) => (t.setupErrors || []).forEach((id) => { map[id] = (map[id] || 0) + 1; }));
    return map;
  }, [trades]);

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (own.some((e) => e.name.toLowerCase() === v.toLowerCase())) { setDraft(""); return; }
    onChange([...(errors || []), { ...emptySetupError(target), id: uid(), name: v }]);
    setDraft("");
  };
  const save = (item) => onChange((errors || []).map((e) => (e.id === item.id ? item : e)));

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Mỗi setup một bộ lỗi riêng. Lỗi nào setup nào cũng mắc thì để ở "{SHARED_LABEL}" — nó sẽ hiện ra khi ghi lệnh của mọi setup.
      </p>
      <SetupPicker names={names} value={setup} onChange={onSetup} />

      {showAll ? (
        <p className="field-hint" style={{ marginBottom: 12 }}>Đang xem toàn bộ bộ lỗi. Chọn một setup ở trên để thêm lỗi mới.</p>
      ) : (
        <div className="resource-add">
          <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={target ? `Thêm lỗi cho setup ${target}...` : "Thêm lỗi dùng chung..."} />
          <button type="button" className="btn btn-primary" onClick={add}><Plus size={14} /> Thêm</button>
        </div>
      )}

      <div className="resource-list">
        {own.length === 0 ? <p className="empty-note">Chưa có lỗi nào cho mục này.</p> : null}
        {own.map((e) => (
          <ErrorRow key={e.id} item={e} usedCount={usage[e.id] || 0} showSetup={showAll} onSave={save} onRemove={onRemove} />
        ))}
      </div>

      {shared.length ? (
        <div style={{ marginTop: 16 }}>
          <h4 className="rec-title">Kèm theo bộ lỗi dùng chung</h4>
          <p className="field-hint" style={{ marginBottom: 8 }}>Những lỗi này cũng hiện khi ghi lệnh {target}. Sửa chúng ở mục "{SHARED_LABEL}".</p>
          <div className="chip-group">
            {shared.map((e) => <span key={e.id} className="err-chip-static">{e.name}</span>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function perfSub(p) {
  const parts = [];
  parts.push(p.winRate === null ? "chưa có lệnh đóng" : `Winrate ${p.winRate.toFixed(0)}%`);
  if (p.avgRR !== null) parts.push(`RR TB ${fmtR(p.avgRR)}`);
  return parts.join(" · ");
}

function StatsTab({ errors, trades, resources, setup, onSetup }) {
  const names = setupNames(resources, errors);
  // "Chung" không phải một setup nên không lọc được lệnh theo nó — vẫn tính trên mọi lệnh,
  // chỉ thu bảng lại còn các lỗi dùng chung.
  const stats = useMemo(() => {
    const base = setupErrorStats(trades, errors, setup === SHARED ? "" : setup, resources);
    return setup === SHARED ? { ...base, rows: base.rows.filter((r) => !r.setup) } : base;
  }, [trades, errors, setup, resources]);
  const top = stats.rows[0];
  const setupOf = (id) => { const e = (errors || []).find((x) => x.id === id); return e && e.setup ? e.setup : "Chung"; };

  return (
    <div>
      <SetupPicker names={names} value={setup} onChange={onSetup} />

      {stats.total === 0 ? <p className="empty-note">Chưa có lệnh nào cho setup này.</p> : (
        <>
          <p className="field-hint" style={{ marginBottom: 12 }}>
            Đã soi lỗi <b>{stats.reviewed}</b> / {stats.total} lệnh
            {stats.unreviewed ? ` · còn ${stats.unreviewed} lệnh chưa soi (chưa tính vào tỷ trọng bên dưới)` : ""}.
          </p>

          <div className="stat-grid">
            <StatCard label="Lệnh không lỗi" value={stats.clean.count} tone="win" sub={perfSub(stats.clean)} />
            <StatCard label="Lệnh có lỗi" value={stats.dirty.count} tone={stats.dirty.count ? "loss" : ""} sub={perfSub(stats.dirty)} />
            <StatCard label="Lãi/lỗ khi không lỗi" value={fmt(stats.clean.profit)} tone={stats.clean.profit > 0 ? "win" : stats.clean.profit < 0 ? "loss" : ""} sub="quy đổi USD" />
            <StatCard label="Lãi/lỗ khi có lỗi" value={fmt(stats.dirty.profit)} tone={stats.dirty.profit > 0 ? "win" : stats.dirty.profit < 0 ? "loss" : ""} sub="quy đổi USD" />
          </div>

          {top && top.count ? (
            <p className="field-hint" style={{ margin: "12px 0" }}>
              Lỗi hay gặp nhất{setup && setup !== SHARED ? ` của ${setup}` : ""}: <b>{top.name}</b> — {top.count} lệnh
              {top.share === null ? "" : ` (${top.share.toFixed(0)}% số lệnh đã soi)`}.
            </p>
          ) : null}

          {stats.rows.length === 0 ? (
            <p className="empty-note">Chưa khai lỗi nào cho mục này — sang tab "Bộ lỗi" để thêm.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Lỗi</th>
                    {setup && setup !== SHARED ? null : <th>Setup</th>}
                    <th>Số lệnh</th>
                    <th>Tỷ trọng</th>
                    <th>Winrate</th>
                    <th>RR trung bình</th>
                    <th>Lãi/lỗ (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.rows.map((r) => (
                    <tr key={r.id}>
                      <td><b>{r.name}</b>{r.note ? <span className="err-note"> — {r.note}</span> : null}</td>
                      {setup && setup !== SHARED ? null : <td>{setupOf(r.id)}</td>}
                      <td>{r.count}</td>
                      <td>
                        {r.share === null ? "—" : (
                          <span className="err-share">
                            <span className="err-share-bar"><span style={{ width: `${Math.min(100, r.share)}%` }} /></span>
                            {r.share.toFixed(0)}%
                          </span>
                        )}
                      </td>
                      <td>{r.winRate === null ? "—" : `${r.winRate.toFixed(0)}%`}</td>
                      <td className={r.avgRR > 0 ? "text-win" : r.avgRR < 0 ? "text-loss" : ""}>{fmtR(r.avgRR)}</td>
                      <td className={r.profit > 0 ? "text-win" : r.profit < 0 ? "text-loss" : ""}>{fmt(r.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SetupErrorsPage({ errors, trades, resources, onChange, onTradesChange }) {
  const [tab, setTab] = useState("catalog");
  // Setup đang chọn dùng chung cho cả hai tab: xem thống kê của DD rồi bấm sang "Bộ lỗi"
  // là sửa đúng bộ lỗi của DD, không phải mò chọn lại.
  const [setup, setSetup] = useState("");
  // Xóa lỗi thì gỡ luôn khỏi các lệnh đã tick — bỏ sót là lệnh đó kẹt ở nhóm "có lỗi" mà rỗng.
  const removeError = (item) => {
    onChange((errors || []).filter((e) => e.id !== item.id));
    const r = stripSetupError(trades, item.id);
    if (r.changed) onTradesChange(r.items);
  };

  return (
    <div>
      <div className="subtabs">
        <button className={`subtab ${tab === "catalog" ? "subtab-active" : ""}`} onClick={() => setTab("catalog")}>
          <Bug size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Bộ lỗi
        </button>
        <button className={`subtab ${tab === "stats" ? "subtab-active" : ""}`} onClick={() => setTab("stats")}>Thống kê</button>
      </div>
      {tab === "catalog"
        ? <CatalogTab errors={errors} trades={trades} resources={resources} setup={setup} onSetup={setSetup} onChange={onChange} onRemove={removeError} />
        : <StatsTab errors={errors} trades={trades} resources={resources} setup={setup} onSetup={setSetup} />}
    </div>
  );
}
