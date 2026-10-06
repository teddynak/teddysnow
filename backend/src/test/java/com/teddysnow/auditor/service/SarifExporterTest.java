package com.teddysnow.auditor.service;

import com.teddysnow.auditor.model.Finding;
import com.teddysnow.auditor.model.ScanRecord;
import com.teddysnow.auditor.model.Severity;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class SarifExporterTest {

    private final SarifExporter exporter = new SarifExporter();

    @Test
    void exportsValidSarifStructure() {
        ScanRecord scan = new ScanRecord();
        scan.setId("scan-123");
        scan.setSourceName("openapi.yaml");
        scan.setRulebookName("API Compliance");

        Finding f = new Finding();
        f.setRuleId("outdated-api");
        f.setTitle("Outdated API");
        f.setMessage("OpenAPI 2.0 is deprecated");
        f.setSeverity(Severity.ERROR);
        f.setLineNumber(5);
        f.setMatchStart(0);
        f.setMatchEnd(11);
        f.setExcerpt("swagger: 2.0");
        f.setSuggestion("Upgrade to OpenAPI 3.1.0");
        f.setCategory("API");
        scan.setFindings(List.of(f));

        Map<String, Object> sarif = exporter.export(scan);

        assertEquals("2.1.0", sarif.get("version"));
        assertNotNull(sarif.get("$schema"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> runs = (List<Map<String, Object>>) sarif.get("runs");
        assertNotNull(runs);
        assertEquals(1, runs.size());

        Map<String, Object> run = runs.get(0);
        @SuppressWarnings("unchecked")
        Map<String, Object> tool = (Map<String, Object>) run.get("tool");
        @SuppressWarnings("unchecked")
        Map<String, Object> driver = (Map<String, Object>) tool.get("driver");
        assertEquals("Structured Document Compliance Auditor", driver.get("name"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> results = (List<Map<String, Object>>) run.get("results");
        assertEquals(1, results.size());
        Map<String, Object> result = results.get(0);
        assertEquals("outdated-api", result.get("ruleId"));
        assertEquals("error", result.get("level"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> locations = (List<Map<String, Object>>) result.get("locations");
        assertEquals(1, locations.size());
        @SuppressWarnings("unchecked")
        Map<String, Object> phys = (Map<String, Object>) locations.get(0).get("physicalLocation");
        @SuppressWarnings("unchecked")
        Map<String, Object> region = (Map<String, Object>) phys.get("region");
        assertEquals(5, region.get("startLine"));
        assertEquals(1, region.get("startColumn"));
        assertEquals(12, region.get("endColumn"));
    }
}
