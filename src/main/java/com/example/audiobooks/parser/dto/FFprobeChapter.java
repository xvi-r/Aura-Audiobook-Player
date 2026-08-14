package com.example.audiobooks.parser.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@JsonIgnoreProperties(ignoreUnknown = true)

public class FFprobeChapter {
    private String start_time;
    private String end_time;
    private FFprobeTags tags;
}
