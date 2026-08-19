package com.example.audiobooks.controller;

import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.RestController;

import com.example.audiobooks.service.AudiobookProgressService;
import com.example.audiobooks.service.AudiobookService;

import lombok.RequiredArgsConstructor;

@CrossOrigin(origins = "*")
@RestController("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final AudiobookService service;
    private final AudiobookProgressService progressService;

}