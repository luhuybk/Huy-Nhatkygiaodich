import { useState } from "react";
import { Download, Upload, Save } from "lucide-react";
import { ACCENT_PRESETS } from "../lib/constants.js";
import { BACKUP_KEEP } from "../lib/helpers.js";
import { DangerConfirmButton, Field, StatCard } from "./ui.jsx";

export function SettingsSection({ trades, resources, ledger, notes, lessons, processImprovements, problemLogs, newsLogs, principles, setupLibrary, missedSetups, skippedSetups, setupVariants, reminders, capitalAccounts, capitalEntries, capitalFlows, uiSettings, onUiSettingsChange, slReminderSettings, symbolWatches, backups, onRestoreBackup, onBackupNow, onImportAll, onReset }) {
  const [msg, setMsg] = useState("");

  const doExport = () => {
    const payload = { trades, resources, ledger, notes, lessons, processImprovements, problemLogs, newsLogs, principles, setupLibrary, uiSettings, missedSetups, skippedSetups, setupVariants, reminders, capitalAccounts, capitalEntries, capitalFlows, slReminderSettings, symbolWatches, exportedAt: new Date().toISOString() };
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

      <h3 className="block-title">Sao lưu tự động</h3>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Cứ 7 ngày mở web một lần, hệ thống tự chụp lại toàn bộ dữ liệu và giữ {BACKUP_KEEP} bản gần nhất.
        Một bản cũng được chụp ngay trước khi bạn bấm "Xóa toàn bộ dữ liệu". Khôi phục sẽ ghi đè dữ liệu hiện tại bằng bản đã chọn. Bản sao lưu giữ toàn bộ chữ và link, nhưng bỏ ảnh dán trực tiếp để không phình dung lượng — dùng "Xuất JSON" nếu muốn sao lưu kèm ảnh.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <button type="button" className="btn btn-ghost" onClick={onBackupNow}><Save size={14} /> Sao lưu ngay</button>
      </div>
      {backups.length === 0 ? (
        <p className="empty-note">Chưa có bản sao lưu nào — bấm "Sao lưu ngay" để tạo bản đầu tiên.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {backups.map((b) => (
            <div key={b.id} className="backup-row">
              <span className="mono">{new Date(b.createdAt).toLocaleString("vi-VN")}</span>
              <span className="field-hint" style={{ flex: 1 }}>
                {b.counts ? `${b.counts.trades} lệnh · ${b.counts.lessons} bài học · ${b.counts.missedSetups + b.counts.skippedSetups + (b.counts.setupVariants || 0)} setup miss/skip/biến thể` : ""}
                {b.sizeKB ? ` · ${b.sizeKB} KB` : ""}
              </span>
              <DangerConfirmButton label="Khôi phục" confirmLabel="Bấm lần nữa để ghi đè" onConfirm={() => { onRestoreBackup(b.id); setMsg("Đã khôi phục bản sao lưu."); }} />
            </div>
          ))}
        </div>
      )}

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
        <StatCard label="Setup biến thể" value={setupVariants.length} />
        <StatCard label="Nhắc nhở" value={reminders.length} />
      </div>
    </div>
  );
}
