package com.substring.chat.controllers;

import com.substring.chat.entities.Message;
import com.substring.chat.entities.Room;
import com.substring.chat.playload.DeleteMessageRequest;
import com.substring.chat.playload.EditMessageRequest;
import com.substring.chat.playload.MessageRequest;
import jakarta.validation.Valid;
import com.substring.chat.repositories.RoomRepository;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.RequestBody;

import java.time.Instant;
import java.util.UUID;

@Controller
@CrossOrigin("${app.frontend.url}")
public class ChatController {


    private RoomRepository roomRepository;

    public ChatController(RoomRepository roomRepository) {
        this.roomRepository = roomRepository;
    }


    //for sending and receiving messages
    @MessageMapping("/sendMessage/{roomId}")// /app/sendMessage/roomId
    @SendTo("/topic/room/{roomId}")//subscribe
    public Message sendMessage(
            @DestinationVariable String roomId,
            @Valid @RequestBody MessageRequest request
    ) {

        Room room = roomRepository.findByRoomId(request.getRoomId());
        if (!roomId.equals(request.getRoomId())) {
            throw new IllegalArgumentException("Room id mismatch in request");
        }
        Message message = new Message();
        message.setId(UUID.randomUUID().toString());
        message.setContent(request.getContent());
        message.setSender(request.getSender());
        message.setTimeStamp(Instant.now());
        message.setEdited(false);
        message.setDeleted(false);
        message.setEventType("CREATED");
        if (room != null) {
            room.getMessages().add(message);
            roomRepository.save(room);
        } else {
            throw new RuntimeException("room not found !!");
        }

        return message;


    }

    @MessageMapping("/editMessage/{roomId}")
    @SendTo("/topic/room/{roomId}")
    public Message editMessage(
            @DestinationVariable String roomId,
            @Valid @RequestBody EditMessageRequest request
    ) {
        if (!roomId.equals(request.getRoomId())) {
            throw new IllegalArgumentException("Room id mismatch in request");
        }
        Room room = roomRepository.findByRoomId(roomId);
        if (room == null) {
            throw new RuntimeException("room not found");
        }

        Message targetMessage = room.getMessages().stream()
                .filter(msg -> request.getMessageId().equals(msg.getId()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));

        if (!request.getEditor().equals(targetMessage.getSender())) {
            throw new IllegalArgumentException("Only sender can edit the message");
        }
        if (targetMessage.isDeleted()) {
            throw new IllegalArgumentException("Deleted message cannot be edited");
        }

        targetMessage.setContent(request.getContent().trim());
        targetMessage.setEdited(true);
        targetMessage.setEventType("UPDATED");
        roomRepository.save(room);
        return targetMessage;
    }

    @MessageMapping("/deleteMessage/{roomId}")
    @SendTo("/topic/room/{roomId}")
    public Message deleteMessage(
            @DestinationVariable String roomId,
            @Valid @RequestBody DeleteMessageRequest request
    ) {
        if (!roomId.equals(request.getRoomId())) {
            throw new IllegalArgumentException("Room id mismatch in request");
        }
        Room room = roomRepository.findByRoomId(roomId);
        if (room == null) {
            throw new RuntimeException("room not found");
        }

        Message targetMessage = room.getMessages().stream()
                .filter(msg -> request.getMessageId().equals(msg.getId()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));

        if (!request.getRequester().equals(targetMessage.getSender())) {
            throw new IllegalArgumentException("Only sender can delete the message");
        }
        if (targetMessage.isDeleted()) {
            return targetMessage;
        }

        targetMessage.setDeleted(true);
        targetMessage.setContent("Message removed");
        targetMessage.setEventType("DELETED");
        roomRepository.save(room);
        return targetMessage;
    }
}
