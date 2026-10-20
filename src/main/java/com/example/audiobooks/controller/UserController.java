package com.example.audiobooks.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.CookieClearingLogoutHandler;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.audiobooks.dto.user.UserLoginRequest;
import com.example.audiobooks.dto.user.UserRegisterRequest;
import com.example.audiobooks.dto.user.UserRegisterResponse;

import com.example.audiobooks.service.UserService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;

import lombok.extern.slf4j.Slf4j;

//@CrossOrigin(origins = "*")
@Slf4j
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final SecurityContextRepository securityContextRepository;

    @PostMapping("/register")
    public ResponseEntity<UserRegisterResponse> registerUser(
            @RequestBody UserRegisterRequest userRegisterRequest,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {

        log.info("Processing account registration request for username: {}", userRegisterRequest.getUsername());
        UserRegisterResponse userRegisterResponse = userService.registerUser(userRegisterRequest);

        UserLoginRequest loginRequest = new UserLoginRequest(
                userRegisterRequest.getUsername(),
                userRegisterRequest.getPassword()
        );

        Authentication authentication = userService.login(loginRequest);
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);

        securityContextRepository.saveContext(
                context,
                httpRequest,
                httpResponse);

        log.info("User registered and auto-logged in: username={}", userRegisterRequest.getUsername());
        return ResponseEntity.status(HttpStatus.CREATED).body(userRegisterResponse);
    }

    @PostMapping("/login")
    public ResponseEntity<Void> login(
            @RequestBody UserLoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {

        log.info("Processing login request for username: {}", request.getUsername());

        Authentication authentication = userService.login(request);

        SecurityContext context = SecurityContextHolder.createEmptyContext();

        context.setAuthentication(authentication);

        SecurityContextHolder.setContext(context);

        securityContextRepository.saveContext(
                context,
                httpRequest,
                httpResponse);

        log.info("User logged in successfully: username={}", request.getUsername());

        return ResponseEntity.ok().build();
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication) {

        // 1. Invalidates session (Postgres delete) & clears SecurityContext
        new SecurityContextLogoutHandler().logout(request, response, authentication);

        // 2. Instructs response to wipe the JSESSIONID cookie
        new CookieClearingLogoutHandler("JSESSIONID").logout(request, response, authentication);

        log.info("User session terminated and cookie cleared.");
        return ResponseEntity.noContent().build(); // 204 No Content
    }

}
