package com.teddysnow.auditor.service;

import com.teddysnow.auditor.model.ComplianceRule;
import com.teddysnow.auditor.model.Finding;
import com.teddysnow.auditor.model.RuleType;
import com.teddysnow.auditor.model.Rulebook;
import com.teddysnow.auditor.model.Severity;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ComplianceEngineTest {

    private final ComplianceEngine engine = new ComplianceEngine();

    @Test
    void highlightsOutdatedApiMissingValidationAndDeprecatedTags() {
        Rulebook rulebook = new Rulebook();
        rulebook.setRules(List.of(apiRule(), validationRule(), deprecatedRule()));

        String content = """
                env=prod
                GET /health api/v3.1
                POST /users api/v1 validated=false
                WRITE inventory LEGACY endpoint
                """;

        List<Finding> findings = engine.evaluate(content, rulebook);
        assertTrue(findings.stream().anyMatch(f -> f.getRuleId().equals("api") && f.getLineNumber() == 3));
        assertTrue(findings.stream().anyMatch(f -> f.getRuleId().equals("validation") && f.getLineNumber() == 3));
        assertTrue(findings.stream().anyMatch(f -> f.getRuleId().equals("deprecated") && f.getLineNumber() == 4));
        assertFalse(findings.stream().anyMatch(f -> f.getLineNumber() == 2));

        Finding findingWithSuggestion = findings.stream().filter(f -> f.getRuleId().equals("api")).findFirst().orElseThrow();
        assertEquals("Upgrade API", findingWithSuggestion.getSuggestion());
    }

    @Test
    void auditsFrameworkDocumentationForDeprecatedLifecycleAndInsecureUrls() {
        ComplianceRule lifecycleRule = new ComplianceRule();
        lifecycleRule.setId("deprecated-lifecycle");
        lifecycleRule.setTitle("Deprecated Lifecycle");
        lifecycleRule.setSeverity(Severity.ERROR);
        lifecycleRule.setType(RuleType.FORBIDDEN_TOKENS);
        lifecycleRule.setTokens(List.of("componentWillMount", "UNSAFE_componentWillMount"));
        lifecycleRule.setMessage("Deprecated lifecycle method {token} found.");
        lifecycleRule.setSuggestion("Migrate to useEffect hook.");

        ComplianceRule insecureRule = new ComplianceRule();
        insecureRule.setId("insecure-url");
        insecureRule.setTitle("Insecure Protocol");
        insecureRule.setSeverity(Severity.ERROR);
        insecureRule.setType(RuleType.FORBIDDEN_PATTERN);
        insecureRule.setPattern("(?i)http://");
        insecureRule.setMessage("HTTP is not allowed in documentation examples.");
        insecureRule.setSuggestion("Use HTTPS.");

        Rulebook docRulebook = new Rulebook();
        docRulebook.setRules(List.of(lifecycleRule, insecureRule));

        String frameworkDoc = """
                # React Guide
                class UserProfile extends React.Component {
                  componentWillMount() {
                    fetch("http://api.domain.com/user");
                  }
                }
                """;

        List<Finding> findings = engine.evaluate(frameworkDoc, docRulebook);
        assertEquals(2, findings.size());
        assertEquals(3, findings.get(0).getLineNumber());
        assertEquals("deprecated-lifecycle", findings.get(0).getRuleId());
        assertEquals("Migrate to useEffect hook.", findings.get(0).getSuggestion());

        assertEquals(4, findings.get(1).getLineNumber());
        assertEquals("insecure-url", findings.get(1).getRuleId());
    }

    private ComplianceRule apiRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("api");
        rule.setTitle("API");
        rule.setSeverity(Severity.ERROR);
        rule.setType(RuleType.API_VERSION);
        rule.setPattern("(?i)api/v([0-9]+(?:\\.[0-9]+)*)");
        rule.setMinVersion("3.0");
        rule.setMessage("API {found} < {minVersion}");
        rule.setSuggestion("Upgrade API");
        return rule;
    }

    private ComplianceRule validationRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("validation");
        rule.setTitle("Validation");
        rule.setSeverity(Severity.ERROR);
        rule.setType(RuleType.REQUIRED_WHEN);
        rule.setTriggerPattern("(?i)\\b(POST|WRITE)\\b");
        rule.setRequiredPattern("(?i)validated\\s*=\\s*true");
        rule.setMessage("missing validation");
        return rule;
    }

    private ComplianceRule deprecatedRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("deprecated");
        rule.setTitle("Deprecated");
        rule.setSeverity(Severity.WARNING);
        rule.setType(RuleType.FORBIDDEN_TOKENS);
        rule.setTokens(List.of("LEGACY"));
        rule.setMessage("tag {token}");
        return rule;
    }
}
