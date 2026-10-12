import { useEffect, useMemo, useState } from "react";
import { Globe2, Plus, Trash2, Settings2 } from "lucide-react";
import { DashboardFilters } from "./Dashboard.jsx";
import { ConfirmButton, Field } from "./ui.jsx";
import { dateKey, expandAccountFilter, fmtR, inRange } from "../lib/helpers.js";
import {
  activeConditions, condScore, emptyCondition, emptyRegime, marketRegimesOf, REGIME_MIN_SAMPLE, REGIME_NONE,
  regimeForAccount, regimeStats, sameDayCond, tradeRegime,
} from "../lib/marketRegime.js";

const fmtPct = (v) => (v === null || v === undefined ? "—" : `${v.toFixed(1)}%`);
const toneR = (v) => (v > 0 ? "text-win" : v < 0 ? "text-loss" : "");

// Ô ghi điều kiện thị trường chung trong form lệnh (mục 1). Mỗi điều kiện bấm Đạt / Không;
// bấm lại nút đang sáng là bỏ chọn. Chưa bấm gì = chưa ghi, khác với "không đạt".
export function MarketCondPicker({ t, setT, resources, trades }) {
  const regimes = useMemo(() => marketRegimesOf(resources), [resources]);
  const auto = regimeForAccount(regimes, t.account, resources.accounts);
  const regime = tradeRegime(t, regimes, resources.accounts);
  const picked = (t.marketCond && t.marketCond.regimeId) || "";
  const checks = regime && t.marketCond && t.marketCond.regimeId === regime.id ? t.marketCond.checks || {} : {};
  const score = regime ? condScore(t, regime) : null;
  const sameDay = regime && !score.answered ? sameDayCond(trades, t, regime) : null;

  const pickRegime = (id) => setT((prev) => {
    if (!id) return { ...prev, marketCond: null };
    const keep = prev.marketCond && prev.marketCond.regimeId === id ? prev.marketCond.checks : {};
    return { ...prev, marketCond: { regimeId: id, checks: keep || {} } };
  });
  const setCheck = (condId, value) => setT((prev) => {
    const same = prev.marketCond && prev.marketCond.regimeId === regime.id;
    const next = { ...(same ? prev.marketCond.checks || {} : {}) };
    if (next[condId] === value) delete next[condId]; else next[condId] = value;
    return { ...prev, marketCond: { regimeId: regime.id, checks: next } };
  });

  return (
    <div className="regime-picker">
      <div className="regime-picker-head">
        <span className="field-label">Thị trường chung</span>
        <select className="input regime-select" value={picked} onChange={(e) => pickRegime(e.target.value)}>
          <option value="">{auto ? `Theo tài khoản — ${auto.name}` : "Theo tài khoản — không có chỉ số"}</option>
          {regimes.map((r) => <option key={r.id} value={r.id}>{r.name || "(chưa đặt tên)"}</option>)}
          <option value={REGIME_NONE}>Không áp dụng</option>
        </select>
        {score && score.answered ? <span className={`regime-score ${score.met === score.total ? "regime-score-full" : ""}`}>
          Đạt {score.met}/{score.total}{score.answered < score.total ? ` · còn ${score.total - score.answered} chưa ghi` : ""}
        </span> : null}
      </div>
      {!regime ? (
        <p className="field-hint">
          {picked === REGIME_NONE ? "Lệnh này không tính vào thống kê thị trường chung." : "Tài khoản này chưa gắn chỉ số chung (VD hàng hoá) — bỏ qua được. Gắn ở Phân tích → Thị trường chung."}
        </p>
      ) : (
        <>
          <div className="regime-conds">
            {activeConditions(regime).map((c) => (
              <div key={c.id} className="regime-cond">
                <span className="regime-cond-label">{c.label}</span>
                <div className="seg seg-sm">
                  <button type="button" className={`seg-btn ${checks[c.id] === true ? "seg-active-win" : ""}`} onClick={() => setCheck(c.id, true)}>Đạt</button>
                  <button type="button" className={`seg-btn ${checks[c.id] === false ? "seg-active-loss" : ""}`} onClick={() => setCheck(c.id, false)}>Không</button>
                </div>
              </div>
            ))}
          </div>
          {sameDay ? (
            <button type="button" className="btn btn-ghost btn-xs regime-copy"
              onClick={() => setT((prev) => ({ ...prev, marketCond: { regimeId: regime.id, checks: { ...sameDay.marketCond.checks } } }))}>
              Chép từ lệnh {sameDay.symbol || "khác"} cùng ngày ({condScore(sameDay, regime).met}/{condScore(sameDay, regime).total})
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

// Ô chữ chỉ lưu khi rời ô / Enter — lưu theo từng phím là mỗi chữ một lần ghi lên Supabase.
function CommitInput({ value, onCommit, ...rest }) {
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { setDraft(value || ""); }, [value]);
  const commit = () => { if (draft.trim() !== (value || "").trim()) onCommit(draft.trim()); };
  return (
    <input className="input" {...rest} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
}

function RegimeSettings({ regimes, accounts, onChange }) {
  const update = (id, patch) => onChange(regimes.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const owner = (accId, selfId) => regimes.find((r) => r.id !== selfId && (r.accountIds || []).includes(accId));
  const toggleAccount = (r, accId) => {
    const has = (r.accountIds || []).includes(accId);
    // Một tài khoản chỉ thuộc một chỉ số — gắn vào chỉ số này thì gỡ khỏi chỉ số kia.
    onChange(regimes.map((x) => {
      if (x.id === r.id) return { ...x, accountIds: has ? x.accountIds.filter((a) => a !== accId) : [...(x.accountIds || []), accId] };
      return has ? x : { ...x, accountIds: (x.accountIds || []).filter((a) => a !== accId) };
    }));
  };
  const list = (accounts || []).filter((a) => a && a.name);

  return (
    <div className="regime-settings">
      <p className="field-hint">
        Mỗi chỉ số là "nhiệt kế" của một loại thị trường. Gắn tài khoản vào chỉ số thì form lệnh của tài khoản đó tự hiện các điều kiện để bấm.
        Gắn nhóm cha là cả nhóm dùng chung. Tài khoản hàng hoá / forex không có chỉ số chung thì để trống.
        Đổi chữ điều kiện không mất dữ liệu cũ; xoá điều kiện thì các lệnh đã ghi điều kiện đó không còn được đếm nữa.
      </p>
      {regimes.map((r) => (
        <div key={r.id} className="account-form regime-card">
          <div className="regime-card-head">
            <Field label="Tên chỉ số">
              <CommitInput value={r.name} onCommit={(v) => update(r.id, { name: v })} placeholder="VD: S&P 500, VN-Index" />
            </Field>
            <ConfirmButton onConfirm={() => onChange(regimes.filter((x) => x.id !== r.id))} className="btn btn-ghost" icon={Trash2} label="Xoá chỉ số" />
          </div>
          <span className="field-label">Tài khoản dùng chỉ số này</span>
          <div className="regime-accounts">
            {list.length === 0 ? <span className="field-hint">Chưa có tài khoản nào.</span> : list.map((a) => {
              const on = (r.accountIds || []).includes(a.id);
              const other = !on ? owner(a.id, r.id) : null;
              return (
                <button type="button" key={a.id} className={`day-chip ${on ? "day-chip-on" : ""}`} onClick={() => toggleAccount(r, a.id)}
                  title={other ? `Đang gắn với ${other.name} — bấm để chuyển sang đây` : undefined}>
                  {a.name}{other ? <small> · {other.name}</small> : null}
                </button>
              );
            })}
          </div>
          <span className="field-label" style={{ marginTop: 10, display: "block" }}>Điều kiện</span>
          <div className="regime-cond-edit">
            {(r.conditions || []).map((c, i) => (
              <div key={c.id} className="regime-cond-row">
                <span className="mono regime-cond-num">{i + 1}.</span>
                <CommitInput value={c.label} placeholder="VD: Chỉ số trên EMA9"
                  onCommit={(v) => update(r.id, { conditions: r.conditions.map((x) => (x.id === c.id ? { ...x, label: v } : x)) })} />
                <ConfirmButton onConfirm={() => update(r.id, { conditions: r.conditions.filter((x) => x.id !== c.id) })} />
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => update(r.id, { conditions: [...(r.conditions || []), emptyCondition()] })}>
            <Plus size={13} /> Thêm điều kiện
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost" onClick={() => onChange([...regimes, emptyRegime()])}><Plus size={14} /> Thêm chỉ số</button>
    </div>
  );
}

function StatCells({ s }) {
  return (
    <>
      <td className="mono">{s.count}</td>
      <td className="mono">
        <div className="regime-wr">
          <span className="regime-wr-bar" style={{ width: `${s.winRate === null ? 0 : s.winRate}%` }} />
          <span>{fmtPct(s.winRate)}</span>
        </div>
      </td>
      <td className={`mono ${toneR(s.avgR)}`}>{fmtR(s.avgR)}</td>
      <td className={`mono ${toneR(s.totalR)}`}>{s.rCount ? fmtR(s.totalR) : "—"}</td>
    </>
  );
}

export function MarketRegimePage({ trades, resources, onResourcesChange, onOpenTrade }) {
  const regimes = useMemo(() => marketRegimesOf(resources), [resources]);
  const [tab, setTab] = useState(regimes[0] ? regimes[0].id : "settings");
  const [direction, setDirection] = useState("");
  const [scope, setScope] = useState("");
  const [range, setRange] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const regime = regimes.find((r) => r.id === tab) || null;
  useEffect(() => { if (tab !== "settings" && !regime) setTab(regimes[0] ? regimes[0].id : "settings"); }, [tab, regime, regimes]);

  const inScope = useMemo(() => expandAccountFilter(scope, resources.accounts), [resources.accounts, scope]);
  const scoped = useMemo(
    () => trades.filter((t) => (!inScope || inScope.has(t.account)) && inRange(dateKey(t) || t.entryDate, range, rangeFrom, rangeTo)),
    [trades, inScope, range, rangeFrom, rangeTo]
  );
  const st = useMemo(() => (regime ? regimeStats(scoped, regime, resources, { direction }) : null), [scoped, regime, resources, direction]);
  const saveRegimes = (next) => onResourcesChange({ ...resources, marketRegimes: next });

  const tabs = (
    <div className="subtabs">
      {regimes.map((r) => (
        <button key={r.id} type="button" className={`subtab ${tab === r.id ? "subtab-active" : ""}`} onClick={() => setTab(r.id)}>{r.name || "(chưa đặt tên)"}</button>
      ))}
      <button type="button" className={`subtab ${tab === "settings" ? "subtab-active" : ""}`} onClick={() => setTab("settings")}><Settings2 size={13} /> Cài đặt</button>
    </div>
  );

  if (tab === "settings" || !regime) {
    return (
      <div>
        {tabs}
        <RegimeSettings regimes={regimes} accounts={resources.accounts} onChange={saveRegimes} />
      </div>
    );
  }

  const recorded = st.levels.reduce((n, l) => n + l.count, 0);
  const allMet = st.levels[0];
  const small = st.full.count < REGIME_MIN_SAMPLE || st.rest.count < REGIME_MIN_SAMPLE;
  const gapWr = st.full.winRate !== null && st.rest.winRate !== null ? st.full.winRate - st.rest.winRate : null;
  const linked = (regime.accountIds || []).map((id) => (resources.accounts.find((a) => a.id === id) || {}).name).filter(Boolean);

  return (
    <div>
      {tabs}
      <DashboardFilters multi resources={resources} account={scope} onAccount={setScope} range={range} onRange={setRange} rangeFrom={rangeFrom} rangeTo={rangeTo} onRangeFrom={setRangeFrom} onRangeTo={setRangeTo} />
      <div className="mc-controls">
        <div className="seg">
          {[["", "Buy + Sell"], ["buy", "Chỉ Buy"], ["sell", "Chỉ Sell"]].map(([id, label]) => (
            <button key={id} type="button" className={`seg-btn ${direction === id ? "seg-active" : ""}`} onClick={() => setDirection(id)}>{label}</button>
          ))}
        </div>
        <span className="field-hint">
          {linked.length ? `Tài khoản: ${linked.join(", ")}` : "Chưa gắn tài khoản nào — chỉ tính lệnh tự chọn chỉ số này."}
          {direction !== "buy" ? " · Lệnh Sell: điều kiện \"đạt\" thường là bất lợi, nên xem riêng." : ""}
        </span>
      </div>

      {recorded + st.partial.count === 0 ? (
        <div className="empty-state">
          <Globe2 size={28} color="var(--text-dim)" />
          <p>Chưa có lệnh đã đóng nào ghi điều kiện {regime.name}. Mở form lệnh, ở mục 1 bấm Đạt / Không cho từng điều kiện.</p>
          {st.missing.count ? <p className="field-hint">{st.missing.count} lệnh đã đóng thuộc {regime.name} chưa ghi điều kiện.</p> : null}
        </div>
      ) : (
        <>
          <div className={`mc-hero ${gapWr !== null && gapWr > 0 ? "mc-hero-ok" : "mc-hero-cost"}`}>
            {st.full.count && st.rest.count ? (
              <>
                <span className="mc-hero-label">Khi {regime.name} đạt đủ {st.total}/{st.total} điều kiện</span>
                <span className={`mc-hero-value ${gapWr > 0 ? "mc-hero-value-ok" : ""}`}>{fmtPct(st.full.winRate)} <small>so với</small> {fmtPct(st.rest.winRate)}</span>
                <p className="mc-hero-why">
                  Winrate {st.full.count} lệnh vào lúc thị trường chung thuận so với {st.rest.count} lệnh vào lúc thiếu ít nhất một điều kiện.
                  R trung bình <b>{fmtR(st.full.avgR)}</b> so với <b>{fmtR(st.rest.avgR)}</b>.
                </p>
              </>
            ) : (
              <>
                <span className="mc-hero-label">Chưa đủ hai phía để so</span>
                <p className="mc-hero-why">
                  {st.full.count ? `Cả ${st.full.count} lệnh đã ghi đủ đều vào lúc đạt ${st.total}/${st.total}` : "Chưa có lệnh nào vào lúc đạt đủ mọi điều kiện"} — cần thêm lệnh ở phía còn lại.
                </p>
              </>
            )}
            {small && st.full.count && st.rest.count ? (
              <p className="mc-hero-warn">Mẫu còn nhỏ ({st.full.count} và {st.rest.count} lệnh — nên có ít nhất {REGIME_MIN_SAMPLE} mỗi bên). Để tham khảo, chưa đủ kết luận.</p>
            ) : null}
          </div>

          <h3 className="block-title">Theo số điều kiện đạt</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Thị trường chung</th><th>Số lệnh</th><th>Winrate</th><th>R TB</th><th>Tổng R</th></tr></thead>
              <tbody>
                {st.levels.map((l) => (
                  <tr key={l.met} className={l === allMet ? "regime-row-full" : ""}>
                    <td>Đạt {l.met}/{st.total}{l.met === st.total ? " — thuận" : l.met === 0 ? " — nghịch" : ""}</td>
                    <StatCells s={l} />
                  </tr>
                ))}
                {st.partial.count ? <tr className="regime-row-dim"><td title="Thường là lệnh cũ ghi trước khi bạn thêm điều kiện mới">Ghi thiếu điều kiện</td><StatCells s={st.partial} /></tr> : null}
              </tbody>
            </table>
          </div>

          {st.byCondition.length > 1 ? (
            <>
              <h3 className="block-title" style={{ marginTop: 22 }}>Từng điều kiện riêng</h3>
              <p className="field-hint" style={{ marginTop: 4, marginBottom: 10 }}>Điều kiện nào chênh winrate nhiều nhất là điều kiện đáng giữ; chênh ít thì có thể bỏ cho gọn.</p>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Điều kiện</th><th>Đạt: lệnh</th><th>Winrate</th><th>R TB</th><th>Không: lệnh</th><th>Winrate</th><th>R TB</th></tr></thead>
                  <tbody>
                    {st.byCondition.map((c) => (
                      <tr key={c.id}>
                        <td>{c.label}</td>
                        <td className="mono">{c.yes.count}</td>
                        <td className="mono">{fmtPct(c.yes.winRate)}</td>
                        <td className={`mono ${toneR(c.yes.avgR)}`}>{fmtR(c.yes.avgR)}</td>
                        <td className="mono">{c.no.count}</td>
                        <td className="mono">{fmtPct(c.no.winRate)}</td>
                        <td className={`mono ${toneR(c.no.avgR)}`}>{fmtR(c.no.avgR)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </>
      )}

      {st.missingTrades.length ? (
        <details className="regime-missing">
          <summary>{st.missingTrades.length} lệnh đã đóng chưa ghi điều kiện {regime.name}</summary>
          <p className="field-hint">Bấm vào lệnh để mở, rồi bấm Sửa và điền ở mục 1. Nhớ lại lúc vào lệnh chỉ số đang thế nào — mở chart ngày đó là thấy.</p>
          <div className="mc-worst">
            {[...st.missingTrades].sort((a, b) => (dateKey(b) || "").localeCompare(dateKey(a) || "")).slice(0, 40).map((t) => (
              <button type="button" key={t.id} className="mc-worst-row" onClick={() => onOpenTrade && onOpenTrade(t)}>
                <span className="mono mc-worst-date">{t.entryDate || "—"}</span>
                <b className="mc-worst-sym">{t.symbol || "—"}</b>
                <span className="mc-worst-note">{t.account}</span>
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
