package com.example.audiobooks.controller;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.example.audiobooks.entity.EBook;
import com.example.audiobooks.service.EBookService;

//@CrossOrigin(origins = "*")
@RestController
public class EBookController {
    
    private final EBookService eBookService;

    public EBookController(EBookService eBookService) {
        this.eBookService = eBookService;
    }

    //returns all Ebooks in the database
    @GetMapping("/api/EBooks")
        public List<EBook> getAllEBooks() {
            return eBookService.getAllEBooks();
    }

    
    @GetMapping("/api/EBooks/{id}")
        public EBook getEBook(@PathVariable Long id) {
            return eBookService.getEBookById(id);
    }

    @GetMapping("api/EBooks/{id}/cover")
    public ResponseEntity<Resource> getEBookCover(@PathVariable Long id) throws IOException {

        Resource cover = eBookService.getCover(id);

        return ResponseEntity.ok()
            .contentType(MediaType.IMAGE_JPEG)
            .body(cover);
    }

    // TODO: Change to /api/upload/EBook
    @PostMapping(value = "/api/uploadEpub/{id}", consumes = "multipart/form-data")
    public String uploadEpub(@PathVariable Long id, @RequestParam("file") MultipartFile file) throws Exception {

        //the id is the audiobook id so that when the epub is uploaded it can be assosicated with the correct audiobook
        eBookService.importEpub(file, id);

        return "Upload successful!";
    }

    // TODO: Change to /api/EBook/file/{id} and func name
    // Most of the functions logic should probably be move to the service
    
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

}
