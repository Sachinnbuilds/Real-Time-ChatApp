import React, { useEffect, useState } from "react";
import chatIcon from "../assets/chat.png";
import toast from "react-hot-toast";
import { createRoomApi, joinChatApi } from "../services/RoomService";
import useChatContext from "../context/ChatContext";
import { useNavigate, useParams, useSearchParams } from "react-router";

const JoinCreateChat = () => {
  const [detail, setDetail] = useState({
    roomId: "",
    userName: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingAction, setLoadingAction] = useState("");

  const { setRoomId, setCurrentUser, setConnected } = useChatContext();
  const navigate = useNavigate();
  const { roomId: inviteRoomId } = useParams();
  const [searchParams] = useSearchParams();
  const inviterName = searchParams.get("inviter")?.trim() || "";

  useEffect(() => {
    if (!inviteRoomId) return;
    setDetail((prev) => ({
      ...prev,
      roomId: inviteRoomId,
    }));
  }, [inviteRoomId]);

  function getReadableError(error) {
    const code = error?.response?.data?.code;
    const message = error?.response?.data?.message;
    const hint = error?.response?.data?.hint;
    if (code === "ROOM_NOT_FOUND") return "Room not found. Ask your friend to create it again.";
    if (code === "ROOM_FULL") return "Room is full (max 5 people). Try another room.";
    if (code === "USERNAME_TAKEN") return "Username already in use in this room. Pick another name.";
    if (code === "ROOM_EXISTS") return "Room already exists. Use Join or choose another room id.";
    return message || hint || "Something went wrong. Please try again.";
  }

  function handleFormInputChange(event) {
    setDetail({
      ...detail,
      [event.target.name]: event.target.value,
    });
  }

  function validateForm() {
    const roomId = detail.roomId.trim();
    const userName = detail.userName.trim();

    if (!roomId || !userName) {
      toast.error("Username and room ID are required");
      return false;
    }
    if (roomId.length < 3 || roomId.length > 60) {
      toast.error("Room ID must be 3 to 60 characters");
      return false;
    }
    if (userName.length < 2 || userName.length > 40) {
      toast.error("Username must be 2 to 40 characters");
      return false;
    }
    return true;
  }

  async function joinChat() {
    if (!validateForm()) return;
    setLoadingAction("Joining room...");
    setIsSubmitting(true);
    try {
      const room = await joinChatApi(detail.roomId.trim(), detail.userName.trim());
      toast.success("Joined room");
      setCurrentUser(detail.userName.trim());
      setRoomId(room.roomId);
      setConnected(true);
      navigate("/chat");
    } catch (error) {
      if (error?.response) {
        toast.error(getReadableError(error));
      } else {
        toast.error("Error in joining room");
      }
    } finally {
      setIsSubmitting(false);
      setLoadingAction("");
    }
  }

  async function createRoom() {
    if (!validateForm()) return;
    setLoadingAction("Creating room...");
    setIsSubmitting(true);
    try {
      const response = await createRoomApi(detail.roomId.trim());
      toast.success("Room created");
      setCurrentUser(detail.userName.trim());
      setRoomId(response.roomId);
      setConnected(true);
      navigate("/chat");
    } catch (error) {
      if (error?.response) {
        toast.error(getReadableError(error));
      } else {
        toast.error("Error in creating room");
      }
    } finally {
      setIsSubmitting(false);
      setLoadingAction("");
    }
  }

  return (
    <div className="min-h-[100dvh] px-3 py-6 md:px-4 md:py-10 relative">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <section className="bg-[var(--ink)] text-white rounded-[1.5rem] md:rounded-[2rem] p-6 md:p-8 shadow-[0_18px_50px_rgba(35,35,35,0.22)] animate-[fadeIn_.25s_ease] flex flex-col justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Chit-Chat</p>
            <h1 className="mt-3 text-3xl md:text-5xl font-extrabold leading-tight">Talk with your gang instantly.</h1>
            <p className="mt-4 text-sm md:text-base text-slate-200">
              Quicker responses, real-time vibes. Join in, chat freely, and leave with no data trail.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <img src={chatIcon} className="w-11 h-11 rounded-2xl object-cover" alt="Chit-Chat" />
              <p className="text-sm text-slate-200">Fast room-based chat for small groups.</p>
            </div>
          </div>
        </section>

        <div className="w-full bg-[var(--surface)] rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-8 shadow-[0_18px_50px_rgba(35,35,35,0.22)] animate-[fadeIn_.25s_ease]">
          <div className="mb-6">
            <p className="text-sm text-[var(--muted)]">Live Chat</p>
            <h2 className="text-2xl md:text-3xl font-extrabold text-[var(--ink)]">Join Room</h2>
          </div>
          {inviterName && (
            <div className="mb-4 rounded-xl bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--ink)]">
              Invited by <span className="font-bold">{inviterName}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-[var(--ink)] mb-2">
                Username
              </label>
              <input
                onChange={handleFormInputChange}
                value={detail.userName}
                type="text"
                id="name"
                name="userName"
                placeholder="e.g. Sachin"
                className="w-full bg-[var(--surface-2)] text-[var(--ink)] px-4 py-3 rounded-2xl border border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--peach)]"
              />
            </div>

            <div>
              <label htmlFor="room" className="block text-sm font-semibold text-[var(--ink)] mb-2">
                Room ID
              </label>
              <input
                id="room"
                name="roomId"
                onChange={handleFormInputChange}
                value={detail.roomId}
                type="text"
                placeholder="e.g. java-team-room"
                className="w-full bg-[var(--surface-2)] text-[var(--ink)] px-4 py-3 rounded-2xl border border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--peach)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-6 md:mt-7">
            <button
              disabled={isSubmitting}
              onClick={joinChat}
              className="py-3 rounded-2xl font-bold text-[var(--ink)] bg-white hover:bg-[#f4f4f4] disabled:opacity-60"
            >
              {isSubmitting && loadingAction.startsWith("Joining") ? "Joining..." : "Join"}
            </button>
            <button
              disabled={isSubmitting}
              onClick={createRoom}
              className="py-3 rounded-2xl font-bold text-white bg-[var(--ink)] hover:bg-[var(--ink-soft)] disabled:opacity-60"
            >
              {isSubmitting && loadingAction.startsWith("Creating") ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      </div>

      <footer className="max-w-5xl mx-auto mt-5 bg-[var(--surface)] rounded-2xl px-4 py-3 text-xs md:text-sm text-[var(--ink)] shadow-[0_10px_25px_rgba(35,35,35,0.12)]">
        <span className="font-semibold">Sachin Ramesh</span>
        <span className="mx-2 text-[var(--muted)]">|</span>
        <a className="underline" href="mailto:sachinrc2006@gmail.com">
          sachinrc2006@gmail.com
        </a>
        <span className="mx-2 text-[var(--muted)]">|</span>
        <a className="underline" href="https://www.linkedin.com/in/sachin-ramesh-448a46317" target="_blank" rel="noreferrer">
          LinkedIn
        </a>
        <span className="mx-2 text-[var(--muted)]">|</span>
        <a className="underline" href="https://github.com/Sachinnbuilds" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>

      {isSubmitting && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
          <div className="bg-white rounded-2xl px-5 py-4 shadow-lg flex items-center gap-3">
            <span className="h-5 w-5 rounded-full border-2 border-[var(--peach)] border-t-transparent animate-spin" />
            <p className="text-sm font-semibold text-[var(--ink)]">{loadingAction}</p>
          </div>
        </div>
      )}
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
};

export default JoinCreateChat;
