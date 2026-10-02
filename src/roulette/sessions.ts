import { randomUUID } from 'node:crypto';
import { defaultConditions, type Assignment, type Conditions, type Participant } from './logic.js';
export const SESSION_TTL = 30 * 60 * 1000;
export interface Session {
  id: string;
  ownerId: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  voiceName: string;
  members: Participant[];
  conditions: Conditions;
  results: Assignment[] | null;
  revision: number;
  busy: boolean;
  expiresAt: number;
}
export class SessionStore {
  private readonly sessions = new Map<string, Session>();
  create(input: Pick<Session, 'ownerId' | 'guildId' | 'channelId' | 'voiceName' | 'members'>,
    conditions = defaultConditions(), now = Date.now()): Session {
    this.cleanup(now);
    if (this.sessions.size >= 1000) throw new Error('条件パネルが多すぎます。時間を置いて再実行してください。');
    const session: Session = {
      ...input, members: input.members.map(member => ({ ...member })), id: randomUUID(),
      conditions: structuredClone(conditions), results: null,
      revision: 0, busy: false, expiresAt: now + SESSION_TTL,
    };
    this.sessions.set(session.id, session); return session;
  }
  get(id: string, now = Date.now()): Session | undefined {
    const session = this.sessions.get(id);
    if (session && session.expiresAt <= now) { this.sessions.delete(id); return undefined; }
    return session;
  }
  delete(id: string): void { this.sessions.delete(id); }
  cleanup(now = Date.now()): void {
    for (const [id, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(id);
  }
}
export const sessionStore = new SessionStore();
const cleanupTimer = setInterval(() => sessionStore.cleanup(), 60_000);
cleanupTimer.unref();
