"use client";

import { useState, FormEvent, useRef, useEffect, FC } from "react";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { UserButton, useAuth, useUser } from "@clerk/nextjs";
import "highlight.js/styles/github-dark.css";

// --- INTERFACES & CONSTANTS ---
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  isStreaming?: boolean;
  id?: string;
}

interface Chat {
  chatId: string;
  title: string;
  avatarUrl: string;
  createdAt: string;
  lastMessageAt: string;
}

interface Gpt {
  gptId: string;
  creatorId: string;
  name: string;
  description: string;
  avatarUrl: string;
  persona: string;
  isPublic: boolean;
  createdAt: string;
}

const availableModels = [
  { id: "gemini-1.5-pro-latest", name: "Gemini 1.5 Pro" },
  { id: "gemini-1.5-flash-latest", name: "Gemini 1.5 Flash" },
];

// --- MAIN PAGE COMPONENT ---
export default function Home() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <div style={styles.loadingContainer}>Loading...</div>;
  return (
    <div style={styles.container}>
      <main style={styles.mainContent}>
        {isSignedIn ? <UnifiedChatView /> : <SignedOutView />}
      </main>
    </div>
  );
}

function SignedOutView() {
  return (
    <div style={styles.signedOutContainer}>
      <h2>Please Sign In to Start Chatting</h2>
    </div>
  );
}

// --- CHILD COMPONENTS (Defined before they are used) ---

function ChatItem({
  chat,
  isActive,
  onClick,
  onDelete,
}: {
  chat: Chat;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={isActive ? styles.activeChatItem : styles.chatItem}
      onClick={onClick}
    >
      <div style={styles.chatInfo}>
        <div style={styles.chatTitle}>{chat.title || "New Chat"}</div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        style={styles.deleteChatButton}
      >
        🗑️
      </button>
    </div>
  );
}

function GptSidebarItem({ gpt, onClick }: { gpt: Gpt; onClick: () => void }) {
  return (
    <div style={styles.chatItem} onClick={onClick}>
      <img src={gpt.avatarUrl} alt={gpt.name} style={styles.chatAvatarImg} />
      <div style={styles.chatInfo}>
        <div style={styles.chatTitle}>{gpt.name}</div>
      </div>
    </div>
  );
}

function ChatWindow({
  messages,
  selectedModel,
  onModelChange,
  loading,
}: {
  messages: Message[];
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  loading: boolean;
}) {
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <>
      <div style={styles.controlsContainer}>
        <select
          id="model-select"
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          style={styles.modelSelector}
          disabled={loading}
        >
          {availableModels.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </div>
      <div style={styles.chatWindow}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={
              msg.role === "system"
                ? styles.systemMessageContainer
                : msg.role === "user"
                ? styles.messageRowUser
                : styles.messageRowAssistant
            }
          >
            {msg.role === "system" ? (
              <div style={styles.systemMessage}>{msg.content}</div>
            ) : (
              <div
                style={{
                  ...styles.messageBubble,
                  ...(msg.role === "user"
                    ? styles.userBubble
                    : styles.assistantBubble),
                }}
              >
                {msg.isStreaming ? (
                  <pre style={styles.streamingText}>
                    {msg.content}
                    <span style={styles.streamingIndicator}>▋</span>
                  </pre>
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                  >
                    {msg.content || ""}
                  </ReactMarkdown>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </>
  );
}

function MessageInput({
  input,
  setInput,
  handleSend,
  loading,
  isWebSearchEnabled,
  setIsWebSearchEnabled,
}: {
  input: string;
  setInput: (val: string) => void;
  handleSend: (e: FormEvent) => void;
  loading: boolean;
  isWebSearchEnabled: boolean;
  setIsWebSearchEnabled: (val: boolean) => void;
}) {
  return (
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
          id="web-search"
          checked={isWebSearchEnabled}
          onChange={(e) => setIsWebSearchEnabled(e.target.checked)}
          disabled={loading}
        />
        <label htmlFor="web-search" style={{ marginLeft: "8px" }}>
          Web Search
        </label>
      </div>
    </footer>
  );
}

function GptCard({ gpt, onClick }: { gpt: Gpt; onClick: () => void }) {
  return (
    <div style={styles.gptCard} onClick={onClick}>
      <img src={gpt.avatarUrl} alt={gpt.name} style={styles.gptCardAvatar} />
      <h3 style={styles.gptCardTitle}>{gpt.name}</h3>
      <p style={styles.gptCardDescription}>{gpt.description}</p>
    </div>
  );
}

function GptExplorerView({
  gpts,
  isLoading,
  onGptSelect,
  onShowCreateModal,
}: {
  gpts: Gpt[];
  isLoading: boolean;
  onGptSelect: (gpt: Gpt) => void;
  onShowCreateModal: () => void;
}) {
  return (
    <div style={styles.gptsViewContainer}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 2rem",
        }}
      >
        <h1>Explore GPTs</h1>
        <button onClick={onShowCreateModal} style={styles.primaryButton}>
          ✨ Create a GPT
        </button>
      </div>
      <div style={styles.gptsGrid}>
        {isLoading ? (
          <p>Loading...</p>
        ) : (
          gpts.map((gpt) => (
            <GptCard
              key={gpt.gptId}
              gpt={gpt}
              onClick={() => onGptSelect(gpt)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CreateGptModal({
  userId,
  getToken,
  onClose,
  onGptCreated,
}: {
  userId: string;
  getToken: any;
  onClose: any;
  onGptCreated: (gpt: Gpt) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [persona, setPersona] = useState("");
  const [avatarPrompt, setAvatarPrompt] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [status, setStatus] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const handleCreate = async () => {
    if (!name.trim() || !avatarPrompt.trim() || !persona.trim()) {
      setStatus("Name, Avatar Prompt, and Persona are required.");
      return;
    }
    setStatus("Creating GPT... this may take a moment.");
    setIsCreating(true);
    const token = await getToken();
    try {
      const response = await fetch(`http://localhost:3001/gpts/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          description,
          persona,
          avatarPrompt,
          isPublic,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        onGptCreated(data.gpt);
      } else {
        setStatus("Failed to create GPT. Please try again.");
      }
    } catch (error) {
      console.error(error);
      setStatus("An error occurred.");
    }
    setIsCreating(false);
  };
  return (
    <div style={styles.modalBackdrop}>
      <div style={styles.modalContent}>
        <h2>Create a GPT</h2>
        <label style={styles.modalLabel}>Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={styles.modalInput}
          placeholder="e.g., Astrology Bot"
        />
        <label style={styles.modalLabel}>Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={styles.modalInput}
          placeholder="e.g., Your friendly guide to the cosmos."
        />
        <label style={styles.modalLabel}>Avatar Prompt</label>
        <textarea
          value={avatarPrompt}
          onChange={(e) => setAvatarPrompt(e.target.value)}
          style={{ ...styles.modalInput, height: "60px" }}
          placeholder="Describe the avatar image, e.g., A mystical crystal ball."
        />
        <label style={styles.modalLabel}>Persona (System Prompt)</label>
        <textarea
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          style={{ ...styles.modalInput, height: "100px" }}
          placeholder="Define how the bot should act, e.g., You are an expert astrologer."
        />
        <div>
          <input
            type="checkbox"
            id="isPublic"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          <label htmlFor="isPublic" style={{ marginLeft: "8px" }}>
            {" "}
            Make this GPT public
          </label>
        </div>
        <div style={styles.modalFooter}>
          <span style={styles.modalStatus}>{status}</span>
          <div>
            <button
              onClick={onClose}
              style={styles.modalButtonSecondary}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              style={styles.modalButtonPrimary}
              disabled={isCreating}
            >
              {isCreating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
function SettingsModal({
  userId,
  getToken,
  onClose,
}: {
  userId: string;
  getToken: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [botPersonality, setBotPersonality] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    const fetchProfile = async () => {
      setStatus("Loading profile...");
      const token = await getToken();
      try {
        const res = await fetch(
          `http://localhost:3001/users/${userId}/profile`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setName(data.name || "");
          setAbout(data.about || "");
          setBotPersonality(data.botPersonality || "");
          setStatus("");
        } else {
          setStatus("Failed to load profile.");
        }
      } catch (error) {
        setStatus("Error loading profile.");
      }
    };
    fetchProfile();
  }, [userId, getToken]);
  const handleSave = async () => {
    setStatus("Saving...");
    const token = await getToken();
    try {
      const response = await fetch(
        `http://localhost:3001/users/${userId}/profile`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name, about, botPersonality }),
        }
      );
      if (response.ok) {
        setStatus("Profile saved!");
        setTimeout(() => onClose(), 1000);
      } else {
        setStatus("Failed to save profile.");
      }
    } catch (error) {
      setStatus("A network error occurred.");
    }
  };
  return (
    <div style={styles.modalBackdrop}>
      <div style={styles.modalContent}>
        <h2>User Settings</h2>
        <p>
          This information helps personalize the AI's responses in your private
          chats.
        </p>
        <label style={styles.modalLabel}>Your Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={styles.modalInput}
          placeholder="e.g., Kannan"
        />
        <label style={styles.modalLabel}>About You</label>
        <textarea
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          style={{ ...styles.modalInput, height: "60px" }}
          placeholder="e.g., I am a backend developer."
        />
        <label style={styles.modalLabel}>
          Default Bot Persona (for private chats)
        </label>
        <textarea
          value={botPersonality}
          onChange={(e) => setBotPersonality(e.target.value)}
          placeholder="e.g., You are a witty pirate."
          style={{ ...styles.modalInput, height: "80px" }}
        />
        <div style={styles.modalFooter}>
          <span style={styles.modalStatus}>{status}</span>
          <div>
            <button onClick={onClose} style={styles.modalButtonSecondary}>
              Cancel
            </button>
            <button onClick={handleSave} style={styles.modalButtonPrimary}>
              Save & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- UNIFIED LAYOUT & VIEW (The Main Component) ---
function UnifiedChatView() {
  const { getToken } = useAuth();
  const { user } = useUser();

  const [chats, setChats] = useState<Chat[]>([]);
  const [gpts, setGpts] = useState<Gpt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState<"chat" | "explore">("chat");

  const [activeChatId, setActiveChatId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(
    availableModels[0].id
  );
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);
  const [activeGptPersona, setActiveGptPersona] = useState<string | null>(null);
  const [isCreateGptModalOpen, setCreateGptModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // NEW: Always render from a deduplicated array to guarantee unique keys.
  const uniqueChats = React.useMemo(() => {
    const m = new Map<string, Chat>();
    for (const c of chats) m.set(c.chatId, c);
    return Array.from(m.values());
  }, [chats]);

  useEffect(() => {
    if (user) {
      loadInitialData();
    }
  }, [user]);

  useEffect(() => {
    if (activeChatId) {
      loadChatMessages(activeChatId);
    } else {
      setMessages([]);
    }
  }, [activeChatId]);

  const loadInitialData = async () => {
    setIsLoading(true);
    await Promise.all([loadUserChats(), loadPublicGpts()]);
    setIsLoading(false);
  };

  const loadUserChats = async (selectChatId?: string) => {
    const token = await getToken();
    if (!token) return;
    try {
      const response = await fetch(`http://localhost:3001/chat/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        const fetchedChats = (data.chats || []).filter(
          (c: any) => c && c.chatId
        );
        // NEW: dedupe by chatId before committing to state
        const byId = new Map<string, Chat>(
          fetchedChats.map((c: Chat) => [c.chatId, c])
        );
        const deduped = Array.from(byId.values());
        setChats(deduped);

        const chatToSelect =
          selectChatId ||
          activeChatId ||
          (deduped.length > 0 ? deduped[0].chatId : "");
        if (chatToSelect && !activeChatId) {
          setActiveChatId(chatToSelect);
        }
      }
    } catch (error) {
      console.error("Failed to load chats:", error);
    }
  };

  const loadPublicGpts = async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const response = await fetch(`http://localhost:3001/gpts/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        const serverGpts = Array.isArray(data.gpts) ? data.gpts : [];
        setGpts(
          serverGpts.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        );
      }
    } catch (error) {
      console.error("Failed to load GPTs:", error);
    }
  };

  const loadChatMessages = async (chatId: string) => {
    setMessages([]);
    const token = await getToken();
    if (!token) return;
    try {
      const response = await fetch(
        `http://localhost:3001/chat/${chatId}/history`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        const history = data.messages.map((item: any, i: number) => ({
          id: `hist-${chatId}-${i}`,
          role: item.role === "model" ? "assistant" : "user",
          content: item.content.trim(),
        }));
        setMessages(history);
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  };

  const handleStartNewChat = async (gpt?: Gpt) => {
    setActiveView("chat");

    if (gpt) {
      const existingChat = chats.find((c) => c.title === gpt.name);
      if (existingChat) {
        setActiveChatId(existingChat.chatId);
        setActiveGptPersona(gpt.persona);
        return;
      }
    }

    const token = await getToken();
    if (!token) return;
    setLoadingMessage(true);
    try {
      const response = await fetch(`http://localhost:3001/chat/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: gpt ? gpt.name : "New Chat" }),
      });
      if (response.ok) {
        const { chat } = await response.json();
        // NEW: merge by id to avoid duplicates
        setChats((prev) => {
          const m = new Map(prev.map((c) => [c.chatId, c]));
          m.set(chat.chatId, chat);
          return Array.from(m.values());
        });
        setActiveChatId(chat.chatId);
        setActiveGptPersona(gpt ? gpt.persona : null);
        setMessages(
          gpt
            ? [
                {
                  id: "gpt-start",
                  role: "system",
                  content: `Started chat with ${gpt.name}`,
                },
              ]
            : []
        );
      }
    } catch (error) {
      console.error("Failed to create chat:", error);
    }
    setLoadingMessage(false);
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setActiveGptPersona(null);
    setActiveView("chat");
  };

  const handleDeleteChat = async (chatId: string) => {
    const token = await getToken();
    if (!token) return;
    await fetch(`http://localhost:3001/chat/${chatId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const updated = chats.filter((c) => c.chatId !== chatId);
    setChats(updated);
    if (activeChatId === chatId)
      setActiveChatId(updated.length > 0 ? updated[0].chatId : "");
  };

  const handleGptCreated = (newGpt: Gpt) => {
    if (!newGpt || !newGpt.gptId) return;
    setGpts((prev) => [
      newGpt,
      ...prev.filter((g) => g.gptId !== newGpt.gptId),
    ]);
    setCreateGptModalOpen(false);
    setTimeout(() => loadPublicGpts(), 1500);
  };

  const handleSend = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loadingMessage || !user || !activeChatId) return;

    const currentInput = input;
    const isNewChat =
      messages.length === 0 ||
      (messages.length === 1 && messages[0].role === "system");
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: currentInput },
    ]);
    setInput("");
    setLoadingMessage(true);

    const assistantMessageId = `asst-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        isStreaming: true,
      },
    ]);

    const token = await getToken();
    try {
      await fetchEventSource(`http://localhost:3001/chat/stream`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: currentInput,
          model: selectedModel,
          chatId: activeChatId,
          webSearch: isWebSearchEnabled,
          systemInstruction: activeGptPersona,
        }),
        onmessage(event) {
          if (event.data === "[DONE]") return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: m.content + event.data }
                : m
            )
          );
        },
        onclose() {
          setLoadingMessage(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId ? { ...m, isStreaming: false } : m
            )
          );
          if (isNewChat) {
            loadUserChats(activeChatId);
          }
        },
        onerror(err) {
          throw err;
        },
      });
    } catch (error) {
      setLoadingMessage(false);
      console.error("Stream error:", error);
    }
  };

  return (
    <div style={styles.chatContainer}>
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <UserButton afterSignOutUrl="/" />
        </div>
        <div style={styles.sidebarSection}>
          <button
            onClick={() => handleStartNewChat()}
            style={styles.sidebarButton}
            disabled={loadingMessage}
          >
            ➕ New Chat
          </button>
          <button
            onClick={() => setActiveView("explore")}
            style={styles.sidebarButton}
          >
            ✨ Explore GPTs
          </button>
        </div>
        <div style={styles.sidebarSection}>
          <h3 style={styles.sidebarSectionTitle}>Your GPTs</h3>
          {gpts
            .filter((g) => g.creatorId === user?.id)
            .map((gpt) => (
              <GptSidebarItem
                key={gpt.gptId}
                gpt={gpt}
                onClick={() => handleStartNewChat(gpt)}
              />
            ))}
        </div>
        <div style={styles.chatList}>
          <h3 style={styles.sidebarSectionTitle}>Chats</h3>
          {isLoading ? (
            <p>Loading...</p>
          ) : (
            // Render from deduplicated list only (UI unchanged)
            uniqueChats.map((chat) => (
              <ChatItem
                key={chat.chatId}
                chat={chat}
                isActive={activeChatId === chat.chatId && activeView === "chat"}
                onClick={() => handleSelectChat(chat.chatId)}
                onDelete={() => handleDeleteChat(chat.chatId)}
              />
            ))
          )}
        </div>
        <div style={styles.sidebarFooter}>
          <button
            onClick={() => setIsSettingsOpen(true)}
            style={styles.settingsButton}
            disabled={loadingMessage}
          >
            ⚙️ Settings
          </button>
        </div>
      </div>
      <div style={styles.mainChatArea}>
        {activeView === "chat" ? (
          activeChatId ? (
            <>
              <ChatWindow
                messages={messages}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                loading={loadingMessage}
              />
              <MessageInput
                input={input}
                setInput={setInput}
                handleSend={handleSend}
                loading={loadingMessage}
                isWebSearchEnabled={isWebSearchEnabled}
                setIsWebSearchEnabled={setIsWebSearchEnabled}
              />
            </>
          ) : (
            <div style={styles.emptyChatArea}>
              <h1>Kannan's AI</h1>
              <p>Select a conversation or start a new chat.</p>
            </div>
          )
        ) : (
          <GptExplorerView
            gpts={gpts}
            isLoading={isLoading}
            onGptSelect={handleStartNewChat}
            onShowCreateModal={() => setCreateGptModalOpen(true)}
          />
        )}
      </div>

      {isSettingsOpen && user && (
        <SettingsModal
          userId={user.id}
          getToken={getToken}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
      {isCreateGptModalOpen && user && (
        <CreateGptModal
          userId={user.id}
          getToken={getToken}
          onClose={() => setCreateGptModalOpen(false)}
          onGptCreated={handleGptCreated}
        />
      )}
    </div>
  );
}

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    backgroundColor: "#fff",
  },
  mainContent: { flexGrow: 1, display: "flex", overflow: "hidden" },
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
  chatContainer: {
    display: "flex",
    height: "100%",
    width: "100%",
    overflow: "hidden",
  },
  sidebar: {
    width: "300px",
    backgroundColor: "#f8f9fa",
    borderRight: "1px solid #e9ecef",
    display: "flex",
    flexDirection: "column",
  },
  sidebarHeader: {
    padding: "1rem",
    borderBottom: "1px solid #e9ecef",
    display: "flex",
    justifyContent: "flex-start",
    gap: "1rem",
    alignItems: "center",
  },
  sidebarSection: { padding: "0.5rem 1rem", borderBottom: "1px solid #e9ecef" },
  sidebarSectionTitle: {
    margin: "0 0 0.5rem 0",
    fontSize: "0.9rem",
    color: "#666",
    fontWeight: "600",
  },
  sidebarButton: {
    width: "100%",
    padding: "10px",
    backgroundColor: "transparent",
    color: "#333",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontSize: "1rem",
    cursor: "pointer",
    textAlign: "left",
    marginBottom: "0.5rem",
  },
  chatList: { flex: 1, overflowY: "auto", padding: "0.5rem 1rem" },
  sidebarFooter: { padding: "1rem", borderTop: "1px solid #e9ecef" },
  settingsButton: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    backgroundColor: "white",
    cursor: "pointer",
  },
  mainChatArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  emptyChatArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7280",
    textAlign: "center",
  },
  chatItem: {
    display: "flex",
    alignItems: "center",
    padding: "10px",
    margin: "2px 0",
    borderRadius: "8px",
    cursor: "pointer",
    position: "relative",
  },
  activeChatItem: {
    display: "flex",
    alignItems: "center",
    padding: "10px",
    margin: "2px 0",
    borderRadius: "8px",
    cursor: "pointer",
    backgroundColor: "#e3f2fd",
    position:'relative'
  },
  chatAvatarImg: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    marginRight: "12px",
    flexShrink: 0,
    objectFit: "cover",
  },
  chatInfo: { flex: 1, minWidth: 0 },
  chatTitle: {
    fontWeight: "500",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "0.9rem",
  },
  deleteChatButton: {
    position: "absolute",
    right: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "1rem",
    opacity: 0.5,
  },
  controlsContainer: {
    backgroundColor: "#f7f7f7",
    padding: "0.75rem",
    borderBottom: "1px solid #eee",
    textAlign: "center",
  },
  modelSelector: {
    padding: "4px 8px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
  },
  chatWindow: { flexGrow: 1, overflowY: "auto", padding: "1.5rem" },
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
  },
  userBubble: { backgroundColor: "#3b82f6", color: "white" },
  assistantBubble: { backgroundColor: "#e5e7eb", color: "#111827" },
  streamingIndicator: {
    display: "inline-block",
    animation: "blink 1s infinite",
  },
  streamingText: { whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 },
  systemMessageContainer: {
    display: "flex",
    justifyContent: "center",
    width: "100%",
  },
  systemMessage: {
    textAlign: "center",
    margin: "1rem 0",
    color: "#5571a8ff",
    fontSize: "0.875rem",
    fontStyle: "italic",
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
  },
  buttonDisabled: { backgroundColor: "#93c5fd", cursor: "not-allowed" },
  checkboxContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    marginTop: "8px",
    gap: "4px",
  },
  primaryButton: {
    padding: "10px 20px",
    backgroundColor: "#3b82f6",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.9rem",
    fontWeight: "600",
    cursor: "pointer",
  },
  gptsViewContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  gptsGrid: {
    flex: 1,
    overflowY: "auto",
    padding: "2rem",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
    gap: "1.5rem",
    alignContent: "start",
  },
  gptCard: {
    border: "1px solid #e0e0e0",
    borderRadius: "12px",
    padding: "1.5rem",
    textAlign: "center",
    cursor: "pointer",
    transition: "box-shadow 0.2s, transform 0.2s",
  },
  gptCardAvatar: {
    width: "80px",
    height: "80px",
    borderRadius: "50%",
    objectFit: "cover",
    margin: "0 auto 1rem",
  },
  gptCardTitle: { margin: "0 0 0.5rem 0", fontSize: "1.2rem" },
  gptCardDescription: { color: "#666", fontSize: "0.9rem" },
  modalBackdrop: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: "white",
    padding: "2rem",
    borderRadius: "8px",
    width: "95%",
    maxWidth: "600px",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    overflowY: "auto",
  },
  modalLabel: { fontWeight: 600, fontSize: "0.9rem" },
  modalInput: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "1rem",
    boxSizing: "border-box",
  },
  modalFooter: {
    marginTop: "1rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
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
    marginRight: "8px",
  },
  modalStatus: { fontSize: "0.9rem", color: "#4a5568" },
};
