import { useState } from "react";
import { ArrowUpRight, ArrowDownRight, Save, StickyNote, AlertTriangle, AlertCircle, Scissors } from "lucide-react";
import { ConfirmButton, CompletionBar, Field, ImageOrLink, MoneyInput, MultiImageOrLink, ResourceSelect, RiskAlertBanner, Section, StarRating } from "./ui.jsx";
import { GRADE_OPTIONS, STRUCTURE_SCORES } from "../lib/constants.js";
import { accountOpenRisk, avgPillarScore, computeResult, computeRiskAlerts, emptyPartialExit, emptyTrade, fmt, IN_TRADE_MAX_IMAGES, isFieldMissing, isForexSymbol, PARTIAL_MAX, partialExitR, partialExitsOf, partialExitStats, sessionFromTime, tradeCompletion } from "../lib/helpers.js";

// Mức chốt bớt hay dùng, bấm cho nhanh thay vì gõ. 33% cho kiểu chia lệnh làm ba.
const PERCENT_PRESETS = [25, 33, 50, 100];

// Số phần trăm hiển thị gọn: 50 chứ không phải 50.00, nhưng 12.5 thì vẫn giữ.
function fmtPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${Number(n.toFixed(2))}%`;
}

// Chốt quá 100% là điền sai, hiện số âm chỉ càng rối — cảnh báo riêng bên dưới lo việc đó.
function fmtRemaining(v) {
  return fmtPercent(Math.max(0, Number(v) || 0));
}

// Mỗi lần chốt bớt là một dòng con của lệnh: ngày giờ, phần trăm vị thế đã đóng,
// lợi nhuận thu về, ảnh và lý do. R của dòng tính trên rủi ro ban đầu của cả lệnh.
function PartialExits({ trade, onChange }) {
  const rows = partialExitsOf(trade);
  const stats = partialExitStats(trade);
  const risk = trade.riskAmount;
  const setRow = (id, patch) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => {
    if (rows.length >= PARTIAL_MAX) return;
    // Lần chốt mới thường cùng ngày với lần trước, điền sẵn cho đỡ gõ lại.
    const last = rows[rows.length - 1];
    onChange([...rows, { ...emptyPartialExit(), date: (last && last.date) || trade.exitDate || "" }]);
  };
  const removeRow = (id) => onChange(rows.filter((r) => r.id !== id));

  return (
    <>
      {rows.length === 0 ? (
        <p className="empty-note" style={{ padding: "6px 0 12px" }}>
          Chưa có lần chốt bớt nào. Chỉ dùng khi bạn đóng một phần vị thế trước rồi mới trailing phần còn lại.
        </p>
      ) : null}

      {rows.map((row, i) => {
        const rr = partialExitR(row, risk);
        return (
          <div key={row.id} className="partial-row">
            <div className="partial-row-head">
              <span className="partial-row-num">Lần {i + 1}</span>
              {rr === null ? (
                <span className="field-hint" style={{ margin: 0 }}>
                  {row.profit === "" ? "Điền lợi nhuận để tính R" : "Điền Rủi ro (số tiền) ở mục 2 để tính R"}
                </span>
              ) : (
                <span className={`partial-row-r ${rr > 0 ? "text-win" : rr < 0 ? "text-loss" : ""}`}>
                  {rr > 0 ? "+" : ""}{rr.toFixed(2)}R
                </span>
              )}
              <ConfirmButton onConfirm={() => removeRow(row.id)} label="Xóa lần chốt bớt này" />
            </div>
            <div className="grid-2">
              <Field label="Ngày chốt bớt">
                <input type="date" className="input" value={row.date} onChange={(e) => setRow(row.id, { date: e.target.value })} />
              </Field>
              <Field label="Giờ chốt bớt">
                <input type="time" className="input" value={row.time} onChange={(e) => setRow(row.id, { time: e.target.value })} />
              </Field>
              <Field label="% vị thế đã đóng" hint="Gõ tay, hoặc bấm mức có sẵn">
                <input type="number" min="0" max="100" step="0.5" className="input" value={row.percent}
                  onChange={(e) => setRow(row.id, { percent: e.target.value })} placeholder="50" />
                <div className="percent-quick">
                  {PERCENT_PRESETS.map((v) => (
                    <button type="button" key={v} className={`percent-chip ${Number(row.percent) === v ? "percent-chip-on" : ""}`}
                      onClick={() => setRow(row.id, { percent: Number(row.percent) === v ? "" : String(v) })}>
                      {v}%
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Lợi nhuận thu về">
                <MoneyInput value={row.profit} onChange={(v) => setRow(row.id, { profit: v })} placeholder="+300" />
              </Field>
            </div>
            <Field label="Link / hình ảnh lúc chốt bớt">
              <ImageOrLink link={row.link} image={row.image} onLinkChange={(v) => setRow(row.id, { link: v })}
                onImageChange={(v) => setRow(row.id, { image: v })} label={`partial-${i}`} />
            </Field>
            <Field label="Lý do / ghi chú">
              <textarea className="input textarea" value={row.note} onChange={(e) => setRow(row.id, { note: e.target.value })}
                placeholder="Vì sao chốt bớt ở đây — chạm kháng cự, đủ mục tiêu, tin ra..." />
            </Field>
          </div>
        );
      })}

      {rows.length < PARTIAL_MAX ? (
        <button type="button" className="btn btn-ghost" onClick={addRow}>
          <Scissors size={14} /> Thêm lần chốt bớt
        </button>
      ) : (
        <p className="field-hint">Tối đa {PARTIAL_MAX} lần chốt bớt cho một lệnh.</p>
      )}

      {stats.count ? (
        <div className="partial-total">
          <span>Đã chốt {fmtPercent(stats.percent)} vị thế · còn lại {fmtRemaining(stats.remainingPercent)}</span>
          <strong className={stats.profit > 0 ? "text-win" : stats.profit < 0 ? "text-loss" : ""}>
            {fmt(stats.profit)}{stats.rr === null ? "" : ` · ${stats.rr > 0 ? "+" : ""}${stats.rr.toFixed(2)}R`}
          </strong>
        </div>
      ) : null}
      {stats.percent > 100 ? (
        <p className="field-hint" style={{ color: "var(--loss)" }}>
          Tổng phần trăm đã chốt vượt quá 100% — xem lại các con số, hoặc lệnh này nên tách thành hai lệnh riêng.
        </p>
      ) : null}
    </>
  );
}

export function TradeForm({ initial, resources, trades, ledger, onSave, onCancel }) {
  const [t, setT] = useState(initial || emptyTrade());
  const [formError, setFormError] = useState("");
  const set = (k) => (v) => setT((prev) => ({ ...prev, [k]: v }));
  const missing = (key) => isFieldMissing(t, key);
  const { rr, outcome } = computeResult(t);
  const completion = tradeCompletion(t);
  const partial = partialExitStats(t);
  const total = computeResult(t);
  // Đếm xem mục 1A đã có gì chưa, để nhãn gấp lại nói được là trống hay đã điền.
  const inTradeFilled = (t.inTradeImages || []).filter((x) => x && (x.link || x.image)).length + (t.inTradeNote ? 1 : 0);
  const accountNames = resources.accounts.map((a) => a.name);
  const selectedAccount = resources.accounts.find((a) => a.name === t.account);
  const existingOpenRisk = selectedAccount
    ? accountOpenRisk(selectedAccount, ledger || [], (trades || []).filter((x) => x.id !== t.id))
    : { pct: 0, count: 0 };
  const riskAlerts = computeRiskAlerts(resources, (trades || []).filter((x) => x.id !== t.id), ledger || []);

  const submit = () => {
    if (!t.symbol.trim()) {
      setFormError("Vui lòng nhập Symbol trước khi lưu (đây là trường bắt buộc duy nhất, các mục khác điền được bao nhiêu tùy bạn).");
      return;
    }
    setFormError("");
    onSave(t);
  };

  return (
    <div className="trade-form">
      <RiskAlertBanner alerts={riskAlerts} />
      <CompletionBar done={completion.done} total={completion.total} percent={completion.percent} sticky />
      <Section num="1" title="Thông tin lệnh" subtitle="Symbol, entry, tài khoản, timeframe, phiên">
        <div className="grid-2">
          <Field label="Symbol" required>
            <input
              className="input"
              list="symbol-suggestions"
              value={t.symbol}
              onChange={(e) => {
                const sym = e.target.value.toUpperCase();
                setT((prev) => {
                  const next = { ...prev, symbol: sym };
                  if (prev.entryTime && isForexSymbol(sym)) {
                    const guess = sessionFromTime(prev.entryTime);
                    if (guess && resources.sessions.includes(guess)) next.session = guess;
                  }
                  return next;
                });
              }}
              placeholder="VD: XAUUSD, HPG..."
            />
            <datalist id="symbol-suggestions">
              {resources.symbols.map((s) => <option key={s} value={s} />)}
            </datalist>
          </Field>
          <Field label="Hướng lệnh">
            <div className="seg">
              <button type="button" className={`seg-btn ${t.direction === "buy" ? "seg-active-win" : ""}`} onClick={() => set("direction")("buy")}>
                <ArrowUpRight size={14} /> Buy
              </button>
              <button type="button" className={`seg-btn ${t.direction === "sell" ? "seg-active-loss" : ""}`} onClick={() => set("direction")("sell")}>
                <ArrowDownRight size={14} /> Sell
              </button>
            </div>
          </Field>
          <Field label="Ngày entry" incomplete={missing("entryDate")}>
            <input type="date" className="input" value={t.entryDate} onChange={(e) => set("entryDate")(e.target.value)} />
          </Field>
          <Field label="Giờ entry" hint="Tùy chọn — với forex sẽ tự điền phiên giao dịch bên dưới, bạn vẫn chọn lại được">
            <input
              type="time"
              className="input"
              value={t.entryTime}
              onChange={(e) => {
                const time = e.target.value;
                setT((prev) => {
                  const next = { ...prev, entryTime: time };
                  if (time && isForexSymbol(prev.symbol)) {
                    const guess = sessionFromTime(time);
                    if (guess && resources.sessions.includes(guess)) next.session = guess;
                  }
                  return next;
                });
              }}
            />
          </Field>
          <Field label="Tài khoản" incomplete={missing("account")}>
            <ResourceSelect value={t.account} onChange={set("account")} options={accountNames} placeholder="Chọn tài khoản" />
          </Field>
          <Field label="Khung thời gian" incomplete={missing("timeframe")}>
            <ResourceSelect value={t.timeframe} onChange={set("timeframe")} options={resources.timeframes} placeholder="Chọn timeframe" />
          </Field>
          <Field
            label="Phiên giao dịch"
            hint={isForexSymbol(t.symbol) && t.entryTime ? `Đã tự điền từ giờ entry: ${sessionFromTime(t.entryTime)} — chọn lại nếu cần` : undefined}
          >
            <ResourceSelect value={t.session} onChange={set("session")} options={resources.sessions} placeholder="Chọn phiên" />
          </Field>
        </div>
        <Field label="Link / hình ảnh lúc vào lệnh" incomplete={missing("entryVisual")}>
          <ImageOrLink link={t.entryLink} image={t.entryImage} onLinkChange={set("entryLink")} onImageChange={set("entryImage")} label="entry" />
        </Field>
      </Section>

      <Section num="2" title="Quản trị vốn" subtitle="Risk % · Risk $ · RR thực tế">
        {selectedAccount ? (
          <div className={`open-risk-hint ${existingOpenRisk.count > 0 ? (existingOpenRisk.pct >= 5 ? "open-risk-hint-high" : "open-risk-hint-warn") : ""}`}>
            <AlertTriangle size={13} />
            {existingOpenRisk.count === 0
              ? `Tài khoản "${selectedAccount.name}" hiện chưa có lệnh nào đang mở.`
              : `Tài khoản "${selectedAccount.name}" đang mở ${existingOpenRisk.pct.toFixed(2)}% risk từ ${existingOpenRisk.count} lệnh khác. Cộng thêm rủi ro lệnh này để cân nhắc tổng risk.`}
          </div>
        ) : null}
        <div className="grid-3">
          <Field label="Rủi ro (%)" incomplete={missing("riskPercent")}>
            <input type="number" step="0.01" className="input mono" value={t.riskPercent} onChange={(e) => set("riskPercent")(e.target.value)} placeholder="1.0" />
          </Field>
          <Field label="Rủi ro (số tiền)" incomplete={missing("riskAmount")}>
            <MoneyInput value={t.riskAmount} onChange={set("riskAmount")} placeholder="100" />
          </Field>
          <Field label="RR thực (tự tính khi có Lãi/Lỗ)">
            <div className={`rr-readout ${outcome === "win" ? "rr-win" : outcome === "loss" ? "rr-loss" : ""}`}>
              {rr === null ? "—" : `${rr > 0 ? "+" : ""}${rr.toFixed(2)}R`}
            </div>
          </Field>
        </div>
        <Field label="Quản trị vốn" incomplete={missing("riskAction")}>
          <ResourceSelect value={t.riskAction} onChange={set("riskAction")} options={resources.riskActions} placeholder="VD: Nâng vốn, Giữ vốn, Giảm risk..." />
        </Field>
        <Field label="Lý do">
          <textarea className="input textarea" value={t.riskActionReason} onChange={(e) => set("riskActionReason")(e.target.value)} placeholder="Vì sao nâng/giữ/giảm vốn lần này..." />
        </Field>
        <Field label="Tự đánh giá quản trị vốn" incomplete={missing("ratingRisk")}>
          <StarRating value={t.ratingRisk} onChange={set("ratingRisk")} />
        </Field>
      </Section>

      <Section num="3" title="Kiến thức" subtitle="Setup, bonus, nhận xét setup, điểm cấu trúc, lý do vào lệnh">
        <div className="grid-3">
          <Field label="Setup" incomplete={missing("setup")}>
            <ResourceSelect value={t.setup} onChange={set("setup")} options={resources.setups} placeholder="Chọn setup" />
          </Field>
          <Field label="Bonus">
            <ResourceSelect value={t.setupBonus} onChange={set("setupBonus")} options={resources.setupBonus} placeholder="Chọn bonus (nếu có)" />
          </Field>
          <Field label="Nhận xét Setup" incomplete={missing("setupNote")}>
            <ResourceSelect value={t.setupNote} onChange={set("setupNote")} options={resources.setupNotes} placeholder="Chọn nhận xét" />
          </Field>
          <Field label="Điểm cấu trúc (ĐCT)" hint="Cho cặp forex — thang 0 đến 7, bước 0.5">
            <ResourceSelect value={t.structureScore} onChange={set("structureScore")} options={STRUCTURE_SCORES} placeholder="Chọn điểm (0-7)" />
          </Field>
        </div>
        <Field label="Lý do vào lệnh">
          <textarea className="input textarea" value={t.entryReason} onChange={(e) => set("entryReason")(e.target.value)} placeholder="Điền tay lý do vào lệnh..." />
        </Field>
        <Field label="Tự đánh giá kiến thức" incomplete={missing("ratingKnowledge")}>
          <StarRating value={t.ratingKnowledge} onChange={set("ratingKnowledge")} />
        </Field>
      </Section>

      <Section num="1A" title="Trong khi lệnh chạy" subtitle="Diễn biến & cảm nghĩ trong lúc lệnh đang mở" optional
        collapsible defaultOpen={inTradeFilled > 0} badge={inTradeFilled ? `${inTradeFilled} mục đã điền` : "trống"}>
        <Field label="Link / hình ảnh trong khi lệnh chạy" hint={`Tối đa ${IN_TRADE_MAX_IMAGES} ảnh/link`}>
          <MultiImageOrLink items={t.inTradeImages} onChange={set("inTradeImages")} label="in-trade" max={IN_TRADE_MAX_IMAGES} />
        </Field>
        <Field label="Cảm nghĩ khi lệnh đang chạy">
          <textarea className="input textarea" value={t.inTradeNote} onChange={(e) => set("inTradeNote")(e.target.value)} placeholder="Bạn nghĩ gì, cảm thấy thế nào trong lúc lệnh đang mở..." />
        </Field>
      </Section>

      <Section num="1B" title="Thoát lệnh từng phần" subtitle="Chốt bớt 25-50% rồi trailing phần còn lại" optional
        collapsible defaultOpen={partial.count > 0}
        badge={partial.count
          ? `${partial.count} lần · ${fmtPercent(partial.percent)}${partial.filled ? ` · ${fmt(partial.profit)}` : ""}`
          : "trống"}>
        <PartialExits trade={t} onChange={set("partialExits")} />
      </Section>

      <Section num="1C" title="Đóng lệnh" subtitle="Đóng nốt phần vị thế còn lại">
        <div className="grid-3">
          <Field label="Ngày exit" incomplete={missing("exitDate")}>
            <input type="date" className="input" value={t.exitDate} onChange={(e) => set("exitDate")(e.target.value)} />
          </Field>
          <Field label="Giờ exit" hint="Tùy chọn — giúp tính chính xác thời gian giữ lệnh đến từng giờ">
            <input type="time" className="input" value={t.exitTime} onChange={(e) => set("exitTime")(e.target.value)} />
          </Field>
          <Field label={partial.count ? "Lợi nhuận phần còn lại" : "Lợi nhuận (+/-, theo tiền tệ tài khoản)"}
            hint={partial.count ? `Chỉ điền phần đóng nốt — ${fmtRemaining(partial.remainingPercent)} vị thế còn lại` : undefined}
            incomplete={missing("profit")}>
            <MoneyInput value={t.profit} onChange={set("profit")} placeholder="+150 hoặc -100" />
          </Field>
        </div>
        {partial.filled ? (
          <div className="partial-total">
            <span>Cộng dồn cả lệnh</span>
            <strong className={total.profit > 0 ? "text-win" : total.profit < 0 ? "text-loss" : ""}>
              {fmt(partial.profit)} (chốt bớt) {t.profit === "" ? "" : `+ ${fmt(Number(t.profit))} (đóng nốt) = ${fmt(total.profit)}`}
              {total.rr === null ? "" : ` · ${total.rr > 0 ? "+" : ""}${total.rr.toFixed(2)}R`}
            </strong>
          </div>
        ) : null}
        <Field label="Link / hình ảnh lúc thoát lệnh" incomplete={missing("exitVisual")}>
          <ImageOrLink link={t.exitLink} image={t.exitImage} onLinkChange={set("exitLink")} onImageChange={set("exitImage")} label="exit" />
        </Field>
        {outcome ? (
          <div className={`outcome-pill ${outcome}`}>{outcome === "win" ? "THẮNG" : outcome === "loss" ? "THUA" : "HÒA VỐN"}</div>
        ) : null}
      </Section>

      <Section num="4" title="Kỹ năng" subtitle="Vào lệnh · Trong lệnh · Thoát lệnh">
        <div className="grid-3">
          <Field label="Vào lệnh" incomplete={missing("entrySkill")}>
            <ResourceSelect value={t.entrySkill} onChange={set("entrySkill")} options={resources.entrySkills} placeholder="Chọn" />
          </Field>
          <Field label="Trong lệnh" incomplete={missing("inTradeSkill")}>
            <ResourceSelect value={t.inTradeSkill} onChange={set("inTradeSkill")} options={resources.inTradeSkills} placeholder="Chọn" />
          </Field>
          <Field label="Thoát lệnh" incomplete={missing("exitSkill")}>
            <ResourceSelect value={t.exitSkill} onChange={set("exitSkill")} options={resources.exitSkills} placeholder="Chọn" />
          </Field>
        </div>
        <Field label="Tự đánh giá kỹ năng" incomplete={missing("ratingSkill")}>
          <StarRating value={t.ratingSkill} onChange={set("ratingSkill")} />
        </Field>
        <Field label="Cảm nhận về kỹ năng" hint="Tùy chọn — viết thêm cảm nhận về cách bạn vào/giữ/thoát lệnh này">
          <textarea className="input textarea" value={t.skillNote || ""} onChange={(e) => set("skillNote")(e.target.value)} placeholder="Vào sớm hay trễ, có dời SL đúng lúc không, thoát lệnh vì lý do gì..." />
        </Field>
      </Section>

      <Section num="5" title="Tâm lý" subtitle="Trạng thái tâm lý khi giao dịch">
        <Field label="Tâm lý giao dịch" incomplete={missing("psychology")}>
          <ResourceSelect value={t.psychology} onChange={set("psychology")} options={resources.psychologies} placeholder="Chọn tâm lý" />
        </Field>
        <Field label="Tự đánh giá tâm lý" incomplete={missing("ratingPsychology")}>
          <StarRating value={t.ratingPsychology} onChange={set("ratingPsychology")} />
        </Field>
        <Field label="Cảm nghĩ về tâm lý" hint="Tùy chọn — viết thêm cảm nghĩ về trạng thái tâm lý của bạn ở lệnh này">
          <textarea className="input textarea" value={t.psychologyNote || ""} onChange={(e) => set("psychologyNote")(e.target.value)} placeholder="Lúc đó bạn sợ, tham, nôn nóng hay bình tĩnh — vì sao..." />
        </Field>
      </Section>

      <Section num="6" title="Chấm điểm" subtitle="Tổng hợp 4 trụ cột sao đã tự đánh giá ở trên">
        <div className="pillar-grid">
          <div className="pillar-item"><span>Kiến thức</span><StarRating value={t.ratingKnowledge} onChange={set("ratingKnowledge")} size={15} /></div>
          <div className="pillar-item"><span>Kỹ năng</span><StarRating value={t.ratingSkill} onChange={set("ratingSkill")} size={15} /></div>
          <div className="pillar-item"><span>Quản trị vốn</span><StarRating value={t.ratingRisk} onChange={set("ratingRisk")} size={15} /></div>
          <div className="pillar-item"><span>Tâm lý</span><StarRating value={t.ratingPsychology} onChange={set("ratingPsychology")} size={15} /></div>
        </div>
        <div className="pillar-avg">
          <span>Trung bình</span>
          <strong>{avgPillarScore(t) === null ? "—" : `${avgPillarScore(t).toFixed(1)} / 5 ★`}</strong>
        </div>
        <span className="field-hint">Có thể chỉnh lại từng sao ngay tại đây, không cần quay lại từng mục phía trên.</span>
      </Section>

      <Section num="7" title="Đánh giá giao dịch" subtitle="Tốt/Tồi kết hợp Thắng/Thua & review">
        {missing("tradeGrade") ? <AlertCircle size={11} className="field-missing-icon" title="Chưa chọn — đang ảnh hưởng tiến độ hoàn thành" /> : null}
        <div className="grade-grid">
          {GRADE_OPTIONS.map((g) => {
            const disabled = outcome && g.matches !== outcome;
            const active = t.tradeGrade === g.id;
            return (
              <button type="button" key={g.id} disabled={disabled} onClick={() => set("tradeGrade")(active ? "" : g.id)}
                className={`grade-btn ${g.tone} ${active ? "grade-active" : ""} ${disabled ? "grade-disabled" : ""}`}>
                {g.tone === "win" ? "\ud83d\udc4d" : "\u2620\ufe0f"} {g.label}
              </button>
            );
          })}
        </div>
        <span className="field-hint">2 lựa chọn khớp với Kết quả hiện tại (Thắng/Thua) sẽ bật lên, 2 lựa chọn còn lại tự mờ đi.</span>
        <Field label="Nhận xét / Review">
          <textarea className="input textarea" value={t.reviewNote} onChange={(e) => set("reviewNote")(e.target.value)} placeholder="Ghi chú, bài học rút ra..." />
        </Field>
        <button
          type="button"
          className={`lesson-toggle-btn ${t.hasLesson ? "lesson-toggle-active lesson-toggle-glow" : ""}`}
          style={{ marginTop: 10 }}
          onClick={() => set("hasLesson")(!t.hasLesson)}
        >
          <StickyNote size={15} /> {t.hasLesson ? "📌 Có bài học cần ghi nhớ" : "Đánh dấu là có bài học"}
        </button>
        {t.hasLesson ? (
          <Field label="Ghi chú bài học">
            <textarea className="input textarea" value={t.lessonNote} onChange={(e) => set("lessonNote")(e.target.value)} placeholder="Bài học rút ra từ lệnh này, điều cần chú ý lần sau..." />
          </Field>
        ) : null}
      </Section>

      <Section num="8" title="Checklist" subtitle="Kiểm tra nhanh trước khi chốt lệnh — quản lý danh sách ở tab Tài nguyên">
        <div className="pillar-grid">
          {resources.checklistItems.length === 0 ? <p className="empty-note">Chưa có mục checklist nào — thêm ở Tài nguyên → Checklist.</p> : null}
          {resources.checklistItems.map((item) => {
            const checked = !!(t.checklist && t.checklist[item]);
            return (
              <label key={item} className={`checklist-item ${checked ? "checklist-checked" : ""}`}>
                <input type="checkbox" checked={checked} onChange={(e) => set("checklist")({ ...(t.checklist || {}), [item]: e.target.checked })} />
                <span>{item}</span>
              </label>
            );
          })}
        </div>
      </Section>

      {formError ? <p className="error-text form-error">{formError}</p> : null}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Hủy</button>
        <button type="button" className="btn btn-primary" onClick={submit}><Save size={15} /> Lưu giao dịch</button>
      </div>
    </div>
  );
}
