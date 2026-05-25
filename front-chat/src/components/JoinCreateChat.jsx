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
      if (error?.response?.status === 400) {
        toast.error(error?.response?.data?.message || "Unable to join room");
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
      if (error?.response?.status === 400) {
        toast.error(error?.response?.data?.message || "Room already exists");
      } else {
        toast.error("Error in creating room");
      }
    } finally {
      setIsSubmitting(false);
      setLoadingAction("");
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-3 py-6 md:px-4 md:py-10 relative">
      <div className="w-full max-w-md bg-[var(--surface)] rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-8 shadow-[0_18px_50px_rgba(35,35,35,0.22)] animate-[fadeIn_.25s_ease]">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm text-[var(--muted)]">Live Chat</p>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--ink)]">Join Room</h1>
          </div>
          <img src={chatIcon} className="w-12 h-12 md:w-14 md:h-14 rounded-2xl object-cover" alt="Chat app" />
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
