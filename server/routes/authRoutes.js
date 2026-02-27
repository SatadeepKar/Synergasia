const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const { register, login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Email/password auth
router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);

// Google OAuth — Step 1: redirect user to Google
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google OAuth — Step 2: Google redirects back here
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login', session: false }),
  (req, res) => {
    // Generate JWT for the authenticated user
    const token = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    const userData = {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      isAdmin: req.user.isAdmin,
      token,
    };

    // Redirect to frontend with user data encoded in the URL
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(
      `${clientUrl}/auth/google/callback?data=${encodeURIComponent(
        JSON.stringify(userData)
      )}`
    );
  }
);

module.exports = router;
