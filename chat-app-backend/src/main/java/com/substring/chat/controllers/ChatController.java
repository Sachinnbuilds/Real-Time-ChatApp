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
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Controller
@CrossOrigin("${app.frontend.url}")
public class ChatController {


    private final RoomRepository roomRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final Map<String, Set<String>> roomParticipants = new ConcurrentHashMap<>();
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
        if (sessionId != null && !sessionId.isBlank()) {
            sessionToRoom.put(sessionId, roomId);
            sessionToUser.put(sessionId, sender);
        }
        roomParticipants.computeIfAbsent(roomId, key -> ConcurrentHashMap.newKeySet()).add(sender);
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
        }
        Set<String> participants = roomParticipants.get(roomId);
        if (participants != null) {
            participants.remove(sender);
            if (participants.isEmpty()) {
                roomParticipants.remove(roomId);
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
        Set<String> participants = roomParticipants.getOrDefault(roomId, Set.of());
        Map<String, Object> presenceEvent = new HashMap<>();
        presenceEvent.put("roomId", roomId);
        presenceEvent.put("participants", participants);
        presenceEvent.put("count", participants.size());
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
        Set<String> participants = roomParticipants.get(roomId);
        if (participants != null) {
            participants.remove(sender);
            if (participants.isEmpty()) {
                roomParticipants.remove(roomId);
            }
        }
        broadcastPresence(roomId);
    }
}
