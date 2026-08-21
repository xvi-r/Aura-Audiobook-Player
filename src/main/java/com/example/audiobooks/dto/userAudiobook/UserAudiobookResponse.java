package com.example.audiobooks.dto.userAudiobook;

import java.util.List;

//might be best to start moving dtos to records instead of classes
public record UserAudiobookResponse(
        Long id,
        String title,
        String author,
        double duration,
        List<String> genres,
        double position,
        boolean completed
) {}
