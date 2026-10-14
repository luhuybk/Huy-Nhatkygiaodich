import { useEffect, useMemo, useState } from "react";
import { Globe2, Plus, Trash2, Settings2, ChevronUp, ChevronDown, Info, FlaskConical, Scale } from "lucide-react";
import { DashboardFilters } from "./Dashboard.jsx";
import { FxStatsPanel } from "./FxStrength.jsx";
import { fxPairOf } from "../lib/fxStrength.js";
import { buildDemoTrades } from "../lib/demoTrades.js";
import { ConfirmButton, Field, NoteText } from "./ui.jsx";
import { dateKey, expandAccountFilter, fmtR, inRange } from "../lib/helpers.js";
import {
  activeStates, emptyRegime, emptyState, GROUP_COLORS, groupOf, marketRegimesOf, REGIME_MIN_SAMPLE, REGIME_NONE, REGIME_TONES,
  regimeForAccount, regimeGroupsOf, regimeStats, riskBandText, riskFit, sameDayState, stateName, stateRiskBand, toneVars, tradeRegime, tradeState,
} from "../lib/marketRegime.js";

const fmtPct = (v) => (v === null || v === undefined ? "—" : `${v.toFixed(1)}%`);
const toneR = (v) => (v > 0 ? "text-win" : v < 0 ? "text-loss" : "");

// Nhãn nhóm: ký hiệu (▲ ● ▼) + tên nhóm, tô màu nhóm — hình + màu để không phải dựa hẳn vào màu.
export function RegimeMark({ state, groups, short }) {
  if (!state) return null;
  const g = groupOf(groups, state.tone || "neutral");
  return (
    <span className={`regime-code ${short ? "" : "regime-code-full"}`} style={toneVars(g)} title={g.label}>
      <i>{g.icon}</i>{short ? null : g.label}
    </span>
  );
}

// Ô tick trạng thái thị trường chung trong form lệnh (mục 1). Trạng thái gom theo nhóm; mỗi lệnh chọn
// đúng một trạng thái, bấm lại cái đang chọn là bỏ chọn. Trạng thái đang chọn hiện hẳn ghi chú ra.
export function MarketCondPicker({ t, setT, resources, trades }) {
  const regimes = useMemo(() => marketRegimesOf(resources), [resources]);
  const groups = useMemo(() => regimeGroupsOf(resources), [resources]);
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
  const curGroup = current ? groupOf(groups, current.tone || "neutral") : null;

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
          <div className="regime-groups">
            {groups.map((g) => {
              const list = states.filter((s) => (s.tone || "neutral") === g.id);
              if (!list.length) return null;
              return (
                <div key={g.id} className="regime-group" style={toneVars(g)}>
                  <div className="regime-group-head"><i>{g.icon}</i>{g.label}</div>
                  {list.map((s) => {
                    const band = stateRiskBand(s);
                    const on = current && current.id === s.id;
                    return (
                      <div key={s.id} className="regime-state-wrap">
                        <button type="button" className={`regime-state ${on ? "regime-state-on" : ""}`} onClick={() => pickState(s.id)}>
                          <span className="regime-radio" />
                          <span className="regime-state-label">{s.label}</span>
                          {s.note && !on ? <Info size={13} className="regime-note-icon" /> : null}
                          {band ? <span className={`regime-band-tag mono ${band.max === 0 ? "regime-band-out" : ""}`}>{riskBandText(band)}</span> : null}
                        </button>
                        {s.note && !on ? <div className="regime-note-pop"><NoteText text={s.note} /></div> : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {current ? (
            <div className="regime-current" style={toneVars(curGroup)}>
              <div className="regime-current-head">
                <RegimeMark state={current} groups={groups} />
                <span>{current.label}</span>
              </div>
              {current.note ? <div className="regime-current-note"><NoteText text={current.note} /></div> : null}
              <RegimeRiskHint t={t} state={current} />
            </div>
          ) : null}
          {sameDay ? (
            <button type="button" className="btn btn-ghost btn-xs regime-copy" onClick={() => pickState(sameDay.state.id)}>
              Giống lệnh {sameDay.trade.symbol || "khác"} cùng ngày: {stateName(sameDay.state, groups)} · {sameDay.state.label}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

const FIT_TEXT = { in: "đúng khung", over: "vượt khung", under: "dưới khung" };

// Dòng nhắc khung vốn của trạng thái đang tick — hiện cả ở mục 1 (cạnh trạng thái) lẫn mục 2
// (cạnh ô Rủi ro %), vì lúc gõ % rủi ro thì mục 1 đã cuộn khuất.
function RegimeRiskHint({ t, state }) {
  const band = stateRiskBand(state);
  if (!band) return null;
  const fit = riskFit(t, state);
  const pct = String(t.riskPercent || "").trim();
  const text = band.max === 0
    ? `Trạng thái này khuyến nghị đứng ngoài${fit === "over" ? ` — lệnh đang đi ${pct}%.` : "."}`
    : `Khung vốn: ${riskBandText(band)}${fit ? ` — lệnh đang đi ${pct}%, ${FIT_TEXT[fit]}.` : " — chưa điền Rủi ro (%) ở mục 2."}`;
  return <p className={`regime-risk-hint regime-fit-${fit || "none"}`}><Scale size={13} /> {text}</p>;
}

// Bản dùng ở mục 2 của form lệnh: tự tìm trạng thái đã tick ở mục 1.
export function RegimeRiskNote({ t, resources }) {
  const regimes = useMemo(() => marketRegimesOf(resources), [resources]);
  const regime = tradeRegime(t, regimes, resources.accounts);
  const state = tradeState(t, regime);
  if (!state || !stateRiskBand(state)) return null;
  return <RegimeRiskHint t={t} state={state} />;
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

// Ô màu tự chọn: kéo trong bảng màu bắn onChange liên tục — đợi tay dừng mới lưu một lần.
function DebouncedColor({ value, onCommit }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    if (draft === value) return undefined;
    const id = setTimeout(() => onCommit(draft), 500);
    return () => clearTimeout(id);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input type="color" value={draft} onChange={(e) => setDraft(e.target.value)} />;
}

// Tên + màu ba nhóm, dùng chung cho mọi chỉ số.
function GroupSettings({ groups, onChange }) {
  const patch = (id, p) => {
    const next = {};
    groups.forEach((g) => { next[g.id] = { label: g.label, color: g.color, ...(g.id === id ? p : {}) }; });
    onChange(next);
  };
  return (
    <div className="account-form regime-card">
      <span className="field-label">Nhóm trạng thái <small className="field-hint">— dùng chung cho mọi chỉ số, thống kê gộp theo 3 nhóm này</small></span>
      <div className="regime-group-edit-list">
        {groups.map((g) => (
          <div key={g.id} className="regime-group-edit" style={toneVars(g)}>
            <span className="regime-group-icon">{g.icon}</span>
            <CommitInput value={g.label} placeholder={REGIME_TONES.find((x) => x.id === g.id).label} onCommit={(v) => patch(g.id, { label: v })} />
            <div className="acct-swatches">
              {GROUP_COLORS.map((c) => (
                <button key={c} type="button" aria-label={`Màu ${c}`} className={`acct-swatch ${g.color.toLowerCase() === c ? "acct-swatch-on" : ""}`} style={{ background: c }}
                  onClick={() => patch(g.id, { color: c })} />
              ))}
              <label className={`acct-swatch acct-swatch-custom ${!GROUP_COLORS.includes(g.color.toLowerCase()) ? "acct-swatch-on" : ""}`} title="Màu khác"
                style={!GROUP_COLORS.includes(g.color.toLowerCase()) ? { background: g.color } : undefined}>
                +<DebouncedColor value={g.color} onCommit={(c) => patch(g.id, { color: c })} />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegimeSettings({ regimes, groups, accounts, onChange, onGroupsChange }) {
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
  // Lên / xuống trong cùng nhóm: đổi chỗ với trạng thái liền kề CÙNG nhóm trong danh sách.
  const move = (r, list, i, d) => {
    const a = list[i];
    const b = list[i + d];
    if (!a || !b) return;
    setStates(r, r.states.map((s) => (s.id === a.id ? b : s.id === b.id ? a : s)));
  };
  const list = (accounts || []).filter((a) => a && a.name);

  return (
    <div className="regime-settings">
      <p className="field-hint">
        Mỗi chỉ số là "nhiệt kế" của một loại thị trường, kèm danh sách trạng thái — mỗi lệnh tick đúng một trạng thái, nên các trạng thái
        nên loại trừ nhau và phủ hết các tình huống. Mỗi trạng thái thuộc một nhóm (Tích cực / Trung tính / Tiêu cực — tự đổi tên, màu ở khung dưới). Ghi chú hiện khi rê chuột / khi chọn trạng thái trong form lệnh.
        Khung vốn (% rủi ro mỗi lệnh) thì form lệnh nhắc ngay khi đi lệch. Sửa chữ không mất dữ liệu cũ; xoá trạng thái thì các lệnh đã tick nó thành "chưa ghi".
      </p>
      <GroupSettings groups={groups} onChange={onGroupsChange} />
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
          {groups.map((g) => {
            const inGroup = (r.states || []).filter((s) => (s.tone || "neutral") === g.id);
            return (
              <div key={g.id} className="regime-group regime-group-settings" style={toneVars(g)}>
                <div className="regime-group-head"><i>{g.icon}</i>{g.label}<small>{inGroup.length} trạng thái</small></div>
                {inGroup.map((s, i) => (
                  <div key={s.id} className="regime-state-edit">
                    <div className="regime-cond-row">
                      <CommitInput value={s.label} placeholder="VD: Trên EMA9 · nhưng dưới EMA21" onCommit={(v) => patchState(r, s.id, { label: v })} />
                      <select className="input regime-tone-select" value={s.tone || "neutral"} onChange={(e) => patchState(r, s.id, { tone: e.target.value })} title="Chuyển sang nhóm khác">
                        {groups.map((x) => <option key={x.id} value={x.id}>{x.icon} {x.label}</option>)}
                      </select>
                      <button type="button" className="row-btn" disabled={i === 0} onClick={() => move(r, inGroup, i, -1)} title="Lên"><ChevronUp size={14} /></button>
                      <button type="button" className="row-btn" disabled={i === inGroup.length - 1} onClick={() => move(r, inGroup, i, 1)} title="Xuống"><ChevronDown size={14} /></button>
                      <ConfirmButton onConfirm={() => setStates(r, r.states.filter((x) => x.id !== s.id))} />
                    </div>
                    <div className="regime-note-edit">
                      <div className="regime-band-edit">
                        <span className="field-hint">Khung vốn %</span>
                        <CommitInput type="number" step="0.1" min="0" inputMode="decimal" className="input mono" value={s.riskMin === undefined ? "" : String(s.riskMin)}
                          placeholder="từ" onCommit={(v) => patchState(r, s.id, { riskMin: v })} />
                        <span className="field-hint">–</span>
                        <CommitInput type="number" step="0.1" min="0" inputMode="decimal" className="input mono" value={s.riskMax === undefined ? "" : String(s.riskMax)}
                          placeholder="đến" onCommit={(v) => patchState(r, s.id, { riskMax: v })} />
                        <span className="field-hint regime-band-hint">{stateRiskBand(s) ? riskBandText(stateRiskBand(s)) : "để trống = không đặt khung · đến 0 = đứng ngoài"}</span>
                      </div>
                      <CommitInput multiline value={s.note} onCommit={(v) => patchState(r, s.id, { note: v })}
                        placeholder="Ghi chú — hiện khi rê chuột / khi chọn trạng thái. VD: Đi vốn 1.2% · ưu tiên setup breakout" />
                    </div>
                  </div>
                ))}
                <button type="button" className="btn btn-ghost btn-xs regime-add-state" onClick={() => setStates(r, [...(r.states || []), emptyState(g.id)])}>
                  <Plus size={13} /> Thêm trạng thái {g.label}
                </button>
              </div>
            );
          })}
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

// Kỷ luật đi vốn: lệnh đi đúng khung của trạng thái so với lệnh vượt / dưới khung. So bằng R nên
// không bị cỡ lệnh làm lệch — câu hỏi là những lần "tay to" có thật sự là lệnh tốt hơn không.
function RiskDiscipline({ st, groups, onOpenTrade }) {
  const measured = st.fit.reduce((n, x) => n + x.count, 0);
  const inFit = st.fit.find((x) => x.id === "in");
  const over = st.fit.find((x) => x.id === "over");
  const offList = [...st.fitTrades.over.map((x) => ({ ...x, kind: "over" })), ...st.fitTrades.under.map((x) => ({ ...x, kind: "under" }))]
    .sort((a, b) => (dateKey(b.t) || "").localeCompare(dateKey(a.t) || ""));

  return (
    <>
      <h3 className="block-title" style={{ marginTop: 22 }}>Kỷ luật đi vốn</h3>
      {measured === 0 ? (
        <p className="field-hint">
          {st.noBand && !st.noRisk
            ? "Các trạng thái đã tick chưa đặt khung vốn — đặt ở tab Cài đặt (ô \"Khung vốn %\" dưới mỗi trạng thái)."
            : "Chưa có lệnh nào vừa có khung vốn vừa ghi Rủi ro (%) để so."}
        </p>
      ) : (
        <>
          <p className="field-hint">
            <b>{inFit.count}/{measured}</b> lệnh đi vốn đúng khung ({fmtPct((inFit.count / measured) * 100)}).
            {over.count ? <> Vượt khung {over.count} lệnh, R TB <b className={toneR(over.avgR)}>{fmtR(over.avgR)}</b> so với đúng khung <b className={toneR(inFit.avgR)}>{fmtR(inFit.avgR)}</b>.</> : " Chưa lệnh nào vượt khung."}
            {st.noBand || st.noRisk ? ` Không tính ${st.noBand + st.noRisk} lệnh (${[st.noBand ? `${st.noBand} ở trạng thái chưa đặt khung` : "", st.noRisk ? `${st.noRisk} chưa ghi Rủi ro %` : ""].filter(Boolean).join(", ")}).` : ""}
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Đi vốn</th><th>Số lệnh</th><th>Winrate</th><th>R TB</th><th>Tổng R</th></tr></thead>
              <tbody>
                {st.fit.map((x) => (
                  <tr key={x.id} className={x.count ? "" : "regime-row-dim"}>
                    <td><span className={`regime-dot regime-fit-dot-${x.id}`} />{x.label}</td>
                    <StatCells s={x} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {offList.length ? (
            <details className="regime-missing">
              <summary>{offList.length} lệnh đi lệch khung</summary>
              <div className="mc-worst">
                {offList.slice(0, 40).map(({ t, state, kind }) => (
                  <button type="button" key={t.id} className="mc-worst-row" onClick={() => onOpenTrade && onOpenTrade(t)}>
                    <span className="mono mc-worst-date">{t.entryDate || "—"}</span>
                    <b className="mc-worst-sym">{t.symbol || "—"}</b>
                    <span className={`mono regime-fit-${kind}`}>{t.riskPercent}%</span>
                    <RegimeMark state={state} groups={groups} short />
                    <span className="mc-worst-note">khung {riskBandText(stateRiskBand(state))} · {state.label}</span>
                  </button>
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
    </>
  );
}

export function MarketRegimePage({ trades: realTrades, resources, onResourcesChange, onOpenTrade: openReal }) {
  const regimes = useMemo(() => marketRegimesOf(resources), [resources]);
  // Dữ liệu mẫu chỉ sống trong state của trang này — không lưu, rời trang / tải lại là mất.
  // Lệnh mẫu không mở được: mở ra là có nút Sửa, lưu lại là lọt lệnh giả vào dữ liệu thật.
  const [demo, setDemo] = useState(false);
  const demoTrades = useMemo(() => (demo ? buildDemoTrades(regimes) : null), [demo, regimes]);
  const trades = demo ? demoTrades : realTrades;
  const onOpenTrade = demo ? undefined : openReal;
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
  const groups = useMemo(() => regimeGroupsOf(resources), [resources]);
  const saveRegimes = (next) => onResourcesChange({ ...resources, marketRegimes: next });
  const saveGroups = (next) => onResourcesChange({ ...resources, regimeGroups: next });
  const linkedNames = (r) => (r.accountIds || []).map((id) => (resources.accounts.find((a) => a.id === id) || {}).name).filter(Boolean);

  const tabs = (
    <div className="subtabs">
      {regimes.map((r) => (
        <button key={r.id} type="button" className={`subtab ${tab === r.id ? "subtab-active" : ""}`} onClick={() => setTab(r.id)}>{r.name || "(chưa đặt tên)"}</button>
      ))}
      <button type="button" className={`subtab ${tab === "fx" ? "subtab-active" : ""}`} onClick={() => setTab("fx")}>Cặp tiền FX</button>
      <button type="button" className={`subtab ${tab === "settings" ? "subtab-active" : ""}`} onClick={() => setTab("settings")}><Settings2 size={13} /> Cài đặt</button>
      <button type="button" className={`btn btn-ghost btn-xs demo-toggle ${demo ? "demo-toggle-on" : ""}`} onClick={() => setDemo((v) => !v)}
        title="Sinh tạm vài trăm lệnh giả trong trình duyệt để xem bảng thống kê — không lưu, không đụng dữ liệu thật">
        <FlaskConical size={13} /> {demo ? "Tắt dữ liệu mẫu" : "Xem thử với dữ liệu mẫu"}
      </button>
    </div>
  );
  const demoBanner = demo ? (
    <div className="demo-banner">
      <FlaskConical size={14} />
      <span><b>Đang xem dữ liệu mẫu</b> — số liệu giả, sinh tạm trong trình duyệt, không lưu vào nhật ký. Bấm "Tắt dữ liệu mẫu" hoặc rời trang là về dữ liệu thật.</span>
    </div>
  ) : null;
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
            {direction !== "buy" ? ` · Lệnh Sell: nhóm "${groups[0].label}" (thuận cho Buy) thường là bất lợi cho Sell, nên xem riêng.` : ""}
          </span>
        ) : null}
      </div>
    </>
  );

  if (tab === "fx") {
    return (
      <div>
        {tabs}
        {demoBanner}
        {filters}
        <FxStatsPanel trades={scoped} resources={resources} direction={direction} onOpenTrade={onOpenTrade} />
      </div>
    );
  }

  if (tab === "settings" || !regime) {
    return (
      <div>
        {tabs}
        <RegimeSettings regimes={regimes} groups={groups} accounts={resources.accounts} onChange={saveRegimes} onGroupsChange={saveGroups} />
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
      {demoBanner}
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
                <span className="mc-hero-label">Khi {regime.name} {groups[0].label.toLowerCase()} so với các lúc khác</span>
                <span className={`mc-hero-value ${gapWr > 0 ? "mc-hero-value-ok" : ""}`}>{fmtPct(st.good.winRate)} <small>so với</small> {fmtPct(st.rest.winRate)}</span>
                <p className="mc-hero-why">
                  Winrate {st.good.count} lệnh vào lúc nhóm "{groups[0].label}" so với {st.rest.count} lệnh vào lúc {groups[1].label} / {groups[2].label}.
                  R trung bình <b>{fmtR(st.good.avgR)}</b> so với <b>{fmtR(st.rest.avgR)}</b>.
                  {best ? <> Trạng thái winrate cao nhất (từ 3 lệnh): <b>{best.label}</b> ({stateName(best, groups)}) — {fmtPct(best.winRate)}.</> : null}
                </p>
              </>
            ) : (
              <>
                <span className="mc-hero-label">Chưa đủ hai phía để so</span>
                <p className="mc-hero-why">
                  {st.good.count ? `Cả ${st.good.count} lệnh đã ghi đều vào lúc nhóm "${groups[0].label}"` : `Chưa có lệnh nào vào lúc nhóm "${groups[0].label}"`} — cần thêm lệnh ở phía còn lại.
                </p>
              </>
            )}
            {small && st.good.count && st.rest.count ? (
              <p className="mc-hero-warn">Mẫu còn nhỏ ({st.good.count} và {st.rest.count} lệnh — nên có ít nhất {REGIME_MIN_SAMPLE} mỗi bên). Để tham khảo, chưa đủ kết luận.</p>
            ) : null}
          </div>

          <div className="regime-group-cards">
            {st.tones.map((x) => {
              const g = groupOf(groups, x.id);
              return (
                <div key={x.id} className={`regime-group-card ${x.count ? "" : "regime-group-card-empty"}`} style={toneVars(g)}>
                  <div className="regime-group-card-head"><i>{g.icon}</i>{g.label}<small>{x.count} lệnh</small></div>
                  <div className="regime-group-card-wr mono">{fmtPct(x.winRate)}</div>
                  <div className="regime-group-card-bar"><span style={{ width: `${x.winRate || 0}%` }} /></div>
                  <div className="regime-group-card-foot mono">
                    <span>R TB <b className={toneR(x.avgR)}>{fmtR(x.avgR)}</b></span>
                    <span>Tổng <b className={toneR(x.totalR)}>{x.rCount ? fmtR(x.totalR) : "—"}</b></span>
                  </div>
                </div>
              );
            })}
          </div>

          <h3 className="block-title" style={{ marginTop: 22 }}>Theo trạng thái</h3>
          <div className="table-wrap">
            <table className="table regime-state-table">
              <thead><tr><th>Trạng thái</th><th>Số lệnh</th><th>Winrate</th><th>R TB</th><th>Tổng R</th></tr></thead>
              <tbody>
                {groups.map((g) => {
                  const rows = st.states.filter((s) => (s.tone || "neutral") === g.id);
                  if (!rows.length) return null;
                  return [
                    <tr key={`h-${g.id}`} className="regime-group-row" style={toneVars(g)}><td colSpan={5}><i>{g.icon}</i>{g.label}</td></tr>,
                    ...rows.map((s) => (
                      <tr key={s.id} className={s.count ? "" : "regime-row-dim"}>
                        <td className={s.note ? "regime-has-note" : ""} title={s.note || undefined}>
                          <span className="regime-state-cell"><span className="regime-dot" style={toneVars(groupOf(groups, s.tone || "neutral"))} /><span>{s.label}</span></span>
                        </td>
                        <StatCells s={s} />
                      </tr>
                    )),
                  ];
                })}
              </tbody>
            </table>
          </div>

          <RiskDiscipline st={st} groups={groups} onOpenTrade={onOpenTrade} />
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
