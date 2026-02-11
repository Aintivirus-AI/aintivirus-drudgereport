"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface ListenButtonProps {
  text: string;
}

export function ListenButton({ text }: ListenButtonProps) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const handleToggle = useCallback(async () => {
    // Stop playback
    if (playing && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        throw new Error(`TTS request failed: ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Revoke previous object URL if any
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      objectUrlRef.current = url;

      const audio = new Audio(url);

      audio.onended = () => {
        setPlaying(false);
      };

      audio.onerror = () => {
        console.error("[ListenButton] Audio playback error");
        setPlaying(false);
      };

      audioRef.current = audio;
      await audio.play();
      setPlaying(true);
    } catch (err) {
      console.error("[ListenButton] TTS error:", err);
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  }, [text, playing]);

  return (
    <button
      onClick={handleToggle}
      className="listen-btn"
      disabled={loading}
      title={loading ? "Generating audio..." : playing ? "Stop reading" : "Listen to McAfee read the summary"}
    >
      {loading ? (
        <>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 animate-spin">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" strokeLinecap="round" />
          </svg>
          <span>Loading...</span>
        </>
      ) : playing ? (
        <>
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
          <span>Stop</span>
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Listen</span>
        </>
      )}
    </button>
  );
}
