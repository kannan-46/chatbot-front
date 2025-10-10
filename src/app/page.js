"use client";
import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Divider,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  IconButton,
  Popover,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EmojiEmotionsIcon from "@mui/icons-material/EmojiEmotions";
import ReplyAllIcon from "@mui/icons-material/ReplyAll";
import Image from "next/image";
import SendIcon from "@mui/icons-material/Send";
import PushPinIcon from "@mui/icons-material/PushPin";
import CampaignIcon from "@mui/icons-material/Campaign";

const avatars = [
  { id: "boy1", src: "/avatars/Boy 01.png" },
  { id: "girl1", src: "/avatars/Girl 01.png" },
  { id: "boy2", src: "/avatars/Boy 02.png" },
  { id: "girl2", src: "/avatars/Girl 02.png" },
  { id: "boy3", src: "/avatars/Boy 03.png" },
];

export default function GroupChatPage() {
  const WSS_URL = "wss://3fic3bv5sj.execute-api.ap-south-1.amazonaws.com/prod";
  const GROUP_ID = "Course-101";

  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [input, setInput] = useState("");
  const [userName, setUserName] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [selectedAvatar, setSelectedAvatar] = useState(avatars[0].src);
  const [replyTo, setReplyTo] = useState(null);
  const [reactionAnchorEl, setReactionAnchorEl] = useState(null);
  const [reactingToMessage, setReactingToMessage] = useState(null);
  const [pinnedMessage, setPinnedMessage] = useState(null);
  const availableReactions = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
  const [userStatuses, setUserStatuses] = useState({});

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  useEffect(() => {
    if (!socket) return;

    // Find messages from others that you haven't yet marked as read
    const unreadMessages = messages.filter(
      (msg) =>
        msg.fromUserId !== userName &&
        (!msg.seenBy || !msg.seenBy.includes(userName))
    );

    // If there are any, send the 'markAsRead' action
    if (unreadMessages.length > 0) {
      unreadMessages.forEach((msg) => {
        socket.send(
          JSON.stringify({
            action: "markAsRead",
            userId: userName,
            groupId: GROUP_ID,
            messageTimestamp: msg.timestamp,
          })
        );
      });
    }
  }, [messages, userName, socket]);
  const handleJoinChat = (e) => {
    e.preventDefault();
    if (!userName.trim() || !selectedAvatar) {
      alert("Please enter your name and select an avatar.");
      return;
    }
    setIsJoined(true);
    const userInfo = { id: userName, name: userName, avatar: selectedAvatar };
    const ws = new WebSocket(
      `${WSS_URL}?userInfo=${encodeURIComponent(JSON.stringify(userInfo))}`
    );
    setSocket(ws);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          action: "joinGroup",
          userId: userName,
          groupId: GROUP_ID,
        })
      );
      ws.send(JSON.stringify({ action: "requestPresenceState" }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case "presenceState":
          setOnlineUsers(data.users);
          setUserStatuses((prev) => {
            const updated = { ...prev };
            data.users.forEach((u) => (updated[u.id] = "online"));
            return updated;
          });
          break;
        case "userJoined":
          setOnlineUsers((prev) =>
            prev.find((u) => u.id === data.user.id)
              ? prev
              : [...prev, data.user]
          );
          setUserStatuses((prev) => ({ ...prev, [data.user.id]: "online" }));
          break;
        case "userLeft":
          setOnlineUsers((prev) => {
            const user = prev.find((u) => u.id === data.userId);
            // If user doesn’t exist (was never seen before), skip.
            if (!user) return prev;
            // Mark them offline instead of removing
            return prev.map((u) =>
              u.id === data.userId ? { ...u, isOnline: false } : u
            );
          });
          setUserStatuses((prev) => ({ ...prev, [data.userId]: "offline" }));

          break;
        case "groupMessage":
          setMessages((prev) => [...prev, data]);
          break;
        case "startTyping":
          if (data.userId !== userName)
            setTypingUsers((prev) => [...new Set([...prev, data.userId])]);
          break;
        case "stopTyping":
          setTypingUsers((prev) => prev.filter((id) => id !== data.userId));
          break;
        case "messageReactionUpdate":
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.timestamp === data.messageTimestamp
                ? { ...msg, reactions: data.reactions }
                : msg
            )
          );
          break;

        case "messagePinned":
          setPinnedMessage(data.pinnedMessage);
          break;

        case "messageUnPinned":
          setPinnedMessage(null);
          break;

        case "readReceiptUpdate":
          setMessages((prev) =>
            prev.map((msg) =>
              msg.timestamp === data.messageTimestamp
                ? { ...msg, seenBy: data.seenBy }
                : msg
            )
          );
          break;
      }
    };

    ws.onclose = () => console.log("WebSocket disconnected");
    ws.onerror = (error) => console.error("WebSocket error:", error);
  };

  // src/app/page.js -> after other handlers
  const handlePinMessage = (messageToPin) => {
    if (socket) {
      socket.send(
        JSON.stringify({
          action: "pinMessage",
          groupId: GROUP_ID,
          message: messageToPin,
        })
      );
    }
  };

  const handleUnpinMessage = () => {
    if (socket) {
      socket.send(
        JSON.stringify({
          action: "unpinMessage",
          groupId: GROUP_ID,
        })
      );
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (input.trim() && socket) {
      const action = replyTo ? "replyToGroupMessage" : "sendGroupMessage";
      const messagePayload = {
        action: action,
        userId: userName,
        groupId: GROUP_ID,
        message: input,
        replyTo: replyTo ? replyTo.timestamp : undefined,
      };
      socket.send(JSON.stringify(messagePayload));
      setReplyTo(null);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socket.send(
        JSON.stringify({
          action: "stopTyping",
          userId: userName,
          groupId: GROUP_ID,
        })
      );
      typingTimeoutRef.current = null;
      setInput("");
    }
  };

  const handleReplyClick = (message) => {
    setReplyTo(message);
    inputRef.current?.focus();
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!socket) return;
    if (!typingTimeoutRef.current) {
      socket.send(
        JSON.stringify({
          action: "startTyping",
          userId: userName,
          groupId: GROUP_ID,
        })
      );
    } else {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      socket.send(
        JSON.stringify({
          action: "stopTyping",
          userId: userName,
          groupId: GROUP_ID,
        })
      );
      typingTimeoutRef.current = null;
    }, 1000);
  };

  const handleOpenReactionMenu = (event, message) => {
    setReactionAnchorEl(event.currentTarget);
    setReactingToMessage(message);
  };

  const handleCloseReactionMenu = () => {
    setReactionAnchorEl(null);
    setReactingToMessage(null);
  };

  const handleSelectReaction = (reaction) => {
    if (socket && reactingToMessage) {
      socket.send(
        JSON.stringify({
          action: "reactToMessage",
          userId: userName,
          groupId: GROUP_ID,
          messageTimestamp: reactingToMessage.timestamp,
          reaction: reaction,
        })
      );
    }
    handleCloseReactionMenu();
  };

  const renderTypingIndicator = () => {
    if (typingUsers.length === 0) return null;
    if (typingUsers.length === 1) return `${typingUsers[0]} is typing...`;
    if (typingUsers.length === 2)
      return `${typingUsers[0]} and ${typingUsers[1]} are typing...`;
    return "Several people are typing...";
  };

  if (!isJoined) {
    return (
      <Box
        height="100vh"
        display="flex"
        alignItems="center"
        justifyContent="center"
        sx={{ backgroundColor: "#f4f6f8" }}
      >
        <Paper elevation={6} sx={{ p: 4, width: 360, textAlign: "center" }}>
          <Typography variant="h5" gutterBottom fontWeight="bold">
            Join the Discussion
          </Typography>
          <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 2 }}>
            Select your avatar
          </Typography>
          <Box display="flex" justifyContent="center" gap={2} mb={3}>
            {avatars.map((avatar) => (
              <Avatar
                key={avatar.id}
                src={avatar.src}
                sx={{
                  width: 56,
                  height: 56,
                  cursor: "pointer",
                  border:
                    selectedAvatar === avatar.src
                      ? "3px solid #4f46e5"
                      : "3px solid transparent",
                  transition: "border 0.2s",
                }}
                onClick={() => setSelectedAvatar(avatar.src)}
              />
            ))}
          </Box>
          <form onSubmit={handleJoinChat}>
            <TextField
              fullWidth
              label="Enter your name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              margin="normal"
            />
            <Button
              fullWidth
              type="submit"
              variant="contained"
              color="primary"
              sx={{ mt: 2, py: 1.5 }}
            >
              Join Chat
            </Button>
          </form>
        </Paper>
      </Box>
    );
  }

  const isReactionPopoverOpen = Boolean(reactionAnchorEl);

  return (
    <Box display="flex" height="100vh" bgcolor="#f9fafb">
      {/* --- Sidebar --- */}
      <Box
        width={300}
        bgcolor="white"
        borderRight="1px solid #e0e0e0"
        display="flex"
        flexDirection="column"
      >
        <Box
          sx={{
            p: 2,
            borderBottom: "1px solid #e0e0e0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "#fafafa",
          }}
        >
          <Image
            src="/classory/Frame.png"
            alt="Classory Logo"
            width={120}
            height={40}
            priority
          />
        </Box>
        <Typography
          variant="subtitle2"
          sx={{ px: 2, pt: 1, color: "text.secondary", fontWeight: "bold" }}
        >
          Online ({onlineUsers.length})
        </Typography>
        <List dense sx={{ overflowY: "auto", flex: 1, p: 1 }}>
          <ListItem>
            <ListItemAvatar sx={{ position: "relative" }}>
              <Avatar src={selectedAvatar} sx={{ width: 32, height: 32 }} />
              <Box
                sx={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  bgcolor: "#22c55e", // always online for self
                  border: "2px solid white",
                }}
              />
            </ListItemAvatar>

            <ListItemText
              primary={`${userName} (You)`}
              primaryTypographyProps={{ fontWeight: "bold" }}
            />
          </ListItem>
          <Divider sx={{ my: 1 }} />
          {onlineUsers
            .filter((user) => user.id !== userName)
            .map((user) => (
              <ListItem key={user.id}>
                <ListItemAvatar>
                  <Box sx={{ position: "relative", display: "inline-block" }}>
                    <Avatar src={user.avatar} sx={{ width: 32, height: 32 }} />
                    <Box
                      sx={{
                        position: "absolute",
                        bottom: 2,
                        right: 2,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        bgcolor:
                          userStatuses[user.id] === "online"
                            ? "green"
                            : userStatuses[user.id] === "offline"
                            ? "gold"
                            : "grey",
                        border: "2px solid white",
                        transition: "background-color 0.3s ease-in-out",
                      }}
                    />
                  </Box>
                </ListItemAvatar>
                <ListItemText
                  primary={user.name}
                  primaryTypographyProps={{
                    fontWeight: "bold",
                    color:
                      userStatuses[user.id] === "offline"
                        ? "text.disabled"
                        : "inherit",
                  }}
                />
              </ListItem>
            ))}
        </List>
      </Box>

      {/* --- Chat Section --- */}
      <Box flex={1} display="flex" flexDirection="column" bgcolor="white">
        <Typography
          variant="h6"
          sx={{ p: 2.5, borderBottom: "1px solid #e0e0e0", fontWeight: 600 }}
        >
          Doubt Corner
        </Typography>
        {pinnedMessage && (
          <Paper
            elevation={0}
            sx={{
              p: 1,
              bgcolor: "#eef2ff",
              borderBottom: "1px solid #e0e0e0",
              display: "flex",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            <CampaignIcon color="primary" />
            <Box flex={1}>
              <Typography
                variant="caption"
                fontWeight="bold"
                color="primary.main"
              >
                PINNED BY {pinnedMessage.fromUserId}
              </Typography>
              <Typography variant="body2" noWrap>
                {pinnedMessage.message}
              </Typography>
            </Box>
            <IconButton size="small" onClick={handleUnpinMessage}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Paper>
        )}
        {/* --- Messages --- */}
        <Box
          flex={1}
          p={3}
          overflow="auto"
          display="flex"
          flexDirection="column"
          gap={2}
        >
          {messages.map((msg, i) => {
            const isUser = msg.fromUserId === userName;
            const sender =
              onlineUsers.find((u) => u.id === msg.fromUserId) ||
              (isUser
                ? { name: userName, avatar: selectedAvatar }
                : { name: "?", avatar: "" });
            const repliedToMessage = msg.replyTo
              ? messages.find((m) => m.timestamp === msg.replyTo)
              : null;

            if (isUser) {
              return (
                <Box
                  key={i}
                  className="message-row"
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    gap: 1,
                    "&:hover .action-buttons": { opacity: 1 },
                  }}
                >
                  <Box
                    className="action-buttons"
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      opacity: 0,
                      transition: "opacity 0.2s",
                    }}
                  >
                    <IconButton
                      size="small"
                      onClick={() => handlePinMessage(msg)}
                    >
                      <PushPinIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleReplyClick(msg)}
                      sx={{
                        bgcolor: "background.paper",
                        boxShadow: 1,
                        mb: 0.5,
                        "&:hover": { bgcolor: "grey.200" },
                      }}
                    >
                      <ReplyAllIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={(e) => handleOpenReactionMenu(e, msg)}
                      sx={{
                        bgcolor: "background.paper",
                        boxShadow: 1,
                        "&:hover": { bgcolor: "grey.200" },
                      }}
                    >
                      <EmojiEmotionsIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <Box sx={{ position: "relative" }}>
                    <Paper
                      elevation={1}
                      sx={{
                        p: 1.5,
                        bgcolor: "#33A89D",
                        color: "white",
                        borderRadius: 3,
                        borderBottomRightRadius: 0,
                      }}
                    >
                      {repliedToMessage && (
                        <Box
                          sx={{
                            borderLeft: 2,
                            borderColor: "grey.400",
                            pl: 1,
                            mb: 1,
                            opacity: 0.8,
                          }}
                        >
                          <Typography variant="caption" fontWeight="bold">
                            {repliedToMessage.fromUserId}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontStyle: "italic",
                              wordBreak: "break-word",
                            }}
                          >
                            {repliedToMessage.message}
                          </Typography>
                        </Box>
                      )}
                      <Typography
                        variant="body1"
                        sx={{ wordBreak: "break-word" }}
                      >
                        {msg.message}
                      </Typography>
                    </Paper>
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <Paper
                        elevation={2}
                        sx={{
                          position: "absolute",
                          bottom: -10,
                          right: 4,
                          zIndex: 5,
                          display: "flex",
                          gap: 0.5,
                          p: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        {Object.entries(msg.reactions).map(
                          ([reaction, users]) =>
                            users.length > 0 && (
                              <Box
                                key={reaction}
                                sx={{ display: "flex", alignItems: "center" }}
                              >
                                <Typography
                                  variant="caption"
                                  sx={{ fontSize: "0.8rem" }}
                                >
                                  {reaction}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    ml: 0.25,
                                    fontWeight: "bold",
                                    fontSize: "0.7rem",
                                  }}
                                >
                                  {users.length}
                                </Typography>
                              </Box>
                            )
                        )}
                      </Paper>
                    )}
                  </Box>
                  {msg.seenBy && msg.seenBy.length > 0 && (
                    <Box
                      display="flex"
                      justifyContent="flex-end"
                      alignItems="center"
                      mt={0.5}
                    >
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mr: 0.5 }}
                      >
                        Seen by
                      </Typography>
                      <Box display="flex">
                        {msg.seenBy.slice(0, 3).map((userId) => {
                          const seenByUser = onlineUsers.find(
                            (u) => u.id === userId
                          );
                          if (!seenByUser) return null; // In case user info isn't available yet

                          return (
                            <Avatar
                              key={seenByUser.id}
                              title={seenByUser.name} // Show name on hover!
                              src={seenByUser.avatar}
                              sx={{
                                width: 20,
                                height: 20,
                                ml: -1, // Creates a nice stacking overlap
                                border: "2px solid white",
                              }}
                            />
                          );
                        })}
                        {msg.seenBy.length > 3 && (
                          <Typography variant="caption" sx={{ ml: 0.5 }}>
                            +{msg.seenBy.length - 3}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  )}
                </Box>
              );
            }

            return (
              <Box
                key={i}
                className="message-row"
                sx={{
                  display: "flex",
                  justifyContent: "flex-start",
                  alignItems: "center",
                  gap: 1,
                  "&:hover .action-buttons": { opacity: 1 },
                }}
              >
                <Avatar src={sender.avatar} sx={{ width: 36, height: 36 }} />
                <Box sx={{ position: "relative" }}>
                  <Paper
                    elevation={1}
                    sx={{
                      p: 1.5,
                      bgcolor: "#F86F57",
                      color: "white",
                      borderRadius: 3,
                      borderBottomLeftRadius: 0,
                    }}
                  >
                    {repliedToMessage && (
                      <Box
                        sx={{
                          borderLeft: 2,
                          borderColor: "grey.500",
                          pl: 1,
                          mb: 1,
                          opacity: 0.8,
                        }}
                      >
                        <Typography variant="caption" fontWeight="bold">
                          {repliedToMessage.fromUserId}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ fontStyle: "italic", wordBreak: "break-word" }}
                        >
                          {repliedToMessage.message}
                        </Typography>
                      </Box>
                    )}
                    {!isUser && (
                      <Typography
                        variant="caption"
                        fontWeight="bold"
                        color="text.secondary"
                      >
                        {msg.fromUserId}
                      </Typography>
                    )}
                    <Typography
                      variant="body1"
                      sx={{ wordBreak: "break-word" }}
                    >
                      {msg.message}
                    </Typography>
                  </Paper>
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <Paper
                      elevation={2}
                      sx={{
                        position: "absolute",
                        bottom: -10,
                        left: 4,
                        zIndex: 5,
                        display: "flex",
                        gap: 0.5,
                        p: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {Object.entries(msg.reactions).map(
                        ([reaction, users]) =>
                          users.length > 0 && (
                            <Box
                              key={reaction}
                              sx={{ display: "flex", alignItems: "center" }}
                            >
                              <Typography
                                variant="caption"
                                sx={{ fontSize: "0.8rem" }}
                              >
                                {reaction}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{
                                  ml: 0.25,
                                  fontWeight: "bold",
                                  fontSize: "0.7rem",
                                }}
                              >
                                {users.length}
                              </Typography>
                            </Box>
                          )
                      )}
                    </Paper>
                  )}
                </Box>
                <Box
                  className="action-buttons"
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    opacity: 0,
                    transition: "opacity 0.2s",
                  }}
                >
                  <IconButton
                    size="small"
                    onClick={() => handlePinMessage(msg)}
                  >
                    <PushPinIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleReplyClick(msg)}
                    sx={{
                      bgcolor: "background.paper",
                      boxShadow: 1,
                      mb: 0.5,
                      "&:hover": { bgcolor: "grey.200" },
                    }}
                  >
                    <ReplyAllIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={(e) => handleOpenReactionMenu(e, msg)}
                    sx={{
                      bgcolor: "background.paper",
                      boxShadow: 1,
                      "&:hover": { bgcolor: "grey.200" },
                    }}
                  >
                    <EmojiEmotionsIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            );
          })}

          {/* --- CORRECTED: Typing Indicator --- */}
          <Box
            sx={{
              pl: typingUsers.length > 0 ? "5px" : 0, // Align with received message text
              height: "20px", // Reserve space to prevent layout shift
              mt: 1,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              fontStyle="italic"
            >
              {renderTypingIndicator()}
            </Typography>
          </Box>
          <div ref={messagesEndRef} />
        </Box>

        <Divider />

        {replyTo && (
          <Box
            sx={{
              p: 1,
              borderTop: "1px solid #e0e0e0",
              bgcolor: "#f5f5f5",
              position: "relative",
            }}
          >
            <Paper
              elevation={0}
              sx={{ p: 1, bgcolor: "#e0e0e0", borderLeft: "4px solid #33A89D" }}
            >
              <Typography variant="subtitle2" color="primary.main">
                {replyTo.fromUserId}
              </Typography>
              <Typography variant="body2" noWrap color="text.secondary">
                {replyTo.message}
              </Typography>
            </Paper>
            <IconButton
              onClick={() => setReplyTo(null)}
              sx={{
                position: "absolute",
                top: "50%",
                right: "8px",
                transform: "translateY(-50%)",
              }}
              size="small"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        )}

        <Box
          component="form"
          onSubmit={handleSendMessage}
          display="flex"
          gap={2}
          p={2}
        >
          <TextField
            inputRef={inputRef}
            fullWidth
            variant="outlined"
            placeholder="Type a message..."
            value={input}
            onChange={handleInputChange}
          />
          <Button variant="contained" type="submit" sx={{ bgcolor: "#EE4B2B" }}>
            <SendIcon sx={{ color: "white" }} />
          </Button>
        </Box>
      </Box>

      {/* --- CORRECTED: Reaction Popover --- */}
      <Popover
        open={isReactionPopoverOpen}
        anchorEl={reactionAnchorEl}
        onClose={handleCloseReactionMenu}
        anchorOrigin={{
          vertical: "bottom",
          horizontal:
            reactingToMessage?.fromUserId === userName ? "left" : "right", // Dynamic anchor
        }}
        transformOrigin={{
          vertical: "top",
          horizontal:
            reactingToMessage?.fromUserId === userName ? "left" : "right", // Dynamic anchor
        }}
        PaperProps={{
          sx: {
            borderRadius: 5,
            p: 0.5,
            marginTop: "8px",
            bgcolor: "#d5f9f5ff",
          },
        }}
      >
        <Box sx={{ display: "flex" }}>
          {availableReactions.map((reaction) => (
            <IconButton
              key={reaction}
              onClick={() => handleSelectReaction(reaction)}
              size="large"
            >
              <Typography sx={{ fontSize: "1.5rem" }}>{reaction}</Typography>
            </IconButton>
          ))}
        </Box>
      </Popover>
    </Box>
  );
}
