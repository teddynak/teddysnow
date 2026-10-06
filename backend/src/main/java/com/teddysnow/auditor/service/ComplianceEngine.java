package com.teddysnow.auditor.service;

import com.teddysnow.auditor.model.ComplianceRule;
import com.teddysnow.auditor.model.Finding;
import com.teddysnow.auditor.model.Rulebook;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

@Component
public class ComplianceEngine {

    private final Map<String, Pattern> patternCache = new ConcurrentHashMap<>();

    public List<Finding> evaluate(String content, Rulebook rulebook) {
        String[] lines = content.split("\\R", -1);
        List<Finding> findings = new ArrayList<>();
        for (ComplianceRule rule : rulebook.getRules()) {
            if (rule == null || !rule.isEnabled() || rule.getType() == null) {
                continue;
            }
            try {
                switch (rule.getType()) {
                    case FORBIDDEN_PATTERN -> findings.addAll(scanForbiddenPattern(lines, rule));
                    case FORBIDDEN_TOKENS -> findings.addAll(scanForbiddenTokens(lines, rule));
                    case API_VERSION -> findings.addAll(scanApiVersion(lines, rule));
                    case REQUIRED_WHEN -> findings.addAll(scanRequiredWhen(lines, rule));
                    case DOCUMENT_REQUIRED -> findings.addAll(scanDocumentRequired(lines, rule));
                    default -> {
                    }
                }
            } catch (PatternSyntaxException ex) {
                findings.add(documentFinding(rule, "Rule '" + rule.getId() + "' has an invalid regular expression: "
                        + ex.getDescription()));
            }
        }
        findings.sort((a, b) -> {
            int line = Integer.compare(a.getLineNumber(), b.getLineNumber());
            if (line != 0) {
                return line;
            }
            return a.getSeverity().compareTo(b.getSeverity());
        });
        return findings;
    }

    private List<Finding> scanForbiddenPattern(String[] lines, ComplianceRule rule) {
        Pattern pattern = compile(rule.getPattern());
        List<Finding> findings = new ArrayList<>();
        for (int i = 0; i < lines.length; i++) {
            Matcher matcher = pattern.matcher(lines[i]);
            if (matcher.find()) {
                findings.add(lineFinding(rule, i + 1, lines[i], matcher.start(), matcher.end(), rule.getMessage()));
            }
        }
        return findings;
    }

    private List<Finding> scanForbiddenTokens(String[] lines, ComplianceRule rule) {
        List<Finding> findings = new ArrayList<>();
        List<String> tokens = rule.getTokens() == null ? List.of() : rule.getTokens();
        if (tokens.isEmpty()) {
            return findings;
        }
        record NormalizedToken(String raw, String lower) {}
        List<NormalizedToken> normalized = tokens.stream()
                .filter(t -> t != null && !t.isBlank())
                .map(t -> new NormalizedToken(t, t.toLowerCase(Locale.ROOT)))
                .toList();
        if (normalized.isEmpty()) {
            return findings;
        }
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            String lower = line.toLowerCase(Locale.ROOT);
            for (NormalizedToken token : normalized) {
                int index = lower.indexOf(token.lower());
                if (index >= 0) {
                    findings.add(lineFinding(rule, i + 1, line, index, index + token.raw().length(),
                            interpolate(rule.getMessage(), "{token}", token.raw())));
                    break;
                }
            }
        }
        return findings;
    }

    private List<Finding> scanApiVersion(String[] lines, ComplianceRule rule) {
        Pattern pattern = compile(rule.getPattern());
        String minVersion = rule.getMinVersion() == null ? "1.0" : rule.getMinVersion();
        List<Finding> findings = new ArrayList<>();
        for (int i = 0; i < lines.length; i++) {
            Matcher matcher = pattern.matcher(lines[i]);
            if (!matcher.find()) {
                continue;
            }
            String found = matcher.groupCount() >= 1 ? matcher.group(1) : matcher.group();
            if (found == null) {
                continue;
            }
            if (VersionComparator.compare(found, minVersion) < 0) {
                String message = interpolate(interpolate(rule.getMessage(), "{found}", found), "{minVersion}", minVersion);
                findings.add(lineFinding(rule, i + 1, lines[i], matcher.start(), matcher.end(), message));
            }
        }
        return findings;
    }

    private List<Finding> scanRequiredWhen(String[] lines, ComplianceRule rule) {
        Pattern trigger = compile(rule.getTriggerPattern());
        Pattern required = compile(rule.getRequiredPattern());
        List<Finding> findings = new ArrayList<>();
        for (int i = 0; i < lines.length; i++) {
            Matcher triggerMatcher = trigger.matcher(lines[i]);
            if (triggerMatcher.find() && !required.matcher(lines[i]).find()) {
                findings.add(lineFinding(rule, i + 1, lines[i], triggerMatcher.start(), triggerMatcher.end(),
                        rule.getMessage()));
            }
        }
        return findings;
    }

    private List<Finding> scanDocumentRequired(String[] lines, ComplianceRule rule) {
        Pattern pattern = compile(rule.getPattern());
        for (String line : lines) {
            if (pattern.matcher(line).find()) {
                return List.of();
            }
        }
        String first = lines.length == 0 ? "" : lines[0];
        return List.of(lineFinding(rule, 1, first, 0, Math.min(first.length(), 1), rule.getMessage()));
    }

    private Finding lineFinding(ComplianceRule rule, int lineNumber, String lineText, int start, int end, String message) {
        Finding finding = new Finding();
        finding.setRuleId(rule.getId());
        finding.setTitle(rule.getTitle());
        finding.setCategory(rule.getCategory());
        finding.setSeverity(rule.getSeverity());
        finding.setLineNumber(lineNumber);
        finding.setLineText(lineText);
        finding.setMatchStart(Math.max(start, 0));
        finding.setMatchEnd(Math.max(end, start));
        finding.setExcerpt(safeExcerpt(lineText, start, end));
        finding.setMessage(message);
        finding.setSuggestion(rule.getSuggestion());
        return finding;
    }

    private Finding documentFinding(ComplianceRule rule, String message) {
        Finding finding = new Finding();
        finding.setRuleId(rule.getId());
        finding.setTitle(rule.getTitle());
        finding.setCategory(rule.getCategory());
        finding.setSeverity(rule.getSeverity());
        finding.setLineNumber(1);
        finding.setLineText("");
        finding.setMatchStart(0);
        finding.setMatchEnd(0);
        finding.setExcerpt("");
        finding.setMessage(message);
        finding.setSuggestion(rule.getSuggestion());
        return finding;
    }

    private Pattern compile(String expression) {
        if (expression == null || expression.isBlank()) {
            throw new PatternSyntaxException("empty pattern", expression, -1);
        }
        return patternCache.computeIfAbsent(expression, Pattern::compile);
    }

    private String interpolate(String template, String token, String value) {
        if (template == null) {
            return "";
        }
        return template.replace(token, value == null ? "" : value);
    }

    private String safeExcerpt(String line, int start, int end) {
        if (line == null || line.isEmpty()) {
            return "";
        }
        int from = Math.max(0, Math.min(start, line.length()));
        int to = Math.max(from, Math.min(end, line.length()));
        return line.substring(from, to);
    }
}
