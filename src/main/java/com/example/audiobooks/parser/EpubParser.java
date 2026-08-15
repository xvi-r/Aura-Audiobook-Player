package com.example.audiobooks.parser;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.example.audiobooks.entity.EBook;

import nl.siegmann.epublib.domain.Book;
import nl.siegmann.epublib.epub.EpubReader;

@Service
public class EpubParser {

    private Book EpubToBook(MultipartFile epub) throws Exception {
        try(InputStream input = epub.getInputStream()) {
            EpubReader reader = new EpubReader();
            return reader.readEpub(input);
        }
    }

    //Should uncapitalize E 
    public EBook parse(MultipartFile file, Long id) throws Exception{
        Book book = EpubToBook(file);
      
        EBook ebook = new EBook();

        ebook.setTitle(book.getTitle());

        ebook.setISBN(book.getMetadata().getIdentifiers().get(0).toString());
        System.out.println("Authors: " + book.getMetadata().getAuthors());
        System.out.println("Language: " + book.getMetadata().getLanguage());
        System.out.println("Publishers: " + book.getMetadata().getPublishers());
        System.out.println("Dates: " + book.getMetadata().getDates());
        System.out.println("Identifiers: " + book.getMetadata().getIdentifiers());
        System.out.println("Descriptions: " + book.getMetadata().getDescriptions());
        System.out.println("Subjects: " + book.getMetadata().getSubjects());
        System.out.println(book.getCoverImage());
        System.out.println(book.getGuide());

        ebook.setAudioBookId(id);

        nl.siegmann.epublib.domain.Resource cover = book.getResources().getById("cover");

        Path directory = Path.of("app-data", "ebooks", String.valueOf(id));
        Files.createDirectories(directory);

        Path coverPath = directory.resolve("EpubCover.jpg");
        
        if (cover !=null) {
            Files.write(coverPath, cover.getData());
            
            System.out.println("COVER GOOD");
        } else {System.out.println("Cover Was Null");}
        
       directory = Path.of("app-data", "audiobooks", String.valueOf(id));

        Files.createDirectories(directory);

        Path epubPath = directory.resolve("eBook.epub");

        ebook.setCoverPath(coverPath.toString());
        ebook.setFilePath(epubPath.toString());

        file.transferTo(epubPath);

        return ebook;

        
    }


}
