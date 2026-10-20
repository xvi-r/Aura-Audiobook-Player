package com.example.audiobooks.service;

import com.example.audiobooks.dto.audiobook.AudiobookResponse;
import com.example.audiobooks.dto.audnex.AudnexBookResponse;
import com.example.audiobooks.dto.audnexChapters.AudnexChapterDto;
import com.example.audiobooks.dto.audnexChapters.AudnexChaptersResponseDto;
import com.example.audiobooks.entity.Audiobook;
import com.example.audiobooks.entity.Chapter;
import com.example.audiobooks.entity.Series;
import com.example.audiobooks.entity.UserAudiobook;
import com.example.audiobooks.exception.AudiobookNotFoundException;
import com.example.audiobooks.parser.M4Bparser;
import com.example.audiobooks.parser.MP3Parser;
import com.example.audiobooks.repository.AudiobookRepository;
import com.example.audiobooks.repository.SeriesRepository;
import com.example.audiobooks.repository.UserAudiobookRepository;
import com.example.audiobooks.repository.UserRepository;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;

import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.InputStreamResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
@RequiredArgsConstructor
public class AudiobookService {

    private final AudiobookRepository repository;
    private final UserAudiobookRepository userAudiobookRepository;
    private final SeriesRepository seriesRepository;
    private final UserRepository userRepository;
    private final M4Bparser parser;
    private final MP3Parser mp3Parser;
    private final RestClient restClient;
    private final FileStorageService fileStorageService;

    // TODO Check if this will be needed at all, if not remove it
    // public List<AudiobookResponse> getAllAudiobooks() {
    // return repository.findAll()
    // .stream()
    // .map(audiobook -> {
    // AudiobookProgress audiobookProgress =
    // progressRepository.findByAudiobookId(audiobook.getId()).orElse(null);
    // return audiobookMapper.toResponse(audiobook, audiobookProgress);
    // })
    // .toList();
    // }

    public Audiobook getAudiobookById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new AudiobookNotFoundException(id));
    }

    public Audiobook getAudiobookByIdForUser(Long id, Long userId) {
        return repository.findAudiobookForUser(id, userId)
                .orElseThrow(() -> new AudiobookNotFoundException(id));
    }

    public Audiobook saveAudiobook(Audiobook audiobook) {
        return repository.save(audiobook);
    }

    public Resource getCover(Long id) throws IOException {
        Audiobook audiobook = getAudiobookById(id);

        Path coverPath = Paths.get(audiobook.getCoverPath());

        return new FileSystemResource(coverPath);
    }

    public void importAudiobook(MultipartFile upload, Long id) throws Exception {

        String originalFilename = upload.getOriginalFilename();

        // get the filetype - prior to this it was hardcoded to m4b
        String suffix = ".bin";
        if (originalFilename != null) {
            String filename = Paths.get(originalFilename).getFileName().toString();
            int dot = filename.lastIndexOf('.');
            if (dot > 0 && dot < filename.length() - 1) {
                suffix = filename.substring(dot).toLowerCase(Locale.ROOT);
            }
        }

        log.info("Importing audiobook file type: {}", suffix);

        File tempFile = File.createTempFile("upload-", suffix);

        upload.transferTo(tempFile);

        Audiobook audiobook = (suffix.equals(".m4b")) ? parser.parse(tempFile) : mp3Parser.mp3Parse(tempFile);
        repository.save(audiobook);

        // so each audiobook has it's own folder
        Path audiobookDir = Paths.get(
                "app-data",
                "audiobooks",
                audiobook.getId().toString());

        Files.createDirectories(audiobookDir);

        Path audiobookPath = audiobookDir.resolve("audiobook" + suffix);
        Path coverPath = audiobookDir.resolve("cover.jpg");

        log.debug("Setting audiobook file path: {}", audiobookPath);
        audiobook.setFilePath(audiobookPath.toString());
        audiobook.setCoverPath(coverPath.toString());

        Files.move(
                tempFile.toPath(),
                audiobookPath,
                StandardCopyOption.REPLACE_EXISTING);

        extractCover(audiobookPath.toFile(), coverPath);

        log.debug("Cleaned up temp upload file: {}", tempFile.getAbsolutePath());

        repository.save(audiobook);

        UserAudiobook userAudiobook = new UserAudiobook();
        userAudiobook.setUser(userRepository.getReferenceById(id));
        userAudiobook.setAudiobook(audiobook);
        userAudiobook.setCompleted(false);
        userAudiobook.setPosition(0.0);

        userAudiobookRepository.save(userAudiobook);
        log.info("Audiobook imported successfully: id={}, title={}", audiobook.getId(), audiobook.getTitle());

    }

    private File extractCover(File audiobookFile, Path coverPath) throws IOException, InterruptedException {

        File coverFile = File.createTempFile("cover-", ".jpg");

        log.info("Extracting cover via FFmpeg from {} to {}", audiobookFile.getAbsolutePath(), coverPath);

        ProcessBuilder builder = new ProcessBuilder(
                "ffmpeg",
                "-y",
                "-i", audiobookFile.getAbsolutePath(),
                "-map", "0:v:0",
                "-frames:v", "1",
                coverPath.toString());

        builder.redirectErrorStream(true);

        Process process = builder.start();

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream()))) {

            String line;

            while ((line = reader.readLine()) != null) {
                log.debug("FFmpeg output: {}", line);
            }
        }

        int exitCode = process.waitFor();

        if (exitCode != 0) {
            log.warn("FFmpeg could not extract cover image from {} (file may lack embedded artwork)", audiobookFile.getName());
        }

        return coverFile;
    }

    public ResponseEntity<Resource> getAudioFile(Long id, String range)
            throws IOException {

        Audiobook audiobook = getAudiobookById(id);

        Path path = Paths.get(audiobook.getFilePath());

        if (!Files.exists(path) || !Files.isRegularFile(path)) {
            throw new FileNotFoundException(
                    "Audio file not found: " + path.toAbsolutePath());
        }

        long fileLength = Files.size(path);
        log.info("Streaming audio file: audiobookId={}, filename={}, range={}", id, path.getFileName(), range != null ? range : "FULL_FILE");

        // No Range header: return the entire file
        if (range == null) {

            Resource resource = new FileSystemResource(path);

            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType("audio/mp4"))
                    .contentLength(fileLength)
                    .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                    .body(resource);
        }

        // Parse: bytes=1000000-1999999
        HttpRange httpRange = HttpRange.parseRanges(range).get(0);

        long start = httpRange.getRangeStart(fileLength);
        long end = httpRange.getRangeEnd(fileLength);

        // Validate range
        if (start < 0 || start >= fileLength || end < start) {
            return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                    .header(HttpHeaders.CONTENT_RANGE, "bytes */" + fileLength)
                    .build();
        }

        long contentLength = end - start + 1;

        InputStream inputStream = Files.newInputStream(path);

        // Move the stream to the requested starting byte
        inputStream.skipNBytes(start);

        InputStream limitedStream = new InputStream() {

            private long remaining = contentLength;

            @Override
            public int read() throws IOException {

                if (remaining <= 0) {
                    return -1;
                }

                int value = inputStream.read();

                if (value != -1) {
                    remaining--;
                }

                return value;
            }

            @Override
            public int read(byte[] buffer, int offset, int length)
                    throws IOException {

                if (remaining <= 0) {
                    return -1;
                }

                int bytesToRead = (int) Math.min(length, remaining);

                int bytesRead = inputStream.read(
                        buffer,
                        offset,
                        bytesToRead);

                if (bytesRead > 0) {
                    remaining -= bytesRead;
                }

                return bytesRead;
            }

            @Override
            public void close() throws IOException {
                inputStream.close();
            }
        };

        Resource resource = new InputStreamResource(limitedStream);

        return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                .contentType(MediaType.parseMediaType("audio/mp4"))
                .contentLength(contentLength)
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .header(
                        HttpHeaders.CONTENT_RANGE,
                        "bytes " + start + "-" + end + "/" + fileLength)
                .body(resource);
    }

    @Transactional
    public void enrichAudiobookByAsin(Long audiobookId, String asin, String country, Boolean fetchChapters) {
        log.info("Enriching audiobook metadata via Audnex API: audiobookId={}, asin={}, country={}, fetchChapters={}",
                audiobookId, asin, country, fetchChapters);

        Audiobook audiobook = repository.findById(audiobookId)
                .orElseThrow(() -> new RuntimeException("Audiobook not found"));

        AudnexBookResponse response = restClient.get()
                .uri("https://api.audnex.us/books/{asin}?region={country}", asin, country)
                .retrieve()
                .body(AudnexBookResponse.class);

        // TODO allow for multiple narrators and authors, download cover
        audiobook.setAsin(response.getAsin());
        audiobook.setTitle(response.getTitle());
        audiobook.setRating(response.getRating());
        audiobook.setDescription(response.getSummary());
        audiobook.setAuthor(response.getAuthors().get(0).getName());
        audiobook.setNarrator(response.getNarrators().get(0).getName());
        audiobook.setCoverPath(downloadCover(response.getImage(), audiobookId));
                if (audiobook.getDuration() == null || audiobook.getDuration() <= 0) {
            audiobook.setDuration(response.getRuntimeLengthMin() * 60);
        }

        if (response.getSeriesPrimary() != null) {

        
        Series series = seriesRepository.findByAsin(response.getSeriesPrimary().getAsin()).orElseGet(() -> {
                Series newSeries = new Series();

                newSeries.setAsin(response.getSeriesPrimary().getAsin());
                newSeries.setName(response.getSeriesPrimary().getName());

                return seriesRepository.save(newSeries);
            });

            audiobook.setSeries(series);
        }

        

        if( fetchChapters ) { enrichChaptersByAsin(audiobook, asin, country);}

    }

    private void enrichChaptersByAsin(Audiobook audiobook, String asin, String country) {
        AudnexChaptersResponseDto response = restClient.get()
                .uri("https://api.audnex.us/books/{asin}/chapters?region={country}", asin, country)
                .retrieve()
                .body(AudnexChaptersResponseDto.class);

        if (response == null || response.chapters() == null || response.chapters().isEmpty()) {
            return;
        }

        // Calculate proportional scaling ratio to absorb cumulative timeline drift
        double scaleRatio = 1.0;
        AudnexChapterDto lastChapter = response.chapters().get(response.chapters().size() - 1);
        double audnexTotalSec = (double) (lastChapter.startOffsetMs() + lastChapter.lengthMs()) / 1000.0;

        if (audiobook.getDuration() != null && audiobook.getDuration() > 0 && audnexTotalSec > 0) {
            double ratio = audiobook.getDuration() / audnexTotalSec;
            // Only apply scaling if within a reasonable +/- 5% range (avoids mis-scaling split/partial files)
            if (ratio >= 0.95 && ratio <= 1.05) {
                scaleRatio = ratio;
                log.info("Calibrating chapter timestamps with scale ratio {}: fileDuration={}s, audnexTotal={}s",
                        scaleRatio, audiobook.getDuration(), audnexTotalSec);
            }
        }

        List<Chapter> newChapters = new ArrayList<>();

        for (int i = 0; i < response.chapters().size(); i++) {
            AudnexChapterDto chapter = response.chapters().get(i);

            double startTime = ((double) chapter.startOffsetMs() / 1000.0) * scaleRatio;
            double endTime = ((double) (chapter.startOffsetMs() + chapter.lengthMs()) / 1000.0) * scaleRatio;

            Chapter newChapter = Chapter.builder()
                    .title(chapter.title())
                    .startTimeMs(startTime)
                    .endTimeMs(endTime)
                    .chapterNumber(i + 1)
                    .audiobook(audiobook)
                    .build();

            newChapters.add(newChapter);
        }
        audiobook.getChapters().clear();
        audiobook.getChapters().addAll(newChapters);
    }

    public String downloadCover(String imageUrl, Long audiobookId)  {

        try {
            byte[] image = restClient.get()
                    .uri(imageUrl)
                    .retrieve()
                    .body(byte[].class);

            Path directory = Paths.get(
                    "app-data",
                    "audiobooks",
                    audiobookId.toString());

            Files.createDirectories(directory);

            Path coverPath = directory.resolve("cover.jpg");

            Files.write(coverPath, image);

            return coverPath.toString();
            //TODO should probably make our own exception for this
        } catch (IOException e) {
            throw new RuntimeException("Failed to download cover", e);
        }
    }

    @Transactional
    public void deleteAudiobook(Long id) {
        Audiobook audiobook = repository.findById(id)
                .orElseThrow(() ->
                        new EntityNotFoundException(
                                "Audiobook not found with id: " + id
                        )
                );
        repository.delete(audiobook);
        fileStorageService.delete("app-data/audiobooks/" + audiobook.getId());
        
    }

}