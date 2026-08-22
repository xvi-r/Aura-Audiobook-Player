package com.example.audiobooks.service;

import com.example.audiobooks.repository.UserAudiobookRepository;

import java.time.Instant;
import java.util.List;

import org.springframework.stereotype.Service;

import com.example.audiobooks.dto.audiobook.AudiobookResponse;
import com.example.audiobooks.dto.userAudiobook.AudiobookProgressRequest;
import com.example.audiobooks.dto.userAudiobook.UserAudiobookProgressResponse;
import com.example.audiobooks.dto.userAudiobook.UserAudiobookResponse;
import com.example.audiobooks.entity.Audiobook;
import com.example.audiobooks.entity.AudiobookProgress;
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

    public List<UserAudiobookResponse> getUserAudiobooks(Long id) {
        List<UserAudiobook> userAudiobookData = userAudiobookRepository.findAllByUserIdOrderByAudiobookIdAsc(id);

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

    public UserAudiobookProgressResponse updateProgress(Long userId, Long audiobookId,
            AudiobookProgressRequest audiobookProgressRequest) {
        UserAudiobook userAudiobook = userAudiobookRepository.findByUserIdAndAudiobookId(userId, audiobookId)
                .orElseThrow(() -> new RuntimeException("UserAudiobook not found"));

        userAudiobook.setPosition(audiobookProgressRequest.getPosition());
        userAudiobook.setCompleted(audiobookProgressRequest.isCompleted());

        userAudiobookRepository.save(userAudiobook);

        return new UserAudiobookProgressResponse(userAudiobook.getPosition(), userAudiobook.isCompleted(), Instant.now());
    }

    public UserAudiobookProgressResponse getProgressForAudiobook(Long UserId, Long audiobookId) {

        UserAudiobook userAudiobook = userAudiobookRepository.findByUserIdAndAudiobookId(UserId, audiobookId).orElseThrow(() -> new RuntimeException("UserAudiobook Not Found"));
              
        UserAudiobookProgressResponse response = new UserAudiobookProgressResponse();

        response.setPosition(userAudiobook.getPosition());
        response.setCompleted(userAudiobook.isCompleted());
        response.setUpdatedAt(userAudiobook.getLastPlayedAt());

        return response;
    }

}
