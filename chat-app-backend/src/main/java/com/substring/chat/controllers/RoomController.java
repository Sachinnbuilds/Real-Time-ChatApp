package com.substring.chat.controllers;

import com.substring.chat.entities.Message;
import com.substring.chat.entities.Room;
import com.substring.chat.exceptions.AppException;
import com.substring.chat.repositories.RoomRepository;
import com.substring.chat.service.HuggingFaceService;
import com.substring.chat.service.PresenceTracker;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/rooms")
@CrossOrigin("${app.frontend.url}")
public class RoomController {
    private static final int GENERATED_ROOM_ID_LENGTH = 10;
    private static final int MAX_GENERATION_ATTEMPTS = 12;
    private static final String ROOM_ID_PREFIX = "instant-";

    private RoomRepository roomRepository;
    private PresenceTracker presenceTracker;
    private HuggingFaceService huggingFaceService;

    public RoomController(RoomRepository roomRepository, PresenceTracker presenceTracker,
                          HuggingFaceService huggingFaceService) {
        this.roomRepository = roomRepository;
        this.presenceTracker = presenceTracker;
        this.huggingFaceService = huggingFaceService;
    }

    //create room
    @PostMapping
    public ResponseEntity<?> createRoom(@RequestBody String roomId) {
        String normalizedRoomId = roomId == null ? "" : roomId.trim();
        if (normalizedRoomId.length() < 3 || normalizedRoomId.length() > 60) {
            throw new IllegalArgumentException("Room id must be between 3 and 60 characters");
        }

        if (roomRepository.findByRoomId(normalizedRoomId) != null) {
            throw new AppException(
                    "ROOM_EXISTS",
                    "Room already exists.",
                    "Use Join to enter the room or create a new room id.",
                    HttpStatus.CONFLICT
            );
        }


        //create new room
        Room room = new Room();
        room.setRoomId(normalizedRoomId);
        Room savedRoom = roomRepository.save(room);
        return ResponseEntity.status(HttpStatus.CREATED).body(savedRoom);


    }

    @PostMapping("/generate")
    public ResponseEntity<?> generateRoom() {
        for (int attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
            String generatedRoomId = ROOM_ID_PREFIX + randomSuffix(GENERATED_ROOM_ID_LENGTH);
            if (roomRepository.findByRoomId(generatedRoomId) != null) {
                continue;
            }

            Room room = new Room();
            room.setRoomId(generatedRoomId);
            Room savedRoom = roomRepository.save(room);
            return ResponseEntity.status(HttpStatus.CREATED).body(savedRoom);
        }

        throw new AppException(
                "ROOM_GENERATION_FAILED",
                "Unable to generate a room right now.",
                "Please try again.",
                HttpStatus.INTERNAL_SERVER_ERROR
        );
    }


    //get room: join
    @GetMapping("/{roomId}")
    public ResponseEntity<?> joinRoom(
            @PathVariable String roomId,
            @RequestParam(value = "username", required = false) String username
    ) {

        Room room = roomRepository.findByRoomId(roomId);
        if (room == null) {
            throw new AppException(
                    "ROOM_NOT_FOUND",
                    "Room not found.",
                    "Ask your friend to create this room again.",
                    HttpStatus.NOT_FOUND
            );
        }
        String normalizedUsername = username == null ? "" : username.trim();
        if (normalizedUsername.length() < 2 || normalizedUsername.length() > 40) {
            throw new IllegalArgumentException("Username must be between 2 and 40 characters");
        }
        if (presenceTracker.getActiveSessionCount(roomId) >= PresenceTracker.MAX_ACTIVE_ROOM_MEMBERS) {
            throw new AppException(
                    "ROOM_FULL",
                    "Room is full (max 5 people).",
                    "Try another room or wait for someone to leave.",
                    HttpStatus.CONFLICT
            );
        }
        if (presenceTracker.isUsernameTaken(roomId, normalizedUsername)) {
            throw new AppException(
                    "USERNAME_TAKEN",
                    "Username already in use in this room.",
                    "Choose a different username and try again.",
                    HttpStatus.CONFLICT
            );
        }
        return ResponseEntity.ok(room);
    }

    private String randomSuffix(int length) {
        final char[] alphabet = "abcdefghijklmnopqrstuvwxyz0123456789".toCharArray();
        StringBuilder value = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            int index = ThreadLocalRandom.current().nextInt(alphabet.length);
            value.append(alphabet[index]);
        }
        return value.toString();
    }

    // AI summarize room conversation
    @GetMapping("/{roomId}/summarize")
    public ResponseEntity<?> summarizeRoom(@PathVariable String roomId) {
        Room room = roomRepository.findByRoomId(roomId);
        if (room == null) {
            throw new AppException(
                    "ROOM_NOT_FOUND",
                    "Room not found.",
                    "The room may have been deleted.",
                    HttpStatus.NOT_FOUND
            );
        }

        List<Message> messages = room.getMessages();
        if (messages.size() < 3) {
            throw new AppException(
                    "NOT_ENOUGH_MESSAGES",
                    "Not enough messages to summarize.",
                    "Send at least 3 messages before summarizing.",
                    HttpStatus.BAD_REQUEST
            );
        }

        List<Message> last30 = messages.subList(
                Math.max(0, messages.size() - 30),
                messages.size()
        );

        String formatted = last30.stream()
                .map(m -> m.getSender() + ": " + m.getContent())
                .collect(Collectors.joining("\n"));

        try {
            String summary = huggingFaceService.summarize(formatted);
            return ResponseEntity.ok(Map.of("summary", summary));
        } catch (RuntimeException e) {
            String errorCode = e.getMessage();
            if ("MODEL_LOADING".equals(errorCode)) {
                throw new AppException(
                        "MODEL_LOADING",
                        "AI model is warming up.",
                        "Wait 20 seconds and try again.",
                        HttpStatus.SERVICE_UNAVAILABLE
                );
            }
            if ("TOKEN_MISSING".equals(errorCode)) {
                throw new AppException(
                        "TOKEN_MISSING",
                        "AI service is not configured.",
                        "Contact the administrator.",
                        HttpStatus.INTERNAL_SERVER_ERROR
                );
            }
            if ("HF_AUTH_ERROR".equals(errorCode)) {
                throw new AppException(
                        "HF_AUTH_ERROR",
                        "AI service authentication failed.",
                        "Check the Hugging Face token permissions.",
                        HttpStatus.INTERNAL_SERVER_ERROR
                );
            }
            if ("HF_RATE_LIMITED".equals(errorCode)) {
                throw new AppException(
                        "HF_RATE_LIMITED",
                        "AI service rate limit reached.",
                        "Wait a minute and try again.",
                        HttpStatus.TOO_MANY_REQUESTS
                );
            }
            throw new AppException(
                    "SUMMARIZE_FAILED",
                    "Failed to generate summary.",
                    "Try again in a moment.",
                    HttpStatus.INTERNAL_SERVER_ERROR
            );
        } catch (Exception e) {
            throw new AppException(
                    "SUMMARIZE_FAILED",
                    "Failed to generate summary.",
                    "Try again in a moment.",
                    HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }


    //get messages of room

    @GetMapping("/{roomId}/messages")
    public ResponseEntity<List<Message>> getMessages(
            @PathVariable String roomId,
            @RequestParam(value = "page", defaultValue = "0", required = false) int page,
            @RequestParam(value = "size", defaultValue = "20", required = false) int size
    ) {
        Room room = roomRepository.findByRoomId(roomId);
        if (room == null) {
            return ResponseEntity.badRequest().build()
                    ;
        }
        //get messages :
        //pagination
        List<Message> messages = room.getMessages();
        int start = Math.max(0, messages.size() - (page + 1) * size);
        int end = Math.min(messages.size(), start + size);
        List<Message> paginatedMessages = messages.subList(start, end);
        return ResponseEntity.ok(paginatedMessages);

    }


}
