package com.example.audiobooks.dto.audnex;

import java.util.List;

public class AudnexBookResponse {

    private String asin;
    private List<AuthorResponse> authors;
    private String description;
    private List<GenreResponse> genres;
    private String image;
    private List<NarratorResponse> narrators;
    private String publisherName;
    private String isbn;
    private String language;
    private String releaseDate;
    private Double runtimeLengthMin;
    private String title;
}
