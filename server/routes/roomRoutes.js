const express = require('express');
const router = express.Router();
const {
  createRoom,
  joinRoom,
  getRoom,
  saveCanvasState,
  getUserRooms,
} = require('../controllers/roomController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect); // All room routes are protected

router.get('/', getUserRooms);
router.post('/create', createRoom);
router.post('/join/:roomId', joinRoom);
router.get('/:roomId', getRoom);
router.put('/:roomId/canvas', saveCanvasState);

module.exports = router;
