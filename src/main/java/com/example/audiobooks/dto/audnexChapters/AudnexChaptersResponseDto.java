package com.example.audiobooks.dto.audnexChapters;

import java.util.List;

public record AudnexChaptersResponseDto(
    String asin,
    int brandIntroDurationMs,
    int brandOutroDurationMs,
    List<AudnexChapterDto> chapters,
    boolean isAccurate,
    String region,
    long runtimeLengthMs,
    long runtimeLengthSec
) {}