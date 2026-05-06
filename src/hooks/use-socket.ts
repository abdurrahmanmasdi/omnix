import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "@/store/auth-store";
import axios from "axios";

// 1. Strictly type the payload matching what NestJS broadcasts
export interface LiveMessagePayload {
  conversationId: string;
  phoneNumber: string;
  message: {
    id: string;
    content: string;
    metaMessageId: string | null;
    type: string;
    handledBy: string;
    createdAt: string;
  };
}

export const useSocket = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const setAuth = useAuthStore((state) => state.setAuth);
  const logout = useAuthStore((state) => state.logout);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    // Don't attempt connection if not authenticated
    if (!accessToken) return;

    // 2. Initialize the socket connection, passing the JWT in the auth payload
    const socketInstance: Socket = io("http://localhost:3000", {
      auth: { token: accessToken },
      withCredentials: true,
    });

    // 3. Track connection status
    console.log("Attempting to connect to WebSocket with token:", accessToken);
    socketInstance.on("connect", () => {
      console.log("🟢 Socket connected");
      setIsConnected(true);
    });

    socketInstance.on("disconnect", () => {
      console.log("🔴 Socket disconnected");
      setIsConnected(false);
    });

    socketInstance.on("connect_error", async (err) => {
      console.error("🔴 Socket connection error:", err.message);

      // If NestJS rejected us because the token died...
      if (err.message.includes("jwt expired")) {
        console.log("Attempting to refresh expired JWT for socket...");
        try {
          const res = await axios.post(
            "http://localhost:3000/auth/refresh",
            {},
            { withCredentials: true },
          );
          // Updating Zustand will instantly trigger this useEffect to re-run with the new token!
          setAuth(res.data.access_token, res.data.user);
        } catch (refreshErr) {
          console.error("Socket refresh failed. Session dead.");
          logout();
          window.location.href = "/login";
        }
      }
    });

    const timer = setTimeout(() => {
      setSocket(socketInstance);
    }, 0);

    // 4. Cleanup function: disconnect when the component unmounts
    return () => {
      clearTimeout(timer);
      socketInstance.disconnect();
    };
  }, [accessToken, setAuth, logout]);

  return { socket, isConnected };
};
