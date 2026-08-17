import { useState, useEffect } from "react";
import { Pencil, ChevronLeft } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell } from "recharts";
import { ACCENT, CURRENCIES, FLOW_TYPES, GRID, LOSS, MUTED, WIN, tooltipCursor, tooltipItemStyle, tooltipLabelStyle, tooltipStyle } from "../lib/constants.js";
import { ChartCard, ConfirmButton, DangerConfirmButton, Field, IdSelect, MoneyInput, StatCard } from "./ui.jsx";
import { accountBalance, accountOpenRisk, buildBalanceCurve, buildGrowthSeries, closedOf, computeAdvancedMetrics, emptyFlow, fmt, fmtMoney, toUSD, uid } from "../lib/helpers.js";

export function AccountsList({ accounts, ledger, trades, onChange, onMoveTrades, fxRates, onFxRatesChange, onView, editTarget, onEditConsumed }) {
  const blank = { id: null, name: "", broker: "", currency: "USD", initialBalance: "", parentId: "" };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (editTarget) { setForm({ ...blank, ...editTarget }); setError(""); onEditConsumed(); }
  }, [editTarget]);

  const submit = () => {
    if (!form.name.trim()) { setError("Vui lòng nhập tên tài khoản."); return; }
    setError("");
    const payload = { ...form, initialBalance: Number(form.initialBalance) || 0 };
    if (form.id) onChange(accounts.map((a) => (a.id === form.id ? payload : a)));
    else onChange([...accounts, { ...payload, id: uid() }]);
    setForm(blank);
  };
  // Lệnh tham chiếu tài khoản bằng tên, nên xóa thẳng sẽ để lệnh mồ côi —
  // biến mất khỏi mọi thống kê theo tài khoản mà không báo gì. Bắt chuyển lệnh đi trước.
  const [pendingDelete, setPendingDelete] = useState(null);
  const [moveTarget, setMoveTarget] = useState("");

  const doRemove = (id) => {
    onChange(accounts.filter((a) => a.id !== id).map((a) => (a.parentId === id ? { ...a, parentId: "" } : a)));
    if (form.id === id) setForm(blank);
    setPendingDelete(null);
    setMoveTarget("");
  };
  const remove = (id) => {
    const acc = accounts.find((a) => a.id === id);
    const owned = acc ? trades.filter((t) => t.account === acc.name) : [];
    if (owned.length) { setPendingDelete({ account: acc, count: owned.length }); setMoveTarget(""); return; }
    doRemove(id);
  };
  const confirmDeleteWithMove = () => {
    const acc = pendingDelete.account;
    const target = accounts.find((a) => a.id === moveTarget);
    if (onMoveTrades) onMoveTrades(acc.name, target ? target.name : "");
    doRemove(acc.id);
  };

  const roots = accounts.filter((a) => !a.parentId);
  const childrenOf = (id) => accounts.filter((a) => a.parentId === id);
  const leaves = accounts.filter((a) => !accounts.some((x) => x.parentId === a.id));
  const leafBalanceSumUSD = leaves.reduce((s, a) => s + toUSD(accountBalance(a, ledger, trades), a.currency, fxRates), 0);
  const leafInitialSumUSD = leaves.reduce((s, a) => s + toUSD(Number(a.initialBalance) || 0, a.currency, fxRates), 0);
  const usedCurrencies = Array.from(new Set(accounts.map((a) => a.currency).filter((c) => c && c !== "USD")));

  const renderCard = (a, parent) => {
    const bal = accountBalance(a, ledger, trades);
    const initial = Number(a.initialBalance) || 0;
    const accountTrades = trades.filter((t) => t.account === a.name);
    const pnl = closedOf(accountTrades).reduce((s, x) => s + x.r.profit, 0);
    const growth = initial ? ((bal - initial) / Math.abs(initial)) * 100 : null;
    const openRisk = accountOpenRisk(a, ledger, trades);
    return (
      <button type="button" key={a.id} className="account-card" onClick={() => onView(a.id)}>
        <div className="account-card-head">
          <strong>{a.name}</strong>
          <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 4 }}>
            <button type="button" className="row-btn" onClick={() => { setForm({ ...blank, ...a }); setError(""); }}><Pencil size={13} /></button>
            <ConfirmButton onConfirm={() => remove(a.id)} />
          </span>
        </div>
        {parent ? <span className="account-card-parent">thuộc nhóm {parent.name}</span> : null}
        <div className={`account-card-balance ${bal >= initial ? "text-win" : "text-loss"}`}>{fmt(bal)} <span className="mono" style={{ fontSize: 13 }}>{a.currency}</span></div>
        <div className="account-card-rows">
          <div><span>Số dư ban đầu</span><span className="mono">{fmt(initial)}</span></div>
          <div><span>Trading P&L</span><span className={`mono ${pnl >= 0 ? "text-win" : "text-loss"}`}>{pnl >= 0 ? "+" : ""}{fmt(pnl)}</span></div>
          <div><span>Tăng trưởng</span><span className="mono">{growth === null ? "—" : `${growth.toFixed(1)}%`}</span></div>
          <div><span>Số lệnh</span><span className="mono">{accountTrades.length}</span></div>
          <div><span>% Risk đang mở</span><span className={`mono ${openRisk.pct >= 5 ? "text-loss" : ""}`}>{openRisk.count === 0 ? "—" : `${openRisk.pct.toFixed(2)}% (${openRisk.count} lệnh)`}</span></div>
        </div>
      </button>
    );
  };
  const renderGroup = (a) => [renderCard(a, null), ...childrenOf(a.id).map((c) => renderCard(c, a))];

  return (
    <div>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)", marginBottom: 18 }}>
        <StatCard label="Tổng vốn ban đầu (quy đổi USD)" value={fmtMoney(leafInitialSumUSD, "USD")} />
        <StatCard label="Tổng vốn hiện tại (quy đổi USD)" value={fmtMoney(leafBalanceSumUSD, "USD")} tone={leafBalanceSumUSD >= leafInitialSumUSD ? "win" : "loss"} />
      </div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Gộp nhóm bằng cách chọn "Thuộc nhóm" (VD: Forex H3 / H8 / D thuộc nhóm Forex). Tổng vốn phía trên chỉ tính trên các tài khoản không có tài khoản con, quy đổi theo tỷ giá bên dưới. Bấm vào một thẻ để xem phân tích chi tiết.
      </p>
      {usedCurrencies.length > 0 ? (
        <div className="fx-panel">
          <span className="field-label">Tỷ giá quy đổi (1 USD = ?)</span>
          <div className="fx-rows">
            {usedCurrencies.map((c) => (
              <div key={c} className="fx-row">
                <span className="mono">{c}</span>
                <input type="number" step="0.0001" className="input mono" value={fxRates[c] ?? ""} onChange={(e) => onFxRatesChange({ ...fxRates, [c]: Number(e.target.value) || 0 })} />
              </div>
            ))}
          </div>
          <span className="field-hint">Tỷ giá không tự cập nhật — chỉnh tay theo tỷ giá hiện tại khi cần.</span>
        </div>
      ) : null}
      <div className="account-form">
        <div className="grid-3">
          <Field label="Tên tài khoản">
            <input className="input" value={form.name} onChange={(e) => setF("name")(e.target.value)} placeholder="VD: Forex H3, US Stock, VN Stock..." />
          </Field>
          <Field label="Broker">
            <input className="input" value={form.broker} onChange={(e) => setF("broker")(e.target.value)} placeholder="VD: IC Markets, SSI, VPS..." />
          </Field>
          <Field label="Đơn vị tiền tệ">
            <input className="input" list="currency-options" value={form.currency} onChange={(e) => setF("currency")(e.target.value)} placeholder="USD" />
            <datalist id="currency-options">{CURRENCIES.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Vốn ban đầu">
            <MoneyInput value={form.initialBalance} onChange={setF("initialBalance")} placeholder="0" />
          </Field>
          <Field label="Thuộc nhóm (tùy chọn)">
            <IdSelect value={form.parentId} onChange={setF("parentId")} items={accounts.filter((a) => a.id !== form.id)} placeholder="Không thuộc nhóm nào" />
          </Field>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="form-actions" style={{ marginTop: 4 }}>
          {form.id ? <button type="button" className="btn btn-ghost" onClick={() => setForm(blank)}>Hủy sửa</button> : null}
          <button type="button" className="btn btn-primary" onClick={submit}>{form.id ? "Cập nhật tài khoản" : "Thêm tài khoản"}</button>
        </div>
      </div>
      {pendingDelete ? (
        <div className="risk-alert-banner" style={{ marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div className="risk-alert-body" style={{ flex: 1, minWidth: 260 }}>
            <span className="risk-alert-title">Tài khoản "{pendingDelete.account.name}" đang có {pendingDelete.count} lệnh</span>
            <p className="risk-alert-line">Chọn tài khoản để chuyển các lệnh này sang trước khi xóa, nếu không chúng sẽ mất liên kết và biến mất khỏi mọi thống kê theo tài khoản.</p>
          </div>
          <select className="input" style={{ maxWidth: 220 }} value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>
            <option value="">— Xóa luôn, không chuyển —</option>
            {accounts.filter((a) => a.id !== pendingDelete.account.id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => { setPendingDelete(null); setMoveTarget(""); }}>Hủy</button>
            <DangerConfirmButton
              label={moveTarget ? "Chuyển lệnh rồi xóa" : "Vẫn xóa (bỏ liên kết)"}
              confirmLabel="Bấm lần nữa để xác nhận"
              onConfirm={confirmDeleteWithMove} />
          </div>
        </div>
      ) : null}
      <div className="account-card-grid" style={{ marginTop: 16 }}>
        {accounts.length === 0 ? <p className="empty-note">Chưa có tài khoản nào.</p> : null}
        {roots.map((a) => renderGroup(a))}
      </div>
    </div>
  );
}

export function CashFlowList({ accounts, ledger, onChange }) {
  const [form, setForm] = useState(emptyFlow());
  const [error, setError] = useState("");
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "—";

  const submit = () => {
    if (!form.accountId) { setError(form.type === "transfer" ? "Chọn tài khoản nguồn." : "Chọn tài khoản."); return; }
    if (form.type === "transfer" && !form.toAccountId) { setError("Chọn tài khoản đích để chuyển vốn."); return; }
    if (form.type === "transfer" && form.toAccountId === form.accountId) { setError("Tài khoản nguồn và đích phải khác nhau."); return; }
    if (!form.amount || Number(form.amount) <= 0) { setError("Nhập số tiền hợp lệ."); return; }
    setError("");
    onChange([...ledger, { ...form, id: uid(), amount: Number(form.amount) }]);
    setForm(emptyFlow(form.date));
  };
  const remove = (id) => onChange(ledger.filter((e) => e.id !== id));
  const sorted = [...ledger].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (accounts.length === 0) {
    return <p className="empty-note">Thêm tài khoản ở tab "Tài khoản" trước, rồi quay lại đây để ghi nạp/rút/chuyển vốn.</p>;
  }
  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>Ghi lại mỗi lần nạp / rút hoặc luân chuyển vốn giữa các tài khoản.</p>
      <div className="account-form">
        <Field label="Loại giao dịch">
          <div className="seg">
            {FLOW_TYPES.map((f) => (
              <button key={f.id} type="button" className={`seg-btn ${form.type === f.id ? "seg-active" : ""}`} onClick={() => setF("type")(f.id)}>{f.label}</button>
            ))}
          </div>
        </Field>
        <div className="grid-3">
          <Field label={form.type === "transfer" ? "Từ tài khoản" : "Tài khoản"}>
            <IdSelect value={form.accountId} onChange={setF("accountId")} items={accounts} placeholder="Chọn tài khoản" />
          </Field>
          {form.type === "transfer" ? (
            <Field label="Đến tài khoản">
              <IdSelect value={form.toAccountId} onChange={setF("toAccountId")} items={accounts.filter((a) => a.id !== form.accountId)} placeholder="Chọn tài khoản đích" />
            </Field>
          ) : null}
          <Field label="Số tiền">
            <MoneyInput value={form.amount} onChange={setF("amount")} placeholder="0" />
          </Field>
          <Field label="Ngày">
            <input type="date" className="input" value={form.date} onChange={(e) => setF("date")(e.target.value)} />
          </Field>
        </div>
        <Field label="Ghi chú"><input className="input" value={form.note} onChange={(e) => setF("note")(e.target.value)} placeholder="Tùy chọn..." /></Field>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="form-actions" style={{ marginTop: 4 }}>
          <button type="button" className="btn btn-primary" onClick={submit}>Thêm dòng vốn</button>
        </div>
      </div>
      <div className="resource-list" style={{ marginTop: 16 }}>
        {sorted.length === 0 ? <p className="empty-note">Chưa có dòng nạp/rút/chuyển nào.</p> : null}
        {sorted.map((e) => (
          <div key={e.id} className="resource-item">
            <span>
              <span className="mono" style={{ color: "var(--text-dim)", marginRight: 8 }}>{e.date || "—"}</span>
              {e.type === "deposit" && <>Nạp <strong className="text-win">{fmt(e.amount)}</strong> vào {accountName(e.accountId)}</>}
              {e.type === "withdraw" && <>Rút <strong className="text-loss">{fmt(e.amount)}</strong> từ {accountName(e.accountId)}</>}
              {e.type === "transfer" && <>Chuyển <strong>{fmt(e.amount)}</strong> từ {accountName(e.accountId)} → {accountName(e.toAccountId)}</>}
              {e.note ? <span style={{ color: "var(--text-dim)" }}> · {e.note}</span> : null}
            </span>
            <ConfirmButton onConfirm={() => remove(e.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccountDetail({ account, ledger, trades, onBack, onEdit, onDelete }) {
  const [granularity, setGranularity] = useState("month");
  const accountTrades = trades.filter((t) => t.account === account.name);
  const closedAccountTrades = closedOf(accountTrades);
  const m = computeAdvancedMetrics(closedAccountTrades);
  const deposits = ledger.filter((e) => e.accountId === account.id && e.type === "deposit").reduce((s, e) => s + (Number(e.amount) || 0), 0)
    + ledger.filter((e) => e.type === "transfer" && e.toAccountId === account.id).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const withdrawals = ledger.filter((e) => e.accountId === account.id && e.type === "withdraw").reduce((s, e) => s + (Number(e.amount) || 0), 0)
    + ledger.filter((e) => e.type === "transfer" && e.accountId === account.id).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const tradingPnl = closedAccountTrades.reduce((s, x) => s + x.r.profit, 0);
  const currentBalance = accountBalance(account, ledger, trades);
  const initial = Number(account.initialBalance) || 0;
  const growthPct = initial !== 0 ? ((currentBalance - initial) / Math.abs(initial)) * 100 : null;
  const winrate = closedAccountTrades.length ? (closedAccountTrades.filter((x) => x.r.outcome === "win").length / closedAccountTrades.length) * 100 : 0;
  const openRisk = accountOpenRisk(account, ledger, trades);

  const curve = buildBalanceCurve(account, ledger, trades);
  const growthSeries = buildGrowthSeries(curve, initial, granularity);
  const accountLedger = ledger.filter((e) => e.accountId === account.id || e.toAccountId === account.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div>
      <div className="detail-header">
        <button type="button" className="btn btn-ghost" onClick={onBack}><ChevronLeft size={14} /> Tất cả tài khoản</button>
        <h3 style={{ margin: "0 0 0 6px" }}>{account.name}</h3>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => onEdit(account)}>Sửa tài khoản</button>
          <DangerConfirmButton label="Xóa tài khoản" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => onDelete(account.id)} />
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <StatCard label="Số dư ban đầu" value={fmtMoney(initial, account.currency)} />
        <StatCard label="Tổng nạp" value={fmtMoney(deposits, account.currency)} tone="win" />
        <StatCard label="Tổng rút" value={fmtMoney(withdrawals, account.currency)} tone="loss" />
        <StatCard label="Trading P&L" value={fmtMoney(tradingPnl, account.currency)} tone={tradingPnl >= 0 ? "win" : "loss"} />
        <StatCard label="Số dư hiện tại" value={fmtMoney(currentBalance, account.currency)} tone={currentBalance >= initial ? "win" : "loss"} />
        <StatCard label="Tăng trưởng" value={growthPct === null ? "—" : `${growthPct.toFixed(1)}%`} tone={growthPct === null ? "" : growthPct >= 0 ? "win" : "loss"} />
      </div>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <StatCard label="Tổng số lệnh" value={accountTrades.length} />
        <StatCard label="Winrate" value={`${winrate.toFixed(1)}%`} tone={winrate >= 50 ? "win" : "loss"} />
        <StatCard label="Hệ số lợi nhuận" value={Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "∞"} tone={m.profitFactor >= 1 ? "win" : "loss"} />
        <StatCard label="Max Drawdown (giao dịch)" value={fmtMoney(m.maxDD, account.currency)} tone="loss" />
        <StatCard label="% Risk đang mở" value={openRisk.count === 0 ? "—" : `${openRisk.pct.toFixed(2)}%`} tone={openRisk.pct >= 5 ? "loss" : ""} />
      </div>
      {openRisk.count > 0 ? <p className="field-hint" style={{ marginTop: -12, marginBottom: 16 }}>{openRisk.count} lệnh đang mở đang giữ tổng cộng {openRisk.pct.toFixed(2)}% tài khoản này.</p> : null}

      <ChartCard title="Equity Curve theo Số dư thực" height={240}>
        <ResponsiveContainer>
          <LineChart data={curve}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} minTickGap={40} padding={{ left: 20, right: 20 }} />
            <YAxis tick={{ fontSize: 10, fill: MUTED }} width={54} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
            <Line type="monotone" dataKey="balance" stroke={ACCENT} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Tăng trưởng (%)" height={240}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <div className="seg" style={{ width: "auto" }}>
            {[["day", "Ngày"], ["week", "Tuần"], ["month", "Tháng"]].map(([id, label]) => (
              <button key={id} type="button" className={`seg-btn ${granularity === id ? "seg-active" : ""}`} onClick={() => setGranularity(id)}>{label}</button>
            ))}
          </div>
        </div>
        {growthSeries.length === 0 ? <p className="empty-note">Chưa có đủ dữ liệu để vẽ.</p> : (
          <ResponsiveContainer>
            <BarChart data={growthSeries}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: MUTED }} minTickGap={30} />
              <YAxis tick={{ fontSize: 10, fill: MUTED }} width={50} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={tooltipCursor} />
              <Bar dataKey="growth">{growthSeries.map((d, i) => <Cell key={i} fill={d.growth >= 0 ? WIN : LOSS} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <h3 className="block-title">Nạp / Rút tiền</h3>
      <div className="resource-list">
        {accountLedger.length === 0 ? <p className="empty-note">Chưa có giao dịch nạp/rút nào.</p> : null}
        {accountLedger.map((e) => (
          <div key={e.id} className="resource-item">
            <span>
              <span className="mono" style={{ color: "var(--text-dim)", marginRight: 8 }}>{e.date || "—"}</span>
              {e.type === "deposit" && <>Nạp <strong className="text-win">{fmt(e.amount)}</strong></>}
              {e.type === "withdraw" && <>Rút <strong className="text-loss">{fmt(e.amount)}</strong></>}
              {e.type === "transfer" && e.accountId === account.id && <>Chuyển ra <strong className="text-loss">{fmt(e.amount)}</strong></>}
              {e.type === "transfer" && e.toAccountId === account.id && <>Chuyển vào <strong className="text-win">{fmt(e.amount)}</strong></>}
              {e.note ? <span style={{ color: "var(--text-dim)" }}> · {e.note}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccountsSection({ accounts, ledger, trades, onAccountsChange, onMoveTrades, onLedgerChange, fxRates, onFxRatesChange }) {
  const [tab, setTab] = useState("list");
  const [viewingId, setViewingId] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const viewing = accounts.find((a) => a.id === viewingId);

  if (viewing) {
    return (
      <AccountDetail
        account={viewing}
        ledger={ledger}
        trades={trades}
        onBack={() => setViewingId("")}
        onEdit={(a) => { setEditTarget(a); setViewingId(""); setTab("list"); }}
        onDelete={(id) => {
          onAccountsChange(accounts.filter((a) => a.id !== id).map((a) => (a.parentId === id ? { ...a, parentId: "" } : a)));
          setViewingId("");
        }}
      />
    );
  }

  return (
    <div>
      <div className="subtabs">
        <button className={`subtab ${tab === "list" ? "subtab-active" : ""}`} onClick={() => setTab("list")}>Tài khoản</button>
        <button className={`subtab ${tab === "flow" ? "subtab-active" : ""}`} onClick={() => setTab("flow")}>Nạp / Rút / Chuyển vốn</button>
      </div>
      {tab === "list" ? <AccountsList accounts={accounts} ledger={ledger} trades={trades} onChange={onAccountsChange} onMoveTrades={onMoveTrades} fxRates={fxRates} onFxRatesChange={onFxRatesChange}
        onView={setViewingId} editTarget={editTarget} onEditConsumed={() => setEditTarget(null)} />
        : <CashFlowList accounts={accounts} ledger={ledger} onChange={onLedgerChange} />}
    </div>
  );
}
