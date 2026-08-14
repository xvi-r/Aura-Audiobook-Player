package com.example.audiobooks.parser.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@JsonIgnoreProperties(ignoreUnknown = true)

public class FFprobeFormat {
    private Double duration;
    private FFprobeFormatTags tags;
}
