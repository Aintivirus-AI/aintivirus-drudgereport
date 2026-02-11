"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface ArticleChatProps {
  articleTitle: string;
  articleSummary: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const WELCOME_MESSAGES = [
  "John here. I've read this piece. Ask me anything about it - or anything else. Crypto strategy, privacy ops, whatever's on your mind.",
  "McAfee here. I've got eyes on this article. Want my take on it, or you want to talk about something else?",
  "John speaking. I've scanned this story. Fire away - ask me about it, or pivot to crypto, privacy, whatever you need.",
  "You've got John. I've seen this article. What do you want to know? My take on it, or something else entirely?",
  "McAfee here. I've digested this piece. Ask me about the article, crypto moves, privacy hacks - your call.",
  "John here. I know what you're reading. Want my thoughts on this story, or shall we talk about something else?",
];

const CHAT_API_URL =
  process.env.NEXT_PUBLIC_MCAFEE_CHAT_API || "https://ai-bot.aintivirus.ai/api/chat";

const CHAR_LIMIT = 1000;

export function ArticleChat({ articleTitle, articleSummary }: ArticleChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const welcome =
      WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)];
    return [{ role: "assistant", content: welcome }];
  });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const articleContext = `Title: ${articleTitle}\n\nSummary: ${articleSummary}`;

  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    // Auto-resize textarea back
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const response = await fetch(CHAT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          articleContext,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Request failed");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.text },
      ]);
    } catch (err) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : "Something jammed the signal. Try again.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: errorMsg },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= CHAR_LIMIT) {
      setInput(value);
    }
    // Auto-resize
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 100) + "px";
  };

  // Mobile toggle button
  const toggleButton = (
    <button
      className="article-chat-toggle"
      onClick={() => setIsOpen(!isOpen)}
      aria-expanded={isOpen}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="w-4 h-4"
      >
        <path
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{isOpen ? "Close Chat" : "Ask John About This Article"}</span>
    </button>
  );

  return (
    <div className="article-chat-wrapper">
      {/* Mobile-only toggle */}
      <div className="article-chat-mobile-toggle">{toggleButton}</div>

      <div className={`article-chat ${isOpen ? "article-chat--open" : ""}`}>
        {/* Header */}
        <div className="article-chat-header">
          <div className="article-chat-header-avatar">
            <img
              src="https://ai-bot.aintivirus.ai/binary-john.jpg"
              alt="John McAfee"
            />
          </div>
          <div className="article-chat-header-info">
            <span className="text-sm font-semibold text-white tracking-wide">
              ASK JOHN
            </span>
            <span className="article-chat-header-subtitle">
              Chat about this article
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="article-chat-messages" ref={messagesContainerRef}>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`article-chat-bubble ${
                msg.role === "user"
                  ? "article-chat-bubble--user"
                  : "article-chat-bubble--assistant"
              }`}
            >
              {msg.content}
            </div>
          ))}
          {isLoading && (
            <div className="article-chat-bubble article-chat-bubble--assistant article-chat-typing">
              <span className="article-chat-dot" />
              <span className="article-chat-dot" />
              <span className="article-chat-dot" />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="article-chat-input">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this article..."
            disabled={isLoading}
            rows={1}
            className="article-chat-textarea"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="article-chat-send"
            aria-label="Send message"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-4 h-4"
            >
              <line
                x1="22"
                y1="2"
                x2="11"
                y2="13"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polygon
                points="22 2 15 22 11 13 2 9 22 2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <div className="article-chat-charcount">
          {input.length} / {CHAR_LIMIT}
        </div>
      </div>
    </div>
  );
}
