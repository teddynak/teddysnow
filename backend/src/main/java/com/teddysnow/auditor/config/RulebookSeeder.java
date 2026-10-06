package com.teddysnow.auditor.config;

import com.teddysnow.auditor.model.ComplianceRule;
import com.teddysnow.auditor.model.RuleType;
import com.teddysnow.auditor.model.Rulebook;
import com.teddysnow.auditor.model.Severity;
import com.teddysnow.auditor.repository.RulebookRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;

@Component
public class RulebookSeeder implements CommandLineRunner {

    private final RulebookRepository rulebookRepository;

    public RulebookSeeder(RulebookRepository rulebookRepository) {
        this.rulebookRepository = rulebookRepository;
    }

    @Override
    public void run(String... args) {
        seedDefaults(false);
    }

    public void seedDefaults(boolean forceOverwrite) {
        seedLogRulebook(forceOverwrite);
        seedFrameworkDocRulebook(forceOverwrite);
        seedOpenApiRulebook(forceOverwrite);
    }

    private void seedLogRulebook(boolean forceOverwrite) {
        String name = "Platform log compliance";
        var existing = rulebookRepository.findByName(name);
        if (existing.isPresent() && !forceOverwrite) {
            return;
        }
        Rulebook rulebook = existing.orElseGet(Rulebook::new);
        rulebook.setName(name);
        rulebook.setDescription("Evaluates system logs for outdated API versions, missing request validation flags, deprecated tags, and insecure protocols.");
        rulebook.setVersion("1.2.0");
        rulebook.setSeeded(true);
        Instant now = Instant.now();
        if (rulebook.getCreatedAt() == null) {
            rulebook.setCreatedAt(now);
        }
        rulebook.setUpdatedAt(now);
        rulebook.setRules(List.of(
                apiVersionRule(),
                deprecatedTagsRule(),
                validationFlagRule(),
                tlsRule(),
                environmentRule()
        ));
        rulebookRepository.save(rulebook);
    }

    private void seedFrameworkDocRulebook(boolean forceOverwrite) {
        String name = "Open Source Framework Documentation Auditor";
        var existing = rulebookRepository.findByName(name);
        if (existing.isPresent() && !forceOverwrite) {
            return;
        }
        Rulebook rulebook = existing.orElseGet(Rulebook::new);
        rulebook.setName(name);
        rulebook.setDescription("Strict auditor for framework guides and documentation: checks for outdated framework API versions, deprecated lifecycle hooks, missing input validation flags, and insecure example links.");
        rulebook.setVersion("1.0.0");
        rulebook.setSeeded(true);
        Instant now = Instant.now();
        if (rulebook.getCreatedAt() == null) {
            rulebook.setCreatedAt(now);
        }
        rulebook.setUpdatedAt(now);
        rulebook.setRules(List.of(
                frameworkVersionRule(),
                deprecatedLifecycleRule(),
                frameworkValidationRule(),
                insecureDocExampleRule(),
                deprecatedDocTagsRule(),
                frameworkDocMetadataRule()
        ));
        rulebookRepository.save(rulebook);
    }

    private void seedOpenApiRulebook(boolean forceOverwrite) {
        String name = "API & OpenAPI Spec Compliance";
        var existing = rulebookRepository.findByName(name);
        if (existing.isPresent() && !forceOverwrite) {
            return;
        }
        Rulebook rulebook = existing.orElseGet(Rulebook::new);
        rulebook.setName(name);
        rulebook.setDescription("Audits OpenAPI/Swagger specs, API schemas, and service contract records for outdated versions, missing schema validation flags, and deprecated endpoint markers.");
        rulebook.setVersion("1.1.0");
        rulebook.setSeeded(true);
        Instant now = Instant.now();
        if (rulebook.getCreatedAt() == null) {
            rulebook.setCreatedAt(now);
        }
        rulebook.setUpdatedAt(now);
        rulebook.setRules(List.of(
                openApiVersionRule(),
                openApiValidationRule(),
                openApiDeprecatedEndpointRule(),
                openApiInsecureSchemeRule()
        ));
        rulebookRepository.save(rulebook);
    }

    // Rules for Platform Log Compliance
    private ComplianceRule apiVersionRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("outdated-api-version");
        rule.setTitle("Outdated API version");
        rule.setCategory("API");
        rule.setSeverity(Severity.ERROR);
        rule.setType(RuleType.API_VERSION);
        rule.setPattern("(?i)(?:api[_/-]?v(?:ersion)?\\s*[=:/]\\s*|api/v)([0-9]+(?:\\.[0-9]+)*)");
        rule.setMinVersion("3.0");
        rule.setMessage("API version {found} is below the required minimum {minVersion}.");
        rule.setSuggestion("Upgrade client/service endpoint configuration to API version 3.0 or higher.");
        return rule;
    }

    private ComplianceRule deprecatedTagsRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("deprecated-tags");
        rule.setTitle("Deprecated tags");
        rule.setCategory("Lifecycle");
        rule.setSeverity(Severity.WARNING);
        rule.setType(RuleType.FORBIDDEN_TOKENS);
        rule.setTokens(List.of("DEPRECATED", "@deprecated", "LEGACY", "OBSOLETE", "ARCHIVED"));
        rule.setMessage("Line contains deprecated tag '{token}'.");
        rule.setSuggestion("Decommission the legacy reference or migrate to the current active component.");
        return rule;
    }

    private ComplianceRule validationFlagRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("missing-validation-flag");
        rule.setTitle("Missing validation flag");
        rule.setCategory("Validation");
        rule.setSeverity(Severity.ERROR);
        rule.setType(RuleType.REQUIRED_WHEN);
        rule.setTriggerPattern("(?i)\\b(POST|PUT|PATCH|DELETE|WRITE|MUTATION|REQUEST)\\b");
        rule.setRequiredPattern("(?i)\\b(validated\\s*=\\s*true|validation\\s*=\\s*(enabled|true)|validate\\s*=\\s*1)\\b");
        rule.setMessage("Write/request lines must include a validation flag such as validated=true.");
        rule.setSuggestion("Ensure payload validation interceptor is active and passes validated=true flag.");
        return rule;
    }

    private ComplianceRule tlsRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("insecure-protocol");
        rule.setTitle("Insecure protocol");
        rule.setCategory("Transport");
        rule.setSeverity(Severity.ERROR);
        rule.setType(RuleType.FORBIDDEN_PATTERN);
        rule.setPattern("(?i)(?:\\bhttp://|\\btls[=:]?1\\.[01]\\b|\\bsslv?3\\b)");
        rule.setMessage("Insecure protocol detected. Use HTTPS with TLS 1.2 or newer. HTTP is forbidden.");
        rule.setSuggestion("Enforce HTTPS endpoint URLs and configure TLS 1.2+ minimum cipher suites.");
        return rule;
    }

    private ComplianceRule environmentRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("missing-environment");
        rule.setTitle("Missing environment tag");
        rule.setCategory("Metadata");
        rule.setSeverity(Severity.INFO);
        rule.setType(RuleType.DOCUMENT_REQUIRED);
        rule.setPattern("(?i)\\benv\\s*[=:]\\s*(prod|staging|dev|test)\\b");
        rule.setMessage("Document must declare env=prod|staging|dev|test at least once.");
        rule.setSuggestion("Add 'env=prod' or corresponding environment identifier to the record header.");
        return rule;
    }

    // Rules for Open Source Framework Documentation
    private ComplianceRule frameworkVersionRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("outdated-framework-version");
        rule.setTitle("Outdated framework / library version");
        rule.setCategory("API");
        rule.setSeverity(Severity.ERROR);
        rule.setType(RuleType.API_VERSION);
        rule.setPattern("(?i)(?:React|Angular|Vue|Spring\\s*Boot|Node|Express)\\s*(?:v|version)?\\s*[:=@/]?\\s*([0-9]+(?:\\.[0-9]+)*)");
        rule.setMinVersion("18.0");
        rule.setMessage("Framework version {found} is outdated; documentation standard requires {minVersion}+.");
        rule.setSuggestion("Update documentation guides to reference modern stable framework releases (e.g. React 18+).");
        return rule;
    }

    private ComplianceRule deprecatedLifecycleRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("deprecated-lifecycle-methods");
        rule.setTitle("Deprecated framework lifecycle methods");
        rule.setCategory("Lifecycle");
        rule.setSeverity(Severity.ERROR);
        rule.setType(RuleType.FORBIDDEN_TOKENS);
        rule.setTokens(List.of("componentWillMount", "componentWillReceiveProps", "componentWillUpdate", "UNSAFE_componentWillMount", "UNSAFE_componentWillReceiveProps", "getDOMNode"));
        rule.setMessage("Documentation references deprecated framework lifecycle method '{token}'.");
        rule.setSuggestion("Replace legacy lifecycle hooks with modern hooks such as useEffect() or componentDidMount().");
        return rule;
    }

    private ComplianceRule frameworkValidationRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("missing-route-validation");
        rule.setTitle("Missing input validation flag in endpoint docs");
        rule.setCategory("Validation");
        rule.setSeverity(Severity.ERROR);
        rule.setType(RuleType.REQUIRED_WHEN);
        rule.setTriggerPattern("(?i)\\b(?:app\\.(?:post|put|patch)|router\\.(?:post|put)|@PostMapping|@PutMapping|def\\s+(?:create|update)|function\\s+handle(?:Post|Update|Create))\\b");
        rule.setRequiredPattern("(?i)\\b(?:validate|schema\\.parse|zod|joi|@Valid|@Validated|validator|body\\(|check\\(|rules\\b)");
        rule.setMessage("Documented API route handler must include explicit input validation or schema parsing.");
        rule.setSuggestion("Add validation middleware or schema check (e.g., zod schema.parse(), Joi, or @Valid) to example code.");
        return rule;
    }

    private ComplianceRule insecureDocExampleRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("insecure-doc-examples");
        rule.setTitle("Insecure HTTP protocol in examples");
        rule.setCategory("Security");
        rule.setSeverity(Severity.WARNING);
        rule.setType(RuleType.FORBIDDEN_PATTERN);
        rule.setPattern("(?i)(?:http://(?:api|cdn|gateway|auth)[a-zA-Z0-9.-]*|http://localhost:\\d+|insecureSkipVerify:\\s*true)");
        rule.setMessage("Documentation example uses unencrypted HTTP URL or disables SSL verification.");
        rule.setSuggestion("Replace example links with https:// and remove insecure TLS bypass configurations.");
        return rule;
    }

    private ComplianceRule deprecatedDocTagsRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("deprecated-doc-tags");
        rule.setTitle("Deprecated framework tags");
        rule.setCategory("Lifecycle");
        rule.setSeverity(Severity.WARNING);
        rule.setType(RuleType.FORBIDDEN_TOKENS);
        rule.setTokens(List.of("@deprecated", "[DEPRECATED]", "[LEGACY]", "OBSOLETE", "@experimental-do-not-use"));
        rule.setMessage("Documentation section tagged with deprecated marker '{token}'.");
        rule.setSuggestion("Remove outdated section or add migration guide callout.");
        return rule;
    }

    private ComplianceRule frameworkDocMetadataRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("missing-doc-metadata");
        rule.setTitle("Missing framework metadata header");
        rule.setCategory("Metadata");
        rule.setSeverity(Severity.INFO);
        rule.setType(RuleType.DOCUMENT_REQUIRED);
        rule.setPattern("(?i)(?:Framework:|Documentation Version:|Target Framework:|@package|# Framework Docs)");
        rule.setMessage("Document must declare framework metadata header (e.g. 'Framework: React 18+').");
        rule.setSuggestion("Prepend document with a metadata header like '# Framework Docs | Framework: React 18'.");
        return rule;
    }

    // Rules for OpenAPI / API Spec
    private ComplianceRule openApiVersionRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("outdated-openapi-version");
        rule.setTitle("Outdated OpenAPI/Swagger specification");
        rule.setCategory("API");
        rule.setSeverity(Severity.ERROR);
        rule.setType(RuleType.API_VERSION);
        rule.setPattern("(?i)(?:openapi|swagger)\\s*[:=]\\s*['\"]?([0-9]+(?:\\.[0-9]+)*)");
        rule.setMinVersion("3.0");
        rule.setMessage("Specification version {found} is outdated; minimum required OpenAPI version is {minVersion}.");
        rule.setSuggestion("Upgrade OpenAPI definition to version 3.0.3 or 3.1.0.");
        return rule;
    }

    private ComplianceRule openApiValidationRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("missing-requestbody-validation");
        rule.setTitle("Missing schema validation flag on request payload");
        rule.setCategory("Validation");
        rule.setSeverity(Severity.ERROR);
        rule.setType(RuleType.REQUIRED_WHEN);
        rule.setTriggerPattern("(?i)\\b(?:requestBody|parameters|payload)\\s*:");
        rule.setRequiredPattern("(?i)\\b(?:required\\s*:\\s*true|schema\\s*:|type\\s*:|properties\\s*:)\\b");
        rule.setMessage("API parameter or payload specification must include a schema definition or required=true flag.");
        rule.setSuggestion("Specify 'required: true' and schema constraints for request parameters and bodies.");
        return rule;
    }

    private ComplianceRule openApiDeprecatedEndpointRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("deprecated-endpoint-flag");
        rule.setTitle("Deprecated operation in specification");
        rule.setCategory("Lifecycle");
        rule.setSeverity(Severity.WARNING);
        rule.setType(RuleType.FORBIDDEN_TOKENS);
        rule.setTokens(List.of("deprecated: true", "x-deprecated: true", "@deprecated"));
        rule.setMessage("Endpoint specification marked with deprecated flag '{token}'.");
        rule.setSuggestion("Plan decommissioning of deprecated endpoint in next major version cut.");
        return rule;
    }

    private ComplianceRule openApiInsecureSchemeRule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("insecure-api-scheme");
        rule.setTitle("Insecure HTTP scheme in API definition");
        rule.setCategory("Security");
        rule.setSeverity(Severity.ERROR);
        rule.setType(RuleType.FORBIDDEN_PATTERN);
        rule.setPattern("(?i)(?:schemes:\\s*-\\s*http\\b|url:\\s*http://)");
        rule.setMessage("API definition allows unencrypted HTTP transport scheme.");
        rule.setSuggestion("Restrict API transport scheme exclusively to HTTPS.");
        return rule;
    }
}
