import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarX2, Check, ChevronDown, ClipboardCopy, Clock, Download, GripHorizontal } from "lucide-react";
import { Field } from "./ui.jsx";
import {
  TASK_KINDS, taskKind, emptyTaskDurations, taskMinutes, applyTaskPatch, timelineSources,
  buildDayTimeline, buildWeekTimeline, timelineConflicts, fmtDuration, minutesToHhmm, hhmmToMinutes, snapMinutes, openTradeCounter,
  weekdayCodeFromNumber, todayChecklist, setTaskDone, markSetupCheckDone, todayStr,
  skipKey, toggleSkip, daysOfHour,
} from "../lib/helpers.js";

// Trục ngang luôn dừng ở mốc giờ tròn, và luôn rộng ít nhất 4 tiếng để một ngày
// chỉ có mỗi việc 5 phút không bị kéo giãn thành cả màn hình.
const MIN_SPAN = 240;
// Chừa chỗ bên phải cho nhãn nằm ngoài khối, để tên việc không bị cắt cụt.
const LABEL_SPACE = 300;
// Nhích dưới ngần này coi như bấm nhầm chứ không phải kéo.
const DRAG_THRESHOLD = 3;

function trackRange(items) {
  if (!items.length) return { from: 8 * 60, to: 22 * 60 };
  const first = Math.min(...items.map((x) => x.start));
  const last = Math.max(...items.map((x) => x.start + x.minutes));
  let from = Math.floor(first / 60) * 60;
  let to = Math.ceil(last / 60) * 60;
  while (to - from < MIN_SPAN) {
    if (to < 24 * 60) to += 60;
    else from -= 60;
  }
  return { from, to };
}

function DayTrack({ items, conflicts, onMove }) {
  const { from, to } = trackRange(items);
  const span = to - from;
  const hours = [];
  for (let m = from; m <= to; m += 60) hours.push(m);
  const pct = (m) => ((m - from) / span) * 100;
  const dragRef = useRef(null);
  const [drag, setDrag] = useState(null);

  const onDrag = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    d.moved = true;
    d.next = snapMinutes(d.origin + (dx / d.width) * span);
    setDrag({ id: d.id, start: d.next });
  };

  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d || !d.moved || d.next === undefined || d.next === d.origin) return;
    // Khối xếp nối tiếp trong cùng mốc thì lệch khỏi mốc gốc — trừ phần lệch đó ra.
    const queued = d.item.start - (d.item.slotStart ?? d.item.start);
    onMove(d.item, minutesToHhmm(d.next - queued));
  };

  // Theo dõi trên window chứ không trên khối, để thả tay ở đâu cũng kết thúc gọn —
  // kể cả khi kéo vượt ra ngoài khối. Hàm gắn vào window phải cố định qua các lần vẽ
  // mới gỡ ra được, nên phần thân thật nằm trong `live`.
  const live = useRef({});
  live.current.move = onDrag;
  live.current.end = endDrag;
  const win = useRef(null);
  if (!win.current) {
    const detach = () => {
      window.removeEventListener("pointermove", win.current.move);
      window.removeEventListener("pointerup", win.current.up);
      window.removeEventListener("pointercancel", win.current.up);
    };
    win.current = {
      move: (e) => live.current.move(e),
      up: () => { detach(); live.current.end(); },
      detach,
      attach: () => {
        window.addEventListener("pointermove", win.current.move);
        window.addEventListener("pointerup", win.current.up);
        window.addEventListener("pointercancel", win.current.up);
      },
    };
  }
  useEffect(() => () => win.current.detach(), []);

  const startDrag = (e, item) => {
    const width = e.currentTarget.parentElement.getBoundingClientRect().width;
    if (!width) return;
    dragRef.current = { id: item.id, item, startX: e.clientX, width, origin: item.start, moved: false };
    win.current.attach();
  };

  return (
    <div className="tl-track-wrap">
      <div className="tl-track" style={{ minWidth: Math.max(560, hours.length * 62) + LABEL_SPACE }}>
        <div className="tl-hours">
          {hours.map((m, i) => (
            // Mốc đầu và cuối không căn giữa, nếu không nửa chữ bị cắt mất ở rìa.
            <span key={m} className="tl-hour"
              style={i === 0 ? { left: 0, transform: "none" } : i === hours.length - 1 ? { left: `${pct(m)}%`, transform: "translateX(-100%)" } : { left: `${pct(m)}%` }}>
              {minutesToHhmm(m)}
            </span>
          ))}
        </div>
        {items.map((x) => {
          const k = taskKind(x.kind);
          const clash = conflicts.has(x.id);
          const moving = drag && drag.id === x.id;
          const start = moving ? drag.start : x.start;
          return (
            <div key={x.id} className={`tl-row ${x.enabled ? "" : "tl-row-off"}`}>
              <div className="tl-row-grid">
                {hours.map((m) => <span key={m} className="tl-gridline" style={{ left: `${pct(m)}%` }} />)}
              </div>
              <div className={`tl-block ${clash ? "tl-block-clash" : ""} ${moving ? "tl-block-moving" : ""}`}
                style={{
                  left: `${pct(start)}%`, width: `${Math.max((x.minutes / span) * 100, 1.2)}%`,
                  background: x.enabled ? `${k.color}33` : "transparent",
                  borderColor: x.enabled ? k.color : "var(--border)",
                }}
                onPointerDown={(e) => { if (!x.fixedTime) startDrag(e, x); }}
                title={x.fixedTime ? "Giờ đóng nến tự tính — không kéo được" : `Kéo ngang để dời giờ — đổi cho cả ${(x.days || []).join(", ")}`}>
                <GripHorizontal size={11} className="tl-block-grip" />
                <span className="tl-block-label">
                  {minutesToHhmm(start)} · {x.title}{x.sub ? ` · ${x.sub}` : ""}
                  {moving && start !== x.start ? <b className="tl-block-delta"> ← {minutesToHhmm(x.start)}</b> : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Xuất lịch sang Life Hub (app quản lý công việc cá nhân) — CHỈ nhịp tuần: tên việc, giờ,
// số phút, thứ trong tuần. Không kèm token/chat id/thread id, không kèm id tài khoản, và
// không đụng tới nhật ký lệnh hay dữ liệu vốn.
const FEED_ID = "nkgd";
const FEED_NAME = "Nhật ký giao dịch";
const FEED_COLOR = "#d4a24e";
const KIND_VI = {
  sl: "Dời SL", setupCheck: "Kiểm tra setup",
  symbolWatch: "Symbol theo dõi", reminder: "Nhắc", report: "",
};

// "2026-08-21T14:00:00+07:00" — giờ địa phương kèm lệch múi giờ, để bên Life Hub đọc ra
// đúng thời điểm xuất mà không phải đoán múi giờ.
function localIso(d) {
  const p = (n) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    + `${off >= 0 ? "+" : "-"}${p(off / 60)}:${p(off % 60)}`;
}


// Giờ đã tích xong, hiện theo giờ máy — chỉ để bạn nhớ lúc nãy làm lúc mấy giờ.
function doneHhmm(iso) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Tên ngắn trên thẻ mốc: "Dời SL", "Theo dõi"… — tên đầy đủ đã có ở dòng phụ.
const SHORT_KIND = { sl: "Dời SL", symbolWatch: "Theo dõi", setupCheck: "Kiểm tra setup" };

// Dòng tóm tắt khi thẻ gập: "Dời SL ×3 · Theo dõi ×2".
function peek(rows) {
  const count = new Map();
  rows.forEach((r) => { const k = SHORT_KIND[r.kind] || r.title; count.set(k, (count.get(k) || 0) + 1); });
  return [...count.entries()].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(" · ");
}

// Các việc trong ngày gom theo MỐC giờ: một thẻ = một lượt ngồi vào máy. Tích ở đây là việc
// đó xong và Telegram bỏ qua mốc ấy — khỏi chờ tin nhắn nhảy lên rồi mới bấm nút trong tin.
function SlotCard({ slot, rows, state, onToggle }) {
  const done = rows.filter((r) => r.done).length;
  const total = rows.reduce((n, r) => n + r.minutes, 0);
  // Mốc đã qua gập lại: phần lớn việc được bấm ngay trên Telegram nên web không biết là xong —
  // tô đỏ "quá giờ" chỉ thành báo động giả.
  const [open, setOpen] = useState(state !== "done" && state !== "past");
  const label = { done: "xong", past: "đã qua", now: "tới giờ", next: "sắp tới", later: "" }[state];
  return (
    <div className={`slot slot-${state}`}>
      <button type="button" className="slot-head" onClick={() => setOpen(!open)}>
        <b className="slot-time">{minutesToHhmm(slot)}</b>
        {label ? <span className={`slot-state slot-state-${state}`}>{state === "done" ? <Check size={11} /> : null}{label}</span> : null}
        <span className="slot-meta">{done}/{rows.length} việc · {fmtDuration(total)}</span>
        {!open ? <span className="slot-peek">{peek(rows)}</span> : null}
      </button>
      {open ? (
        <div className="slot-rows">
          {rows.map((r) => (
            <label key={r.id} className={`slot-row ${r.done ? "slot-row-done" : ""}`}>
              <input type="checkbox" checked={r.done} onChange={(e) => onToggle(r, e.target.checked)} />
              <i className="slot-dot" style={{ background: taskKind(r.kind).color }} />
              <span className="slot-title">{SHORT_KIND[r.kind] || r.title}</span>
              <span className="slot-sub">{r.kind in SHORT_KIND ? (r.sub || "").split(" · ")[0] : r.sub}</span>
              {r.detail ? <span className="slot-detail mono">{r.detail}</span> : null}
              {r.done && doneHhmm(r.doneAt) ? <span className="slot-at">{doneHhmm(r.doneAt)}</span> : null}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TodayPanel({
  settings, watches, reminders, accounts, trades, mutedTrades, taskDone, setupCheckLog,
  onTaskDoneChange, onSetupCheckLogChange, extra,
}) {
  const durations = useMemo(() => settings.taskDurations || emptyTaskDurations(), [settings]);
  const openTrades = useMemo(() => openTradeCounter({ accounts, trades, mutedTrades }), [accounts, trades, mutedTrades]);
  const dateStr = todayStr();
  const todayCode = weekdayCodeFromNumber(new Date().getDay());
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const rows = useMemo(() => {
    const items = buildDayTimeline(todayCode, { settings, watches, reminders, durations, openTrades });
    return todayChecklist({ day: todayCode, date: dateStr, items, doneMap: taskDone, setupCheckLog });
  }, [settings, watches, reminders, durations, openTrades, todayCode, dateStr, taskDone, setupCheckLog]);

  const slots = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const k = r.slotStart ?? r.start;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [rows]);
  // Mốc "sắp tới" = mốc chưa xong đầu tiên chưa tới giờ — chỉ một, để mắt biết nhìn vào đâu.
  const nextSlot = slots.find(([slot, list]) => slot > nowMin && list.some((r) => !r.done));
  const stateOf = (slot, list) => {
    if (list.every((r) => r.done)) return "done";
    const end = slot + list.reduce((n, r) => n + r.minutes, 0);
    if (nowMin >= slot && nowMin <= end) return "now";
    if (nowMin > end) return "past";
    return nextSlot && nextSlot[0] === slot ? "next" : "later";
  };

  const toggleTask = (row, done) => {
    onTaskDoneChange(setTaskDone(taskDone, dateStr, row.slotKey, done));
    // Kiểm tra setup còn được đếm tỷ lệ hoàn thành — ghi luôn để con số không hụt đi
    // chỉ vì bạn làm sớm hơn giờ nhắc.
    if (row.source.kind === "setupCheck" && onSetupCheckLogChange) {
      onSetupCheckLogChange(markSetupCheckDone(setupCheckLog, {
        accountId: row.source.id, accountName: row.sub || "", date: dateStr, hour: row.source.hour,
      }, done));
    }
  };

  const doneCount = rows.filter((r) => r.done).length;
  return (
    <div className="today">
      <div className="today-head">
        <span><b>{WEEKDAY_FULL[todayCode]}</b> · {dateStr.slice(8, 10)}/{dateStr.slice(5, 7)}</span>
        <span className="today-count">{rows.length ? `${doneCount}/${rows.length} việc xong · ${slots.length} mốc` : "không có lịch"}</span>
        {rows.length ? <span className="tl-check-bar"><i style={{ width: `${(doneCount / rows.length) * 100}%` }} /></span> : null}
      </div>
      {slots.length ? (
        <div className="slot-list">
          {slots.map(([slot, list]) => (
            <SlotCard key={`${slot}-${stateOf(slot, list)}`} slot={slot} rows={list} state={stateOf(slot, list)} onToggle={toggleTask} />
          ))}
        </div>
      ) : <p className="empty-note">Hôm nay không có lịch nhắc nào đang bật.</p>}
      {extra}
    </div>
  );
}

const WEEKDAY_FULL = { T2: "Thứ 2", T3: "Thứ 3", T4: "Thứ 4", T5: "Thứ 5", T6: "Thứ 6", T7: "Thứ 7", CN: "Chủ nhật" };

// Bảng giờ × thứ của một lịch. Bỏ một ô là bỏ đúng một mốc của đúng một thứ — chứ không
// phải tắt cả mốc giờ đó ở mọi ngày, cũng không phải tắt cả ngày hôm đó.
function SkipGrid({ src, onChange }) {
  const days = src.activeDays;
  return (
    <div className="tl-skip">
      <div className="tl-skip-row">
        <span className="tl-skip-hour" />
        {days.map((d) => <span key={d} className="tl-skip-day">{d}</span>)}
      </div>
      {src.hours.map((h) => (
        <div className="tl-skip-row" key={h}>
          <span className="tl-skip-hour">{h}</span>
          {days.map((d) => {
            const off = src.skip.includes(skipKey(d, h));
            return (
              <button type="button" key={d}
                className={`tl-skip-cell ${off ? "tl-skip-cell-off" : ""}`}
                title={`${d} ${h} — ${off ? "đang bỏ, bấm để chạy lại" : "đang chạy, bấm để bỏ"}`}
                onClick={() => onChange(toggleSkip(src.skip, d, h, !off))}>
                {off ? "–" : "✓"}
              </button>
            );
          })}
        </div>
      ))}
      <p className="field-hint" style={{ margin: "6px 0 0" }}>
        Ô "–" là mốc đó không chạy vào thứ ấy: không hiện trên timeline, không vào danh sách
        việc hôm nay, và Telegram cũng không nhắc.
      </p>
    </div>
  );
}

function SourceRow({ src, onMinutes, onSkip }) {
  const [open, setOpen] = useState(false);
  const skipped = src.skip.length;
  return (
    <div className="tl-src-item">
      <div className={`tl-src ${src.enabled ? "" : "tl-src-off"}`}>
        <span className="tl-src-name">{src.name}</span>
        <span className="field-hint tl-src-meta" style={{ margin: 0 }}>
          {src.hours.length ? src.hours.join(", ") : "chưa đặt giờ"} · {src.activeDays.length ? src.activeDays.join(" ") : "không ngày nào"}
          {skipped ? <b className="tl-src-skip"> · bỏ {skipped} ô</b> : null}
        </span>
        {src.canSkip && src.hours.length ? (
          <button type="button" className={`tl-src-skip-btn ${open ? "tl-src-skip-btn-on" : ""}`}
            onClick={() => setOpen(!open)} title="Bỏ bớt mốc giờ ở một số thứ">
            <CalendarX2 size={13} />
          </button>
        ) : null}
        <span className="tl-src-input">
          <input type="number" min="1" max="720" className="input" value={src.override}
            placeholder={`${taskMinutes(null, src.kind)}`}
            onChange={(e) => onMinutes(src, e.target.value)} />
          <span className="field-hint" style={{ margin: 0 }}>phút</span>
        </span>
      </div>
      {open ? <SkipGrid src={src} onChange={(next) => onSkip(src, next)} /> : null}
    </div>
  );
}

function SourceDurations({ sources, onChange, onSkip }) {
  const groups = TASK_KINDS
    .map((k) => ({ kind: k, rows: sources.filter((s) => s.kind === k.key) }))
    .filter((g) => g.rows.length);
  if (!groups.length) return <p className="empty-note">Chưa có lịch nào để chỉnh.</p>;
  return (
    <div className="tl-src-list">
      {groups.map(({ kind, rows }) => (
        <div key={kind.key} className="tl-src-group">
          <span className="tl-kind-label tl-src-group-title"><i style={{ background: kind.color }} /> {kind.label}</span>
          {rows.map((s) => <SourceRow key={s.key} src={s} onMinutes={onChange} onSkip={onSkip} />)}
        </div>
      ))}
    </div>
  );
}

// Xuất nhịp tuần sang Life Hub — nằm ở Cài đặt vì chỉ làm mỗi khi đổi lịch.
// CỐ TÌNH không truyền openTrades: số lệnh đang mở đổi từng giờ, xuất lúc 9h sáng và 3h chiều
// sẽ ra hai kết quả khác nhau và bên đó tưởng lịch vừa bị sửa.
export function LifeHubExport({ settings, watches, reminders }) {
  const durations = settings.taskDurations || emptyTaskDurations();
  const [feedMsg, setFeedMsg] = useState("");
  const buildFeed = () => ({
    feed: FEED_ID,
    name: FEED_NAME,
    color: FEED_COLOR,
    exportedAt: localIso(new Date()),
    items: timelineSources({ settings, watches, reminders, durations })
      .filter((x) => x.enabled && x.hours.length)
      // days tính riêng cho từng mốc giờ: bỏ ô lẻ nào thì thứ đó không còn trong mốc ấy.
      .flatMap((x) => x.hours.map((h) => ({
        title: [KIND_VI[x.kind], x.name].filter(Boolean).join(" · "),
        time: h,
        mins: x.minutes,
        days: daysOfHour(x, h),
      })).filter((it) => it.days.length)),
  });
  const exportFeed = () => {
    const feed = buildFeed();
    const blob = new Blob([JSON.stringify(feed, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lich-${FEED_ID}-${todayStr()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setFeedMsg(`Đã tải file — ${feed.items.length} mốc việc.`);
  };
  const copyFeed = async () => {
    const feed = buildFeed();
    try {
      await navigator.clipboard.writeText(JSON.stringify(feed, null, 2));
      setFeedMsg(`Đã chép — ${feed.items.length} mốc việc, dán thẳng vào Life Hub.`);
    } catch {
      // Trình duyệt chặn clipboard (thường vì không chạy trên HTTPS) — còn nút tải file.
      setFeedMsg("Trình duyệt không cho chép — bấm \"Tải file\" nhé.");
    }
  };
  return (
    <div className="tl-feed">
      <button type="button" className="btn" onClick={copyFeed}><ClipboardCopy size={14} /> Chép cho Life Hub</button>
      <button type="button" className="btn btn-ghost" onClick={exportFeed}><Download size={14} /> Tải file</button>
      {feedMsg ? <span className="tl-feed-msg">{feedMsg}</span> : null}
    </div>
  );
}

export function WeekPanel({ settings, watches, reminders, accounts, trades, mutedTrades, onSettingsChange, onWatchesChange, onRemindersChange }) {
  const [day, setDay] = useState(() => weekdayCodeFromNumber(new Date().getDay()));
  const [showDur, setShowDur] = useState(false);
  const durations = useMemo(() => settings.taskDurations || emptyTaskDurations(), [settings]);
  // Tài khoản không còn lệnh nào mở thì mốc "Dời SL" của nó không chạy — làm mờ đúng như thực tế.
  const openTrades = useMemo(() => openTradeCounter({ accounts, trades, mutedTrades }), [accounts, trades, mutedTrades]);
  const args = useMemo(
    () => ({ settings, watches, reminders, durations, openTrades }),
    [settings, watches, reminders, durations, openTrades]
  );
  const week = useMemo(() => buildWeekTimeline(args), [args]);
  const sources = useMemo(() => timelineSources(args), [args]);
  const today = week.find((d) => d.day === day) || week[0];
  const conflicts = useMemo(() => timelineConflicts(today.items), [today]);
  const busiest = Math.max(1, ...week.map((d) => d.load.minutes));
  const totalConflicts = week.reduce((n, d) => n + d.load.conflicts, 0);

  const setDefaultDuration = (key, value) => {
    onSettingsChange({ ...settings, taskDurations: { ...durations, [key]: value } });
  };
  // Mọi thay đổi ghi thẳng về bản ghi gốc, nên timeline không giữ bản sao lịch nào của riêng nó.
  const applyPatch = (source, patch) => {
    const res = applyTaskPatch({ settings, watches, reminders }, source, patch);
    if (res.changed === "settings") onSettingsChange(res.settings);
    else if (res.changed === "watches") onWatchesChange(res.watches);
    else if (res.changed === "reminders") onRemindersChange(res.reminders);
  };
  // Dời trúng đúng mốc giờ mà lịch đó đã có thì từ chối: gộp lại là âm thầm xoá mất một lần nhắc.
  const [notice, setNotice] = useState("");
  const moveTask = (item, hhmm) => {
    if (!hhmm || hhmm === item.source.hour || hhmmToMinutes(hhmm) === null) return;
    const src = sources.find((s) => s.kind === item.source.kind && s.id === item.source.id);
    if (src && src.hours.includes(hhmm)) {
      setNotice(`${src.name} đã có mốc ${hhmm} rồi — chọn giờ khác.`);
      return;
    }
    setNotice("");
    applyPatch(item.source, { hour: hhmm });
  };

  return (
    <div className="timeline-panel">
      <div className="tl-week">
        {week.map((d) => (
          <button type="button" key={d.day} className={`tl-day ${d.day === day ? "tl-day-active" : ""}`} onClick={() => setDay(d.day)}>
            <span className="tl-day-name">{d.day}</span>
            <span className="tl-day-bar"><i style={{ height: `${(d.load.minutes / busiest) * 100}%` }} /></span>
            <span className="tl-day-time">{d.load.minutes ? fmtDuration(d.load.minutes) : "—"}</span>
            <span className="field-hint" style={{ margin: 0 }}>{d.load.count} việc</span>
            {d.load.conflicts ? <span className="tl-day-clash"><AlertTriangle size={10} /> {d.load.conflicts}</span> : null}
          </button>
        ))}
      </div>
      {totalConflicts ? (
        <p className="field-hint" style={{ color: "var(--loss)" }}>
          {totalConflicts} việc chồng giờ trong tuần (cột đỏ). Việc chung một mốc đã được xếp nối tiếp — chỉ còn những việc lệch mốc mà đè lên nhau.
        </p>
      ) : null}

      <h3 className="block-title">{WEEKDAY_FULL[day]} · {today.load.count} việc · {fmtDuration(today.load.minutes)}</h3>
      {today.items.length === 0 ? (
        <p className="empty-note">Ngày này chưa có lịch nào.</p>
      ) : (
        <>
          {notice ? <p className="field-hint" style={{ marginBottom: 8, color: "var(--loss)" }}>{notice}</p> : null}
          <DayTrack items={today.items} conflicts={conflicts} onMove={moveTask} />
          <div className="tl-list">
            {today.items.map((x) => {
              const k = taskKind(x.kind);
              const clash = conflicts.has(x.id);
              return (
                <div key={x.id} className={`tl-item ${x.enabled ? "" : "tl-item-off"}`}>
                  <input type="time" className="input tl-item-time" value={x.source.hour} disabled={x.fixedTime}
                    title={x.fixedTime ? "Giờ đóng nến tự tính — không sửa tay" : `Đổi giờ — áp dụng cho ${(x.days || []).join(", ")}`}
                    onChange={(e) => moveTask(x, e.target.value)} />
                  <span className="tl-item-dot" style={{ background: x.enabled ? k.color : "var(--border)" }} />
                  <span className="tl-item-title">{x.title}</span>
                  {x.sub ? <span className="field-hint" style={{ margin: 0 }}>{x.sub}</span> : null}
                  <span className="tl-item-dur"><Clock size={11} /> {fmtDuration(x.minutes)} → {minutesToHhmm(x.start + x.minutes)}</span>
                  {!x.enabled ? <span className="tl-tag">đang tắt</span> : null}
                  {clash ? <span className="tl-tag tl-tag-clash"><AlertTriangle size={10} /> trùng giờ</span> : null}
                </div>
              );
            })}
          </div>
          <p className="field-hint" style={{ marginTop: 6 }}>Kéo khối hoặc sửa ô giờ để dời — đổi cho mọi thứ lịch đó đang bật. Lịch theo giờ đóng nến thì giờ khoá.</p>
        </>
      )}

      <button type="button" className={`plan-more ${showDur ? "plan-more-on" : ""}`} onClick={() => setShowDur(!showDur)}>
        <ChevronDown size={14} /> Thời lượng từng việc · bỏ mốc lẻ theo thứ
      </button>
      {showDur ? (
        <>
          <p className="field-hint" style={{ marginBottom: 10 }}>Số phút dự kiến — dùng để xếp khối và phát hiện chồng giờ.</p>
          <div className="tl-duration-grid">
            {TASK_KINDS.map((k) => (
              <Field key={k.key} label={<span className="tl-kind-label"><i style={{ background: k.color }} /> {k.label}</span>}>
                <input type="number" min="1" max="720" className="input"
                  value={durations[k.key] ?? k.defaultMinutes}
                  onChange={(e) => setDefaultDuration(k.key, e.target.value)}
                  onBlur={(e) => setDefaultDuration(k.key, taskMinutes({ [k.key]: e.target.value }, k.key))} />
              </Field>
            ))}
          </div>
          <p className="field-hint" style={{ margin: "12px 0 8px" }}>
            Riêng từng lịch: bỏ trống là dùng số mặc định. Nút <CalendarX2 size={12} style={{ verticalAlign: "-2px" }} /> để bỏ vài mốc lẻ ở một số thứ.
          </p>
          <SourceDurations sources={sources}
            onChange={(s, value) => applyPatch({ kind: s.kind, id: s.id }, { minutes: value })}
            onSkip={(s, next) => applyPatch({ kind: s.kind, id: s.id }, { skip: next })} />
        </>
      ) : null}
    </div>
  );
}
