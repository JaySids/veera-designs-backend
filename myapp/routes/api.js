const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const Product = require('../models/Product');
const Password = require('../models/Password');

// Multer Configuration
const upload = multer({ dest: 'uploads/' });

// Auth Middleware
const adminAuth = (req, res, next) => {
    console.log('--- Auth Check ---');
    // console.log('Cookies:', req.cookies); // Debug only
    console.log('Signed Cookies:', req.signedCookies);

    if (req.signedCookies && req.signedCookies.admin_session === 'true') {
        console.log('Auth Success');
        next();
    } else {
        console.log('Auth Failed');
        res.status(401).json({ error: 'Unauthorized: Admin access required' });
    }
};

/* GET check-auth. */
router.get('/check-auth', adminAuth, (req, res) => {
    res.json({ authenticated: true });
});

/* POST login. */
router.post('/login', async (req, res) => {
    const { password } = req.body;
    try {
        console.log('--- Login Attempt ---');
        const user = await Password.findOne({
            '_id.name': 'veeraUser',
            '_id.password': password
        });

        if (user) {
            console.log('User found!');
            // Production Cookie Settings
            const isProduction = process.env.NODE_ENV === 'production';

            res.cookie('admin_session', 'true', {
                httpOnly: true,
                signed: true,
                maxAge: 24 * 60 * 60 * 1000, // 1 day
                sameSite: isProduction ? 'none' : 'lax', // 'none' required for cross-site (Vercel -> Render)
                secure: isProduction // 'true' required for sameSite: 'none'
            });

            res.json({ success: true });
        } else {
            console.log('User NOT found.');
            // Dev backdoor check
            if (password === 'admin123' && !isProduction) {
                res.json({ success: true });
                return;
            }
            res.status(401).json({ success: false, message: 'Invalid Password' });
        }
    } catch (error) {
        console.error("Login route error:", error);
        res.status(500).json({ error: error.message });
    }
});

/* POST logout */
router.post('/logout', (req, res) => {
    const isProduction = process.env.NODE_ENV === 'production';
    res.clearCookie('admin_session', {
        httpOnly: true,
        signed: true,
        sameSite: isProduction ? 'none' : 'lax',
        secure: isProduction
    });
    res.json({ success: true, message: 'Logged out successfully' });
});

/* GET products - From Cloudinary */
router.get('/products', async (req, res) => {
    try {
        const result = await cloudinary.search
            .expression('tags=veera-product')
            .with_field('context')
            .sort_by('created_at', 'desc')
            .max_results(50)
            .execute();

        const products = result.resources.map(resource => {
            const context = resource.context || {};
            return {
                id: resource.public_id,
                image: resource.secure_url,
                name: context.name || resource.filename,
                category: context.category || '',
                price: context.price || '',
                tag: context.tag || ''
            };
        });
        res.json(products);
    } catch (error) {
        console.error("Cloudinary Fetch Error:", error);
        res.status(500).json({ error: 'Failed' });
    }
});

/* POST upload product */
router.post('/products', adminAuth, upload.single('image'), async (req, res) => {
    try {
        const file = req.file;
        const { name, category, price, tag } = req.body;

        if (!file) return res.status(400).json({ error: 'No image' });

        const publicId = uuidv4();
        const cloudinaryResult = await cloudinary.uploader.upload(file.path, {
            public_id: publicId,
            tags: ['veera-product'],
            context: { name, category, price, tag }
        });

        fs.unlinkSync(file.path);

        const newProduct = new Product({
            id: cloudinaryResult.public_id,
            name,
            category,
            price,
            image: cloudinaryResult.secure_url,
            tag,
            cloudinaryId: cloudinaryResult.public_id
        });

        console.log('--- Saving to MongoDB ---');
        console.log('Database:', mongoose.connection.name);
        console.log('Collection:', Product.collection.name);

        await newProduct.save();

        res.json({
            success: true,
            product: {
                id: cloudinaryResult.public_id,
                name,
                category,
                price,
                image: cloudinaryResult.secure_url,
                tag
            }
        });

    } catch (error) {
        console.error("Upload Error:", error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: error.message });
    }
});

/* DELETE product */
router.delete('/delete/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await cloudinary.uploader.destroy(id);
        await Product.deleteOne({ id: id });
        res.json({ success: true });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ error: error.message });
    }
});

/* POST seed password (Internal) */
router.post('/seed-password', async (req, res) => {
    try {
        await Password.deleteOne({ name: 'veera-design' });
        const { password } = req.body;
        const newEntry = new Password({ name: 'veera-design', password });
        await newEntry.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
