package com.substring.chat.playload;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Setter
@Getter
@AllArgsConstructor
@NoArgsConstructor
public class MessageRequest {

    @NotBlank(message = "Message content is required")
    @Size(max = 500, message = "Message content must be at most 500 characters")
    private String content;

    @NotBlank(message = "Sender is required")
    @Size(min = 2, max = 40, message = "Sender must be between 2 and 40 characters")
    private String sender;

    @NotBlank(message = "Room id is required")
    @Size(min = 3, max = 60, message = "Room id must be between 3 and 60 characters")
    private String roomId;
}
