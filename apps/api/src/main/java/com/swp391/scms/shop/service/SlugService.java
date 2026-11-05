package com.swp391.scms.shop.service;

import java.text.Normalizer;
import java.util.Locale;

public final class SlugService {
    private static final int MAX_LENGTH = 180;

    private SlugService() {}

    public static String slugify(String input) {
        if (input == null || input.isBlank()) {
            return "";
        }
        String decomposed = Normalizer.normalize(input.trim(), Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "")
                .replace('đ', 'd')
                .replace('Đ', 'd')
                .toLowerCase(Locale.ROOT);
        String slug = decomposed
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        if (slug.length() > MAX_LENGTH) {
            slug = slug.substring(0, MAX_LENGTH).replaceAll("-+$", "");
        }
        return slug;
    }
}
