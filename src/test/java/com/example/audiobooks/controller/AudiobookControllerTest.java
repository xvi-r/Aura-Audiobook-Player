package com.example.audiobooks.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;


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
import com.example.audiobooks.service.AudiobookService;
import com.example.audiobooks.service.UserAudiobookService;

import com.example.audiobooks.security.CustomUserDetails;

@WebMvcTest(AudiobookController.class)
public class AudiobookControllerTest {

    @Autowired
    private MockMvc mockMvc; // Simulated HTTP Client

    @MockitoBean
    private UserAudiobookService userAudiobookService;

    @MockitoBean
    private AudiobookService audiobookService;

    @Test
    @DisplayName("GET /api/audiobooks/continue-listening - Should return 200 OK and JSON list when authenticated")

    void continueListening_shouldReturn200AndJsonList() throws Exception {
        
        // Create an authorized user
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
        
        // Here we verify if what the user recieves really is a list of UserAudiobookResponses with the proper values
        mockMvc.perform(get("/api/audiobooks/continue-listening")
                .with(user(customUserDetails)) 
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk()) // Asserts HTTP 200 OK
                .andExpect(jsonPath("$").isArray()) // Asserts JSON root is array
                .andExpect(jsonPath("$[0].audioBookId").value(49)) // Asserts DTO fields
                .andExpect(jsonPath("$[0].title").value("Doctor Aphra"))
                .andExpect(jsonPath("$[0].author").value("Sarah Kuhn"));
    }
}
