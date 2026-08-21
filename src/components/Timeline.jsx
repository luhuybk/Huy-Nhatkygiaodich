import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Clock, GripHorizontal } from "lucide-react";
import { Field } from "./ui.jsx";
import {
  TASK_KINDS, taskKind, emptyTaskDurations, taskMinutes, applyTaskPatch, timelineSources,
  buildWeekTimeline, timelineConflicts, fmtDuration, minutesToHhmm, hhmmToMinutes, snapMinutes, openTradeCounter,
  weekdayCodeFromNumber,
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
    onMove(d.item, minutesToHhmm(d.next));
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
                onPointerDown={(e) => startDrag(e, x)}
                title={`Kéo ngang để dời giờ — đổi cho cả ${(x.days || []).join(", ")}`}>
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

function SourceDurations({ sources, onChange }) {
  const groups = TASK_KINDS
    .map((k) => ({ kind: k, rows: sources.filter((s) => s.kind === k.key) }))
    .filter((g) => g.rows.length);
  if (!groups.length) return <p className="empty-note">Chưa có lịch nào để chỉnh.</p>;
  return (
    <div className="tl-src-list">
      {groups.map(({ kind, rows }) => (
        <div key={kind.key} className="tl-src-group">
          <span className="tl-kind-label tl-src-group-title"><i style={{ background: kind.color }} /> {kind.label}</span>
          {rows.map((s) => (
            <div key={s.key} className={`tl-src ${s.enabled ? "" : "tl-src-off"}`}>
              <span className="tl-src-name">{s.name}</span>
              <span className="field-hint tl-src-meta" style={{ margin: 0 }}>
                {s.hours.length ? s.hours.join(", ") : "chưa đặt giờ"} · {s.activeDays.join(" ")}
              </span>
              <span className="tl-src-input">
                <input type="number" min="1" max="720" className="input" value={s.override}
                  placeholder={`${taskMinutes(null, s.kind)}`}
                  onChange={(e) => onChange(s, e.target.value)} />
                <span className="field-hint" style={{ margin: 0 }}>phút</span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function TimelinePanel({ settings, watches, reminders, accounts, trades, mutedTrades, onSettingsChange, onWatchesChange, onRemindersChange }) {
  const [day, setDay] = useState(() => weekdayCodeFromNumber(new Date().getDay()));
  // Cài đặt cũ chưa có mục này — nhớ lại kết quả để timeline không phải tính lại mỗi lần vẽ.
  const durations = useMemo(() => settings.taskDurations || emptyTaskDurations(), [settings]);
  // Tài khoản không còn lệnh nào mở thì mốc "Dời SL" của nó không hề chạy — đếm ở đây
  // để timeline làm mờ nó đúng như thực tế.
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

  // Mọi thay đổi ghi thẳng về bản ghi gốc ở tab tương ứng, nên timeline không giữ
  // bản sao lịch nào của riêng nó — sửa ở đâu cũng ra cùng một kết quả.
  const applyPatch = (source, patch) => {
    const res = applyTaskPatch({ settings, watches, reminders }, source, patch);
    if (res.changed === "settings") onSettingsChange(res.settings);
    else if (res.changed === "watches") onWatchesChange(res.watches);
    else if (res.changed === "reminders") onRemindersChange(res.reminders);
  };
  // Dời trúng đúng mốc giờ mà lịch đó đã có thì từ chối: gộp lại là âm thầm xoá
  // mất một lần nhắc, mà người dùng không hề bảo xoá.
  const [notice, setNotice] = useState("");
  const moveTask = (item, hhmm) => {
    if (!hhmm || hhmm === item.source.hour || hhmmToMinutes(hhmm) === null) return;
    const src = sources.find((s) => s.kind === item.source.kind && s.id === item.source.id);
    if (src && src.hours.includes(hhmm)) {
      setNotice(`${src.name} đã có mốc ${hhmm} rồi — chọn giờ khác, hoặc xoá bớt mốc ở tab tương ứng.`);
      return;
    }
    setNotice("");
    applyPatch(item.source, { hour: hhmm });
  };

  return (
    <div className="timeline-panel">
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Gom mọi lịch bạn đã đặt ở các tab bên cạnh — dời SL, kiểm tra setup, symbol theo dõi, nhắc nhở riêng,
        tổng kết tuần — về cùng một trục thời gian để thấy ngày nào nặng, việc nào đè lên việc nào.
        Lịch đang tắt vẫn hiện nhưng mờ đi và không tính vào tổng — mốc "Dời SL" của tài khoản
        đang không có lệnh mở cũng mờ, vì Telegram sẽ không gửi tin nào cho nó.
      </p>

      <h3 className="block-title" style={{ marginTop: 0 }}>Thời gian dự kiến — mặc định theo loại việc</h3>
      <p className="field-hint" style={{ marginBottom: 10 }}>
        Tính bằng phút. Đây là con số dùng để xếp khối lên timeline và để phát hiện trùng giờ —
        kiểm tra setup 30-40 phút thì đặt 35, dời SL chỉ liếc qua thì đặt 5.
      </p>
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

      <h3 className="block-title">Riêng từng lịch</h3>
      <p className="field-hint" style={{ marginBottom: 10 }}>
        Bỏ trống thì dùng số mặc định ở trên. Chỉ điền khi một lịch tốn khác hẳn —
        kiểm tra setup Forex mất 40 phút trong khi VN Stock chỉ 10.
      </p>
      <SourceDurations sources={sources} onChange={(s, value) => applyPatch({ kind: s.kind, id: s.id }, { minutes: value })} />

      <h3 className="block-title">Cả tuần</h3>
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
      {totalConflicts === 0 ? (
        <p className="field-hint" style={{ color: "var(--win)" }}>Không có việc nào chồng giờ nhau trong tuần.</p>
      ) : (
        <p className="field-hint" style={{ color: "var(--loss)" }}>
          Có {totalConflicts} việc bị chồng giờ trong tuần — cột đỏ ở trên là ngày dính. Kéo khối bên dưới để giãn ra.
        </p>
      )}

      <h3 className="block-title">{day} — {today.load.count} việc · {fmtDuration(today.load.minutes)}</h3>
      {today.items.length === 0 ? (
        <p className="empty-note">Ngày này chưa có lịch nào. Đặt giờ nhắc ở các tab Nhắc dời SL, Kiểm tra setup hoặc Symbol theo dõi.</p>
      ) : (
        <>
          <p className="field-hint" style={{ marginBottom: 8 }}>
            Kéo ngang một khối để dời giờ (nhích theo từng 5 phút), hoặc sửa thẳng ô giờ trong danh sách bên dưới.
            Mỗi lịch dùng chung một danh sách giờ cho mọi thứ nó đang bật, nên dời ở đây là dời cho cả những ngày kia.
          </p>
          {notice ? <p className="field-hint" style={{ marginBottom: 8, color: "var(--loss)" }}>{notice}</p> : null}
          <DayTrack items={today.items} conflicts={conflicts} onMove={moveTask} />
          <div className="tl-list">
            {today.items.map((x) => {
              const k = taskKind(x.kind);
              const clash = conflicts.has(x.id);
              return (
                <div key={x.id} className={`tl-item ${x.enabled ? "" : "tl-item-off"}`}>
                  <input type="time" className="input tl-item-time" value={x.source.hour}
                    title={`Đổi giờ — áp dụng cho ${(x.days || []).join(", ")}`}
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
        </>
      )}
    </div>
  );
}
