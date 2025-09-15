const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Middleware para validar los resultados de las validaciones de express-validator
 * @param {Object} req - Objeto de solicitud de Express
 * @param {Object} res - Objeto de respuesta de Express
 * @param {Function} next - Función para pasar al siguiente middleware
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Error de validación:', {
      path: req.path,
      method: req.method,
      errors: errors.array(),
      body: req.body,
      params: req.params,
      query: req.query
    });
    
    return res.status(400).json({
      error: 'Error de validación',
      details: errors.array().map(err => ({
        param: err.param,
        message: err.msg,
        location: err.location,
        value: err.value
      }))
    });
  }
  
  next();
};

/**
 * Middleware para validar el formato de los ObjectId de MongoDB
 * @param {string} paramName - Nombre del parámetro que contiene el ID
 * @returns {Function} Middleware de validación
 */
const validateObjectId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];
    
    // Verificar que el ID tenga un formato válido (24 caracteres hexadecimales)
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      logger.warn(`ID inválido: ${id}`, {
        path: req.path,
        method: req.method,
        paramName,
        id
      });
      
      return res.status(400).json({
        error: 'ID inválido',
        details: `El formato del ID en el parámetro '${paramName}' no es válido`
      });
    }
    
    next();
  };
};

/**
 * Middleware para validar que el body no esté vacío
 * @param {Object} req - Objeto de solicitud de Express
 * @param {Object} res - Objeto de respuesta de Express
 * @param {Function} next - Función para pasar al siguiente middleware
 */
const validateBodyNotEmpty = (req, res, next) => {
  if (Object.keys(req.body).length === 0) {
    logger.warn('Cuerpo de la solicitud vacío', {
      path: req.path,
      method: req.method
    });
    
    return res.status(400).json({
      error: 'Cuerpo de la solicitud vacío',
      details: 'Se esperaba un cuerpo de solicitud con datos'
    });
  }
  
  next();
};

/**
 * Middleware para validar parámetros de consulta
 * @param {Array} validParams - Lista de parámetros de consulta permitidos
 * @returns {Function} Middleware de validación
 */
const validateQueryParams = (validParams) => {
  return (req, res, next) => {
    const invalidParams = Object.keys(req.query).filter(
      param => !validParams.includes(param)
    );
    
    if (invalidParams.length > 0) {
      logger.warn('Parámetros de consulta no válidos', {
        path: req.path,
        method: req.method,
        invalidParams,
        validParams
      });
      
      return res.status(400).json({
        error: 'Parámetros de consulta no válidos',
        details: `Los siguientes parámetros no son permitidos: ${invalidParams.join(', ')}`,
        allowedParams: validParams
      });
    }
    
    next();
  };
};

/**
 * Middleware para validar que los campos requeridos estén presentes en el body
 * @param {Array} requiredFields - Lista de campos requeridos
 * @returns {Function} Middleware de validación
 */
const validateRequiredFields = (requiredFields) => {
  return (req, res, next) => {
    const missingFields = requiredFields.filter(
      field => !(field in req.body)
    );
    
    if (missingFields.length > 0) {
      logger.warn('Campos requeridos faltantes', {
        path: req.path,
        method: req.method,
        missingFields,
        body: req.body
      });
      
      return res.status(400).json({
        error: 'Campos requeridos faltantes',
        details: `Los siguientes campos son requeridos: ${missingFields.join(', ')}`
      });
    }
    
    next();
  };
};

module.exports = {
  validate,
  validateObjectId,
  validateBodyNotEmpty,
  validateQueryParams,
  validateRequiredFields
};
