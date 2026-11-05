package com.swp391.scms.common.i18n;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Properties;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class MessageBundlesConsistencyTest {

    private static Set<String> keys(String file) throws Exception {
        Properties p = new Properties();
        try (InputStream in = MessageBundlesConsistencyTest.class.getResourceAsStream("/i18n/" + file)) {
            p.load(new InputStreamReader(in, StandardCharsets.UTF_8));
        }
        return new TreeSet<>(p.stringPropertyNames());
    }

    private static List<String> duplicateKeys(String file) throws Exception {
        Set<String> seen = new LinkedHashSet<>();
        List<String> duplicates = new ArrayList<>();
        try (InputStream in = MessageBundlesConsistencyTest.class.getResourceAsStream("/i18n/" + file);
             BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                    continue;
                }
                int eq = trimmed.indexOf('=');
                if (eq > 0) {
                    String key = trimmed.substring(0, eq).trim();
                    if (!seen.add(key)) {
                        duplicates.add(key);
                    }
                }
            }
        }
        return duplicates;
    }

    @Test
    void allBundlesDefineTheSameKeysAndHaveNoDuplicates() throws Exception {
        Set<String> vi = keys("messages_vi.properties");
        assertTrue(vi.size() > 100);
        assertEquals(vi, keys("messages_en.properties"));
        assertEquals(vi, keys("messages.properties"));

        assertEquals(List.of(), duplicateKeys("messages_vi.properties"), "Duplicate keys in messages_vi.properties");
        assertEquals(List.of(), duplicateKeys("messages_en.properties"), "Duplicate keys in messages_en.properties");
        assertEquals(List.of(), duplicateKeys("messages.properties"), "Duplicate keys in messages.properties");
    }

    @Test
    void allReferencedJavaMessageKeysExistInBundles() throws Exception {
        Set<String> vi = keys("messages_vi.properties");
        Path mainJava = Path.of("src/main/java");
        if (!Files.isDirectory(mainJava)) {
            return;
        }
        Pattern getMessagePattern = Pattern.compile("getMessage\\(\\s*\"([a-z0-9_.-]+)\"\\s*(?:,|\\))");
        Pattern validationPattern = Pattern.compile("message\\s*=\\s*\"\\{([a-z0-9_.-]+)\\}\"");
        Set<String> missing = new TreeSet<>();

        try (Stream<Path> paths = Files.walk(mainJava)) {
            for (Path file : paths.filter(p -> p.toString().endsWith(".java")).toList()) {
                String source = Files.readString(file, StandardCharsets.UTF_8);
                Matcher m1 = getMessagePattern.matcher(source);
                while (m1.find()) {
                    String key = m1.group(1);
                    if (key.contains(".") && !key.endsWith(".") && !vi.contains(key)) {
                        missing.add(key + " (" + file.getFileName() + ")");
                    }
                }
                Matcher m2 = validationPattern.matcher(source);
                while (m2.find()) {
                    String key = m2.group(1);
                    if (key.contains(".") && !key.endsWith(".") && !vi.contains(key)) {
                        missing.add(key + " (" + file.getFileName() + ")");
                    }
                }
            }
        }

        assertFalse(!missing.isEmpty(), "Missing i18n keys referenced in Java code: " + missing);
    }
}
