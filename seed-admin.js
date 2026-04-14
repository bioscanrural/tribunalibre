// scripts/seed-admin.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User     = require('../models/User');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tribunalibre');
  console.log('✅ MongoDB conectado');
  const exists = await User.findOne({ username: 'admin' });
  if (exists) { console.log('Admin ya existe.'); process.exit(0); }
  await User.create({
    username:    'admin',
    email:       'admin@tribunalibre.com.ar',
    password:    'Admin2025!',
    displayName: 'Administrador',
    role:        'admin',
    isVerified:  true,
  });
  console.log('✅ Usuario admin creado:');
  console.log('   Email:    admin@tribunalibre.com.ar');
  console.log('   Password: Admin2025!');
  console.log('   ⚠️  Cambiá la contraseña en producción.');
  process.exit(0);
}
seed().catch(e => { console.error(e); process.exit(1); });
