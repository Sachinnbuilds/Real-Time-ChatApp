import React, { useEffect, useRef, useState } from "react";
import { MdAttachFile, MdSend } from "react-icons/md";
import useChatContext from "../context/ChatContext";
import { useNavigate } from "react-router";
import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";
import toast from "react-hot-toast";
import { baseURL } from "../config/AxiosHelper";
import { getMessagess } from "../services/RoomService";
import { timeAgo } from "../config/helper";

const MAX_MESSAGE_LENGTH = 500;

const ChatPage = () => {
  const { roomId, currentUser, connected, setConnected, setRoomId, setCurrentUser } = useChatContext();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [connectionState, setConnectionState] = useState("CONNECTING");
  const [showReconnectToast, setShowReconnectToast] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editInput, setEditInput] = useState("");
  const chatBoxRef = useRef(null);
  const stompClientRef = useRef(null);

  useEffect(() => {
    if (!connected) {
      navigate("/");
    }
  }, [connected, navigate]);

  useEffect(() => {
    async function loadMessages() {
      setIsLoadingMessages(true);
      try {
        const response = await getMessagess(roomId);
        setMessages(response);
      } catch (error) {
        toast.error("Failed to load messages");
      } finally {
        setIsLoadingMessages(false);
      }
    }
    if (connected && roomId) loadMessages();
  }, [connected, roomId]);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scroll({
        top: chatBoxRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  const applyIncomingMessage = (incomingMessage) => {
    const eventType = incomingMessage?.eventType || "CREATED";
    if (!incomingMessage?.id || eventType === "CREATED") {
      setMessages((prev) => [...prev, incomingMessage]);
      return;
    }
    setMessages((prev) =>
      prev.map((msg) => (msg.id === incomingMessage.id ? { ...msg, ...incomingMessage } : msg))
    );
  };

  useEffect(() => {
    if (!connected || !roomId) return undefined;

    const client = new Client({
      webSocketFactory: () => new SockJS(`${baseURL}/chat`),
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        setConnectionState("CONNECTED");
        setShowReconnectToast(true);
        toast.success("Connected");
        client.subscribe(`/topic/room/${roomId}`, (message) => {
          const newMessage = JSON.parse(message.body);
          applyIncomingMessage(newMessage);
        });
      },
      onStompError: () => {
        setConnectionState("ERROR");
        toast.error("WebSocket error");
      },
      onWebSocketClose: () => {
        setConnectionState("RECONNECTING");
        if (showReconnectToast) {
          toast("Connection lost. Reconnecting...");
          setShowReconnectToast(false);
        }
      },
    });

    stompClientRef.current = client;
    setConnectionState("CONNECTING");
    client.activate();

    return () => {
      if (client.active) client.deactivate();
      stompClientRef.current = null;
    };
  }, [connected, roomId, showReconnectToast]);

  const sendMessage = async () => {
    const client = stompClientRef.current;
    const content = input.trim();
    if (client?.connected && connected && content && content.length <= MAX_MESSAGE_LENGTH) {
      client.publish({
        destination: `/app/sendMessage/${roomId}`,
        body: JSON.stringify({ sender: currentUser, content, roomId }),
      });
      setInput("");
    }
  };

  const startEdit = (message) => {
    setEditingMessageId(message.id);
    setEditInput(message.content);
  };

  const cancelEdit = () => {
    setEditingMessageId("");
    setEditInput("");
  };

  const saveEdit = () => {
    const client = stompClientRef.current;
    const content = editInput.trim();
    if (!client?.connected || !content || content.length > MAX_MESSAGE_LENGTH || !editingMessageId) return;

    client.publish({
      destination: `/app/editMessage/${roomId}`,
      body: JSON.stringify({
        roomId,
        messageId: editingMessageId,
        editor: currentUser,
        content,
      }),
    });
    cancelEdit();
  };

  const deleteMessage = (messageId) => {
    const client = stompClientRef.current;
    if (!client?.connected) return;
    client.publish({
      destination: `/app/deleteMessage/${roomId}`,
      body: JSON.stringify({
        roomId,
        messageId,
        requester: currentUser,
      }),
    });
  };

  function handleLogout() {
    if (stompClientRef.current?.active) stompClientRef.current.deactivate();
    setConnected(false);
    setRoomId("");
    setCurrentUser("");
    navigate("/");
  }

  const isConnected = connectionState === "CONNECTED";
  const inputLength = input.trim().length;
  const cannotSend = !isConnected || inputLength === 0 || inputLength > MAX_MESSAGE_LENGTH;
  const statusBadgeClass =
    connectionState === "CONNECTED"
      ? "bg-emerald-500"
      : connectionState === "RECONNECTING"
      ? "bg-amber-500"
      : connectionState === "ERROR"
      ? "bg-rose-500"
      : "bg-sky-500";
  const statusText =
    connectionState === "CONNECTED"
      ? "Connected"
      : connectionState === "RECONNECTING"
      ? "Reconnecting"
      : connectionState === "ERROR"
      ? "Offline"
      : "Connecting";

  return (
    <div className="min-h-screen px-3 py-6 md:px-6">
      <div className="mx-auto max-w-5xl h-[92vh] rounded-[2rem] overflow-hidden bg-[var(--surface)] shadow-[0_20px_60px_rgba(30,30,30,0.25)]">
        <header className="h-20 bg-[var(--ink)] text-white px-5 md:px-8 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-300">Room</p>
            <h1 className="font-bold text-lg">{roomId}</h1>
          </div>
          <div className={`text-xs font-bold px-3 py-1 rounded-full text-white ${statusBadgeClass}`}>
            {statusText}
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-300">User</p>
            <h1 className="font-semibold">{currentUser}</h1>
          </div>
          <button
            onClick={handleLogout}
            className="ml-4 bg-white text-[var(--ink)] rounded-full px-4 py-2 text-sm font-bold hover:bg-[#f3f3f3]"
          >
            Leave
          </button>
        </header>

        <main ref={chatBoxRef} className="h-[calc(100%-9rem)] overflow-auto px-4 md:px-8 py-5 bg-[var(--surface)]">
          {isLoadingMessages && (
            <div className="space-y-3 animate-pulse">
              <div className="h-14 w-1/2 bg-[var(--surface-2)] rounded-2xl" />
              <div className="h-14 w-2/3 bg-[var(--surface-2)] rounded-2xl ml-auto" />
              <div className="h-14 w-1/3 bg-[var(--surface-2)] rounded-2xl" />
            </div>
          )}

          {!isLoadingMessages && messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-[var(--muted)] font-semibold">
              No messages yet. Start the conversation.
            </div>
          )}

          {!isLoadingMessages &&
            messages.map((message, index) => (
              <div
                key={message.id || `${message.sender}-${index}`}
                className={`mb-3 flex ${
                  message.sender === currentUser ? "justify-end" : "justify-start"
                } animate-[fadeInMsg_.2s_ease]`}
              >
                <div
                  className={`max-w-xs md:max-w-md rounded-[1.35rem] px-4 py-3 ${
                    message.sender === currentUser
                      ? "bg-[var(--peach-strong)] text-white"
                      : "bg-[var(--surface-2)] text-[var(--ink)]"
                  }`}
                >
                  <p className="text-xs font-bold opacity-80 mb-1">{message.sender}</p>
                  {editingMessageId === message.id ? (
                    <div className="space-y-2">
                      <input
                        value={editInput}
                        onChange={(e) => setEditInput(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                        className="w-full rounded-xl px-3 py-2 text-sm text-[var(--ink)]"
                      />
                      <div className="flex gap-2 text-xs">
                        <button onClick={saveEdit} className="px-2 py-1 rounded bg-white text-[var(--ink)] font-semibold">
                          Save
                        </button>
                        <button onClick={cancelEdit} className="px-2 py-1 rounded bg-black/20 text-white font-semibold">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed break-words">{message.content}</p>
                      <p className="text-[11px] opacity-70 mt-1">
                        {timeAgo(message.timeStamp)}{message.edited ? " • edited" : ""}
                      </p>
                    </>
                  )}
                  {message.sender === currentUser && !message.deleted && editingMessageId !== message.id && (
                    <div className="mt-1 flex gap-2 text-[11px]">
                      <button onClick={() => startEdit(message)} className="underline opacity-80">
                        Edit
                      </button>
                      <button onClick={() => deleteMessage(message.id)} className="underline opacity-80">
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
        </main>

        <div className="h-16 px-4 md:px-8 bg-white border-t border-[#efefef] flex items-center gap-2">
          <button className="h-10 w-10 rounded-full bg-[var(--surface-2)] text-[var(--ink)] flex items-center justify-center">
            <MdAttachFile size={18} />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !cannotSend) sendMessage();
            }}
            type="text"
            placeholder={isConnected ? "Write a message..." : "Waiting for connection..."}
            className="flex-1 bg-[var(--surface)] text-[var(--ink)] rounded-full px-5 py-2 focus:outline-none"
          />
          <div className="text-[11px] text-[var(--muted)] w-14 text-right">
            {inputLength}/{MAX_MESSAGE_LENGTH}
          </div>
          <button
            onClick={sendMessage}
            disabled={cannotSend}
            className={`h-10 w-10 rounded-full flex items-center justify-center ${
              cannotSend ? "bg-[#ddd] text-[#999]" : "bg-[var(--peach-strong)] text-white"
            }`}
          >
            <MdSend size={18} />
          </button>
        </div>
      </div>
      <style>{`@keyframes fadeInMsg { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
};

export default ChatPage;
