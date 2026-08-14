package com.example.audiobooks.parser.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@JsonIgnoreProperties(ignoreUnknown = true)

public class FFprobeResponse {
    //only used for m4bs 
    private List<FFprobeChapter> chapters;
    
    private FFprobeFormat format;
}
