package com.teddysnow.auditor.service;

import com.teddysnow.auditor.model.*;
import com.teddysnow.auditor.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RulebookIntegrationTest {
    private Rulebook book(String id, String name, String parent) {
        Rulebook book = new Rulebook();
        book.setId(id); book.setName(name); book.setVersion("1.0.0"); book.setExtendsRulebookId(parent);
        return book;
    }

    private ComplianceRule rule() {
        ComplianceRule rule = new ComplianceRule();
        rule.setId("forbidden-word"); rule.setTitle("Forbidden word"); rule.setMessage("Avoid bad");
        rule.setSeverity(Severity.ERROR); rule.setType(RuleType.FORBIDDEN_TOKENS);
        rule.setEnabled(true); rule.setTokens(List.of("bad"));
        return rule;
    }

    @Test
    void unsavedInheritanceOnlyDraftUsesParentRulesInsteadOfDefaultRulebook() {
        RulebookRepository books = mock(RulebookRepository.class);
        ScanRecordRepository scans = mock(ScanRecordRepository.class);
        Rulebook parent = book("parent", "Parent policy", null);
        parent.setRules(List.of(rule()));
        when(books.existsById("parent")).thenReturn(true);
        when(books.findById("parent")).thenReturn(Optional.of(parent));
        when(scans.save(any(ScanRecord.class))).thenAnswer(invocation -> invocation.getArgument(0));
        ScanService service = new ScanService(new ComplianceEngine(), new RulebookService(books, null), scans, new SarifExporter());
        Rulebook draft = book(null, "Unsaved child", "parent");
        ScanRecord result = service.scan("bad content", null, "draft.txt", "paste", draft);
        assertEquals(1, result.getErrorCount());
        assertEquals("Unsaved child", result.getRulebookName());
        assertEquals("in-memory-rulebook", result.getRulebookId());
        assertFalse(parent.getRules().getFirst().isInherited());
        verify(books, never()).findFirstBySeededTrue();
    }

    @Test
    void invalidCustomRulebookFailsInsteadOfSilentlyScanningWithDefaultRules() {
        RulebookRepository books = mock(RulebookRepository.class);
        ScanRecordRepository scans = mock(ScanRecordRepository.class);
        ScanService service = new ScanService(new ComplianceEngine(), new RulebookService(books, null), scans, new SarifExporter());
        assertThrows(ResponseStatusException.class, () -> service.scan("bad", null, "draft.txt", "paste", book(null, "Empty policy", null)));
        verifyNoInteractions(scans);
        verify(books, never()).findFirstBySeededTrue();
    }

    @Test
    void cyclicUpdateIsRejectedBeforeItIsSaved() {
        RulebookRepository books = mock(RulebookRepository.class);
        Rulebook base = book("base", "Base policy", null);
        base.setRules(List.of(rule()));
        Rulebook child = book("child", "Child policy", "base");
        when(books.findById("base")).thenReturn(Optional.of(base));
        when(books.findById("child")).thenReturn(Optional.of(child));
        when(books.existsById("child")).thenReturn(true);
        Rulebook changed = book("base", "Base policy", "child");
        changed.setRules(List.of(rule()));
        assertThrows(ResponseStatusException.class, () -> new RulebookService(books, null).update("base", changed));
        verify(books, never()).save(any());
    }

    @Test
    void deletingReferencedParentIsRejected() {
        RulebookRepository books = mock(RulebookRepository.class);
        Rulebook parent = book("parent", "Parent policy", null);
        Rulebook child = book("child", "Child policy", "parent");
        when(books.findById("parent")).thenReturn(Optional.of(parent));
        when(books.findAll()).thenReturn(List.of(parent, child));
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> new RulebookService(books, null).delete("parent"));
        assertEquals(409, error.getStatusCode().value());
        verify(books, never()).delete(any());
    }
}
