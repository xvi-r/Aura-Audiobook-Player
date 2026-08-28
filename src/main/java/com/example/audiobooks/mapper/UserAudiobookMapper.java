package com.example.audiobooks.mapper;

import org.springframework.stereotype.Component;

import com.example.audiobooks.dto.userAudiobook.UserAudiobookResponse;
import com.example.audiobooks.entity.UserAudiobook;

@Component
public class UserAudiobookMapper {

    public UserAudiobookResponse toResponse(UserAudiobook userAudiobook) {
        return new UserAudiobookResponse(
                userAudiobook.getAudiobook().getId(),
                userAudiobook.getAudiobook().getTitle(),
                userAudiobook.getAudiobook().getAuthor(),
                userAudiobook.getAudiobook().getDuration(),
                userAudiobook.getAudiobook().getGenres(),
                userAudiobook.getPosition(),
                userAudiobook.isCompleted(),
                userAudiobook.getLastPlayedAt()
        );
    }
}