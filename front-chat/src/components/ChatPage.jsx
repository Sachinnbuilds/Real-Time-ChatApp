import React, { useEffect, useRef, useState } from "react";
import { MdChatBubbleOutline, MdClose, MdContentCopy, MdSend, MdShare } from "react-icons/md";
import useChatContext from "../context/ChatContext";
import { useNavigate } from "react-router";
import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";
import toast from "react-hot-toast";
import { baseURL } from "../config/AxiosHelper";
import { getMessagess } from "../services/RoomService";
import { timeAgo } from "../config/helper";

const MAX_MESSAGE_LENGTH = 500;
const TYPING_INDICATOR_TTL_MS = 2500;

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
  const [typingState, setTypingState] = useState({});
  const [showInviteModal, setShowInviteModal] = useState(false);
  const chatBoxRef = useRef(null);
  const stompClientRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const typingUsers = Object.keys(typingState);

  useEffect(() => {
    if (!connected) {
      navigate("/");
    }
  }, [connected, navigate]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const isMobileViewport = () => window.matchMedia("(max-width: 767px)").matches;
    const setMobileViewportHeight = () => {
      if (!isMobileViewport()) {
        document.documentElement.style.removeProperty("--chat-mobile-vh");
        return;
      }
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty("--chat-mobile-vh", `${Math.round(viewportHeight)}px`);
    };

    setMobileViewportHeight();

    const visualViewport = window.visualViewport;
    window.addEventListener("resize", setMobileViewportHeight);
    window.addEventListener("orientationchange", setMobileViewportHeight);
    visualViewport?.addEventListener("resize", setMobileViewportHeight);

    return () => {
      window.removeEventListener("resize", setMobileViewportHeight);
      window.removeEventListener("orientationchange", setMobileViewportHeight);
      visualViewport?.removeEventListener("resize", setMobileViewportHeight);
      document.documentElement.style.removeProperty("--chat-mobile-vh");
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!window.matchMedia("(max-width: 767px)").matches) return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, []);

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
    if (typingUsers.length === 0) return undefined;

    const pruneTimer = setInterval(() => {
      const now = Date.now();
      setTypingState((prev) => {
        const next = Object.fromEntries(
          Object.entries(prev).filter(([, expiresAt]) => expiresAt > now)
        );
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 500);

    return () => {
      clearInterval(pruneTimer);
    };
  }, [typingUsers.length]);

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
        client.subscribe(`/user/queue/system`, (message) => {
          const payload = JSON.parse(message.body);
          if (!payload?.code) return;
          toast.error(payload.message || "Unable to stay connected to this room");
          if (stompClientRef.current?.active) {
            stompClientRef.current.deactivate();
          }
          setConnected(false);
          setRoomId("");
          setCurrentUser("");
          navigate("/");
        });
        client.subscribe(`/topic/room/${roomId}`, (message) => {
          const newMessage = JSON.parse(message.body);
          if (newMessage?.sender) {
            setTypingState((prev) => {
              if (!prev[newMessage.sender]) return prev;
              const next = { ...prev };
              delete next[newMessage.sender];
              return next;
            });
          }
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
          setTypingState((prev) => {
            if (payload.typing) {
              return {
                ...prev,
                [payload.sender]: Date.now() + TYPING_INDICATOR_TTL_MS,
              };
            }
            if (!prev[payload.sender]) {
              return prev;
            }
            const next = { ...prev };
            delete next[payload.sender];
            return next;
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
      setTypingState({});
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
  const shouldShowInviteFriendsPrompt =
    !isLoadingMessages && messages.length === 0 && participants.length <= 1;
  const counterTextClass =
    inputLength > 475 ? "text-rose-500" : inputLength > 450 ? "text-amber-600" : "text-[var(--muted)]";
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
    <div className="min-h-[var(--chat-mobile-vh)] h-[var(--chat-mobile-vh)] px-0 py-0 bg-[var(--surface)] md:min-h-screen md:h-auto md:bg-transparent md:px-4 md:py-6 overflow-hidden">
      <div className="mx-auto max-w-5xl h-[var(--chat-mobile-vh)] md:h-[92vh] rounded-none md:rounded-[2rem] overflow-hidden border-0 md:border md:border-[#e6ded1] bg-[linear-gradient(180deg,#faf9f6_0%,#f4f2ee_100%)] shadow-none md:shadow-[0_22px_60px_rgba(38,26,18,0.22)] grid grid-rows-[auto_auto_minmax(0,1fr)_auto]">
        <header className="bg-[linear-gradient(120deg,#1f2430,#2a3040)] text-white px-4 py-3 md:px-8 md:py-4 border-b border-white/10">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 pr-1">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Room</p>
              <h1 className="font-extrabold text-xl md:text-4xl leading-tight truncate">{roomId}</h1>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end">
              <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto pb-0.5">
              <div
                  className={`h-9 md:h-10 rounded-lg md:rounded-xl px-3 md:px-4 inline-flex items-center justify-center whitespace-nowrap text-xs md:text-sm font-bold text-white shadow-[0_6px_14px_rgba(0,0,0,0.2)] md:min-w-[122px] ${statusBadgeClass}`}
              >
                {statusText}
              </div>
                <div className="h-9 md:h-10 rounded-lg md:rounded-xl bg-white/8 border border-white/10 px-2.5 md:px-4 inline-flex items-center justify-center gap-1.5 md:gap-2 whitespace-nowrap md:min-w-[122px]">
                <span className="text-xs md:text-sm text-slate-300">Online</span>
                <span className="text-xs md:text-sm font-bold text-[#ffd8c4]">{onlineCount}</span>
              </div>
              </div>
              <button
                onClick={handleLogout}
                className="h-10 md:h-10 rounded-lg md:rounded-xl bg-white text-[var(--ink)] px-3 md:px-4 inline-flex items-center justify-center whitespace-nowrap text-xs md:text-sm font-bold hover:bg-[#f3f3f3] border border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 w-full md:w-auto md:min-w-[146px]"
              >
                Leave Room
              </button>
            </div>
          </div>

        </header>

        <div className="relative px-4 md:px-8 py-2.5 bg-[#f7f6f3] border-b border-[#e9e5dd]">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Participants</span>
            <span className="text-[11px] font-semibold text-[var(--ink)]">{participants.length}</span>
          </div>
          <div className="flex gap-2 items-center min-h-7 overflow-x-auto whitespace-nowrap pr-3 md:pr-6 pb-1 scrollbar-thin">
            {participants.map((participant) => (
              <span
                key={participant}
                className={`text-xs px-3 py-1 rounded-full shrink-0 ${
                  participant === currentUser
                    ? "bg-[var(--peach-strong)] text-white shadow-[0_4px_12px_rgba(236,123,79,0.35)]"
                    : "bg-white border border-[#e8e3da] text-[var(--ink)]"
                }`}
              >
                {participant === currentUser ? `${participant} (You)` : participant}
              </span>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#f7f6f3] to-transparent" />
        </div>

        <main ref={chatBoxRef} className="min-h-0 overflow-y-auto overflow-x-hidden px-3 md:px-8 py-4 md:py-5 bg-transparent">
          {isLoadingMessages && (
            <div className="space-y-3 animate-pulse">
              <div className="h-16 w-[55%] bg-[var(--surface-2)] rounded-[1.35rem]" />
              <div className="h-16 w-[70%] bg-[var(--surface-2)] rounded-[1.35rem] ml-auto" />
              <div className="h-16 w-[40%] bg-[var(--surface-2)] rounded-[1.35rem]" />
            </div>
          )}

          {!isLoadingMessages && messages.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-[var(--muted)]">
                <MdChatBubbleOutline className="mx-auto mb-2" size={26} />
                <p className="font-semibold">No messages yet</p>
                <p className="text-xs mt-1">Start the conversation.</p>
              </div>
            </div>
          )}

          {!isLoadingMessages &&
            messages.map((message, index) => (
              <div
                key={index}
                className="mb-3 flex w-full min-w-0 overflow-x-hidden px-1 animate-[fadeInMsg_.2s_ease]"
              >
                <div
                    className={`min-w-0 w-auto max-w-[min(80%,calc(100vw-env(safe-area-inset-left)-env(safe-area-inset-right)-1.5rem))] md:max-w-[70%] shrink overflow-hidden rounded-[1.35rem] px-4 py-3 shadow-[0_4px_14px_rgba(40,28,20,0.08)] ${
                    message.sender === currentUser
                      ? "ml-auto mr-0 bg-[var(--peach-strong)] text-white"
                      : "mr-auto ml-0 bg-white border border-[#e9e4dc] text-[var(--ink)]"
                  }`}
                >
                  <p className="text-[11px] font-semibold opacity-80 mb-1">{message.sender}</p>
                  <p className="text-sm leading-6 whitespace-pre-wrap break-all [overflow-wrap:anywhere]">{message.content}</p>
                  <p className="text-[10px] opacity-60 mt-1.5">{timeAgo(message.timeStamp)}</p>
                </div>
              </div>
            ))}
        </main>

        <div className="sticky bottom-0 z-10 px-3 md:px-8 pt-2 pb-[calc(0.55rem+env(safe-area-inset-bottom))] bg-[linear-gradient(180deg,rgba(250,249,246,0),rgba(250,249,246,0.9)_42%,rgba(250,249,246,1)_100%)]">
          <div className="min-h-6 px-1 pb-2 text-xs text-[var(--muted)]">
            {typingLabel && (
              <div className="inline-flex max-w-full items-center rounded-full bg-white/90 px-3 py-1 shadow-[0_6px_18px_rgba(30,30,30,0.06)]">
                <span className="truncate">{typingLabel}</span>
              </div>
            )}
          </div>
          <div className="rounded-2xl bg-white/95 supports-[backdrop-filter]:bg-white/88 backdrop-blur border border-[#ebe8e2] shadow-[0_8px_22px_rgba(30,30,30,0.08)] px-2 md:px-3 py-2 flex items-center gap-2">
            <div className="relative shrink-0">
              {shouldShowInviteFriendsPrompt && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#f3cdb9] bg-[#fff1e9] px-3 py-1 text-[11px] font-semibold text-[#7a3e24] shadow-[0_8px_18px_rgba(122,62,36,0.16)]">
                  Invite your friends
                  <span className="absolute left-1/2 top-full h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-b border-[#f3cdb9] bg-[#fff1e9]" />
                </div>
              )}
              <button
                onClick={() => setShowInviteModal(true)}
                className="h-10 px-3 md:px-4 rounded-full bg-[var(--surface-2)] text-[var(--ink)] flex items-center justify-center text-xs md:text-sm font-semibold hover:bg-[#e8e7e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--peach)]"
              >
                Invite
              </button>
            </div>
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
              className="flex-1 min-w-0 bg-[var(--surface)] text-[var(--ink)] rounded-full px-4 md:px-5 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--peach)] text-sm placeholder:text-[#9195a1]"
            />
            <div className={`block text-[10px] md:text-[11px] w-14 text-right shrink-0 ${counterTextClass}`}>
              {inputLength}/{MAX_MESSAGE_LENGTH}
            </div>
            <button
              onClick={sendMessage}
              disabled={cannotSend}
              className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--peach)] ${
                cannotSend ? "bg-[#ddd] text-[#999]" : "bg-[var(--peach-strong)] text-white"
              }`}
            >
              <MdSend size={18} />
            </button>
          </div>
        </div>
      </div>
      {showInviteModal && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-3 md:px-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl p-4 md:p-6 max-h-[95dvh] overflow-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-[var(--ink)]">Invite To Room</h2>
              <button
                onClick={() => setShowInviteModal(false)}
                className="h-9 w-9 rounded-full bg-[var(--surface-2)] text-[var(--ink)] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--peach)]"
              >
                <MdClose size={20} />
              </button>
            </div>

            <p className="text-sm text-[var(--muted)] mt-2">
              Share this invite to let others join room <span className="font-semibold">{roomId}</span>.
            </p>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)] text-center">Invite QR</p>
              <div className="mt-2 flex justify-center">
                <img
                  src={qrUrl}
                  alt={`Invite QR for room ${roomId}`}
                  className="w-40 h-40 md:w-52 md:h-52 rounded-2xl border border-[#e7e4de]"
                />
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)] mb-2">Invite Link</p>
              <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--ink)] break-all border border-[#e7e4de]">
                {inviteUrl}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={copyInviteLink}
                className="h-11 rounded-xl bg-[var(--ink)] text-white font-semibold flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--peach)]"
              >
                <MdContentCopy size={18} />
                Copy Link
              </button>
              <button
                onClick={shareInviteLink}
                className="h-11 rounded-xl bg-[var(--surface-2)] text-[var(--ink)] font-semibold flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--peach)]"
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
