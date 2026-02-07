"use client";

import { useState, useEffect } from "react";

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function TimeAgo({ date }: { date: string }) {
  const [text, setText] = useState("");

  useEffect(() => {
    const d = new Date(date);
    setText(getTimeAgo(d));

    // Update every minute
    const interval = setInterval(() => {
      setText(getTimeAgo(d));
    }, 60_000);

    return () => clearInterval(interval);
  }, [date]);

  // Render nothing on server to avoid hydration mismatch
  if (!text) return null;

  return <span className="text-gray-500 text-xs">{text}</span>;
}
