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
    maxReconnectAttempts = 10,
  } = options;

  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!token || typeof window === "undefined") return;

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

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;

        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(reconnectInterval * Math.pow(1.5, reconnectAttemptsRef.current), 60000);
          reconnectAttemptsRef.current++;
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
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

  useEffect(() => {
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
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { connected, sendPing };
}
