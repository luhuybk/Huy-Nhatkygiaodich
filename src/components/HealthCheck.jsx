import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Filter, HardDrive, ShieldCheck, Stethoscope, Wand2 } from "lucide-react";
import { DangerConfirmButton, StatCard } from "./ui.jsx";
import { dateKey, journalHealth, symbolFixLists, symbolFixPlan } from "../lib/helpers.js";
import { collectImagePaths, listStoredImages, deleteStoredImages } from "../lib/storage.js";

const MAX_LISTED = 60;

function TradeList({ ids, trades, onOpenTrade }) {
  const byId = useMemo(() => new Map((trades || []).map((t) => [t.id, t])), [trades]);
  const rows = ids.map((id) => byId.get(id)).filter(Boolean)
    .sort((a, b) => (dateKey(b) || "").localeCompare(dateKey(a) || ""));
  const shown = rows.slice(0, MAX_LISTED);
  return (
    <div className="health-list">
      {shown.map((t) => (
        <button key={t.id} type="button" className="health-trade" onClick={() => onOpenTrade(t)}>
          <span className="mono">{dateKey(t) || "—"}</span>
          <b>{t.symbol || "—"}</b>
          <span className="err-note">{t.account || "chưa gán tài khoản"}</span>
          {t.setup ? <span className="err-note">· {t.setup}</span> : null}
        </button>
      ))}
      {rows.length > shown.length ? (
        <p className="field-hint" style={{ margin: "6px 0 0" }}>…và {rows.length - shown.length} lệnh nữa.</p>
      ) : null}
    </div>
  );
}

function CheckRow({ check, trades, onOpenTrade, onGoToJournal }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`health-row health-${check.tone}`}>
      <div className="health-head" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={13} color="var(--text-dim)" /> : <ChevronRight size={13} color="var(--text-dim)" />}
        <span className="health-label">{check.label}</span>
        <span className={`health-count health-count-${check.tone}`}>{check.ids.length}</span>
        {check.filter ? (
          <span onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn btn-ghost" onClick={() => onGoToJournal(check.filter)}>
              <Filter size={12} /> Lọc ở Nhật ký
            </button>
          </span>
        ) : null}
      </div>
      <p className="health-hint">{check.hint}</p>
      {open ? <TradeList ids={check.ids} trades={trades} onOpenTrade={onOpenTrade} /> : null}
    </div>
  );
}

// Mã viết chưa chuẩn: lệnh cũ "CADCHF" và lệnh mới "CAD/CHF" là cùng một cặp — đổi hết về một cách viết
// để tìm kiếm, bộ lọc, gợi ý mã đều thống nhất. Xem trước từng cặp cũ → mới, bấm hai lần mới đổi.
function SymbolFix({ trades, resources, onUpdateTrades, onResourcesChange, lists, onChangeLists }) {
  const plan = useMemo(() => symbolFixPlan(trades, resources), [trades, resources]);
  const others = useMemo(() => (onChangeLists ? symbolFixLists(lists) : []), [lists, onChangeLists]);
  const otherCount = others.reduce((n, d) => n + d.count, 0);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState("");
  if (!plan.tradeCount && !plan.symbols && !otherCount) {
    return done ? <p className="health-ok"><ShieldCheck size={16} /><span>{done}</span></p> : null;
  }
  const apply = () => {
    const to = new Map();
    plan.groups.forEach((g) => g.ids.forEach((id) => to.set(id, g.to)));
    const changed = (trades || []).filter((t) => to.has(t.id)).map((t) => ({ ...t, symbol: to.get(t.id) }));
    if (changed.length) onUpdateTrades(changed);
    if (plan.symbols) onResourcesChange({ ...resources, symbols: plan.symbols });
    others.forEach((d) => onChangeLists[d.key](d.next));
    const extra = others.map((d) => `${d.count} ${d.label}`).join(", ");
    setDone(`Đã đổi ${changed.length} lệnh${extra ? `, ${extra}` : ""}${plan.symbols ? " và gộp danh sách symbol" : ""}.`);
  };
  return (
    <div className="health-row health-warn">
      <div className="health-head" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={13} color="var(--text-dim)" /> : <ChevronRight size={13} color="var(--text-dim)" />}
        <span className="health-label">Mã viết chưa chuẩn (VD CADCHF thay vì CAD/CHF)</span>
        <span className="health-count health-count-warn">{plan.tradeCount + otherCount}</span>
        <span onClick={(e) => e.stopPropagation()}>
          <DangerConfirmButton label={<><Wand2 size={12} /> Đổi hết về cách viết chuẩn</>}
            confirmLabel={`Bấm lần nữa: đổi ${plan.tradeCount} lệnh${otherCount ? ` + ${otherCount} mục khác` : ""}`} onConfirm={apply} />
        </span>
      </div>
      <p className="health-hint">
        Cặp hai đồng tiền chính viết thành XXX/YYY, mã khác viết hoa, gõ Telex thì dịch ngược — như ô Symbol
        lúc lưu lệnh mới. Chỉ đổi tên mã, không đụng gì khác của lệnh. Setup miss / skip / biến thể và bài học
        cũng được đổi theo.
        {plan.symbols ? " Danh sách symbol trong Tài nguyên cũng được gộp các mã trùng." : ""}
      </p>
      {open ? (
        <div className="health-list">
          {plan.groups.map((g) => (
            <p key={`${g.from}→${g.to}`} className="health-stale mono">{g.from} → <b>{g.to}</b> · {g.ids.length} lệnh</p>
          ))}
          {others.map((d) => <p key={d.key} className="health-stale">{d.count} {d.label}</p>)}
        </div>
      ) : null}
    </div>
  );
}

function fmtBytes(n) {
  if (!n) return "0 KB";
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

const MAX_ORPHANS_SHOWN = 40;

// Kho ảnh chưa bao giờ được dọn. Cố tình KHÔNG tự quét và KHÔNG tự xóa: quét cần đọc toàn bộ
// dữ liệu, còn xóa nhầm một tấm ảnh là mất hẳn — nên mỗi bước đều do bạn bấm.
function ImageCleanup({ allData }) {
  const [state, setState] = useState(null); // { files, orphans, usedCount, totalBytes }
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const scan = async () => {
    setBusy("scan"); setError(""); setDone("");
    const res = await listStoredImages();
    if (res.error) { setError(res.error); setBusy(""); return; }
    const used = collectImagePaths(allData);
    const orphans = res.files.filter((f) => !used.has(f.path));
    setState({
      files: res.files,
      orphans,
      usedCount: res.files.length - orphans.length,
      totalBytes: orphans.reduce((n, f) => n + f.size, 0),
    });
    setBusy("");
  };

  const purge = async () => {
    if (!state || !state.orphans.length) return;
    setBusy("del"); setError(""); setDone("");
    const res = await deleteStoredImages(state.orphans.map((f) => f.path));
    if (res.error) { setError(res.error); setBusy(""); return; }
    setDone(`Đã xóa ${res.removed} ảnh, giải phóng ${fmtBytes(state.totalBytes)}.`);
    setState(null);
    setBusy("");
  };

  return (
    <div className="health-row" style={{ borderLeftColor: "var(--accent)" }}>
      <div className="health-head" style={{ cursor: "default" }}>
        <HardDrive size={14} color="var(--accent)" />
        <b>Ảnh mồ côi trong kho</b>
        <span className="err-note">
          Xóa một lệnh hay đổi ảnh khác thì file cũ vẫn nằm lại trong kho — không còn gì trỏ tới, cũng không hiện ở đâu.
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={scan} disabled={!!busy}>
          {busy === "scan" ? "Đang quét..." : "Quét kho ảnh"}
        </button>
        {state ? (
          <span className="err-note">
            {state.files.length} file trong kho · {state.usedCount} còn dùng ·{" "}
            <b style={{ color: state.orphans.length ? "var(--loss)" : "var(--win)" }}>
              {state.orphans.length} mồ côi
            </b>
            {state.orphans.length ? ` (${fmtBytes(state.totalBytes)})` : ""}
          </span>
        ) : null}
        {state && state.orphans.length ? (
          <DangerConfirmButton
            label={busy === "del" ? "Đang xóa..." : `Xóa ${state.orphans.length} ảnh mồ côi`}
            confirmLabel="Bấm lần nữa — xóa hẳn, không hoàn tác"
            onConfirm={purge} />
        ) : null}
      </div>
      {error ? <p className="error-text" style={{ marginTop: 8 }}>{error}</p> : null}
      {done ? <p className="field-hint" style={{ marginTop: 8, color: "var(--win)" }}>{done}</p> : null}
      {state && state.orphans.length ? (
        <>
          <div className="orphan-grid">
            {state.orphans.slice(0, MAX_ORPHANS_SHOWN).map((f) => (
              <a key={f.path} className="orphan-item" href={f.url} target="_blank" rel="noopener noreferrer"
                title={`${f.name} · ${fmtBytes(f.size)}${f.createdAt ? ` · ${f.createdAt.slice(0, 10)}` : ""}`}>
                <img src={f.url} alt="" loading="lazy" />
                <span>{fmtBytes(f.size)}</span>
              </a>
            ))}
          </div>
          <p className="field-hint" style={{ marginTop: 8 }}>
            {state.orphans.length > MAX_ORPHANS_SHOWN
              ? `Hiện ${MAX_ORPHANS_SHOWN} ảnh đầu trong ${state.orphans.length} — bấm xóa là xóa hết. `
              : ""}
            Xem qua trước khi xóa: mở từng ảnh bằng cách bấm vào nó. Xóa rồi không lấy lại được.
          </p>
        </>
      ) : null}
      {state && !state.orphans.length ? (
        <p className="field-hint" style={{ marginTop: 8, color: "var(--win)" }}>Kho sạch — mọi ảnh đều còn được dùng.</p>
      ) : null}
    </div>
  );
}

export function HealthCheckPage({ trades, resources, setupErrors, skills, filterPresets, allData, onOpenTrade, onGoToJournal, onUpdateTrades, onResourcesChange, symbolLists, onChangeSymbolLists }) {
  const h = useMemo(
    () => journalHealth(trades, resources, setupErrors, filterPresets, skills),
    [trades, resources, setupErrors, filterPresets, skills]
  );
  const hard = h.checks.filter((c) => c.tone === "loss").reduce((n, c) => n + c.ids.length, 0);

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 14 }}>
        Những chỗ dữ liệu tự mâu thuẫn — số liệu sai hoặc lệnh rơi ra ngoài thống kê mà không báo gì.
        Bấm vào từng mục để xem đúng các lệnh dính phải; bấm một lệnh để mở chi tiết.
      </p>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <StatCard label="Lệnh trong nhật ký" value={h.total} sub={`${h.closed} lệnh đã đóng`} />
        <StatCard label="Vấn đề làm sai số liệu" value={hard + h.fx.length} tone={hard + h.fx.length ? "loss" : "win"}
          sub={hard + h.fx.length ? "cần sửa trước khi tin vào báo cáo" : "không có"} />
        <StatCard label="Tổng mục cần xử lý" value={h.problems} tone={h.problems ? "" : "win"} />
      </div>

      {h.problems === 0 ? (
        <div className="health-ok">
          <ShieldCheck size={16} />
          <span>Không tìm thấy vấn đề nào ở dữ liệu nhật ký. Mọi lệnh đều đủ dữ liệu để vào thống kê.</span>
        </div>
      ) : null}

      {h.fx.length ? (
        <div className="health-row health-loss">
          <div className="health-head" style={{ cursor: "default" }}>
            <Stethoscope size={13} color="var(--loss)" />
            <span className="health-label">Tài khoản chưa có tỷ giá quy đổi</span>
            <span className="health-count health-count-loss">{h.fx.length}</span>
          </div>
          <p className="health-hint">
            {h.fx.map((m) => `${m.currency} (${m.accounts.join(", ")})`).join(" · ")} chưa có tỷ giá.
            Mọi con số "quy đổi USD" — Tổng quan, Báo cáo tuần, tin Telegram — đang cộng thẳng như USD, tức là sai.
            Điền tỷ giá ở tab Tài khoản.
          </p>
        </div>
      ) : null}

      {h.checks.map((c) => (
        <CheckRow key={c.id} check={c} trades={trades} onOpenTrade={onOpenTrade} onGoToJournal={onGoToJournal} />
      ))}

      {onUpdateTrades ? <SymbolFix trades={trades} resources={resources} onUpdateTrades={onUpdateTrades} onResourcesChange={onResourcesChange} lists={symbolLists} onChangeLists={onChangeSymbolLists} /> : null}

      {h.stale.length ? (
        <div className="health-row health-warn">
          <div className="health-head" style={{ cursor: "default" }}>
            <span className="health-label">Bộ lọc đã lưu trỏ tới thứ không còn tồn tại</span>
            <span className="health-count health-count-warn">{h.stale.length}</span>
          </div>
          <p className="health-hint">
            Bấm vào những bộ lọc này sẽ ra danh sách rỗng mà không rõ vì sao — sửa hoặc xóa ở tab Nhật ký.
          </p>
          <div className="health-list">
            {h.stale.map((line) => <p key={line} className="health-stale">{line}</p>)}
          </div>
        </div>
      ) : null}

      <h4 className="block-title" style={{ marginTop: 22 }}>Kho ảnh</h4>
      <ImageCleanup allData={allData} />
    </div>
  );
}
