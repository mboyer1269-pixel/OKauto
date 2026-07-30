import type { Notification } from "@okauto/db";

export interface SseClient {
  orgId: string;
  userId: string;
  send: (event: string, data: unknown) => void;
}

/**
 * In-process SSE registry. Single-node by design; swap for Redis pub/sub behind
 * this interface for multi-node deployments.
 */
export class NotificationHub {
  private clients = new Set<SseClient>();

  add(client: SseClient): () => void {
    this.clients.add(client);
    return () => this.clients.delete(client);
  }

  get size(): number {
    return this.clients.size;
  }

  publish(notification: Notification): void {
    for (const client of this.clients) {
      if (client.orgId !== notification.orgId) continue;
      if (notification.userId && notification.userId !== client.userId) continue;
      try {
        client.send("notification", notification);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  broadcast(orgId: string, event: string, data: unknown): void {
    for (const client of this.clients) {
      if (client.orgId !== orgId) continue;
      try {
        client.send(event, data);
      } catch {
        this.clients.delete(client);
      }
    }
  }
}

export const notificationHub = new NotificationHub();
