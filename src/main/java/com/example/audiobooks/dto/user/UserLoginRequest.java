package com.example.audiobooks.dto.user;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter

//identical to registerrequest but better to avoid confusion
@AllArgsConstructor
public class UserLoginRequest {

    private String username;
    private String password;
}