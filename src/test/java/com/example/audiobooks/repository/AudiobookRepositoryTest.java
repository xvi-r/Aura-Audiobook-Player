package com.example.audiobooks.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;

import com.example.audiobooks.entity.Audiobook;
import com.example.audiobooks.entity.Chapter;

@DataJpaTest
public class AudiobookRepositoryTest {

    @Autowired
    private AudiobookRepository audiobookRepository;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    @DisplayName("replace chapters - Should delete old chapters and persist new Audnex chapters in DB")
    void replaceChapters_shouldDeleteOldAndSaveNewChapters() {

        // Make an audiobook with 1 chapter 
        Audiobook audiobook = new Audiobook();
        audiobook.setTitle("Star Wars: Heir to the Empire");

        Chapter oldCh = Chapter.builder()
                .title("Old Chapter 1")
                .startTimeMs(0.0)
                .audiobook(audiobook)
                .build();

        audiobook.getChapters().add(oldCh);
        Audiobook savedBook = audiobookRepository.saveAndFlush(audiobook);
        entityManager.clear(); // Clear cache to force DB read

        // Simulate Audnex chapter enrichment: clear old chapters and add new ones
        Audiobook managedBook = audiobookRepository.findById(savedBook.getId()).orElseThrow();
        managedBook.getChapters().clear(); // Triggers orphanRemoval = true

        Chapter newCh1 = Chapter.builder()
                .title("Audnex Chapter 1")
                .startTimeMs(0.0)
                .endTimeMs(15.0)
                .chapterNumber(1)
                .audiobook(managedBook)
                .build();

        Chapter newCh2 = Chapter.builder()
                .title("Audnex Chapter 2")
                .startTimeMs(15.0)
                .endTimeMs(30.0)
                .chapterNumber(2)
                .audiobook(managedBook)
                .build();

        managedBook.getChapters().addAll(List.of(newCh1, newCh2));
        audiobookRepository.saveAndFlush(managedBook);
        entityManager.clear(); // Clear cache to verify DB state

        //  Verify old chapter is gone and 2 new Audnex chapters exist in DB
        Audiobook updatedBook = audiobookRepository.findById(savedBook.getId()).orElseThrow();
        assertThat(updatedBook.getChapters()).hasSize(2);
        assertThat(updatedBook.getChapters().get(0).getTitle()).isEqualTo("Audnex Chapter 1");
        assertThat(updatedBook.getChapters().get(1).getTitle()).isEqualTo("Audnex Chapter 2");
    }
}
