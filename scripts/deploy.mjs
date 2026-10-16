// Đưa bản build (dist/) lên hosting qua FTP — thay cho kéo thả tay. Chạy: npm run deploy
// (tự build trước). Thử mà không upload: npm run deploy -- --dry
//
// Thứ tự để trang web không bao giờ trỏ vào file chưa có:
//   1. Upload mọi file trong dist/ TRỪ index.html (file trong assets/ có mã băm trong tên — file
//      đã có trên máy chủ, cùng kích thước thì bỏ qua).
//   2. Đối chiếu kích thước từng file vừa upload với bản trên máy; lệch thì upload lại một lần,
//      vẫn lệch thì DỪNG — index.html cũ vẫn trỏ vào assets cũ, trang không hỏng.
//   3. Upload index.html cuối cùng (ghi ra file tạm rồi đổi tên, khỏi lộ index.html dở dang).
//   4. Xoá file cũ trong assets/ mà bản mới không dùng nữa. KHÔNG đụng gì ngoài assets/.
//   5. Có SITE_URL thì tải thử trang thật, xem index.html và file CSS có đúng bản mới không.
//
// Thông tin FTP đọc từ .env.deploy (không lên git) — xem .env.deploy.example.
import { Client } from "basic-ftp";
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const DRY = process.argv.includes("--dry");
const FIRST = process.argv.includes("--first");

function readEnv(file) {
  if (!existsSync(file)) return null;
  const out = {};
  readFileSync(file, "utf8").split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) return;
    out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  });
  return out;
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

async function main() {
  const env = readEnv(join(ROOT, ".env.deploy"));
  if (!env) fail("Chưa có file .env.deploy — chép .env.deploy.example thành .env.deploy rồi điền thông tin FTP.");
  const { FTP_HOST, FTP_USER, FTP_PASSWORD } = env;
  if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD) fail(".env.deploy thiếu FTP_HOST / FTP_USER / FTP_PASSWORD.");
  const remoteDir = env.FTP_DIR || "public_html";
  const secure = String(env.FTP_SECURE || "true").toLowerCase() !== "false";
  if (!existsSync(join(DIST, "index.html"))) fail("Không thấy dist/index.html — build hỏng hoặc chưa build.");

  const files = walk(DIST).map((p) => ({ local: p, rel: relative(DIST, p).split(sep).join("/"), size: statSync(p).size }));
  const index = files.find((f) => f.rel === "index.html");
  const rest = files.filter((f) => f !== index);
  const css = files.filter((f) => /^assets\/.*\.css$/.test(f.rel));
  console.log(`Bản build: ${files.length} file · CSS ${css.map((f) => `${f.rel} (${f.size.toLocaleString("vi-VN")} byte)`).join(", ")}`);

  const client = new Client(30000);
  try {
    console.log(`Kết nối ${FTP_HOST} (${secure ? "FTPS" : "FTP thường"})…`);
    await client.access({ host: FTP_HOST, port: Number(env.FTP_PORT) || 21, user: FTP_USER, password: FTP_PASSWORD, secure, secureOptions: { rejectUnauthorized: false } });
    await client.cd(remoteDir).catch(() => fail(`Không vào được thư mục "${remoteDir}" trên máy chủ — kiểm tra FTP_DIR.`));
    const base = await client.pwd();
    const top = await client.list();
    // Chặn upload nhầm chỗ: thư mục đích phải là nơi đang chứa trang (có index.html), trừ lần đầu.
    if (!FIRST && !top.some((f) => f.name === "index.html")) {
      fail(`Thư mục "${base}" chưa có index.html — có đúng là thư mục của trang không? Lần đầu thì chạy thêm --first.`);
    }

    const remoteSize = new Map();
    const listDir = async (dir) => {
      const list = await client.list(posix.join(base, dir)).catch(() => []);
      list.forEach((f) => { if (f.isFile) remoteSize.set(dir ? `${dir}/${f.name}` : f.name, f.size); });
    };
    await listDir("");
    const dirs = [...new Set(rest.map((f) => posix.dirname(f.rel)).filter((d) => d !== "."))];
    for (const d of dirs) await listDir(d);

    const todo = rest.filter((f) => remoteSize.get(f.rel) !== f.size);
    const oldAssets = [...remoteSize.keys()].filter((k) => k.startsWith("assets/") && !files.some((f) => f.rel === k));
    console.log(`Cần upload ${todo.length} file (bỏ qua ${rest.length - todo.length} file đã có, cùng kích thước) + index.html.`);
    console.log(`Sẽ xoá ${oldAssets.length} file cũ trong assets/.`);
    if (DRY) {
      todo.forEach((f) => console.log(`  ↑ ${f.rel} (${kb(f.size)})`));
      oldAssets.forEach((k) => console.log(`  ✕ ${k}`));
      console.log("\n(--dry: chưa upload / xoá gì.)");
      return;
    }

    const upload = async (f, remoteName = f.rel) => {
      const dir = posix.dirname(remoteName);
      if (dir !== ".") await client.ensureDir(posix.join(base, dir));
      await client.cd(base);
      await client.uploadFrom(createReadStream(f.local), posix.join(base, remoteName));
    };
    const sizeOf = async (remoteName) => client.size(posix.join(base, remoteName)).catch(() => -1);

    let n = 0;
    for (const f of todo) {
      n += 1;
      process.stdout.write(`  ↑ [${n}/${todo.length}] ${f.rel} (${kb(f.size)})`);
      await upload(f);
      let got = await sizeOf(f.rel);
      if (got !== f.size) { await upload(f); got = await sizeOf(f.rel); }
      if (got !== f.size) { process.stdout.write("\n"); fail(`${f.rel} trên máy chủ ${got} byte, bản build ${f.size} byte — dừng, chưa đụng index.html nên trang cũ vẫn chạy.`); }
      process.stdout.write(" ✓\n");
    }

    // index.html: ghi ra file tạm rồi đổi tên.
    const tmp = "index.html.uploading";
    await upload(index, tmp);
    if ((await sizeOf(tmp)) !== index.size) fail("index.html upload không đủ — dừng, index.html cũ vẫn nguyên.");
    await client.remove(posix.join(base, "index.html")).catch(() => {});
    await client.rename(posix.join(base, tmp), posix.join(base, "index.html"));
    if ((await sizeOf("index.html")) !== index.size) fail("index.html sau khi đổi tên không khớp kích thước.");
    console.log(`  ↑ index.html (${kb(index.size)}) ✓`);

    for (const k of oldAssets) await client.remove(posix.join(base, k)).catch(() => console.warn(`  ! không xoá được ${k}`));
    if (oldAssets.length) console.log(`  ✕ đã xoá ${oldAssets.length} file cũ trong assets/`);

    // Đối chiếu lần cuối toàn bộ assets/.
    remoteSize.clear();
    await listDir("assets");
    const bad = files.filter((f) => f.rel.startsWith("assets/") && remoteSize.get(f.rel) !== f.size);
    if (bad.length) fail(`Còn ${bad.length} file trong assets/ lệch kích thước: ${bad.map((f) => f.rel).join(", ")}`);
    console.log(`\n✓ Máy chủ khớp bản build: ${files.length} file, CSS ${css.map((f) => `${f.size.toLocaleString("vi-VN")} byte`).join(", ")}.`);
  } finally {
    client.close();
  }

  if (env.SITE_URL) {
    const site = env.SITE_URL.replace(/\/+$/, "");
    try {
      const html = await (await fetch(`${site}/?v=${Date.now()}`, { cache: "no-store" })).text();
      for (const f of css) {
        if (!html.includes(f.rel)) { console.warn(`! Trang ${site} chưa trỏ tới ${f.rel} — có thể do bộ đệm của hosting, đợi một lúc hoặc xoá cache trong hPanel.`); continue; }
        const res = await fetch(`${site}/${f.rel}`, { cache: "no-store" });
        const len = (await res.arrayBuffer()).byteLength;
        console.log(len === f.size ? `✓ ${site}/${f.rel} tải về đủ ${len.toLocaleString("vi-VN")} byte.` : `! ${f.rel} tải về ${len} byte, bản build ${f.size} byte.`);
      }
    } catch (e) {
      console.warn(`! Không tải thử được ${site}: ${e.message}`);
    }
  }
  console.log("Xong — mở trang và bấm Cmd+Shift+R.");
}

main().catch((e) => fail(e && e.message ? e.message : String(e)));
