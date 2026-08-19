package com.example.audiobooks.service;

import org.springframework.stereotype.Service;

import com.example.audiobooks.dto.user.UserRegisterRequest;
import com.example.audiobooks.entity.User;
import com.example.audiobooks.exception.UserNameAlreadyExistsException;
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
    

    public UserResponse Register(UserRegisterRequest request) {
        if( userRepository.existsByUsername(request.getUsername())) {
            //Custom exception here so we can specfically deal with it later 
            throw new UserNameAlreadyExistsException("Username Already Exists");
        }

        User user = new User();
        user.setUsername(request.getUsername());



    }
}
