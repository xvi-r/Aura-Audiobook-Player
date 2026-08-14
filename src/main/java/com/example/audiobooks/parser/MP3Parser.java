package com.example.audiobooks.parser;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStream;
import java.io.InputStreamReader;

import org.springframework.stereotype.Service;

import com.example.audiobooks.entity.Audiobook;
import com.example.audiobooks.parser.dto.FFprobeResponse;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class MP3Parser {
    
    public Audiobook mp3Parse(File file) throws Exception {
        ProcessBuilder builder = new ProcessBuilder(
            "ffprobe",
            "-v", "quiet",
            "-show_format",
            "-of", "json",
            file.getAbsolutePath()
        );

        // let's us read the error using getInputStream()
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

        Audiobook audiobook = new Audiobook();

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

        return audiobook;
    }
}
