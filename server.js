const express = require('express');
const path = require('path');

const app = express();
const PORT = 1001;
const HOST = '0.0.0.0';

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
    console.log('DeepSeek V4 Chat: http://localhost:' + PORT);
    const os = require('os');
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                console.log('Network: http://' + iface.address + ':' + PORT);
            }
        }
    }
});