import { useEffect, useState } from "react";
import { Check, Download, FileCode, Monitor, Palette, RotateCcw, SlidersHorizontal, ArrowUpRight } from "lucide-react";
import { DEFAULT_PREFERENCES, type Preferences } from "../preferences";

interface Props {
  preferences: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
  storageError: string | null;
  apiBaseUrl: string;
  onSaveConnection: (url: string) => Promise<boolean>;
  onRefreshConnection: () => void;
  apiStatus: string;
  databaseStatus: string;
  connectionError: string | null;
  busy: boolean;
  onShowHelp: () => void;
}

export default function SettingsPanel({ preferences, onChange, storageError, apiBaseUrl, onSaveConnection, onRefreshConnection, apiStatus, databaseStatus, connectionError, busy, onShowHelp }: Props) {
  const [url, setUrl] = useState(apiBaseUrl);
  const [connectionFeedback, setConnectionFeedback] = useState<string | null>(null);
  const [connectionInputError, setConnectionInputError] = useState<string | null>(null);
  useEffect(() => setUrl(apiBaseUrl), [apiBaseUrl]);
  return (
    <div className="settings-layout">
      <div className="settings-intro">
        <div><SlidersHorizontal size={18} /><strong>Make the workspace yours</strong><p>Preferences apply immediately and are saved on this device.</p></div>
        <button className="btn" onClick={() => {
          onChange({ ...DEFAULT_PREFERENCES });
          setConnectionFeedback("Workspace preferences restored. Your API connection is unchanged.");
        }}><RotateCcw size={15} />Reset preferences</button>
      </div>
      {storageError && <div className="banner error" role="alert">{storageError}</div>}
      <div className="settings-grid">
        <section className="panel settings-card" aria-labelledby="appearance-title">
          <div className="settings-card-title"><Palette size={20} /><div><h2 id="appearance-title">Appearance</h2><p>A comfortable view for your review sessions.</p></div></div>
          <div className="setting-field"><label htmlFor="theme">Theme</label><select id="theme" value={preferences.theme} onChange={event => onChange({ theme: event.target.value as Preferences["theme"] })}><option value="dark">Dark</option><option value="light">Light</option><option value="system">Follow system</option></select></div>
          <div className="setting-field"><label htmlFor="density">Interface spacing</label><select id="density" value={preferences.density} onChange={event => onChange({ density: event.target.value as Preferences["density"] })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div>
          <div className="theme-preview" aria-hidden="true"><span/><div><i/><i/><i/></div><span/></div>
        </section>
        <section className="panel settings-card" aria-labelledby="editor-title">
          <div className="settings-card-title"><FileCode size={20} /><div><h2 id="editor-title">Document editor</h2><p>Keep documents and code easy to read.</p></div></div>
          <div className="setting-field"><label htmlFor="font-size">Editor font size</label><select id="font-size" value={preferences.editorFontSize} onChange={event => onChange({ editorFontSize: Number(event.target.value) })}>{[12, 13, 14, 16].map(size => <option key={size} value={size}>{size} px</option>)}</select></div>
          <label className="setting-toggle"><span><strong>Wrap long lines</strong><small>Applies to the editor and highlighted document.</small></span><input type="checkbox" checked={preferences.wrapLines} onChange={event => onChange({ wrapLines: event.target.checked })}/></label>
          <pre className="editor-preview">{`Framework: React 18+\npolicy: validated=true\ntransport: HTTPS`}</pre>
        </section>
        <section className="panel settings-card" aria-labelledby="audit-title">
          <div className="settings-card-title"><SlidersHorizontal size={20} /><div><h2 id="audit-title">Audit preferences</h2><p>Choose how new documents and reports behave.</p></div></div>
          <label className="setting-toggle"><span><strong>Audit after upload</strong><small>Turn off to review an uploaded document first.</small></span><input type="checkbox" checked={preferences.autoScanUploads} onChange={event => onChange({ autoScanUploads: event.target.checked })}/></label>
          <div className="setting-field"><label htmlFor="default-severity">Default findings filter</label><select id="default-severity" value={preferences.defaultSeverity} onChange={event => onChange({ defaultSeverity: event.target.value as Preferences["defaultSeverity"] })}><option value="ALL">All findings</option><option value="ERROR">Errors</option><option value="WARNING">Warnings</option><option value="INFO">Information</option></select></div>
          <div className="setting-field"><label htmlFor="default-export">Preferred report format</label><select id="default-export" value={preferences.defaultExport} onChange={event => onChange({ defaultExport: event.target.value as Preferences["defaultExport"] })}><option value="sarif">SARIF · code scanning</option><option value="markdown">Markdown · readable report</option><option value="json">JSON · structured data</option></select></div>
        </section>
        <section className="panel settings-card" aria-labelledby="connection-title">
          <div className="settings-card-title"><Monitor size={20} /><div><h2 id="connection-title">Workspace connection</h2><p>Connect this device to the auditing service.</p></div></div>
          <form onSubmit={async event => {
            event.preventDefault(); setConnectionFeedback(null); setConnectionInputError(null);
            try { const connected = await onSaveConnection(url); setConnectionFeedback(connected ? "Connection saved and checked." : "Connection saved. The service is unavailable; review the connection details below."); }
            catch (error) { setConnectionInputError(error instanceof Error ? error.message : "Could not save the connection."); }
          }}>
            <div className="setting-field"><label htmlFor="api-url">API base URL</label><input id="api-url" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={url} onChange={event => { setUrl(event.target.value); setConnectionFeedback(null); setConnectionInputError(null); }} placeholder="/api or https://your-server.example/api" aria-describedby="connection-hint"/></div>
            <p className="hint" id="connection-hint">Use /api for the local proxy, or a full API URL for another server. A separate server must allow this site's origin.</p>
            <div className="settings-connection-status"><span><i className={`status-dot ${apiStatus}`}/>{apiStatus === "connected" ? "API online" : apiStatus === "checking" ? "Checking API…" : "API unavailable"}</span><span><i className={`status-dot ${databaseStatus}`}/>{databaseStatus === "connected" ? "Database connected" : databaseStatus === "checking" ? "Checking database…" : "Database unavailable"}</span></div>
            {connectionInputError && <p className="setting-error" role="alert">{connectionInputError}</p>}
            <div className="btn-group"><button type="submit" className="btn btn-primary" disabled={busy}><Check size={15}/>Save connection</button><button type="button" className="btn" disabled={busy} onClick={onRefreshConnection}><RotateCcw size={15}/>Refresh connection</button></div>
          </form>
          {connectionError && <details className="connection-details"><summary>Connection details</summary><p>{connectionError}</p></details>}
        </section>
      </div>
      {connectionFeedback && <p className="settings-saved" role="status"><Check size={16}/>{connectionFeedback}</p>}
      <section className="panel settings-about"><img src="/teddysnow-logo.svg" alt="" width="48" height="48"/><div><h2>TeddySnow Document Auditor</h2><p>A focused workspace for rulebook-based document review. Java evaluates your selected rules; MongoDB stores rulebooks and scan history.</p></div><div className="btn-group"><button className="btn" onClick={onShowHelp}>How it works<ArrowUpRight size={14}/></button><a className="btn" href="/teddysnow-logo.svg" download="teddysnow-logo.svg"><Download size={14}/>Download logo</a></div></section>
    </div>
  );
}
