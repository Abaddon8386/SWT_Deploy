package com.swp391.scms.ai.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Spring configuration registering the active {@link AiClient}.
 * Automatically falls back to {@link MockAiClient} when no API key is set or mock is chosen.
 */
@Configuration
public class AiClientConfig {

    @Value("${scms.ai.provider:mock}")
    private String provider;

    @Value("${scms.ai.api-key:}")
    private String apiKey;

    @Value("${scms.ai.model:}")
    private String model;

    @Bean
    public AiClient aiClient() {
        if ("openai".equalsIgnoreCase(provider) && apiKey != null && !apiKey.isBlank()) {
            return new OpenAiRestClient(apiKey, model);
        } else if ("groq".equalsIgnoreCase(provider) && apiKey != null && !apiKey.isBlank()) {
            String groqModel = (model != null && !model.isBlank()) ? model : "llama-3.3-70b-versatile";
            return new OpenAiRestClient(apiKey, groqModel, "https://api.groq.com/openai/v1", "groq");
        } else if ("gemini".equalsIgnoreCase(provider) && apiKey != null && !apiKey.isBlank()) {
            return new GeminiRestClient(apiKey, model);
        }
        return new MockAiClient(model);
    }
}
