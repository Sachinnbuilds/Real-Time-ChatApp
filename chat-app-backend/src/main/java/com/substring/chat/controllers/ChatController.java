package com.substring.chat.controllers;

import com.substring.chat.entities.Message;
import com.substring.chat.entities.Room;
import com.substring.chat.exceptions.AppException;
import com.substring.chat.playload.MessageRequest;
import jakarta.annotation.PreDestroy;
import jakarta.validation.Valid;
import com.substring.chat.repositories.RoomRepository;
import com.substring.chat.service.PresenceTracker;
import org.springframework.http.HttpStatus;
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
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Controller
@CrossOrigin("${app.frontend.url}")
public class ChatController {
    private static final long ROOM_CLEANUP_GRACE_SECONDS = 75;

    private final RoomRepository roomRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final PresenceTracker presenceTracker;
    private final ScheduledExecutorService roomCleanupScheduler = Executors.newSingleThreadScheduledExecutor();
    private final Map<String, ScheduledFuture<?>> pendingRoomCleanup = new ConcurrentHashMap<>();

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
            @Valid @RequestBody MessageRequest request,
            SimpMessageHeaderAccessor headerAccessor
    ) {

        Room room = roomRepository.findByRoomId(request.getRoomId());
        if (!roomId.equals(request.getRoomId())) {
            throw new IllegalArgumentException("Room id mismatch in request");
        }
        String sessionId = headerAccessor.getSessionId();
        if (sessionId == null || sessionId.isBlank() || !presenceTracker.isSessionInRoom(sessionId, roomId)) {
            throw new AppException(
                    "NOT_ACTIVE_MEMBER",
                    "Not an active member of this room.",
                    "Rejoin the room and try sending again.",
                    HttpStatus.FORBIDDEN
            );
        }
        Message message = new Message();
        message.setContent(request.getContent());
        message.setSender(request.getSender());
        message.setTimeStamp(Instant.now());
        if (room != null) {
            room.getMessages().add(message);
            roomRepository.save(room);
        } else {
            throw new AppException(
                    "ROOM_CLOSED",
                    "Room is closed.",
                    "Create or join another room.",
                    HttpStatus.NOT_FOUND
            );
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
        if (presenceTracker.isUsernameTakenByAnotherSession(roomId, sender, sessionId)) {
            sendSystemEventToSession(sessionId, "USERNAME_TAKEN", "Username already in use in this room.");
            return;
        }
        presenceTracker.addSession(roomId, sessionId, sender);
        cancelScheduledRoomCleanup(roomId);
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
            scheduleRoomCleanup(roomId);
        }
        broadcastPresence(roomId);
    }

    @MessageMapping("/typing/{roomId}")
    public void typing(
            @DestinationVariable String roomId,
            @Payload Map<String, Object> request,
            SimpMessageHeaderAccessor headerAccessor
    ) {
        String sender = String.valueOf(request.getOrDefault("sender", "")).trim();
        String requestRoomId = String.valueOf(request.getOrDefault("roomId", "")).trim();
        if (sender.isEmpty() || !roomId.equals(requestRoomId)) {
            return;
        }
        String sessionId = headerAccessor.getSessionId();
        if (sessionId == null || sessionId.isBlank() || !presenceTracker.isSessionInRoom(sessionId, roomId)) {
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
            scheduleRoomCleanup(roomId);
        }
        broadcastPresence(roomId);
    }

    @PreDestroy
    public void shutdownCleanupScheduler() {
        roomCleanupScheduler.shutdownNow();
    }

    private void scheduleRoomCleanup(String roomId) {
        ScheduledFuture<?> existing = pendingRoomCleanup.remove(roomId);
        if (existing != null) {
            existing.cancel(false);
        }

        ScheduledFuture<?> future = roomCleanupScheduler.schedule(() -> {
            try {
                if (!presenceTracker.isRoomEmpty(roomId)) {
                    return;
                }
                Room room = roomRepository.findByRoomId(roomId);
                if (room != null) {
                    roomRepository.delete(room);
                }
            } finally {
                pendingRoomCleanup.remove(roomId);
            }
        }, ROOM_CLEANUP_GRACE_SECONDS, TimeUnit.SECONDS);

        pendingRoomCleanup.put(roomId, future);
    }

    private void cancelScheduledRoomCleanup(String roomId) {
        ScheduledFuture<?> future = pendingRoomCleanup.remove(roomId);
        if (future != null) {
            future.cancel(false);
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
