package com.teddysnow.auditor.service;

import com.teddysnow.auditor.config.RulebookSeeder;
import com.teddysnow.auditor.model.ComplianceRule;
import com.teddysnow.auditor.model.RuleType;
import com.teddysnow.auditor.model.Rulebook;
import com.teddysnow.auditor.repository.RulebookRepository;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

@Service
public class RulebookService {

    private final RulebookRepository rulebookRepository;
    private final RulebookSeeder rulebookSeeder;

    public RulebookService(RulebookRepository rulebookRepository, @Lazy RulebookSeeder rulebookSeeder) {
        this.rulebookRepository = rulebookRepository;
        this.rulebookSeeder = rulebookSeeder;
    }

    public List<Rulebook> list() {
        return rulebookRepository.findAll();
    }

    public Rulebook get(String id) {
        return rulebookRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Rulebook not found"));
    }

    public Rulebook getEffectiveRulebook(String id) {
        Rulebook base = get(id);
        return resolveEffectiveHierarchy(base, new HashSet<>());
    }

    public Rulebook resolve(String id) {
        if (id == null || id.isBlank()) {
            Rulebook first = rulebookRepository.findFirstBySeededTrue()
                    .or(() -> rulebookRepository.findAll().stream().findFirst())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No rulebook is available"));
            return getEffectiveRulebook(first.getId());
        }
        return getEffectiveRulebook(id);
    }

    public Rulebook resolveEffectiveHierarchy(Rulebook current, Set<String> visited) {
        if (current == null) return null;
        if (current.getExtendsRulebookId() == null || current.getExtendsRulebookId().isBlank()) {
            return current;
        }

        if (current.getId() != null && !visited.add(current.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cyclic rulebook inheritance detected at: " + current.getName());
        }

        Rulebook parent = rulebookRepository.findById(current.getExtendsRulebookId()).orElse(null);
        if (parent == null) {
            return current;
        }

        Rulebook effectiveParent = resolveEffectiveHierarchy(parent, visited);

        Map<String, ComplianceRule> merged = new LinkedHashMap<>();
        if (effectiveParent.getRules() != null) {
            for (ComplianceRule pr : effectiveParent.getRules()) {
                if (pr == null || pr.getId() == null) continue;
                ComplianceRule copy = pr.copy();
                copy.setInherited(true);
                copy.setInheritedFrom(effectiveParent.getName());
                merged.put(copy.getId(), copy);
            }
        }

        if (current.getRules() != null) {
            for (ComplianceRule cr : current.getRules()) {
                if (cr == null || cr.getId() == null) continue;
                ComplianceRule copy = cr.copy();
                copy.setInherited(false);
                copy.setInheritedFrom(null);
                merged.put(copy.getId(), copy);
            }
        }

        Rulebook effective = new Rulebook();
        effective.setId(current.getId());
        effective.setName(current.getName());
        effective.setDescription(current.getDescription());
        effective.setVersion(current.getVersion());
        effective.setSeeded(current.isSeeded());
        effective.setExtendsRulebookId(current.getExtendsRulebookId());
        effective.setExtendsRulebookName(parent.getName());
        effective.setCreatedAt(current.getCreatedAt());
        effective.setUpdatedAt(current.getUpdatedAt());
        effective.setRules(new ArrayList<>(merged.values()));
        return effective;
    }

    public Rulebook create(Rulebook incoming) {
        incoming.setId(null);
        Instant now = Instant.now();
        incoming.setCreatedAt(now);
        incoming.setUpdatedAt(now);
        incoming.setSeeded(false);
        if (incoming.getExtendsRulebookId() != null && !incoming.getExtendsRulebookId().isBlank()) {
            rulebookRepository.findById(incoming.getExtendsRulebookId())
                    .ifPresent(p -> incoming.setExtendsRulebookName(p.getName()));
        }
        validateRulebook(incoming);
        return rulebookRepository.save(incoming);
    }

    public Rulebook update(String id, Rulebook incoming) {
        Rulebook existing = get(id);
        existing.setName(incoming.getName());
        existing.setDescription(incoming.getDescription());
        existing.setVersion(incoming.getVersion());
        existing.setRules(incoming.getRules());
        existing.setExtendsRulebookId(incoming.getExtendsRulebookId());
        if (incoming.getExtendsRulebookId() != null && !incoming.getExtendsRulebookId().isBlank()) {
            rulebookRepository.findById(incoming.getExtendsRulebookId())
                    .ifPresent(p -> existing.setExtendsRulebookName(p.getName()));
        } else {
            existing.setExtendsRulebookName(null);
        }
        existing.setUpdatedAt(Instant.now());
        validateRulebook(existing);
        return rulebookRepository.save(existing);
    }

    public void delete(String id) {
        Rulebook existing = get(id);
        rulebookRepository.delete(existing);
    }

    public List<Rulebook> resetDefaults() {
        rulebookSeeder.seedDefaults(true);
        return list();
    }

    public void validateRulebook(Rulebook rulebook) {
        List<String> errors = new ArrayList<>();

        if (rulebook == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rulebook object must not be null");
        }

        if (rulebook.getName() == null || rulebook.getName().trim().length() < 2) {
            errors.add("Rulebook 'name' is required and must be at least 2 characters");
        }

        if (rulebook.getVersion() == null || !rulebook.getVersion().matches("^[0-9]+(?:\\.[0-9]+)*$")) {
            errors.add("Rulebook 'version' is required and must be numeric semantic version (e.g. 1.0.0)");
        }

        boolean hasExtends = rulebook.getExtendsRulebookId() != null && !rulebook.getExtendsRulebookId().isBlank();
        if (hasExtends) {
            if (rulebook.getId() != null && rulebook.getId().equals(rulebook.getExtendsRulebookId())) {
                errors.add("Rulebook cannot extend itself");
            } else if (!rulebookRepository.existsById(rulebook.getExtendsRulebookId())) {
                errors.add("Extended parent rulebook with ID '" + rulebook.getExtendsRulebookId() + "' not found in database");
            }
        }

        if ((rulebook.getRules() == null || rulebook.getRules().isEmpty()) && !hasExtends) {
            errors.add("Rulebook must contain at least one compliance rule or extend a parent rulebook");
        } else if (rulebook.getRules() != null) {
            Set<String> ruleIds = new HashSet<>();
            for (int i = 0; i < rulebook.getRules().size(); i++) {
                ComplianceRule rule = rulebook.getRules().get(i);
                String prefix = "Rule #" + (i + 1);
                if (rule == null) {
                    errors.add(prefix + " cannot be null");
                    continue;
                }
                if (rule.getId() == null || !rule.getId().matches("^[a-zA-Z0-9_-]{2,60}$")) {
                    errors.add(prefix + " 'id' must be 2-60 alphanumeric characters with hyphens/underscores");
                } else if (!ruleIds.add(rule.getId())) {
                    errors.add(prefix + " duplicate rule ID: '" + rule.getId() + "'");
                }

                if (rule.getTitle() == null || rule.getTitle().isBlank()) {
                    errors.add(prefix + " ('" + rule.getId() + "'): 'title' is required");
                }
                if (rule.getSeverity() == null) {
                    errors.add(prefix + " ('" + rule.getId() + "'): 'severity' must be ERROR, WARNING, or INFO");
                }
                if (rule.getType() == null) {
                    errors.add(prefix + " ('" + rule.getId() + "'): 'type' is required");
                    continue;
                }
                if (rule.getMessage() == null || rule.getMessage().isBlank()) {
                    errors.add(prefix + " ('" + rule.getId() + "'): 'message' is required");
                }

                // Type-specific validation
                validateRuleTypeConstraints(rule, prefix, errors);
            }
        }

        if (!errors.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Strict JSON Schema validation failed: " + String.join(" | ", errors));
        }
    }

    private void validateRuleTypeConstraints(ComplianceRule rule, String prefix, List<String> errors) {
        RuleType type = rule.getType();
        switch (type) {
            case FORBIDDEN_PATTERN -> {
                if (rule.getPattern() == null || rule.getPattern().isBlank()) {
                    errors.add(prefix + ": 'pattern' regex is required for FORBIDDEN_PATTERN");
                } else {
                    checkRegex(rule.getPattern(), prefix + " pattern", errors);
                }
            }
            case FORBIDDEN_TOKENS -> {
                if (rule.getTokens() == null || rule.getTokens().isEmpty()) {
                    errors.add(prefix + ": 'tokens' array must contain at least one forbidden string");
                }
            }
            case API_VERSION -> {
                if (rule.getPattern() == null || rule.getPattern().isBlank()) {
                    errors.add(prefix + ": 'pattern' regex is required for API_VERSION");
                } else {
                    checkRegex(rule.getPattern(), prefix + " pattern", errors);
                }
                if (rule.getMinVersion() == null || rule.getMinVersion().isBlank()) {
                    errors.add(prefix + ": 'minVersion' is required for API_VERSION");
                }
            }
            case REQUIRED_WHEN -> {
                if (rule.getTriggerPattern() == null || rule.getTriggerPattern().isBlank()) {
                    errors.add(prefix + ": 'triggerPattern' regex is required for REQUIRED_WHEN");
                } else {
                    checkRegex(rule.getTriggerPattern(), prefix + " triggerPattern", errors);
                }
                if (rule.getRequiredPattern() == null || rule.getRequiredPattern().isBlank()) {
                    errors.add(prefix + ": 'requiredPattern' regex is required for REQUIRED_WHEN");
                } else {
                    checkRegex(rule.getRequiredPattern(), prefix + " requiredPattern", errors);
                }
            }
            case DOCUMENT_REQUIRED -> {
                if (rule.getPattern() == null || rule.getPattern().isBlank()) {
                    errors.add(prefix + ": 'pattern' regex is required for DOCUMENT_REQUIRED");
                } else {
                    checkRegex(rule.getPattern(), prefix + " pattern", errors);
                }
            }
        }
    }

    private void checkRegex(String pattern, String fieldName, List<String> errors) {
        try {
            Pattern.compile(pattern);
        } catch (PatternSyntaxException ex) {
            errors.add("Invalid regular expression in " + fieldName + ": " + ex.getDescription());
        }
    }

    public Map<String, Object> getSchema() {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("$schema", "https://json-schema.org/draft/2020-12/schema");
        schema.put("title", "ComplianceRulebook");
        schema.put("description", "Strict JSON Schema for Document Compliance Auditor Rulebooks");
        schema.put("type", "object");
        schema.put("required", List.of("name", "version"));

        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("id", Map.of("type", "string", "description", "MongoDB generated document ID"));
        properties.put("name", Map.of("type", "string", "minLength", 2, "maxLength", 100));
        properties.put("version", Map.of("type", "string", "pattern", "^[0-9]+(\\.[0-9]+)*$"));
        properties.put("description", Map.of("type", "string"));
        properties.put("seeded", Map.of("type", "boolean"));
        properties.put("extendsRulebookId", Map.of("type", "string", "description", "Parent rulebook ID to inherit rules from"));
        properties.put("extendsRulebookName", Map.of("type", "string", "description", "Name of parent rulebook"));

        Map<String, Object> ruleProps = new LinkedHashMap<>();
        ruleProps.put("id", Map.of("type", "string", "pattern", "^[a-zA-Z0-9_-]{2,60}$"));
        ruleProps.put("title", Map.of("type", "string"));
        ruleProps.put("message", Map.of("type", "string"));
        ruleProps.put("suggestion", Map.of("type", "string"));
        ruleProps.put("category", Map.of("type", "string"));
        ruleProps.put("severity", Map.of("type", "string", "enum", List.of("ERROR", "WARNING", "INFO")));
        ruleProps.put("type", Map.of("type", "string", "enum",
                List.of("API_VERSION", "FORBIDDEN_PATTERN", "FORBIDDEN_TOKENS", "REQUIRED_WHEN", "DOCUMENT_REQUIRED")));
        ruleProps.put("enabled", Map.of("type", "boolean", "default", true));
        ruleProps.put("pattern", Map.of("type", "string", "description", "Java regular expression"));
        ruleProps.put("triggerPattern", Map.of("type", "string", "description", "Regex that triggers requirement"));
        ruleProps.put("requiredPattern", Map.of("type", "string", "description", "Regex that must be present"));
        ruleProps.put("minVersion", Map.of("type", "string", "description", "Semantic minimum version"));
        ruleProps.put("tokens", Map.of("type", "array", "items", Map.of("type", "string")));

        Map<String, Object> rulesArray = new LinkedHashMap<>();
        rulesArray.put("type", "array");
        rulesArray.put("minItems", 1);
        rulesArray.put("items", Map.of(
                "type", "object",
                "required", List.of("id", "title", "severity", "type", "message"),
                "properties", ruleProps
        ));

        properties.put("rules", rulesArray);
        schema.put("properties", properties);
        return schema;
    }
}
