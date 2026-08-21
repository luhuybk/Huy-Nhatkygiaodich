import { useState, useEffect, useCallback, useRef, Suspense, lazy } from "react";
import { supabase } from "./supabaseClient.js";
import {
  BookOpen, PlusCircle, Database, LayoutDashboard, Star, StickyNote, Settings, Layers,
  Wallet, Hash, Grid3x3, Target, TrendingUp, AlertTriangle, Ruler, PiggyBank,
  Shapes, GraduationCap, CalendarDays, LineChart as LineChartIcon, Bell, Menu, X, Gauge, ListChecks,
} from "lucide-react";
import "./styles.css";
import { DEFAULT_RESOURCES, DEFAULT_UI_SETTINGS, DEFAULT_PRINCIPLES, THEME_PRESETS, ACCENT_PRESETS } from "./lib/constants.js";
import {
  safeGet, safeSet, normalizeResources, emptyTrade, emptyReminder, emptySlReminderSettings, accountOpenRisk,
  setCurrentUserId, uid, RESOURCE_TRADE_FIELDS, renameInList, renameChecklistKey, renameInArrayField,
  shouldSnapshot, makeSnapshot, pruneBackups, normalizeSymbolWatch,
} from "./lib/helpers.js";
import { ReminderBell, RemindersPage } from "./components/Reminders.jsx";
import { PrinciplesSection } from "./components/Principles.jsx";
import { ResourceManager } from "./components/Resources.jsx";
import { NotesSection } from "./components/Notes.jsx";
import { SettingsSection } from "./components/Settings.jsx";
import { SloganBar, useStickyTab } from "./components/ui.jsx";
import { countInlineImages, replaceInlineImages, uploadInlineImage } from "./lib/storage.js";

const Dashboard = lazy(() => import("./components/Dashboard.jsx").then((m) => ({ default: m.Dashboard })));
const DimensionPerformance = lazy(() => import("./components/Dashboard.jsx").then((m) => ({ default: m.DimensionPerformance })));
const Analysis = lazy(() => import("./components/Analysis.jsx").then((m) => ({ default: m.Analysis })));
const TradeAnalysisPage = lazy(() => import("./components/Analysis.jsx").then((m) => ({ default: m.TradeAnalysisPage })));
const HeatmapPage = lazy(() => import("./components/Analysis.jsx").then((m) => ({ default: m.HeatmapPage })));
const SystemQualityPage = lazy(() => import("./components/SystemQuality.jsx").then((m) => ({ default: m.SystemQualityPage })));
const AccountsSection = lazy(() => import("./components/Accounts.jsx").then((m) => ({ default: m.AccountsSection })));
const EquityIndexPage = lazy(() => import("./components/CapitalTracker.jsx").then((m) => ({ default: m.EquityIndexPage })));
const CapitalTrackerPage = lazy(() => import("./components/CapitalTracker.jsx").then((m) => ({ default: m.CapitalTrackerPage })));
const JournalSection = lazy(() => import("./components/Journal.jsx").then((m) => ({ default: m.JournalSection })));
const TradeDetailModal = lazy(() => import("./components/Journal.jsx").then((m) => ({ default: m.TradeDetailModal })));
const TradeForm = lazy(() => import("./components/TradeForm.jsx").then((m) => ({ default: m.TradeForm })));
const SetupHubSection = lazy(() => import("./components/LessonsAndSetups.jsx").then((m) => ({ default: m.SetupHubSection })));
const JourneySection = lazy(() => import("./components/LessonsAndSetups.jsx").then((m) => ({ default: m.JourneySection })));
const SetupLibrarySection = lazy(() => import("./components/LessonsAndSetups.jsx").then((m) => ({ default: m.SetupLibrarySection })));

const NAV_GROUPS = [
  {
    label: "Theo dõi", items: [
      { key: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
      { key: "journal", label: "Nhật ký", icon: BookOpen },
      { key: "equityindex", label: "Đường cong vốn", icon: TrendingUp },
      { key: "capitaltracker", label: "Vốn thực tế (thủ công)", icon: PiggyBank },
      { key: "setuphub", label: "Setup tổng hợp", icon: Shapes },
    ]
  },
  {
    label: "Phân tích", items: [
      { key: "analysis", label: "Phân tích", icon: LineChartIcon },
      { key: "tradeanalysis", label: "Phân tích lệnh", icon: Target },
      { key: "symbolperf", label: "Hiệu suất Symbol", icon: Hash },
      { key: "setupperf", label: "Hiệu suất Setup", icon: Star },
      { key: "structureperf", label: "Phân tích ĐCT", icon: Ruler },
      { key: "weekdayperf", label: "Hiệu suất Thứ", icon: CalendarDays },
      { key: "heatmap", label: "Bản đồ nhiệt", icon: Grid3x3 },
      { key: "systemquality", label: "Chất lượng hệ thống", icon: Gauge },
    ]
  },
  {
    label: "Quản lý", items: [
      { key: "reminders", label: "Thông báo", icon: Bell },
      { key: "accounts", label: "Tài khoản", icon: Wallet },
      { key: "setuplib", label: "Setup mẫu", icon: Layers },
      { key: "notes", label: "Ghi chú", icon: StickyNote },
      { key: "lessons", label: "Hành trình giao dịch", icon: GraduationCap },
      { key: "principles", label: "Nguyên tắc", icon: ListChecks },
      { key: "resources", label: "Tài nguyên", icon: Database },
    ]
  },
  { label: "Hệ thống", items: [{ key: "settings", label: "Cài đặt", icon: Settings }] },
];

// Trang không có trong danh sách này (VD "form") sẽ không được khôi phục sau khi tải lại.
const NAV_KEYS = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.key);

function LazyFallback() {
  return <p className="empty-note" style={{ padding: "24px 0" }}>Đang tải...</p>;
}

function AppShell({ onSignOut, userEmail }) {
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState([]);
  const [resources, setResources] = useState(DEFAULT_RESOURCES);
  const [ledger, setLedger] = useState([]);
  const [notes, setNotes] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [processImprovements, setProcessImprovements] = useState([]);
  const [problemLogs, setProblemLogs] = useState([]);
  const [newsLogs, setNewsLogs] = useState([]);
  const [principles, setPrinciples] = useState(DEFAULT_PRINCIPLES);
  const [setupLibrary, setSetupLibrary] = useState([]);
  const [missedSetups, setMissedSetups] = useState([]);
  const [skippedSetups, setSkippedSetups] = useState([]);
  const [setupVariants, setSetupVariants] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [capitalAccounts, setCapitalAccounts] = useState([]);
  const [capitalEntries, setCapitalEntries] = useState([]);
  const [capitalFlows, setCapitalFlows] = useState([]);
  const [uiSettings, setUiSettings] = useState(DEFAULT_UI_SETTINGS);
  const [slReminderSettings, setSlReminderSettings] = useState(emptySlReminderSettings());
  const [symbolWatches, setSymbolWatches] = useState([]);
  const [setupCheckLog, setSetupCheckLog] = useState([]);
  const [slMutedTrades, setSlMutedTrades] = useState([]);
  const [taskDone, setTaskDoneMap] = useState({});
  const [view, setView] = useStickyTab("view", "dashboard", NAV_KEYS);
  const [activeAccount, setActiveAccount] = useState("");
  const [viewingTrade, setViewingTrade] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saveState, setSaveState] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [backups, setBackups] = useState([]);
  const [undo, setUndo] = useState(null);
  const [imageMigration, setImageMigration] = useState(null);
  const undoTimerRef = useRef(null);

  useEffect(() => {
    (async () => {
      const [ts, rs, lg, nt, ls, pi, pl, nl, pr, sl, us, ms, ss, sv, rm, ca, ce, cf, sr, sw, bk, scl, smt, tdn] = await Promise.all([
        safeGet("trades", []),
        safeGet("resources", DEFAULT_RESOURCES),
        safeGet("ledger", []),
        safeGet("notes", []),
        safeGet("lessons", []),
        safeGet("processImprovements", []),
        safeGet("problemLogs", []),
        safeGet("newsLogs", []),
        safeGet("principles", DEFAULT_PRINCIPLES),
        safeGet("setupLibrary", []),
        safeGet("uiSettings", DEFAULT_UI_SETTINGS),
        safeGet("missedSetups", []),
        safeGet("skippedSetups", []),
        safeGet("setupVariants", []),
        safeGet("reminders", []),
        safeGet("capitalAccounts", []),
        safeGet("capitalEntries", []),
        safeGet("capitalFlows", []),
        safeGet("slReminderSettings", emptySlReminderSettings()),
        safeGet("symbolWatches", []),
        safeGet("backups", []),
        safeGet("setupCheckLog", []),
        safeGet("slMutedTrades", []),
        safeGet("timelineDone", {}),
      ]);
      setTrades(ts);
      setResources(normalizeResources(rs));
      setLedger(lg);
      setNotes(nt);
      setLessons(ls);
      setProcessImprovements(pi);
      setProblemLogs(pl);
      setNewsLogs(nl);
      setPrinciples({ ...DEFAULT_PRINCIPLES, ...pr });
      setSetupLibrary(sl);
      setMissedSetups(ms);
      setSkippedSetups(ss);
      setSetupVariants(sv);
      setCapitalAccounts(ca);
      setCapitalEntries(ce);
      setCapitalFlows(cf);
      setSlReminderSettings({ ...emptySlReminderSettings(), ...sr });
      // Bản ghi cũ là 1 symbol/bản ghi; chuyển sang dạng nhóm nhiều symbol ngay lần mở đầu tiên
      // để nút bấm trên Telegram khớp đúng từng symbol.
      const rawWatches = Array.isArray(sw) ? sw : [];
      const normalizedWatches = rawWatches.map(normalizeSymbolWatch);
      setSymbolWatches(normalizedWatches);
      setBackups(Array.isArray(bk) ? bk : []);
      setSetupCheckLog(Array.isArray(scl) ? scl : []);
      setSlMutedTrades(Array.isArray(smt) ? smt : []);
      setTaskDoneMap(tdn && typeof tdn === "object" && !Array.isArray(tdn) ? tdn : {});
      if (rawWatches.some((w) => !Array.isArray(w.symbols))) await safeSet("symbolWatches", normalizedWatches);

      const mergedUi = { ...DEFAULT_UI_SETTINGS, ...us };
      if (!mergedUi.defaultRemindersSeeded) {
        const hasSimilar = (keyword) => rm.some((r) => (r.title || "").toLowerCase().includes(keyword));
        const candidates = [
          { keyword: "quy trình", title: "Cải thiện quy trình giao dịch tuần này" },
          { keyword: "đường cong vốn", title: "Cập nhật đường cong vốn tuần này" },
        ];
        const seededReminders = candidates
          .filter((c) => !hasSimilar(c.keyword))
          .map((c) => ({ ...emptyReminder(), id: uid(), title: c.title, frequency: "weekly", weekday: 0 }));
        const nextReminders = seededReminders.length ? [...rm, ...seededReminders] : rm;
        const nextUi = { ...mergedUi, defaultRemindersSeeded: true };
        setReminders(nextReminders);
        setUiSettings(nextUi);
        if (seededReminders.length) await safeSet("reminders", nextReminders);
        await safeSet("uiSettings", nextUi);
      } else {
        setReminders(rm);
        setUiSettings(mergedUi);
      }
      setLoading(false);

      // Tự chụp một bản sao lưu nếu bản gần nhất đã quá 7 ngày.
      const currentBackups = Array.isArray(bk) ? bk : [];
      if (shouldSnapshot(currentBackups, Date.now())) {
        const snap = makeSnapshot({
          trades: ts, resources: rs, ledger: lg, notes: nt, lessons: ls,
          processImprovements: pi, problemLogs: pl, newsLogs: nl, principles: pr,
          setupLibrary: sl, missedSetups: ms, skippedSetups: ss, setupVariants: sv, reminders: rm,
          capitalAccounts: ca, capitalEntries: ce, capitalFlows: cf,
          slReminderSettings: sr, symbolWatches: sw, setupCheckLog: scl,
        }, Date.now());
        const nextBackups = pruneBackups([snap, ...currentBackups]);
        setBackups(nextBackups);
        await safeSet("backups", nextBackups);
      }
    })();
  }, []);

  // safeSet trả false khi ghi lên Supabase thất bại (mất mạng, hết phiên, RLS...).
  // Phải báo rõ thay vì vẫn hiện "Đã lưu" — nếu không người dùng đóng tab và mất dữ liệu mà không biết.
  const flashSaved = (ok) => {
    if (ok === false) { setSaveState("⚠ Lưu thất bại"); setTimeout(() => setSaveState(""), 6000); return; }
    setSaveState("Đã lưu");
    setTimeout(() => setSaveState(""), 1200);
  };

  const persistTrades = useCallback(async (next) => { setTrades(next); flashSaved(await safeSet("trades", next)); }, []);
  const persistResources = useCallback(async (next) => { setResources(next); flashSaved(await safeSet("resources", next)); }, []);
  const persistLedger = useCallback(async (next) => { setLedger(next); flashSaved(await safeSet("ledger", next)); }, []);
  const persistNotes = useCallback(async (next) => { setNotes(next); flashSaved(await safeSet("notes", next)); }, []);
  const persistLessons = useCallback(async (next) => { setLessons(next); flashSaved(await safeSet("lessons", next)); }, []);
  const persistProcessImprovements = useCallback(async (next) => { setProcessImprovements(next); flashSaved(await safeSet("processImprovements", next)); }, []);
  const persistProblemLogs = useCallback(async (next) => { setProblemLogs(next); flashSaved(await safeSet("problemLogs", next)); }, []);
  const persistNewsLogs = useCallback(async (next) => { setNewsLogs(next); flashSaved(await safeSet("newsLogs", next)); }, []);
  const persistPrinciples = useCallback(async (next) => { setPrinciples(next); flashSaved(await safeSet("principles", next)); }, []);
  const persistSetupLibrary = useCallback(async (next) => { setSetupLibrary(next); flashSaved(await safeSet("setupLibrary", next)); }, []);
  const persistUiSettings = useCallback(async (next) => { setUiSettings(next); await safeSet("uiSettings", next); }, []);
  const persistMissedSetups = useCallback(async (next) => { setMissedSetups(next); flashSaved(await safeSet("missedSetups", next)); }, []);
  const persistSkippedSetups = useCallback(async (next) => { setSkippedSetups(next); flashSaved(await safeSet("skippedSetups", next)); }, []);
  const persistSetupVariants = useCallback(async (next) => { setSetupVariants(next); flashSaved(await safeSet("setupVariants", next)); }, []);
  const persistReminders = useCallback(async (next) => { setReminders(next); flashSaved(await safeSet("reminders", next)); }, []);
  const persistCapitalAccounts = useCallback(async (next) => { setCapitalAccounts(next); flashSaved(await safeSet("capitalAccounts", next)); }, []);
  const persistCapitalEntries = useCallback(async (next) => { setCapitalEntries(next); flashSaved(await safeSet("capitalEntries", next)); }, []);
  const persistCapitalFlows = useCallback(async (next) => { setCapitalFlows(next); flashSaved(await safeSet("capitalFlows", next)); }, []);
  const persistSlReminderSettings = useCallback(async (next) => { setSlReminderSettings(next); flashSaved(await safeSet("slReminderSettings", next)); }, []);
  // symbolWatches bị CẢ HAI phía cùng ghi: web (sửa symbol/giờ) và Edge Function (bấm nút trên Telegram).
  // Ghi đè thẳng sẽ nuốt mất trạng thái hoãn/xong vừa bấm trên điện thoại, nên đọc lại bản trên server
  // rồi chỉ giữ nguyên các trường do server làm chủ.
  const persistSymbolWatches = useCallback(async (next, prev) => {
    const server = await safeGet("symbolWatches", null);
    let merged = next;
    if (Array.isArray(server)) {
      merged = next.map((w) => {
        const remote = server.find((x) => x.id === w.id);
        const before = (prev || []).find((x) => x.id === w.id);
        if (!remote || !before) return w;
        // Trạng thái "đã ngừng theo dõi" nằm ở TỪNG SYMBOL, do nút bấm trên Telegram ghi.
        // Chỉ lấy giá trị server cho những symbol mà lần sửa này người dùng không đụng tới —
        // nếu họ vừa bật lại một symbol trên web thì ý muốn đó phải thắng.
        return {
          ...w,
          symbols: (w.symbols || []).map((sym) => {
            const remoteSym = (remote.symbols || []).find((x) => x.id === sym.id);
            const beforeSym = (before.symbols || []).find((x) => x.id === sym.id);
            if (!remoteSym || !beforeSym) return sym;
            return sym.done === beforeSym.done ? { ...sym, done: !!remoteSym.done } : sym;
          }),
        };
      });
    }
    setSymbolWatches(merged);
    flashSaved(await safeSet("symbolWatches", merged));
  }, []);

  // slMutedTrades cũng bị cả hai phía ghi: webhook Telegram THÊM khi bấm "Kết thúc lệnh",
  // web chỉ BỎ khi bật nhắc lại. Ghi đè thẳng sẽ nuốt mất lệnh vừa tắt trên điện thoại,
  // nên đọc lại bản server rồi chỉ gỡ đúng những id người dùng vừa bỏ.
  const persistSlMutedTrades = useCallback(async (next) => {
    const removed = new Set(
      slMutedTrades.filter((m) => !next.some((n) => n.tradeId === m.tradeId)).map((m) => m.tradeId)
    );
    const server = await safeGet("slMutedTrades", null);
    const merged = Array.isArray(server) ? server.filter((m) => !removed.has(m.tradeId)) : next;
    setSlMutedTrades(merged);
    flashSaved(await safeSet("slMutedTrades", merged));
  }, [slMutedTrades]);
  const persistSetupCheckLog = useCallback(async (next) => { setSetupCheckLog(next); flashSaved(await safeSet("setupCheckLog", next)); }, []);
  // Chỉ web ghi khoá này, Edge Function chỉ đọc — nên ghi đè thẳng là an toàn.
  const persistTaskDone = useCallback(async (next) => { setTaskDoneMap(next); flashSaved(await safeSet("timelineDone", next)); }, []);

  // Giao dịch (và setup miss/skip) tham chiếu tài khoản bằng TÊN, không phải id.
  // Nên khi đổi tên tài khoản phải đổi luôn tên trong mọi bản ghi cũ, nếu không toàn bộ
  // lịch sử của tài khoản đó bị mồ côi: sai số dư, sai P&L, nhắc dời SL không tìm thấy lệnh mở.
  const handleAccountsChange = useCallback(async (nextAccounts) => {
    const renames = new Map();
    nextAccounts.forEach((a) => {
      const old = resources.accounts.find((x) => x.id === a.id);
      if (old && old.name && a.name && old.name !== a.name) renames.set(old.name, a.name);
    });

    await persistResources({ ...resources, accounts: nextAccounts });
    if (!renames.size) return;

    const rename = (name) => (renames.has(name) ? renames.get(name) : name);
    const touchedTrades = trades.filter((t) => renames.has(t.account));
    if (touchedTrades.length) await persistTrades(trades.map((t) => (renames.has(t.account) ? { ...t, account: rename(t.account) } : t)));
    if (missedSetups.some((m) => renames.has(m.account))) await persistMissedSetups(missedSetups.map((m) => (renames.has(m.account) ? { ...m, account: rename(m.account) } : m)));
    if (skippedSetups.some((s) => renames.has(s.account))) await persistSkippedSetups(skippedSetups.map((s) => (renames.has(s.account) ? { ...s, account: rename(s.account) } : s)));

    // Lịch nhắc lưu kèm accountName để hiển thị/dự phòng — đồng bộ luôn cho khớp.
    const syncSchedules = (list) => (list || []).map((sc) => (renames.has(sc.accountName) ? { ...sc, accountName: rename(sc.accountName) } : sc));
    const needsSchedSync = [...(slReminderSettings.schedules || []), ...(slReminderSettings.setupCheckSchedules || [])].some((sc) => renames.has(sc.accountName));
    if (needsSchedSync) {
      await persistSlReminderSettings({
        ...slReminderSettings,
        schedules: syncSchedules(slReminderSettings.schedules),
        setupCheckSchedules: syncSchedules(slReminderSettings.setupCheckSchedules),
      });
    }
  }, [resources, trades, missedSetups, skippedSetups, slReminderSettings, persistResources, persistTrades, persistMissedSetups, persistSkippedSetups, persistSlReminderSettings]);

  // Tài nguyên (Setup, Tâm lý, Checklist...) cũng được lệnh tham chiếu bằng TÊN.
  // Đổi tên một mục thì phải đổi theo trong mọi lệnh / setup miss / skip / bài học đã ghi.
  const handleResourcesChange = useCallback(async (nextResources, rename) => {
    await persistResources(nextResources);
    if (!rename || !rename.resourceKey || rename.renamedFrom === rename.renamedTo) return;

    const map = RESOURCE_TRADE_FIELDS[rename.resourceKey];
    if (!map) return;
    const { renamedFrom: from, renamedTo: to } = rename;

    if (map.checklistKey) {
      const r = renameChecklistKey(trades, from, to);
      if (r.changed) await persistTrades(r.items);
    }
    if (map.trade) {
      const r = renameInList(trades, map.trade, from, to);
      if (r.changed) await persistTrades(r.items);
    }
    if (map.missed) {
      const r = renameInList(missedSetups, map.missed, from, to);
      if (r.changed) await persistMissedSetups(r.items);
    }
    if (map.skipped) {
      const r = renameInList(skippedSetups, map.skipped, from, to);
      if (r.changed) await persistSkippedSetups(r.items);
    }
    if (map.variant) {
      const r = renameInList(setupVariants, map.variant, from, to);
      if (r.changed) await persistSetupVariants(r.items);
    }
    if (map.lessonArray) {
      const r = renameInArrayField(lessons, map.lessonArray, from, to);
      if (r.changed) await persistLessons(r.items);
    }
  }, [trades, missedSetups, skippedSetups, setupVariants, lessons, persistResources, persistTrades, persistMissedSetups, persistSkippedSetups, persistSetupVariants, persistLessons]);

  // Chuyển toàn bộ lệnh của một tài khoản sang tài khoản khác (hoặc bỏ trống) trước khi xóa tài khoản đó.
  const handleMoveTrades = useCallback(async (fromName, toName) => {
    const r = renameInList(trades, ["account"], fromName, toName);
    if (r.changed) await persistTrades(r.items);
  }, [trades, persistTrades]);

  const handleSaveTrade = (t) => {
    const exists = trades.some((x) => x.id === t.id);
    const next = exists ? trades.map((x) => (x.id === t.id ? t : x)) : [...trades, t];
    persistTrades(next);
    setEditing(null);
    setView("journal");
  };
  // Xóa lệnh là hành động không hoàn tác được và dữ liệu này không thể dựng lại từ đâu khác,
  // nên giữ bản vừa xóa 10 giây kèm nút "Hoàn tác".
  const offerUndo = (removed, label) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndo({ trades: removed, label });
    undoTimerRef.current = setTimeout(() => setUndo(null), 10000);
  };
  const runUndo = () => {
    if (!undo) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const existing = new Set(trades.map((t) => t.id));
    persistTrades([...trades, ...undo.trades.filter((t) => !existing.has(t.id))]);
    setUndo(null);
  };

  const handleDelete = (id) => {
    const removed = trades.filter((t) => t.id === id);
    persistTrades(trades.filter((t) => t.id !== id));
    if (removed.length) offerUndo(removed, `Đã xóa lệnh ${removed[0].symbol || ""}`.trim());
  };
  const handleBulkDelete = (ids) => {
    const idSet = new Set(ids);
    const removed = trades.filter((t) => idSet.has(t.id));
    persistTrades(trades.filter((t) => !idSet.has(t.id)));
    if (removed.length) offerUndo(removed, `Đã xóa ${removed.length} lệnh`);
  };
  const handleDuplicateTrades = (ids) => {
    const idSet = new Set(ids);
    const copies = trades.filter((t) => idSet.has(t.id)).map((t) => ({ ...t, id: uid(), createdAt: Date.now() }));
    if (copies.length) persistTrades([...trades, ...copies]);
  };
  const startNew = () => {
    const t = emptyTrade();
    if (activeAccount) t.account = activeAccount;
    setEditing(t);
    setView("form");
  };
  const openEditForm = (t) => { setEditing(t); setView("form"); };
  const startEdit = (t) => { setViewingTrade(t); };

  const handleImportAll = (data) => {
    if (data.trades) persistTrades(data.trades);
    if (data.resources) persistResources(normalizeResources(data.resources));
    if (data.ledger) persistLedger(data.ledger);
    if (data.notes) persistNotes(data.notes);
    if (data.lessons) persistLessons(data.lessons);
    if (data.processImprovements) persistProcessImprovements(data.processImprovements);
    if (data.problemLogs) persistProblemLogs(data.problemLogs);
    if (data.newsLogs) persistNewsLogs(data.newsLogs);
    if (data.principles) persistPrinciples({ ...DEFAULT_PRINCIPLES, ...data.principles });
    if (data.setupLibrary) persistSetupLibrary(data.setupLibrary);
    if (data.uiSettings) persistUiSettings({ ...DEFAULT_UI_SETTINGS, ...data.uiSettings });
    if (data.missedSetups) persistMissedSetups(data.missedSetups);
    if (data.skippedSetups) persistSkippedSetups(data.skippedSetups);
    if (data.setupVariants) persistSetupVariants(data.setupVariants);
    if (data.reminders) persistReminders(data.reminders);
    if (data.capitalAccounts) persistCapitalAccounts(data.capitalAccounts);
    if (data.capitalEntries) persistCapitalEntries(data.capitalEntries);
    if (data.capitalFlows) persistCapitalFlows(data.capitalFlows);
    if (data.slReminderSettings) persistSlReminderSettings({ ...emptySlReminderSettings(), ...data.slReminderSettings });
    if (data.symbolWatches) persistSymbolWatches(data.symbolWatches, symbolWatches);
    if (data.setupCheckLog) persistSetupCheckLog(data.setupCheckLog);
  };
  // Ảnh cũ vẫn nằm dạng base64 trong dữ liệu. Đẩy hết lên Storage rồi thay bằng đường dẫn,
  // nếu không thì phần phình cũ còn nguyên, chỉ là không phình thêm.
  const imageSources = [
    ["trades", trades, persistTrades],
    ["lessons", lessons, persistLessons],
    ["setupLibrary", setupLibrary, persistSetupLibrary],
    ["problemLogs", problemLogs, persistProblemLogs],
    ["newsLogs", newsLogs, persistNewsLogs],
    ["missedSetups", missedSetups, persistMissedSetups],
    ["skippedSetups", skippedSetups, persistSkippedSetups],
    ["setupVariants", setupVariants, persistSetupVariants],
  ];
  const inlineImageCount = imageSources.reduce((n, [, list]) => n + countInlineImages(list), 0);

  const handleMigrateImages = async () => {
    setImageMigration({ running: true, done: 0, failed: 0, message: "Đang chuyển ảnh..." });
    let done = 0;
    let failed = 0;
    let lastError = "";
    const upload = async (dataUrl) => {
      const res = await uploadInlineImage(dataUrl);
      if (res.url) { done += 1; return res.url; }
      failed += 1;
      lastError = res.error || "";
      return dataUrl; // giữ ảnh cũ, thà phình còn hơn mất
    };
    for (const [, list, persist] of imageSources) {
      if (!countInlineImages(list)) continue;
      const next = await replaceInlineImages(list, upload);
      await persist(next);
    }
    setImageMigration({
      running: false, done, failed,
      message: failed
        ? `Đã chuyển ${done} ảnh, ${failed} ảnh lỗi. ${lastError}`
        : done ? `Đã chuyển ${done} ảnh lên kho ảnh.` : "Không có ảnh nào cần chuyển.",
    });
  };

  const handleRestoreBackup = (id) => {
    const snap = backups.find((b) => b.id === id);
    if (snap && snap.data) handleImportAll(snap.data);
  };
  const handleBackupNow = async () => {
    const snap = makeSnapshot({
      trades, resources, ledger, notes, lessons, processImprovements, problemLogs, newsLogs,
      principles, setupLibrary, missedSetups, skippedSetups, setupVariants, reminders,
      capitalAccounts, capitalEntries, capitalFlows, slReminderSettings, symbolWatches, setupCheckLog,
    }, Date.now());
    const next = pruneBackups([snap, ...backups]);
    setBackups(next);
    flashSaved(await safeSet("backups", next));
  };

  const handleResetAll = async () => {
    await handleBackupNow(); // chụp lại trước khi xóa để còn đường lùi
    persistTrades([]);
    persistResources(DEFAULT_RESOURCES);
    persistLedger([]);
    persistNotes([]);
    persistProcessImprovements([]);
    persistProblemLogs([]);
    persistNewsLogs([]);
    persistPrinciples(DEFAULT_PRINCIPLES);
    persistSetupLibrary([]);
    persistMissedSetups([]);
    persistSkippedSetups([]);
    persistSetupVariants([]);
    persistSetupCheckLog([]);
    persistSlMutedTrades([]);
    persistReminders([]);
    persistCapitalAccounts([]);
    persistCapitalEntries([]);
    persistCapitalFlows([]);
    setView("dashboard");
  };

  const goTo = (key) => { setView(key); setMobileNavOpen(false); };

  const openRiskBadges = resources.accounts
    .map((a) => ({ account: a, risk: accountOpenRisk(a, ledger, trades) }))
    .filter((x) => x.risk.count > 0);

  const palette = THEME_PRESETS[uiSettings.mode] || THEME_PRESETS.dark;
  const accentHex = ACCENT_PRESETS[uiSettings.accent] || ACCENT_PRESETS.gold;
  const cssVars = {
    "--bg": palette.bg, "--surface": palette.surface, "--surface-2": palette.surface2, "--border": palette.border,
    "--text": palette.text, "--text-dim": palette.textDim, "--win": palette.win, "--loss": palette.loss,
    "--accent": accentHex, "--accent-2": accentHex,
  };

  return (
    <div className="app" style={cssVars}>
      <SloganBar slogan={uiSettings.journeySlogan} onChange={(next) => persistUiSettings({ ...uiSettings, journeySlogan: next })} onNavigate={() => goTo("principles")} />
      <div className="app-shell">
        {mobileNavOpen ? <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} /> : null}
        <div className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <span className="candle candle-down" />
              <span className="candle candle-up candle-tall" />
              <span className="candle candle-down candle-short" />
            </span>
            <span className="brand-text">
              <span className="brand-name">Nhật Ký Giao Dịch</span>
              <span className="brand-tag">Kỷ Luật · Dữ Liệu · Cải Thiện</span>
            </span>
            <button type="button" className="sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="Đóng menu"><X size={18} /></button>
          </div>
          <div className="account-quickswitch">
            <select className="input" value={activeAccount} onChange={(e) => setActiveAccount(e.target.value)}>
              <option value="">Tất cả tài khoản</option>
              {resources.accounts.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
            <button type="button" className="quickadd-btn" title="Thêm tài khoản" onClick={() => goTo("accounts")}><PlusCircle size={16} /></button>
          </div>
          <div className="nav">
            {NAV_GROUPS.map((g) => (
              <div className="nav-group" key={g.label}>
                <span className="nav-group-label">{g.label}</span>
                {g.items.map((n) => {
                  const Icon = n.icon;
                  return (
                    <button key={n.key} className={`nav-btn ${view === n.key ? "nav-active" : ""}`} onClick={() => goTo(n.key)}>
                      <Icon size={15} /> {n.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="main">
          <div className="topbar">
            <button type="button" className="mobile-nav-toggle" onClick={() => setMobileNavOpen(true)} aria-label="Mở menu">
              <Menu size={18} />
            </button>
            <span className="mobile-brand-name">Nhật Ký Giao Dịch</span>
            <div className="open-risk-row">
              {openRiskBadges.length === 0 ? (
                <span className="field-hint">Không có lệnh đang mở</span>
              ) : openRiskBadges.map(({ account, risk }) => (
                <span key={account.id} className={`open-risk-badge ${risk.pct >= 5 ? "open-risk-high" : ""}`}>
                  <AlertTriangle size={12} /> {account.name}: {risk.pct.toFixed(2)}% ({risk.count} lệnh)
                </span>
              ))}
            </div>
            <span className="save-indicator mono" style={{ opacity: saveState ? 1 : 0 }}>{saveState}</span>
            <ReminderBell reminders={reminders} onOpen={() => goTo("reminders")} />
            <span className="field-hint user-email">{userEmail}</span>
            <button type="button" className="btn btn-ghost" onClick={onSignOut}>Đăng xuất</button>
            <button type="button" className="btn btn-primary" onClick={startNew}><PlusCircle size={15} /> Thêm giao dịch</button>
          </div>
          <div className="body">
            {loading ? <p className="empty-note">Đang tải dữ liệu...</p> : (
            <Suspense fallback={<LazyFallback />}>
              {view === "dashboard" ? <Dashboard trades={trades} resources={resources} ledger={ledger} account={activeAccount} onAccountChange={setActiveAccount} onViewTrade={startEdit} /> :
              view === "journal" ? <JournalSection trades={trades} resources={resources} ledger={ledger} onEdit={startEdit} onDelete={handleDelete} onBulkDelete={handleBulkDelete} onDuplicate={handleDuplicateTrades} uiSettings={uiSettings} onUiSettingsChange={persistUiSettings} /> :
              view === "reminders" ? <RemindersPage reminders={reminders} onChange={persistReminders} resources={resources} slReminderSettings={slReminderSettings} onSlReminderSettingsChange={persistSlReminderSettings} symbolWatches={symbolWatches} onSymbolWatchesChange={(next) => persistSymbolWatches(next, symbolWatches)}
                  taskDone={taskDone} onTaskDoneChange={persistTaskDone} onSetupCheckLogChange={persistSetupCheckLog}
                  trades={trades} setupCheckLog={setupCheckLog} slMutedTrades={slMutedTrades} onSlMutedTradesChange={persistSlMutedTrades} /> :
              view === "equityindex" ? <EquityIndexPage resources={resources} ledger={ledger} trades={trades} /> :
              view === "capitaltracker" ? <CapitalTrackerPage accounts={capitalAccounts} entries={capitalEntries} flows={capitalFlows} onAccountsChange={persistCapitalAccounts} onEntriesChange={persistCapitalEntries} onFlowsChange={persistCapitalFlows} /> :
              view === "setuphub" ? (
                <SetupHubSection missedSetups={missedSetups} skippedSetups={skippedSetups} setupVariants={setupVariants} resources={resources}
                  onChangeMissed={persistMissedSetups} onChangeSkipped={persistSkippedSetups} onChangeVariants={persistSetupVariants} />
              ) :
              view === "form" ? (
                <TradeForm initial={editing} resources={resources} trades={trades} ledger={ledger} onSave={handleSaveTrade} onCancel={() => { setEditing(null); setView("journal"); }} />
              ) :
              view === "analysis" ? <Analysis trades={trades} resources={resources} onViewTrade={startEdit} /> :
              view === "tradeanalysis" ? <TradeAnalysisPage trades={trades} resources={resources} /> :
              view === "symbolperf" ? <DimensionPerformance trades={trades} resources={resources} dimension="symbol" onViewTrade={startEdit} /> :
              view === "setupperf" ? <DimensionPerformance trades={trades} resources={resources} dimension="setup" onViewTrade={startEdit} /> :
              view === "structureperf" ? <DimensionPerformance trades={trades} resources={resources} dimension="structure" onViewTrade={startEdit} /> :
              view === "weekdayperf" ? <DimensionPerformance trades={trades} resources={resources} dimension="weekday" onViewTrade={startEdit} /> :
              view === "heatmap" ? <HeatmapPage trades={trades} resources={resources} /> :
              view === "systemquality" ? <SystemQualityPage trades={trades} resources={resources} /> :
              view === "accounts" ? (
                <AccountsSection accounts={resources.accounts} ledger={ledger} trades={trades}
                  onAccountsChange={handleAccountsChange} onMoveTrades={handleMoveTrades} onLedgerChange={persistLedger}
                  fxRates={resources.fxRates} onFxRatesChange={(next) => persistResources({ ...resources, fxRates: next })} />
              ) :
              view === "setuplib" ? <SetupLibrarySection items={setupLibrary} onChange={persistSetupLibrary} /> :
              view === "notes" ? <NotesSection notes={notes} onChange={persistNotes} /> :
              view === "lessons" ? (
                <JourneySection lessons={lessons} resources={resources} trades={trades} onChangeLessons={persistLessons}
                  processImprovements={processImprovements} onChangeProcessImprovements={persistProcessImprovements}
                  problemLogs={problemLogs} onChangeProblemLogs={persistProblemLogs}
                  newsLogs={newsLogs} onChangeNewsLogs={persistNewsLogs}
                  avoidPrinciples={principles.avoid || []} />
              ) :
              view === "principles" ? <PrinciplesSection principles={principles} onChange={persistPrinciples} /> :
              view === "resources" ? (
                <ResourceManager resources={resources} onChange={handleResourcesChange} />
              ) :
              <SettingsSection trades={trades} resources={resources} ledger={ledger} notes={notes} lessons={lessons} processImprovements={processImprovements} problemLogs={problemLogs} newsLogs={newsLogs} principles={principles} setupLibrary={setupLibrary} missedSetups={missedSetups}
                skippedSetups={skippedSetups} setupVariants={setupVariants} reminders={reminders}
                capitalAccounts={capitalAccounts} capitalEntries={capitalEntries} capitalFlows={capitalFlows}
                uiSettings={uiSettings} onUiSettingsChange={persistUiSettings}
                slReminderSettings={slReminderSettings} symbolWatches={symbolWatches} setupCheckLog={setupCheckLog}
                backups={backups} onRestoreBackup={handleRestoreBackup} onBackupNow={handleBackupNow}
                inlineImageCount={inlineImageCount} imageMigration={imageMigration} onMigrateImages={handleMigrateImages}
                onImportAll={handleImportAll} onReset={handleResetAll} />
              }
            </Suspense>
            )}
          </div>
        </div>
      </div>
      {undo ? (
        <div className="undo-toast">
          <span>{undo.label}</span>
          <button type="button" className="undo-btn" onClick={runUndo}>Hoàn tác</button>
          <button type="button" className="row-btn" onClick={() => setUndo(null)} aria-label="Đóng"><X size={14} /></button>
        </div>
      ) : null}
      {viewingTrade ? (
        <Suspense fallback={null}>
          <TradeDetailModal
            trade={viewingTrade}
            onClose={() => setViewingTrade(null)}
            onEdit={(t) => { setViewingTrade(null); openEditForm(t); }}
            onDelete={handleDelete}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) { setError("Nhập đủ email và mật khẩu."); return; }
    setLoading(true); setError(""); setNotice("");
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) setError(err.message);
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) setError(err.message);
        else if (!data.session) setNotice("Đã gửi email xác nhận — kiểm tra hộp thư rồi quay lại đăng nhập.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0a0b0d", fontFamily: "'IBM Plex Sans',sans-serif", color: "#eae7e0", padding: 20,
    }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#131519", border: "1px solid #252930", borderRadius: 14, padding: 28 }}>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", margin: "0 0 4px", fontSize: 20 }}>Nhật Ký Giao Dịch</h2>
        <p style={{ fontSize: 12.5, color: "#8d9198", margin: "0 0 22px" }}>
          {mode === "signin" ? "Đăng nhập để đồng bộ dữ liệu qua mọi thiết bị." : "Tạo tài khoản mới."}
        </p>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, fontSize: 12.5 }}>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ background: "#191c21", border: "1px solid #252930", borderRadius: 8, padding: "9px 11px", color: "#eae7e0", fontSize: 13.5 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, fontSize: 12.5 }}>
          Mật khẩu
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            style={{ background: "#191c21", border: "1px solid #252930", borderRadius: 8, padding: "9px 11px", color: "#eae7e0", fontSize: 13.5 }} />
        </label>
        {error ? <p style={{ color: "#e0615a", fontSize: 12, margin: "0 0 12px" }}>{error}</p> : null}
        {notice ? <p style={{ color: "#4caf7d", fontSize: 12, margin: "0 0 12px" }}>{notice}</p> : null}
        <button type="button" onClick={submit} disabled={loading} style={{
          width: "100%", background: "#d4a24e", border: "none", borderRadius: 8, padding: "10px 0",
          color: "#1a1206", fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginBottom: 12,
        }}>
          {loading ? "Đang xử lý..." : mode === "signin" ? "Đăng nhập" : "Đăng ký"}
        </button>
        <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setNotice(""); }}
          style={{ width: "100%", background: "none", border: "none", color: "#8d9198", fontSize: 12.5, cursor: "pointer" }}>
          {mode === "signin" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCurrentUserId(data.session?.user?.id || null);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCurrentUserId(nextSession?.user?.id || null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0b0d", color: "#8d9198", fontFamily: "'IBM Plex Sans',sans-serif" }}>
        Đang tải...
      </div>
    );
  }
  if (!session) return <AuthScreen />;

  return <AppShell userEmail={session.user.email} onSignOut={() => supabase.auth.signOut()} />;
}
