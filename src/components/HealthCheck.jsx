import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Filter, ShieldCheck, Stethoscope } from "lucide-react";
import { StatCard } from "./ui.jsx";
import { dateKey, journalHealth } from "../lib/helpers.js";

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

export function HealthCheckPage({ trades, resources, setupErrors, skills, filterPresets, onOpenTrade, onGoToJournal }) {
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
          <span>Không tìm thấy vấn đề nào. Mọi lệnh đều đủ dữ liệu để vào thống kê.</span>
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
    </div>
  );
}
