const User = require("./models/User");
const { verifyAuthToken } = require("./middleware/authMiddleware");

let ioInstance = null;

function initSocket(httpServer) {
  const { Server } = require("socket.io");
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim()) : "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error("Unauthorized"));
      const payload = verifyAuthToken(token);
      const user = await User.findOne({ firebaseUID: payload.uid, banned: { $ne: true } }).lean();
      if (!user) return next(new Error("Unauthorized"));
      socket.userUid = user.firebaseUID;
      socket.userRole = user.role;
      socket.isAdmin = !!user.isAdmin;
      next();
    } catch (err) {
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
      if (parts.length !== 2 || !parts.includes(socket.userUid)) return;
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
