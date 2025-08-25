"use client";

import { useState, FormEvent, useRef, useEffect } from "react";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import {
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/nextjs";
import "highlight.js/styles/github-dark.css";

// --- INTERFACES & CONSTANTS ---
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
  isStreaming?: boolean;
  id?: string;
}

interface HistoryItem {
  role: "user" | "model";
  content: string;
}

// In your frontend ChatInterface component

const availableModels = [
  // ✅ FIX: Use the official model ID that supports built-in search.
  { id: "gemini-1.5-pro-latest",    name: "Gemini 1.5 Pro (Search Enabled)" },
  { id: "gemini-1.5-flash-latest",  name: "Gemini 1.5 Flash" },
];


// --- MAIN PAGE COMPONENT ---
export default function Home() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return <div style={styles.loadingContainer}>Loading...</div>;
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.headerTitle}>Kannan's AI Chatbot 🧠</h1>
        <div style={styles.userButtonContainer}>
          {isSignedIn ? (
            <UserButton afterSignOutUrl="/" />
          ) : (
            <a href="/sign-in" style={styles.signInLink}>
              Sign In
            </a>
          )}
        </div>
      </header>
      <main style={styles.mainContent}>
        {isSignedIn ? <ChatInterface /> : <SignedOutView />}
      </main>
    </div>
  );
}

// --- CHILD COMPONENTS ---

function SignedOutView() {
  return (
    <div style={styles.signedOutContainer}>
      <h2>Please Sign In to Start Chatting</h2>
      <p>Your chat history will be saved to your account.</p>
    </div>
  );
}

function ChatInterface() {
  const { getToken } = useAuth();
  const { user } = useUser();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(availableModels[0].id);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);
  const [temperature, setTemperature] = useState(0.3);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [messageCounter, setMessageCounter] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchHistory = async () => {
      const token = await getToken();
      if (!token) return;

      try {
        const response = await fetch(`http://localhost:3001/chat/history/${user.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.messages) {
            const history = data.messages.map((item: HistoryItem, index: number) => ({
              id: `history-${index}`,
              role: item.role === "model" ? "assistant" : "user",
              content: item.content,
              timestamp: Date.now() - (data.messages.length - index) * 1000,
              isStreaming: false,
            }));
            setMessages(history);
            setMessageCounter(data.messages.length);
          }
        }
      } catch (error) {
        console.error("Failed to fetch history:", error);
      }
    };
    fetchHistory();
  }, [user, getToken]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading || !user) return;

    const currentInput = input;
    const userMessageId = `user-${messageCounter}`;
    const assistantMessageId = `assistant-${messageCounter}`;
    
    setMessages((prev) => [
      ...prev,
      { 
        id: userMessageId,
        role: "user", 
        content: currentInput,
        timestamp: Date.now(),
        isStreaming: false
      },
      { 
        id: assistantMessageId,
        role: "assistant", 
        content: "",
        timestamp: Date.now() + 1,
        isStreaming: true
      },
    ]);
    setInput("");
    setLoading(true);
    setMessageCounter(prev => prev + 1);

    const token = await getToken();

    console.log(`Sending request with webSearch: ${isWebSearchEnabled}, temperature: ${temperature}`);

    try {
      await fetchEventSource(`http://localhost:3001/chat/stream`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: currentInput,
          model: selectedModel,
          webSearch: isWebSearchEnabled,
          temperature: temperature,
        }),
        onmessage(event) {
          if (event.data === '[DONE]') {
            setLoading(false);
            setMessages((prev) => {
              return prev.map((msg, idx) => {
                if (msg.id === assistantMessageId) {
                  return {
                    ...msg,
                    content: msg.content.trim(),
                    isStreaming: false,
                    timestamp: Date.now()
                  };
                }
                return msg;
              });
            });
            return;
          }
          
          setMessages((prev) => {
            return prev.map((msg) => {
              if (msg.id === assistantMessageId) {
                return {
                  ...msg,
                  content: msg.content + event.data,
                  isStreaming: true,
                  timestamp: Date.now()
                };
              }
              return msg;
            });
          });
        },
        onclose() {
          console.log('Stream closed');
          setLoading(false);
        },
        onerror(err) {
          console.error('Stream error:', err);
          setLoading(false);
          setMessages(prev => {
            return prev.map((msg) => {
              if (msg.id === assistantMessageId) {
                return {
                  ...msg,
                  content: msg.content + "\n\n*Sorry, an error occurred. Please try again.*",
                  isStreaming: false,
                  timestamp: Date.now()
                };
              }
              return msg;
            });
          });
          throw err;
        },
      });
    } catch (error) {
      console.error('Failed to start stream:', error);
      setLoading(false);
      setMessages(prev => {
        return prev.map((msg) => {
          if (msg.id === assistantMessageId) {
            return {
              ...msg,
              content: "Failed to connect to the server. Please check your connection and try again.",
              isStreaming: false,
              timestamp: Date.now()
            };
          }
          return msg;
        });
      });
    }
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModelId = e.target.value;
    setSelectedModel(newModelId);
    const model = availableModels.find((m) => m.id === newModelId);
    const modelName = model ? model.name : newModelId;
    const systemMessage: Message = {
      id: `system-${messageCounter}`,
      role: "system",
      content: `Model switched to ${modelName}`,
      timestamp: Date.now(),
      isStreaming: false,
    };
    setMessages((prevMessages) => [...prevMessages, systemMessage]);
    setMessageCounter(prev => prev + 1);
  };

  return (
    <>
      {isSettingsOpen && user && (
        <SettingsModal
          userId={user.id}
          getToken={getToken}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      <div style={styles.controlsContainer}>
        <div style={styles.modelSelectorContainer}>
          <label htmlFor="model-select" style={styles.modelLabel}>
            Select Model:
          </label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={handleModelChange}
            style={styles.modelSelector}
            disabled={loading}
          >
            {availableModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
          <button 
            onClick={() => setIsSettingsOpen(true)} 
            style={styles.settingsButton} 
            disabled={loading}
          >
            ⚙️ Settings
          </button>
        </div>
      </div>

      <div style={styles.chatWindow}>
        {messages.map((msg) => {
          if (msg.role === "system") {
            return (
              <div key={msg.id} style={styles.systemMessage}>
                {msg.content}
              </div>
            );
          }
          return (
            <div
              key={msg.id}
              style={
                msg.role === "user"
                  ? styles.messageRowUser
                  : styles.messageRowAssistant
              }
            >
              <div
                style={{
                  ...styles.messageBubble,
                  ...(msg.role === "user"
                    ? styles.userBubble
                    : styles.assistantBubble),
                }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    // Custom component styling for better appearance
                    p: ({ children }) => (
                      <p style={{ margin: '0.5em 0', lineHeight: '1.4' }}>{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul style={{ marginLeft: '1.2em', marginBottom: '0.5em' }}>{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol style={{ marginLeft: '1.2em', marginBottom: '0.5em' }}>{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li style={{ marginBottom: '0.2em' }}>{children}</li>
                    ),
                    h1: ({ children }) => (
                      <h1 style={{ fontSize: '1.4em', fontWeight: 'bold', margin: '1em 0 0.5em 0' }}>{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 style={{ fontSize: '1.3em', fontWeight: 'bold', margin: '0.8em 0 0.4em 0' }}>{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 style={{ fontSize: '1.2em', fontWeight: 'bold', margin: '0.6em 0 0.3em 0' }}>{children}</h3>
                    ),
                    strong: ({ children }) => (
                      <strong style={{ fontWeight: 'bold', color: '#ffffff' }}>{children}</strong>
                    ),
                    em: ({ children }) => (
                      <em style={{ fontStyle: 'italic' }}>{children}</em>
                    ),
                    code: ({ children, className }) => {
                      // Inline code
                      if (!className) {
                        return (
                          <code style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            padding: '2px 4px',
                            borderRadius: '3px',
                            fontSize: '0.9em',
                            fontFamily: 'Monaco, Consolas, "Courier New", monospace'
                          }}>
                            {children}
                          </code>
                        );
                      }
                      // Block code (handled by rehype-highlight)
                      return <code className={className}>{children}</code>;
                    },
                    pre: ({ children }) => (
                      <pre style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        padding: '1em',
                        borderRadius: '6px',
                        overflow: 'auto',
                        margin: '1em 0',
                        fontSize: '0.9em'
                      }}>
                        {children}
                      </pre>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote style={{
                        borderLeft: '3px solid rgba(255, 255, 255, 0.3)',
                        paddingLeft: '1em',
                        margin: '1em 0',
                        fontStyle: 'italic'
                      }}>
                        {children}
                      </blockquote>
                    ),
                  }}
                >
                  {msg.content || (msg.isStreaming ? "..." : "")}
                </ReactMarkdown>
                {msg.isStreaming && (
                  <span style={styles.streamingIndicator}>▋</span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <footer style={styles.footer}>
        <form onSubmit={handleSend} style={styles.form}>
          <input
            style={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything..."
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{
              ...styles.button,
              ...((loading || !input.trim()) && styles.buttonDisabled),
            }}
          >
            {loading ? "..." : "Send"}
          </button>
        </form>
        <div style={styles.checkboxContainer}>
          <input
            type="checkbox"
            id="web-search-toggle"
            checked={isWebSearchEnabled}
            onChange={(e) => setIsWebSearchEnabled(e.target.checked)}
            disabled={loading}
          />
          <label htmlFor="web-search-toggle" style={styles.checkboxLabel}>
            Web Search
          </label>
        </div>
      </footer>
    </>
  );
}

function SettingsModal({ userId, getToken, onClose }: { userId: string, getToken: any, onClose: () => void }) {
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      setStatus('Loading...');
      const token = await getToken();
      try {
        const res = await fetch(`http://localhost:3001/user/${userId}/profile`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setName(data.name || '');
          setAbout(data.about || '');
          setStatus('');
        } else {
          setStatus('Could not load existing profile.');
        }
      } catch (error) {
        setStatus('Error loading profile.');
      }
    };
    fetchProfile();
  }, [userId, getToken]);

  const handleSave = async () => {
    setStatus('Saving...');
    const token = await getToken();
    try {
      const response = await fetch(`http://localhost:3001/user/${userId}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, about }),
      });

      if (response.ok) {
        setStatus('Profile saved successfully!');
        setTimeout(() => onClose(), 1500);
      } else {
        setStatus('Error: Could not save profile.');
      }
    } catch (error) {
      setStatus('A network error occurred.');
    }
  };

  return (
    <div style={styles.modalBackdrop}>
      <div style={styles.modalContent}>
        <h2>Custom Instructions</h2>
        <p>Provide details below to personalize your chat experience.</p>
        
        <label style={styles.modalLabel}>What should the bot call you?</label>
        <input 
          type="text" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          placeholder="e.g., Kannan"
          style={styles.modalInput}
        />

        <label style={styles.modalLabel}>What should the bot know about you?</label>
        <textarea
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          placeholder="e.g., I am a backend developer from Kovilpatti. I prefer technical answers with code examples."
          style={{...styles.modalInput, height: '100px'}}
        />

        <div style={styles.modalFooter}>
          <span style={styles.modalStatus}>{status}</span>
          <div>
            <button onClick={onClose} style={styles.modalButtonSecondary}>Cancel</button>
            <button onClick={handleSave} style={styles.modalButtonPrimary}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    backgroundColor: "white",
  },
  header: {
    padding: "1rem",
    borderBottom: "1px solid #eee",
    backgroundColor: "white",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexShrink: 0,
  },
  headerTitle: { fontSize: "1.5rem", fontWeight: "bold", margin: 0 },
  userButtonContainer: { height: "38px" },
  signInLink: {
    textDecoration: "none",
    color: "#3b82f6",
    fontWeight: "600",
    fontSize: "1rem",
  },
  mainContent: {
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  signedOutContainer: {
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#555",
  },
  loadingContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    fontSize: "1.5rem",
  },
  controlsContainer: {
    backgroundColor: "#f7f7f7",
    padding: "0.75rem",
    borderBottom: "1px solid #eee",
  },
  modelSelectorContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "8px",
  },
  modelLabel: { fontSize: "0.9rem", color: "#364d76ff" },
  modelSelector: {
    padding: "4px 8px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    backgroundColor: "white",
    fontSize: "0.9rem",
  },
  chatWindow: { 
    flexGrow: 1, 
    overflowY: "auto", 
    padding: "1.5rem",
    scrollBehavior: "smooth"
  },
  messageRowUser: {
    display: "flex",
    justifyContent: "flex-end",
    marginBottom: "1rem",
  },
  messageRowAssistant: {
    display: "flex",
    justifyContent: "flex-start",
    marginBottom: "1rem",
  },
  messageBubble: {
    maxWidth: "75%",
    padding: "12px 16px",
    borderRadius: "18px",
    wordWrap: "break-word",
    lineHeight: "1.4",
    position: "relative",
  },
  userBubble: {
    backgroundColor: "#3b82f6",
    color: "white",
    borderBottomRightRadius: "4px",
  },
  assistantBubble: {
    backgroundColor: "#305194ff",
    color: "white",
    borderBottomLeftRadius: "4px",
  },
  streamingIndicator: {
    display: "inline-block",
    color: "rgba(255, 255, 255, 0.7)",
    animation: "blink 1s infinite",
    fontSize: "1em",
    marginLeft: "2px",
  },
  footer: {
    padding: "1rem",
    borderTop: "1px solid #eee",
    backgroundColor: "#f7f7f7",
  },
  form: { maxWidth: "800px", margin: "0 auto", display: "flex", gap: "8px" },
  input: {
    flexGrow: 1,
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    padding: "10px 16px",
    fontSize: "1rem",
  },
  button: {
    backgroundColor: "#3b82f6",
    color: "white",
    padding: "10px 24px",
    borderRadius: "12px",
    border: "none",
    cursor: "pointer",
    fontSize: "1rem",
    transition: "background-color 0.2s",
    minWidth: "80px",
  },
  buttonDisabled: { backgroundColor: "#93c5fd", cursor: "not-allowed" },
  checkboxContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: "8px",
    gap: "4px",
  },
  checkboxLabel: { fontSize: "0.9rem", color: "#4a5568", userSelect: "none" },
  systemMessage: {
    textAlign: "center",
    margin: "1rem 0",
    color: "#5571a8ff",
    fontSize: "0.875rem",
    fontStyle: "italic",
  },
  settingsButton: {
    padding: "4px 12px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    backgroundColor: "white",
    cursor: "pointer",
    fontSize: "0.9rem",
    marginLeft: '16px',
  },
  modalBackdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: 'white',
    padding: '2rem',
    borderRadius: '8px',
    width: '90%',
    maxWidth: '500px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  modalLabel: {
    fontWeight: 600,
    fontSize: '0.9rem',
  },
  modalInput: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '1rem',
    boxSizing: 'border-box',
  },
  modalFooter: {
    marginTop: '1rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: "#3b82f6",
    color: "white",
    padding: "8px 16px",
    borderRadius: "6px",
    border: "none",
    cursor: "pointer",
  },
  modalButtonSecondary: {
    backgroundColor: "#e5e7eb",
    color: "#111827",
    padding: "8px 16px",
    borderRadius: "6px",
    border: "none",
    cursor: "pointer",
    marginRight: '8px',
  },
  modalStatus: {
    fontSize: '0.9rem',
    color: '#4a5568',
  }
};
