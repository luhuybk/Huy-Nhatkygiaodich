import { useMemo, useState } from "react";
import { Clock, PlusCircle } from "lucide-react";
import { ConfirmButton } from "./ui.jsx";
import { uid } from "../lib/helpers.js";
import {
  allSessions, candleClosesVN, DEFAULT_AUTO_QUIET, fmtSessionOpenVN, normSymbol, NY_TZ, sessionFor,
  tradeAutoHours, VN_TZ, vnTimeToZone, vnToday,
} from "../lib/candles.js";

// Mã hàng hoá hay gặp — chỉ để GỢI Ý gán phiên kim loại/năng lượng, không tự gán thầm.
const COMMODITY_RE = /^(X(AU|AG|PT|PD|CU|AL|NG|BR|TI)|US?OIL|UKOIL|WTI|BRENT|NGAS|COPPER|GOLD|SILVER)/;

const TF_SHOW = [["H4", 4], ["H8", 8], ["D", 24]];

function hm(list) {
  return list.length ? list.join(" · ") : "—";
}

// Giờ đóng nến H4/H8/D hôm nay của một phiên — để so thẳng với chart TradingView.
function Closes({ session, date }) {
  return (
    <div className="sl-session-closes">
      {TF_SHOW.map(([label, h]) => (
        <span key={label}><b>{label}</b> {hm(candleClosesVN(h, session, date))}</span>
      ))}
    </div>
  );
}

// Một dòng trong thẻ tài khoản: lệnh đang mở → giờ nhắc hôm nay của từng lệnh.
export function AutoHoursPreview({ settings, trades }) {
  const date = vnToday();
  if (!trades.length) return <p className="field-hint sl-auto-hint">Không có lệnh mở — khi có lệnh, giờ nhắc của từng lệnh hiện ở đây.</p>;
  return (
    <div className="sl-auto-list">
      {trades.map((t) => {
        const hrs = tradeAutoHours(t, settings, date);
        const ses = sessionFor(settings, t.symbol);
        return (
          <div key={t.id} className="sl-auto-row">
            <b>{t.symbol || "?"}</b>
            <span className="sl-auto-tf">{t.timeframe || "chưa ghi khung"}</span>
            <span className="field-hint" style={{ margin: 0 }}>{ses ? ses.name : ""}</span>
            <span className="mono sl-auto-hours">{hrs ? hm(hrs) : "khung không tự tính được — dùng giờ gõ tay"}</span>
          </div>
        );
      })}
    </div>
  );
}

function NewSession({ onAdd }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState("05:00");
  const [length, setLength] = useState("23");
  const [ny, setNy] = useState(true);
  const [fxWeek, setFxWeek] = useState(true);
  const add = () => {
    if (!/^\d{1,2}:\d{2}$/.test(open)) return;
    const vnOpen = open.padStart(5, "0");
    const tz = ny ? NY_TZ : VN_TZ;
    onAdd({
      id: uid(), name: name.trim() || `Phiên mở ${vnOpen}`, tz,
      open: ny ? vnTimeToZone(NY_TZ, vnToday(), vnOpen) : vnOpen,
      length: Math.min(24, Math.max(1, Number(length) || 24)), week: fxWeek ? "fx" : "all",
    });
    setName("");
  };
  return (
    <div className="sl-session-new">
      <input className="input input-inline" style={{ flex: "2 1 160px" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên phiên, VD Đồng Exness" />
      <label className="sl-session-field">Nến đầu phiên mở lúc
        <input className="input input-inline mono" style={{ width: 70 }} value={open} onChange={(e) => setOpen(e.target.value)} placeholder="05:00" />
      </label>
      <label className="sl-session-field">phiên dài
        <input className="input input-inline mono" style={{ width: 50 }} value={length} onChange={(e) => setLength(e.target.value)} /> giờ
      </label>
      <label className="sl-session-field"><input type="checkbox" checked={ny} onChange={(e) => setNy(e.target.checked)} /> theo giờ New York (tự đổi mùa)</label>
      <label className="sl-session-field"><input type="checkbox" checked={fxWeek} onChange={(e) => setFxWeek(e.target.checked)} /> nghỉ cuối tuần</label>
      <button type="button" className="btn btn-ghost" onClick={add}><PlusCircle size={13} /> Thêm phiên</button>
    </div>
  );
}

// Cài đặt chung cho giờ đóng nến tự tính: giờ ngủ, các phiên giao dịch và mã nào thuộc phiên nào.
export function CandleSessionsPanel({ settings, onChange, trades, accountNames }) {
  const s = settings;
  const date = vnToday();
  const quiet = s.autoQuiet || DEFAULT_AUTO_QUIET;
  const sessions = allSessions(s);
  const map = s.symbolSessions || {};

  // Mã của các tài khoản đang bật tự tính: lệnh đang mở trước, rồi mã đã đánh trong 120 ngày.
  const symbols = useMemo(() => {
    const names = new Set(accountNames);
    const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
    const seen = new Map();
    (trades || []).forEach((t) => {
      if (!t || !t.symbol || !names.has(t.account)) return;
      const k = normSymbol(t.symbol);
      const open = t.entryDate && !t.exitDate;
      if (!open && (t.entryDate || "") < since) return;
      const cur = seen.get(k) || { symbol: k, open: 0, n: 0 };
      cur.n += 1;
      if (open) cur.open += 1;
      seen.set(k, cur);
    });
    return [...seen.values()].sort((a, b) => b.open - a.open || b.n - a.n || a.symbol.localeCompare(b.symbol));
  }, [trades, accountNames]);

  const setMap = (sym, id) => {
    const next = { ...map };
    if (!id || id === "fx") delete next[sym]; else next[sym] = id;
    onChange({ ...s, symbolSessions: next });
  };
  const suggest = symbols.filter((x) => COMMODITY_RE.test(x.symbol) && !map[x.symbol]);
  const custom = Array.isArray(s.sessions) ? s.sessions : [];

  return (
    <div className="account-form sl-sessions">
      <div className="sl-quiet">
        <Clock size={14} />
        <span>Không nhắc từ</span>
        <input className="input input-inline mono" style={{ width: 70 }} key={`f${quiet.from}`} defaultValue={quiet.from}
          onBlur={(e) => onChange({ ...s, autoQuiet: { ...quiet, from: e.target.value.trim() } })} />
        <span>đến</span>
        <input className="input input-inline mono" style={{ width: 70 }} key={`t${quiet.to}`} defaultValue={quiet.to}
          onBlur={(e) => onChange({ ...s, autoQuiet: { ...quiet, to: e.target.value.trim() } })} />
        <span className="field-hint" style={{ margin: 0 }}>— nến đóng trong khoảng này (vd nến D 4h sáng) dồn nhắc một lần lúc <b>{quiet.to || DEFAULT_AUTO_QUIET.to}</b>.</span>
      </div>

      <h4 className="rec-title" style={{ marginTop: 12 }}>Phiên giao dịch · giờ đóng nến hôm nay (giờ VN)</h4>
      <div className="sl-session-list">
        {sessions.map((x) => (
          <div key={x.id} className="sl-session-row">
            <div className="sl-session-name">
              <b>{x.name}</b>
              <span className="field-hint" style={{ margin: 0 }}>
                {x.note ? `${x.note} · hôm nay mở ${fmtSessionOpenVN(x, date)} giờ VN` : `mở ${fmtSessionOpenVN(x, date)} giờ VN · ${x.length} tiếng${x.tz === NY_TZ ? " · theo giờ New York" : ""}${x.week === "all" ? " · cả tuần" : ""}`}
              </span>
            </div>
            <Closes session={x} date={date} />
            {x.preset ? null : (
              <ConfirmButton onConfirm={() => {
                const nextMap = Object.fromEntries(Object.entries(map).filter(([, id]) => id !== x.id));
                onChange({ ...s, sessions: custom.filter((c) => c.id !== x.id), symbolSessions: nextMap });
              }} />
            )}
          </div>
        ))}
      </div>
      <NewSession onAdd={(ses) => onChange({ ...s, sessions: [...custom, ses] })} />
      <p className="field-hint">
        Mở chart TradingView của mã đó, khung H4, xem nến gần nhất đóng lúc mấy giờ — khớp dòng nào thì chọn phiên đó cho mã.
        Không khớp phiên có sẵn thì thêm phiên tự đặt: gõ giờ nến H4 đầu tiên trong ngày mở (giờ VN hôm nay) và độ dài phiên.
      </p>

      <h4 className="rec-title" style={{ marginTop: 12 }}>Mã nào thuộc phiên nào</h4>
      {suggest.length ? (
        <div className="sl-suggest">
          <span>{suggest.map((x) => x.symbol).join(", ")} trông như hàng hoá nhưng đang theo phiên Forex.</span>
          <button type="button" className="btn btn-ghost" onClick={() => {
            const next = { ...map };
            suggest.forEach((x) => { next[x.symbol] = "cme"; });
            onChange({ ...s, symbolSessions: next });
          }}>Chuyển sang Kim loại · năng lượng</button>
        </div>
      ) : null}
      {symbols.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Mã</th><th>Phiên</th><th>H4 hôm nay</th><th>H8</th><th>D</th></tr></thead>
            <tbody>
              {symbols.map((x) => {
                const ses = sessionFor(s, x.symbol);
                return (
                  <tr key={x.symbol}>
                    <td><b>{x.symbol}</b>{x.open ? <span className="rec-tag">{x.open} lệnh mở</span> : null}</td>
                    <td>
                      <select className="input input-inline" value={map[x.symbol] || "fx"} onChange={(e) => setMap(x.symbol, e.target.value)}>
                        {sessions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </td>
                    {TF_SHOW.map(([label, h]) => <td key={label} className="mono">{hm(candleClosesVN(h, ses, date))}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="empty-note">Bật "Tự tính theo giờ đóng nến" ở một tài khoản để gán phiên cho các mã của nó.</p>}
    </div>
  );
}
