import React, { useEffect, useRef, useState } from "react";
import { MdClose, MdContentCopy, MdSend, MdShare } from "react-icons/md";
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
  const [participants, setParticipants] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const chatBoxRef = useRef(null);
  const stompClientRef = useRef(null);
  const typingTimeoutRef = useRef(null);

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
          setMessages((prev) => [...prev, newMessage]);
        });
        client.subscribe(`/topic/room/${roomId}/presence`, (message) => {
          const payload = JSON.parse(message.body);
          setParticipants(Array.isArray(payload.participants) ? payload.participants : []);
          setOnlineCount(Number.isFinite(payload.count) ? payload.count : 0);
        });
        client.subscribe(`/topic/room/${roomId}/typing`, (message) => {
          const payload = JSON.parse(message.body);
          if (!payload?.sender || payload.sender === currentUser) {
            return;
          }
          setTypingUsers((prev) => {
            if (payload.typing) {
              return prev.includes(payload.sender) ? prev : [...prev, payload.sender];
            }
            return prev.filter((user) => user !== payload.sender);
          });
        });
        client.publish({
          destination: `/app/presence/join/${roomId}`,
          body: JSON.stringify({ sender: currentUser, roomId }),
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
      if (client.connected) {
        client.publish({
          destination: `/app/presence/leave/${roomId}`,
          body: JSON.stringify({ sender: currentUser, roomId }),
        });
        client.publish({
          destination: `/app/typing/${roomId}`,
          body: JSON.stringify({ sender: currentUser, roomId, typing: false }),
        });
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (client.active) client.deactivate();
      stompClientRef.current = null;
    };
  }, [connected, roomId, showReconnectToast, currentUser]);

  const sendMessage = async () => {
    const client = stompClientRef.current;
    const content = input.trim();
    if (client?.connected && connected && content && content.length <= MAX_MESSAGE_LENGTH) {
      client.publish({
        destination: `/app/sendMessage/${roomId}`,
        body: JSON.stringify({ sender: currentUser, content, roomId }),
      });
      client.publish({
        destination: `/app/typing/${roomId}`,
        body: JSON.stringify({ sender: currentUser, roomId, typing: false }),
      });
      setInput("");
    }
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
  const typingLabel =
    typingUsers.length === 0
      ? ""
      : typingUsers.length === 1
      ? `${typingUsers[0]} is typing...`
      : `${typingUsers.length} people are typing...`;
  const inviteUrl = `${window.location.origin}/join/${encodeURIComponent(roomId)}?inviter=${encodeURIComponent(
    currentUser
  )}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(inviteUrl)}`;

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy invite link");
    }
  };

  const shareInviteLink = async () => {
    if (!navigator.share) {
      toast("Share is not supported on this device");
      return;
    }
    try {
      await navigator.share({
        title: `Join room ${roomId}`,
        text: `${currentUser} invited you to join chat room ${roomId}`,
        url: inviteUrl,
      });
    } catch (error) {
      if (error?.name !== "AbortError") {
        toast.error("Unable to share invite");
      }
    }
  };

  return (
    <div className="min-h-screen px-3 py-6 md:px-6">
      <div className="mx-auto max-w-5xl h-[92vh] rounded-[2rem] overflow-hidden bg-[var(--surface)] shadow-[0_20px_60px_rgba(30,30,30,0.25)] grid grid-rows-[auto_auto_minmax(0,1fr)_auto_auto]">
        <header className="h-20 bg-[var(--ink)] text-white px-5 md:px-8 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-300">Room</p>
            <h1 className="font-bold text-lg">{roomId}</h1>
          </div>
          <div className={`text-xs font-bold px-3 py-1 rounded-full text-white ${statusBadgeClass}`}>
            {statusText}
          </div>
          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs text-slate-300">Online</span>
            <span className="text-sm font-bold">{onlineCount}</span>
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

        <div className="px-4 md:px-8 py-2 bg-white border-t border-[#efefef] border-b">
          <div className="flex flex-wrap gap-2 items-center min-h-7">
            {participants.map((participant) => (
              <span
                key={participant}
                className={`text-xs px-3 py-1 rounded-full ${
                  participant === currentUser
                    ? "bg-[var(--peach-strong)] text-white"
                    : "bg-[var(--surface-2)] text-[var(--ink)]"
                }`}
              >
                {participant === currentUser ? `${participant} (You)` : participant}
              </span>
            ))}
          </div>
        </div>

        <main ref={chatBoxRef} className="min-h-0 overflow-auto px-4 md:px-8 py-5 bg-[var(--surface)]">
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
                key={index}
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
                  <p className="text-sm leading-relaxed break-words">{message.content}</p>
                  <p className="text-[11px] opacity-70 mt-1">{timeAgo(message.timeStamp)}</p>
                </div>
              </div>
            ))}
        </main>

        <div className="h-16 px-4 md:px-8 bg-white border-t border-[#efefef] flex items-center gap-2">
          <button
            onClick={() => setShowInviteModal(true)}
            className="h-10 px-4 rounded-full bg-[var(--surface-2)] text-[var(--ink)] flex items-center justify-center text-sm font-semibold hover:bg-[#e8e7e5]"
          >
            Invite
          </button>
          <input
            value={input}
            onChange={(e) => {
              const nextValue = e.target.value.slice(0, MAX_MESSAGE_LENGTH);
              setInput(nextValue);
              const client = stompClientRef.current;
              if (client?.connected) {
                client.publish({
                  destination: `/app/typing/${roomId}`,
                  body: JSON.stringify({ sender: currentUser, roomId, typing: nextValue.trim().length > 0 }),
                });
                if (typingTimeoutRef.current) {
                  clearTimeout(typingTimeoutRef.current);
                }
                typingTimeoutRef.current = setTimeout(() => {
                  client.publish({
                    destination: `/app/typing/${roomId}`,
                    body: JSON.stringify({ sender: currentUser, roomId, typing: false }),
                  });
                }, 1200);
              }
            }}
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
        <div className="px-4 md:px-8 pb-3 text-xs text-[var(--muted)] h-6">
          {typingLabel}
        </div>
      </div>
      {showInviteModal && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-[var(--ink)]">Invite To Room</h2>
              <button
                onClick={() => setShowInviteModal(false)}
                className="h-9 w-9 rounded-full bg-[var(--surface-2)] text-[var(--ink)] flex items-center justify-center"
              >
                <MdClose size={20} />
              </button>
            </div>

            <p className="text-sm text-[var(--muted)] mt-2">
              Share this invite to let others join room <span className="font-semibold">{roomId}</span>.
            </p>

            <div className="mt-5 flex justify-center">
              <img src={qrUrl} alt={`Invite QR for room ${roomId}`} className="w-56 h-56 rounded-2xl border" />
            </div>

            <div className="mt-4 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--ink)] break-all">
              {inviteUrl}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={copyInviteLink}
                className="h-11 rounded-xl bg-[var(--ink)] text-white font-semibold flex items-center justify-center gap-2"
              >
                <MdContentCopy size={18} />
                Copy Link
              </button>
              <button
                onClick={shareInviteLink}
                className="h-11 rounded-xl bg-[var(--surface-2)] text-[var(--ink)] font-semibold flex items-center justify-center gap-2"
              >
                <MdShare size={18} />
                Share
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes fadeInMsg { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
};

export default ChatPage;
