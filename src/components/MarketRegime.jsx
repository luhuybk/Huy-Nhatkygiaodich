import { useEffect, useMemo, useState } from "react";
import { Globe2, Plus, Trash2, Settings2, ChevronUp, ChevronDown, Info } from "lucide-react";
import { DashboardFilters } from "./Dashboard.jsx";
import { FxStatsPanel } from "./FxStrength.jsx";
import { fxPairOf } from "../lib/fxStrength.js";
import { ConfirmButton, Field, NoteText } from "./ui.jsx";
import { dateKey, expandAccountFilter, fmtR, inRange } from "../lib/helpers.js";
import {
  activeStates, emptyRegime, emptyState, marketRegimesOf, REGIME_MIN_SAMPLE, REGIME_NONE, REGIME_TONES,
  regimeForAccount, regimeStats, sameDayState, toneLabel, tradeRegime, tradeState,
} from "../lib/marketRegime.js";

const fmtPct = (v) => (v === null || v === undefined ? "—" : `${v.toFixed(1)}%`);
const toneR = (v) => (v > 0 ? "text-win" : v < 0 ? "text-loss" : "");

// Ô tick trạng thái thị trường chung trong form lệnh (mục 1). Mỗi lệnh chọn đúng một trạng thái;
// bấm lại cái đang chọn là bỏ chọn.
export function MarketCondPicker({ t, setT, resources, trades }) {
  const regimes = useMemo(() => marketRegimesOf(resources), [resources]);
  const auto = regimeForAccount(regimes, t.account, resources.accounts);
  const regime = tradeRegime(t, regimes, resources.accounts);
  const picked = (t.marketCond && t.marketCond.regimeId) || "";
  const current = tradeState(t, regime);
  const sameDay = regime && !current ? sameDayState(trades, t, regime) : null;

  const pickRegime = (id) => setT((prev) => {
    if (!id) return { ...prev, marketCond: null };
    const keep = prev.marketCond && prev.marketCond.regimeId === id ? prev.marketCond.stateId : "";
    return { ...prev, marketCond: { regimeId: id, stateId: keep || "" } };
  });
  const pickState = (stateId) => setT((prev) => {
    const same = prev.marketCond && prev.marketCond.regimeId === regime.id && prev.marketCond.stateId === stateId;
    return { ...prev, marketCond: { regimeId: regime.id, stateId: same ? "" : stateId } };
  });
  const states = regime ? activeStates(regime) : [];
  // Cặp FX đã có bảng sức mạnh đồng tiền riêng — khỏi hiện thêm khung "không có chỉ số".
  if (!regime && !picked && fxPairOf(t.symbol)) return null;

  return (
    <div className="regime-picker">
      <div className="regime-picker-head">
        <span className="field-label">Thị trường chung</span>
        <select className="input regime-select" value={picked} onChange={(e) => pickRegime(e.target.value)}>
          <option value="">{auto ? `Theo tài khoản — ${auto.name}` : "Theo tài khoản — không có chỉ số"}</option>
          {regimes.map((r) => <option key={r.id} value={r.id}>{r.name || "(chưa đặt tên)"}</option>)}
          <option value={REGIME_NONE}>Không áp dụng</option>
        </select>
      </div>
      {!regime ? (
        <p className="field-hint">
          {picked === REGIME_NONE ? "Lệnh này không tính vào thống kê thị trường chung." : "Tài khoản này chưa gắn chỉ số chung (VD hàng hoá) — bỏ qua được. Gắn ở Phân tích → Thị trường chung."}
        </p>
      ) : states.length === 0 ? (
        <p className="field-hint">{regime.name} chưa có trạng thái nào — thêm ở Phân tích → Thị trường chung → Cài đặt.</p>
      ) : (
        <>
          <div className="regime-states">
            {states.map((s) => (
              <div key={s.id} className={`regime-state-wrap regime-tone-${s.tone || "neutral"}`}>
                <button type="button" className={`regime-state ${current && current.id === s.id ? "regime-state-on" : ""}`}
                  onClick={() => pickState(s.id)}>
                  <span className="regime-radio" />
                  <span className="regime-state-label">{s.label}</span>
                  {s.note ? <Info size={13} className="regime-note-icon" /> : null}
                  <span className="regime-tone-tag">{toneLabel(s.tone)}</span>
                </button>
                {s.note ? <div className="regime-note-pop"><NoteText text={s.note} /></div> : null}
              </div>
            ))}
          </div>
          {sameDay ? (
            <button type="button" className="btn btn-ghost btn-xs regime-copy" onClick={() => pickState(sameDay.state.id)}>
              Giống lệnh {sameDay.trade.symbol || "khác"} cùng ngày: {sameDay.state.label}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

// Ô chữ chỉ lưu khi rời ô / Enter — lưu theo từng phím là mỗi chữ một lần ghi lên Supabase.
// multiline: Enter xuống dòng như mọi ô ghi chú khác, chỉ lưu khi rời ô.
function CommitInput({ value, onCommit, multiline, ...rest }) {
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { setDraft(value || ""); }, [value]);
  const commit = () => { if (draft.trim() !== (value || "").trim()) onCommit(multiline ? draft.replace(/\s+$/, "") : draft.trim()); };
  if (multiline) {
    return <textarea className="input textarea" rows={2} {...rest} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />;
  }
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
  const setStates = (r, states) => update(r.id, { states });
  const patchState = (r, sid, patch) => setStates(r, r.states.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
  const move = (r, i, d) => {
    const next = [...r.states];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setStates(r, next);
  };
  const list = (accounts || []).filter((a) => a && a.name);

  return (
    <div className="regime-settings">
      <p className="field-hint">
        Mỗi chỉ số là "nhiệt kế" của một loại thị trường, kèm danh sách trạng thái — mỗi lệnh tick đúng một trạng thái, nên các trạng thái
        nên loại trừ nhau và phủ hết các tình huống. Nhãn Thuận / Trung tính / Nghịch dùng để gộp thống kê.
        Ghi chú của mỗi trạng thái (VD khuyến nghị đi vốn) hiện khi rê chuột vào trạng thái đó trong form lệnh.
        Tài khoản hàng hoá / forex không có chỉ số chung thì không gắn. Sửa chữ không mất dữ liệu cũ; xoá trạng thái thì các lệnh đã tick nó thành "chưa ghi".
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
          <span className="field-label" style={{ marginTop: 12, display: "block" }}>Trạng thái thị trường</span>
          <div className="regime-cond-edit">
            {(r.states || []).map((s, i) => (
              <div key={s.id} className="regime-state-edit">
              <div className="regime-cond-row">
                <span className="mono regime-cond-num">{i + 1}.</span>
                <CommitInput value={s.label} placeholder="VD: Trên EMA9 · nhưng dưới EMA21" onCommit={(v) => patchState(r, s.id, { label: v })} />
                <select className={`input regime-tone-select regime-tone-${s.tone || "neutral"}`} value={s.tone || "neutral"} onChange={(e) => patchState(r, s.id, { tone: e.target.value })}>
                  {REGIME_TONES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
                <button type="button" className="row-btn" disabled={i === 0} onClick={() => move(r, i, -1)} title="Lên"><ChevronUp size={14} /></button>
                <button type="button" className="row-btn" disabled={i === r.states.length - 1} onClick={() => move(r, i, 1)} title="Xuống"><ChevronDown size={14} /></button>
                <ConfirmButton onConfirm={() => setStates(r, r.states.filter((x) => x.id !== s.id))} />
              </div>
              <div className="regime-note-edit">
                <CommitInput multiline value={s.note} onCommit={(v) => patchState(r, s.id, { note: v })}
                  placeholder="Ghi chú — hiện khi rê chuột vào trạng thái. VD: Đi vốn 1.2% · ưu tiên setup breakout" />
              </div>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setStates(r, [...(r.states || []), emptyState()])}>
            <Plus size={13} /> Thêm trạng thái
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
  useEffect(() => { if (tab !== "settings" && tab !== "fx" && !regime) setTab(regimes[0] ? regimes[0].id : "settings"); }, [tab, regime, regimes]);

  const inScope = useMemo(() => expandAccountFilter(scope, resources.accounts), [resources.accounts, scope]);
  const scoped = useMemo(
    () => trades.filter((t) => (!inScope || inScope.has(t.account)) && inRange(dateKey(t) || t.entryDate, range, rangeFrom, rangeTo)),
    [trades, inScope, range, rangeFrom, rangeTo]
  );
  const st = useMemo(() => (regime ? regimeStats(scoped, regime, resources, { direction }) : null), [scoped, regime, resources, direction]);
  const saveRegimes = (next) => onResourcesChange({ ...resources, marketRegimes: next });
  const linkedNames = (r) => (r.accountIds || []).map((id) => (resources.accounts.find((a) => a.id === id) || {}).name).filter(Boolean);

  const tabs = (
    <div className="subtabs">
      {regimes.map((r) => (
        <button key={r.id} type="button" className={`subtab ${tab === r.id ? "subtab-active" : ""}`} onClick={() => setTab(r.id)}>{r.name || "(chưa đặt tên)"}</button>
      ))}
      <button type="button" className={`subtab ${tab === "fx" ? "subtab-active" : ""}`} onClick={() => setTab("fx")}>Cặp tiền FX</button>
      <button type="button" className={`subtab ${tab === "settings" ? "subtab-active" : ""}`} onClick={() => setTab("settings")}><Settings2 size={13} /> Cài đặt</button>
    </div>
  );
  const filters = (
    <>
      <DashboardFilters multi resources={resources} account={scope} onAccount={setScope} range={range} onRange={setRange} rangeFrom={rangeFrom} rangeTo={rangeTo} onRangeFrom={setRangeFrom} onRangeTo={setRangeTo} />
      <div className="mc-controls">
        <div className="seg">
          {[["", "Buy + Sell"], ["buy", "Chỉ Buy"], ["sell", "Chỉ Sell"]].map(([id, label]) => (
            <button key={id} type="button" className={`seg-btn ${direction === id ? "seg-active" : ""}`} onClick={() => setDirection(id)}>{label}</button>
          ))}
        </div>
        {regime ? (
          <span className="field-hint">
            {linkedNames(regime).length ? `Tài khoản: ${linkedNames(regime).join(", ")}` : "Chưa gắn tài khoản nào — chỉ tính lệnh tự chọn chỉ số này."}
            {direction !== "buy" ? " · Lệnh Sell: thị trường \"thuận\" cho Buy thường là bất lợi, nên xem riêng." : ""}
          </span>
        ) : null}
      </div>
    </>
  );

  if (tab === "fx") {
    return (
      <div>
        {tabs}
        {filters}
        <FxStatsPanel trades={scoped} resources={resources} direction={direction} onOpenTrade={onOpenTrade} />
      </div>
    );
  }

  if (tab === "settings" || !regime) {
    return (
      <div>
        {tabs}
        <RegimeSettings regimes={regimes} accounts={resources.accounts} onChange={saveRegimes} />
      </div>
    );
  }

  const recorded = st.states.reduce((n, s) => n + s.count, 0);
  const small = st.good.count < REGIME_MIN_SAMPLE || st.rest.count < REGIME_MIN_SAMPLE;
  const gapWr = st.good.winRate !== null && st.rest.winRate !== null ? st.good.winRate - st.rest.winRate : null;
  const best = st.states.filter((s) => s.count >= 3 && s.winRate !== null).sort((a, b) => b.winRate - a.winRate)[0] || null;

  return (
    <div>
      {tabs}
      {filters}

      {recorded === 0 ? (
        <div className="empty-state">
          <Globe2 size={28} color="var(--text-dim)" />
          <p>Chưa có lệnh đã đóng nào tick trạng thái {regime.name}. Mở form lệnh, ở mục 1 chọn trạng thái thị trường chung lúc vào lệnh.</p>
          {st.missing.count ? <p className="field-hint">{st.missing.count} lệnh đã đóng thuộc {regime.name} chưa ghi.</p> : null}
        </div>
      ) : (
        <>
          <div className={`mc-hero ${gapWr !== null && gapWr > 0 ? "mc-hero-ok" : "mc-hero-cost"}`}>
            {st.good.count && st.rest.count ? (
              <>
                <span className="mc-hero-label">Khi {regime.name} thuận so với các lúc khác</span>
                <span className={`mc-hero-value ${gapWr > 0 ? "mc-hero-value-ok" : ""}`}>{fmtPct(st.good.winRate)} <small>so với</small> {fmtPct(st.rest.winRate)}</span>
                <p className="mc-hero-why">
                  Winrate {st.good.count} lệnh vào lúc trạng thái "Thuận" so với {st.rest.count} lệnh vào lúc Trung tính / Nghịch.
                  R trung bình <b>{fmtR(st.good.avgR)}</b> so với <b>{fmtR(st.rest.avgR)}</b>.
                  {best ? <> Trạng thái winrate cao nhất (từ 3 lệnh): <b>{best.label}</b> — {fmtPct(best.winRate)}.</> : null}
                </p>
              </>
            ) : (
              <>
                <span className="mc-hero-label">Chưa đủ hai phía để so</span>
                <p className="mc-hero-why">
                  {st.good.count ? `Cả ${st.good.count} lệnh đã ghi đều vào lúc thị trường thuận` : "Chưa có lệnh nào vào lúc trạng thái \"Thuận\""} — cần thêm lệnh ở phía còn lại.
                </p>
              </>
            )}
            {small && st.good.count && st.rest.count ? (
              <p className="mc-hero-warn">Mẫu còn nhỏ ({st.good.count} và {st.rest.count} lệnh — nên có ít nhất {REGIME_MIN_SAMPLE} mỗi bên). Để tham khảo, chưa đủ kết luận.</p>
            ) : null}
          </div>

          <h3 className="block-title">Theo trạng thái</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Trạng thái</th><th>Số lệnh</th><th>Winrate</th><th>R TB</th><th>Tổng R</th></tr></thead>
              <tbody>
                {st.states.map((s) => (
                  <tr key={s.id} className={s.count ? "" : "regime-row-dim"}>
                    <td className={s.note ? "regime-has-note" : ""} title={s.note || undefined}><span className={`regime-dot regime-tone-${s.tone || "neutral"}`} />{s.label}</td>
                    <StatCells s={s} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="block-title" style={{ marginTop: 22 }}>Gộp theo nhóm</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Nhóm</th><th>Số lệnh</th><th>Winrate</th><th>R TB</th><th>Tổng R</th></tr></thead>
              <tbody>
                {st.tones.map((x) => (
                  <tr key={x.id} className={x.count ? "" : "regime-row-dim"}>
                    <td><span className={`regime-dot regime-tone-${x.id}`} />{x.label}</td>
                    <StatCells s={x} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {st.missingTrades.length ? (
        <details className="regime-missing">
          <summary>{st.missingTrades.length} lệnh đã đóng chưa ghi trạng thái {regime.name}</summary>
          <p className="field-hint">Bấm vào lệnh để mở, rồi bấm Sửa và chọn ở mục 1. Mở chart chỉ số ngày vào lệnh là thấy trạng thái lúc đó.</p>
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
