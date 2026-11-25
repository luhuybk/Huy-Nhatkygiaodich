import { useState } from "react";
import { ChevronDown, ChevronRight, Hand, Plus, Shield, X } from "lucide-react";
import { readLocalUi, uid, writeLocalUi } from "../lib/helpers.js";
import { slHistText, slTime, useSlHist } from "./EaSl.jsx";
import { slAfter, SL_ICON } from "../../supabase/functions/_shared/slBoard.ts";

// Khung "Lịch sử dời SL" cạnh form lệnh (cột phải, và ô trong thanh đáy ở màn hẹp).
// Ba nguồn, gộp theo thời gian:
//  1. EA dời (slHist:<login>:<ticket>) — các nến EA dời / về BE / đóng lệnh; nến "giữ" chỉ đếm.
//  2. Dời tay tự nhận ra: SL lúc EA xét nến này khác SL EA để lại ở nến trước → giữa hai nến đã có người dời tay.
//  3. Tự ghi (trade.slLog) — lệnh không qua EA, hoặc muốn ghi lý do dời tay.

const pad = (n) => String(n).padStart(2, "0");
// "2026-11-25T14:05" (giờ VN, ô datetime-local) → giây UTC để xếp chung với nến EA
const localToSec = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || "");
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 7, +m[5]) / 1000 : 0;
};
const nowLocal = () => {
  const x = new Date(Date.now() + 7 * 3600 * 1000);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}T${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
};

export function slMoveRows(h, slLog) {
  const rows = [];
  let keeps = 0;
  if (h) {
    const px = (v) => (v > 0 ? Number(v).toFixed(h.digits || 5) : "—");
    const tick = Math.pow(10, -(h.digits || 5)) / 2;
    let prev = null;
    h.entries.forEach((e) => {
      if (prev && e.old > 0 && Math.abs(e.old - slAfter(prev)) > tick) {
        rows.push({ key: `m${e.bar}`, sec: e.bar - 1, kind: "hand", icon: "✋", time: `${slTime(prev.bar).slice(0, 5)}–${slTime(e.bar)}`,
          text: `dời tay ${px(slAfter(prev))} → ${px(e.old)}`, hint: "EA thấy SL đổi giữa hai nến" });
      }
      if (e.st === "keep") keeps += 1;
      else rows.push({ key: `e${e.bar}`, sec: e.bar, kind: e.st === "now" ? "info" : "ea", moved: e.st === "moved" || e.st === "be", icon: SL_ICON[e.st] || "•", time: slTime(e.bar), text: `EA ${slHistText(e, px)}` });
      prev = e;
    });
  }
  (slLog || []).forEach((x) => {
    rows.push({ key: x.id, id: x.id, sec: localToSec(x.at), kind: "own", icon: "✍️",
      time: x.at ? `${x.at.slice(11, 16)} ${x.at.slice(8, 10)}/${x.at.slice(5, 7)}` : "",
      text: `${x.sl ? `SL → ${x.sl}` : "dời SL"}${x.note ? ` · ${x.note}` : ""}` });
  });
  rows.sort((a, b) => b.sec - a.sec);
  return { rows, keeps };
}

export function SlMoveLog({ trade, resources, onChange, alwaysOpen = false }) {
  const h = useSlHist(trade, resources);
  const [open, setOpen] = useState(() => alwaysOpen || readLocalUi("formSlLogOpen", "1") === "1");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ at: "", sl: "", note: "" });
  const [all, setAll] = useState(false);
  const slLog = Array.isArray(trade.slLog) ? trade.slLog : [];
  const { rows, keeps } = slMoveRows(h || null, slLog);
  const hands = rows.filter((r) => r.kind === "hand" || r.kind === "own").length;
  const eaMoves = rows.filter((r) => r.moved).length;
  const toggle = () => { const v = !open; setOpen(v); writeLocalUi("formSlLogOpen", v ? "1" : "0"); };
  const startAdd = () => { setDraft({ at: nowLocal(), sl: "", note: "" }); setAdding(true); };
  const saveAdd = () => {
    if (!draft.at) return;
    onChange([...slLog, { id: uid(), at: draft.at, sl: draft.sl.trim(), note: draft.note.trim() }]);
    setAdding(false);
  };
  const shown = all ? rows : rows.slice(0, 8);
  return (
    <div className={`sl-log ${open ? "is-open" : ""}`}>
      {alwaysOpen ? null : (
        <button type="button" className="sl-log-head" onClick={toggle} aria-expanded={open}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span className="form-toc-title">Lịch sử dời SL</span>
          {rows.length ? <span className="sl-log-count">{eaMoves ? `EA ${eaMoves}` : ""}{eaMoves && hands ? " · " : ""}{hands ? `tay ${hands}` : ""}</span> : null}
        </button>
      )}
      {open ? (
        <div className="sl-log-body">
          {h === undefined && trade.ticket ? <p className="sl-log-empty">Đang tải…</p> : null}
          {!rows.length && h !== undefined ? (
            <p className="sl-log-empty">{trade.ticket ? "EA chưa báo lần dời nào cho lệnh này." : "Lệnh không qua EA (chưa có ticket) — tự ghi các lần dời tay ở dưới."}</p>
          ) : null}
          {shown.map((r) => (
            <div key={r.key} className={`sl-log-row is-${r.kind}`} title={r.hint || ""}>
              <span className="sl-log-time mono">{r.time}</span>
              <span className="sl-log-text">{r.icon} {r.text}</span>
              {r.kind === "own" ? (
                <button type="button" className="row-btn sl-log-del" title="Xoá dòng này" onClick={() => onChange(slLog.filter((x) => x.id !== r.id))}><X size={12} /></button>
              ) : null}
            </div>
          ))}
          {rows.length > shown.length ? <button type="button" className="plan-link" onClick={() => setAll(true)}>… thêm {rows.length - shown.length} dòng cũ hơn</button> : null}
          {keeps ? <p className="sl-log-empty">⏸ EA giữ nguyên SL {keeps} nến (không liệt kê).</p> : null}
          {adding ? (
            <div className="sl-log-add">
              <input type="datetime-local" className="input" value={draft.at} onChange={(e) => setDraft({ ...draft, at: e.target.value })} />
              <input className="input mono" placeholder="SL mới, VD 1.0832" value={draft.sl} onChange={(e) => setDraft({ ...draft, sl: e.target.value })} />
              <input className="input" placeholder="Lý do (tuỳ chọn)" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveAdd(); } }} />
              <span className="sl-log-add-btns">
                <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>Huỷ</button>
                <button type="button" className="btn btn-primary" onClick={saveAdd}><Hand size={13} /> Ghi</button>
              </span>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost sl-log-addbtn" onClick={startAdd}><Plus size={13} /> Ghi dời tay</button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export const SlLogIcon = Shield;
