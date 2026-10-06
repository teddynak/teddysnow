package com.teddysnow.auditor.repository;

import com.teddysnow.auditor.model.ScanRecord;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface ScanRecordRepository extends MongoRepository<ScanRecord, String> {
    List<ScanRecord> findTop50ByOrderByCreatedAtDesc();
}
