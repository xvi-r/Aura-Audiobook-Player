package com.example.audiobooks.mapper;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.example.audiobooks.dto.audiobook.CatalogAudiobookResponse;
import com.example.audiobooks.dto.userAudiobook.UserAudiobookResponse;
import com.example.audiobooks.entity.Audiobook;
import com.example.audiobooks.entity.User;
import com.example.audiobooks.entity.UserAudiobook;
import com.example.audiobooks.repository.UserAudiobookRepository;

import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor 
@Component
public class AudiobookMapper {

        private final UserAudiobookRepository userAudiobookRepository;

        public CatalogAudiobookResponse toResponse(Object[] row) {

                Audiobook audiobook = (Audiobook) row[0];
                UserAudiobook userAudiobook = (UserAudiobook) row[1];

            return new CatalogAudiobookResponse(
                        audiobook.getId(),
                        audiobook.getTitle(),
                        audiobook.getAuthor(),
                        audiobook.getNarrator(),
                        audiobook.getDuration(),
                        audiobook.getGenres(),
                        userAudiobook != null ? userAudiobook.getPosition() : 0.0,
                        userAudiobook != null ? userAudiobook.isCompleted() : false,
                        userAudiobook != null ? userAudiobook.getLastPlayedAt() : null
                );
        }
}