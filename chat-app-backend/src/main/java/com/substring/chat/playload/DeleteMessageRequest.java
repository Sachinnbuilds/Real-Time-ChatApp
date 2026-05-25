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
public class DeleteMessageRequest {

    @NotBlank(message = "Room id is required")
    private String roomId;

    @NotBlank(message = "Message id is required")
    private String messageId;

    @NotBlank(message = "Requester is required")
    @Size(min = 2, max = 40, message = "Requester must be between 2 and 40 characters")
    private String requester;
}
