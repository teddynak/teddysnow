package com.teddysnow.auditor.dto;

import com.teddysnow.auditor.model.ScanRecord;

public class ScanSummary {

    private String id;
    private String sourceName;
    private String rulebookName;
    private boolean compliant;
    private int errorCount;
    private int warningCount;
    private int infoCount;
    private int lineCount;
    private String createdAt;

    public static ScanSummary from(ScanRecord record) {
        ScanSummary summary = new ScanSummary();
        summary.id = record.getId();
        summary.sourceName = record.getSourceName();
        summary.rulebookName = record.getRulebookName();
        summary.compliant = record.isCompliant();
        summary.errorCount = record.getErrorCount();
        summary.warningCount = record.getWarningCount();
        summary.infoCount = record.getInfoCount();
        summary.lineCount = record.getLineCount();
        summary.createdAt = record.getCreatedAt() == null ? null : record.getCreatedAt().toString();
        return summary;
    }

    public String getId() {
        return id;
    }

    public String getSourceName() {
        return sourceName;
    }

    public String getRulebookName() {
        return rulebookName;
    }

    public boolean isCompliant() {
        return compliant;
    }

    public int getErrorCount() {
        return errorCount;
    }

    public int getWarningCount() {
        return warningCount;
    }

    public int getInfoCount() {
        return infoCount;
    }

    public int getLineCount() {
        return lineCount;
    }

    public String getCreatedAt() {
        return createdAt;
    }
}
