const { v4: uuidv4 } = require('uuid');
const Room = require('../models/Room');

// @desc  Create a new whiteboard room
// @route POST /api/rooms/create
exports.createRoom = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Room name is required' });

    const roomId = uuidv4().slice(0, 8).toUpperCase();
    const room = await Room.create({
      roomId,
      name,
      host: req.user._id,
      participants: [req.user._id],
    });
    res.status(201).json(room);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Join an existing room
// @route POST /api/rooms/join/:roomId
exports.joinRoom = async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (!room.isActive)
      return res.status(400).json({ message: 'Room is no longer active' });

    // Add participant if not already in the list
    if (!room.participants.includes(req.user._id)) {
      room.participants.push(req.user._id);
      await room.save();
    }
    res.json(room);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Get room details
// @route GET /api/rooms/:roomId
exports.getRoom = async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId })
      .populate('host', 'name email')
      .populate('participants', 'name email');
    if (!room) return res.status(404).json({ message: 'Room not found' });
    res.json(room);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Persist canvas state to DB
// @route PUT /api/rooms/:roomId/canvas
exports.saveCanvasState = async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ message: 'Room not found' });

    room.canvasState = req.body.canvasState;
    await room.save();
    res.json({ message: 'Canvas state saved' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Get all rooms created by or joined by the user
// @route GET /api/rooms
exports.getUserRooms = async (req, res) => {
  try {
    const rooms = await Room.find({
      participants: req.user._id,
    }).populate('host', 'name email');
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
