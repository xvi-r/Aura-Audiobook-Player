package com.example.audiobooks.service;

import java.time.Instant;

import org.springframework.stereotype.Service;

import com.example.audiobooks.dto.audiobook.AudiobookResponse;
import com.example.audiobooks.dto.userAudiobook.AudiobookProgressRequest;
import com.example.audiobooks.dto.userAudiobook.AudiobookProgressResponse;
import com.example.audiobooks.entity.Audiobook;
import com.example.audiobooks.entity.AudiobookProgress;
import com.example.audiobooks.mapper.AudiobookMapper;
import com.example.audiobooks.repository.AudiobookProgressRepository;
import com.example.audiobooks.repository.AudiobookRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor

//This Service will be removed in favor of the UserAudioBook Service
public class AudiobookProgressService {

    private final AudiobookProgressRepository repository;
    private final AudiobookRepository audiobookRepository;
    private final AudiobookMapper audiobookMapper;


    public AudiobookProgressResponse updateProgress(Long audiobookId, AudiobookProgressRequest request) {

        AudiobookProgress audiobookProgress = repository.findByAudiobookId(audiobookId)
                .orElseGet(() -> createProgress(audiobookId));

        audiobookProgress.setPosition(request.getPosition());
        audiobookProgress.setCompleted(request.isCompleted());
        audiobookProgress.setUpdatedAt(Instant.now());

        repository.save(audiobookProgress);

        AudiobookProgressResponse response = new AudiobookProgressResponse();

        response.setPosition(audiobookProgress.getPosition());
        response.setCompleted(audiobookProgress.isCompleted());
        response.setUpdatedAt(audiobookProgress.getUpdatedAt());

        return response;
    }

    private AudiobookProgress createProgress(Long audiobookId) {

        Audiobook audiobook = audiobookRepository
                .findById(audiobookId)
                .orElseThrow();

        AudiobookProgress progress = new AudiobookProgress();

        progress.setAudiobook(audiobook);
        progress.setPosition(0.0);
        progress.setCompleted(false);
        progress.setUpdatedAt(Instant.now());

        return progress;
    }

    public AudiobookProgressResponse getProgressForAudiobook(Long audiobookId) {

        AudiobookProgress progress = repository
                .findByAudiobookId(audiobookId)
                .orElse(null);

        if (progress == null) {
            return null;
        }

        AudiobookProgressResponse response = new AudiobookProgressResponse();

        response.setPosition(progress.getPosition());
        response.setCompleted(progress.isCompleted());
        response.setUpdatedAt(progress.getUpdatedAt());

        return response;
    }

    public AudiobookResponse getMostRecentAudiobook() {
        AudiobookProgress audiobookProgress = repository.findFirstByOrderByUpdatedAtDesc().orElse(null);

        if(audiobookProgress == null) {
            return null;
        }
        Audiobook audiobook = audiobookProgress.getAudiobook();

        return audiobookMapper.toResponse(audiobook, audiobookProgress);


    }

}
