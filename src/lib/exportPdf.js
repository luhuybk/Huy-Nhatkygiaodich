// Xuất các tờ đang hiện ở trang xem trước bản in thành file PDF A4 ngang. Dùng chung cho In lệnh,
// In setup miss / skip và Sổ bài học.
// Ảnh trắng 1×1 thay cho ảnh nào không tải được — một ảnh lỗi không được làm hỏng cả file.
const BLANK_PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
const PAGE_RATIO = 210 / 297;
const EXPORT_WIDTH = 2000;

// Tải về thành PDF để cất lên Google Drive: chụp từng tờ ĐANG HIỆN ở trang xem trước thành ảnh
// rồi xếp vào PDF A4 ngang — file ra đúng y như bản in. Hai thư viện (~400 KB) chỉ được tải lúc
// bấm nút, trang web bình thường không nặng thêm. Trang tổng kết cao hơn một tờ thì cắt ra nhiều tờ.
export async function exportPdf(nodes, fileName, onProgress) {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  let first = true;
  const addPage = (canvas) => {
    if (!first) pdf.addPage("a4", "landscape");
    first = false;
    const h = Math.min(210, (canvas.height / canvas.width) * 297);
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.86), "JPEG", 0, 0, 297, h);
  };
  for (let i = 0; i < nodes.length; i += 1) {
    onProgress(i + 1, nodes.length);
    const node = nodes[i];
    const ratio = EXPORT_WIDTH / Math.max(1, node.offsetWidth);
    // Khối đánh dấu data-pdf-keep (VD một bài học trong Sổ bài học) không bị cắt ngang giữa hai
    // trang: đo vị trí trước khi chụp, lúc cắt tờ thì lùi đường cắt lên ngay trên khối đó.
    const top0 = node.getBoundingClientRect().top;
    // data-pdf-keep="with-next": tiêu đề dính với hàng đầu tiên của khối ngay sau nó.
    const keeps = [...node.querySelectorAll("[data-pdf-keep]")].map((el) => {
      const r = el.getBoundingClientRect();
      const next = el.dataset.pdfKeep === "with-next" && el.nextElementSibling;
      const bottom = next ? (next.firstElementChild || next).getBoundingClientRect().bottom : r.bottom;
      return [(r.top - top0) * ratio, (Math.max(r.bottom, bottom) - top0) * ratio];
    });
    const canvas = await toCanvas(node, {
      pixelRatio: ratio,
      backgroundColor: "#ffffff",
      imagePlaceholder: BLANK_PX,
      cacheBust: false,
      // Không nhúng font web: trang in dùng font hệ thống, còn nhúng thì thư viện tải về cả chục
      // file font Google của app — lần bấm đầu tiên đứng hàng chục giây ở trang 1.
      skipFonts: true,
    });
    const pageH = Math.round(canvas.width * PAGE_RATIO);
    if (canvas.height <= pageH + 4) { addPage(canvas); continue; }
    // Dải cuối mỏng hơn ~2% tờ chỉ là lề thừa, cắt ra thành một trang gần trắng thì bỏ.
    for (let y = 0; y < canvas.height && canvas.height - y > pageH * 0.02;) {
      let end = Math.min(canvas.height, y + pageH);
      // Chỉ lùi khi khối bắt đầu sau 30% tờ — khối cao hơn cả tờ thì đành cắt như thường.
      for (let moved = true; moved && end < canvas.height;) {
        moved = false;
        for (const [a, b] of keeps) {
          const cut = Math.floor(a - 6 * ratio);
          if (a < end && b > end && cut > y + pageH * 0.3 && cut < end) { end = cut; moved = true; }
        }
      }
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = end - y;
      const ctx = slice.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, -y);
      addPage(slice);
      y = end;
    }
  }
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { pages: pdf.getNumberOfPages(), size: blob.size };
}
