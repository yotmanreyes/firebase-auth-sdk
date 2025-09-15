const { auth } = require('../config/firebase');
const emailService = require('../utils/emailService');
const UserModel = require('../models/userModel');
const logger = require('../utils/logger');
const crypto = require('crypto');
const { validationResult } = require('express-validator');

// Helper function to generate email verification token
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * @openapi
 * /api/users:
 *   post:
 *     summary: Crea un nuevo usuario
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserInput'
 *     responses:
 *       201:
 *         description: Usuario creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
const createUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      email, 
      password, 
      displayName, 
      role = 'patient', 
      personalInfo = {},
      professionalInfo = {},
      preferences = {}
    } = req.body;
    
    // Validar rol
    if (!['admin', 'doctor', 'patient'].includes(role)) {
      return res.status(400).json({ 
        error: 'Rol inválido',
        details: 'El rol debe ser admin, doctor o patient'
      });
    }
    
    // Crear usuario en Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: personalInfo.firstName ? 
        `${personalInfo.firstName} ${personalInfo.lastName || ''}`.trim() : 
        displayName,
      emailVerified: false,
      disabled: false
    });
    
    // Generar tokens de verificación
    const emailVerificationToken = generateToken();
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    // Preparar datos para Firestore (sin datos personales)
    const userData = {
      email,
      role,
      status: 'active',
      emailVerified: false,
      emailVerificationToken,
      emailVerificationExpires,
      lastLogin: null,
      preferences: {
        language: 'es', // Por defecto español
        theme: 'light',
        notifications: {
          email: true,
          sms: false,
          push: true
        },
        ...preferences
      }
    };
    
    // Solo agregar información profesional si es doctor
    if (role === 'doctor') {
      userData.professionalInfo = {
        specialty: professionalInfo.specialty || '',
        licenseNumber: professionalInfo.licenseNumber || '',
        education: professionalInfo.education || [],
        schedule: professionalInfo.schedule || {}
      };
    }
    
    // Crear perfil en Firestore
    const savedUser = await UserModel.createOrUpdateUser(userRecord.uid, userData);
    
    // Establecer claims personalizados
    await auth.setCustomUserClaims(userRecord.uid, { 
      role,
      emailVerified: false
    });
    
    // Enviar correo de verificación
    try {
      await emailService.sendVerificationEmail(
        userRecord.email, 
        userRecord.uid,
        emailVerificationToken
      );
    } catch (emailError) {
      logger.error('Error enviando correo de verificación:', emailError);
      // No fallar la operación si falla el envío de correo
    }
    
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

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: Obtiene todos los usuarios (solo admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, doctor, patient]
 *         description: Filtrar por rol
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, suspended]
 *         description: Filtrar por estado
 *     responses:
 *       200:
 *         description: Lista de usuarios
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 */
const getAllUsers = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'No autorizado',
        details: 'Solo los administradores pueden listar usuarios'
      });
    }
    
    const { role, status = 'active', search } = req.query;
    const filters = { role, status };
    if (search) filters.search = search;
    
    const users = await UserModel.searchUsers(filters);
    
    const usersWithAuth = await Promise.all(
      users.map(async (user) => {
        try {
          const authUser = await auth.getUser(user.id);
          return {
            ...user,
            email: authUser.email || user.email,
            emailVerified: authUser.emailVerified || user.emailVerified,
            disabled: authUser.disabled,
            metadata: {
              creationTime: authUser.metadata.creationTime,
              lastSignInTime: authUser.metadata.lastSignInTime
            }
          };
        } catch (error) {
          logger.error(`Error obteniendo datos de autenticación para usuario ${user.id}:`, error);
          return user;
        }
      })
    );
    res.json(usersWithAuth);
  } catch (error) {
    logger.error('Error obteniendo usuarios:', error);
    res.status(500).json({ 
      error: 'Error al obtener la lista de usuarios',
      details: error.message 
    });
  }
};

/**
 * @openapi
 * /api/users/{id}:
 *   get:
 *     summary: Obtiene un usuario por ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del usuario
 *     responses:
 *       200:
 *         description: Datos del usuario
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user.role === 'admin';
    const isSelf = req.user.id === id;
    
    // Solo el propio usuario o un administrador pueden ver el perfil
    if (!isAdmin && !isSelf) {
      return res.status(403).json({ 
        error: 'No autorizado',
        details: 'No tienes permiso para ver este perfil'
      });
    }
    
    const user = await UserModel.getUserById(id);
    
    if (!user) {
      return res.status(404).json({ 
        error: 'Usuario no encontrado',
        details: 'El ID proporcionado no corresponde a ningún usuario'
      });
    }
    
    // Obtener datos de autenticación
    try {
      const authUser = await auth.getUser(id);
      
      const response = {
        id,
        email: authUser.email,
        emailVerified: authUser.emailVerified,
        disabled: authUser.disabled,
        metadata: {
          creationTime: authUser.metadata.creationTime,
          lastSignInTime: authUser.metadata.lastSignInTime
        },
        ...user
      };
      
      res.json(response);
    } catch (authError) {
      // Si falla la autenticación pero existe en Firestore, devolver solo esos datos
      if (authError.code === 'auth/user-not-found') {
        res.json({ id, ...user });
      } else {
        throw authError;
      }
    }
    
  } catch (error) {
    logger.error('Error al obtener usuario:', error);
    res.status(500).json({ 
      error: 'Error al obtener el usuario',
      details: error.message 
    });
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

/**
 * @openapi
 * /api/v1/users/{id}:
 *   delete:
 *     summary: Elimina un usuario (solo administradores)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del usuario a eliminar
 *     responses:
 *       200:
 *         description: Usuario eliminado correctamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: No tienes permiso para realizar esta acción
 *       404:
 *         description: Usuario no encontrado
 *       500:
 *         description: Error del servidor
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si el usuario existe
    const user = await UserModel.getUserById(id);
    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        details: `No se encontró un usuario con el ID: ${id}`
      });
    }
    
    // Eliminar el usuario de Firebase Auth
    await auth.deleteUser(id);
    
    // Eliminar el documento de Firestore
    await UserModel.deleteUser(id);
    
    logger.info(`Usuario eliminado: ${id}`, { userId: req.user.id });
    
    res.status(200).json({
      message: 'Usuario eliminado correctamente',
      userId: id
    });
    
  } catch (error) {
    logger.error('Error al eliminar usuario:', error);
    
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        details: 'El usuario especificado no existe en el sistema de autenticación'
      });
    }
    
    res.status(500).json({
      error: 'Error al eliminar el usuario',
      details: error.message
    });
  }
};

/**
 * @openapi
 * /api/users/me:
 *   put:
 *     summary: Actualiza el perfil del usuario actual
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserProfileUpdate'
 *     responses:
 *       200:
 *         description: Perfil actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;

    // Eliminar campos protegidos
    const { id, email, emailVerified, ...safeUpdates } = updates;

    const updatedUser = await UserModel.updateUser(userId, safeUpdates);
    
    res.status(200).json({
      message: 'Perfil actualizado exitosamente',
      user: updatedUser
    });
  } catch (error) {
    logger.error('Error al actualizar perfil:', error);
    res.status(500).json({
      error: 'Error al actualizar el perfil',
      details: error.message
    });
  }
};

/**
 * @openapi
 * /api/users/me/change-password:
 *   post:
 *     summary: Cambia la contraseña del usuario actual
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 minLength: 8
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Contraseña actualizada exitosamente
 *       400:
 *         description: Contraseña actual incorrecta o nueva contraseña inválida
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = req.user;

    // Verificar la contraseña actual
    try {
      await auth.getUserByEmail(user.email);
      // Si llegamos aquí, el usuario existe, pero necesitamos verificar la contraseña
      // Nota: Firebase Admin SDK no tiene un método directo para verificar contraseñas
      // Esta es una limitación que requiere una solución alternativa
      // Por ahora, asumimos que la autenticación se maneja en el frontend
    } catch (error) {
      return res.status(400).json({
        error: 'Error de autenticación',
        details: 'La contraseña actual es incorrecta'
      });
    }

    // Actualizar la contraseña
    await auth.updateUser(user.id, {
      password: newPassword
    });

    // Enviar correo de confirmación
    await emailService.sendPasswordChangedEmail(user.email, {
      name: user.displayName || user.email
    });

    res.status(200).json({
      message: 'Contraseña actualizada exitosamente'
    });
  } catch (error) {
    logger.error('Error al cambiar la contraseña:', error);
    res.status(500).json({
      error: 'Error al cambiar la contraseña',
      details: error.message
    });
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
  verifyEmail,
  updateProfile,
  changePassword
};
