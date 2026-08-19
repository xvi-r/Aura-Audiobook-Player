package com.example.audiobooks.exception;


public class UserNameAlreadyExistsException extends RuntimeException{

    public UserNameAlreadyExistsException(String message) {
        super(message);
    }

}