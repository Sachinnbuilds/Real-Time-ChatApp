package com.substring.chat.controllers;

import com.substring.chat.entities.Message;
import com.substring.chat.entities.Room;
import com.substring.chat.playload.MessageRequest;
import jakarta.validation.Valid;
import com.substring.chat.repositories.RoomRepository;
import com.substring.chat.service.PresenceTracker;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.context.event.EventListener;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.RequestBody;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@Controller
@CrossOrigin("${app.frontend.url}")
public class ChatController {

    private final RoomRepository roomRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final PresenceTracker presenceTracker;

    public ChatController(
            RoomRepository roomRepository,
            SimpMessagingTemplate messagingTemplate,
            PresenceTracker presenceTracker
    ) {
        this.roomRepository = roomRepository;
        this.messagingTemplate = messagingTemplate;
        this.presenceTracker = presenceTracker;
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
        message.setContent(request.getContent());
        message.setSender(request.getSender());
        message.setTimeStamp(Instant.now());
        if (room != null) {
            room.getMessages().add(message);
            roomRepository.save(room);
        } else {
            throw new RuntimeException("room not found !!");
        }

        return message;


    }

    @MessageMapping("/presence/join/{roomId}")
    public void joinRoom(
            @DestinationVariable String roomId,
            @Payload Map<String, String> request,
            SimpMessageHeaderAccessor headerAccessor
    ) {
        String sender = request.getOrDefault("sender", "").trim();
        String requestRoomId = request.getOrDefault("roomId", "").trim();
        if (sender.isEmpty() || !roomId.equals(requestRoomId)) {
            return;
        }
        String sessionId = headerAccessor.getSessionId();
        if (sessionId == null || sessionId.isBlank()) {
            return;
        }
        Room room = roomRepository.findByRoomId(roomId);
        if (room == null) {
            sendSystemEventToSession(sessionId, "ROOM_CLOSED", "Room is closed. Create or join another room.");
            return;
        }
        if (!presenceTracker.canJoinRoom(roomId, sessionId)) {
            sendSystemEventToSession(sessionId, "ROOM_FULL", "Room is full (max 5 people). Try another room.");
            return;
        }
        presenceTracker.addSession(roomId, sessionId, sender);
        broadcastPresence(roomId);
    }

    @MessageMapping("/presence/leave/{roomId}")
    public void leaveRoom(
            @DestinationVariable String roomId,
            @Payload Map<String, String> request,
            SimpMessageHeaderAccessor headerAccessor
    ) {
        String sender = request.getOrDefault("sender", "").trim();
        String requestRoomId = request.getOrDefault("roomId", "").trim();
        if (sender.isEmpty() || !roomId.equals(requestRoomId)) {
            return;
        }
        String sessionId = headerAccessor.getSessionId();
        if (sessionId != null && !sessionId.isBlank()) {
            presenceTracker.removeSession(sessionId);
        }
        if (presenceTracker.isRoomEmpty(roomId)) {
            clearRoomData(roomId);
        }
        broadcastPresence(roomId);
    }

    @MessageMapping("/typing/{roomId}")
    public void typing(@DestinationVariable String roomId, @Payload Map<String, Object> request) {
        String sender = String.valueOf(request.getOrDefault("sender", "")).trim();
        String requestRoomId = String.valueOf(request.getOrDefault("roomId", "")).trim();
        if (sender.isEmpty() || !roomId.equals(requestRoomId)) {
            return;
        }
        boolean typing = Boolean.parseBoolean(String.valueOf(request.getOrDefault("typing", false)));
        Map<String, Object> typingEvent = new HashMap<>();
        typingEvent.put("sender", sender);
        typingEvent.put("roomId", roomId);
        typingEvent.put("typing", typing);
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/typing", typingEvent);
    }

    private void broadcastPresence(String roomId) {
        Set<String> uniqueParticipants = presenceTracker.getUniqueParticipants(roomId);
        Map<String, Object> presenceEvent = new HashMap<>();
        presenceEvent.put("roomId", roomId);
        presenceEvent.put("participants", new ArrayList<>(uniqueParticipants));
        presenceEvent.put("count", uniqueParticipants.size());
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/presence", presenceEvent);
    }

    @EventListener
    public void handleSessionDisconnect(SessionDisconnectEvent event) {
        String sessionId = event.getSessionId();
        if (sessionId == null || sessionId.isBlank()) {
            return;
        }
        String roomId = presenceTracker.removeSession(sessionId);
        if (roomId == null) {
            return;
        }
        if (presenceTracker.isRoomEmpty(roomId)) {
            clearRoomData(roomId);
        }
        broadcastPresence(roomId);
    }

    private void clearRoomData(String roomId) {
        Room room = roomRepository.findByRoomId(roomId);
        if (room != null) {
            roomRepository.delete(room);
        }
    }

    private void sendSystemEventToSession(String sessionId, String code, String message) {
        Map<String, String> event = new HashMap<>();
        event.put("code", code);
        event.put("message", message);
        messagingTemplate.convertAndSendToUser(sessionId, "/queue/system", event, createHeaders(sessionId));
    }

    private Map<String, Object> createHeaders(String sessionId) {
        Map<String, Object> headers = new HashMap<>();
        headers.put("simpSessionId", sessionId);
        return headers;
    }
}
