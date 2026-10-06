package com.teddysnow.auditor.model;

public class Finding {

    private String ruleId;
    private String title;
    private String message;
    private String category;
    private Severity severity;
    private int lineNumber;
    private String lineText;
    private String excerpt;
    private Integer matchStart;
    private Integer matchEnd;
    private String suggestion;

    public String getRuleId() {
        return ruleId;
    }

    public void setRuleId(String ruleId) {
        this.ruleId = ruleId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public Severity getSeverity() {
        return severity;
    }

    public void setSeverity(Severity severity) {
        this.severity = severity;
    }

    public int getLineNumber() {
        return lineNumber;
    }

    public void setLineNumber(int lineNumber) {
        this.lineNumber = lineNumber;
    }

    public String getLineText() {
        return lineText;
    }

    public void setLineText(String lineText) {
        this.lineText = lineText;
    }

    public String getExcerpt() {
        return excerpt;
    }

    public void setExcerpt(String excerpt) {
        this.excerpt = excerpt;
    }

    public Integer getMatchStart() {
        return matchStart;
    }

    public void setMatchStart(Integer matchStart) {
        this.matchStart = matchStart;
    }

    public Integer getMatchEnd() {
        return matchEnd;
    }

    public void setMatchEnd(Integer matchEnd) {
        this.matchEnd = matchEnd;
    }

    public String getSuggestion() {
        return suggestion;
    }

    public void setSuggestion(String suggestion) {
        this.suggestion = suggestion;
    }
}
