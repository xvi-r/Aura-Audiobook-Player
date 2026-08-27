# Aura - Audiobook Player

![Status](https://img.shields.io/badge/status-in%20development-f59e0b?style=plastic)
![Java](https://img.shields.io/badge/Java-21-ED8B00?style=plastic&logo=openjdk&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-4.1.0-6DB33F?style=plastic&logo=springboot&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-43-47848F?style=plastic&logo=electron&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8D5?style=plastic&logo=tauri&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-supported-4169E1?style=plastic&logo=postgresql&logoColor=white)
![API](https://img.shields.io/badge/API-Swagger%20%2F%20OpenAPI-85EA2D?style=plastic&logo=swagger&logoColor=black)

A local audiobook and EPUB library application. It includes a Spring Boot API for importing, cataloguing, and streaming media, a browser-based interface, and Electron / Tauri desktop shells.

> **Development status:** This is an in-development project, not a finished product. Features, APIs, and data formats may change, and some edge cases still need refinement, Electron is also not fully supported yet.

## Features

- User authentication & session management (Spring Security, BCrypt password hashing, and HttpOnly `JSESSIONID` session cookies).
- Multi-tenant library isolation and user-specific playback progress syncing (`position` and `completed` status per user).
- Import M4B, MP3, and M4A audiobooks and read their metadata and chapters.
- Automatically associate uploaded audiobooks with the authenticated user.
- Extract audiobook cover art with FFmpeg.
- Import EPUB e-books, optionally associating them with an audiobook.
- Browse library metadata, cover art, audio files, and EPUB files through the REST API.
- Correct incomplete or unreliable embedded audiobook metadata with an Audible ASIN. The web UI can retrieve title, cover, series, publisher, genres, runtime, and chapter timestamps from Audnex.
- Look up selected words while reading EPUBs using dictionary and Wikipedia results, with a Wookieepedia (Star Wars Fandom) lookup when a general definition is not available.
- Run the web interface in a browser, Electron desktop app, or Tauri desktop app.

## Project layout

```text
src/                 Spring Boot API and media parsers
audiobook-web/       Static web interface
electron/            Electron desktop wrapper
tauri/               Tauri desktop wrapper
app-data/            Local imported media and generated covers (not committed)
```

## Requirements

- Java 21
- PostgreSQL
- FFmpeg and FFprobe available on your `PATH`
- Node.js and npm (for Electron and Tauri desktop apps)
- Rust toolchain (`rustc`, `cargo`) (only if building/running the Tauri desktop app)

## Configure the backend

The real Spring configuration is intentionally ignored by Git. Create it from the committed template:

```powershell
Copy-Item src/main/resources/application.properties.example src/main/resources/application.properties
```

Set the PostgreSQL connection values in `src/main/resources/application.properties`:

```properties
spring.datasource.url=jdbc:postgresql://localhost:5432/audiobooks
spring.datasource.username=your_username
spring.datasource.password=your_password
```

Create the database before starting the application. Hibernate is configured to update the schema automatically.

## Run locally

Start the API from the project root:

```powershell
.\mvnw.cmd spring-boot:run
```

The API uses Spring Boot's default address: `http://localhost:8080`.

Serve the web interface on port 8000 in another terminal:

```powershell
cd audiobook-web
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000` in a browser. The web app connects to the API at port 8080 by default. Its Settings page can store a different server URL locally if needed.

### Running with Electron

To use the Electron desktop shell, with both the API and the web server running:

```powershell
cd electron
npm install
npm start
```

To build the Windows Electron installer:

```powershell
npm run build
```

The build output is generated in `electron/dist/` and is not committed.

### Running with Tauri

To use the Tauri desktop shell (requires Rust installed), with the Spring Boot API running:

```powershell
cd tauri
npm run dev
```

To build the standalone Windows desktop binary/installer:

```powershell
cd tauri
npm run build
```


## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/users/register` | Register a new user account |
| `POST` | `/api/users/login` | Authenticate user & establish session (`JSESSIONID`) |
| `POST` | `/api/users/logout` | Terminate user session |
| `GET` | `/api/audiobook/getUserAudiobooks` | Get authenticated user's library & progress |
| `GET` | `/api/audiobooks/recent` | Get user's most recently played audiobook |
| `PUT` | `/api/audiobooks/{id}/progress` | Update user playback progress (`position`, `completed`) |
| `GET` | `/api/audiobooks/{id}/progress` | Get user playback progress |
| `GET` | `/api/audiobooks` | List all audiobooks (global catalog) |
| `GET` | `/api/audiobooks/{id}` | Get audiobook metadata |
| `POST` | `/api/upload` | Upload an audiobook as multipart field `file` |
| `GET` | `/api/audiobooks/{id}/cover` | Get cover art |
| `GET` | `/api/audiobooks/{id}/file` | Stream the audio file (supports range requests) |

## Media and privacy

Imported media is stored under `app-data/`. This directory can contain personal library data and large copyrighted files, so it is excluded from Git. Do not force-add it.

Also excluded are local configuration, Node dependencies, Java build artifacts, and generated Electron installers. Before committing, check the staged contents:

```powershell
git status
```

The ASIN metadata and in-reader lookup features use third-party services (Audnex, DictionaryAPI, Wikipedia, Wiktionary, and Wookieepedia). They need an internet connection, may be unavailable or incomplete, and should be treated as helpful corrections rather than an authoritative source of metadata.

## Development

Run the backend test suite:

```powershell
.\mvnw.cmd test
```

## API documentation

With the backend running, explore and try the REST API in Swagger UI:

```text
http://localhost:8080/swagger-ui/index.html
```
