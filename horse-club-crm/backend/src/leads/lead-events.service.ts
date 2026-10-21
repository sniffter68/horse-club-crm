import { Injectable, type MessageEvent } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, Subject } from 'rxjs';

export interface LeadCreatedEvent {
  id: string;
  clientName: string;
  phone: string;
  serviceName: string;
  createdAt: string;
}

@Injectable()
export class LeadEventsService {
  private readonly events = new Subject<MessageEvent>();
  private readonly epoch = randomUUID();
  private sequence = 0;
  private history: Array<{ at: number; event: MessageEvent }> = [];

  publish(payload: LeadCreatedEvent): void {
    const event: MessageEvent = { type: 'lead:created', id: `${this.epoch}:${++this.sequence}`, data: payload };
    this.history = this.history.filter(row => row.at > Date.now() - 300_000).slice(-99);
    this.history.push({ at: Date.now(), event });
    this.events.next(event);
  }

  stream(lastEventId?: string): Observable<MessageEvent> {
    return new Observable(subscriber => {
      // Subscribe before replay; publication and replay are synchronous.
      const subscription = this.events.subscribe(event => subscriber.next(event));
      const prefix = `${this.epoch}:`;
      const cursor = lastEventId?.startsWith(prefix) ? Number(lastEventId.slice(prefix.length)) : NaN;
      if (Number.isSafeInteger(cursor) && cursor >= 0 && cursor <= this.sequence) {
        for (const row of this.history) {
          if (row.at > Date.now() - 300_000 && Number(row.event.id!.slice(prefix.length)) > cursor) subscriber.next(row.event);
        }
      }
      subscriber.next({ type: 'ready', id: `${this.epoch}:${this.sequence}`, data: {} });
      const heartbeat = setInterval(() => subscriber.next({ type: 'heartbeat', data: {} }), 15_000);
      // Reconnect through JWT/role guards regularly to revalidate the session.
      const expiry = setTimeout(() => subscriber.complete(), 60_000);
      return () => { clearInterval(heartbeat); clearTimeout(expiry); subscription.unsubscribe(); };
    });
  }
}
