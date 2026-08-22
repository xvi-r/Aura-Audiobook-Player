package com.example.audiobooks.dto.userAudiobook;

import java.time.Instant;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
public class UserAudiobookProgressResponse {

    private double position;
    private boolean completed;
    private Instant updatedAt;
}