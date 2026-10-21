package com.example.audiobooks.controller;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import org.springframework.mock.web.MockMultipartFile;


import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import org.springframework.context.annotation.Import;
import org.springframework.security.web.context.SecurityContextRepository;

import com.example.audiobooks.config.SecurityConfig;
import com.example.audiobooks.dto.userAudiobook.UserAudiobookResponse;
import com.example.audiobooks.entity.User;
import com.example.audiobooks.entity.UserRole;
import com.example.audiobooks.security.CustomUserDetails;
import com.example.audiobooks.service.AudiobookService;
import com.example.audiobooks.service.UserAudiobookService;

@WebMvcTest(AudiobookController.class)
@Import(SecurityConfig.class)
public class AudiobookControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UserAudiobookService userAudiobookService;

    @MockitoBean
    private AudiobookService audiobookService;

    @MockitoBean
    private SecurityContextRepository securityContextRepository;

    @MockitoBean
    private com.example.audiobooks.application.ApplicationState applicationState;

    @MockitoBean
    private com.example.audiobooks.repository.ApplicationStateRepository applicationStateRepository;

    @Test
    @DisplayName("GET /api/audiobooks/continue-listening - Should return 200 OK and JSON list when authenticated")
    void continueListening_shouldReturn200AndJsonList() throws Exception {
        User mockUserEntity = new User();
        mockUserEntity.setId(1L);
        mockUserEntity.setUsername("alice");
        mockUserEntity.setRole(UserRole.USER);
        CustomUserDetails customUserDetails = new CustomUserDetails(mockUserEntity);

        UserAudiobookResponse sampleBook = new UserAudiobookResponse(
            49L, 
            "Doctor Aphra", 
            "Sarah Kuhn", 
            "Marc Thompson", 
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
    @DisplayName("PUT /api/audiobooks/{id}/asin - Should return 403 Forbidden when user role is USER")
    void enrichByAsin_whenUserHasRoleUser_shouldReturn403Forbidden() throws Exception {
        User mockUserEntity = new User();
        mockUserEntity.setId(1L);
        mockUserEntity.setUsername("alice");
        mockUserEntity.setRole(UserRole.USER);
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
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonPayload))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("PUT /api/audiobooks/{id}/asin - Should return 200 OK when user role is ADMIN")
    void enrichByAsin_whenUserHasRoleAdmin_shouldReturn200OK() throws Exception {
        User mockUserEntity = new User();
        mockUserEntity.setId(2L);
        mockUserEntity.setUsername("admin");
        mockUserEntity.setRole(UserRole.ADMIN);
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
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonPayload))
                .andExpect(status().isOk());

        verify(audiobookService).enrichAudiobookByAsin(1L, "B002V5B280", "us", true);
    }

    @Test
    @DisplayName("DELETE /api/audiobooks/{id} - Should return 403 Forbidden when user role is USER")
    void deleteAudiobook_whenUserHasRoleUser_shouldReturn403Forbidden() throws Exception {
        User mockUserEntity = new User();
        mockUserEntity.setId(1L);
        mockUserEntity.setUsername("alice");
        mockUserEntity.setRole(UserRole.USER);
        CustomUserDetails customUserDetails = new CustomUserDetails(mockUserEntity);

        mockMvc.perform(delete("/api/audiobooks/1")
                .with(user(customUserDetails))
                .with(csrf()))
                .andExpect(status().isForbidden()); // Asserts HTTP 403
    }

    @Test
    @DisplayName("DELETE /api/audiobooks/{id} - Should return 204 No Content when user role is ADMIN")
    void deleteAudiobook_whenUserHasRoleAdmin_shouldReturn204NoContent() throws Exception {
        User mockUserEntity = new User();
        mockUserEntity.setId(2L);
        mockUserEntity.setUsername("admin");
        mockUserEntity.setRole(UserRole.ADMIN);
        CustomUserDetails customUserDetails = new CustomUserDetails(mockUserEntity);

        mockMvc.perform(delete("/api/audiobooks/1")
                .with(user(customUserDetails))
                .with(csrf()))
                .andExpect(status().isNoContent()); // Asserts HTTP 204
        verify(audiobookService).deleteAudiobook(1L);
    }

    @Test
    @DisplayName("POST /api/upload - Should return 403 Forbidden when user role is USER")
    void upload_whenUserHasRoleUser_shouldReturn403Forbidden() throws Exception {
        User mockUserEntity = new User();
        mockUserEntity.setId(1L);
        mockUserEntity.setUsername("alice");
        mockUserEntity.setRole(UserRole.USER);
        CustomUserDetails customUserDetails = new CustomUserDetails(mockUserEntity);

        MockMultipartFile dummyFile = new MockMultipartFile("file", "test.mp3", "audio/mpeg", "test content".getBytes());

        mockMvc.perform(multipart("/api/upload")
                .file(dummyFile)
                .with(user(customUserDetails))
                .with(csrf()))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("POST /api/upload - Should return 200 OK when user role is ADMIN")
    void upload_whenUserHasRoleAdmin_shouldReturn200OK() throws Exception {
        User mockUserEntity = new User();
        mockUserEntity.setId(2L);
        mockUserEntity.setUsername("admin");
        mockUserEntity.setRole(UserRole.ADMIN);
        CustomUserDetails customUserDetails = new CustomUserDetails(mockUserEntity);

        MockMultipartFile dummyFile = new MockMultipartFile("file", "test.mp3", "audio/mpeg", "test content".getBytes());

        mockMvc.perform(multipart("/api/upload")
                .file(dummyFile)
                .with(user(customUserDetails))
                .with(csrf()))
                .andExpect(status().isOk());

        verify(audiobookService).importAudiobook(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq(2L));
    }
}
