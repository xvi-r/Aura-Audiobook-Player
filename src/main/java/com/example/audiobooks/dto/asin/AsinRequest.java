package com.example.audiobooks.dto.asin;

import lombok.Getter;
import lombok.Setter;


public record AsinRequest(String asin, String country) {
    
}
