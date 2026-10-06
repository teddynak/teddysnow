package com.teddysnow.auditor.dto;

import com.teddysnow.auditor.model.Rulebook;
import jakarta.validation.constraints.NotBlank;

public class ScanRequest {

    @NotBlank
    private String content;
    private String rulebookId;
    private String sourceName = "pasted-text";
    private Rulebook customRulebook;

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getRulebookId() {
        return rulebookId;
    }

    public void setRulebookId(String rulebookId) {
        this.rulebookId = rulebookId;
    }

    public String getSourceName() {
        return sourceName;
    }

    public void setSourceName(String sourceName) {
        this.sourceName = sourceName;
    }

    public Rulebook getCustomRulebook() {
        return customRulebook;
    }

    public void setCustomRulebook(Rulebook customRulebook) {
        this.customRulebook = customRulebook;
    }
}
