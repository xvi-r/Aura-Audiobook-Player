package com.example.audiobooks.exception;

public class NoPlayedAudiobookException extends RuntimeException{
    public NoPlayedAudiobookException(String message) {
        super(message);
    }
}
