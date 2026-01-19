const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    id: String,
    name: String,
    category: String,
    price: String,
    image: String,
    tag: String,
    cloudinaryId: String
});

module.exports = mongoose.model('Product', productSchema);
