package com.teddysnow.auditor.controller;

import com.teddysnow.auditor.model.Rulebook;
import com.teddysnow.auditor.service.RulebookService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/rulebooks")
public class RulebookController {

    private final RulebookService rulebookService;

    public RulebookController(RulebookService rulebookService) {
        this.rulebookService = rulebookService;
    }

    @GetMapping
    public List<Rulebook> list() {
        return rulebookService.list();
    }

    @GetMapping("/{id}")
    public Rulebook get(@PathVariable String id) {
        return rulebookService.get(id);
    }

    @GetMapping("/{id}/effective")
    public Rulebook getEffective(@PathVariable String id) {
        return rulebookService.getEffectiveRulebook(id);
    }

    @PostMapping
    public Rulebook create(@RequestBody Rulebook rulebook) {
        return rulebookService.create(rulebook);
    }

    @PutMapping("/{id}")
    public Rulebook update(@PathVariable String id, @RequestBody Rulebook rulebook) {
        return rulebookService.update(id, rulebook);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable String id) {
        rulebookService.delete(id);
    }

    @GetMapping("/schema")
    public java.util.Map<String, Object> schema() {
        return rulebookService.getSchema();
    }

    @PostMapping("/reset")
    public List<Rulebook> resetDefaults() {
        return rulebookService.resetDefaults();
    }
}
