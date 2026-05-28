import { httpClient } from "../config/AxiosHelper";

const HEALTH_CHECK_TIMEOUT_MS = 5000;
const HEALTH_CHECK_RETRY_DELAY_MS = 2500;
const HEALTH_CHECK_MAX_WAIT_MS = 70000;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const waitForBackendReady = async (onPending) => {
  const startedAt = Date.now();
  let attempts = 0;

  while (Date.now() - startedAt < HEALTH_CHECK_MAX_WAIT_MS) {
    attempts += 1;
    try {
      const response = await httpClient.get(`/api/v1/health`, {
        timeout: HEALTH_CHECK_TIMEOUT_MS,
      });
      if (response?.data?.status === "UP") {
        return response.data;
      }
    } catch (error) {
      if (attempts === 1 && typeof onPending === "function") {
        onPending();
      }
    }

    await delay(HEALTH_CHECK_RETRY_DELAY_MS);
  }

  throw new Error("Backend did not become ready in time");
};

export const createRoomApi = async (roomDetail) => {
  const respone = await httpClient.post(`/api/v1/rooms`, roomDetail, {
    headers: {
      "Content-Type": "text/plain",
    },
  });
  return respone.data;
};

export const generateRoomApi = async () => {
  const response = await httpClient.post(`/api/v1/rooms/generate`);
  return response.data;
};

export const joinChatApi = async (roomId, userName) => {
  const encodedRoomId = encodeURIComponent(roomId);
  const response = await httpClient.get(
    `/api/v1/rooms/${encodedRoomId}?username=${encodeURIComponent(userName)}`
  );
  return response.data;
};

export const getMessagess = async (roomId, size = 50, page = 0) => {
  const encodedRoomId = encodeURIComponent(roomId);
  const response = await httpClient.get(
    `/api/v1/rooms/${encodedRoomId}/messages?size=${size}&page=${page}`
  );
  return response.data;
};

export const summarizeRoom = async (roomId) => {
  const encodedRoomId = encodeURIComponent(roomId);
  const response = await httpClient.get(
    `/api/v1/rooms/${encodedRoomId}/summarize`
  );
  return response.data;
};
