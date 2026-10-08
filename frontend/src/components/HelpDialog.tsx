import { useEffect, useRef } from "react";
import { ArrowRight, BookOpen, FileText, ListChecks, Download, X } from "lucide-react";
export default function HelpDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  const close = () => ref.current?.close();
  return <dialog ref={ref} className="help-dialog" onClose={onClose} aria-labelledby="help-title" onClick={event => {
    if (event.target === event.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }
  }}>
    <div className="help-heading"><img src="/teddysnow-logo.svg" width="44" height="44" alt=""/><button className="btn btn-sm" aria-label="Close help" onClick={close}><X size={18}/></button></div>
    <p className="eyebrow">FROM DOCUMENT TO ACTION</p><h2 id="help-title">Understand every finding.</h2><p className="help-lede">TeddySnow checks documentation, system logs, and API specifications against the rules you choose.</p>
    <ol className="help-steps">
      {[{icon: FileText, title: "Add your document", text: "Paste text, upload a UTF-8 file, or start with an example."}, {icon: BookOpen, title: "Choose the rulebook", text: "Use a saved policy or create, validate, and test your own rules in the Studio."}, {icon: ListChecks, title: "Inspect the findings", text: "See the exact line, severity, explanation, and suggested fix. Filter results and jump between violations."}, {icon: Download, title: "Keep a report", text: "Reopen saved scans or export JSON, Markdown, and SARIF for your workflow."}].map((step, index) => <li key={step.title}><span className="help-step-icon"><step.icon size={19}/></span><div><small>0{index + 1}</small><h3>{step.title}</h3><p>{step.text}</p></div></li>)}
    </ol>
    <p className="help-note">Checks follow configured patterns, versions, and requirements. A report's results reflect the rulebook used for that scan.</p>
    <button className="btn btn-primary" onClick={close}>Back to the workspace<ArrowRight size={16}/></button>
  </dialog>;
}
