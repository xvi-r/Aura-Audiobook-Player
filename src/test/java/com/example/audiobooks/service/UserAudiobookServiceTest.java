package com.example.audiobooks.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import com.example.audiobooks.dto.userAudiobook.UserAudiobookResponse;
import com.example.audiobooks.entity.Audiobook;
import com.example.audiobooks.entity.UserAudiobook;
import com.example.audiobooks.mapper.UserAudiobookMapper;
import com.example.audiobooks.repository.UserAudiobookRepository;

@ExtendWith(MockitoExtension.class)
public class UserAudiobookServiceTest {

    @Mock
    private UserAudiobookRepository userAudiobookRepository;

    @Mock
    private UserAudiobookMapper userAudiobookMapper;

    @InjectMocks
    private UserAudiobookService userAudiobookService;

    @Test
    @DisplayName("Should return mapped list of UserAudiobookResponse for continue listening")
    void continueListening_shouldReturnMappedList() {
      
        Long userId = 1L;
        UserAudiobook mockUserAudiobook = new UserAudiobook();
        mockUserAudiobook.setLastPlayedAt(Instant.now());

        UserAudiobookResponse mockResponse = new UserAudiobookResponse(
            10L, "Dune", "Frank Herbert", 1200.0, List.of("Sci-Fi"), 500.0, false, Instant.now()
        );

        when(userAudiobookRepository.findTop8ByUserIdAndLastPlayedAtIsNotNullOrderByLastPlayedAtDesc(userId))
            .thenReturn(List.of(mockUserAudiobook));

        when(userAudiobookMapper.toResponse(mockUserAudiobook))
            .thenReturn(mockResponse);
      

        List<UserAudiobookResponse> results = userAudiobookService.continueListening(userId);
       
        assertThat(results).hasSize(1);
        assertThat(results.get(0).title()).isEqualTo("Dune");

        verify(userAudiobookRepository).findTop8ByUserIdAndLastPlayedAtIsNotNullOrderByLastPlayedAtDesc(userId);
        verify(userAudiobookMapper).toResponse(mockUserAudiobook);
    }

    @Test
    @DisplayName("Should return empty list when user has no listening history")
    void continueListening_shouldReturnEmptyListWhenNoHistory() {
        
        Long userId = 1L;
        when(userAudiobookRepository.findTop8ByUserIdAndLastPlayedAtIsNotNullOrderByLastPlayedAtDesc(userId))
            .thenReturn(Collections.emptyList());
        
        List<UserAudiobookResponse> results = userAudiobookService.continueListening(userId);
        
        assertThat(results).isEmpty();
        verify(userAudiobookRepository).findTop8ByUserIdAndLastPlayedAtIsNotNullOrderByLastPlayedAtDesc(userId);

    }
}
