const jwt = require("jsonwebtoken");

let ioInstance = null;

function initSocket(httpServer) {
  const { Server } = require("socket.io");
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*",
      methods: ["GET", "POST"],
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      const secret = process.env.JWT_SECRET;
      if (!token || !secret) return next(new Error("Unauthorized"));
      const payload = jwt.verify(token, secret);
      socket.userUid = payload.uid;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    if (!socket.userUid) return socket.disconnect(true);
    socket.join(`user:${socket.userUid}`);

    socket.on("typing", (payload) => {
      const { conversationId, typing } = payload || {};
      if (!conversationId) return;
      const parts = String(conversationId).split("__");
      const other = parts.find((p) => p !== socket.userUid);
      if (other) {
        io.to(`user:${other}`).emit("chat:typing", {
          conversationId,
          from: socket.userUid,
          typing: !!typing,
        });
      }
    });
  });

  ioInstance = io;
  return io;
}

function getIo() {
  return ioInstance;
}

module.exports = { initSocket, getIo };
