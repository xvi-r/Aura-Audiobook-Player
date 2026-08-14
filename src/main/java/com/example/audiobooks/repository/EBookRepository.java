package com.example.audiobooks.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.audiobooks.entity.EBook;

public interface EBookRepository extends JpaRepository<EBook, Long> {

    Optional<EBook> findByAudioBookId(Long audioBookId);

}