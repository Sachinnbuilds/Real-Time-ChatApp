package com.substring.chat.service;

import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class PresenceTracker {

    public static final int MAX_ACTIVE_ROOM_MEMBERS = 5;

    private final Map<String, Map<String, String>> roomParticipantsBySession = new ConcurrentHashMap<>();
    private final Map<String, String> sessionToRoom = new ConcurrentHashMap<>();
    private final Map<String, String> sessionToUser = new ConcurrentHashMap<>();

    public boolean canJoinRoom(String roomId, String sessionId) {
        Map<String, String> sessions = roomParticipantsBySession.getOrDefault(roomId, Map.of());
        return sessions.containsKey(sessionId) || sessions.size() < MAX_ACTIVE_ROOM_MEMBERS;
    }

    public int getActiveSessionCount(String roomId) {
        return roomParticipantsBySession.getOrDefault(roomId, Map.of()).size();
    }

    public void addSession(String roomId, String sessionId, String sender) {
        sessionToRoom.put(sessionId, roomId);
        sessionToUser.put(sessionId, sender);
        roomParticipantsBySession
                .computeIfAbsent(roomId, key -> new ConcurrentHashMap<>())
                .put(sessionId, sender);
    }

    public String removeSession(String sessionId) {
        String roomId = sessionToRoom.remove(sessionId);
        sessionToUser.remove(sessionId);
        if (roomId == null) {
            return null;
        }
        Map<String, String> sessions = roomParticipantsBySession.get(roomId);
        if (sessions != null) {
            sessions.remove(sessionId);
            if (sessions.isEmpty()) {
                roomParticipantsBySession.remove(roomId);
            }
        }
        return roomId;
    }

    public boolean isRoomEmpty(String roomId) {
        return roomParticipantsBySession.getOrDefault(roomId, Map.of()).isEmpty();
    }

    public Set<String> getUniqueParticipants(String roomId) {
        Set<String> uniqueParticipants = ConcurrentHashMap.newKeySet();
        uniqueParticipants.addAll(roomParticipantsBySession.getOrDefault(roomId, Map.of()).values());
        return uniqueParticipants;
    }

    public String getRoomForSession(String sessionId) {
        return sessionToRoom.get(sessionId);
    }

    public boolean isSessionInRoom(String sessionId, String roomId) {
        String activeRoom = sessionToRoom.get(sessionId);
        return activeRoom != null && activeRoom.equals(roomId);
    }

    public boolean isUsernameTaken(String roomId, String username) {
        if (username == null || username.isBlank()) {
            return false;
        }
        Map<String, String> sessions = roomParticipantsBySession.getOrDefault(roomId, Map.of());
        return sessions.values().stream().anyMatch(existing -> existing.equalsIgnoreCase(username.trim()));
    }

    public boolean isUsernameTakenByAnotherSession(String roomId, String username, String sessionId) {
        if (username == null || username.isBlank()) {
            return false;
        }
        Map<String, String> sessions = roomParticipantsBySession.getOrDefault(roomId, Map.of());
        for (Map.Entry<String, String> entry : sessions.entrySet()) {
            if (!entry.getKey().equals(sessionId) && entry.getValue().equalsIgnoreCase(username.trim())) {
                return true;
            }
        }
        return false;
    }
}
