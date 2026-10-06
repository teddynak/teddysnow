package com.teddysnow.auditor.repository;

import com.teddysnow.auditor.model.Rulebook;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface RulebookRepository extends MongoRepository<Rulebook, String> {
    Optional<Rulebook> findFirstBySeededTrue();
    Optional<Rulebook> findByName(String name);
    List<Rulebook> findBySeededTrue();
}
