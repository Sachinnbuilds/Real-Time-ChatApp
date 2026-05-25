package com.substring.chat.controllers;

import com.substring.chat.entities.Message;
import com.substring.chat.entities.Room;
import com.substring.chat.playload.MessageRequest;
import jakarta.validation.Valid;
import com.substring.chat.repositories.RoomRepository;
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
import java.util.concurrent.ConcurrentHashMap;

@Controller
@CrossOrigin("${app.frontend.url}")
public class ChatController {

    private static final int MAX_ACTIVE_ROOM_MEMBERS = 5;

    private final RoomRepository roomRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final Map<String, Map<String, String>> roomParticipantsBySession = new ConcurrentHashMap<>();
    private final Map<String, String> sessionToRoom = new ConcurrentHashMap<>();
    private final Map<String, String> sessionToUser = new ConcurrentHashMap<>();

    public ChatController(RoomRepository roomRepository, SimpMessagingTemplate messagingTemplate) {
        this.roomRepository = roomRepository;
        this.messagingTemplate = messagingTemplate;
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
        Map<String, String> sessionsInRoom = roomParticipantsBySession.getOrDefault(roomId, Map.of());
        boolean alreadyInRoom = sessionsInRoom.containsKey(sessionId);
        if (!alreadyInRoom && sessionsInRoom.size() >= MAX_ACTIVE_ROOM_MEMBERS) {
            sendSystemEventToSession(sessionId, "ROOM_FULL", "Room is full (max 5 people). Try another room.");
            return;
        }
        sessionToRoom.put(sessionId, roomId);
        sessionToUser.put(sessionId, sender);
        roomParticipantsBySession
                .computeIfAbsent(roomId, key -> new ConcurrentHashMap<>())
                .put(sessionId, sender);
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
            sessionToRoom.remove(sessionId);
            sessionToUser.remove(sessionId);
            Map<String, String> sessions = roomParticipantsBySession.get(roomId);
            if (sessions != null) {
                sessions.remove(sessionId);
                if (sessions.isEmpty()) {
                    roomParticipantsBySession.remove(roomId);
                }
            }
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
        Map<String, String> sessions = roomParticipantsBySession.getOrDefault(roomId, Map.of());
        Set<String> uniqueParticipants = ConcurrentHashMap.newKeySet();
        uniqueParticipants.addAll(sessions.values());
        Map<String, Object> presenceEvent = new HashMap<>();
        presenceEvent.put("roomId", roomId);
        presenceEvent.put("participants", new ArrayList<>(uniqueParticipants));
        presenceEvent.put("count", sessions.size());
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/presence", presenceEvent);
    }

    @EventListener
    public void handleSessionDisconnect(SessionDisconnectEvent event) {
        String sessionId = event.getSessionId();
        if (sessionId == null || sessionId.isBlank()) {
            return;
        }
        String roomId = sessionToRoom.remove(sessionId);
        String sender = sessionToUser.remove(sessionId);
        if (roomId == null || sender == null) {
            return;
        }
        Map<String, String> sessions = roomParticipantsBySession.get(roomId);
        if (sessions != null) {
            sessions.remove(sessionId);
            if (sessions.isEmpty()) {
                roomParticipantsBySession.remove(roomId);
                clearRoomData(roomId);
            }
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
