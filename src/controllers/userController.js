const { auth, db } = require('../config/firebase');

const createUser = async (req, res) => {
  try {
    const { email, password, displayName, role, additionalData = {} } = req.body;
    
    if (!['admin', 'doctor', 'patient'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin, doctor, or patient' });
    }
    
    const userRecord = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: false,
      disabled: false
    });
    
    await auth.setCustomUserClaims(userRecord.uid, { role });
    
    const userProfile = {
      uid: userRecord.uid,
      email,
      displayName,
      role,
      createdAt: db.FieldValue.serverTimestamp(),
      ...additionalData
    };
    
    await db.collection('users').doc(userRecord.uid).set(userProfile);
    
    res.status(201).json({ 
      message: `${role} user created successfully`,
      uid: userRecord.uid,
      role
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(400).json({ error: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    const users = [];
    
    usersSnapshot.forEach(doc => {
      users.push({ id: doc.id, ...doc.data() });
    });
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getUserById = async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.params.id).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ id: userDoc.id, ...userDoc.data() });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, displayName, additionalData, disabled } = req.body;
    
    await auth.updateUser(id, {
      email,
      displayName,
      disabled: disabled !== undefined ? disabled : false
    });
    
    const updateData = { 
      email,
      displayName,
      updatedAt: db.FieldValue.serverTimestamp(),
      ...additionalData
    };
    
    await db.collection('users').doc(id).update(updateData);
    
    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(400).json({ error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    await auth.deleteUser(id);
    await db.collection('users').doc(id).delete();
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(400).json({ error: error.message });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ id: userDoc.id, ...userDoc.data() });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getCurrentUser
};
