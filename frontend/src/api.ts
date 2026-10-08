export type Severity = "ERROR" | "WARNING" | "INFO";

export type RuleType =
  | "FORBIDDEN_PATTERN"
  | "API_VERSION"
  | "REQUIRED_WHEN"
  | "DOCUMENT_REQUIRED"
  | "FORBIDDEN_TOKENS";

export interface ComplianceRule {
  id: string;
  title: string;
  message: string;
  suggestion?: string;
  category: string;
  severity: Severity;
  type: RuleType;
  enabled: boolean;
  pattern?: string;
  triggerPattern?: string;
  requiredPattern?: string;
  minVersion?: string;
  tokens?: string[];
  inherited?: boolean;
  inheritedFrom?: string;
}

export interface Rulebook {
  id?: string;
  name: string;
  description: string;
  version: string;
  seeded?: boolean;
  extendsRulebookId?: string;
  extendsRulebookName?: string;
  createdAt?: string;
  updatedAt?: string;
  rules: ComplianceRule[];
}

export interface Finding {
  ruleId: string;
  title: string;
  message: string;
  suggestion?: string;
  category: string;
  severity: Severity;
  lineNumber: number;
  lineText: string;
  excerpt: string;
  matchStart: number;
  matchEnd: number;
}

export interface ScanRecord {
  id: string;
  rulebookId: string;
  rulebookName: string;
  sourceName: string;
  sourceType: string;
  content: string;
  compliant: boolean;
  lineCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  createdAt: string;
  findings: Finding[];
}

export interface ScanSummary {
  id: string;
  sourceName: string;
  rulebookName: string;
  compliant: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  lineCount: number;
  createdAt: string;
}

export interface JsonSchemaProperty {
  type?: string;
  description?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  enum?: string[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface RulebookJsonSchema {
  $schema?: string;
  title?: string;
  description?: string;
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchemaProperty>;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "ApiError"; }
}

export const API = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

async function checkedResponse<T>(path: string, init: RequestInit | undefined, read: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${API}${path}`, { ...init, signal: controller.signal });
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      if (response.status === 413) message = "The file is too large. Maximum upload size is 8 MB.";
      try {
        const body = await response.json() as { error?: string; message?: string };
        message = body.message || body.error || message;
      } catch { /* A proxy may return an empty or HTML error page. */ }
      throw new ApiError(message, response.status);
    }
    return await read(response);
  } catch (error) {
    if (controller.signal.aborted) throw new ApiError("The backend took too long to respond. Check the API and database, then retry.", 0);
    if (error instanceof TypeError) throw new ApiError("Cannot reach the backend. Check that the API is running and the API URL is configured correctly.", 0);
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return checkedResponse(path, init, async response => {
    const text = await response.text();
    if (!text) return undefined as T;
    try { return JSON.parse(text) as T; }
    catch { throw new ApiError("The server returned an unexpected response. Check the API URL and proxy configuration.", 0); }
  });
}

const jsonBody = (body: unknown, method = "POST"): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const idPath = (id: string) => encodeURIComponent(id);

export const getHealth = () => request<{ status: string }>("/health");
export const listRulebooks = () => request<Rulebook[]>("/rulebooks");
export const getRulebook = (id: string) => request<Rulebook>(`/rulebooks/${idPath(id)}`);
export const getEffectiveRulebook = (id: string) => request<Rulebook>(`/rulebooks/${idPath(id)}/effective`);
export const validateRulebook = (rulebook: Rulebook) => request<Rulebook>("/rulebooks/validate", jsonBody(rulebook));
export const saveRulebook = (rulebook: Rulebook) => request<Rulebook>(
  rulebook.id ? `/rulebooks/${idPath(rulebook.id)}` : "/rulebooks",
  jsonBody(rulebook, rulebook.id ? "PUT" : "POST"),
);
export const deleteRulebook = (id: string) => request<void>(`/rulebooks/${idPath(id)}`, { method: "DELETE" });
export const resetRulebooks = () => request<Rulebook[]>("/rulebooks/reset", { method: "POST" });
export const getRulebookSchema = () => request<RulebookJsonSchema>("/rulebooks/schema");

export const scanPasted = (content: string, rulebookId?: string, sourceName?: string, customRulebook?: Rulebook) =>
  request<ScanRecord>("/scans", jsonBody({ content, rulebookId, sourceName, customRulebook }));

export function scanUpload(file: File, rulebookId?: string): Promise<ScanRecord> {
  const form = new FormData();
  form.append("file", file);
  const query = rulebookId ? `?rulebookId=${encodeURIComponent(rulebookId)}` : "";
  return request(`/scans/upload${query}`, { method: "POST", body: form });
}

export const listScans = () => request<ScanSummary[]>("/scans");
export const getScan = (id: string) => request<ScanRecord>(`/scans/${idPath(id)}`);
export const deleteScan = (id: string) => request<void>(`/scans/${idPath(id)}`, { method: "DELETE" });
export const clearAllScans = () => request<void>("/scans", { method: "DELETE" });
export const getSarifExport = (id: string) => request<Record<string, unknown>>(`/scans/${idPath(id)}/sarif`);
export const exportScanUrl = (id: string, format: "sarif" | "markdown" | "json") =>
  `${API}/scans/${idPath(id)}/export?format=${format}`;
export const downloadScanReport = async (id: string, format: "sarif" | "markdown" | "json") =>
  checkedResponse(`/scans/${idPath(id)}/export?format=${format}`, undefined, response => response.blob());
