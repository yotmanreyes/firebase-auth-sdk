const { db, admin } = require('../config/firebase');
const logger = require('../utils/logger');

class UserModel {
  static collection = db.collection('users');

  /**
   * Crea o actualiza un usuario en Firestore
   * @param {string} uid - ID del usuario
   * @param {Object} userData - Datos del usuario
   * @returns {Promise<Object>} Datos del usuario guardados
   */
  static async createOrUpdateUser(uid, userData) {
    try {
      const userRef = this.collection.doc(uid);
      const now = admin.firestore.FieldValue.serverTimestamp();
      
      const userDoc = await userRef.get();
      
      // Solo mantener los campos necesarios
      const { ...safeUserData } = userData;
      
      const data = {
        ...safeUserData,
        updatedAt: now,
        ...(userDoc.exists ? {} : { 
          createdAt: now,
          status: 'active',
        })
      };

      await userRef.set(data, { merge: true });
      return { id: uid, ...data };
    } catch (error) {
      logger.error('Error al crear/actualizar usuario:', error);
      throw new Error('Error al guardar los datos del usuario');
    }
  }

  /**
   * Obtiene un usuario por su ID
   * @param {string} uid - ID del usuario
   * @returns {Promise<Object>} Datos del usuario
   */
  static async getUserById(uid) {
    try {
      const userDoc = await this.collection.doc(uid).get();
      
      if (!userDoc.exists) {
        return null;
      }

      return { id: userDoc.id, ...userDoc.data() };
    } catch (error) {
      logger.error('Error al obtener usuario por ID:', error);
      throw new Error('Error al obtener los datos del usuario');
    }
  }

  /**
   * Actualiza campos específicos de un usuario
   * @param {string} uid - ID del usuario
   * @param {Object} updates - Campos a actualizar
   * @returns {Promise<Object>} Datos actualizados
   */
  static async updateUser(uid, updates) {
    try {
      const userRef = this.collection.doc(uid);
      
      // Eliminar campos protegidos
      const { id, ...safeUpdates } = updates;
      
      await userRef.update({
        ...safeUpdates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const updatedDoc = await userRef.get();
      return { id: updatedDoc.id, ...updatedDoc.data() };
    } catch (error) {
      logger.error('Error al actualizar usuario:', error);
      throw new Error('Error al actualizar los datos del usuario');
    }
  }

  /**
   * Busca usuarios según criterios
   * @param {Object} filters - Filtros de búsqueda
   * @param {string} [filters.role] - Rol del usuario
   * @param {string} [filters.status] - Estado del usuario
   * @param {string} [filters.search] - Término de búsqueda para nombre o email
   * @param {number} [limit=10] - Límite de resultados
   * @param {string} [startAfter] - ID del último documento para paginación
   * @returns {Promise<Array>} Lista de usuarios que coinciden con los criterios
   */
  static async searchUsers({ role, status, search } = {}, limit = 10, startAfter = null) {
    try {
      let query = this.collection;
      logger.debug('Initial query:', { role, status, search, limit, startAfter });
      
      // Aplicar filtros
      if (role) {
        query = query.where('role', '==', role);
        logger.debug('Added role filter:', role);
      }
      
      // Solo aplicar filtro de estado si se especifica explícitamente
      if (status) {
        query = query.where('status', '==', status);
        logger.debug('Added status filter:', status);
      }
      
      // Búsqueda por email o nombre
      if (search) {
        const searchTerm = search.toLowerCase();
        // Buscar en el email (que está en personalInfo.email) o en el nombre
        query = query.where('personalInfo.email', '>=', searchTerm)
                   .where('personalInfo.email', '<=', searchTerm + '\uf8ff');
        logger.debug('Added search filter:', searchTerm);
      }
      
      // Ordenar por fecha de creación descendente
      query = query.orderBy('createdAt', 'desc');
      
      // Paginación
      if (startAfter) {
        const lastDoc = await this.collection.doc(startAfter).get();
        query = query.startAfter(lastDoc);
      }
      
      // Mostrar la consulta final
      logger.debug('Query final:', {
        filters: { role, status, search },
        limit,
        startAfter
      });
      
      // Ejecutar consulta
      const snapshot = await query.limit(limit).get();
      logger.debug(`Encontrados ${snapshot.size} usuarios que coinciden con la consulta`);
      
      // Mapear resultados
      const users = [];
      snapshot.forEach(doc => {
        const userData = doc.data();
        logger.debug(`Usuario encontrado (${doc.id}):`, {
          id: doc.id,
          role: userData.role,
          status: userData.status,
          email: userData.email
        });
        
        // Eliminar campos sensibles
        const { password, tokens, ...safeUserData } = userData;
        users.push({
          id: doc.id,
          ...safeUserData
        });
      });
      
      logger.debug(`Devolviendo ${users.length} usuarios`);
      return users;
    } catch (error) {
      logger.error('Error al buscar usuarios:', error);
      throw new Error('Error al buscar usuarios');
    }
  }

  /**
   * Elimina un usuario (soft delete)
   * @param {string} uid - ID del usuario a eliminar
   * @returns {Promise<boolean>} true si se eliminó correctamente
   */
  static async deleteUser(uid) {
    try {
      const userRef = this.collection.doc(uid);
      const now = admin.firestore.FieldValue.serverTimestamp();
      
      // Soft delete: actualizar el estado en lugar de eliminar el documento
      await userRef.update({
        status: 'deleted',
        deletedAt: now,
        updatedAt: now
      });
      
      return true;
    } catch (error) {
      logger.error('Error al eliminar usuario:', error);
      throw new Error('Error al eliminar el usuario');
    }
  }
}

module.exports = UserModel;
