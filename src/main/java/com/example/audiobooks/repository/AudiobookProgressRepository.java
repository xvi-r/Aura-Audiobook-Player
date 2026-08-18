package com.example.audiobooks.repository;

import com.example.audiobooks.entity.AudiobookProgress;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AudiobookProgressRepository extends JpaRepository<AudiobookProgress, Long> {

    Optional<AudiobookProgress> findByAudiobookId(Long audiobookId);
    Optional<AudiobookProgress> findFirstByOrderByUpdatedAtDesc();


}