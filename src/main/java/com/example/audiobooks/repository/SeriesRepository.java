package com.example.audiobooks.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.example.audiobooks.entity.Series;

@Repository
public interface SeriesRepository extends JpaRepository<Series, Long> {

    Optional<Series> findByAsin(String asin);
}
