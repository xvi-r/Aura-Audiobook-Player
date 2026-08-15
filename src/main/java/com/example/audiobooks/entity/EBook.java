package com.example.audiobooks.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor

public class EBook {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;    

    private String ISBN;

    private Long audioBookId;

    private String title;

    private String author;

    private String date;

    private Integer pages;

    private Integer chapters;

    private String filePath;

    private String coverPath;

    @Column(columnDefinition = "TEXT")
    private String description;
} 
