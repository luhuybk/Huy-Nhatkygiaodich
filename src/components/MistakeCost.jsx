import { useMemo, useState } from "react";
import { TrendingDown } from "lucide-react";
import { DashboardFilters } from "./Dashboard.jsx";
import { StatCard } from "./ui.jsx";
import { dateKey, expandAccountFilter, fmtR, inRange, MISTAKE_BASES, MISTAKE_FLAG_SINCE, MISTAKE_MIN_SAMPLE, mistakeBaselineDate, mistakeCost } from "../lib/helpers.js";

const fmtPct = (v) => (v === null || v === undefined ? "—" : `${v.toFixed(1)}%`);
// Con số chi phí làm tròn 1 chữ số: "12.4R" đọc được, "12.37R" chỉ làm người ta tin một độ
// chính xác mà mẫu vài chục lệnh không có.
const fmtCost = (v) => (v === null || v === undefined ? "—" : `${Math.abs(v).toFixed(1)}R`);

function GroupCard({ title, tone, s }) {
  return (
    <div className={`mc-group mc-group-${tone}`}>
      <h4 className="mc-group-title">{title}</h4>
      <div className="mc-group-rows">
        <div><span>Số lệnh tính được R</span><b className="mono">{s.rCount}</b></div>
        <div><span>Winrate</span><b className="mono">{fmtPct(s.winRate)}</b></div>
        <div><span>R trung bình / lệnh</span><b className={`mono ${s.avgR > 0 ? "text-win" : s.avgR < 0 ? "text-loss" : ""}`}>{fmtR(s.avgR)}</b></div>
        <div><span>Tổng R</span><b className={`mono ${s.totalR > 0 ? "text-win" : s.totalR < 0 ? "text-loss" : ""}`}>{fmtR(s.totalR)}</b></div>
      </div>
    </div>
  );
}

export function MistakeCostPage({ trades, resources, onOpenTrade }) {
  const [scope, setScope] = useState("");
  const [range, setRange] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [basis, setBasis] = useState("trade");
  // Mốc mặc định: xem mistakeBaselineDate. Để null nghĩa là "chưa tự chỉnh", khác với chuỗi
  // rỗng là bạn cố ý xóa mốc để tính từ đầu.
  const [fromOverride, setFromOverride] = useState(null);
  const [reviewedOnly, setReviewedOnly] = useState(true);

  const autoFrom = useMemo(() => mistakeBaselineDate(trades), [trades]);
  const from = basis === "setup" ? "" : (fromOverride === null ? autoFrom : fromOverride);
  const inScope = useMemo(() => expandAccountFilter(scope, resources.accounts), [resources.accounts, scope]);
  const scoped = useMemo(
    () => trades.filter((t) => (!inScope || inScope.has(t.account)) && inRange(dateKey(t) || t.entryDate, range, rangeFrom, rangeTo)),
    [trades, inScope, range, rangeFrom, rangeTo]
  );
  const r = useMemo(() => mistakeCost(scoped, { basis, from, reviewedOnly }, resources), [scoped, basis, from, reviewedOnly, resources]);

  const scopeBar = <DashboardFilters multi resources={resources} account={scope} onAccount={setScope} range={range} onRange={setRange} rangeFrom={rangeFrom} rangeTo={rangeTo} onRangeFrom={setRangeFrom} onRangeTo={setRangeTo} />;
  const controls = (
    <div className="mc-controls">
      <label className="mc-control">
        <span className="field-label">Tính theo</span>
        <select className="input" value={basis} onChange={(e) => setBasis(e.target.value)}>
          {MISTAKE_BASES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
      </label>
      {basis !== "setup" ? (
        <>
          <label className="mc-control">
            <span className="field-label">Lệnh sạch tính từ ngày</span>
            <input type="date" className="input" value={from} onChange={(e) => setFromOverride(e.target.value)} />
          </label>
          <label className="mc-check">
            <input type="checkbox" checked={reviewedOnly} onChange={(e) => setReviewedOnly(e.target.checked)} />
            <span>Chỉ tính lệnh sạch đã chấm mục 7 (đã xem lại)</span>
          </label>
          {fromOverride !== null && fromOverride !== autoFrom ? (
            <button type="button" className="btn btn-ghost mc-reset" onClick={() => setFromOverride(null)}>Về mốc tự động</button>
          ) : null}
        </>
      ) : null}
    </div>
  );

  if (!r.mistake.rCount) {
    return (
      <div>
        {scopeBar}
        {controls}
        <div className="empty-state">
          <TrendingDown size={28} color="var(--text-dim)" />
          <p>
            {basis === "setup"
              ? "Chưa có lệnh nào đã đóng, có tick lỗi setup ở mục 3 và tính được R."
              : "Chưa có lệnh nào đã đóng, được đánh dấu \"Lệnh này có lỗi\" ở mục 8 và tính được R."}
            {" "}Đánh dấu vài lệnh rồi quay lại đây. Muốn tính ra R thì lệnh phải có điền "Rủi ro (tiền)".
          </p>
          {r.flaggedNoR ? <p className="field-hint">{r.flaggedNoR} lệnh có lỗi đã đóng nhưng chưa điền rủi ro nên không tính được R.</p> : null}
        </div>
      </div>
    );
  }

  const costly = r.cost !== null && r.cost > 0;
  const perTrade = r.gapR;
  const excludedParts = [];
  if (r.excluded.beforeFrom) excludedParts.push(`${r.excluded.beforeFrom} lệnh trước ngày ${from}${from === MISTAKE_FLAG_SINCE ? " (app chưa có ô đánh dấu lỗi, để trống không có nghĩa là sạch)" : ""}`);
  if (r.excluded.unreviewed) excludedParts.push(basis === "setup"
    ? `${r.excluded.unreviewed} lệnh chưa soi lỗi setup`
    : `${r.excluded.unreviewed} lệnh chưa chấm mục 7`);
  if (r.flaggedNoR) excludedParts.push(`${r.flaggedNoR} lệnh có lỗi chưa điền rủi ro nên không ra R`);

  return (
    <div>
      {scopeBar}
      {controls}

      <div className={`mc-hero ${costly ? "mc-hero-cost" : "mc-hero-ok"}`}>
        {r.clean.rCount === 0 ? (
          <>
            <span className="mc-hero-label">Chưa có lệnh sạch để so</span>
            <p className="mc-hero-why">
              Có {r.mistake.rCount} lệnh có lỗi nhưng chưa có lệnh sạch nào trong phạm vi này để làm mốc so sánh.
              {basis !== "setup" ? " Thử lùi ngày \"tính từ\" hoặc bỏ tick \"chỉ tính lệnh đã chấm mục 7\"." : " Chọn \"Không lỗi\" ở mục 3 cho những lệnh làm đúng."}
            </p>
          </>
        ) : costly ? (
          <>
            <span className="mc-hero-label">Lỗi đã lấy của bạn khoảng</span>
            <span className="mc-hero-value">{fmtCost(r.cost)}</span>
            <p className="mc-hero-why">
              Lệnh sạch trung bình <b>{fmtR(r.clean.avgR)}</b>, lệnh có lỗi <b>{fmtR(r.mistake.avgR)}</b> — mỗi lần mắc lỗi
              mất khoảng <b>{fmtCost(perTrade)}</b> so với khi làm đúng, nhân {r.mistake.rCount} lệnh có lỗi.
            </p>
          </>
        ) : (
          <>
            <span className="mc-hero-label">Lệnh có lỗi chưa làm bạn tốn thêm</span>
            <span className="mc-hero-value mc-hero-value-ok">{fmtR(r.mistake.avgR)} <small>so với</small> {fmtR(r.clean.avgR)}</span>
            <p className="mc-hero-why">
              Lệnh có lỗi đang không tệ hơn lệnh sạch. Thường là vì mẫu còn ít, hoặc bạn đang đánh dấu cả những lỗi nhỏ
              không ảnh hưởng kết quả. Lỗi không làm mất tiền lần này vẫn là lỗi — nó chỉ chưa bị phạt.
            </p>
          </>
        )}
        {r.smallSample ? (
          <p className="mc-hero-warn">
            Mẫu còn nhỏ ({r.mistake.rCount} lệnh có lỗi, {r.clean.rCount} lệnh sạch — nên có ít nhất {MISTAKE_MIN_SAMPLE} mỗi bên).
            Con số này để tham khảo, chưa đủ để kết luận.
          </p>
        ) : null}
      </div>

      <div className="mc-groups">
        <GroupCard title="Lệnh có lỗi" tone="bad" s={r.mistake} />
        <GroupCard title="Lệnh sạch" tone="good" s={r.clean} />
      </div>
      <div className="stat-grid" style={{ marginTop: 12 }}>
        <StatCard label="Tỉ lệ lệnh có lỗi" value={fmtPct(r.share)} sub={`${r.mistake.rCount} / ${r.mistake.rCount + r.clean.rCount} lệnh được so`} />
        <StatCard label="Chênh mỗi lần mắc lỗi" value={perTrade === null ? "—" : fmtR(-perTrade)} tone={perTrade > 0 ? "loss" : perTrade < 0 ? "win" : ""} sub="R lệnh lỗi so với R lệnh sạch" />
      </div>
      {excludedParts.length ? (
        <p className="field-hint" style={{ marginTop: 10 }}>
          Không đưa vào so: {excludedParts.join("; ")}.
        </p>
      ) : null}

      {r.months.length ? (
        <>
          <h3 className="block-title">Theo tháng</h3>
          <p className="field-hint" style={{ marginTop: 4, marginBottom: 10 }}>
            Chi phí từng tháng so với R trung bình lệnh sạch của cả giai đoạn — nhìn cột cuối giảm dần là đang tiến bộ.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Tháng</th><th>Lệnh có lỗi</th><th>Tỉ lệ lỗi</th><th>R TB lệnh lỗi</th><th>Chi phí ước tính</th></tr>
              </thead>
              <tbody>
                {r.months.map((m) => (
                  <tr key={m.month}>
                    <td className="mono">{m.month}</td>
                    <td className="mono">{m.count}</td>
                    <td className="mono">{fmtPct(m.share)}</td>
                    <td className={`mono ${m.avgR > 0 ? "text-win" : m.avgR < 0 ? "text-loss" : ""}`}>{fmtR(m.avgR)}</td>
                    <td className={`mono ${m.cost > 0 ? "text-loss" : ""}`}>{m.cost === null ? "—" : m.cost > 0 ? `−${fmtCost(m.cost)}` : "không tốn"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {r.worst.length ? (
        <>
          <h3 className="block-title">Những lệnh lỗi tốn nhất</h3>
          <p className="field-hint" style={{ marginTop: 4, marginBottom: 10 }}>Bấm vào để mở lại lệnh và đọc lỗi đã ghi.</p>
          <div className="mc-worst">
            {r.worst.map(({ trade: t, rr }) => (
              <button type="button" key={t.id} className="mc-worst-row" onClick={() => onOpenTrade && onOpenTrade(t)}>
                <span className="mono mc-worst-date">{dateKey(t) || "—"}</span>
                <b className="mc-worst-sym">{t.symbol || "—"}</b>
                <span className={`mono mc-worst-r ${rr < 0 ? "text-loss" : rr > 0 ? "text-win" : ""}`}>{fmtR(rr)}</span>
                <span className="mc-worst-note">{String(t.mistakeNote || "").trim() || (t.hasMistake ? "Có lỗi — chưa ghi là lỗi gì" : "Lỗi setup (mục 3)")}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
