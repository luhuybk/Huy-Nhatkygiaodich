import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient.js";
import {
  BookOpen, PlusCircle, Database, LayoutDashboard, Star, X, Trash2, Pencil,
  ImagePlus, Link2, ChevronDown, ChevronRight, ChevronLeft, Check, ArrowUpRight,
  ArrowDownRight, Search, Save, CornerDownRight, CalendarDays, LineChart as LineChartIcon,
  StickyNote, Settings, Download, Upload, Layers, Filter, X as XIcon, Wallet, Hash, Grid3x3, Target, Image as ImageIcon, TrendingUp, EyeOff, AlertTriangle, Ruler, PiggyBank
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell
} from "recharts";

const FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');";

const WIN = "var(--win)";
const LOSS = "var(--loss)";
const ACCENT = "var(--accent)";
const MUTED = "var(--text-dim)";
const GRID = "var(--border)";
const SURF2 = "var(--surface-2)";
const TEXT = "var(--text)";

const RESOURCE_GROUPS = [
  {
    key: "symbols", label: "Symbol", children: [
      { key: "symbols", label: "Symbol", hint: "Danh sách symbol gợi ý khi nhập lệnh — vẫn có thể gõ tự do symbol khác (cổ phiếu VN/US...)" },
    ]
  },
  {
    key: "knowledge", label: "Kiến thức", children: [
      { key: "setups", label: "Setup", hint: "Các mẫu hình vào lệnh (RB, IRB, ARB...)" },
      { key: "setupBonus", label: "Bonus", hint: "Điểm cộng thêm cho setup (hợp lưu, volume, tin tức...)" },
      { key: "setupNotes", label: "Nhận xét setup", hint: "Đánh giá việc áp dụng setup (Tốt, Tệ, Sai setup...)" },
    ]
  },
  {
    key: "skills", label: "Kỹ năng", children: [
      { key: "entrySkills", label: "Vào lệnh", hint: "Chất lượng thao tác lúc vào lệnh" },
      { key: "inTradeSkills", label: "Trong lệnh", hint: "Chất lượng quản lý khi đang giữ lệnh" },
      { key: "exitSkills", label: "Thoát lệnh", hint: "Cách lệnh được đóng lại" },
    ]
  },
  {
    key: "psychology", label: "Tâm lý", children: [
      { key: "psychologies", label: "Tâm lý", hint: "Trạng thái tâm lý chi phối lệnh" },
    ]
  },
  {
    key: "riskManagement", label: "Quản trị vốn", children: [
      { key: "riskActions", label: "Quản trị vốn", hint: "Hành động quản trị vốn cho lệnh này (Nâng vốn, Giữ vốn, Giảm risk...)" },
    ]
  },
  {
    key: "timeframes", label: "Khung thời gian", children: [
      { key: "timeframes", label: "Khung thời gian", hint: "Timeframe phân tích / vào lệnh" },
    ]
  },
  {
    key: "sessions", label: "Phiên giao dịch", children: [
      { key: "sessions", label: "Phiên giao dịch", hint: "Phiên thị trường lúc vào lệnh" },
    ]
  },
  {
    key: "checklist", label: "Checklist", children: [
      { key: "checklistItems", label: "Checklist", hint: "Các mục cần kiểm tra trước khi chốt đánh giá 1 lệnh — thêm/bớt tự do" },
    ]
  },
  {
    key: "missReasons", label: "Lý do miss lệnh", children: [
      { key: "missReasons", label: "Lý do miss lệnh", hint: "Vì sao bỏ lỡ một setup — dùng khi ghi Setup bị miss" },
    ]
  },
];

const DEFAULT_RESOURCES = {
  accounts: [],
  symbols: [
    "AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD", "AUDUSD", "CADCHF", "CADJPY", "CHFJPY",
    "EURAUD", "EURCAD", "EURCHF", "EURGBP", "EURJPY", "EURNZD", "EURUSD",
    "GBPAUD", "GBPCAD", "GBPCHF", "GBPJPY", "GBPNZD", "GBPUSD",
    "NZDCAD", "NZDCHF", "NZDJPY", "NZDUSD", "USDCAD", "USDCHF", "USDJPY",
    "XAUUSD", "XAGUSD", "GC", "CL", "ES", "NQ",
  ],
  setups: ["KHÔNG CÓ SETUP", "RB", "IRB", "ARB", "FB", "DD", "SB", "BB"],
  setupBonus: [],
  setupNotes: ["Tốt", "Tệ", "Đúng setup", "Sai setup"],
  entrySkills: ["Đúng kế hoạch", "Quá sớm", "Quá muộn", "Bốc đồng"],
  inTradeSkills: ["Tuân thủ kế hoạch", "Dời Chốt lời", "Dời dừng lỗ ra xa", "Muốn thoát lệnh"],
  exitSkills: ["Chạm Chốt lời", "Chạm Dừng lỗ", "Thoát chủ động (lý do kỹ thuật)", "Thoát lệnh cảm tính, sợ hãi"],
  psychologies: ["Không lỗi", "SỢ BỎ LỠ (FOMO)", "SỢ HÃI", "HI VỌNG", "THAM LAM", "GIAO DỊCH TRẢ THÙ", "LUÔN MUỐN MÌNH ĐÚNG"],
  riskActions: ["Nâng vốn", "Giữ vốn", "Giảm risk"],
  timeframes: ["M15", "H1", "H3", "H4", "H8", "D", "W"],
  sessions: ["Á (Tokyo)", "Âu (London)", "Mỹ (New York)", "Âu-Mỹ chồng lấn"],
  checklistItems: ["Có Screenshot", "Có Ghi lại nhật ký", "Có Review"],
  missReasons: ["Bất khả kháng", "Lỗi cá nhân", "Không nhận ra setup"],
  fxRates: { USD: 1, VND: 26000, EUR: 0.92, GBP: 0.79, JPY: 150 },
};

const STRUCTURE_SCORES = Array.from({ length: 15 }, (_, i) => (i * 0.5).toString());
const GRADE_OPTIONS = [
  { id: "tot-thang", label: "Giao dịch Tốt - Thắng", matches: "win", tone: "win" },
  { id: "toi-thang", label: "Giao dịch Tồi - Thắng", matches: "win", tone: "loss" },
  { id: "tot-thua", label: "Giao dịch Tốt - Thua", matches: "loss", tone: "win" },
  { id: "toi-thua", label: "Giao dịch Tồi - Thua", matches: "loss", tone: "loss" },
];

const CURRENCIES = ["USD", "VND", "EUR", "GBP", "JPY"];
const THEME_PRESETS = {
  dark: { bg: "#0a0b0d", surface: "#131519", surface2: "#191c21", border: "#252930", text: "#eae7e0", textDim: "#8d9198", win: "#4caf7d", loss: "#e0615a" },
  light: { bg: "#f6f4f0", surface: "#ffffff", surface2: "#f1efe8", border: "#e2ddd0", text: "#211d17", textDim: "#726a5c", win: "#22935c", loss: "#c9403a" },
};
const ACCENT_PRESETS = { gold: "#d4a24e", green: "#2fae66", blue: "#4a90e2", purple: "#9b7fe0", red: "#e0615a" };
const DEFAULT_UI_SETTINGS = { mode: "dark", accent: "gold" };
const FLOW_TYPES = [
  { id: "deposit", label: "Nạp tiền" },
  { id: "withdraw", label: "Rút tiền" },
  { id: "transfer", label: "Chuyển vốn nội bộ" },
];
const NOTE_TYPES = ["Kế hoạch", "Đánh giá tuần", "Đánh giá tháng", "Bài học", "Sai lầm", "Mục tiêu"];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABEL = { 1: "Thứ 2", 2: "Thứ 3", 3: "Thứ 4", 4: "Thứ 5", 5: "Thứ 6", 6: "Thứ 7", 0: "Chủ nhật" };
const R_BUCKETS = [
  { label: "< -1R", min: -Infinity, max: -1 },
  { label: "-1R → -0.7R", min: -1, max: -0.7 },
  { label: "-0.7R → -0.5R", min: -0.7, max: -0.5 },
  { label: "-0.5R → 0R", min: -0.5, max: 0 },
  { label: "0R → 1R", min: 0, max: 1 },
  { label: "1R → 2R", min: 1, max: 2 },
  { label: "2R → 3R", min: 2, max: 3 },
  { label: "3R → 5R", min: 3, max: 5 },
  { label: "5R → 8R", min: 5, max: 8 },
  { label: "> 8R", min: 8, max: Infinity },
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function emptyTrade() {
  return {
    id: uid(),
    createdAt: Date.now(),
    symbol: "", entryDate: "", entryLink: "", entryImage: "",
    direction: "buy", account: "", timeframe: "", session: "",
    riskPercent: "", riskAmount: "", riskAction: "", riskActionReason: "", ratingRisk: 0,
    setup: "", setupBonus: "", setupNote: "", entryReason: "", ratingKnowledge: 0, structureScore: "",
    exitDate: "", exitLink: "", exitImage: "", profit: "",
    entrySkill: "", inTradeSkill: "", exitSkill: "", ratingSkill: 0,
    psychology: "", ratingPsychology: 0,
    tradeGrade: "", reviewNote: "", checklist: {},
  };
}
function emptyFlow(date) {
  return { id: uid(), type: "deposit", accountId: "", toAccountId: "", amount: "", date: date || "", note: "" };
}
function emptyNote(date) {
  return { id: uid(), date: date || "", type: NOTE_TYPES[0], content: "" };
}
function emptySetupDef() {
  return { id: null, name: "", note: "", image: "" };
}
function emptyMissed() {
  return { id: null, symbol: "", missDate: "", timeframe: "", link: "", image: "", reason: "", note: "" };
}
function emptyCapitalAccount() {
  return { id: null, name: "" };
}
function emptyCapitalEntry(date, reserveCapital) {
  return { id: null, accountId: "", date: date || "", reserveCapital: reserveCapital ?? "", tradeCapital: "", note: "" };
}

let currentUserId = null;
function setCurrentUserId(id) { currentUserId = id; }

async function safeGet(key, fallback) {
  if (!currentUserId) return fallback;
  try {
    const { data, error } = await supabase
      .from("app_data")
      .select("value")
      .eq("user_id", currentUserId)
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return fallback;
    return data.value;
  } catch (e) {
    return fallback;
  }
}
async function safeSet(key, value) {
  if (!currentUserId) return false;
  try {
    const { error } = await supabase
      .from("app_data")
      .upsert({ user_id: currentUserId, key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
    if (error) { console.error("storage set failed", key, error); return false; }
    return true;
  } catch (e) {
    console.error("storage set failed", key, e);
    return false;
  }
}

function normalizeResources(rs) {
  const merged = { ...DEFAULT_RESOURCES, ...(rs || {}) };
  merged.accounts = (merged.accounts || []).map((a) =>
    typeof a === "string"
      ? { id: uid(), name: a, broker: "", currency: "USD", initialBalance: 0, parentId: "" }
      : { initialBalance: 0, parentId: "", ...a }
  );
  if (!merged.sessions || !merged.sessions.length) merged.sessions = DEFAULT_RESOURCES.sessions;
  merged.fxRates = { ...DEFAULT_RESOURCES.fxRates, ...(merged.fxRates || {}), USD: 1 };
  return merged;
}
function toUSD(amount, currency, fxRates) {
  if (!currency || currency === "USD") return amount;
  const rate = (fxRates && fxRates[currency]) || 1;
  return amount / rate;
}

function computeResult(trade) {
  const profit = trade.profit === "" || trade.profit === null || trade.profit === undefined ? null : Number(trade.profit);
  const riskAmount = trade.riskAmount === "" || trade.riskAmount === null || trade.riskAmount === undefined ? null : Number(trade.riskAmount);
  let rr = null;
  if (profit !== null && riskAmount && riskAmount !== 0) rr = profit / riskAmount;
  let outcome = null;
  if (profit !== null) outcome = profit > 0 ? "win" : profit < 0 ? "loss" : "be";
  const status = profit !== null ? "closed" : "open";
  return { profit, riskAmount, rr, outcome, status };
}

function accountBalance(account, ledger, trades) {
  let bal = Number(account.initialBalance) || 0;
  ledger.forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (e.accountId === account.id) {
      if (e.type === "deposit") bal += amt;
      else if (e.type === "withdraw") bal -= amt;
      else if (e.type === "transfer") bal -= amt;
    }
    if (e.type === "transfer" && e.toAccountId === account.id) bal += amt;
  });
  trades.forEach((t) => {
    if (t.account === account.name) {
      const r = computeResult(t);
      if (r.profit) bal += r.profit;
    }
  });
  return bal;
}
function accountOpenRisk(account, ledger, trades) {
  const openTrades = trades.filter((t) => t.account === account.name && computeResult(t).status === "open");
  if (!openTrades.length) return { pct: 0, count: 0 };
  const balance = accountBalance(account, ledger, trades);
  let pct = 0;
  openTrades.forEach((t) => {
    if (t.riskPercent !== "" && t.riskPercent !== null && t.riskPercent !== undefined && !Number.isNaN(Number(t.riskPercent))) {
      pct += Number(t.riskPercent);
    } else if (t.riskAmount !== "" && t.riskAmount !== null && balance) {
      pct += (Number(t.riskAmount) / balance) * 100;
    }
  });
  return { pct, count: openTrades.length };
}

function avgPillarScore(t) {
  const vals = [t.ratingRisk, t.ratingKnowledge, t.ratingSkill, t.ratingPsychology].filter((v) => v > 0);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
function checklistProgress(t, resources) {
  const items = (resources && resources.checklistItems) || [];
  if (items.length === 0) return null;
  const checked = items.filter((item) => t.checklist && t.checklist[item]).length;
  return { checked, total: items.length };
}
function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function dateKey(t) { return t.exitDate || t.entryDate || ""; }
function monthKey(d) { return d ? d.slice(0, 7) : ""; }
function yearKey(d) { return d ? d.slice(0, 4) : ""; }
function weekdayIndex(d) {
  if (!d) return null;
  try { return new Date(d + "T00:00:00").getDay(); } catch (e) { return null; }
}
function closedOf(trades) {
  return trades
    .map((t) => ({ t, r: computeResult(t) }))
    .filter((x) => x.r.status === "closed" && x.r.profit !== null);
}
function closedOfUSD(trades, resources) {
  return closedOf(trades).map((x) => {
    const acc = resources.accounts.find((a) => a.name === x.t.account);
    const currency = acc ? acc.currency : "USD";
    return { t: x.t, r: { ...x.r, profit: toUSD(x.r.profit, currency, resources.fxRates) } };
  });
}
function groupStats(items, keyFn) {
  const out = {};
  items.forEach(({ t, r }) => {
    const key = keyFn(t) || "—";
    if (!out[key]) out[key] = { count: 0, wins: 0, losses: 0, totalR: 0, pnl: 0 };
    out[key].count += 1;
    if (r.outcome === "win") out[key].wins += 1;
    if (r.outcome === "loss") out[key].losses += 1;
    out[key].totalR += r.rr || 0;
    out[key].pnl += r.profit || 0;
  });
  return out;
}
function heatColor(value, max) {
  if (!value || !max) return "transparent";
  const alpha = Math.min(0.85, 0.18 + 0.67 * (Math.abs(value) / max));
  const base = value >= 0 ? "76,175,125" : "224,97,90";
  return `rgba(${base},${alpha.toFixed(2)})`;
}

function CellImagePreview({ image, link }) {
  const [hover, setHover] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [link]);
  if (!image && !link) return <span style={{ color: "var(--text-dim)" }}>—</span>;
  if (image) {
    return <img src={image} alt="" className="thumb-mini" onClick={(e) => { e.stopPropagation(); window.open(image, "_blank"); }} />;
  }
  return (
    <span className="link-preview-anchor" onClick={(e) => { e.stopPropagation(); window.open(link, "_blank"); }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <ImageIcon size={15} color="var(--accent)" />
      {hover ? (
        <div className="link-preview-popup">
          {failed ? <p className="link-preview-fallback">Không xem trước được — bấm để mở link.</p> : <img src={link} alt="" onError={() => setFailed(true)} />}
        </div>
      ) : null}
    </span>
  );
}
function ConfirmButton({ onConfirm, icon: Icon = Trash2, className = "row-btn", label }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 2500);
    return () => clearTimeout(t);
  }, [confirming]);
  if (confirming) {
    return (
      <button type="button" className={`${className} confirm-active`}
        onClick={(e) => { e.stopPropagation(); onConfirm(); setConfirming(false); }}
        aria-label="Xác nhận xóa" title="Bấm lần nữa để xác nhận xóa">
        <Check size={13} />
      </button>
    );
  }
  return (
    <button type="button" className={className}
      onClick={(e) => { e.stopPropagation(); setConfirming(true); }} aria-label={label || "Xóa"}>
      <Icon size={13} />
    </button>
  );
}

function DangerConfirmButton({ label, confirmLabel, onConfirm }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);
  return (
    <button type="button" className={`btn ${confirming ? "btn-danger" : "btn-ghost"}`}
      onClick={() => { if (confirming) { onConfirm(); setConfirming(false); } else setConfirming(true); }}>
      {confirming ? confirmLabel : label}
    </button>
  );
}

function StarRating({ value, onChange, size = 18 }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = (hover || value) >= n;
        return (
          <button key={n} type="button" onClick={() => onChange(value === n ? 0 : n)}
            onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, lineHeight: 0 }}
            aria-label={`${n} sao`}>
            <Star size={size} color={filled ? "var(--accent)" : "var(--border)"} fill={filled ? "var(--accent)" : "none"} strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children, hint, required }) {
  return (
    <label className="field">
      <span className="field-label">{label}{required ? <span className="req">*</span> : null}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
function ResourceSelect({ value, onChange, options, placeholder }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder || "— Chọn —"}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function IdSelect({ value, onChange, items, placeholder }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder || "— Chọn —"}</option>
      {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
    </select>
  );
}
function formatVN(n) {
  if (n === "" || n === null || n === undefined) return "";
  const num = Number(n);
  if (Number.isNaN(num)) return "";
  return num.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
}
function MoneyInput({ value, onChange, placeholder, className }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="text"
      inputMode="decimal"
      className={className || "input mono"}
      placeholder={placeholder}
      value={focused ? value : formatVN(value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9.,-]/g, "").replace(",", ".");
        onChange(raw);
      }}
    />
  );
}
function ImageOrLink({ link, image, onLinkChange, onImageChange, label }) {
  const [err, setErr] = useState("");
  const [linkPreviewFailed, setLinkPreviewFailed] = useState(false);
  const [hoverPreview, setHoverPreview] = useState(false);
  useEffect(() => setLinkPreviewFailed(false), [link]);
  const handleFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      setErr("Ảnh quá lớn (>1.5MB). Dùng link TradingView hoặc chọn ảnh nhỏ hơn.");
      e.target.value = ""; return;
    }
    setErr("");
    const reader = new FileReader();
    reader.onload = () => onImageChange(reader.result);
    reader.readAsDataURL(file);
  };
  const isUrl = link && /^https?:\/\//i.test(link.trim());
  return (
    <div className="imglink">
      <div className="imglink-row">
        <Link2 size={14} color="var(--text-dim)" />
        <input className="input input-inline" placeholder="Dán link TradingView / ảnh chụp màn hình"
          value={link} onChange={(e) => onLinkChange(e.target.value)} />
        {isUrl ? (
          <div className="link-preview-anchor" onMouseEnter={() => setHoverPreview(true)} onMouseLeave={() => setHoverPreview(false)}
            onClick={() => window.open(link, "_blank")}>
            <ImageIcon size={15} color="var(--accent)" />
            {hoverPreview ? (
              <div className="link-preview-popup">
                {linkPreviewFailed ? (
                  <p className="link-preview-fallback">Không xem trước được ảnh này (trang có thể chặn nhúng ảnh) — bấm để mở link gốc.</p>
                ) : (
                  <img src={link} alt={label} onError={() => setLinkPreviewFailed(true)} />
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="imglink-row">
        <label className="upload-btn">
          <ImagePlus size={14} /><span>{image ? "Đổi ảnh" : "Tải ảnh lên"}</span>
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
        </label>
        {image ? (
          <div className="thumb-wrap">
            <img src={image} alt={label} className="thumb" onClick={() => window.open(image, "_blank")} />
            <button type="button" className="thumb-x" onClick={() => onImageChange("")}><X size={12} /></button>
          </div>
        ) : null}
      </div>
      {err ? <span className="error-text">{err}</span> : null}
    </div>
  );
}
function Section({ num, title, subtitle, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <button type="button" className="section-head" onClick={() => setOpen((o) => !o)}>
        <span className="section-num">{num}</span>
        <span className="section-titles">
          <span className="section-title">{title}</span>
          {subtitle ? <span className="section-sub">{subtitle}</span> : null}
        </span>
        {open ? <ChevronDown size={16} color="var(--text-dim)" /> : <ChevronRight size={16} color="var(--text-dim)" />}
      </button>
      {open ? <div className="section-body">{children}</div> : null}
    </div>
  );
}
function StatCard({ label, value, tone }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone || ""}`}>{value}</span>
    </div>
  );
}
function ChartCard({ title, subtitle, children, height = 220 }) {
  return (
    <div className="chart-card">
      <div className="chart-head">
        <span className="chart-title">{title}</span>
        {subtitle ? <span className="chart-sub">{subtitle}</span> : null}
      </div>
      <div style={{ width: "100%", height }}>{children}</div>
    </div>
  );
}
const tooltipStyle = { background: SURF2, border: `1px solid ${GRID}`, borderRadius: 8, fontSize: 12, color: TEXT };
const tooltipItemStyle = { color: TEXT };
const tooltipLabelStyle = { color: MUTED, marginBottom: 4, fontWeight: 600 };

function TradeForm({ initial, resources, trades, ledger, onSave, onCancel }) {
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
          <div className={`open-risk-hint ${existingOpenRisk.pct >= 5 ? "open-risk-hint-high" : ""}`}>
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

function ResourceListEditor({ list, hint, onAdd, onRemove, placeholder }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || list.includes(v)) { setDraft(""); return; }
    onAdd(v); setDraft("");
  };
  return (
    <div>
      {hint ? <p className="field-hint" style={{ marginBottom: 12 }}>{hint}</p> : null}
      <div className="resource-add">
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()} placeholder={placeholder} />
        <button type="button" className="btn btn-primary" onClick={add}>Thêm</button>
      </div>
      <div className="resource-list">
        {list.length === 0 ? <p className="empty-note">Chưa có mục nào.</p> : null}
        {list.map((item) => (
          <div key={item} className="resource-item">
            <span>{item}</span>
            <ConfirmButton onConfirm={() => onRemove(item)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountsList({ accounts, ledger, trades, onChange, fxRates, onFxRatesChange, onView, editTarget, onEditConsumed }) {
  const blank = { id: null, name: "", broker: "", currency: "USD", initialBalance: "", parentId: "" };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (editTarget) { setForm({ ...blank, ...editTarget }); setError(""); onEditConsumed(); }
  }, [editTarget]);

  const submit = () => {
    if (!form.name.trim()) { setError("Vui lòng nhập tên tài khoản."); return; }
    setError("");
    const payload = { ...form, initialBalance: Number(form.initialBalance) || 0 };
    if (form.id) onChange(accounts.map((a) => (a.id === form.id ? payload : a)));
    else onChange([...accounts, { ...payload, id: uid() }]);
    setForm(blank);
  };
  const remove = (id) => {
    onChange(accounts.filter((a) => a.id !== id).map((a) => (a.parentId === id ? { ...a, parentId: "" } : a)));
    if (form.id === id) setForm(blank);
  };

  const roots = accounts.filter((a) => !a.parentId);
  const childrenOf = (id) => accounts.filter((a) => a.parentId === id);
  const leaves = accounts.filter((a) => !accounts.some((x) => x.parentId === a.id));
  const leafBalanceSumUSD = leaves.reduce((s, a) => s + toUSD(accountBalance(a, ledger, trades), a.currency, fxRates), 0);
  const leafInitialSumUSD = leaves.reduce((s, a) => s + toUSD(Number(a.initialBalance) || 0, a.currency, fxRates), 0);
  const usedCurrencies = Array.from(new Set(accounts.map((a) => a.currency).filter((c) => c && c !== "USD")));

  const renderCard = (a, parent) => {
    const bal = accountBalance(a, ledger, trades);
    const initial = Number(a.initialBalance) || 0;
    const accountTrades = trades.filter((t) => t.account === a.name);
    const pnl = closedOf(accountTrades).reduce((s, x) => s + x.r.profit, 0);
    const growth = initial ? ((bal - initial) / Math.abs(initial)) * 100 : null;
    const openRisk = accountOpenRisk(a, ledger, trades);
    return (
      <button type="button" key={a.id} className="account-card" onClick={() => onView(a.id)}>
        <div className="account-card-head">
          <strong>{a.name}</strong>
          <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 4 }}>
            <button type="button" className="row-btn" onClick={() => { setForm({ ...blank, ...a }); setError(""); }}><Pencil size={13} /></button>
            <ConfirmButton onConfirm={() => remove(a.id)} />
          </span>
        </div>
        {parent ? <span className="account-card-parent">thuộc nhóm {parent.name}</span> : null}
        <div className={`account-card-balance ${bal >= initial ? "text-win" : "text-loss"}`}>{fmt(bal)} <span className="mono" style={{ fontSize: 13 }}>{a.currency}</span></div>
        <div className="account-card-rows">
          <div><span>Số dư ban đầu</span><span className="mono">{fmt(initial)}</span></div>
          <div><span>Trading P&L</span><span className={`mono ${pnl >= 0 ? "text-win" : "text-loss"}`}>{pnl >= 0 ? "+" : ""}{fmt(pnl)}</span></div>
          <div><span>Tăng trưởng</span><span className="mono">{growth === null ? "—" : `${growth.toFixed(1)}%`}</span></div>
          <div><span>Số lệnh</span><span className="mono">{accountTrades.length}</span></div>
          <div><span>% Risk đang mở</span><span className={`mono ${openRisk.pct >= 5 ? "text-loss" : ""}`}>{openRisk.count === 0 ? "—" : `${openRisk.pct.toFixed(2)}% (${openRisk.count} lệnh)`}</span></div>
        </div>
      </button>
    );
  };
  const renderGroup = (a) => [renderCard(a, null), ...childrenOf(a.id).map((c) => renderCard(c, a))];

  return (
    <div>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)", marginBottom: 18 }}>
        <StatCard label="Tổng vốn ban đầu (quy đổi USD)" value={fmtMoney(leafInitialSumUSD, "USD")} />
        <StatCard label="Tổng vốn hiện tại (quy đổi USD)" value={fmtMoney(leafBalanceSumUSD, "USD")} tone={leafBalanceSumUSD >= leafInitialSumUSD ? "win" : "loss"} />
      </div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Gộp nhóm bằng cách chọn "Thuộc nhóm" (VD: Forex H3 / H8 / D thuộc nhóm Forex). Tổng vốn phía trên chỉ tính trên các tài khoản không có tài khoản con, quy đổi theo tỷ giá bên dưới. Bấm vào một thẻ để xem phân tích chi tiết.
      </p>
      {usedCurrencies.length > 0 ? (
        <div className="fx-panel">
          <span className="field-label">Tỷ giá quy đổi (1 USD = ?)</span>
          <div className="fx-rows">
            {usedCurrencies.map((c) => (
              <div key={c} className="fx-row">
                <span className="mono">{c}</span>
                <input type="number" step="0.0001" className="input mono" value={fxRates[c] ?? ""} onChange={(e) => onFxRatesChange({ ...fxRates, [c]: Number(e.target.value) || 0 })} />
              </div>
            ))}
          </div>
          <span className="field-hint">Tỷ giá không tự cập nhật — chỉnh tay theo tỷ giá hiện tại khi cần.</span>
        </div>
      ) : null}
      <div className="account-form">
        <div className="grid-3">
          <Field label="Tên tài khoản">
            <input className="input" value={form.name} onChange={(e) => setF("name")(e.target.value)} placeholder="VD: Forex H3, US Stock, VN Stock..." />
          </Field>
          <Field label="Broker">
            <input className="input" value={form.broker} onChange={(e) => setF("broker")(e.target.value)} placeholder="VD: IC Markets, SSI, VPS..." />
          </Field>
          <Field label="Đơn vị tiền tệ">
            <input className="input" list="currency-options" value={form.currency} onChange={(e) => setF("currency")(e.target.value)} placeholder="USD" />
            <datalist id="currency-options">{CURRENCIES.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Vốn ban đầu">
            <MoneyInput value={form.initialBalance} onChange={setF("initialBalance")} placeholder="0" />
          </Field>
          <Field label="Thuộc nhóm (tùy chọn)">
            <IdSelect value={form.parentId} onChange={setF("parentId")} items={accounts.filter((a) => a.id !== form.id)} placeholder="Không thuộc nhóm nào" />
          </Field>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="form-actions" style={{ marginTop: 4 }}>
          {form.id ? <button type="button" className="btn btn-ghost" onClick={() => setForm(blank)}>Hủy sửa</button> : null}
          <button type="button" className="btn btn-primary" onClick={submit}>{form.id ? "Cập nhật tài khoản" : "Thêm tài khoản"}</button>
        </div>
      </div>
      <div className="account-card-grid" style={{ marginTop: 16 }}>
        {accounts.length === 0 ? <p className="empty-note">Chưa có tài khoản nào.</p> : null}
        {roots.map((a) => renderGroup(a))}
      </div>
    </div>
  );
}

function CashFlowList({ accounts, ledger, onChange }) {
  const [form, setForm] = useState(emptyFlow());
  const [error, setError] = useState("");
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "—";

  const submit = () => {
    if (!form.accountId) { setError(form.type === "transfer" ? "Chọn tài khoản nguồn." : "Chọn tài khoản."); return; }
    if (form.type === "transfer" && !form.toAccountId) { setError("Chọn tài khoản đích để chuyển vốn."); return; }
    if (form.type === "transfer" && form.toAccountId === form.accountId) { setError("Tài khoản nguồn và đích phải khác nhau."); return; }
    if (!form.amount || Number(form.amount) <= 0) { setError("Nhập số tiền hợp lệ."); return; }
    setError("");
    onChange([...ledger, { ...form, id: uid(), amount: Number(form.amount) }]);
    setForm(emptyFlow(form.date));
  };
  const remove = (id) => onChange(ledger.filter((e) => e.id !== id));
  const sorted = [...ledger].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (accounts.length === 0) {
    return <p className="empty-note">Thêm tài khoản ở tab "Tài khoản" trước, rồi quay lại đây để ghi nạp/rút/chuyển vốn.</p>;
  }
  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>Ghi lại mỗi lần nạp / rút hoặc luân chuyển vốn giữa các tài khoản.</p>
      <div className="account-form">
        <Field label="Loại giao dịch">
          <div className="seg">
            {FLOW_TYPES.map((f) => (
              <button key={f.id} type="button" className={`seg-btn ${form.type === f.id ? "seg-active" : ""}`} onClick={() => setF("type")(f.id)}>{f.label}</button>
            ))}
          </div>
        </Field>
        <div className="grid-3">
          <Field label={form.type === "transfer" ? "Từ tài khoản" : "Tài khoản"}>
            <IdSelect value={form.accountId} onChange={setF("accountId")} items={accounts} placeholder="Chọn tài khoản" />
          </Field>
          {form.type === "transfer" ? (
            <Field label="Đến tài khoản">
              <IdSelect value={form.toAccountId} onChange={setF("toAccountId")} items={accounts.filter((a) => a.id !== form.accountId)} placeholder="Chọn tài khoản đích" />
            </Field>
          ) : null}
          <Field label="Số tiền">
            <MoneyInput value={form.amount} onChange={setF("amount")} placeholder="0" />
          </Field>
          <Field label="Ngày">
            <input type="date" className="input" value={form.date} onChange={(e) => setF("date")(e.target.value)} />
          </Field>
        </div>
        <Field label="Ghi chú"><input className="input" value={form.note} onChange={(e) => setF("note")(e.target.value)} placeholder="Tùy chọn..." /></Field>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="form-actions" style={{ marginTop: 4 }}>
          <button type="button" className="btn btn-primary" onClick={submit}>Thêm dòng vốn</button>
        </div>
      </div>
      <div className="resource-list" style={{ marginTop: 16 }}>
        {sorted.length === 0 ? <p className="empty-note">Chưa có dòng nạp/rút/chuyển nào.</p> : null}
        {sorted.map((e) => (
          <div key={e.id} className="resource-item">
            <span>
              <span className="mono" style={{ color: "var(--text-dim)", marginRight: 8 }}>{e.date || "—"}</span>
              {e.type === "deposit" && <>Nạp <strong className="text-win">{fmt(e.amount)}</strong> vào {accountName(e.accountId)}</>}
              {e.type === "withdraw" && <>Rút <strong className="text-loss">{fmt(e.amount)}</strong> từ {accountName(e.accountId)}</>}
              {e.type === "transfer" && <>Chuyển <strong>{fmt(e.amount)}</strong> từ {accountName(e.accountId)} → {accountName(e.toAccountId)}</>}
              {e.note ? <span style={{ color: "var(--text-dim)" }}> · {e.note}</span> : null}
            </span>
            <ConfirmButton onConfirm={() => remove(e.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function buildBalanceCurve(account, ledger, trades) {
  const events = [];
  ledger.forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (e.accountId === account.id) {
      if (e.type === "deposit") events.push({ date: e.date, delta: amt });
      else if (e.type === "withdraw") events.push({ date: e.date, delta: -amt });
      else if (e.type === "transfer") events.push({ date: e.date, delta: -amt });
    }
    if (e.type === "transfer" && e.toAccountId === account.id) events.push({ date: e.date, delta: amt });
  });
  trades.forEach((t) => {
    if (t.account === account.name) {
      const r = computeResult(t);
      if (r.profit) events.push({ date: dateKey(t), delta: r.profit });
    }
  });
  events.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let bal = Number(account.initialBalance) || 0;
  const points = [{ date: "Bắt đầu", balance: Number(bal.toFixed(2)) }];
  events.forEach((e) => { bal += e.delta; points.push({ date: e.date || "—", balance: Number(bal.toFixed(2)) }); });
  return points;
}
function buildTWRCurve(account, ledger, trades) {
  const events = [];
  ledger.forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (e.accountId === account.id) {
      if (e.type === "deposit") events.push({ date: e.date, cashflow: amt });
      else if (e.type === "withdraw") events.push({ date: e.date, cashflow: -amt });
      else if (e.type === "transfer") events.push({ date: e.date, cashflow: -amt });
    }
    if (e.type === "transfer" && e.toAccountId === account.id) events.push({ date: e.date, cashflow: amt });
  });
  trades.forEach((t) => {
    if (t.account === account.name) {
      const r = computeResult(t);
      if (r.profit) events.push({ date: dateKey(t), pnl: r.profit });
    }
  });
  events.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  let periodStartBalance = Number(account.initialBalance) || 0;
  let periodStartIndex = 100;
  let runningBalance = periodStartBalance;
  const points = [{ date: "Bắt đầu", index: 100, balance: Number(runningBalance.toFixed(2)) }];

  events.forEach((e) => {
    if (e.pnl !== undefined) {
      runningBalance += e.pnl;
      const idx = periodStartBalance ? periodStartIndex * (runningBalance / periodStartBalance) : periodStartIndex;
      points.push({ date: e.date || "—", index: Number(idx.toFixed(2)), balance: Number(runningBalance.toFixed(2)) });
    } else {
      const idxBeforeFlow = periodStartBalance ? periodStartIndex * (runningBalance / periodStartBalance) : periodStartIndex;
      runningBalance += e.cashflow;
      periodStartBalance = runningBalance;
      periodStartIndex = idxBeforeFlow;
      points.push({ date: e.date || "—", index: Number(idxBeforeFlow.toFixed(2)), balance: Number(runningBalance.toFixed(2)) });
    }
  });
  return points;
}
function buildGrowthSeries(curve, initialBalance, granularity) {
  const dated = curve.slice(1).filter((p) => p.date && p.date !== "—");
  if (!dated.length) return [];
  const byPeriod = {};
  dated.forEach((p) => {
    let key;
    if (granularity === "month") key = p.date.slice(0, 7);
    else if (granularity === "week") {
      const d = new Date(p.date + "T00:00:00");
      const dow = (d.getDay() + 6) % 7;
      const monday = new Date(d); monday.setDate(d.getDate() - dow);
      key = monday.toISOString().slice(0, 10);
    } else key = p.date;
    byPeriod[key] = p.balance;
  });
  const keys = Object.keys(byPeriod).sort();
  return keys.map((k) => ({ period: k, growth: initialBalance ? Number((((byPeriod[k] - initialBalance) / Math.abs(initialBalance)) * 100).toFixed(2)) : 0 }));
}

function AccountDetail({ account, ledger, trades, onBack, onEdit, onDelete }) {
  const [granularity, setGranularity] = useState("month");
  const accountTrades = trades.filter((t) => t.account === account.name);
  const closedAccountTrades = closedOf(accountTrades);
  const m = computeAdvancedMetrics(closedAccountTrades);
  const deposits = ledger.filter((e) => e.accountId === account.id && e.type === "deposit").reduce((s, e) => s + (Number(e.amount) || 0), 0)
    + ledger.filter((e) => e.type === "transfer" && e.toAccountId === account.id).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const withdrawals = ledger.filter((e) => e.accountId === account.id && e.type === "withdraw").reduce((s, e) => s + (Number(e.amount) || 0), 0)
    + ledger.filter((e) => e.type === "transfer" && e.accountId === account.id).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const tradingPnl = closedAccountTrades.reduce((s, x) => s + x.r.profit, 0);
  const currentBalance = accountBalance(account, ledger, trades);
  const initial = Number(account.initialBalance) || 0;
  const growthPct = initial !== 0 ? ((currentBalance - initial) / Math.abs(initial)) * 100 : null;
  const winrate = closedAccountTrades.length ? (closedAccountTrades.filter((x) => x.r.outcome === "win").length / closedAccountTrades.length) * 100 : 0;
  const openRisk = accountOpenRisk(account, ledger, trades);

  const curve = buildBalanceCurve(account, ledger, trades);
  const growthSeries = buildGrowthSeries(curve, initial, granularity);
  const accountLedger = ledger.filter((e) => e.accountId === account.id || e.toAccountId === account.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div>
      <div className="detail-header">
        <button type="button" className="btn btn-ghost" onClick={onBack}><ChevronLeft size={14} /> Tất cả tài khoản</button>
        <h3 style={{ margin: "0 0 0 6px" }}>{account.name}</h3>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => onEdit(account)}>Sửa tài khoản</button>
          <DangerConfirmButton label="Xóa tài khoản" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => onDelete(account.id)} />
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <StatCard label="Số dư ban đầu" value={fmtMoney(initial, account.currency)} />
        <StatCard label="Tổng nạp" value={fmtMoney(deposits, account.currency)} tone="win" />
        <StatCard label="Tổng rút" value={fmtMoney(withdrawals, account.currency)} tone="loss" />
        <StatCard label="Trading P&L" value={fmtMoney(tradingPnl, account.currency)} tone={tradingPnl >= 0 ? "win" : "loss"} />
        <StatCard label="Số dư hiện tại" value={fmtMoney(currentBalance, account.currency)} tone={currentBalance >= initial ? "win" : "loss"} />
        <StatCard label="Tăng trưởng" value={growthPct === null ? "—" : `${growthPct.toFixed(1)}%`} tone={growthPct === null ? "" : growthPct >= 0 ? "win" : "loss"} />
      </div>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <StatCard label="Tổng số lệnh" value={accountTrades.length} />
        <StatCard label="Winrate" value={`${winrate.toFixed(1)}%`} tone={winrate >= 50 ? "win" : "loss"} />
        <StatCard label="Hệ số lợi nhuận" value={Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "∞"} tone={m.profitFactor >= 1 ? "win" : "loss"} />
        <StatCard label="Max Drawdown (giao dịch)" value={fmtMoney(m.maxDD, account.currency)} tone="loss" />
        <StatCard label="% Risk đang mở" value={openRisk.count === 0 ? "—" : `${openRisk.pct.toFixed(2)}%`} tone={openRisk.pct >= 5 ? "loss" : ""} />
      </div>
      {openRisk.count > 0 ? <p className="field-hint" style={{ marginTop: -12, marginBottom: 16 }}>{openRisk.count} lệnh đang mở đang giữ tổng cộng {openRisk.pct.toFixed(2)}% tài khoản này.</p> : null}

      <ChartCard title="Equity Curve theo Số dư thực" height={240}>
        <ResponsiveContainer>
          <LineChart data={curve}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} minTickGap={40} />
            <YAxis tick={{ fontSize: 10, fill: MUTED }} width={54} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
            <Line type="monotone" dataKey="balance" stroke={ACCENT} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Tăng trưởng (%)" height={240}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <div className="seg" style={{ width: "auto" }}>
            {[["day", "Ngày"], ["week", "Tuần"], ["month", "Tháng"]].map(([id, label]) => (
              <button key={id} type="button" className={`seg-btn ${granularity === id ? "seg-active" : ""}`} onClick={() => setGranularity(id)}>{label}</button>
            ))}
          </div>
        </div>
        {growthSeries.length === 0 ? <p className="empty-note">Chưa có đủ dữ liệu để vẽ.</p> : (
          <ResponsiveContainer>
            <BarChart data={growthSeries}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: MUTED }} minTickGap={30} />
              <YAxis tick={{ fontSize: 10, fill: MUTED }} width={50} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Bar dataKey="growth">{growthSeries.map((d, i) => <Cell key={i} fill={d.growth >= 0 ? WIN : LOSS} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <h3 className="block-title">Nạp / Rút tiền</h3>
      <div className="resource-list">
        {accountLedger.length === 0 ? <p className="empty-note">Chưa có giao dịch nạp/rút nào.</p> : null}
        {accountLedger.map((e) => (
          <div key={e.id} className="resource-item">
            <span>
              <span className="mono" style={{ color: "var(--text-dim)", marginRight: 8 }}>{e.date || "—"}</span>
              {e.type === "deposit" && <>Nạp <strong className="text-win">{fmt(e.amount)}</strong></>}
              {e.type === "withdraw" && <>Rút <strong className="text-loss">{fmt(e.amount)}</strong></>}
              {e.type === "transfer" && e.accountId === account.id && <>Chuyển ra <strong className="text-loss">{fmt(e.amount)}</strong></>}
              {e.type === "transfer" && e.toAccountId === account.id && <>Chuyển vào <strong className="text-win">{fmt(e.amount)}</strong></>}
              {e.note ? <span style={{ color: "var(--text-dim)" }}> · {e.note}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EquityIndexPage({ resources, ledger, trades }) {
  const [accountId, setAccountId] = useState(resources.accounts[0]?.id || "");
  useEffect(() => {
    if (!accountId && resources.accounts.length) setAccountId(resources.accounts[0].id);
  }, [resources.accounts]);

  if (resources.accounts.length === 0) {
    return (
      <div className="empty-state">
        <LineChartIcon size={28} color="var(--text-dim)" />
        <p>Chưa có tài khoản nào — thêm tài khoản ở tab Tài khoản trước.</p>
      </div>
    );
  }
  const account = resources.accounts.find((a) => a.id === accountId) || resources.accounts[0];
  const curve = buildTWRCurve(account, ledger, trades);
  const currentIndex = curve[curve.length - 1].index;
  const totalReturnPct = currentIndex - 100;
  let peak = 100, maxDD = 0;
  curve.forEach((p) => { if (p.index > peak) peak = p.index; const dd = peak - p.index; if (dd > maxDD) maxDD = dd; });
  const ath = Math.max(...curve.map((p) => p.index));

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Đường cong vốn quy về mốc 100 lúc bắt đầu — chỉ phản ánh hiệu suất giao dịch thực tế, nạp/rút/chuyển vốn không làm đường cong nhảy vọt hay sụt giảm đột ngột (dùng phương pháp Time-Weighted Return, chuẩn của ngành quản lý quỹ).
      </p>
      <div className="scope-bar">
        <span className="field-label" style={{ marginRight: 4 }}>Tài khoản:</span>
        <select className="input" style={{ maxWidth: 240 }} value={account.id} onChange={(e) => setAccountId(e.target.value)}>
          {resources.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div className="stat-grid">
        <StatCard label="Chỉ số hiện tại" value={currentIndex.toFixed(2)} tone={currentIndex >= 100 ? "win" : "loss"} />
        <StatCard label="Tổng lợi nhuận (chỉ số)" value={`${totalReturnPct > 0 ? "+" : ""}${totalReturnPct.toFixed(2)}%`} tone={totalReturnPct >= 0 ? "win" : "loss"} />
        <StatCard label="Đỉnh cao nhất" value={ath.toFixed(2)} />
        <StatCard label="Max Drawdown (chỉ số)" value={`${maxDD.toFixed(2)} điểm`} tone="loss" />
      </div>

      <ChartCard title={`Đường cong vốn — ${account.name}`} subtitle="Mốc 100 = lúc bắt đầu" height={320}>
        <ResponsiveContainer>
          <LineChart data={curve}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} minTickGap={40} />
            <YAxis tick={{ fontSize: 10, fill: MUTED }} width={50} domain={["auto", "auto"]} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
            <Line type="monotone" dataKey="index" stroke={ACCENT} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function CapitalTrackerPage({ accounts, entries, onAccountsChange, onEntriesChange }) {
  const [selectedId, setSelectedId] = useState(accounts[0]?.id || "");
  const [newAccountName, setNewAccountName] = useState("");
  const [accountError, setAccountError] = useState("");

  useEffect(() => {
    if (!selectedId && accounts.length) setSelectedId(accounts[0].id);
  }, [accounts]);

  const accountEntries = entries.filter((e) => e.accountId === selectedId).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const lastEntry = accountEntries[accountEntries.length - 1] || null;
  const [form, setForm] = useState(emptyCapitalEntry("", ""));
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const [entryError, setEntryError] = useState("");

  const startNewEntry = () => setForm(emptyCapitalEntry("", lastEntry ? lastEntry.reserveCapital : ""));

  const addAccount = () => {
    if (!newAccountName.trim()) { setAccountError("Nhập tên tài khoản."); return; }
    setAccountError("");
    const acc = { id: uid(), name: newAccountName.trim() };
    onAccountsChange([...accounts, acc]);
    setNewAccountName("");
    setSelectedId(acc.id);
  };
  const removeAccount = (id) => {
    onAccountsChange(accounts.filter((a) => a.id !== id));
    onEntriesChange(entries.filter((e) => e.accountId !== id));
    if (selectedId === id) setSelectedId("");
  };

  const saveEntry = () => {
    if (!form.date) { setEntryError("Chọn ngày ghi nhận."); return; }
    if (form.reserveCapital === "" || form.tradeCapital === "") { setEntryError("Nhập đủ Vốn dự phòng và Vốn trade."); return; }
    setEntryError("");
    const payload = { ...form, id: form.id || uid(), accountId: selectedId };
    const exists = entries.some((e) => e.id === payload.id);
    onEntriesChange(exists ? entries.map((e) => (e.id === payload.id ? payload : e)) : [...entries, payload]);
    startNewEntry();
  };
  const removeEntry = (id) => {
    onEntriesChange(entries.filter((e) => e.id !== id));
    if (form.id === id) startNewEntry();
  };

  const selectedAccount = accounts.find((a) => a.id === selectedId);
  const chartData = accountEntries.map((e) => ({
    date: e.date,
    reserve: Number(e.reserveCapital) || 0,
    trade: Number(e.tradeCapital) || 0,
    total: (Number(e.reserveCapital) || 0) + (Number(e.tradeCapital) || 0),
  }));
  const currentTotal = lastEntry ? (Number(lastEntry.reserveCapital) || 0) + (Number(lastEntry.tradeCapital) || 0) : null;
  const firstTotal = chartData.length ? chartData[0].total : null;
  const growthPct = firstTotal ? (((currentTotal - firstTotal) / Math.abs(firstTotal)) * 100) : null;

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Theo dõi tổng vốn thực (vốn dự phòng ngoài sàn + vốn đang để trade) — hoàn toàn thủ công, tách biệt khỏi tab Tài khoản (không ảnh hưởng số liệu P&L giao dịch). Bạn có thể đặt tên trùng với tài khoản trade để dễ đối chiếu.
      </p>

      <div className="account-form">
        <div className="grid-3" style={{ alignItems: "end" }}>
          <Field label="Tài khoản vốn thực">
            <IdSelect value={selectedId} onChange={setSelectedId} items={accounts} placeholder="Chọn tài khoản" />
          </Field>
          <Field label="Thêm tài khoản mới">
            <input className="input" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addAccount()} placeholder="VD: Forex H3 (giống tên TK trade)" />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={addAccount}>Thêm tài khoản</button>
            {selectedAccount ? <ConfirmButton onConfirm={() => removeAccount(selectedAccount.id)} className="btn btn-ghost" icon={Trash2} label="Xóa tài khoản này" /> : null}
          </div>
        </div>
        {accountError ? <p className="error-text">{accountError}</p> : null}
      </div>

      {!selectedAccount ? (
        <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có tài khoản vốn thực nào — thêm ở trên để bắt đầu.</p>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Vốn dự phòng (mới nhất)" value={lastEntry ? fmt(Number(lastEntry.reserveCapital)) : "—"} />
            <StatCard label="Vốn trade (mới nhất)" value={lastEntry ? fmt(Number(lastEntry.tradeCapital)) : "—"} />
            <StatCard label="Tổng vốn thực" value={currentTotal === null ? "—" : fmt(currentTotal)} tone={currentTotal !== null && firstTotal !== null ? (currentTotal >= firstTotal ? "win" : "loss") : ""} />
            <StatCard label="Tăng trưởng từ mốc đầu" value={growthPct === null ? "—" : `${growthPct > 0 ? "+" : ""}${growthPct.toFixed(2)}%`} tone={growthPct === null ? "" : growthPct >= 0 ? "win" : "loss"} />
          </div>

          <ChartCard title={`Đường cong vốn thực — ${selectedAccount.name}`} subtitle="Vốn dự phòng + Vốn trade, ghi nhận thủ công" height={300}>
            {chartData.length === 0 ? <p className="empty-note">Chưa có mốc ghi nhận nào.</p> : (
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} minTickGap={40} />
                  <YAxis tick={{ fontSize: 10, fill: MUTED }} width={54} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                  <Line type="monotone" dataKey="total" name="Tổng vốn thực" stroke={ACCENT} strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="reserve" name="Vốn dự phòng" stroke={MUTED} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                  <Line type="monotone" dataKey="trade" name="Vốn trade" stroke={WIN} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <h3 className="block-title">{form.id ? "Sửa mốc ghi nhận" : "Thêm mốc ghi nhận mới (VD: cuối tuần)"}</h3>
          <div className="account-form">
            <div className="grid-3">
              <Field label="Ngày ghi nhận">
                <input type="date" className="input" value={form.date} onChange={(e) => setF("date")(e.target.value)} />
              </Field>
              <Field label="Vốn dự phòng (ngoài sàn)">
                <MoneyInput value={form.reserveCapital} onChange={setF("reserveCapital")} placeholder="8000" />
              </Field>
              <Field label="Vốn trade (trên sàn)">
                <MoneyInput value={form.tradeCapital} onChange={setF("tradeCapital")} placeholder="2100" />
              </Field>
            </div>
            <Field label="Ghi chú"><input className="input" value={form.note} onChange={(e) => setF("note")(e.target.value)} placeholder="Tùy chọn..." /></Field>
            {entryError ? <p className="error-text">{entryError}</p> : null}
            <div className="form-actions" style={{ marginTop: 4 }}>
              {form.id ? <button type="button" className="btn btn-ghost" onClick={startNewEntry}>Hủy sửa</button> : null}
              <button type="button" className="btn btn-primary" onClick={saveEntry}>{form.id ? "Cập nhật mốc" : "Lưu mốc ghi nhận"}</button>
            </div>
          </div>

          <div className="table-wrap" style={{ marginTop: 16 }}>
            {accountEntries.length === 0 ? <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có mốc ghi nhận nào.</p> : (
              <table className="table">
                <thead><tr><th>Ngày</th><th>Vốn dự phòng</th><th>Vốn trade</th><th>Tổng</th><th>Ghi chú</th><th></th></tr></thead>
                <tbody>
                  {[...accountEntries].reverse().map((e) => (
                    <tr key={e.id} onClick={() => setForm(e)}>
                      <td className="mono">{e.date}</td>
                      <td className="mono">{fmt(Number(e.reserveCapital))}</td>
                      <td className="mono">{fmt(Number(e.tradeCapital))}</td>
                      <td className="mono" style={{ fontWeight: 700 }}>{fmt((Number(e.reserveCapital) || 0) + (Number(e.tradeCapital) || 0))}</td>
                      <td style={{ color: "var(--text-dim)", fontSize: 12.5 }}>{e.note || "—"}</td>
                      <td onClick={(ev) => ev.stopPropagation()}>
                        <div style={{ display: "flex", gap: 2 }}>
                          <button type="button" className="row-btn" onClick={() => setForm(e)}><Pencil size={13} /></button>
                          <ConfirmButton onConfirm={() => removeEntry(e.id)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AccountsSection({ accounts, ledger, trades, onAccountsChange, onLedgerChange, fxRates, onFxRatesChange }) {
  const [tab, setTab] = useState("list");
  const [viewingId, setViewingId] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const viewing = accounts.find((a) => a.id === viewingId);

  if (viewing) {
    return (
      <AccountDetail
        account={viewing}
        ledger={ledger}
        trades={trades}
        onBack={() => setViewingId("")}
        onEdit={(a) => { setEditTarget(a); setViewingId(""); setTab("list"); }}
        onDelete={(id) => {
          onAccountsChange(accounts.filter((a) => a.id !== id).map((a) => (a.parentId === id ? { ...a, parentId: "" } : a)));
          setViewingId("");
        }}
      />
    );
  }

  return (
    <div>
      <div className="subtabs">
        <button className={`subtab ${tab === "list" ? "subtab-active" : ""}`} onClick={() => setTab("list")}>Tài khoản</button>
        <button className={`subtab ${tab === "flow" ? "subtab-active" : ""}`} onClick={() => setTab("flow")}>Nạp / Rút / Chuyển vốn</button>
      </div>
      {tab === "list" ? <AccountsList accounts={accounts} ledger={ledger} trades={trades} onChange={onAccountsChange} fxRates={fxRates} onFxRatesChange={onFxRatesChange}
        onView={setViewingId} editTarget={editTarget} onEditConsumed={() => setEditTarget(null)} />
        : <CashFlowList accounts={accounts} ledger={ledger} onChange={onLedgerChange} />}
    </div>
  );
}

function ResourceManager({ resources, onChange }) {
  const [activeGroup, setActiveGroup] = useState(RESOURCE_GROUPS[0].key);
  const group = RESOURCE_GROUPS.find((g) => g.key === activeGroup);
  const [activeChild, setActiveChild] = useState(group.children ? group.children[0].key : null);
  const selectGroup = (g) => { setActiveGroup(g.key); setActiveChild(g.children ? g.children[0].key : null); };
  const childDef = group.children ? (group.children.find((c) => c.key === activeChild) || group.children[0]) : null;

  return (
    <div className="resource-wrap">
      <div className="resource-tabs">
        {RESOURCE_GROUPS.map((g) => (
          <button key={g.key} className={`resource-tab ${activeGroup === g.key ? "resource-tab-active" : ""}`} onClick={() => selectGroup(g)}>{g.label}</button>
        ))}
      </div>
      <div className="resource-panel">
        <div>
          {group.children.length > 1 ? (
            <div className="subtabs">
              {group.children.map((c) => (
                <button key={c.key} className={`subtab ${activeChild === c.key ? "subtab-active" : ""}`} onClick={() => setActiveChild(c.key)}>{c.label}</button>
              ))}
            </div>
          ) : null}
          <ResourceListEditor list={resources[childDef.key] || []} hint={childDef.hint} placeholder={`Thêm mục cho "${childDef.label}"...`}
            onAdd={(v) => onChange({ ...resources, [childDef.key]: [...(resources[childDef.key] || []), v] })}
            onRemove={(item) => onChange({ ...resources, [childDef.key]: (resources[childDef.key] || []).filter((x) => x !== item) })} />
        </div>
      </div>
    </div>
  );
}

const RESULT_FILTERS = [
  { id: "", label: "Tất cả" },
  { id: "open", label: "Đang mở" },
  { id: "win", label: "Thắng" },
  { id: "loss", label: "Thua" },
  { id: "be", label: "Hòa" },
];

function JournalFilters({ trades, resources, filters, setFilters }) {
  const years = useMemo(() => {
    const set = new Set(trades.map((t) => yearKey(t.entryDate)).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [trades]);
  const set = (k) => (v) => setFilters((p) => ({ ...p, [k]: v }));
  const clear = () => setFilters({});

  return (
    <div className="filter-panel">
      <div className="filter-grid">
        <input className="input" placeholder="Tìm theo symbol..." value={filters.q || ""} onChange={(e) => set("q")(e.target.value)} />
        <ResourceSelect value={filters.account || ""} onChange={set("account")} options={resources.accounts.map((a) => a.name)} placeholder="Tài khoản" />
        <ResourceSelect value={filters.year || ""} onChange={set("year")} options={years} placeholder="Năm" />
        <ResourceSelect value={filters.month || ""} onChange={set("month")} options={["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]} placeholder="Tháng" />
        <ResourceSelect value={filters.setup || ""} onChange={set("setup")} options={resources.setups} placeholder="Setup" />
        <ResourceSelect value={filters.session || ""} onChange={set("session")} options={resources.sessions} placeholder="Phiên" />
        <ResourceSelect value={filters.psychology || ""} onChange={set("psychology")} options={resources.psychologies} placeholder="Tâm lý" />
        <select className="input" value={filters.direction || ""} onChange={(e) => set("direction")(e.target.value)}>
          <option value="">Hướng lệnh</option><option value="buy">Buy</option><option value="sell">Sell</option>
        </select>
        <select className="input" value={filters.result || ""} onChange={(e) => set("result")(e.target.value)}>
          {RESULT_FILTERS.map((r) => <option key={r.id} value={r.id}>{r.id === "" ? "Kết quả" : r.label}</option>)}
        </select>
        <select className="input" value={filters.score || ""} onChange={(e) => set("score")(e.target.value)}>
          <option value="">Chấm điểm</option>
          <option value="low">Thấp (≤ 2 sao)</option>
          <option value="mid">Trung bình (2-4 sao)</option>
          <option value="high">Cao (≥ 4 sao)</option>
        </select>
        <select className="input" value={filters.checklist || ""} onChange={(e) => set("checklist")(e.target.value)}>
          <option value="">Checklist</option>
          <option value="complete">Đã hoàn thành đủ</option>
          <option value="partial">Đang làm dở</option>
          <option value="none">Chưa làm gì</option>
        </select>
      </div>
      <button type="button" className="btn btn-ghost" onClick={clear}><Filter size={13} /> Xóa lọc</button>
    </div>
  );
}

function applyFilters(trades, filters, resources) {
  return trades.filter((t) => {
    const r = computeResult(t);
    if (filters.q && !t.symbol.toLowerCase().includes(filters.q.toLowerCase())) return false;
    if (filters.account && t.account !== filters.account) return false;
    if (filters.year && yearKey(t.entryDate) !== filters.year) return false;
    if (filters.month && (t.entryDate || "").slice(5, 7) !== filters.month) return false;
    if (filters.setup && t.setup !== filters.setup) return false;
    if (filters.session && t.session !== filters.session) return false;
    if (filters.psychology && t.psychology !== filters.psychology) return false;
    if (filters.direction && t.direction !== filters.direction) return false;
    if (filters.result) {
      if (filters.result === "open" && r.status !== "open") return false;
      if (["win", "loss", "be"].includes(filters.result) && r.outcome !== filters.result) return false;
    }
    if (filters.score) {
      const s = avgPillarScore(t);
      if (s === null) return false;
      if (filters.score === "low" && s > 2) return false;
      if (filters.score === "mid" && (s <= 2 || s >= 4)) return false;
      if (filters.score === "high" && s < 4) return false;
    }
    if (filters.checklist) {
      const cp = checklistProgress(t, resources);
      if (cp === null) return false;
      if (filters.checklist === "complete" && cp.checked !== cp.total) return false;
      if (filters.checklist === "none" && cp.checked !== 0) return false;
      if (filters.checklist === "partial" && (cp.checked === 0 || cp.checked === cp.total)) return false;
    }
    return true;
  });
}

function DetailRow({ label, value, tone }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <span className={`mono ${tone || ""}`}>{value === "" || value === null || value === undefined ? "—" : value}</span>
    </div>
  );
}
function DetailGroup({ title, children }) {
  return (
    <div className="detail-group">
      <h4 className="detail-group-title">{title}</h4>
      <div className="detail-rows">{children}</div>
    </div>
  );
}
function TradeDetailModal({ trade, onClose, onEdit, onDelete }) {
  if (!trade) return null;
  const t = trade;
  const { rr, outcome, status } = computeResult(t);
  const score = avgPillarScore(t);
  const grade = GRADE_OPTIONS.find((g) => g.id === t.tradeGrade);
  const checklistEntries = Object.entries(t.checklist || {});

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Chi tiết giao dịch</h3>
          <button type="button" className="row-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="chart-row">
            <DetailGroup title="Thông tin">
              <DetailRow label="Ngày entry" value={t.entryDate} />
              <DetailRow label="Tài khoản" value={t.account} />
              <DetailRow label="Symbol" value={t.symbol} />
              <DetailRow label="Hướng lệnh" value={t.direction === "buy" ? "Buy" : "Sell"} />
              <DetailRow label="Khung thời gian" value={t.timeframe} />
              <DetailRow label="Phiên" value={t.session} />
              <DetailRow label="Setup" value={t.setup} />
              <DetailRow label="Bonus" value={t.setupBonus} />
              <DetailRow label="Nhận xét Setup" value={t.setupNote} />
              <DetailRow label="Điểm cấu trúc (ĐCT)" value={t.structureScore !== "" ? t.structureScore : "—"} />
            </DetailGroup>
            <DetailGroup title="Quản trị vốn & Kết quả">
              <DetailRow label="Rủi ro (%)" value={t.riskPercent ? `${t.riskPercent}%` : "—"} />
              <DetailRow label="Rủi ro (số tiền)" value={t.riskAmount ? fmt(Number(t.riskAmount)) : "—"} />
              <DetailRow label="Quản trị vốn" value={t.riskAction} />
              <DetailRow label="Ngày exit" value={t.exitDate} />
              <DetailRow label="Lợi nhuận" value={t.profit === "" ? "—" : fmt(Number(t.profit))} tone={Number(t.profit) > 0 ? "text-win" : Number(t.profit) < 0 ? "text-loss" : ""} />
              <DetailRow label="RR thực" value={rr === null ? "—" : `${rr > 0 ? "+" : ""}${rr.toFixed(2)}R`} tone={rr > 0 ? "text-win" : rr < 0 ? "text-loss" : ""} />
              <DetailRow label="Kết quả" value={status === "open" ? "Đang mở" : outcome === "win" ? "Thắng" : outcome === "loss" ? "Thua" : "Hòa"} />
            </DetailGroup>
          </div>
          <div className="chart-row">
            <DetailGroup title="Kỹ năng & Tâm lý">
              <DetailRow label="Vào lệnh" value={t.entrySkill} />
              <DetailRow label="Trong lệnh" value={t.inTradeSkill} />
              <DetailRow label="Thoát lệnh" value={t.exitSkill} />
              <DetailRow label="Tâm lý" value={t.psychology} />
            </DetailGroup>
            <DetailGroup title="Đánh giá giao dịch">
              <DetailRow label="Nhãn đánh giá" value={grade ? `${grade.tone === "win" ? "👍" : "☠️"} ${grade.label}` : "—"} />
              <DetailRow label="Nhận xét / Review" value={t.reviewNote} />
              <DetailRow label="Lý do vào lệnh" value={t.entryReason} />
            </DetailGroup>
          </div>

          <DetailGroup title="Chấm điểm (4 trụ cột)">
            <div className="pillar-grid" style={{ marginBottom: 0 }}>
              <div className="pillar-item"><span>Kiến thức</span><StarRating value={t.ratingKnowledge} onChange={() => {}} size={14} /></div>
              <div className="pillar-item"><span>Kỹ năng</span><StarRating value={t.ratingSkill} onChange={() => {}} size={14} /></div>
              <div className="pillar-item"><span>Quản trị vốn</span><StarRating value={t.ratingRisk} onChange={() => {}} size={14} /></div>
              <div className="pillar-item"><span>Tâm lý</span><StarRating value={t.ratingPsychology} onChange={() => {}} size={14} /></div>
            </div>
            <div className="pillar-avg" style={{ marginTop: 10 }}>
              <span>Trung bình</span><strong>{score === null ? "—" : `${score.toFixed(1)} / 5 ★`}</strong>
            </div>
          </DetailGroup>

          {checklistEntries.length > 0 ? (
            <DetailGroup title="Checklist">
              <div className="pillar-grid" style={{ marginBottom: 0 }}>
                {checklistEntries.map(([item, checked]) => (
                  <div key={item} className={`checklist-item ${checked ? "checklist-checked" : ""}`} style={{ cursor: "default" }}>
                    {checked ? <Check size={14} color="var(--win)" /> : <X size={14} color="var(--loss)" />}
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </DetailGroup>
          ) : null}

          {(t.entryImage || t.entryLink || t.exitImage || t.exitLink) ? (
            <DetailGroup title="Hình ảnh">
              <div style={{ display: "flex", gap: 16 }}>
                {(t.entryImage || t.entryLink) ? (
                  <div>
                    <span className="field-hint">Vào lệnh</span><br />
                    <CellImagePreview image={t.entryImage} link={t.entryLink} />
                  </div>
                ) : null}
                {(t.exitImage || t.exitLink) ? (
                  <div>
                    <span className="field-hint">Thoát lệnh</span><br />
                    <CellImagePreview image={t.exitImage} link={t.exitLink} />
                  </div>
                ) : null}
              </div>
            </DetailGroup>
          ) : null}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Đóng</button>
          <DangerConfirmButton label="Xóa" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => { onDelete(t.id); onClose(); }} />
          <button type="button" className="btn btn-primary" onClick={() => onEdit(t)}><Pencil size={14} /> Sửa</button>
        </div>
      </div>
    </div>
  );
}

function JournalTable({ trades, resources, onEdit, onDelete }) {
  const res = resources || { checklistItems: [] };
  const [viewing, setViewing] = useState(null);
  if (trades.length === 0) return <p className="empty-note" style={{ padding: "24px 0" }}>Không có giao dịch nào khớp bộ lọc.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Ngày</th><th>Symbol</th><th>Ảnh</th><th>Hướng</th><th>Setup</th><th>TF</th><th>%Risk</th><th>Lãi/Lỗ</th><th>RR</th><th>Kết quả</th><th>Chấm điểm</th><th>Checklist</th><th>Đánh giá</th><th></th></tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            const { rr, outcome, status } = computeResult(t);
            const cp = checklistProgress(t, res);
            return (
              <tr key={t.id} onClick={() => setViewing(t)}>
                <td className="mono">{t.entryDate || "—"}</td>
                <td style={{ fontWeight: 600 }}>{t.symbol}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 5 }}>
                    <CellImagePreview image={t.entryImage} link={t.entryLink} />
                    {t.exitImage || t.exitLink ? <CellImagePreview image={t.exitImage} link={t.exitLink} /> : null}
                  </div>
                </td>
                <td><span className={`dir-pill ${t.direction}`}>{t.direction === "buy" ? "Buy" : "Sell"}</span></td>
                <td>{t.setup || "—"}</td>
                <td className="mono">{t.timeframe || "—"}</td>
                <td className="mono">{t.riskPercent === "" || t.riskPercent === null || t.riskPercent === undefined ? "—" : `${t.riskPercent}%`}</td>
                <td className={`mono ${Number(t.profit) > 0 ? "text-win" : Number(t.profit) < 0 ? "text-loss" : ""}`}>{t.profit === "" ? "—" : fmt(Number(t.profit))}</td>
                <td className={`mono ${rr > 0 ? "text-win" : rr < 0 ? "text-loss" : ""}`}>{rr === null ? "—" : `${rr > 0 ? "+" : ""}${rr.toFixed(2)}R`}</td>
                <td>{status === "open" ? <span className="status-pill open">Đang mở</span> :
                  <span className={`status-pill ${outcome}`}>{outcome === "win" ? "Thắng" : outcome === "loss" ? "Thua" : "Hòa"}</span>}</td>
                <td className={`mono ${avgPillarScore(t) === null ? "" : avgPillarScore(t) >= 4 ? "text-win" : avgPillarScore(t) <= 2 ? "text-loss" : ""}`}>
                  {avgPillarScore(t) === null ? "—" : `${avgPillarScore(t).toFixed(1)}★`}
                </td>
                <td className="mono">
                  {cp === null ? "—" : (
                    <span className={`checklist-progress ${cp.checked === cp.total ? "checklist-progress-full" : cp.checked === 0 ? "checklist-progress-empty" : ""}`}>
                      {cp.checked}/{cp.total}
                    </span>
                  )}
                </td>
                <td>{t.tradeGrade ? <span className="grade-tag">{GRADE_OPTIONS.find((g) => g.id === t.tradeGrade)?.tone === "win" ? "\ud83d\udc4d" : "\u2620\ufe0f"}</span> : "—"}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 2 }}>
                    <button type="button" className="row-btn" onClick={() => onEdit(t)}><Pencil size={13} /></button>
                    <ConfirmButton onConfirm={() => onDelete(t.id)} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <TradeDetailModal trade={viewing} onClose={() => setViewing(null)} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

function TradingCalendar({ trades, resources, onEdit }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selected, setSelected] = useState("");
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const pad = (n) => String(n).padStart(2, "0");

  const byDay = useMemo(() => {
    const out = {};
    trades.forEach((t) => {
      const r = computeResult(t);
      const key = dateKey(t);
      if (!key) return;
      if (!out[key]) out[key] = { pnl: 0, count: 0 };
      out[key].count += 1;
      if (r.profit) out[key].pnl += r.profit;
    });
    return out;
  }, [trades]);

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedTrades = selected ? trades.filter((t) => dateKey(t) === selected) : [];

  return (
    <div>
      <div className="cal-nav">
        <button type="button" className="row-btn" onClick={() => setCursor(new Date(y, m - 1, 1))}><ChevronLeft size={16} /></button>
        <span className="cal-title">Tháng {m + 1}/{y}</span>
        <button type="button" className="row-btn" onClick={() => setCursor(new Date(y, m + 1, 1))}><ChevronRight size={16} /></button>
      </div>
      <div className="cal-grid cal-head">
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => <div key={d} className="cal-dow">{d}</div>)}
      </div>
      <div className="cal-grid">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="cal-cell cal-empty" />;
          const key = `${y}-${pad(m + 1)}-${pad(d)}`;
          const info = byDay[key];
          const isSel = selected === key;
          return (
            <button type="button" key={i} className={`cal-cell ${isSel ? "cal-sel" : ""} ${info ? "cal-cell-filled" : ""}`}
              style={info ? { background: heatColor(info.pnl, Math.max(1, ...Object.values(byDay).map((x) => Math.abs(x.pnl)))) } : {}}
              onClick={() => setSelected(isSel ? "" : key)}>
              <span className="cal-daynum">{d}</span>
              {info ? <span className={`cal-pnl ${info.pnl >= 0 ? "text-win" : "text-loss"}`}>{fmt(info.pnl)}</span> : null}
              {info ? <span className="cal-count">{info.count} lệnh</span> : null}
            </button>
          );
        })}
      </div>
      {selected ? (
        <div style={{ marginTop: 16 }}>
          <h3 className="block-title">Giao dịch ngày {selected}</h3>
          <JournalTable trades={selectedTrades} resources={resources} onEdit={onEdit} onDelete={() => {}} />
        </div>
      ) : null}
    </div>
  );
}

function JournalSection({ trades, resources, onEdit, onDelete }) {
  const [tab, setTab] = useState("list");
  const [filters, setFilters] = useState({});
  const filtered = useMemo(() => applyFilters(trades, filters, resources).sort((a, b) => b.createdAt - a.createdAt), [trades, filters, resources]);

  if (trades.length === 0) {
    return (
      <div className="empty-state">
        <BookOpen size={28} color="var(--text-dim)" />
        <p>Chưa có giao dịch nào. Bắt đầu bằng cách thêm giao dịch đầu tiên.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="subtabs">
        <button className={`subtab ${tab === "list" ? "subtab-active" : ""}`} onClick={() => setTab("list")}><BookOpen size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Danh sách</button>
        <button className={`subtab ${tab === "calendar" ? "subtab-active" : ""}`} onClick={() => setTab("calendar")}><CalendarDays size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Lịch</button>
      </div>
      {tab === "list" ? (
        <div>
          <JournalFilters trades={trades} resources={resources} filters={filters} setFilters={setFilters} />
          <p className="field-hint" style={{ margin: "0 0 10px" }}>{filtered.length} / {trades.length} lệnh</p>
          <JournalTable trades={filtered} resources={resources} onEdit={onEdit} onDelete={onDelete} />
        </div>
      ) : (
        <TradingCalendar trades={trades} resources={resources} onEdit={onEdit} />
      )}
    </div>
  );
}

const RANGE_OPTIONS = [
  { id: "", label: "Toàn bộ thời gian" },
  { id: "7d", label: "7 ngày qua" },
  { id: "30d", label: "30 ngày qua" },
  { id: "90d", label: "90 ngày qua" },
  { id: "month", label: "Tháng này" },
  { id: "quarter", label: "Quý này" },
  { id: "year", label: "Năm nay" },
];
function inRange(dateStr, range) {
  if (!range || !dateStr) return true;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  if (range === "7d") { const from = new Date(now); from.setDate(from.getDate() - 7); return d >= from; }
  if (range === "30d") { const from = new Date(now); from.setDate(from.getDate() - 30); return d >= from; }
  if (range === "90d") { const from = new Date(now); from.setDate(from.getDate() - 90); return d >= from; }
  if (range === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (range === "quarter") return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3);
  if (range === "year") return d.getFullYear() === now.getFullYear();
  return true;
}

function DashboardFilters({ resources, account, onAccount, range, onRange }) {
  return (
    <div className="scope-bar">
      {resources.accounts.length > 0 ? (
        <>
          <span className="field-label" style={{ marginRight: 4 }}>Tài khoản:</span>
          <select className="input" style={{ maxWidth: 200 }} value={account} onChange={(e) => onAccount(e.target.value)}>
            <option value="">Tất cả tài khoản</option>
            {resources.accounts.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
        </>
      ) : null}
      <span className="field-label" style={{ marginRight: 4, marginLeft: resources.accounts.length ? 14 : 0 }}>Thời gian:</span>
      <select className="input" style={{ maxWidth: 180 }} value={range} onChange={(e) => onRange(e.target.value)}>
        {RANGE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
    </div>
  );
}

function Dashboard({ trades, resources, account, onAccountChange, onViewTrade }) {
  const [range, setRange] = useState("");
  const scoped = trades.filter((t) => (!account || t.account === account) && inRange(dateKey(t) || t.entryDate, range));
  const singleAccount = account ? resources.accounts.find((a) => a.name === account) : null;
  const currencyUnit = singleAccount ? singleAccount.currency : "USD";
  const closed = singleAccount ? closedOf(scoped) : closedOfUSD(scoped, resources);
  const scopeBar = <DashboardFilters resources={resources} account={account} onAccount={onAccountChange} range={range} onRange={setRange} />;
  if (closed.length === 0) {
    return (
      <div>
        {scopeBar}
        <div className="empty-state">
          <LayoutDashboard size={28} color="var(--text-dim)" />
          <p>Chưa có lệnh đã đóng để hiển thị tổng quan. Đóng vài lệnh rồi quay lại đây.</p>
        </div>
      </div>
    );
  }
  const sorted = [...closed].sort((a, b) => dateKey(a.t).localeCompare(dateKey(b.t)));
  let cum = 0;
  const equityData = sorted.map((x) => { cum += x.r.profit; return { date: dateKey(x.t), equity: Number(cum.toFixed(2)) }; });

  const wins = closed.filter((x) => x.r.outcome === "win").length;
  const losses = closed.filter((x) => x.r.outcome === "loss").length;
  const be = closed.filter((x) => x.r.outcome === "be").length;
  const winRate = (wins / closed.length) * 100;
  const totalR = closed.reduce((s, x) => s + (x.r.rr || 0), 0);
  const totalPnl = closed.reduce((s, x) => s + x.r.profit, 0);
  const pieData = [{ name: "Thắng", value: wins, color: WIN }, { name: "Thua", value: losses, color: LOSS }, { name: "Hòa", value: be, color: MUTED }].filter((d) => d.value > 0);

  const scored = closed.filter((x) => avgPillarScore(x.t) !== null);
  const avgScoreAll = scored.length ? scored.reduce((s, x) => s + avgPillarScore(x.t), 0) / scored.length : null;
  const lowScoreTrades = scored.filter((x) => avgPillarScore(x.t) <= 2).map((x) => x.t);

  const byMonth = groupStats(closed, (t) => monthKey(dateKey(t)));
  const monthKeys = Object.keys(byMonth).sort();
  const pnlByMonth = monthKeys.map((k) => ({ month: k, pnl: Number(byMonth[k].pnl.toFixed(2)) }));
  const countByMonth = monthKeys.map((k) => ({ month: k, count: byMonth[k].count }));

  const bySession = groupStats(closed, (t) => t.session);
  const sessionData = Object.entries(bySession).map(([name, s]) => ({ name, pnl: Number(s.pnl.toFixed(2)) }));

  const bySymbol = groupStats(closed, (t) => t.symbol);
  const topSymbols = Object.entries(bySymbol).sort((a, b) => b[1].pnl - a[1].pnl).slice(0, 6).map(([name, s]) => ({ name, pnl: Number(s.pnl.toFixed(2)) }));

  const violations = closed.filter((x) => x.t.ratingRisk > 0 && x.t.ratingRisk <= 2).length;
  const compliant = closed.filter((x) => x.t.ratingRisk >= 4).length;
  const rated = closed.filter((x) => x.t.ratingRisk > 0).length;

  const byWeekday = {};
  closed.forEach((x) => {
    const wd = weekdayIndex(dateKey(x.t));
    if (wd === null) return;
    if (!byWeekday[wd]) byWeekday[wd] = { pnl: 0, count: 0, wins: 0 };
    byWeekday[wd].pnl += x.r.profit; byWeekday[wd].count += 1;
    if (x.r.outcome === "win") byWeekday[wd].wins += 1;
  });
  const maxWeekdayAbs = Math.max(1, ...Object.values(byWeekday).map((v) => Math.abs(v.pnl)));

  const byGrade = {}; GRADE_OPTIONS.forEach((g) => (byGrade[g.id] = 0));
  closed.forEach((x) => { if (x.t.tradeGrade && byGrade[x.t.tradeGrade] !== undefined) byGrade[x.t.tradeGrade] += 1; });

  const m = computeAdvancedMetrics(closed);
  const expectancy = totalPnl / closed.length;

  return (
    <div>
      {scopeBar}
      <h3 className="block-title" style={{ marginTop: 0 }}>Chỉ số quan trọng</h3>
      <p className="field-hint" style={{ marginBottom: 10, marginTop: -6 }}>
        {singleAccount ? `Số liệu hiển thị theo đơn vị tiền tệ của tài khoản "${singleAccount.name}": ${currencyUnit}.` : "Đang gộp nhiều tài khoản — số tiền được quy đổi về USD theo tỷ giá cấu hình ở Tài khoản để cộng được giữa các đơn vị tiền tệ khác nhau."}
      </p>
      <div className="stat-grid">
        <StatCard label="Net Profit" value={fmtMoney(m.netProfit, currencyUnit)} tone={m.netProfit >= 0 ? "win" : "loss"} />
        <StatCard label="Net Profit (R)" value={fmtR(m.netProfitR)} tone={m.netProfitR >= 0 ? "win" : "loss"} />
        <StatCard label="Max Drawdown" value={fmtMoney(m.maxDD, currencyUnit)} tone="loss" />
        <StatCard label="Max Drawdown (R)" value={m.maxDDR ? `${m.maxDDR.toFixed(2)}R` : "—"} tone="loss" />
        <StatCard label="Profit Factor" value={Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "∞"} tone={m.profitFactor >= 1 ? "win" : "loss"} />
        <StatCard label="Kỳ vọng trung bình / lệnh" value={fmtMoney(expectancy, currencyUnit)} tone={expectancy >= 0 ? "win" : "loss"} />
        <StatCard label="Kỳ vọng trung bình / lệnh (R)" value={fmtR(m.netProfitR / closed.length)} tone={m.netProfitR >= 0 ? "win" : "loss"} />
      </div>

      <h3 className="block-title">Chi tiết 1 — Tổng quan lệnh</h3>
      <div className="stat-grid">
        <StatCard label="Tổng lệnh đã đóng" value={closed.length} />
        <StatCard label="Thắng / Thua / Hòa" value={`${wins} / ${losses} / ${be}`} />
        <StatCard label="Tỷ lệ thắng" value={`${winRate.toFixed(1)}%`} tone={winRate >= 50 ? "win" : "loss"} />
        <StatCard label="RR trung bình / lệnh (theo tiền)" value={m.avgLoss ? (m.avgWin / Math.abs(m.avgLoss)).toFixed(2) : "—"} tone={m.avgWin >= Math.abs(m.avgLoss) ? "win" : "loss"} />
        <StatCard label="RR trung bình / lệnh (theo R)" value={m.avgLossR ? (m.avgWinR / Math.abs(m.avgLossR)).toFixed(2) : "—"} tone={m.avgWinR >= Math.abs(m.avgLossR) ? "win" : "loss"} />
      </div>

      <h3 className="block-title">Chi tiết 2 — Lãi / Lỗ</h3>
      <div className="stat-grid">
        <StatCard label="Tổng lãi/lỗ (theo tiền)" value={fmtMoney(totalPnl, currencyUnit)} tone={totalPnl >= 0 ? "win" : "loss"} />
        <StatCard label="Tổng lãi/lỗ (theo R)" value={`${totalR > 0 ? "+" : ""}${totalR.toFixed(2)}R`} tone={totalR >= 0 ? "win" : "loss"} />
        <StatCard label="Tổng lời" value={fmtMoney(m.grossWin, currencyUnit)} tone="win" />
        <StatCard label="Tổng lỗ" value={fmtMoney(m.grossLoss, currencyUnit)} tone="loss" />
        <StatCard label="Lãi TB / lệnh thắng" value={fmtMoney(m.avgWin, currencyUnit)} tone="win" />
        <StatCard label="Lỗ TB / lệnh thua" value={fmtMoney(m.avgLoss, currencyUnit)} tone="loss" />
      </div>

      <h3 className="block-title">Chi tiết 3 — Kỷ lục & thời gian giữ lệnh</h3>
      <div className="stat-grid">
        <StatCard label="Lệnh thắng lớn nhất" value={fmtMoney(m.largestWin, currencyUnit)} tone="win" />
        <StatCard label="Lệnh thua lớn nhất" value={fmtMoney(m.largestLoss, currencyUnit)} tone="loss" />
        <StatCard label="Chuỗi thắng dài nhất" value={m.maxWinStreak} tone="win" />
        <StatCard label="Chuỗi thua dài nhất" value={m.maxLossStreak} tone="loss" />
        <StatCard label="TG giữ lệnh TB (thắng)" value={fmtDays(m.avgHoldWin)} />
        <StatCard label="TG giữ lệnh TB (thua)" value={fmtDays(m.avgHoldLoss)} />
      </div>

      <h3 className="block-title">Chi tiết 4 — Long / Short</h3>
      <div className="stat-grid">
        <StatCard label="Số lệnh Long" value={m.longsCount} />
        <StatCard label="Số lệnh Short" value={m.shortsCount} />
        <StatCard label="Winrate Long" value={m.longWinrate === null ? "—" : `${m.longWinrate.toFixed(1)}%`} tone={m.longWinrate >= 50 ? "win" : "loss"} />
        <StatCard label="Winrate Short" value={m.shortWinrate === null ? "—" : `${m.shortWinrate.toFixed(1)}%`} tone={m.shortWinrate >= 50 ? "win" : "loss"} />
        <StatCard label="Net Profit lệnh Long" value={fmtMoney(m.longsPnl, currencyUnit)} tone={m.longsPnl >= 0 ? "win" : "loss"} />
        <StatCard label="Net Profit lệnh Short" value={fmtMoney(m.shortsPnl, currencyUnit)} tone={m.shortsPnl >= 0 ? "win" : "loss"} />
      </div>

      <h3 className="block-title">Chấm điểm trung bình (4 trụ cột)</h3>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
        <StatCard label="Chấm điểm trung bình (4 trụ cột)" value={avgScoreAll === null ? "—" : `${avgScoreAll.toFixed(1)} / 5 ★`} tone={avgScoreAll >= 3.5 ? "win" : avgScoreAll !== null && avgScoreAll <= 2.5 ? "loss" : ""} />
      </div>

      <div className="chart-row">
        <ChartCard title="Đường cong vốn" subtitle="Lãi/lỗ cộng dồn theo thời gian">
          <ResponsiveContainer>
            <LineChart data={equityData}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} minTickGap={30} />
              <YAxis tick={{ fontSize: 10, fill: MUTED }} width={46} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Line type="monotone" dataKey="equity" stroke={ACCENT} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Thắng / Thua" subtitle={`${wins} thắng · ${losses} thua · ${be} hòa`}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="chart-row">
        <ChartCard title="Lãi/Lỗ theo tháng">
          <ResponsiveContainer>
            <BarChart data={pnlByMonth}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: MUTED }} />
              <YAxis tick={{ fontSize: 10, fill: MUTED }} width={46} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Bar dataKey="pnl">{pnlByMonth.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? WIN : LOSS} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Tần suất giao dịch theo tháng">
          <ResponsiveContainer>
            <BarChart data={countByMonth}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: MUTED }} />
              <YAxis tick={{ fontSize: 10, fill: MUTED }} width={46} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Bar dataKey="count" fill={ACCENT} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="chart-row">
        <ChartCard title="Theo phiên giao dịch">
          <ResponsiveContainer>
            <BarChart data={sessionData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 10, fill: MUTED }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: MUTED }} width={110} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Bar dataKey="pnl">{sessionData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? WIN : LOSS} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Top cặp tiền theo lãi/lỗ">
          <ResponsiveContainer>
            <BarChart data={topSymbols} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 10, fill: MUTED }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: MUTED }} width={80} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Bar dataKey="pnl">{topSymbols.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? WIN : LOSS} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <h3 className="block-title">Kỷ luật quản lý rủi ro</h3>
      <p className="field-hint" style={{ marginBottom: 10 }}>Dựa trên sao tự đánh giá "Quản trị vốn" ở mỗi lệnh — 4-5 sao coi là tuân thủ, 1-2 sao coi là vi phạm.</p>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 24 }}>
        <StatCard label="Lệnh đã tự chấm điểm" value={rated} />
        <StatCard label="Tuân thủ (4-5 sao)" value={compliant} tone="win" />
        <StatCard label="Vi phạm (1-2 sao)" value={violations} tone="loss" />
      </div>

      <h3 className="block-title">Đánh giá giao dịch</h3>
      <div className="grade-grid" style={{ marginBottom: 24 }}>
        {GRADE_OPTIONS.map((g) => (
          <div key={g.id} className={`grade-stat ${g.tone}`}>
            <span>{g.tone === "win" ? "\ud83d\udc4d" : "\u2620\ufe0f"} {g.label}</span>
            <strong>{byGrade[g.id]}</strong>
          </div>
        ))}
      </div>

      {lowScoreTrades.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <h3 className="block-title">Lệnh chấm điểm thấp (≤ 2 sao) — cần xem lại</h3>
          <JournalTable trades={lowScoreTrades} resources={resources} onEdit={onViewTrade || (() => {})} onDelete={() => {}} />
        </div>
      ) : null}

      <h3 className="block-title">Bản đồ nhiệt theo thứ trong tuần</h3>
      <div className="heat-strip">
        {WEEKDAY_ORDER.filter((wd) => byWeekday[wd]).map((wd) => (
          <div key={wd} className="heat-cell" style={{ background: heatColor(byWeekday[wd].pnl, maxWeekdayAbs) }}>
            <span className="heat-label">{WEEKDAY_LABEL[wd]}</span>
            <span className={`heat-value ${byWeekday[wd].pnl >= 0 ? "text-win" : "text-loss"}`}>{fmt(byWeekday[wd].pnl)}</span>
            <span className="heat-sub">{byWeekday[wd].count} lệnh · {((byWeekday[wd].wins / byWeekday[wd].count) * 100).toFixed(0)}% thắng</span>
          </div>
        ))}
      </div>

      <h3 className="block-title">Bản đồ nhiệt theo tháng</h3>
      <div className="heat-strip">
        {monthKeys.map((k) => (
          <div key={k} className="heat-cell" style={{ background: heatColor(byMonth[k].pnl, Math.max(1, ...monthKeys.map((x) => Math.abs(byMonth[x].pnl)))) }}>
            <span className="heat-label">{k}</span>
            <span className={`heat-value ${byMonth[k].pnl >= 0 ? "text-win" : "text-loss"}`}>{fmt(byMonth[k].pnl)}</span>
            <span className="heat-sub">{byMonth[k].count} lệnh</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankTable({ title, rows, tone }) {
  return (
    <div>
      <h4 className="rank-title">{title}</h4>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Tên</th><th>Số lệnh</th><th>Tỷ lệ thắng</th><th>Tổng R</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={4} className="empty-note">Chưa đủ dữ liệu.</td></tr> : rows.map(([name, s]) => (
              <tr key={name}>
                <td>{name}</td>
                <td className="mono">{s.count}</td>
                <td className="mono">{((s.wins / s.count) * 100).toFixed(0)}%</td>
                <td className={`mono ${s.totalR >= 0 ? "text-win" : "text-loss"}`}>{s.totalR > 0 ? "+" : ""}{s.totalR.toFixed(2)}R</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopBottom({ closed }) {
  const bySetup = groupStats(closed, (t) => t.setup || "Chưa gắn setup");
  const bySymbol = groupStats(closed, (t) => t.symbol);
  const setupEntries = Object.entries(bySetup).filter(([, s]) => s.count >= 1);
  const symbolEntries = Object.entries(bySymbol).filter(([, s]) => s.count >= 1);
  const topSetup = [...setupEntries].sort((a, b) => b[1].totalR - a[1].totalR).slice(0, 5);
  const botSetup = [...setupEntries].sort((a, b) => a[1].totalR - b[1].totalR).slice(0, 5);
  const topSymbol = [...symbolEntries].sort((a, b) => b[1].totalR - a[1].totalR).slice(0, 5);
  const botSymbol = [...symbolEntries].sort((a, b) => a[1].totalR - b[1].totalR).slice(0, 5);
  return (
    <div>
      <div className="chart-row">
        <RankTable title="Top 5 Setup tốt nhất" rows={topSetup} />
        <RankTable title="Top 5 Setup kém nhất" rows={botSetup} />
      </div>
      <div className="chart-row">
        <RankTable title="Cặp tiền tốt nhất" rows={topSymbol} />
        <RankTable title="Cặp tiền kém nhất" rows={botSymbol} />
      </div>
    </div>
  );
}

function RDistribution({ closed, resources, onViewTrade }) {
  const withR = closed.filter((x) => x.r.rr !== null && Number.isFinite(x.r.rr));
  const buckets = R_BUCKETS.map((b) => {
    const items = withR.filter((x) => x.r.rr > b.min && x.r.rr <= b.max);
    return {
      label: b.label,
      count: items.length,
      pct: withR.length ? (items.length / withR.length) * 100 : 0,
      totalR: items.reduce((s, x) => s + x.r.rr, 0),
      tone: b.max <= 0 ? "loss" : b.min >= 0 ? "win" : "neutral",
    };
  });
  const avg = withR.length ? withR.reduce((s, x) => s + x.r.rr, 0) / withR.length : 0;
  const variance = withR.length ? withR.reduce((s, x) => s + Math.pow(x.r.rr - avg, 2), 0) / withR.length : 0;
  const stdev = Math.sqrt(variance);
  const outliers = withR.filter((x) => Math.abs(x.r.rr - avg) > 2 * stdev);

  if (withR.length === 0) return <p className="empty-note">Chưa có lệnh nào có đủ dữ liệu Risk & Lãi/Lỗ để tính R-multiple.</p>;

  return (
    <div>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 18 }}>
        <StatCard label="R trung bình" value={`${avg.toFixed(2)}R`} tone={avg >= 0 ? "win" : "loss"} />
        <StatCard label="Độ lệch chuẩn" value={`${stdev.toFixed(2)}R`} />
        <StatCard label="Số lệnh outlier (>2σ)" value={outliers.length} />
      </div>
      <ChartCard title="Phân bố theo R-multiple" height={260}>
        <ResponsiveContainer>
          <BarChart data={buckets}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: MUTED }} interval={0} angle={-30} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 10, fill: MUTED }} width={36} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
            <Bar dataKey="count">{buckets.map((b, i) => <Cell key={i} fill={b.tone === "win" ? WIN : b.tone === "loss" ? LOSS : MUTED} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <h4 className="rank-title" style={{ marginTop: 16 }}>Tỷ trọng theo mốc R</h4>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Khoảng R</th><th>Số lệnh</th><th>Tỷ trọng</th><th>Tổng R</th></tr></thead>
          <tbody>
            {buckets.filter((b) => b.count > 0).map((b) => (
              <tr key={b.label}>
                <td>{b.label}</td>
                <td className="mono">{b.count}</td>
                <td className="mono">{b.pct.toFixed(1)}%</td>
                <td className={`mono ${b.totalR >= 0 ? "text-win" : "text-loss"}`}>{b.totalR > 0 ? "+" : ""}{b.totalR.toFixed(2)}R</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {outliers.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <h4 className="rank-title">Lệnh outlier</h4>
          <JournalTable trades={outliers.map((x) => x.t)} resources={resources} onEdit={onViewTrade || (() => {})} onDelete={() => {}} />
        </div>
      ) : null}
    </div>
  );
}

function buildInsights(closed) {
  const insights = [];
  const MIN = 3;
  const bySetup = groupStats(closed, (t) => t.setup || "Chưa gắn setup");
  const setupEntries = Object.entries(bySetup).filter(([, s]) => s.count >= MIN);
  if (setupEntries.length) {
    const best = [...setupEntries].sort((a, b) => b[1].totalR - a[1].totalR)[0];
    const worst = [...setupEntries].sort((a, b) => a[1].totalR - b[1].totalR)[0];
    if (best[1].totalR > 0) insights.push(`Setup "${best[0]}" đang hiệu quả nhất: tổng ${best[1].totalR.toFixed(2)}R sau ${best[1].count} lệnh, tỷ lệ thắng ${((best[1].wins / best[1].count) * 100).toFixed(0)}%.`);
    if (worst[0] !== best[0] && worst[1].totalR < 0) insights.push(`Setup "${worst[0]}" đang kéo hiệu suất xuống: ${worst[1].totalR.toFixed(2)}R sau ${worst[1].count} lệnh — cân nhắc xem lại điều kiện vào lệnh của setup này.`);
  }
  const byWeekday = {};
  closed.forEach((x) => {
    const wd = weekdayIndex(dateKey(x.t));
    if (wd === null) return;
    if (!byWeekday[wd]) byWeekday[wd] = { count: 0, wins: 0, pnl: 0 };
    byWeekday[wd].count += 1; byWeekday[wd].pnl += x.r.profit;
    if (x.r.outcome === "win") byWeekday[wd].wins += 1;
  });
  const wdEntries = Object.entries(byWeekday).filter(([, s]) => s.count >= MIN);
  if (wdEntries.length) {
    const best = wdEntries.sort((a, b) => b[1].pnl - a[1].pnl)[0];
    insights.push(`Bạn giao dịch tốt nhất vào ${WEEKDAY_LABEL[best[0]]}: lãi ${fmt(best[1].pnl)}, tỷ lệ thắng ${((best[1].wins / best[1].count) * 100).toFixed(0)}%.`);
  }
  const highRisk = closed.filter((x) => x.t.ratingRisk >= 4);
  const lowRisk = closed.filter((x) => x.t.ratingRisk > 0 && x.t.ratingRisk <= 2);
  if (highRisk.length >= MIN && lowRisk.length >= MIN) {
    const wrHigh = (highRisk.filter((x) => x.r.outcome === "win").length / highRisk.length) * 100;
    const wrLow = (lowRisk.filter((x) => x.r.outcome === "win").length / lowRisk.length) * 100;
    if (Math.abs(wrHigh - wrLow) >= 10) {
      insights.push(`Khi tự đánh giá quản trị vốn 4-5 sao, tỷ lệ thắng của bạn là ${wrHigh.toFixed(0)}%, so với chỉ ${wrLow.toFixed(0)}% khi tự chấm 1-2 sao — kỷ luật rủi ro đang ảnh hưởng rõ tới kết quả.`);
    }
  }
  const buys = closed.filter((x) => x.t.direction === "buy");
  const sells = closed.filter((x) => x.t.direction === "sell");
  if (buys.length >= MIN && sells.length >= MIN) {
    const wrBuy = (buys.filter((x) => x.r.outcome === "win").length / buys.length) * 100;
    const wrSell = (sells.filter((x) => x.r.outcome === "win").length / sells.length) * 100;
    if (Math.abs(wrBuy - wrSell) >= 15) {
      insights.push(`Lệnh ${wrBuy > wrSell ? "Buy" : "Sell"} đang có tỷ lệ thắng cao hơn hẳn (${Math.max(wrBuy, wrSell).toFixed(0)}% so với ${Math.min(wrBuy, wrSell).toFixed(0)}%).`);
    }
  }
  if (insights.length === 0) insights.push("Chưa đủ dữ liệu để đưa ra phân tích tự động đáng tin cậy — cần thêm lệnh đã đóng ở mỗi nhóm (tối thiểu 3 lệnh/nhóm).");
  return insights.slice(0, 5);
}

const DRILL_DIMS = [
  { key: "symbol", label: "Theo Pair" },
  { key: "setup", label: "Theo Setup" },
  { key: "weekday", label: "Theo Thứ" },
];

function keyForDim(t, dim) {
  if (dim === "symbol") return t.symbol || "—";
  if (dim === "setup") return t.setup || "Chưa gắn setup";
  if (dim === "weekday") { const wd = weekdayIndex(dateKey(t)); return wd === null ? "—" : WEEKDAY_LABEL[wd]; }
  if (dim === "structure") return t.structureScore !== "" && t.structureScore !== undefined && t.structureScore !== null ? `ĐCT ${t.structureScore}` : "Chưa chấm";
  return "—";
}

function PerformanceDrilldown({ closed }) {
  const [dim, setDim] = useState("symbol");
  const [selected, setSelected] = useState("");
  useEffect(() => setSelected(""), [dim]);

  const groups = groupStats(closed, (t) => keyForDim(t, dim));
  const entries = Object.entries(groups).sort((a, b) => b[1].count - a[1].count);

  if (selected) {
    const items = closed.filter((x) => keyForDim(x.t, dim) === selected);
    const sorted = [...items].sort((a, b) => dateKey(a.t).localeCompare(dateKey(b.t)));
    let cum = 0;
    const equityData = sorted.map((x) => { cum += x.r.profit; return { date: dateKey(x.t), equity: Number(cum.toFixed(2)) }; });
    const wins = items.filter((x) => x.r.outcome === "win").length;
    const s = groups[selected];
    return (
      <div>
        <button type="button" className="btn btn-ghost" style={{ marginBottom: 14 }} onClick={() => setSelected("")}><ChevronLeft size={14} /> Tất cả {DRILL_DIMS.find((d) => d.key === dim).label.toLowerCase()}</button>
        <h3 className="block-title" style={{ marginTop: 0 }}>{selected}</h3>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 18 }}>
          <StatCard label="Số lệnh" value={s.count} />
          <StatCard label="Tỷ lệ thắng" value={`${((wins / s.count) * 100).toFixed(0)}%`} tone={wins / s.count >= 0.5 ? "win" : "loss"} />
          <StatCard label="Tổng R" value={`${s.totalR.toFixed(2)}R`} tone={s.totalR >= 0 ? "win" : "loss"} />
          <StatCard label="Tổng lãi/lỗ" value={fmt(s.pnl)} tone={s.pnl >= 0 ? "win" : "loss"} />
        </div>
        <ChartCard title="Đường cong vốn riêng" height={200}>
          <ResponsiveContainer>
            <LineChart data={equityData}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} minTickGap={30} />
              <YAxis tick={{ fontSize: 10, fill: MUTED }} width={46} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Line type="monotone" dataKey="equity" stroke={ACCENT} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <h4 className="rank-title" style={{ marginTop: 18 }}>Lịch sử giao dịch</h4>
        <JournalTable trades={items.map((x) => x.t)} onEdit={() => {}} onDelete={() => {}} />
      </div>
    );
  }

  return (
    <div>
      <div className="subtabs">
        {DRILL_DIMS.map((d) => <button key={d.key} className={`subtab ${dim === d.key ? "subtab-active" : ""}`} onClick={() => setDim(d.key)}>{d.label}</button>)}
      </div>
      <div className="resource-list">
        {entries.length === 0 ? <p className="empty-note">Chưa có dữ liệu.</p> : null}
        {entries.map(([name, s]) => (
          <button type="button" key={name} className="drill-row" onClick={() => setSelected(name)}>
            <span className="drill-name">{name}</span>
            <span className="drill-stats">
              <span className="mono">{s.count} lệnh</span>
              <span className="mono">{((s.wins / s.count) * 100).toFixed(0)}% thắng</span>
              <span className={`mono ${s.totalR >= 0 ? "text-win" : "text-loss"}`}>{s.totalR > 0 ? "+" : ""}{s.totalR.toFixed(2)}R</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function computeAdvancedMetrics(closed) {
  const sorted = [...closed].sort((a, b) => dateKey(a.t).localeCompare(dateKey(b.t)));
  const withR = sorted.filter((x) => x.r.rr !== null && Number.isFinite(x.r.rr));
  const wins = sorted.filter((x) => x.r.outcome === "win");
  const losses = sorted.filter((x) => x.r.outcome === "loss");
  const winsR = wins.filter((x) => x.r.rr !== null && Number.isFinite(x.r.rr));
  const lossesR = losses.filter((x) => x.r.rr !== null && Number.isFinite(x.r.rr));

  const netProfit = sorted.reduce((s, x) => s + x.r.profit, 0);
  const netProfitR = withR.reduce((s, x) => s + x.r.rr, 0);
  const grossWin = wins.reduce((s, x) => s + x.r.profit, 0);
  const grossLoss = losses.reduce((s, x) => s + x.r.profit, 0);
  const profitFactor = grossLoss !== 0 ? grossWin / Math.abs(grossLoss) : (grossWin > 0 ? Infinity : 0);
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const avgWinR = winsR.length ? winsR.reduce((s, x) => s + x.r.rr, 0) / winsR.length : 0;
  const avgLossR = lossesR.length ? lossesR.reduce((s, x) => s + x.r.rr, 0) / lossesR.length : 0;
  const largestWin = wins.length ? Math.max(...wins.map((x) => x.r.profit)) : 0;
  const largestLoss = losses.length ? Math.min(...losses.map((x) => x.r.profit)) : 0;
  const largestWinR = winsR.length ? Math.max(...winsR.map((x) => x.r.rr)) : 0;
  const largestLossR = lossesR.length ? Math.min(...lossesR.map((x) => x.r.rr)) : 0;

  let cum = 0, peak = 0, maxDD = 0;
  sorted.forEach((x) => { cum += x.r.profit; if (cum > peak) peak = cum; const dd = peak - cum; if (dd > maxDD) maxDD = dd; });
  let cumR = 0, peakR = 0, maxDDR = 0;
  withR.forEach((x) => { cumR += x.r.rr; if (cumR > peakR) peakR = cumR; const dd = peakR - cumR; if (dd > maxDDR) maxDDR = dd; });

  let curWin = 0, maxWinStreak = 0, curLoss = 0, maxLossStreak = 0;
  sorted.forEach((x) => {
    if (x.r.outcome === "win") { curWin += 1; maxWinStreak = Math.max(maxWinStreak, curWin); curLoss = 0; }
    else if (x.r.outcome === "loss") { curLoss += 1; maxLossStreak = Math.max(maxLossStreak, curLoss); curWin = 0; }
    else { curWin = 0; curLoss = 0; }
  });

  const holdDays = (x) => {
    if (!x.t.entryDate || !x.t.exitDate) return null;
    const d1 = new Date(x.t.entryDate + "T00:00:00"), d2 = new Date(x.t.exitDate + "T00:00:00");
    const diff = (d2 - d1) / 86400000;
    return diff >= 0 ? diff : null;
  };
  const winHolds = wins.map(holdDays).filter((v) => v !== null);
  const lossHolds = losses.map(holdDays).filter((v) => v !== null);
  const avgHoldWin = winHolds.length ? winHolds.reduce((a, b) => a + b, 0) / winHolds.length : null;
  const avgHoldLoss = lossHolds.length ? lossHolds.reduce((a, b) => a + b, 0) / lossHolds.length : null;

  const longs = sorted.filter((x) => x.t.direction === "buy");
  const shorts = sorted.filter((x) => x.t.direction === "sell");
  const longWinrate = longs.length ? (longs.filter((x) => x.r.outcome === "win").length / longs.length) * 100 : null;
  const shortWinrate = shorts.length ? (shorts.filter((x) => x.r.outcome === "win").length / shorts.length) * 100 : null;
  const longsPnl = longs.reduce((s, x) => s + x.r.profit, 0);
  const shortsPnl = shorts.reduce((s, x) => s + x.r.profit, 0);
  const winRate = sorted.length ? (wins.length / sorted.length) * 100 : null;
  const rrRatioMoney = avgLoss ? avgWin / Math.abs(avgLoss) : null;
  const rrRatioR = avgLossR ? avgWinR / Math.abs(avgLossR) : null;
  const expectancyMoney = sorted.length ? netProfit / sorted.length : null;
  const expectancyR = sorted.length ? netProfitR / sorted.length : null;

  return {
    netProfit, netProfitR, profitFactor, grossWin, grossLoss, avgWin, avgLoss, avgWinR, avgLossR,
    largestWin, largestLoss, largestWinR, largestLossR, maxDD, maxDDR, maxWinStreak, maxLossStreak,
    avgHoldWin, avgHoldLoss, longsCount: longs.length, shortsCount: shorts.length, longWinrate, shortWinrate,
    longsPnl, shortsPnl, winRate, rrRatioMoney, rrRatioR, expectancyMoney, expectancyR,
  };
}
function fmtR(v) { return v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}R`; }
function fmtDays(v) { return v === null ? "—" : `${v.toFixed(1)} ngày`; }
function fmtMoney(value, currency) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const cur = currency || "USD";
  const neg = value < 0;
  const numStr = Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (cur === "USD") return `${neg ? "-" : ""}$${numStr}`;
  if (cur === "VND") return `${neg ? "-" : ""}${numStr}₫`;
  return `${neg ? "-" : ""}${numStr} ${cur}`;
}

function AdvancedMetrics({ closed, currency = "USD" }) {
  const m = computeAdvancedMetrics(closed);
  return (
    <div>
      <div className="metric-group">
        <h4 className="metric-group-title">Lợi nhuận</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          <StatCard label="Net Profit (tiền)" value={fmtMoney(m.netProfit, currency)} tone={m.netProfit >= 0 ? "win" : "loss"} />
          <StatCard label="Net Profit (R)" value={fmtR(m.netProfitR)} tone={m.netProfitR >= 0 ? "win" : "loss"} />
          <StatCard label="Profit Factor" value={Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "∞"} tone={m.profitFactor >= 1 ? "win" : "loss"} />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Winrate · RR trung bình · Kỳ vọng</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
          <StatCard label="Winrate" value={m.winRate === null ? "—" : `${m.winRate.toFixed(1)}%`} tone={m.winRate >= 50 ? "win" : "loss"} />
          <StatCard label="RR trung bình / lệnh (theo tiền)" value={m.rrRatioMoney === null ? "—" : m.rrRatioMoney.toFixed(2)} tone={m.rrRatioMoney >= 1 ? "win" : "loss"} />
          <StatCard label="RR trung bình / lệnh (theo R)" value={m.rrRatioR === null ? "—" : m.rrRatioR.toFixed(2)} tone={m.rrRatioR >= 1 ? "win" : "loss"} />
          <StatCard label="Kỳ vọng trung bình / lệnh ($)" value={fmtMoney(m.expectancyMoney, currency)} tone={m.expectancyMoney >= 0 ? "win" : "loss"} />
          <StatCard label="Kỳ vọng trung bình / lệnh (R)" value={fmtR(m.expectancyR)} tone={m.expectancyR >= 0 ? "win" : "loss"} />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Max Drawdown</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <StatCard label="Max DD (tiền)" value={fmtMoney(m.maxDD, currency)} tone="loss" />
          <StatCard label="Max DD (R)" value={m.maxDDR ? `${m.maxDDR.toFixed(2)}R` : "—"} tone="loss" />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Tổng lời / lỗ</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <StatCard label="Tổng lời" value={fmtMoney(m.grossWin, currency)} tone="win" />
          <StatCard label="Tổng lỗ" value={fmtMoney(m.grossLoss, currency)} tone="loss" />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Lãi trung bình</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <StatCard label="Lãi TB (tiền)" value={fmtMoney(m.avgWin, currency)} tone="win" />
          <StatCard label="Lãi TB (R)" value={fmtR(m.avgWinR)} tone="win" />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Lỗ trung bình</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <StatCard label="Lỗ TB (tiền)" value={fmtMoney(m.avgLoss, currency)} tone="loss" />
          <StatCard label="Lỗ TB (R)" value={fmtR(m.avgLossR)} tone="loss" />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Lãi lớn nhất</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <StatCard label="Lãi lớn nhất (tiền)" value={fmtMoney(m.largestWin, currency)} tone="win" />
          <StatCard label="Lãi lớn nhất (R)" value={fmtR(m.largestWinR)} tone="win" />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Lỗ lớn nhất</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <StatCard label="Lỗ lớn nhất (tiền)" value={fmtMoney(m.largestLoss, currency)} tone="loss" />
          <StatCard label="Lỗ lớn nhất (R)" value={fmtR(m.largestLossR)} tone="loss" />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Chuỗi thắng / thua</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <StatCard label="Chuỗi thắng dài nhất" value={m.maxWinStreak} tone="win" />
          <StatCard label="Chuỗi thua dài nhất" value={m.maxLossStreak} tone="loss" />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Thời gian giữ lệnh trung bình</h4>
        <p className="field-hint" style={{ marginBottom: 10 }}>Tính theo ngày entry → ngày exit (chỉ có ngày, không có giờ, nên đây là ước lượng).</p>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <StatCard label="Lệnh thắng" value={fmtDays(m.avgHoldWin)} />
          <StatCard label="Lệnh thua" value={fmtDays(m.avgHoldLoss)} />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Long / Short</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          <StatCard label="Số lệnh Long" value={m.longsCount} />
          <StatCard label="Winrate Long" value={m.longWinrate === null ? "—" : `${m.longWinrate.toFixed(1)}%`} tone={m.longWinrate >= 50 ? "win" : "loss"} />
          <StatCard label="Net Profit Long" value={fmtMoney(m.longsPnl, currency)} tone={m.longsPnl >= 0 ? "win" : "loss"} />
          <StatCard label="Số lệnh Short" value={m.shortsCount} />
          <StatCard label="Winrate Short" value={m.shortWinrate === null ? "—" : `${m.shortWinrate.toFixed(1)}%`} tone={m.shortWinrate >= 50 ? "win" : "loss"} />
          <StatCard label="Net Profit Short" value={fmtMoney(m.shortsPnl, currency)} tone={m.shortsPnl >= 0 ? "win" : "loss"} />
        </div>
      </div>
    </div>
  );
}

const DIM_CONFIG = {
  symbol: { label: "symbol", backLabel: "Tất cả symbol", allItems: (trades, resources) => Array.from(new Set([...(resources.symbols || []), ...trades.map((t) => t.symbol).filter(Boolean)])).sort() },
  setup: { label: "setup", backLabel: "Tất cả setup", allItems: (trades, resources) => Array.from(new Set([...(resources.setups || []), ...trades.map((t) => t.setup).filter(Boolean)])).sort() },
  weekday: { label: "thứ", backLabel: "Tất cả các thứ", allItems: () => WEEKDAY_ORDER.map((wd) => WEEKDAY_LABEL[wd]) },
  structure: { label: "ĐCT", backLabel: "Tất cả điểm cấu trúc", allItems: () => STRUCTURE_SCORES.map((s) => `ĐCT ${s}`) },
};

function DimensionPerformance({ trades, resources, dimension, onViewTrade }) {
  const [selected, setSelected] = useState("");
  const cfg = DIM_CONFIG[dimension];
  const allItems = useMemo(() => cfg.allItems(trades, resources), [trades, resources, dimension]);
  const closedUSD = closedOfUSD(trades, resources);
  const quickStats = useMemo(() => {
    const out = {};
    allItems.forEach((s) => { out[s] = { count: 0, pnl: 0, wins: 0, totalR: 0 }; });
    closedUSD.forEach((x) => {
      const key = keyForDim(x.t, dimension);
      if (!out[key]) out[key] = { count: 0, pnl: 0, wins: 0, totalR: 0 };
      out[key].count += 1;
      out[key].pnl += x.r.profit;
      if (x.r.outcome === "win") out[key].wins += 1;
      if (x.r.rr !== null && Number.isFinite(x.r.rr)) out[key].totalR += x.r.rr;
    });
    return out;
  }, [allItems, closedUSD, dimension]);

  if (selected) {
    const items = closedUSD.filter((x) => keyForDim(x.t, dimension) === selected);
    if (items.length === 0) {
      return (
        <div>
          <button type="button" className="btn btn-ghost" style={{ marginBottom: 14 }} onClick={() => setSelected("")}><ChevronLeft size={14} /> {cfg.backLabel}</button>
          <h3 className="block-title" style={{ marginTop: 0 }}>{selected}</h3>
          <p className="empty-note">Chưa có giao dịch nào.</p>
        </div>
      );
    }
    const sorted = [...items].sort((a, b) => dateKey(a.t).localeCompare(dateKey(b.t)));
    let cum = 0;
    const equityData = sorted.map((x) => { cum += x.r.profit; return { date: dateKey(x.t), equity: Number(cum.toFixed(2)) }; });
    const wins = items.filter((x) => x.r.outcome === "win").length;
    const losses = items.filter((x) => x.r.outcome === "loss").length;
    const be = items.filter((x) => x.r.outcome === "be").length;
    const pieData = [{ name: "Thắng", value: wins, color: WIN }, { name: "Thua", value: losses, color: LOSS }, { name: "Hòa", value: be, color: MUTED }].filter((d) => d.value > 0);
    const byMonth = groupStats(items, (t) => monthKey(dateKey(t)));
    const monthKeys = Object.keys(byMonth).sort();
    const pnlByMonth = monthKeys.map((k) => ({ month: k, pnl: Number(byMonth[k].pnl.toFixed(2)) }));
    const otherDim = dimension === "setup" ? "symbol" : "setup";
    const byOther = groupStats(items, (t) => keyForDim(t, otherDim) || "—");
    const otherEntries = Object.entries(byOther);
    const bestOther = otherEntries.length ? [...otherEntries].sort((a, b) => b[1].pnl - a[1].pnl)[0] : null;
    const worstOther = otherEntries.length ? [...otherEntries].sort((a, b) => a[1].pnl - b[1].pnl)[0] : null;
    const otherLabel = otherDim === "setup" ? "Setup" : "Symbol";

    return (
      <div>
        <button type="button" className="btn btn-ghost" style={{ marginBottom: 14 }} onClick={() => setSelected("")}><ChevronLeft size={14} /> {cfg.backLabel}</button>
        <h3 className="block-title" style={{ marginTop: 0 }}>{selected}</h3>
        <AdvancedMetrics closed={items} />
        <div className="chart-row">
          <ChartCard title="Đường cong vốn riêng" height={220}>
            <ResponsiveContainer>
              <LineChart data={equityData}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} minTickGap={30} />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} width={46} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Line type="monotone" dataKey="equity" stroke={ACCENT} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Thắng / Thua">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        <ChartCard title="Hiệu suất theo tháng" height={200}>
          <ResponsiveContainer>
            <BarChart data={pnlByMonth}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: MUTED }} />
              <YAxis tick={{ fontSize: 10, fill: MUTED }} width={46} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Bar dataKey="pnl">{pnlByMonth.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? WIN : LOSS} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        {bestOther ? (
          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)", marginTop: 18 }}>
            <StatCard label={`${otherLabel} tốt nhất: ${bestOther[0]}`} value={fmt(bestOther[1].pnl)} tone={bestOther[1].pnl >= 0 ? "win" : "loss"} />
            <StatCard label={`${otherLabel} kém nhất: ${worstOther[0]}`} value={fmt(worstOther[1].pnl)} tone={worstOther[1].pnl >= 0 ? "win" : "loss"} />
          </div>
        ) : null}
        <h4 className="rank-title" style={{ marginTop: 18 }}>Lịch sử giao dịch</h4>
        <JournalTable trades={items.map((x) => x.t)} resources={resources} onEdit={onViewTrade || (() => {})} onDelete={() => {}} />
      </div>
    );
  }

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>Bấm vào một thẻ để xem phân tích sâu.</p>
      <div className="account-card-grid account-card-grid-lg">
        {allItems.map((s) => {
          const q = quickStats[s] || { count: 0, pnl: 0, wins: 0, totalR: 0 };
          return (
            <button type="button" key={s} className="account-card" onClick={() => setSelected(s)}>
              <div className="account-card-head"><strong>{s}</strong></div>
              {q.count === 0 ? (
                <span className="empty-note">Chưa có giao dịch</span>
              ) : (
                <>
                  <div className={`account-card-balance ${q.pnl >= 0 ? "text-win" : "text-loss"}`} style={{ fontSize: 19 }}>
                    {fmtMoney(q.pnl, "USD")}
                  </div>
                  <div className="account-card-rows">
                    <div><span>Số lệnh</span><span className="mono">{q.count}</span></div>
                    <div><span>Winrate</span><span className="mono">{((q.wins / q.count) * 100).toFixed(1)}%</span></div>
                    <div><span>Kỳ vọng TB / lệnh (R)</span><span className="mono">{fmtR(q.totalR / q.count)}</span></div>
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HeatmapPage({ trades, resources }) {
  const [scope, setScope] = useState("");
  const [range, setRange] = useState("");
  const scoped = trades.filter((t) => (!scope || t.account === scope) && inRange(dateKey(t) || t.entryDate, range));
  const singleAccount = scope ? resources.accounts.find((a) => a.name === scope) : null;
  const closed = singleAccount ? closedOf(scoped) : closedOfUSD(scoped, resources);
  const scopeBar = <DashboardFilters resources={resources} account={scope} onAccount={setScope} range={range} onRange={setRange} />;

  if (closed.length === 0) {
    return (
      <div>
        {scopeBar}
        <div className="empty-state">
          <Layers size={28} color="var(--text-dim)" />
          <p>Chưa có lệnh đã đóng để vẽ bản đồ nhiệt.</p>
        </div>
      </div>
    );
  }

  const byWeekday = {};
  closed.forEach((x) => {
    const wd = weekdayIndex(dateKey(x.t));
    if (wd === null) return;
    if (!byWeekday[wd]) byWeekday[wd] = { pnl: 0, count: 0, wins: 0 };
    byWeekday[wd].pnl += x.r.profit; byWeekday[wd].count += 1;
    if (x.r.outcome === "win") byWeekday[wd].wins += 1;
  });
  const maxWeekdayAbs = Math.max(1, ...Object.values(byWeekday).map((v) => Math.abs(v.pnl)));

  const byMonth = groupStats(closed, (t) => monthKey(dateKey(t)));
  const monthKeys = Object.keys(byMonth).sort();
  const maxMonthAbs = Math.max(1, ...monthKeys.map((k) => Math.abs(byMonth[k].pnl)));

  const byYear = groupStats(closed, (t) => yearKey(dateKey(t)));
  const yearKeys = Object.keys(byYear).sort();
  const maxYearAbs = Math.max(1, ...yearKeys.map((k) => Math.abs(byYear[k].pnl)));

  return (
    <div>
      {scopeBar}
      <h3 className="block-title" style={{ marginTop: 0 }}>Theo thứ trong tuần</h3>
      <div className="heat-strip">
        {WEEKDAY_ORDER.filter((wd) => byWeekday[wd]).map((wd) => (
          <div key={wd} className="heat-cell" style={{ background: heatColor(byWeekday[wd].pnl, maxWeekdayAbs) }}>
            <span className="heat-label">{WEEKDAY_LABEL[wd]}</span>
            <span className={`heat-value ${byWeekday[wd].pnl >= 0 ? "text-win" : "text-loss"}`}>{fmt(byWeekday[wd].pnl)}</span>
            <span className="heat-sub">{byWeekday[wd].count} lệnh · {((byWeekday[wd].wins / byWeekday[wd].count) * 100).toFixed(0)}% thắng</span>
          </div>
        ))}
      </div>

      <h3 className="block-title">Theo tháng</h3>
      <div className="heat-strip">
        {monthKeys.map((k) => (
          <div key={k} className="heat-cell" style={{ background: heatColor(byMonth[k].pnl, maxMonthAbs) }}>
            <span className="heat-label">{k}</span>
            <span className={`heat-value ${byMonth[k].pnl >= 0 ? "text-win" : "text-loss"}`}>{fmt(byMonth[k].pnl)}</span>
            <span className="heat-sub">{byMonth[k].count} lệnh</span>
          </div>
        ))}
      </div>

      <h3 className="block-title">Theo năm</h3>
      <div className="heat-strip">
        {yearKeys.map((k) => (
          <div key={k} className="heat-cell" style={{ background: heatColor(byYear[k].pnl, maxYearAbs) }}>
            <span className="heat-label">{k}</span>
            <span className={`heat-value ${byYear[k].pnl >= 0 ? "text-win" : "text-loss"}`}>{fmt(byYear[k].pnl)}</span>
            <span className="heat-sub">{byYear[k].count} lệnh</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const CATEGORY_COLORS = [ACCENT, WIN, LOSS, "#4a90e2", "#9b7fe0", "#e0a15a", "#5ec8c8", "#c85ea1", "#8b93a0"];

function CategoryPie({ label, trades, fieldKey }) {
  const counts = {};
  let total = 0;
  trades.forEach((t) => { const v = t[fieldKey]; if (!v) return; counts[v] = (counts[v] || 0) + 1; total += 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const pieData = entries.map(([name, value], i) => ({ name, value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));

  return (
    <ChartCard title={label} subtitle={total ? `${total} lệnh` : undefined} height={220}>
      {total === 0 ? <p className="empty-note">Chưa có lệnh nào điền mục này.</p> : (
        <ResponsiveContainer>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={75} paddingAngle={2} label={(d) => `${((d.value / total) * 100).toFixed(0)}%`}>
              {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
function CategoryPieWithTable({ label, trades, fieldKey }) {
  const counts = {};
  let total = 0;
  trades.forEach((t) => { const v = t[fieldKey]; if (!v) return; counts[v] = (counts[v] || 0) + 1; total += 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <CategoryPie label={label} trades={trades} fieldKey={fieldKey} />
      {entries.length > 0 ? (
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="table">
            <thead><tr><th>{label}</th><th>Số lệnh</th><th>Tỷ trọng</th></tr></thead>
            <tbody>
              {entries.map(([name, count], i) => (
                <tr key={name}>
                  <td><span className="pie-swatch" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />{name}</td>
                  <td className="mono">{count}</td>
                  <td className="mono">{((count / total) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function PillarBreakdown({ title, ratings, trades, fields }) {
  const rated = ratings.filter((v) => v > 0);
  const avg = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;

  return (
    <div>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", marginBottom: 14 }}>
        <StatCard label={`${title} — Điểm trung bình`} value={avg === null ? "—" : `${avg.toFixed(1)} / 5 ★`} tone={avg >= 3.5 ? "win" : avg !== null && avg <= 2.5 ? "loss" : ""} />
      </div>
      <div className="chart-row">
        {fields.map((f) => <CategoryPieWithTable key={f.key} label={f.label} trades={trades} fieldKey={f.key} />)}
      </div>
    </div>
  );
}

function TradeAnalysisPage({ trades, resources }) {
  const [scope, setScope] = useState("");
  const [range, setRange] = useState("");
  const scoped = trades.filter((t) => (!scope || t.account === scope) && inRange(dateKey(t) || t.entryDate, range));
  const closed = closedOf(scoped);
  const closedTrades = closed.map((x) => x.t);
  const scopeBar = <DashboardFilters resources={resources} account={scope} onAccount={setScope} range={range} onRange={setRange} />;

  if (closed.length === 0) {
    return (
      <div>
        {scopeBar}
        <div className="empty-state">
          <Target size={28} color="var(--text-dim)" />
          <p>Chưa có lệnh đã đóng để phân tích chấm điểm.</p>
        </div>
      </div>
    );
  }

  const knowledgeRatings = closed.map((x) => x.t.ratingKnowledge);
  const skillRatings = closed.map((x) => x.t.ratingSkill);
  const riskRatings = closed.map((x) => x.t.ratingRisk);
  const psychRatings = closed.map((x) => x.t.ratingPsychology);
  const avgOf = (arr) => { const r = arr.filter((v) => v > 0); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null; };
  const scored = closed.filter((x) => avgPillarScore(x.t) !== null);
  const avgOverall = scored.length ? scored.reduce((s, x) => s + avgPillarScore(x.t), 0) / scored.length : null;

  const byGrade = {}; GRADE_OPTIONS.forEach((g) => (byGrade[g.id] = 0));
  closed.forEach((x) => { if (x.t.tradeGrade && byGrade[x.t.tradeGrade] !== undefined) byGrade[x.t.tradeGrade] += 1; });
  const gradedTotal = GRADE_OPTIONS.reduce((s, g) => s + byGrade[g.id], 0);
  const gradePie = GRADE_OPTIONS.map((g) => ({ name: g.label, value: byGrade[g.id], color: g.tone === "win" ? WIN : LOSS })).filter((d) => d.value > 0);

  return (
    <div>
      {scopeBar}
      <h3 className="block-title" style={{ marginTop: 0 }}>Module 1 — Tổng quan 4 trụ cột</h3>
      <div className="stat-grid">
        <StatCard label="Kiến thức" value={avgOf(knowledgeRatings) === null ? "—" : `${avgOf(knowledgeRatings).toFixed(1)} / 5 ★`} />
        <StatCard label="Kỹ năng" value={avgOf(skillRatings) === null ? "—" : `${avgOf(skillRatings).toFixed(1)} / 5 ★`} />
        <StatCard label="Quản trị vốn" value={avgOf(riskRatings) === null ? "—" : `${avgOf(riskRatings).toFixed(1)} / 5 ★`} />
        <StatCard label="Tâm lý" value={avgOf(psychRatings) === null ? "—" : `${avgOf(psychRatings).toFixed(1)} / 5 ★`} />
        <StatCard label="Điểm sao trung bình" value={avgOverall === null ? "—" : `${avgOverall.toFixed(1)} / 5 ★`} tone={avgOverall >= 3.5 ? "win" : avgOverall !== null && avgOverall <= 2.5 ? "loss" : ""} />
      </div>

      <h3 className="block-title">Module 2 — Kiến thức</h3>
      <PillarBreakdown title="Kiến thức" ratings={knowledgeRatings} trades={closedTrades}
        fields={[{ key: "setup", label: "Setup" }, { key: "setupNote", label: "Nhận xét Setup" }]} />

      <h3 className="block-title">Module 3 — Kỹ năng</h3>
      <PillarBreakdown title="Kỹ năng" ratings={skillRatings} trades={closedTrades}
        fields={[{ key: "entrySkill", label: "Vào lệnh" }, { key: "inTradeSkill", label: "Trong lệnh" }, { key: "exitSkill", label: "Thoát lệnh" }]} />

      <h3 className="block-title">Module 4 — Quản trị vốn</h3>
      <PillarBreakdown title="Quản trị vốn" ratings={riskRatings} trades={closedTrades}
        fields={[{ key: "riskAction", label: "Quản trị vốn" }]} />

      <h3 className="block-title">Module 5 — Tâm lý</h3>
      <PillarBreakdown title="Tâm lý" ratings={psychRatings} trades={closedTrades}
        fields={[{ key: "psychology", label: "Tâm lý" }]} />

      <h3 className="block-title">Module 6 — Tỷ trọng đánh giá giao dịch</h3>
      {gradedTotal === 0 ? <p className="empty-note">Chưa có lệnh nào được đánh giá ở mục "Đánh giá giao dịch".</p> : (
        <div className="chart-row">
          <ChartCard title="Đánh giá giao dịch" subtitle={`${gradedTotal} lệnh đã đánh giá`} height={220}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={gradePie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2} label={(d) => `${((d.value / gradedTotal) * 100).toFixed(0)}%`}>
                  {gradePie.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
          <div className="grade-grid" style={{ alignSelf: "center" }}>
            {GRADE_OPTIONS.map((g) => (
              <div key={g.id} className={`grade-stat ${g.tone}`}>
                <span>{g.tone === "win" ? "\ud83d\udc4d" : "\u2620\ufe0f"} {g.label}</span>
                <strong>{byGrade[g.id]} <span style={{ fontSize: 11, color: "var(--text-dim)" }}>({gradedTotal ? ((byGrade[g.id] / gradedTotal) * 100).toFixed(0) : 0}%)</span></strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Analysis({ trades, resources, onViewTrade }) {
  const [tab, setTab] = useState("topbottom");
  const [scope, setScope] = useState("");
  const [range, setRange] = useState("");
  const scoped = trades.filter((t) => (!scope || t.account === scope) && inRange(dateKey(t) || t.entryDate, range));
  const singleAccount = scope ? resources.accounts.find((a) => a.name === scope) : null;
  const closed = singleAccount ? closedOf(scoped) : closedOfUSD(scoped, resources);
  const scopeBar = <DashboardFilters resources={resources} account={scope} onAccount={setScope} range={range} onRange={setRange} />;
  if (closed.length === 0) {
    return (
      <div>
        {scopeBar}
        <div className="empty-state">
          <LineChartIcon size={28} color="var(--text-dim)" />
          <p>Chưa có lệnh đã đóng để phân tích.</p>
        </div>
      </div>
    );
  }
  const insights = buildInsights(closed);
  return (
    <div>
      {scopeBar}
      <p className="field-hint" style={{ marginBottom: 12 }}>
        {singleAccount ? `Số liệu hiển thị theo đơn vị tiền tệ của tài khoản "${singleAccount.name}": ${singleAccount.currency}.` : "Đang gộp nhiều tài khoản — số tiền được quy đổi về USD theo tỷ giá cấu hình ở Tài khoản."}
      </p>
      <div className="insight-box">
        <span className="insight-title">🤖 Phân tích tự động</span>
        <ul className="insight-list">{insights.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </div>
      <div className="subtabs">
        <button className={`subtab ${tab === "topbottom" ? "subtab-active" : ""}`} onClick={() => setTab("topbottom")}>Top / Cuối bảng</button>
        <button className={`subtab ${tab === "rdist" ? "subtab-active" : ""}`} onClick={() => setTab("rdist")}>Phân bố R-multiple</button>
        <button className={`subtab ${tab === "metrics" ? "subtab-active" : ""}`} onClick={() => setTab("metrics")}>Chỉ số nâng cao</button>
      </div>
      {tab === "topbottom" ? <TopBottom closed={closed} /> :
        tab === "rdist" ? <RDistribution closed={closed} resources={resources} onViewTrade={onViewTrade} /> :
        <AdvancedMetrics closed={closed} />}
    </div>
  );
}

function NotesSection({ notes, onChange }) {
  const [form, setForm] = useState(emptyNote());
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const save = () => {
    if (!form.content.trim()) return;
    const exists = notes.some((n) => n.id === form.id);
    onChange(exists ? notes.map((n) => (n.id === form.id ? form : n)) : [...notes, form]);
    setForm(emptyNote());
  };
  const remove = (id) => { onChange(notes.filter((n) => n.id !== id)); if (form.id === id) setForm(emptyNote()); };
  const sorted = [...notes].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>Kế hoạch giao dịch · đánh giá tuần/tháng · bài học · sai lầm · mục tiêu.</p>
      <div className="account-form">
        <div className="grid-2">
          <Field label="Ngày"><input type="date" className="input" value={form.date} onChange={(e) => setF("date")(e.target.value)} /></Field>
          <Field label="Loại"><ResourceSelect value={form.type} onChange={setF("type")} options={NOTE_TYPES} placeholder="Chọn loại" /></Field>
        </div>
        <Field label="Nội dung"><textarea className="input textarea" style={{ minHeight: 100 }} value={form.content} onChange={(e) => setF("content")(e.target.value)} placeholder="Nội dung ghi chú..." /></Field>
        <div className="form-actions" style={{ marginTop: 4 }}>
          {form.id ? <button type="button" className="btn btn-ghost" onClick={() => setForm(emptyNote())}>Hủy sửa</button> : null}
          <button type="button" className="btn btn-primary" onClick={save}>{form.id ? "Cập nhật ghi chú" : "Lưu ghi chú"}</button>
        </div>
      </div>
      <div className="resource-list" style={{ marginTop: 16 }}>
        {sorted.length === 0 ? <p className="empty-note">Chưa có ghi chú nào.</p> : null}
        {sorted.map((n) => (
          <div key={n.id} className="note-card" onClick={() => setForm(n)}>
            <div className="note-head">
              <span className="note-type">{n.type}</span>
              <span className="mono" style={{ color: "var(--text-dim)", fontSize: 11.5 }}>{n.date || "—"}</span>
              <span onClick={(e) => e.stopPropagation()}><ConfirmButton onConfirm={() => remove(n.id)} /></span>
            </div>
            <p className="note-content">{n.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MissedSetupsSection({ items, resources, onChange }) {
  const [form, setForm] = useState(emptyMissed());
  const [error, setError] = useState("");
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const save = () => {
    if (!form.symbol.trim()) { setError("Nhập symbol trước đã."); return; }
    setError("");
    const payload = { ...form, id: form.id || uid() };
    const exists = items.some((n) => n.id === payload.id);
    onChange(exists ? items.map((n) => (n.id === payload.id ? payload : n)) : [...items, payload]);
    setForm(emptyMissed());
  };
  const remove = (id) => { onChange(items.filter((n) => n.id !== id)); if (form.id === id) setForm(emptyMissed()); };
  const sorted = [...items].sort((a, b) => (b.missDate || "").localeCompare(a.missDate || ""));

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>Ghi lại những setup bạn nhận ra nhưng không vào lệnh — để sau này xem lại có nên tối ưu quy trình không.</p>
      <div className="account-form">
        <div className="grid-3">
          <Field label="Symbol">
            <input className="input" list="symbol-suggestions-miss" value={form.symbol} onChange={(e) => setF("symbol")(e.target.value.toUpperCase())} placeholder="VD: XAUUSD, HPG..." />
            <datalist id="symbol-suggestions-miss">{resources.symbols.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="Ngày miss">
            <input type="date" className="input" value={form.missDate} onChange={(e) => setF("missDate")(e.target.value)} />
          </Field>
          <Field label="Khung thời gian">
            <ResourceSelect value={form.timeframe} onChange={setF("timeframe")} options={resources.timeframes} placeholder="Chọn timeframe" />
          </Field>
        </div>
        <Field label="Link / hình ảnh TradingView">
          <ImageOrLink link={form.link} image={form.image} onLinkChange={setF("link")} onImageChange={setF("image")} label="miss" />
        </Field>
        <Field label="Lý do miss">
          <ResourceSelect value={form.reason} onChange={setF("reason")} options={resources.missReasons} placeholder="Chọn lý do" />
        </Field>
        <Field label="Bonus — ghi chú thêm">
          <textarea className="input textarea" value={form.note} onChange={(e) => setF("note")(e.target.value)} placeholder="Điền tay nội dung khác (tùy chọn)..." />
        </Field>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="form-actions" style={{ marginTop: 4 }}>
          {form.id ? <button type="button" className="btn btn-ghost" onClick={() => setForm(emptyMissed())}>Hủy sửa</button> : null}
          <button type="button" className="btn btn-primary" onClick={save}>{form.id ? "Cập nhật" : "Lưu setup bị miss"}</button>
        </div>
      </div>
      <div className="table-wrap" style={{ marginTop: 16 }}>
        {sorted.length === 0 ? <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có setup bị miss nào được ghi lại.</p> : (
          <table className="table">
            <thead>
              <tr><th>Ngày</th><th>Symbol</th><th>Ảnh</th><th>TF</th><th>Lý do</th><th>Bonus</th><th></th></tr>
            </thead>
            <tbody>
              {sorted.map((n) => (
                <tr key={n.id} onClick={() => setForm(n)}>
                  <td className="mono">{n.missDate || "—"}</td>
                  <td style={{ fontWeight: 600 }}>{n.symbol}</td>
                  <td onClick={(e) => e.stopPropagation()}><CellImagePreview image={n.image} link={n.link} /></td>
                  <td className="mono">{n.timeframe || "—"}</td>
                  <td>{n.reason || "—"}</td>
                  <td style={{ maxWidth: 220, whiteSpace: "normal", color: "var(--text-dim)", fontSize: 12.5 }}>{n.note || "—"}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 2 }}>
                      <button type="button" className="row-btn" onClick={() => setForm(n)}><Pencil size={13} /></button>
                      <ConfirmButton onConfirm={() => remove(n.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SetupLibrarySection({ items, onChange }) {
  const [form, setForm] = useState(emptySetupDef());
  const [error, setError] = useState("");
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const save = () => {
    if (!form.name.trim()) { setError("Nhập tên setup."); return; }
    setError("");
    if (form.id) onChange(items.map((it) => (it.id === form.id ? form : it)));
    else onChange([...items, { ...form, id: uid() }]);
    setForm(emptySetupDef());
  };
  const remove = (id) => { onChange(items.filter((it) => it.id !== id)); if (form.id === id) setForm(emptySetupDef()); };
  const handleImg = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) { setError("Ảnh quá lớn (>1.5MB)."); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => setF("image")(reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>Thư viện setup mẫu kèm ảnh minh họa để tra cứu nhanh khi vào lệnh.</p>
      <div className="account-form">
        <div className="grid-2">
          <Field label="Tên Setup"><input className="input" value={form.name} onChange={(e) => setF("name")(e.target.value)} placeholder="VD: RB - Range Breakout" /></Field>
          <Field label="Ảnh minh họa">
            <label className="upload-btn"><ImagePlus size={14} /><span>{form.image ? "Đổi ảnh" : "Tải ảnh lên"}</span>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleImg} /></label>
          </Field>
        </div>
        <Field label="Ghi chú"><textarea className="input textarea" value={form.note} onChange={(e) => setF("note")(e.target.value)} placeholder="Điều kiện, quy tắc nhận diện setup..." /></Field>
        {form.image ? (
          <div className="thumb-wrap" style={{ marginBottom: 10 }}>
            <img src={form.image} alt="setup" className="thumb" style={{ width: 60, height: 60 }} onClick={() => window.open(form.image, "_blank")} />
            <button type="button" className="thumb-x" onClick={() => setF("image")("")}><X size={12} /></button>
          </div>
        ) : null}
        {error ? <p className="error-text">{error}</p> : null}
        <div className="form-actions" style={{ marginTop: 4 }}>
          {form.id ? <button type="button" className="btn btn-ghost" onClick={() => setForm(emptySetupDef())}>Hủy sửa</button> : null}
          <button type="button" className="btn btn-primary" onClick={save}>{form.id ? "Cập nhật Setup" : "Thêm Setup"}</button>
        </div>
      </div>
      <div className="setup-grid">
        {items.length === 0 ? <p className="empty-note">Chưa có setup mẫu nào.</p> : null}
        {items.map((it) => (
          <div key={it.id} className="setup-card" onClick={() => { setForm(it); setError(""); }}>
            {it.image ? <img src={it.image} alt={it.name} className="setup-img" /> : <div className="setup-img setup-img-empty"><Layers size={20} color="var(--text-dim)" /></div>}
            <div className="setup-card-body">
              <strong>{it.name}</strong>
              {it.note ? <p className="setup-note">{it.note}</p> : null}
            </div>
            <span onClick={(e) => e.stopPropagation()} className="setup-card-actions">
              <button type="button" className="row-btn" onClick={() => { setForm(it); setError(""); }}><Pencil size={13} /></button>
              <ConfirmButton onConfirm={() => remove(it.id)} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsSection({ trades, resources, ledger, notes, setupLibrary, missedSetups, capitalAccounts, capitalEntries, uiSettings, onUiSettingsChange, onImportAll, onReset }) {
  const [msg, setMsg] = useState("");

  const doExport = () => {
    const payload = { trades, resources, ledger, notes, setupLibrary, uiSettings, missedSetups, capitalAccounts, capitalEntries, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `nhat-ky-giao-dich-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setMsg("Đã xuất file JSON.");
  };

  const doImport = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        onImportAll(data);
        setMsg("Đã nhập dữ liệu thành công.");
      } catch (err) {
        setMsg("File không hợp lệ, không đọc được.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div>
      <h3 className="block-title" style={{ marginTop: 0 }}>Giao diện</h3>
      <div className="account-form">
        <Field label="Theme">
          <div className="seg" style={{ maxWidth: 200 }}>
            <button type="button" className={`seg-btn ${uiSettings.mode === "dark" ? "seg-active" : ""}`} onClick={() => onUiSettingsChange({ ...uiSettings, mode: "dark" })}>Tối</button>
            <button type="button" className={`seg-btn ${uiSettings.mode === "light" ? "seg-active" : ""}`} onClick={() => onUiSettingsChange({ ...uiSettings, mode: "light" })}>Sáng</button>
          </div>
        </Field>
        <Field label="Màu chủ đạo">
          <div style={{ display: "flex", gap: 10 }}>
            {Object.entries(ACCENT_PRESETS).map(([key, hex]) => (
              <button type="button" key={key} onClick={() => onUiSettingsChange({ ...uiSettings, accent: key })}
                aria-label={key}
                style={{
                  width: 28, height: 28, borderRadius: "50%", background: hex, cursor: "pointer",
                  border: uiSettings.accent === key ? "2px solid var(--text)" : "2px solid transparent",
                  boxShadow: uiSettings.accent === key ? `0 0 0 2px ${hex}55` : "none",
                }} />
            ))}
          </div>
        </Field>
      </div>

      <h3 className="block-title">Nhập / Xuất dữ liệu</h3>
      <p className="field-hint" style={{ marginBottom: 12 }}>Toàn bộ giao dịch, tài nguyên, sổ vốn, ghi chú và thư viện setup được gộp vào một file JSON để sao lưu hoặc chuyển sang máy khác.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <button type="button" className="btn btn-primary" onClick={doExport}><Download size={14} /> Xuất JSON</button>
        <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
          <Upload size={14} /> Nhập JSON
          <input type="file" accept="application/json" style={{ display: "none" }} onChange={doImport} />
        </label>
      </div>
      {msg ? <p className="field-hint" style={{ color: "var(--accent)" }}>{msg}</p> : null}

      <h3 className="block-title">Vùng nguy hiểm</h3>
      <p className="field-hint" style={{ marginBottom: 12 }}>Xóa toàn bộ giao dịch, tài nguyên, sổ vốn, ghi chú và setup mẫu. Không thể hoàn tác.</p>
      <DangerConfirmButton label="Xóa toàn bộ dữ liệu" confirmLabel="Bấm lần nữa để xác nhận xóa hết" onConfirm={onReset} />

      <h3 className="block-title">Dung lượng hiện tại</h3>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <StatCard label="Giao dịch" value={trades.length} />
        <StatCard label="Tài khoản" value={resources.accounts.length} />
        <StatCard label="Ghi chú" value={notes.length} />
        <StatCard label="Setup mẫu" value={setupLibrary.length} />
      </div>
    </div>
  );
}

function AppShell({ onSignOut, userEmail }) {
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState([]);
  const [resources, setResources] = useState(DEFAULT_RESOURCES);
  const [ledger, setLedger] = useState([]);
  const [notes, setNotes] = useState([]);
  const [setupLibrary, setSetupLibrary] = useState([]);
  const [missedSetups, setMissedSetups] = useState([]);
  const [capitalAccounts, setCapitalAccounts] = useState([]);
  const [capitalEntries, setCapitalEntries] = useState([]);
  const [uiSettings, setUiSettings] = useState(DEFAULT_UI_SETTINGS);
  const [view, setView] = useState("dashboard");
  const [activeAccount, setActiveAccount] = useState("");
  const [viewingTrade, setViewingTrade] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saveState, setSaveState] = useState("");

  useEffect(() => {
    (async () => {
      const [ts, rs, lg, nt, sl, us, ms, ca, ce] = await Promise.all([
        safeGet("trades", []),
        safeGet("resources", DEFAULT_RESOURCES),
        safeGet("ledger", []),
        safeGet("notes", []),
        safeGet("setupLibrary", []),
        safeGet("uiSettings", DEFAULT_UI_SETTINGS),
        safeGet("missedSetups", []),
        safeGet("capitalAccounts", []),
        safeGet("capitalEntries", []),
      ]);
      setTrades(ts);
      setResources(normalizeResources(rs));
      setLedger(lg);
      setNotes(nt);
      setSetupLibrary(sl);
      setUiSettings({ ...DEFAULT_UI_SETTINGS, ...us });
      setMissedSetups(ms);
      setCapitalAccounts(ca);
      setCapitalEntries(ce);
      setLoading(false);
    })();
  }, []);

  const flashSaved = () => { setSaveState("Đã lưu"); setTimeout(() => setSaveState(""), 1200); };

  const persistTrades = useCallback(async (next) => { setTrades(next); await safeSet("trades", next); flashSaved(); }, []);
  const persistResources = useCallback(async (next) => { setResources(next); await safeSet("resources", next); flashSaved(); }, []);
  const persistLedger = useCallback(async (next) => { setLedger(next); await safeSet("ledger", next); flashSaved(); }, []);
  const persistNotes = useCallback(async (next) => { setNotes(next); await safeSet("notes", next); flashSaved(); }, []);
  const persistSetupLibrary = useCallback(async (next) => { setSetupLibrary(next); await safeSet("setupLibrary", next); flashSaved(); }, []);
  const persistUiSettings = useCallback(async (next) => { setUiSettings(next); await safeSet("uiSettings", next); }, []);
  const persistMissedSetups = useCallback(async (next) => { setMissedSetups(next); await safeSet("missedSetups", next); flashSaved(); }, []);
  const persistCapitalAccounts = useCallback(async (next) => { setCapitalAccounts(next); await safeSet("capitalAccounts", next); flashSaved(); }, []);
  const persistCapitalEntries = useCallback(async (next) => { setCapitalEntries(next); await safeSet("capitalEntries", next); flashSaved(); }, []);

  const handleSaveTrade = (t) => {
    const exists = trades.some((x) => x.id === t.id);
    const next = exists ? trades.map((x) => (x.id === t.id ? t : x)) : [...trades, t];
    persistTrades(next);
    setEditing(null);
    setView("journal");
  };
  const handleDelete = (id) => persistTrades(trades.filter((t) => t.id !== id));
  const startNew = () => {
    const t = emptyTrade();
    if (activeAccount) t.account = activeAccount;
    setEditing(t);
    setView("form");
  };
  const openEditForm = (t) => { setEditing(t); setView("form"); };
  const startEdit = (t) => { setViewingTrade(t); };

  const handleImportAll = (data) => {
    if (data.trades) persistTrades(data.trades);
    if (data.resources) persistResources(normalizeResources(data.resources));
    if (data.ledger) persistLedger(data.ledger);
    if (data.notes) persistNotes(data.notes);
    if (data.setupLibrary) persistSetupLibrary(data.setupLibrary);
    if (data.uiSettings) persistUiSettings({ ...DEFAULT_UI_SETTINGS, ...data.uiSettings });
    if (data.missedSetups) persistMissedSetups(data.missedSetups);
    if (data.capitalAccounts) persistCapitalAccounts(data.capitalAccounts);
    if (data.capitalEntries) persistCapitalEntries(data.capitalEntries);
  };
  const handleResetAll = () => {
    persistTrades([]);
    persistResources(DEFAULT_RESOURCES);
    persistLedger([]);
    persistNotes([]);
    persistSetupLibrary([]);
    persistMissedSetups([]);
    persistCapitalAccounts([]);
    persistCapitalEntries([]);
    setView("dashboard");
  };

  const navGroups = [
    {
      label: "Theo dõi", items: [
        { key: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
        { key: "journal", label: "Nhật ký", icon: BookOpen },
        { key: "equityindex", label: "Đường cong vốn", icon: TrendingUp },
        { key: "capitaltracker", label: "Vốn thực tế (thủ công)", icon: PiggyBank },
        { key: "missed", label: "Setup bị miss", icon: EyeOff },
      ]
    },
    {
      label: "Phân tích", items: [
        { key: "analysis", label: "Phân tích", icon: LineChartIcon },
        { key: "tradeanalysis", label: "Phân tích lệnh", icon: Target },
        { key: "symbolperf", label: "Hiệu suất Symbol", icon: Hash },
        { key: "setupperf", label: "Hiệu suất Setup", icon: Star },
        { key: "structureperf", label: "Phân tích ĐCT", icon: Ruler },
        { key: "weekdayperf", label: "Hiệu suất Thứ", icon: CalendarDays },
        { key: "heatmap", label: "Bản đồ nhiệt", icon: Grid3x3 },
      ]
    },
    {
      label: "Quản lý", items: [
        { key: "accounts", label: "Tài khoản", icon: Wallet },
        { key: "setuplib", label: "Setup mẫu", icon: Layers },
        { key: "notes", label: "Ghi chú", icon: StickyNote },
        { key: "resources", label: "Tài nguyên", icon: Database },
      ]
    },
    { label: "Hệ thống", items: [{ key: "settings", label: "Cài đặt", icon: Settings }] },
  ];
  const nav = navGroups.flatMap((g) => g.items);

  const openRiskBadges = resources.accounts
    .map((a) => ({ account: a, risk: accountOpenRisk(a, ledger, trades) }))
    .filter((x) => x.risk.count > 0);

  const palette = THEME_PRESETS[uiSettings.mode] || THEME_PRESETS.dark;
  const accentHex = ACCENT_PRESETS[uiSettings.accent] || ACCENT_PRESETS.gold;
  const cssVars = {
    "--bg": palette.bg, "--surface": palette.surface, "--surface-2": palette.surface2, "--border": palette.border,
    "--text": palette.text, "--text-dim": palette.textDim, "--win": palette.win, "--loss": palette.loss,
    "--accent": accentHex, "--accent-2": accentHex,
  };

  return (
    <div className="app" style={cssVars}>
      <style>{`
        ${FONT_IMPORT}
        .app { --bg:#0a0b0d; --surface:#131519; --surface-2:#191c21; --border:#252930;
          --text:#eae7e0; --text-dim:#8d9198; --accent:#d4a24e; --accent-2:#c98f38;
          --win:#4caf7d; --loss:#e0615a;
          background:var(--bg); color:var(--text); font-family:'IBM Plex Sans',sans-serif;
          overflow:hidden; height:100%; min-height:600px; display:flex; flex-direction:column;
          -webkit-font-smoothing:antialiased; letter-spacing:0.1px; }
        .app * { box-sizing:border-box; }
        .app h1,.app h2,.app h3,.app h4 { font-family:'Space Grotesk',sans-serif; margin:0; letter-spacing:-0.2px; }
        .mono { font-family:'IBM Plex Mono',monospace; }
        .app-shell { display:flex; flex:1; min-height:0; }
        .sidebar { width:224px; flex-shrink:0; border-right:1px solid var(--border); display:flex; flex-direction:column; gap:20px; padding:20px 14px; overflow-y:auto; }
        .brand { display:flex; align-items:center; gap:10px; padding:0 8px; }
        .brand-text { display:flex; flex-direction:column; }
        .brand-name { font-size:16.5px; font-weight:700; letter-spacing:0.1px; }
        .brand-tag { font-size:10px; color:var(--text-dim); letter-spacing:0.6px; text-transform:uppercase; margin-top:3px; line-height:1.4; }
        .brand-mark { display:flex; align-items:flex-end; gap:3px; width:26px; height:20px; flex-shrink:0; overflow:hidden; }
        .candle { display:block; width:6px; height:12px; border-radius:1.5px; background:currentColor; flex-shrink:0; }
        .candle-up { color:var(--win); }
        .candle-down { color:var(--loss); }
        .candle-tall { height:18px; }
        .candle-short { height:8px; }
        .save-indicator { font-size:12px; color:var(--accent); font-family:'IBM Plex Mono',monospace; opacity:${saveState ? 1 : 0}; transition:opacity .3s; }
        .nav { display:flex; flex-direction:column; gap:14px; flex:1; overflow-y:auto; }
        .nav-group { display:flex; flex-direction:column; gap:2px; }
        .nav-group-label { font-size:9.5px; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.8px;
          padding:0 12px 4px; opacity:0.65; }
        .nav-btn { display:flex; align-items:center; gap:9px; padding:9px 12px; border-radius:8px; border:1px solid transparent;
          background:none; color:var(--text-dim); font-size:13.5px; font-weight:500; cursor:pointer; white-space:nowrap; width:100%; text-align:left; }
        .nav-btn:hover { background:var(--surface-2); color:var(--text); }
        .nav-btn.nav-active { background:var(--surface-2); color:var(--accent); border-color:var(--border); }
        .main { flex:1; min-width:0; display:flex; flex-direction:column; min-height:0; }
        .topbar { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:14px 24px; border-bottom:1px solid var(--border); flex-wrap:wrap; }
        .open-risk-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; flex:1; min-width:0; }
        .open-risk-badge { display:flex; align-items:center; gap:6px; font-size:11.5px; font-weight:600; padding:5px 10px; border-radius:20px;
          background:rgba(212,162,78,0.1); color:var(--accent); border:1px solid rgba(212,162,78,0.3); white-space:nowrap; }
        .open-risk-high { background:rgba(224,97,90,0.14); color:var(--loss); border-color:rgba(224,97,90,0.35); }
        .open-risk-hint { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-dim); background:var(--surface-2);
          border:1px solid var(--border); border-radius:8px; padding:9px 12px; margin-bottom:14px; }
        .open-risk-hint-high { color:var(--loss); border-color:rgba(224,97,90,0.35); background:rgba(224,97,90,0.08); }
        .body { padding:22px 24px 32px; flex:1; overflow-y:auto; min-height:0; }
        .account-quickswitch { display:flex; align-items:center; gap:6px; padding:0 4px; }
        .account-quickswitch .input { padding:8px 10px; font-size:13px; }
        .quickadd-btn { flex-shrink:0; width:34px; height:34px; border-radius:8px; border:1px solid var(--border); background:var(--surface-2);
          color:var(--accent); display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .quickadd-btn:hover { border-color:var(--accent); }
        .field { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
        .field-label { font-size:12.5px; color:var(--text-dim); font-weight:500; }
        .req { color:var(--accent); margin-left:3px; }
        .field-hint { font-size:11.5px; color:var(--text-dim); opacity:0.8; }
        .error-text { font-size:12px; color:var(--loss); margin:2px 0 0; }
        .form-error { margin-bottom:10px; padding:10px 12px; background:rgba(224,97,90,0.1); border:1px solid rgba(224,97,90,0.3); border-radius:8px; }
        .input { background:var(--surface-2); border:1px solid var(--border); color:var(--text);
          padding:9px 11px; border-radius:8px; font-size:13.5px; font-family:inherit; width:100%; }
        .input:focus { outline:none; border-color:var(--accent); }
        .input-inline { border:none; background:none; padding:4px 0; }
        .textarea { min-height:64px; resize:vertical; }
        .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        .grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; }
        .section { border:1px solid var(--border); border-radius:12px; margin-bottom:14px; background:var(--surface); overflow:hidden; }
        .section-head { width:100%; display:flex; align-items:center; gap:12px; padding:13px 16px; background:none; border:none; cursor:pointer; text-align:left; }
        .section-num { font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--bg); background:var(--accent);
          width:26px; height:26px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-weight:600; flex-shrink:0; }
        .section-titles { flex:1; display:flex; flex-direction:column; }
        .section-title { font-size:14.5px; font-weight:600; }
        .section-sub { font-size:11.5px; color:var(--text-dim); margin-top:1px; }
        .section-body { padding:4px 16px 16px; border-top:1px solid var(--border); }
        .seg { display:flex; gap:2px; background:var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:3px; flex-wrap:wrap; }
        .seg-btn { flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:7px 10px; border-radius:6px;
          border:none; background:none; color:var(--text-dim); font-size:12.5px; font-weight:500; cursor:pointer; white-space:nowrap; }
        .seg-active-win { background:rgba(76,175,125,0.15); color:var(--win); }
        .seg-active-loss { background:rgba(224,97,90,0.15); color:var(--loss); }
        .seg-active { background:var(--surface); color:var(--accent); }
        .rr-readout { font-family:'IBM Plex Mono',monospace; font-size:16px; font-weight:600; padding:8px 0; }
        .rr-win { color:var(--win); } .rr-loss { color:var(--loss); }
        .outcome-pill { display:inline-block; padding:5px 12px; border-radius:20px; font-size:11.5px; font-weight:600; letter-spacing:0.5px; margin-top:6px; }
        .outcome-pill.win { background:rgba(76,175,125,0.15); color:var(--win); }
        .outcome-pill.loss { background:rgba(224,97,90,0.15); color:var(--loss); }
        .outcome-pill.be { background:var(--surface-2); color:var(--text-dim); }
        .imglink { display:flex; flex-direction:column; gap:8px; }
        .imglink-row { display:flex; align-items:center; gap:8px; background:var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:8px 10px; }
        .link-preview-anchor { position:relative; display:flex; align-items:center; cursor:pointer; flex-shrink:0; }
        .link-preview-popup { position:absolute; right:0; top:calc(100% + 8px); z-index:20; background:var(--surface); border:1px solid var(--border);
          border-radius:10px; padding:6px; box-shadow:0 8px 24px rgba(0,0,0,0.5); }
        .link-preview-popup img { display:block; max-width:280px; max-height:280px; border-radius:6px; object-fit:contain; }
        .link-preview-fallback { max-width:220px; font-size:11.5px; color:var(--text-dim); margin:0; padding:4px; }
        .upload-btn { display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--text-dim); cursor:pointer; }
        .thumb-wrap { position:relative; margin-left:4px; }
        .thumb { width:36px; height:36px; object-fit:cover; border-radius:6px; cursor:pointer; border:1px solid var(--border); }
        .thumb-mini { width:22px; height:22px; object-fit:cover; border-radius:4px; cursor:pointer; border:1px solid var(--border); }
        .thumb-x { position:absolute; top:-6px; right:-6px; background:var(--loss); border:none; border-radius:50%;
          width:16px; height:16px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#fff; }
        .grade-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px; }
        .grade-btn { padding:11px 14px; border-radius:9px; border:1px solid var(--border); background:var(--surface-2);
          color:var(--text-dim); font-size:12.5px; font-weight:500; text-align:left; cursor:pointer; }
        .grade-btn.grade-active.win { border-color:var(--win); color:var(--win); background:rgba(76,175,125,0.1); }
        .grade-btn.grade-active.loss { border-color:var(--loss); color:var(--loss); background:rgba(224,97,90,0.1); }
        .grade-btn.grade-disabled { opacity:0.35; cursor:not-allowed; }
        .grade-stat { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-radius:9px; border:1px solid var(--border); background:var(--surface); font-size:13px; }
        .grade-stat strong { font-family:'IBM Plex Mono',monospace; font-size:16px; }
        .grade-stat.win strong { color:var(--win); } .grade-stat.loss strong { color:var(--loss); }
        .grade-tag { font-size:14px; }
        .checklist-progress { font-size:12px; color:var(--text-dim); padding:2px 7px; border-radius:10px; background:var(--surface-2); border:1px solid var(--border); }
        .checklist-progress-full { color:var(--win); border-color:rgba(76,175,125,0.4); background:rgba(76,175,125,0.1); }
        .checklist-progress-empty { color:var(--loss); border-color:rgba(224,97,90,0.35); background:rgba(224,97,90,0.08); }
        .form-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; flex-wrap:wrap; }
        .btn { display:flex; align-items:center; gap:7px; padding:9px 18px; border-radius:8px; font-size:13.5px; font-weight:600;
          cursor:pointer; border:1px solid var(--border); background:var(--surface-2); color:var(--text); }
        .btn-primary { background:linear-gradient(180deg, color-mix(in srgb, var(--accent) 100%, white 8%), var(--accent)); border-color:var(--accent); color:#1a1206; font-weight:700; box-shadow:0 1px 0 rgba(255,255,255,0.15) inset, 0 2px 6px rgba(0,0,0,0.25); }
        .btn-ghost { background:none; }
        .btn-danger { background:var(--loss); border-color:var(--loss); color:#fff; }
        .toolbar { display:flex; gap:12px; align-items:center; margin-bottom:14px; flex-wrap:wrap; }
        .search-box { display:flex; align-items:center; gap:8px; background:var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:6px 12px; min-width:200px; }
        .table-wrap { overflow-x:auto; border:1px solid var(--border); border-radius:10px; }
        .table { width:100%; border-collapse:collapse; font-size:13px; }
        .table th { text-align:left; padding:10px 12px; background:var(--surface-2); color:var(--text-dim); font-weight:600;
          font-size:10.5px; text-transform:uppercase; letter-spacing:0.6px; border-bottom:1px solid var(--border); white-space:nowrap;
          font-family:'IBM Plex Mono',monospace; }
        .table-wrap { position:relative; }
        .table-wrap::after { content:""; position:absolute; left:0; right:0; top:39px; height:2px; background:linear-gradient(90deg, var(--accent), transparent 40%); opacity:0.4; pointer-events:none; }
        .table td { padding:10px 12px; border-bottom:1px solid var(--border); white-space:nowrap; }
        .table tbody tr { cursor:pointer; }
        .table tbody tr:hover { background:var(--surface-2); }
        .table tbody tr:last-child td { border-bottom:none; }
        .text-win { color:var(--win); } .text-loss { color:var(--loss); }
        .dir-pill { padding:3px 9px; border-radius:6px; font-size:11.5px; font-weight:600; }
        .dir-pill.buy { background:rgba(76,175,125,0.15); color:var(--win); }
        .dir-pill.sell { background:rgba(224,97,90,0.15); color:var(--loss); }
        .status-pill { padding:3px 9px; border-radius:6px; font-size:11.5px; font-weight:600; }
        .status-pill.open { background:rgba(212,162,78,0.15); color:var(--accent); }
        .status-pill.win { background:rgba(76,175,125,0.15); color:var(--win); }
        .status-pill.loss { background:rgba(224,97,90,0.15); color:var(--loss); }
        .status-pill.be { background:var(--surface-2); color:var(--text-dim); }
        .row-btn { background:none; border:none; color:var(--text-dim); cursor:pointer; padding:4px; }
        .row-btn:hover { color:var(--text); }
        .confirm-active { color:#fff !important; background:var(--loss) !important; border-radius:5px; }
        .empty-state { display:flex; flex-direction:column; align-items:center; gap:14px; padding:60px 20px; color:var(--text-dim); text-align:center; }
        .empty-state svg { display:inline-block; box-sizing:content-box; padding:16px; background:var(--surface); border:1px solid var(--border); border-radius:50%; }
        .empty-note { color:var(--text-dim); font-size:13px; }
        .resource-wrap { display:flex; gap:18px; }
        .resource-tabs { display:flex; flex-direction:column; gap:2px; min-width:150px; flex-shrink:0; }
        .resource-tab { text-align:left; padding:9px 12px; border-radius:7px; background:none; border:none; color:var(--text-dim); font-size:13px; cursor:pointer; }
        .resource-tab:hover { background:var(--surface-2); }
        .resource-tab-active { background:var(--surface-2); color:var(--accent); font-weight:600; }
        .resource-panel { flex:1; min-width:0; }
        .subtabs { display:flex; gap:4px; margin-bottom:14px; border-bottom:1px solid var(--border); flex-wrap:wrap; }
        .subtab { padding:8px 12px; background:none; border:none; color:var(--text-dim); font-size:12.5px; font-weight:500;
          cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; white-space:nowrap; }
        .subtab-active { color:var(--accent); border-bottom-color:var(--accent); }
        .resource-add { display:flex; gap:8px; margin-bottom:14px; }
        .resource-list { display:flex; flex-direction:column; gap:6px; }
        .resource-item { display:flex; align-items:center; justify-content:space-between; padding:8px 12px;
          background:var(--surface); border:1px solid var(--border); border-radius:7px; font-size:13px; margin-bottom:6px; }
        .account-item { cursor:pointer; }
        .account-item-main { display:flex; flex-direction:column; gap:2px; }
        .account-item-sub { font-size:11.5px; color:var(--text-dim); }
        .account-card-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:12px; }
        .account-card-grid-lg { grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); }
        .account-card { text-align:left; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px 18px;
          cursor:pointer; color:var(--text); display:flex; flex-direction:column; gap:10px; }
        .account-card:hover { border-color:var(--accent); }
        .account-card-head { display:flex; align-items:center; justify-content:space-between; }
        .account-card-head strong { font-size:15px; }
        .account-card-parent { font-size:11px; color:var(--text-dim); margin-top:-6px; }
        .account-card-balance { font-family:'IBM Plex Mono',monospace; font-size:22px; font-weight:700; }
        .account-card-rows { display:flex; flex-direction:column; gap:5px; padding-top:8px; border-top:1px solid var(--border); }
        .account-card-rows div { display:flex; align-items:center; justify-content:space-between; font-size:12px; color:var(--text-dim); }
        .account-card-rows .mono { color:var(--text); font-size:12.5px; }
        .account-form { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:14px 16px 4px; margin-bottom:8px; }
        .stat-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(148px,1fr)); gap:10px; margin-bottom:22px; }
        .stat-card { background:var(--surface); border:1px solid var(--border); border-radius:9px; padding:11px 13px; display:flex; flex-direction:column; gap:4px; }
        .stat-label { font-size:10px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.3px; line-height:1.3; }
        .stat-value { font-family:'IBM Plex Mono',monospace; font-size:17px; font-weight:600; }
        .stat-value.win { color:var(--win); } .stat-value.loss { color:var(--loss); }
        .block-title { font-size:13.5px; margin:26px 0 12px; color:var(--text); font-weight:700; letter-spacing:0.1px;
          display:flex; align-items:center; gap:8px; }
        .block-title::before { content:""; width:3px; height:14px; background:var(--accent); border-radius:2px; flex-shrink:0; }
        .chart-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
        .chart-card { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:14px 16px; }
        .chart-head { display:flex; flex-direction:column; margin-bottom:8px; }
        .chart-title { font-size:13px; font-weight:600; }
        .chart-sub { font-size:11px; color:var(--text-dim); margin-top:1px; }
        .rank-title { font-size:13px; font-weight:600; margin:0 0 8px; }
        .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center;
          z-index:100; padding:24px; backdrop-filter:blur(2px); }
        .modal-panel { background:var(--bg); border:1px solid var(--border); border-radius:14px; width:100%; max-width:760px;
          max-height:88vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,0.6); }
        .modal-header { display:flex; align-items:center; justify-content:space-between; padding:18px 22px; border-bottom:1px solid var(--border); flex-shrink:0; }
        .modal-body { padding:20px 22px; overflow-y:auto; flex:1; }
        .modal-footer { display:flex; justify-content:flex-end; gap:10px; padding:16px 22px; border-top:1px solid var(--border); flex-shrink:0; }
        .detail-group { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:14px 16px; margin-bottom:14px; }
        .detail-group-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--accent); margin:0 0 10px; }
        .detail-rows { display:flex; flex-direction:column; gap:8px; }
        .detail-row { display:flex; align-items:baseline; justify-content:space-between; gap:12px; font-size:13px; }
        .detail-row span:first-child { color:var(--text-dim); flex-shrink:0; }
        .detail-row span:last-child { text-align:right; word-break:break-word; }
        .pie-swatch { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:7px; vertical-align:1px; }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px; }
        .modal-panel { background:var(--surface); border:1px solid var(--border); border-radius:14px; width:100%; max-width:720px; max-height:88vh;
          display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,0.5); }
        .modal-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid var(--border); }
        .modal-header h3 { font-size:16px; font-weight:700; }
        .modal-body { padding:18px 20px; overflow-y:auto; flex:1; }
        .modal-footer { display:flex; justify-content:flex-end; gap:10px; padding:14px 20px; border-top:1px solid var(--border); }
        .detail-cols { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
        .detail-col-title { font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:var(--accent); margin:16px 0 6px; }
        .detail-col-title:first-child { margin-top:0; }
        .detail-row { display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding:5px 0; border-bottom:1px solid var(--border); font-size:13px; }
        .detail-row span:first-child { color:var(--text-dim); flex-shrink:0; }
        .detail-row span:last-child { text-align:right; }
        @media (max-width:640px) { .detail-cols { grid-template-columns:1fr; } }
        .filter-panel { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:14px 16px; margin-bottom:14px; }
        .filter-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:12px; }
        .cal-nav { display:flex; align-items:center; justify-content:center; gap:14px; margin-bottom:12px; }
        .cal-title { font-size:14px; font-weight:600; font-family:'Space Grotesk',sans-serif; min-width:120px; text-align:center; }
        .cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
        .cal-head { margin-bottom:4px; }
        .cal-dow { text-align:center; font-size:11px; color:var(--text-dim); padding:4px 0; }
        .cal-cell { aspect-ratio:1; border:1px solid var(--border); border-radius:8px; background:var(--surface); display:flex; flex-direction:column;
          align-items:flex-start; justify-content:flex-start; padding:6px; cursor:pointer; gap:2px; overflow:hidden; }
        .cal-cell:hover { border-color:var(--accent); }
        .cal-sel { border-color:var(--accent); border-width:2px; }
        .cal-empty { border:none; background:none; cursor:default; }
        .cal-daynum { font-size:11px; color:var(--text-dim); font-family:'IBM Plex Mono',monospace; }
        .cal-pnl { font-size:11px; font-weight:600; font-family:'IBM Plex Mono',monospace; }
        .cal-count { font-size:9.5px; color:var(--text-dim); }
        .cal-cell-filled .cal-daynum { color:rgba(255,255,255,0.75); text-shadow:0 1px 2px rgba(0,0,0,0.4); }
        .cal-cell-filled .cal-pnl { color:#fff !important; text-shadow:0 1px 2px rgba(0,0,0,0.4); }
        .cal-cell-filled .cal-count { color:rgba(255,255,255,0.8); text-shadow:0 1px 2px rgba(0,0,0,0.4); }
        .insight-box { background:rgba(212,162,78,0.08); border:1px solid rgba(212,162,78,0.3); border-radius:10px; padding:14px 16px; margin-bottom:18px; }
        .insight-title { font-size:13px; font-weight:600; color:var(--accent); }
        .insight-list { margin:8px 0 0; padding-left:18px; font-size:12.5px; line-height:1.6; color:var(--text); }
        .drill-row { width:100%; display:flex; align-items:center; justify-content:space-between; padding:10px 14px;
          background:var(--surface); border:1px solid var(--border); border-radius:8px; margin-bottom:6px; cursor:pointer; color:var(--text); }
        .drill-row:hover { border-color:var(--accent); }
        .drill-name { font-size:13px; font-weight:600; }
        .drill-stats { display:flex; gap:14px; font-size:12px; }
        .note-card { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px 14px; margin-bottom:8px; cursor:pointer; }
        .note-head { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
        .note-type { font-size:11px; font-weight:600; color:var(--accent); background:rgba(212,162,78,0.12); padding:2px 8px; border-radius:5px; }
        .note-content { font-size:13px; color:var(--text); margin:0; white-space:pre-wrap; }
        .setup-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px; margin-top:16px; }
        .setup-card { background:var(--surface); border:1px solid var(--border); border-radius:10px; overflow:hidden; cursor:pointer; position:relative; }
        .setup-img { width:100%; height:100px; object-fit:cover; display:block; }
        .setup-img-empty { display:flex; align-items:center; justify-content:center; background:var(--surface-2); }
        .setup-card-body { padding:10px 12px; }
        .setup-card-body strong { font-size:13px; }
        .setup-note { font-size:11.5px; color:var(--text-dim); margin:4px 0 0; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
        .setup-card-actions { position:absolute; top:6px; right:6px; display:flex; gap:2px; background:rgba(10,12,15,0.7); border-radius:6px; padding:2px; }
        .heat-strip { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:24px; }
        .heat-cell { flex:1; min-width:100px; border:1px solid var(--border); border-radius:9px; padding:10px 12px; display:flex; flex-direction:column; gap:3px; }
        .heat-label { font-size:11px; color:rgba(255,255,255,0.78); font-weight:600; text-shadow:0 1px 2px rgba(0,0,0,0.4); }
        .heat-value { font-family:'IBM Plex Mono',monospace; font-size:14px; font-weight:600; color:#fff !important; text-shadow:0 1px 2px rgba(0,0,0,0.4); }
        .heat-sub { font-size:10.5px; color:rgba(255,255,255,0.75); text-shadow:0 1px 2px rgba(0,0,0,0.4); }
        .pillar-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px; }
        .pillar-item { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--surface-2); border:1px solid var(--border); border-radius:9px; font-size:13px; }
        .pillar-avg { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:rgba(212,162,78,0.08); border:1px solid rgba(212,162,78,0.3); border-radius:9px; margin-bottom:10px; font-size:13.5px; font-weight:600; }
        .pillar-avg strong { font-family:'IBM Plex Mono',monospace; color:var(--accent); font-size:16px; }
        .fx-panel { background:var(--surface); border:1px solid var(--border); border-radius:9px; padding:12px 14px; margin-bottom:14px; }
        .fx-rows { display:flex; gap:10px; flex-wrap:wrap; margin:8px 0; }
        .fx-row { display:flex; align-items:center; gap:8px; }
        .fx-row .input { width:100px; }
        .checklist-item { display:flex; align-items:center; gap:9px; padding:10px 14px; background:var(--surface-2); border:1px solid var(--border);
          border-radius:9px; font-size:13px; cursor:pointer; }
        .checklist-item input { width:16px; height:16px; accent-color:var(--accent); cursor:pointer; }
        .checklist-checked { border-color:rgba(212,162,78,0.4); color:var(--text); }
        .scope-bar { display:flex; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:4px; }
        .detail-header { display:flex; align-items:center; gap:4px; margin-bottom:16px; flex-wrap:wrap; }
        .metric-group { margin-bottom:22px; }
        .metric-group-title { font-size:12px; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; margin:0 0 10px; }
        .app { box-shadow: 0 8px 32px rgba(0,0,0,0.35); }
        .app *::-webkit-scrollbar { width:9px; height:9px; }
        .app *::-webkit-scrollbar-track { background:transparent; }
        .app *::-webkit-scrollbar-thumb { background:var(--border); border-radius:6px; }
        .app *::-webkit-scrollbar-thumb:hover { background:#33393f; }
        .sidebar { background:linear-gradient(180deg, rgba(212,162,78,0.05), transparent 40%); position:relative; }
        .sidebar::after { content:""; position:absolute; top:0; bottom:0; right:-1px; width:1px; background:linear-gradient(180deg, var(--accent), transparent 60%); opacity:0.3; }
        .nav-btn { transition:background .15s ease, color .15s ease, transform .1s ease; }
        .nav-btn:active { transform:scale(0.97); }
        .nav-btn.nav-active { background:rgba(212,162,78,0.12); color:var(--accent); border-color:rgba(212,162,78,0.35); box-shadow:0 0 0 1px rgba(212,162,78,0.08) inset; }
        .section, .chart-card, .account-form, .filter-panel, .note-card, .setup-card, .drill-row, .cal-cell, .account-card, .stat-card {
          box-shadow: 0 1px 0 rgba(255,255,255,0.03) inset, 0 1px 2px rgba(0,0,0,0.28); transition: border-color .15s ease, box-shadow .15s ease, transform .1s ease; }
        .section:hover, .chart-card:hover { border-color:#2e343c; }
        .drill-row:hover, .setup-card:hover, .account-card:hover { transform:translateY(-1px); box-shadow:0 1px 0 rgba(255,255,255,0.03) inset, 0 6px 16px rgba(0,0,0,0.35); }
        .stat-card { position:relative; padding-left:18px; box-shadow:0 1px 0 rgba(255,255,255,0.03) inset, 0 1px 2px rgba(0,0,0,0.28); overflow:hidden; }
        .stat-card::before { content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--border-strong,var(--border)); }
        .stat-card:has(.stat-value.win)::before { background:var(--win); }
        .stat-card:has(.stat-value.loss)::before { background:var(--loss); }
        .stat-value { letter-spacing:-0.2px; }
        .btn { transition: background .15s ease, transform .1s ease, border-color .15s ease; }
        .btn:hover { border-color:#33393f; }
        .btn:active { transform:scale(0.97); }
        .btn-primary:hover { background:var(--accent-2); }
        .input { transition:border-color .15s ease, box-shadow .15s ease; }
        .input:focus { box-shadow:0 0 0 3px rgba(212,162,78,0.14); }
        .table th { position:sticky; top:0; z-index:1; }
        .table tbody tr { transition:background .12s ease; }
        .section-num { box-shadow:0 0 0 3px rgba(212,162,78,0.12); }
        .subtab-active { text-shadow:0 0 12px rgba(212,162,78,0.25); }
        .empty-state svg { opacity:0.6; }
        ::selection { background:rgba(212,162,78,0.35); }
        @media (max-width:820px) {
          .app-shell { flex-direction:column; }
          .sidebar { width:100%; flex-direction:row; align-items:center; padding:12px 16px; gap:14px; overflow-x:auto; }
          .sidebar::after { display:none; }
          .brand { flex-direction:row; align-items:center; gap:8px; padding:0; flex-shrink:0; }
          .brand-tag { display:none; }
          .nav { flex-direction:row; gap:2px; overflow-x:auto; overflow-y:visible; }
          .nav-group { flex-direction:row; gap:2px; }
          .nav-group-label { display:none; }
          .nav-btn { width:auto; }
        }
        @media (max-width:640px) {
          .grid-2,.grid-3,.chart-row,.filter-grid { grid-template-columns:1fr; }
          .stat-grid { grid-template-columns:1fr 1fr; }
          .resource-wrap { flex-direction:column; }
          .resource-tabs { flex-direction:row; overflow-x:auto; }
          .topbar { padding:12px 16px; }
        }
      `}</style>

      <div className="app-shell">
        <div className="sidebar">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <span className="candle candle-down" />
              <span className="candle candle-up candle-tall" />
              <span className="candle candle-down candle-short" />
            </span>
            <span className="brand-text">
              <span className="brand-name">Nhật Ký Giao Dịch</span>
              <span className="brand-tag">Kỷ Luật · Dữ Liệu · Cải Thiện</span>
            </span>
          </div>
          <div className="account-quickswitch">
            <select className="input" value={activeAccount} onChange={(e) => setActiveAccount(e.target.value)}>
              <option value="">Tất cả tài khoản</option>
              {resources.accounts.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
            <button type="button" className="quickadd-btn" title="Thêm tài khoản" onClick={() => setView("accounts")}><PlusCircle size={16} /></button>
          </div>
          <div className="nav">
            {navGroups.map((g) => (
              <div className="nav-group" key={g.label}>
                <span className="nav-group-label">{g.label}</span>
                {g.items.map((n) => {
                  const Icon = n.icon;
                  return (
                    <button key={n.key} className={`nav-btn ${view === n.key ? "nav-active" : ""}`} onClick={() => setView(n.key)}>
                      <Icon size={15} /> {n.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="main">
          <div className="topbar">
            <div className="open-risk-row">
              {openRiskBadges.length === 0 ? (
                <span className="field-hint">Không có lệnh đang mở</span>
              ) : openRiskBadges.map(({ account, risk }) => (
                <span key={account.id} className={`open-risk-badge ${risk.pct >= 5 ? "open-risk-high" : ""}`}>
                  <AlertTriangle size={12} /> {account.name}: {risk.pct.toFixed(2)}% ({risk.count} lệnh)
                </span>
              ))}
            </div>
            <span className="save-indicator mono">{saveState}</span>
            <span className="field-hint" style={{ whiteSpace: "nowrap" }}>{userEmail}</span>
            <button type="button" className="btn btn-ghost" onClick={onSignOut}>Đăng xuất</button>
            <button type="button" className="btn btn-primary" onClick={startNew}><PlusCircle size={15} /> Thêm giao dịch</button>
          </div>
          <div className="body">
            {loading ? <p className="empty-note">Đang tải dữ liệu...</p> :
              view === "dashboard" ? <Dashboard trades={trades} resources={resources} account={activeAccount} onAccountChange={setActiveAccount} onViewTrade={startEdit} /> :
              view === "journal" ? <JournalSection trades={trades} resources={resources} onEdit={startEdit} onDelete={handleDelete} /> :
              view === "equityindex" ? <EquityIndexPage resources={resources} ledger={ledger} trades={trades} /> :
              view === "capitaltracker" ? <CapitalTrackerPage accounts={capitalAccounts} entries={capitalEntries} onAccountsChange={persistCapitalAccounts} onEntriesChange={persistCapitalEntries} /> :
              view === "missed" ? <MissedSetupsSection items={missedSetups} resources={resources} onChange={persistMissedSetups} /> :
              view === "form" ? (
                <TradeForm initial={editing} resources={resources} trades={trades} ledger={ledger} onSave={handleSaveTrade} onCancel={() => { setEditing(null); setView("journal"); }} />
              ) :
              view === "analysis" ? <Analysis trades={trades} resources={resources} onViewTrade={startEdit} /> :
              view === "tradeanalysis" ? <TradeAnalysisPage trades={trades} resources={resources} /> :
              view === "symbolperf" ? <DimensionPerformance trades={trades} resources={resources} dimension="symbol" onViewTrade={startEdit} /> :
              view === "setupperf" ? <DimensionPerformance trades={trades} resources={resources} dimension="setup" onViewTrade={startEdit} /> :
              view === "structureperf" ? <DimensionPerformance trades={trades} resources={resources} dimension="structure" onViewTrade={startEdit} /> :
              view === "weekdayperf" ? <DimensionPerformance trades={trades} resources={resources} dimension="weekday" onViewTrade={startEdit} /> :
              view === "heatmap" ? <HeatmapPage trades={trades} resources={resources} /> :
              view === "accounts" ? (
                <AccountsSection accounts={resources.accounts} ledger={ledger} trades={trades}
                  onAccountsChange={(next) => persistResources({ ...resources, accounts: next })} onLedgerChange={persistLedger}
                  fxRates={resources.fxRates} onFxRatesChange={(next) => persistResources({ ...resources, fxRates: next })} />
              ) :
              view === "setuplib" ? <SetupLibrarySection items={setupLibrary} onChange={persistSetupLibrary} /> :
              view === "notes" ? <NotesSection notes={notes} onChange={persistNotes} /> :
              view === "resources" ? (
                <ResourceManager resources={resources} onChange={persistResources} />
              ) :
              <SettingsSection trades={trades} resources={resources} ledger={ledger} notes={notes} setupLibrary={setupLibrary} missedSetups={missedSetups}
                capitalAccounts={capitalAccounts} capitalEntries={capitalEntries}
                uiSettings={uiSettings} onUiSettingsChange={persistUiSettings} onImportAll={handleImportAll} onReset={handleResetAll} />
            }
          </div>
        </div>
      </div>
      {viewingTrade ? (
        <TradeDetailModal
          trade={viewingTrade}
          onClose={() => setViewingTrade(null)}
          onEdit={(t) => { setViewingTrade(null); openEditForm(t); }}
          onDelete={handleDelete}
        />
      ) : null}
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) { setError("Nhập đủ email và mật khẩu."); return; }
    setLoading(true); setError(""); setNotice("");
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) setError(err.message);
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) setError(err.message);
        else if (!data.session) setNotice("Đã gửi email xác nhận — kiểm tra hộp thư rồi quay lại đăng nhập.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0a0b0d", fontFamily: "'IBM Plex Sans',sans-serif", color: "#eae7e0", padding: 20,
    }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#131519", border: "1px solid #252930", borderRadius: 14, padding: 28 }}>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", margin: "0 0 4px", fontSize: 20 }}>Nhật Ký Giao Dịch</h2>
        <p style={{ fontSize: 12.5, color: "#8d9198", margin: "0 0 22px" }}>
          {mode === "signin" ? "Đăng nhập để đồng bộ dữ liệu qua mọi thiết bị." : "Tạo tài khoản mới."}
        </p>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, fontSize: 12.5 }}>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ background: "#191c21", border: "1px solid #252930", borderRadius: 8, padding: "9px 11px", color: "#eae7e0", fontSize: 13.5 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, fontSize: 12.5 }}>
          Mật khẩu
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            style={{ background: "#191c21", border: "1px solid #252930", borderRadius: 8, padding: "9px 11px", color: "#eae7e0", fontSize: 13.5 }} />
        </label>
        {error ? <p style={{ color: "#e0615a", fontSize: 12, margin: "0 0 12px" }}>{error}</p> : null}
        {notice ? <p style={{ color: "#4caf7d", fontSize: 12, margin: "0 0 12px" }}>{notice}</p> : null}
        <button type="button" onClick={submit} disabled={loading} style={{
          width: "100%", background: "#d4a24e", border: "none", borderRadius: 8, padding: "10px 0",
          color: "#1a1206", fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginBottom: 12,
        }}>
          {loading ? "Đang xử lý..." : mode === "signin" ? "Đăng nhập" : "Đăng ký"}
        </button>
        <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setNotice(""); }}
          style={{ width: "100%", background: "none", border: "none", color: "#8d9198", fontSize: 12.5, cursor: "pointer" }}>
          {mode === "signin" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCurrentUserId(data.session?.user?.id || null);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCurrentUserId(nextSession?.user?.id || null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0b0d", color: "#8d9198", fontFamily: "'IBM Plex Sans',sans-serif" }}>
        Đang tải...
      </div>
    );
  }
  if (!session) return <AuthScreen />;

  return <AppShell userEmail={session.user.email} onSignOut={() => supabase.auth.signOut()} />;
}
