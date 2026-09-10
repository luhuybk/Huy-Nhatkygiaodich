import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ArrowDownRight, FileSpreadsheet, Save, StickyNote, AlertTriangle, AlertCircle, Check, Scissors, CheckCircle2, History } from "lucide-react";
import { ConfirmButton, CompletionBar, Field, ImageOrLink, MoneyInput, MultiImageOrLink, ResourceSelect, RiskAlertBanner, Section, StarRating } from "./ui.jsx";
import { GRADE_OPTIONS, STRUCTURE_SCORES } from "../lib/constants.js";
import { accountOpenRisk, avgPillarScore, clearBrokerFilled, computeResult, LATE_REVIEW_DAYS, lateReviewState, todayStr, visibleFormSections, computeRiskAlerts, emptyPartialExit, emptyTrade, errorsForSetup, fmt, IN_TRADE_MAX_IMAGES, isFieldMissing, isForexSymbol, PARTIAL_MAX, partialExitR, partialExitShareR, partialExitsOf, partialExitStats, sessionFromTime, setTradeClean, toggleTradeError, tradeCompletion, tradeSectionProgress, skillLabel, skillsForSetup, toggleTradeSkill } from "../lib/helpers.js";

// Mục lục dính bên phải form. Form nhập lệnh dài 11 mục, cuộn từ đầu tới cuối mất phương
// hướng — cái này vừa là bản đồ vừa là danh sách việc còn thiếu, bấm là nhảy thẳng tới nơi.
// Chừa chỗ cho thanh tiến độ ghim ở đỉnh, không thì tiêu đề mục nhảy vào đúng chỗ bị che.
const TOC_SCROLL_OFFSET = 78;

// Tự tween thay vì dùng behavior:"smooth" — trình duyệt trong app nuốt luôn tuỳ chọn đó
// (đo được: scrollTo smooth không nhúc nhích, auto thì chạy), nên bấm mục lục sẽ không có
// phản hồi gì cả. Tự chạy thì chắc chắn tới nơi ở mọi trình duyệt.
function scrollBoxTo(box, top) {
  const from = box.scrollTop;
  const dist = top - from;
  if (!dist) return;
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || Math.abs(dist) < 8 || typeof requestAnimationFrame !== "function") {
    box.scrollTop = top;
    return;
  }
  const start = performance.now();
  const dur = Math.min(420, 140 + Math.abs(dist) * 0.22);
  // Có môi trường bóp requestAnimationFrame gần như đứng hẳn (đo được 1 frame/500ms), lúc đó
  // tween chạy được một nhịp rồi treo giữa đường. Hẹn một mốc chốt: quá hạn mà chưa tới nơi
  // thì nhảy thẳng. Chậm hơn một chút vẫn hơn là bấm mục lục mà không tới đâu.
  const settle = setTimeout(() => {
    if (Math.abs(box.scrollTop - top) > 2) box.scrollTop = top;
  }, dur + 90);
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur);
    const e = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
    box.scrollTop = from + dist * e;
    if (p < 1) requestAnimationFrame(step);
    else clearTimeout(settle);
  };
  requestAnimationFrame(step);
}

function FormToc({ trade, sections }) {
  const progress = tradeSectionProgress(trade);
  const [active, setActive] = useState(sections[0].id);
  const clicked = useRef(0);

  // Tô sáng mục đang xem. Dùng sự kiện cuộn chứ KHÔNG dùng IntersectionObserver: đo được là
  // có môi trường không chạy IO lần nào (kể cả callback đầu), lúc đó mục sáng đứng im mãi ở
  // mục 1. Đọc 11 cái getBoundingClientRect mỗi lần cuộn thì rẻ, mà chắc chắn chạy.
  // Sau khi bấm thì khoá một nhịp, không thì các mục lướt qua sẽ thi nhau sáng lên rồi tắt.
  useEffect(() => {
    const nodes = sections.map((sec) => document.getElementById(sec.id)).filter(Boolean);
    const box = nodes.length ? nodes[0].closest(".body") : null;
    if (!box) return undefined;
    const pick = () => {
      if (Date.now() < clicked.current) return;
      // Mục đang xem = mục cuối cùng có đỉnh còn nằm trên vạch ngay dưới thanh tiến độ.
      const line = box.getBoundingClientRect().top + TOC_SCROLL_OFFSET + 8;
      let best = nodes[0].id;
      nodes.forEach((n) => { if (n.getBoundingClientRect().top <= line) best = n.id; });
      // Cuộn kịch đáy thì mục cuối không bao giờ vượt qua vạch — cứ lấy nó.
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) best = nodes[nodes.length - 1].id;
      setActive(best);
    };
    pick();
    box.addEventListener("scroll", pick, { passive: true });
    return () => box.removeEventListener("scroll", pick);
  }, [sections]);

  const go = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    clicked.current = Date.now() + 700;
    setActive(id);
    const box = el.closest(".body");
    if (!box) { el.scrollIntoView(); return; }
    const top = box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - TOC_SCROLL_OFFSET;
    scrollBoxTo(box, Math.max(0, top));
  };

  return (
    <nav className="form-toc" aria-label="Mục lục form">
      <span className="form-toc-title">Các mục</span>
      <ul className="form-toc-list">
        {sections.map((sec) => {
          const p = progress.get(sec.id) || { missing: 0, total: 0 };
          const done = p.total > 0 && p.missing === 0;
          return (
            <li key={sec.id}>
              <button type="button" onClick={() => go(sec.id)}
                className={`form-toc-item ${active === sec.id ? "form-toc-active" : ""} ${p.missing ? "form-toc-missing" : ""}`}
                title={p.total === 0 ? "Không tính vào tiến độ" : p.missing ? `Còn thiếu ${p.missing}/${p.total} mục` : "Đã điền đủ"}>
                <span className="form-toc-num">{sec.num}</span>
                <span className="form-toc-label">{sec.title}</span>
                {p.missing ? <span className="form-toc-count">{p.missing}</span> : null}
                {done ? <CheckCircle2 size={13} className="form-toc-done" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

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
        const share = partialExitShareR(row, risk);
        return (
          <div key={row.id} className="partial-row">
            <div className="partial-row-head">
              <span className="partial-row-num">Lần {i + 1}</span>
              {rr === null ? (
                <span className="field-hint" style={{ margin: 0 }}>
                  {row.profit === "" ? "Điền lợi nhuận để tính R"
                    : !risk ? "Điền Rủi ro (số tiền) ở mục 2 để tính R"
                    : "Điền % vị thế đã đóng để tính R"}
                </span>
              ) : (
                <span className={`partial-row-r ${rr > 0 ? "text-win" : rr < 0 ? "text-loss" : ""}`}
                  title={`Giá đã chạy ${rr.toFixed(2)}R lúc chốt · phần này góp ${share > 0 ? "+" : ""}${share.toFixed(2)}R vào R tổng của lệnh`}>
                  {rr > 0 ? "+" : ""}{rr.toFixed(2)}R
                  <span className="partial-row-share">góp {share > 0 ? "+" : ""}{share.toFixed(2)}R</span>
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
            {fmt(stats.profit)}{stats.rr === null ? "" : ` · góp ${stats.rr > 0 ? "+" : ""}${stats.rr.toFixed(2)}R`}
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

// Bộ lỗi của đúng setup đang chọn. "Không lỗi" và các lỗi loại trừ nhau — tick cái này thì cái kia tự bỏ.
function SkillPicker({ trade, catalog, onChange }) {
  const { primary, others } = skillsForSetup(catalog, trade.setup);
  const selected = trade.skills || [];
  if (!primary.length && !others.length) {
    return <p className="empty-note">Chưa khai kỹ năng nào — thêm ở Hành trình giao dịch → Kỹ năng.</p>;
  }
  // Chip hiện tên ngắn; tên đầy đủ và phần diễn giải để ở tooltip, không làm vỡ hàng chip.
  const chip = (s, dim) => (
    <button key={s.id} type="button" title={[s.name, s.summary].filter(Boolean).join(" — ")}
      className={`chip-btn skill-chip ${dim ? "skill-chip-dim" : ""} ${selected.includes(s.id) ? "chip-active" : ""}`}
      onClick={() => onChange(toggleTradeSkill(trade, s.id))}>
      {skillLabel(s)}
    </button>
  );
  return (
    <div className="chip-group">
      {primary.map((s) => chip(s, false))}
      {others.length ? <span className="skill-chip-sep" title="Những kỹ năng khai cho setup khác — vẫn tick được">khác</span> : null}
      {others.map((s) => chip(s, true))}
    </div>
  );
}

function SetupErrorPicker({ trade, catalog, onChange }) {
  if (!trade.setup) return <p className="empty-note">Chọn setup ở trên trước, bộ lỗi sẽ hiện ra theo setup đó.</p>;
  const available = errorsForSetup(catalog, trade.setup);
  const selected = trade.setupErrors || [];
  // Đổi setup của lệnh thì lỗi đã tick của setup cũ không còn trong danh sách — vẫn phải hiện ra,
  // không thì lệnh mang một cái lỗi vô hình mà không có cách nào bỏ tick.
  const strays = selected
    .filter((id) => !available.some((e) => e.id === id))
    .map((id) => (catalog || []).find((e) => e.id === id))
    .filter(Boolean);
  if (available.length === 0 && strays.length === 0) {
    return <p className="empty-note">Setup "{trade.setup}" chưa khai lỗi nào — thêm ở tab "Lỗi theo setup".</p>;
  }
  return (
    <div className="chip-group">
      <button type="button" className={`chip-btn err-clean ${trade.setupClean ? "chip-active" : ""}`}
        onClick={() => onChange(setTradeClean(trade, !trade.setupClean))}>
        <Check size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Không lỗi
      </button>
      {available.map((e) => (
        <button key={e.id} type="button" title={e.note || ""}
          className={`chip-btn err-bad ${selected.includes(e.id) ? "chip-active" : ""}`}
          onClick={() => onChange(toggleTradeError(trade, e.id))}>
          {e.name}
        </button>
      ))}
      {strays.map((e) => (
        <button key={e.id} type="button" className="chip-btn err-bad chip-active"
          onClick={() => onChange(toggleTradeError(trade, e.id))}>
          {e.name} <span className="err-note">(setup {e.setup || "chung"})</span>
        </button>
      ))}
    </div>
  );
}

export function TradeForm({ initial, resources, setupErrors, skills, trades, ledger, onSave, onCancel }) {
  const [t, setT] = useState(initial || emptyTrade());
  const [formError, setFormError] = useState("");
  const set = (k) => (v) => setT((prev) => ({ ...prev, [k]: v }));
  const missing = (key) => isFieldMissing(t, key);
  // Khoá memo theo SỐ mục checklist chứ không theo cả object resources: object đó có thể là
  // một tham chiếu mới mỗi lần render, mà `sections` lại nằm trong deps của effect bắt cuộn
  // trong mục lục — đổi tham chiếu mỗi render là gắn/gỡ listener mỗi render.
  const checklistCount = ((resources && resources.checklistItems) || []).length;
  const sections = useMemo(() => visibleFormSections(resources), [checklistCount]); // eslint-disable-line react-hooks/exhaustive-deps
  const lateReview = lateReviewState(t);
  // Gỡ dấu thì thôi nhắc, nhưng giữ nguyên đoạn đã viết — xem lateReviewState().
  const setNeedsReview = (on) => setT((prev) => ({ ...prev, needsReview: !!on }));
  // Đóng dấu ngày ngay lúc viết. Không có ngày thì hai tuần sau đọc lại không biết dòng này
  // viết lúc nào — mà "viết lúc nào" chính là thứ khiến mục này có giá trị.
  const setLateReview = (v) => setT((prev) => ({
    ...prev,
    lateReviewNote: v,
    lateReviewDate: String(v || "").trim() ? prev.lateReviewDate || todayStr() : "",
  }));
  const { rr, outcome } = computeResult(t);
  const completion = tradeCompletion(t);
  const partial = partialExitStats(t);
  // Phí dương nghĩa là được cộng thêm — hiếm, nên nhắc một câu phòng khi gõ thiếu dấu trừ.
  const feeNum = t.fees === "" || t.fees === undefined || t.fees === null ? null : Number(t.fees);
  const feeApplied = feeNum !== null && Number.isFinite(feeNum) && feeNum !== 0 && t.profit !== "";
  const feeWarn = feeNum !== null && Number.isFinite(feeNum) && feeNum > 0;
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
    // Lưu một lần là coi như đã tự soát: gỡ dấu "kết quả lấy từ file sàn".
    onSave(clearBrokerFilled(t));
  };

  return (
    <div className="trade-form-layout">
      <div className="trade-form">
      <RiskAlertBanner alerts={riskAlerts} />
      <CompletionBar done={completion.done} total={completion.total} percent={completion.percent} sticky />
      {t.brokerFilled ? (
        <p className="broker-note">
          <FileSpreadsheet size={13} /> Lợi nhuận, ngày thoát và phí của lệnh này do <b>file sàn điền hộ</b> ngày {t.brokerFilled} —
          phần đánh giá bên dưới vẫn là việc của bạn. Lưu lệnh một lần là dấu này mất.
        </p>
      ) : null}
      <Section id="sec-1" num="1" title="Thông tin lệnh" subtitle="Symbol, entry, tài khoản, timeframe, phiên">
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

      <Section id="sec-2" num="2" title="Quản trị vốn" subtitle="Risk % · Risk $ · RR thực tế">
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

      <Section id="sec-3" num="3" title="Kiến thức" subtitle="Setup, bonus, nhận xét setup, điểm cấu trúc, lý do vào lệnh">
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
        <Field label="Lỗi của setup" hint="Soi lại lệnh: làm đúng thì chọn 'Không lỗi', mắc lỗi nào thì tick lỗi đó. Bỏ trống = chưa soi.">
          <SetupErrorPicker trade={t} catalog={setupErrors} onChange={setT} />
        </Field>
        <Field label="Lý do vào lệnh">
          <textarea className="input textarea" value={t.entryReason} onChange={(e) => set("entryReason")(e.target.value)} placeholder="Điền tay lý do vào lệnh..." />
        </Field>
        <Field label="Tự đánh giá kiến thức" incomplete={missing("ratingKnowledge")}>
          <StarRating value={t.ratingKnowledge} onChange={set("ratingKnowledge")} />
        </Field>
      </Section>

      <Section id="sec-1a" num="1A" title="Trong khi lệnh chạy" subtitle="Diễn biến & cảm nghĩ trong lúc lệnh đang mở" optional
        collapsible defaultOpen={inTradeFilled > 0} badge={inTradeFilled ? `${inTradeFilled} mục đã điền` : "trống"}>
        <Field label="Link / hình ảnh trong khi lệnh chạy" hint={`Tối đa ${IN_TRADE_MAX_IMAGES} ảnh/link`}>
          <MultiImageOrLink items={t.inTradeImages} onChange={set("inTradeImages")} label="in-trade" max={IN_TRADE_MAX_IMAGES} />
        </Field>
        <Field label="Cảm nghĩ khi lệnh đang chạy">
          <textarea className="input textarea" value={t.inTradeNote} onChange={(e) => set("inTradeNote")(e.target.value)} placeholder="Bạn nghĩ gì, cảm thấy thế nào trong lúc lệnh đang mở..." />
        </Field>
      </Section>

      <Section id="sec-1b" num="1B" title="Thoát lệnh từng phần" subtitle="Chốt bớt 25-50% rồi trailing phần còn lại" optional
        collapsible defaultOpen={partial.count > 0}
        badge={partial.count
          ? `${partial.count} lần · ${fmtPercent(partial.percent)}${partial.filled ? ` · ${fmt(partial.profit)}` : ""}`
          : "trống"}>
        <PartialExits trade={t} onChange={set("partialExits")} />
      </Section>

      <Section id="sec-1c" num="1C" title="Đóng lệnh" subtitle="Đóng nốt phần vị thế còn lại">
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
        <div className="grid-3">
          <Field label="Phí + thuế (mọi khoản bị trừ)"
            hint="Gộp TẤT CẢ những gì sàn trừ ngoài chênh lệch giá: hoa hồng, phí qua đêm, phí giao dịch, thuế bán, lãi vay margin. Giữ đúng dấu như sàn xuất — bị trừ thì là số âm (-8.78).">
            <MoneyInput value={t.fees} onChange={set("fees")} placeholder="-8.78" />
          </Field>
        </div>
        {feeWarn ? (
          <p className="field-hint" style={{ color: "var(--accent)", marginTop: -4 }}>
            Phí đang là số dương nên được cộng thêm vào lãi — nếu đây là khoản bị trừ thì đổi thành số âm.
          </p>
        ) : null}
        {feeApplied ? (
          <div className="partial-total">
            <span>Sau phí</span>
            <strong className={total.profit > 0 ? "text-win" : total.profit < 0 ? "text-loss" : ""}>
              {fmt(Number(t.profit) + partial.profit)} (lãi/lỗ) {Number(t.fees) >= 0 ? "+" : "−"} {fmt(Math.abs(Number(t.fees)))} (phí) = {fmt(total.profit)}
              {total.rr === null ? "" : ` · ${total.rr > 0 ? "+" : ""}${total.rr.toFixed(2)}R`}
            </strong>
          </div>
        ) : null}
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

      <Section id="sec-4" num="4" title="Kỹ năng" subtitle="Vào lệnh · Trong lệnh · Thoát lệnh">
        <Field label="Kỹ năng đã dùng trong lệnh này"
          hint="Tick những kỹ năng bạn thực sự đem ra dùng — để sau này đo được kỹ năng nào ăn tiền. Không tick gì nghĩa là lệnh này không dùng kỹ năng nào.">
          <SkillPicker trade={t} catalog={skills} onChange={setT} />
        </Field>
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

      <Section id="sec-5" num="5" title="Tâm lý" subtitle="Trạng thái tâm lý khi giao dịch">
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

      <Section id="sec-6" num="6" title="Chấm điểm" subtitle="Tổng hợp 4 trụ cột sao đã tự đánh giá ở trên">
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

      <Section id="sec-7" num="7" title="Đánh giá giao dịch" subtitle="Tốt/Tồi kết hợp Thắng/Thua & review">
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
        <Field label="Nhận xét / Review" hint="Viết ngay bây giờ, lúc còn nhớ rõ mình đã nghĩ gì">
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

      <Section id="sec-8" num="8" title="Nhìn lại sau" subtitle={`Đánh dấu lệnh đáng đọc lại sau ${LATE_REVIEW_DAYS} ngày`}>
        <button
          type="button"
          className={`lesson-toggle-btn ${t.needsReview ? "lesson-toggle-active lesson-toggle-glow" : ""}`}
          onClick={() => setNeedsReview(!t.needsReview)}
        >
          <History size={15} /> {t.needsReview ? `📌 Cần nhìn lại sau ${LATE_REVIEW_DAYS} ngày` : "Đánh dấu là cần nhìn lại sau"}
        </button>
        <span className="field-hint" style={{ display: "block", marginTop: 7 }}>
          {t.needsReview
            ? "Đến hạn, lệnh này sẽ hiện ở Sức khỏe nhật ký để bạn mở ra đọc lại."
            : "Tùy chọn — không phải lệnh nào cũng cần. Đánh dấu những lệnh mà bây giờ bạn chưa chắc mình đúng hay chỉ là may."}
        </span>
        {lateReview ? (
          <div className={`late-review ${lateReview.done ? "late-review-done" : lateReview.pendingExit ? "late-review-wait" : lateReview.ready ? "late-review-due" : "late-review-wait"}`}>
            <div className="late-review-head">
              <History size={14} />
              <strong>Nhìn lại sau {LATE_REVIEW_DAYS} ngày</strong>
              <span className="late-review-when">
                {lateReview.done
                  ? `đã viết${lateReview.doneDate ? ` ${lateReview.doneDate}` : ""}`
                  : lateReview.pendingExit
                    ? "chưa đóng lệnh — chưa tính được hạn"
                    : lateReview.ready
                      ? `đến hạn từ ${lateReview.due}`
                      : `tới hạn ${lateReview.due} · còn ${lateReview.daysLeft} ngày`}
              </span>
            </div>
            <span className="field-hint">
              {lateReview.pendingExit
                ? `Hạn đếm từ ngày thoát lệnh, nên điền Ngày exit ở mục 1C xong mới có hạn. Đánh dấu trước từ bây giờ cũng được — lúc còn đang trong lệnh mới nhớ rõ vì sao mình muốn đọc lại.`
                : lateReview.ready || lateReview.done
                  ? "Đọc lại phần Nhận xét / Review ở mục 7 trước khi viết. Giờ đã biết giá đi tiếp thế nào — lúc đó bạn nhìn đúng, hay chỉ đang thắng nên thấy gì cũng đúng?"
                  : "Chưa tới lúc. Để nguội cho hết cảm xúc của chính lệnh này rồi hãy đọc lại — viết sớm thì vẫn là góc nhìn cũ. Muốn viết trước vẫn được."}
            </span>
            <textarea
              className="input textarea"
              value={t.lateReviewNote || ""}
              onChange={(e) => setLateReview(e.target.value)}
              placeholder="Đọc lại nhận xét cũ, giờ bạn thấy gì khác? Điều gì lúc đó tưởng là kỹ năng mà hoá ra là may..."
            />
          </div>
        ) : null}
      </Section>

      {sections.some((sec) => sec.id === "sec-9") ? (
      <Section id="sec-9" num="9" title="Checklist" subtitle="Kiểm tra nhanh trước khi chốt lệnh — quản lý danh sách ở tab Tài nguyên">
        <div className="pillar-grid">
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
      ) : null}

      {formError ? <p className="error-text form-error">{formError}</p> : null}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Hủy</button>
        <button type="button" className="btn btn-primary" onClick={submit}><Save size={15} /> Lưu giao dịch</button>
      </div>
      </div>
      <FormToc trade={t} sections={sections} />
    </div>
  );
}
