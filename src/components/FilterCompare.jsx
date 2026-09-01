import { useMemo, useState } from "react";
import { Bookmark, GitCompare } from "lucide-react";
import { applyFilters, cleanFilters, countActiveFilters, fmt, fmtR, tradeSetSummary } from "../lib/helpers.js";
import { describeFilters } from "../lib/filterLabels.js";

// Dưới ngần này lệnh đã đóng thì mọi con số chỉ là nhiễu. Không chặn người dùng xem, nhưng
// phải nói ra — bảng so sánh mà im lặng là mời người ta kết luận từ 3 lệnh.
const SMALL_SAMPLE = 10;

const ROWS = [
  { key: "total", label: "Số lệnh", get: (s) => s.total, fmt: (v) => v },
  { key: "closed", label: "Đã đóng", get: (s) => s.closed, fmt: (v) => v },
  { key: "open", label: "Đang mở", get: (s) => s.open, fmt: (v) => (v ? v : "—") },
  { key: "winRate", label: "Winrate", get: (s) => s.winRate, fmt: (v) => (v === null ? "—" : `${v.toFixed(0)}%`), better: "high" },
  { key: "wl", label: "Thắng / Thua / Hòa", get: (s) => s, fmt: (s) => (s.closed ? `${s.win} / ${s.loss} / ${s.be}` : "—") },
  { key: "totalR", label: "Tổng R", get: (s) => s.totalR, fmt: (v) => fmtR(v), tone: true, better: "high" },
  { key: "avgR", label: "RR trung bình", get: (s) => s.avgR, fmt: (v) => fmtR(v), tone: true, better: "high" },
  { key: "profit", label: "Lãi/lỗ (USD)", get: (s) => s.profit, fmt: (v) => (v === null ? "—" : fmt(v)), tone: true, better: "high" },
];

export function FilterCompare({ trades, resources, setupErrors, presets, currentFilters }) {
  const list = presets || [];
  const [picked, setPicked] = useState(() => new Set(list.slice(0, 2).map((p) => p.id)));
  const current = cleanFilters(currentFilters);
  const hasCurrent = countActiveFilters(current) > 0;
  const [useCurrent, setUseCurrent] = useState(false);

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const columns = useMemo(() => {
    // Cột "Tất cả lệnh" luôn có mặt: so một bộ lọc với chính nó thì không nói lên gì,
    // phải có mốc để biết tập đó khá hơn hay tệ hơn mặt bằng chung.
    const cols = [{ id: "__all", name: "Tất cả lệnh", desc: "Mốc so sánh — toàn bộ nhật ký", list: trades }];
    if (hasCurrent && useCurrent) {
      cols.push({ id: "__current", name: "Bộ lọc đang dùng", desc: describeFilters(current, resources, setupErrors), list: applyFilters(trades, current, resources) });
    }
    list.forEach((p) => {
      if (!picked.has(p.id)) return;
      cols.push({ id: p.id, name: p.name, desc: describeFilters(p.filters, resources, setupErrors), list: applyFilters(trades, p.filters || {}, resources) });
    });
    return cols.map((c) => ({ ...c, s: tradeSetSummary(c.list, resources) }));
  }, [trades, resources, setupErrors, list, picked, hasCurrent, useCurrent, current]);

  const bestOf = (row) => {
    if (!row.better || columns.length < 2) return null;
    let best = null;
    columns.forEach((c) => {
      const v = row.get(c.s);
      if (v === null || v === undefined || !Number.isFinite(v)) return;
      if (best === null || v > best.v) best = { id: c.id, v };
    });
    // Mọi cột bằng nhau thì không có cột nào "hơn" — tô đậm một cột là bịa ra khác biệt.
    const values = columns.map((c) => row.get(c.s)).filter((v) => Number.isFinite(v));
    if (values.length < 2 || Math.min(...values) === Math.max(...values)) return null;
    return best && best.id;
  };

  const tone = (v) => (v > 0 ? "text-win" : v < 0 ? "text-loss" : "");
  const thin = columns.filter((c) => c.s.closed > 0 && c.s.closed < SMALL_SAMPLE);

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Đặt các bộ lọc đã lưu cạnh nhau để xem cái nào thật sự ăn tiền. Ví dụ "DD sạch lỗi" so với
        "DD dính Quá dốc" — chênh lệch Tổng R chính là cái lỗi đó tốn của bạn bao nhiêu.
      </p>

      {list.length === 0 && !hasCurrent ? (
        <p className="empty-note" style={{ padding: "24px 0" }}>
          Chưa có bộ lọc nào để so. Sang tab Danh sách, chọn vài mục lọc rồi bấm "Lưu bộ lọc này".
        </p>
      ) : (
        <>
          <div className="cmp-pick">
            <span className="filter-foot-label"><Bookmark size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Chọn để so:</span>
            {hasCurrent ? (
              <button type="button" className={`chip-btn ${useCurrent ? "chip-active" : ""}`} onClick={() => setUseCurrent((v) => !v)}
                title={describeFilters(current, resources, setupErrors)}>
                Bộ lọc đang dùng
              </button>
            ) : null}
            {list.map((p) => (
              <button key={p.id} type="button" className={`chip-btn ${picked.has(p.id) ? "chip-active" : ""}`} onClick={() => toggle(p.id)}
                title={describeFilters(p.filters, resources, setupErrors)}>
                {p.name}
              </button>
            ))}
          </div>

          {columns.length < 2 ? (
            <p className="empty-note" style={{ padding: "24px 0" }}>Chọn ít nhất một bộ lọc ở trên để so với toàn bộ nhật ký.</p>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table cmp-table">
                  <thead>
                    <tr>
                      <th />
                      {columns.map((c) => (
                        <th key={c.id} title={c.desc}>
                          {c.name}
                          {c.s.closed > 0 && c.s.closed < SMALL_SAMPLE ? <span className="cmp-thin">mẫu nhỏ</span> : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((row) => {
                      const best = bestOf(row);
                      return (
                        <tr key={row.key}>
                          <td className="cmp-metric">{row.label}</td>
                          {columns.map((c) => {
                            const raw = row.get(c.s);
                            return (
                              <td key={c.id} className={`${row.tone && Number.isFinite(raw) ? tone(raw) : ""} ${best === c.id ? "cmp-best" : ""}`}>
                                {row.fmt(raw)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="field-hint" style={{ marginTop: 10 }}>
                <GitCompare size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                Ô viền sáng là cột tốt nhất của dòng đó. Winrate, R và lãi/lỗ chỉ tính trên lệnh đã đóng —
                lệnh đang mở không được đếm vào.
              </p>
              {thin.length ? (
                <p className="field-hint" style={{ marginTop: 4, color: "var(--loss)" }}>
                  {thin.map((c) => c.name).join(", ")} có dưới {SMALL_SAMPLE} lệnh đã đóng. Chênh lệch ở mức đó
                  phần lớn là may rủi, chưa đủ để kết luận.
                </p>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
