package com.example.audiobooks.service;

import com.example.audiobooks.repository.UserAudiobookRepository;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@RequiredArgsConstructor

public class UserAudiobookService {
    private final UserAudiobookRepository userAudiobookRepository;
    
}
