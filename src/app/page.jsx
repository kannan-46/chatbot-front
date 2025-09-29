"use client";
import { useState, useEffect, useRef } from "react";
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/nextjs";
import { fetchEventSource } from "@microsoft/fetch-event-source";

// MUI Imports
import {
  Avatar,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CircularProgress,
  Container,
  CssBaseline,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Modal,
  TextField,
  Typography,
  ThemeProvider,
  createTheme,
} from "@mui/material";
import AddCommentIcon from "@mui/icons-material/AddComment";
import ExploreIcon from "@mui/icons-material/Explore";
import SendIcon from "@mui/icons-material/Send";
import SettingsIcon from "@mui/icons-material/Settings";
import CodeIcon from "@mui/icons-material/Code";

// Define a dark theme for the application
const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#90caf9",
    },
    secondary: {
      main: "#f48fb1",
    },
    background: {
      default: "#121212",
      paper: "#1e1e1e",
    },
    text: {
      primary: "#e0e0e0",
      secondary: "#b3b3b3",
    },
  },
});

// Main App Component
export default function Home() {
  return (
    <ClerkProvider>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <SignedIn>
          <UnifiedChatView />
        </SignedIn>
        <SignedOut>
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100vh",
            }}
          >
            <Typography variant="h5">
              Please sign in to use the chatbot.
            </Typography>
          </Box>
        </SignedOut>
      </ThemeProvider>
    </ClerkProvider>
  );
}

// --- Main View Component ---
function UnifiedChatView() {
  const { getToken } = useAuth();
  const { user } = useUser();

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGptExplorerVisible, setIsGptExplorerVisible] = useState(false);
  const [publicGpts, setPublicGpts] = useState([]);
  const [userGpts, setUserGpts] = useState([]);
  const [activeGpt, setActiveGpt] = useState(null);
  const [isCreateGptModalOpen, setCreateGptModalOpen] = useState(false);
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [userProfile, setUserProfile] = useState({});

  const API_URL = "http://localhost:3001";

  // Fetch user chats on component mount
  useEffect(() => {
    const fetchChats = async () => {
      const token = await getToken();
      const response = await fetch(`${API_URL}/chat`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setChats(data);
    };
    fetchChats();
  }, [getToken]);

  // Fetch GPTs for the explorer view
  useEffect(() => {
    const fetchGpts = async () => {
      const token = await getToken();
      const [publicRes, userRes] = await Promise.all([
        fetch(`${API_URL}/gpts/public`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/gpts/user`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const publicData = await publicRes.json();
      const userData = await userRes.json();
      setPublicGpts(publicData);
      setUserGpts(userData);
    };
    if (isGptExplorerVisible) {
      fetchGpts();
    }
  }, [isGptExplorerVisible, getToken]);

  // Fetch user profile
  useEffect(() => {
    const fetchUserProfile = async () => {
      const token = await getToken();
      const response = await fetch(`${API_URL}/user`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setUserProfile({
          firstName: data.firstName || user?.firstName || "",
          lastName: data.lastName || user?.lastName || "",
          interests: data.interests || "",
        });
      }
    };
    if (user) {
      fetchUserProfile();
    }
  }, [getToken, user]);

  // Function to handle switching to a new chat
  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setActiveGpt(null);
    setIsGptExplorerVisible(false);
  };

  // Function to handle selecting an existing chat
  const selectChat = async (chatId) => {
    const token = await getToken();
    setIsGptExplorerVisible(false);
    setActiveChatId(chatId);
    const response = await fetch(`${API_URL}/chat/${chatId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    setMessages(
      data.map((item) => ({
        id: item.SK,
        role: item.role,
        text: item.content,
      }))
    );
  };

  // Function to send a message
  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    const newUserMessage = {
      id: Date.now().toString(),
      role: "user",
      text: message,
    };
    setMessages((prev) => [...prev, newUserMessage]);
    setMessage("");
    setIsLoading(true);

    const token = await getToken();
    let currentChatId = activeChatId;

    // Create a new chat if one isn't active
    if (!currentChatId) {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: message }),
      });
      const newChat = await response.json();
      currentChatId = newChat.chatId;
      setActiveChatId(currentChatId);
      setChats((prev) => [newChat, ...prev]);
    }

    let accumulatedText = "";
    const modelMessageId = (Date.now() + 1).toString();

    // Add a placeholder for the model's response
    setMessages((prev) => [
      ...prev,
      { id: modelMessageId, role: "model", text: "" },
    ]);

    await fetchEventSource(`${API_URL}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        chatId: currentChatId,
        message: message,
        gptsPersona: activeGpt?.persona,
      }),
      onmessage(event) {
        if (event.data === "[DONE]") {
          setIsLoading(false);
          return;
        }
        const chunk = JSON.parse(event.data);
        accumulatedText += chunk.text;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === modelMessageId ? { ...msg, text: accumulatedText } : msg
          )
        );
      },
      onerror(err) {
        console.error("EventSource failed:", err);
        setIsLoading(false);
        throw err;
      },
    });
  };

  // --- Main Layout ---
  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      {/* --- Sidebar --- */}
      <Box
        sx={{
          width: 280,
          bgcolor: "background.paper",
          borderRight: "1px solid",
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          p: 2,
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Typography variant="h6">My Chats</Typography>
          <UserButton afterSignOutUrl="/" />
        </Box>
        <Button
          variant="outlined"
          startIcon={<AddCommentIcon />}
          onClick={handleNewChat}
          sx={{ mb: 1 }}
        >
          New Chat
        </Button>
        <Button
          variant="outlined"
          startIcon={<ExploreIcon />}
          onClick={() => setIsGptExplorerVisible(true)}
          sx={{ mb: 2 }}
        >
          Explore GPTs
        </Button>
        <Divider />
        <List sx={{ overflowY: "auto", flexGrow: 1 }}>
          {chats.map((chat) => (
            <ListItem key={chat.chatId} disablePadding>
              <ListItemButton
                selected={activeChatId === chat.chatId}
                onClick={() => selectChat(chat.chatId)}
              >
                <ListItemText
                  primary={chat.title}
                  primaryTypographyProps={{
                    noWrap: true,
                    sx: { fontSize: "0.9rem" },
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        <Divider />
        <Box sx={{ pt: 2 }}>
          <Button
            fullWidth
            startIcon={<SettingsIcon />}
            onClick={() => setSettingsModalOpen(true)}
          >
            Settings
          </Button>
        </Box>
      </Box>

      {/* --- Main Content --- */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {isGptExplorerVisible ? (
          <GptExplorerView
            publicGpts={publicGpts}
            userGpts={userGpts}
            onSelectGpt={(gpt) => {
              setActiveGpt(gpt);
              handleNewChat();
            }}
            onCreateGpt={() => setCreateGptModalOpen(true)}
          />
        ) : (
          <>
            <ChatHeader gpt={activeGpt} />
            <ChatWindow messages={messages} />
            <MessageInput
              message={message}
              setMessage={setMessage}
              handleSend={handleSend}
              isLoading={isLoading}
            />
          </>
        )}
      </Box>

      {/* --- Modals --- */}
      <CreateGptModal
        open={isCreateGptModalOpen}
        onClose={() => setCreateGptModalOpen(false)}
        onGptCreated={(newGpt) => {
          setUserGpts((prev) => [newGpt, ...prev]);
          setCreateGptModalOpen(false);
        }}
      />
      <SettingsModal
        open={isSettingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        profile={userProfile}
        setProfile={setUserProfile}
      />
    </Box>
  );
}

// --- UI Sub-components ---

const ChatHeader = ({ gpt }) => (
  <Box
    sx={{
      p: 2,
      borderBottom: "1px solid",
      borderColor: "divider",
      display: "flex",
      alignItems: "center",
      gap: 2,
    }}
  >
    {gpt ? (
      <>
        <Avatar src={gpt.avatarUrl} />
        <Typography variant="h6">{gpt.gptsName}</Typography>
      </>
    ) : (
      <>
        <Avatar>
          <CodeIcon />
        </Avatar>
        <Typography variant="h6">Default Chat</Typography>
      </>
    )}
  </Box>
);

const ChatWindow = ({ messages }) => {
  const chatContainerRef = useRef(null);

  useEffect(() => {
    chatContainerRef.current?.scrollTo(
      0,
      chatContainerRef.current.scrollHeight
    );
  }, [messages]);

  return (
    <Box ref={chatContainerRef} sx={{ flexGrow: 1, p: 3, overflowY: "auto" }}>
      {messages.map((msg) => (
        <Box
          key={msg.id}
          sx={{
            display: "flex",
            justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            mb: 2,
          }}
        >
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor:
                msg.role === "user" ? "primary.main" : "background.paper",
              color:
                msg.role === "user" ? "primary.contrastText" : "text.primary",
              maxWidth: "70%",
            }}
          >
            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
              {msg.text}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
};

const MessageInput = ({ message, setMessage, handleSend, isLoading }) => (
  <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
    <form onSubmit={handleSend} style={{ display: "flex", gap: "8px" }}>
      <TextField
        fullWidth
        variant="outlined"
        placeholder="Type your message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={isLoading}
        autoComplete="off"
      />
      <Button
        type="submit"
        variant="contained"
        disabled={isLoading || !message.trim()}
        sx={{ p: "15px" }}
      >
        {isLoading ? <CircularProgress size={24} /> : <SendIcon />}
      </Button>
    </form>
  </Box>
);

const GptExplorerView = ({
  publicGpts,
  userGpts,
  onSelectGpt,
  onCreateGpt,
}) => (
  <Container sx={{ py: 4 }}>
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        mb: 4,
      }}
    >
      <Typography variant="h4">Explore GPTs</Typography>
      <Button variant="contained" onClick={onCreateGpt}>
        Create a GPT
      </Button>
    </Box>

    <Typography variant="h5" gutterBottom>
      My GPTs
    </Typography>
    <Grid container spacing={3} sx={{ mb: 4 }}>
      {userGpts.map((gpt) => (
        <Grid item xs={12} sm={6} md={4} key={gpt.SK}>
          <Card
            sx={{ height: "100%", display: "flex", flexDirection: "column" }}
          >
            <CardContent sx={{ flexGrow: 1 }}>
              <Avatar src={gpt.avatarUrl} sx={{ mb: 1 }} />
              <Typography variant="h6">{gpt.gptsName}</Typography>
              <Typography variant="body2" color="text.secondary">
                {gpt.description}
              </Typography>
            </CardContent>
            <CardActions>
              <Button size="small" onClick={() => onSelectGpt(gpt)}>
                Chat
              </Button>
            </CardActions>
          </Card>
        </Grid>
      ))}
    </Grid>

    <Typography variant="h5" gutterBottom>
      Public GPTs
    </Typography>
    <Grid container spacing={3}>
      {publicGpts.map((gpt) => (
        <Grid item xs={12} sm={6} md={4} key={gpt.SK}>
          <Card
            sx={{ height: "100%", display: "flex", flexDirection: "column" }}
          >
            <CardContent sx={{ flexGrow: 1 }}>
              <Avatar src={gpt.avatarUrl} sx={{ mb: 1 }} />
              <Typography variant="h6">{gpt.gptsName}</Typography>
              <Typography variant="body2" color="text.secondary">
                {gpt.description}
              </Typography>
            </CardContent>
            <CardActions>
              <Button size="small" onClick={() => onSelectGpt(gpt)}>
                Chat
              </Button>
            </CardActions>
          </Card>
        </Grid>
      ))}
    </Grid>
  </Container>
);

const modalStyle = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: 400,
  bgcolor: "background.paper",
  border: "2px solid #000",
  boxShadow: 24,
  p: 4,
};

const CreateGptModal = ({ open, onClose, onGptCreated }) => {
  const { getToken } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [persona, setPersona] = useState("");

  const handleSubmit = async () => {
    const token = await getToken();
    const response = await fetch("http://localhost:3001/gpts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ gptsName: name, description, persona }),
    });
    const newGpt = await response.json();
    onGptCreated(newGpt);
  };

  return (
    <Modal open={open} onClose={onClose}>
      <Box sx={modalStyle}>
        <Typography variant="h6" component="h2">
          Create a New GPT
        </Typography>
        <TextField
          label="Name"
          fullWidth
          margin="normal"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Description"
          fullWidth
          margin="normal"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <TextField
          label="Persona (Instructions for the AI)"
          multiline
          rows={4}
          fullWidth
          margin="normal"
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
        />
        <Button onClick={handleSubmit} variant="contained" sx={{ mt: 2 }}>
          Create
        </Button>
      </Box>
    </Modal>
  );
};

const SettingsModal = ({ open, onClose, profile, setProfile }) => {
  const { getToken } = useAuth();
  const [localProfile, setLocalProfile] = useState(profile);

  useEffect(() => {
    setLocalProfile(profile);
  }, [profile]);

  const handleSave = async () => {
    const token = await getToken();
    await fetch("http://localhost:3001/user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(localProfile),
    });
    setProfile(localProfile);
    onClose();
  };

  const handleChange = (e) => {
    setLocalProfile({ ...localProfile, [e.target.name]: e.target.value });
  };

  return (
    <Modal open={open} onClose={onClose}>
      <Box sx={modalStyle}>
        <Typography variant="h6" component="h2">
          User Settings
        </Typography>
        <TextField
          label="First Name"
          name="firstName"
          fullWidth
          margin="normal"
          value={localProfile.firstName || ""}
          onChange={handleChange}
        />
        <TextField
          label="Last Name"
          name="lastName"
          fullWidth
          margin="normal"
          value={localProfile.lastName || ""}
          onChange={handleChange}
        />
        <TextField
          label="Interests (comma-separated)"
          name="interests"
          fullWidth
          margin="normal"
          value={localProfile.interests || ""}
          onChange={handleChange}
        />
        <Button onClick={handleSave} variant="contained" sx={{ mt: 2 }}>
          Save
        </Button>
      </Box>
    </Modal>
  );
};
