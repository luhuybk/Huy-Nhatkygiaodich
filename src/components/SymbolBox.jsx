import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Eye, X } from "lucide-react";
import { looksTelexed, parseSymbolList, untelexSymbol } from "../lib/helpers.js";

// Đồng base của cặp FX (EUR/USD, EURUSD → EUR) — gợi ý gom mỗi đồng base vào một khung có nhãn riêng
const FX_CCY = new Set(["AUD", "CAD", "CHF", "EUR", "GBP", "JPY", "NZD", "USD"]);
function fxBase(sym) {
  const c = String(sym || "").toUpperCase().replace(/[^A-Z]/g, "");
  return c.length === 6 && FX_CCY.has(c.slice(0, 3)) && FX_CCY.has(c.slice(3)) ? c.slice(0, 3) : "";
}
// Cụm liên tiếp cùng đồng base đi liền một khối (xuống dòng giữa các cụm, không cắt đôi cụm);
// mã không phải cặp FX thì mỗi mã một cụm
function clusters(list) {
  const out = [];
  list.forEach((sym, i) => {
    const b = fxBase(sym);
    if (i > 0 && b && b === fxBase(list[i - 1])) out[out.length - 1].push(sym);
    else out.push([sym]);
  });
  return out;
}

// Ô nhập symbol dạng chip: gõ tên rồi phím cách / Enter / dấu phẩy là chốt thành một chip.
// Backspace ở ô rỗng: lần 1 tô đỏ chip cuối, lần 2 mới xóa. Hàng "gợi ý" lọc theo chữ đang gõ.
// Bộ gõ tiếng Việt (OpenKey, EVKey…) sửa "us" → "ú" bằng cách tự bắn một loạt Backspace rồi gõ lại —
// trước đây loạt phím đó rơi vào ô vừa trống và xóa sạch cả danh sách. Nên Backspace ngay sau lúc chữ
// trong ô vừa đổi, phím giữ lặp, phím của bộ gõ (keyCode 229) hoặc hai phím sát nhau như máy bắn
// đều bỏ qua.
const BACKSPACE_AFTER_EDIT_MS = 800;
const BACKSPACE_MIN_GAP_MS = 150;
const SYMBOL_SUGGEST_SHOWN = 12;

// `groupOf` + `order` (Tài nguyên → Symbol): lúc chưa gõ gì, gợi ý chia theo nhóm (Forex, Vàng bạc…)
// đúng thứ tự trong Tài nguyên; mã chưa có nhóm (cổ phiếu hay đánh…) gom vào "Khác".
// `pinned` = { name, list }: một hàng chọn nhanh đứng đầu gợi ý (VD 🔥 Mã tiềm năng ở Cảnh báo nhắc lại).
// `alwaysHints`: gợi ý luôn hiện (form chọn nhanh), không chỉ lúc đang gõ.
export function SymbolBox({ items, suggestions, onAdd, onRemove, onToggle, onSubmitEmpty, placeholder, autoFocus, hideDone, groupOf, order, pinned, alwaysHints }) {
  const [text, setText] = useState("");
  const [armed, setArmed] = useState(false); // chip cuối đang tô đỏ, chờ Backspace lần 2
  const lastEditAt = useRef(0);
  const armedAt = useRef(0);
  // Gợi ý chỉ hiện khi đang gõ vào ô (hoặc ô còn trống trơn) — không thì mỗi nhóm một hàng chip, rất rối.
  const [focused, setFocused] = useState(false);
  const chosen = useMemo(() => new Set((items || []).map((x) => x.name)), [items]);
  // Ẩn mã đã ngừng chỉ là ẩn khỏi mắt: danh sách thật (để gợi ý, để chống trùng) vẫn đủ.
  const shown = hideDone ? (items || []).filter((x) => !x.done) : (items || []);
  // Mã đã biết, để khi dịch ngược Telex mà có nhiều cách đọc thì chọn đúng mã có thật.
  const known = useMemo(() => new Set(suggestions || []), [suggestions]);
  const parse = (raw) => parseSymbolList(raw, known);
  // Không sửa chữ ngay lúc đang gõ: bộ gõ vẫn đang giữ "ạ" trong bộ nhớ của nó, đổi chữ trong ô
  // giữa chừng là phím kế tiếp nó sửa nhầm chỗ. Chỉ dịch ngược lúc chốt thành chip.
  const telexed = looksTelexed(text);
  const fixed = telexed ? untelexSymbol(text, known) : "";
  const hints = useMemo(() => {
    const q = untelexSymbol(text, known);
    const rest = (suggestions || []).filter((sym) => !chosen.has(sym));
    return (q ? rest.filter((sym) => sym.includes(q)) : rest).slice(0, SYMBOL_SUGGEST_SHOWN);
  }, [suggestions, chosen, text, known]);
  const hintGroups = useMemo(() => {
    if (text.trim() || !groupOf || !Object.keys(groupOf).length) return null;
    const rank = new Map((order || []).map((sym, i) => [String(sym).toUpperCase(), i]));
    const byGroup = new Map();
    const loose = [];
    [...new Set(suggestions || [])].filter((sym) => !chosen.has(sym)).forEach((sym) => {
      const g = String(groupOf[sym] || "").trim();
      if (!g) { loose.push(sym); return; }
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(sym);
    });
    const at = (sym) => (rank.has(sym) ? rank.get(sym) : 1e9);
    const out = [...byGroup].map(([name, list]) => ({ name, list: list.sort((a, b) => at(a) - at(b)) }))
      .sort((a, b) => at(a.list[0]) - at(b.list[0]));
    if (loose.length) out.push({ name: "Khác", list: loose.slice(0, SYMBOL_SUGGEST_SHOWN) });
    const pin = pinned && (pinned.list || []).filter((sym) => !chosen.has(sym));
    if (pin && pin.length) out.unshift({ name: pinned.name, list: pin, pinned: true });
    return out;
  }, [suggestions, chosen, text, groupOf, order, pinned]);

  // Gõ hoặc dán có dấu phân cách thì chốt luôn phần trước dấu, giữ lại đuôi đang gõ dở.
  const onType = (raw) => {
    lastEditAt.current = Date.now();
    setArmed(false);
    if (!/[,;\s]/.test(raw)) { setText(raw.toUpperCase()); return; }
    const parts = raw.split(/[,;\s]+/);
    const tail = /[,;\s]$/.test(raw) ? "" : parts.pop();
    const names = parse(parts.join(" "));
    if (names.length) onAdd(names);
    setText((tail || "").toUpperCase());
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const names = parse(text);
      if (names.length) { onAdd(names); setText(""); return; }
      if (onSubmitEmpty) onSubmitEmpty();
      return;
    }
    if (e.key === "Backspace" && !text && shown.length) {
      e.preventDefault();
      const now = Date.now();
      if (e.repeat || e.nativeEvent.isComposing || e.keyCode === 229 || now - lastEditAt.current < BACKSPACE_AFTER_EDIT_MS) return;
      if (!armed) { setArmed(true); armedAt.current = now; return; }
      if (now - armedAt.current < BACKSPACE_MIN_GAP_MS) return;
      setArmed(false);
      onRemove(shown[shown.length - 1]);
      return;
    }
    if (armed) setArmed(false);
  };

  return (
    <div>
      <div className="symbol-box" onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.querySelector("input").focus(); }}>
        {shown.map((x, i) => (
          <span key={x.id || x.name} className={`watch-symbol-chip ${x.done ? "watch-symbol-chip-done" : ""} ${armed && i === shown.length - 1 ? "watch-symbol-chip-armed" : ""}`}
            title={armed && i === shown.length - 1 ? "Bấm Backspace lần nữa để xóa" : undefined}>
            {onToggle ? (
              <button type="button" className="chip-main" onClick={() => onToggle(x)}
                title={x.done ? "Đã ngừng theo dõi — bấm để theo dõi lại" : "Đang theo dõi — bấm để tạm ngừng"}>
                {x.done ? <CheckCircle2 size={11} /> : <Eye size={11} />} {x.name}
              </button>
            ) : <span className="chip-main">{x.name}</span>}
            <button type="button" className="chip-x" title="Xóa khỏi danh sách" onClick={() => onRemove(x)}><X size={11} /></button>
          </span>
        ))}
        <input className="symbol-box-input" value={text} autoFocus={autoFocus}
          placeholder={shown.length ? "Thêm symbol..." : (placeholder || "XAUUSD EURUSD GBPJPY")}
          onChange={(e) => onType(e.target.value)} onKeyDown={onKeyDown}
          onPaste={(e) => {
            // Ô một dòng tự nuốt ký tự xuống dòng, nên dán một cột từ Excel/TradingView
            // sẽ dính liền thành một cục. Đọc thẳng clipboard trước khi trình duyệt kịp cắt.
            const raw = e.clipboardData ? e.clipboardData.getData("text") : "";
            if (!/[,;\s]/.test(raw)) return;
            e.preventDefault();
            const names = parse(`${text}${raw}`);
            if (names.length) onAdd(names);
            setText("");
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setArmed(false); const names = parse(text); if (names.length) { onAdd(names); setText(""); } }} />
      </div>
      {telexed && fixed ? (
        <p className="field-hint telex-note">
          Bộ gõ tiếng Việt đang bật — <b>{text.trim()}</b> sẽ được lưu thành <b className="mono">{fixed}</b>.
          Sai thì gõ lại sau khi chuyển bộ gõ sang tiếng Anh.
        </p>
      ) : null}
      {hintGroups && hintGroups.length && (focused || alwaysHints || !shown.length) ? (
        <div className="symbol-hint-groups">
          {hintGroups.map((g) => (
            <div key={g.name} className={`symbol-hints ${g.pinned ? "symbol-hints-pinned" : ""}`}>
              <span className="field-hint symbol-hint-group">{g.name}</span>
              <div className="symbol-hint-list">
                {(g.pinned ? g.list.map((sym) => [sym]) : clusters(g.list)).map((c) => (
                  <span key={c[0]} className={!g.pinned && fxBase(c[0]) ? "symbol-hint-cluster" : "symbol-hint-cluster-loose"}>
                    {!g.pinned && fxBase(c[0]) ? <span className="symbol-hint-base" aria-hidden="true">{fxBase(c[0])}</span> : null}
                    {c.map((sym) => (
                      <button key={sym} type="button" className="symbol-hint-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => { onAdd([sym]); setText(""); }}>
                        + {sym}
                      </button>
                    ))}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : !hintGroups && hints.length && (focused || text || !shown.length) ? (
        <div className="symbol-hints">
          <span className="field-hint">Gợi ý:</span>
          {hints.map((sym) => (
            <button key={sym} type="button" className="symbol-hint-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => { onAdd([sym]); setText(""); }}>
              + {sym}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
