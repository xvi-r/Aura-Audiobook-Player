package com.example.audiobooks.dto.user;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter

//identical to registerrequest but better to avoid confusion
public class UserLoginRequest {

    private String username;
    private String password;
}