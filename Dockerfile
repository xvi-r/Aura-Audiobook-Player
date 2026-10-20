# Build stage
FROM maven:3.9.9-eclipse-temurin-21-alpine AS build
WORKDIR /app

COPY pom.xml .
COPY .mvn .mvn
COPY mvnw .
RUN ./mvnw dependency:go-offline -B || true

COPY src src
# Ensure safe template properties are used without baking local host secrets into the image
RUN test -f src/main/resources/application.properties || cp src/main/resources/application.properties.example src/main/resources/application.properties

RUN ./mvnw clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Install system dependencies (ffprobe/ffmpeg for audio parsing)
RUN apk add --no-cache ffmpeg ca-certificates && mkdir -p /app/app-data

COPY --from=build /app/target/audiobooks-0.0.1-SNAPSHOT.jar app.jar
COPY audiobook-web audiobook-web

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
