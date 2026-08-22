package com.example.audiobooks.service;

import java.time.Instant;

import org.springframework.stereotype.Service;

import com.example.audiobooks.dto.audiobook.AudiobookResponse;
import com.example.audiobooks.dto.userAudiobook.AudiobookProgressRequest;
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



 
    // public AudiobookResponse getMostRecentAudiobook() {
    //     AudiobookProgress audiobookProgress = repository.findFirstByOrderByUpdatedAtDesc().orElse(null);

    //     if(audiobookProgress == null) {
    //         return null;
    //     }
    //     Audiobook audiobook = audiobookProgress.getAudiobook();

    //     return audiobookMapper.toResponse(audiobook, audiobookProgress);


    // }

}
