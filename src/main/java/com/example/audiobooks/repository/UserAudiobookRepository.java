package com.example.audiobooks.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.audiobooks.entity.UserAudiobook;

public interface UserAudiobookRepository extends JpaRepository<UserAudiobook, Long> {
     List<UserAudiobook> findAllByUserId(Long id);
     Optional<UserAudiobook> findByUserIdAndAudiobookId(Long userId, Long AudiobookId);
}
