package com.example.audiobooks.dto.audiobook;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter

public class AudiobookResponse {

    private Long id;
    private String title;
    private String author;
    private String narrator;
    private double duration;

}
