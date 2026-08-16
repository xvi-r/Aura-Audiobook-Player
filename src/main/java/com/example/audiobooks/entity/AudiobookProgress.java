package com.example.audiobooks.entity;

import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor


public class AudiobookProgress {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;    

    //Each AudiobookProgress entity relates to exactly 1 audibook, we don't want multiple progress markers for 1 audiobook
    @OneToOne()
    @JoinColumn(name = "audiobook_id", nullable = false, unique = true)
    private Audiobook audiobook;

    private Double position;

    private boolean completed;

    private Instant updatedAt;
     
}