package com.example.audiobooks.dto.userAudiobook;

import java.time.Instant;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AudiobookProgressResponse {

    private double position;
    private boolean completed;
    private Instant updatedAt;
}