import { useMemo, useState } from "react";
import { Gauge } from "lucide-react";
import { DashboardFilters } from "./Dashboard.jsx";
import { StatCard } from "./ui.jsx";
import { accountFamily, closedOf, closedOfUSD, computeSystemQuality, dateKey, fmtR, inRange, riskOfRuin, sqnRating } from "../lib/helpers.js";

const RISK_LEVELS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];

function rorTone(pct) {
  if (pct === null || pct === undefined) return "";
  if (pct < 1) return "win";
  if (pct < 15) return "";
  return "loss";
}

function KellyCard({ label, pct, highlight }) {
  const bad = pct !== null && pct <= 0;
  return (
    <div className={`stat-card ${highlight ? "stat-card-highlight" : ""}`}>
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${bad ? "loss" : "win"}`}>{pct === null ? "—" : bad ? "≤ 0%" : `${pct.toFixed(2)}%`}</span>
    </div>
  );
}

export function SystemQualityPage({ trades, resources }) {
  const [scope, setScope] = useState("");
  const [range, setRange] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const inScope = useMemo(() => accountFamily(resources.accounts, scope), [resources.accounts, scope]);
  const scoped = trades.filter((t) => (!scope || inScope.has(t.account)) && inRange(dateKey(t) || t.entryDate, range, rangeFrom, rangeTo));
  const singleAccount = scope ? resources.accounts.find((a) => a.name === scope) : null;
  const closed = singleAccount ? closedOf(scoped) : closedOfUSD(scoped, resources);
  const scopeBar = <DashboardFilters resources={resources} account={scope} onAccount={setScope} range={range} onRange={setRange} rangeFrom={rangeFrom} rangeTo={rangeTo} onRangeFrom={setRangeFrom} onRangeTo={setRangeTo} />;

  const q = computeSystemQuality(closed);

  if (!q) {
    return (
      <div>
        {scopeBar}
        <div className="empty-state">
          <Gauge size={28} color="var(--text-dim)" />
          <p>Cần tối thiểu 5 lệnh đã đóng có điền "Rủi ro (tiền)" để tính R-multiple và chấm chất lượng hệ thống.</p>
        </div>
      </div>
    );
  }

  const riskPercents = scoped
    .map((t) => (t.riskPercent !== "" && t.riskPercent !== null && t.riskPercent !== undefined ? Number(t.riskPercent) : null))
    .filter((v) => v !== null && !Number.isNaN(v));
  const avgRiskPercent = riskPercents.length ? riskPercents.reduce((a, b) => a + b, 0) / riskPercents.length : null;

  const kellyFullPct = q.kellyFull !== null ? q.kellyFull * 100 : null;
  const kellyHalfPct = kellyFullPct !== null && kellyFullPct > 0 ? kellyFullPct / 2 : kellyFullPct;
  const kellyQuarterPct = kellyFullPct !== null && kellyFullPct > 0 ? kellyFullPct / 4 : kellyFullPct;

  const rorRows = RISK_LEVELS.map((pct) => ({ pct, ror: riskOfRuin(q.burnX, pct) }));
  const highlightLevels = [
    avgRiskPercent !== null ? { label: "% risk trung bình hiện tại", pct: Number(avgRiskPercent.toFixed(2)) } : null,
    kellyFullPct !== null && kellyFullPct > 0 ? { label: "Full Kelly", pct: Number(kellyFullPct.toFixed(2)) } : null,
    kellyHalfPct !== null && kellyHalfPct > 0 ? { label: "Half Kelly", pct: Number(kellyHalfPct.toFixed(2)) } : null,
  ].filter(Boolean);

  return (
    <div>
      {scopeBar}
      <p className="field-hint" style={{ marginBottom: 12 }}>
        {singleAccount ? `Tính theo R-multiple (không phụ thuộc tiền tệ) trên ${q.n} lệnh có "Rủi ro (tiền)" trong tài khoản "${singleAccount.name}".` : `Tính theo R-multiple (không phụ thuộc tiền tệ) trên ${q.n} lệnh có "Rủi ro (tiền)", gộp mọi tài khoản.`}
      </p>

      <h3 className="block-title" style={{ marginTop: 0 }}>SQN — Chỉ số chất lượng hệ thống (Van Tharp)</h3>
      <p className="field-hint" style={{ marginBottom: 10, marginTop: 4 }}>SQN = căn(n) × kỳ vọng(R) / độ lệch chuẩn(R) — đo mức độ ổn định và bền vững của lợi thế thống kê, không chỉ nhìn vào lợi nhuận.</p>
      <div className="stat-grid">
        <StatCard label="SQN" value={q.sqn === null ? "—" : q.sqn.toFixed(2)} tone={q.sqn >= 2 ? "win" : q.sqn < 1 ? "loss" : ""} />
        <StatCard label="Đánh giá" value={sqnRating(q.sqn)} tone={q.sqn >= 2 ? "win" : q.sqn < 1 ? "loss" : ""} />
        <StatCard label="SQN chuẩn hóa (100 lệnh)" value={q.sqn100 === null ? "—" : q.sqn100.toFixed(2)} />
        <StatCard label="Kỳ vọng trung bình" value={fmtR(q.mean)} tone={q.mean >= 0 ? "win" : "loss"} />
        <StatCard label="Độ lệch chuẩn (R)" value={q.stdev.toFixed(2)} />
        <StatCard label="Winrate (mẫu tính SQN)" value={`${(q.winRate * 100).toFixed(1)}%`} />
        <StatCard label="Số lệnh dùng để tính" value={q.n} />
      </div>

      <h3 className="block-title">Kelly Criterion — Đề xuất % risk mỗi lệnh</h3>
      <p className="field-hint" style={{ marginBottom: 10, marginTop: 4 }}>
        {kellyFullPct !== null && kellyFullPct <= 0
          ? "Kelly ≤ 0% — hệ thống hiện chưa thể hiện lợi thế thống kê dương trên dữ liệu này; cân nhắc risk tối thiểu hoặc xem lại chiến lược trước khi tăng vốn."
          : "Full Kelly là mức risk tối ưu về mặt toán học nhưng biến động rất mạnh — đa số trader dùng Half hoặc Quarter Kelly để cân bằng tăng trưởng và rủi ro."}
      </p>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))" }}>
        <KellyCard label="Full Kelly" pct={kellyFullPct} />
        <KellyCard label="Half Kelly (khuyến nghị)" pct={kellyHalfPct} highlight />
        <KellyCard label="Quarter Kelly (an toàn)" pct={kellyQuarterPct} />
        <StatCard label="% risk trung bình bạn đang dùng" value={avgRiskPercent === null ? "—" : `${avgRiskPercent.toFixed(2)}%`} />
      </div>

      <h3 className="block-title">Nguy cơ cháy tài khoản (Risk of Ruin)</h3>
      <p className="field-hint" style={{ marginBottom: 10, marginTop: 4 }}>
        Ước tính gần đúng theo mô hình random walk (Brownian motion có drift) từ kỳ vọng và độ lệch chuẩn R ở trên — giả định các lệnh độc lập và phân phối ổn định theo thời gian. Chỉ mang tính tham khảo, không phải cam kết chắc chắn.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>% Risk / lệnh</th><th>Nguy cơ cháy tài khoản</th></tr></thead>
          <tbody>
            {rorRows.map(({ pct, ror }) => {
              const rorPct = ror === null ? null : ror * 100;
              return (
                <tr key={pct}>
                  <td className="mono">{pct}%</td>
                  <td className={`mono ${rorTone(rorPct)}`}>{rorPct === null ? "—" : rorPct < 0.01 ? "< 0.01%" : `${rorPct.toFixed(2)}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {highlightLevels.length ? (
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", marginTop: 10 }}>
          {highlightLevels.map((h) => {
            const ror = riskOfRuin(q.burnX, h.pct);
            const rorPct = ror === null ? null : ror * 100;
            return (
              <StatCard key={h.label} label={`RoR tại ${h.label} (${h.pct}%)`} value={rorPct === null ? "—" : rorPct < 0.01 ? "< 0.01%" : `${rorPct.toFixed(2)}%`} tone={rorTone(rorPct)} />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
