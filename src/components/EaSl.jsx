// SL hiện tại theo EA (mục ở Lịch nhắc) + canh chừng EA + đánh giá EA kéo SL, và lịch sử SL trong chi tiết lệnh.
// Dữ liệu (EA KeoSLDuoiNen → mt5-journal → app_data, alert-relay tick xử lý — supabase/functions/_shared/slBoard.ts, eaWatch.ts):
//   slMove:<login>:<ticket>:<nến>  dòng bảng SL mỗi lệnh mỗi nến (giữ 3 ngày); :0 = mốc khớp / đóng lệnh
//   eaWatch                         cảnh báo "EA chưa báo SL" đang mở, lệnh đã đóng tra từ hộp chờ
//   slHist:<login>:<ticket>         lịch sử SL từng lệnh (giữ luôn)
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BellOff, Eye, EyeOff, RefreshCw } from "lucide-react";
import { computeResult, fmtR, safeGet, safeList } from "../lib/helpers.js";
import { DetailGroup, Field, Switch } from "./ui.jsx";
import { vnTime } from "../../supabase/functions/_shared/alertRecheck.ts";
import { shortSymbol } from "../../supabase/functions/_shared/mt5Fill.ts";
import { openPositions, slAfter, SL_ICON } from "../../supabase/functions/_shared/slBoard.ts";
import { EA_WATCH_KEY, histFacts, SL_HIST_PREFIX, watchCfg } from "../../supabase/functions/_shared/eaWatch.ts";

const digitsOnly = (v) => String(v || "").replace(/\D/g, "");
const pad = (n) => String(n).padStart(2, "0");
// "14:05 08/11" giờ VN từ giây UTC
const dt = (sec) => {
  const x = new Date(sec * 1000 + 7 * 3600 * 1000);
  return `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())} ${pad(x.getUTCDate())}/${pad(x.getUTCMonth() + 1)}`;
};
const tfLabel = (tf) => (tf === "D1" ? "D" : tf || "");
const orderNo = (p) => Number(String(p.no || "").split("/")[0]) || 999;

export function mt5AccountName(login, resources, fallback) {
  const a = ((resources && resources.accounts) || []).find((x) => x && digitsOnly(x.mt5Login) === String(login));
  return (a && a.name) || fallback || `#${login}`;
}

// Tải dòng bảng SL + trạng thái canh chừng; tải lại mỗi phút khi tab đang mở
export function useEaData(active = true) {
  const [st, setSt] = useState({ rows: null, watch: null, at: 0 });
  const load = useCallback(async () => {
    const [rows, watch] = await Promise.all([safeList("slMove:"), safeGet(EA_WATCH_KEY, null)]);
    setSt({ rows: rows ? rows.map((r) => r.value).filter(Boolean) : null, watch: watch || {}, at: Date.now() });
  }, []);
  useEffect(() => {
    if (!active) return undefined;
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => clearInterval(id);
  }, [active, load]);
  return { ...st, load };
}

// Lệnh đang mở theo EA; lệnh trong nhật ký đã có ngày thoát (EA báo đóng / tự điền) thì bỏ
export function eaPositions(data, trades) {
  if (!data || !data.rows) return null;
  const closed = new Set((trades || []).filter((t) => t && t.ticket && (t.exitDate || t.mt5Closed)).map((t) => String(t.ticket)));
  const gone = (data.watch && data.watch.closed) || {};
  return openPositions(data.rows, (login, ticket) => closed.has(String(ticket)) || !!gone[`${login}:${ticket}`]);
}

const activeAlarms = (data) => Object.entries((data && data.watch && data.watch.alarms) || {}).filter(([, a]) => a && !a.okAt);

export function eaSummary(data, trades, resources, settings) {
  const hide = watchCfg(settings && settings.eaWatch).hide;
  const all = eaPositions(data, trades);
  if (!all) return data && data.at ? "Không tải được dữ liệu EA" : "Đang tải…";
  const pos = all.filter((p) => !hide.includes(p.login));
  const alarms = activeAlarms(data).filter(([login]) => !hide.includes(login));
  const warn = alarms.length ? ` · ⚠️ EA ${alarms.map(([login]) => mt5AccountName(login, resources, (pos.find((p) => p.login === login) || {}).accountName)).join(", ")} chưa báo` : "";
  const off = watchCfg(settings && settings.eaWatch).enabled ? "" : " · đang tắt canh EA";
  if (!pos.length) return `Không có lệnh đang mở${warn}${off}`;
  const accs = new Set(pos.map((p) => p.login)).size;
  const noSl = pos.filter((p) => !p.marker && !(p.sl > 0)).length;
  return `${accs} tài khoản · ${pos.length} lệnh · đã BE ${pos.filter((p) => p.be).length}/${pos.length}${noSl ? ` · ⚠️ ${noSl} lệnh chưa có SL` : ""}${warn}${off}`;
}

function groupByAccount(pos, resources) {
  const m = new Map();
  for (const p of pos) {
    if (!m.has(p.login)) m.set(p.login, { login: p.login, name: mt5AccountName(p.login, resources, p.accountName), list: [] });
    m.get(p.login).list.push(p);
  }
  for (const g of m.values()) g.list.sort((a, b) => orderNo(a) - orderNo(b) || a.symbol.localeCompare(b.symbol));
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function EaRow({ p, now }) {
  const px = (v) => (v > 0 ? Number(v).toFixed(p.digits || 5) : "—");
  const noSl = !p.marker && !(p.sl > 0);
  const at = p.bar ? vnTime(p.bar * 1000, now) : "";
  const icon = p.marker ? "🆕" : noSl ? "⚠️" : SL_ICON[p.status] || "•";
  const what = p.marker ? "mới khớp — chờ nến đầu đóng"
    : noSl ? "CHƯA CÓ SL"
      : p.status === "wait" ? `chưa dời được (${p.note || "đang chờ"})`
        : p.status === "moved" ? `dời lúc nến ${at}${p.note.startsWith("dời sớm") ? ` · ${p.note}` : ""}`
          : p.status === "be" ? `về BE lúc nến ${at}`
            : p.status === "keep" ? `giữ · nến ${at}`
              : p.status === "skip" ? `mới vào, chưa kéo · nến ${at}`
                : p.status === "now" ? `lúc EA khởi động ${at}` : "";
  return (
    <div className={`easl-row ${noSl || p.status === "wait" ? "easl-row-warn" : ""}`}>
      <span className="easl-icon">{icon}</span>
      <span className="easl-no mono">{p.no}</span>
      <span className="easl-sym"><b>{shortSymbol(p.symbol)}</b> {p.side === "buy" ? "Buy" : "Sell"}</span>
      <span className="easl-sl mono">{p.marker ? "" : `SL ${px(p.sl)}`}</span>
      <span className={`easl-be ${p.be ? "text-win" : ""}`}>{p.marker ? "" : p.be ? "đã BE" : "chưa BE"}</span>
      <span className="easl-what">{what}</span>
    </div>
  );
}

function EaAccount({ g, alarm, muted, onMute, onHide, watchOn, now }) {
  const real = g.list.filter((p) => !p.marker);
  const last = Math.max(0, ...real.map((p) => p.bar));
  const tfs = [...new Set(g.list.map((p) => tfLabel(p.tf)).filter(Boolean))].join("/");
  const active = alarm && !alarm.okAt;
  return (
    <div className={`easl-acc ${active ? "easl-alarm" : ""}`}>
      <div className="easl-head">
        <b>{g.name}</b>
        <span className="easl-meta">
          {tfs ? `khung ${tfs} · ` : ""}{last ? `báo lúc nến ${vnTime(last * 1000, now)}` : "chưa có dòng nến"} · đã BE {real.filter((p) => p.be).length}/{g.list.length}
        </span>
        {active ? <span className="easl-warn">⚠️ EA chưa báo nến {vnTime(alarm.bar, now)}</span> : null}
        {watchOn ? (
          <button type="button" className={`easl-mute ${muted ? "on" : ""}`} onClick={onMute}
            title={muted ? "Đang không canh tài khoản này — bấm để canh lại" : "Bấm để thôi canh tài khoản này (vd tắt EA có chủ ý)"}>
            {muted ? <BellOff size={12} /> : <Bell size={12} />}{muted ? " không canh" : ""}
          </button>
        ) : null}
        <button type="button" className={`easl-mute ${watchOn ? "" : "easl-push"}`} onClick={onHide}
          title="Ẩn tài khoản này (test, demo…): không hiện ở đây, không lên tin sáng, không canh">
          <EyeOff size={12} /> Ẩn
        </button>
      </div>
      <div className="easl-rows">{g.list.map((p) => <EaRow key={p.key} p={p} now={now} />)}</div>
    </div>
  );
}

export function EaSlBody({ settings, onChange, resources, trades, data }) {
  const cfg = watchCfg(settings.eaWatch);
  // cfg.mute đã gộp cả tài khoản ẩn (cho máy chủ) — lưu lại thì dùng danh sách "không canh" gốc
  const raw = (settings.eaWatch && Array.isArray(settings.eaWatch.mute)) ? settings.eaWatch.mute.map(String) : [];
  const setCfg = (patch) => onChange({ ...settings, eaWatch: { ...cfg, mute: raw, ...patch } });
  const pos = eaPositions(data, trades);
  const all = pos ? groupByAccount(pos, resources) : [];
  const groups = all.filter((g) => !cfg.hide.includes(g.login));
  const alarms = (data.watch && data.watch.alarms) || {};
  // Cảnh báo của tài khoản không còn lệnh nào trên bảng (vd lệnh vừa đóng) vẫn hiện cho biết
  const orphan = activeAlarms(data).filter(([login]) => !cfg.hide.includes(login) && !groups.some((g) => g.login === login));
  const now = Date.now();
  const toggleMute = (login) => setCfg({ mute: raw.includes(login) ? raw.filter((x) => x !== login) : [...raw, login] });
  const hideAcc = (login) => setCfg({ hide: [...cfg.hide, login] });
  const showAcc = (login) => setCfg({ hide: cfg.hide.filter((x) => x !== login) });
  const hiddenNames = cfg.hide.map((login) => {
    const g = all.find((x) => x.login === login);
    return { login, name: g ? g.name : mt5AccountName(login, resources, `#${login}`) };
  });
  return (
    <>
      <p className="plan-hint">
        SL của mọi lệnh EA đang quản, theo lần EA báo gần nhất (mỗi lần nến khung đóng) — như bảng 🛡 trên Telegram nhưng xem lúc nào cũng được.
        {" "}<b>Canh chừng EA</b> (công tắc góc trên): tài khoản có lệnh mà quá <b>{cfg.graceMin} phút</b> sau giờ đóng nến chưa thấy bảng SL thì bot
        báo <code>⚠️ EA CHƯA BÁO SL</code> vào nhóm MT5 — EA tắt, VPS treo, Algo Trading tắt, EA chưa nạp bản mới… EA báo lại thì tin tự sửa thành ✅.
        Cổ phiếu và khung dưới H1 không canh.
      </p>
      <div className="easl-cfg">
        <Field label="Báo sau giờ đóng nến (phút)">
          <input type="number" className="input input-inline" min={3} max={120} step={1} value={cfg.graceMin}
            onChange={(e) => setCfg({ graceMin: Number(e.target.value) })} />
        </Field>
        <span className="field-hint easl-upd">Cập nhật {data.at ? vnTime(data.at, now) : "—"} · tự tải lại mỗi phút</span>
        <button type="button" className="btn btn-ghost btn-xs" onClick={data.load}><RefreshCw size={12} /> Tải lại</button>
      </div>
      {orphan.map(([login, a]) => (
        <div key={login} className="easl-acc easl-alarm">
          <div className="easl-head"><b>{mt5AccountName(login, resources, `#${login}`)}</b><span className="easl-warn">⚠️ EA chưa báo nến {vnTime(a.bar, now)}</span></div>
        </div>
      ))}
      {!pos ? <p className="field-hint">{data.at ? "Không tải được dữ liệu EA — thử Tải lại." : "Đang tải…"}</p>
        : !groups.length ? <p className="field-hint">Không có lệnh đang mở (EA chỉ báo khi có lệnh; dữ liệu 3 ngày gần nhất).</p>
          : groups.map((g) => (
            <EaAccount key={g.login} g={g} alarm={alarms[g.login]} muted={raw.includes(g.login)} onMute={() => toggleMute(g.login)}
              onHide={() => hideAcc(g.login)} watchOn={cfg.enabled} now={now} />
          ))}
      {hiddenNames.length ? (
        <p className="field-hint easl-hidden">
          <Eye size={12} /> Đã ẩn: {hiddenNames.map((h, i) => (
            <span key={h.login}>{i ? " · " : ""}{h.name} <button type="button" className="plan-link" onClick={() => showAcc(h.login)}>hiện lại</button></span>
          ))}
        </p>
      ) : null}
      <EaStats trades={trades} resources={resources} />
    </>
  );
}

// ───────────── Đánh giá EA kéo SL ─────────────
// Lệnh đã đóng (có R) có lịch sử SL → nhóm theo cách kết thúc. Mục đích: xem thông số 2 nến (chưa BE) / 3 nến (đã BE)
// có hợp không — về BE rồi bị quét ở BE nhiều = khoá BE sớm; dời SL mà vẫn thua nhiều = SL kéo chưa đủ chặt…

const BUCKETS = [
  ["initial", "Chạm SL ban đầu", "chưa dời lần nào, thua"],
  ["movedLoss", "Đã dời SL, vẫn thua", "SL kéo chưa qua giá vào"],
  ["be", "Hòa vốn", "R trong khoảng ±0,3"],
  ["win", "Có lãi", "R trên +0,3"],
];
const bucketOf = (r, moves) => (r > 0.3 ? "win" : r >= -0.3 ? "be" : moves ? "movedLoss" : "initial");

export function eaStats(hists, trades, resources) {
  const byTicket = new Map((trades || []).filter((t) => t && t.ticket).map((t) => [String(t.ticket), t]));
  const items = [];
  for (const h of hists || []) {
    const t = h && byTicket.get(String(h.ticket));
    if (!t) continue;
    const res = computeResult(t);
    if (res.status !== "closed" || res.rr === null) continue;
    const f = histFacts(h);
    if (!f.candles) continue;
    items.push({ f, r: res.rr, bucket: bucketOf(res.rr, f.moves), account: t.account || mt5AccountName(h.login, resources, h.accountName) });
  }
  const avg = (list, fn) => (list.length ? list.reduce((a, x) => a + fn(x), 0) / list.length : null);
  const sum = (list) => {
    const reached = list.filter((x) => x.f.reachedBe);
    const bars = list.filter((x) => x.f.barsToBe !== null);
    return {
      n: list.length, avgR: avg(list, (x) => x.r), avgMoves: avg(list, (x) => x.f.moves),
      beRate: list.length ? reached.length / list.length : null, avgBars: avg(bars, (x) => x.f.barsToBe), barsN: bars.length,
      stoppedAtBe: reached.filter((x) => x.bucket === "be").length,
      buckets: Object.fromEntries(BUCKETS.map(([k]) => {
        const b = list.filter((x) => x.bucket === k);
        return [k, { n: b.length, avgR: avg(b, (x) => x.r) }];
      })),
    };
  };
  const names = [...new Set(items.map((x) => x.account))].sort();
  return { all: sum(items), byAccount: names.map((name) => ({ name, ...sum(items.filter((x) => x.account === name)) })) };
}

const pct = (v) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const num1 = (v) => (v === null ? "—" : String(Number(v.toFixed(1))).replace(".", ","));

function EaStats({ trades, resources }) {
  const [open, setOpen] = useState(false);
  const [hists, setHists] = useState(null);
  useEffect(() => {
    if (open && hists === null) safeList(SL_HIST_PREFIX).then((r) => setHists(r ? r.map((x) => x.value).filter(Boolean) : []));
  }, [open, hists]);
  const st = useMemo(() => (hists ? eaStats(hists, trades, resources) : null), [hists, trades, resources]);
  const a = st && st.all;
  return (
    <details className="easl-stats" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>📊 Đánh giá EA kéo SL</summary>
      {!st ? <p className="field-hint">Đang tải lịch sử SL…</p> : !a.n ? (
        <p className="field-hint">Chưa có lệnh đã đóng nào có lịch sử SL. Lịch sử bắt đầu lưu từ 08/11/2026 (bảng SL của EA v2.91) — sau vài tuần lệnh mới đóng sẽ đủ để xem.</p>
      ) : (
        <>
          <p className="easl-stat-line">
            <b>{a.n}</b> lệnh · tới BE <b>{pct(a.beRate)}</b>
            {a.avgBars !== null ? <> · trung bình <b>{num1(a.avgBars)}</b> nến tới BE</> : null}
            {" "}· dời SL trung bình {num1(a.avgMoves)} lần · về BE rồi bị quét ở BE: <b>{a.stoppedAtBe}</b>
          </p>
          <table className="easl-table">
            <thead><tr><th>Kết thúc</th><th className="num">Lệnh</th><th className="num">R trung bình</th></tr></thead>
            <tbody>
              {BUCKETS.map(([k, label, hint]) => (
                <tr key={k}>
                  <td>{label} <small className="field-hint">— {hint}</small></td>
                  <td className="num">{a.buckets[k].n}</td>
                  <td className={`num ${a.buckets[k].avgR > 0 ? "text-win" : a.buckets[k].avgR < 0 ? "text-loss" : ""}`}>{fmtR(a.buckets[k].avgR)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {st.byAccount.length > 1 ? (
            <table className="easl-table">
              <thead><tr><th>Tài khoản</th><th className="num">Lệnh</th><th className="num">Tới BE</th><th className="num">Nến tới BE</th><th className="num">Bị quét ở BE</th><th className="num">R TB</th></tr></thead>
              <tbody>
                {st.byAccount.map((x) => (
                  <tr key={x.name}>
                    <td>{x.name}</td><td className="num">{x.n}</td><td className="num">{pct(x.beRate)}</td>
                    <td className="num">{num1(x.avgBars)}</td><td className="num">{x.stoppedAtBe}</td>
                    <td className={`num ${x.avgR > 0 ? "text-win" : x.avgR < 0 ? "text-loss" : ""}`}>{fmtR(x.avgR)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <p className="field-hint" style={{ marginTop: 8 }}>
            Nến tới BE chỉ tính lệnh có lịch sử từ nến đầu ({a.barsN} lệnh). Về BE rồi bị quét ở BE nhiều → khoá BE sớm (thử thêm nến trước BE);
            dời SL mà vẫn thua nhiều → SL kéo còn xa giá. Chi tiết từng lệnh: mở lệnh trong Nhật ký → mục Lịch sử SL.
          </p>
        </>
      )}
    </details>
  );
}

// ───────────── Lịch sử SL trong chi tiết lệnh ─────────────

function histText(e, px) {
  if (e.st === "moved") return `dời ${px(e.old)} → ${px(e.nw)}${e.note && e.note.startsWith("dời sớm") ? ` (${e.note})` : ""}`;
  if (e.st === "be") return `về BE ${px(e.old)} → ${px(e.nw)}`;
  if (e.st === "keep") return `giữ ${px(e.old)}`;
  if (e.st === "skip") return `mới vào, chưa kéo · SL ${px(e.old)}`;
  if (e.st === "wait") return `chưa dời được (${e.note || "đang chờ"}) · SL ${px(e.old)}, sẽ dời → ${px(e.nw)}`;
  if (e.st === "closed") return `EA đóng lệnh (${e.note || "giá vượt SL mới"})`;
  if (e.st === "now") return `EA khởi động · SL ${px(e.old)}`;
  return "";
}

export function SlHistoryGroup({ trade, resources }) {
  const ticket = String((trade && trade.ticket) || "");
  const account = (trade && trade.account) || "";
  const [h, setH] = useState(undefined); // undefined = đang tải, null = không có
  const [all, setAll] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!ticket) { setH(null); return undefined; }
    (async () => {
      const acc = ((resources && resources.accounts) || []).find((a) => a && a.name === account);
      const login = acc ? digitsOnly(acc.mt5Login) : "";
      let v = login ? await safeGet(`${SL_HIST_PREFIX}${login}:${ticket}`, null) : null;
      if (!v) {
        const list = await safeList(SL_HIST_PREFIX);
        v = (list || []).map((x) => x.value).find((x) => x && String(x.ticket) === ticket) || null;
      }
      if (alive) setH(v && Array.isArray(v.entries) && v.entries.length ? v : null);
    })();
    return () => { alive = false; };
  }, [ticket, account, resources]);
  if (!h) return null;
  const f = histFacts(h);
  const px = (v) => (v > 0 ? Number(v).toFixed(h.digits || 5) : "—");
  const buy = h.side !== "sell";
  const beyond = (sl) => h.open > 0 && sl > 0 && (buy ? sl >= h.open : sl <= h.open);
  const entries = h.entries;
  const shown = all ? entries : entries.slice(-12);
  const be = f.reachedBe ? (f.barsToBe ? `về BE sau ${f.barsToBe} nến` : "đã về BE") : "chưa về BE";
  return (
    <DetailGroup title="Lịch sử SL (EA)">
      <p className="easl-hist-sum">
        Dời <b>{f.moves}</b> lần · {be} · SL {px(f.firstSl)} → <b>{px(f.lastSl)}</b>
        {f.closedByEa ? " · EA đóng lệnh" : ""}
        {h.openedAt ? <span className="field-hint"> · vào {dt(h.openedAt)}{h.closedAt ? ` · đóng ${dt(h.closedAt)}` : ""}</span> : null}
      </p>
      <div className="easl-hist">
        {entries.length > shown.length ? <button type="button" className="plan-link" onClick={() => setAll(true)}>… {entries.length - shown.length} nến trước — xem hết</button> : null}
        {shown.map((e) => (
          <div key={e.bar} className="easl-hist-row">
            <span className="easl-hist-time">{dt(e.bar)}{e.tf ? ` ${tfLabel(e.tf)}` : ""}</span>
            <span>{SL_ICON[e.st] || "•"} {histText(e, px)}{e.st !== "closed" && beyond(slAfter(e)) ? <small className="text-win"> · đã BE</small> : null}</span>
          </div>
        ))}
      </div>
    </DetailGroup>
  );
}

// Trang riêng "SL hiện tại (EA)" (menu Theo dõi) — công tắc canh chừng EA ở đầu trang
export function EaSlPage({ settings, onChange, resources, trades }) {
  const data = useEaData(true);
  const cfg = watchCfg(settings.eaWatch);
  return (
    <div className="reminders-page">
      <div className="reminders-page-head easl-page-head">
        <h2 style={{ fontSize: 19 }}>SL hiện tại (EA)</h2>
        <span className="easl-page-sum">{eaSummary(data, trades, resources, settings)}</span>
        <span className="easl-page-sw">
          <span className="field-hint">Canh chừng EA</span>
          <Switch checked={cfg.enabled} onChange={(v) => onChange({ ...settings, eaWatch: { ...(settings.eaWatch || {}), enabled: v } })}
            title={cfg.enabled ? "Đang canh — bấm để tắt" : "Đang tắt — bấm để bật"} />
        </span>
      </div>
      <EaSlBody settings={settings} onChange={onChange} resources={resources} trades={trades} data={data} />
    </div>
  );
}
