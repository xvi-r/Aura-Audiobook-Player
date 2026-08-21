package com.example.audiobooks.controller;

import com.example.audiobooks.dto.audiobook.AudiobookResponse;
import com.example.audiobooks.dto.userAudiobook.AudiobookProgressRequest;
import com.example.audiobooks.dto.userAudiobook.AudiobookProgressResponse;
import com.example.audiobooks.dto.userAudiobook.UserAudiobookResponse;
import com.example.audiobooks.entity.Audiobook;
import com.example.audiobooks.security.CustomUserDetails;
import com.example.audiobooks.service.AudiobookProgressService;
import com.example.audiobooks.service.AudiobookService;
import com.example.audiobooks.service.UserAudiobookService;

import lombok.RequiredArgsConstructor;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;

import java.io.IOException;
import java.util.List;

//@CrossOrigin(origins = "*")
@RestController
@RequiredArgsConstructor
public class AudiobookController {

    private final AudiobookService service;
    private final AudiobookProgressService progressService;
    private final UserAudiobookService userAudiobookService;



    @GetMapping("/api/audiobook/getUserAudiobooks")
    public List<UserAudiobookResponse> getUserAudiobooks(@AuthenticationPrincipal CustomUserDetails user) {
        return userAudiobookService.getUserAudiobooks(user.getId());
    }


    @GetMapping("/api/audiobooks")
    public List<AudiobookResponse> getAllAudiobooks() {
        return service.getAllAudiobooks();
    }

    @GetMapping("/api/audiobooks/{id}")
    public Audiobook getAudiobook(@PathVariable Long id) {
        return service.getAudiobookById(id);
    }

    // TODO: change to /api/upload/audiobook
    @PostMapping(value = "/api/upload", consumes = "multipart/form-data")
    public String upload(@RequestParam("file") MultipartFile file) throws Exception {

        service.importAudiobook(file);

        System.out.println("Received file: " + file.getOriginalFilename());
        System.out.println("Size: " + file.getSize());

        return "Upload successful!";
    }

    @GetMapping("api/audiobooks/{id}/cover")
    public ResponseEntity<Resource> getCover(@PathVariable Long id) throws IOException {

        Resource cover = service.getCover(id);

        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .body(cover);
    }

    @GetMapping(value = "/api/audiobooks/{id}/file", produces = "application/epub+zip")
    public ResponseEntity<Resource> getAudioFile(
            @PathVariable Long id,
            @RequestHeader(value = "Range", required = false) String range) throws IOException {

        return service.getAudioFile(id, range);
    }

    @PutMapping("/api/audiobooks/{audiobookId}/progress") 
    public AudiobookProgressResponse updateProgress(@PathVariable Long audiobookId, @RequestBody AudiobookProgressRequest request) {
        return progressService.updateProgress(audiobookId, request);

    }

    @GetMapping("/api/audiobooks/{audiobookId}/progress")
    public AudiobookProgressResponse getProgress(@PathVariable Long audiobookId) {
        return progressService.getProgressForAudiobook(audiobookId);
    }

    // this is used so the frontend knows what book to load in the playbar and visually
    @GetMapping("/api/audiobooks/recent") 
    public AudiobookResponse getMostRecentAudiobook() {
        return progressService.getMostRecentAudiobook();
    }
}