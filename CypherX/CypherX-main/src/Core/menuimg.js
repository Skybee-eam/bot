const fs = require('fs');
const axios = require('axios');
const path = require('path');

const localImages = [
    fs.readFileSync(path.join(__dirname, '../Media/Images/Xploader1.jpg')),
    fs.readFileSync(path.join(__dirname, '../Media/Images/Xploader2.jpg')),
    fs.readFileSync(path.join(__dirname, '../Media/Images/Xploader3.jpg')),
    fs.readFileSync(path.join(__dirname, '../Media/Images/Xploader4.jpg')),
    fs.readFileSync(path.join(__dirname, '../Media/Images/Xploader5.jpg'))
];

async function getBuffer(url, options = {}) {
    try {
        const res = await axios.get(url, {
            headers: {
                'DNT': 1,
                'Upgrade-Insecure-Requests': 1
            },
            ...options,
            responseType: 'arraybuffer'
        });
        return res.data;
    } catch (err) {
        console.error("Failed to fetch buffer from URL:", url);
        return null;
    }
}

const IGNORED_URLS = [
    "https://example.com/image1.jpg",
    "https://example.com/image2.png"
];

async function getMenuImage() {
    let imageUrlToFetch = null;

    if (typeof global.menuimage === 'string') {
        global.menuimage = global.menuimage.split(',').map(url => url.trim());
    }

    if (Array.isArray(global.menuimage)) {
        const validUrls = global.menuimage.filter(url => !IGNORED_URLS.includes(url));

        if (validUrls.length > 0) {
            imageUrlToFetch = validUrls[Math.floor(Math.random() * validUrls.length)];
        }
    }

    if (imageUrlToFetch) {
        const buffer = await getBuffer(imageUrlToFetch);
        if (buffer) return buffer;
    }

    return localImages[Math.floor(Math.random() * localImages.length)];
}

module.exports = { getMenuImage };