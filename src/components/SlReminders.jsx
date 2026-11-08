import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send, Bell, CheckCircle2, XCircle, Eye, EyeOff, PlusCircle, Trash2, X, ChevronDown, ArrowUpDown, Search,
  CalendarDays, Clock, Settings2, Flame, Hourglass, ShieldAlert, Shield,
} from "lucide-react";
import { EaSlBody, eaSummary, useEaData } from "./EaSl.jsx";
import { AlertRechecksBody, alertSummary, recheckPending, recheckRecord, useAlertRepeats } from "./AlertRechecks.jsx";
import { fxBase, SymbolBox } from "./SymbolBox.jsx";
import { recheckFor, vnTime } from "../../supabase/functions/_shared/alertRecheck.ts";
import { hotMatches } from "../../supabase/functions/_shared/hotSymbols.ts";
import {
  NEWS_KEY, guardOf, newsEvents, newsTimeVn, newsWhen, parseNewsPaste, upcomingNews, TIER_ICON,
} from "../../supabase/functions/_shared/newsCalendar.ts";
import { ConfirmButton, DangerConfirmButton, Field, StatCard, Switch } from "./ui.jsx";
import { AutoHoursPreview, CandleSessionsPanel, WatchHoursPreview } from "./CandleSessions.jsx";
import { LifeHubExport } from "./Timeline.jsx";
import { safeGet, safeSet } from "../lib/helpers.js";
import {
  daysSince, emptyIncompleteReminder, emptyMorningBrief, emptyMutedFillReminder, emptyReconcileReminder, emptyReminderSchedule, emptySymbolWatch,
  emptyTimeframeSchedule, emptyWeeklySummary, tradeInSchedule,
  mergeSymbolList, migrateSkipHours, mutedFillDays, parseHoursInput,
  parseSymbolList, readLocalUi, seasonShiftDefault, seasonShiftPlan, setupCheckStats, setupCheckStreak, writeLocalUi,
  SL_REMINDER_DEFAULT_HOURS, SYMBOL_WATCH_DEFAULT_HOURS, sortSymbolNames, sortWatchSymbols, symbolSuggestions, uid, WEEKDAY_CODES,
  watchIsAuto, watchLiveSymbols, watchScheduleHours,
} from "../lib/helpers.js";
import { DEFAULT_AUTO_SLOTS, tfHours, usSeason, vnToday } from "../lib/candles.js";

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
      {/* Tài khoản đã ngừng không còn lệnh mới để nhắc — lịch của nó đã tắt lúc bấm Ngừng. */}
      {resources.accounts.filter((acc) => !acc.closed).map((acc) => {
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
                onBlur={(e) => {
                  const hours = parseHoursInput(e.target.value);
                  const patch = { hours };
                  if (Array.isArray(sched.skip) && sched.skip.length) patch.skip = migrateSkipHours(sched.skip, sched.hours, hours);
                  onUpdate(acc, patch);
                }} />
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

// Tin buổi sáng: nhiều thứ trong tuần (mặc định T2–T6) — máy chủ: _shared/brief.ts, gửi từ sl-reminder
function BriefRow({ cfg, onChange }) {
  return (
    <div className={`job-row ${cfg.enabled ? "" : "job-off"}`}>
      <Switch checked={!!cfg.enabled} onChange={(v) => onChange({ enabled: v })} />
      <span className="job-label"><b>Tin buổi sáng</b>
        <small>tin lớn 24 giờ tới · SL các tài khoản (đã BE chưa) · EA chưa báo · cảnh báo chưa xử lý · hẹn kiểm lại · mã tiềm năng</small></span>
      <DayChips days={cfg.days} onToggle={(d) => onChange({ days: toggleIn(cfg.days, d) })} />
      <input type="time" className="input input-inline job-time" value={cfg.time || ""} onChange={(e) => onChange({ time: e.target.value })} />
    </div>
  );
}

function PeriodicBody({ settings, onChange, remindersNode }) {
  const s = settings;
  const mb = { ...emptyMorningBrief(), ...(s.morningBrief || {}) };
  const ws = { ...emptyWeeklySummary(), ...(s.weeklySummary || {}) };
  const rec = { ...emptyReconcileReminder(), ...(s.reconcileReminder || {}) };
  const inc = { ...emptyIncompleteReminder(), ...(s.incompleteReminder || {}) };
  return (
    <>
      <div className="job-list">
        <BriefRow cfg={mb} onChange={(p) => onChange({ ...s, morningBrief: { ...mb, ...p } })} />
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

// ───────────────────────── Tin lớn ─────────────────────────
// Cảnh báo TradingView bắn trong khoảng X phút trước → Y phút sau tin lớn của đồng có trong mã thì bot thêm dòng
// "⛔ SÁT TIN … KHÔNG VÀO LỆNH" (alert-relay). Lịch: có sẵn trong code (_shared/newsCalendar.ts) + bản dán ở
// app_data.newsCalendar — việc tự chạy tối Chủ nhật ghi đè bản dán qua alert-relay ?news=1, ô dưới sửa tay được.

export function useNewsCalendar() {
  const [store, setStore] = useState(null);
  useEffect(() => { safeGet(NEWS_KEY, null).then((v) => setStore(v || {})); }, []);
  const save = async (text) => {
    const next = { text, updatedAt: new Date().toISOString(), by: "web" };
    if (await safeSet(NEWS_KEY, next)) { setStore(next); return true; }
    return false;
  };
  return { store, save };
}

const NEWS_DAYS = 14;

function NewsBody({ settings, onChange, news }) {
  const g = guardOf(settings.newsGuard);
  const setG = (p) => onChange({ ...settings, newsGuard: { ...g, ...p } });
  const [draft, setDraft] = useState(null);
  const [msg, setMsg] = useState("");
  const store = news.store;
  const text = draft ?? (store ? store.text || "" : "");
  const now = Date.now();
  const events = useMemo(() => upcomingNews(newsEvents({ text }), now, NEWS_DAYS), [text, Math.floor(now / 60000)]);
  const bad = parseNewsPaste(text).bad;
  const inWindow = (e) => now >= e.t - g.before * 60000 && now <= e.t + g.after * 60000;
  const onBlur = async () => {
    if (draft === null || draft === (store?.text || "")) return;
    setMsg((await news.save(draft)) ? "Đã lưu — bot dùng ngay từ cảnh báo kế tiếp." : "Lưu thất bại, thử lại.");
    setDraft(null);
  };
  const by = store?.updatedAt
    ? `Bản dán cập nhật ${new Date(store.updatedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}${store.by === "bot" ? " (tự động tối Chủ nhật)" : store.by === "web" ? " (sửa trên web)" : ""}`
    : "Chưa có bản dán — đang dùng lịch có sẵn";
  return (
    <>
      <p className="plan-hint">
        Cảnh báo TradingView bắn trong khoảng <b>{g.before} phút trước → {g.after} phút sau</b> giờ tin lớn của <b>đồng tiền có trong mã</b>{" "}
        thì tin Telegram có dòng <code>⛔ SÁT TIN · 🔴 NFP USD 20:30 (còn 12p) — KHÔNG VÀO LỆNH</code> ở trên cùng. Mức tin theo độ giật
        của nến H4 chứa giờ tin so với nến thường (đo 2024–2026): 🔴 ≥ 2× và 🟠 1.6–2× = không vào lệnh · 🟡 1.4–1.6× = <code>⚠️ GẦN TIN … cẩn thận</code> ·
        ⚪ dưới 1.4× = không gắn gì. Mã không dính đồng đó
        (vd NFP USD với EURJPY) không bị gắn. Vàng, dầu, chỉ số Mỹ tính là USD; GER40 là EUR, JP225 là JPY… Cổ phiếu không gắn.
        BoJ không có giờ cố định nên nới ít nhất 90 phút mỗi bên.
      </p>
      <div className="news-guard-row">
        <Field label="Phút trước tin">
          <input type="number" className="input input-inline" min={0} max={240} step={5} value={g.before}
            onChange={(e) => setG({ before: Number(e.target.value) })} />
        </Field>
        <Field label="Phút sau tin">
          <input type="number" className="input input-inline" min={0} max={240} step={5} value={g.after}
            onChange={(e) => setG({ after: Number(e.target.value) })} />
        </Field>
      </div>
      <h4 className="plan-sub">Tin lớn {NEWS_DAYS} ngày tới (giờ VN)</h4>
      {events.length ? (
        <ul className="news-list">
          {events.map((e) => (
            <li key={`${e.cur}${e.name}${e.t}`} className={`${inWindow(e) && g.enabled && e.tier ? "news-hot" : ""} ${e.tier ? "" : "news-mild"}`}
              title={e.h4 ? `Nến H4 chứa tin giật ×${e.h4} so với thường` : "Chưa có số đo — tính là 🟡"}>
              <span className="news-tier">{TIER_ICON[e.tier]}</span>
              <span className="news-time">{newsTimeVn(e.t, true)}</span>
              <span className="news-cur">{e.cur}</span>
              <b>{e.name}</b>
              <small>{e.tier ? "" : "không gắn · "}{e.note}{e.h4 ? ` · H4 ×${e.h4}` : ""}{e.pasted ? " ✎" : ""}{e.t > now && e.t - now < 24 * 3600e3 ? ` · ${newsWhen(e, now)}` : e.t <= now ? ` · ${newsWhen(e, now)}` : ""}</small>
            </li>
          ))}
        </ul>
      ) : <p className="plan-hint">Không có tin lớn trong {NEWS_DAYS} ngày tới.</p>}
      <h4 className="plan-sub">Lịch dán (sửa khi họ dời lịch / thêm tin)</h4>
      <p className="plan-hint">
        Lịch có sẵn chép từ chỉ báo Tránh Tin Lớn (FOMC, NFP, CPI, ECB, BoE, BoJ, BoC, RBA, RBNZ, SNB) tới 02/2028. Tối Chủ nhật việc tự chạy
        quét lịch chính thức 2 tuần tới và ghi đè ô này. Mỗi dòng <code>2026-11-06 20:30 USD NFP | ghi chú</code> (giờ VN, dòng # bỏ qua);
        tin trùng tin có sẵn (cùng đồng + tên, lệch ≤ 10 ngày) thì thay tin có sẵn. {by}.
      </p>
      <textarea className="input news-paste" rows={6} value={text} spellCheck={false}
        onChange={(e) => { setDraft(e.target.value); setMsg(""); }} onBlur={onBlur} />
      {bad.length ? <p className="plan-hint news-bad">⚠️ Dòng sai mẫu (bot bỏ qua): {bad.join(" · ")}</p> : null}
      {msg ? <p className="plan-hint">{msg}</p> : null}
    </>
  );
}

// ───────────────────────── Symbol theo dõi ─────────────────────────



// ───────────────────────── Mã tiềm năng ─────────────────────────

// "thêm hôm nay" / "thêm 3 ngày trước" — hiện khi rê chuột lên mã ở dòng tóm tắt
const hotAge = (iso) => {
  const d = daysSince(iso);
  return d === null ? "" : d <= 0 ? "thêm hôm nay" : `thêm ${d} ngày trước`;
};

// Mã tiềm năng → nhắc kiểm lại theo nến (Cảnh báo nhắc lại). Một mã có thể tiềm năng ở nhiều khung: mỗi
// khung một bản ghi alertRepeats riêng (hotId + tf). Nút H4 / H8 / D ở mỗi dòng: chưa có thì thêm, đang
// chờ thì bỏ. slReminderSettings.hotRecheckTf: khung tự thêm khi điền mã mới ("H4" mặc định, "" = tắt).
// Bỏ mã khỏi danh sách thì mọi nhắc còn chờ của mã đó bỏ theo. (Ô "kịch bản chờ" đã bỏ — 05/11.)
const HOT_RECHECK_TFS = ["H4", "H8", "D"];

// Bảng mã tiềm năng: đủ các mã FX / vàng / hàng hoá / năng lượng của Tài nguyên (cố định như watchlist
// TradingView), FX chia khối theo đồng base, mỗi nhóm khác một khối. Mỗi mã một dòng: bấm tên = bật/tắt
// tiềm năng, bấm H4 / H8 / D = tiềm năng ở khung đó (tự bật mã + nhắc kiểm lại lúc nến khung ấy đóng).
// Mã ngoài danh sách (US stock, VN stock…) thêm ở ô "Mã khác" — lưu ở slReminderSettings.hotBoardExtra.
const symKey = (name) => String(name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function hotBoardSections(resources, extra, hotList) {
  const groups = (resources && resources.symbolGroups) || {};
  const order = (resources && resources.symbols) || [];
  const seen = new Set();
  const fx = new Map();      // đồng base → mã
  const other = new Map();   // nhóm → mã
  order.forEach((sym) => {
    const g = groups[sym];
    const k = symKey(sym);
    if (!g || seen.has(k)) return;
    seen.add(k);
    const base = fxBase(sym);
    if (base) { if (!fx.has(base)) fx.set(base, []); fx.get(base).push(sym); return; }
    if (!other.has(g)) other.set(g, []);
    other.get(g).push(sym);
  });
  const mine = [];
  [...(extra || []), ...hotList.map((h) => h.name)].forEach((sym) => {
    const k = symKey(sym);
    if (!k || seen.has(k)) return;
    seen.add(k);
    mine.push(sym);
  });
  return [
    ...[...fx].map(([base, syms]) => ({ key: `fx-${base}`, label: base, fx: true, syms })),
    ...[...other].map(([g, syms]) => ({ key: `g-${g}`, label: g, syms })),
    { key: "mine", label: "Mã khác", mine: true, syms: sortSymbolNames(mine) },
  ];
}

export function HotBody({ settings, onChange, resources, alertData }) {
  // Xếp theo chữ cái (cặp FX cùng đồng base tự đứng cạnh nhau) — cả danh sách cũ lẫn mã mới thêm
  const list = useMemo(() => sortWatchSymbols(settings.hotSymbols || []), [settings.hotSymbols]);
  const extra = settings.hotBoardExtra || [];
  const save = (next, patch = {}) => onChange({ ...settings, ...patch, hotSymbols: sortWatchSymbols(next).map((h) => (h.note ? { ...h, note: "" } : h)) });
  // Ghi chú cũ (ô kịch bản chờ đã bỏ) còn lưu thì vẫn hiện 📝 trên Telegram — xoá một lần
  useEffect(() => {
    if ((settings.hotSymbols || []).some((h) => h && String(h.note || "").trim())) save(settings.hotSymbols);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const recheckTf = settings.hotRecheckTf === undefined ? "H4" : settings.hotRecheckTf;
  const alerts = alertData && Array.isArray(alertData.list) ? alertData.list : null;
  const [onlyHot, setOnlyHot] = useState(() => readLocalUi("hotOnlyHot", "0") === "1");
  const toggleOnlyHot = () => { const v = !onlyHot; setOnlyHot(v); writeLocalUi("hotOnlyHot", v ? "1" : "0"); };
  const [extraText, setExtraText] = useState("");

  const hotByKey = useMemo(() => new Map(list.map((h) => [symKey(h.name), h])), [list]);
  const sections = useMemo(() => hotBoardSections(resources, extra, list), [resources, extra, list]);

  // Nhắc của mã này ở khung tf: bản ghi tạo từ đây (hotId) hoặc thêm tay ở Cảnh báo nhắc lại cùng mã, cùng khung.
  // Cảnh báo TradingView của mã đó KHÔNG tính — trước đây chúng làm nút bấm không ra gì (EUR/AUD 05/11).
  const recFor = (all, h, tf) => (all || []).find((r) => recheckPending(r) && r.kind !== "reentry" && (r.tf || "D") === tf
    && ((h.id && r.hotId === h.id) || ((r.source === "web" || r.source === "hot") && hotMatches(String(r.text || ""), [{ name: h.name }]).length)));
  const addRechecks = (items, tf = recheckTf) => {
    if (!tf || !alerts || !items.length) return;
    alertData.mutate((all) => {
      const t = Date.now();
      return [...all, ...items.filter((h) => !recFor(all, h, tf)).map((h) => recheckRecord({ name: h.name, tf, hotId: h.id }, t))];
    });
  };
  const dropRechecks = (ids) => {
    if (!alerts || !alerts.some((r) => ids.has(r.hotId) && recheckPending(r))) return;
    alertData.mutate((all) => all.filter((r) => !(ids.has(r.hotId) && recheckPending(r))));
  };
  // Bật tiềm năng: tf = khung bấm; không bấm khung (bấm tên) thì theo ô "tự nhắc" bên dưới
  const makeHot = (names, tf, patch) => {
    const fresh = names.filter((n) => !hotByKey.has(symKey(n))).map((name) => ({ id: uid(), name, note: "", addedAt: new Date().toISOString() }));
    if (fresh.length || patch) save([...list, ...fresh], patch);
    addRechecks(fresh, tf === undefined ? recheckTf : tf);
    return fresh;
  };
  const unHot = (h) => { save(list.filter((x) => x.id !== h.id)); dropRechecks(new Set([h.id])); };
  const toggleName = (sym) => { const h = hotByKey.get(symKey(sym)); if (h) unHot(h); else makeHot([sym]); };
  const toggleTf = (sym, tf) => {
    const h = hotByKey.get(symKey(sym));
    if (!h) { makeHot([sym], tf); return; }
    const rec = recFor(alerts, h, tf);
    if (!rec) addRechecks([h], tf);
    else alertData.mutate((all) => all.filter((r) => r.id !== rec.id));
  };
  const addExtra = () => {
    const names = parseSymbolList(extraText).map((x) => x.toUpperCase());
    if (!names.length) return;
    const nextExtra = [...extra, ...names.filter((n) => !extra.some((e) => symKey(e) === symKey(n)))];
    makeHot(names, undefined, { hotBoardExtra: nextExtra });
    setExtraText("");
  };
  const removeExtra = (sym) => {
    const h = hotByKey.get(symKey(sym));
    const nextExtra = extra.filter((e) => symKey(e) !== symKey(sym));
    save(h ? list.filter((x) => x.id !== h.id) : list, { hotBoardExtra: nextExtra });
    if (h) dropRechecks(new Set([h.id]));
  };

  const tfButton = (sym, h, tf) => {
    const rec = h && alerts ? recFor(alerts, h, tf) : null;
    if (rec && rec.recheckAt) {
      const at = vnTime(Date.parse(rec.recheckAt));
      return <button key={tf} type="button" className="hb-tf hb-tf-on" onClick={() => toggleTf(sym, tf)} title={`Chờ nến ${tf} đóng — nhắc lúc ${at}. Bấm để bỏ.`}>{tf}</button>;
    }
    if (rec) return <button key={tf} type="button" className="hb-tf hb-tf-ring" onClick={() => toggleTf(sym, tf)} title={`Bot đang nhắc nến ${tf} trên Telegram. Bấm để bỏ.`}>{tf}🔔</button>;
    return (
      <button key={tf} type="button" className="hb-tf" onClick={() => toggleTf(sym, tf)} disabled={!alerts && !!h}
        title={alerts ? `Tiềm năng khung ${tf}: nhắc kiểm lại lúc nến ${tf} kế tiếp đóng (${vnTime(recheckFor(tf, Date.now(), sym).at)})` : "Cần Bot Telegram để nhắc theo nến"}>
        {tf}
      </button>
    );
  };
  // Dòng tóm tắt các mã đang tiềm năng + khung đang chờ (giờ nhắc)
  const tfSummary = (h) => (alerts ? HOT_RECHECK_TFS.map((tf) => {
    const rec = recFor(alerts, h, tf);
    if (!rec) return null;
    return <span key={tf} className={`hb-sum-tf ${rec.recheckAt ? "" : "hb-sum-ring"}`}>{tf} {rec.recheckAt ? `⏳${vnTime(Date.parse(rec.recheckAt))}` : "🔔"}</span>;
  }) : null);

  const shown = sections.map((sec) => ({ ...sec, syms: onlyHot ? sec.syms.filter((x) => hotByKey.has(symKey(x))) : sec.syms }))
    .filter((sec) => sec.syms.length);
  const first = list[0];
  return (
    <div>
      <p className="field-hint" style={{ marginTop: 8 }}>
        Bấm <b>tên mã</b> để bật/tắt tiềm năng, bấm <b>H4 / H8 / D</b> để đánh dấu tiềm năng ở khung đó — bot nhắc kiểm lại lúc nến khung ấy đóng.
        Cảnh báo TradingView của mã tiềm năng có dòng <b>🔥 MÃ TIỀM NĂNG</b> ở đầu tin, luôn có chuông.
      </p>
      <div className="hb-top">
        {list.length ? (
          <div className="hb-sum">
            {list.map((h) => (
              <span key={h.id} className="hb-sum-chip" title={hotAge(h.addedAt)}>
                <Flame size={11} /> <b className="mono">{h.name}</b>{tfSummary(h)}
                <button type="button" className="hb-sum-x" onClick={() => unHot(h)} title="Bỏ khỏi tiềm năng"><X size={11} /></button>
              </span>
            ))}
          </div>
        ) : <span className="field-hint">Chưa chọn mã nào.</span>}
        <label className="hb-only">
          <input type="checkbox" checked={onlyHot} onChange={toggleOnlyHot} /> Chỉ hiện mã đang tiềm năng
        </label>
      </div>
      <div className="hb-board">
        {shown.map((sec) => (
          <div key={sec.key} className={`hb-box ${sec.fx ? "hb-box-fx" : ""}`}>
            <div className="hb-box-head">{sec.label}<span>{sec.syms.filter((x) => hotByKey.has(symKey(x))).length || ""}</span></div>
            {sec.syms.map((sym) => {
              const h = hotByKey.get(symKey(sym));
              return (
                <div key={sym} className={`hb-row ${h ? "hb-row-hot" : ""}`}>
                  <button type="button" className="hb-name mono" onClick={() => toggleName(sym)} title={h ? "Bấm để bỏ tiềm năng" : "Bấm để đánh dấu tiềm năng"}>
                    {h ? <Flame size={11} /> : null}{sym}
                  </button>
                  <span className="hb-tfs">{HOT_RECHECK_TFS.map((tf) => tfButton(sym, h, tf))}</span>
                  {sec.mine && extra.some((e) => symKey(e) === symKey(sym)) ? (
                    <button type="button" className="hb-del" onClick={() => removeExtra(sym)} title="Xoá mã này khỏi bảng"><X size={11} /></button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
        {!onlyHot ? (
          <div className="hb-box hb-box-add">
            <div className="hb-box-head">Thêm mã khác</div>
            <div className="hb-add">
              <input className="input" value={extraText} onChange={(e) => setExtraText(e.target.value)} placeholder="NVDA, FPT…"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtra(); } }} />
              <button type="button" className="btn btn-ghost btn-xs" onClick={addExtra} disabled={!extraText.trim()}><PlusCircle size={12} /> Thêm</button>
            </div>
            <span className="field-hint">US stock, VN stock… — nằm lại ở khối Mã khác.</span>
          </div>
        ) : null}
      </div>
      <div className="hot-recheck">
        <span className="field-hint">Bấm tên mã (không chọn khung) thì tự nhắc:</span>
        <select className="input input-inline" style={{ width: "auto" }} value={recheckTf}
          onChange={(e) => onChange({ ...settings, hotRecheckTf: e.target.value })}>
          {HOT_RECHECK_TFS.map((tf) => <option key={tf} value={tf}>lúc nến {tf} đóng</option>)}
          <option value="">không nhắc</option>
        </select>
        {!alerts ? <span className="field-hint">(cần Bot Telegram)</span> : null}
      </div>
      {alertData && alertData.error ? <p className="error-text">{alertData.error}</p> : null}
      {first ? (
        <div className="hot-preview">
          <span className="field-hint">Tin Telegram sẽ như sau:</span>
          <pre>{`🔥🔥🔥 MÃ TIỀM NĂNG · ${first.name} 🔥🔥🔥\n📈 [H4] - ${first.name} : …`}</pre>
        </div>
      ) : null}
      <p className="field-hint">
        Tin cảnh báo cần có tên mã viết hoa — đặt <span className="mono">{"{{ticker}}"}</span> trong ô Tin nhắn của TradingView là chắc nhất.
        Setup xong hoặc hết tiềm năng thì bấm lại tên mã để bỏ, tránh "mã nào cũng nổi bật".
      </p>
      {list.length > 1 ? (
        <div className="form-actions" style={{ justifyContent: "flex-start" }}>
          <DangerConfirmButton onConfirm={() => { save([]); dropRechecks(new Set(list.map((h) => h.id))); }} label="Bỏ hết mã tiềm năng" confirmLabel="Bấm lần nữa để bỏ hết" />
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
    return [...used, ...symbolSuggestions(resources, trades, used, 300)];
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
                <SymbolBox items={symbols} suggestions={suggestions} hideDone={hideDone} groupOf={resources && resources.symbolGroups} order={resources && resources.symbols}
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
            <SymbolBox items={draft.symbols.map((name) => ({ name }))} suggestions={suggestions} autoFocus={watches.length > 0} groupOf={resources && resources.symbolGroups} order={resources && resources.symbols}
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

const SEASON_LABEL = { winter: "mùa đông", summer: "mùa hè" };

// Mỹ vừa đổi giờ mà giờ gõ tay vẫn theo mùa cũ: hiện danh sách giờ sẽ dời, bấm một lần là xong.
// Hai lần mỗi năm (Chủ nhật đầu tháng 11: +1 tiếng, Chủ nhật thứ 2 tháng 3: −1 tiếng).
function SeasonShiftBanner({ settings, watches, accounts, onSettingsChange, onWatchesChange, force, onClose }) {
  const now = usSeason();
  const base = settings.usSeasonHours || "summer";
  const due = now !== base;
  const [dir, setDir] = useState(now === "winter" ? 1 : -1);
  const [ticks, setTicks] = useState({});
  // Mở tay (đã đúng mùa) thì không tick sẵn gì — mục đã dời rồi mà tick lại là dời hai lần
  const isOn = (key) => (key in ticks ? ticks[key] : due && seasonShiftDefault(key, settings, watches));
  const plan = useMemo(() => seasonShiftPlan(settings, watches, accounts, dir, isOn), [settings, watches, accounts, dir, ticks]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!due && !force) return null;
  const sign = dir > 0 ? "+1" : "−1";
  const picked = plan.changes.filter((c) => isOn(c.key)).map((c) => c.key);
  const autoWatches = (watches || []).filter((w) => w && watchIsAuto(w));
  const slotsOn = !!(settings.autoSlots && settings.autoSlots.enabled);
  const done = (next) => { onSettingsChange({ ...next, usSeasonHours: now }); if (onClose) onClose(); };
  const apply = () => {
    done({ ...plan.settings, usSeasonShiftKeys: picked });
    if (plan.watches.some((w, i) => w !== (watches || [])[i])) onWatchesChange(plan.watches);
  };
  return (
    <div className="season-banner">
      <div className="season-head">
        <Clock size={14} />
        {due ? (
          <span>
            Mỹ đã sang <b>giờ {SEASON_LABEL[now]}</b> — nến FX, cổ phiếu Mỹ, hàng hoá đóng {dir > 0 ? "muộn" : "sớm"} hơn
            1 tiếng theo giờ VN. Lịch <b>theo giờ đóng nến</b> tự đổi rồi; giờ <b>gõ tay</b> thì vẫn theo {SEASON_LABEL[base]} —
            tick mục cần dời (mục bỏ trống giữ nguyên giờ):
          </span>
        ) : (
          <span>
            Dời tay giờ gõ tay (đang giờ Mỹ {SEASON_LABEL[now]}). Mục đã dời rồi thì đừng tick lại.{" "}
            <span className="season-dir">
              <button type="button" className={`btn btn-xs ${dir > 0 ? "btn-primary" : "btn-ghost"}`} onClick={() => setDir(1)}>+1 tiếng</button>
              <button type="button" className={`btn btn-xs ${dir < 0 ? "btn-primary" : "btn-ghost"}`} onClick={() => setDir(-1)}>−1 tiếng</button>
            </span>
          </span>
        )}
      </div>
      {plan.changes.length ? (
        <ul className="season-list">
          {plan.changes.map((c) => (
            <li key={c.key} className={c.on ? "" : "season-off"}>
              <label className="season-pick">
                <input type="checkbox" checked={isOn(c.key)} onChange={(e) => setTicks((t) => ({ ...t, [c.key]: e.target.checked }))} />
                {c.label}{c.on ? "" : " (đang tắt)"}
              </label>
              <span className="mono">{isOn(c.key) ? `${hoursText(c.from)} → ${hoursText(c.to)}` : `giữ ${hoursText(c.from)}`}</span>
              {c.wrapped && isOn(c.key) ? <small className="season-warn">qua nửa đêm — xem lại ngày chạy</small> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="season-none">Không có giờ gõ tay nào để dời — mọi lịch đang theo giờ đóng nến.</p>
      )}
      {autoWatches.length ? (
        <ul className="season-list season-info">
          {autoWatches.map((w) => (
            <li key={w.id}>
              <span className="season-pick">✓ Symbol theo dõi · {w.label || "Nhóm chưa đặt tên"} · khung {w.timeframe}</span>
              <span>{slotsOn ? "theo nến nhưng nhắc ở các mốc — dời bằng mục \"Mốc nhắc theo nến\"" : "theo giờ đóng nến — tự đổi mùa, không cần dời"}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="season-actions">
        {plan.changes.length ? (
          <button type="button" className="btn btn-primary btn-xs" onClick={apply} disabled={!picked.length}>
            Dời {sign} tiếng{picked.length ? ` (${picked.length} mục)` : ""}
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => done(settings)}>
          {!due ? "Đóng" : plan.changes.length ? "Giữ nguyên" : "Đã hiểu"}
        </button>
      </div>
    </div>
  );
}


export function PlansPanel({
  settings, onSettingsChange, resources, trades, watches, onWatchesChange, mutedTrades, onMutedTradesChange,
  checkLog, remindersNode, reminders, onGoSettings,
}) {
  const s = settings;
  const [open, setOpenRaw] = useState(() => readLocalUi("plansOpen", ""));
  const setOpen = (id) => { setOpenRaw(id); writeLocalUi("plansOpen", id); };
  const [seasonOpen, setSeasonOpen] = useState(false);
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
  const hotOn = s.hotEnabled !== false;
  const alertData = useAlertRepeats(telegramReady);
  const news = useNewsCalendar();
  const ea = useEaData(true);
  const newsSummary = (() => {
    const g = guardOf(s.newsGuard);
    if (!news.store) return "Đang tải…";
    const now = Date.now();
    const next = upcomingNews(newsEvents(news.store), now, NEWS_DAYS).filter((e) => e.tier && e.t > now - g.after * 60000);
    const head = next.slice(0, 3).map((e) => `${TIER_ICON[e.tier]} ${e.name} ${e.cur} ${newsTimeVn(e.t, true)}`).join(" · ");
    return `±${g.before}/${g.after} phút — ${head || "không có tin 14 ngày tới"}`;
  })();
  const hotSummary = (() => {
    const list = s.hotSymbols || [];
    if (!list.length) return "Chưa có mã nào — thêm mã để cảnh báo TradingView của mã đó nổi bật trên Telegram";
    const names = list.map((h) => h.name);
    return `${names.slice(0, 8).join(" · ")}${names.length > 8 ? ` +${names.length - 8}` : ""}`;
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
    const mb = { ...emptyMorningBrief(), ...(s.morningBrief || {}) };
    const brief = mb.enabled ? `Tin sáng ${hoursText([mb.time])}` : "";
    const n = (reminders || []).length;
    return [brief, ...jobs, n ? `${n} nhắc riêng` : ""].filter(Boolean).join(" · ") || "Chưa bật việc nào";
  })();

  return (
    <div className="plans">
      {!telegramReady ? (
        <div className="plan-warn">
          Chưa có Bot Token / Chat ID — tin nhắc chưa gửi được.
          <button type="button" className="btn btn-ghost btn-xs" onClick={onGoSettings}><Settings2 size={12} /> Mở Cài đặt</button>
        </div>
      ) : null}
      <SeasonShiftBanner settings={s} watches={watches} accounts={resources.accounts} onSettingsChange={onSettingsChange} onWatchesChange={onWatchesChange}
        force={seasonOpen} onClose={() => setSeasonOpen(false)} />
      <div className="plan-mode">
        <Clock size={13} /> Giờ đóng nến: {candleModeText(s)} · giờ Mỹ {SEASON_LABEL[usSeason()]}
        <button type="button" className="plan-link" onClick={onGoSettings}>đổi</button>
        <button type="button" className="plan-link" onClick={() => setSeasonOpen(true)}>dời giờ ±1</button>
      </div>

      <PlanSection id="eaSl" icon={Shield} title="SL hiện tại (EA)" summary={eaSummary(ea, trades, resources, s)}
        on={s.eaWatch ? s.eaWatch.enabled !== false : true} onToggle={(v) => onSettingsChange({ ...s, eaWatch: { ...(s.eaWatch || {}), enabled: v } })}
        open={open === "eaSl"} onOpen={setOpen}>
        <EaSlBody settings={s} onChange={onSettingsChange} resources={resources} trades={trades} data={ea} />
      </PlanSection>
      <PlanSection id="hot" icon={Flame} title="Mã tiềm năng" summary={hotSummary}
        on={hotOn} onToggle={(v) => onSettingsChange({ ...s, hotEnabled: v })} open={open === "hot"} onOpen={setOpen}>
        <HotBody settings={s} onChange={onSettingsChange} resources={resources} trades={trades} watches={watches} alertData={telegramReady ? alertData : null} />
      </PlanSection>
      <PlanSection id="alerts" icon={Hourglass} title="Cảnh báo nhắc lại" summary={alertSummary(alertData.list)}
        open={open === "alerts"} onOpen={setOpen}>
        <AlertRechecksBody data={alertData} resources={resources} settings={s} />
      </PlanSection>
      <PlanSection id="news" icon={ShieldAlert} title="Tin lớn" summary={newsSummary}
        on={guardOf(s.newsGuard).enabled} onToggle={(v) => onSettingsChange({ ...s, newsGuard: { ...guardOf(s.newsGuard), enabled: v } })}
        open={open === "news"} onOpen={setOpen}>
        <NewsBody settings={s} onChange={onSettingsChange} news={news} />
      </PlanSection>
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
    ["morningBrief", "Tin buổi sáng", emptyMorningBrief],
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
            {(resources.accounts || []).filter((acc) => !acc.closed).map((acc) => (
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
