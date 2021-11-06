const { Client, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatter } = require('./helpers/formatter');
const fileUpload = require('express-fileupload');
const port = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
    debug: true
}));

const SESSION_FILE_PATH = './whatsapp-session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
}

app.get('/', (req, res) => {
    res.sendFile('index.html', { root: __dirname });
});

const client = new Client({ 
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // <- this one doesn't works in Windows
            '--disable-gpu'
          ], 
    }, 
    session: sessionCfg });

client.on('message', msg => {
    if (msg.body == '!ping') {
        msg.reply('pong');
    }
});

client.initialize();

//socket io
io.on('connection', function(socket) {
    socket.emit('message', 'Connecting...');

    client.on('qr', (qr) => {
        console.log('QR RECEIVED', qr);
        qrcode.toDataURL(qr, (err, url) => {
            socket.emit('qr', url);
            socket.emit('message', 'Qr Code received, scan please!');
        });
    });

    client.on('ready', () => {
        socket.emit('ready', 'Whatsapp is Ready!');
        socket.emit('message', 'Whatsapp is Ready!');
    });

    client.on('authenticated', (session) => {
        socket.emit('authenticated', 'Whatsapp is Authenticated!');
        socket.emit('message', 'Whatsapp is Authenticated!');
        console.log('AUTHENTICATED', session);
        sessionCfg=session;
        fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
            if (err) {
                console.error(err);
            }
        });
    });

    client.on('auth_failure', function(session) {
        socket.emit('message', 'Auth failure, restarting...');
      });
    
      client.on('disconnected', (reason) => {
        socket.emit('message', 'Whatsapp is disconnected!');
        fs.unlinkSync(SESSION_FILE_PATH, function(err) {
            if(err) return console.log(err);
            console.log('Session file deleted!');
        });
        client.destroy();
        client.initialize();
});

const checkRegisteredNumber = async function(number) {
    const isRegistered = await client.isRegisteredUser(number);
    return isRegistered;
}
// Send Message
app.post('/send-message', [
    body('number').notEmpty(),
    body('message').notEmpty(),
], async (req, res) => {
    const error = validationResult(req).formatWith(({ msg }) => {
        return msg;
    });

    if(!error.isEmpty()) {
        return res.status(422).json({
            status: false,
            message: error.mapped()
        });
    }

    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;

    const isRegisteredNumber = await checkRegisteredNumber(number);

    if (!isRegisteredNumber) {
        return res.status(422).json({
            status: false,
            message: 'The number is not registered'
        });
    }

    client.sendMessage(number, message).then(response => {
        res.status(200).json({
            status: true,
            response: response
        });
    }).catch(err => {
        res.status(500).json({
            status: false,
            response: err
        });
    });
});


// Send Media
app.post('/send-media', (req, res) => {
    const number = phoneNumberFormatter(req.body.number);
    const caption = req.body.caption;
    const file = req.files.file;
    const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);
    // const media = MessageMedia.fromFilePath('./tes.png');

    client.sendMessage(number, media, { caption: caption }).then(response => {
        res.status(200).json({
            status: true,
            response: response
        });
    }).catch(err => {
        res.status(500).json({
            status: false,
            response: err
        });
    });
});

server.listen(port, function() {
    console.log('App running on *:' +port);
});