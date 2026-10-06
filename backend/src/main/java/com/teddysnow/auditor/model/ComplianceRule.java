package com.teddysnow.auditor.model;

import java.util.ArrayList;
import java.util.List;

public class ComplianceRule {

    private String id;
    private String title;
    private String message;
    private String category;
    private Severity severity = Severity.ERROR;
    private RuleType type;
    private boolean enabled = true;
    private String pattern;
    private String triggerPattern;
    private String requiredPattern;
    private String minVersion;
    private String suggestion;
    private boolean inherited;
    private String inheritedFrom;
    private List<String> tokens = new ArrayList<>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
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

    public RuleType getType() {
        return type;
    }

    public void setType(RuleType type) {
        this.type = type;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getPattern() {
        return pattern;
    }

    public void setPattern(String pattern) {
        this.pattern = pattern;
    }

    public String getTriggerPattern() {
        return triggerPattern;
    }

    public void setTriggerPattern(String triggerPattern) {
        this.triggerPattern = triggerPattern;
    }

    public String getRequiredPattern() {
        return requiredPattern;
    }

    public void setRequiredPattern(String requiredPattern) {
        this.requiredPattern = requiredPattern;
    }

    public String getMinVersion() {
        return minVersion;
    }

    public void setMinVersion(String minVersion) {
        this.minVersion = minVersion;
    }

    public List<String> getTokens() {
        return tokens;
    }

    public void setTokens(List<String> tokens) {
        this.tokens = tokens == null ? new ArrayList<>() : tokens;
    }

    public String getSuggestion() {
        return suggestion;
    }

    public void setSuggestion(String suggestion) {
        this.suggestion = suggestion;
    }

    public boolean isInherited() {
        return inherited;
    }

    public void setInherited(boolean inherited) {
        this.inherited = inherited;
    }

    public String getInheritedFrom() {
        return inheritedFrom;
    }

    public void setInheritedFrom(String inheritedFrom) {
        this.inheritedFrom = inheritedFrom;
    }

    public ComplianceRule copy() {
        ComplianceRule c = new ComplianceRule();
        c.setId(this.id);
        c.setTitle(this.title);
        c.setMessage(this.message);
        c.setCategory(this.category);
        c.setSeverity(this.severity);
        c.setType(this.type);
        c.setEnabled(this.enabled);
        c.setPattern(this.pattern);
        c.setTriggerPattern(this.triggerPattern);
        c.setRequiredPattern(this.requiredPattern);
        c.setMinVersion(this.minVersion);
        c.setSuggestion(this.suggestion);
        c.setInherited(this.inherited);
        c.setInheritedFrom(this.inheritedFrom);
        c.setTokens(this.tokens == null ? new ArrayList<>() : new ArrayList<>(this.tokens));
        return c;
    }
}
