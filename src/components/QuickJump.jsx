import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, FileText, Hash, PlusCircle, Search, TrendingDown, TrendingUp } from "lucide-react";
import { computeResult, dateKey, fmtR, symbolGroupKey, symbolSearchKey } from "../lib/helpers.js";

// Ô nhảy nhanh (phím / hoặc ⌘J): menu có gần 30 trang, gõ vài chữ là tới — "von" ra các trang vốn,
// "miss" ra Setup bị miss. Gõ một mã thì ra số lệnh của mã đó (mở Nhật ký đã lọc) và vài lệnh gần
// nhất để mở thẳng. Tìm không dấu: gõ "von" vẫn khớp "Vốn".
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

// Từ khoá phụ cho trang mà tên trang không chứa chữ người ta hay gõ.
const KEYWORDS = {
  dashboard: "trang chu home",
  journal: "lenh giao dich trade danh sach",
  journeylog: "tam su cam xuc",
  equityindex: "equity",
  setuphub: "miss skip bien the bo lo",
  setupperf: "hieu qua",
  assetmatrix: "ma tran hang hoa vang crypto forex fx nhom tai san khung ngan trung dai",
  structureperf: "diem cau truc",
  heatmap: "heatmap",
  weeklyreport: "in pdf tong ket",
  mistakecost: "sai lam",
  reminders: "nhac nho telegram lich",
  accounts: "ty gia broker",
  capitalplan: "mang rui ro risk",
  setuplib: "thu vien checklist",
  lessons: "bai hoc ke hoach ky nang van de tin tuc",
  resources: "danh muc symbol ly do khung",
  health: "loi du lieu link trung ma chuan anh",
  settings: "sao luu backup giao dien mau",
};

// Tab con hay dùng — nhảy thẳng vào đúng tab thay vì vào trang rồi bấm thêm lần nữa.
const SUBTABS = [
  { view: "setuphub", tab: ["setupHubTab", "missed"], label: "Setup bị miss", kw: "bo lo" },
  { view: "setuphub", tab: ["setupHubTab", "skipped"], label: "Setup bị skip", kw: "bo qua" },
  { view: "setuphub", tab: ["setupHubTab", "variants"], label: "Setup biến thể", kw: "" },
  { view: "setuphub", tab: ["setupHubTab", "cost"], label: "Chi phí bỏ lỡ", kw: "miss skip" },
  { view: "lessons", tab: ["journeyTab", "plan"], label: "Kế hoạch giao dịch", kw: "" },
  { view: "lessons", tab: ["journeyTab", "skills"], label: "Kỹ năng", kw: "" },
  { view: "lessons", tab: ["journeyTab", "lessons"], label: "Bài học", kw: "" },
  { view: "lessons", tab: ["journeyTab", "process"], label: "Cải thiện quy trình", kw: "danh gia tuan" },
  { view: "lessons", tab: ["journeyTab", "problems"], label: "Xử lý vấn đề", kw: "" },
  { view: "lessons", tab: ["journeyTab", "news"], label: "Nhật ký tin tức", kw: "news" },
];

const MAX_SYMBOLS = 4;
const MAX_TRADES = 5;

const ddmmyy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : "—");

export function QuickJump({ navGroups, trades, newTradeKey, onClose, onGo, onOpenTrade, onFilterSymbol, onNewTrade }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  const pages = useMemo(() => {
    const out = [];
    navGroups.forEach((g) => g.items.forEach((n) => out.push({ id: `p:${n.key}`, label: n.label, group: g.label, icon: n.icon, view: n.key, text: norm(`${n.label} ${g.label} ${KEYWORDS[n.key] || ""}`) })));
    SUBTABS.forEach((s) => {
      const parent = out.find((p) => p.view === s.view);
      out.push({ id: `t:${s.tab.join(":")}`, label: s.label, group: parent ? parent.label : "", icon: parent ? parent.icon : FileText, view: s.view, tab: s.tab, text: norm(`${s.label} ${parent ? parent.label : ""} ${s.kw}`) });
    });
    return out;
  }, [navGroups]);

  // Mã đã từng đánh, gộp "XAUUSD" cũ với "XAU/USD" mới (bỏ dấu / mới so); tên hiện ưu tiên cách viết
  // có "/", không có thì lấy cách viết dùng nhiều nhất. Kèm danh sách lệnh, mới nhất trước.
  const symbols = useMemo(() => {
    const m = new Map();
    (trades || []).forEach((t) => {
      const sym = symbolGroupKey(t && t.symbol);
      const key = symbolSearchKey(sym);
      if (!key) return;
      if (!m.has(key)) m.set(key, { names: new Map(), list: [] });
      const g = m.get(key);
      g.names.set(sym, (g.names.get(sym) || 0) + 1);
      g.list.push(t);
    });
    return [...m.entries()].map(([key, { names, list }]) => ({
      sym: [...names.entries()].sort((a, b) => (b[0].includes("/") - a[0].includes("/")) || b[1] - a[1])[0][0],
      key, list: list.sort((a, b) => `${dateKey(b)} ${b.exitTime || b.entryTime || ""}`.localeCompare(`${dateKey(a)} ${a.exitTime || a.entryTime || ""}`)),
    }));
  }, [trades]);

  const sections = useMemo(() => {
    const words = norm(q).trim().split(/\s+/).filter(Boolean);
    const out = [];
    const newTrade = { id: "a:new", kind: "action", label: "Thêm giao dịch mới", icon: PlusCircle, hint: newTradeKey, text: "them giao dich lenh moi new trade" };
    if (!words.length || words.every((w) => newTrade.text.includes(w))) out.push({ title: "Thao tác", items: [newTrade] });

    const symKey = symbolSearchKey(q);
    if (symKey.length >= 2) {
      const hits = symbols.filter((s) => s.key.includes(symKey))
        .sort((a, b) => (b.key.startsWith(symKey) - a.key.startsWith(symKey)) || b.list.length - a.list.length)
        .slice(0, MAX_SYMBOLS);
      if (hits.length) {
        out.push({ title: "Mã giao dịch", items: hits.map((s) => ({ id: `s:${s.sym}`, kind: "symbol", label: s.sym, icon: Hash, hint: `${s.list.length} lệnh · xem trong Nhật ký`, sym: s.sym })) });
        out.push({
          title: `Lệnh ${hits[0].sym} gần nhất`,
          items: hits[0].list.slice(0, MAX_TRADES).map((t) => {
            const r = computeResult(t);
            const sell = t.direction === "sell";
            return {
              id: `tr:${t.id}`, kind: "trade", trade: t, icon: sell ? TrendingDown : TrendingUp,
              label: `${t.symbol || "—"} ${sell ? "Sell" : "Buy"} · ${ddmmyy(dateKey(t) || t.entryDate)}`,
              hint: r.status === "open" ? "đang mở" : fmtR(r.rr), tone: r.status === "open" ? "" : r.outcome === "win" ? "win" : r.outcome === "loss" ? "loss" : "",
            };
          }),
        });
      }
    }

    const matched = words.length ? pages.filter((p) => words.every((w) => p.text.includes(w))) : pages.filter((p) => !p.tab);
    // Tên trang bắt đầu bằng chữ vừa gõ lên đầu, rồi tới tên có chứa chữ đó, cuối cùng mới tới trang
    // chỉ khớp từ khoá phụ — gõ "miss" thì "Setup bị miss" đứng trước "Setup tổng hợp".
    const first = norm(q).trim();
    const rank = (p) => { const l = norm(p.label); return l.startsWith(first) ? 3 : words.every((w) => l.includes(w)) ? 2 : 1; };
    matched.sort((a, b) => rank(b) - rank(a));
    if (matched.length) out.push({ title: words.length ? "Trang" : "Tất cả trang", items: matched.map((p) => ({ ...p, kind: "page", hint: p.tab ? p.group : "" })) });
    return out;
  }, [q, pages, symbols, newTradeKey]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    const el = listRef.current && listRef.current.querySelector(`[data-qj-index="${active}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (it) => {
    if (!it) return;
    onClose();
    if (it.kind === "action") onNewTrade();
    else if (it.kind === "symbol") onFilterSymbol(it.sym);
    else if (it.kind === "trade") onOpenTrade(it.trade);
    else onGo(it.view, it.tab);
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(flat[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  let n = -1;
  return (
    <div className="qj-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qj-panel" role="dialog" aria-label="Tìm nhanh">
        <div className="qj-input-row">
          <Search size={16} />
          <input className="qj-input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Gõ tên trang hoặc mã, VD: vốn, miss, xau…" spellCheck={false} autoComplete="off" />
          <kbd className="kbd-hint">Esc</kbd>
        </div>
        <div className="qj-list" ref={listRef}>
          {flat.length === 0 ? <p className="qj-empty">Không tìm thấy trang hay mã nào khớp "{q}".</p> : null}
          {sections.map((s) => (
            <div key={s.title} className="qj-section">
              <div className="qj-section-title">{s.title}</div>
              {s.items.map((it) => {
                n += 1;
                const idx = n;
                const Icon = it.icon || FileText;
                return (
                  <button key={it.id} type="button" data-qj-index={idx} className={`qj-item ${idx === active ? "qj-item-on" : ""}`}
                    onMouseMove={() => { if (active !== idx) setActive(idx); }} onClick={() => run(it)}>
                    <Icon size={15} className="qj-icon" />
                    <span className="qj-label">{it.label}</span>
                    {it.hint ? <span className={`qj-hint ${it.tone ? `qj-hint-${it.tone}` : ""} ${it.kind === "trade" ? "mono" : ""}`}>{it.hint}</span> : null}
                    {idx === active ? <CornerDownLeft size={13} className="qj-enter" /> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="qj-foot">↑↓ chọn · Enter mở · mở ô này bằng phím <kbd className="kbd-hint">/</kbd> hoặc <kbd className="kbd-hint">{newTradeKey.startsWith("⌘") ? "⌘J" : "Ctrl+J"}</kbd></div>
      </div>
    </div>
  );
}
