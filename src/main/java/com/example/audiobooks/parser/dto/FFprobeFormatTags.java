package com.example.audiobooks.parser.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@JsonIgnoreProperties(ignoreUnknown = true)

public class FFprobeFormatTags {
    private String title;
    private String album;
    private String artist;
    private String composer;
    private String date;
    private String description;
    private String lyrics;
}
