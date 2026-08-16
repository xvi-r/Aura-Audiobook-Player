package com.example.audiobooks.mapper;

import org.springframework.stereotype.Component;

import com.example.audiobooks.dto.AudiobookProgressResponse;
import com.example.audiobooks.dto.AudiobookResponse;
import com.example.audiobooks.entity.Audiobook;
import com.example.audiobooks.entity.AudiobookProgress;

@Component
public class AudiobookMapper {

    public AudiobookResponse toResponse(
            Audiobook audiobook,
            AudiobookProgress progress) {

        AudiobookResponse response = new AudiobookResponse();

        response.setId(audiobook.getId());
        response.setTitle(audiobook.getTitle());
        response.setAuthor(audiobook.getAuthor());
        response.setNarrator(audiobook.getNarrator());
        response.setDuration(audiobook.getDuration());

        if (progress != null) {
            AudiobookProgressResponse progressResponse =
                    new AudiobookProgressResponse();

            progressResponse.setPosition(progress.getPosition());
            progressResponse.setCompleted(progress.isCompleted());
            progressResponse.setUpdatedAt(progress.getUpdatedAt());

            response.setProgressResponse(progressResponse);
        }

        return response;
    }
}