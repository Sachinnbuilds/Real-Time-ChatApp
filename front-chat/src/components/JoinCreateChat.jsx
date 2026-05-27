import React, { useEffect, useState } from "react";
import chatIcon from "../assets/chat.png";
import toast from "react-hot-toast";
import { createRoomApi, joinChatApi, waitForBackendReady } from "../services/RoomService";
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
  const isInviteFlow = Boolean(inviteRoomId);
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
    if (code === "USERNAME_TAKEN") return "Display name already in use in this room. Pick another name.";
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

    if (!userName) {
      toast.error("Display name is required");
      return false;
    }
    if (!roomId) {
      toast.error(isInviteFlow ? "Invalid invite link. Please ask your friend for a new link." : "Room ID is required");
      return false;
    }
    if (roomId.length < 3 || roomId.length > 60) {
      toast.error("Room ID must be 3 to 60 characters");
      return false;
    }
    if (userName.length < 2 || userName.length > 40) {
      toast.error("Display name must be 2 to 40 characters");
      return false;
    }
    return true;
  }

  async function warmUpBackend(initialAction) {
    setLoadingAction(initialAction);
    await waitForBackendReady(() => {
      setLoadingAction("Starting chat service... this can take up to a minute");
    });
  }

  async function joinChat() {
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      await warmUpBackend("Checking chat service...");
      setLoadingAction("Joining room...");
      const room = await joinChatApi(detail.roomId.trim(), detail.userName.trim());
      toast.success("Joined room");
      setCurrentUser(detail.userName.trim());
      setRoomId(room.roomId);
      setConnected(true);
      navigate("/chat");
    } catch (error) {
      if (error?.response) {
        toast.error(getReadableError(error));
      } else if (error?.message === "Backend did not become ready in time") {
        toast.error("Chat service is waking up. Please try again in a few moments.");
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
    setIsSubmitting(true);
    try {
      await warmUpBackend("Checking chat service...");
      setLoadingAction("Creating room...");
      const response = await createRoomApi(detail.roomId.trim());
      toast.success("Room created");
      setCurrentUser(detail.userName.trim());
      setRoomId(response.roomId);
      setConnected(true);
      navigate("/chat");
    } catch (error) {
      if (error?.response) {
        toast.error(getReadableError(error));
      } else if (error?.message === "Backend did not become ready in time") {
        toast.error("Chat service is waking up. Please try again in a few moments.");
      } else {
        toast.error("Error in creating room");
      }
    } finally {
      setIsSubmitting(false);
      setLoadingAction("");
    }
  }

  return (
    <div className="min-h-[100dvh] px-3 md:px-6 bg-[linear-gradient(135deg,#f7c9b0,#f4ae8c)] overflow-hidden flex flex-col">
      <div className="flex-1 flex items-center justify-center py-6 md:py-8">
      <div className="w-full max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 overflow-hidden rounded-[1.5rem] md:rounded-[2rem] shadow-[0_24px_70px_rgba(60,30,10,0.25)] animate-[fadeIn_.25s_ease] bg-white">
          <div className="bg-white p-6 md:p-10 lg:p-12">
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">Instant Talk</p>
              <h2 className="text-2xl md:text-3xl font-extrabold text-[var(--ink)]">
                {isInviteFlow ? "Join Room" : "Join / Create Room"}
              </h2>
            </div>
          {isInviteFlow && (
            <div className="mb-4 rounded-xl bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--ink)]">
              {inviterName ? (
                <>
                  Invited by <span className="font-bold">{inviterName}</span> to room{" "}
                  <span className="font-bold">{detail.roomId}</span>
                </>
              ) : (
                <>
                  You were invited to room <span className="font-bold">{detail.roomId}</span>
                </>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-[var(--ink)] mb-2">
                Display Name
              </label>
              <input
                onChange={handleFormInputChange}
                value={detail.userName}
                type="text"
                id="name"
                name="userName"
                placeholder="e.g. Alex (only for this room)"
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
                readOnly={isInviteFlow}
                className="w-full bg-[var(--surface-2)] text-[var(--ink)] px-4 py-3 rounded-2xl border border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--peach)]"
              />
            </div>
          </div>

          <div className={`mt-6 md:mt-7 ${isInviteFlow ? "grid grid-cols-1 gap-3" : "grid grid-cols-2 gap-3"}`}>
            <button
              disabled={isSubmitting}
              onClick={joinChat}
              className="py-3 rounded-2xl font-bold text-[var(--ink)] bg-white hover:bg-[#f4f4f4] disabled:opacity-60"
            >
              {isSubmitting && loadingAction.startsWith("Joining") ? "Joining..." : "Join Room"}
            </button>
            {!isInviteFlow && (
              <button
                disabled={isSubmitting}
                onClick={createRoom}
                className="py-3 rounded-2xl font-bold text-white bg-[var(--ink)] hover:bg-[var(--ink-soft)] disabled:opacity-60"
              >
                {isSubmitting && loadingAction.startsWith("Creating") ? "Creating..." : "Create"}
              </button>
            )}
          </div>
          </div>

          <section className="bg-[linear-gradient(145deg,#ec7b4f,#f2926b)] text-white p-6 md:p-10 flex flex-col justify-between relative overflow-hidden">
            <div>
              <img src={chatIcon} className="w-12 h-12 rounded-2xl object-cover bg-white/15 p-1" alt="Instant Talk" />
              <h1 className="mt-5 text-4xl md:text-5xl font-extrabold leading-none">Instant Talk</h1>
              <p className="mt-4 text-base md:text-lg text-white/95 max-w-sm">
                Fast, temporary chat rooms for instant convos.
              </p>
            </div>
            <div className="hidden lg:flex items-center justify-center h-28 rounded-3xl bg-white/14 backdrop-blur-[1px]">
              <div className="text-sm font-semibold tracking-wide">Private + Instant + Ephemeral</div>
            </div>
          </section>
        </div>
      </div>
      </div>

      <footer className="py-3 md:py-4 text-xs md:text-sm text-[var(--ink)] flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
          <span className="font-semibold">Sachin Ramesh</span>
          <span className="text-[var(--muted)]">|</span>
          <a className="underline" href="mailto:sachinrc2006@gmail.com">
            Gmail
          </a>
          <span className="text-[var(--muted)]">|</span>
          <a className="underline" href="https://www.linkedin.com/in/sachin-ramesh-448a46317" target="_blank" rel="noreferrer">
            LinkedIn
          </a>
          <span className="text-[var(--muted)]">|</span>
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
