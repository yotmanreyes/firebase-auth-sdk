const express = require('express');
const listEndpoints = require('express-list-endpoints');

// Crear una nueva instancia de Express para listar rutas
const app = express();

// Importar y configurar las rutas
const userRoutes = require('./userRoutes');
app.use('/api', userRoutes);

// Ruta de verificación de email (debe estar antes de las rutas de API para evitar conflictos)
const { verifyEmail } = require('../controllers/userController');
app.get('/api/auth/verify-email', verifyEmail);

// Función para obtener las rutas
function getRoutes() {
  return listEndpoints(app);
}

// Función para imprimir las rutas en consola
function printRoutes() {
  try {
    const endpoints = getRoutes();
    if (!endpoints || endpoints.length === 0) {
      console.warn('\n⚠️  No se encontraron rutas registradas.\n');
      return;
    }
    
    console.log('\n=== 🔄 Rutas Disponibles ===');
    
    // Separar las rutas de perfil
    const userRoutes = [];
    const profileRoutes = [];
    const otherRoutes = [];
    
    endpoints.forEach(route => {
      if (route.path.includes('/profile')) {
        profileRoutes.push(route);
      } else if (route.path.includes('/users')) {
        userRoutes.push(route);
      } else {
        otherRoutes.push(route);
      }
    });
    
    // Mostrar rutas de usuarios
    if (userRoutes.length > 0) {
      console.log('\n📂 Usuarios');
      userRoutes.forEach(route => {
        const method = route.methods.join(', ');
        console.log(`🔹 ${method.padEnd(10)} ${route.path}`);
      });
    }
    
    // Mostrar rutas de perfil
    if (profileRoutes.length > 0) {
      console.log('\n📂 Perfil');
      profileRoutes.forEach(route => {
        const method = route.methods.join(', ');
        console.log(`🔹 ${method.padEnd(10)} ${route.path}`);
      });
    }
    
    // Mostrar otras rutas si las hay
    if (otherRoutes.length > 0) {
      console.log('\n📂 Otros');
      otherRoutes.forEach(route => {
        const method = route.methods.join(', ');
        console.log(`🔹 ${method.padEnd(10)} ${route.path}`);
      });
    }
    
    console.log(`\n✅ Total de rutas: ${endpoints.length}`);
    console.log('==============================\n');
  } catch (error) {
    console.error('\n❌ Error al obtener las rutas:', error.message);
    console.log('Asegúrate de que todas las dependencias estén correctamente configuradas.\n');
  }
}

// Ejecutar solo si se ejecuta directamente este archivo
if (require.main === module) {
  printRoutes();
}
