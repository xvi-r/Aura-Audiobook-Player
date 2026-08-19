package com.example.audiobooks.service;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.example.audiobooks.dto.user.UserRegisterRequest;
import com.example.audiobooks.dto.user.UserRegisterResponse;
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
    private final PasswordEncoder passwordEncoder;
    

    public UserRegisterResponse registerUser(UserRegisterRequest request) {
        if( userRepository.existsByUsername(request.getUsername())) {
            //Custom exception here so we can specfically deal with it later 
            throw new UserNameAlreadyExistsException("Username Already Exists");
        }

        String passwordHash = passwordEncoder.encode(request.getPassword());

        User user = new User();

        user.setUsername(request.getUsername());
        user.setPassword(passwordHash);

        userRepository.save(user);

        return new UserRegisterResponse(user.getId(), user.getUsername());
    }
}
