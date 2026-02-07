"use client";

import { useState, useEffect, useRef } from "react";

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

const EVENT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  submission_received: { icon: "📩", color: "#00D3FF", label: "SUBMISSION" },
  validation_started: { icon: "🔍", color: "#f59e0b", label: "VALIDATING" },
  approved: { icon: "✅", color: "#00ff9d", label: "APPROVED" },
  rejected: { icon: "❌", color: "#ef4444", label: "REJECTED" },
  token_minted: { icon: "🪙", color: "#bf5af2", label: "TOKEN MINTED" },
  headline_published: { icon: "📰", color: "#00D3FF", label: "PUBLISHED" },
  vote_cast: { icon: "🗳️", color: "#6366f1", label: "VOTE" },
};

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr + "Z");
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="warroom-stat">
      <div className="warroom-stat-value" style={{ color }}>{value}</div>
      <div className="warroom-stat-label">{label}</div>
    </div>
  );
}

export function WarRoomFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [stats, setStats] = useState<WarRoomStats | null>(null);
  const [connected, setConnected] = useState(false);
  const lastIdRef = useRef<number>(0);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const url = lastIdRef.current > 0
          ? `/api/war-room?after=${lastIdRef.current}`
          : "/api/war-room";
        
        const res = await fetch(url);
        const data = await res.json();

        if (data.events && data.events.length > 0) {
          // Events come in DESC order from API, we want newest at top
          const newEvents = data.events.filter(
            (e: ActivityEvent) => e.id > lastIdRef.current
          );
          
          if (newEvents.length > 0) {
            setEvents(prev => {
              const combined = [...newEvents, ...prev].slice(0, 200);
              return combined;
            });
            // Update lastId to the highest ID we've seen
            const maxId = Math.max(...newEvents.map((e: ActivityEvent) => e.id));
            if (maxId > lastIdRef.current) {
              lastIdRef.current = maxId;
            }
          }
        }

        if (data.stats) {
          setStats(data.stats);
        }

        setConnected(true);
      } catch {
        setConnected(false);
      }
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="warroom">
      {/* Status indicator */}
      <div className="warroom-status">
        <div className={`warroom-status-dot ${connected ? "warroom-status-connected" : "warroom-status-disconnected"}`} />
        <span>{connected ? "LIVE" : "RECONNECTING..."}</span>
      </div>

      {/* Stats dashboard */}
      {stats && (
        <div className="warroom-stats">
          <StatCard label="SUBMISSIONS TODAY" value={stats.submissionsToday} color="#00D3FF" />
          <StatCard label="TOKENS LAUNCHED" value={stats.tokensLaunchedToday} color="#bf5af2" />
          <StatCard label="VOTES CAST" value={stats.votesToday} color="#6366f1" />
          <StatCard label="APPROVAL RATE" value={`${stats.approvalRate}%`} color="#00ff9d" />
        </div>
      )}

      {/* Event feed */}
      <div className="warroom-feed" ref={feedRef}>
        {events.length === 0 ? (
          <div className="warroom-empty">
            <p>Waiting for activity...</p>
            <p className="warroom-empty-sub">Events will appear here in real-time as they happen.</p>
          </div>
        ) : (
          events.map((event, index) => {
            const config = EVENT_CONFIG[event.event_type] || {
              icon: "📋",
              color: "#9ca3af",
              label: event.event_type.toUpperCase(),
            };

            return (
              <div
                key={event.id}
                className="warroom-event"
                style={{
                  animationDelay: `${Math.min(index * 50, 500)}ms`,
                  borderLeftColor: config.color,
                }}
              >
                <div className="warroom-event-header">
                  <span className="warroom-event-icon">{config.icon}</span>
                  <span className="warroom-event-label" style={{ color: config.color }}>
                    {config.label}
                  </span>
                  <span className="warroom-event-time">
                    {formatTimestamp(event.created_at)}
                  </span>
                </div>
                <div className="warroom-event-message">{event.message}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
