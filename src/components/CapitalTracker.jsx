import { useState, useEffect } from "react";
import { Trash2, Pencil, LineChart as LineChartIcon } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ACCENT, CAPITAL_FLOW_TYPES, CURRENCIES, GRID, MUTED, tooltipItemStyle, tooltipLabelStyle, tooltipStyle } from "../lib/constants.js";
import { ChartCard, ConfirmButton, Field, MoneyInput, StatCard } from "./ui.jsx";
import { buildCapitalIndexCurve, buildTWRCurve, emptyCapitalEntry, emptyCapitalFlow, fmtMoney, uid } from "../lib/helpers.js";

export function EquityIndexPage({ resources, ledger, trades }) {
  const [accountId, setAccountId] = useState(resources.accounts[0]?.id || "");
  useEffect(() => {
    if (!accountId && resources.accounts.length) setAccountId(resources.accounts[0].id);
  }, [resources.accounts]);

  if (resources.accounts.length === 0) {
    return (
      <div className="empty-state">
        <LineChartIcon size={28} color="var(--text-dim)" />
        <p>Chưa có tài khoản nào — thêm tài khoản ở tab Tài khoản trước.</p>
      </div>
    );
  }
  const account = resources.accounts.find((a) => a.id === accountId) || resources.accounts[0];
  const curve = buildTWRCurve(account, ledger, trades);
  const currentIndex = curve[curve.length - 1].index;
  const totalReturnPct = currentIndex - 100;
  let peak = 100, maxDD = 0;
  curve.forEach((p) => { if (p.index > peak) peak = p.index; const dd = peak - p.index; if (dd > maxDD) maxDD = dd; });
  const ath = Math.max(...curve.map((p) => p.index));

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Đường cong vốn quy về mốc 100 lúc bắt đầu — chỉ phản ánh hiệu suất giao dịch thực tế, nạp/rút/chuyển vốn không làm đường cong nhảy vọt hay sụt giảm đột ngột (dùng phương pháp Time-Weighted Return, chuẩn của ngành quản lý quỹ).
      </p>
      <div className="scope-bar">
        <span className="field-label" style={{ marginRight: 4 }}>Tài khoản:</span>
        <select className="input" style={{ maxWidth: 240 }} value={account.id} onChange={(e) => setAccountId(e.target.value)}>
          {resources.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div className="stat-grid">
        <StatCard label="Chỉ số hiện tại" value={currentIndex.toFixed(2)} tone={currentIndex >= 100 ? "win" : "loss"} />
        <StatCard label="Tổng lợi nhuận (chỉ số)" value={`${totalReturnPct > 0 ? "+" : ""}${totalReturnPct.toFixed(2)}%`} tone={totalReturnPct >= 0 ? "win" : "loss"} />
        <StatCard label="Đỉnh cao nhất" value={ath.toFixed(2)} />
        <StatCard label="Max Drawdown (chỉ số)" value={`${maxDD.toFixed(2)} điểm`} tone="loss" />
      </div>

      <ChartCard title={`Đường cong vốn — ${account.name}`} subtitle="Mốc 100 = lúc bắt đầu" height={320}>
        <ResponsiveContainer>
          <LineChart data={curve}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} minTickGap={40} padding={{ left: 20, right: 20 }} />
            <YAxis tick={{ fontSize: 10, fill: MUTED }} width={50} domain={["auto", "auto"]} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
            <Line type="monotone" dataKey="index" stroke={ACCENT} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

export function CapitalTrackerPage({ accounts, entries, flows, onAccountsChange, onEntriesChange, onFlowsChange }) {
  const [selectedId, setSelectedId] = useState(accounts[0]?.id || "");
  const [tab, setTab] = useState("curve");

  useEffect(() => {
    if (!selectedId && accounts.length) setSelectedId(accounts[0].id);
  }, [accounts]);

  const [newAccount, setNewAccount] = useState({ name: "", currency: "USD", reserveCapital: "", tradeCapital: "" });
  const [accountError, setAccountError] = useState("");
  const setNA = (k) => (v) => setNewAccount((p) => ({ ...p, [k]: v }));

  const addAccount = () => {
    if (!newAccount.name.trim()) { setAccountError("Nhập tên tài khoản."); return; }
    if (newAccount.reserveCapital === "" || newAccount.tradeCapital === "") { setAccountError("Nhập đủ Vốn dự phòng và Vốn trade ban đầu."); return; }
    setAccountError("");
    const acc = { id: uid(), name: newAccount.name.trim(), currency: newAccount.currency || "USD" };
    const today = new Date().toISOString().slice(0, 10);
    const firstEntry = { id: uid(), accountId: acc.id, date: today, reserveCapital: newAccount.reserveCapital, tradeCapital: newAccount.tradeCapital, note: "Mốc khởi tạo tài khoản" };
    onAccountsChange([...accounts, acc]);
    onEntriesChange([...entries, firstEntry]);
    setNewAccount({ name: "", currency: "USD", reserveCapital: "", tradeCapital: "" });
    setSelectedId(acc.id);
  };
  const removeAccount = (id) => {
    onAccountsChange(accounts.filter((a) => a.id !== id));
    onEntriesChange(entries.filter((e) => e.accountId !== id));
    onFlowsChange(flows.filter((f) => f.accountId !== id));
    if (selectedId === id) setSelectedId("");
  };

  const selectedAccount = accounts.find((a) => a.id === selectedId);
  const accountEntries = entries.filter((e) => e.accountId === selectedId).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const accountFlows = flows.filter((f) => f.accountId === selectedId).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const lastEntry = accountEntries[accountEntries.length - 1] || null;

  const [form, setForm] = useState(emptyCapitalEntry("", ""));
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const [entryError, setEntryError] = useState("");
  const startNewEntry = () => setForm(emptyCapitalEntry("", lastEntry ? lastEntry.reserveCapital : ""));

  const saveEntry = () => {
    if (!form.date) { setEntryError("Chọn ngày ghi nhận."); return; }
    if (form.reserveCapital === "" || form.tradeCapital === "") { setEntryError("Nhập đủ Vốn dự phòng và Vốn trade."); return; }
    setEntryError("");
    const payload = { ...form, id: form.id || uid(), accountId: selectedId };
    const exists = entries.some((e) => e.id === payload.id);
    onEntriesChange(exists ? entries.map((e) => (e.id === payload.id ? payload : e)) : [...entries, payload]);
    startNewEntry();
  };
  const removeEntry = (id) => {
    onEntriesChange(entries.filter((e) => e.id !== id));
    if (form.id === id) startNewEntry();
  };

  const [flowForm, setFlowForm] = useState(emptyCapitalFlow());
  const setFF = (k) => (v) => setFlowForm((p) => ({ ...p, [k]: v }));
  const [flowError, setFlowError] = useState("");
  const saveFlow = () => {
    if (!flowForm.date) { setFlowError("Chọn ngày."); return; }
    if (!flowForm.amount || Number(flowForm.amount) <= 0) { setFlowError("Nhập số tiền hợp lệ."); return; }
    setFlowError("");
    const payload = { ...flowForm, id: flowForm.id || uid(), accountId: selectedId };
    const exists = flows.some((f) => f.id === payload.id);
    onFlowsChange(exists ? flows.map((f) => (f.id === payload.id ? payload : f)) : [...flows, payload]);
    setFlowForm(emptyCapitalFlow(flowForm.date));
  };
  const removeFlow = (id) => onFlowsChange(flows.filter((f) => f.id !== id));

  const curve = buildCapitalIndexCurve(accountEntries, accountFlows);
  const currentIndex = curve.length ? curve[curve.length - 1].index : null;
  const totalReturnPct = currentIndex === null ? null : currentIndex - 100;
  let peak = 100, maxDD = 0;
  curve.forEach((p) => { if (p.index > peak) peak = p.index; const dd = peak - p.index; if (dd > maxDD) maxDD = dd; });

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Theo dõi tổng vốn thực (vốn dự phòng ngoài sàn + vốn đang để trade) — hoàn toàn thủ công, tách biệt khỏi tab Tài khoản (không ảnh hưởng số liệu P&L giao dịch). Đường cong quy về mốc 100 giống tab "Đường cong vốn" — nạp/rút tiền không làm đường cong nhảy vọt hay sụt giảm, chỉ có thay đổi thực tế (do trade) mới phản ánh vào chỉ số.
      </p>

      <div className="account-form">
        <h4 className="detail-col-title" style={{ marginTop: 0 }}>Thêm tài khoản vốn thực mới</h4>
        <div className="grid-3">
          <Field label="Tên tài khoản">
            <input className="input" value={newAccount.name} onChange={(e) => setNA("name")(e.target.value)} placeholder="VD: Forex H3, VN Stock..." />
          </Field>
          <Field label="Đơn vị tiền tệ">
            <input className="input" list="capital-currency-options" value={newAccount.currency} onChange={(e) => setNA("currency")(e.target.value)} placeholder="USD" />
            <datalist id="capital-currency-options">{CURRENCIES.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Vốn dự phòng ban đầu">
            <MoneyInput value={newAccount.reserveCapital} onChange={setNA("reserveCapital")} placeholder="8000" />
          </Field>
          <Field label="Vốn trade ban đầu">
            <MoneyInput value={newAccount.tradeCapital} onChange={setNA("tradeCapital")} placeholder="2000" />
          </Field>
        </div>
        {accountError ? <p className="error-text">{accountError}</p> : null}
        <div className="form-actions" style={{ marginTop: 4 }}>
          <button type="button" className="btn btn-primary" onClick={addAccount}>Thêm tài khoản</button>
        </div>
      </div>

      {accounts.length > 0 ? (
        <div className="scope-bar">
          <span className="field-label" style={{ marginRight: 4 }}>Tài khoản vốn thực:</span>
          <select className="input" style={{ maxWidth: 240 }} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency || "USD"})</option>)}
          </select>
          {selectedAccount ? <ConfirmButton onConfirm={() => removeAccount(selectedAccount.id)} className="btn btn-ghost" icon={Trash2} label="Xóa tài khoản này" /> : null}
        </div>
      ) : null}

      {!selectedAccount ? (
        <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có tài khoản vốn thực nào — thêm ở trên để bắt đầu.</p>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Chỉ số hiện tại" value={currentIndex === null ? "—" : currentIndex.toFixed(2)} tone={currentIndex !== null && currentIndex >= 100 ? "win" : "loss"} />
            <StatCard label="Tổng lợi nhuận (chỉ số)" value={totalReturnPct === null ? "—" : `${totalReturnPct > 0 ? "+" : ""}${totalReturnPct.toFixed(2)}%`} tone={totalReturnPct === null ? "" : totalReturnPct >= 0 ? "win" : "loss"} />
            <StatCard label="Vốn dự phòng hiện tại" value={lastEntry ? fmtMoney(Number(lastEntry.reserveCapital), selectedAccount.currency) : "—"} />
            <StatCard label="Vốn trade hiện tại" value={lastEntry ? fmtMoney(Number(lastEntry.tradeCapital), selectedAccount.currency) : "—"} />
            <StatCard label="Tổng vốn thực hiện tại" value={lastEntry ? fmtMoney(Number(lastEntry.reserveCapital) + Number(lastEntry.tradeCapital), selectedAccount.currency) : "—"} />
            <StatCard label="Max Drawdown (chỉ số)" value={`${maxDD.toFixed(2)} điểm`} tone="loss" />
          </div>

          <ChartCard title={`Đường cong vốn thực — ${selectedAccount.name}`} subtitle="Mốc 100 = lần ghi nhận đầu tiên" height={320}>
            {curve.length === 0 ? <p className="empty-note">Chưa có mốc ghi nhận nào.</p> : (
              <ResponsiveContainer>
                <LineChart data={curve}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} minTickGap={40} padding={{ left: 20, right: 20 }} />
                  <YAxis tick={{ fontSize: 10, fill: MUTED }} width={54} domain={["auto", "auto"]} tickCount={8} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                  <Line type="monotone" dataKey="index" stroke={ACCENT} strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <div className="subtabs">
            <button className={`subtab ${tab === "curve" ? "subtab-active" : ""}`} onClick={() => setTab("curve")}>Mốc ghi nhận (cuối tuần)</button>
            <button className={`subtab ${tab === "flow" ? "subtab-active" : ""}`} onClick={() => setTab("flow")}>Nạp / Rút / Cân tiền</button>
          </div>

          {tab === "curve" ? (
            <div>
              <h3 className="block-title" style={{ marginTop: 0 }}>{form.id ? "Sửa mốc ghi nhận" : "Thêm mốc ghi nhận mới"}</h3>
              <div className="account-form">
                <div className="grid-3">
                  <Field label="Ngày ghi nhận">
                    <input type="date" className="input" value={form.date} onChange={(e) => setF("date")(e.target.value)} />
                  </Field>
                  <Field label="Vốn dự phòng (ngoài sàn)">
                    <MoneyInput value={form.reserveCapital} onChange={setF("reserveCapital")} placeholder="8000" />
                  </Field>
                  <Field label="Vốn trade (trên sàn)">
                    <MoneyInput value={form.tradeCapital} onChange={setF("tradeCapital")} placeholder="2100" />
                  </Field>
                </div>
                <Field label="Ghi chú"><input className="input" value={form.note} onChange={(e) => setF("note")(e.target.value)} placeholder="Tùy chọn..." /></Field>
                {entryError ? <p className="error-text">{entryError}</p> : null}
                <div className="form-actions" style={{ marginTop: 4 }}>
                  {form.id ? <button type="button" className="btn btn-ghost" onClick={startNewEntry}>Hủy sửa</button> : null}
                  <button type="button" className="btn btn-primary" onClick={saveEntry}>{form.id ? "Cập nhật mốc" : "Lưu mốc ghi nhận"}</button>
                </div>
              </div>

              <div className="table-wrap" style={{ marginTop: 16 }}>
                {accountEntries.length === 0 ? <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có mốc ghi nhận nào.</p> : (
                  <table className="table">
                    <thead><tr><th>Ngày</th><th>Vốn dự phòng</th><th>Vốn trade</th><th>Tổng</th><th>Chỉ số</th><th>Ghi chú</th><th></th></tr></thead>
                    <tbody>
                      {[...accountEntries].reverse().map((e) => {
                        const pt = curve.find((c) => c.date === e.date);
                        return (
                          <tr key={e.id} onClick={() => setForm(e)}>
                            <td className="mono">{e.date}</td>
                            <td className="mono">{fmtMoney(Number(e.reserveCapital), selectedAccount.currency)}</td>
                            <td className="mono">{fmtMoney(Number(e.tradeCapital), selectedAccount.currency)}</td>
                            <td className="mono" style={{ fontWeight: 700 }}>{fmtMoney((Number(e.reserveCapital) || 0) + (Number(e.tradeCapital) || 0), selectedAccount.currency)}</td>
                            <td className="mono">{pt ? pt.index.toFixed(2) : "—"}</td>
                            <td style={{ color: "var(--text-dim)", fontSize: 12.5 }}>{e.note || "—"}</td>
                            <td onClick={(ev) => ev.stopPropagation()}>
                              <div style={{ display: "flex", gap: 2 }}>
                                <button type="button" className="row-btn" onClick={() => setForm(e)}><Pencil size={13} /></button>
                                <ConfirmButton onConfirm={() => removeEntry(e.id)} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <div>
              <p className="field-hint" style={{ marginBottom: 12 }}>Ghi lại nạp/rút tiền hoặc cân đối vốn giữa dự phòng ↔ trade. Các dòng này KHÔNG tính vào đường cong chỉ số — chỉ dùng để loại trừ ảnh hưởng của việc nạp/rút khỏi kết quả trade thực.</p>
              <div className="account-form">
                <Field label="Loại">
                  <div className="seg">
                    {CAPITAL_FLOW_TYPES.map((f) => (
                      <button key={f.id} type="button" className={`seg-btn ${flowForm.type === f.id ? "seg-active" : ""}`} onClick={() => setFF("type")(f.id)}>{f.label}</button>
                    ))}
                  </div>
                </Field>
                <div className="grid-3">
                  {flowForm.type === "rebalance" ? (
                    <Field label="Hướng chuyển">
                      <select className="input" value={flowForm.direction} onChange={(e) => setFF("direction")(e.target.value)}>
                        <option value="reserveToTrade">Dự phòng → Trade</option>
                        <option value="tradeToReserve">Trade → Dự phòng</option>
                      </select>
                    </Field>
                  ) : null}
                  <Field label="Số tiền">
                    <MoneyInput value={flowForm.amount} onChange={setFF("amount")} placeholder="0" />
                  </Field>
                  <Field label="Ngày">
                    <input type="date" className="input" value={flowForm.date} onChange={(e) => setFF("date")(e.target.value)} />
                  </Field>
                </div>
                <Field label="Ghi chú"><input className="input" value={flowForm.note} onChange={(e) => setFF("note")(e.target.value)} placeholder="Tùy chọn..." /></Field>
                {flowError ? <p className="error-text">{flowError}</p> : null}
                <div className="form-actions" style={{ marginTop: 4 }}>
                  <button type="button" className="btn btn-primary" onClick={saveFlow}>Lưu dòng vốn</button>
                </div>
              </div>
              <div className="resource-list" style={{ marginTop: 16 }}>
                {accountFlows.length === 0 ? <p className="empty-note">Chưa có dòng nạp/rút/cân tiền nào.</p> : null}
                {accountFlows.map((f) => (
                  <div key={f.id} className="resource-item">
                    <span>
                      <span className="mono" style={{ color: "var(--text-dim)", marginRight: 8 }}>{f.date}</span>
                      {f.type === "deposit" && <>Nạp <strong className="text-win">{fmtMoney(Number(f.amount), selectedAccount.currency)}</strong></>}
                      {f.type === "withdraw" && <>Rút <strong className="text-loss">{fmtMoney(Number(f.amount), selectedAccount.currency)}</strong></>}
                      {f.type === "rebalance" && <>Cân tiền <strong>{fmtMoney(Number(f.amount), selectedAccount.currency)}</strong> ({f.direction === "reserveToTrade" ? "Dự phòng → Trade" : "Trade → Dự phòng"})</>}
                      {f.note ? <span style={{ color: "var(--text-dim)" }}> · {f.note}</span> : null}
                    </span>
                    <ConfirmButton onConfirm={() => removeFlow(f.id)} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
