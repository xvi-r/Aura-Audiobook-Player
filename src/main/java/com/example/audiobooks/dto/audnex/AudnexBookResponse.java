package com.example.audiobooks.dto.audnex;

import java.time.LocalDate;
import java.util.List;

import lombok.Getter;

@Getter

public class AudnexBookResponse {

    private String asin;
    private String rating;
    private List<AuthorResponse> authors;
    private String description;
    private List<GenreResponse> genres;
    private String image;
    private List<NarratorResponse> narrators;
    private String publisherName;
    private String isbn;
    private String language;
    private LocalDate releaseDate;
    private Double runtimeLengthMin;
    private String title;
    private String summary;
    
}
