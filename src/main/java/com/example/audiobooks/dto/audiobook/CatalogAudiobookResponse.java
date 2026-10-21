package com.example.audiobooks.dto.audiobook;

import java.time.Instant;
import java.util.List;

public record CatalogAudiobookResponse(
        Long audioBookId,
        String title,
        String author,
        String narrator,
        double duration,
        List<String> genres,
        double position,
        boolean completed,
        Instant lastPlayedAt
) {}