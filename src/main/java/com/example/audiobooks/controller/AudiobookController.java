package com.example.audiobooks.controller;

import com.example.audiobooks.entity.Audiobook;
import com.example.audiobooks.service.AudiobookService;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.PostMapping;

import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;

import java.io.IOException;
import java.util.List;

@CrossOrigin(origins = "*")
@RestController
public class AudiobookController {

    private final AudiobookService service;

    public AudiobookController(AudiobookService service) {
        this.service = service;
    }

    @GetMapping("/api/audiobooks")
    public List<Audiobook> getAllAudiobooks() {
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

    @CrossOrigin(origins = "*")
    @GetMapping(value = "/api/audiobooks/{id}/file", produces = "application/epub+zip")
    public ResponseEntity<Resource> getAudioFile(
            @PathVariable Long id,
            @RequestHeader(value = "Range", required = false) String range) throws IOException {

        return service.getAudioFile(id, range);
    }
}