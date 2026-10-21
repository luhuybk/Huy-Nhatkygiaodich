// Điền .env.deploy bằng cách trả lời từng câu hỏi trong Terminal — khỏi mở file sửa tay.
// Chạy: npm run deploy:setup. Mật khẩu gõ vào không hiện lên màn hình. Xong thì thử đăng nhập
// FTP và xem thư mục web có index.html không (chỉ đọc, không upload gì).
import { Client } from "basic-ftp";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FILE = join(ROOT, ".env.deploy");
const PLACEHOLDER = /tenmien-cua-ban|^u123456789$/;

function readEnv() {
  if (!existsSync(FILE)) return {};
  const out = {};
  readFileSync(FILE, "utf8").split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  });
  return out;
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
// Gom các dòng vào hàng đợi rồi lấy dần — rl.question làm rơi dòng nào tới trước khi được hỏi.
// Lúc nhập mật khẩu thì tắt tiếng phần readline tự in lại chữ vừa gõ.
const lines = [];
let waiter = null;
let muted = false;
let closed = false;
rl._writeToOutput = (s) => {
  if (!muted) process.stdout.write(s);
  else if (s.includes("\n") || s.includes("\r")) process.stdout.write("\n");
};
rl.on("line", (l) => { if (waiter) { const w = waiter; waiter = null; w(l); } else lines.push(l); });
rl.on("close", () => { closed = true; if (waiter) { const w = waiter; waiter = null; w(null); } });
function next() {
  if (lines.length) return Promise.resolve(lines.shift());
  if (closed) return Promise.resolve(null);
  return new Promise((res) => { waiter = res; });
}
// Câu hỏi phải là prompt CỦA readline: in thẳng ra stdout thì lúc gõ chữ readline vẽ lại dòng
// (xoá dòng, in prompt mặc định "> ") và câu hỏi biến mất.
async function ask(q) {
  rl.setPrompt(q);
  rl.prompt();
  const a = await next();
  if (a === null) { console.log("\n✖ Đã huỷ, chưa lưu gì."); process.exit(1); }
  return a.trim();
}
// Mật khẩu: câu hỏi in trên một dòng riêng, dòng gõ bên dưới tắt tiếng hẳn — readline vẽ lại
// dòng đang gõ thì chỉ xoá dòng trống đó, không xoá câu hỏi.
async function askHidden(q) {
  process.stdout.write(`${q}\n`);
  muted = true;
  try { return await ask(""); } finally { muted = false; }
}

// Có giá trị cũ thật (không phải chữ mẫu) thì Enter là giữ nguyên.
async function field(label, old, { fallback = "", optional = false } = {}) {
  const keep = old && !PLACEHOLDER.test(old) ? old : "";
  const def = keep || fallback;
  for (;;) {
    const a = await ask(`${label}${def ? ` [${def}]` : ""}: `);
    if (a) return a;
    if (def || optional) return def;
    console.log("  → Bắt buộc, nhập lại.");
  }
}

async function main() {
  const old = readEnv();
  console.log("\nĐiền thông tin FTP (hPanel Hostinger → Websites → Files → FTP Accounts).");
  console.log("Enter để giữ giá trị trong ngoặc vuông.\n");
  const hostIn = (await field("Máy chủ FTP (FTP_HOST, VD ftp.tenmien.com hoặc IP)", old.FTP_HOST)).replace(/^ftps?:\/\//i, "").replace(/\/+$/, "");
  // Ai dán kèm cổng (host:21) thì tách ra FTP_PORT.
  const hp = /^(.+):(\d+)$/.exec(hostIn);
  const host = hp ? hp[1] : hostIn;
  const port = hp ? hp[2] : old.FTP_PORT || "";
  const user = await field("Tên đăng nhập FTP (FTP_USER)", old.FTP_USER);
  let pass = "";
  for (;;) {
    pass = await askHidden(`Mật khẩu FTP (không hiện chữ khi gõ)${old.FTP_PASSWORD ? " [Enter = giữ mật khẩu cũ]" : ""}: `);
    if (!pass && old.FTP_PASSWORD) { pass = old.FTP_PASSWORD; break; }
    if (pass) break;
    console.log("  → Bắt buộc, nhập lại.");
  }
  const dir = await field("Thư mục web (FTP_DIR)", old.FTP_DIR, { fallback: "public_html" });
  const site = await field("Địa chỉ trang (SITE_URL, Enter để bỏ qua)", old.SITE_URL, { optional: true });
  const secure = String(old.FTP_SECURE || "true").toLowerCase() === "false" ? "false" : "true";
  rl.close();

  const body = [
    "# Tạo bởi npm run deploy:setup — không đưa file này lên git.",
    `FTP_HOST=${host}`,
    `FTP_USER=${user}`,
    `FTP_PASSWORD=${pass}`,
    port && port !== "21" ? `FTP_PORT=${port}` : "",
    `FTP_DIR=${dir}`,
    `FTP_SECURE=${secure}`,
    site ? `SITE_URL=${site}` : "",
    "",
  ].filter((l, i, a) => l || i === a.length - 1).join("\n");
  writeFileSync(FILE, body, "utf8");
  chmodSync(FILE, 0o600);
  console.log("\n✓ Đã lưu .env.deploy. Thử đăng nhập FTP (chỉ đọc)…");

  // Thử FTPS trước; máy chủ không hỗ trợ thì thử FTP thường và ghi lại lựa chọn đó.
  for (const sec of secure === "true" ? [true, false] : [false]) {
    const client = new Client(15000);
    try {
      await client.access({ host, port: Number(port) || 21, user, password: pass, secure: sec, secureOptions: { rejectUnauthorized: false } });
      await client.cd(dir);
      const names = (await client.list()).map((f) => f.name);
      if (!sec && secure === "true") writeFileSync(FILE, body.replace("FTP_SECURE=true", "FTP_SECURE=false"), "utf8");
      console.log(`✓ Đăng nhập được${sec ? " (FTPS mã hoá)" : " (FTP thường)"}, vào được thư mục ${dir}.`);
      console.log(names.includes("index.html")
        ? "✓ Thư mục có index.html — đúng thư mục web. Giờ chạy: npm run deploy"
        : "⚠ Thư mục chưa có index.html — kiểm tra lại FTP_DIR (lần đầu deploy thì chạy: npm run deploy -- --first).");
      client.close();
      return;
    } catch (err) {
      client.close();
      if (sec) { console.log("  FTPS không được, thử FTP thường…"); continue; }
      console.log(`✖ Không đăng nhập được: ${err.message}`);
      console.log("  Kiểm tra lại máy chủ / tên đăng nhập / mật khẩu rồi chạy lại npm run deploy:setup.");
      process.exitCode = 1;
    }
  }
}

main().catch((err) => { rl.close(); console.error(`\n✖ ${err.message}`); process.exit(1); });
