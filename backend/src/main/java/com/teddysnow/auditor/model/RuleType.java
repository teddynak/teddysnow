package com.teddysnow.auditor.model;

public enum RuleType {
    /** Line is a violation if it matches pattern. */
    FORBIDDEN_PATTERN,
    /** Extract a version from the line and fail if it is below minVersion. */
    API_VERSION,
    /** If triggerPattern matches the line, requiredPattern must also match. */
    REQUIRED_WHEN,
    /** Pattern must appear at least once in the whole document. */
    DOCUMENT_REQUIRED,
    /** Line must not contain any of the listed tokens (deprecated tags). */
    FORBIDDEN_TOKENS
}
