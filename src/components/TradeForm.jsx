import { useState } from "react";
import { ArrowUpRight, ArrowDownRight, Save, StickyNote, AlertTriangle } from "lucide-react";
import { Field, ImageOrLink, MoneyInput, ResourceSelect, Section, StarRating } from "./ui.jsx";
import { GRADE_OPTIONS, STRUCTURE_SCORES } from "../lib/constants.js";
import { accountOpenRisk, avgPillarScore, computeResult, emptyTrade } from "../lib/helpers.js";

export function TradeForm({ initial, resources, trades, ledger, onSave, onCancel }) {
  const [t, setT] = useState(initial || emptyTrade());
  const [formError, setFormError] = useState("");
  const set = (k) => (v) => setT((prev) => ({ ...prev, [k]: v }));
  const { rr, outcome } = computeResult(t);
  const accountNames = resources.accounts.map((a) => a.name);
  const selectedAccount = resources.accounts.find((a) => a.name === t.account);
  const existingOpenRisk = selectedAccount
    ? accountOpenRisk(selectedAccount, ledger || [], (trades || []).filter((x) => x.id !== t.id))
    : { pct: 0, count: 0 };

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
      <Section num="1" title="Thông tin lệnh" subtitle="Symbol, entry, tài khoản, timeframe, phiên">
        <div className="grid-2">
          <Field label="Symbol" required>
            <input className="input" list="symbol-suggestions" value={t.symbol} onChange={(e) => set("symbol")(e.target.value.toUpperCase())} placeholder="VD: XAUUSD, HPG..." />
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
          <Field label="Ngày entry">
            <input type="date" className="input" value={t.entryDate} onChange={(e) => set("entryDate")(e.target.value)} />
          </Field>
          <Field label="Tài khoản">
            <ResourceSelect value={t.account} onChange={set("account")} options={accountNames} placeholder="Chọn tài khoản" />
          </Field>
          <Field label="Khung thời gian">
            <ResourceSelect value={t.timeframe} onChange={set("timeframe")} options={resources.timeframes} placeholder="Chọn timeframe" />
          </Field>
          <Field label="Phiên giao dịch">
            <ResourceSelect value={t.session} onChange={set("session")} options={resources.sessions} placeholder="Chọn phiên" />
          </Field>
        </div>
        <Field label="Link / hình ảnh lúc vào lệnh">
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
          <Field label="Rủi ro (%)">
            <input type="number" step="0.01" className="input mono" value={t.riskPercent} onChange={(e) => set("riskPercent")(e.target.value)} placeholder="1.0" />
          </Field>
          <Field label="Rủi ro (số tiền)">
            <MoneyInput value={t.riskAmount} onChange={set("riskAmount")} placeholder="100" />
          </Field>
          <Field label="RR thực (tự tính khi có Lãi/Lỗ)">
            <div className={`rr-readout ${outcome === "win" ? "rr-win" : outcome === "loss" ? "rr-loss" : ""}`}>
              {rr === null ? "—" : `${rr > 0 ? "+" : ""}${rr.toFixed(2)}R`}
            </div>
          </Field>
        </div>
        <Field label="Quản trị vốn">
          <ResourceSelect value={t.riskAction} onChange={set("riskAction")} options={resources.riskActions} placeholder="VD: Nâng vốn, Giữ vốn, Giảm risk..." />
        </Field>
        <Field label="Lý do">
          <textarea className="input textarea" value={t.riskActionReason} onChange={(e) => set("riskActionReason")(e.target.value)} placeholder="Vì sao nâng/giữ/giảm vốn lần này..." />
        </Field>
        <Field label="Tự đánh giá quản trị vốn">
          <StarRating value={t.ratingRisk} onChange={set("ratingRisk")} />
        </Field>
      </Section>

      <Section num="3" title="Kiến thức" subtitle="Setup, bonus, nhận xét setup, điểm cấu trúc, lý do vào lệnh">
        <div className="grid-3">
          <Field label="Setup">
            <ResourceSelect value={t.setup} onChange={set("setup")} options={resources.setups} placeholder="Chọn setup" />
          </Field>
          <Field label="Bonus">
            <ResourceSelect value={t.setupBonus} onChange={set("setupBonus")} options={resources.setupBonus} placeholder="Chọn bonus (nếu có)" />
          </Field>
          <Field label="Nhận xét Setup">
            <ResourceSelect value={t.setupNote} onChange={set("setupNote")} options={resources.setupNotes} placeholder="Chọn nhận xét" />
          </Field>
          <Field label="Điểm cấu trúc (ĐCT)" hint="Cho cặp forex — thang 0 đến 7, bước 0.5">
            <ResourceSelect value={t.structureScore} onChange={set("structureScore")} options={STRUCTURE_SCORES} placeholder="Chọn điểm (0-7)" />
          </Field>
        </div>
        <Field label="Lý do vào lệnh">
          <textarea className="input textarea" value={t.entryReason} onChange={(e) => set("entryReason")(e.target.value)} placeholder="Điền tay lý do vào lệnh..." />
        </Field>
        <Field label="Tự đánh giá kiến thức">
          <StarRating value={t.ratingKnowledge} onChange={set("ratingKnowledge")} />
        </Field>
      </Section>

      <Section num="1A" title="Đóng lệnh" subtitle="Điền khi lệnh đã hoàn thành">
        <div className="grid-2">
          <Field label="Ngày exit">
            <input type="date" className="input" value={t.exitDate} onChange={(e) => set("exitDate")(e.target.value)} />
          </Field>
          <Field label="Lợi nhuận (+/-, theo tiền tệ tài khoản)">
            <MoneyInput value={t.profit} onChange={set("profit")} placeholder="+150 hoặc -100" />
          </Field>
        </div>
        <Field label="Link / hình ảnh lúc thoát lệnh">
          <ImageOrLink link={t.exitLink} image={t.exitImage} onLinkChange={set("exitLink")} onImageChange={set("exitImage")} label="exit" />
        </Field>
        {outcome ? (
          <div className={`outcome-pill ${outcome}`}>{outcome === "win" ? "THẮNG" : outcome === "loss" ? "THUA" : "HÒA VỐN"}</div>
        ) : null}
      </Section>

      <Section num="4" title="Kỹ năng" subtitle="Vào lệnh · Trong lệnh · Thoát lệnh">
        <div className="grid-3">
          <Field label="Vào lệnh">
            <ResourceSelect value={t.entrySkill} onChange={set("entrySkill")} options={resources.entrySkills} placeholder="Chọn" />
          </Field>
          <Field label="Trong lệnh">
            <ResourceSelect value={t.inTradeSkill} onChange={set("inTradeSkill")} options={resources.inTradeSkills} placeholder="Chọn" />
          </Field>
          <Field label="Thoát lệnh">
            <ResourceSelect value={t.exitSkill} onChange={set("exitSkill")} options={resources.exitSkills} placeholder="Chọn" />
          </Field>
        </div>
        <Field label="Tự đánh giá kỹ năng">
          <StarRating value={t.ratingSkill} onChange={set("ratingSkill")} />
        </Field>
      </Section>

      <Section num="5" title="Tâm lý" subtitle="Trạng thái tâm lý khi giao dịch">
        <Field label="Tâm lý giao dịch">
          <ResourceSelect value={t.psychology} onChange={set("psychology")} options={resources.psychologies} placeholder="Chọn tâm lý" />
        </Field>
        <Field label="Tự đánh giá tâm lý">
          <StarRating value={t.ratingPsychology} onChange={set("ratingPsychology")} />
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
          className={`lesson-toggle-btn ${t.hasLesson ? "lesson-toggle-active" : ""}`}
          style={{ marginTop: 10 }}
          onClick={() => set("hasLesson")(!t.hasLesson)}
        >
          <StickyNote size={15} /> {t.hasLesson ? "Có bài học cần ghi nhớ" : "Đánh dấu là có bài học"}
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
