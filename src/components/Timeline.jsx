import { useMemo, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { Field } from "./ui.jsx";
import {
  TASK_KINDS, taskKind, emptyTaskDurations, taskMinutes,
  buildWeekTimeline, timelineConflicts, fmtDuration, minutesToHhmm, weekdayCodeFromNumber,
} from "../lib/helpers.js";

// Trục ngang luôn dừng ở mốc giờ tròn, và luôn rộng ít nhất 4 tiếng để một ngày
// chỉ có mỗi việc 5 phút không bị kéo giãn thành cả màn hình.
const MIN_SPAN = 240;
// Chừa chỗ bên phải cho nhãn nằm ngoài khối, để tên việc không bị cắt cụt.
const LABEL_SPACE = 300;

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

function DayTrack({ items, conflicts }) {
  const { from, to } = trackRange(items);
  const span = to - from;
  const hours = [];
  for (let m = from; m <= to; m += 60) hours.push(m);
  const pct = (m) => ((m - from) / span) * 100;

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
          return (
            <div key={x.id} className={`tl-row ${x.enabled ? "" : "tl-row-off"}`}>
              <div className="tl-row-grid">
                {hours.map((m) => <span key={m} className="tl-gridline" style={{ left: `${pct(m)}%` }} />)}
              </div>
              <div className={`tl-block ${clash ? "tl-block-clash" : ""}`}
                style={{
                  left: `${pct(x.start)}%`, width: `${Math.max((x.minutes / span) * 100, 1.2)}%`,
                  background: x.enabled ? `${k.color}33` : "transparent",
                  borderColor: x.enabled ? k.color : "var(--border)",
                }}
                title={`${x.title}${x.sub ? ` · ${x.sub}` : ""} — ${minutesToHhmm(x.start)}-${minutesToHhmm(x.start + x.minutes)}`}>
                <span className="tl-block-label">{minutesToHhmm(x.start)} · {x.title}{x.sub ? ` · ${x.sub}` : ""}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TimelinePanel({ settings, watches, reminders, onSettingsChange }) {
  const [day, setDay] = useState(() => weekdayCodeFromNumber(new Date().getDay()));
  // Cài đặt cũ chưa có mục này — nhớ lại kết quả để timeline không phải tính lại mỗi lần vẽ.
  const durations = useMemo(() => settings.taskDurations || emptyTaskDurations(), [settings]);
  const args = useMemo(() => ({ settings, watches, reminders, durations }), [settings, watches, reminders, durations]);
  const week = useMemo(() => buildWeekTimeline(args), [args]);
  const today = week.find((d) => d.day === day) || week[0];
  const conflicts = useMemo(() => timelineConflicts(today.items), [today]);
  const busiest = Math.max(1, ...week.map((d) => d.load.minutes));
  const totalConflicts = week.reduce((n, d) => n + d.load.conflicts, 0);

  const setDuration = (key, value) => {
    onSettingsChange({ ...settings, taskDurations: { ...durations, [key]: value } });
  };

  return (
    <div className="timeline-panel">
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Gom mọi lịch bạn đã đặt ở các tab bên cạnh — dời SL, kiểm tra setup, symbol theo dõi, nhắc nhở riêng,
        tổng kết tuần — về cùng một trục thời gian để thấy ngày nào nặng, việc nào đè lên việc nào.
        Lịch đang tắt vẫn hiện nhưng mờ đi và không tính vào tổng.
      </p>

      <h3 className="block-title" style={{ marginTop: 0 }}>Thời gian dự kiến cho mỗi loại việc</h3>
      <p className="field-hint" style={{ marginBottom: 10 }}>
        Tính bằng phút. Đây là con số dùng để xếp khối lên timeline và để phát hiện trùng giờ —
        kiểm tra setup 30-40 phút thì đặt 35, dời SL chỉ liếc qua thì đặt 5.
      </p>
      <div className="tl-duration-grid">
        {TASK_KINDS.map((k) => (
          <Field key={k.key} label={<span className="tl-kind-label"><i style={{ background: k.color }} /> {k.label}</span>}>
            <input type="number" min="1" max="720" className="input"
              value={durations[k.key] ?? k.defaultMinutes}
              onChange={(e) => setDuration(k.key, e.target.value)}
              onBlur={(e) => setDuration(k.key, taskMinutes({ [k.key]: e.target.value }, k.key))} />
          </Field>
        ))}
      </div>

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
          Có {totalConflicts} việc bị chồng giờ trong tuần — cột đỏ ở trên là ngày dính. Dời bớt giờ nhắc ở tab tương ứng để giãn ra.
        </p>
      )}

      <h3 className="block-title">{day} — {today.load.count} việc · {fmtDuration(today.load.minutes)}</h3>
      {today.items.length === 0 ? (
        <p className="empty-note">Ngày này chưa có lịch nào. Đặt giờ nhắc ở các tab Nhắc dời SL, Kiểm tra setup hoặc Symbol theo dõi.</p>
      ) : (
        <>
          <DayTrack items={today.items} conflicts={conflicts} />
          <div className="tl-list">
            {today.items.map((x) => {
              const k = taskKind(x.kind);
              const clash = conflicts.has(x.id);
              return (
                <div key={x.id} className={`tl-item ${x.enabled ? "" : "tl-item-off"}`}>
                  <span className="mono tl-item-time">{minutesToHhmm(x.start)}</span>
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
