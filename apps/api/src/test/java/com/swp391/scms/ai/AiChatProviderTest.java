package com.swp391.scms.ai;

import com.swp391.scms.ai.client.AiChatProvider;
import com.swp391.scms.common.exception.ServiceUnavailableException;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class AiChatProviderTest {
    @Test void openAiUsesRealRequestContractAndExtractsText() {
        RestClient.Builder builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://api.openai.com/v1/chat/completions"))
                .andExpect(header("Authorization", "Bearer unit-test-key"))
                .andExpect(jsonPath("$.messages[1].content").value("Câu hỏi"))
                .andRespond(withSuccess("{\"choices\":[{\"message\":{\"content\":\"Provider answer\"}}]}", MediaType.APPLICATION_JSON));
        var provider = new AiChatProvider("openai", "unit-test-key", "test-model", builder);
        assertEquals("Provider answer", provider.generate("System", List.of(new AiChatProvider.Turn("user", "Câu hỏi"))));
        server.verify();
    }

    @Test void geminiUsesRealRequestContractAndExtractsText() {
        RestClient.Builder builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent"))
                .andExpect(header("x-goog-api-key", "unit-test-key"))
                .andRespond(withSuccess("{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Gemini answer\"}]}}]}", MediaType.APPLICATION_JSON));
        assertEquals("Gemini answer", new AiChatProvider("gemini", "unit-test-key", "test-model", builder)
                .generate("System", List.of(new AiChatProvider.Turn("user", "Question"))));
        server.verify();
    }

    @Test void geminiDefaultsToFlashModelWhenModelIsBlank() {
        RestClient.Builder builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent"))
                .andExpect(header("x-goog-api-key", "unit-test-key"))
                .andRespond(withSuccess("{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Default Gemini answer\"}]}}]}", MediaType.APPLICATION_JSON));
        assertEquals("Default Gemini answer", new AiChatProvider("gemini", "unit-test-key", "", builder)
                .generate("System", List.of(new AiChatProvider.Turn("user", "Question"))));
        server.verify();
    }

    @Test void groqUsesOpenAiCompatibleContractAndDefaultsToLlamaModel() {
        RestClient.Builder builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://api.groq.com/openai/v1/chat/completions"))
                .andExpect(header("Authorization", "Bearer groq-test-key"))
                .andExpect(jsonPath("$.model").value("llama-3.3-70b-versatile"))
                .andRespond(withSuccess("{\"choices\":[{\"message\":{\"content\":\"Groq answer\"}}]}", MediaType.APPLICATION_JSON));
        assertEquals("Groq answer", new AiChatProvider("groq", "groq-test-key", "", builder)
                .generate("System", List.of(new AiChatProvider.Turn("user", "Question"))));
        server.verify();
    }

    @Test void disabledProviderNeverReturnsMockContent() {
        var exception = assertThrows(ServiceUnavailableException.class, () -> new AiChatProvider("mock", "", "", RestClient.builder())
                .generate("System", List.of()));
        assertEquals("The AI assistant is not configured.", exception.getMessage());
        assertEquals("AI_CHAT_NOT_CONFIGURED", exception.getErrorCode());
        assertEquals("ai.chat.provider.not_configured", exception.getMessageKey());
    }

    @Test void upstreamErrorsAreSanitized() {
        RestClient.Builder builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(anything()).andRespond(withServerError());
        var exception = assertThrows(ServiceUnavailableException.class, () -> new AiChatProvider("openai", "unit-test-key", "test-model", builder)
                .generate("System", List.of(new AiChatProvider.Turn("user", "Question"))));
        assertFalse(exception.toString().contains("unit-test-key"));
        assertEquals("The AI assistant is temporarily unavailable.", exception.getMessage());
        assertEquals("AI_CHAT_UNAVAILABLE", exception.getErrorCode());
    }

    @Test void readsDotEnvFallbackWhenSpringEnvIsBlank() throws Exception {
        var tempFile = java.nio.file.Files.createTempFile("scms-ai-test", ".env");
        try {
            java.nio.file.Files.writeString(tempFile, "# Comment\nSCMS_AI_PROVIDER=gemini\nSCMS_AI_MODEL=gemini-3-flash-preview\nSCMS_AI_API_KEY=dotenv-test-key\n");
            var dotEnv = AiChatProvider.readDotEnv(tempFile);
            assertEquals("gemini", dotEnv.get("SCMS_AI_PROVIDER"));
            assertEquals("gemini-3-flash-preview", dotEnv.get("SCMS_AI_MODEL"));
            assertEquals("dotenv-test-key", dotEnv.get("SCMS_AI_API_KEY"));
        } finally {
            java.nio.file.Files.deleteIfExists(tempFile);
        }
    }

    @Test void geminiFallsBackToFlashLiteWhenPrimaryModelFails() {
        RestClient.Builder builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent"))
                .andExpect(jsonPath("$.generationConfig.thinkingConfig.thinkingBudget").value(0))
                .andRespond(withServerError());
        server.expect(requestTo("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent"))
                .andRespond(withSuccess("{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Fast fallback answer\"}]}}]}", MediaType.APPLICATION_JSON));
        assertEquals("Fast fallback answer", new AiChatProvider("gemini", "unit-test-key", "gemini-3-flash-preview", builder)
                .generate("System", List.of(new AiChatProvider.Turn("user", "Question"))));
        server.verify();
    }
}
