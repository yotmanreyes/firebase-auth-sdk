const express = require('express');
const router = express.Router();
const { isAdmin, authenticate } = require('../middleware/auth');
const {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getCurrentUser
} = require('../controllers/userController');

// Admin routes
router.post('/users', isAdmin, createUser);
router.get('/users', isAdmin, getAllUsers);
router.get('/users/:id', isAdmin, getUserById);
router.put('/users/:id', isAdmin, updateUser);
router.delete('/users/:id', isAdmin, deleteUser);

// Protected routes
router.get('/profile', authenticate, getCurrentUser);

module.exports = router;
