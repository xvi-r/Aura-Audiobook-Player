package com.example.audiobooks.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
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

//@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor

public class UserController {

    private final UserService userService;
    private final SecurityContextRepository securityContextRepository;

    @PostMapping("/register")
    public ResponseEntity<UserRegisterResponse> registerUser(@RequestBody UserRegisterRequest userRegisterRequest) {
        UserRegisterResponse userRegisterResponse = userService.registerUser(userRegisterRequest);

        return ResponseEntity.status(HttpStatus.CREATED).body(userRegisterResponse);
    }

    @PostMapping("/login")
    public ResponseEntity<Void> login(
            @RequestBody UserLoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {

        // httpRequest represents the incoming request.
        // The HTTP session infrastructure uses it to resolve the associated http
        // session (via use of the Jsession id in the cookie)

        Authentication authentication = userService.login(request);

        SecurityContext context = SecurityContextHolder.createEmptyContext();

        context.setAuthentication(authentication);

        SecurityContextHolder.setContext(context);

        // Save the SecurityContext in the HttpSession associated with this request. The
        // HTTP session infrastructure handles
        // the Jsession id -> httpsession lookup

        // Later when an authenticated request comes in Spring Security can load this
        // securityContext from the session and make it available through the
        // SecurityContextHolder.
        securityContextRepository.saveContext(
                context,
                httpRequest,
                httpResponse);

        return ResponseEntity.ok().build();
    }

}