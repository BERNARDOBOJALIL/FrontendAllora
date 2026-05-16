export type SocketStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export interface LocationPayload {
  lat: number;
  lng: number;
  timestamp: string;
  clientId?: string;
}

export interface WebSocketServiceCallbacks {
  onStatusChange?: (status: SocketStatus) => void;
  onOpen?: () => void;
  onClose?: (event: WebSocketCloseEvent) => void;
  onError?: (error: { message: string; rawEvent?: Event }) => void;
  onMessage?: (data: unknown, raw: string) => void;
}

export class LocationWebSocketService {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = false;
  private url = "";
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelayMs = 2000;

  constructor(private readonly callbacks: WebSocketServiceCallbacks = {}) {}

  static buildEndpoint(baseUrl: string, userId: string): string {
    const cleanBaseUrl = baseUrl.trim().replace(/\/$/, "");
    return `${cleanBaseUrl}/${encodeURIComponent(userId.trim())}`;
  }

  getStatus(): SocketStatus {
    if (!this.socket) {
      return "disconnected";
    }

    switch (this.socket.readyState) {
      case WebSocket.CONNECTING:
        return "connecting";
      case WebSocket.OPEN:
        return "connected";
      case WebSocket.CLOSING:
      case WebSocket.CLOSED:
      default:
        return "disconnected";
    }
  }

  connect(baseUrl: string, userId: string): void {
    const endpoint = LocationWebSocketService.buildEndpoint(baseUrl, userId);

    if (
      this.socket &&
      this.socket.readyState === WebSocket.OPEN &&
      this.url === endpoint
    ) {
      return;
    }

    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }

    this.shouldReconnect = true;
    this.url = endpoint;
    this.clearReconnectTimer();
    this.createSocket("connecting");
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();

    if (!this.socket) {
      this.emitStatus("disconnected");
      return;
    }

    this.socket.onclose = null;
    this.socket.close();
    this.socket = null;
    this.emitStatus("disconnected");
  }

  sendLocation(payload: LocationPayload): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.socket.send(JSON.stringify(payload));
    return true;
  }

  private createSocket(status: SocketStatus): void {
    this.emitStatus(status);

    const ws = new WebSocket(this.url);
    this.socket = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.emitStatus("connected");
      this.callbacks.onOpen?.();
    };

    ws.onerror = (event) => {
      this.emitStatus("error");
      this.callbacks.onError?.({
        message: "WebSocket error occurred.",
        rawEvent: event,
      });
    };

    ws.onmessage = (event) => {
      const raw =
        typeof event.data === "string" ? event.data : String(event.data);
      let parsed: unknown = raw;

      try {
        parsed = JSON.parse(raw);
      } catch {
        // Keep raw message when backend payload is plain text.
      }

      this.callbacks.onMessage?.(parsed, raw);
    };

    ws.onclose = (event) => {
      this.callbacks.onClose?.(event);

      if (!this.shouldReconnect) {
        this.socket = null;
        this.emitStatus("disconnected");
        return;
      }

      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emitStatus("error");
      this.callbacks.onError?.({
        message: "Maximum reconnect attempts reached.",
      });
      return;
    }

    this.reconnectAttempts += 1;
    const delay = this.baseReconnectDelayMs * this.reconnectAttempts;
    this.emitStatus("reconnecting");

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect) {
        this.createSocket("reconnecting");
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private emitStatus(status: SocketStatus): void {
    this.callbacks.onStatusChange?.(status);
  }
}
