import { useMemo, useRef } from "react";
import { FileSpreadsheet, Upload, X, CheckCircle2, AlertTriangle, PlusCircle, Wallet, Flag, Scale, RotateCcw, CalendarClock } from "lucide-react";
import { Field, ResourceSelect, useRemembered } from "./ui.jsx";
import { readXlsx, xlsxSupported } from "../lib/xlsx.js";
import { accountSyncsTime, computeResult, tradeCompletion } from "../lib/helpers.js";
import { FollowUp } from "./BrokerReconcile.jsx";
import {
  applyDnsePlan, buildDnsePositions, buildDnseTrips, fmtMoney, fmtQty, parseDnseOrders, parseDnsePnl,
  reconcileDnse, tradeFromDnsePosition, withDnseTimes, DNSE_DATE_TOLERANCE_DAYS, DNSE_PROFIT_TOLERANCE,
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

const dm = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");
const vnd = (n) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? "—" : `${fmtMoney(n)}đ`);
const tone = (n) => (n > 0 ? "text-win" : n < 0 ? "text-loss" : "");

// Các lần bán của một vị thế, đọc một dòng: "21/09 50% · 02/10 50%" — nhìn là biết nhả mấy lần.
function sellsText(pos) {
  if (!pos.legs.length) return "—";
  return pos.legs.map((l) => `${dm(l.exitDate)} ${fmtQty(l.qty)}cp`).join(" · ");
}

function statusText(pos) {
  if (!pos.legs.length) return `đang cầm ${fmtQty(pos.openQty)}cp`;
  if (!pos.closed) return `đã bán ${fmtQty(pos.soldQty)}/${fmtQty(pos.lotQty)}cp · còn cầm ${fmtQty(pos.openQty)}`;
  return pos.legs.length > 1 ? `đã bán hết · ${pos.legs.length} lần` : "đã bán hết";
}

function marginText(pos) {
  if (pos.cashRatio > 0 && pos.cashRatio < 1) return `margin ${Math.round((1 - pos.cashRatio) * 100)}%`;
  return pos.cashRatio >= 1 ? "tiền mặt" : "";
}

// Nói bằng lời cái sắp ghi vào, đọc xong mới bấm.
function planSummary(plan) {
  const parts = [];
  if (plan.partials.length) parts.push(`${plan.partials.length} lần chốt bớt (${plan.partials.map((x) => `${x.percent}%`).join(" + ")})`);
  if (plan.close) parts.push(`đóng ${dm(plan.close.exitDate)} · lãi theo giá ${vnd(Number(plan.close.profit))}`);
  else if (plan.replace) parts.push("bỏ ngày thoát — sàn còn cầm");
  if (plan.fees !== null) parts.push(`phí+thuế+lãi vay ${vnd(Number(plan.fees))}`);
  return parts.join(" · ");
}

function SymbolCell({ pos }) {
  return (
    <>
      <b>{pos.symbol}</b>
      {pos.legs.length > 1 ? <span className="rec-tag">{pos.legs.length} lần bán</span> : null}
      {pos.noInterest ? <span className="rec-tag" title="Nằm ngoài khoảng của file lãi lỗ — chưa trừ lãi vay">chưa có lãi vay</span> : null}
    </>
  );
}

export function DnseImport({ trades, resources, onAddTrades, onCreateTrade, onEditTrade, onUpdateTrade }) {
  const accounts = resources.accounts || [];
  const symbols = resources.symbols || [];
  // Bấm "Ghi vào nhật ký" / "Mở lệnh" là sang trang form — giữ file đã nạp để lưu xong quay lại
  // vẫn soát tiếp được, khỏi nạp lại hai file từ đầu.
  const [orderFile, setOrderFile] = useRemembered("dnse.orders", null);
  const [pnlFile, setPnlFile] = useRemembered("dnse.pnl", null);
  const [account, setAccount] = useRemembered("dnse.account", () => guessVnAccount(accounts, trades));
  const [done, setDone] = useRemembered("dnse.done", "");
  const [touched, setTouched] = useRemembered("dnse.touched", []);
  const acc = accounts.find((a) => a.name === account);
  const syncTime = accountSyncsTime(acc);
  const touch = (list) => setTouched((prev) => Array.from(new Set([...prev, ...list.map((t) => t.id)])));
  // Điền kết quả xong lệnh rời khỏi bảng vừa bấm — giữ lại ở danh sách "còn phải điền nốt"
  // như bên Exness, đọc lại từ `trades` để điền đủ ở đâu là tự biến mất ở đây.
  const followUp = useMemo(() => {
    const byId = new Map((trades || []).map((t) => [t.id, t]));
    return touched.map((id) => byId.get(id)).filter((t) => t && tradeCompletion(t).percent < 100);
  }, [touched, trades]);

  const pick = async (f, kind) => {
    const { rows, error } = await readXlsx(await f.arrayBuffer());
    const set = kind === "orders" ? setOrderFile : setPnlFile;
    if (error) { set({ name: f.name, error }); return; }
    const res = kind === "orders" ? parseDnseOrders(rows) : parseDnsePnl(rows);
    set({ name: f.name, ...res });
    setDone("");
  };

  const result = useMemo(() => {
    if (!orderFile || orderFile.error) return null;
    return buildDnseTrips(orderFile.orders, pnlFile && !pnlFile.error ? pnlFile.groups : []);
  }, [orderFile, pnlFile]);
  const positions = useMemo(() => (result ? buildDnsePositions(result) : []), [result]);
  // Đọc lại từ `trades` mỗi lần: bấm nút nào là dòng đó tự chuyển nhóm / biến mất.
  const rec = useMemo(
    () => (result && account ? reconcileDnse(positions, trades, account, orderFile.orders, { syncTime }) : null),
    [result, positions, trades, account, orderFile, syncTime]
  );

  const reset = () => { setOrderFile(null); setPnlFile(null); setDone(""); setTouched([]); };
  const addDirect = (list) => {
    const fresh = list.map((pos) => tradeFromDnsePosition(pos, account, symbols));
    if (!fresh.length) return;
    onAddTrades(fresh, []);
    touch(fresh);
    setDone(`Đã thêm ${fresh.length} lệnh vào nhật ký.`);
  };
  const applyPlans = (list, label) => {
    if (!list.length) return;
    const next = list.map((x) => applyDnsePlan(x.trade, x.plan));
    onUpdateTrade(next);
    touch(next);
    setDone(`${label} cho ${list.length} lệnh.`);
  };
  const applyTimes = (list) => {
    if (!list.length) return;
    onUpdateTrade(list.map((x) => withDnseTimes(x.trade, x.pos, syncTime)));
    setDone(`Đã lấy ngày/giờ theo sàn cho ${list.length} lệnh.`);
  };

  if (!xlsxSupported()) {
    return (
      <div className="account-form">
        <h3 className="block-title" style={{ marginTop: 0 }}>Đối chiếu DNSE</h3>
        <p className="error-text">Trình duyệt này chưa đọc được file .xlsx. Hãy mở bằng trình duyệt mới hơn.</p>
      </div>
    );
  }

  const noPnl = result && pnlFile && !pnlFile.error
    ? [...new Set(result.trips.filter((t) => t.source === "tinh").map((t) => t.symbol))] : [];

  return (
    <div className="account-form">
      <h3 className="block-title" style={{ marginTop: 0 }}>Đối chiếu DNSE</h3>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        DNSE xuất hai báo cáo và mỗi cái thiếu đúng thứ cái kia có: <b>Lịch sử lệnh</b> có ngày mua
        nhưng không có lãi vay margin, <b>Lịch sử lãi lỗ</b> có lãi vay nhưng không có ngày mua.
        Thả cả hai vào đây, app ghép mua với bán theo FIFO — <b>một lần mua là một lệnh</b>, bán nhiều
        lần thì thành các lần chốt bớt của lệnh đó — rồi so với nhật ký.
      </p>
      <div className="dnse-drops">
        <DropBox required label="Lịch sử lệnh" file={orderFile}
          hint="Báo cáo có cả lệnh MUA và BÁN. Nhớ xuất đủ khoảng thời gian từ lúc mua."
          onPick={(f) => pick(f, "orders")} onClear={() => setOrderFile(null)} />
        <DropBox label="Lịch sử lãi lỗ" file={pnlFile}
          hint="Để lấy lãi vay margin và con số sàn đã chốt. Xuất trùng khoảng thời gian với file trên."
          onPick={(f) => pick(f, "pnl")} onClear={() => setPnlFile(null)} />
      </div>
      {orderFile && !orderFile.error ? (
        <p className="field-hint" style={{ marginTop: 10 }}>
          Đọc được <b>{orderFile.orders.length} lệnh đã khớp</b>
          {orderFile.skipped ? <> · bỏ qua {orderFile.skipped} lệnh huỷ / từ chối / hết hiệu lực</> : null}
          {pnlFile && !pnlFile.error ? <> · file lãi lỗ có {pnlFile.groups.length} lần bán</> : null}
        </p>
      ) : null}

      {result ? (
        <>
          <div style={{ marginTop: 12, maxWidth: 360 }}>
            <Field label="Tài khoản trong nhật ký" hint="Tài khoản đang dùng cho cổ phiếu Việt Nam (VND)">
              <ResourceSelect value={account} onChange={(next) => setAccount(next)}
                options={accounts.map((a) => a.name).filter(Boolean)} placeholder="Chọn tài khoản..." />
            </Field>
          </div>
          {!account ? (
            <p className="error-text" style={{ marginTop: 6 }}>
              <Wallet size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              Chọn tài khoản để đối chiếu. Chưa có thì tạo ở Tài nguyên → Tài khoản (đơn vị VND) rồi quay lại.
            </p>
          ) : null}

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
              ({result.orphanSells.map((x) => `${x.symbol} ${fmtQty(x.qty)}cp`).join(", ")}) — cổ phiếu này mua trước
              khoảng thời gian của file. Xuất Lịch sử lệnh từ sớm hơn để ghép được.
            </p>
          ) : null}

          {rec ? (
            <>
              <div className="rec-summary">
                <span className="rec-chip">{positions.length} lệnh trên sàn</span>
                <span className="rec-chip rec-chip-ok"><CheckCircle2 size={13} /> {rec.ok.length} khớp nhật ký</span>
                {rec.missing.length ? <span className="rec-chip rec-chip-bad"><AlertTriangle size={13} /> {rec.missing.length} chưa ghi nhật ký</span> : null}
                {rec.outcome.length ? <span className="rec-chip rec-chip-bad"><Flag size={13} /> {rec.outcome.length} chưa ghi kết quả</span> : null}
                {rec.off.length ? <span className="rec-chip rec-chip-warn">{rec.off.length} lệch tiền</span> : null}
                {rec.time.length ? <span className="rec-chip rec-chip-warn">{rec.time.length} lệch {syncTime ? "ngày/giờ" : "ngày"}</span> : null}
                {rec.extra.length ? <span className="rec-chip rec-chip-warn">{rec.extra.length} chỉ có trong nhật ký</span> : null}
                <button type="button" className="btn btn-ghost" onClick={reset}><RotateCcw size={13} /> Xoá file</button>
              </div>
              {done ? <p className="field-hint" style={{ color: "var(--win)" }}><CheckCircle2 size={13} style={{ verticalAlign: -2 }} /> {done}</p> : null}

              <FollowUp list={followUp} resources={resources} onEditTrade={onEditTrade} onDismiss={() => setTouched([])} />

              {!rec.missing.length && !rec.outcome.length && !rec.off.length && !rec.extra.length && !rec.time.length ? (
                <p className="empty-note" style={{ color: "var(--win)" }}>
                  Nhật ký khớp hoàn toàn với DNSE trong khoảng thời gian của file.
                </p>
              ) : null}

              {rec.missing.length ? (
                <>
                  <h4 className="rec-title rec-title-bad">Có trên sàn, chưa thấy trong nhật ký ({rec.missing.length})</h4>
                  <div className="table-wrap">
                    <table className="table dnse-table">
                      <thead>
                        <tr><th>Mã</th><th>Mua</th><th className="cell-num">KL</th><th className="cell-num">Giá mua</th><th>Các lần bán</th><th className="cell-num">Lãi/Lỗ</th><th>Trạng thái</th><th /></tr>
                      </thead>
                      <tbody>
                        {rec.missing.map((pos) => (
                          <tr key={pos.id}>
                            <td><SymbolCell pos={pos} /></td>
                            <td>{pos.entryDate} {pos.entryTime}</td>
                            <td className="cell-num">{fmtQty(pos.lotQty)}</td>
                            <td className="cell-num">{fmtMoney(pos.entryPrice)}</td>
                            <td>{sellsText(pos)}</td>
                            <td className={`cell-num ${tone(pos.net)}`}>{pos.legs.length ? vnd(pos.net) : <span className="field-hint">{vnd(pos.openQty * pos.entryPrice)} vốn</span>}</td>
                            <td className="cell-soft">{[statusText(pos), marginText(pos)].filter(Boolean).join(" · ")}</td>
                            <td className="rec-actions">
                              <button type="button" className="btn btn-ghost" onClick={() => onCreateTrade(tradeFromDnsePosition(pos, account, symbols))}>
                                <PlusCircle size={13} /> Ghi vào nhật ký
                              </button>
                              <button type="button" className="btn btn-ghost" title="Thêm luôn, không mở form" onClick={() => addDirect([pos])}>Thêm thẳng</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="field-hint">
                    Mỗi dòng là một lần mua. "Ghi vào nhật ký" mở form đã điền sẵn mã, ngày, các lần chốt bớt,
                    lãi lỗ và phí để bạn bổ sung setup, ảnh, đánh giá; "Thêm thẳng" ghi luôn phần sàn biết chắc.
                  </p>
                  {rec.missing.length > 1 ? (
                    <button type="button" className="btn" onClick={() => addDirect(rec.missing)}>
                      <PlusCircle size={13} /> Thêm thẳng cả {rec.missing.length} lệnh
                    </button>
                  ) : null}
                </>
              ) : null}

              {rec.outcome.length ? (
                <>
                  <h4 className="rec-title rec-title-bad"><Flag size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Sàn đã có kết quả, nhật ký còn bỏ ngỏ ({rec.outcome.length})</h4>
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Mã</th><th>Mua</th><th>Trên sàn</th><th>Sẽ điền vào</th><th /></tr></thead>
                      <tbody>
                        {rec.outcome.map((x) => (
                          <tr key={x.pos.id}>
                            <td><SymbolCell pos={x.pos} /></td>
                            <td>{x.trade.entryDate} {x.trade.entryTime || ""}</td>
                            <td>{statusText(x.pos)} · {vnd(x.pos.net)}</td>
                            <td>{planSummary(x.plan)}</td>
                            <td className="rec-actions">
                              <button type="button" className="btn btn-ghost" onClick={() => applyPlans([x], "Đã điền kết quả")}><Flag size={13} /> Điền kết quả</button>
                              <button type="button" className="btn btn-ghost" onClick={() => onEditTrade(x.trade)}>Mở lệnh</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="field-hint">
                    Lệnh bạn ghi tay lúc còn mở, giờ sàn đã bán. Chỉ điền ngày thoát, các lần chốt bớt, lãi lỗ và phí —
                    setup, ảnh, đánh giá giữ nguyên. Còn cầm một phần thì chỉ ghi phần đã bán, lệnh vẫn để mở.
                  </p>
                  {rec.outcome.length > 1 ? (
                    <button type="button" className="btn" onClick={() => applyPlans(rec.outcome, "Đã điền kết quả")}>
                      <Flag size={13} /> Điền kết quả cho cả {rec.outcome.length} lệnh
                    </button>
                  ) : null}
                </>
              ) : null}

              {rec.off.length ? (
                <>
                  <h4 className="rec-title rec-title-warn"><Scale size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Lệch so với sàn ({rec.off.length})</h4>
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Mã</th><th>Mua</th><th className="cell-num">Nhật ký</th><th className="cell-num">Sàn</th><th className="cell-num">Lệch</th><th>Lấy theo sàn sẽ ghi</th><th /></tr></thead>
                      <tbody>
                        {rec.off.map((x) => (
                          <tr key={x.pos.id}>
                            <td><SymbolCell pos={x.pos} /></td>
                            <td>{x.trade.entryDate}</td>
                            <td className="cell-num">{vnd(x.journal)}</td>
                            <td className="cell-num">{x.pos.closed ? vnd(x.pos.net) : <span className="field-hint">{statusText(x.pos)}</span>}</td>
                            <td className="cell-num text-loss">{x.diff === null ? "—" : vnd(x.diff)}</td>
                            <td className="cell-soft">{planSummary(x.plan)}</td>
                            <td className="rec-actions">
                              <button type="button" className="btn btn-ghost" onClick={() => applyPlans([x], "Đã lấy theo sàn")}><Scale size={13} /> Lấy theo sàn</button>
                              <button type="button" className="btn btn-ghost" onClick={() => onEditTrade(x.trade)}>Mở lệnh</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="field-hint">
                    Lệch trên {vnd(DNSE_PROFIT_TOLERANCE)}, hoặc nhật ký đã đóng mà sàn còn cầm. "Lấy theo sàn" ghi lại các lần
                    chốt bớt, lần đóng và phí đúng như DNSE — ảnh/ghi chú của từng lần chốt được giữ nếu số lần chốt không đổi.
                    Lệnh từng nhập kiểu cũ (mỗi lần bán một lệnh) sẽ hiện ở đây cùng một bản thừa ở bảng dưới.
                  </p>
                  {rec.off.length > 1 ? (
                    <button type="button" className="btn" onClick={() => applyPlans(rec.off, "Đã lấy theo sàn")}>
                      <Scale size={13} /> Lấy theo sàn cho cả {rec.off.length} lệnh
                    </button>
                  ) : null}
                </>
              ) : null}

              {rec.time.length ? (
                <>
                  <h4 className="rec-title rec-title-warn">
                    <CalendarClock size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
                    Lệch {syncTime ? "ngày/giờ" : "ngày"} so với sàn ({rec.time.length})
                  </h4>
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Mã</th><th>Mua — nhật ký</th><th>Mua — sàn</th><th>Bán — nhật ký</th><th>Bán — sàn</th><th /></tr></thead>
                      <tbody>
                        {rec.time.map((x) => {
                          const entryOff = x.fields.includes("entryDate") || x.fields.includes("entryTime");
                          const exitOff = x.fields.includes("exitDate") || x.fields.includes("exitTime");
                          return (
                            <tr key={x.pos.id}>
                              <td><SymbolCell pos={x.pos} /></td>
                              <td className={entryOff ? "text-loss" : ""}>{x.trade.entryDate} {x.trade.entryTime || "—"}</td>
                              <td>{x.pos.entryDate} {x.pos.entryTime}</td>
                              <td className={exitOff ? "text-loss" : ""}>{x.trade.exitDate ? `${x.trade.exitDate} ${x.trade.exitTime || "—"}` : "chưa điền"}</td>
                              <td>{x.pos.closed ? `${x.pos.exitDate} ${x.pos.exitTime}` : "—"}</td>
                              <td className="rec-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => applyTimes([x])}><CalendarClock size={13} /> Lấy theo sàn</button>
                                <button type="button" className="btn btn-ghost" onClick={() => onEditTrade(x.trade)}>Mở lệnh</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="field-hint">
                    Ngày mua lệch tới {DNSE_DATE_TOLERANCE_DAYS} ngày vẫn ghép là cùng một lệnh — sửa lại cho đúng để lịch và thống kê
                    theo ngày đếm đúng chỗ.{" "}
                    {syncTime ? "Giờ lấy theo thời gian đặt lệnh trên DNSE." : `Tài khoản "${account}" đang tắt đồng bộ giờ nên chỉ soi ngày.`}
                    {" "}Lệnh có chốt bớt thì chỉ sửa lúc mua, phần bán để nguyên.
                  </p>
                  {rec.time.length > 1 ? (
                    <button type="button" className="btn" onClick={() => applyTimes(rec.time)}>
                      <CalendarClock size={13} /> Lấy theo sàn cho cả {rec.time.length} lệnh
                    </button>
                  ) : null}
                </>
              ) : null}

              {rec.extra.length ? (
                <>
                  <h4 className="rec-title rec-title-warn">Có trong nhật ký, không thấy trên sàn ({rec.extra.length})</h4>
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Mã</th><th>Mua</th><th>Bán</th><th className="cell-num">Lãi/Lỗ</th><th /></tr></thead>
                      <tbody>
                        {rec.extra.map((t) => {
                          const r = computeResult(t);
                          return (
                            <tr key={t.id}>
                              <td><b>{t.symbol}</b></td>
                              <td>{t.entryDate} {t.entryTime || ""}</td>
                              <td>{t.exitDate || <span className="field-hint">đang mở</span>}</td>
                              <td className={`cell-num ${tone(r.profit)}`}>{vnd(r.profit)}</td>
                              <td className="rec-actions"><button type="button" className="btn btn-ghost" onClick={() => onEditTrade(t)}>Mở lệnh</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="field-hint">
                    Thường là gõ nhầm mã/ngày mua/tài khoản, hoặc bản thừa của một lần nhập trước đó tách mỗi lần bán
                    thành một lệnh — mở ra xoá đi sau khi đã "Lấy theo sàn" cho bản còn lại.
                  </p>
                </>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
