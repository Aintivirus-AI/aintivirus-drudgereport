"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  InboxIcon,
  SearchIcon,
  ApprovedIcon,
  RejectedIcon,
  CoinIcon,
  PublishIcon,
  VoteIcon,
  ClipboardIcon,
} from "./Icons";

interface ActivityEvent {
  id: number;
  event_type: string;
  message: string;
  metadata: string | null;
  created_at: string;
}

interface WarRoomStats {
  submissionsToday: number;
  tokensLaunchedToday: number;
  votesToday: number;
  approvalRate: number;
}

const EVENT_CONFIG: Record<string, { icon: ReactNode; color: string }> = {
  submission_received: { icon: <InboxIcon />, color: "#00D3FF" },
  validation_started: { icon: <SearchIcon />, color: "#f59e0b" },
  approved: { icon: <ApprovedIcon />, color: "#00ff9d" },
  rejected: { icon: <RejectedIcon />, color: "#ef4444" },
  token_minted: { icon: <CoinIcon />, color: "#bf5af2" },
  headline_published: { icon: <PublishIcon />, color: "#00D3FF" },
  vote_cast: { icon: <VoteIcon />, color: "#6366f1" },
};

const DEFAULT_EVENT = { icon: <ClipboardIcon />, color: "#9ca3af" };

function formatTime(dateStr: string): string {
  const date = new Date(dateStr + "Z");
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function WarRoomFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [stats, setStats] = useState<WarRoomStats | null>(null);
  const [connected, setConnected] = useState(false);
  const lastIdRef = useRef<number>(0);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const url = lastIdRef.current > 0
          ? `/api/war-room?after=${lastIdRef.current}&limit=20`
          : "/api/war-room?limit=20";
        
        const res = await fetch(url);
        const data = await res.json();

        if (data.events && data.events.length > 0) {
          const newEvents = data.events.filter(
            (e: ActivityEvent) => e.id > lastIdRef.current
          );
          
          if (newEvents.length > 0) {
            setEvents(prev => [...newEvents, ...prev].slice(0, 50));
            const maxId = Math.max(...newEvents.map((e: ActivityEvent) => e.id));
            if (maxId > lastIdRef.current) {
              lastIdRef.current = maxId;
            }
          }
        }

        if (data.stats) setStats(data.stats);
        setConnected(true);
      } catch {
        setConnected(false);
      }
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="warroom-mini">
      {/* Inline stats row */}
      {stats && (
        <div className="warroom-mini-stats">
          <span className="warroom-mini-stat">
            <span className="warroom-mini-stat-val" style={{ color: "#00D3FF" }}>{stats.submissionsToday}</span> subs
          </span>
          <span className="warroom-mini-stat-sep" />
          <span className="warroom-mini-stat">
            <span className="warroom-mini-stat-val" style={{ color: "#bf5af2" }}>{stats.tokensLaunchedToday}</span> tokens
          </span>
          <span className="warroom-mini-stat-sep" />
          <span className="warroom-mini-stat">
            <span className="warroom-mini-stat-val" style={{ color: "#6366f1" }}>{stats.votesToday}</span> votes
          </span>
          <span className="warroom-mini-stat-sep" />
          <span className="warroom-mini-stat">
            <span className="warroom-mini-stat-val" style={{ color: "#00ff9d" }}>{stats.approvalRate}%</span> approved
          </span>
          <div className="warroom-mini-live">
            <span className={`warroom-mini-live-dot ${connected ? "connected" : ""}`} />
            {connected ? "LIVE" : "..."}
          </div>
        </div>
      )}

      {/* Compact event feed */}
      <div className="warroom-mini-feed">
        {events.length === 0 ? (
          <div className="warroom-mini-empty">Waiting for activity...</div>
        ) : (
          events.map((event) => {
            const config = EVENT_CONFIG[event.event_type] || DEFAULT_EVENT;
            return (
              <div
                key={event.id}
                className="warroom-mini-event"
                style={{ borderLeftColor: config.color }}
              >
                <span className="warroom-mini-event-icon">{config.icon}</span>
                <span className="warroom-mini-event-msg">{event.message}</span>
                <span className="warroom-mini-event-time">{formatTime(event.created_at)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
