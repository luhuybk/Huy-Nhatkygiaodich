import { useState, useEffect } from "react";
import { Star, X, Trash2, ImagePlus, Link2, ChevronDown, ChevronRight, Check, Image as ImageIcon, AlertCircle, ShieldAlert } from "lucide-react";
import { formatVN } from "../lib/helpers.js";

export function CellImagePreview({ image, link }) {
  const [hover, setHover] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [link]);
  if (!image && !link) return <span style={{ color: "var(--text-dim)" }}>—</span>;
  if (image) {
    return <img src={image} alt="" className="thumb-mini" onClick={(e) => { e.stopPropagation(); window.open(image, "_blank"); }} />;
  }
  return (
    <span className="link-preview-anchor" onClick={(e) => { e.stopPropagation(); window.open(link, "_blank"); }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <ImageIcon size={15} color="var(--accent)" />
      {hover ? (
        <div className="link-preview-popup">
          {failed ? <p className="link-preview-fallback">Không xem trước được — bấm để mở link.</p> : <img src={link} alt="" onError={() => setFailed(true)} />}
        </div>
      ) : null}
    </span>
  );
}

export function ConfirmButton({ onConfirm, icon: Icon = Trash2, className = "row-btn", label }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 2500);
    return () => clearTimeout(t);
  }, [confirming]);
  if (confirming) {
    return (
      <button type="button" className={`${className} confirm-active`}
        onClick={(e) => { e.stopPropagation(); onConfirm(); setConfirming(false); }}
        aria-label="Xác nhận xóa" title="Bấm lần nữa để xác nhận xóa">
        <Check size={13} />
      </button>
    );
  }
  return (
    <button type="button" className={className}
      onClick={(e) => { e.stopPropagation(); setConfirming(true); }} aria-label={label || "Xóa"}>
      <Icon size={13} />
    </button>
  );
}

export function DangerConfirmButton({ label, confirmLabel, onConfirm }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);
  return (
    <button type="button" className={`btn ${confirming ? "btn-danger" : "btn-ghost"}`}
      onClick={() => { if (confirming) { onConfirm(); setConfirming(false); } else setConfirming(true); }}>
      {confirming ? confirmLabel : label}
    </button>
  );
}

export function StarRating({ value, onChange, size = 18 }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = (hover || value) >= n;
        return (
          <button key={n} type="button" onClick={() => onChange(value === n ? 0 : n)}
            onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, lineHeight: 0 }}
            aria-label={`${n} sao`}>
            <Star size={size} color={filled ? "var(--accent)" : "var(--border)"} fill={filled ? "var(--accent)" : "none"} strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, children, hint, required, incomplete }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}{required ? <span className="req">*</span> : null}
        {incomplete ? <AlertCircle size={11} className="field-missing-icon" title="Chưa điền — đang ảnh hưởng tiến độ hoàn thành" /> : null}
      </span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function ResourceSelect({ value, onChange, options, placeholder }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder || "— Chọn —"}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export function ChipSelect({ value, onChange, options, allowClear = true }) {
  if (!options || options.length === 0) return <p className="empty-note">Chưa có tùy chọn nào — thêm ở tab Tài nguyên.</p>;
  return (
    <div className="chip-group">
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            className={`chip-btn ${active ? "chip-active" : ""}`}
            onClick={() => onChange(active && allowClear ? "" : o)}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function MultiChipSelect({ value, onChange, options }) {
  const selected = value || [];
  const toggle = (o) => onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  if (!options || options.length === 0) return <p className="empty-note">Chưa có tùy chọn nào — thêm ở tab Tài nguyên.</p>;
  return (
    <div className="chip-group">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`chip-btn ${selected.includes(o) ? "chip-active" : ""}`}
          onClick={() => toggle(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function IdSelect({ value, onChange, items, placeholder }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder || "— Chọn —"}</option>
      {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
    </select>
  );
}

export function MoneyInput({ value, onChange, placeholder, className }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="text"
      inputMode="decimal"
      className={className || "input mono"}
      placeholder={placeholder}
      value={focused ? value : formatVN(value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9.,-]/g, "").replace(",", ".");
        onChange(raw);
      }}
    />
  );
}

export function ImageOrLink({ link, image, onLinkChange, onImageChange, label }) {
  const [err, setErr] = useState("");
  const [linkPreviewFailed, setLinkPreviewFailed] = useState(false);
  const [hoverPreview, setHoverPreview] = useState(false);
  useEffect(() => setLinkPreviewFailed(false), [link]);
  const handleFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      setErr("Ảnh quá lớn (>1.5MB). Dùng link TradingView hoặc chọn ảnh nhỏ hơn.");
      e.target.value = ""; return;
    }
    setErr("");
    const reader = new FileReader();
    reader.onload = () => onImageChange(reader.result);
    reader.readAsDataURL(file);
  };
  const isUrl = link && /^https?:\/\//i.test(link.trim());
  return (
    <div className="imglink">
      <div className="imglink-row">
        <Link2 size={14} color="var(--text-dim)" />
        <input className="input input-inline" placeholder="Dán link TradingView / ảnh chụp màn hình"
          value={link} onChange={(e) => onLinkChange(e.target.value)} />
        {isUrl ? (
          <div className="link-preview-anchor" onMouseEnter={() => setHoverPreview(true)} onMouseLeave={() => setHoverPreview(false)}
            onClick={() => window.open(link, "_blank")}>
            <ImageIcon size={15} color="var(--accent)" />
            {hoverPreview ? (
              <div className="link-preview-popup">
                {linkPreviewFailed ? (
                  <p className="link-preview-fallback">Không xem trước được ảnh này (trang có thể chặn nhúng ảnh) — bấm để mở link gốc.</p>
                ) : (
                  <img src={link} alt={label} onError={() => setLinkPreviewFailed(true)} />
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="imglink-row">
        <label className="upload-btn">
          <ImagePlus size={14} /><span>{image ? "Đổi ảnh" : "Tải ảnh lên"}</span>
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
        </label>
        {image ? (
          <div className="thumb-wrap">
            <img src={image} alt={label} className="thumb" onClick={() => window.open(image, "_blank")} />
            <button type="button" className="thumb-x" onClick={() => onImageChange("")}><X size={12} /></button>
          </div>
        ) : null}
      </div>
      {err ? <span className="error-text">{err}</span> : null}
    </div>
  );
}

export function Section({ num, title, subtitle, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <button type="button" className="section-head" onClick={() => setOpen((o) => !o)}>
        <span className="section-num">{num}</span>
        <span className="section-titles">
          <span className="section-title">{title}</span>
          {subtitle ? <span className="section-sub">{subtitle}</span> : null}
        </span>
        {open ? <ChevronDown size={16} color="var(--text-dim)" /> : <ChevronRight size={16} color="var(--text-dim)" />}
      </button>
      {open ? <div className="section-body">{children}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, tone }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone || ""}`}>{value}</span>
    </div>
  );
}

export function ChartCard({ title, subtitle, children, height = 220, legend }) {
  return (
    <div className="chart-card">
      <div className="chart-head">
        <span className="chart-title">{title}</span>
        {subtitle ? <span className="chart-sub">{subtitle}</span> : null}
      </div>
      <div style={{ width: "100%", height }}>{children}</div>
      {legend ? <ChartLegend items={legend} /> : null}
    </div>
  );
}

export function ChartLegend({ items }) {
  return (
    <div className="chart-legend">
      {items.map((it, i) => (
        <span className="chart-legend-item" key={i}>
          <span className="chart-legend-dot" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function DetailRow({ label, value, tone }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <span className={`mono ${tone || ""}`}>{value === "" || value === null || value === undefined ? "—" : value}</span>
    </div>
  );
}

export function DetailGroup({ title, children, className }) {
  return (
    <div className={`detail-group ${className || ""}`}>
      <h4 className="detail-group-title">{title}</h4>
      <div className="detail-rows">{children}</div>
    </div>
  );
}

export function CompletionBar({ done, total, percent, label = "Tiến độ hoàn thành", missing }) {
  const tone = percent >= 80 ? "high" : percent >= 40 ? "mid" : "low";
  return (
    <div className={`completion-bar completion-${tone}`}>
      <div className="completion-bar-head">
        <span className="completion-bar-label">{label}</span>
        <span className="completion-bar-value mono">{percent}%{typeof total === "number" ? ` · ${done}/${total} mục` : ""}</span>
      </div>
      <div className="completion-bar-track">
        <div className="completion-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      {missing && missing.length > 0 ? (
        <div className="completion-missing">
          {missing.map((m) => (
            <span key={m} className="completion-missing-chip"><AlertCircle size={11} /> {m}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RiskAlertBanner({ alerts }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className="risk-alert-banner">
      <ShieldAlert size={18} />
      <div className="risk-alert-body">
        <span className="risk-alert-title">Cảnh báo giảm risk — {alerts.length} tài khoản cần chú ý</span>
        {alerts.map((a) => (
          <p key={a.accountName} className="risk-alert-line">
            <strong>{a.accountName}:</strong> {a.reasons.join(" · ")}. Cân nhắc giảm khối lượng/risk cho các lệnh tiếp theo.
          </p>
        ))}
      </div>
    </div>
  );
}

export function FormModal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" className="row-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
