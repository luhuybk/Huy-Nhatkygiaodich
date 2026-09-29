import { useMemo, useState } from "react";
import { Bell, CalendarClock, Check, Pencil, Plus, Scale, Send, X } from "lucide-react";
import { ConfirmButton, Field, MoneyInput } from "./ui.jsx";
import { CURRENCIES } from "../lib/constants.js";
import { emptyCapitalPickReminder, fmtMoney, todayStr, WEEKDAY_CODES } from "../lib/helpers.js";
import {
  capitalScale, emptyCapitalMarket, fmtPctVN, isWeekend, marketDrawdown, marketsMissingNextPick, marketTierList, marketUnitBase,
  nextWeekKey, pickedTier, safestTier, setPick, sortTiers, thisWeekKey, tierMoney, tierShareOfTotal,
} from "../lib/capital.js";

const WEEKDAY_FULL = { T2: "Thứ 2", T3: "Thứ 3", T4: "Thứ 4", T5: "Thứ 5", T6: "Thứ 6", T7: "Thứ 7", CN: "Chủ nhật" };

const ddmm = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");
const weekLabel = (start) => {
  const end = new Date(start + "T00:00:00");
  end.setDate(end.getDate() + 6);
  return `${ddmm(start)} – ${String(end.getDate()).padStart(2, "0")}/${String(end.getMonth() + 1).padStart(2, "0")}`;
};
const numOr = (v, d) => { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : d; };

// Ô số chỉ ghi khi rời ô — gõ "50000" không thành 5 lần lưu lên máy chủ.
function BlurNumber({ value, onCommit, className = "input mono", step = "any", min }) {
  return (
    <input type="number" step={step} min={min} className={className} defaultValue={value ?? ""} key={value}
      onBlur={(e) => { const n = numOr(e.target.value, null); if (n !== null && n !== value) onCommit(n); }} />
  );
}

function TierPicker({ market, picked, onPick }) {
  const list = marketTierList(market);
  return (
    <div className="lsn-pick cap-pick">
      {list.map(({ pct, hold }) => (
        <button key={pct} type="button" title={hold ? "Mốc cầm chừng" : undefined}
          className={`lsn-pick-btn ${hold ? "cap-pick-hold" : ""} ${picked === pct ? "lsn-pick-on lsn-pick-on-1" : ""}`} onClick={() => onPick(pct)}>
          {hold ? "Cầm chừng " : ""}{fmtPctVN(pct)}
        </button>
      ))}
      {picked !== null && !list.some((x) => x.pct === picked) ? (
        <span className="field-hint">Đang chọn {fmtPctVN(picked)} (đã gỡ khỏi danh sách mức)</span>
      ) : null}
    </div>
  );
}

function DrawdownBar({ plan, dd, market }) {
  const cut = plan.ddCutPct || 12;
  const width = Math.min(100, (dd.pct / cut) * 100);
  const warnAt = Math.min(100, ((plan.ddWarnPct || 8) / cut) * 100);
  const label = dd.level === "cut" ? "Nên giảm risk hẳn" : dd.level === "warn" ? "Cảnh báo" : "Ổn";
  return (
    <div className={`cap-dd cap-dd-${dd.level}`}>
      <div className="cap-dd-head">
        <span>Sụt từ đỉnh{market.accountCount > 1 && dd.worst.name ? ` · ${dd.worst.name}` : ""}</span>
        <b className="mono">{fmtPctVN(dd.pct, 1)}</b>
        <span className="cap-dd-tag">{label}</span>
      </div>
      <div className="cap-dd-track">
        <span className="cap-dd-fill" style={{ width: `${width}%` }} />
        <span className="cap-dd-mark" style={{ left: `${warnAt}%` }} title={`Cảnh báo ${plan.ddWarnPct}%`} />
      </div>
      {dd.linked && dd.lossStreak >= 2 ? (
        <p className="cap-dd-streak">Đang thua {dd.lossStreak} lệnh liên tiếp</p>
      ) : null}
      {!dd.linked ? (
        <p className="field-hint cap-dd-note">Chưa gắn tài khoản — bấm Sửa để chọn tài khoản thuộc mảng này.</p>
      ) : market.accountCount > 1 && dd.curves.length > 1 ? (
        <p className="field-hint cap-dd-note">
          {dd.curves.map((c) => `${c.name || "—"} ${fmtPctVN(c.pct, 1)}`).join(" · ")}
        </p>
      ) : (
        <p className="field-hint cap-dd-note">{dd.tradeCount} lệnh đã đóng từ {ddmm(plan.startDate) || "đầu"} · vốn hiện {fmtMoney(Math.round(dd.worst.current), market.currency)}</p>
      )}
    </div>
  );
}

function MarketEditor({ market, accounts, onSave, onCancel, onDelete }) {
  const [m, setM] = useState(market);
  const [tierText, setTierText] = useState(market.tiers.map((x) => String(x).replace(".", ",")).join("  "));
  const [holdText, setHoldText] = useState(market.holdTier ? String(market.holdTier).replace(".", ",") : "");
  const set = (k) => (v) => setM((prev) => ({ ...prev, [k]: v }));
  const tiers = sortTiers(tierText.split(/[\s;]+/).map((x) => x.replace(",", ".")).filter(Boolean));
  const toggleAccount = (id) => set("accountIds")(m.accountIds.includes(id) ? m.accountIds.filter((x) => x !== id) : [...m.accountIds, id]);
  const save = () => {
    const defaultTier = tiers.includes(Number(m.defaultTier)) ? Number(m.defaultTier) : tiers[Math.floor((tiers.length - 1) / 2)];
    onSave({
      ...m, name: m.name.trim() || "Mảng chưa đặt tên", tiers, defaultTier,
      holdTier: numOr(holdText, 0) > 0 ? numOr(holdText, 0) : null,
      rate: m.currency === "USD" ? 1 : numOr(m.rate, 1) || 1,
      allocated: numOr(m.allocated, 0), deposited: numOr(m.deposited, 0),
      accountCount: Math.max(1, Math.round(numOr(m.accountCount, 1))),
    });
  };
  return (
    <div className="cap-editor">
      <div className="grid-2">
        <Field label="Tên mảng"><input className="input" value={m.name} onChange={(e) => set("name")(e.target.value)} placeholder="VD: US Stock" /></Field>
        <Field label="Tiền của mảng">
          <select className="input" value={m.currency} onChange={(e) => set("currency")(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label={m.side ? "Vốn ước lượng (USD)" : "Vốn phân chia (USD)"}><MoneyInput value={m.allocated} onChange={set("allocated")} /></Field>
        {m.currency !== "USD" ? (
          <Field label={`Tỷ giá cố định (${m.currency} / 1 USD)`} hint="Chỉ dùng cho bảng này, không đổi tỷ giá ở tab Tài khoản">
            <MoneyInput value={m.rate} onChange={set("rate")} />
          </Field>
        ) : null}
        <Field label="Số tài khoản" hint="Nhiều tài khoản thì vốn chia đều, rủi ro tính trên từng tài khoản">
          <input type="number" min="1" step="1" className="input mono" value={m.accountCount} onChange={(e) => set("accountCount")(e.target.value)} />
        </Field>
        <Field label={`Dòng tiền đã nạp vào tk (${m.currency})`} hint="Chỉ để nhìn, không dùng tính rủi ro">
          <MoneyInput value={m.deposited} onChange={set("deposited")} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Các mức rủi ro (%)" hint="Cách nhau bằng dấu cách, VD: 0,6  1,2  1,6">
          <input className="input mono" value={tierText} onChange={(e) => setTierText(e.target.value)} />
        </Field>
        <Field label="Mốc cầm chừng (%)" hint={`Giảm risk tối đa khi setup hợp lệ nhưng đang sụt sâu / thua liên tiếp${numOr(holdText, 0) > 0 ? ` — ${fmtMoney(tierMoney({ ...m, allocated: numOr(m.allocated, 0), rate: numOr(m.rate, 1), accountCount: numOr(m.accountCount, 1) }, numOr(holdText, 0)), m.currency)} / lệnh` : ". Bỏ trống nếu không dùng"}`}>
          <input className="input mono" value={holdText} onChange={(e) => setHoldText(e.target.value)} placeholder="VD: 0,3" />
        </Field>
      </div>
      <label className="mc-check cap-side-check">
        <input type="checkbox" checked={!!m.side} onChange={(e) => set("side")(e.target.checked)} />
        <span>Tài khoản phụ (trade nhẹ, VD crypto, hàng hóa) — vốn ước lượng, không tính vào hệ số cấp, không nhắc chọn mức hằng tuần</span>
      </label>
      {tiers.length ? (
        <Field label="Mức mặc định" hint="Dùng khi chưa từng chọn mức cho mảng này">
          <div className="lsn-pick">
            {tiers.map((pct) => (
              <button key={pct} type="button" className={`lsn-pick-btn ${Number(m.defaultTier) === pct ? "lsn-pick-on lsn-pick-on-2" : ""}`} onClick={() => set("defaultTier")(pct)}>{fmtPctVN(pct)}</button>
            ))}
          </div>
        </Field>
      ) : <p className="field-hint" style={{ color: "var(--loss)" }}>Chưa có mức nào hợp lệ.</p>}
      <Field label="Tài khoản thuộc mảng này" hint="Chọn nhóm thì gồm luôn các tài khoản con. Dùng để gợi ý rủi ro khi nhập lệnh và tính sụt vốn.">
        <div className="cap-accounts">
          {accounts.length ? accounts.map((a) => (
            <label key={a.id} className="mc-check cap-account">
              <input type="checkbox" checked={m.accountIds.includes(a.id)} onChange={() => toggleAccount(a.id)} />
              <span>{a.name} <small className="field-hint">{a.currency}</small></span>
            </label>
          )) : <span className="field-hint">Chưa có tài khoản nào — thêm ở tab Tài khoản.</span>}
        </div>
      </Field>
      <div className="cap-editor-foot">
        <button type="button" className="btn btn-primary" onClick={save} disabled={!tiers.length}><Check size={14} /> Lưu</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Hủy</button>
        {onDelete ? <span style={{ marginLeft: "auto" }}><ConfirmButton onConfirm={onDelete} label="Xóa mảng" /></span> : null}
      </div>
    </div>
  );
}

function MarketCard({ plan, market, dd, weeks, accounts, onPick, onSave, onDelete, startEditing }) {
  const [editing, setEditing] = useState(!!startEditing);
  const now = pickedTier(plan, market.id, weeks.now);
  const next = pickedTier(plan, market.id, weeks.next);
  const safest = safestTier(market);
  const safestIsHold = safest !== null && safest === market.holdTier;
  const linked = accounts.filter((a) => market.accountIds.includes(a.id));
  if (editing) {
    return (
      <div className="cap-card">
        <MarketEditor market={market} accounts={accounts} onCancel={() => (startEditing ? onDelete() : setEditing(false))}
          onSave={(m) => { onSave(m); setEditing(false); }} onDelete={startEditing ? null : onDelete} />
      </div>
    );
  }
  return (
    <div className={`cap-card cap-card-${dd.level}`}>
      <div className="cap-card-head">
        <b className="cap-card-name">{market.name}</b>
        <span className="cap-card-sub mono">
          {market.side ? "ước lượng " : ""}{fmtMoney(market.allocated, "USD")}
          {market.currency !== "USD" ? ` ≈ ${fmtMoney(market.allocated * market.rate, market.currency)}` : ""}
          {market.accountCount > 1 ? ` · ${market.accountCount} tk × ${fmtMoney(marketUnitBase(market), market.currency)}` : ""}
        </span>
        <button type="button" className="row-btn" onClick={() => setEditing(true)} title="Sửa mảng"><Pencil size={13} /></button>
      </div>

      <table className="cap-tiers">
        <thead><tr><th>Rủi ro</th><th>Tiền / lệnh</th><th>Quy ra vốn tổng</th></tr></thead>
        <tbody>
          {marketTierList(market).map(({ pct, hold }) => (
            <tr key={pct} className={`${hold ? "cap-tier-hold" : ""} ${pct === now.pct ? "cap-tier-on" : ""}`}>
              <td className="mono">{fmtPctVN(pct)}{hold ? <span className="cap-hold-tag">cầm chừng</span> : null}</td>
              <td className="mono">{fmtMoney(tierMoney(market, pct), market.currency)}</td>
              <td className="mono">{fmtPctVN(tierShareOfTotal(plan, market, pct))}{pct === now.pct ? <span className="cap-arrow"> ← tuần này</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="cap-week">
        <span className="cap-week-label">Tuần này <small>{weekLabel(weeks.now)}</small></span>
        <TierPicker market={market} picked={now.pct} onPick={(pct) => onPick(weeks.now, pct)} />
      </div>
      <div className={`cap-week ${weeks.nudge && !next.explicit && !market.side ? "cap-week-due" : ""}`}>
        <span className="cap-week-label">
          Tuần sau <small>{weekLabel(weeks.next)}</small>
          {!next.explicit ? <em className="cap-week-hint"> · chưa chọn, đang giữ {fmtPctVN(next.pct)}</em> : null}
        </span>
        <TierPicker market={market} picked={next.explicit ? next.pct : null} onPick={(pct) => onPick(weeks.next, pct)} />
      </div>

      <DrawdownBar plan={plan} dd={dd} market={market} />
      {dd.level === "cut" && now.pct !== null && safest !== null && now.pct > safest ? (
        <p className="cap-suggest">
          Sụt quá {fmtPctVN(plan.ddCutPct, 0)} — nên hạ xuống {safestIsHold ? "mốc cầm chừng " : ""}{fmtPctVN(safest)}.{" "}
          <button type="button" className="btn btn-ghost cap-suggest-btn" onClick={() => onPick(weeks.now, safest)}>Hạ tuần này về {fmtPctVN(safest)}</button>
        </p>
      ) : null}

      <div className="cap-card-foot field-hint">
        <span>Đã nạp: <b className="mono">{fmtMoney(market.deposited, market.currency)}</b></span>
        <span>{linked.length ? `Tài khoản: ${linked.map((a) => a.name).join(", ")}` : "Chưa gắn tài khoản"}</span>
      </div>
    </div>
  );
}

function PickReminderCard({ settings, onChange }) {
  const cfg = { ...emptyCapitalPickReminder(), ...(settings.capitalPickReminder || {}) };
  const setCfg = (patch) => onChange({ ...settings, capitalPickReminder: { ...cfg, ...patch } });
  const ready = !!(settings.telegramBotToken && settings.telegramChatId);
  return (
    <div className="account-form cap-remind">
      <h3 className="block-title" style={{ marginTop: 0 }}><Bell size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Nhắc chọn mức tuần sau qua Telegram</h3>
      <p className="field-hint" style={{ marginBottom: 10 }}>
        Đúng giờ đã đặt, nếu còn mảng chưa chọn mức cho tuần sau thì bot gửi một tin kèm mức đang dùng và
        mức sụt vốn của từng mảng. Chọn đủ rồi thì không gửi.
      </p>
      {!ready ? <p className="field-hint" style={{ color: "var(--loss)", marginBottom: 10 }}>Chưa có Bot Token / Chat ID — điền ở Thông báo → Nhắc dời SL trước.</p> : null}
      <button type="button" className={`lesson-toggle-btn ${cfg.enabled ? "lesson-toggle-active lesson-toggle-glow" : ""}`} onClick={() => setCfg({ enabled: !cfg.enabled })}>
        <Send size={14} /> {cfg.enabled ? "🔔 Đang bật nhắc chọn mức" : "Bật nhắc chọn mức"}
      </button>
      <div className="grid-3" style={{ marginTop: 12 }}>
        <Field label="Vào thứ">
          <select className="input" value={cfg.weekday} onChange={(e) => setCfg({ weekday: e.target.value })}>
            {WEEKDAY_CODES.map((d) => <option key={d} value={d}>{WEEKDAY_FULL[d]}</option>)}
          </select>
        </Field>
        <Field label="Giờ nhắc (giờ Việt Nam)">
          <input type="time" className="input" value={cfg.time || "20:00"} onChange={(e) => setCfg({ time: e.target.value })} />
        </Field>
        <Field label="Topic (Thread ID)" hint="Bỏ trống nếu gửi vào chat chính">
          <input className="input mono" defaultValue={cfg.threadId || ""} placeholder="Thread ID" onBlur={(e) => setCfg({ threadId: e.target.value.trim() })} />
        </Field>
      </div>
    </div>
  );
}

export function CapitalPlanPage({ plan, onChange, trades, resources, slReminderSettings, onSlReminderSettingsChange }) {
  const [newId, setNewId] = useState(null);
  const today = todayStr();
  const accounts = resources.accounts || [];
  const weeks = { now: thisWeekKey(today), next: nextWeekKey(today), nudge: isWeekend(today) };
  const scale = capitalScale(plan);
  const dds = useMemo(() => Object.fromEntries(plan.markets.map((m) => [m.id, marketDrawdown(plan, m, trades, resources)])), [plan, trades, resources]);
  const missing = weeks.nudge ? marketsMissingNextPick(plan, today) : [];

  const patch = (p) => onChange({ ...plan, ...p });
  const saveMarket = (m) => { patch({ markets: plan.markets.map((x) => (x.id === m.id ? m : x)) }); if (m.id === newId) setNewId(null); };
  const deleteMarket = (id) => {
    const picks = {};
    Object.entries(plan.picks || {}).forEach(([k, v]) => { const { [id]: _drop, ...rest } = v || {}; if (Object.keys(rest).length) picks[k] = rest; });
    onChange({ ...plan, markets: plan.markets.filter((x) => x.id !== id), picks });
    if (id === newId) setNewId(null);
  };
  const addMarket = (side) => {
    const m = side ? { ...emptyCapitalMarket(), side: true, allocated: 1000, tiers: [0.5, 1], defaultTier: 0.5 } : emptyCapitalMarket();
    setNewId(m.id);
    patch({ markets: [...plan.markets, m] });
  };
  const card = (m) => (
    <MarketCard key={m.id} plan={plan} market={m} dd={dds[m.id]} weeks={weeks} accounts={accounts} startEditing={m.id === newId}
      onPick={(week, pct) => onChange(setPick(plan, week, m.id, pct))}
      onSave={saveMarket} onDelete={() => deleteMarket(m.id)} />
  );
  const mainMarkets = plan.markets.filter((m) => !m.side);
  const sideMarkets = plan.markets.filter((m) => m.side);

  return (
    <div>
      <div className="cap-head">
        <div className="cap-total">
          <Field label="Vốn tổng (USD)"><BlurNumber value={plan.totalCapital} min="0" onCommit={(n) => patch({ totalCapital: n })} /></Field>
        </div>
        <div className="cap-stat"><span>Hệ số cấp</span><b className="mono">{scale.factor === null ? "—" : scale.factor.toFixed(2).replace(".", ",")}</b></div>
        <div className="cap-stat"><span>Quy đổi vốn</span><b className="mono">{fmtMoney(scale.allocated, "USD")}</b></div>
        {scale.side ? <div className="cap-stat"><span>Tài khoản phụ (ngoài)</span><b className="mono cap-stat-dim">{fmtMoney(scale.side, "USD")}</b></div> : null}
        <div className="cap-settings">
          <Field label="Tính sụt vốn từ ngày"><input type="date" className="input" value={plan.startDate || ""} onChange={(e) => patch({ startDate: e.target.value })} /></Field>
          <Field label="Cảnh báo khi sụt (%)"><BlurNumber value={plan.ddWarnPct} min="0" onCommit={(n) => patch({ ddWarnPct: n })} /></Field>
          <Field label="Giảm risk hẳn khi sụt (%)"><BlurNumber value={plan.ddCutPct} min="0" onCommit={(n) => patch({ ddCutPct: n })} /></Field>
        </div>
      </div>

      {missing.length ? (
        <div className="cap-nudge">
          <CalendarClock size={16} />
          <span>Cuối tuần rồi — chọn mức đi vốn cho tuần {weekLabel(weeks.next)}: còn <b>{missing.map((m) => m.name).join(", ")}</b>.</span>
        </div>
      ) : null}

      <div className="cap-grid">
        {mainMarkets.map(card)}
        <button type="button" className="cap-add" onClick={() => addMarket(false)}><Plus size={16} /> Thêm mảng</button>
      </div>

      <h3 className="block-title">Tài khoản phụ · trade nhẹ</h3>
      <p className="field-hint" style={{ marginTop: 4, marginBottom: 10 }}>
        Crypto, hàng hóa... — ghi vốn ước lượng và vài mức risk nhỏ. Không tính vào hệ số cấp, không bị nhắc chọn mức mỗi tuần
        (chưa chọn thì dùng mức mặc định), nhưng vẫn có chip gợi ý khi nhập lệnh và vẫn theo dõi sụt vốn.
      </p>
      <div className="cap-grid">
        {sideMarkets.map(card)}
        <button type="button" className="cap-add cap-add-side" onClick={() => addMarket(true)}><Plus size={16} /> Thêm tài khoản phụ</button>
      </div>

      <p className="field-hint" style={{ marginTop: 12 }}>
        <Scale size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
        Sụt vốn tính trên vốn phân chia cộng lãi/lỗ các lệnh đã đóng từ ngày bắt đầu, không phải tiền đã nạp.
        Mảng nhiều tài khoản thì mỗi tài khoản một đường riêng và báo theo tài khoản tệ nhất.
      </p>

      <PickReminderCard settings={slReminderSettings} onChange={onSlReminderSettingsChange} />
    </div>
  );
}

// Thẻ nhỏ trên Tổng quan: mỗi mảng đang đi mức nào, 1R bao nhiêu tiền, sụt vốn ra sao.
export function CapitalSummaryCard({ plan, trades, resources, onOpen }) {
  const today = todayStr();
  const week = thisWeekKey(today);
  const rows = useMemo(() => (plan ? plan.markets.map((m) => {
    const p = pickedTier(plan, m.id, week);
    return { m, pct: p.pct, money: p.pct === null ? null : tierMoney(m, p.pct), dd: marketDrawdown(plan, m, trades, resources) };
  }) : []), [plan, trades, resources, week]);
  if (!plan || !rows.length) return null;
  const missing = isWeekend(today) ? marketsMissingNextPick(plan, today) : [];
  return (
    <div className="cap-summary">
      <button type="button" className="cap-summary-head" onClick={onOpen}>
        <Scale size={14} /> <b>Phân bổ vốn tuần này</b>
        {missing.length ? <span className="cap-summary-due">Chưa chọn mức tuần sau: {missing.map((m) => m.name).join(", ")}</span> : null}
      </button>
      <div className="cap-summary-rows">
        {rows.map(({ m, pct, money, dd }) => (
          <div key={m.id} className={`cap-summary-row cap-summary-${dd.level}`}>
            <span className="cap-summary-name">{m.name}{m.side ? <small className="cap-side-tag">phụ</small> : null}</span>
            <b className="mono">{fmtPctVN(pct)}</b>
            <span className="mono">1R = {money === null ? "—" : fmtMoney(money, m.currency)}</span>
            <span className="mono cap-summary-dd" title="Sụt từ đỉnh">↓ {fmtPctVN(dd.pct, 1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Hàng chip ở mục 2 form nhập lệnh.
export function RiskTierChips({ options, dd, plan, riskAmount, onPick }) {
  if (!options) return null;
  const { market, picked, currency, tiers } = options;
  const allowed = picked.pct === null ? null : tierMoney(market, picked.pct);
  const amt = Number(riskAmount);
  const over = allowed !== null && Number.isFinite(amt) && amt > allowed * 1.001 && String(riskAmount).trim() !== "";
  const selected = tiers.find((x) => Number.isFinite(amt) && Math.abs(x.money - amt) < 0.005 * Math.max(1, x.money));
  // Sụt vượt ngưỡng cảnh báo hoặc đang thua liên tiếp: làm nổi mốc cầm chừng để nhớ tới nó.
  const rough = !!dd && (dd.level !== "ok" || dd.lossStreak >= 2);
  const hold = tiers.find((x) => x.hold);
  return (
    <div className="cap-chips">
      <div className="cap-chips-head">
        <span><b>{market.name}</b> · tuần này {fmtPctVN(picked.pct)}</span>
        {dd ? (
          <span className={`cap-chips-dd cap-chips-dd-${dd.level === "ok" && dd.lossStreak >= 2 ? "warn" : dd.level}`}>
            Sụt {fmtPctVN(dd.pct, 1)}{dd.level === "cut" ? " — nên giảm risk" : dd.level === "warn" ? " — cảnh báo" : dd.lossStreak >= 2 ? "" : " ✓"}
            {dd.lossStreak >= 2 ? ` · thua ${dd.lossStreak} lệnh liên tiếp` : ""}
          </span>
        ) : null}
      </div>
      <div className="cap-chips-row">
        {tiers.map((x) => (
          <button key={x.pct} type="button"
            className={`cap-chip ${x.hold ? "cap-chip-hold" : ""} ${x.hold && rough ? "cap-chip-hold-hint" : ""} ${x.isPicked ? "cap-chip-week" : ""} ${selected && selected.pct === x.pct ? "cap-chip-on" : ""}`}
            onClick={() => onPick(x)}>
            {x.isPicked ? "★ " : ""}{x.hold ? "Cầm chừng " : ""}{fmtPctVN(x.pct)} · {fmtMoney(x.money, currency)}
          </button>
        ))}
      </div>
      {selected && selected.share !== null ? <span className="field-hint">= {fmtPctVN(selected.share)} vốn tổng</span> : null}
      {rough && hold && !(selected && selected.hold) ? (
        <span className="cap-chips-hold-note">Setup hợp lệ mà thấy không ổn? Cân nhắc mốc cầm chừng {fmtPctVN(hold.pct)} ({fmtMoney(hold.money, currency)}).</span>
      ) : null}
      {over ? (
        <span className="cap-chips-over"><X size={12} /> Vượt mức tuần này ({fmtMoney(allowed, currency)}{plan && plan.totalCapital ? ` · ${fmtPctVN(tierShareOfTotal(plan, market, picked.pct))} vốn tổng` : ""}).</span>
      ) : null}
    </div>
  );
}
