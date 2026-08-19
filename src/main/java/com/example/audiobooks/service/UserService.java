package com.example.audiobooks.service;

import org.springframework.stereotype.Service;

import com.example.audiobooks.entity.User;
import com.example.audiobooks.repository.UserRepository;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;

@Service
@Getter
@Setter
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;
    

    public User Register(RegisterRequest request) {
        
    }
}
