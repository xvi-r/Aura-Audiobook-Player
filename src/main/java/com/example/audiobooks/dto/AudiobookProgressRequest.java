package com.example.audiobooks.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AudiobookProgressRequest {

    private double position;
    private boolean completed;
}