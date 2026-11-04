import { useCallback, useEffect, useMemo, useState } from "react";
import { Hourglass, Trash2, PlusCircle, RefreshCw, Eraser } from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { safeGet, safeSet } from "../lib/helpers.js";
import { SymbolBox } from "./SymbolBox.jsx";
// Dùng đúng hàm của máy chủ (alert-relay / telegram-webhook) để giờ nến trên web khớp Telegram
import { nextRecheck, RECHECK_DAYS, vnTime } from "../../supabase/functions/_shared/alertRecheck.ts";
import { hotList, hotMatches } from "../../supabase/functions/_shared/hotSymbols.ts";

// Danh sách cảnh báo nhắc lại của alert-relay (app_data.alertRepeats) — xem / thêm / xoá trên web.
// Ba nơi cùng ghi khoá này: alert-relay (tick mỗi phút), telegram-webhook (bấm nút, gõ n/ok) và trang
// này. Mỗi lần sửa đều đọc bản mới nhất trên máy chủ ngay trước khi ghi và tăng `rev` của bản ghi bị
// sửa — tick chỉ ghi đè bản ghi có rev chưa đổi, nên không đè mất thao tác trên web.

const KEY = "alertRepeats";
const LIVE_HOURS = 12; // khớp telegram-webhook: hết lượt nhắc trong 12 tiếng vẫn gõ n/ok được
const POLL_MS = 60 * 1000;
export const ALERT_TFS = ["H4", "H8", "D"];

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, "0")).join("");

export function alertBuckets(list, now = Date.now()) {
  const cutoff = now - LIVE_HOURS * 3600 * 1000;
  const waiting = [];
  const ringing = [];
  const unhandled = [];
  let doneToday = 0;
  (list || []).forEach((r) => {
    if (!r || !r.id) return;
    if (r.recheckAt) waiting.push(r);
    else if (!r.ackedAt && !r.doneAt) ringing.push(r);
    else if (!r.ackedAt && r.doneAt && Date.parse(r.doneAt) > cutoff) unhandled.push(r);
    else doneToday += 1;
  });
  waiting.sort((a, b) => Date.parse(a.recheckAt) - Date.parse(b.recheckAt));
  const byNew = (a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0);
  ringing.sort(byNew);
  unhandled.sort(byNew);
  return { waiting, ringing, unhandled, doneToday };
}

export function alertSummary(list) {
  if (!list) return "Đang tải…";
  const b = alertBuckets(list);
  const parts = [
    b.waiting.length ? `${b.waiting.length} chờ kiểm lại` : "",
    b.ringing.length ? `${b.ringing.length} đang nhắc` : "",
    b.unhandled.length ? `${b.unhandled.length} chưa xử lý` : "",
  ].filter(Boolean);
  return parts.join(" · ") || "Không có cảnh báo nào đang chờ";
}

// Đọc danh sách + tự làm mới mỗi phút và khi quay lại tab. `mutate(fn)` = đọc mới → sửa → ghi.
export function useAlertRepeats(enabled) {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const v = await safeGet(KEY, null);
    setList(Array.isArray(v) ? v : []);
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const t = setInterval(load, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [enabled, load]);
  const mutate = useCallback(async (fn) => {
    setError("");
    const fresh = await safeGet(KEY, null);
    const base = Array.isArray(fresh) ? fresh : [];
    const next = fn(base);
    if (!(await safeSet(KEY, next))) { setError("Lưu thất bại — thử lại sau."); await load(); return false; }
    setList(next);
    return true;
  }, [load]);
  return { list, load, mutate, error };
}

const titleOf = (r) => String(r.text || "").split("\n").find((x) => x.trim())?.replace(/^\s*📈\s*/u, "") || "(trống)";

function AlertRow({ r, kind, hot, onNext, onRemove, now }) {
  const isHot = hotMatches(String(r.text || ""), hot).length > 0;
  let state = "";
  if (kind === "waiting" && r.kind === "reentry") {
    // Bấm 🔁 Nến re-entry ở tin khớp lệnh (mt5-journal): nhắc dời SL tay 1 lần lúc nến vào lệnh đóng
    state = `✋ Nhắc dời SL tay lúc ${vnTime(Date.parse(r.recheckAt), now)}`;
    if (r.recheckClose) state += ` · nến ${r.candleTf || ""} vào lệnh đóng ${vnTime(Date.parse(r.recheckClose), now)}`;
  } else if (kind === "waiting") {
    state = `⏳ Kiểm lại lúc ${vnTime(Date.parse(r.recheckAt), now)}`;
    if (r.recheckClose) state += ` · nến ${r.tf || "D"} đóng ${vnTime(Date.parse(r.recheckClose), now)}`;
    if (r.rechecks) state += ` · lần ${r.rechecks}`;
  } else if (kind === "ringing") {
    state = `🔔 Đang nhắc · đã gửi ${r.sent || 0}/${r.times || 5}`;
  } else {
    state = `Hết lượt nhắc lúc ${vnTime(Date.parse(r.doneAt), now)} — chưa bấm gì`;
  }
  const tooOld = Date.parse(r.createdAt || "") < now - RECHECK_DAYS * 24 * 3600 * 1000;
  return (
    <div className={`alert-row ${isHot ? "alert-row-hot" : ""}`}>
      <div className="alert-main">
        <div className="alert-title">{isHot ? "🔥 " : ""}{titleOf(r)}</div>
        <div className="alert-state">
          {state}
          <span className="alert-age"> · báo {vnTime(Date.parse(r.createdAt || 0), now)}{r.source === "web" ? " (thêm từ web)" : ""}</span>
        </div>
      </div>
      <div className="alert-actions">
        {kind !== "waiting" && r.tf && !tooOld ? (
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => onNext(r)} title="Như gõ n trên Telegram: ngừng nhắc, gửi lại lúc nến kế tiếp đóng">
            <Hourglass size={12} /> Nến sau
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost btn-xs alert-del" onClick={() => onRemove(r)} title="Xoá khỏi danh sách — không nhắc nữa">
          <Trash2 size={12} /> Xoá
        </button>
      </div>
    </div>
  );
}

// Chọn mã như ô Mã tiềm năng: bấm chip gợi ý (chia nhóm, hàng 🔥 Mã tiềm năng đứng đầu) hoặc gõ nhiều mã
// một lần — mỗi mã thành một nhắc kiểm lại riêng, cùng khung và ghi chú.
function AddAlertForm({ resources, hot, onAdd, onCancel }) {
  const [syms, setSyms] = useState([]);
  const [tf, setTf] = useState("H4");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const suggestions = useMemo(() => {
    const out = [...(hot || []).map((h) => String(h.name || "").toUpperCase()), ...((resources && resources.symbols) || [])];
    return [...new Set(out.filter(Boolean))];
  }, [resources, hot]);
  const pinned = useMemo(() => ({ name: "🔥 Tiềm năng", list: [...new Set((hot || []).map((h) => String(h.name || "").toUpperCase()).filter(Boolean))] }), [hot]);
  const preview = useMemo(() => {
    const r = nextRecheck(tf, Date.now());
    return `nến ${tf} đóng ${vnTime(r.close)} → nhắc lúc ${vnTime(r.at)}`;
  }, [tf]);
  const submit = async () => {
    if (!syms.length) { setErr("Chọn ít nhất một mã."); return; }
    setErr("");
    if (await onAdd({ names: syms, tf, note: note.trim() })) { setSyms([]); setNote(""); }
  };
  return (
    <div className="alert-add">
      <SymbolBox items={syms.map((name) => ({ name }))} suggestions={suggestions} autoFocus alwaysHints pinned={pinned}
        groupOf={resources && resources.symbolGroups} order={resources && resources.symbols}
        onAdd={(names) => setSyms((cur) => [...cur, ...names.filter((n) => !cur.includes(n))])}
        onRemove={(x) => setSyms((cur) => cur.filter((n) => n !== x.name))}
        placeholder="Bấm mã bên dưới hoặc gõ: EUR/USD XAUUSD" />
      <div className="alert-add-row" style={{ marginTop: 8 }}>
        <select className="input alert-add-tf" value={tf} onChange={(e) => setTf(e.target.value)}>
          {ALERT_TFS.map((x) => <option key={x} value={x}>Nến {x}</option>)}
        </select>
        <input className="input alert-add-note" value={note} placeholder="Ghi chú (tuỳ chọn) — VD chờ phá đỉnh"
          onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
      </div>
      <p className="field-hint">{preview}. Tới giờ bot gửi tin kèm nút ✅ / ⏳ như cảnh báo TradingView — gõ ok / n để trả lời.</p>
      {err ? <p className="error-text">{err}</p> : null}
      <div className="form-actions" style={{ justifyContent: "flex-start", marginTop: 4 }}>
        <button type="button" className="btn btn-primary btn-xs" onClick={submit}>
          {syms.length > 1 ? `Thêm ${syms.length} mã` : "Thêm"}
        </button>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onCancel}>Đóng</button>
      </div>
    </div>
  );
}

// Dọn tin trên Telegram qua alert-relay (?clean=alerts|all) — bot xoá, web chỉ ra lệnh.
function TelegramCleaner({ onClose }) {
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const run = async (mode) => {
    setBusy(mode); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke(`alert-relay?clean=${mode}`, { body: {} });
      if (error) {
        let msg = error.message;
        try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* không có nội dung */ }
        setResult({ ok: false, text: `Không dọn được: ${msg}` });
        return;
      }
      const parts = [mode === "all" ? "Đã dọn sạch nhóm cảnh báo." : `Đã dọn ${data.tried - data.failed} tin cảnh báo.`];
      if (data.kept) parts.push(`Giữ lại ${data.kept} tin của cảnh báo đang nhắc.`);
      if (data.failed) {
        parts.push(`${data.failed} tin không xoá được${data.reason ? ` (${data.reason})` : ""} — Telegram chỉ cho bot xoá tin trong 48 giờ; tin bạn tự gõ (n, ok) cần bot là quản trị viên nhóm có quyền xoá tin.`);
      }
      setResult({ ok: true, text: parts.join(" ") });
    } catch (e) {
      setResult({ ok: false, text: `Không dọn được: ${String((e && e.message) || e)}` });
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="alert-add">
      <p className="field-hint" style={{ marginTop: 0 }}>
        Bot xoá tin trong nhóm nhận cảnh báo. Tin mới nhất của cảnh báo <b>đang nhắc</b> luôn được giữ lại.
        Cảnh báo chờ kiểm lại không mất — tới giờ bot vẫn gửi tin mới.
      </p>
      <div className="form-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginTop: 4 }}>
        <button type="button" className="btn btn-ghost btn-xs" disabled={!!busy} onClick={() => run("alerts")}
          title="Chỉ các tin cảnh báo TradingView bot đã gửi (trong 24 giờ qua)">
          {busy === "alerts" ? "Đang dọn…" : "Chỉ tin cảnh báo"}
        </button>
        <button type="button" className="btn btn-ghost btn-xs alert-del" disabled={!!busy} onClick={() => run("all")}
          title="Mọi tin trong nhóm cảnh báo 48 giờ qua: cảnh báo, tin trả lời n/ok, các tin nhắc khác nếu chung nhóm">
          {busy === "all" ? "Đang dọn… (có thể mất nửa phút)" : "Dọn sạch cả nhóm (48 giờ)"}
        </button>
        <button type="button" className="btn btn-ghost btn-xs" disabled={!!busy} onClick={onClose}>Đóng</button>
      </div>
      <p className="field-hint">
        "Dọn sạch cả nhóm" xoá mọi tin bot xoá được trong nhóm cảnh báo — nếu nhóm này cũng nhận nhắc dời SL / kiểm tra setup
        thì các tin đó (và nút trên tin) cũng mất.
      </p>
      {result ? <p className={result.ok ? "field-hint alert-clean-ok" : "error-text"}>{result.text}</p> : null}
    </div>
  );
}

export function AlertRechecksBody({ data, resources, settings }) {
  const { list, load, mutate, error } = data;
  const [adding, setAdding] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  const hot = useMemo(() => hotList(settings), [settings]);
  const b = useMemo(() => alertBuckets(list || [], now), [list, now]);

  const edit = async (fn) => { setBusy(true); try { return await mutate(fn); } finally { setBusy(false); } };
  const remove = (r) => edit((all) => all.filter((x) => x.id !== r.id));
  const removeMany = (items) => { const ids = new Set(items.map((x) => x.id)); return edit((all) => all.filter((x) => !ids.has(x.id))); };
  const next = (r) => edit((all) => all.map((x) => {
    if (x.id !== r.id) return x;
    const t = Date.now();
    const rc = nextRecheck(x.tf || "D", t);
    return {
      ...x, ackedAt: x.ackedAt || new Date(t).toISOString(),
      recheckAt: new Date(rc.at).toISOString(), recheckClose: new Date(rc.close).toISOString(),
      rechecks: (x.rechecks || 0) + 1, rev: (x.rev || 0) + 1,
    };
  }));
  const add = ({ names, tf, note }) => edit((all) => {
    const t = Date.now();
    const rc = nextRecheck(tf, t);
    const iso = (ms) => new Date(ms).toISOString();
    return [...all, ...names.map((name) => ({
      id: newId(), text: `📈 [${tf}] - ${name}${note ? ` — ${note}` : ""}`, every: 2, times: 5, sent: 0, tf, rev: 0,
      nextAt: iso(rc.at), createdAt: iso(t), messageIds: [], ackedAt: iso(t),
      recheckAt: iso(rc.at), recheckClose: iso(rc.close), rechecks: 0, source: "web",
    }))];
  });

  if (!list) return <p className="field-hint" style={{ marginTop: 8 }}>Đang tải…</p>;
  const empty = !b.waiting.length && !b.ringing.length && !b.unhandled.length;
  const section = (title, items, kind, clearAll) => (items.length ? (
    <div className="alert-group">
      <div className="alert-group-title">
        {title} <span>({items.length})</span>
        {clearAll && items.length > 1 ? (
          <button type="button" className="alert-clear-all" onClick={() => removeMany(items)} title="Xoá cả nhóm này khỏi danh sách">
            <Trash2 size={11} /> Xoá hết
          </button>
        ) : null}
      </div>
      {items.map((r) => <AlertRow key={r.id} r={r} kind={kind} hot={hot} now={now} onNext={next} onRemove={remove} />)}
    </div>
  ) : null);

  return (
    <div className={busy ? "alert-busy" : ""}>
      <p className="field-hint" style={{ marginTop: 8 }}>
        Cảnh báo TradingView bấm ⏳ / gõ <b>n</b> trên Telegram sẽ nằm ở đây cho tới lúc nến kế tiếp đóng. Xoá = không nhắc nữa;
        thêm tay khi muốn bot nhắc kiểm lại một mã mà không có cảnh báo TradingView.
      </p>
      {empty ? <p className="field-hint alert-empty">Không có cảnh báo nào đang chờ.</p> : null}
      {section("Chờ kiểm lại theo nến", b.waiting, "waiting")}
      {section("Đang nhắc", b.ringing, "ringing")}
      {section(`Hết lượt nhắc, chưa xử lý (${LIVE_HOURS} giờ qua)`, b.unhandled, "unhandled", true)}
      {error ? <p className="error-text">{error}</p> : null}
      {adding ? <AddAlertForm resources={resources} hot={hot} onAdd={add} onCancel={() => setAdding(false)} /> : null}
      {cleaning ? <TelegramCleaner onClose={() => setCleaning(false)} /> : null}
      {adding || cleaning ? null : (
        <div className="form-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginTop: 8 }}>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setAdding(true)}><PlusCircle size={12} /> Thêm nhắc kiểm lại</button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setCleaning(true)} title="Xoá bớt tin trên Telegram cho đỡ rối">
            <Eraser size={12} /> Dọn tin Telegram
          </button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={load} title="Tải lại từ máy chủ"><RefreshCw size={12} /> Làm mới</button>
          {b.doneToday ? <span className="field-hint">{b.doneToday} cảnh báo đã xong trong 24 giờ qua</span> : null}
        </div>
      )}
    </div>
  );
}
