// Ảnh dán/tải lên trước đây được nhúng thẳng vào JSON dưới dạng base64: phình 33% so với
// file gốc, nằm chung blob với dữ liệu nên mọi lần lưu đều phải ghi lại toàn bộ, và bị
// giới hạn 1.5MB. Nay đẩy lên Supabase Storage, trong dữ liệu chỉ còn một đường dẫn.
import { supabase } from "../supabaseClient.js";
import { uid } from "./helpers.js";

export const IMAGE_BUCKET = "trade-images";
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const SETUP_HINT = 'Chưa tạo kho ảnh. Chạy file supabase-storage-setup.sql trong Supabase → SQL Editor rồi thử lại.';

export function isInlineImage(v) {
  return typeof v === "string" && v.startsWith("data:image");
}

function describeError(error) {
  const msg = String(error?.message || error || "");
  if (/bucket not found/i.test(msg) || /does not exist/i.test(msg)) return SETUP_HINT;
  if (/row-level security|not authorized|violates/i.test(msg)) return `Không có quyền ghi vào kho ảnh. ${SETUP_HINT}`;
  return `Tải ảnh lên thất bại: ${msg}`;
}

async function put(file, ext) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return { error: "Phiên đăng nhập đã hết hạn — đăng nhập lại rồi thử lại." };

  // Thư mục đầu là user id: policy của Storage dựa vào đó để chặn người khác ghi đè.
  const path = `${userId}/${uid()}.${ext}`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
    contentType: file.type || "image/png",
    upsert: false,
  });
  if (error) return { error: describeError(error) };
  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

export async function uploadImageFile(file) {
  if (file.size > IMAGE_MAX_BYTES) {
    return { error: `Ảnh quá lớn (>${Math.round(IMAGE_MAX_BYTES / 1024 / 1024)}MB). Chọn ảnh nhỏ hơn hoặc dùng link TradingView.` };
  }
  const ext = (file.name || "").split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  return put(file, ext || "png");
}

export async function uploadInlineImage(dataUrl) {
  const match = /^data:(image\/([a-z0-9+.-]+));base64,(.*)$/i.exec(dataUrl);
  if (!match) return { error: "Chuỗi ảnh không hợp lệ." };
  const [, mime, subtype, b64] = match;
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return put(new Blob([bytes], { type: mime }), subtype === "jpeg" ? "jpg" : subtype);
  } catch (e) {
    return { error: "Không giải mã được ảnh cũ." };
  }
}

export function countInlineImages(value) {
  if (Array.isArray(value)) return value.reduce((n, v) => n + countInlineImages(v), 0);
  if (value && typeof value === "object") return Object.values(value).reduce((n, v) => n + countInlineImages(v), 0);
  return isInlineImage(value) ? 1 : 0;
}

// Thay mọi chuỗi base64 bằng đường dẫn Storage. `upload` trả về chuỗi thay thế —
// nếu tải lên hỏng thì trả lại chính chuỗi cũ để không mất ảnh.
export async function replaceInlineImages(value, upload) {
  if (Array.isArray(value)) {
    const out = [];
    for (const v of value) out.push(await replaceInlineImages(v, upload));
    return out;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = isInlineImage(v) ? await upload(v) : await replaceInlineImages(v, upload);
    }
    return out;
  }
  return value;
}

// ——— Dọn ảnh mồ côi ———
// Trước đây không chỗ nào xóa file khỏi Storage: xóa một lệnh, một bài học, hay chỉ đổi ảnh
// khác trong form, thì file cũ ở lại vĩnh viễn và không ai nhìn thấy nó nữa.

const PUBLIC_MARKER = `/storage/v1/object/public/${IMAGE_BUCKET}/`;

// Đường dẫn trong bucket của một URL công khai; không phải ảnh của bucket này thì trả rỗng.
export function storagePathOf(value) {
  if (typeof value !== "string") return "";
  const at = value.indexOf(PUBLIC_MARKER);
  if (at < 0) return "";
  const raw = value.slice(at + PUBLIC_MARKER.length).split(/[?#]/)[0];
  try { return decodeURIComponent(raw); } catch { return raw; }
}

// Đi khắp dữ liệu nhặt mọi đường dẫn ảnh CÒN được trỏ tới. Cố tình đi sâu toàn bộ thay vì
// liệt kê từng trường: thêm một trường ảnh mới mà quên cập nhật danh sách thì hậu quả là
// xóa nhầm ảnh thật — không dựng lại được.
export function collectImagePaths(value, out = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((v) => collectImagePaths(v, out));
    return out;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectImagePaths(v, out));
    return out;
  }
  const p = storagePathOf(value);
  if (p) out.add(p);
  return out;
}

const LIST_PAGE = 100;

// Liệt kê file trong thư mục của chính người dùng. Storage chỉ cho list từng trang nên
// phải lặp; gặp lỗi giữa chừng thì trả lỗi chứ KHÔNG trả danh sách thiếu — danh sách thiếu
// sẽ khiến ảnh còn dùng bị coi là mồ côi.
export async function listStoredImages() {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return { error: "Phiên đăng nhập đã hết hạn — đăng nhập lại rồi thử lại." };

  const files = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await supabase.storage.from(IMAGE_BUCKET)
      .list(userId, { limit: LIST_PAGE, offset, sortBy: { column: "created_at", order: "asc" } });
    if (error) return { error: describeError(error) };
    if (!data || !data.length) break;
    data.forEach((f) => {
      if (!f || !f.name || f.id === null) return; // thư mục con, không phải file
      const path = `${userId}/${f.name}`;
      files.push({
        path,
        name: f.name,
        size: Number(f.metadata?.size) || 0,
        createdAt: f.created_at || "",
        // Kèm luôn URL để chỗ hiển thị khỏi phải tự ghép lại đường dẫn công khai.
        url: supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl,
      });
    });
    if (data.length < LIST_PAGE) break;
  }
  return { files, userId };
}

// Xóa hẳn, không hoàn tác được. Chỉ nhận đường dẫn nằm trong thư mục của chính người dùng.
export async function deleteStoredImages(paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return { removed: 0 };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return { error: "Phiên đăng nhập đã hết hạn — đăng nhập lại rồi thử lại." };
  const mine = list.filter((p) => p.startsWith(`${userId}/`));
  if (mine.length !== list.length) return { error: "Có đường dẫn không thuộc kho ảnh của bạn — đã dừng, không xóa gì." };
  const { error } = await supabase.storage.from(IMAGE_BUCKET).remove(mine);
  if (error) return { error: describeError(error) };
  return { removed: mine.length };
}
