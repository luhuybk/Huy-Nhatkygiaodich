// Danh sách lệnh lưu NGUYÊN KHỐI (app_data "trades"). Hai tab / hai máy cùng mở nhật ký thì tab cũ lưu
// đè mất thay đổi của tab kia — 04/11 mất phần đóng của 4 lệnh MT5 như vậy.
// Nay trước mỗi lần lưu app xem dấu thời gian trên máy chủ; khác dấu của lần lưu/đọc gần nhất = nơi khác
// vừa ghi → tải bản đó về rồi gộp 3 bên theo từng lệnh, từng ô (mergeTrades), không ghi đè cả khối.

// Dấu thời gian: thêm 3 chữ số micro giây ngẫu nhiên để hai máy lưu cùng một mili giây vẫn khác dấu.
// Máy chủ trả dạng "…:07.537123+00:00" (bỏ số 0 cuối) — so theo giây + 6 chữ số lẻ.
export function newStamp() {
  return new Date().toISOString().replace("Z", `${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}Z`);
}
function stampKey(v) {
  const m = String(v || "").match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?/);
  return m ? `${m[1]}.${(m[2] || "").padEnd(6, "0").slice(0, 6)}` : String(v || "");
}

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

function byId(list) {
  const m = new Map();
  (list || []).forEach((t) => { if (t && t.id) m.set(t.id, t); });
  return m;
}

// Một lệnh: ô nào mình sửa (khác bản gốc) thì lấy của mình, còn lại lấy bản trên máy chủ
function mergeTrade(base, ours, theirs) {
  if (same(ours, base)) return theirs;
  if (same(theirs, base)) return ours;
  const out = { ...theirs };
  new Set([...Object.keys(ours), ...Object.keys(base)]).forEach((k) => {
    if (same(ours[k], base[k])) return;
    if (ours[k] === undefined) delete out[k];
    else out[k] = ours[k];
  });
  return out;
}

// base = bản mà `ours` được sửa ra từ đó; theirs = bản đang nằm trên máy chủ.
// Lệnh nơi khác thêm → giữ; lệnh mình xoá → bỏ; lệnh nơi khác xoá mà mình không sửa → bỏ.
export function mergeTrades(base, ours, theirs) {
  if (!Array.isArray(theirs) || theirs === base || theirs === ours) return ours;
  if (!Array.isArray(base)) return ours;
  if (ours === base) return theirs;
  const B = byId(base);
  const T = byId(theirs);
  const O = byId(ours);
  const out = [];
  for (const o of ours) {
    const id = o && o.id;
    const b = id ? B.get(id) : undefined;
    const t = id ? T.get(id) : undefined;
    if (!id || !b) { out.push(o); continue; }
    if (!t) { if (!same(o, b)) out.push(o); continue; }
    out.push(mergeTrade(b, o, t));
  }
  for (const t of theirs) {
    if (t && t.id && !O.has(t.id) && !B.has(t.id)) out.push(t);
  }
  return out;
}

// Bộ lưu có hàng đợi (một lần ghi một lúc). io = { getStamp, get, set } — xem App.jsx.
//   base      = bản mình biết đang nằm trên máy chủ
//   inputBase = bản mà danh sách đang hiện trên màn hình được sửa ra từ đó
//   stamp     = updated_at của `base` trên máy chủ (null = chưa biết → lần lưu đầu sẽ kiểm)
export function createTradeSync(io) {
  const s = { base: null, inputBase: null, stamp: null, chain: Promise.resolve() };
  const queue = (fn) => {
    const p = s.chain.then(fn, fn);
    s.chain = p.catch(() => {});
    return p;
  };
  const changedOnServer = async () => {
    const cur = await io.getStamp();
    if (!cur || !cur.ok || !cur.stamp) return null;
    if (s.stamp && stampKey(cur.stamp) === stampKey(s.stamp)) return null;
    const theirs = await io.get();
    return Array.isArray(theirs) ? { theirs, stamp: cur.stamp } : null;
  };
  return {
    loaded(list) { s.base = list; s.inputBase = list; s.stamp = null; },
    // Trả { ok, value } — value khác `next` khi đã gộp thay đổi của nơi khác
    save(next) {
      return queue(async () => {
        let value = s.inputBase ? mergeTrades(s.inputBase, next, s.base) : next;
        const server = s.base ? await changedOnServer() : null;
        if (server) value = mergeTrades(s.base, value, server.theirs);
        const stamp = newStamp();
        const ok = await io.set(value, stamp);
        if (ok) { s.base = value; s.stamp = stamp; s.inputBase = next; }
        return { ok, value };
      });
    },
    // Quay lại tab: nơi khác vừa lưu thì kéo về. Trả { from, to } để App gộp vào danh sách đang hiện.
    refresh() {
      return queue(async () => {
        if (!s.base) return null;
        const server = await changedOnServer();
        if (!server) return null;
        const from = s.base;
        s.inputBase = from;
        s.base = server.theirs;
        s.stamp = server.stamp;
        return { from, to: server.theirs };
      });
    },
  };
}
