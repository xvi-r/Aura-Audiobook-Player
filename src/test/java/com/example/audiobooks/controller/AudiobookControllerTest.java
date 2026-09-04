package com.example.audiobooks.controller;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.example.audiobooks.dto.userAudiobook.UserAudiobookResponse;
import com.example.audiobooks.entity.User;
import com.example.audiobooks.security.CustomUserDetails;
import com.example.audiobooks.service.AudiobookService;
import com.example.audiobooks.service.UserAudiobookService;

@WebMvcTest(AudiobookController.class)
public class AudiobookControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UserAudiobookService userAudiobookService;

    @MockitoBean
    private AudiobookService audiobookService;

    @Test
    @DisplayName("GET /api/audiobooks/continue-listening - Should return 200 OK and JSON list when authenticated")
    void continueListening_shouldReturn200AndJsonList() throws Exception {
        User mockUserEntity = new User();
        mockUserEntity.setId(1L);
        mockUserEntity.setUsername("alice");
        CustomUserDetails customUserDetails = new CustomUserDetails(mockUserEntity);

        UserAudiobookResponse sampleBook = new UserAudiobookResponse(
            49L, 
            "Doctor Aphra", 
            "Sarah Kuhn", 
            20100.0, 
            List.of("Sci-Fi"), 
            1500.0, 
            false, 
            Instant.now()
        );

        when(userAudiobookService.continueListening(org.mockito.ArgumentMatchers.anyLong()))
            .thenReturn(List.of(sampleBook));
        
        mockMvc.perform(get("/api/audiobooks/continue-listening")
                .with(user(customUserDetails)) 
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].audioBookId").value(49))
                .andExpect(jsonPath("$[0].title").value("Doctor Aphra"))
                .andExpect(jsonPath("$[0].author").value("Sarah Kuhn"));
    }

    @Test
    @DisplayName("PUT /api/audiobooks/{id}/asin - Should return 200 OK and invoke audiobookService.enrichAudiobookByAsin")
    void enrichByAsin_shouldReturn200OK_andPassFetchChaptersToService() throws Exception {
        User mockUserEntity = new User();
        mockUserEntity.setId(1L);
        mockUserEntity.setUsername("alice");
        CustomUserDetails customUserDetails = new CustomUserDetails(mockUserEntity);

        String jsonPayload = """
            {
              "asin": "B002V5B280",
              "country": "us",
              "fetchChapters": true
            }
            """;

        mockMvc.perform(put("/api/audiobooks/1/asin")
                .with(user(customUserDetails))
                .with(csrf()) // Injects CSRF token for HTTP PUT
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonPayload))
                .andExpect(status().isOk());

        verify(audiobookService).enrichAudiobookByAsin(1L, "B002V5B280", "us", true);
    }
}
