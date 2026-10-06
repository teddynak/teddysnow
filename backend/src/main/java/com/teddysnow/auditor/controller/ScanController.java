package com.teddysnow.auditor.controller;

import com.teddysnow.auditor.dto.ScanRequest;
import com.teddysnow.auditor.dto.ScanSummary;
import com.teddysnow.auditor.model.ScanRecord;
import com.teddysnow.auditor.service.ScanService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/scans")
public class ScanController {

    private final ScanService scanService;

    public ScanController(ScanService scanService) {
        this.scanService = scanService;
    }

    @PostMapping
    public ScanRecord scanPasted(@Valid @RequestBody ScanRequest request) {
        return scanService.scan(request.getContent(), request.getRulebookId(), request.getSourceName(), "paste", request.getCustomRulebook());
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ScanRecord scanUpload(@RequestPart("file") MultipartFile file,
                                 @RequestParam(value = "rulebookId", required = false) String rulebookId)
            throws IOException {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Uploaded file is empty");
        }
        String content = new String(file.getBytes(), StandardCharsets.UTF_8);
        String name = file.getOriginalFilename() == null ? "upload.txt" : file.getOriginalFilename();
        return scanService.scan(content, rulebookId, name, "upload");
    }

    @GetMapping
    public List<ScanSummary> history() {
        return scanService.history().stream().map(ScanSummary::from).toList();
    }

    @GetMapping("/{id}")
    public ScanRecord get(@PathVariable String id) {
        return scanService.get(id);
    }

    @GetMapping(value = "/{id}/sarif", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> sarif(@PathVariable String id) {
        return scanService.exportSarif(id);
    }

    @GetMapping("/{id}/export")
    public ResponseEntity<?> export(@PathVariable String id,
                                    @RequestParam(value = "format", defaultValue = "json") String format) {
        if ("sarif".equalsIgnoreCase(format)) {
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Content-Disposition", "attachment; filename=\"scan-" + id + ".sarif\"")
                    .body(scanService.exportSarif(id));
        } else if ("markdown".equalsIgnoreCase(format) || "md".equalsIgnoreCase(format)) {
            return ResponseEntity.ok()
                    .header("Content-Type", "text/markdown; charset=UTF-8")
                    .header("Content-Disposition", "attachment; filename=\"scan-" + id + ".md\"")
                    .body(scanService.exportMarkdown(id));
        } else {
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Content-Disposition", "attachment; filename=\"scan-" + id + ".json\"")
                    .body(scanService.get(id));
        }
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        scanService.delete(id);
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clearAll() {
        scanService.clearAll();
    }
}
