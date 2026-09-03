package com.example.audiobooks.repository;

import static org.assertj.core.api.Assertions.assertThat;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import com.example.audiobooks.entity.Audiobook;
import com.example.audiobooks.entity.User;
import com.example.audiobooks.entity.UserAudiobook;

import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;

@DataJpaTest
public class UserAudiobookRepositoryTest {

    @Autowired
    private UserAudiobookRepository repository;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    @DisplayName("Should return top 8 played audiobooks in descending order by lastPlayedAt")
    void testContinueListeningQuery() {

        User user1 = createTestUser("testUser1");

        for(int i = 1; i<=10; i++)
        {
            Audiobook book = createTestAudiobook("Book " + i);
            Instant playedAt = Instant.now().minusSeconds(1000L - (i * 100L)); // Book 10 is newest
            createTestUserAudiobook(user1, book, playedAt);
        }

        Audiobook unplayedBook = createTestAudiobook("Unplayed Book");
        createTestUserAudiobook(user1, unplayedBook, null);

        List<UserAudiobook> results = repository
                .findTop8ByUserIdAndLastPlayedAtIsNotNullOrderByLastPlayedAtDesc(user1.getId());
        
        assertThat(results).hasSize(8);

        assertThat(results.get(0).getAudiobook().getTitle()).isEqualTo("Book 10");
    }

    private User createTestUser(String username) {
        User u = new User();
        u.setUsername(username);
        u.setPassword("password");
        return entityManager.persistAndFlush(u);
    }

    private Audiobook createTestAudiobook(String title) {
        Audiobook a = new Audiobook();
        a.setTitle(title);
        a.setAuthor("Author");
        a.setDuration(100.0);
        return entityManager.persistAndFlush(a);
    }

    private UserAudiobook createTestUserAudiobook(User u, Audiobook a, Instant lastPlayedAt) {
        UserAudiobook ua = new UserAudiobook();
        ua.setUser(u);
        ua.setAudiobook(a);
        ua.setLastPlayedAt(lastPlayedAt);
        return entityManager.persistAndFlush(ua);
    }
}