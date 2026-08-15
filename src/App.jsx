import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { supabase } from "./supabaseClient.js";
import {
  BookOpen, PlusCircle, Database, LayoutDashboard, Star, StickyNote, Settings, Layers,
  Wallet, Hash, Grid3x3, Target, TrendingUp, EyeOff, AlertTriangle, Ruler, PiggyBank,
  SkipForward, GraduationCap, CalendarDays, LineChart as LineChartIcon, Bell, Menu, X, Gauge, ListChecks,
} from "lucide-react";
import "./styles.css";
import { DEFAULT_RESOURCES, DEFAULT_UI_SETTINGS, DEFAULT_PRINCIPLES, THEME_PRESETS, ACCENT_PRESETS } from "./lib/constants.js";
import { safeGet, safeSet, normalizeResources, emptyTrade, emptyReminder, emptySlReminderSettings, accountOpenRisk, setCurrentUserId, uid } from "./lib/helpers.js";
import { ReminderBell, RemindersPage } from "./components/Reminders.jsx";
import { PrinciplesSection } from "./components/Principles.jsx";
import { ResourceManager } from "./components/Resources.jsx";
import { NotesSection } from "./components/Notes.jsx";
import { SettingsSection } from "./components/Settings.jsx";
import { SloganBar } from "./components/ui.jsx";

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
const MissedSetupsSection = lazy(() => import("./components/LessonsAndSetups.jsx").then((m) => ({ default: m.MissedSetupsSection })));
const SkippedSetupsSection = lazy(() => import("./components/LessonsAndSetups.jsx").then((m) => ({ default: m.SkippedSetupsSection })));
const JourneySection = lazy(() => import("./components/LessonsAndSetups.jsx").then((m) => ({ default: m.JourneySection })));
const SetupLibrarySection = lazy(() => import("./components/LessonsAndSetups.jsx").then((m) => ({ default: m.SetupLibrarySection })));

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
  const [reminders, setReminders] = useState([]);
  const [capitalAccounts, setCapitalAccounts] = useState([]);
  const [capitalEntries, setCapitalEntries] = useState([]);
  const [capitalFlows, setCapitalFlows] = useState([]);
  const [uiSettings, setUiSettings] = useState(DEFAULT_UI_SETTINGS);
  const [slReminderSettings, setSlReminderSettings] = useState(emptySlReminderSettings());
  const [view, setView] = useState("dashboard");
  const [activeAccount, setActiveAccount] = useState("");
  const [viewingTrade, setViewingTrade] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saveState, setSaveState] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const [ts, rs, lg, nt, ls, pi, pl, nl, pr, sl, us, ms, ss, rm, ca, ce, cf, sr] = await Promise.all([
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
        safeGet("reminders", []),
        safeGet("capitalAccounts", []),
        safeGet("capitalEntries", []),
        safeGet("capitalFlows", []),
        safeGet("slReminderSettings", emptySlReminderSettings()),
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
      setCapitalAccounts(ca);
      setCapitalEntries(ce);
      setCapitalFlows(cf);
      setSlReminderSettings({ ...emptySlReminderSettings(), ...sr });

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
    })();
  }, []);

  const flashSaved = () => { setSaveState("Đã lưu"); setTimeout(() => setSaveState(""), 1200); };

  const persistTrades = useCallback(async (next) => { setTrades(next); await safeSet("trades", next); flashSaved(); }, []);
  const persistResources = useCallback(async (next) => { setResources(next); await safeSet("resources", next); flashSaved(); }, []);
  const persistLedger = useCallback(async (next) => { setLedger(next); await safeSet("ledger", next); flashSaved(); }, []);
  const persistNotes = useCallback(async (next) => { setNotes(next); await safeSet("notes", next); flashSaved(); }, []);
  const persistLessons = useCallback(async (next) => { setLessons(next); await safeSet("lessons", next); flashSaved(); }, []);
  const persistProcessImprovements = useCallback(async (next) => { setProcessImprovements(next); await safeSet("processImprovements", next); flashSaved(); }, []);
  const persistProblemLogs = useCallback(async (next) => { setProblemLogs(next); await safeSet("problemLogs", next); flashSaved(); }, []);
  const persistNewsLogs = useCallback(async (next) => { setNewsLogs(next); await safeSet("newsLogs", next); flashSaved(); }, []);
  const persistPrinciples = useCallback(async (next) => { setPrinciples(next); await safeSet("principles", next); flashSaved(); }, []);
  const persistSetupLibrary = useCallback(async (next) => { setSetupLibrary(next); await safeSet("setupLibrary", next); flashSaved(); }, []);
  const persistUiSettings = useCallback(async (next) => { setUiSettings(next); await safeSet("uiSettings", next); }, []);
  const persistMissedSetups = useCallback(async (next) => { setMissedSetups(next); await safeSet("missedSetups", next); flashSaved(); }, []);
  const persistSkippedSetups = useCallback(async (next) => { setSkippedSetups(next); await safeSet("skippedSetups", next); flashSaved(); }, []);
  const persistReminders = useCallback(async (next) => { setReminders(next); await safeSet("reminders", next); flashSaved(); }, []);
  const persistCapitalAccounts = useCallback(async (next) => { setCapitalAccounts(next); await safeSet("capitalAccounts", next); flashSaved(); }, []);
  const persistCapitalEntries = useCallback(async (next) => { setCapitalEntries(next); await safeSet("capitalEntries", next); flashSaved(); }, []);
  const persistCapitalFlows = useCallback(async (next) => { setCapitalFlows(next); await safeSet("capitalFlows", next); flashSaved(); }, []);
  const persistSlReminderSettings = useCallback(async (next) => { setSlReminderSettings(next); await safeSet("slReminderSettings", next); flashSaved(); }, []);

  const handleSaveTrade = (t) => {
    const exists = trades.some((x) => x.id === t.id);
    const next = exists ? trades.map((x) => (x.id === t.id ? t : x)) : [...trades, t];
    persistTrades(next);
    setEditing(null);
    setView("journal");
  };
  const handleDelete = (id) => persistTrades(trades.filter((t) => t.id !== id));
  const handleBulkDelete = (ids) => {
    const idSet = new Set(ids);
    persistTrades(trades.filter((t) => !idSet.has(t.id)));
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
    if (data.reminders) persistReminders(data.reminders);
    if (data.capitalAccounts) persistCapitalAccounts(data.capitalAccounts);
    if (data.capitalEntries) persistCapitalEntries(data.capitalEntries);
    if (data.capitalFlows) persistCapitalFlows(data.capitalFlows);
    if (data.slReminderSettings) persistSlReminderSettings({ ...emptySlReminderSettings(), ...data.slReminderSettings });
  };
  const handleResetAll = () => {
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
    persistReminders([]);
    persistCapitalAccounts([]);
    persistCapitalEntries([]);
    persistCapitalFlows([]);
    setView("dashboard");
  };

  const navGroups = [
    {
      label: "Theo dõi", items: [
        { key: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
        { key: "journal", label: "Nhật ký", icon: BookOpen },
        { key: "equityindex", label: "Đường cong vốn", icon: TrendingUp },
        { key: "capitaltracker", label: "Vốn thực tế (thủ công)", icon: PiggyBank },
        { key: "missed", label: "Setup bị miss", icon: EyeOff },
        { key: "skipped", label: "Setup bị skip", icon: SkipForward },
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
  const nav = navGroups.flatMap((g) => g.items);
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
            {navGroups.map((g) => (
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
              view === "journal" ? <JournalSection trades={trades} resources={resources} ledger={ledger} onEdit={startEdit} onDelete={handleDelete} onBulkDelete={handleBulkDelete} onDuplicate={handleDuplicateTrades} /> :
              view === "reminders" ? <RemindersPage reminders={reminders} onChange={persistReminders} resources={resources} slReminderSettings={slReminderSettings} onSlReminderSettingsChange={persistSlReminderSettings} /> :
              view === "equityindex" ? <EquityIndexPage resources={resources} ledger={ledger} trades={trades} /> :
              view === "capitaltracker" ? <CapitalTrackerPage accounts={capitalAccounts} entries={capitalEntries} flows={capitalFlows} onAccountsChange={persistCapitalAccounts} onEntriesChange={persistCapitalEntries} onFlowsChange={persistCapitalFlows} /> :
              view === "missed" ? <MissedSetupsSection items={missedSetups} resources={resources} onChange={persistMissedSetups} /> :
              view === "skipped" ? <SkippedSetupsSection items={skippedSetups} resources={resources} onChange={persistSkippedSetups} /> :
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
                  onAccountsChange={(next) => persistResources({ ...resources, accounts: next })} onLedgerChange={persistLedger}
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
                <ResourceManager resources={resources} onChange={persistResources} />
              ) :
              <SettingsSection trades={trades} resources={resources} ledger={ledger} notes={notes} lessons={lessons} processImprovements={processImprovements} problemLogs={problemLogs} newsLogs={newsLogs} principles={principles} setupLibrary={setupLibrary} missedSetups={missedSetups}
                skippedSetups={skippedSetups} reminders={reminders}
                capitalAccounts={capitalAccounts} capitalEntries={capitalEntries} capitalFlows={capitalFlows}
                uiSettings={uiSettings} onUiSettingsChange={persistUiSettings}
                slReminderSettings={slReminderSettings}
                onImportAll={handleImportAll} onReset={handleResetAll} />
              }
            </Suspense>
            )}
          </div>
        </div>
      </div>
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
