# Aura
A local audiobook and EPUB library application. It includes a Spring Boot API for importing, cataloguing, and streaming media, a browser-based interface, and an Electron desktop shell.

## Features

- Import M4B, MP3, and M4A audiobooks and read their metadata and chapters.
- Extract audiobook cover art with FFmpeg.
- Import EPUB e-books, optionally associating them with an audiobook.
- Browse library metadata, cover art, audio files, and EPUB files through the REST API.
- Run the web interface in a browser or in the Electron desktop app.

## Project layout

```text
src/                 Spring Boot API and media parsers
audiobook-web/       Static web interface
electron/            Electron desktop wrapper
app-data/            Local imported media and generated covers (not committed)
```

## Requirements

- Java 21
- PostgreSQL
- FFmpeg and FFprobe available on your `PATH`
- Node.js and npm (only for the Electron app)

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
python -m http.server 8000
```

Open `http://127.0.0.1:8000` in a browser. The web app connects to the API at port 8080 by default. Its Settings page can store a different server URL locally if needed.

To use the desktop shell, with both the API and the web server running:

```powershell
cd electron
npm install
npm start
```

To build the Windows desktop installer:

```powershell
npm run build
```

The build output is generated in `electron/dist/` and is not committed.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/audiobooks` | List audiobooks |
| `GET` | `/api/audiobooks/{id}` | Get audiobook metadata |
| `POST` | `/api/upload` | Upload an audiobook as multipart field `file` |
| `GET` | `/api/audiobooks/{id}/cover` | Get cover art |
| `GET` | `/api/audiobooks/{id}/file` | Stream the audio file (supports range requests) |
| `GET` | `/api/EBooks` | List EPUB e-books |
| `GET` | `/api/EBooks/{id}` | Get EPUB metadata |
| `POST` | `/api/uploadEpub/{id}` | Upload an EPUB associated with audiobook `{id}` |
| `GET` | `/api/epub/{id}` | Download an EPUB |

## Media and privacy

Imported media is stored under `app-data/`. This directory can contain personal library data and large copyrighted files, so it is excluded from Git. Do not force-add it.

Also excluded are local configuration, Node dependencies, Java build artifacts, and generated Electron installers. Before committing, check the staged contents:

```powershell
git status
```

## Development

Run the backend test suite:

```powershell
.\mvnw.cmd test
```
