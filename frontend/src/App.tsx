import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  clearAllScans,
  deleteRulebook,
  deleteScan,
  getEffectiveRulebook,
  getRulebookSchema,
  getSarifExport,
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
  const [ciTargetFile, setCiTargetFile] = useState<string>("samples/openapi-spec.yaml");
  const [ciFormat, setCiFormat] = useState<"sarif" | "json" | "markdown" | "terminal">("sarif");
  const [ciFailOn, setCiFailOn] = useState<"error" | "warning">("error");
  const [copiedCiSnippet, setCopiedCiSnippet] = useState<string | null>(null);

  // Refs for auto-scrolling
  const codeViewerRef = useRef<HTMLDivElement>(null);
  const findingsListRef = useRef<HTMLDivElement>(null);

  const selectedRulebook = useMemo(() => {
    return rulebooks.find((book) => book.id === selectedRulebookId);
  }, [rulebooks, selectedRulebookId]);

  // Load Rulebooks, Scans, and Schema on initial render
  async function refreshCatalog() {
    setBusy(true);
    try {
      const [books, scans, schema] = await Promise.all([
        listRulebooks(),
        listScans(),
        getRulebookSchema().catch(() => null),
      ]);
      setRulebooks(books);
      setHistory(scans);
      if (schema) setSchemaDoc(schema);

      if (books.length > 0 && !selectedRulebookId) {
        // Default to Framework Documentation rulebook if present
        const frameworkBook = books.find((b) => b.name.includes("Framework")) || books[0];
        setSelectedRulebookId(frameworkBook.id || "");
        setRuleJson(JSON.stringify(frameworkBook, null, 2));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load database catalog");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshCatalog();
  }, []);

  // Sync ruleJson when user selects a different rulebook from dropdown
  useEffect(() => {
    if (selectedRulebook) {
      setRuleJson(JSON.stringify(selectedRulebook, null, 2));
      setSchemaValidationResult(null);
      if (selectedRulebook.id) {
        getEffectiveRulebook(selectedRulebook.id)
          .then((eff) => setEffectiveRules(eff.rules || []))
          .catch(() => setEffectiveRules(selectedRulebook.rules || []));
      }
    }
  }, [selectedRulebookId]);

  // Auto-scroll when active line changes
  useEffect(() => {
    if (activeLine !== null && codeViewerRef.current) {
      const lineEl = codeViewerRef.current.querySelector(`[data-line="${activeLine}"]`);
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeLine]);

  // Load Sample Preset
  function handleSelectPreset(preset: SamplePreset) {
    setActivePresetId(preset.id);
    setContent(preset.content);
    setSourceName(preset.filename);
    const matchingRulebook = rulebooks.find(
      (b) => b.name.toLowerCase().includes(preset.rulebookHint.toLowerCase()) ||
             preset.rulebookHint.toLowerCase().includes(b.name.toLowerCase())
    );
    if (matchingRulebook?.id) {
      setSelectedRulebookId(matchingRulebook.id);
    }
    setScan(null);
    setActiveLine(null);
    setSuccessBanner(`Loaded preset: ${preset.name}`);
    setTimeout(() => setSuccessBanner(null), 3000);
  }

  // Handle Drag & Drop Upload
  function handleDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  }

  function processUploadedFile(file: File) {
    setSourceName(file.name);
    file.text().then((text) => {
      setContent(text);
      setSuccessBanner(`Uploaded file: ${file.name} (${text.split("\n").length} lines)`);
      setTimeout(() => setSuccessBanner(null), 3500);
      void executeScan(scanUpload(file, selectedRulebookId || undefined));
    }).catch((err) => {
      setError(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  // Execute Scan
  async function executeScan(scanPromise: Promise<ScanRecord>) {
    setBusy(true);
    setError(null);
    try {
      const result = await scanPromise;
      setScan(result);
      if (result.findings.length > 0) {
        setActiveLine(result.findings[0].lineNumber);
      } else {
        setActiveLine(null);
      }
      setHistory(await listScans());
      setTab("auditor");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compliance scan failed");
    } finally {
      setBusy(false);
    }
  }

  // Trigger Pasted Content Scan
  function triggerScan() {
    if (!content.trim()) {
      setError("Please paste or upload document content to audit.");
      return;
    }
    void executeScan(scanPasted(content, selectedRulebookId || undefined, sourceName));
  }

  // Trigger Scan using in-progress Studio JSON rulebook (in-memory test)
  function triggerStudioTestScan() {
    try {
      const parsed = JSON.parse(ruleJson) as Rulebook;
      void executeScan(scanPasted(content, undefined, sourceName, parsed));
    } catch (err) {
      setError(`Invalid Rulebook JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Save Rulebook to MongoDB
  async function handleSaveRulebook() {
    setBusy(true);
    setError(null);
    try {
      const parsed = JSON.parse(ruleJson) as Rulebook;
      const saved = await saveRulebook(parsed);
      setSuccessBanner(`Rulebook '${saved.name}' saved to MongoDB successfully!`);
      setTimeout(() => setSuccessBanner(null), 4000);
      await refreshCatalog();
      if (saved.id) setSelectedRulebookId(saved.id);
      setRuleJson(JSON.stringify(saved, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save rulebook to MongoDB");
    } finally {
      setBusy(false);
    }
  }

  // Delete Rulebook
  async function handleDeleteRulebook() {
    if (!selectedRulebook?.id) return;
    if (!confirm(`Are you sure you want to delete rulebook "${selectedRulebook.name}"?`)) return;

    setBusy(true);
    try {
      await deleteRulebook(selectedRulebook.id);
      setSuccessBanner(`Deleted rulebook: ${selectedRulebook.name}`);
      setTimeout(() => setSuccessBanner(null), 3000);
      const books = await listRulebooks();
      setRulebooks(books);
      setSelectedRulebookId(books[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete rulebook");
    } finally {
      setBusy(false);
    }
  }

  // Reset Factory Rulebooks in MongoDB
  async function handleResetRulebooks() {
    if (!confirm("Reset all compliance rulebooks in MongoDB to factory defaults?")) return;
    setBusy(true);
    try {
      const books = await resetRulebooks();
      setRulebooks(books);
      setSelectedRulebookId(books[0]?.id || "");
      setRuleJson(JSON.stringify(books[0], null, 2));
      setSuccessBanner("Factory default rulebooks successfully restored in MongoDB!");
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset rulebooks");
    } finally {
      setBusy(false);
    }
  }

  // Format Rulebook JSON
  function formatRuleJson() {
    try {
      const parsed = JSON.parse(ruleJson);
      setRuleJson(JSON.stringify(parsed, null, 2));
      setSchemaValidationResult({ valid: true, errors: [] });
    } catch (err) {
      setError(`JSON Syntax Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Validate JSON against Strict Schema
  function validateJsonAgainstSchema() {
    try {
      const parsed = JSON.parse(ruleJson) as Rulebook;
      const errors: string[] = [];

      if (!parsed.name || parsed.name.trim().length < 2) {
        errors.push("Missing or invalid 'name' (minimum 2 characters required)");
      }
      if (!parsed.version || !/^[0-9]+(\.[0-9]+)*$/.test(parsed.version)) {
        errors.push("Missing or invalid 'version' (semantic version format e.g. 1.0.0 required)");
      }
      if (parsed.extendsRulebookId && parsed.id && parsed.extendsRulebookId === parsed.id) {
        errors.push("Rulebook cannot extend itself");
      }
      const hasExtends = Boolean(parsed.extendsRulebookId && parsed.extendsRulebookId.trim().length > 0);
      if ((!parsed.rules || !Array.isArray(parsed.rules) || parsed.rules.length === 0) && !hasExtends) {
        errors.push("Rulebook must contain a non-empty 'rules' array or extend a parent rulebook");
      } else if (parsed.rules && Array.isArray(parsed.rules)) {
        const idSet = new Set<string>();
        parsed.rules.forEach((rule, idx) => {
          const prefix = `Rule #${idx + 1}`;
          if (!rule.id || !/^[a-zA-Z0-9_-]{2,60}$/.test(rule.id)) {
            errors.push(`${prefix}: 'id' must be 2-60 alphanumeric characters with hyphens/underscores`);
          } else if (idSet.has(rule.id)) {
            errors.push(`${prefix}: duplicate rule id '${rule.id}'`);
          } else {
            idSet.add(rule.id);
          }
          if (!rule.title?.trim()) errors.push(`${prefix}: 'title' is required`);
          if (!["ERROR", "WARNING", "INFO"].includes(rule.severity)) {
            errors.push(`${prefix}: 'severity' must be ERROR, WARNING, or INFO`);
          }
          if (!rule.type) {
            errors.push(`${prefix}: 'type' is required`);
          } else {
            if (["API_VERSION", "FORBIDDEN_PATTERN", "DOCUMENT_REQUIRED"].includes(rule.type) && !rule.pattern) {
              errors.push(`${prefix}: 'pattern' regex is required for type ${rule.type}`);
            }
            if (rule.type === "API_VERSION" && !rule.minVersion) {
              errors.push(`${prefix}: 'minVersion' is required for API_VERSION`);
            }
            if (rule.type === "FORBIDDEN_TOKENS" && (!rule.tokens || rule.tokens.length === 0)) {
              errors.push(`${prefix}: 'tokens' array required for FORBIDDEN_TOKENS`);
            }
            if (rule.type === "REQUIRED_WHEN" && (!rule.triggerPattern || !rule.requiredPattern)) {
              errors.push(`${prefix}: 'triggerPattern' and 'requiredPattern' are required for REQUIRED_WHEN`);
            }
          }
        });
      }

      setSchemaValidationResult({
        valid: errors.length === 0,
        errors,
      });
      if (errors.length === 0) {
        setSuccessBanner("Schema check passed! Document satisfies strict JSON rulebook schema.");
        setTimeout(() => setSuccessBanner(null), 3000);
      }
    } catch (err) {
      setSchemaValidationResult({
        valid: false,
        errors: [`Invalid JSON Syntax: ${err instanceof Error ? err.message : String(err)}`],
      });
    }
  }

  // Delete Scan from History
  async function handleDeleteScan(id: string) {
    try {
      await deleteScan(id);
      setHistory(await listScans());
      if (scan?.id === id) {
        setScan(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete scan record");
    }
  }

  // Clear All Scans
  async function handleClearAllScans() {
    if (!confirm("Permanently delete all scan records from MongoDB?")) return;
    try {
      await clearAllScans();
      setHistory([]);
      setScan(null);
      setSuccessBanner("Scan history cleared.");
      setTimeout(() => setSuccessBanner(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear history");
    }
  }

  // Export Audit Report (JSON / Markdown / SARIF 2.1.0)
  async function exportReport(format: "json" | "markdown" | "sarif") {
    if (!scan) return;
    let contentStr = "";
    let mimeType = "application/json";
    let filename = `compliance-audit-${scan.sourceName || "document"}.${format === "sarif" ? "sarif" : format === "json" ? "json" : "md"}`;

    if (format === "sarif") {
      try {
        const sarifData = await getSarifExport(scan.id);
        contentStr = JSON.stringify(sarifData, null, 2);
      } catch {
        // Fallback to client-side SARIF 2.1.0 construction
        const ruleDefs = Array.from(new Set(scan.findings.map(f => f.ruleId))).map(rid => {
          const sample = scan.findings.find(f => f.ruleId === rid)!;
          return {
            id: rid,
            name: sample.title || rid,
            shortDescription: { text: sample.title || rid },
            fullDescription: { text: sample.message },
            help: { text: sample.suggestion || "" },
            defaultConfiguration: {
              level: sample.severity === "ERROR" ? "error" : sample.severity === "WARNING" ? "warning" : "note"
            }
          };
        });
        const sarifObj = {
          $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
          version: "2.1.0",
          runs: [{
            tool: {
              driver: {
                name: "Structured Document Compliance Auditor",
                version: "1.0.0",
                rules: ruleDefs
              }
            },
            results: scan.findings.map(f => ({
              ruleId: f.ruleId,
              level: f.severity === "ERROR" ? "error" : f.severity === "WARNING" ? "warning" : "note",
              message: { text: f.message },
              locations: [{
                physicalLocation: {
                  artifactLocation: { uri: scan.sourceName },
                  region: {
                    startLine: f.lineNumber,
                    startColumn: f.matchStart + 1,
                    endColumn: Math.max(f.matchStart + 1, f.matchEnd + 1),
                    snippet: { text: f.excerpt || f.lineText }
                  }
                }
              }]
            }))
          }]
        };
        contentStr = JSON.stringify(sarifObj, null, 2);
      }
      mimeType = "application/json";
    } else if (format === "json") {
      contentStr = JSON.stringify(scan, null, 2);
    } else {
      contentStr = `# Structured Document Compliance Audit Report
**Source:** ${scan.sourceName}
**Rulebook:** ${scan.rulebookName}
**Date:** ${new Date(scan.createdAt).toLocaleString()}
**Status:** ${scan.compliant ? "COMPLIANT" : "NON-COMPLIANT"}
**Summary:** ${scan.lineCount} Lines Audited | ${scan.errorCount} Errors | ${scan.warningCount} Warnings | ${scan.infoCount} Info

---

## Findings Breakdown (${scan.findings.length} total)

${scan.findings.length === 0 ? "No violations detected." : scan.findings.map((f, i) => `### ${i + 1}. [${f.severity}] Line ${f.lineNumber}: ${f.title}
- **Category:** ${f.category}
- **Message:** ${f.message}
- **Offending Code:** \`${f.excerpt || f.lineText}\`
- **Remediation Suggestion:** ${f.suggestion || "N/A"}
`).join("\n\n")}
`;
      mimeType = "text/markdown";
    }

    const blob = new Blob([contentStr], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
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
        triggerScan();
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
  }, [content, selectedRulebookId, sourceName, violatingLineNumbers, activeLine]);

  // Filtered Findings
  const filteredFindings = useMemo(() => {
    if (!scan) return [];
    return scan.findings.filter((f) => {
      if (severityFilter !== "ALL" && f.severity !== severityFilter) return false;
      if (categoryFilter !== "ALL" && f.category.toLowerCase() !== categoryFilter.toLowerCase()) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
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
            <span className="status-dot"></span>
            MongoDB Connected
          </span>
          <span className="status-badge">
            <Code2 size={13} />
            Java 21 Engine
          </span>
          <span className="status-badge">
            <BookOpen size={13} />
            {rulebooks.length} Active Rulebooks
          </span>
        </div>
      </header>

      {/* Tabs Navigation */}
      <nav className="nav-bar">
        <div className="tabs">
          <button
            className={`tab-btn ${tab === "auditor" ? "active" : ""}`}
            onClick={() => setTab("auditor")}
          >
            <FileText size={16} />
            Auditor Workspace
          </button>
          <button
            className={`tab-btn ${tab === "rulebook" ? "active" : ""}`}
            onClick={() => setTab("rulebook")}
          >
            <BookOpen size={16} />
            JSON Rulebook & Schema Studio
          </button>
          <button
            className={`tab-btn ${tab === "history" ? "active" : ""}`}
            onClick={() => setTab("history")}
          >
            <History size={16} />
            Scan History
            <span className="tab-badge">{history.length}</span>
          </button>
          <button
            className={`tab-btn ${tab === "cicd" ? "active" : ""}`}
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
        <div className="banner error">
          <AlertCircle size={18} />
          <span style={{ flex: 1 }}>{error}</span>
          <button className="btn btn-sm btn-danger" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {successBanner && (
        <div className="banner success">
          <CheckCircle2 size={18} />
          <span>{successBanner}</span>
        </div>
      )}

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
                    setScan(null);
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
            >
              <input
                type="file"
                accept=".log,.txt,.json,.yaml,.yml,.md,.csv,.conf"
                onChange={handleFileInput}
              />
              <div className="dropzone-inner">
                <UploadCloud size={28} />
                <span className="dropzone-text">
                  Drag & drop text record or log file here, or click to browse
                </span>
                <span className="dropzone-sub">
                  Supports .log, .txt, .md (framework docs), .json, .yaml, and .csv
                </span>
              </div>
            </label>

            {/* Rulebook Selection & Source Name */}
            <div className="input-row">
              <div className="form-group">
                <label>Compliance Rulebook (MongoDB)</label>
                <select
                  value={selectedRulebookId}
                  onChange={(e) => setSelectedRulebookId(e.target.value)}
                >
                  {rulebooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} (v{b.version}) - {b.rules?.length || 0} rules
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Source Record Identifier</label>
                <input
                  type="text"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
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
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
                placeholder="Paste system logs or open source framework documentation records here..."
              />
            </div>

            {/* Action Buttons */}
            <div className="action-row">
              <div className="btn-group">
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={triggerScan}
                >
                  {busy ? (
                    <>Scanning Document…</>
                  ) : (
                    <>
                      <ShieldCheck size={16} />
                      Audit Document
                    </>
                  )}
                </button>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={triggerStudioTestScan}
                  title="Audits against in-progress Studio JSON rulebook without saving to database"
                >
                  <Code2 size={15} />
                  Test with Studio Rules
                </button>
              </div>
              <button
                className="btn btn-sm"
                onClick={() => {
                  void navigator.clipboard.writeText(content);
                  setSuccessBanner("Source content copied to clipboard!");
                  setTimeout(() => setSuccessBanner(null), 2500);
                }}
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
                <button className="btn btn-primary" onClick={triggerScan}>
                  Run Compliance Scan
                </button>
              </div>
            ) : (
              <div>
                {/* Scorecard */}
                <div className={`scorecard ${scan.compliant ? "compliant" : "violations"}`}>
                  <div className={`status-badge-lg ${scan.compliant ? "pass" : "fail"}`}>
                    {scan.compliant ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
                    {scan.compliant ? "QUALITY GATE PASSED" : "VIOLATIONS DETECTED"}
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
                            )}% Quality Score`
                          : "100% Quality Score"}
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
                          title="Previous violation (Alt+P)"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={jumpToNextViolation}
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
                    {Array.from(new Set(scan.findings.map((f) => f.category))).map((cat) => (
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
                    {selectedRulebook?.name || scan.rulebookName}
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
                      >
                        <div className="finding-header">
                          <div className="finding-badges">
                            <span className={`badge-sev ${finding.severity.toLowerCase()}`}>
                              {finding.severity}
                            </span>
                            <span className="badge-cat">{finding.category}</span>
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
                          <div style={{ position: "relative" }}>
                            <div className="finding-excerpt">
                              &gt; {finding.excerpt}
                            </div>
                            <button
                              className="btn btn-sm"
                              style={{ position: "absolute", right: "6px", top: "5px", padding: "2px 6px", fontSize: "10px" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                void navigator.clipboard.writeText(finding.excerpt);
                                setSuccessBanner("Offending snippet copied!");
                                setTimeout(() => setSuccessBanner(null), 2000);
                              }}
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
                Rule Cards ({selectedRulebook?.rules?.length || 0})
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
              <button className="btn btn-sm" onClick={formatRuleJson}>
                Format
              </button>
              <button className="btn btn-sm" onClick={validateJsonAgainstSchema}>
                Validate
              </button>
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={handleSaveRulebook}>
                Save Rulebook
              </button>
              <button className="btn btn-sm btn-danger" disabled={busy} onClick={handleDeleteRulebook}>
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
                    value={selectedRulebookId}
                    onChange={(e) => setSelectedRulebookId(e.target.value)}
                  >
                    {rulebooks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} (v{b.version})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "10px 0 14px", padding: "8px 12px", background: "var(--panel-elevated)", borderRadius: "6px", border: "1px solid var(--line)" }}>
                  <Layers size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <span style={{ fontSize: "12px", color: "var(--muted)", whiteSpace: "nowrap" }}>Inherits Rules From (Extends):</span>
                  <select
                    style={{ fontSize: "12px", padding: "4px 8px", flex: 1 }}
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
                  style={{ minHeight: "480px" }}
                  value={ruleJson}
                  onChange={(e) => {
                    setRuleJson(e.target.value);
                    setSchemaValidationResult(null);
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
                    {selectedRulebook?.version ? `v${selectedRulebook.version}` : "Draft"}
                  </span>
                </div>
                <h3 style={{ margin: "0 0 6px", color: "var(--accent)" }}>
                  {selectedRulebook?.name || "Custom Rulebook"}
                </h3>
                <p style={{ color: "var(--muted)", margin: "0 0 16px" }}>
                  {selectedRulebook?.description || "No description provided."}
                </p>

                <div className="rule-cards-list">
                  {(selectedRulebook?.rules || []).map((rule) => (
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
            const rulesToDisplay = showEffectiveRules && effectiveRules.length > 0
              ? effectiveRules
              : (selectedRulebook?.rules || []);
            return (
            <div className="panel">
              <div className="panel-title">
                <h2>
                  <BookOpen size={18} />
                  Configured Compliance Rules ({rulesToDisplay.length})
                </h2>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  {selectedRulebook?.extendsRulebookId && (
                    <span className="status-badge" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Layers size={13} />
                      Extends: {selectedRulebook.extendsRulebookName || selectedRulebook.extendsRulebookId}
                    </span>
                  )}
                  {selectedRulebook?.extendsRulebookId && (
                    <button
                      className={`btn btn-sm ${showEffectiveRules ? "btn-primary" : ""}`}
                      onClick={() => setShowEffectiveRules(!showEffectiveRules)}
                      title="Toggle viewing only this rulebook's authored rules vs merged inherited rules"
                    >
                      <Layers size={13} />
                      {showEffectiveRules ? "Showing All (With Inherited)" : "Include Inherited Rules"}
                    </button>
                  )}
                  <span className="status-badge">{selectedRulebook?.name}</span>
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
                  gap: "16px",
                }}
              >
                {rulesToDisplay.map((rule) => (
                  <div key={rule.id} className="rule-card">
                    <div className="rule-card-header">
                      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                        <span className="badge-cat">{rule.category}</span>
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
                  onClick={() => {
                    if (schemaDoc) {
                      void navigator.clipboard.writeText(JSON.stringify(schemaDoc, null, 2));
                      setSuccessBanner("Schema definition copied to clipboard!");
                      setTimeout(() => setSuccessBanner(null), 2500);
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
                value={schemaDoc ? JSON.stringify(schemaDoc, null, 2) : "Loading schema..."}
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
                disabled={history.length === 0}
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
              <p>No audit scans recorded in MongoDB yet. Run a scan from the Auditor Workspace!</p>
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
                            onClick={() => {
                              void getScan(item.id).then((record) => {
                                setScan(record);
                                setContent(record.content);
                                setSourceName(record.sourceName);
                                setSelectedRulebookId(record.rulebookId);
                                setActiveLine(record.findings[0]?.lineNumber ?? null);
                                setTab("auditor");
                              });
                            }}
                          >
                            View & Highlight
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDeleteScan(item.id)}
                            title="Delete scan record from MongoDB"
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
                <label style={{ display: "block", fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                  Target Document / Spec:
                </label>
                <select
                  style={{ width: "100%", padding: "8px" }}
                  value={ciTargetFile}
                  onChange={(e) => setCiTargetFile(e.target.value)}
                >
                  <option value="samples/openapi-spec.yaml">samples/openapi-spec.yaml (OpenAPI 3.x)</option>
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
                  value={selectedRulebookId}
                  onChange={(e) => setSelectedRulebookId(e.target.value)}
                >
                  {rulebooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} (v{b.version})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                  Output Format:
                </label>
                <select
                  style={{ width: "100%", padding: "8px" }}
                  value={ciFormat}
                  onChange={(e) => setCiFormat(e.target.value as any)}
                >
                  <option value="sarif">SARIF 2.1.0 (GitHub Code Scanning)</option>
                  <option value="terminal">Terminal ANSI (Human-Readable)</option>
                  <option value="markdown">Markdown Report</option>
                  <option value="json">Full JSON Payload</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                  CI Failure Threshold:
                </label>
                <select
                  style={{ width: "100%", padding: "8px" }}
                  value={ciFailOn}
                  onChange={(e) => setCiFailOn(e.target.value as any)}
                >
                  <option value="error">Fail on ERROR only (exit code 1)</option>
                  <option value="warning">Fail on ERROR or WARNING (strict gate)</option>
                </select>
              </div>
            </div>

            {/* Generated CLI Command Box */}
            <div style={{ marginTop: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <strong style={{ fontSize: "12.5px", color: "var(--accent)" }}>
                  💻 Terminal CLI Command:
                </strong>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    const cmd = `./cli/audit.sh ${ciTargetFile} --rulebook "${selectedRulebook?.name || selectedRulebookId}" --format ${ciFormat} --fail-on ${ciFailOn}`;
                    void navigator.clipboard.writeText(cmd);
                    setCopiedCiSnippet("cli");
                    setTimeout(() => setCopiedCiSnippet(null), 2500);
                  }}
                >
                  {copiedCiSnippet === "cli" ? <Check size={13} style={{ color: "var(--pass)" }} /> : <Copy size={13} />}
                  {copiedCiSnippet === "cli" ? "Copied!" : "Copy Command"}
                </button>
              </div>
              <pre style={{ margin: 0, padding: "12px", background: "var(--panel-elevated)", borderRadius: "6px", border: "1px solid var(--line)", overflowX: "auto", fontSize: "13px", color: "#86efac" }}>
                <code>{`./cli/audit.sh ${ciTargetFile} --rulebook "${selectedRulebook?.name || selectedRulebookId}" --format ${ciFormat} --fail-on ${ciFailOn}`}</code>
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
                  onClick={() => {
                    const curlCmd = `curl -s -F "file=@${ciTargetFile}" "http://localhost:8080/api/scans/upload?rulebookId=${selectedRulebookId}" | jq .`;
                    void navigator.clipboard.writeText(curlCmd);
                    setCopiedCiSnippet("curl");
                    setTimeout(() => setCopiedCiSnippet(null), 2500);
                  }}
                >
                  {copiedCiSnippet === "curl" ? <Check size={13} style={{ color: "var(--pass)" }} /> : <Copy size={13} />}
                  {copiedCiSnippet === "curl" ? "Copied!" : "Copy cURL"}
                </button>
              </div>
              <pre style={{ margin: 0, padding: "12px", background: "var(--panel-elevated)", borderRadius: "6px", border: "1px solid var(--line)", overflowX: "auto", fontSize: "12.5px", color: "#93c5fd" }}>
                <code>{`curl -s -F "file=@${ciTargetFile}" "http://localhost:8080/api/scans/upload?rulebookId=${selectedRulebookId}" | jq .`}</code>
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
                onClick={() => {
                  const yml = `name: Document Compliance Audit

on:
  pull_request:
    branches: [ main, master ]
  push:
    branches: [ main, master ]

jobs:
  audit:
    name: Audit OpenAPI Specs & Documentation
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Set up JDK 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'

      - name: Run Document Compliance Auditor
        run: |
          chmod +x cli/audit.sh
          ./cli/audit.sh samples/openapi-spec.yaml --fail-on error --format sarif -o results.sarif

      - name: Upload SARIF to GitHub Code Scanning
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: results.sarif
          category: compliance-auditor`;
                  void navigator.clipboard.writeText(yml);
                  setCopiedCiSnippet("gha");
                  setTimeout(() => setCopiedCiSnippet(null), 2500);
                }}
              >
                {copiedCiSnippet === "gha" ? <Check size={13} /> : <Copy size={13} />}
                {copiedCiSnippet === "gha" ? "Copied Workflow YAML!" : "Copy Workflow YAML"}
              </button>
            </div>
            <p className="hint">
              This workflow executes on every commit and Pull Request. Results are converted to standard SARIF 2.1.0 and uploaded to GitHub Security / Code Scanning to display inline PR annotations.
            </p>

            <pre style={{ margin: 0, padding: "14px", background: "var(--panel-elevated)", borderRadius: "6px", border: "1px solid var(--line)", overflowX: "auto", fontSize: "12.5px", color: "var(--ink)" }}>
{`name: Document Compliance Audit

on:
  pull_request:
    branches: [ main, master ]
  push:
    branches: [ main, master ]

jobs:
  audit:
    name: Audit OpenAPI Specs & Documentation
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Run Compliance Auditor CLI
        run: |
          chmod +x cli/audit.sh
          # Audits specs and exports standard SARIF 2.1.0
          ./cli/audit.sh samples/openapi-spec.yaml --fail-on error --format sarif -o results.sarif

      - name: Upload SARIF to GitHub Code Scanning
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: results.sarif
          category: compliance-auditor`}
            </pre>
          </div>
        </div>
      )}
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

  const rawLines = useMemo(() => content.split(/\r?\n/), [content]);

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
