package com.example.audiobooks.dto.audnexChapters;

public record AudnexChapterDto(
    long lengthMs,
    long startOffsetMs,
    long startOffsetSec,
    String title
) {}
