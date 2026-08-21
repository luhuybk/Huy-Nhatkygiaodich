import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Coins, FileSpreadsheet, PlusCircle, RotateCcw } from "lucide-react";
import { Field, ResourceSelect } from "./ui.jsx";
import { localDate, localTime, parseBrokerCsv, reconcileBrokerRows, tradeFromBrokerRow, withBrokerFees } from "../lib/brokerCsv.js";
import { computeResult, fmtMoney } from "../lib/helpers.js";

function money(v, currency) {
  return v === null || v === undefined ? "—" : fmtMoney(v, currency);
}

function when(d) {
  return d ? `${localDate(d)} ${localTime(d)}` : "—";
}

export function BrokerReconcile({ trades, resources, onCreateTrade, onEditTrade, onUpdateTrade }) {
  const accounts = resources.accounts || [];
  const [account, setAccount] = useState(() => (accounts.length === 1 ? accounts[0].name : ""));
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef(null);

  const readFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    const res = parseBrokerCsv(await file.text());
    setError(res.error);
    setParsed(res.error ? null : res.rows);
  };

  const result = useMemo(
    () => (parsed && account ? reconcileBrokerRows(parsed, trades, { account }) : null),
    [parsed, account, trades]
  );

  const reset = () => {
    setParsed(null); setError(""); setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const symbols = resources.symbols || [];
  // Tài khoản cent trả về USC chứ không phải USD — hiện đúng đơn vị của tài khoản đó.
  const currency = (accounts.find((a) => a.name === account) || {}).currency || "USD";
  const offRows = result ? result.matched.filter((m) => m.profitOff) : [];
  const dateRows = result ? result.matched.filter((m) => m.dateOff) : [];
  const fillableFees = offRows.filter((m) => m.feeMissing);

  // Điền phí cho mọi lệnh mà sàn có tính phí còn nhật ký bỏ trống — thường cả tuần chỉ
  // thiếu đúng khoản này, ngồi mở từng lệnh ra sửa thì quá phí thời gian.
  const fillAllFees = () => onUpdateTrade(fillableFees.map((m) => withBrokerFees(m.trade, m.row)));

  return (
    <div className="account-form">
      <h3 className="block-title" style={{ marginTop: 0 }}>Đối chiếu với file sàn xuất ra</h3>
      <p className="field-hint">
        Sàn cho xuất lịch sử giao dịch ra CSV theo khoảng thời gian. Tải file đó lên đây để soi
        xem có lệnh nào đã đánh mà quên ghi nhật ký không — sàn là bằng chứng gốc, thiếu ở đây
        gần như chắc chắn là bỏ sót. File chỉ đọc trên máy bạn, không gửi đi đâu và cũng không lưu lại.
      </p>

      <div className="grid-2" style={{ marginBottom: 10 }}>
        <Field label="Tài khoản của file này" required
          hint="File sàn không ghi tên tài khoản — chọn đúng tài khoản trong nhật ký ứng với số tài khoản đã xuất.">
          <ResourceSelect value={account} onChange={setAccount} options={accounts.map((a) => a.name)} placeholder="Chọn tài khoản" />
        </Field>
        <Field label="File CSV từ sàn" hint={fileName ? `Đang xem: ${fileName}` : "Nhận file Exness và các sàn MT4/MT5 tương tự."}>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="input"
            onChange={(e) => readFile(e.target.files && e.target.files[0])} />
        </Field>
      </div>

      {error ? <p className="empty-note" style={{ color: "var(--loss)" }}>{error}</p> : null}
      {parsed && !account ? <p className="empty-note">Đọc được {parsed.length} lệnh — chọn tài khoản để đối chiếu.</p> : null}

      {result ? (
        <>
          <div className="rec-summary">
            <span className="rec-chip"><FileSpreadsheet size={13} /> {parsed.length} lệnh trên sàn</span>
            <span className="rec-chip rec-chip-ok"><CheckCircle2 size={13} /> {result.matched.length} khớp nhật ký</span>
            {result.missing.length ? (
              <span className="rec-chip rec-chip-bad"><AlertTriangle size={13} /> {result.missing.length} chưa ghi nhật ký</span>
            ) : null}
            {result.extra.length ? <span className="rec-chip rec-chip-warn">{result.extra.length} chỉ có trong nhật ký</span> : null}
            {offRows.length ? <span className="rec-chip rec-chip-warn">{offRows.length} lệch tiền</span> : null}
            {dateRows.length ? <span className="rec-chip rec-chip-warn">{dateRows.length} lệch ngày</span> : null}
            <button type="button" className="btn btn-ghost" onClick={reset}><RotateCcw size={13} /> Xoá kết quả</button>
          </div>

          {result.missing.length === 0 ? (
            <p className="empty-note" style={{ color: "var(--win)" }}>
              Không thiếu lệnh nào — mọi lệnh trên sàn trong file này đều đã có trong nhật ký.
            </p>
          ) : (
            <>
              <h4 className="rec-title rec-title-bad">Có trên sàn, chưa thấy trong nhật ký ({result.missing.length})</h4>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Symbol</th><th>Vào lệnh</th><th>Đóng lệnh</th><th>Lệnh</th>
                      <th>Lot</th><th>Lãi/Lỗ</th><th>Lý do đóng</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {result.missing.map((row) => (
                      <tr key={row.key}>
                        <td><b>{row.symbol}</b></td>
                        <td>{when(row.openAt)}</td>
                        <td>{when(row.closeAt)}</td>
                        <td className={row.type === "sell" ? "text-loss" : "text-win"}>{row.type || "—"}</td>
                        <td>{row.lots ?? "—"}</td>
                        <td className={row.net > 0 ? "text-win" : row.net < 0 ? "text-loss" : ""}>{money(row.net, currency)}</td>
                        <td>
                          {row.closeReason || "—"}
                          {row.samePosition ? <span className="rec-tag">cùng vị thế — là lần chốt bớt</span>
                            : row.maybePartial ? <span className="rec-tag">có thể là lần chốt bớt</span> : null}
                        </td>
                        <td>
                          <button type="button" className="btn btn-ghost"
                            onClick={() => onCreateTrade(tradeFromBrokerRow(row, account, symbols))}>
                            <PlusCircle size={13} /> Ghi vào nhật ký
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="field-hint">
                Bấm "Ghi vào nhật ký" là mở form với symbol, ngày giờ vào/ra và lãi lỗ điền sẵn theo sàn —
                bạn chỉ cần bổ sung setup, ảnh và phần đánh giá.
              </p>
            </>
          )}

          {offRows.length ? (
            <>
              <h4 className="rec-title rec-title-warn">Lệch tiền so với sàn ({offRows.length})</h4>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Symbol</th><th>Vào lệnh</th><th>Nhật ký</th><th>Sàn</th><th>Phí sàn</th><th>Lệch</th><th /></tr>
                  </thead>
                  <tbody>
                    {offRows.map((m) => (
                      <tr key={m.row.key}>
                        <td><b>{m.row.symbol}</b></td>
                        <td>{when(m.row.openAt)}</td>
                        <td>{money(computeResult(m.trade).profit, currency)}</td>
                        <td>{money(m.row.net, currency)}</td>
                        <td>{money(m.row.fees, currency)}{m.feeMissing ? <span className="rec-tag">chưa điền</span> : null}</td>
                        <td className="text-loss">{money(m.profitDiff, currency)}</td>
                        <td className="rec-actions">
                          {m.feeMissing ? (
                            <button type="button" className="btn btn-ghost" onClick={() => onUpdateTrade([withBrokerFees(m.trade, m.row)])}>
                              <Coins size={13} /> Điền phí {money(m.row.fees, currency)}
                            </button>
                          ) : null}
                          <button type="button" className="btn btn-ghost" onClick={() => onEditTrade(m.trade)}>Mở lệnh</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="field-hint">
                Chênh vài xu là do sàn làm tròn — bảng này chỉ liệt kê khoản lệch trên {money(result.tolerance, currency)}.
                Phần lớn là do chưa điền phí hoa hồng + qua đêm, phần còn lại thường là gõ nhầm số.
              </p>
              {fillableFees.length > 1 ? (
                <button type="button" className="btn" onClick={fillAllFees}>
                  <Coins size={13} /> Điền phí cho cả {fillableFees.length} lệnh
                </button>
              ) : null}
            </>
          ) : null}

          {dateRows.length ? (
            <>
              <h4 className="rec-title rec-title-warn">
                <CalendarClock size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
                Lệch ngày vào lệnh ({dateRows.length})
              </h4>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Symbol</th><th>Nhật ký ghi</th><th>Sàn (đã đổi sang giờ máy bạn)</th><th /></tr></thead>
                  <tbody>
                    {dateRows.map((m) => (
                      <tr key={m.row.key}>
                        <td><b>{m.row.symbol}</b></td>
                        <td>{m.trade.entryDate} {m.trade.entryTime}</td>
                        <td>{when(m.row.openAt)}</td>
                        <td><button type="button" className="btn btn-ghost" onClick={() => onEditTrade(m.trade)}>Mở lệnh</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="field-hint">
                Vẫn là một lệnh, chỉ khác ngày. Hay gặp với lệnh mở buổi tối giờ Mỹ: sàn ghi giờ UTC
                nên rơi vào hôm trước, còn giờ Việt Nam đã sang ngày mới. Sửa lại cho khớp thì lịch
                và thống kê theo ngày mới đếm đúng chỗ.
              </p>
            </>
          ) : null}

          {result.extra.length ? (
            <>
              <h4 className="rec-title rec-title-warn">Có trong nhật ký, không thấy trên sàn ({result.extra.length})</h4>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Symbol</th><th>Vào lệnh</th><th>Lãi/Lỗ</th><th /></tr></thead>
                  <tbody>
                    {result.extra.map((t) => (
                      <tr key={t.id}>
                        <td><b>{t.symbol}</b></td>
                        <td>{t.entryDate} {t.entryTime}</td>
                        <td>{money(computeResult(t).profit, currency)}</td>
                        <td><button type="button" className="btn btn-ghost" onClick={() => onEditTrade(t)}>Mở lệnh</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="field-hint">
                Thường là gõ nhầm tài khoản, nhầm symbol hoặc nhầm ngày — cũng có thể chỉ vì file
                bạn xuất chưa phủ hết khoảng thời gian của những lệnh này.
              </p>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
