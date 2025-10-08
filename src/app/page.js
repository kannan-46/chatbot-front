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
import CloseIcon from '@mui/icons-material/Close';
import EmojiEmotionsIcon from '@mui/icons-material/EmojiEmotions';

const avatars = [
  { id: 'boy1', src: '/avatars/Boy 01.png' },
  { id: 'girl1', src: '/avatars/Girl 01.png' },
  { id: 'boy2', src: '/avatars/Boy 02.png' },
  { id: 'girl2', src: '/avatars/Girl 02.png' },
  { id: 'boy3', src: '/avatars/Boy 03.png' },
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
  
  // State for message reactions
  const [reactionAnchorEl, setReactionAnchorEl] = useState(null);
  const [reactingToMessage, setReactingToMessage] = useState(null);
  const availableReactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  const handleJoinChat = (e) => {
    e.preventDefault();
    if (!userName.trim() || !selectedAvatar) {
      alert('Please enter your name and select an avatar.');
      return;
    }
    setIsJoined(true);
    const userInfo = { id: userName, name: userName, avatar: selectedAvatar };
    const ws = new WebSocket(`${WSS_URL}?userInfo=${encodeURIComponent(JSON.stringify(userInfo))}`);
    setSocket(ws);

    ws.onopen = () => {
      console.log("✅ WebSocket connected");
      ws.send(JSON.stringify({ action: "joinGroup", userId: userName, groupId: GROUP_ID }));
      ws.send(JSON.stringify({ action: "requestPresenceState" }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("📩 Message received:", data);

      switch (data.type) {
        case "presenceState":
          setOnlineUsers(data.users);
          break;
        case "userJoined":
          setOnlineUsers((prev) => prev.find((u) => u.id === data.user.id) ? prev : [...prev, data.user]);
          break;
        case "userLeft":
          setOnlineUsers((prev) => prev.filter((u) => u.id !== data.userId));
          break;
        case "groupMessage":
          setMessages((prev) => [...prev, data]);
          break;
        case "startTyping":
          if (data.userId !== userName) setTypingUsers((prev) => [...new Set([...prev, data.userId])]);
          break;
        case "stopTyping":
          setTypingUsers((prev) => prev.filter((id) => id !== data.userId));
          break;
        case "messageReactionUpdate": // Handle reaction updates
          setMessages(prevMessages =>
            prevMessages.map(msg =>
              msg.timestamp === data.messageTimestamp
                ? { ...msg, reactions: data.reactions }
                : msg
            )
          );
          break;
      }
    };

    ws.onclose = () => console.log("❌ WebSocket disconnected");
    ws.onerror = (error) => console.error("⚠️ WebSocket error:", error);
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
      socket.send(JSON.stringify({ action: "stopTyping", userId: userName, groupId: GROUP_ID }));
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
      socket.send(JSON.stringify({ action: "startTyping", userId: userName, groupId: GROUP_ID }));
    } else {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      socket.send(JSON.stringify({ action: "stopTyping", userId: userName, groupId: GROUP_ID }));
      typingTimeoutRef.current = null;
    }, 1000);
  };
  
  // Handlers for the reaction feature
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
          action: 'reactToMessage',
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
    if (typingUsers.length === 2) return `${typingUsers[0]} and ${typingUsers[1]} are typing...`;
    return "Several people are typing...";
  };

  if (!isJoined) {
    return (
      <Box height="100vh" display="flex" alignItems="center" justifyContent="center" sx={{ backgroundColor: "#f4f6f8" }}>
        <Paper elevation={6} sx={{ p: 4, width: 360, textAlign: "center" }}>
          <Typography variant="h5" gutterBottom fontWeight="bold">Join the Discussion</Typography>
          <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 2 }}>Select your avatar</Typography>
          <Box display="flex" justifyContent="center" gap={2} mb={3}>
            {avatars.map((avatar) => (
              <Avatar
                key={avatar.id}
                src={avatar.src}
                sx={{
                  width: 56,
                  height: 56,
                  cursor: 'pointer',
                  border: selectedAvatar === avatar.src ? '3px solid #4f46e5' : '3px solid transparent',
                  transition: 'border 0.2s'
                }}
                onClick={() => setSelectedAvatar(avatar.src)}
              />
            ))}
          </Box>
          <form onSubmit={handleJoinChat}>
            <TextField fullWidth label="Enter your name" value={userName} onChange={(e) => setUserName(e.target.value)} margin="normal" />
            <Button fullWidth type="submit" variant="contained" color="primary" sx={{ mt: 2, py: 1.5 }}>Join Chat</Button>
          </form>
        </Paper>
      </Box>
    );
  }

  
// --- Start of the return statement ---
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
        <Typography variant="h6" sx={{ p: 2, borderBottom: "1px solid #e0e0e0" }}>
          Classroom
        </Typography>
        <Typography variant="subtitle2" sx={{ px: 2, pt: 1, color: "text.secondary", fontWeight: "bold" }}>
          Online ({onlineUsers.length})
        </Typography>
        <List dense sx={{ overflowY: "auto", flex: 1, p: 1 }}>
          <ListItem>
            <ListItemAvatar><Avatar src={selectedAvatar} sx={{ width: 32, height: 32 }} /></ListItemAvatar>
            <ListItemText primary={`${userName} (You)`} primaryTypographyProps={{ fontWeight: 'bold' }} />
          </ListItem>
          <Divider sx={{ my: 1 }} />
          {onlineUsers.filter(user => user.id !== userName).map((user) => (
            <ListItem key={user.id}>
              <ListItemAvatar><Avatar src={user.avatar} sx={{ width: 32, height: 32 }} /></ListItemAvatar>
              <ListItemText primary={user.name} />
            </ListItem>
          ))}
        </List>
      </Box>

      {/* --- Chat Section --- */}
      <Box flex={1} display="flex" flexDirection="column" bgcolor="white">
        <Typography variant="h6" sx={{ p: 2, borderBottom: "1px solid #e0e0e0", fontWeight: 600 }}>
          Doubt Corner
        </Typography>

        {/* --- Messages --- */}
        <Box flex={1} p={3} overflow="auto" display="flex" flexDirection="column" gap={2}>
          {messages.map((msg, i) => {
            const isUser = msg.fromUserId === userName;
            const sender = onlineUsers.find(u => u.id === msg.fromUserId) || (isUser ? { name: userName, avatar: selectedAvatar } : { name: '?', avatar: '' });
            const repliedToMessage = msg.replyTo ? messages.find(m => m.timestamp === msg.replyTo) : null;
            
            return (
              <Box key={i} display="flex" justifyContent={isUser ? "flex-end" : "flex-start"} alignItems="flex-end">
                {!isUser && <Avatar src={sender.avatar} sx={{ width: 36, height: 36, mr: 1.5 }} />}
                
                {/* Container for the message bubble and its reactions */}
                <Box sx={{ position: 'relative', '&:hover .reaction-button': { opacity: 1 } }}>
                  <Paper
                    elevation={1}
                    sx={{
                      p: 1.5,
                      maxWidth: "100%", // Let the inner content define the max-width
                      bgcolor: isUser ? "#4f46e5" : "#f3f4f6",
                      color: isUser ? "white" : "black",
                      borderRadius: 3,
                      borderBottomRightRadius: isUser ? 0 : 3,
                      borderBottomLeftRadius: isUser ? 3 : 0,
                    }}
                  >
                    {repliedToMessage && (
                      <Box sx={{ borderLeft: 2, borderColor: 'grey.500', pl: 1, mb: 1, opacity: 0.8 }}>
                        <Typography variant="caption" fontWeight="bold">{repliedToMessage.fromUserId}</Typography>
                        <Typography variant="body2" sx={{ fontStyle: 'italic', wordBreak: 'break-word' }}>{repliedToMessage.message}</Typography>
                      </Box>
                    )}
                    {!isUser && <Typography variant="caption" fontWeight="bold" color="text.secondary">{msg.fromUserId}</Typography>}
                    <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>{msg.message}</Typography>
                    <Button size="small" sx={{ p: 0, mt: 0.5, color: isUser ? 'white' : 'primary.main', opacity: 0.8 }} onClick={() => handleReplyClick(msg)}>Reply</Button>
                  </Paper>

                  {/* Reaction Button - Positioned relative to the message container */}
                  <IconButton
                    className="reaction-button"
                    size="small"
                    onClick={(e) => handleOpenReactionMenu(e, msg)}
                    sx={{
                      position: 'absolute',
                      top: -15,
                      right: isUser ? 'auto' : -12,
                      left: isUser ? -12 : 'auto',
                      zIndex: 10,
                      opacity: 0,
                      transition: 'opacity 0.2s',
                      bgcolor: 'background.paper',
                      boxShadow: 1,
                      '&:hover': { bgcolor: 'grey.200' },
                    }}
                  >
                    <EmojiEmotionsIcon fontSize="small" />
                  </IconButton>

                  {/* Display Reactions - Positioned at the bottom of the message */}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <Paper
                      elevation={2}
                      sx={{
                        display: 'flex',
                        gap: 0.5,
                        p: '2px 6px',
                        borderRadius: 4,
                        position: 'absolute',
                        bottom: -10,
                        right: isUser ? 4 : 'auto',
                        left: isUser ? 'auto' : 4,
                        zIndex: 5,
                      }}
                    >
                      {Object.entries(msg.reactions).map(([reaction, users]) => (
                        users.length > 0 && (
                          <Box key={reaction} sx={{ display: 'flex', alignItems: 'center' }}>
                            <Typography variant="caption" sx={{ fontSize: '0.8rem' }}>{reaction}</Typography>
                            <Typography variant="caption" sx={{ ml: 0.25, fontWeight: 'bold', fontSize: '0.7rem' }}>
                              {users.length}
                            </Typography>
                          </Box>
                        )
                      ))}
                    </Paper>
                  )}
                </Box>
              </Box>
            );
          })}
          <Typography variant="caption" color="text.secondary" fontStyle="italic" sx={{ pl: 1 }}>{renderTypingIndicator()}</Typography>
          <div ref={messagesEndRef} />
        </Box>

        <Divider />

        {/* Reply Info Bar */}
        {replyTo && (
          <Box sx={{ p: 1, borderTop: "1px solid #e0e0e0", bgcolor: '#f5f5f5', position: 'relative' }}>
            <Paper elevation={0} sx={{ p: 1, bgcolor: '#e0e0e0', borderLeft: '4px solid #4f46e5' }}>
              <Typography variant="subtitle2" color="primary.main">{replyTo.fromUserId}</Typography>
              <Typography variant="body2" noWrap color="text.secondary">{replyTo.message}</Typography>
            </Paper>
            <IconButton onClick={() => setReplyTo(null)} sx={{ position: 'absolute', top: '50%', right: '8px', transform: 'translateY(-50%)' }} size="small">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        )}

        {/* Input Box */}
        <Box component="form" onSubmit={handleSendMessage} display="flex" gap={2} p={2} bgcolor="#fafafa">
          <TextField inputRef={inputRef} fullWidth variant="outlined" placeholder="Type a message..." value={input} onChange={handleInputChange} />
          <Button variant="contained" type="submit" color="primary">Send</Button>
        </Box>
      </Box>

      {/* Reaction Popover */}
      <Popover
        open={isReactionPopoverOpen}
        anchorEl={reactionAnchorEl}
        onClose={handleCloseReactionMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        PaperProps={{ sx: { borderRadius: 5, p: 0.5 } }}
      >
        <Box sx={{ display: 'flex' }}>
          {availableReactions.map(reaction => (
            <IconButton key={reaction} onClick={() => handleSelectReaction(reaction)} size="large">
              <Typography sx={{ fontSize: '1.5rem' }}>{reaction}</Typography>
            </IconButton>
          ))}
        </Box>
      </Popover>
    </Box>
  );
  // --- End of the return statement ---
}