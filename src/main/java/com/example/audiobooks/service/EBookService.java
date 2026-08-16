package com.example.audiobooks.service;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.example.audiobooks.entity.EBook;
import com.example.audiobooks.parser.EpubParser;
import com.example.audiobooks.repository.EBookRepository;

import lombok.RequiredArgsConstructor;


@Service
@RequiredArgsConstructor
public class EBookService {


    private final EpubParser epubParser;
    private final EBookRepository repository;


    public List<EBook> getAllEBooks() {
        return repository.findAll();
    }

    public EBook getEBookById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new RuntimeException("EBook not found"));
    }

    public Resource getCover(Long id) throws IOException {
        EBook eBook = getEBookById(id);

        Path coverPath = Paths.get(eBook.getCoverPath());

        return new FileSystemResource(coverPath);
    }

    public EBook getEBookByAudioBookId(Long id) {
        return repository.findByAudioBookId(id)
                .orElseThrow(() -> new RuntimeException("EBook not found"));
    }

    public void importEpub(MultipartFile upload, Long id) throws Exception {
        System.out.println("IN service");
        repository.save(epubParser.parse(upload, id));
    }
}
