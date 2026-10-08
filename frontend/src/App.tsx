import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  ApiError,
  clearAllScans,
  deleteRulebook,
  deleteScan,
  getEffectiveRulebook,
  getRulebookSchema,
  downloadScanReport,
  getHealth,
  validateRulebook,
  getScan,
  listRulebooks,
  listScans,
  resetRulebooks,
  saveRulebook,
  scanPasted,
  scanUpload,
  type Finding,
  type ComplianceRule,
  type Rulebook,
  type RulebookJsonSchema,
  type ScanRecord,
  type ScanSummary,
  type Severity,
} from "./api";
import { cliCommand, curlCommand, workflowYaml } from "./ci";
import { SAMPLE_PRESETS, type SamplePreset } from "./samples";
import {
  ShieldCheck,
  ShieldAlert,
  FileText,
  BookOpen,
  History,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  Trash2,
  RotateCcw,
  Download,
  Copy,
  ChevronRight,
  ChevronLeft,
  Code2,
  Search,
  FileCode,
  Terminal,
  Layers,
  GitBranch,
  Check,
} from "lucide-react";

type Tab = "auditor" | "rulebook" | "history" | "cicd";
type StudioView = "editor" | "visual" | "schema";

export default function App() {
  const [tab, setTab] = useState<Tab>("auditor");
  const [rulebooks, setRulebooks] = useState<Rulebook[]>([]);
  const [selectedRulebookId, setSelectedRulebookId] = useState<string>("");
  const [activePresetId, setActivePresetId] = useState<string>("framework-docs");

  // Document Content & Source
  const [content, setContent] = useState<string>(SAMPLE_PRESETS[0].content);
  const [sourceName, setSourceName] = useState<string>(SAMPLE_PRESETS[0].filename);

  // Scan Results
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [history, setHistory] = useState<ScanSummary[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [operationLabel, setOperationLabel] = useState("Loading catalog…");
  const [apiStatus, setApiStatus] = useState("checking");
  const [databaseStatus, setDatabaseStatus] = useState("checking");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const taskRunning = useRef(false);
  const draftMode = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Interactive View Controls
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showOnlyViolations, setShowOnlyViolations] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState<boolean>(false);

  // Rulebook Studio & Inheritance State
  const [studioView, setStudioView] = useState<StudioView>("editor");
  const [ruleJson, setRuleJson] = useState<string>("");
  const [schemaDoc, setSchemaDoc] = useState<RulebookJsonSchema | null>(null);
  const [showEffectiveRules, setShowEffectiveRules] = useState<boolean>(false);
  const [effectiveRules, setEffectiveRules] = useState<ComplianceRule[]>([]);
  const [schemaValidationResult, setSchemaValidationResult] = useState<{
    valid: boolean;
    errors: string[];
  } | null>(null);

  // CI/CD Generator State
  const [ciRulebookId, setCiRulebookId] = useState("");
  const [ciServer, setCiServer] = useState("http://localhost:8080");
  const [ciTargetFile, setCiTargetFile] = useState<string>("samples/openapi-spec.yaml");
  const [ciFormat, setCiFormat] = useState<"sarif" | "json" | "markdown" | "terminal">("sarif");
  const [ciFailOn, setCiFailOn] = useState<"error" | "warning">("error");
  const [copiedCiSnippet, setCopiedCiSnippet] = useState<string | null>(null);

  const ciRulebook = rulebooks.find(book => book.id === ciRulebookId);
  const generatedCli = cliCommand(ciTargetFile, ciRulebookId, ciFormat, ciFailOn);
  const generatedCurl = curlCommand(ciTargetFile, ciRulebookId, ciServer);
  const generatedWorkflow = workflowYaml(ciTargetFile, ciRulebook?.name || "", ciFailOn);
  useEffect(() => {
    const hint = ciTargetFile.includes("openapi") ? "OpenAPI" : ciTargetFile.includes("framework") ? "Framework" : "Platform log";
    setCiRulebookId(rulebooks.find(book => book.name.includes(hint))?.id || "");
  }, [ciTargetFile, rulebooks]);

  // Refs for auto-scrolling
  const codeViewerRef = useRef<HTMLDivElement>(null);
  const findingsListRef = useRef<HTMLDivElement>(null);
  const notificationTimer = useRef<ReturnType<typeof setTimeout>>();
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();

  const selectedRulebook = useMemo(() => {
    return rulebooks.find((book) => book.id === selectedRulebookId);
  }, [rulebooks, selectedRulebookId]);

  const studioRulebook = useMemo(() => {
    try {
      const value: unknown = JSON.parse(ruleJson);
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const parsed = value as Record<string, unknown>;
      const rules = Array.isArray(parsed.rules) ? parsed.rules.filter(rule =>
        rule && typeof rule === "object" && typeof rule.id === "string" && typeof rule.title === "string" &&
        typeof rule.message === "string" && ["ERROR", "WARNING", "INFO"].includes(rule.severity) &&
        typeof rule.type === "string" && ["suggestion", "category", "pattern", "triggerPattern", "requiredPattern", "minVersion", "inheritedFrom"].every(key => rule[key] == null || typeof rule[key] === "string") && (!rule.tokens || (Array.isArray(rule.tokens) && rule.tokens.every((token: unknown) => typeof token === "string")))
      ) as ComplianceRule[] : [];
      return {
        name: typeof parsed.name === "string" ? parsed.name : "Untitled draft",
        description: typeof parsed.description === "string" ? parsed.description : "",
        version: typeof parsed.version === "string" ? parsed.version : "",
        extendsRulebookId: typeof parsed.extendsRulebookId === "string" ? parsed.extendsRulebookId : "",
        extendsRulebookName: typeof parsed.extendsRulebookName === "string" ? parsed.extendsRulebookName : "",
        rules,
      };
    } catch { return null; }
  }, [ruleJson]);

  function refreshConnection() {
    if (ruleJson && ruleJson !== JSON.stringify(selectedRulebook, null, 2) &&
        !confirm("Refresh the catalog and discard unsaved rulebook edits?")) return;
    void runTask("Refreshing connection…", refreshCatalog);
  }

  function notify(message: string) {
    clearTimeout(notificationTimer.current);
    setSuccessBanner(message);
    notificationTimer.current = setTimeout(() => setSuccessBanner(null), 4000);
  }

  async function runTask(label: string, task: () => Promise<void>) {
    if (taskRunning.current) return;
    taskRunning.current = true;
    setBusy(true);
    setOperationLabel(label);
    setError(null);
    setSuccessBanner(null);
    try { await task(); }
    catch (err) {
      setError(err instanceof Error ? err.message : "The request failed. Please retry.");
      if (err instanceof ApiError && (err.status === 0 || err.status >= 500)) {
        setDatabaseStatus("unavailable");
        if (err.status !== 500) setApiStatus("unavailable");
      }
    }
    finally { taskRunning.current = false; setBusy(false); }
  }

  async function copyText(text: string, message: string, snippet?: string) {
    try {
      await navigator.clipboard.writeText(text);
      setError(null);
      notify(message);
      if (snippet) {
        clearTimeout(copyTimer.current);
        setCopiedCiSnippet(snippet);
        copyTimer.current = setTimeout(() => setCopiedCiSnippet(null), 2500);
      }
    } catch { setError("Clipboard access failed. Select and copy the text manually."); }
  }

  // Each service loads independently; a history or schema failure does not hide rulebooks.
  async function refreshCatalog() {
    const results = await Promise.allSettled([getHealth(), listRulebooks(), listScans(), getRulebookSchema()]);
    const [healthResult, booksResult, scansResult, schemaResult] = results;
    setApiStatus(healthResult.status === "fulfilled" && healthResult.value.status === "ok" ? "connected" : "unavailable");
    setDatabaseStatus(booksResult.status === "fulfilled" && scansResult.status === "fulfilled" ? "connected" : "unavailable");
    if (booksResult.status === "fulfilled") {
      const books = booksResult.value;
      setRulebooks(books);
      setSelectedRulebookId(current => {
        if (draftMode.current || books.some(book => book.id === current)) return current;
        const preset = SAMPLE_PRESETS.find(item => item.id === activePresetId);
        return (preset ? books.find(book => book.name.toLowerCase().includes(preset.rulebookHint.toLowerCase())) : books[0])?.id || "";
      });
    }
    if (scansResult.status === "fulfilled") { setHistory(scansResult.value); setHistoryLoaded(true); }
    if (schemaResult.status === "fulfilled") setSchemaDoc(schemaResult.value);
    const failures = results.flatMap((result, index) => result.status === "rejected"
      ? [`${["API health", "Rulebooks", "Scan history", "Rulebook schema"][index]}: ${result.reason instanceof Error ? result.reason.message : "Unavailable"}`] : []);
    if (failures.length) setError(failures.join(" · "));
  }

  useEffect(() => {
    void runTask("Loading catalog…", refreshCatalog);
    return () => { clearTimeout(notificationTimer.current); clearTimeout(copyTimer.current); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSchemaValidationResult(null);
    setShowEffectiveRules(false);
    setEffectiveRules([]);
    if (selectedRulebook) {
      setRuleJson(JSON.stringify(selectedRulebook, null, 2));
      if (selectedRulebook.id) {
        getEffectiveRulebook(selectedRulebook.id)
          .then(eff => { if (!cancelled) setEffectiveRules(eff.rules || []); })
          .catch(err => { if (!cancelled) setError(`Could not load inherited rules: ${err instanceof Error ? err.message : "Request failed"}`); });
      }
    }
    return () => { cancelled = true; };
  }, [selectedRulebook]);

  function selectRulebook(id: string) {
    if (id === selectedRulebookId) return;
    if (ruleJson && ruleJson !== JSON.stringify(selectedRulebook, null, 2) &&
        !confirm("Discard your unsaved rulebook changes and switch rulebooks?")) return;
    draftMode.current = false;
    setSelectedRulebookId(id);
  }

  function newRulebook() {
    if (ruleJson && ruleJson !== JSON.stringify(selectedRulebook, null, 2) &&
        !confirm("Discard your unsaved rulebook changes and create a new rulebook?")) return;
    draftMode.current = true;
    setSelectedRulebookId("");
    setRuleJson(JSON.stringify({
      name: "Custom compliance rulebook", description: "Document policy checks", version: "1.0.0",
      rules: [{ id: "require-framework", title: "Framework metadata", message: "Include a Framework metadata header.",
        suggestion: "Add Framework: React 18+ to your document.", category: "Metadata", severity: "ERROR",
        type: "DOCUMENT_REQUIRED", enabled: true, pattern: "(?i)framework:" }],
    }, null, 2));
    setStudioView("editor");
  }

  function readStudioRulebook(): Rulebook {
    const parsed: unknown = JSON.parse(ruleJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Rulebook JSON must be an object.");
    return parsed as Rulebook;
  }

  function resetResultFilters() {
    setSeverityFilter("ALL"); setCategoryFilter("ALL"); setSearchQuery(""); setShowOnlyViolations(false);
  }

  // Auto-scroll when active line changes
  useEffect(() => {
    if (activeLine !== null && codeViewerRef.current) {
      const lineEl = codeViewerRef.current.querySelector(`[data-line="${activeLine}"]`);
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeLine]);

  function handleSelectPreset(preset: SamplePreset) {
    const matchingRulebook = rulebooks.find(book => book.name.toLowerCase().includes(preset.rulebookHint.toLowerCase()));
    const nextId = matchingRulebook?.id || "";
    if (nextId !== selectedRulebookId) {
      if (ruleJson && ruleJson !== JSON.stringify(selectedRulebook, null, 2) &&
          !confirm("Discard unsaved rulebook changes and use this preset's rulebook?")) return;
      draftMode.current = false;
      setSelectedRulebookId(nextId);
      if (!nextId) setRuleJson("");
    }
    setActivePresetId(preset.id); setContent(preset.content); setSourceName(preset.filename);
    setScan(null); setActiveLine(null); resetResultFilters();
    if (matchingRulebook) { setError(null); notify(`Loaded preset: ${preset.name}`); }
    else setError(`The ${preset.name} preset's rulebook is unavailable. Restore defaults in the Studio or choose a saved rulebook before auditing.`);
  }

  function handleDragOver(e: DragEvent<HTMLLabelElement>) { e.preventDefault(); if (!busy) setDragOver(true); }
  function handleDragLeave(e: DragEvent<HTMLLabelElement>) { e.preventDefault(); setDragOver(false); }
  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !taskRunning.current) processUploadedFile(file);
  }
  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) processUploadedFile(file);
  }
  function processUploadedFile(file: File) {
    void runTask("Uploading and scanning…", async () => {
      if (!selectedRulebookId) throw new Error("Select a saved rulebook before uploading a document.");
      if (!/\.(log|txt|json|yaml|yml|md|csv|conf)$/i.test(file.name)) throw new Error("Choose a supported text file (.log, .txt, .md, .json, .yaml, .yml, .csv, .conf).");
      if (file.size > 8 * 1024 * 1024) throw new Error("The file is too large. Maximum upload size is 8 MB.");
      const text = await file.text();
      if (!text.trim()) throw new Error("The uploaded document is empty.");
      if (text.includes("\0") || text.includes("\ufffd")) throw new Error("Upload a UTF-8 text document.");
      setContent(text); setSourceName(file.name); setActivePresetId(""); setScan(null);
      await executeScan(() => scanUpload(file, selectedRulebookId));
    });
  }

  async function refreshHistory() {
    try { setHistory(await listScans()); setHistoryLoaded(true); }
    catch (err) { setError(`The action succeeded, but scan history could not refresh: ${err instanceof Error ? err.message : "Request failed"}`); }
  }

  async function executeScan(request: () => Promise<ScanRecord>) {
    const result = await request();
    setScan(result); setActiveLine(result.findings[0]?.lineNumber ?? null);
    resetResultFilters(); setTab("auditor");
    await refreshHistory();
  }

  function triggerScan() {
    void runTask("Scanning document…", async () => {
      if (!content.trim()) throw new Error("Please paste or upload document content to audit.");
      if (!selectedRulebookId) throw new Error("Select a saved rulebook, or test a draft with Studio Rules.");
      await executeScan(() => scanPasted(content, selectedRulebookId, sourceName));
    });
  }

  function triggerStudioTestScan() {
    void runTask("Testing Studio rules…", async () => {
      if (!content.trim()) throw new Error("Add document content before testing your rules.");
      const parsed = readStudioRulebook();
      await executeScan(() => scanPasted(content, undefined, sourceName, parsed));
    });
  }

  function handleSaveRulebook() {
    void runTask("Saving rulebook…", async () => {
      const parsed = readStudioRulebook();
      // The selected database record determines update identity, rather than an editable JSON id.
      if (selectedRulebookId) parsed.id = selectedRulebookId; else delete parsed.id;
      const saved = await saveRulebook(parsed);
      draftMode.current = false;
      setRulebooks(books => [...books.filter(book => book.id !== saved.id), saved]);
      setSelectedRulebookId(saved.id || ""); setRuleJson(JSON.stringify(saved, null, 2));
      if (scan?.rulebookId === saved.id) { setScan(null); setActiveLine(null); }
      notify(`Saved rulebook: ${saved.name}`);
    });
  }

  function handleDeleteRulebook() {
    if (!selectedRulebook?.id || !confirm(`Delete rulebook "${selectedRulebook.name}"?`)) return;
    const id = selectedRulebook.id;
    void runTask("Deleting rulebook…", async () => {
      await deleteRulebook(id);
      const books = rulebooks.filter(book => book.id !== id);
      setRulebooks(books); setSelectedRulebookId(books[0]?.id || "");
      if (!books.length) { setRuleJson(""); setEffectiveRules([]); }
      notify("Rulebook deleted.");
    });
  }

  function handleResetRulebooks() {
    if (!confirm("Restore the seeded rulebooks to their default rules? Custom rulebooks are retained.")) return;
    void runTask("Restoring defaults…", async () => {
      const books = await resetRulebooks();
      draftMode.current = false; setRulebooks(books);
      setSelectedRulebookId((books.find(book => book.name.includes("Framework")) || books[0])?.id || "");
      setScan(null); setActiveLine(null);
      notify("Default rulebooks restored.");
    });
  }

  function formatRuleJson() {
    try { setRuleJson(JSON.stringify(readStudioRulebook(), null, 2)); setSchemaValidationResult(null); notify("JSON formatted. Use Validate to check the rules."); }
    catch (err) { setError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`); }
  }

  function validateJsonAgainstSchema() {
    void runTask("Validating with the backend…", async () => {
      try {
        const effective = await validateRulebook(readStudioRulebook());
        setEffectiveRules(effective.rules || []);
        setSchemaValidationResult({ valid: true, errors: [] });
        notify("Backend validation passed, including Java regex and inheritance checks.");
      } catch (err) {
        setSchemaValidationResult({ valid: false, errors: [err instanceof Error ? err.message : String(err)] });
      }
    });
  }

  function toggleEffectiveRules() {
    if (showEffectiveRules) { setShowEffectiveRules(false); return; }
    void runTask("Loading inherited draft rules…", async () => {
      const effective = await validateRulebook(readStudioRulebook());
      setEffectiveRules(effective.rules || []);
      setShowEffectiveRules(true);
    });
  }

  function handleDeleteScan(id: string) {
    if (!confirm("Delete this scan record?")) return;
    void runTask("Deleting scan…", async () => {
      await deleteScan(id);
      setHistory(items => items.filter(item => item.id !== id));
      if (scan?.id === id) { setScan(null); setActiveLine(null); }
      notify("Scan deleted.");
    });
  }

  function handleClearAllScans() {
    if (!confirm("Permanently delete all scan records?")) return;
    void runTask("Clearing history…", async () => {
      await clearAllScans(); setHistory([]); setScan(null); setActiveLine(null); notify("Scan history cleared.");
    });
  }

  function viewScan(id: string) {
    if (ruleJson && ruleJson !== JSON.stringify(selectedRulebook, null, 2) &&
        !confirm("Open this scan and discard unsaved rulebook changes?")) return;
    void runTask("Loading scan…", async () => {
      const record = await getScan(id);
      const savedBook = rulebooks.find(book => book.id === record.rulebookId);
      draftMode.current = false;
      setSelectedRulebookId(savedBook?.id || "");
      if (!savedBook) {
        setRuleJson("");
        notify("Scan loaded. Its draft or removed rulebook is unavailable; choose a saved rulebook to run a new audit.");
      }
      setScan(record); setContent(record.content); setSourceName(record.sourceName); setActivePresetId("");
      setActiveLine(record.findings[0]?.lineNumber ?? null); resetResultFilters(); setTab("auditor");
    });
  }

  function exportReport(format: "json" | "markdown" | "sarif") {
    if (!scan) return;
    const record = scan;
    void runTask("Exporting report…", async () => {
      const blob = await downloadScanReport(record.id, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `compliance-audit-${record.sourceName.replace(/[^a-zA-Z0-9._-]/g, "_")}.${format === "markdown" ? "md" : format}`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(`Exported ${format.toUpperCase()} report.`);
    });
  }

  // Navigation between violations
  const violatingLineNumbers = useMemo(() => {
    if (!scan) return [];
    const set = new Set<number>();
    scan.findings.forEach((f) => set.add(f.lineNumber));
    return Array.from(set).sort((a, b) => a - b);
  }, [scan]);

  function jumpToNextViolation() {
    if (violatingLineNumbers.length === 0) return;
    const currentIndex = activeLine ? violatingLineNumbers.indexOf(activeLine) : -1;
    const nextIndex = (currentIndex + 1) % violatingLineNumbers.length;
    setActiveLine(violatingLineNumbers[nextIndex]);
  }

  function jumpToPrevViolation() {
    if (violatingLineNumbers.length === 0) return;
    const currentIndex = activeLine ? violatingLineNumbers.indexOf(activeLine) : 0;
    const prevIndex = (currentIndex - 1 + violatingLineNumbers.length) % violatingLineNumbers.length;
    setActiveLine(violatingLineNumbers[prevIndex]);
  }

  // Global Keyboard Shortcuts (Ctrl/Cmd+Enter: Audit, Alt+N: Next Violation, Alt+P: Prev Violation)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!taskRunning.current && tab === "auditor") triggerScan();
      } else if (e.altKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        jumpToNextViolation();
      } else if (e.altKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        jumpToPrevViolation();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, tab, content, selectedRulebookId, sourceName, violatingLineNumbers, activeLine]);

  // Filtered Findings
  const filteredFindings = useMemo(() => {
    if (!scan) return [];
    return scan.findings.filter((f) => {
      if (severityFilter !== "ALL" && f.severity !== severityFilter) return false;
      if (categoryFilter !== "ALL" && (f.category || "General").toLowerCase() !== categoryFilter.toLowerCase()) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matches =
          f.title.toLowerCase().includes(q) ||
          f.message.toLowerCase().includes(q) ||
          f.lineText.toLowerCase().includes(q) ||
          (f.suggestion && f.suggestion.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [scan, severityFilter, categoryFilter, searchQuery]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">Skip to workspace</a>
      {/* Masthead */}
      <header className="masthead">
        <div className="brand">
          <div className="brand-icon">
            <ShieldCheck size={28} />
          </div>
          <div>
            <p className="kicker">TeddySnow Compliance Suite</p>
            <h1>Structured Document Compliance Auditor</h1>
            <p className="lede">
              Scan open source framework documentation, system logs, and API schemas against strict
              JSON rulebooks with line-by-line violation highlighting.
            </p>
          </div>
        </div>
        <div className="header-status">
          <span className="status-badge">
            <span className={`status-dot ${databaseStatus}`}></span>
            {databaseStatus === "connected" ? "Database connected" : databaseStatus === "checking" ? "Checking database…" : "Database unavailable"}
          </span>
          <span className="status-badge">
            <Code2 size={13} />
            {apiStatus === "connected" ? "API online" : apiStatus === "checking" ? "Checking API…" : "API unavailable"}
          </span>
          <span className="status-badge">
            <BookOpen size={13} />
            {rulebooks.length} Active Rulebooks
          </span>
        </div>
      </header>

      {/* Tabs Navigation */}
      <nav className="nav-bar" aria-label="Main navigation">
        <div className="tabs">
          <button
            className={`tab-btn ${tab === "auditor" ? "active" : ""}`}
            aria-current={tab === "auditor" ? "page" : undefined}
            onClick={() => setTab("auditor")}
          >
            <FileText size={16} />
            Auditor Workspace
          </button>
          <button
            className={`tab-btn ${tab === "rulebook" ? "active" : ""}`}
            aria-current={tab === "rulebook" ? "page" : undefined}
            onClick={() => setTab("rulebook")}
          >
            <BookOpen size={16} />
            JSON Rulebook & Schema Studio
          </button>
          <button
            className={`tab-btn ${tab === "history" ? "active" : ""}`}
            aria-current={tab === "history" ? "page" : undefined}
            onClick={() => setTab("history")}
          >
            <History size={16} />
            Scan History
            <span className="tab-badge">{history.length}</span>
          </button>
          <button
            className={`tab-btn ${tab === "cicd" ? "active" : ""}`}
            aria-current={tab === "cicd" ? "page" : undefined}
            onClick={() => setTab("cicd")}
          >
            <Terminal size={16} />
            CI/CD & CLI
          </button>
        </div>

        {tab === "auditor" && scan && (
          <div className="btn-group nav-export-group">
            <button className="btn btn-sm btn-primary" onClick={() => exportReport("sarif")} title="Export standard OASIS SARIF v2.1.0 for GitHub Code Scanning">
              <Download size={14} />
              <span>Export SARIF</span>
            </button>
            <button className="btn btn-sm" onClick={() => exportReport("markdown")}>
              <Download size={14} />
              <span>Markdown</span>
            </button>
            <button className="btn btn-sm" onClick={() => exportReport("json")}>
              <Download size={14} />
              <span>JSON</span>
            </button>
          </div>
        )}
      </nav>

      {/* Alert Banners */}
      {error && (
        <div className="banner error" role="alert">
          <AlertCircle size={18} />
          <span style={{ flex: 1 }}>{error}</span>
          <button className="btn btn-sm btn-danger" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {successBanner && (
        <div className="banner success" role="status">
          <CheckCircle2 size={18} />
          <span>{successBanner}</span>
        </div>
      )}

      <div className="connection-toolbar">
        <span role="status" aria-live="polite">{busy ? operationLabel : databaseStatus === "connected" ? "Catalog ready" : "Start the API and MongoDB, then refresh the connection."}</span>
        <button className="btn btn-sm" disabled={busy} onClick={refreshConnection}><RotateCcw size={14} />Refresh connection</button>
      </div>
      <main id="main-content" aria-busy={busy}>
      <fieldset className="workspace-controls" disabled={busy}>
      <legend className="sr-only">Workspace controls</legend>
      {/* TAB 1: AUDITOR WORKSPACE */}
      {tab === "auditor" && (
        <div className="workspace-grid">
          {/* Left Column: Source Input */}
          <section className="panel">
            <div className="panel-title">
              <h2>
                <FileCode size={18} />
                Source Record Input
              </h2>
              <span className="status-badge">
                {content.split("\n").length} lines · {content.length} chars
              </span>
            </div>

            {/* Presets Chips */}
            <div className="presets-section">
              <div className="section-label">
                <span>Standard Test Record Presets</span>
                <span>Quick Pick</span>
              </div>
              <div className="preset-chips">
                {SAMPLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={`preset-chip ${activePresetId === preset.id ? "active" : ""}`}
                    onClick={() => handleSelectPreset(preset)}
                    title={preset.description}
                  >
                    <Sparkles size={13} />
                    {preset.name}
                  </button>
                ))}
                <button
                  className="preset-chip"
                  onClick={() => {
                    setContent("");
                    setSourceName("custom-record.txt");
                    setActivePresetId("");
                    setScan(null); setActiveLine(null); resetResultFilters();
                  }}
                >
                  <Trash2 size={13} />
                  Clear
                </button>
              </div>
            </div>

            {/* Drag & Drop Upload Zone */}
            <label
              className={`dropzone ${dragOver ? "dragover" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              tabIndex={busy ? -1 : 0}
              role="button"
              aria-label="Upload and audit a text document"
              aria-disabled={busy}
              onKeyDown={event => {
                if (!busy && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault(); event.currentTarget.querySelector("input")?.click();
                }
              }}
            >
              <input
                type="file"
                aria-label="Upload text document"
                accept=".log,.txt,.json,.yaml,.yml,.md,.csv,.conf"
                onChange={handleFileInput}
              />
              <div className="dropzone-inner">
                <UploadCloud size={28} />
                <span className="dropzone-text">
                  Drag & drop text record or log file here, or click to browse
                </span>
                <span className="dropzone-sub">
                  UTF-8 text · .log, .txt, .md, .json, .yaml, .yml, .csv, .conf · up to 8 MB · scans immediately
                </span>
              </div>
            </label>

            {/* Rulebook Selection & Source Name */}
            <div className="input-row">
              <div className="form-group">
                <label htmlFor="auditor-rulebook">Compliance Rulebook</label>
                <select
                  id="auditor-rulebook"
                  aria-label="Compliance rulebook"
                  value={selectedRulebookId}
                  onChange={(e) => selectRulebook(e.target.value)}
                >
                  {!selectedRulebookId && <option value="">{rulebooks.length ? "Select a saved rulebook" : "No rulebooks available"}</option>}
                  {rulebooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} (v{b.version}) - {b.rules?.length || 0} rules
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="source-name">Source Record Identifier</label>
                <input
                  id="source-name"
                  type="text"
                  value={sourceName}
                  onChange={(e) => { setSourceName(e.target.value); setActivePresetId(""); }}
                  placeholder="e.g. system.log, react-docs.md"
                />
              </div>
            </div>

            {/* Textarea Editor */}
            <div className="editor-container">
              <div className="editor-header-bar">
                <span>Document Editor</span>
                <span className="kbd-badge">⌘/Ctrl + ↵ to Audit</span>
              </div>
              <textarea
                className="editor-textarea"
                aria-label="Document content"
                value={content}
                onChange={(e) => { setContent(e.target.value); setActivePresetId(""); }}
                spellCheck={false}
                placeholder="Paste system logs or open source framework documentation records here..."
              />
            </div>

            {/* Action Buttons */}
            <div className="action-row">
              <div className="btn-group">
                <button
                  className="btn btn-primary"
                  disabled={busy || !content.trim() || !selectedRulebookId}
                  onClick={triggerScan}
                >
                  {busy ? (
                    <>{operationLabel}</>
                  ) : (
                    <>
                      <ShieldCheck size={16} />
                      Audit Document
                    </>
                  )}
                </button>
                <button
                  className="btn"
                  disabled={busy || !content.trim() || !ruleJson}
                  onClick={triggerStudioTestScan}
                  title="Audits against in-progress Studio JSON rulebook without saving to database"
                >
                  <Code2 size={15} />
                  Test with Studio Rules
                </button>
              </div>
              <button
                className="btn btn-sm"
                onClick={() => void copyText(content, "Source content copied.")}
              >
                <Copy size={14} />
                Copy
              </button>
            </div>
          </section>

          {/* Right Column: Results & Line Highlighting */}
          <section className="panel">
            {!scan ? (
              <div style={{ textAlign: "center", padding: "64px 20px" }}>
                <ShieldCheck size={48} style={{ color: "var(--muted)", margin: "0 auto 16px" }} />
                <h3 style={{ margin: "0 0 8px", color: "#fff" }}>Ready to Audit</h3>
                <p style={{ color: "var(--muted)", maxWidth: "42ch", margin: "0 auto 20px" }}>
                  Select a rulebook and click <strong>Audit Document</strong> to scan for outdated
                  API versions, missing validation flags, and deprecated tags.
                </p>
                <button className="btn btn-primary" disabled={busy || !content.trim() || !selectedRulebookId} onClick={triggerScan}>
                  Run Compliance Scan
                </button>
              </div>
            ) : (
              <div>
                <p className="hint">Report for <strong>{scan.sourceName}</strong> · {scan.rulebookName} · {new Date(scan.createdAt).toLocaleString()}</p>
                {(scan.content !== content || scan.sourceName !== sourceName || (selectedRulebookId && scan.rulebookId !== selectedRulebookId)) &&
                  <div className="banner" role="status">This report is from an earlier document or rulebook. Run a new audit to update the results.</div>}
                {/* Scorecard */}
                <div className={`scorecard ${scan.compliant ? "compliant" : "violations"}`}>
                  <div className={`status-badge-lg ${scan.compliant ? "pass" : "fail"}`}>
                    {scan.compliant ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
                    {scan.compliant ? "NO ERRORS" : "ERRORS DETECTED"}
                  </div>
                  <div className="score-stats">
                    <div className="stat-item">
                      <span className="stat-val">{scan.lineCount}</span>
                      <span className="stat-lbl">Lines</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-val err">{scan.errorCount}</span>
                      <span className="stat-lbl">Errors</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-val warn">{scan.warningCount}</span>
                      <span className="stat-lbl">Warnings</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-val info">{scan.infoCount}</span>
                      <span className="stat-lbl">Info</span>
                    </div>
                    <div className="compliance-gauge-wrapper">
                      <div className="compliance-gauge-bar">
                        <div
                          className={`compliance-gauge-fill ${scan.compliant ? "ok" : "err"}`}
                          style={{
                            width: `${
                              scan.lineCount > 0
                                ? Math.max(
                                    0,
                                    Math.round(((scan.lineCount - violatingLineNumbers.length) / scan.lineCount) * 100)
                                  )
                                : 100
                            }%`,
                          }}
                        />
                      </div>
                      <span className="compliance-gauge-text">
                        {scan.lineCount > 0
                          ? `${Math.max(
                              0,
                              Math.round(((scan.lineCount - violatingLineNumbers.length) / scan.lineCount) * 100)
                            )}% Lines Without Findings`
                          : "100% Lines Without Findings"}
                      </span>
                    </div>
                  </div>
                  {violatingLineNumbers.length > 0 && (
                    <div className="violation-navigator">
                      <span className="nav-counter">
                        {activeLine && violatingLineNumbers.indexOf(activeLine) >= 0
                          ? `Violation ${violatingLineNumbers.indexOf(activeLine) + 1} of ${violatingLineNumbers.length}`
                          : `${violatingLineNumbers.length} Violations`}
                      </span>
                      <div className="btn-group">
                        <button
                          className="btn btn-sm"
                          onClick={jumpToPrevViolation}
                          aria-label="Previous violation"
                          title="Previous violation (Alt+P)"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={jumpToNextViolation}
                          aria-label="Next violation"
                          title="Next violation (Alt+N)"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Filters & Navigation Toolbar */}
                <div className="results-toolbar">
                  <div className="filter-pills">
                    <button
                      className={`filter-pill ${severityFilter === "ALL" ? "active" : ""}`}
                      onClick={() => setSeverityFilter("ALL")}
                    >
                      All ({scan.findings.length})
                    </button>
                    <button
                      className={`filter-pill err ${severityFilter === "ERROR" ? "active" : ""}`}
                      onClick={() => setSeverityFilter("ERROR")}
                    >
                      Errors ({scan.errorCount})
                    </button>
                    <button
                      className={`filter-pill warn ${severityFilter === "WARNING" ? "active" : ""}`}
                      onClick={() => setSeverityFilter("WARNING")}
                    >
                      Warnings ({scan.warningCount})
                    </button>
                    <button
                      className={`filter-pill inf ${severityFilter === "INFO" ? "active" : ""}`}
                      onClick={() => setSeverityFilter("INFO")}
                    >
                      Info ({scan.infoCount})
                    </button>
                  </div>
                  <div className="btn-group">
                    <button
                      className={`btn btn-sm ${showOnlyViolations ? "btn-primary" : ""}`}
                      onClick={() => setShowOnlyViolations(!showOnlyViolations)}
                    >
                      {showOnlyViolations ? "Show All Lines" : "Only Violating Lines"}
                    </button>
                  </div>
                </div>

                {/* Category filters if available */}
                {scan.findings.length > 0 && (
                  <div className="filter-pills" style={{ marginBottom: "12px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "11px", color: "var(--muted)", alignSelf: "center", marginRight: "4px" }}>
                      Category:
                    </span>
                    <button
                      className={`filter-pill ${categoryFilter === "ALL" ? "active" : ""}`}
                      onClick={() => setCategoryFilter("ALL")}
                    >
                      All Categories
                    </button>
                    {Array.from(new Set(scan.findings.map((f) => f.category || "General"))).map((cat) => (
                      <button
                        key={cat}
                        className={`filter-pill ${categoryFilter.toLowerCase() === cat.toLowerCase() ? "active" : ""}`}
                        onClick={() => setCategoryFilter(categoryFilter.toLowerCase() === cat.toLowerCase() ? "ALL" : cat)}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}

                {/* Search bar inside findings */}
                <div style={{ marginBottom: "14px", position: "relative" }}>
                  <Search
                    size={14}
                    style={{ position: "absolute", left: "12px", top: "10px", color: "var(--muted)" }}
                  />
                  <input
                    aria-label="Search findings"
                    type="search"
                    style={{ paddingLeft: "34px" }}
                    placeholder="Search findings (title, message, code excerpt, remediation)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Document Code Viewer with Line Highlights */}
                <div className="document-viewer" ref={codeViewerRef}>
                  <div className="doc-viewer-header">
                    <span>
                      {scan.sourceName} — {scan.rulebookName}
                    </span>
                    <span>
                      {activeLine ? `Active Line: ${activeLine}` : "Click any line to inspect"}
                    </span>
                  </div>
                  <div className="doc-code-scroll">
                    <HighlightedDocument
                      content={scan.content}
                      findings={scan.findings}
                      activeLine={activeLine}
                      onSelectLine={setActiveLine}
                      showOnlyViolations={showOnlyViolations}
                    />
                  </div>
                </div>

                {/* Findings List */}
                <div className="panel-title" style={{ marginTop: "20px" }}>
                  <h2>
                    <AlertTriangle size={17} />
                    Audit Findings ({filteredFindings.length})
                  </h2>
                  <span className="status-badge">
                    {scan.rulebookName}
                  </span>
                </div>

                <div className="findings-container" ref={findingsListRef}>
                  {filteredFindings.length === 0 ? (
                    <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>
                      {scan.findings.length === 0 ? (
                        <span style={{ color: "var(--pass)" }}>
                          <CheckCircle2 size={24} style={{ display: "block", margin: "0 auto 6px" }} />
                          All lines in this document comply with the selected rulebook!
                        </span>
                      ) : (
                        "No findings match current search filter."
                      )}
                    </div>
                  ) : (
                    filteredFindings.map((finding, idx) => (
                      <div
                        key={`${finding.ruleId}-${finding.lineNumber}-${idx}`}
                        className={`finding-card ${finding.severity.toLowerCase()} ${
                          activeLine === finding.lineNumber ? "active" : ""
                        }`}
                        onClick={() => setActiveLine(finding.lineNumber)}
                        tabIndex={0}
                        role="button"
                        onKeyDown={event => {
                          if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                            event.preventDefault(); setActiveLine(finding.lineNumber);
                          }
                        }}
                      >
                        <div className="finding-header">
                          <div className="finding-badges">
                            <span className={`badge-sev ${finding.severity.toLowerCase()}`}>
                              {finding.severity}
                            </span>
                            <span className="badge-cat">{finding.category || "General"}</span>
                            <span className="badge-cat">Rule: {finding.ruleId}</span>
                          </div>
                          <button
                            className="line-jump-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveLine(finding.lineNumber);
                            }}
                          >
                            Line {finding.lineNumber}
                            <ChevronRight size={13} />
                          </button>
                        </div>
                        <h4 className="finding-title">{finding.title}</h4>
                        <p className="finding-message">{finding.message}</p>
                        {finding.excerpt && (
                          <div className="excerpt-row">
                            <div className="finding-excerpt">
                              &gt; {finding.excerpt}
                            </div>
                            <button
                              className="btn btn-sm"
                              style={{ padding: "6px 9px" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                void copyText(finding.excerpt, "Snippet copied.");
                              }}
                              aria-label="Copy offending code excerpt"
                              title="Copy offending code excerpt"
                            >
                              <Copy size={11} />
                            </button>
                          </div>
                        )}
                        {finding.suggestion && (
                          <div className="finding-suggestion">
                            <Sparkles size={14} />
                            <span>
                              <strong>Remediation:</strong> {finding.suggestion}
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: JSON RULEBOOK & SCHEMA STUDIO */}
      {tab === "rulebook" && (
        <div>
          {/* Studio Navigation & Toolbar */}
          <div className="action-row studio-toolbar">
            <div className="btn-group studio-view-tabs">
              <button
                className={`btn btn-sm ${studioView === "editor" ? "btn-primary" : ""}`}
                onClick={() => setStudioView("editor")}
              >
                <Code2 size={14} />
                JSON Editor
              </button>
              <button
                className={`btn btn-sm ${studioView === "visual" ? "btn-primary" : ""}`}
                onClick={() => setStudioView("visual")}
              >
                <BookOpen size={14} />
                Rule Cards ({studioRulebook?.rules?.length || 0})
              </button>
              <button
                className={`btn btn-sm ${studioView === "schema" ? "btn-primary" : ""}`}
                onClick={() => setStudioView("schema")}
              >
                <FileCode size={14} />
                Schema Spec
              </button>
            </div>

            <div className="btn-group studio-actions">
              <button className="btn btn-sm" onClick={newRulebook}>New Rulebook</button>
              <button className="btn btn-sm" onClick={formatRuleJson}>
                Format
              </button>
              <button className="btn btn-sm" onClick={validateJsonAgainstSchema}>
                Validate
              </button>
              <button className="btn btn-sm btn-primary" disabled={busy || !ruleJson} onClick={handleSaveRulebook}>
                Save Rulebook
              </button>
              <button className="btn btn-sm btn-danger" disabled={busy || !selectedRulebookId} onClick={handleDeleteRulebook}>
                <Trash2 size={13} />
                Delete
              </button>
              <button className="btn btn-sm" disabled={busy} onClick={handleResetRulebooks}>
                <RotateCcw size={13} />
                Reset
              </button>
            </div>
          </div>

          {/* Schema Validation Feedback */}
          {schemaValidationResult && (
            <div className={`banner ${schemaValidationResult.valid ? "success" : "error"}`}>
              {schemaValidationResult.valid ? (
                <>
                  <CheckCircle2 size={18} />
                  <span>Rulebook JSON is strictly valid according to the compliance schema!</span>
                </>
              ) : (
                <div style={{ width: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold" }}>
                    <AlertCircle size={18} />
                    Strict JSON Schema Validation Errors:
                  </div>
                  <ul style={{ margin: "8px 0 0", paddingLeft: "24px" }}>
                    {schemaValidationResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Sub-view: JSON Editor */}
          {studioView === "editor" && (
            <div className="rulebook-studio-layout">
              <div className="panel">
                <div className="panel-title">
                  <h2>
                    <Code2 size={18} />
                    Active Rulebook Specification
                  </h2>
                  <select
                    aria-label="Studio rulebook"
                    value={selectedRulebookId}
                    onChange={(e) => selectRulebook(e.target.value)}
                  >
                    {!selectedRulebookId && <option value="">{rulebooks.length ? "Select a saved rulebook" : "No rulebooks available"}</option>}
                  {rulebooks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} (v{b.version})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="inheritance-control">
                  <Layers size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <span style={{ fontSize: "12px", color: "var(--muted)", whiteSpace: "normal" }}>Inherits Rules From (Extends):</span>
                  <select
                    style={{ fontSize: "12px", padding: "4px 8px", flex: 1 }}
                    aria-label="Parent rulebook"
                    value={(() => {
                      try {
                        const parsed = JSON.parse(ruleJson);
                        return parsed.extendsRulebookId || "";
                      } catch {
                        return "";
                      }
                    })()}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(ruleJson);
                        const parentId = e.target.value;
                        if (parentId) {
                          const parent = rulebooks.find((b) => b.id === parentId);
                          parsed.extendsRulebookId = parentId;
                          parsed.extendsRulebookName = parent?.name || "";
                        } else {
                          delete parsed.extendsRulebookId;
                          delete parsed.extendsRulebookName;
                        }
                        setRuleJson(JSON.stringify(parsed, null, 2));
                        setSchemaValidationResult(null);
                        setEffectiveRules([]);
                        setShowEffectiveRules(false);
                      } catch {
                        setError("Invalid JSON, please fix syntax before updating inheritance");
                      }
                    }}
                  >
                    <option value="">None (Independent Rulebook)</option>
                    {rulebooks
                      .filter((b) => b.id !== selectedRulebookId)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} (v{b.version})
                        </option>
                      ))}
                  </select>
                </div>

                <p className="hint">
                  Edit rule conditions in strict JSON format. Rules support types:{" "}
                  <code>API_VERSION</code>, <code>FORBIDDEN_PATTERN</code>,{" "}
                  <code>FORBIDDEN_TOKENS</code>, <code>REQUIRED_WHEN</code>, and{" "}
                  <code>DOCUMENT_REQUIRED</code>.
                </p>
                <textarea
                  className="editor-textarea"
                  aria-label="Rulebook JSON"
                  style={{ minHeight: "480px" }}
                  value={ruleJson}
                  onChange={(e) => {
                    setRuleJson(e.target.value);
                    setSchemaValidationResult(null);
                    setEffectiveRules([]);
                    setShowEffectiveRules(false);
                  }}
                  spellCheck={false}
                />
              </div>

              {/* Side Breakdown */}
              <div className="panel">
                <div className="panel-title">
                  <h2>
                    <BookOpen size={18} />
                    Rulebook Summary
                  </h2>
                  <span className="status-badge">
                    {studioRulebook?.version ? `v${studioRulebook.version}` : "Draft"}
                  </span>
                </div>
                <h3 style={{ margin: "0 0 6px", color: "var(--accent)" }}>
                  {studioRulebook?.name || "Custom Rulebook"}
                </h3>
                <p style={{ color: "var(--muted)", margin: "0 0 16px" }}>
                  {studioRulebook?.description || "No description provided."}
                </p>

                <div className="rule-cards-list">
                  {(studioRulebook?.rules || []).map((rule) => (
                    <div key={rule.id} className="rule-card">
                      <div className="rule-card-header">
                        <strong>{rule.title}</strong>
                        <span className={`badge-sev ${rule.severity.toLowerCase()}`}>
                          {rule.severity}
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--ink-secondary)" }}>
                        {rule.message}
                      </div>
                      <div className="rule-meta">
                        Type: {rule.type} · ID: {rule.id}
                        {rule.minVersion && ` · MinVersion: ${rule.minVersion}`}
                        {rule.tokens && ` · Tokens: [${rule.tokens.join(", ")}]`}
                        {rule.pattern && ` · Pattern: ${rule.pattern}`}
                      </div>
                      {rule.suggestion && (
                        <div className="finding-suggestion" style={{ marginTop: "8px" }}>
                          <Sparkles size={12} />
                          <span>{rule.suggestion}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sub-view: Visual Rule Cards */}
          {studioView === "visual" && (() => {
            const rulesToDisplay = showEffectiveRules ? effectiveRules : (studioRulebook?.rules || []);
            return (
            <div className="panel">
              <div className="panel-title">
                <h2>
                  <BookOpen size={18} />
                  Configured Compliance Rules ({rulesToDisplay.length})
                </h2>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  {studioRulebook?.extendsRulebookId && (
                    <span className="status-badge" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Layers size={13} />
                      Extends: {studioRulebook.extendsRulebookName || studioRulebook.extendsRulebookId}
                    </span>
                  )}
                  {studioRulebook?.extendsRulebookId && (
                    <button
                      className={`btn btn-sm ${showEffectiveRules ? "btn-primary" : ""}`}
                      onClick={toggleEffectiveRules}
                      title="Toggle viewing only this rulebook's authored rules vs merged inherited rules"
                    >
                      <Layers size={13} />
                      {showEffectiveRules ? "Showing All (With Inherited)" : "Include Inherited Rules"}
                    </button>
                  )}
                  <span className="status-badge">{studioRulebook?.name}</span>
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
                  gap: "16px",
                }}
              >
                {rulesToDisplay.map((rule) => (
                  <div key={rule.id} className="rule-card">
                    <div className="rule-card-header">
                      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                        <span className="badge-cat">{rule.category}</span>
                        {rule.enabled === false && <span className="badge-cat">Disabled</span>}
                        {rule.inherited && (
                          <span className="badge-cat" style={{ background: "rgba(45, 212, 191, 0.15)", color: "var(--accent)" }}>
                            Inherited ({rule.inheritedFrom || "Parent"})
                          </span>
                        )}
                      </div>
                      <span className={`badge-sev ${rule.severity.toLowerCase()}`}>
                        {rule.severity}
                      </span>
                    </div>
                    <h3 style={{ margin: "6px 0", fontSize: "15px" }}>{rule.title}</h3>
                    <p style={{ fontSize: "12.5px", color: "var(--ink-secondary)", margin: "0 0 8px" }}>
                      {rule.message}
                    </p>
                    <div className="rule-meta">
                      <div>
                        <strong>Type:</strong> <code>{rule.type}</code>
                      </div>
                      <div>
                        <strong>ID:</strong> <code>{rule.id}</code>
                      </div>
                      {rule.pattern && (
                        <div>
                          <strong>Pattern:</strong> <code>{rule.pattern}</code>
                        </div>
                      )}
                      {rule.triggerPattern && (
                        <div>
                          <strong>Trigger:</strong> <code>{rule.triggerPattern}</code>
                        </div>
                      )}
                      {rule.requiredPattern && (
                        <div>
                          <strong>Requires:</strong> <code>{rule.requiredPattern}</code>
                        </div>
                      )}
                      {rule.minVersion && (
                        <div>
                          <strong>Minimum Version:</strong> <code>{rule.minVersion}</code>
                        </div>
                      )}
                      {rule.tokens && rule.tokens.length > 0 && (
                        <div>
                          <strong>Tokens:</strong> {rule.tokens.join(", ")}
                        </div>
                      )}
                    </div>
                    {rule.suggestion && (
                      <div className="finding-suggestion" style={{ marginTop: "10px" }}>
                        <Sparkles size={13} />
                        <span>{rule.suggestion}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            );
          })()}

          {/* Sub-view: Strict JSON Schema Spec */}
          {studioView === "schema" && (
            <div className="panel">
              <div className="panel-title">
                <h2>
                  <FileCode size={18} />
                  Strict JSON Schema Definition
                </h2>
                <button
                  className="btn btn-sm"
                  disabled={!schemaDoc}
                  onClick={() => {
                    if (schemaDoc) {
                      void copyText(JSON.stringify(schemaDoc, null, 2), "Schema copied.");
                    }
                  }}
                >
                  <Copy size={14} />
                  Copy Schema
                </button>
              </div>
              <p className="hint">
                All rulebooks must strictly validate against this JSON Schema specification. This
                guarantees predictable scanning, reliable regex evaluation, and strict structural
                compliance.
              </p>
              <textarea
                className="editor-textarea"
                style={{ minHeight: "440px" }}
                aria-label="Backend rulebook schema"
                value={schemaDoc ? JSON.stringify(schemaDoc, null, 2) : "Schema unavailable. Use Refresh connection to retry."}
                readOnly
              />
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SCAN HISTORY */}
      {tab === "history" && (
        <section className="panel">
          <div className="panel-title">
            <h2>
              <History size={18} />
              Audited Scans Repository (MongoDB)
            </h2>
            <div className="btn-group">
              <button
                className="btn btn-sm btn-danger"
                disabled={busy || history.length === 0}
                onClick={handleClearAllScans}
              >
                <Trash2 size={14} />
                Clear All Scans
              </button>
            </div>
          </div>

          {history.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--muted)" }}>
              <History size={36} style={{ margin: "0 auto 12px" }} />
              <p>{historyLoaded ? "No scans recorded yet. Run an audit from the workspace." : "Scan history is unavailable. Refresh the connection to retry."}</p>
            </div>
          ) : (
            <div className="history-table-container">
              <table className="history-table">
                <thead>
                  <tr style={{ color: "var(--muted)", fontSize: "12px", textAlign: "left" }}>
                    <th style={{ padding: "8px 14px" }}>Source Record</th>
                    <th style={{ padding: "8px 14px" }}>Rulebook Used</th>
                    <th style={{ padding: "8px 14px" }}>Compliance Status</th>
                    <th style={{ padding: "8px 14px" }}>Metrics</th>
                    <th style={{ padding: "8px 14px" }}>Timestamp</th>
                    <th style={{ padding: "8px 14px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id} className="history-tr">
                      <td className="history-td">
                        <strong style={{ color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                          <FileText size={15} />
                          {item.sourceName}
                        </strong>
                      </td>
                      <td className="history-td" style={{ color: "var(--ink-secondary)" }}>
                        {item.rulebookName}
                      </td>
                      <td className="history-td">
                        <span className={`badge-sev ${item.compliant ? "info" : "error"}`}>
                          {item.compliant ? "COMPLIANT" : "VIOLATIONS"}
                        </span>
                      </td>
                      <td className="history-td" style={{ fontSize: "12.5px" }}>
                        <span style={{ color: "var(--error)" }}>{item.errorCount} err</span> ·{" "}
                        <span style={{ color: "var(--warning)" }}>{item.warningCount} warn</span> ·{" "}
                        <span style={{ color: "var(--muted)" }}>{item.lineCount} lines</span>
                      </td>
                      <td className="history-td" style={{ color: "var(--muted)", fontSize: "12px" }}>
                        {new Date(item.createdAt).toLocaleString()}
                      </td>
                      <td className="history-td" style={{ textAlign: "right" }}>
                        <div className="btn-group" style={{ justifyContent: "flex-end" }}>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => viewScan(item.id)}
                          >
                            View & Highlight
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDeleteScan(item.id)}
                            aria-label={`Delete scan ${item.sourceName}`}
                            title="Delete scan record"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: CI/CD, SARIF & CLI COMPANION */}
      {tab === "cicd" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Header Banner */}
          <div className="panel cicd-hero-banner">
            <div className="cicd-hero-inner">
              <div className="cicd-hero-icon">
                <Terminal size={28} />
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: "0 0 6px", fontSize: "18px", color: "var(--ink)" }}>
                  CI/CD Automation, SARIF Code Scanning & Terminal CLI
                </h2>
                <p style={{ margin: "0 0 12px", color: "var(--ink-secondary)", fontSize: "13.5px", lineHeight: "1.6" }}>
                  Seamlessly enforce compliance gates across your engineering pipelines—just like <strong>Stoplight Spectral</strong> and <strong>ESLint</strong>.
                  Scan documents on every Pull Request, fail builds on policy violations, and upload standard <strong>OASIS SARIF 2.1.0</strong> records for inline GitHub Code Scanning annotations.
                </p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span className="badge-cat" style={{ background: "rgba(56, 189, 248, 0.15)", color: "var(--accent)" }}>
                    ✓ SARIF 2.1.0 OASIS Standard
                  </span>
                  <span className="badge-cat" style={{ background: "rgba(99, 102, 241, 0.15)", color: "var(--accent-indigo)" }}>
                    ✓ GitHub Actions Ready
                  </span>
                  <span className="badge-cat" style={{ background: "rgba(245, 158, 11, 0.15)", color: "var(--warning)" }}>
                    ✓ CLI Pipeline Exit Codes (0 / 1)
                  </span>
                  <span className="badge-cat" style={{ background: "rgba(16, 185, 129, 0.15)", color: "var(--pass)" }}>
                    ✓ Rulebook Inheritance
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Command Builder */}
          <div className="panel">
            <div className="panel-title">
              <h2>
                <Code2 size={18} />
                Interactive CLI & Pipeline Command Generator
              </h2>
              <span className="status-badge">Live Generator</span>
            </div>
            <p className="hint">
              Customize your target document, rulebook, and output format to generate production-ready terminal and pipeline commands.
            </p>

            <div className="cicd-grid" style={{ gap: "14px", margin: "16px 0" }}>
              <div>
                <label htmlFor="ciTargetFile" style={{ display: "block", fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                  Target Document / Spec:
                </label>
                <select
                  style={{ width: "100%", padding: "8px" }}
                  id="ciTargetFile"
                  value={ciTargetFile}
                  onChange={(e) => setCiTargetFile(e.target.value)}
                >
                  <option value="samples/openapi-spec.yaml">samples/openapi-spec.yaml (Swagger 2.0 test record)</option>
                  <option value="samples/framework-documentation.md">samples/framework-documentation.md (Markdown)</option>
                  <option value="samples/system.log">samples/system.log (Platform Log)</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                  Compliance Rulebook:
                </label>
                <select
                  style={{ width: "100%", padding: "8px" }}
                  aria-label="Compliance rulebook"
                  value={ciRulebookId}
                  onChange={(e) => setCiRulebookId(e.target.value)}
                >
                  <option value="">Choose a rulebook</option>
                  {rulebooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} (v{b.version})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ciFormat" style={{ display: "block", fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                  Output Format:
                </label>
                <select
                  style={{ width: "100%", padding: "8px" }}
                  id="ciFormat"
                  value={ciFormat}
                  onChange={(e) => setCiFormat(e.target.value as typeof ciFormat)}
                >
                  <option value="sarif">SARIF 2.1.0 (GitHub Code Scanning)</option>
                  <option value="terminal">Terminal ANSI (Human-Readable)</option>
                  <option value="markdown">Markdown Report</option>
                  <option value="json">Full JSON Payload</option>
                </select>
              </div>

              <div>
                <label htmlFor="ciFailOn" style={{ display: "block", fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                  CI Failure Threshold:
                </label>
                <select
                  style={{ width: "100%", padding: "8px" }}
                  id="ciFailOn"
                  value={ciFailOn}
                  onChange={(e) => setCiFailOn(e.target.value as typeof ciFailOn)}
                >
                  <option value="error">Fail on ERROR only (exit code 1)</option>
                  <option value="warning">Fail on ERROR or WARNING (strict gate)</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="ci-server">Backend URL for cURL</label>
              <input id="ci-server" type="url" value={ciServer} onChange={event => setCiServer(event.target.value)} placeholder="http://localhost:8080" />
            </div>
            <p className="hint">The workflow starts MongoDB and the API, uses the selected document and threshold, and exports SARIF. Custom rulebooks must also exist in the CI database.</p>
            {/* Generated CLI Command Box */}
            <div style={{ marginTop: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <strong style={{ fontSize: "12.5px", color: "var(--accent)" }}>
                  💻 Terminal CLI Command:
                </strong>
                <button
                  className="btn btn-sm"
                  disabled={!ciRulebookId}
                  onClick={() => void copyText(generatedCli, "CLI command copied.", "cli")}
                >
                  {copiedCiSnippet === "cli" ? <Check size={13} style={{ color: "var(--pass)" }} /> : <Copy size={13} />}
                  {copiedCiSnippet === "cli" ? "Copied!" : "Copy Command"}
                </button>
              </div>
              <pre style={{ margin: 0, padding: "12px", background: "var(--panel-elevated)", borderRadius: "6px", border: "1px solid var(--line)", overflowX: "auto", fontSize: "13px", color: "#86efac" }}>
                <code>{generatedCli}</code>
              </pre>
            </div>

            {/* Generated cURL / REST API Command Box */}
            <div style={{ marginTop: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <strong style={{ fontSize: "12.5px", color: "var(--ink-secondary)" }}>
                  🌐 cURL / REST API Pipeline Command:
                </strong>
                <button
                  className="btn btn-sm"
                  disabled={!ciRulebookId || !/^https?:\/\//.test(ciServer)}
                  onClick={() => void copyText(generatedCurl, "cURL command copied.", "curl")}
                >
                  {copiedCiSnippet === "curl" ? <Check size={13} style={{ color: "var(--pass)" }} /> : <Copy size={13} />}
                  {copiedCiSnippet === "curl" ? "Copied!" : "Copy cURL"}
                </button>
              </div>
              <pre style={{ margin: 0, padding: "12px", background: "var(--panel-elevated)", borderRadius: "6px", border: "1px solid var(--line)", overflowX: "auto", fontSize: "12.5px", color: "#93c5fd" }}>
                <code>{generatedCurl}</code>
              </pre>
            </div>
          </div>

          {/* GitHub Actions Integration Guide */}
          <div className="panel">
            <div className="panel-title">
              <h2>
                <GitBranch size={18} />
                GitHub Actions Pull Request Quality Gate (.github/workflows/compliance-audit.yml)
              </h2>
              <button
                className="btn btn-sm btn-primary"
                disabled={!ciRulebookId}
                onClick={() => void copyText(generatedWorkflow, "Workflow YAML copied.", "gha")}
              >
                {copiedCiSnippet === "gha" ? <Check size={13} /> : <Copy size={13} />}
                {copiedCiSnippet === "gha" ? "Copied Workflow YAML!" : "Copy Workflow YAML"}
              </button>
            </div>
            <p className="hint">
              This workflow executes on every commit and Pull Request. Results are converted to standard SARIF 2.1.0 and uploaded to GitHub Security / Code Scanning to display inline PR annotations.
            </p>

            <pre style={{ margin: 0, padding: "14px", background: "var(--panel-elevated)", borderRadius: "6px", border: "1px solid var(--line)", overflowX: "auto", fontSize: "12.5px", color: "var(--ink)" }}>
{generatedWorkflow}
            </pre>
          </div>
        </div>
      )}
      </fieldset>
      </main>
    </div>
  );
}

// Sub-component: Highlighted Document Code Table
function HighlightedDocument({
  content,
  findings,
  activeLine,
  onSelectLine,
  showOnlyViolations,
}: {
  content: string;
  findings: Finding[];
  activeLine: number | null;
  onSelectLine: (line: number) => void;
  showOnlyViolations: boolean;
}) {
  const byLine = useMemo(() => {
    const map = new Map<number, Finding[]>();
    findings.forEach((f) => {
      const list = map.get(f.lineNumber) ?? [];
      list.push(f);
      map.set(f.lineNumber, list);
    });
    return map;
  }, [findings]);

  const rawLines = useMemo(() => content.split(/\r\n|[\n\r\u0085\u2028\u2029]/), [content]);

  return (
    <table className="code-table">
      <tbody>
        {rawLines.map((lineText, index) => {
          const lineNumber = index + 1;
          const hits = byLine.get(lineNumber) ?? [];
          const worstSev = getWorstSeverity(hits);

          if (showOnlyViolations && hits.length === 0) {
            return null;
          }

          const rowClass = [
            "code-row",
            worstSev ? `hit-${worstSev.toLowerCase()}` : "",
            activeLine === lineNumber ? "active" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <tr
              key={lineNumber}
              data-line={lineNumber}
              className={rowClass}
              onClick={() => onSelectLine(lineNumber)}
              tabIndex={0}
              aria-label={`Line ${lineNumber}${hits.length ? `, ${hits.length} findings` : ""}`}
              onKeyDown={event => {
                if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault(); onSelectLine(lineNumber);
                }
              }}
            >
              <td className="code-gutter">
                {hits.length > 0 && <span style={{ marginRight: "4px" }}>●</span>}
                {lineNumber}
              </td>
              <td className="code-content">
                {renderHighlightedSpans(lineText, hits)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function getWorstSeverity(findings: Finding[]): Severity | null {
  if (findings.some((f) => f.severity === "ERROR")) return "ERROR";
  if (findings.some((f) => f.severity === "WARNING")) return "WARNING";
  if (findings.some((f) => f.severity === "INFO")) return "INFO";
  return null;
}

function renderHighlightedSpans(line: string, findings: Finding[]) {
  if (!line) return "\u00a0";

  // Collect valid character ranges
  const ranges = findings
    .filter((f) => f.matchEnd !== undefined && f.matchStart !== undefined && f.matchEnd > f.matchStart)
    .map((f) => ({
      start: f.matchStart,
      end: f.matchEnd,
      severity: f.severity,
      title: f.title,
      message: f.message,
    }))
    .sort((a, b) => a.start - b.start);

  if (ranges.length === 0) {
    return line;
  }

  const elements: React.ReactNode[] = [];
  let cursor = 0;

  ranges.forEach((range, idx) => {
    const s = Math.max(cursor, Math.min(range.start, line.length));
    const e = Math.max(s, Math.min(range.end, line.length));

    if (s > cursor) {
      elements.push(<span key={`txt-${idx}`}>{line.slice(cursor, s)}</span>);
    }

    if (e > s) {
      elements.push(
        <mark
          key={`mark-${idx}`}
          className={`violation-mark ${range.severity.toLowerCase()}`}
          title={`${range.severity}: ${range.title} — ${range.message}`}
        >
          {line.slice(s, e)}
        </mark>
      );
    }
    cursor = Math.max(cursor, e);
  });

  if (cursor < line.length) {
    elements.push(<span key="tail">{line.slice(cursor)}</span>);
  }

  return elements;
}
