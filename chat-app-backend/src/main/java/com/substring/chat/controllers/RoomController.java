package com.substring.chat.controllers;

import com.substring.chat.entities.Message;
import com.substring.chat.entities.Room;
import com.substring.chat.repositories.RoomRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/rooms")
@CrossOrigin("${app.frontend.url}")
public class RoomController {

    private RoomRepository roomRepository;


    public RoomController(RoomRepository roomRepository) {
        this.roomRepository = roomRepository;
    }

    //create room
    @PostMapping
    public ResponseEntity<?> createRoom(@RequestBody String roomId) {
        String normalizedRoomId = roomId == null ? "" : roomId.trim();
        if (normalizedRoomId.length() < 3 || normalizedRoomId.length() > 60) {
            throw new IllegalArgumentException("Room id must be between 3 and 60 characters");
        }

        if (roomRepository.findByRoomId(normalizedRoomId) != null) {
            //room is already there
            throw new IllegalArgumentException("Room already exists!");
        }


        //create new room
        Room room = new Room();
        room.setRoomId(normalizedRoomId);
        Room savedRoom = roomRepository.save(room);
        return ResponseEntity.status(HttpStatus.CREATED).body(savedRoom);


    }


    //get room: join
    @GetMapping("/{roomId}")
    public ResponseEntity<?> joinRoom(
            @PathVariable String roomId
    ) {

        Room room = roomRepository.findByRoomId(roomId);
        if (room == null) {
            throw new IllegalArgumentException("Room not found");
        }
        return ResponseEntity.ok(room);
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
