package com.example.audiobooks.service;

import com.example.audiobooks.repository.UserAudiobookRepository;

import java.util.List;

import org.springframework.stereotype.Service;

import com.example.audiobooks.dto.userAudiobook.UserAudiobookResponse;
import com.example.audiobooks.entity.UserAudiobook;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@RequiredArgsConstructor

@Service
public class UserAudiobookService {
    private final UserAudiobookRepository userAudiobookRepository;

    public List<UserAudiobookResponse> getUserAudiobooks(String username) {
        List<UserAudiobook> userAudiobookData = userAudiobookRepository.findAllByUserUsername(username);

        return userAudiobookData.stream()
                .map(userAudiobook -> new UserAudiobookResponse(
                        userAudiobook.getAudiobook().getId(),
                        userAudiobook.getAudiobook().getTitle(),
                        userAudiobook.getAudiobook().getAuthor(),
                        userAudiobook.getAudiobook().getDuration(),
                        userAudiobook.getAudiobook().getGenres(),
                        userAudiobook.getPosition(),
                        userAudiobook.isCompleted()))
                .toList();

    }
}
