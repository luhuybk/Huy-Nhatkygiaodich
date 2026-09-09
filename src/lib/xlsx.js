// Đọc file .xlsx mà không kéo thêm thư viện nào. Một file xlsx thực chất là file zip
// chứa vài file XML, và trình duyệt đã có sẵn DecompressionStream để bung deflate —
// nên chỗ này chỉ cần đọc bảng thư mục của zip rồi bóc XML của sheet đầu tiên.
// Chỉ đọc, không ghi, và chỉ lấy đúng phần cần: giá trị từng ô của sheet 1.

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

function findEocd(view, len) {
  // Chú thích cuối file dài tối đa 65535 byte nên chỉ cần dò ngược trong khoảng đó.
  const from = Math.max(0, len - 22 - 65535);
  for (let i = len - 22; i >= from; i -= 1) {
    if (view.getUint32(i, true) === SIG_EOCD) return i;
  }
  return -1;
}

function zipEntries(buf) {
  const view = new DataView(buf);
  const eocd = findEocd(view, buf.byteLength);
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    if (p + 46 > buf.byteLength || view.getUint32(p, true) !== SIG_CENTRAL) break;
    const nameLen = view.getUint16(p + 28, true);
    out.push({
      name: new TextDecoder().decode(new Uint8Array(buf, p + 46, nameLen)),
      method: view.getUint16(p + 10, true),
      compSize: view.getUint32(p + 20, true),
      localOff: view.getUint32(p + 42, true),
    });
    p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  return out;
}

async function readEntry(buf, entry) {
  const view = new DataView(buf);
  if (view.getUint32(entry.localOff, true) !== SIG_LOCAL) return "";
  // Kích thước tên/extra ở local header có thể khác central header, phải đọc lại đúng chỗ này.
  const start = entry.localOff + 30
    + view.getUint16(entry.localOff + 26, true)
    + view.getUint16(entry.localOff + 28, true);
  const raw = new Uint8Array(buf, start, entry.compSize);
  if (entry.method === 0) return new TextDecoder().decode(raw);
  if (entry.method !== 8) return "";
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function unescapeXml(s) {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (m, code) => {
    if (code[0] !== "#") return ENTITIES[code] !== undefined ? ENTITIES[code] : m;
    const n = code[1] === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  });
}

// Nối mọi <t> bên trong một khối — chuỗi có định dạng bị Excel cắt thành nhiều đoạn.
function textOf(chunk) {
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g;
  let m = re.exec(chunk);
  while (m) {
    out += unescapeXml(m[1] || "");
    m = re.exec(chunk);
  }
  return out;
}

function sharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g;
  let m = re.exec(xml);
  while (m) {
    out.push(textOf(m[1] || ""));
    m = re.exec(xml);
  }
  return out;
}

// "BC12" -> 55. Chỉ lấy phần chữ, phần số là chỉ số dòng.
function colOf(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i += 1) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

// Trả về mảng dòng, mỗi dòng là mảng ô theo đúng cột (ô trống là ""). Giữ nguyên kiểu:
// số ra number, chữ ra string — bên gọi tự quyết định cách hiểu.
function sheetRows(xml, strings) {
  const rows = [];
  const rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>|<row\s[^>]*\/>/g;
  let rm = rowRe.exec(xml);
  while (rm) {
    const body = rm[1] || "";
    const cells = [];
    let width = 0;
    const cellRe = /<c\s([^>]*?)\/>|<c\s([^>]*?)>([\s\S]*?)<\/c>/g;
    let cm = cellRe.exec(body);
    while (cm) {
      const attrs = cm[1] || cm[2] || "";
      const inner = cm[3] || "";
      const ref = /r="([A-Z]+\d+)"/.exec(attrs);
      const type = /t="([^"]+)"/.exec(attrs);
      const at = ref ? colOf(ref[1]) : cells.length;
      let value = "";
      if (type && type[1] === "inlineStr") {
        value = textOf(inner);
      } else {
        const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner);
        const raw = v ? unescapeXml(v[1]) : "";
        if (raw === "") value = "";
        else if (type && type[1] === "s") value = strings[Number(raw)] || "";
        else if (type && (type[1] === "str" || type[1] === "e")) value = raw;
        else if (type && type[1] === "b") value = raw === "1";
        else { const n = Number(raw); value = Number.isFinite(n) ? n : raw; }
      }
      if (at >= 0) {
        cells[at] = value;
        if (at + 1 > width) width = at + 1;
      }
      cm = cellRe.exec(body);
    }
    const row = [];
    for (let i = 0; i < width; i += 1) row.push(cells[i] === undefined ? "" : cells[i]);
    rows.push(row);
    rm = rowRe.exec(xml);
  }
  return rows;
}

export function xlsxSupported() {
  return typeof DecompressionStream === "function" && typeof Blob === "function";
}

// Đọc sheet đầu tiên của file .xlsx. Trả về { rows, error } — không ném lỗi để bên
// giao diện chỉ việc hiện câu thông báo, khỏi bọc try/catch ở mỗi chỗ gọi.
export async function readXlsx(buffer) {
  if (!xlsxSupported()) {
    return { rows: [], error: "Trình duyệt này chưa hỗ trợ đọc file .xlsx — hãy mở file bằng Excel rồi lưu lại thành .csv." };
  }
  let entries;
  try {
    entries = zipEntries(buffer);
  } catch {
    entries = null;
  }
  if (!entries || !entries.length) {
    return { rows: [], error: "Không đọc được file — đây có đúng là file .xlsx không? (.xls đời cũ thì phải lưu lại thành .xlsx)" };
  }
  const sheet = entries.find((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name));
  if (!sheet) return { rows: [], error: "File .xlsx không có sheet nào đọc được." };
  try {
    const shared = entries.find((e) => e.name === "xl/sharedStrings.xml");
    const strings = sharedStrings(shared ? await readEntry(buffer, shared) : "");
    const rows = sheetRows(await readEntry(buffer, sheet), strings);
    if (!rows.length) return { rows: [], error: "Đọc được file nhưng sheet đầu tiên trống." };
    return { rows, error: "" };
  } catch {
    return { rows: [], error: "File .xlsx bị lỗi hoặc nén bằng kiểu không đọc được." };
  }
}

// Ngày giờ trong xlsx là số ngày kể từ 30/12/1899. Tính bằng mốc UTC rồi đọc lại
// bằng getUTC* để con số hiện đúng như trong Excel, không bị lệch theo múi giờ máy.
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export function excelDateParts(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Số thập phân của Excel lẻ vài phần nghìn giây; làm tròn về mili giây trước khi
  // cắt để 09:36:10.9999 không thành 09:36:09.
  const d = new Date(EXCEL_EPOCH + Math.round(n * 86400000));
  return {
    date: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    time: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
    seconds: Math.floor(d.getTime() / 1000),
  };
}
