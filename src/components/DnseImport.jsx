import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Upload, X, CheckCircle2, AlertTriangle, PlusCircle, Wallet } from "lucide-react";
import { Field, ResourceSelect, StatCard } from "./ui.jsx";
import { readXlsx, xlsxSupported } from "../lib/xlsx.js";
import {
  applyDnseTripTo, buildDnseTrips, findOpenMatch, fmtMoney, fmtQty, holdingDays,
  parseDnseOrders, parseDnsePnl, tradeFromDnseOpen, tradeFromDnseTrip,
} from "../lib/dnseImport.js";

// Đoán tài khoản dùng để ghi cổ phiếu Việt: ưu tiên tên có "vn"/"stock"/"chứng khoán"/"dnse",
// không có thì chọn tài khoản ghi bằng VND, vẫn không có thì để người dùng tự chọn.
function guessVnAccount(accounts, trades) {
  const list = (accounts || []).filter((a) => a && a.name);
  const byName = list.find((a) => /vn|stock|dnse|chứng khoán|co phieu|cổ phiếu/i.test(a.name));
  if (byName) return byName.name;
  const vnd = list.filter((a) => String(a.currency || "").toUpperCase() === "VND");
  if (vnd.length === 1) return vnd[0].name;
  const used = new Set((trades || []).map((t) => t.account));
  const vndUsed = vnd.filter((a) => used.has(a.name));
  return vndUsed.length === 1 ? vndUsed[0].name : "";
}

function DropBox({ label, hint, file, onPick, onClear, required }) {
  const ref = useRef(null);
  return (
    <div className={`dnse-drop ${file && !file.error ? "dnse-drop-ok" : ""} ${file && file.error ? "dnse-drop-bad" : ""}`}>
      <div className="dnse-drop-head">
        <FileSpreadsheet size={15} />
        <b>{label}</b>
        <span className="field-hint">{required ? "bắt buộc" : "tuỳ chọn"}</span>
      </div>
      {file ? (
        <div className="dnse-drop-file">
          {file.error ? <AlertTriangle size={14} color="var(--loss)" /> : <CheckCircle2 size={14} color="var(--win)" />}
          <span className="dnse-file-name" title={file.name}>{file.name}</span>
          <button type="button" className="row-btn" title="Bỏ file này" onClick={onClear}><X size={13} /></button>
        </div>
      ) : (
        <p className="field-hint" style={{ margin: "2px 0 8px" }}>{hint}</p>
      )}
      {file && file.error ? <p className="error-text" style={{ marginTop: 2 }}>{file.error}</p> : null}
      <input ref={ref} type="file" accept=".xlsx" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onPick(f); e.target.value = ""; }} />
      <button type="button" className="btn btn-ghost" onClick={() => ref.current && ref.current.click()}>
        <Upload size={13} /> {file ? "Chọn file khác" : "Chọn file .xlsx"}
      </button>
    </div>
  );
}

// Ghi chú của DÒNG XEM TRƯỚC, không phải của lệnh — lệnh nhập vào để trống ô ghi chú cho
// người dùng tự viết. Ở đây chỉ nói những thứ có ý nghĩa lúc đang chọn nhập.
function rowNote(r) {
  const x = r.trip || r.lot;
  const bits = [];
  if (x.cashRatio > 0 && x.cashRatio < 1) bits.push(`margin ${Math.round((1 - x.cashRatio) * 100)}%`);
  else if (x.cashRatio >= 1) bits.push("tiền mặt");
  if (r.trip) bits.push(`phí+thuế ${fmtMoney(r.trip.costs)}đ`);
  return (
    <>
      {r.mode === "dup" ? <span>đã có trong nhật ký · </span> : null}
      {r.mode === "update" ? <span style={{ color: "var(--accent)" }}>điền kết quả vào lệnh đang mở · </span> : null}
      {r.trip && r.trip.source === "tinh" ? <span style={{ color: "var(--loss)" }}>chưa có lãi vay · </span> : null}
      {bits.join(" · ")}
    </>
  );
}

// Lệnh đã có trong nhật ký rồi thì bỏ tick sẵn — nhập lại lần hai sẽ nhân đôi lãi lỗ,
// mà lệch số kiểu đó rất khó phát hiện về sau.
// ĐẾM chứ không chỉ đánh dấu có/không: mua cùng một mã hai lần trong cùng một ngày là
// hai lô riêng, nếu nhật ký mới có một thì chỉ được coi MỘT dòng là trùng.
function existingCounts(trades, account) {
  const map = new Map();
  (trades || []).forEach((t) => {
    if (account && t.account !== account) return;
    const sym = String(t.symbol || "").trim().toUpperCase();
    if (!sym) return;
    const key = `${sym}|${t.entryDate || ""}|${t.exitDate || ""}`;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
}

// Trừ dần: mỗi lệnh trong nhật ký chỉ "che" được một dòng nhập.
function takeDup(counts, key) {
  const left = counts.get(key) || 0;
  if (left <= 0) return false;
  counts.set(key, left - 1);
  return true;
}

export function DnseImport({ trades, resources, onAddTrades }) {
  const accounts = resources.accounts || [];
  const symbols = resources.symbols || [];
  const [orderFile, setOrderFile] = useState(null);
  const [pnlFile, setPnlFile] = useState(null);
  const [account, setAccount] = useState(() => guessVnAccount(accounts, trades));
  const [picked, setPicked] = useState(null);
  const [added, setAdded] = useState(null);

  const pick = async (f, kind) => {
    const { rows, error } = await readXlsx(await f.arrayBuffer());
    if (error) {
      const bad = { name: f.name, error };
      if (kind === "orders") setOrderFile(bad); else setPnlFile(bad);
      return;
    }
    const res = kind === "orders" ? parseDnseOrders(rows) : parseDnsePnl(rows);
    const next = { name: f.name, error: res.error, ...res };
    if (kind === "orders") setOrderFile(next); else setPnlFile(next);
    setPicked(null);
    setAdded(null);
  };

  const result = useMemo(() => {
    if (!orderFile || orderFile.error) return null;
    return buildDnseTrips(orderFile.orders, pnlFile && !pnlFile.error ? pnlFile.groups : []);
  }, [orderFile, pnlFile]);

  const rows = useMemo(() => {
    if (!result) return [];
    const counts = existingCounts(trades, account);
    // Một lệnh trong nhật ký chỉ được một dòng nhập "nhận", không thì hai lô cùng mã cùng
    // ngày sẽ cùng trỏ vào một lệnh rồi ghi đè lẫn nhau.
    const claimed = new Set();
    const trips = result.trips.map((t) => {
      if (takeDup(counts, `${t.symbol}|${t.entryDate}|${t.exitDate}`)) {
        return { kind: "closed", key: t.id, trip: t, mode: "dup" };
      }
      // Chưa có bản đã đóng, nhưng có thể đã ghi tay từ lúc lệnh còn mở.
      const open = findOpenMatch(trades, account, t.symbol, t.entryDate, claimed);
      if (open) {
        claimed.add(open.id);
        return { kind: "closed", key: t.id, trip: t, mode: "update", target: open };
      }
      return { kind: "closed", key: t.id, trip: t, mode: "add" };
    });
    const opens = result.open.map((o) => ({
      kind: "open", key: o.id, lot: o,
      mode: takeDup(counts, `${o.symbol}|${o.date}|`) ? "dup" : "add",
    }));
    return [...trips, ...opens];
  }, [result, trades, account]);

  // Mặc định tick những lệnh chưa có trong nhật ký. Người dùng bấm thì giữ đúng ý người dùng.
  const chosen = picked || new Set(rows.filter((r) => r.mode !== "dup").map((r) => r.key));
  const toggle = (key) => {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key); else next.add(key);
    setPicked(next);
  };
  // Ô tick đầu bảng chỉ chọn những lệnh CHƯA có trong nhật ký. Chọn hết bằng một cú bấm mà
  // gồm cả lệnh đã có là nhân đôi lãi lỗ — muốn thêm lại thì vẫn tick tay từng dòng được.
  const fresh = rows.filter((r) => r.mode !== "dup");
  const toggleAll = () => {
    const allFresh = fresh.length > 0 && fresh.every((r) => chosen.has(r.key));
    setPicked(allFresh ? new Set() : new Set(fresh.map((r) => r.key)));
  };
  const dupChosen = rows.filter((r) => r.mode === "dup" && chosen.has(r.key));
  const dupList = [...new Set(rows.filter((r) => r.mode === "dup").map((r) => (r.trip ? r.trip.symbol : r.lot.symbol)))];
  const chosenRows = rows.filter((r) => chosen.has(r.key));
  const toUpdate = chosenRows.filter((r) => r.mode === "update");
  const toAdd = chosenRows.filter((r) => r.mode !== "update");

  const add = () => {
    const picks = rows.filter((r) => chosen.has(r.key));
    const fresh = picks.filter((r) => r.mode !== "update").map((r) => (
      r.kind === "closed"
        ? tradeFromDnseTrip(r.trip, account, symbols)
        : tradeFromDnseOpen(r.lot, account, symbols)
    ));
    const patched = picks.filter((r) => r.mode === "update").map((r) => applyDnseTripTo(r.target, r.trip));
    if (!fresh.length && !patched.length) return;
    onAddTrades(fresh, patched);
    setAdded({ added: fresh.length, updated: patched.length });
    setPicked(new Set());
  };

  const closedNet = result ? result.trips.reduce((s, t) => s + t.net, 0) : 0;
  const openValue = result ? result.open.reduce((s, o) => s + o.value, 0) : 0;
  const noPnl = result ? [...new Set(result.trips.filter((t) => t.source === "tinh").map((t) => t.symbol))] : [];

  if (!xlsxSupported()) {
    return (
      <div className="account-form">
        <h3 className="block-title" style={{ marginTop: 0 }}>Nhập lệnh từ DNSE</h3>
        <p className="error-text">Trình duyệt này chưa đọc được file .xlsx. Hãy mở bằng trình duyệt mới hơn, hoặc dùng tab "Đối chiếu sàn" với file .csv.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="account-form">
        <h3 className="block-title" style={{ marginTop: 0 }}>Nhập lệnh từ DNSE</h3>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          DNSE xuất hai báo cáo và mỗi cái thiếu đúng thứ cái kia có: <b>Lịch sử lệnh</b> có ngày mua
          nhưng không có lãi vay margin, <b>Lịch sử lãi lỗ</b> có lãi vay nhưng không có ngày mua.
          Thả cả hai vào đây, app tự ghép mua với bán theo FIFO rồi dựng thành lệnh — kể cả phần đang cầm.
        </p>
        <div className="dnse-drops">
          <DropBox required label="Lịch sử lệnh" file={orderFile}
            hint="Báo cáo có cả lệnh MUA và BÁN. Nhớ xuất đủ khoảng thời gian từ lúc mua."
            onPick={(f) => pick(f, "orders")} onClear={() => { setOrderFile(null); setPicked(null); }} />
          <DropBox label="Lịch sử lãi lỗ" file={pnlFile}
            hint="Để lấy lãi vay margin và con số sàn đã chốt. Xuất trùng khoảng thời gian với file trên."
            onPick={(f) => pick(f, "pnl")} onClear={() => { setPnlFile(null); setPicked(null); }} />
        </div>
        {orderFile && !orderFile.error ? (
          <p className="field-hint" style={{ marginTop: 10 }}>
            Đọc được <b>{orderFile.orders.length} lệnh đã khớp</b>
            {orderFile.skipped ? <> · bỏ qua {orderFile.skipped} lệnh huỷ / từ chối / hết hiệu lực</> : null}
            {pnlFile && !pnlFile.error ? <> · file lãi lỗ có {pnlFile.groups.length} lần bán</> : null}
          </p>
        ) : null}
      </div>

      {result ? (
        <>
          <div className="stat-grid" style={{ marginTop: 14 }}>
            <StatCard label="Lệnh đã đóng" value={String(result.trips.length)}
              sub={`Lãi lỗ ${fmtMoney(closedNet)}đ`} tone={closedNet > 0 ? "win" : closedNet < 0 ? "loss" : ""} />
            <StatCard label="Đang cầm" value={String(result.open.length)} sub={`Vốn ${fmtMoney(openValue)}đ`} />
            <StatCard label="Sẽ ghi vào nhật ký" value={toUpdate.length ? `${toAdd.length}+${toUpdate.length}` : String(toAdd.length)}
              sub={toUpdate.length
                ? `${toUpdate.length} lệnh bạn đã ghi tay lúc còn mở — điền kết quả vào, không tạo bản mới`
                : dupList.length ? `Đã có sẵn, bỏ tick: ${dupList.join(", ")}` : "Chưa lệnh nào trùng nhật ký"} />
          </div>

          {noPnl.length ? (
            <p className="error-text" style={{ marginTop: 10 }}>
              <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              {noPnl.join(", ")} nằm ngoài khoảng của file lãi lỗ nên <b>chưa trừ lãi vay margin</b> — số lãi đang cao hơn thực tế.
              Xuất lại Lịch sử lãi lỗ cho đủ khoảng thời gian rồi thả lại vào ô bên trên.
            </p>
          ) : null}
          {result.mismatches.length ? (
            <p className="error-text" style={{ marginTop: 10 }}>
              <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              Số tính ra lệch so với số DNSE chốt ở {result.mismatches.length} lần bán
              ({result.mismatches.map((m) => `${m.symbol} ${m.exitDate} lệch ${fmtMoney(m.diff)}đ`).join(", ")}).
              Kiểm tra lại xem hai file có đúng cùng một tiểu khoản không.
            </p>
          ) : null}
          {result.orphanSells.length ? (
            <p className="error-text" style={{ marginTop: 10 }}>
              {result.orphanSells.length} lệnh bán không tìm thấy lệnh mua tương ứng
              ({result.orphanSells.map((s) => `${s.symbol} ${fmtQty(s.qty)}cp`).join(", ")}) — cổ phiếu này mua trước
              khoảng thời gian của file. Xuất Lịch sử lệnh từ sớm hơn để ghép được.
            </p>
          ) : null}

          <div className="account-form" style={{ marginTop: 14 }}>
            <Field label="Ghi vào tài khoản" hint="Lãi lỗ tính bằng đồng, nên chọn tài khoản đang dùng cho cổ phiếu Việt Nam">
              <ResourceSelect value={account} onChange={(next) => { setAccount(next); setPicked(null); }}
                options={accounts.map((a) => a.name).filter(Boolean)} placeholder="Chọn tài khoản..." />
            </Field>
            {!account ? (
              <p className="error-text" style={{ marginTop: 6 }}>
                <Wallet size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                Chưa chọn tài khoản. Nếu chưa có tài khoản cho cổ phiếu Việt, tạo ở mục Tài nguyên → Tài khoản (đơn vị VND) rồi quay lại.
              </p>
            ) : null}
          </div>

          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="table dnse-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>
                    <input type="checkbox" title="Chọn những lệnh chưa có trong nhật ký"
                      checked={fresh.length > 0 && fresh.every((r) => chosen.has(r.key))} onChange={toggleAll} />
                  </th>
                  <th>Mã</th>
                  <th className="cell-num">KL</th>
                  <th>Mua</th>
                  <th>Bán</th>
                  <th className="cell-num">Giữ</th>
                  <th className="cell-num">Giá mua</th>
                  <th className="cell-num">Giá bán</th>
                  <th className="cell-num">Lãi/Lỗ</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const t = r.trip;
                  const o = r.lot;
                  const days = t ? holdingDays(t) : null;
                  return (
                    <tr key={r.key} className={r.mode === "dup" ? "dnse-row-dup" : r.mode === "update" ? "dnse-row-update" : ""}>
                      <td><input type="checkbox" checked={chosen.has(r.key)} onChange={() => toggle(r.key)} /></td>
                      <td><b>{t ? t.symbol : o.symbol}</b></td>
                      <td className="cell-num">{fmtQty(t ? t.qty : o.qty)}</td>
                      <td>{t ? t.entryDate : o.date}</td>
                      <td>{t ? t.exitDate : <span className="field-hint">đang cầm</span>}</td>
                      <td className="cell-num">{days === null ? "" : `${days}n`}</td>
                      <td className="cell-num">{fmtMoney(t ? t.entryPrice : o.price)}</td>
                      <td className="cell-num">{t ? fmtMoney(t.exitPrice) : ""}</td>
                      <td className="cell-num" style={t ? { color: t.net > 0 ? "var(--win)" : t.net < 0 ? "var(--loss)" : "" } : undefined}>
                        {t ? fmtMoney(t.net) : <span className="field-hint">{fmtMoney(o.value)} vốn</span>}
                      </td>
                      <td className="cell-soft">{rowNote(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {dupChosen.length ? (
            <p className="error-text" style={{ marginTop: 10 }}>
              <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              Đang tick {dupChosen.length} lệnh <b>đã có trong nhật ký</b> ({dupChosen.map((r) => (r.trip ? r.trip.symbol : r.lot.symbol)).join(", ")}) —
              thêm nữa là nhật ký có hai lệnh giống nhau và lãi lỗ bị tính hai lần.
            </p>
          ) : null}
          <div className="form-actions" style={{ marginTop: 12 }}>
            {added ? (
              <span className="field-hint" style={{ color: "var(--win)" }}>
                <CheckCircle2 size={13} style={{ verticalAlign: -2 }} />
                {added.added ? ` Đã thêm ${added.added} lệnh` : ""}
                {added.added && added.updated ? " ·" : ""}
                {added.updated ? ` Đã điền kết quả cho ${added.updated} lệnh đang mở` : ""}
              </span>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={add} disabled={!account || chosen.size === 0}>
              <PlusCircle size={14} />
              {toUpdate.length
                ? `Thêm ${toAdd.length} · cập nhật ${toUpdate.length} lệnh`
                : `Thêm ${toAdd.length} lệnh vào nhật ký`}
            </button>
          </div>
          <p className="field-hint" style={{ marginTop: 8 }}>
            Lệnh nào bạn đã ghi tay từ lúc còn mở thì app <b>điền kết quả vào chính lệnh đó</b> (ngày thoát,
            lãi lỗ, phí) — setup, chấm điểm, ảnh, đánh giá của bạn giữ nguyên, không đẻ thêm bản trùng.
            Lệnh nhập mới chỉ mang những gì sàn biết chắc: mã, ngày, lãi lỗ và phí. <b>Ô ghi chú để trống</b> —
            cột Ghi chú ở đây chỉ phục vụ lúc chọn, không ghi vào lệnh. Setup, lý do vào lệnh, tâm lý và
            đánh giá cũng để trống cho bạn tự viết. Khối lượng và giá thì xem ở bảng trên trước khi nhập.
          </p>
        </>
      ) : null}
    </div>
  );
}
