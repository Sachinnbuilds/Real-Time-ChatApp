package com.substring.chat.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Service
public class HuggingFaceService {

    private static final String MODEL_URL =
            "https://api-inference.huggingface.co/models/facebook/bart-large-cnn";
    private static final int MAX_INPUT_CHARS = 3000;

    @Value("${huggingface.api.token}")
    private String apiToken;

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public String summarize(String conversationText) throws Exception {
        if (apiToken == null || apiToken.isBlank()) {
            throw new RuntimeException("TOKEN_MISSING");
        }

        String input = conversationText.length() > MAX_INPUT_CHARS
                ? conversationText.substring(conversationText.length() - MAX_INPUT_CHARS)
                : conversationText;

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiToken);

        Map<String, Object> body = Map.of(
                "inputs", input,
                "parameters", Map.of("max_length", 150, "min_length", 40),
                "options", Map.of("wait_for_model", true)
        );

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<String> response = restTemplate.postForEntity(
                    MODEL_URL, entity, String.class
            );
            JsonNode root = objectMapper.readTree(response.getBody());
            if (root.isArray() && root.size() > 0) {
                JsonNode summaryNode = root.get(0).get("summary_text");
                if (summaryNode != null) {
                    return summaryNode.asText();
                }
            }
            throw new RuntimeException("PARSE_ERROR");
        } catch (HttpStatusCodeException e) {
            if (e.getStatusCode().value() == 503) {
                throw new RuntimeException("MODEL_LOADING");
            }
            throw new RuntimeException("HF_API_ERROR");
        }
    }
}
