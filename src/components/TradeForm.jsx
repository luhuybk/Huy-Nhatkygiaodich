import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ArrowDownRight, FileSpreadsheet, Save, StickyNote, AlertTriangle, AlertCircle, Check, Scissors, CheckCircle2, History, Plus, ChevronDown, Image as ImageIcon, ListChecks, X } from "lucide-react";
import { ConfirmButton, CompletionBar, Field, ImageOrLink, MoneyInput, MultiImageOrLink, ResourceSelect, RiskAlertBanner, Section, ShotGallery, StarRating, LinkScope, focusFirstField } from "./ui.jsx";
import { clearDraft, draftKey, mergeDraft, pruneDrafts, readDraft, releaseActiveDraft, sameTradeContent, setActiveDraft, writeDraft } from "../lib/tradeDraft.js";
import { RiskTierChips } from "./CapitalPlan.jsx";
import { MarketCondPicker, RegimeRiskNote } from "./MarketRegime.jsx";
import { FxCondPicker } from "./FxStrength.jsx";
import { marketDrawdown, riskTierOptions } from "../lib/capital.js";
import { ASSET_GROUPS, assetGroupInfo, assetGroupOf } from "../lib/assetGroups.js";
import { GRADE_OPTIONS, sortStructureScores, STRUCTURE_SCORES, structureScoreNumber } from "../lib/constants.js";
import { accountOpenRisk, accountTimeframes, avgPillarScore, clearBrokerFilled, computeResult, canonicalSymbol, looksTelexed, emptyReviewEntry, migrateReviewFields, REVIEW_MAX_IMAGES, REVIEW_TARGET_SHARE, reviewShare, MISTAKE_MAX_IMAGES, mistakeImages, todayStr, visibleFormSections, computeRiskAlerts, emptyPartialExit, emptyTrade, errorsForSetup, fmt, IN_TRADE_MAX_IMAGES, isFieldMissing, isForexSymbol, PARTIAL_MAX, partialExitR, partialExitShareR, partialExitsOf, partialExitStats, sessionFromTime, setTradeClean, toggleTradeError, tradeCompletion, tradeSectionProgress, skillLabel, skillsForSetup, toggleTradeSkill, tradeImageShots } from "../lib/helpers.js";

// Mục lục dính bên phải form. Form nhập lệnh dài 11 mục, cuộn từ đầu tới cuối mất phương
// hướng — cái này vừa là bản đồ vừa là danh sách việc còn thiếu, bấm là nhảy thẳng tới nơi.
// Chừa chỗ cho thanh tiến độ ghim ở đỉnh, không thì tiêu đề mục nhảy vào đúng chỗ bị che.
const TOC_SCROLL_OFFSET = 78;

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");
const SAVE_KEY = IS_MAC ? "⌘S" : "Ctrl+S";
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const ddmmhh = (ms) => { const d = new Date(ms); return `${hhmm(ms)} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; };

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

// Cuộn tới một mục của form (tính chừa thanh tiến độ ghim ở đỉnh) — dùng chung cho mục lục bên
// phải và thanh dưới đáy ở màn hẹp.
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const box = el.closest(".body");
  if (!box) { el.scrollIntoView(); return; }
  const top = box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - TOC_SCROLL_OFFSET;
  scrollBoxTo(box, Math.max(0, top));
}

// Ảnh của lệnh để xem nhanh. Khoá theo cả link: link đổi thì thử tải lại thay vì giữ trạng thái
// "lỗi" của link cũ.
const quickShots = (trade) => tradeImageShots(trade).map((s) => ({ ...s, key: `${s.key}|${s.link || ""}|${s.image || ""}` }));
const rrText = (rr) => (rr === null ? "—" : `${rr > 0 ? "+" : ""}${rr.toFixed(2)}R`);

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
    if (!document.getElementById(id)) return;
    clicked.current = Date.now() + 700;
    setActive(id);
    scrollToSection(id);
  };

  // RR thực ghim ở đầu mục lục — khỏi kéo lên mục Quản trị vốn mỗi lần muốn xem.
  // Kèm tên lệnh (mã · Buy/Sell · ngày vào) để biết đang sửa lệnh nào mà khỏi kéo lên đầu form.
  const { rr, outcome } = computeResult(trade);
  // Ảnh chụp xem nhanh ngay cạnh form — dán nhầm link TradingView của ảnh này sang ô kia là thấy liền.
  const shots = quickShots(trade);
  const symbol = canonicalSymbol(trade.symbol) || "";
  const dateBits = (trade.entryDate || "").split("-");
  const entryDay = dateBits.length === 3 ? `${dateBits[2]}/${dateBits[1]}` : "";
  return (
    <nav className="form-toc" aria-label="Mục lục form">
      <div className="form-toc-rr-wrap">
        <button type="button" className={`form-toc-rr ${outcome === "win" ? "form-toc-rr-win" : outcome === "loss" ? "form-toc-rr-loss" : ""}`}
          onClick={() => go("sec-2")} title="RR thực — tự tính khi có Lãi/Lỗ và Rủi ro (số tiền). Bấm để tới mục Quản trị vốn.">
          <span className="form-toc-rr-trade">
            <span className={`form-toc-rr-symbol ${symbol ? "" : "is-empty"}`}>{symbol || "Chưa có mã"}</span>
            <span className={`dir-pill ${trade.direction}`}>{trade.direction === "buy" ? "Buy" : "Sell"}</span>
            {entryDay && <span className="form-toc-rr-date mono">{entryDay}</span>}
          </span>
          <span className="form-toc-rr-label">RR thực</span>
          <b className="mono">{rrText(rr)}</b>
          <span className="form-toc-rr-hint">{rr === null ? "Chưa có Lãi/Lỗ" : outcome === "win" ? "Lệnh thắng" : outcome === "loss" ? "Lệnh thua" : "Hoà vốn"} · mục 2 →</span>
        </button>
      </div>
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
      {shots.length ? (
        <div className="form-toc-shots">
          <span className="form-toc-title">Ảnh chụp · {shots.length}</span>
          <ShotGallery shots={shots} compact />
        </div>
      ) : null}
    </nav>
  );
}

// Màn hẹp (laptop nhỏ, điện thoại) không đủ chỗ cho cột mục lục bên phải — thay bằng thanh dính
// đáy: mã + hướng, RR thực, số mục còn thiếu (bấm mở mục lục), ảnh chụp và nút Lưu. Màn rộng thì
// CSS ẩn thanh này đi vì cột mục lục đã có đủ.
function FormBottomBar({ trade, sections, onSave }) {
  const [panel, setPanel] = useState(null); // "toc" | "shots" | null
  const ref = useRef(null);
  useEffect(() => {
    if (!panel) return undefined;
    const onDown = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest(".shot-lightbox")) return;
      setPanel(null);
    };
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".shot-lightbox")) setPanel(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [panel]);
  const progress = tradeSectionProgress(trade);
  const completion = tradeCompletion(trade);
  const left = completion.total - completion.done;
  const { rr, outcome } = computeResult(trade);
  const shots = quickShots(trade);
  const symbol = canonicalSymbol(trade.symbol) || "";
  const toggle = (p) => setPanel((cur) => (cur === p ? null : p));
  const jump = (id) => { setPanel(null); scrollToSection(id); };
  return (
    <div className="form-bbar" ref={ref}>
      {panel === "toc" ? (
        <div className="form-bbar-panel">
          <div className="form-bbar-panel-head"><b>Các mục</b><button type="button" className="row-btn" onClick={() => setPanel(null)}><X size={15} /></button></div>
          <ul className="form-bbar-toc">
            {sections.map((sec) => {
              const p = progress.get(sec.id) || { missing: 0, total: 0 };
              return (
                <li key={sec.id}>
                  <button type="button" onClick={() => jump(sec.id)} className={p.missing ? "is-missing" : ""}>
                    <span className="form-toc-num">{sec.num}</span>
                    <span className="form-bbar-toc-label">{sec.title}</span>
                    {p.missing ? <span className="form-toc-count">{p.missing}</span> : p.total ? <CheckCircle2 size={13} className="form-toc-done" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {panel === "shots" ? (
        <div className="form-bbar-panel">
          <div className="form-bbar-panel-head"><b>Ảnh chụp · {shots.length}</b><button type="button" className="row-btn" onClick={() => setPanel(null)}><X size={15} /></button></div>
          <ShotGallery shots={shots} compact />
        </div>
      ) : null}
      <div className="form-bbar-row">
        <span className="form-bbar-trade">
          <b className={symbol ? "" : "is-empty"}>{symbol || "Chưa có mã"}</b>
          <span className={`dir-pill ${trade.direction}`}>{trade.direction === "buy" ? "Buy" : "Sell"}</span>
        </span>
        <button type="button" className={`form-bbar-rr ${outcome === "win" ? "is-win" : outcome === "loss" ? "is-loss" : ""}`}
          onClick={() => jump("sec-2")} title="RR thực — bấm để tới mục Quản trị vốn">
          <small>RR</small><b className="mono">{rrText(rr)}</b>
        </button>
        <button type="button" className={`form-bbar-btn ${panel === "toc" ? "is-on" : ""} ${left ? "has-missing" : ""}`} onClick={() => toggle("toc")}
          title="Mở mục lục — bấm một mục để nhảy tới">
          <ListChecks size={14} /> {left ? <><span className="form-bbar-xs-hide">Còn </span>{left}</> : "Đủ"}
        </button>
        {shots.length ? (
          <button type="button" className={`form-bbar-btn ${panel === "shots" ? "is-on" : ""}`} onClick={() => toggle("shots")} title="Xem nhanh ảnh chụp">
            <ImageIcon size={14} /> {shots.length}
          </button>
        ) : null}
        <button type="button" className="btn btn-primary form-bbar-save" onClick={onSave} title={`Lưu giao dịch (${SAVE_KEY})`}>
          <Save size={14} className="form-bbar-xs-hide" /> Lưu <kbd className="kbd-hint">{SAVE_KEY}</kbd>
        </button>
      </div>
    </div>
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

// Mỗi lần mở lệnh ra xem lại là một dòng riêng: ngày + nhận xét + ảnh chart lúc đó. Chỉ lần
// mới nhất mở sẵn để viết; các lần trước gấp lại còn một dòng tóm tắt, bấm vào mới mở — nhìn
// lại nhiều lần mà form vẫn gọn, và không lần nào viết đè lên lần trước.
function ReviewLog({ entries, onChange, onRemove, onAdd }) {
  const latestId = entries.length ? entries[entries.length - 1].id : null;
  const [openIds, setOpenIds] = useState(() => new Set(latestId ? [latestId] : []));
  const lastLen = useRef(entries.length);
  useEffect(() => {
    // Vừa bấm "Nhìn lại lần mới" thì mở đúng lần đó ra để viết.
    if (entries.length > lastLen.current && latestId) setOpenIds((prev) => new Set([...prev, latestId]));
    lastLen.current = entries.length;
  }, [entries.length, latestId]);
  const toggle = (id) => setOpenIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ordered = [...entries].map((e, i) => ({ e, n: i + 1 })).reverse();
  return (
    <div className="review-log">
      <div className="review-log-head">
        <span>Các lần nhìn lại</span>
        <button type="button" className="btn btn-ghost review-log-add" onClick={onAdd}><Plus size={13} /> Nhìn lại lần mới</button>
      </div>
      {!entries.length ? <p className="field-hint" style={{ margin: 0 }}>Chưa có lần nào. Mỗi lần mở lệnh ra xem lại, bấm "Nhìn lại lần mới" để ghi nhận xét và ảnh của lần đó.</p> : null}
      {ordered.map(({ e, n }) => {
        const open = openIds.has(e.id);
        const shots = (e.images || []).filter((x) => x && (x.link || x.image)).length;
        const firstLine = String(e.note || "").split("\n").map((x) => x.trim()).find(Boolean) || "";
        return (
          <div key={e.id} className={`review-entry ${open ? "review-entry-open" : ""}`}>
            <div className="review-entry-head">
              <button type="button" className="review-entry-toggle" onClick={() => toggle(e.id)}>
                <ChevronDown size={13} className="review-entry-chev" />
                <b>Lần {n}</b>
                <span className="mono review-entry-date">{e.date || "—"}</span>
                {!open ? <span className="review-entry-peek">{firstLine || (shots ? "" : "trống")}</span> : null}
                {!open && shots ? <span className="review-entry-shots">{shots} ảnh</span> : null}
              </button>
              <ConfirmButton onConfirm={() => onRemove(e.id)} />
            </div>
            {open ? (
              <div className="review-entry-body">
                <div className="review-entry-row">
                  <Field label="Ngày nhìn lại">
                    <input type="date" className="input" value={e.date || ""} onChange={(ev) => onChange(e.id, { date: ev.target.value })} />
                  </Field>
                </div>
                <textarea className="input textarea" value={e.note || ""} onChange={(ev) => onChange(e.id, { note: ev.target.value })}
                  placeholder="Giờ nhìn lại thấy gì? Giá đã đi tiếp thế nào, lúc đó mình nhìn đúng hay chỉ là may..." />
                <Field label="Ảnh chart lần này" hint={`Chụp chart lúc nhìn lại để so với lúc vào lệnh — tối đa ${REVIEW_MAX_IMAGES} ảnh/link`}>
                  <MultiImageOrLink items={e.images} onChange={(v) => onChange(e.id, { images: v })} label={`review-${e.id}`} max={REVIEW_MAX_IMAGES} />
                </Field>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function TradeForm({ initial, resources, capitalPlan, setupErrors, skills, trades, ledger, onSave, onCancel, onDirtyChange }) {
  const [t, setT] = useState(() => migrateReviewFields(initial || emptyTrade()));
  // Báo cho App biết form đã sửa gì chưa — để nút Back của chuột / trình duyệt hỏi lại trước khi
  // bỏ thay đổi. So từng trường theo tham chiếu: setT chỉ thay trường vừa sửa, khỏi stringify cả lệnh.
  const startRef = useRef(t);
  useEffect(() => {
    if (!onDirtyChange) return;
    const a = startRef.current;
    onDirtyChange(Object.keys({ ...a, ...t }).some((k) => a[k] !== t[k]));
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (onDirtyChange) onDirtyChange(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [formError, setFormError] = useState("");
  const set = (k) => (v) => setT((prev) => ({ ...prev, [k]: v }));

  // ——— Nháp tự lưu ———
  // Lệnh chưa có trong danh sách = lệnh mới (dùng chung ô nháp "new").
  const draftRef = useRef(null);
  if (!draftRef.current) {
    const isNew = !(trades || []).some((x) => x && x.id === startRef.current.id);
    draftRef.current = { key: draftKey(startRef.current.id, isNew), isNew, done: false, wrote: false };
  }
  // Khung tự điền theo tài khoản (tài khoản đặt theo khung). Còn là khung tự điền thì đổi tài khoản
  // khung đổi theo; bạn tự chọn khung rồi thì giữ nguyên, trừ khi tài khoản mới không đánh khung đó.
  const autoTfRef = useRef(false);
  const tfOf = (name) => accountTimeframes(resources.accounts.find((a) => a.name === name), trades);
  const pickAccount = (name) => setT((prev) => {
    const next = { ...prev, account: name };
    const tf = tfOf(name);
    if (tf.list.length && (!prev.timeframe || autoTfRef.current || (tf.configured && !tf.list.includes(prev.timeframe)))) {
      next.timeframe = tf.list[0];
      autoTfRef.current = true;
    }
    return next;
  });
  // Chọn khung trước khi chọn tài khoản: chỉ một tài khoản ghi khung đó thì điền luôn tài khoản.
  const pickTimeframe = (tf) => setT((prev) => {
    autoTfRef.current = false;
    const next = { ...prev, timeframe: tf };
    if (!prev.account && tf) {
      const owners = resources.accounts.filter((a) => (a.timeframes || []).includes(tf));
      if (owners.length === 1) next.account = owners[0].name;
    }
    return next;
  });
  useEffect(() => {
    // Lệnh mới đã có sẵn tài khoản (tài khoản đang chọn ở thanh bên) mà chưa có khung.
    if (!draftRef.current.isNew || t.timeframe || !t.account) return;
    const tf = tfOf(t.account);
    if (!tf.list.length) return;
    autoTfRef.current = true;
    // Ghi cả vào mốc ban đầu: khung tự điền không phải là "đã sửa" — mở form rồi thoát không bị hỏi lại.
    startRef.current = { ...startRef.current, timeframe: tf.list[0] };
    setT((prev) => (prev.timeframe ? prev : { ...prev, timeframe: tf.list[0] }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [pendingDraft, setPendingDraft] = useState(null);
  const [draftInfo, setDraftInfo] = useState(null); // { at, ok }
  const isDirty = (x) => { const a = startRef.current; return Object.keys({ ...a, ...x }).some((k) => a[k] !== x[k]); };
  const latestT = useRef(t);
  latestT.current = t;
  // Mở form: có nháp khác với lệnh đang mở thì hỏi. Đọc trong effect (không phải lúc render) để
  // form cũ vừa đóng kịp ghi nháp của nó trước.
  useEffect(() => {
    const r = draftRef.current;
    setActiveDraft(r);
    pruneDrafts();
    const d = readDraft(r.key);
    if (d && !sameTradeContent(mergeDraft(startRef.current, d), startRef.current)) setPendingDraft(d);
    else if (d) clearDraft(r.key);
    return () => releaseActiveDraft(r);
  }, []);
  // Lệnh mới: con trỏ nằm sẵn ở ô Symbol (chỉ khi ô còn trống — lệnh nhập từ file môi giới
  // hay bot Telegram đã có mã thì để yên).
  useEffect(() => {
    const id = setTimeout(() => focusFirstField(document.getElementById("sec-1")), 0);
    return () => clearTimeout(id);
  }, []);
  // Ghi nháp sau mỗi lần sửa (chờ 0,7 giây gõ yên). Đang hỏi khôi phục thì chưa ghi gì — không
  // thì nháp cũ bị ghi đè trước khi kịp chọn.
  useEffect(() => {
    const r = draftRef.current;
    if (pendingDraft || r.done) return undefined;
    // Sửa rồi hoàn tác về y như lúc mở thì xoá nháp. Chỉ xoá nháp DO FORM NÀY GHI: lúc mới mở,
    // effect này chạy cùng nhịp với effect đọc nháp (pendingDraft chưa kịp có) — xoá bừa ở đây là
    // mất luôn nháp cũ đang chờ người dùng chọn khôi phục.
    if (!isDirty(t)) {
      if (r.wrote) { clearDraft(r.key); r.wrote = false; setDraftInfo(null); }
      return undefined;
    }
    const timer = setTimeout(() => {
      const ok = writeDraft(r.key, t, startRef.current);
      r.wrote = ok;
      setDraftInfo({ at: Date.now(), ok });
    }, 700);
    return () => clearTimeout(timer);
  }, [t, pendingDraft]); // eslint-disable-line react-hooks/exhaustive-deps
  // Đóng tab / rời form giữa lúc chờ 0,7 giây: ghi ngay bản mới nhất.
  useEffect(() => {
    const flush = () => {
      const r = draftRef.current;
      if (!r.done && !pendingDraft && isDirty(latestT.current)) writeDraft(r.key, latestT.current, startRef.current);
    };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [pendingDraft]); // eslint-disable-line react-hooks/exhaustive-deps
  const restoreDraft = () => {
    setT((prev) => migrateReviewFields(mergeDraft(prev, pendingDraft)));
    setPendingDraft(null);
  };
  const discardDraft = () => {
    clearDraft(draftRef.current.key);
    setPendingDraft(null);
  };
  const cancel = () => {
    if (isDirty(t) && !window.confirm("Bỏ các thay đổi chưa lưu của lệnh này? (Bản nháp tự lưu cũng bị xoá.)")) return;
    draftRef.current.done = true;
    clearDraft(draftRef.current.key);
    onCancel();
  };
  const missing = (key) => isFieldMissing(t, key);
  // Khoá memo theo SỐ mục checklist chứ không theo cả object resources: object đó có thể là
  // một tham chiếu mới mỗi lần render, mà `sections` lại nằm trong deps của effect bắt cuộn
  // trong mục lục — đổi tham chiếu mỗi render là gắn/gỡ listener mỗi render.
  const checklistCount = ((resources && resources.checklistItems) || []).length;
  const knownSymbols = useMemo(() => new Set([
    ...((resources && resources.symbols) || []),
    ...(trades || []).map((x) => x && x.symbol),
  ].filter(Boolean).map((x) => String(x).toUpperCase())), [resources && resources.symbols, trades]); // eslint-disable-line react-hooks/exhaustive-deps
  const applySymbol = (sym) => setT((prev) => {
    const next = { ...prev, symbol: sym };
    if (prev.entryTime && isForexSymbol(sym)) {
      const guess = sessionFromTime(prev.entryTime);
      if (guess && resources.sessions.includes(guess)) next.session = guess;
    }
    return next;
  });
  // Thang ĐCT lấy từ Tài nguyên. Nhãn "0 đến 12" tính từ chính thang đó, để câu gợi ý không
  // còn nói "0 đến 7" khi thang đã lên 12.
  const structureScale = useMemo(() => {
    const options = sortStructureScores((resources && resources.structureScores) || STRUCTURE_SCORES);
    const nums = options.map(structureScoreNumber).filter((n) => n !== null);
    return { options, label: nums.length ? `${Math.min(...nums)} đến ${Math.max(...nums)}` : "chưa có mức nào" };
  }, [resources && resources.structureScores]); // eslint-disable-line react-hooks/exhaustive-deps
  const sections = useMemo(() => visibleFormSections(resources), [checklistCount]); // eslint-disable-line react-hooks/exhaustive-deps
  // Gỡ dấu thì thôi nằm trong danh sách cần nhìn lại, nhưng các lần đã ghi vẫn giữ nguyên.
  const setNeedsReview = (on) => setT((prev) => ({ ...prev, needsReview: !!on }));
  const setHasMistake = (on) => setT((prev) => ({ ...prev, hasMistake: !!on }));
  const mistakeText = !!String(t.mistakeNote || "").trim();
  const mistakeShots = mistakeImages(t).length > 0;
  const reviewLog = Array.isArray(t.reviewLog) ? t.reviewLog : [];
  const setReviewEntry = (id, patch) => setT((prev) => ({ ...prev, reviewLog: (prev.reviewLog || []).map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const removeReviewEntry = (id) => setT((prev) => ({ ...prev, reviewLog: (prev.reviewLog || []).filter((e) => e.id !== id) }));
  // Tỉ lệ lệnh đang đánh dấu, tính luôn lệnh đang mở trong form (kể cả khi chưa lưu).
  const share = useMemo(() => reviewShare([...(trades || []).filter((x) => x.id !== t.id), t]), [trades, t]);
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
  const autoAsset = assetGroupInfo(assetGroupOf({ ...t, assetGroup: "" }, resources));
  const accTf = tfOf(t.account);
  const tfHint = accTf.configured && t.timeframe && !accTf.list.includes(t.timeframe)
    ? `Tài khoản "${t.account}" ghi khung ${accTf.list.join(", ")} — kiểm lại tài khoản hoặc khung`
    : autoTfRef.current && t.timeframe ? "Tự điền theo tài khoản — chọn lại nếu cần" : undefined;
  const tierOptions = useMemo(
    () => (capitalPlan ? riskTierOptions(capitalPlan, t.account, t.entryDate || todayStr(), resources.accounts, t.symbol, t.assetGroup) : null),
    [capitalPlan, t.account, t.entryDate, resources.accounts, t.symbol, t.assetGroup]
  );
  // Sụt vốn không tính lệnh đang sửa: sửa lại một lệnh thua cũ thì con số không nên tự đổi
  // theo từng phím gõ ở ô lãi/lỗ.
  const tierDrawdown = useMemo(
    () => (tierOptions ? marketDrawdown(capitalPlan, tierOptions.market, (trades || []).filter((x) => x.id !== t.id), resources) : null),
    [tierOptions, capitalPlan, trades, t.id, resources]
  );
  const existingOpenRisk = selectedAccount
    ? accountOpenRisk(selectedAccount, ledger || [], (trades || []).filter((x) => x.id !== t.id))
    : { pct: 0, count: 0 };
  const riskAlerts = computeRiskAlerts(resources, (trades || []).filter((x) => x.id !== t.id), ledger || []);

  const submit = () => {
    if (!t.symbol.trim()) {
      setFormError("Vui lòng nhập Symbol trước khi lưu (đây là trường bắt buộc duy nhất, các mục khác điền được bao nhiêu tùy bạn).");
      // Lưu bằng phím tắt thì có thể đang ở cuối form — đưa thẳng về ô Symbol.
      const input = document.querySelector('#sec-1 input[list="symbol-suggestions"]');
      if (input) { input.scrollIntoView({ block: "center" }); input.focus(); }
      return;
    }
    setFormError("");
    draftRef.current.done = true;
    clearDraft(draftRef.current.key);
    // Lưu một lần là coi như đã tự soát: gỡ dấu "kết quả lấy từ file sàn". Symbol dịch ngược
    // Chuẩn hoá thêm một lần ở đây, phòng khi lưu bằng phím tắt mà ô symbol chưa kịp rời focus.
    onSave(clearBrokerFilled({ ...t, symbol: canonicalSymbol(t.symbol, knownSymbols) }));
  };

  // ⌘S / Ctrl+S (hoặc ⌘Enter) lưu lệnh. Rời ô đang gõ trước để các ô chỉ chốt giá trị lúc rời
  // ô (Symbol chuẩn hoá, ô số) kịp cập nhật, rồi mới lưu ở nhịp sau.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.isComposing || e.altKey || e.shiftKey || !(e.metaKey || e.ctrlKey)) return;
      const k = String(e.key || "").toLowerCase();
      if (!(k === "s" || e.code === "KeyS" || k === "enter")) return;
      e.preventDefault();
      if (e.repeat) return;
      const el = document.activeElement;
      if (el && typeof el.blur === "function" && el !== document.body) el.blur();
      setTimeout(() => submitRef.current(), 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="trade-form-layout">
      {/* Ô dán link báo khi link đã nằm ở lệnh / setup khác, hoặc hai ô trong lệnh này dán cùng một link. */}
      <LinkScope owner={`trade:${t.id}`}>
      <div className="trade-form">
      {pendingDraft ? (
        <div className="draft-banner">
          <History size={16} />
          <span>
            Có <b>bản nháp chưa lưu</b> của {pendingDraft.trade.symbol ? <b>{pendingDraft.trade.symbol}</b> : "lệnh này"} lúc {ddmmhh(pendingDraft.savedAt)} — lần trước thoát ra khi đang ghi dở.
          </span>
          <button type="button" className="btn btn-primary" onClick={restoreDraft}>Khôi phục nháp</button>
          <button type="button" className="btn btn-ghost" onClick={discardDraft}>Bỏ nháp</button>
        </div>
      ) : null}
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
              onChange={(e) => applySymbol(e.target.value.toUpperCase())}
              // Chuẩn hoá lúc rời ô chứ không phải lúc đang gõ: dịch ngược Telex, "cadchf" → "CAD/CHF".
              onBlur={() => { const c = canonicalSymbol(t.symbol, knownSymbols); if (c !== t.symbol) applySymbol(c); }}
              placeholder="VD: XAUUSD, HPG..."
            />
            {looksTelexed(t.symbol) ? (
              <span className="field-hint telex-note">
                Bộ gõ tiếng Việt đang bật — rời ô này sẽ tự sửa thành <b className="mono">{canonicalSymbol(t.symbol, knownSymbols)}</b>.
              </span>
            ) : null}
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
            <ResourceSelect value={t.account} onChange={pickAccount} options={accountNames} placeholder="Chọn tài khoản" />
          </Field>
          <Field label="Khung thời gian" incomplete={missing("timeframe")} hint={tfHint}>
            <ResourceSelect value={t.timeframe} onChange={pickTimeframe} options={resources.timeframes} placeholder="Chọn timeframe" />
          </Field>
          <Field
            label="Phiên giao dịch"
            hint={isForexSymbol(t.symbol) && t.entryTime ? `Đã tự điền từ giờ entry: ${sessionFromTime(t.entryTime)} — chọn lại nếu cần` : undefined}
          >
            <ResourceSelect value={t.session} onChange={set("session")} options={resources.sessions} placeholder="Chọn phiên" />
          </Field>
          <Field label="Loại tài sản"
            hint={t.assetGroup ? "Đang chọn tay — chọn dòng \"Tự nhận\" để app tự nhận lại theo mã" : t.symbol ? "Tự nhận theo symbol và tài khoản — chọn lại nếu app nhận sai" : "Gõ symbol là tự nhận (VD: XAU → Hàng hóa, EUR/USD → Forex)"}>
            <select className="input" value={t.assetGroup || ""} onChange={(e) => set("assetGroup")(e.target.value)}>
              <option value="">{t.symbol ? `Tự nhận: ${autoAsset.label}` : "Tự nhận theo symbol"}</option>
              {ASSET_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
          </Field>
        </div>
        <MarketCondPicker t={t} setT={setT} resources={resources} trades={trades} />
        <FxCondPicker t={t} setT={setT} trades={trades} />
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
        <RiskTierChips options={tierOptions} dd={tierDrawdown} plan={capitalPlan} riskAmount={t.riskAmount}
          onPick={(x) => setT((prev) => ({ ...prev, riskPercent: String(x.pct), riskAmount: String(x.money) }))} />
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
        <RegimeRiskNote t={t} resources={resources} />
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
          <Field label="Điểm cấu trúc (ĐCT)" hint={`Cho cặp forex — thang ${structureScale.label}. Thêm/bớt mức ở Tài nguyên → Kiến thức → Điểm cấu trúc.`}>
            <ResourceSelect value={t.structureScore} onChange={set("structureScore")} options={structureScale.options} placeholder={`Chọn điểm (${structureScale.label.replace(" đến ", "-")})`} />
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

      <Section id="sec-8" num="8" title="Nhìn lại / Lỗi" subtitle="Đánh dấu lệnh đáng mở ra xem lại, và ghi lại lỗi đã mắc trong lệnh này">
        <button
          type="button"
          className={`lesson-toggle-btn ${t.needsReview ? "lesson-toggle-active lesson-toggle-glow" : ""}`}
          onClick={() => setNeedsReview(!t.needsReview)}
        >
          <History size={15} /> {t.needsReview ? "📌 Lệnh cần nhìn lại" : "Đánh dấu là cần nhìn lại"}
        </button>
        <span className="field-hint" style={{ display: "block", marginTop: 7 }}>
          {t.needsReview
            ? "Lọc \"Nhìn lại\" ở Nhật ký để mở lại cả nhóm lệnh này. Mỗi lần xem lại thì thêm một lần nhìn lại bên dưới."
            : "Tùy chọn — chỉ dành cho những lệnh đặc biệt, không phải bài học cũng không phải lỗi, chỉ là đáng mở ra xem lại về sau."}
          {" "}Đang đánh dấu <b>{share.marked}/{share.total}</b> lệnh ({Math.round(share.pct)}%) — thường khoảng {REVIEW_TARGET_SHARE}%.
        </span>
        {t.needsReview || reviewLog.length || String(t.reviewReason || "").trim() ? (
          <div className={`late-review ${t.needsReview ? "late-review-due" : "late-review-wait"}`}>
            <div className="late-review-head">
              <History size={14} />
              <strong>Nhìn lại</strong>
              <span className="late-review-when">
                {reviewLog.length ? `${reviewLog.length} lần · gần nhất ${[...reviewLog].map((e) => e.date).filter(Boolean).sort().pop() || "—"}` : "chưa nhìn lại lần nào"}
                {!t.needsReview ? " · đã gỡ dấu" : ""}
              </span>
            </div>
            <Field label="Ghi chú — vì sao lệnh này cần nhìn lại">
              <textarea className="input textarea review-reason" value={t.reviewReason || ""} onChange={(e) => set("reviewReason")(e.target.value)}
                placeholder="VD: thắng nhưng không chắc vì đúng hay vì may; setup lạ, muốn xem về sau giá đi thế nào..." />
            </Field>
            <ReviewLog entries={reviewLog} onChange={setReviewEntry} onRemove={removeReviewEntry}
              onAdd={() => setT((prev) => ({ ...prev, reviewLog: [...(prev.reviewLog || []), emptyReviewEntry()] }))} />
          </div>
        ) : null}

        <div className="section-divider" />
        {/* Tách hẳn khỏi "Lỗi của setup" ở mục 3: mục đó tick theo bộ lỗi khai sẵn cho từng
            setup, còn đây là chỗ ghi tay mọi thứ đã sai trong chính lệnh này — vào sớm, dời
            dừng lỗ, phá kế hoạch — kể cả khi bản thân setup không lỗi gì. */}
        <button
          type="button"
          className={`lesson-toggle-btn ${t.hasMistake ? "mistake-toggle-active" : ""}`}
          onClick={() => setHasMistake(!t.hasMistake)}
        >
          <AlertTriangle size={15} /> {t.hasMistake ? "Lệnh này có lỗi" : "Đánh dấu là lệnh có lỗi"}
        </button>
        <span className="field-hint" style={{ display: "block", marginTop: 7 }}>
          {t.hasMistake
            ? "Lọc được ở Nhật ký bằng ô \"Lỗi\" để xem lại cả cụm lệnh đã mắc lỗi."
            : "Khác \"Lỗi của setup\" ở mục 3 — chỗ đó chấm setup, chỗ này ghi cái bạn đã làm sai trong lệnh này, kể cả khi setup không lỗi gì."}
        </span>
        {t.hasMistake || mistakeText || mistakeShots ? (
          <div className="mistake-box">
            <div className="late-review-head">
              <AlertTriangle size={14} />
              <strong>Lỗi trong lệnh này</strong>
              {!t.hasMistake && (mistakeText || mistakeShots) ? (
                <span className="late-review-when">đã ghi nhưng chưa đánh dấu</span>
              ) : null}
            </div>
            <textarea
              className="input textarea"
              value={t.mistakeNote || ""}
              onChange={(e) => set("mistakeNote")(e.target.value)}
              placeholder="Sai ở đâu, và đúng ra phải làm gì? VD: vào sớm một nhịp vì sợ lỡ, đúng ra phải đợi đóng nến..."
            />
            <Field label="Ảnh minh họa lỗi" hint={`Khoanh đúng chỗ đã sai trên chart — tối đa ${MISTAKE_MAX_IMAGES} ảnh/link`}>
              <MultiImageOrLink items={t.mistakeImages} onChange={set("mistakeImages")} label="mistake" max={MISTAKE_MAX_IMAGES} />
            </Field>
            <span className="field-hint">
              {t.hasMistake && !mistakeText && !mistakeShots
                ? "Đã đánh dấu có lỗi nhưng chưa ghi gì — vài tuần nữa mở ra sẽ không còn nhớ lỗi gì. Lọc \"Có lỗi nhưng chưa ghi gì\" ở Nhật ký để viết nốt."
                : "Ghi cả cách xử lý cho lần sau, chứ chỉ gọi tên lỗi thì lần sau vẫn mắc lại."}
            </span>
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
        {draftInfo ? (
          <span className={`draft-status ${draftInfo.ok ? "" : "draft-status-bad"}`}>
            {draftInfo.ok ? `Nháp tự lưu lúc ${hhmm(draftInfo.at)}` : "Không lưu được nháp trên trình duyệt này"}
          </span>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={cancel}>Hủy</button>
        <button type="button" className="btn btn-primary" onClick={submit} title={`Lưu giao dịch (${SAVE_KEY})`}>
          <Save size={15} /> Lưu giao dịch <kbd className="kbd-hint">{SAVE_KEY}</kbd>
        </button>
      </div>
      <FormBottomBar trade={t} sections={sections} onSave={submit} />
      </div>
      </LinkScope>
      <FormToc trade={t} sections={sections} />
    </div>
  );
}
