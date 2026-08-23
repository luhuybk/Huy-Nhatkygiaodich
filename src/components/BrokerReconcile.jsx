import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Coins, FileSpreadsheet, PlusCircle, RotateCcw, X } from "lucide-react";
import { Field, ResourceSelect } from "./ui.jsx";
import {
  guessAccount, localDate, localTime, parseBrokerCsv, reconcileBrokerRows, tradeFromBrokerRow, withBrokerFees, withBrokerTimes,
} from "../lib/brokerCsv.js";
import { accountSyncsTime, computeResult, fmtMoney, uid } from "../lib/helpers.js";

function money(v, currency) {
  return v === null || v === undefined ? "—" : fmtMoney(v, currency);
}

function when(d) {
  return d ? `${localDate(d)} ${localTime(d)}` : "—";
}

// Một file = một tài khoản. Sáu tài khoản thì thả cả sáu file vào một lượt, mỗi file một thẻ
// kết quả riêng — chứ chọn tài khoản rồi tải lại sáu lần thì quá mất công cho việc làm hằng tuần.
function FileCard({ file, result, accounts, symbols, onAccountChange, onRemove, onCreateTrade, onEditTrade, onUpdateTrade }) {
  const acc = accounts.find((a) => a.name === file.account);
  const currency = (acc || {}).currency || "USD";
  const syncTime = accountSyncsTime(acc);
  const offRows = result ? result.matched.filter((m) => m.profitOff) : [];
  const timeRows = result ? result.matched.filter((m) => m.timeFields.length) : [];
  const fillableFees = offRows.filter((m) => m.feeMissing);

  return (
    <div className="rec-file">
      <div className="rec-file-head">
        <span className="rec-file-name"><FileSpreadsheet size={14} /> {file.name}</span>
        <span className="rec-file-account">
          <ResourceSelect value={file.account} onChange={onAccountChange}
            options={accounts.map((a) => a.name)} placeholder="Chọn tài khoản" />
          {file.guessed && file.account ? <span className="rec-tag">tự đoán theo symbol</span> : null}
        </span>
        <button type="button" className="row-btn" title="Bỏ file này" onClick={onRemove}><X size={14} /></button>
      </div>

      {file.error ? <p className="empty-note" style={{ color: "var(--loss)" }}>{file.error}</p> : null}
      {!file.error && !file.account ? (
        <p className="empty-note">Đọc được {file.rows.length} lệnh — chọn tài khoản để đối chiếu.</p>
      ) : null}

      {result ? (
        <>
          <div className="rec-summary">
            <span className="rec-chip">{file.rows.length} lệnh trên sàn</span>
            <span className="rec-chip rec-chip-ok"><CheckCircle2 size={13} /> {result.matched.length} khớp nhật ký</span>
            {result.missing.length ? (
              <span className="rec-chip rec-chip-bad"><AlertTriangle size={13} /> {result.missing.length} chưa ghi nhật ký</span>
            ) : null}
            {result.extra.length ? <span className="rec-chip rec-chip-warn">{result.extra.length} chỉ có trong nhật ký</span> : null}
            {offRows.length ? <span className="rec-chip rec-chip-warn">{offRows.length} lệch tiền</span> : null}
            {timeRows.length ? (
              <span className="rec-chip rec-chip-warn">{timeRows.length} lệch {syncTime ? "ngày/giờ" : "ngày"}</span>
            ) : null}
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
                            onClick={() => onCreateTrade(tradeFromBrokerRow(row, file.account, symbols))}>
                            <PlusCircle size={13} /> Ghi vào nhật ký
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="field-hint">
                Bấm "Ghi vào nhật ký" là mở form với symbol, ngày giờ vào/ra, lãi lỗ và phí điền sẵn theo sàn —
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
                <button type="button" className="btn" onClick={() => onUpdateTrade(fillableFees.map((m) => withBrokerFees(m.trade, m.row)))}>
                  <Coins size={13} /> Điền phí cho cả {fillableFees.length} lệnh
                </button>
              ) : null}
            </>
          ) : null}

          {timeRows.length ? (
            <>
              <h4 className="rec-title rec-title-warn">
                <CalendarClock size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
                Lệch {syncTime ? "ngày/giờ" : "ngày"} so với sàn ({timeRows.length})
              </h4>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Symbol</th><th>Vào — nhật ký</th><th>Vào — sàn</th><th>Ra — nhật ký</th><th>Ra — sàn</th><th /></tr>
                  </thead>
                  <tbody>
                    {timeRows.map((m) => {
                      const f = m.timeFields;
                      const entryOff = f.includes("entryDate") || f.includes("entryTime");
                      const exitOff = f.includes("exitDate") || f.includes("exitTime");
                      return (
                        <tr key={m.row.key}>
                          <td><b>{m.row.symbol}</b></td>
                          <td className={entryOff ? "text-loss" : ""}>{m.trade.entryDate} {m.trade.entryTime || "—"}</td>
                          <td>{when(m.row.openAt)}</td>
                          <td className={exitOff ? "text-loss" : ""}>
                            {m.trade.exitDate ? `${m.trade.exitDate} ${m.trade.exitTime || "—"}` : "chưa điền"}
                          </td>
                          <td>{when(m.row.closeAt)}</td>
                          <td className="rec-actions">
                            <button type="button" className="btn btn-ghost"
                              onClick={() => onUpdateTrade([withBrokerTimes(m.trade, m.row, syncTime)])}>
                              <CalendarClock size={13} /> Lấy theo sàn
                            </button>
                            <button type="button" className="btn btn-ghost" onClick={() => onEditTrade(m.trade)}>Mở lệnh</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="field-hint">
                {syncTime
                  ? "Lấy đúng giờ khớp lệnh của sàn thì thời gian giữ lệnh và phân tích theo phiên mới chuẩn."
                  : `Tài khoản "${file.account}" đang tắt đồng bộ giờ nên chỉ soi ngày — bật lại ở tab Tài khoản nếu muốn lấy cả giờ.`}
                {" "}Lệnh có chốt bớt hoặc chưa điền ngày thoát thì chỉ cập nhật lúc vào lệnh, phần thoát để nguyên cho bạn tự điền.
              </p>
              {timeRows.length > 1 ? (
                <button type="button" className="btn"
                  onClick={() => onUpdateTrade(timeRows.map((m) => withBrokerTimes(m.trade, m.row, syncTime)))}>
                  <CalendarClock size={13} /> Lấy theo sàn cho cả {timeRows.length} lệnh
                </button>
              ) : null}
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

export function BrokerReconcile({ trades, resources, onCreateTrade, onEditTrade, onUpdateTrade }) {
  const accounts = resources.accounts || [];
  const symbols = resources.symbols || [];
  const [files, setFiles] = useState([]);
  const fileRef = useRef(null);

  const addFiles = async (list) => {
    const picked = Array.from(list || []);
    if (!picked.length) return;
    const next = await Promise.all(picked.map(async (f) => {
      const res = parseBrokerCsv(await f.text());
      const guess = res.error ? "" : guessAccount(res.rows, trades, accounts);
      return {
        id: uid(), name: f.name, rows: res.rows, error: res.error,
        // Chỉ có một tài khoản thì khỏi đoán, cứ dùng nó.
        account: guess || (accounts.length === 1 ? accounts[0].name : ""),
        guessed: !!guess,
      };
    }));
    setFiles((prev) => [...prev, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const results = useMemo(
    () => files.map((f) => {
      if (!f.account || !f.rows.length) return null;
      const acc = accounts.find((a) => a.name === f.account);
      return reconcileBrokerRows(f.rows, trades, { account: f.account, syncTime: accountSyncsTime(acc) });
    }),
    [files, trades, accounts]
  );

  const reset = () => {
    setFiles([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const totals = results.reduce((acc, r) => {
    if (!r) return acc;
    acc.matched += r.matched.length;
    acc.missing += r.missing.length;
    acc.fees.push(...r.matched.filter((m) => m.profitOff && m.feeMissing));
    acc.times.push(...r.matched.filter((m) => m.timeFields.length).map((m) => ({ m, syncTime: r.syncTime })));
    return acc;
  }, { matched: 0, missing: 0, fees: [], times: [] });

  return (
    <div className="account-form">
      <h3 className="block-title" style={{ marginTop: 0 }}>Đối chiếu với file sàn xuất ra</h3>
      <p className="field-hint">
        Sàn cho xuất lịch sử giao dịch ra CSV theo khoảng thời gian. Thả vào đây cả loạt file của
        nhiều tài khoản một lượt để soi xem có lệnh nào đã đánh mà quên ghi nhật ký không — sàn là
        bằng chứng gốc, thiếu ở đây gần như chắc chắn là bỏ sót. File chỉ đọc trên máy bạn, không
        gửi đi đâu và cũng không lưu lại.
      </p>

      <Field label="File CSV từ sàn"
        hint="Chọn được nhiều file cùng lúc. Tài khoản của từng file được đoán theo symbol đã từng đánh — sai thì chọn lại ở thẻ bên dưới.">
        <input ref={fileRef} type="file" accept=".csv,text/csv" multiple className="input"
          onChange={(e) => addFiles(e.target.files)} />
      </Field>

      {files.length ? (
        <div className="rec-summary" style={{ marginBottom: 4 }}>
          <span className="rec-chip"><FileSpreadsheet size={13} /> {files.length} file</span>
          <span className="rec-chip rec-chip-ok"><CheckCircle2 size={13} /> {totals.matched} khớp nhật ký</span>
          {totals.missing ? (
            <span className="rec-chip rec-chip-bad"><AlertTriangle size={13} /> {totals.missing} chưa ghi nhật ký</span>
          ) : null}
          {totals.fees.length > 1 ? (
            <button type="button" className="btn" onClick={() => onUpdateTrade(totals.fees.map((m) => withBrokerFees(m.trade, m.row)))}>
              <Coins size={13} /> Điền phí cho cả {totals.fees.length} lệnh (mọi file)
            </button>
          ) : null}
          {totals.times.length > 1 ? (
            <button type="button" className="btn"
              onClick={() => onUpdateTrade(totals.times.map((x) => withBrokerTimes(x.m.trade, x.m.row, x.syncTime)))}>
              <CalendarClock size={13} /> Lấy ngày/giờ theo sàn cho cả {totals.times.length} lệnh (mọi file)
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={reset}><RotateCcw size={13} /> Xoá hết</button>
        </div>
      ) : null}

      {files.map((f, i) => (
        <FileCard key={f.id} file={f} result={results[i]} accounts={accounts} symbols={symbols}
          onAccountChange={(v) => setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, account: v, guessed: false } : x)))}
          onRemove={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
          onCreateTrade={onCreateTrade} onEditTrade={onEditTrade} onUpdateTrade={onUpdateTrade} />
      ))}
    </div>
  );
}
