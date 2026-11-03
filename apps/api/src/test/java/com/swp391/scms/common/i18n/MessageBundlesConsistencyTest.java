package com.swp391.scms.common.i18n;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.util.Properties;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;
import java.util.Locale;

class MessageBundlesConsistencyTest {

    private static Set<String> keys(String file) throws Exception {
        Properties p = new Properties();
        try (InputStream in = MessageBundlesConsistencyTest.class.getResourceAsStream("/i18n/" + file)) {
            p.load(new java.io.InputStreamReader(in, java.nio.charset.StandardCharsets.UTF_8));
        }
        return new TreeSet<>(p.stringPropertyNames());
    }

    @Test
    void allBundlesDefineTheSameKeys() throws Exception {
        Set<String> vi = keys("messages_vi.properties");
        assertTrue(vi.size() > 100);
        assertEquals(vi, keys("messages_en.properties"));
        assertEquals(vi, keys("messages.properties"));
    }
}
