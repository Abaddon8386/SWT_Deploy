package com.swp391.scms;

import com.swp391.scms.common.CenterTime;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

@EnableScheduling
@SpringBootApplication
public class ScmsApplication {
    public static void main(String[] args) {
        CenterTime.useAsDefault();
        loadDotEnv();
        SpringApplication.run(ScmsApplication.class, args);
    }

    private static void loadDotEnv() {
        for (Path path : List.of(Paths.get(".env"), Paths.get("../../.env"), Paths.get("../.env"))) {
            if (Files.isRegularFile(path)) {
                try {
                    for (String line : Files.readAllLines(path)) {
                        String trimmed = line.trim();
                        if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
                        int idx = trimmed.indexOf('=');
                        if (idx > 0) {
                            String key = trimmed.substring(0, idx).trim();
                            String val = trimmed.substring(idx + 1).trim();
                            if (System.getProperty(key) == null && System.getenv(key) == null) {
                                System.setProperty(key, val);
                            }
                        }
                    }
                    break;
                } catch (IOException ignored) {}
            }
        }
        if (System.getProperty("spring.profiles.active") == null && System.getenv("SPRING_PROFILES_ACTIVE") == null) {
            System.setProperty("spring.profiles.active", "supabase");
        }
    }
}
