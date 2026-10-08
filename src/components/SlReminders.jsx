import { useMemo, useRef, useState } from "react";
import {
  Send, Bell, CheckCircle2, XCircle, Eye, EyeOff, PlusCircle, Trash2, X, ChevronDown, ArrowUpDown, Search,
  CalendarDays, Clock, Settings2,
} from "lucide-react";
import { ConfirmButton, DangerConfirmButton, Field, StatCard, Switch } from "./ui.jsx";
import { AutoHoursPreview, CandleSessionsPanel, WatchHoursPreview } from "./CandleSessions.jsx";
import { LifeHubExport } from "./Timeline.jsx";
import {
  daysSince, emptyIncompleteReminder, emptyMutedFillReminder, emptyReconcileReminder, emptyReminderSchedule, emptySymbolWatch,
  emptyTimeframeSchedule, emptyWeeklySummary, tradeInSchedule,
  looksTelexed, mergeSymbolList, mutedFillDays, parseHoursInput,
  parseSymbolList, readLocalUi, setupCheckStats, setupCheckStreak, writeLocalUi,
  SL_REMINDER_DEFAULT_HOURS, SYMBOL_WATCH_DEFAULT_HOURS, sortSymbolNames, sortWatchSymbols, symbolSuggestions, uid, untelexSymbol, WEEKDAY_CODES,
  watchIsAuto, watchLiveSymbols, watchScheduleHours,
} from "../lib/helpers.js";
import { DEFAULT_AUTO_SLOTS, tfHours, vnToday } from "../lib/candles.js";

const WEEKDAY_FULL_LABEL = { T2: "Thứ 2", T3: "Thứ 3", T4: "Thứ 4", T5: "Thứ 5", T6: "Thứ 6", T7: "Thứ 7", CN: "Chủ nhật" };

const hoursText = (list) => (list || []).filter(Boolean).map((h) => `${Number(h.slice(0, 2))}h${h.endsWith(":00") ? "" : h.slice(3)}`).join(" ");

// Chế độ giờ đóng nến đang dùng, viết ngắn để nhắc ở đầu các mục: "mốc 00:00 · 08:30 · …".
function candleModeText(settings) {
  const slots = settings.autoSlots || DEFAULT_AUTO_SLOTS;
  return slots.enabled
    ? `chỉ nhắc ở các mốc ${hoursText(slots.hours).split(" ").join(" · ")}`
    : "nhắc ngay khi nến đóng (trừ giờ nghỉ)";
}

// Thiếu hẳn activeDays (dữ liệu cũ) = mọi ngày. Bỏ tick hết thì là KHÔNG ngày nào — bot cũng hiểu vậy,
// nên phải hiện đúng là tắt hết chứ không được hiện lại thành bật hết.
function DayChips({ days, onToggle }) {
  const active = Array.isArray(days) ? days : WEEKDAY_CODES;
  return (
    <div className="day-chips">
      {WEEKDAY_CODES.map((d) => (
        <button type="button" key={d} className={`day-chip ${active.includes(d) ? "day-chip-on" : ""}`} onClick={() => onToggle(d)}>{d}</button>
      ))}
    </div>
  );
}

const toggleIn = (list, day) => {
  const days = Array.isArray(list) ? list : [...WEEKDAY_CODES];
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
};

// Giờ riêng theo khung (chỉ lịch dời SL dùng). Chỉ gợi ý những khung tài khoản này đã từng
// trade — tài khoản chỉ đánh một khung thì khỏi bận tâm.
function TimeframeSchedules({ account, base, schedules, resources, trades, onTf }) {
  const own = schedules.filter((sc) => sc.timeframe && sc.accountId === account.id);
  const order = resources.timeframes || [];
  const used = [...new Set((trades || []).filter((t) => t && t.account === account.name && t.timeframe).map((t) => t.timeframe))]
    .sort((a, b) => ((order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999)) || a.localeCompare(b));
  const addable = used.filter((tf) => !own.some((x) => x.timeframe === tf));
  if (!own.length && used.length < 2) return null;
  const openOf = (sched) => (trades || []).filter((t) => t && t.account === account.name && t.entryDate && !t.exitDate && tradeInSchedule(t, sched, schedules)).length;
  return (
    <div className="sl-tf">
      {own.map((ts) => {
        const n = openOf(ts);
        return (
          <div key={ts.timeframe} className="sl-tf-row">
            <Switch checked={!!ts.enabled} onChange={(v) => onTf.update(account, ts.timeframe, { enabled: v })} />
            <span>Khung <b>{ts.timeframe}</b> <small className="sl-tf-open">{n ? `${n} lệnh mở` : "không có lệnh mở"}</small></span>
            <label className="sl-auto-toggle" title="Giờ nhắc = giờ đóng nến của khung này theo phiên của từng mã">
              <input type="checkbox" checked={!!ts.auto} onChange={(e) => onTf.update(account, ts.timeframe, { auto: e.target.checked })} /> Theo nến
            </label>
            {ts.auto ? null : (
              <input className="input input-inline" style={{ flex: 1 }} key={(ts.hours || []).join(",")}
                defaultValue={(ts.hours || []).join(", ")} placeholder="Giờ dời SL cho khung này, VD 7, 15, 23"
                onBlur={(e) => onTf.update(account, ts.timeframe, { hours: parseHoursInput(e.target.value) })} />
            )}
            <ConfirmButton onConfirm={() => onTf.remove(account, ts.timeframe)} />
          </div>
        );
      })}
      {addable.length ? (
        <div className="sl-tf-add">
          <span>Giờ riêng theo khung:</span>
          {addable.map((tf) => (
            <button key={tf} type="button" className="sl-tf-add-btn" onClick={() => onTf.add(account, base, tf)}>
              <PlusCircle size={12} /> {tf}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Một thẻ = một tài khoản: công tắc, giờ (hoặc "theo nến"), thứ trong tuần. Topic Telegram nằm ở Cài đặt.
function AccountScheduleCards({ schedules, resources, onUpdate, trades, onTf, settings, candle }) {
  const scheduleFor = (accountId) => schedules.find((sc) => sc.accountId === accountId && !sc.timeframe);
  if (resources.accounts.length === 0) {
    return <p className="empty-note">Chưa có tài khoản nào — thêm ở mục Tài khoản trước.</p>;
  }
  return (
    <div className="acc-list">
      {resources.accounts.map((acc) => {
        const sched = scheduleFor(acc.id) || emptyReminderSchedule(acc.id, acc.name);
        const auto = candle && sched.auto;
        // Theo nến thì giờ gõ tay chỉ còn cho lệnh khung W / chưa ghi khung — có lệnh như vậy mới hiện ô.
        const manualLeft = auto && (trades || []).some((t) => t && t.account === acc.name && t.entryDate && !t.exitDate && !tfHours(t.timeframe));
        return (
          <div key={acc.id} className={`acc-card ${sched.enabled ? "" : "acc-card-off"}`}>
            <div className="acc-row">
              <Switch checked={!!sched.enabled} onChange={(v) => onUpdate(acc, { enabled: v })} />
              <b className="acc-name">{acc.name}</b>
              {candle ? (
                <label className={`acc-auto ${auto ? "acc-auto-on" : ""}`} title="Mỗi lệnh nhắc theo giờ đóng nến khung của nó (H4, H8, D…), theo phiên của mã">
                  <input type="checkbox" checked={!!sched.auto} onChange={(e) => onUpdate(acc, { auto: e.target.checked })} /> Theo giờ đóng nến
                </label>
              ) : null}
              {auto && !manualLeft ? <span className="acc-hours" /> : (
              <input className="input input-inline acc-hours" key={(sched.hours || []).join(",")}
                defaultValue={(sched.hours && sched.hours.length ? sched.hours : SL_REMINDER_DEFAULT_HOURS).join(", ")}
                placeholder={auto ? "Giờ cho lệnh khung W" : "9 12 15 18 21"}
                title={auto ? "Chỉ dùng cho lệnh mà khung không tự tính được (W, M15, chưa ghi khung)" : "Giờ nhắc, giờ Việt Nam — gõ tắt \"9 14 20\" được"}
                onBlur={(e) => onUpdate(acc, { hours: parseHoursInput(e.target.value) })} />
              )}
              <DayChips days={sched.activeDays} onToggle={(d) => onUpdate(acc, { activeDays: toggleIn(sched.activeDays, d) })} />
            </div>
            {auto && sched.enabled ? (
              <AutoHoursPreview settings={settings} trades={(trades || []).filter((t) => t && t.account === acc.name && t.entryDate && !t.exitDate && tradeInSchedule(t, sched, schedules))} />
            ) : null}
            {onTf ? <TimeframeSchedules account={acc} base={sched} schedules={schedules} resources={resources} trades={trades} onTf={onTf} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function useTelegramTest(settings, defaultText) {
  const [testState, setTestState] = useState(null); // null | "sending" | "ok" | "error"
  const sendTest = async (threadId, text) => {
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      setTestState("error");
      return;
    }
    setTestState("sending");
    try {
      const body = { chat_id: settings.telegramChatId, text: text || defaultText };
      if (threadId) body.message_thread_id = Number(threadId);
      const res = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setTestState(res.ok ? "ok" : "error");
    } catch (e) {
      setTestState("error");
    }
    setTimeout(() => setTestState(null), 4000);
  };
  return { testState, sendTest };
}

function TestState({ state }) {
  if (state === "ok") return <span className="field-hint test-ok"><CheckCircle2 size={13} /> Đã gửi, kiểm tra Telegram</span>;
  if (state === "error") return <span className="field-hint test-err"><XCircle size={13} /> Gửi thất bại — kiểm tra Token/Chat ID</span>;
  return null;
}

// Một mục trong tab Lịch nhắc: dòng tóm tắt luôn hiện, bấm mới mở phần chỉnh.
function PlanSection({ id, icon: Icon, title, summary, on, onToggle, open, onOpen, children }) {
  return (
    <div className={`plan ${open ? "plan-open" : ""} ${on === false ? "plan-off" : ""}`}>
      <div className="plan-head" role="button" tabIndex={0} onClick={() => onOpen(open ? "" : id)}
        onKeyDown={(e) => { if (e.key === "Enter") onOpen(open ? "" : id); }}>
        <span className="plan-icon"><Icon size={16} /></span>
        <span className="plan-text">
          <b>{title}</b>
          <span className="plan-summary">{summary}</span>
        </span>
        {onToggle ? <Switch checked={!!on} onChange={onToggle} title={on ? "Đang bật — bấm để tắt" : "Đang tắt — bấm để bật"} /> : null}
        <ChevronDown size={16} className="plan-chev" />
      </div>
      {open ? <div className="plan-body">{children}</div> : null}
    </div>
  );
}

// ───────────────────────── Dời SL ─────────────────────────

function SlBody({ settings, onChange, resources, trades, mutedTrades, onMutedTradesChange }) {
  const s = settings;
  const isBase = (sc, account) => sc.accountId === account.id && !sc.timeframe;
  const updateSchedule = (account, patch) => {
    const exists = s.schedules.find((sc) => isBase(sc, account));
    const next = exists
      ? s.schedules.map((sc) => (isBase(sc, account) ? { ...sc, ...patch } : sc))
      : [...s.schedules, { ...emptyReminderSchedule(account.id, account.name), ...patch }];
    onChange({ ...s, schedules: next });
  };
  const isTf = (sc, account, tf) => sc.accountId === account.id && sc.timeframe === tf;
  const onTf = {
    add: (account, base, tf) => onChange({ ...s, schedules: [...s.schedules, emptyTimeframeSchedule({ ...base, accountId: account.id, accountName: account.name }, tf)] }),
    update: (account, tf, patch) => onChange({ ...s, schedules: s.schedules.map((sc) => (isTf(sc, account, tf) ? { ...sc, ...patch } : sc)) }),
    remove: (account, tf) => onChange({ ...s, schedules: s.schedules.filter((sc) => !isTf(sc, account, tf)) }),
  };

  const muted = mutedTrades || [];
  const fill = s.mutedFillReminder || emptyMutedFillReminder();
  const fillDays = mutedFillDays(fill);
  const setFill = (patch) => onChange({ ...s, mutedFillReminder: { ...fill, ...patch } });
  const mutedList = useMemo(
    () => muted.map((m) => ({ ...m, trade: (trades || []).find((t) => t.id === m.tradeId) })),
    [muted, trades]
  );
  const unmute = (tradeId) => onMutedTradesChange(muted.filter((m) => m.tradeId !== tradeId));

  return (
    <>
      <p className="plan-hint">
        Chỉ nhắc khi tài khoản có lệnh mở — mỗi tài khoản một tin, mỗi lệnh một dòng kèm nút <b>Đã dời</b> / <b>Kết thúc</b>.
        Tick <b>Theo giờ đóng nến</b> thì mỗi lệnh nhắc theo nến khung của nó, hiện đang {candleModeText(s)}.
      </p>
      <AccountScheduleCards schedules={s.schedules} resources={resources} onUpdate={updateSchedule} trades={trades} onTf={onTf} settings={s} candle />

      <h4 className="plan-sub">Lệnh đã bấm "Kết thúc" {mutedList.length ? <span className="plan-count">{mutedList.length}</span> : null}</h4>
      {mutedList.length ? (
        <div className="muted-list">
          {mutedList.map((m) => {
            const waited = daysSince(m.mutedAt);
            const overdue = fill.enabled !== false && waited !== null && waited >= fillDays;
            return (
              <div key={m.tradeId} className="muted-row">
                <b>{m.trade ? (m.trade.symbol || "?") : "(lệnh không còn)"}</b>
                <span className="field-hint" style={{ flex: 1, margin: 0 }}>
                  {m.trade ? `${m.trade.account || ""} · vào ${m.trade.entryDate || "—"}` : "đã xoá hoặc đã đóng"}
                  {waited !== null ? ` · chờ ${waited} ngày` : ""}
                </span>
                {m.fillDone ? <span className="tl-tag">đã tắt nhắc điền</span> : overdue ? <span className="tl-tag tl-tag-clash">quá hạn điền</span> : null}
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => unmute(m.tradeId)}><Bell size={12} /> Nhắc lại</button>
              </div>
            );
          })}
        </div>
      ) : <p className="field-hint">Không có lệnh nào — khi bạn bấm "Kết thúc" trên Telegram mà chưa ghi nhật ký, lệnh nằm ở đây.</p>}
      <div className="job-row">
        <Switch checked={fill.enabled !== false} onChange={(v) => setFill({ enabled: v })} />
        <span className="job-label job-label-inline">Nhắc điền nhật ký nếu sau
          <input type="number" min="1" max="60" className="input input-inline job-num" value={fill.days ?? ""}
            onChange={(e) => setFill({ days: e.target.value })} placeholder={`${fillDays}`} />
          ngày vẫn chưa có ngày thoát, lúc
          <input type="time" className="input input-inline job-time" value={fill.time || "20:00"} onChange={(e) => setFill({ time: e.target.value })} />
        </span>
      </div>
    </>
  );
}

// ───────────────────────── Kiểm tra setup ─────────────────────────

function SetupBody({ settings, onChange, resources, checkLog }) {
  const s = settings;
  const list = s.setupCheckSchedules || [];
  const week = useMemo(() => setupCheckStats(checkLog, 7), [checkLog]);
  const month = useMemo(() => setupCheckStats(checkLog, 30), [checkLog]);
  const streak = useMemo(() => setupCheckStreak(checkLog), [checkLog]);
  const updateSchedule = (account, patch) => {
    const exists = list.find((sc) => sc.accountId === account.id);
    const next = exists
      ? list.map((sc) => (sc.accountId === account.id ? { ...sc, ...patch } : sc))
      : [...list, { ...emptyReminderSchedule(account.id, account.name), ...patch }];
    onChange({ ...s, setupCheckSchedules: next });
  };
  return (
    <>
      <p className="plan-hint">Lời nhắc "tới giờ ngồi soi bảng giá" theo từng tài khoản — không phụ thuộc lệnh đang mở. Tin có nút <b>Đã kiểm tra</b> để tính tỷ lệ.</p>
      <AccountScheduleCards schedules={list} resources={resources} onUpdate={updateSchedule} />
      <h4 className="plan-sub">Tỷ lệ hoàn thành</h4>
      {week.total === 0 && month.total === 0 ? (
        <p className="field-hint">Chưa có lần nhắc nào — số liệu hiện sau lần nhắc đầu tiên.</p>
      ) : (
        <>
          <div className="stat-grid stat-grid-4">
            <StatCard label="Chuỗi hiện tại" value={`${streak.current} ngày`} tone={streak.current > 0 ? "win" : ""}
              sub={streak.todayDone === false ? "hôm nay còn lần chưa bấm" : streak.todayDone ? "hôm nay đã đủ" : "hôm nay chưa có lịch"} />
            <StatCard label="Kỷ lục" value={`${streak.best} ngày`} />
            <StatCard label="7 ngày" value={week.percent === null ? "—" : `${week.percent}%`} sub={`${week.done}/${week.total} lần`} />
            <StatCard label="30 ngày" value={month.percent === null ? "—" : `${month.percent}%`} sub={`${month.done}/${month.total} lần`} />
          </div>
          {week.accounts.length > 1 ? (
            <div className="muted-list" style={{ marginTop: 8 }}>
              {week.accounts.map((a) => {
                const pct = a.total ? Math.round((a.done / a.total) * 100) : 0;
                return (
                  <div key={a.name} className="muted-row">
                    <b style={{ minWidth: 100 }}>{a.name}</b>
                    <div className="completion-bar-track" style={{ flex: 1 }}><div className="completion-bar-fill" style={{ width: `${pct}%` }} /></div>
                    <span className="mono field-hint" style={{ margin: 0 }}>{a.done}/{a.total} · {pct}%</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

// ───────────────────────── Việc định kỳ ─────────────────────────

function JobRow({ label, hint, cfg, onChange }) {
  return (
    <div className={`job-row ${cfg.enabled ? "" : "job-off"}`}>
      <Switch checked={!!cfg.enabled} onChange={(v) => onChange({ enabled: v })} />
      <span className="job-label"><b>{label}</b>{hint ? <small>{hint}</small> : null}</span>
      <select className="input input-inline job-day" value={cfg.weekday} onChange={(e) => onChange({ weekday: e.target.value })}>
        {WEEKDAY_CODES.map((d) => <option key={d} value={d}>{WEEKDAY_FULL_LABEL[d]}</option>)}
      </select>
      <input type="time" className="input input-inline job-time" value={cfg.time || ""} onChange={(e) => onChange({ time: e.target.value })} />
    </div>
  );
}

function PeriodicBody({ settings, onChange, remindersNode }) {
  const s = settings;
  const ws = { ...emptyWeeklySummary(), ...(s.weeklySummary || {}) };
  const rec = { ...emptyReconcileReminder(), ...(s.reconcileReminder || {}) };
  const inc = { ...emptyIncompleteReminder(), ...(s.incompleteReminder || {}) };
  return (
    <>
      <div className="job-list">
        <JobRow label="Tổng kết tuần" hint="lệnh đóng, winrate, R, lãi/lỗ, setup miss — 7 ngày" cfg={ws}
          onChange={(p) => onChange({ ...s, weeklySummary: { ...ws, ...p } })} />
        <JobRow label="Đối chiếu file sàn" hint="nhắc xuất CSV từ sàn để quét lệnh quên ghi" cfg={rec}
          onChange={(p) => onChange({ ...s, reconcileReminder: { ...rec, ...p } })} />
        <JobRow label="Điền nốt lệnh chưa xong" hint="liệt kê lệnh có tiến độ dưới 100%" cfg={inc}
          onChange={(p) => onChange({ ...s, incompleteReminder: { ...inc, ...p } })} />
      </div>
      <h4 className="plan-sub">Nhắc nhở riêng</h4>
      {remindersNode}
    </>
  );
}

// ───────────────────────── Symbol theo dõi ─────────────────────────

// Ô nhập symbol dạng chip: gõ tên rồi phím cách / Enter / dấu phẩy là chốt thành một chip.
// Backspace ở ô rỗng xóa chip cuối. Hàng "gợi ý" lọc theo chữ đang gõ.
const SYMBOL_SUGGEST_SHOWN = 12;

function SymbolBox({ items, suggestions, onAdd, onRemove, onToggle, onSubmitEmpty, placeholder, autoFocus, hideDone }) {
  const [text, setText] = useState("");
  // Gợi ý chỉ hiện khi đang gõ vào ô (hoặc ô còn trống trơn) — không thì mỗi nhóm một hàng chip, rất rối.
  const [focused, setFocused] = useState(false);
  const chosen = useMemo(() => new Set((items || []).map((x) => x.name)), [items]);
  // Ẩn mã đã ngừng chỉ là ẩn khỏi mắt: danh sách thật (để gợi ý, để chống trùng) vẫn đủ.
  const shown = hideDone ? (items || []).filter((x) => !x.done) : (items || []);
  // Mã đã biết, để khi dịch ngược Telex mà có nhiều cách đọc thì chọn đúng mã có thật.
  const known = useMemo(() => new Set(suggestions || []), [suggestions]);
  const parse = (raw) => parseSymbolList(raw, known);
  // Không sửa chữ ngay lúc đang gõ: bộ gõ vẫn đang giữ "ạ" trong bộ nhớ của nó, đổi chữ trong ô
  // giữa chừng là phím kế tiếp nó sửa nhầm chỗ. Chỉ dịch ngược lúc chốt thành chip.
  const telexed = looksTelexed(text);
  const fixed = telexed ? untelexSymbol(text, known) : "";
  const hints = useMemo(() => {
    const q = untelexSymbol(text, known);
    const rest = (suggestions || []).filter((sym) => !chosen.has(sym));
    return (q ? rest.filter((sym) => sym.includes(q)) : rest).slice(0, SYMBOL_SUGGEST_SHOWN);
  }, [suggestions, chosen, text, known]);

  // Gõ hoặc dán có dấu phân cách thì chốt luôn phần trước dấu, giữ lại đuôi đang gõ dở.
  const onType = (raw) => {
    if (!/[,;\s]/.test(raw)) { setText(raw.toUpperCase()); return; }
    const parts = raw.split(/[,;\s]+/);
    const tail = /[,;\s]$/.test(raw) ? "" : parts.pop();
    const names = parse(parts.join(" "));
    if (names.length) onAdd(names);
    setText((tail || "").toUpperCase());
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const names = parse(text);
      if (names.length) { onAdd(names); setText(""); return; }
      if (onSubmitEmpty) onSubmitEmpty();
      return;
    }
    if (e.key === "Backspace" && !text && shown.length) {
      e.preventDefault();
      onRemove(shown[shown.length - 1]);
    }
  };

  return (
    <div>
      <div className="symbol-box" onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.querySelector("input").focus(); }}>
        {shown.map((x) => (
          <span key={x.id || x.name} className={`watch-symbol-chip ${x.done ? "watch-symbol-chip-done" : ""}`}>
            {onToggle ? (
              <button type="button" className="chip-main" onClick={() => onToggle(x)}
                title={x.done ? "Đã ngừng theo dõi — bấm để theo dõi lại" : "Đang theo dõi — bấm để tạm ngừng"}>
                {x.done ? <CheckCircle2 size={11} /> : <Eye size={11} />} {x.name}
              </button>
            ) : <span className="chip-main">{x.name}</span>}
            <button type="button" className="chip-x" title="Xóa khỏi danh sách" onClick={() => onRemove(x)}><X size={11} /></button>
          </span>
        ))}
        <input className="symbol-box-input" value={text} autoFocus={autoFocus}
          placeholder={shown.length ? "Thêm symbol..." : (placeholder || "XAUUSD EURUSD GBPJPY")}
          onChange={(e) => onType(e.target.value)} onKeyDown={onKeyDown}
          onPaste={(e) => {
            // Ô một dòng tự nuốt ký tự xuống dòng, nên dán một cột từ Excel/TradingView
            // sẽ dính liền thành một cục. Đọc thẳng clipboard trước khi trình duyệt kịp cắt.
            const raw = e.clipboardData ? e.clipboardData.getData("text") : "";
            if (!/[,;\s]/.test(raw)) return;
            e.preventDefault();
            const names = parse(`${text}${raw}`);
            if (names.length) onAdd(names);
            setText("");
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); const names = parse(text); if (names.length) { onAdd(names); setText(""); } }} />
      </div>
      {telexed && fixed ? (
        <p className="field-hint telex-note">
          Bộ gõ tiếng Việt đang bật — <b>{text.trim()}</b> sẽ được lưu thành <b className="mono">{fixed}</b>.
          Sai thì gõ lại sau khi chuyển bộ gõ sang tiếng Anh.
        </p>
      ) : null}
      {hints.length && (focused || text || !shown.length) ? (
        <div className="symbol-hints">
          <span className="field-hint">Gợi ý:</span>
          {hints.map((sym) => (
            <button key={sym} type="button" className="symbol-hint-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => { onAdd([sym]); setText(""); }}>
              + {sym}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}


// Khung nến của nhóm theo dõi: để trống là giờ gõ tay; chọn H4/H8/D là giờ tự tính theo nến.
function WatchTfSelect({ value, options, onChange, inline }) {
  return (
    <select className="input input-inline" style={inline ? { width: "auto", flex: "0 0 auto" } : undefined} value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      title="Chọn khung nến để giờ nhắc tự tính theo giờ đóng nến của từng mã, giống nhắc dời SL">
      <option value="">Giờ gõ tay</option>
      {options.map((tf) => <option key={tf} value={tf}>Nến {tf}</option>)}
    </select>
  );
}

function WatchBody({ settings, watches, resources, trades, onWatchesChange }) {
  const [adding, setAdding] = useState(!watches.length);
  const [draft, setDraft] = useState({ label: "", symbols: [], note: "", hours: SYMBOL_WATCH_DEFAULT_HOURS.join(", "), timeframe: "H4" });
  // Ẩn mã đã ngừng (gạch ngang) — nhớ trên máy này, áp cho mọi nhóm.
  const [hideDone, setHideDone] = useState(() => readLocalUi("watchHideDone", "0") === "1");
  const toggleHideDone = () => { const next = !hideDone; setHideDone(next); writeLocalUi("watchHideDone", next ? "1" : "0"); };
  const doneTotal = (watches || []).reduce((n, w) => n + (w.symbols || []).filter((x) => x.done).length, 0);
  // Khung tự tính được: H4/H8/D luôn có, cộng các khung khác trong Tài nguyên, xếp theo độ dài nến.
  const tfOptions = useMemo(() => {
    const list = [...new Set(["H4", "H8", "D", ...((resources && resources.timeframes) || []).filter((tf) => tfHours(tf))])];
    return list.sort((a, b) => tfHours(a) - tfHours(b));
  }, [resources]);

  // Symbol đang nằm trong các nhóm khác đứng đầu gợi ý — đó là cách viết quen tay ở màn hình này.
  const suggestions = useMemo(() => {
    const used = [...new Set((watches || []).flatMap((w) => (w.symbols || []).map((x) => x.name)))];
    return [...used, ...symbolSuggestions(resources, trades, used, 40)];
  }, [watches, resources, trades]);

  const updateWatch = (id, patch) => onWatchesChange(watches.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const removeWatch = (id) => onWatchesChange(watches.filter((w) => w.id !== id));
  const addWatch = () => {
    const symbols = mergeSymbolList(draft.symbols.join(","), []);
    if (!symbols.length) return;
    const hours = parseHoursInput(draft.hours);
    onWatchesChange([...watches, {
      ...emptySymbolWatch(),
      label: draft.label.trim() || (draft.timeframe ? `Khung ${draft.timeframe}` : ""),
      note: draft.note.trim(),
      symbols,
      hours: hours.length ? hours : [...SYMBOL_WATCH_DEFAULT_HOURS],
      timeframe: draft.timeframe,
    }]);
    setDraft({ label: "", symbols: [], note: "", hours: SYMBOL_WATCH_DEFAULT_HOURS.join(", "), timeframe: draft.timeframe });
    setAdding(false);
  };
  const addDraftSymbols = (names) =>
    setDraft((p) => ({ ...p, symbols: sortSymbolNames([...p.symbols, ...names.filter((n) => !p.symbols.includes(n))]) }));

  // Thêm vào nhóm đã lưu: giữ symbol cũ (kèm trạng thái done), bỏ qua trùng tên. Gõ lại một mã
  // đã ngừng thì bật theo dõi lại — không thì gõ xong chẳng thấy gì vì mã đó "đã có" rồi.
  const addWatchSymbols = (w, names) => {
    const cur = w.symbols || [];
    const want = new Set(names);
    const revived = cur.map((x) => (x.done && want.has(x.name) ? { ...x, done: false } : x));
    const have = new Set(cur.map((x) => x.name));
    const add = names.filter((n) => !have.has(n)).map((name) => ({ id: uid(), name, done: false }));
    const changed = add.length || revived.some((x, i) => x !== cur[i]);
    if (changed) updateWatch(w.id, { symbols: sortWatchSymbols([...revived, ...add]) });
  };
  const removeWatchSymbol = (w, item) => updateWatch(w.id, { symbols: (w.symbols || []).filter((x) => x.id !== item.id) });
  const purgeDone = (id) => onWatchesChange(watches.map((w) => (
    (!id || w.id === id) && (w.symbols || []).some((x) => x.done) ? { ...w, symbols: w.symbols.filter((x) => !x.done) } : w
  )));
  const toggleSymbol = (w, symId) => {
    updateWatch(w.id, { symbols: (w.symbols || []).map((x) => (x.id === symId ? { ...x, done: !x.done } : x)) });
  };

  return (
    <>
      <p className="plan-hint">
        Mỗi nhóm gửi một tin, mỗi mã một dòng kèm nút <b>Theo dõi</b> / <b>Ngừng</b>. Chọn <b>Nến H4/H8/D</b> thì mỗi mã nhắc theo
        giờ đóng nến của nó, cùng lúc với dời SL — hiện đang {candleModeText(settings)}.
      </p>
      {watches.length === 0 ? null : (
        <div className="acc-list">
          {watches.map((w) => {
            const symbols = w.symbols || [];
            const remaining = symbols.filter((x) => !x.done).length;
            const auto = watchIsAuto(w);
            return (
              <div key={w.id} className={`acc-card ${w.enabled && remaining ? "" : "acc-card-off"}`}>
                <div className="acc-row">
                  <Switch checked={!!w.enabled} onChange={(v) => updateWatch(w.id, { enabled: v })} />
                  <input className="input input-inline acc-name-input" defaultValue={w.label || ""} placeholder="Tên nhóm"
                    onBlur={(e) => updateWatch(w.id, { label: e.target.value.trim() })} />
                  <WatchTfSelect inline value={auto ? w.timeframe : ""} options={tfOptions} onChange={(tf) => updateWatch(w.id, { timeframe: tf })} />
                  {auto ? (
                    <span className="acc-hours acc-hours-auto mono" title="Giờ nhắc hôm nay">
                      {hoursText(watchScheduleHours(w, settings, vnToday())).split(" ").join(" · ") || "hôm nay không có nến đóng"}
                    </span>
                  ) : (
                    <input className="input input-inline acc-hours" key={(w.hours || []).join(",")}
                      defaultValue={(w.hours && w.hours.length ? w.hours : SYMBOL_WATCH_DEFAULT_HOURS).join(", ")}
                      placeholder="9 14 20" title={'Giờ nhắc — viết tắt được: "9 14 20"'}
                      onBlur={(e) => {
                        // Không parse ra giờ nào thì giữ giá trị cũ: nhóm mất sạch giờ là âm thầm ngừng nhắc.
                        const hrs = parseHoursInput(e.target.value);
                        const keep = hrs.length ? hrs : (w.hours && w.hours.length ? w.hours : [...SYMBOL_WATCH_DEFAULT_HOURS]);
                        e.target.value = keep.join(", ");
                        updateWatch(w.id, { hours: keep });
                      }} />
                  )}
                  <DayChips days={w.activeDays} onToggle={(d) => updateWatch(w.id, { activeDays: toggleIn(w.activeDays, d) })} />
                  <ConfirmButton onConfirm={() => removeWatch(w.id)} />
                </div>
                <SymbolBox items={symbols} suggestions={suggestions} hideDone={hideDone}
                  onAdd={(names) => addWatchSymbols(w, names)}
                  onRemove={(x) => removeWatchSymbol(w, x)}
                  onToggle={(x) => toggleSymbol(w, x.id)} />
                {auto && remaining ? <WatchHoursPreview settings={settings} watch={w} /> : null}
                <div className="watch-group-foot">
                  <input className="input input-inline watch-note" defaultValue={w.note || ""} placeholder="Ghi chú gửi kèm tin (tùy chọn)"
                    onBlur={(e) => updateWatch(w.id, { note: e.target.value })} />
                  <span className="field-hint" style={{ margin: 0 }}>
                    {symbols.length === 0 ? "chưa có mã — sẽ không gửi" : `${remaining}/${symbols.length} mã đang theo dõi`}
                  </span>
                  {symbols.length > remaining ? (
                    <span className="watch-purge-one">
                      <DangerConfirmButton onConfirm={() => purgeDone(w.id)}
                        label={<><Trash2 size={12} /> Xóa {symbols.length - remaining} mã đã ngừng</>}
                        confirmLabel={<><Trash2 size={12} /> Bấm lần nữa để xóa</>} />
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="plan-actions">
        {!adding ? (
          <button type="button" className="btn btn-ghost" onClick={() => setAdding(true)}><PlusCircle size={14} /> Thêm nhóm</button>
        ) : null}
        {doneTotal ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={toggleHideDone}>
              {hideDone ? <><Eye size={13} /> Hiện {doneTotal} mã đã ngừng</> : <><EyeOff size={13} /> Ẩn mã đã ngừng</>}
            </button>
            <DangerConfirmButton onConfirm={() => purgeDone()}
              label={<><Trash2 size={13} /> Xóa {doneTotal} mã đã ngừng</>}
              confirmLabel={<><Trash2 size={13} /> Bấm lần nữa để xóa hẳn {doneTotal} mã</>} />
          </>
        ) : null}
      </div>

      {adding ? (
        <div className="acc-card acc-card-new">
          <div className="grid-3">
            <Field label="Tên nhóm">
              <input className="input" value={draft.label} onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
                placeholder={draft.timeframe ? `Khung ${draft.timeframe}` : "Ngắn"} />
            </Field>
            <Field label="Khung nến">
              <WatchTfSelect value={draft.timeframe} options={tfOptions} onChange={(tf) => setDraft((p) => ({ ...p, timeframe: tf }))} />
            </Field>
            {draft.timeframe ? (
              <Field label="Giờ nhắc">
                <input className="input" disabled value={`Theo giờ đóng nến ${draft.timeframe}`} />
              </Field>
            ) : (
              <Field label="Giờ nhắc" hint='Gõ tắt "9 14 20" được'>
                <input className="input" value={draft.hours} onChange={(e) => setDraft((p) => ({ ...p, hours: e.target.value }))}
                  onBlur={(e) => {
                    const hrs = parseHoursInput(e.target.value);
                    setDraft((p) => ({ ...p, hours: (hrs.length ? hrs : SYMBOL_WATCH_DEFAULT_HOURS).join(", ") }));
                  }} placeholder="9 14 20" />
              </Field>
            )}
          </div>
          <Field label="Các mã" hint="Gõ tên rồi phím cách hoặc Enter — hoặc bấm gợi ý.">
            <SymbolBox items={draft.symbols.map((name) => ({ name }))} suggestions={suggestions} autoFocus={watches.length > 0}
              onAdd={addDraftSymbols}
              onRemove={(x) => setDraft((p) => ({ ...p, symbols: p.symbols.filter((n) => n !== x.name) }))}
              onSubmitEmpty={addWatch} />
          </Field>
          <div className="form-actions" style={{ marginTop: 4 }}>
            {watches.length ? <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>Hủy</button> : null}
            <button type="button" className="btn btn-primary" onClick={addWatch} disabled={!draft.symbols.length}>
              <PlusCircle size={14} /> Thêm nhóm
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ───────────────────────── Tab Lịch nhắc ─────────────────────────


export function PlansPanel({
  settings, onSettingsChange, resources, trades, watches, onWatchesChange, mutedTrades, onMutedTradesChange,
  checkLog, remindersNode, reminders, onGoSettings,
}) {
  const s = settings;
  const [open, setOpenRaw] = useState(() => readLocalUi("plansOpen", ""));
  const setOpen = (id) => { setOpenRaw(id); writeLocalUi("plansOpen", id); };
  const telegramReady = !!(s.telegramBotToken && s.telegramChatId);
  const accName = (id, fallback) => ((resources.accounts || []).find((a) => a.id === id) || {}).name || fallback || "?";

  const slSummary = (() => {
    const on = (s.schedules || []).filter((sc) => sc && sc.enabled && !sc.timeframe);
    if (!on.length) return "Chưa bật tài khoản nào";
    const open = (trades || []).filter((t) => t && t.entryDate && !t.exitDate && on.some((sc) => accName(sc.accountId, sc.accountName) === t.account)).length;
    return `${on.map((sc) => `${accName(sc.accountId, sc.accountName)} ${sc.auto ? "theo nến" : hoursText(sc.hours)}`).join(" · ")} — ${open} lệnh mở`;
  })();
  const watchSummary = (() => {
    const on = (watches || []).filter((w) => w.enabled && watchLiveSymbols(w).length);
    if (!on.length) return watches.length ? "Không nhóm nào đang chạy" : "Chưa có nhóm nào";
    return on.map((w) => `${w.label || "Nhóm"} ${watchLiveSymbols(w).length} mã ${watchIsAuto(w) ? w.timeframe : hoursText(w.hours)}`).join(" · ");
  })();
  const setupSummary = (() => {
    const on = (s.setupCheckSchedules || []).filter((sc) => sc && sc.enabled);
    if (!on.length) return "Chưa bật tài khoản nào";
    const wk = setupCheckStats(checkLog, 7);
    return `${on.map((sc) => `${accName(sc.accountId, sc.accountName)} ${hoursText(sc.hours)}`).join(" · ")}${wk.percent !== null ? ` — 7 ngày ${wk.percent}%` : ""}`;
  })();
  const periodicSummary = (() => {
    const jobs = [
      [s.weeklySummary, "Tổng kết tuần"], [s.reconcileReminder, "Đối chiếu sàn"], [s.incompleteReminder, "Điền nốt lệnh"],
    ].filter(([cfg]) => cfg && cfg.enabled).map(([cfg, name]) => `${name} ${cfg.weekday} ${hoursText([cfg.time])}`);
    const n = (reminders || []).length;
    return [...jobs, n ? `${n} nhắc riêng` : ""].filter(Boolean).join(" · ") || "Chưa bật việc nào";
  })();

  return (
    <div className="plans">
      {!telegramReady ? (
        <div className="plan-warn">
          Chưa có Bot Token / Chat ID — tin nhắc chưa gửi được.
          <button type="button" className="btn btn-ghost btn-xs" onClick={onGoSettings}><Settings2 size={12} /> Mở Cài đặt</button>
        </div>
      ) : null}
      <div className="plan-mode">
        <Clock size={13} /> Giờ đóng nến: {candleModeText(s)}
        <button type="button" className="plan-link" onClick={onGoSettings}>đổi</button>
      </div>

      <PlanSection id="sl" icon={ArrowUpDown} title="Dời SL" summary={slSummary}
        on={!!s.enabled} onToggle={(v) => onSettingsChange({ ...s, enabled: v })} open={open === "sl"} onOpen={setOpen}>
        <SlBody settings={s} onChange={onSettingsChange} resources={resources} trades={trades}
          mutedTrades={mutedTrades} onMutedTradesChange={onMutedTradesChange} />
      </PlanSection>
      <PlanSection id="watch" icon={Eye} title="Symbol theo dõi" summary={watchSummary}
        on={!!s.symbolWatchEnabled} onToggle={(v) => onSettingsChange({ ...s, symbolWatchEnabled: v })} open={open === "watch"} onOpen={setOpen}>
        <WatchBody settings={s} watches={watches} resources={resources} trades={trades} onWatchesChange={onWatchesChange} />
      </PlanSection>
      <PlanSection id="setup" icon={Search} title="Kiểm tra setup" summary={setupSummary}
        on={!!s.setupCheckEnabled} onToggle={(v) => onSettingsChange({ ...s, setupCheckEnabled: v })} open={open === "setup"} onOpen={setOpen}>
        <SetupBody settings={s} onChange={onSettingsChange} resources={resources} checkLog={checkLog} />
      </PlanSection>
      <PlanSection id="periodic" icon={CalendarDays} title="Việc định kỳ" summary={periodicSummary}
        open={open === "periodic"} onOpen={setOpen}>
        <PeriodicBody settings={s} onChange={onSettingsChange} remindersNode={remindersNode} />
      </PlanSection>
    </div>
  );
}

// ───────────────────────── Tab Cài đặt ─────────────────────────

function TopicInput({ value, onSave, onTest }) {
  const ref = useRef(null);
  return (
    <span className="topic-cell">
      <input ref={ref} className="input input-inline mono" key={value || ""} defaultValue={value || ""} placeholder="chat chính"
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (value || "")) onSave(v); }} />
      {/* Đọc thẳng ô nhập: vừa gõ xong bấm gửi thử thì giá trị mới chưa kịp lưu vào props. */}
      <button type="button" className="row-btn" title="Gửi thử vào topic này" onClick={() => onTest(ref.current ? ref.current.value.trim() : value)}><Send size={12} /></button>
    </span>
  );
}

export function NotifySettingsPanel({ settings, onChange, resources, trades, watches, reminders }) {
  const s = settings;
  const set = (k) => (v) => onChange({ ...s, [k]: v });
  const { testState, sendTest } = useTelegramTest(s, "✅ Kết nối Telegram thành công — tin nhắc sẽ gửi vào đây.");

  const baseOf = (list, accId) => (list || []).find((sc) => sc.accountId === accId && !sc.timeframe);
  const setThread = (key, acc, threadId) => {
    const list = s[key] || [];
    const next = baseOf(list, acc.id)
      ? list.map((sc) => (sc.accountId === acc.id && !sc.timeframe ? { ...sc, threadId } : sc))
      : [...list, { ...emptyReminderSchedule(acc.id, acc.name), threadId }];
    onChange({ ...s, [key]: next });
  };
  const jobs = [
    ["weeklySummary", "Tổng kết tuần", emptyWeeklySummary],
    ["reconcileReminder", "Đối chiếu file sàn", emptyReconcileReminder],
    ["incompleteReminder", "Điền nốt lệnh chưa xong", emptyIncompleteReminder],
    ["mutedFillReminder", "Nhắc điền lệnh đã bấm Kết thúc", emptyMutedFillReminder],
  ];

  // Mã cần gán phiên: của tài khoản dời SL theo nến và của nhóm theo dõi theo nến.
  const autoAccounts = useMemo(() => {
    const ids = new Set((s.schedules || []).filter((sc) => sc && sc.auto).map((sc) => sc.accountId));
    return (resources.accounts || []).filter((a) => ids.has(a.id)).map((a) => a.name);
  }, [s.schedules, resources.accounts]);
  const autoWatchSymbols = useMemo(
    () => [...new Set((watches || []).filter(watchIsAuto).flatMap((w) => watchLiveSymbols(w).map((x) => x.name)))],
    [watches]
  );

  return (
    <div className="notify-settings">
      <h3 className="block-title" style={{ marginTop: 0 }}>Telegram</h3>
      <div className="account-form">
        <div className="grid-2">
          <Field label="Bot Token" hint="Lấy từ @BotFather">
            <input className="input mono" value={s.telegramBotToken} onChange={(e) => set("telegramBotToken")(e.target.value.trim())} placeholder="123456789:AA...xyz" />
          </Field>
          <Field label="Chat ID" hint="Nhóm nhận tin (Supergroup nếu dùng Topics)">
            <input className="input mono" value={s.telegramChatId} onChange={(e) => set("telegramChatId")(e.target.value.trim())} placeholder="-100123456789" />
          </Field>
        </div>
        <div className="test-line">
          <button type="button" className="btn btn-ghost" onClick={() => sendTest()} disabled={testState === "sending"}>
            <Send size={13} /> {testState === "sending" ? "Đang gửi..." : "Gửi thử"}
          </button>
          <TestState state={testState} />
        </div>
      </div>

      <h3 className="block-title">Gửi vào topic nào</h3>
      <p className="field-hint" style={{ marginBottom: 8 }}>Điền Thread ID nếu nhóm có chia Topics; để trống là gửi vào chat chính. Nút ✈ gửi thử đúng chỗ đó.</p>
      <div className="table-wrap">
        <table className="table topic-table">
          <thead><tr><th>Tài khoản</th><th>Dời SL</th><th>Kiểm tra setup</th></tr></thead>
          <tbody>
            {(resources.accounts || []).map((acc) => (
              <tr key={acc.id}>
                <td><b>{acc.name}</b></td>
                <td><TopicInput value={(baseOf(s.schedules, acc.id) || {}).threadId} onSave={(v) => setThread("schedules", acc, v)} onTest={sendTest} /></td>
                <td><TopicInput value={(baseOf(s.setupCheckSchedules, acc.id) || {}).threadId} onSave={(v) => setThread("setupCheckSchedules", acc, v)} onTest={sendTest} /></td>
              </tr>
            ))}
            <tr><td><b>Symbol theo dõi</b></td><td colSpan={2}><TopicInput value={s.symbolWatchThreadId} onSave={set("symbolWatchThreadId")} onTest={sendTest} /></td></tr>
            {jobs.map(([key, label, empty]) => {
              const cfg = { ...empty(), ...(s[key] || {}) };
              return (
                <tr key={key}>
                  <td><b>{label}</b></td>
                  <td colSpan={2}><TopicInput value={cfg.threadId} onSave={(v) => onChange({ ...s, [key]: { ...cfg, threadId: v } })} onTest={sendTest} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="block-title">Giờ đóng nến</h3>
      <p className="field-hint" style={{ marginBottom: 8 }}>
        Dùng chung cho dời SL và symbol theo dõi khi chọn "theo nến". Mỗi nguồn dữ liệu TradingView một phiên nên cùng H4 mà giờ đóng khác nhau —
        đổi giờ mùa tự tính, không phải sửa.
      </p>
      <CandleSessionsPanel settings={s} onChange={onChange} trades={trades} accountNames={autoAccounts} watchSymbols={autoWatchSymbols} />

      <h3 className="block-title">Xuất lịch sang Life Hub</h3>
      <p className="field-hint" style={{ marginBottom: 8 }}>Chỉ gồm tên việc, giờ, số phút, thứ — không kèm token hay dữ liệu lệnh. Mỗi lần xuất là trọn bộ.</p>
      <LifeHubExport settings={s} watches={watches} reminders={reminders} />

      <details className="notify-guide">
        <summary>Hướng dẫn cài bot gửi nền (làm 1 lần)</summary>
        <ol className="field-hint">
          <li>Deploy function nhắc: <code>supabase functions deploy sl-reminder</code>.</li>
          <li>Supabase Dashboard → Database → Extensions: bật <code>pg_cron</code> và <code>pg_net</code>.</li>
          <li>Chạy file <code>supabase-sl-reminder-cron.sql</code> trong SQL Editor để gọi function mỗi 5 phút.</li>
          <li>Để nút bấm trong tin hoạt động: <code>supabase functions deploy telegram-webhook --no-verify-jwt</code>, rồi mở
            <code>https://api.telegram.org/bot&lt;BOT_TOKEN&gt;/setWebhook?url=https://&lt;PROJECT_REF&gt;.supabase.co/functions/v1/telegram-webhook</code>.</li>
          <li>Điền Token + Chat ID ở trên, bấm Gửi thử.</li>
        </ol>
        <p className="field-hint">Mọi giờ đều là giờ Việt Nam — bot tự quy đổi từ giờ máy chủ.</p>
      </details>
    </div>
  );
}
