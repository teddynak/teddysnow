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

const API = "/api";

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      if (body.error) {
        message = body.error;
      } else if (body.message) {
        message = body.message;
      }
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (response.status === 204) {
    return null as unknown as T;
  }
  return (await response.json()) as T;
}

export async function listRulebooks(): Promise<Rulebook[]> {
  return parse(await fetch(`${API}/rulebooks`));
}

export async function getRulebook(id: string): Promise<Rulebook> {
  return parse(await fetch(`${API}/rulebooks/${id}`));
}

export async function saveRulebook(rulebook: Rulebook): Promise<Rulebook> {
  const method = rulebook.id ? "PUT" : "POST";
  const url = rulebook.id ? `${API}/rulebooks/${rulebook.id}` : `${API}/rulebooks`;
  return parse(
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rulebook),
    }),
  );
}

export async function deleteRulebook(id: string): Promise<void> {
  await parse(await fetch(`${API}/rulebooks/${id}`, { method: "DELETE" }));
}

export async function resetRulebooks(): Promise<Rulebook[]> {
  return parse(await fetch(`${API}/rulebooks/reset`, { method: "POST" }));
}

export async function getRulebookSchema(): Promise<RulebookJsonSchema> {
  return parse(await fetch(`${API}/rulebooks/schema`));
}

export async function scanPasted(
  content: string,
  rulebookId?: string,
  sourceName?: string,
  customRulebook?: Rulebook,
): Promise<ScanRecord> {
  return parse(
    await fetch(`${API}/scans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, rulebookId, sourceName, customRulebook }),
    }),
  );
}

export async function scanUpload(file: File, rulebookId?: string): Promise<ScanRecord> {
  const form = new FormData();
  form.append("file", file);
  const query = rulebookId ? `?rulebookId=${encodeURIComponent(rulebookId)}` : "";
  return parse(await fetch(`${API}/scans/upload${query}`, { method: "POST", body: form }));
}

export async function listScans(): Promise<ScanSummary[]> {
  return parse(await fetch(`${API}/scans`));
}

export async function getScan(id: string): Promise<ScanRecord> {
  return parse(await fetch(`${API}/scans/${id}`));
}

export async function deleteScan(id: string): Promise<void> {
  await parse(await fetch(`${API}/scans/${id}`, { method: "DELETE" }));
}

export async function clearAllScans(): Promise<void> {
  await parse(await fetch(`${API}/scans`, { method: "DELETE" }));
}

export async function getEffectiveRulebook(id: string): Promise<Rulebook> {
  return parse(await fetch(`${API}/rulebooks/${id}/effective`));
}

export async function getSarifExport(id: string): Promise<Record<string, unknown>> {
  return parse(await fetch(`${API}/scans/${id}/sarif`));
}

export function exportScanUrl(id: string, format: "sarif" | "markdown" | "json"): string {
  return `${API}/scans/${id}/export?format=${format}`;
}
