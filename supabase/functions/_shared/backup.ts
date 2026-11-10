// Sao lưu tuần ra Telegram — sl-reminder gửi một file JSON toàn bộ dữ liệu vào chat chính (mặc định tối Chủ nhật 21:00).
// Bản "Sao lưu tự động" trên web nằm CHUNG cơ sở dữ liệu với dữ liệu gốc (app_data "backups") — mất cơ sở dữ liệu là mất
// cả hai. File này nằm ở Telegram, ngoài cơ sở dữ liệu. Cùng dạng với file "Xuất JSON" ở Cài đặt nên khôi phục bằng
// Cài đặt → Nhập JSON. Mã bot Telegram KHÔNG nằm trong file (file nằm trong nhóm chat) — web nhập lại thì giữ mã đang có.
// Cài đặt: slReminderSettings.weeklyBackup = { enabled (mặc định bật), weekday "CN", time "21:00", threadId }.

import { SL_HIST_PREFIX } from "./eaWatch.ts";

export type BackupCfg = { enabled?: boolean; weekday?: string; time?: string; threadId?: string };
export const BACKUP_DEFAULT = { enabled: true, weekday: "CN", time: "21:00", threadId: "" };
export function backupCfg(c?: BackupCfg | null) {
  return {
    enabled: c?.enabled !== false,
    weekday: String(c?.weekday || BACKUP_DEFAULT.weekday),
    time: /^\d{2}:\d{2}$/.test(String(c?.time || "")) ? String(c!.time) : BACKUP_DEFAULT.time,
    threadId: String(c?.threadId || ""),
  };
}

// Đúng các khoá của nút "Xuất JSON" (src/components/Settings.jsx doExport) — thêm kho dữ liệu mới thì thêm cả hai nơi.
export const BACKUP_KEYS = [
  "trades", "resources", "ledger", "notes", "lessons", "processImprovements", "problemLogs", "newsLogs", "journeyLog",
  "tradingPlans", "capitalPlan", "skills", "journalFilterPresets", "principles", "setupLibrary", "setupErrors", "uiSettings",
  "missedSetups", "skippedSetups", "setupVariants", "reminders", "capitalAccounts", "capitalEntries", "capitalFlows",
  "slReminderSettings", "symbolWatches", "setupCheckLog",
];
// Telegram nhận file tối đa 50 MB qua bot. Quá mốc này thì bỏ ảnh nhúng base64 (ảnh trong kho ảnh chỉ là đường dẫn, vẫn giữ).
export const BACKUP_MAX_BYTES = 45 * 1024 * 1024;

type Row = { key: string; value: unknown };

function stripInline(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripInline);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = stripInline(x);
    return out;
  }
  return typeof v === "string" && v.startsWith("data:image") ? "" : v;
}

const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);

// rows = các ô app_data của người dùng (khoá trong BACKUP_KEYS + slHist:*). Trả chuỗi JSON + vài con số cho lời nhắn.
export function buildBackup(rows: Row[], nowIso: string, maxBytes = BACKUP_MAX_BYTES) {
  const by = new Map(rows.map((r) => [r.key, r.value]));
  let payload: Record<string, unknown> = {};
  for (const k of BACKUP_KEYS) if (by.has(k) && by.get(k) !== null && by.get(k) !== undefined) payload[k] = by.get(k);
  const s = payload.slReminderSettings;
  if (s && typeof s === "object" && !Array.isArray(s)) payload.slReminderSettings = { ...(s as Record<string, unknown>), telegramBotToken: "" };
  // Lịch sử SL từng lệnh (EA) — web chưa có chỗ nhập lại, giữ để không mất
  const hist: Record<string, unknown> = {};
  for (const r of rows) if (r.key.startsWith(SL_HIST_PREFIX)) hist[r.key] = r.value;
  if (Object.keys(hist).length) payload.slHist = hist;
  payload.exportedAt = nowIso;
  payload.exportedBy = "telegram-weekly";
  const enc = new TextEncoder();
  let json = JSON.stringify(payload);
  let bytes = enc.encode(json).length;
  let stripped = false;
  if (bytes > maxBytes) {
    payload = stripInline(payload) as Record<string, unknown>;
    json = JSON.stringify(payload);
    bytes = enc.encode(json).length;
    stripped = true;
  }
  return {
    json, bytes, stripped, tooBig: bytes > maxBytes, keys: Object.keys(payload).length,
    counts: { trades: len(payload.trades), lessons: len(payload.lessons), slHist: Object.keys(hist).length },
  };
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function backupCaption(b: ReturnType<typeof buildBackup>, dateLabel: string) {
  const lines = [
    `💾 SAO LƯU TUẦN · ${dateLabel}`,
    `${b.counts.trades} lệnh · ${b.counts.lessons} bài học${b.counts.slHist ? ` · lịch sử SL ${b.counts.slHist} lệnh` : ""} · ${kb(b.bytes)}`,
    "Bản dự phòng nằm ngoài cơ sở dữ liệu. Khôi phục: web → Cài đặt → Nhập JSON, chọn file này. File không chứa mã bot Telegram.",
  ];
  if (b.stripped) lines.push("⚠️ File quá lớn nên đã bỏ ảnh nhúng cũ — chuyển ảnh sang kho ảnh ở Cài đặt để bản sau giữ được ảnh.");
  return lines.join("\n");
}

// Gửi file vào chat (sendDocument). Trả { ok, description } — description là lời Telegram báo khi hỏng.
export async function sendBackupFile(token: string, chatId: string, threadId: string, filename: string, json: string, caption: string) {
  const form = new FormData();
  form.append("chat_id", chatId);
  const thread = threadId ? Number(threadId) : NaN;
  if (thread && !Number.isNaN(thread)) form.append("message_thread_id", String(thread));
  form.append("caption", caption.slice(0, 1024));
  form.append("document", new Blob([json], { type: "application/json" }), filename);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form });
    let info: { ok?: boolean; description?: string } = {};
    try { info = await res.json(); } catch (_e) { /* không phải JSON */ }
    return { ok: !!info.ok, description: info.description || (res.ok ? "" : `HTTP ${res.status}`) };
  } catch (e) {
    return { ok: false, description: String((e as Error).message || e) };
  }
}
