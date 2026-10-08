package com.teddysnow.auditor.service;

import com.teddysnow.auditor.model.Finding;
import com.teddysnow.auditor.model.ScanRecord;
import com.teddysnow.auditor.model.Severity;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.*;

@Component
public class SarifExporter {

    public static final String SARIF_SCHEMA = "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json";
    public static final String SARIF_VERSION = "2.1.0";

    public Map<String, Object> export(ScanRecord scan) {
        Map<String, Object> sarif = new LinkedHashMap<>();
        sarif.put("$schema", SARIF_SCHEMA);
        sarif.put("version", SARIF_VERSION);

        List<Map<String, Object>> runs = new ArrayList<>();
        runs.add(buildRun(scan));
        sarif.put("runs", runs);

        return sarif;
    }

    private Map<String, Object> buildRun(ScanRecord scan) {
        Map<String, Object> run = new LinkedHashMap<>();

        // Tool Driver
        Map<String, Object> tool = new LinkedHashMap<>();
        Map<String, Object> driver = new LinkedHashMap<>();
        driver.put("name", "Structured Document Compliance Auditor");
        driver.put("version", "1.0.0");
        driver.put("informationUri", "https://github.com/teddynak/teddysnow");

        // Rules dictionary extracted from findings
        Map<String, Map<String, Object>> ruleDefinitions = new LinkedHashMap<>();
        List<Map<String, Object>> results = new ArrayList<>();

        String targetUri = (scan.getSourceName() != null && !scan.getSourceName().isBlank())
                ? scan.getSourceName()
                : "document.txt";

        if (scan.getFindings() != null) {
            for (Finding finding : scan.getFindings()) {
                // Register rule definition if not yet present
                if (!ruleDefinitions.containsKey(finding.getRuleId())) {
                    Map<String, Object> ruleDef = new LinkedHashMap<>();
                    ruleDef.put("id", finding.getRuleId());
                    ruleDef.put("name", finding.getTitle() != null ? finding.getTitle() : finding.getRuleId());
                    ruleDef.put("shortDescription", Map.of("text", finding.getTitle() != null && !finding.getTitle().isBlank() ? finding.getTitle() : finding.getRuleId()));
                    ruleDef.put("fullDescription", Map.of("text", finding.getMessage() != null && !finding.getMessage().isBlank() ? finding.getMessage() : "Rule violation"));
                    if (finding.getSuggestion() != null && !finding.getSuggestion().isBlank()) {
                        ruleDef.put("help", Map.of("text", finding.getSuggestion()));
                    }
                    ruleDef.put("defaultConfiguration", Map.of("level", toSarifLevel(finding.getSeverity())));
                    if (finding.getCategory() != null) {
                        ruleDef.put("properties", Map.of("category", finding.getCategory()));
                    }
                    ruleDefinitions.put(finding.getRuleId(), ruleDef);
                }

                // Register result
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("ruleId", finding.getRuleId());
                result.put("level", toSarifLevel(finding.getSeverity()));
                result.put("message", Map.of("text", finding.getMessage() != null ? finding.getMessage() : "Violation detected"));

                // Location with exact line and column offsets
                int line = Math.max(1, finding.getLineNumber());
                int startCol = Math.max(1, finding.getMatchStart() != null ? finding.getMatchStart() + 1 : 1);

                Map<String, Object> region = new LinkedHashMap<>();
                region.put("startLine", line);
                if (finding.getMatchStart() != null) region.put("startColumn", startCol);
                if (finding.getMatchEnd() != null && finding.getMatchEnd() + 1 > startCol) {
                    region.put("endColumn", finding.getMatchEnd() + 1);
                }
                if (finding.getExcerpt() != null && !finding.getExcerpt().isBlank()) {
                    region.put("snippet", Map.of("text", finding.getExcerpt()));
                }

                Map<String, Object> physicalLocation = new LinkedHashMap<>();
                physicalLocation.put("artifactLocation", Map.of("uri", artifactUri(targetUri)));
                physicalLocation.put("region", region);

                result.put("locations", List.of(Map.of("physicalLocation", physicalLocation)));

                // Suggestions describe remediation; they are not executable SARIF artifact edits.
                if (finding.getSuggestion() != null && !finding.getSuggestion().isBlank()) {
                    result.put("properties", Map.of("remediation", finding.getSuggestion()));
                }

                results.add(result);
            }
        }

        driver.put("rules", new ArrayList<>(ruleDefinitions.values()));
        tool.put("driver", driver);
        run.put("tool", tool);

        // Automation details & scan metadata
        run.put("automationDetails", Map.of(
                "id", "compliance/" + artifactUri(scan.getRulebookName() != null ? scan.getRulebookName() : "Default") + "/" + artifactUri(targetUri) + "/",
                "description", Map.of("text", "Rulebook: " + (scan.getRulebookName() != null ? scan.getRulebookName() : "Default"))
        ));

        run.put("results", results);
        return run;
    }

    private String artifactUri(String path) {
        try {
            return new URI(null, null, path.replace('\\', '/'), null, null).toASCIIString();
        } catch (URISyntaxException error) {
            throw new IllegalArgumentException("Invalid document path", error);
        }
    }

    private String toSarifLevel(Severity severity) {
        if (severity == null) return "error";
        return switch (severity) {
            case ERROR -> "error";
            case WARNING -> "warning";
            case INFO -> "note";
        };
    }
}
