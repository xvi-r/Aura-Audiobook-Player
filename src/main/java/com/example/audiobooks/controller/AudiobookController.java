package com.example.audiobooks.controller;

import com.example.audiobooks.entity.Audiobook;
import com.example.audiobooks.entity.EBook;
import com.example.audiobooks.service.AudiobookService;
import com.example.audiobooks.service.EBookService;

import org.apache.catalina.connector.Response;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.core.io.support.ResourceRegion;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

@CrossOrigin(origins = "*")
@RestController
public class AudiobookController {

    private final AudiobookService service;
    private final EBookService eBookService;

    public AudiobookController(AudiobookService service, EBookService eBookService) {
        this.service = service;
        this.eBookService = eBookService;
    }

    @GetMapping("/api/audiobooks")
        public List<Audiobook> getAllAudiobooks() {
            return service.getAllAudiobooks();
    }

    @GetMapping("/api/Ebooks")
        public List<EBook> getAllEBooks() {
            return eBookService.getAllEBooks();
    }

    @GetMapping("/api/EBooks/{id}")
        public EBook getEBook(@PathVariable Long id) {
            return eBookService.getEBookById(id);
    }

    @GetMapping("/api/audiobooks/{id}")
        public Audiobook getAudiobook(@PathVariable Long id) {
        return service.getAudiobookById(id);
    }

    @GetMapping("api/EBooks/{id}/cover")
    public ResponseEntity<Resource> getEBookCover(@PathVariable Long id) throws IOException {

        Resource cover = eBookService.getCover(id);

        return ResponseEntity.ok()
            .contentType(MediaType.IMAGE_JPEG)
            .body(cover);
    }

    @GetMapping("api/audiobooks/{id}/cover")
    public ResponseEntity<Resource> getCover(@PathVariable Long id) throws IOException {

        Resource cover = service.getCover(id);

        return ResponseEntity.ok()
            .contentType(MediaType.IMAGE_JPEG)
            .body(cover);
    }

    @PostMapping(value = "/api/upload", consumes = "multipart/form-data")
    public String upload(@RequestParam("file") MultipartFile file) throws Exception {
    
        service.importAudiobook(file);

        System.out.println("Received file: " + file.getOriginalFilename());
        System.out.println("Size: " + file.getSize());

        return "Upload successful!";
    }

    @PostMapping(value = "/api/uploadEpub/{id}", consumes = "multipart/form-data")
    public String uploadEpub(@PathVariable Long id, @RequestParam("file") MultipartFile file) throws Exception {

        //the id is the audiobook id so that when the epub is uploaded itll land in the respective audiobook's folder
        eBookService.importEpub(file, id);

        return "Upload successful!";
    }

    @CrossOrigin(origins = "*")
    @GetMapping(value = "/api/epub/{id}")
        public ResponseEntity<Resource> getEpubFile(@PathVariable Long id) throws IOException {
        EBook ebook = eBookService.getEBookById(id);

        Path path = Paths.get(ebook.getFilePath());

        Resource resource = new UrlResource(path.toUri());

        if (!resource.exists()) {
            throw new FileNotFoundException("EPUB not found: " + path);
        }

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/epub+zip"))
                .header(
                    HttpHeaders.CONTENT_DISPOSITION,
                    "inline; filename=\"" + path.getFileName() + "\""
                )
                .body(resource);
    }
    
    @CrossOrigin(origins = "*")
    @GetMapping(value = "/api/audiobooks/{id}/file", produces = "audio/mp4")
    public ResponseEntity<Resource> getAudioFile(
            @PathVariable Long id,
            @RequestHeader(value = "Range", required = false) String range
    ) throws IOException {

        return service.getAudioFile(id, range);
    }
    }