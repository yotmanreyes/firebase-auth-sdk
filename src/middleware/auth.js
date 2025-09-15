const { auth } = require('../config/firebase');
const UserModel = require('../models/userModel');
const logger = require('../utils/logger');

/**
 * Middleware para verificar si el usuario está autenticado
 * Extrae el token JWT del encabezado de autorización y verifica su validez
 * Si es válido, adjunta los datos del usuario a req.user
 */
const isAuthenticated = async (req, res, next) => {
  try {
    // Obtener el token del encabezado de autorización
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Intento de acceso sin token de autenticación');
      return res.status(401).json({ 
        success: false,
        error: 'No autorizado',
        message: 'Se requiere un token de autenticación',
        code: 'MISSING_AUTH_TOKEN'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      logger.warn('Token de autenticación vacío');
      return res.status(401).json({
        success: false,
        error: 'No autorizado',
        message: 'El token de autenticación está vacío',
        code: 'EMPTY_AUTH_TOKEN'
      });
    }
    
    // Verificar el token con Firebase Auth
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (authError) {
      logger.error('Error al verificar el token:', authError);
      
      if (authError.code === 'auth/id-token-expired') {
        return res.status(401).json({
          success: false,
          error: 'Sesión expirada',
          message: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      if (authError.code === 'auth/argument-error' || authError.code === 'auth/invalid-id-token') {
        return res.status(400).json({
          success: false,
          error: 'Token inválido',
          message: 'El formato del token no es válido o está corrupto',
          code: 'INVALID_TOKEN'
        });
      }
      
      throw authError;
    }
    
    // Obtener los datos del usuario desde Firestore
    let user;
    try {
      user = await UserModel.getUserById(decodedToken.uid);
    } catch (dbError) {
      logger.error('Error al obtener datos del usuario:', dbError);
      return res.status(500).json({
        success: false,
        error: 'Error del servidor',
        message: 'No se pudo recuperar la información del usuario',
        code: 'USER_FETCH_ERROR'
      });
    }
    
    if (!user) {
      logger.warn(`Usuario no encontrado: ${decodedToken.uid}`);
      return res.status(404).json({ 
        success: false,
        error: 'Usuario no encontrado',
        message: 'El perfil de usuario no existe en la base de datos',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Verificar si el usuario está activo
    if (user && user.status !== 'active') {
      logger.warn(`Intento de acceso de cuenta inactiva: ${user.email}`);
      return res.status(403).json({
        success: false,
        error: 'Cuenta inactiva',
        message: 'Tu cuenta ha sido desactivada o suspendida',
        code: 'ACCOUNT_INACTIVE',
        status: user.status
      });
    }
    
    // Adjuntar datos del usuario a la solicitud
    req.user = {
      id: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified || false,
      ...user,
    };
    
    logger.info(`Usuario autenticado: ${req.user.email} (${req.user.id})`);
    next();
  } catch (error) {
    logger.error('Error en el middleware de autenticación:', error);
    
    // Manejo de errores inesperados
    res.status(500).json({
      success: false,
      error: 'Error de autenticación',
      message: 'Ocurrió un error al procesar la autenticación',
      code: 'AUTH_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Middleware para verificar si el usuario es administrador
 * Debe usarse después de isAuthenticated
 */
const isAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'No autenticado',
        details: 'Se requiere autenticación para acceder a este recurso'
      });
    }

    console.log(req.user);
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Acceso denegado',
        details: 'Se requieren privilegios de administrador para acceder a este recurso'
      });
    }
    
    next();
  } catch (error) {
    logger.error('Error en verificación de administrador:', error);
    res.status(500).json({
      error: 'Error del servidor',
      details: 'Ocurrió un error al verificar los permisos de administrador'
    });
  }
};

/**
 * Middleware para verificar roles específicos
 * @param {Array} roles - Lista de roles permitidos
 * @returns {Function} Middleware de verificación de roles
 */
const hasRole = (roles = []) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'No autenticado',
          details: 'Se requiere autenticación para acceder a este recurso'
        });
      }
      
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          error: 'Acceso denegado',
          details: 'No tienes los permisos necesarios para acceder a este recurso'
        });
      }
      
      next();
    } catch (error) {
      logger.error('Error en verificación de roles:', error);
      res.status(500).json({
        error: 'Error del servidor',
        details: 'Ocurrió un error al verificar los permisos de usuario'
      });
    }
  };
};

/**
 * Middleware para verificar si el usuario es el propietario del recurso o es administrador
 * @param {string} idParam - Nombre del parámetro que contiene el ID del recurso
 * @returns {Function} Middleware de verificación de propiedad
 */
const isOwnerOrAdmin = (idParam = 'id') => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'No autenticado',
          details: 'Se requiere autenticación para acceder a este recurso'
        });
      }
      
      // Si es administrador, permitir acceso
      if (req.user.role === 'admin') {
        return next();
      }
      
      // Verificar si el ID del recurso coincide con el ID del usuario
      const resourceId = req.params[idParam];
      if (resourceId !== req.user.id) {
        return res.status(403).json({
          error: 'Acceso denegado',
          details: 'Solo puedes acceder a tus propios recursos'
        });
      }
      
      next();
    } catch (error) {
      logger.error('Error en verificación de propiedad:', error);
      res.status(500).json({
        error: 'Error del servidor',
        details: 'Ocurrió un error al verificar los permisos de propiedad'
      });
    }
  };
};

module.exports = {
  isAuthenticated,
  isAdmin,
  hasRole,
  isOwnerOrAdmin
};
