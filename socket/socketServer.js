import { Server } from 'socket.io';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';

let io;

export const setupSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:5173'],
      credentials: true,
    },
    path: '/socket.io',
    transports: ['websocket', 'polling']
  });

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  const { userId, role, classId } = socket.handshake.query;
  console.log('Connection params:', { userId, role, classId });

  let currentRoom = null;

  // Join user-specific room for notifications
  if (userId && userId !== '' && userId !== 'undefined') {
    socket.join(userId);
    console.log(`Socket ${socket.id} joined user room ${userId}`);
  }

  if (classId && classId !== '' && classId !== 'undefined') {
    socket.join(classId);
    currentRoom = classId;
    console.log(`Socket ${socket.id} auto-joined room ${classId} on connect`);
  }

  // Jab client explicitly join-room bhejta hai
  socket.on('join-room', async (data) => {
    const { classId: newClassId } = data;
    if (!newClassId || newClassId === '' || newClassId === 'undefined') return;

    // Purana room chhod do (agar ho to)
    if (currentRoom && currentRoom !== newClassId) {
      socket.leave(currentRoom);
      console.log(`Socket ${socket.id} left old room ${currentRoom}`);
    }

    socket.join(newClassId);
    currentRoom = newClassId;
    console.log(`Socket ${socket.id} joined room ${newClassId} via join-room`);

    try {
      const roomSockets = await io.in(newClassId).fetchSockets();
      const participants = roomSockets
        .filter((s) => s.id !== socket.id)
        .map((s) => ({
          socketId: s.id,
          userId: s.handshake.query.userId,
          role: s.handshake.query.role,
        }));

      socket.emit('room-participants', participants);
      socket.to(newClassId).emit('participant-joined', {
        socketId: socket.id,
        userId,
        role,
      });
    } catch (error) {
      console.error('Error sending room participants:', error);
    }
  });

  socket.on('webrtc-offer', ({ targetSocketId, offer }) => {
    if (!targetSocketId || !offer) return;
    io.to(targetSocketId).emit('webrtc-offer', {
      offer,
      fromSocketId: socket.id,
      fromUserId: userId,
      role,
    });
  });

  socket.on('webrtc-answer', ({ targetSocketId, answer }) => {
    if (!targetSocketId || !answer) return;
    io.to(targetSocketId).emit('webrtc-answer', {
      answer,
      fromSocketId: socket.id,
      fromUserId: userId,
      role,
    });
  });

  socket.on('webrtc-ice-candidate', ({ targetSocketId, candidate }) => {
    if (!targetSocketId || !candidate) return;
    io.to(targetSocketId).emit('webrtc-ice-candidate', {
      candidate,
      fromSocketId: socket.id,
      fromUserId: userId,
      role,
    });
  });

  socket.on('webrtc-request-offer', ({ targetSocketId }) => {
    if (!targetSocketId) return;
    io.to(targetSocketId).emit('webrtc-request-offer', {
      fromSocketId: socket.id,
      fromUserId: userId,
      role,
    });
  });

  socket.on('chat-message', async (data) => {
    console.log('Chat message received:', data);
    
    const { message, conversationId, tempId, senderId, classId: msgClassId } = data;
    const actualSenderId = socket.handshake.query.userId;

    // Verify sender
    if (senderId !== actualSenderId) {
      socket.emit('message-error', { error: 'Unauthorized', tempId });
      return;
    }

    try {
      // Find conversation
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        socket.emit('message-error', { error: 'Conversation not found', tempId });
        return;
      }

      // Determine receiverId
      let receiverId;
      if (conversation.studentId.toString() === senderId) {
        receiverId = conversation.ulmaId;
      } else if (conversation.ulmaId.toString() === senderId) {
        receiverId = conversation.studentId;
      } else {
        socket.emit('message-error', { error: 'Not part of conversation', tempId });
        return;
      }

      // Save message to DB
      const newMessage = new Message({
        conversationId,
        courseId: conversation.courseId.toString(),
        senderId,
        receiverId,
        message
      });
      await newMessage.save();

      // Update conversation
      await Conversation.findByIdAndUpdate(conversationId, { 
        lastMessage: message, 
        lastUpdated: Date.now() 
      });

      // Room decide karo: message se ya connection se
      const room = msgClassId || socket.handshake.query.classId || currentRoom;

      if (!room || room === 'undefined' || room === '') {
        console.log('No room found for message broadcast');
        socket.emit('message-error', { error: 'No room/class ID available', tempId });
        return;
      }

      console.log(`Broadcasting message to room: ${room}`);

      io.to(room).emit('chat-message', {
        _id: newMessage._id,
        conversationId,
        senderId,
        receiverId,
        message,
        createdAt: newMessage.createdAt,
        isRead: false,
        tempId
      });
    } catch (err) {
      console.error('Error saving message:', err);
      socket.emit('message-error', { error: 'Failed to save message', tempId });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (currentRoom) {
      socket.to(currentRoom).emit('participant-left', {
        socketId: socket.id,
        userId,
        role,
      });
    }
    if (currentRoom) {
      socket.leave(currentRoom);
    }
  });
});

  return io;
};

export { io };