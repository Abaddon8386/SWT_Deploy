package com.swp391.scms.ai.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.swp391.scms.common.exception.ServiceUnavailableException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import java.util.List;
import java.util.Map;

/** Chat-only provider; never falls back to generated mock content. */
@Component
public class AiChatProvider {
    public record Turn(String role, String content) {}
    private final String provider;
    private final String apiKey;
    private final String model;
    private final RestClient client;

    @Autowired
    public AiChatProvider(@Value("${scms.ai.chat.provider:disabled}") String provider,
                          @Value("${scms.ai.chat.api-key:}") String apiKey,
                          @Value("${scms.ai.chat.model:}") String model) {
        this(provider, apiKey, model, builder());
    }

    public AiChatProvider(String provider, String apiKey, String model, RestClient.Builder builder) {
        this.provider = provider != null ? provider.trim().toLowerCase() : "disabled";
        this.apiKey = apiKey;
        this.model = resolveDefaultModel(this.provider, model);
        this.client = builder.build();
    }

    private static String resolveDefaultModel(String provider, String configuredModel) {
        if (configuredModel != null && !configuredModel.isBlank()) {
            return configuredModel.trim();
        }
        return switch (provider) {
            case "gemini" -> "gemini-flash-lite-latest";
            case "groq" -> "llama-3.3-70b-versatile";
            case "openai" -> "gpt-4o-mini";
            default -> "";
        };
    }

    private static RestClient.Builder builder() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(30_000);
        return RestClient.builder().requestFactory(factory);
    }

    public String generate(String systemPrompt, List<Turn> turns) {
        if (apiKey == null || apiKey.isBlank() || model == null || !model.matches("[A-Za-z0-9._-]+")
                || !("openai".equals(provider) || "groq".equals(provider) || "gemini".equals(provider))) {
            throw new ServiceUnavailableException("AI_CHAT_NOT_CONFIGURED", "ai.chat.provider.not_configured", null,
                    "The AI assistant is not configured.");
        }
        try {
            JsonNode response;
            String content;
            if ("openai".equals(provider) || "groq".equals(provider)) {
                String endpoint = "groq".equals(provider)
                        ? "https://api.groq.com/openai/v1/chat/completions"
                        : "https://api.openai.com/v1/chat/completions";
                var messages = new java.util.ArrayList<Map<String, String>>();
                messages.add(Map.of("role", "system", "content", systemPrompt));
                turns.forEach(turn -> messages.add(Map.of("role", turn.role(), "content", turn.content())));
                Map<String, Object> body = "groq".equals(provider)
                        ? Map.of("model", model, "messages", messages, "stream", false)
                        : Map.of("model", model, "messages", messages, "stream", false, "store", false);
                response = client.post().uri(endpoint)
                        .header("Authorization", "Bearer " + apiKey).contentType(MediaType.APPLICATION_JSON)
                        .body(body)
                        .retrieve().body(JsonNode.class);
                content = response == null ? "" : response.path("choices").path(0).path("message").path("content").asText("");
            } else {
                var contents = turns.stream().map(turn -> Map.of("role", "assistant".equals(turn.role()) ? "model" : "user",
                        "parts", List.of(Map.of("text", turn.content())))).toList();
                response = client.post().uri("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent")
                        .header("x-goog-api-key", apiKey).contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("systemInstruction", Map.of("parts", List.of(Map.of("text", systemPrompt))), "contents", contents))
                        .retrieve().body(JsonNode.class);
                StringBuilder text = new StringBuilder();
                if (response != null) response.path("candidates").path(0).path("content").path("parts")
                        .forEach(part -> { if (!part.path("thought").asBoolean(false)) text.append(part.path("text").asText("")); });
                content = text.toString();
            }
            if (content.isBlank()) throw unavailable();
            return content;
        } catch (RestClientException exception) {
            // Do not expose upstream bodies, credentials or prompts in errors/logs.
            throw unavailable();
        }
    }

    private ServiceUnavailableException unavailable() {
        return new ServiceUnavailableException("AI_CHAT_UNAVAILABLE", "ai.chat.provider.unavailable", null,
                "The AI assistant is temporarily unavailable.");
    }
}
