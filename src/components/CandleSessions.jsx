import { useMemo, useState } from "react";
import { PlusCircle } from "lucide-react";
import { ConfirmButton } from "./ui.jsx";
import { parseHoursInput, uid } from "../lib/helpers.js";
import {
  allSessions, candleClosesVN, DEFAULT_AUTO_QUIET, DEFAULT_AUTO_SLOTS, DEFAULT_SYMBOL_RULES, LONDON_TZ, normSymbol, NY_TZ,
  parseSessionSpec, sessionFor, sessionTodayVN, tradeAutoHours, TZ_LABEL, UTC_TZ, VN_TZ, vnToday,
} from "../lib/candles.js";

const TF_SHOW = [["H4", 4], ["H8", 8], ["D", 24]];
const TZ_OPTIONS = [NY_TZ, LONDON_TZ, UTC_TZ, VN_TZ];

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

// Phiên tự thêm: dán đúng chuỗi phiên TradingView (bấm tên mã trên chart → Thông tin mã → Phiên).
function NewSession({ onAdd }) {
  const [name, setName] = useState("");
  const [tz, setTz] = useState(NY_TZ);
  const [spec, setSpec] = useState("");
  const valid = parseSessionSpec(spec).length > 0;
  const add = () => {
    if (!valid) return;
    onAdd({ id: uid(), name: name.trim() || `Phiên ${spec.trim()}`, tz, spec: spec.trim() });
    setName("");
    setSpec("");
  };
  return (
    <div className="sl-session-new">
      <input className="input input-inline" style={{ flex: "2 1 160px" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên phiên, VD Bạc Pepperstone" />
      <input className={`input input-inline mono ${spec && !valid ? "input-invalid" : ""}`} style={{ flex: "2 1 180px" }} value={spec}
        onChange={(e) => setSpec(e.target.value)} placeholder="Chuỗi phiên, VD 1700-1700" />
      <select className="input input-inline" value={tz} onChange={(e) => setTz(e.target.value)}>
        {TZ_OPTIONS.map((z) => <option key={z} value={z}>{TZ_LABEL[z]}</option>)}
      </select>
      <button type="button" className="btn btn-ghost" disabled={!valid} onClick={add}><PlusCircle size={13} /> Thêm phiên</button>
    </div>
  );
}

function guessedId(sym) {
  const rule = DEFAULT_SYMBOL_RULES.find(([re]) => re.test(sym));
  return rule ? rule[1] : "fx";
}

// Cài đặt chung cho giờ đóng nến tự tính: giờ nghỉ, các phiên giao dịch và mã nào thuộc phiên nào.
export function CandleSessionsPanel({ settings, onChange, trades, accountNames }) {
  const s = settings;
  const date = vnToday();
  const quiet = s.autoQuiet || DEFAULT_AUTO_QUIET;
  const slots = s.autoSlots || DEFAULT_AUTO_SLOTS;
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

  // Chọn đúng phiên đoán theo tên thì xoá gán tay — để sau này sửa luật đoán là mã tự theo.
  const setMap = (sym, id) => {
    const next = { ...map };
    if (!id || id === guessedId(sym)) delete next[sym]; else next[sym] = id;
    onChange({ ...s, symbolSessions: next });
  };
  const custom = Array.isArray(s.sessions) ? s.sessions : [];

  return (
    <div className="account-form sl-sessions">
      <div className="sl-mode">
        <label className={`sl-mode-opt ${!slots.enabled ? "is-on" : ""}`}>
          <input type="radio" checked={!slots.enabled} onChange={() => onChange({ ...s, autoSlots: { ...slots, enabled: false } })} />
          <span>
            <b>Nhắc ngay khi nến đóng</b>, trừ lúc nghỉ từ{" "}
            <input className="input input-inline mono" style={{ width: 64 }} key={`f${quiet.from}`} defaultValue={quiet.from}
              onBlur={(e) => onChange({ ...s, autoQuiet: { ...quiet, from: e.target.value.trim() } })} />{" "}đến{" "}
            <input className="input input-inline mono" style={{ width: 64 }} key={`t${quiet.to}`} defaultValue={quiet.to}
              onBlur={(e) => onChange({ ...s, autoQuiet: { ...quiet, to: e.target.value.trim() } })} />
            <small> — nến đóng lúc nghỉ dồn một lần lúc {quiet.to || DEFAULT_AUTO_QUIET.to}. Nhiều mã khác phiên thì nhiều lần nhắc lệch nhau.</small>
          </span>
        </label>
        <label className={`sl-mode-opt ${slots.enabled ? "is-on" : ""}`}>
          <input type="radio" checked={!!slots.enabled} onChange={() => onChange({ ...s, autoSlots: { ...slots, enabled: true } })} />
          <span>
            <b>Chỉ nhắc ở các mốc</b>{" "}
            <input className="input input-inline mono" style={{ width: 260 }} key={`s${(slots.hours || []).join(",")}`}
              defaultValue={(slots.hours || []).join(", ")}
              onBlur={(e) => onChange({ ...s, autoSlots: { ...slots, hours: parseHoursInput(e.target.value) } })} />
            <small> — mỗi lệnh nhắc ở mốc đầu tiên SAU khi nến của nó đóng. Đồng/dầu đóng 11h thì nhắc cùng vàng lúc 12h; nến đóng lúc ngủ nhắc ở mốc sáng.</small>
          </span>
        </label>
      </div>

      <h4 className="rec-title" style={{ marginTop: 12 }}>Phiên giao dịch · giờ đóng nến hôm nay (giờ VN)</h4>
      <div className="sl-session-list">
        {sessions.map((x) => (
          <div key={x.id} className="sl-session-row">
            <div className="sl-session-name">
              <b>{x.name}</b>
              {x.note ? <span className="field-hint" style={{ margin: 0 }}>{x.note}</span> : null}
              <span className="field-hint" style={{ margin: 0 }}>
                <span className="mono">{x.spec || `${x.open} · ${x.length}h`}</span> {TZ_LABEL[x.tz] || x.tz} · hôm nay {sessionTodayVN(x, date)}
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
        Mỗi nguồn dữ liệu trên TradingView (OANDA, FUSIONMARKETS, FOREXCOM…) có phiên riêng nên cùng khung H4 mà giờ đóng nến khác nhau.
        Dùng nguồn khác các phiên có sẵn thì thêm phiên: trên chart bấm vào tên mã → <b>Thông tin mã</b>, chép dòng <b>Phiên</b> (VD 1700-1700) và múi giờ của nó.
      </p>

      <h4 className="rec-title" style={{ marginTop: 12 }}>Mã nào thuộc phiên nào</h4>
      {symbols.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Mã</th><th>Phiên</th><th>H4 hôm nay</th><th>H8</th><th>D</th></tr></thead>
            <tbody>
              {symbols.map((x) => {
                const ses = sessionFor(s, x.symbol);
                return (
                  <tr key={x.symbol}>
                    <td>
                      <b>{x.symbol}</b>
                      {x.open ? <span className="rec-tag">{x.open} lệnh mở</span> : null}
                      {!map[x.symbol] ? <span className="rec-tag" title="Chưa gán tay — đoán theo tên mã">tự đoán</span> : null}
                    </td>
                    <td>
                      <select className="input input-inline" value={ses.id} onChange={(e) => setMap(x.symbol, e.target.value)}>
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
