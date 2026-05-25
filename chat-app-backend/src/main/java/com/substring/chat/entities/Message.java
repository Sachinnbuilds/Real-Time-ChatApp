package com.substring.chat.entities;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@AllArgsConstructor
@NoArgsConstructor
@Getter
@Setter
public class Message {

    private String id;
    private String sender;
    private String content;
    private Instant timeStamp;
    private boolean edited;
    private boolean deleted;
    private String eventType;

    public Message(String sender, String content) {
        this.id = UUID.randomUUID().toString();
        this.sender = sender;
        this.content = content;
        this.timeStamp = Instant.now();
        this.edited = false;
        this.deleted = false;
        this.eventType = "CREATED";
    }
}
