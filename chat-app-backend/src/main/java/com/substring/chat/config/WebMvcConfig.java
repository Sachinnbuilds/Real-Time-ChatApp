package com.substring.chat.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.Arrays;

@Configuration
public class WebMvcConfig {

    @Bean
    public CorsFilter corsFilter() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        CorsConfiguration config = new CorsConfiguration();

        config.setAllowCredentials(true);

        // Explicitly include all your Vercel preview and production domains
        config.setAllowedOrigins(Arrays.asList(
                "https://real-time-chat-app-sigma-two.vercel.app",
                "https://real-time-chat-app-git-main-sachin-rameshs-projects.vercel.app"
        ));

        config.setAllowedHeaders(Arrays.asList("*"));
        config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));

        // Apply this configuration globally to every single route
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }
}