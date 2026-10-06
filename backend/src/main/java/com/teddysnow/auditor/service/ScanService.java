package com.teddysnow.auditor.service;

import com.teddysnow.auditor.model.Finding;
import com.teddysnow.auditor.model.Rulebook;
import com.teddysnow.auditor.model.ScanRecord;
import com.teddysnow.auditor.model.Severity;
import com.teddysnow.auditor.repository.ScanRecordRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
public class ScanService {

    private final ComplianceEngine complianceEngine;
    private final RulebookService rulebookService;
    private final ScanRecordRepository scanRecordRepository;
    private final SarifExporter sarifExporter;

    public ScanService(ComplianceEngine complianceEngine,
                       RulebookService rulebookService,
                       ScanRecordRepository scanRecordRepository,
                       SarifExporter sarifExporter) {
        this.complianceEngine = complianceEngine;
        this.rulebookService = rulebookService;
        this.scanRecordRepository = scanRecordRepository;
        this.sarifExporter = sarifExporter;
    }

    public ScanRecord scan(String content, String rulebookId, String sourceName, String sourceType) {
        return scan(content, rulebookId, sourceName, sourceType, null);
    }

    public ScanRecord scan(String content, String rulebookId, String sourceName, String sourceType, Rulebook customRulebook) {
        if (content == null || content.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Document content is empty");
        }
        Rulebook rulebook;
        if (customRulebook != null && customRulebook.getRules() != null && !customRulebook.getRules().isEmpty()) {
            rulebookService.validateRulebook(customRulebook);
            rulebook = customRulebook;
            if (rulebook.getId() == null || rulebook.getId().isBlank()) {
                rulebook.setId("in-memory-rulebook");
            }
        } else {
            rulebook = rulebookService.resolve(rulebookId);
        }

        List<Finding> findings = complianceEngine.evaluate(content, rulebook);

        ScanRecord record = new ScanRecord();
        record.setRulebookId(rulebook.getId());
        record.setRulebookName(rulebook.getName());
        record.setSourceName(sourceName == null || sourceName.isBlank() ? "pasted-text" : sourceName);
        record.setSourceType(sourceType == null ? "paste" : sourceType);
        record.setContent(content);
        record.setFindings(findings);
        record.setLineCount(content.split("\\R", -1).length);
        record.setErrorCount(count(findings, Severity.ERROR));
        record.setWarningCount(count(findings, Severity.WARNING));
        record.setInfoCount(count(findings, Severity.INFO));
        record.setCompliant(record.getErrorCount() == 0);
        record.setCreatedAt(Instant.now());
        return scanRecordRepository.save(record);
    }

    public List<ScanRecord> history() {
        return scanRecordRepository.findTop50ByOrderByCreatedAtDesc();
    }

    public ScanRecord get(String id) {
        return scanRecordRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Scan not found"));
    }

    public void delete(String id) {
        if (!scanRecordRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Scan not found");
        }
        scanRecordRepository.deleteById(id);
    }

    public void clearAll() {
        scanRecordRepository.deleteAll();
    }

    public Map<String, Object> exportSarif(String id) {
        ScanRecord record = get(id);
        return sarifExporter.export(record);
    }

    public String exportMarkdown(String id) {
        ScanRecord scan = get(id);
        StringBuilder sb = new StringBuilder();
        sb.append("# Structured Document Compliance Audit Report\n\n");
        sb.append("**Source:** ").append(scan.getSourceName()).append("\n");
        sb.append("**Rulebook:** ").append(scan.getRulebookName()).append("\n");
        sb.append("**Date:** ").append(scan.getCreatedAt()).append("\n");
        sb.append("**Status:** ").append(scan.isCompliant() ? "COMPLIANT" : "NON-COMPLIANT").append("\n");
        sb.append("**Summary:** ").append(scan.getLineCount()).append(" Lines Audited | ")
          .append(scan.getErrorCount()).append(" Errors | ")
          .append(scan.getWarningCount()).append(" Warnings | ")
          .append(scan.getInfoCount()).append(" Info\n\n");
        sb.append("---\n\n");
        sb.append("## Findings Breakdown (").append(scan.getFindings().size()).append(" total)\n\n");

        if (scan.getFindings().isEmpty()) {
            sb.append("No violations detected.\n");
        } else {
            for (int i = 0; i < scan.getFindings().size(); i++) {
                Finding f = scan.getFindings().get(i);
                sb.append("### ").append(i + 1).append(". [").append(f.getSeverity()).append("] Line ")
                  .append(f.getLineNumber()).append(": ").append(f.getTitle()).append("\n");
                sb.append("- **Category:** ").append(f.getCategory() == null ? "General" : f.getCategory()).append("\n");
                sb.append("- **Message:** ").append(f.getMessage()).append("\n");
                sb.append("- **Offending Code:** `").append(f.getExcerpt() != null ? f.getExcerpt() : f.getLineText()).append("`\n");
                sb.append("- **Remediation Suggestion:** ").append(f.getSuggestion() != null ? f.getSuggestion() : "N/A").append("\n\n");
            }
        }
        return sb.toString();
    }

    private int count(List<Finding> findings, Severity severity) {
        int total = 0;
        for (Finding finding : findings) {
            if (finding.getSeverity() == severity) {
                total++;
            }
        }
        return total;
    }
}
