package com.teddysnow.auditor.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Document(collection = "rulebooks")
public class Rulebook {

    @Id
    private String id;
    private String name;
    private String description;
    private String version;
    private boolean seeded;
    private String extendsRulebookId;
    private String extendsRulebookName;
    private Instant createdAt;
    private Instant updatedAt;
    private List<ComplianceRule> rules = new ArrayList<>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public boolean isSeeded() {
        return seeded;
    }

    public void setSeeded(boolean seeded) {
        this.seeded = seeded;
    }

    public String getExtendsRulebookId() {
        return extendsRulebookId;
    }

    public void setExtendsRulebookId(String extendsRulebookId) {
        this.extendsRulebookId = extendsRulebookId;
    }

    public String getExtendsRulebookName() {
        return extendsRulebookName;
    }

    public void setExtendsRulebookName(String extendsRulebookName) {
        this.extendsRulebookName = extendsRulebookName;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public List<ComplianceRule> getRules() {
        return rules;
    }

    public void setRules(List<ComplianceRule> rules) {
        this.rules = rules == null ? new ArrayList<>() : rules;
    }
}
