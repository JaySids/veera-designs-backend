const mongoose = require('mongoose');

const passwordSchema = new mongoose.Schema({
    name: String,
    password: String
}, { collection: 'veera-designs', strict: false });

module.exports = mongoose.model('Password', passwordSchema);
