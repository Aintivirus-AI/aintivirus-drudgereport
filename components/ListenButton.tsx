"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface ListenButtonProps {
  text: string;
}

export function ListenButton({ text }: ListenButtonProps) {
  const [playing, setPlaying] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const handleToggle = useCallback(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;

    if (playing) {
      synth.cancel();
      setPlaying(false);
      return;
    }

    // Cancel any previous utterance
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;

    // Try to pick a good English voice
    const voices = synth.getVoices();
    const preferred = voices.find(
      (v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("natural")
    ) || voices.find(
      (v) => v.lang.startsWith("en") && !v.localService
    ) || voices.find(
      (v) => v.lang.startsWith("en")
    );
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => setPlaying(false);

    utteranceRef.current = utterance;
    synth.speak(utterance);
    setPlaying(true);
  }, [text, playing]);

  // Don't render if SpeechSynthesis is not available (SSR-safe)
  if (typeof window !== "undefined" && !window.speechSynthesis) return null;

  return (
    <button
      onClick={handleToggle}
      className="listen-btn"
      title={playing ? "Stop reading" : "Listen to summary"}
    >
      {playing ? (
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
