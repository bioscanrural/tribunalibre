// models/User.js
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username:    { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:    { type: String, required: true, minlength: 6 },
  displayName: { type: String, maxlength: 60 },
  avatar:      { type: String, default: null },
  bio:         { type: String, maxlength: 200 },
  role:        { type: String, enum: ['user','moderator','admin'], default: 'user' },
  isVerified:  { type: Boolean, default: false },
  isBanned:    { type: Boolean, default: false },
  rep:         { type: Number, default: 0 },
  firebaseUid: { type: String, default: null }, // para Firebase Auth
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

UserSchema.methods.matchPassword = function(plain) {
  return bcrypt.compare(plain, this.password);
};

UserSchema.methods.toPublic = function() {
  const o = this.toObject();
  delete o.password;
  return o;
};

module.exports = mongoose.model('User', UserSchema);
