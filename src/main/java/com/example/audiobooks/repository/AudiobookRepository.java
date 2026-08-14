package com.example.audiobooks.repository;

import com.example.audiobooks.entity.Audiobook;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AudiobookRepository extends JpaRepository<Audiobook, Long> {

    
}