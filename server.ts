import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin if service account is provided
let firestore: admin.firestore.Firestore | null = null;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    firestore = admin.firestore();
    console.log("Firebase Admin initialized");
  }
} catch (error) {
  console.error("Firebase Admin initialization failed:", error);
}

const db = new Database("whatsapp.db");

// Initialize DB (keeping SQLite as local cache/fallback)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    avatar TEXT,
    status TEXT,
    phoneNumber TEXT,
    lastSeen TEXT,
    isAI INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chatId TEXT,
    senderId TEXT,
    text TEXT,
    timestamp TEXT,
    status TEXT,
    deletedForUser INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    participants TEXT,
    unreadCount INTEGER DEFAULT 0
  );
`);

// Seed AI users if not exist
const seedAI = db.prepare("SELECT COUNT(*) as count FROM users WHERE isAI = 1").get() as { count: number };
if (seedAI.count === 0) {
  const insertUser = db.prepare("INSERT INTO users (id, name, avatar, status, isAI) VALUES (?, ?, ?, ?, ?)");
  insertUser.run("ai-1", "Gemini AI", "https://picsum.photos/seed/gemini/200", "Always here to chat!", 1);
  insertUser.run("ai-2", "Tech Support", "https://picsum.photos/seed/support/200", "How can I help you today?", 1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  app.use(express.json());

  // API Routes
  app.get("/api/users", (req, res) => {
    const users = db.prepare("SELECT * FROM users").all();
    res.json(users);
  });

  app.post("/api/login", async (req, res) => {
    const { phoneNumber, name, avatar } = req.body;
    let user = db.prepare("SELECT * FROM users WHERE phoneNumber = ?").get(phoneNumber) as any;
    
    if (!user) {
      const id = Math.random().toString(36).substring(7);
      db.prepare("INSERT INTO users (id, name, avatar, status, phoneNumber, lastSeen, isAI) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, name, avatar, "Hey there! I am using WhatsApp.", phoneNumber, new Date().toISOString(), 0);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    }

    // Sync to Firebase if available
    if (firestore) {
      await firestore.collection("users").doc(user.id).set({
        ...user,
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    res.json(user);
  });

  app.get("/api/chats/:userId", (req, res) => {
    const { userId } = req.params;
    const chats = db.prepare("SELECT * FROM chats").all();
    const chatsWithDetails = chats.map((chat: any) => {
      const participants = JSON.parse(chat.participants);
      if (participants.includes(userId)) {
        const otherUserId = participants.find((id: string) => id !== userId);
        const otherUser = db.prepare("SELECT * FROM users WHERE id = ?").get(otherUserId);
        const lastMessage = db.prepare("SELECT * FROM messages WHERE chatId = ? AND deletedForUser = 0 ORDER BY timestamp DESC LIMIT 1").get(chat.id);
        return { ...chat, participants: [otherUser], lastMessage };
      }
      return null;
    }).filter(Boolean);
    res.json(chatsWithDetails);
  });

  app.get("/api/messages/:chatId", (req, res) => {
    const { chatId } = req.params;
    const messages = db.prepare("SELECT * FROM messages WHERE chatId = ? AND deletedForUser = 0 ORDER BY timestamp ASC").all(chatId);
    res.json(messages);
  });

  app.delete("/api/messages/:messageId", async (req, res) => {
    const { messageId } = req.params;
    // Soft delete: update local DB to hide it, but it remains in Firebase if it was synced
    db.prepare("UPDATE messages SET deletedForUser = 1 WHERE id = ?").run(messageId);
    res.json({ success: true });
  });

  // Socket.io logic
  io.on("connection", (socket) => {
    socket.on("join-chat", (chatId) => {
      socket.join(chatId);
    });

    socket.on("typing", (data) => {
      const { chatId, userId, isTyping } = data;
      socket.to(chatId).emit("user-typing", { userId, isTyping });
    });

    socket.on("send-message", async (data) => {
      const { id, chatId, senderId, text, timestamp, status, recipientId } = data;
      
      // Save to local DB
      db.prepare("INSERT INTO messages (id, chatId, senderId, text, timestamp, status) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, chatId, senderId, text, timestamp, status);

      // Sync to Firebase if available
      if (firestore) {
        await firestore.collection("chats").doc(chatId).collection("messages").doc(id).set({
          ...data,
          serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Broadcast
      io.to(chatId).emit("receive-message", data);

      // AI Response logic
      const recipient = db.prepare("SELECT * FROM users WHERE id = ?").get(recipientId) as any;
      if (recipient && recipient.isAI) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `You are ${recipient.name}, a helpful contact on WhatsApp. Respond to this message: "${text}"`,
          });

          const aiMessage = {
            id: Math.random().toString(36).substring(7),
            chatId,
            senderId: recipientId,
            text: response.text || "I'm not sure how to respond to that.",
            timestamp: new Date().toISOString(),
            status: "sent",
          };

          db.prepare("INSERT INTO messages (id, chatId, senderId, text, timestamp, status) VALUES (?, ?, ?, ?, ?, ?)")
            .run(aiMessage.id, aiMessage.chatId, aiMessage.senderId, aiMessage.text, aiMessage.timestamp, aiMessage.status);

          if (firestore) {
            await firestore.collection("chats").doc(chatId).collection("messages").doc(aiMessage.id).set({
              ...aiMessage,
              serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          io.to(chatId).emit("receive-message", aiMessage);
        } catch (error) {
          console.error("AI Error:", error);
        }
      }
    });

    socket.on("update-status", (data) => {
      const { userId, status, lastSeen } = data;
      db.prepare("UPDATE users SET status = ?, lastSeen = ? WHERE id = ?").run(status, lastSeen, userId);
      if (firestore) {
        firestore.collection("users").doc(userId).update({ status, lastSeen });
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
