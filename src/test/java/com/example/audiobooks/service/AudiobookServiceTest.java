package com.example.audiobooks.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.client.RestClientTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.example.audiobooks.entity.Audiobook;
import com.example.audiobooks.parser.M4Bparser;
import com.example.audiobooks.parser.MP3Parser;
import com.example.audiobooks.repository.AudiobookRepository;
import com.example.audiobooks.repository.SeriesRepository;
import com.example.audiobooks.repository.UserAudiobookRepository;
import com.example.audiobooks.repository.UserRepository;

@RestClientTest(AudiobookService.class)
public class AudiobookServiceTest {

    // create the restClient again since this is a test 
    @TestConfiguration
    static class RestClientTestConfig {
        @Bean
        public RestClient restClient(RestClient.Builder builder) {
            return builder.build();
        }
    }

    @Autowired
    private AudiobookService audiobookService;

    @Autowired
    private MockRestServiceServer server;

    @MockitoBean
    private AudiobookRepository repository;

    @MockitoBean
    private UserAudiobookRepository userAudiobookRepository;

    @MockitoBean
    private SeriesRepository seriesRepository;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private M4Bparser parser;

    @MockitoBean
    private MP3Parser mp3Parser;

    @Test
    @DisplayName("enrichAudiobookByAsin - Should update metadata and replace chapters")
    void enrichAudiobookByAsin_shouldUpdateMetadataAndReplaceChapters() {
        
        Audiobook mockAudiobook = new Audiobook();
        mockAudiobook.setId(1L);
        when(repository.findById(1L)).thenReturn(Optional.of(mockAudiobook));

        String bookJson = """
            {
              "asin": "B002V5B280", "title": "Dune", "rating": "4.8",
              "authors": [{"name": "Frank Herbert"}],
              "narrators": [{"name": "George Guidall"}],
              "image": "https://example.com/cover.jpg",
              "runtimeLengthMin": 600.0,
              "seriesPrimary": {"asin": "S123", "name": "Dune Series"}
            }
            """;

        String chaptersJson = """
            {
              "asin": "B002V5B280",
              "chapters": [
                {"title": "Chapter 1", "startOffsetSec": 0.0, "lengthMs": 15000.0},
                {"title": "Chapter 2", "startOffsetSec": 15.0, "lengthMs": 30000.0}
              ]
            }
            """;

        server.expect(requestTo("https://api.audnex.us/books/B002V5B280?region=us"))
                .andRespond(withSuccess(bookJson, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://example.com/cover.jpg"))
                .andRespond(withSuccess(new byte[]{1, 2, 3}, MediaType.IMAGE_JPEG));
        server.expect(requestTo("https://api.audnex.us/books/B002V5B280/chapters?region=us"))
                .andRespond(withSuccess(chaptersJson, MediaType.APPLICATION_JSON));

        
        audiobookService.enrichAudiobookByAsin(1L, "B002V5B280", "us", true);

        
        assertThat(mockAudiobook.getTitle()).isEqualTo("Dune");
        assertThat(mockAudiobook.getAuthor()).isEqualTo("Frank Herbert");
        assertThat(mockAudiobook.getChapters()).hasSize(2);
        assertThat(mockAudiobook.getChapters().get(0).getTitle()).isEqualTo("Chapter 1");
        assertThat(mockAudiobook.getChapters().get(1).getTitle()).isEqualTo("Chapter 2");
    }
}