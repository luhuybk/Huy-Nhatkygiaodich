import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { ACCENT_PRESETS } from "../lib/constants.js";
import { DangerConfirmButton, Field, StatCard } from "./ui.jsx";

export function SettingsSection({ trades, resources, ledger, notes, lessons, processImprovements, problemLogs, newsLogs, principles, setupLibrary, missedSetups, skippedSetups, reminders, capitalAccounts, capitalEntries, capitalFlows, uiSettings, onUiSettingsChange, slReminderSettings, onImportAll, onReset }) {
  const [msg, setMsg] = useState("");

  const doExport = () => {
    const payload = { trades, resources, ledger, notes, lessons, processImprovements, problemLogs, newsLogs, principles, setupLibrary, uiSettings, missedSetups, skippedSetups, reminders, capitalAccounts, capitalEntries, capitalFlows, slReminderSettings, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `nhat-ky-giao-dich-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setMsg("Đã xuất file JSON.");
  };

  const doImport = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        onImportAll(data);
        setMsg("Đã nhập dữ liệu thành công.");
      } catch (err) {
        setMsg("File không hợp lệ, không đọc được.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div>
      <h3 className="block-title" style={{ marginTop: 0 }}>Giao diện</h3>
      <div className="account-form">
        <Field label="Theme">
          <div className="seg" style={{ maxWidth: 200 }}>
            <button type="button" className={`seg-btn ${uiSettings.mode === "dark" ? "seg-active" : ""}`} onClick={() => onUiSettingsChange({ ...uiSettings, mode: "dark" })}>Tối</button>
            <button type="button" className={`seg-btn ${uiSettings.mode === "light" ? "seg-active" : ""}`} onClick={() => onUiSettingsChange({ ...uiSettings, mode: "light" })}>Sáng</button>
          </div>
        </Field>
        <Field label="Màu chủ đạo">
          <div style={{ display: "flex", gap: 10 }}>
            {Object.entries(ACCENT_PRESETS).map(([key, hex]) => (
              <button type="button" key={key} onClick={() => onUiSettingsChange({ ...uiSettings, accent: key })}
                aria-label={key}
                style={{
                  width: 28, height: 28, borderRadius: "50%", background: hex, cursor: "pointer",
                  border: uiSettings.accent === key ? "2px solid var(--text)" : "2px solid transparent",
                  boxShadow: uiSettings.accent === key ? `0 0 0 2px ${hex}55` : "none",
                }} />
            ))}
          </div>
        </Field>
      </div>

      <h3 className="block-title">Nhập / Xuất dữ liệu</h3>
      <p className="field-hint" style={{ marginBottom: 12 }}>Toàn bộ giao dịch, tài nguyên, sổ vốn, ghi chú và thư viện setup được gộp vào một file JSON để sao lưu hoặc chuyển sang máy khác.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <button type="button" className="btn btn-primary" onClick={doExport}><Download size={14} /> Xuất JSON</button>
        <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
          <Upload size={14} /> Nhập JSON
          <input type="file" accept="application/json" style={{ display: "none" }} onChange={doImport} />
        </label>
      </div>
      {msg ? <p className="field-hint" style={{ color: "var(--accent)" }}>{msg}</p> : null}

      <h3 className="block-title">Vùng nguy hiểm</h3>
      <p className="field-hint" style={{ marginBottom: 12 }}>Xóa toàn bộ giao dịch, tài nguyên, sổ vốn, ghi chú và setup mẫu. Không thể hoàn tác.</p>
      <DangerConfirmButton label="Xóa toàn bộ dữ liệu" confirmLabel="Bấm lần nữa để xác nhận xóa hết" onConfirm={onReset} />

      <h3 className="block-title">Dung lượng hiện tại</h3>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <StatCard label="Giao dịch" value={trades.length} />
        <StatCard label="Tài khoản" value={resources.accounts.length} />
        <StatCard label="Ghi chú" value={notes.length} />
        <StatCard label="Bài học" value={lessons.length} />
        <StatCard label="Vấn đề" value={problemLogs.length} />
        <StatCard label="Tin tức" value={newsLogs.length} />
        <StatCard label="Setup mẫu" value={setupLibrary.length} />
        <StatCard label="Setup bị miss" value={missedSetups.length} />
        <StatCard label="Setup bị skip" value={skippedSetups.length} />
        <StatCard label="Nhắc nhở" value={reminders.length} />
      </div>
    </div>
  );
}
