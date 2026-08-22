package com.example.audiobooks.entity;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor

public class Audiobook {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;    

    private String asin;

    private String rating;

    private String title;

    private String author;

    private String narrator;

    private String date;

    private Double duration;

    private String filePath;

    private String coverPath;

    //creates a separate table
    @ElementCollection
    private List<String> genres = new ArrayList<>();

    @Column(columnDefinition = "TEXT")
    private String description;

    @OneToMany(mappedBy = "audiobook",cascade = CascadeType.ALL)
    private List<Chapter> chapters = new ArrayList<>();
}