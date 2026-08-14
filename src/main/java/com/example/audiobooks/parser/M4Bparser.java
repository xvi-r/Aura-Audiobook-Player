package com.example.audiobooks.parser;

import com.example.audiobooks.entity.Audiobook;
import com.example.audiobooks.entity.Chapter;
import com.example.audiobooks.parser.dto.FFprobeChapter;
import com.example.audiobooks.parser.dto.FFprobeResponse;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.jaudiotagger.audio.AudioFile;
import org.jaudiotagger.audio.AudioFileIO;
import org.jaudiotagger.tag.FieldKey;
import org.jaudiotagger.tag.KeyNotFoundException;
import org.jaudiotagger.tag.Tag;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Field;

@Component
public class M4Bparser {

    public Audiobook parse(File file) throws Exception {

        ProcessBuilder builder = new ProcessBuilder(
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_chapters",
            file.getAbsolutePath()
        );
        builder.redirectErrorStream(true);

        Process process = builder.start();

        InputStream input = process.getInputStream();

        BufferedReader reader = new BufferedReader(
            new InputStreamReader(input)
        );

        StringBuilder json = new StringBuilder();

        String line;

        while((line = reader.readLine()) != null) {
            json.append(line);
        }


        ObjectMapper mapper = new ObjectMapper();

        FFprobeResponse response = mapper.readValue(json.toString(), FFprobeResponse.class);

        System.out.println(response.getChapters().size());
        
        Audiobook audiobook = new Audiobook();

        for (FFprobeChapter dto : response.getChapters()) {

            Chapter chapter = new Chapter();

            chapter.setTitle(dto.getTags().getTitle());
            chapter.setStartTimeMs(Double.parseDouble(dto.getStart_time()));
            chapter.setEndTimeMs(Double.parseDouble(dto.getEnd_time()));

            chapter.setAudiobook(audiobook);

            audiobook.getChapters().add(chapter);
        }

        audiobook.setDuration(response.getFormat().getDuration());
        audiobook.setAuthor(response.getFormat().getTags().getArtist());
        audiobook.setNarrator(response.getFormat().getTags().getComposer());
        audiobook.setDate(response.getFormat().getTags().getDate());
        
        String title = response.getFormat().getTags().getTitle();

        if(title == null) {
            title = response.getFormat().getTags().getAlbum();
        }

        audiobook.setTitle(title);

        String description = response.getFormat().getTags().getDescription();

        if (description == null) {
            description = response.getFormat().getTags().getLyrics();
        }

        audiobook.setDescription(description);
                    

        System.out.println("Duration: " + audiobook.getDuration());
        System.out.println("Title: " + audiobook.getTitle());
        System.out.println("Author: " + audiobook.getAuthor());


        for (Chapter chapter : audiobook.getChapters()) {
            System.out.println("Chapter: " + chapter.getTitle() + " Start time: " + chapter.getStartTimeMs());
        }
        return audiobook;
    }
}