import { useMemo, useRef, useState } from "react";
import { Bell, CalendarClock, Check, ChevronLeft, ChevronRight, CornerDownRight, Gauge, Pencil, Plus, Scale, Send, Settings2, Shield, Split, TrendingUp, Wallet, X } from "lucide-react";
import { ConfirmButton, Field, MoneyInput, useAutoFocus, useStickyTab } from "./ui.jsx";
import { CURRENCIES } from "../lib/constants.js";
import { emptyCapitalPickReminder, fmtMoney, todayStr, uid, WEEKDAY_CODES } from "../lib/helpers.js";
import { ASSET_GROUPS } from "../lib/assetGroups.js";
import {
  capitalScale, claimedAssetGroups, emptyCapitalMarket, marketDisplayOrder, marketFamilies, splitMarketByAssets, fmtPctVN, fmtRVN, isWeekend, MARKET_COLORS, marketColor, marketColorStyle, marketDrawdown, marketRStats, marketsMissingNextPick,
  marketTierList, moveMarket, nextWeekKey, normalizeRRule, pickedTier, R_RULE_DEFAULT, R_WINDOWS, rWindowRanges, safestTier, setPick,
  sortTiers, suggestNextTier, thisWeekKey, tierMoney, tierShareOfTotal,
  ladderOn, ladderState, LADDER_DOWN_DEFAULT, LADDER_STEP_DEFAULT,
  requiredMonthlyR, simulateRoadmap, snapshotEquityAt, ymAdd, ymDiff,
} from "../lib/capital.js";

const DD_LABEL = { ok: "Ổn", warn: "Cảnh báo", cut: "Giảm risk" };
const WEEKDAY_FULL = { T2: "Thứ 2", T3: "Thứ 3", T4: "Thứ 4", T5: "Thứ 5", T6: "Thứ 6", T7: "Thứ 7", CN: "Chủ nhật" };

const ddmm = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");
const weekLabel = (start) => {
  const end = new Date(start + "T00:00:00");
  end.setDate(end.getDate() + 6);
  return `${ddmm(start)} – ${String(end.getDate()).padStart(2, "0")}/${String(end.getMonth() + 1).padStart(2, "0")}`;
};
const groupLabels = (keys) => ASSET_GROUPS.filter((g) => keys.includes(g.key)).map((g) => g.label).join(", ");
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
  // Lưới chia đều một hàng: 5 mức (kể cả cầm chừng) vẫn nằm gọn, không đẩy nút xuống dòng.
  return (
    <>
      <div className="cap-pick" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}>
        {list.map(({ pct, hold }) => (
          <button key={pct} type="button" title={hold ? "Mốc cầm chừng" : undefined}
            className={`lsn-pick-btn ${hold ? "cap-pick-hold" : ""} ${picked === pct ? "lsn-pick-on lsn-pick-on-1" : ""}`} onClick={() => onPick(pct)}>
            {hold ? <Shield size={10} className="cap-pick-hold-icon" /> : null}{fmtPctVN(pct)}
          </button>
        ))}
      </div>
      {picked !== null && !list.some((x) => x.pct === picked) ? (
        <span className="field-hint">Đang chọn {fmtPctVN(picked)} (đã gỡ khỏi danh sách mức)</span>
      ) : null}
    </>
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
        <span>Sụt từ đỉnh</span>
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
      ) : (
        <p className="field-hint cap-dd-note">{dd.tradeCount} lệnh đã đóng từ {ddmm(ladderOn(market) ? market.ladder.from : plan.startDate) || "đầu"} · vốn hiện {fmtMoney(Math.round(dd.current), market.currency)}</p>
      )}
    </div>
  );
}

function emptyLadder(m, startDate) {
  return {
    on: true, capital: Number(m.allocated) || 0, from: startDate || todayStr(), stepPct: LADDER_STEP_DEFAULT, downPct: LADDER_DOWN_DEFAULT,
    deposits: [], plan: null,
  };
}

// Bật / chỉnh bậc vốn trong ô Sửa mảng.
function LadderEditor({ m, setM, startDate }) {
  const lad = m.ladder;
  const on = !!(lad && lad.on);
  const setLad = (patch) => setM((prev) => ({ ...prev, ladder: { ...(prev.ladder || emptyLadder(prev, startDate)), ...patch } }));
  const deps = (lad && lad.deposits) || [];
  const setDep = (id, patch) => setLad({ deposits: deps.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  return (
    <div className={`cap-ladder-edit ${on ? "is-on" : ""}`}>
      <label className="mc-check">
        <input type="checkbox" checked={on} onChange={(e) => setLad({ on: e.target.checked })} />
        <span><b>Bậc vốn tự tăng</b> — vốn thật lên mỗi +{(lad && lad.stepPct) || LADDER_STEP_DEFAULT}% thì vốn tính rủi ro tự lên một bậc, khỏi phải tự quyết</span>
      </label>
      {on ? (
        <>
          <div className="grid-2">
            <Field label="Vốn gốc (USD)" hint="Vốn thật của mảng ở ngày bắt đầu bên cạnh">
              <MoneyInput value={lad.capital} onChange={(v) => setLad({ capital: v })} />
            </Field>
            <Field label="Tính từ ngày" hint="Lệnh đóng từ ngày này trở đi mới cộng vào vốn">
              <input type="date" className="input" value={lad.from || ""} onChange={(e) => setLad({ from: e.target.value })} />
            </Field>
            <Field label="Mỗi bậc (+%)" hint="Vốn cuối tuần vượt mốc này thì tuần sau lên bậc">
              <input type="number" step="any" min="1" className="input mono" value={lad.stepPct} onChange={(e) => setLad({ stepPct: e.target.value })} />
            </Field>
            <Field label="Hạ bậc khi thủng mốc dưới thêm (%)" hint="VD 5: đang bậc 18.000 mà vốn về dưới 14.250 thì quay lại bậc 15.000">
              <input type="number" step="any" min="0" className="input mono" value={lad.downPct} onChange={(e) => setLad({ downPct: e.target.value })} />
            </Field>
          </div>
          <Field label="Nạp thêm / rút ra (USD)" hint="Nạp chỉ cộng vào số dư; vốn tính rủi ro vẫn đi theo các mốc vốn gốc × 1,2ⁿ, chốt tuần vượt mốc mới đổi (nạp lớn thì lên vài bậc một lúc). Rút ra thì ghi số âm">
            <div className="cap-ladder-deps">
              {deps.map((d) => (
                <div key={d.id} className="cap-ladder-dep">
                  <input type="date" className="input" value={d.date} onChange={(e) => setDep(d.id, { date: e.target.value })} />
                  <MoneyInput value={d.amount} onChange={(v) => setDep(d.id, { amount: v })} placeholder="12500" />
                  <button type="button" className="row-btn" onClick={() => setLad({ deposits: deps.filter((x) => x.id !== d.id) })} title="Xoá dòng"><X size={13} /></button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost" onClick={() => setLad({ deposits: [...deps, { id: uid(), date: todayStr(), amount: "" }] })}><Plus size={13} /> Thêm lần nạp</button>
            </div>
          </Field>
        </>
      ) : null}
    </div>
  );
}

function MarketEditor({ market, accounts, startDate, onSave, onCancel, onDelete }) {
  const [m, setM] = useState(market);
  // Mảng vừa bấm Thêm: tên còn trống nên con trỏ nằm sẵn ở ô Tên mảng.
  const boxRef = useRef(null);
  useAutoFocus(boxRef);
  const [tierText, setTierText] = useState(market.tiers.map((x) => String(x).replace(".", ",")).join("  "));
  const [holdText, setHoldText] = useState(market.holdTier ? String(market.holdTier).replace(".", ",") : "");
  const set = (k) => (v) => setM((prev) => ({ ...prev, [k]: v }));
  const tiers = sortTiers(tierText.split(/[\s;]+/).map((x) => x.replace(",", ".")).filter(Boolean));
  const toggleAccount = (id) => set("accountIds")(m.accountIds.includes(id) ? m.accountIds.filter((x) => x !== id) : [...m.accountIds, id]);
  const groups = m.assetGroups || [];
  const toggleGroup = (key) => set("assetGroups")(groups.includes(key) ? groups.filter((x) => x !== key) : [...groups, key]);
  const save = () => {
    const defaultTier = tiers.includes(Number(m.defaultTier)) ? Number(m.defaultTier) : tiers[Math.floor((tiers.length - 1) / 2)];
    onSave({
      ...m, name: m.name.trim() || "Mảng chưa đặt tên", tiers, defaultTier,
      holdTier: numOr(holdText, 0) > 0 ? numOr(holdText, 0) : null,
      rate: m.currency === "USD" ? 1 : numOr(m.rate, 1) || 1,
      allocated: numOr(m.allocated, 0), deposited: numOr(m.deposited, 0),
      accountCount: 1,
      ladder: m.ladder ? {
        ...m.ladder,
        capital: numOr(m.ladder.capital, 0), stepPct: numOr(m.ladder.stepPct, LADDER_STEP_DEFAULT) > 0 ? numOr(m.ladder.stepPct, LADDER_STEP_DEFAULT) : LADDER_STEP_DEFAULT,
        downPct: Math.max(0, numOr(m.ladder.downPct, LADDER_DOWN_DEFAULT)),
        deposits: (m.ladder.deposits || []).map((d) => ({ ...d, amount: numOr(d.amount, 0) })).filter((d) => d.date && d.amount),
      } : null,
    });
  };
  return (
    <div className="cap-editor" ref={boxRef}>
      <div className="grid-2">
        <Field label="Tên mảng"><input className="input" value={m.name} onChange={(e) => set("name")(e.target.value)} placeholder="VD: US Stock" /></Field>
        <Field label="Tiền của mảng">
          <select className="input" value={m.currency} onChange={(e) => set("currency")(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        {m.ladder && m.ladder.on ? (
          <Field label="Vốn phân chia (USD)" hint="Bậc vốn đang bật — app tự đặt theo bậc, sửa ở phần Bậc vốn bên dưới">
            <input className="input mono" value={fmtMoney(Number(m.allocated) || 0, "USD")} disabled />
          </Field>
        ) : (
          <Field label={m.side ? "Vốn ước lượng (USD)" : "Vốn phân chia (USD)"}><MoneyInput value={m.allocated} onChange={set("allocated")} /></Field>
        )}
        {m.currency !== "USD" ? (
          <Field label={`Tỷ giá cố định (${m.currency} / 1 USD)`} hint="Chỉ dùng cho bảng này, không đổi tỷ giá ở tab Tài khoản">
            <MoneyInput value={m.rate} onChange={set("rate")} />
          </Field>
        ) : null}
        <Field label={`Dòng tiền đã nạp vào tk (${m.currency})`} hint="Chỉ để nhìn, không dùng tính rủi ro">
          <MoneyInput value={m.deposited} onChange={set("deposited")} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Các mức rủi ro (%)" hint="Cách nhau bằng dấu cách, VD: 0,6  1,2  1,6">
          <input className="input mono" value={tierText} onChange={(e) => setTierText(e.target.value)} />
        </Field>
        <Field label="Mốc cầm chừng (%)" hint={`Giảm risk tối đa khi setup hợp lệ nhưng đang sụt sâu / thua liên tiếp${numOr(holdText, 0) > 0 ? ` — ${fmtMoney(tierMoney({ ...m, allocated: numOr(m.allocated, 0), rate: numOr(m.rate, 1), accountCount: 1 }, numOr(holdText, 0)), m.currency)} / lệnh` : ". Bỏ trống nếu không dùng"}`}>
          <input className="input mono" value={holdText} onChange={(e) => setHoldText(e.target.value)} placeholder="VD: 0,3" />
        </Field>
      </div>
      {!m.side ? <LadderEditor m={m} setM={setM} startDate={startDate} /> : null}
      <Field label="Màu nhận diện" hint={`Tô viền trái thẻ và chấm cạnh tên. "Theo tài khoản" = dùng màu của tài khoản gắn với mảng (đặt ở tab Tài khoản) — cùng màu với Nhật ký, Báo cáo tuần`}>
        <div className="cap-colors">
          <button type="button" className={`cap-color-auto ${!m.color ? "is-on" : ""}`} onClick={() => set("color")("")}
            title="Dùng màu của tài khoản gắn với mảng">
            {marketColor({ ...m, color: "" }, accounts) ? <span className="cap-color-dot" style={{ background: marketColor({ ...m, color: "" }, accounts) }} /> : <X size={12} />}
            Theo tài khoản
          </button>
          {MARKET_COLORS.map((c) => (
            <button key={c} type="button" className={`cap-color ${m.color === c ? "is-on" : ""}`} style={{ background: c }} onClick={() => set("color")(c)} title={c} />
          ))}
        </div>
      </Field>
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
      <Field label="Tài khoản thuộc mảng này" hint="Thường là một tài khoản. Chọn nhiều (hoặc cả nhóm) nghĩa là chúng dùng chung vốn này. Dùng để gợi ý rủi ro khi nhập lệnh và tính sụt vốn.">
        <div className="cap-accounts">
          {accounts.length ? accounts.filter((a) => !a.closed || m.accountIds.includes(a.id)).map((a) => (
            <label key={a.id} className="mc-check cap-account">
              <input type="checkbox" checked={m.accountIds.includes(a.id)} onChange={() => toggleAccount(a.id)} />
              <span>{a.name} <small className="field-hint">{a.currency}{a.closed ? " · đã ngừng" : ""}</small></span>
            </label>
          )) : <span className="field-hint">Chưa có tài khoản nào — thêm ở tab Tài khoản.</span>}
        </div>
      </Field>
      <Field label="Chỉ tính nhóm tài sản (tùy chọn)"
        hint="Bỏ trống = mọi lệnh của các tài khoản trên. Đánh dấu Hàng hóa + Crypto và gắn cả ba tài khoản Trading thì lệnh vàng, dầu, crypto ở tài khoản nào cũng gợi ý rủi ro theo vốn của mảng này; mảng FX của từng tài khoản tự bỏ các lệnh đó ra khỏi sụt vốn và phong độ R.">
        <div className="cap-accounts">
          {ASSET_GROUPS.filter((g) => g.key !== "other").map((g) => (
            <label key={g.key} className="mc-check cap-account">
              <input type="checkbox" checked={groups.includes(g.key)} onChange={() => toggleGroup(g.key)} />
              <span>{g.label}</span>
            </label>
          ))}
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

// Bảng chọn nhóm tài sản để tách ra một mảng riêng (VD hàng hóa của Trading - H4 đi vốn nhỏ hơn FX).
function SplitPicker({ plan, market, accounts, onSplit, onClose }) {
  const claimed = claimedAssetGroups(plan, market, accounts);
  const [groups, setGroups] = useState(() => (claimed.commodity ? [] : ["commodity"]));
  const [side, setSide] = useState(true);
  const toggle = (key) => setGroups((p) => (p.includes(key) ? p.filter((x) => x !== key) : [...p, key]));
  return (
    <div className="cap-split">
      <b className="cap-split-title">Tách nhóm tài sản ra mảng riêng</b>
      <p className="field-hint" style={{ margin: "2px 0 8px" }}>
        Mảng mới gắn cùng tài khoản, chỉ nhận lệnh của nhóm đã chọn, có vốn và mức risk riêng. Mảng này giữ các nhóm còn lại.
      </p>
      <div className="cap-accounts">
        {ASSET_GROUPS.filter((g) => g.key !== "other").map((g) => (
          <label key={g.key} className={`mc-check cap-account ${claimed[g.key] ? "cap-split-taken" : ""}`} title={claimed[g.key] ? `Đã có mảng "${claimed[g.key]}"` : undefined}>
            <input type="checkbox" disabled={!!claimed[g.key]} checked={groups.includes(g.key)} onChange={() => toggle(g.key)} />
            <span>{g.label}{claimed[g.key] ? <small className="field-hint"> · đã tách</small> : null}</span>
          </label>
        ))}
      </div>
      <label className="mc-check cap-side-check" style={{ marginTop: 6 }}>
        <input type="checkbox" checked={side} onChange={(e) => setSide(e.target.checked)} />
        <span>Để ở Tài khoản phụ (không nhắc chọn mức mỗi tuần)</span>
      </label>
      <div className="cap-editor-foot">
        <button type="button" className="btn btn-primary" disabled={!groups.length} onClick={() => onSplit(groups, side)}><Split size={14} /> Tách</button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Hủy</button>
      </div>
    </div>
  );
}

const fmtMonths = (n) => { const y = Math.floor(n / 12); const mo = n % 12; return [y ? `${y} năm` : "", mo ? `${mo} tháng` : ""].filter(Boolean).join(" ") || "ngay bây giờ"; };
const monthsFromNow = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n); return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
const fmtUsd = (v) => fmtMoney(Math.round(v), "USD");
const pctText = (v) => `${(v * 100).toFixed(1).replace(".", ",")}%`;

const ymLabel = (ym) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : "—");
const r1 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : Number(v.toFixed(1)).toString().replace(".", ","));
const perWeek = (monthly) => (monthly * 12) / 52;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// Tính hết số liệu lộ trình một lần — thẻ mảng (tóm tắt) và khối Lộ trình (chi tiết) dùng chung.
function roadmapCalc(market, st, today) {
  const lad = market.ladder;
  const rp = lad.plan || {};
  const tiers = (market.tiers || []).filter((x) => x > 0);
  const pct = rp.pct || Number(market.defaultTier) || tiers[Math.floor((tiers.length - 1) / 2)] || 1;
  const target = rp.targetRisk || 1500;
  const actualR = st.rPerMonth && st.rPerMonth > 0 ? Math.round(st.rPerMonth * 10) / 10 : null;
  const monthlyR = rp.monthlyR || actualR || 5;
  const fromYm = today.slice(0, 7);
  const opts = { equity: st.equity, base: st.base, stepPct: lad.stepPct, pct, plan: rp, targetRisk: target, fromYm };
  const main = simulateRoadmap({ ...opts, monthlyR, full: true });
  const reachYm = main.months !== null ? ymAdd(fromYm, main.months) : null;
  const deadlineMonths = rp.deadline ? ymDiff(fromYm, rp.deadline) : null;
  const needR = deadlineMonths !== null && deadlineMonths > 0 ? requiredMonthlyR(opts, deadlineMonths) : null;
  const riskNow = (st.base * pct) / 100;
  const toNextR = st.pendingUp ? 0 : riskNow > 0 ? (st.next - st.equity) / riskNow : null;
  // Lộ trình đã chốt: hôm nay đáng lẽ vốn bao nhiêu, đang hơn / kém mấy R, từ giờ cần bao nhiêu R để kịp.
  const snap = rp.snapshot || null;
  let progress = null;
  if (snap) {
    const planned = snapshotEquityAt(snap, lad.stepPct, today);
    const due = snap.deadline || snap.reachYm || "";
    const left = due ? ymDiff(fromYm, due) : null;
    progress = {
      snap, planned, diff: st.equity - planned, diffR: riskNow > 0 ? (st.equity - planned) / riskNow : null, due,
      needNow: left !== null && left > 0 ? requiredMonthlyR({ ...opts, pct: snap.pct || pct, targetRisk: snap.targetRisk || target, plan: snap }, left) : null,
      left,
    };
  }
  return { rp, pct, target, monthlyR, actualR, fromYm, main, reachYm, deadlineMonths, needR, riskNow, toNextR, progress };
}

// Bảng các bậc: chỉ những lần LÊN BẬC (lúc tiền rủi ro thật sự đổi), tiền nạp gộp vào dòng của
// bậc kế tiếp — nạp hằng tháng không còn đẻ ra cả chục dòng.
function roadmapSteps(c, st) {
  const out = [{ key: "now", n: 0, ym: c.fromYm, i: 0, base: st.base, dep: 0, equity: st.equity }];
  let dep = 0;
  c.main.events.forEach((e, k) => {
    if (e.kind === "deposit") { dep += e.amount; return; }
    out.push({ key: k, n: out.length, ym: e.ym, i: e.i, base: e.base, dep, equity: e.equity });
    dep = 0;
  });
  return out;
}

// Biểu đồ bậc thang: tiền 1 lệnh theo bậc (đường bậc thang) so với % số dư (đường mờ) — thấy rõ số
// dư đổi liên tục nhưng tiền rủi ro chỉ nhảy khi lên bậc. Vạch ngang = mục tiêu, vạch đứng = hạn.
function RoadmapChart({ c }) {
  const W = 720, H = 210, L = 52, R = 12, T = 12, B = 26;
  const path = c.main.path;
  const end = Math.max(6, (c.main.months ?? Math.min(path.length - 1, 60)) + 2, c.deadlineMonths || 0);
  const pts = path.filter((p) => p.i <= end);
  if (pts.length < 2) return null;
  const risk = (v) => (v * c.pct) / 100;
  const maxY = Math.max(c.target * 1.12, ...pts.map((p) => risk(p.equity)));
  const x = (i) => L + (i / end) * (W - L - R);
  const y = (v) => T + (1 - v / maxY) * (H - T - B);
  let stair = `M${x(0)},${y(risk(pts[0].base))}`;
  pts.slice(1).forEach((p, k) => { stair += ` H${x(p.i)} V${y(risk(p.base))}`; if (k === pts.length - 2) stair += ` H${x(p.i)}`; });
  const eq = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(risk(p.equity))}`).join(" ");
  const years = [];
  for (let i = 0; i <= end; i++) { const ym = ymAdd(c.fromYm, i); if (ym.endsWith("-01")) years.push({ i, label: ym.slice(0, 4) }); }
  const ticks = [0, maxY / 2, c.target].filter((v, k, a) => a.findIndex((u) => Math.abs(u - v) < maxY * 0.08) === k);
  return (
    <svg className="cap-road-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tiền rủi ro mỗi lệnh theo bậc">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === c.target ? "cap-road-chart-goal" : "cap-road-chart-grid"} />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" className={`cap-road-chart-lbl ${v === c.target ? "is-goal" : ""}`}>{fmtUsd(v)}</text>
        </g>
      ))}
      {years.map((t) => (
        <g key={t.i}>
          <line x1={x(t.i)} x2={x(t.i)} y1={T} y2={H - B} className="cap-road-chart-grid" />
          <text x={x(t.i) + 3} y={H - 8} className="cap-road-chart-lbl">{t.label}</text>
        </g>
      ))}
      {c.deadlineMonths > 0 && c.deadlineMonths <= end ? (
        <g>
          <line x1={x(c.deadlineMonths)} x2={x(c.deadlineMonths)} y1={T} y2={H - B} className="cap-road-chart-due" />
          <text x={x(c.deadlineMonths) - 4} y={T + 10} textAnchor="end" className="cap-road-chart-lbl">hạn {ymLabel(c.rp.deadline)}</text>
        </g>
      ) : null}
      <path d={eq} className="cap-road-chart-eq" />
      <path d={stair} className="cap-road-chart-stair" />
      {c.main.months !== null && c.main.months <= end ? <circle cx={x(c.main.months)} cy={y(risk(path[c.main.months].base))} r="4" className="cap-road-chart-dot" /> : null}
    </svg>
  );
}

// Tab Lộ trình: đặt mục tiêu + kế hoạch nạp → bao giờ tới, cần R/tháng · R/tuần · lệnh/tuần bao nhiêu
// để kịp hạn, các bậc sẽ đi qua; chốt lộ trình để mỗi tuần so thực tế với kế hoạch.
function LadderRoadmap({ market, st, today, onSave }) {
  const lad = market.ladder;
  const c = roadmapCalc(market, st, today);
  const { rp, pct, target, monthlyR, main, reachYm, needR, progress } = c;
  const save = (patch) => onSave({ ...market, ladder: { ...lad, plan: { ...rp, ...patch } } });
  const tiers = (market.tiers || []).filter((x) => x > 0);
  const tradesFor = (rWeek) => (st.perTrade && st.perTrade > 0 ? rWeek / st.perTrade : null);
  const lock = () => save({
    snapshot: {
      date: today, equity: st.equity, base: st.base, monthlyR, pct,
      depAmount: rp.depAmount || 0, depEvery: rp.depEvery || "year", depMonth: rp.depMonth || 1,
      targetRisk: target, deadline: rp.deadline || "", reachYm: reachYm || "",
    },
  });
  const goalWeek = perWeek(progress ? progress.snap.monthlyR : monthlyR);
  const weekKeys = [];
  for (let k = thisWeekKey(today), n = 0; n < 8; n++) {
    if (progress && k < thisWeekKey(progress.snap.date)) break;
    if (k < thisWeekKey(lad.from)) break;
    weekKeys.push(k);
    const d = new Date(`${k}T00:00:00`); d.setDate(d.getDate() - 7);
    k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const steps = roadmapSteps(c, st);
  const hitIdx = steps.findIndex((r) => (r.base * pct) / 100 >= target - 0.005);
  const shown = steps.slice(0, hitIdx >= 0 ? hitIdx + 1 : 30);
  const okWeeks = weekKeys.filter((k) => k !== thisWeekKey(today) && (st.weekR[k] || { r: 0 }).r >= goalWeek - 0.005).length;
  const doneWeeks = weekKeys.filter((k) => k !== thisWeekKey(today)).length;
  return (
    <section className="cap-road" id={`roadmap-${market.id}`}>
      <div className="cap-road-in">
        <label>1 lệnh đạt ($)<BlurNumber value={target} min="0" onCommit={(n) => save({ targetRisk: Math.max(0, n) })} /></label>
        <label>Ở mức
          <select className="input" value={pct} onChange={(e) => save({ pct: Number(e.target.value) })}>
            {[...new Set([...tiers, pct])].sort((a, b) => a - b).map((x) => <option key={x} value={x}>{fmtPctVN(x)}</option>)}
          </select>
        </label>
        <label>Kế hoạch nạp ($)<BlurNumber value={rp.depAmount || 0} min="0" onCommit={(n) => save({ depAmount: Math.max(0, n) })} /></label>
        <label>Nạp
          <span className="cap-road-pair">
            <select className="input" value={rp.depEvery || "year"} onChange={(e) => save({ depEvery: e.target.value })}>
              <option value="month">mỗi tháng</option>
              <option value="year">mỗi năm</option>
            </select>
            {(rp.depEvery || "year") === "year" ? (
              <select className="input" value={rp.depMonth || 1} onChange={(e) => save({ depMonth: Number(e.target.value) })} title="Nạp vào tháng nào">
                {MONTHS.map((mo) => <option key={mo} value={mo}>tháng {mo}</option>)}
              </select>
            ) : null}
          </span>
        </label>
        <label>R / tháng dự tính<BlurNumber value={monthlyR} step="0.5" onCommit={(n) => save({ monthlyR: n })} /></label>
        <label>Muốn đạt trước
          <input type="month" className="input" value={rp.deadline || ""} min={ymAdd(c.fromYm, 1)} onChange={(e) => save({ deadline: e.target.value })} />
        </label>
      </div>
      <p className="field-hint cap-road-hint">
        {(rp.depAmount || 0) > 0 ? `Nạp ${fmtUsd(rp.depAmount)} ${rp.depEvery === "month" ? "mỗi tháng" : `vào tháng ${rp.depMonth || 1} mỗi năm`} (≈ ${fmtUsd(rp.depEvery === "month" ? rp.depAmount * 12 : rp.depAmount)}/năm) — nạp chỉ cộng vào số dư, tiền rủi ro đổi khi số dư vượt mốc. ` : "Chưa có kế hoạch nạp. "}
        Thực tế từ {ddmm(lad.from)}: {c.actualR !== null ? `${fmtRVN(c.actualR)}/tháng` : "chưa đủ 4 tuần"}{st.perTrade !== null ? ` · kỳ vọng ${fmtRVN(st.perTrade)}/lệnh · ${r1(st.tradesPerWeek)} lệnh/tuần` : ""}.
      </p>

      <div className="cap-road-kpis">
        <div className="cap-road-kpi">
          <span>Với {r1(monthlyR)}R/tháng ({r1(perWeek(monthlyR))}R/tuần)</span>
          <b>{reachYm ? ymLabel(reachYm) : "không tới"}</b>
          <small>{main.months !== null ? `sau ${fmtMonths(main.months)}` : "R/tháng âm hoặc quá thấp"}</small>
        </div>
        <div className={`cap-road-kpi ${rp.deadline && needR === null ? "is-bad" : ""}`}>
          <span>{rp.deadline ? `Muốn đạt trước ${ymLabel(rp.deadline)}` : "Muốn đạt trước…"}</span>
          {!rp.deadline ? <b className="cap-road-dim">chọn tháng ở trên</b> : needR === null ? <b>quá gấp</b> : <b>{r1(perWeek(needR))}R/tuần</b>}
          <small>{rp.deadline && needR !== null
            ? `${r1(needR)}R/tháng${tradesFor(perWeek(needR)) !== null ? ` · ~${r1(tradesFor(perWeek(needR)))} lệnh/tuần với kỳ vọng hiện tại` : ""}`
            : rp.deadline ? "trên 30R/tháng cũng không kịp — lùi hạn hoặc nạp thêm" : "app tính R/tuần · lệnh/tuần cần"}</small>
        </div>
        <div className="cap-road-kpi">
          <span>Bậc kế {fmtUsd(st.next)} → 1 lệnh {fmtUsd((st.next * pct) / 100)}</span>
          <b>{st.pendingUp ? "đã đủ" : `còn ${r1(c.toNextR)}R`}</b>
          <small>{st.pendingUp ? "lên từ thứ 2 tuần sau" : monthlyR > 0 && c.toNextR !== null ? `≈ ${r1(c.toNextR / perWeek(monthlyR))} tuần với ${r1(perWeek(monthlyR))}R/tuần (chưa tính nạp)` : ""}</small>
        </div>
      </div>

      <div className="cap-road-chart-box">
        <RoadmapChart c={c} />
        <div className="cap-road-legend">
          <span><i className="cap-road-lg-stair" /> 1 lệnh {fmtPctVN(pct)} theo bậc</span>
          <span><i className="cap-road-lg-eq" /> {fmtPctVN(pct)} của số dư (chỉ để so)</span>
        </div>
      </div>

      <div className="cap-road-cols">
        <div className="cap-road-track">
          <div className="cap-road-track-head">
            <b>Theo dõi từng tuần</b>
            <span className="cap-road-track-btns">
              <button type="button" className="btn btn-ghost" onClick={lock} title="Lưu lộ trình hiện tại làm mốc so sánh">{progress ? "Chốt lại" : "Chốt lộ trình"}</button>
              {progress ? <button type="button" className="btn btn-ghost" onClick={() => save({ snapshot: null })}>Bỏ chốt</button> : null}
            </span>
          </div>
          {progress ? (
            <>
              <p className="field-hint" style={{ margin: 0 }}>Đã chốt {ddmm(progress.snap.date)}/{progress.snap.date.slice(2, 4)} · {r1(progress.snap.monthlyR)}R/tháng · đích {ymLabel(progress.due)}</p>
              <div className="cap-road-prog">
                <div><span>Kế hoạch hôm nay</span><b className="mono">{fmtUsd(progress.planned)}</b></div>
                <div><span>Thực tế</span><b className="mono">{fmtUsd(st.equity)}</b></div>
                <div className={progress.diff >= 0 ? "is-good" : "is-bad"}>
                  <span>{progress.diff >= 0 ? "Đi trước" : "Chậm hơn"}</span>
                  <b className="mono">{progress.diffR !== null ? `${progress.diff >= 0 ? "+" : "−"}${r1(Math.abs(progress.diffR))}R` : "—"}</b>
                  <small>{progress.diff >= 0 ? "+" : "−"}{fmtUsd(Math.abs(progress.diff))}</small>
                </div>
                <div>
                  <span>Từ giờ để kịp</span>
                  <b className="mono">{progress.needNow === null ? (progress.left !== null && progress.left <= 0 ? "đã tới hạn" : "quá gấp") : `${r1(perWeek(progress.needNow))}R/tuần`}</b>
                  <small>{progress.needNow !== null ? `${r1(progress.needNow)}R/tháng` : ""}</small>
                </div>
              </div>
            </>
          ) : <p className="field-hint" style={{ margin: 0 }}>Bấm Chốt lộ trình để app lưu kế hoạch này làm mốc — từ đó mỗi tuần so thực tế với kế hoạch: đi trước hay chậm bao nhiêu R, cần bao nhiêu R/tuần để kịp.</p>}
          {weekKeys.length ? (
            <>
              <table className="cap-road-weeks">
                <thead><tr><th>Tuần</th><th>Lệnh</th><th>R</th><th>Mục tiêu {fmtRVN(goalWeek)}</th></tr></thead>
                <tbody>
                  {weekKeys.map((k) => {
                    const w = st.weekR[k] || { r: 0, n: 0 };
                    const current = k === thisWeekKey(today);
                    const ok = w.r >= goalWeek - 0.005;
                    return (
                      <tr key={k} className={current ? "is-current" : ok ? "is-ok" : "is-miss"}>
                        <td className="mono">{weekLabel(k)}{current ? " ·  nay" : ""}</td>
                        <td className="mono">{w.n}</td>
                        <td className="mono">{fmtRVN(w.r)}</td>
                        <td>{current ? (ok ? "✓ đạt" : `còn ${r1(goalWeek - w.r)}R`) : ok ? "✓" : `✗ thiếu ${r1(goalWeek - w.r)}R`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {doneWeeks ? <p className="field-hint" style={{ margin: 0 }}>Đạt mục tiêu {okWeeks}/{doneWeeks} tuần đã xong.</p> : null}
            </>
          ) : null}
        </div>

        <div className="cap-road-steps">
          <b className="cap-road-steps-title">Các bậc sẽ đi qua</b>
          <table className="cap-road-table">
            <thead><tr><th>Bậc</th><th>Khoảng</th><th>1 lệnh</th><th>Vốn tính rủi ro</th><th>Nạp trước đó</th></tr></thead>
            <tbody>
              {shown.map((r, k) => {
                const prev = k ? shown[k - 1] : null;
                return (
                  <tr key={r.key} className={`${k === 0 ? "is-now" : ""} ${k === hitIdx ? "is-goal" : ""}`}>
                    <td className="mono">{k === 0 ? "nay" : `▲ ${k}`}{k === hitIdx ? " 🎯" : ""}</td>
                    <td className="mono">{k === 0 ? "hiện tại" : <>{ymLabel(r.ym)} <small>· {fmtMonths(r.i)}</small></>}</td>
                    <td className="mono"><b>{fmtUsd((r.base * pct) / 100)}</b>{prev ? <small> +{fmtUsd(((r.base - prev.base) * pct) / 100)}</small> : null}</td>
                    <td className="mono">{fmtUsd(r.base)}</td>
                    <td className="mono field-hint">{r.dep ? `+${fmtUsd(r.dep)}` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hitIdx < 0 && steps.length > shown.length ? <p className="field-hint" style={{ margin: 0 }}>… còn {steps.length - shown.length} bậc nữa.</p> : null}
        </div>
      </div>
      <p className="field-hint" style={{ margin: 0 }}>Giả định tháng nào cũng ra đều R, lên bậc xét cuối tháng — thực tế có tháng âm và lên bậc chốt theo tuần. Coi các con số là mốc để bám, không phải lời hứa.</p>
    </section>
  );
}

// Tab con "Lộ trình" của Phân bổ vốn — mỗi mảng bật bậc vốn một lộ trình, nhiều mảng thì chọn ở hàng chip.
function RoadmapTab({ plan, ladders, accounts, today, focusId, setFocusId, onSave }) {
  const list = plan.markets.filter((m) => ladders[m.id]);
  if (!list.length) {
    return (
      <div className="cap-road cap-road-empty">
        <TrendingUp size={18} />
        <p>Chưa có mảng nào bật <b>Bậc vốn tự tăng</b>. Ở tab Phân bổ, bấm ✏️ Sửa một mảng → tick "Bậc vốn tự tăng", điền vốn gốc và ngày bắt đầu — lộ trình hiện ở đây.</p>
      </div>
    );
  }
  const cur = list.find((m) => m.id === focusId) || list[0];
  return (
    <div>
      {list.length > 1 ? (
        <div className="cap-road-pick">
          {list.map((m) => (
            <button key={m.id} type="button" className={`cap-road-pick-btn ${m.id === cur.id ? "is-on" : ""}`} style={marketColorStyle(m, accounts)} onClick={() => setFocusId(m.id)}>
              {m.name}<small>{fmtUsd(ladders[m.id].base)}</small>
            </button>
          ))}
        </div>
      ) : null}
      <div className="cap-road-title">
        <b>{cur.name}</b>
        <span className="field-hint" style={{ margin: 0 }}>số dư {fmtUsd(ladders[cur.id].equity)} · vốn tính rủi ro {fmtUsd(ladders[cur.id].base)} (bậc {ladders[cur.id].level}) · mốc kế {fmtUsd(ladders[cur.id].next)}</span>
      </div>
      <LadderRoadmap market={cur} st={ladders[cur.id]} today={today} onSave={onSave} />
    </div>
  );
}

const LADDER_KIND = { up: "▲ Lên bậc", down: "▼ Hạ bậc", deposit: "＋ Nạp" };

function LadderBox({ market, st, today, onOpenRoadmap }) {
  const [open, setOpen] = useState("");
  const road = roadmapCalc(market, st, today);
  const lad = market.ladder;
  const pct = Number(market.defaultTier) || (market.tiers || [])[0] || 1;
  const lo = st.downAt ?? st.floor;
  const pos = st.next > lo ? Math.max(0, Math.min(100, ((st.equity - lo) / (st.next - lo)) * 100)) : 100;
  const toggle = (k) => setOpen((v) => (v === k ? "" : k));
  return (
    <div className={`cap-ladder ${st.pendingUp ? "is-up" : ""}`}>
      <div className="cap-ladder-head">
        <TrendingUp size={14} /> <b>Bậc vốn</b>
        <span className="cap-ladder-lv">bậc {st.level}</span>
        <span className="field-hint" style={{ margin: 0 }}>+{lad.stepPct}% mỗi bậc</span>
      </div>
      <div className="cap-ladder-kpis">
        <div><span>Vốn tính rủi ro</span><b className="mono">{fmtUsd(st.base)}</b><small>{fmtPctVN(pct)} = {fmtUsd((st.base * pct) / 100)}</small></div>
        <div><span>Vốn hiện tại</span><b className="mono">{fmtUsd(st.equity)}</b><small>{st.tradeCount} lệnh từ {ddmm(lad.from)}</small></div>
        <div><span>Mốc kế tiếp</span><b className="mono">{fmtUsd(st.next)}</b><small>{st.pendingUp ? "đã đủ" : st.toNext !== null ? `còn +${pctText(st.toNext)}` : ""}</small></div>
      </div>
      <div className="cap-ladder-track" title={`${fmtUsd(lo)} → ${fmtUsd(st.next)}`}>
        <span className="cap-ladder-fill" style={{ width: `${pos}%` }} />
      </div>
      {st.pendingUp ? (
        <p className="cap-ladder-note is-up">▲ Đã vượt mốc — từ thứ 2 tuần sau rủi ro {fmtPctVN(pct)} = {fmtUsd((st.next * pct) / 100)} (chốt theo vốn cuối tuần).</p>
      ) : null}
      <p className="field-hint cap-ladder-note">
        {st.downAt !== null
          ? `Vốn về dưới ${fmtUsd(st.downAt)} thì tự hạ về bậc ${fmtUsd(Math.max(st.floor, st.base / (1 + lad.stepPct / 100)))}.`
          : `Đang ở bậc gốc ${fmtUsd(st.floor)} — không hạ thêm; lỗ sâu hơn thì dùng mức cầm chừng.`}
      </p>
      <p className="cap-ladder-goal">
        🎯 {fmtUsd(road.target)}/lệnh: {road.reachYm ? <><b>≈ {ymLabel(road.reachYm)}</b> với {r1(road.monthlyR)}R/tháng</> : "chưa tới với R/tháng đang đặt"}
        {road.progress ? <span className={road.progress.diff >= 0 ? "is-good" : "is-bad"}> · {road.progress.diff >= 0 ? "đi trước" : "chậm"} {r1(Math.abs(road.progress.diffR || 0))}R</span> : null}
      </p>
      <div className="cap-ladder-tabs">
        <button type="button" className="btn btn-ghost" onClick={onOpenRoadmap}>Xem lộ trình →</button>
        <button type="button" className={`btn btn-ghost ${open === "hist" ? "is-on" : ""}`} onClick={() => toggle("hist")}>Lịch sử bậc ({st.history.length})</button>
      </div>
      {open === "hist" ? (
        st.history.length ? (
          <table className="cap-ladder-hist">
            <tbody>
              {[...st.history].reverse().map((h, i) => (
                <tr key={i} className={`is-${h.kind}`}>
                  <td className="mono">{ddmm(h.date)}/{h.date.slice(2, 4)}</td>
                  <td>{LADDER_KIND[h.kind]}{h.kind === "deposit" ? ` ${fmtUsd(h.amount)}` : ""}</td>
                  <td className="mono">{fmtUsd(h.from)} → {fmtUsd(h.to)}</td>
                  <td className="mono field-hint">vốn {fmtUsd(h.equity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="field-hint" style={{ margin: "6px 0 0" }}>Chưa lên / hạ bậc lần nào kể từ {ddmm(lad.from)}.</p>
      ) : null}
    </div>
  );
}

function MarketCard({ plan, market, dd, ladder, weeks, accounts, onPick, onSave, onDelete, onMove, onSplit, startEditing, scope }) {
  const [editing, setEditing] = useState(!!startEditing);
  const [splitting, setSplitting] = useState(false);
  // Chỉ mảng chung (không chọn nhóm) mới tách được — mảng đã giới hạn nhóm thì sửa thẳng ở ô Sửa.
  const canSplit = !!onSplit && !(market.assetGroups || []).length && market.accountIds.length > 0;
  const now = pickedTier(plan, market.id, weeks.now);
  const next = pickedTier(plan, market.id, weeks.next);
  const safest = safestTier(market);
  const safestIsHold = safest !== null && safest === market.holdTier;
  const linked = accounts.filter((a) => market.accountIds.includes(a.id));
  const mk = marketColor(market, accounts);
  if (editing) {
    return (
      <div className="cap-card">
        <MarketEditor market={market} accounts={accounts} startDate={plan.startDate} onCancel={() => (startEditing ? onDelete() : setEditing(false))}
          onSave={(m) => { onSave(m); setEditing(false); }} onDelete={startEditing ? null : onDelete} />
      </div>
    );
  }
  return (
    <div className={`cap-card cap-card-${dd.level} ${mk ? "has-mk" : ""}`} style={marketColorStyle(market, accounts)}>
      <div className="cap-card-head">
        <b className="cap-card-name">{mk ? <span className="cap-mk-dot" /> : null}{market.name}</b>
        <span className="cap-card-sub mono">
          {market.side ? "ước lượng " : ""}{ladder ? <TrendingUp size={11} style={{ verticalAlign: -1, marginRight: 3 }} /> : null}{fmtMoney(market.allocated, "USD")}
          {market.currency !== "USD" ? ` ≈ ${fmtMoney(market.allocated * market.rate, market.currency)}` : ""}
        </span>
        {onMove ? (
          <span className="cap-move">
            <button type="button" className="row-btn" disabled={!onMove.canLeft} onClick={() => onMove(-1)} title="Dời sang trái"><ChevronLeft size={13} /></button>
            <button type="button" className="row-btn" disabled={!onMove.canRight} onClick={() => onMove(1)} title="Dời sang phải"><ChevronRight size={13} /></button>
          </span>
        ) : null}
        {canSplit ? (
          <button type="button" className={`row-btn ${splitting ? "row-btn-on" : ""}`} onClick={() => setSplitting((v) => !v)}
            title="Tách nhóm tài sản (VD hàng hóa) ra mảng riêng để đi vốn khác"><Split size={13} /></button>
        ) : null}
        <button type="button" className="row-btn" onClick={() => setEditing(true)} title="Sửa mảng (đổi tên, màu, mức rủi ro…)"><Pencil size={13} /></button>
      </div>
      {scope ? <span className={`cap-scope ${scope.child ? "cap-scope-child" : ""}`}>{scope.child ? <CornerDownRight size={12} /> : null}{scope.text}</span> : null}
      {splitting ? (
        <SplitPicker plan={plan} market={market} accounts={accounts} onClose={() => setSplitting(false)}
          onSplit={(groups, side) => { setSplitting(false); onSplit(groups, side); }} />
      ) : null}

      {ladder ? <LadderBox market={market} st={ladder} today={weeks.today} onOpenRoadmap={() => weeks.openRoadmap(market.id)} /> : null}

      <table className="cap-tiers">
        <thead><tr><th>Rủi ro</th><th>Tiền / lệnh</th><th>Quy ra vốn tổng</th></tr></thead>
        <tbody>
          {marketTierList(market).map(({ pct, hold }) => (
            <tr key={pct} className={`${hold ? "cap-tier-hold" : ""} ${pct === now.pct ? "cap-tier-on" : ""}`}>
              <td className="mono">{fmtPctVN(pct)}{hold ? <span className="cap-hold-tag">cầm chừng</span> : null}</td>
              <td className="mono">{fmtMoney(tierMoney(market, pct), market.currency)}</td>
              <td className="mono">{fmtPctVN(tierShareOfTotal(plan, market, pct))}{pct === now.pct ? <span className="cap-arrow" title="Mức tuần này"> ←</span> : null}</td>
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
        {(market.assetGroups || []).length ? <span>Chỉ tính: {groupLabels(market.assetGroups)}</span> : null}
      </div>
    </div>
  );
}

// ——— Phong độ R → gợi ý mức tuần sau ———
const RULE_LABELS = [
  ["downW1", "Hạ 1 bậc khi 1 tuần ≤", "R"],
  ["downW2", "Hạ 1 bậc khi 2 tuần ≤", "R"],
  ["holdM", "Về cầm chừng khi 4 tuần ≤", "R"],
  ["upW1", "Tăng 1 bậc khi 1 tuần ≥", "R"],
  ["upM", "… và 4 tuần ≥", "R"],
  ["minUp", "… và 1 tuần có ít nhất", "lệnh"],
];

function RuleEditor({ market, onSave, onCopyAll }) {
  const rule = normalizeRRule(market.rRule);
  const set = (k, v) => onSave({ ...market, rRule: normalizeRRule({ ...rule, [k]: v }) });
  const isDefault = Object.keys(R_RULE_DEFAULT).every((k) => rule[k] === R_RULE_DEFAULT[k]);
  return (
    <div className="cap-rp-rule">
      <div className="cap-rp-rule-grid">
        {RULE_LABELS.map(([k, label, unit]) => (
          <label key={k} className="cap-rp-rule-field">
            <span>{label}</span>
            <span className="cap-rp-rule-input">
              <BlurNumber value={rule[k]} step={k === "minUp" ? "1" : "0.5"} min={k === "minUp" ? "0" : undefined} onCommit={(n) => set(k, n)} />
              <small>{unit}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="cap-rp-rule-actions">
        {!isDefault ? <button type="button" className="btn btn-ghost cap-suggest-btn" onClick={() => onSave({ ...market, rRule: { ...R_RULE_DEFAULT } })}>Về mặc định</button> : null}
        <button type="button" className="btn btn-ghost cap-suggest-btn" onClick={() => onCopyAll(rule)}>Áp bộ luật này cho mọi mảng</button>
      </div>
    </div>
  );
}

function RPerformancePanel({ plan, trades, resources, dds, today, weeks, onChange }) {
  const [openRule, setOpenRule] = useState(null);
  const accounts = resources.accounts || [];
  const ranges = rWindowRanges(today);
  const rows = useMemo(() => marketDisplayOrder(plan, accounts).map(({ m, parentId }) => {
    const stats = marketRStats(m, trades, accounts, today, plan);
    return { m, parentId, stats, s: suggestNextTier(plan, m, stats, dds[m.id], today), next: pickedTier(plan, m.id, weeks.next) };
  }), [plan, trades, accounts, dds, today, weeks.next]);
  const pending = rows.filter((r) => r.s && r.s.action !== "none" && !(r.next.explicit && r.next.pct === r.s.pct));
  const count = (a) => rows.filter((r) => r.s && r.s.action === a).length;
  const saveMarket = (m) => onChange({ ...plan, markets: plan.markets.map((x) => (x.id === m.id ? m : x)) });
  const copyAll = (rule) => onChange({ ...plan, markets: plan.markets.map((x) => ({ ...x, rRule: { ...rule } })) });
  const applyAll = () => onChange(pending.reduce((p, r) => setPick(p, weeks.next, r.m.id, r.s.pct), plan));

  return (
    <div className="cap-rp">
      <div className="cap-rp-head">
        <h3 className="block-title" style={{ margin: 0 }}><Gauge size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Phong độ R → gợi ý mức tuần sau</h3>
        <span className="cap-rp-counts">
          {count("down") ? <span className="cap-rp-count cap-rp-count-down">▼ {count("down")} nên hạ</span> : null}
          {count("up") ? <span className="cap-rp-count cap-rp-count-up">▲ {count("up")} nên tăng</span> : null}
          {count("same") ? <span className="cap-rp-count">= {count("same")} giữ</span> : null}
        </span>
        {pending.length ? (
          <button type="button" className="btn btn-ghost cap-suggest-btn cap-rp-applyall" onClick={applyAll}>
            <Check size={13} /> Áp dụng {pending.length} gợi ý cho tuần {weekLabel(weeks.next)}
          </button>
        ) : null}
      </div>
      <p className="field-hint cap-rp-hint">
        R cộng dồn theo ngày đóng lệnh: 1 tuần {ddmm(ranges[0].from)}–{ddmm(ranges[0].to)} · 2 tuần từ {ddmm(ranges[1].from)} · 4 tuần từ {ddmm(ranges[2].from)}
        {weeks.nudge ? "." : " — tuần này chưa xong nên gợi ý còn đổi."} Dưới mỗi ô: ▼ ngưỡng hạ, ▲ ngưỡng tăng, <Shield size={10} style={{ verticalAlign: -1 }} /> ngưỡng về cầm chừng — ô có viền màu là khung đã chạm ngưỡng.
      </p>

      <div className="cap-rp-grid">
        {rows.map(({ m, parentId, stats, s, next }) => {
          const applied = s && next.explicit && next.pct === s.pct;
          const action = s ? s.action : "none";
          const rule = s ? s.rule : normalizeRRule(m.rRule);
          const verdict = !s ? "Chưa có mức" : action === "none" ? "Chưa gắn tài khoản"
            : action === "up" ? "Tăng 1 bậc" : action === "down" ? (s.hold ? "Về cầm chừng" : `Hạ ${s.steps || 1} bậc`) : "Giữ mức";
          // Ngưỡng viết tắt cho gọn thẻ; rê chuột vào ô có đủ chữ.
          const thresholds = {
            w1: <>▼{fmtRVN(rule.downW1)} ▲{fmtRVN(rule.upW1)}</>,
            w2: <>▼{fmtRVN(rule.downW2)}</>,
            w4: <><Shield size={9} style={{ verticalAlign: -1 }} />{fmtRVN(rule.holdM)}</>,
          };
          const thresholdTip = {
            w1: `Hạ 1 bậc khi ≤ ${fmtRVN(rule.downW1)}; tăng 1 bậc khi ≥ ${fmtRVN(rule.upW1)} (kèm 4 tuần ≥ ${fmtRVN(rule.upM)}, tối thiểu ${rule.minUp} lệnh)`,
            w2: `Hạ 1 bậc khi ≤ ${fmtRVN(rule.downW2)}`,
            w4: `Về cầm chừng khi ≤ ${fmtRVN(rule.holdM)}`,
          };
          return (
            <div key={m.id} className={`cap-rp-card cap-rp-act-${action} ${marketColor(m, accounts) ? "has-mk" : ""}`} style={marketColorStyle(m, accounts)}>
              <div className="cap-rp-card-head">
                <b className="cap-rp-card-name">{parentId ? <CornerDownRight size={12} className="cap-child-mark" /> : null}{marketColor(m, accounts) ? <span className="cap-mk-dot" /> : null}{m.name}</b>
                {m.side ? <small className="cap-side-tag">phụ</small> : null}
                <span className="cap-rp-verdict">{verdict}</span>
                <button type="button" className={`row-btn ${openRule === m.id ? "row-btn-on" : ""}`} title="Luật gợi ý của mảng này"
                  onClick={() => setOpenRule(openRule === m.id ? null : m.id)}><Settings2 size={13} /></button>
              </div>

              <div className="cap-rp-wins">
                {R_WINDOWS.map((w) => {
                  const x = stats.windows[w.key];
                  const hit = s && s.hits ? s.hits[w.key] : null;
                  const tip = `${ddmm(x.from)}–${ddmm(x.to)}: ${x.n} lệnh có R` + (x.n ? ` · thắng ${Math.round((x.wins / x.n) * 100)}% · TB ${fmtRVN(x.avg)}/lệnh` : "")
                    + (x.missing ? ` · ${x.missing} lệnh đã đóng thiếu tiền rủi ro nên không tính` : "") + `\n${thresholdTip[w.key]}`;
                  return (
                    <div key={w.key} className={`cap-rp-box ${x.n ? (x.r > 0 ? "cap-rp-box-pos" : x.r < 0 ? "cap-rp-box-neg" : "") : "cap-rp-box-empty"} ${hit ? `cap-rp-box-hit cap-rp-box-hit-${hit}` : ""}`} title={tip}>
                      <span className="cap-rp-box-label">{w.label}</span>
                      <b className="mono">{x.n ? fmtRVN(x.r) : "—"}</b>
                      <small>{x.n ? `${x.wins}/${x.n} thắng` : "chưa có lệnh"}{x.missing ? ` · ${x.missing} thiếu R` : ""}</small>
                      <small className="cap-rp-box-thr">{thresholds[w.key]}</small>
                    </div>
                  );
                })}
              </div>

              {s && action !== "none" ? (
                <div className="cap-rp-move">
                  <span className="cap-rp-move-cell"><small>Tuần này</small><b className="mono">{fmtPctVN(s.base)}</b></span>
                  <span className="cap-rp-move-arrow">→</span>
                  <span className="cap-rp-move-cell cap-rp-move-to">
                    <small>Gợi ý tuần sau</small>
                    <b className="mono">{fmtPctVN(s.pct)}{s.hold ? <small className="cap-hold-tag"><Shield size={10} /> cầm chừng</small> : null}</b>
                  </span>
                  {applied ? (
                    <span className="cap-rp-applied"><Check size={12} /> Đã chọn</span>
                  ) : (
                    <button type="button" className={`btn ${action === "same" ? "btn-ghost" : "btn-primary"} cap-rp-apply`}
                      onClick={() => onChange(setPick(plan, weeks.next, m.id, s.pct))}>
                      {action === "same" ? `Giữ ${fmtPctVN(s.pct)}` : "Áp dụng"}
                    </button>
                  )}
                </div>
              ) : null}
              <small className="cap-rp-why">
                {s ? s.reasons.join(" · ") : "Chưa có mức rủi ro"}
                {s && next.explicit && !applied ? <span className="cap-rp-why-note"> · tuần sau đang chọn {fmtPctVN(next.pct)}</span> : null}
              </small>
              {openRule === m.id ? <RuleEditor market={m} onSave={saveMarket} onCopyAll={copyAll} /> : null}
            </div>
          );
        })}
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
        Đúng giờ đã đặt, nếu còn mảng chưa chọn mức cho tuần sau thì bot gửi một tin kèm mức đang dùng,
        mức sụt vốn, R 1 / 2 / 4 tuần và mức gợi ý của từng mảng. Chọn đủ rồi thì không gửi.
      </p>
      {!ready ? <p className="field-hint" style={{ color: "var(--loss)", marginBottom: 10 }}>Chưa có Bot Token / Chat ID — điền ở Thông báo → Cài đặt trước.</p> : null}
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
  const [tab, setTab] = useStickyTab("capitalPlanTab", "plan", ["plan", "road"]);
  const [roadId, setRoadId] = useState("");
  const today = todayStr();
  const accounts = resources.accounts || [];
  const weeks = {
    now: thisWeekKey(today), next: nextWeekKey(today), nudge: isWeekend(today), today,
    openRoadmap: (id) => { setRoadId(id); setTab("road"); window.scrollTo({ top: 0, behavior: "smooth" }); },
  };
  const scale = capitalScale(plan);
  const dds = useMemo(() => Object.fromEntries(plan.markets.map((m) => [m.id, marketDrawdown(plan, m, trades, resources)])), [plan, trades, resources]);
  const ladders = useMemo(() => Object.fromEntries(plan.markets.filter(ladderOn).map((m) => [m.id, ladderState(plan, m, trades, resources, today)])), [plan, trades, resources, today]);
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
  // Mảng tách ra mở sẵn ô Sửa để điền vốn và mức risk; bấm Hủy ở đó là bỏ luôn mảng vừa tách.
  const splitMarket = (id, groups, side) => {
    const r = splitMarketByAssets(plan, id, groups, side, accounts);
    if (!r.id) return;
    setNewId(r.id);
    onChange(r.plan);
  };
  const fam = useMemo(() => marketFamilies(plan, accounts), [plan, accounts]);
  const looseMain = fam.loose.filter((m) => !m.side);
  const looseSide = fam.loose.filter((m) => m.side);
  const card = (m, i, group, scope) => {
    // Trong khối tài khoản thì mảng con luôn đứng sau mảng chung — không cho dời.
    let onMove = null;
    if (!scope) {
      onMove = (dir) => onChange(moveMarket(plan, m.id, dir));
      onMove.canLeft = i > 0;
      onMove.canRight = i < group.length - 1;
    }
    return (
      <MarketCard key={m.id} plan={plan} market={m} dd={dds[m.id]} ladder={ladders[m.id] || null} weeks={weeks} accounts={accounts} startEditing={m.id === newId}
        onPick={(week, pct) => onChange(setPick(plan, week, m.id, pct))} scope={scope}
        onSave={saveMarket} onDelete={() => deleteMarket(m.id)} onMove={onMove} onSplit={(groups, side) => splitMarket(m.id, groups, side)} />
    );
  };

  const roadCount = plan.markets.filter((m) => ladders[m.id]).length;
  const tabs = (
    <div className="subtabs">
      <button type="button" className={`subtab ${tab === "plan" ? "subtab-active" : ""}`} onClick={() => setTab("plan")}>
        <Scale size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Phân bổ
      </button>
      <button type="button" className={`subtab ${tab === "road" ? "subtab-active" : ""}`} onClick={() => setTab("road")}>
        <TrendingUp size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Lộ trình{roadCount ? ` (${roadCount})` : ""}
      </button>
    </div>
  );
  if (tab === "road") {
    return (
      <div>
        {tabs}
        <RoadmapTab plan={plan} ladders={ladders} accounts={accounts} today={today} focusId={roadId} setFocusId={setRoadId} onSave={saveMarket} />
      </div>
    );
  }

  return (
    <div>
      {tabs}
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

      {fam.families.map((f) => {
        const taken = f.children.flatMap((c) => c.assetGroups);
        const rest = ASSET_GROUPS.filter((g) => g.key !== "other" && !taken.includes(g.key)).map((g) => g.label);
        const total = [f.parent, ...f.children].reduce((s, m) => s + (Number(m.allocated) || 0), 0);
        return (
          <section key={f.parent.id} className="cap-family">
            <div className="cap-family-head">
              <Wallet size={15} />
              <b>{f.accounts.map((a) => a.name).join(", ") || f.parent.name}</b>
              <span className="field-hint">tài khoản sàn chia {f.children.length + 1} mảng · tổng vốn {fmtMoney(total, "USD")}</span>
            </div>
            <div className="cap-grid">
              {card(f.parent, 0, [], { text: `Mọi nhóm còn lại (${rest.slice(0, 3).join(", ")}${rest.length > 3 ? "…" : ""})` })}
              {f.children.map((c) => card(c, 0, [], { child: true, text: `Chỉ ${groupLabels(c.assetGroups)}${c.side ? " · tài khoản phụ" : ""}` }))}
            </div>
          </section>
        );
      })}

      {fam.families.length && looseMain.length ? <h3 className="block-title">Các mảng khác</h3> : null}
      <div className="cap-grid">
        {looseMain.map(card)}
        <button type="button" className="cap-add" onClick={() => addMarket(false)}><Plus size={16} /> Thêm mảng</button>
      </div>

      <h3 className="block-title">Tài khoản phụ · trade nhẹ</h3>
      <p className="field-hint" style={{ marginTop: 4, marginBottom: 10 }}>
        Crypto, hàng hóa... — ghi vốn ước lượng và vài mức risk nhỏ. Không tính vào hệ số cấp, không bị nhắc chọn mức mỗi tuần
        (chưa chọn thì dùng mức mặc định), nhưng vẫn có chip gợi ý khi nhập lệnh và vẫn theo dõi sụt vốn.
      </p>
      <div className="cap-grid">
        {looseSide.map(card)}
        <button type="button" className="cap-add cap-add-side" onClick={() => addMarket(true)}><Plus size={16} /> Thêm tài khoản phụ</button>
      </div>

      <RPerformancePanel plan={plan} trades={trades} resources={resources} dds={dds} today={today} weeks={weeks} onChange={onChange} />

      <p className="field-hint" style={{ marginTop: 12 }}>
        <Scale size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
        Sụt vốn tính trên vốn phân chia cộng lãi/lỗ các lệnh đã đóng từ ngày bắt đầu, không phải tiền đã nạp.
        Mảng gắn nhiều tài khoản thì chúng dùng chung vốn, chung một đường. Mảng có chọn nhóm tài sản thì chỉ tính lệnh của nhóm đó.
      </p>

      <PickReminderCard settings={slReminderSettings} onChange={onSlReminderSettingsChange} />
    </div>
  );
}

// Thẻ trên Tổng quan: mỗi mảng một ô riêng — mức đang đi to rõ, 1R bao nhiêu tiền, sụt vốn ra sao.

export function CapitalSummaryCard({ plan, trades, resources, onOpen }) {
  const today = todayStr();
  const week = thisWeekKey(today);
  const rows = useMemo(() => (plan ? marketDisplayOrder(plan, resources.accounts || []).map(({ m, parentId }) => {
    const p = pickedTier(plan, m.id, week);
    const dd = marketDrawdown(plan, m, trades, resources);
    const stats = marketRStats(m, trades, resources.accounts || [], today, plan);
    return { m, parentId, pct: p.pct, money: p.pct === null ? null : tierMoney(m, p.pct), dd, stats, sug: suggestNextTier(plan, m, stats, dd, today) };
  }) : []), [plan, trades, resources, week, today]);
  if (!plan || !rows.length) return null;
  const missing = isWeekend(today) ? marketsMissingNextPick(plan, today) : [];
  // Mảng chính trước, tài khoản phụ sau — nhìn là biết đâu là tiền thật, đâu là chơi nhẹ. Mảng tách
  // theo nhóm tài sản đứng ngay sau mảng chung của cùng tài khoản.
  const ordered = rows;
  return (
    <div className="cap-summary">
      <div className="cap-summary-top">
        <Scale size={16} />
        <b>Phân bổ vốn tuần này</b>
        <span className="cap-summary-week">{weekLabel(week)}</span>
        {missing.length ? <span className="cap-summary-due"><CalendarClock size={12} /> Chưa chọn mức tuần sau: {missing.map((m) => m.name).join(", ")}</span> : null}
        <button type="button" className="cap-summary-open" onClick={onOpen}>Mở bảng phân bổ <ChevronRight size={13} /></button>
      </div>
      <div className="cap-tiles">
        {ordered.map(({ m, parentId, pct, money, dd, stats, sug }) => {
          const isHold = pct !== null && pct === m.holdTier;
          const barW = Math.min(100, (dd.pct / (plan.ddCutPct || 12)) * 100);
          return (
            <button type="button" key={m.id} onClick={onOpen} style={marketColorStyle(m, resources.accounts)}
              className={`cap-tile cap-tile-${dd.level} ${m.side ? "cap-tile-side" : ""} ${isHold ? "cap-tile-hold" : ""} ${marketColor(m, resources.accounts) ? "has-mk" : ""}`}>
              <span className="cap-tile-head">
                <span className="cap-tile-name">{parentId ? <CornerDownRight size={12} className="cap-child-mark" /> : null}{marketColor(m, resources.accounts) ? <span className="cap-mk-dot" /> : null}{m.name}</span>
                {m.side ? <small className="cap-side-tag">phụ</small> : null}
                <span className={`cap-tile-status cap-tile-status-${dd.level}`}>{DD_LABEL[dd.level]}</span>
              </span>
              <span className="cap-tile-pct mono">
                {fmtPctVN(pct)}
                {isHold ? <small className="cap-tile-holdtag"><Shield size={11} /> cầm chừng</small> : null}
              </span>
              <span className="cap-tile-r mono">1R = {money === null ? "—" : fmtMoney(money, m.currency)}</span>
              <span className="cap-tile-dd">
                <span className="cap-tile-track"><span className="cap-tile-fill" style={{ width: `${barW}%` }} /></span>
                <span className="mono">↓ {fmtPctVN(dd.pct, 1)}</span>
              </span>
              {dd.lossStreak >= 2 ? <span className="cap-tile-streak">Thua {dd.lossStreak} lệnh liên tiếp</span> : null}
              {stats.linked ? (
                <span className="cap-tile-rline mono">
                  {R_WINDOWS.map((w) => {
                    const x = stats.windows[w.key];
                    return <span key={w.key} className={x.n ? (x.r > 0 ? "cap-rp-r-pos" : x.r < 0 ? "cap-rp-r-neg" : "") : "cap-rp-r-empty"}>{w.weeks}T {x.n ? fmtRVN(x.r) : "—"}</span>;
                  })}
                </span>
              ) : null}
              {sug && (sug.action === "up" || sug.action === "down") ? (
                <span className={`cap-tile-sug cap-tile-sug-${sug.action}`}>Gợi ý tuần sau {sug.action === "up" ? "▲" : "▼"} {fmtPctVN(sug.pct)}</span>
              ) : null}
            </button>
          );
        })}
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
        <span><b>{market.name}</b>{(market.assetGroups || []).length ? <small className="field-hint"> ({groupLabels(market.assetGroups)})</small> : null} · tuần này {fmtPctVN(picked.pct)}</span>
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
