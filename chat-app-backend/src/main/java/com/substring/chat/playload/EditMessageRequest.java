package com.substring.chat.playload;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Setter
@Getter
@AllArgsConstructor
@NoArgsConstructor
public class EditMessageRequest {

    @NotBlank(message = "Room id is required")
    private String roomId;

    @NotBlank(message = "Message id is required")
    private String messageId;

    @NotBlank(message = "Editor is required")
    @Size(min = 2, max = 40, message = "Editor must be between 2 and 40 characters")
    private String editor;

    @NotBlank(message = "Message content is required")
    @Size(max = 500, message = "Message content must be at most 500 characters")
    private String content;
}
