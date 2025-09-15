const { auth, db } = require('../config/firebase');
const emailService = require('../utils/emailService');
const crypto = require('crypto');

// Helper function to generate email verification token
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const createUser = async (req, res) => {
  try {
    const { email, password, displayName, role, additionalData = {} } = req.body;
    
    // Validar rol
    if (!['admin', 'doctor', 'patient'].includes(role)) {
      return res.status(400).json({ error: 'Rol inválido. Debe ser admin, doctor o patient' });
    }
    
    // Crear usuario en Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: false,
      disabled: false
    });
    
    // Establecer claims personalizados (incluyendo el rol)
    await auth.setCustomUserClaims(userRecord.uid, { 
      role,
      ...additionalData.claims || {}
    });
    
    // Obtener el token de acceso actualizado con los claims
    const user = await auth.getUser(userRecord.uid);
    
    // Generate email verification token
    const emailVerificationToken = generateToken();
    const emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Create user profile in Firestore
    const userProfile = {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName || '',
      role,
      emailVerified: userRecord.emailVerified,
      disabled: userRecord.disabled,
      emailVerificationToken,
      emailVerificationExpires,
      metadata: {
        creationTime: userRecord.metadata.creationTime,
        lastSignInTime: userRecord.metadata.lastSignInTime
      },
      ...additionalData
    };

    // Save user profile to Firestore
    await db.collection('users').doc(userRecord.uid).set(userProfile);
    
    // Send welcome email and verification email
    try {
      await emailService.sendWelcomeEmail({
        email: userRecord.email,
        displayName: userRecord.displayName || 'User'
      });
      
      await emailService.sendConfirmationEmail({
        email: userRecord.email,
        displayName: userRecord.displayName || 'User'
      }, emailVerificationToken);
    } catch (emailError) {
      console.error('Error sending welcome/verification email:', emailError);
      // Don't fail the request if email sending fails
    }
    
    // Opcional: Guardar en Firestore si es necesario
    // await db.collection('users').doc(userRecord.uid).set(userProfile);
    
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
    // Obtener la lista de usuarios de Firebase Auth
    const listUsersResult = await auth.listUsers(1000); // 1000 es el número máximo de usuarios a obtener
    const users = listUsersResult.users.map(userRecord => ({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName || '',
      emailVerified: userRecord.emailVerified,
      disabled: userRecord.disabled,
      metadata: {
        creationTime: userRecord.metadata.creationTime,
        lastSignInTime: userRecord.metadata.lastSignInTime
      },
      // Agregar claims personalizados si existen
      customClaims: userRecord.customClaims || {}
    }));
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Error al obtener la lista de usuarios' });
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

// Request password reset
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if user exists
    const user = await auth.getUserByEmail(email).catch(() => null);
    if (!user) {
      // For security, don't reveal if the email exists or not
      return res.status(200).json({ 
        message: 'If an account with that email exists, a password reset link has been sent' 
      });
    }
    
    // Generate reset token
    const resetToken = generateToken();
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour
    
    // Save reset token to user's document
    await db.collection('users').doc(user.uid).update({
      resetToken,
      resetTokenExpiry
    });
    
    // Send password reset email
    try {
      await emailService.sendPasswordResetEmail(
        { email: user.email, displayName: user.displayName || 'User' },
        resetToken
      );
    } catch (emailError) {
      console.error('Error sending password reset email:', emailError);
      return res.status(500).json({ error: 'Error sending password reset email' });
    }
    
    res.status(200).json({ 
      message: 'If an account with that email exists, a password reset link has been sent'
    });
    
  } catch (error) {
    console.error('Error in requestPasswordReset:', error);
    res.status(500).json({ error: 'Error processing password reset request' });
  }
};

// Reset password with token
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    
    // Find user with this reset token
    const usersSnapshot = await db.collection('users')
      .where('resetToken', '==', token)
      .where('resetTokenExpiry', '>', Date.now())
      .limit(1)
      .get();
    
    if (usersSnapshot.empty) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data();
    
    // Update password in Firebase Auth
    await auth.updateUser(userData.uid, {
      password: newPassword
    });
    
    // Clear the reset token
    await userDoc.ref.update({
      resetToken: null,
      resetTokenExpiry: null
    });
    
    res.status(200).json({ message: 'Password has been reset successfully' });
    
  } catch (error) {
    console.error('Error in resetPassword:', error);
    res.status(500).json({ error: 'Error resetting password' });
  }
};

// Verify email with token
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }
    
    // Find user with this verification token
    const usersSnapshot = await db.collection('users')
      .where('emailVerificationToken', '==', token)
      .where('emailVerificationExpires', '>', Date.now())
      .limit(1)
      .get();
    
    if (usersSnapshot.empty) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }
    
    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data();
    
    // Mark email as verified in Firebase Auth
    await auth.updateUser(userData.uid, {
      emailVerified: true
    });
    
    // Update user document
    await userDoc.ref.update({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null
    });
    
    // Redirect to success page or return success response
    res.status(200).json({ message: 'Email verified successfully' });
    
  } catch (error) {
    console.error('Error in verifyEmail:', error);
    res.status(500).json({ error: 'Error verifying email' });
  }
};

module.exports = {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getCurrentUser,
  requestPasswordReset,
  resetPassword,
  verifyEmail
};
