"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export interface WsEvent {
  type?: string;
  event: string;
  data: any;
  timestamp: string;
}

interface UseWebSocketOptions {
  onEvent?: (event: WsEvent) => void;
  onTransactionStatus?: (data: { transactionId: string; status: string; txHash?: string }) => void;
  onWalletEvent?: (event: string, data: any) => void;
  onAgentEvent?: (event: string, data: any) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function useWebSocket(apiBase: string, token: string | null, options: UseWebSocketOptions = {}) {
  const {
    onEvent,
    onTransactionStatus,
    onWalletEvent,
    onAgentEvent,
    reconnectInterval = 5000,
    maxReconnectAttempts = 5,
  } = options;

  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);

  const connect = useCallback(() => {
    if (!token || typeof window === "undefined") return;
    if (stoppedRef.current) return;
    // Don't open a new connection if one is already open for this token
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    try {
      const wsUrl = apiBase.replace(/^http/, "ws").replace(/\/$/, "");
      const ws = new WebSocket(`${wsUrl}/ws?token=${token}`);

      ws.onopen = () => {
        setConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsEvent = JSON.parse(event.data);

          if (msg.type === "pong") return;

          onEvent?.(msg);

          if (msg.event === "transaction.status" && onTransactionStatus) {
            onTransactionStatus(msg.data);
          }

          if (msg.event?.startsWith("wallet.") && onWalletEvent) {
            onWalletEvent(msg.event, msg.data);
          }

          if (msg.event?.startsWith("agent.") && onAgentEvent) {
            onAgentEvent(msg.event, msg.data);
          }
        } catch {}
      };

      ws.onclose = (event) => {
        setConnected(false);
        wsRef.current = null;

        if (stoppedRef.current) return;

        // Stop reconnecting on auth errors:
        // - 4001: custom auth error code
        // - 1008: policy violation
        // - 1006 on first attempt with no previous success: server rejected the WS handshake (HTTP 401)
        const isAuthError = event.code === 4001 || event.code === 1008;
        const isHandshakeRejected = event.code === 1006 && reconnectAttemptsRef.current === 0;
        const isNormalClose = event.code === 1000 || event.code === 1001;
        if (isAuthError || isHandshakeRejected || isNormalClose) {
          stoppedRef.current = true;
          return;
        }

        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(reconnectInterval * Math.pow(1.5, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        // onerror is always followed by onclose, so no special action needed here
        ws.close();
      };

      wsRef.current = ws;
    } catch {}
  }, [token, apiBase, onEvent, onTransactionStatus, onWalletEvent, onAgentEvent, reconnectInterval, maxReconnectAttempts]);

  const sendPing = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "ping" }));
    }
  }, []);

  // Reset and reconnect when token changes
  useEffect(() => {
    if (tokenRef.current === token) return;
    tokenRef.current = token;
    stoppedRef.current = false;
    reconnectAttemptsRef.current = 0;

    // Close existing connection if token changed
    if (wsRef.current) {
      wsRef.current.close(1000, "Token changed");
      wsRef.current = null;
    }

    connect();

    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, "Cleanup");
        wsRef.current = null;
      }
    };
  }, [token, connect]);

  return { connected, sendPing };
}
