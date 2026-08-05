export const WIN = "var(--win)";

export const LOSS = "var(--loss)";

export const ACCENT = "var(--accent)";

export const MUTED = "var(--text-dim)";

export const GRID = "var(--border)";

export const SURF2 = "var(--surface-2)";

export const TEXT = "var(--text)";

export const RESOURCE_GROUPS = [
  {
    key: "symbols", label: "Symbol", children: [
      { key: "symbols", label: "Symbol", hint: "Danh sách symbol gợi ý khi nhập lệnh — vẫn có thể gõ tự do symbol khác (cổ phiếu VN/US...)" },
    ]
  },
  {
    key: "knowledge", label: "Kiến thức", children: [
      { key: "setups", label: "Setup", hint: "Các mẫu hình vào lệnh (RB, IRB, ARB...)" },
      { key: "setupBonus", label: "Bonus", hint: "Điểm cộng thêm cho setup (hợp lưu, volume, tin tức...)" },
      { key: "setupNotes", label: "Nhận xét setup", hint: "Đánh giá việc áp dụng setup (Tốt, Tệ, Sai setup...)" },
    ]
  },
  {
    key: "skills", label: "Kỹ năng", children: [
      { key: "entrySkills", label: "Vào lệnh", hint: "Chất lượng thao tác lúc vào lệnh" },
      { key: "inTradeSkills", label: "Trong lệnh", hint: "Chất lượng quản lý khi đang giữ lệnh" },
      { key: "exitSkills", label: "Thoát lệnh", hint: "Cách lệnh được đóng lại" },
    ]
  },
  {
    key: "psychology", label: "Tâm lý", children: [
      { key: "psychologies", label: "Tâm lý", hint: "Trạng thái tâm lý chi phối lệnh" },
    ]
  },
  {
    key: "riskManagement", label: "Quản trị vốn", children: [
      { key: "riskActions", label: "Quản trị vốn", hint: "Hành động quản trị vốn cho lệnh này (Nâng vốn, Giữ vốn, Giảm risk...)" },
    ]
  },
  {
    key: "timeframes", label: "Khung thời gian", children: [
      { key: "timeframes", label: "Khung thời gian", hint: "Timeframe phân tích / vào lệnh" },
    ]
  },
  {
    key: "sessions", label: "Phiên giao dịch", children: [
      { key: "sessions", label: "Phiên giao dịch", hint: "Phiên thị trường lúc vào lệnh" },
    ]
  },
  {
    key: "checklist", label: "Checklist", children: [
      { key: "checklistItems", label: "Checklist", hint: "Các mục cần kiểm tra trước khi chốt đánh giá 1 lệnh — thêm/bớt tự do" },
    ]
  },
  {
    key: "missReasons", label: "Lý do miss / skip lệnh", children: [
      { key: "missReasons", label: "Lý do miss lệnh", hint: "Vì sao bỏ lỡ một setup — dùng khi ghi Setup bị miss" },
      { key: "skipReasons", label: "Lý do Skip lệnh", hint: "Vì sao chủ động bỏ qua một setup — dùng khi ghi Setup bị skip" },
    ]
  },
  {
    key: "lessons", label: "Bài học", children: [
      { key: "lessonCategories", label: "Danh mục bài học", hint: "Phân loại bài học rút ra (Quản trị vốn, Tâm lý, Kỷ luật...) — dùng ở mục Hành trình giao dịch" },
    ]
  },
];

export const DEFAULT_RESOURCES = {
  accounts: [],
  symbols: [
    "AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD", "AUDUSD", "CADCHF", "CADJPY", "CHFJPY",
    "EURAUD", "EURCAD", "EURCHF", "EURGBP", "EURJPY", "EURNZD", "EURUSD",
    "GBPAUD", "GBPCAD", "GBPCHF", "GBPJPY", "GBPNZD", "GBPUSD",
    "NZDCAD", "NZDCHF", "NZDJPY", "NZDUSD", "USDCAD", "USDCHF", "USDJPY",
    "XAUUSD", "XAGUSD", "GC", "CL", "ES", "NQ",
  ],
  setups: ["KHÔNG CÓ SETUP", "RB", "IRB", "ARB", "FB", "DD", "SB", "BB"],
  setupBonus: [],
  setupNotes: ["Tốt", "Tệ", "Đúng setup", "Sai setup"],
  entrySkills: ["Đúng kế hoạch", "Quá sớm", "Quá muộn", "Bốc đồng"],
  inTradeSkills: ["Tuân thủ kế hoạch", "Dời Chốt lời", "Dời dừng lỗ ra xa", "Muốn thoát lệnh"],
  exitSkills: ["Chạm Chốt lời", "Chạm Dừng lỗ", "Thoát chủ động (lý do kỹ thuật)", "Thoát lệnh cảm tính, sợ hãi"],
  psychologies: ["Không lỗi", "SỢ BỎ LỠ (FOMO)", "SỢ HÃI", "HI VỌNG", "THAM LAM", "GIAO DỊCH TRẢ THÙ", "LUÔN MUỐN MÌNH ĐÚNG"],
  riskActions: ["Nâng vốn", "Giữ vốn", "Giảm risk"],
  timeframes: ["M15", "H1", "H3", "H4", "H8", "D", "W"],
  sessions: ["Á (Tokyo)", "Âu (London)", "Mỹ (New York)", "Âu-Mỹ chồng lấn"],
  checklistItems: ["Có Screenshot", "Có Ghi lại nhật ký", "Có Review"],
  missReasons: ["Bất khả kháng", "Lỗi cá nhân", "Không nhận ra setup"],
  skipReasons: ["Không đủ tự tin", "Risk quá cao", "Ngoài giờ theo dõi", "Chưa đủ tín hiệu xác nhận", "Đang có lệnh khác"],
  lessonCategories: ["Quản trị vốn", "Tâm lý", "Kỷ luật vào lệnh", "Kỹ năng trong lệnh", "Kỹ năng thoát lệnh", "Kiến thức / Setup", "Khác"],
  fxRates: { USD: 1, VND: 26000, EUR: 0.92, GBP: 0.79, JPY: 150 },
};

export const STRUCTURE_SCORES = Array.from({ length: 15 }, (_, i) => (i * 0.5).toString());

export const GRADE_OPTIONS = [
  { id: "tot-thang", label: "Giao dịch Tốt - Thắng", matches: "win", tone: "win" },
  { id: "toi-thang", label: "Giao dịch Tồi - Thắng", matches: "win", tone: "loss" },
  { id: "tot-thua", label: "Giao dịch Tốt - Thua", matches: "loss", tone: "win" },
  { id: "toi-thua", label: "Giao dịch Tồi - Thua", matches: "loss", tone: "loss" },
];

export const CURRENCIES = ["USD", "VND", "EUR", "GBP", "JPY"];

export const THEME_PRESETS = {
  dark: { bg: "#0a0b0d", surface: "#131519", surface2: "#191c21", border: "#252930", text: "#eae7e0", textDim: "#8d9198", win: "#4caf7d", loss: "#e0615a" },
  light: { bg: "#f6f4f0", surface: "#ffffff", surface2: "#f1efe8", border: "#e2ddd0", text: "#211d17", textDim: "#726a5c", win: "#22935c", loss: "#c9403a" },
};

export const ACCENT_PRESETS = { gold: "#d4a24e", green: "#2fae66", blue: "#4a90e2", purple: "#9b7fe0", red: "#e0615a" };

export const DEFAULT_UI_SETTINGS = { mode: "dark", accent: "gold" };

export const FLOW_TYPES = [
  { id: "deposit", label: "Nạp tiền" },
  { id: "withdraw", label: "Rút tiền" },
  { id: "transfer", label: "Chuyển vốn nội bộ" },
];

export const NOTE_TYPES = ["Kế hoạch", "Đánh giá tuần", "Đánh giá tháng", "Bài học", "Sai lầm", "Mục tiêu"];

export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const WEEKDAY_LABEL = { 1: "Thứ 2", 2: "Thứ 3", 3: "Thứ 4", 4: "Thứ 5", 5: "Thứ 6", 6: "Thứ 7", 0: "Chủ nhật" };

export const R_BUCKETS = [
  { label: "< -1R", min: -Infinity, max: -1 },
  { label: "-1R → -0.7R", min: -1, max: -0.7 },
  { label: "-0.7R → -0.5R", min: -0.7, max: -0.5 },
  { label: "-0.5R → 0R", min: -0.5, max: 0 },
  { label: "0R → 1R", min: 0, max: 1 },
  { label: "1R → 2R", min: 1, max: 2 },
  { label: "2R → 3R", min: 2, max: 3 },
  { label: "3R → 5R", min: 3, max: 5 },
  { label: "5R → 8R", min: 5, max: 8 },
  { label: "> 8R", min: 8, max: Infinity },
];

export const REVIEW_DIRECTIONS = [
  { id: "dung-huong", label: "Đi đúng hướng dự kiến", tone: "loss" },
  { id: "nguoc-huong", label: "Đi ngược hướng dự kiến", tone: "win" },
  { id: "di-ngang", label: "Đi ngang / không rõ ràng", tone: "" },
];

export const REMINDER_FREQS = [
  { id: "weekly", label: "Hằng tuần" },
  { id: "monthly", label: "Hằng tháng" },
  { id: "once", label: "Một lần (ngày cụ thể)" },
];

export const CAPITAL_FLOW_TYPES = [
  { id: "deposit", label: "Nạp tiền" },
  { id: "withdraw", label: "Rút tiền" },
  { id: "rebalance", label: "Cân tiền (dự phòng ↔ trade)" },
];

export const tooltipStyle = { background: SURF2, border: `1px solid ${GRID}`, borderRadius: 8, fontSize: 12, color: TEXT };

export const tooltipItemStyle = { color: TEXT };

export const tooltipLabelStyle = { color: MUTED, marginBottom: 4, fontWeight: 600 };

export const RESULT_FILTERS = [
  { id: "", label: "Tất cả" },
  { id: "open", label: "Đang mở" },
  { id: "win", label: "Thắng" },
  { id: "loss", label: "Thua" },
  { id: "be", label: "Hòa" },
];

export const RANGE_OPTIONS = [
  { id: "", label: "Toàn bộ thời gian" },
  { id: "7d", label: "7 ngày qua" },
  { id: "30d", label: "30 ngày qua" },
  { id: "90d", label: "90 ngày qua" },
  { id: "month", label: "Tháng này" },
  { id: "quarter", label: "Quý này" },
  { id: "year", label: "Năm nay" },
  { id: "custom", label: "Tùy chọn khoảng ngày" },
];

export const DRILL_DIMS = [
  { key: "symbol", label: "Theo Pair" },
  { key: "setup", label: "Theo Setup" },
  { key: "weekday", label: "Theo Thứ" },
];

export const DIM_CONFIG = {
  symbol: { label: "symbol", backLabel: "Tất cả symbol", allItems: (trades, resources) => Array.from(new Set([...(resources.symbols || []), ...trades.map((t) => t.symbol).filter(Boolean)])).sort() },
  setup: { label: "setup", backLabel: "Tất cả setup", allItems: (trades, resources) => Array.from(new Set([...(resources.setups || []), ...trades.map((t) => t.setup).filter(Boolean)])).sort() },
  weekday: { label: "thứ", backLabel: "Tất cả các thứ", allItems: () => WEEKDAY_ORDER.map((wd) => WEEKDAY_LABEL[wd]) },
  structure: { label: "ĐCT", backLabel: "Tất cả điểm cấu trúc", allItems: () => STRUCTURE_SCORES.map((s) => `ĐCT ${s}`) },
};

export const CATEGORY_COLORS = [ACCENT, WIN, LOSS, "#4a90e2", "#9b7fe0", "#e0a15a", "#5ec8c8", "#c85ea1", "#8b93a0"];
