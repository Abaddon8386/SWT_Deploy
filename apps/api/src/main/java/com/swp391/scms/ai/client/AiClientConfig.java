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
        String effectiveProvider = provider;
        String effectiveApiKey = apiKey;
        String effectiveModel = model;
        if ((effectiveApiKey == null || effectiveApiKey.isBlank())
                && (effectiveProvider == null || effectiveProvider.isBlank() || "mock".equalsIgnoreCase(effectiveProvider))) {
            var dotEnv = AiChatProvider.readDefaultDotEnv();
            effectiveProvider = dotEnv.getOrDefault("SCMS_AI_PROVIDER", effectiveProvider);
            effectiveApiKey = dotEnv.getOrDefault("SCMS_AI_API_KEY", effectiveApiKey);
            effectiveModel = dotEnv.getOrDefault("SCMS_AI_MODEL", effectiveModel);
        }
        if ("openai".equalsIgnoreCase(effectiveProvider) && effectiveApiKey != null && !effectiveApiKey.isBlank()) {
            return new OpenAiRestClient(effectiveApiKey, effectiveModel);
        } else if ("groq".equalsIgnoreCase(effectiveProvider) && effectiveApiKey != null && !effectiveApiKey.isBlank()) {
            String groqModel = (effectiveModel != null && !effectiveModel.isBlank()) ? effectiveModel : "llama-3.3-70b-versatile";
            return new OpenAiRestClient(effectiveApiKey, groqModel, "https://api.groq.com/openai/v1", "groq");
        } else if ("gemini".equalsIgnoreCase(effectiveProvider) && effectiveApiKey != null && !effectiveApiKey.isBlank()) {
            return new GeminiRestClient(effectiveApiKey, effectiveModel);
        }
        return new MockAiClient(effectiveModel);
    }
}
