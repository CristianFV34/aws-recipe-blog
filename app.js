require('dotenv').config();
const http = require('http');
const express = require('express');
const session = require('express-session');
const DynamoDBStore = require('connect-dynamodb')({ session });
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

// ==========================
// CloudWatch con AWS SDK v3
// ==========================
const { CloudWatchClient, PutMetricDataCommand } = require("@aws-sdk/client-cloudwatch");

const cloudwatch = new CloudWatchClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// ==========================
// Seguimiento de usuarios activos
// ==========================
let activeUsers = {}; // { userId/ip : lastSeenTimestamp }

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware base
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sesiones en DynamoDB
app.use(session({
  store: new DynamoDBStore({
    table: 'sessions',
    AWSConfigJSON: {
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  }),
  secret: process.env.SESSION_SECRET || 'mi-secreto',
  resave: false,
  saveUninitialized: false
}));

// ==========================
// Endpoint heartbeat
// ==========================
app.post('/heartbeat', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  const user = req.session?.user ? req.session.user.email : ip; // si no está logueado usamos IP
  activeUsers[user] = Date.now(); // registramos última vez visto
  res.json({ ok: true });
});

// ==========================
// Endpoint metrics
// ==========================
app.get('/metrics', (req, res) => {
  const now = Date.now();
  const cutoff = now - 30 * 1000; // 30 seg sin ping = inactivo

  let loggedIn = 0;
  let guests = 0;

  for (let userId in activeUsers) {
    if (activeUsers[userId] > cutoff) {
      if (userId.includes('@')) {
        loggedIn++;
      } else {
        guests++;
      }
    }
  }

  res.json({ loggedIn, guests, timestamp: new Date().toISOString() });
});

// ==========================
// Enviar métricas a CloudWatch
// ==========================
async function publishActiveUsers() {
  const now = Date.now();
  const cutoff = now - 30 * 1000; // 30 segundos sin ping = inactivo

  let loggedIn = 0;
  let guests = 0;

  for (let userId in activeUsers) {
    if (activeUsers[userId] > cutoff) {
      if (userId.includes('@')) {
        loggedIn++;
      } else {
        guests++;
      }
    }
  }

  try {
    await cloudwatch.send(new PutMetricDataCommand({
      Namespace: 'MyApp/Metrics',
      MetricData: [
        { MetricName: 'LoggedInUsers', Value: loggedIn, Unit: 'Count' },
        { MetricName: 'GuestUsers', Value: guests, Unit: 'Count' }
      ]
    }));

    console.log(`✅ Métricas enviadas: Logueados=${loggedIn}, Invitados=${guests}`);
  } catch (err) {
    console.error("❌ Error enviando métricas:", err);
  }
}

// cada 10 segundos actualizamos métricas
setInterval(publishActiveUsers, 10 * 1000);

// ==========================
// WEBSOCKETS DE VIDEO
// ==========================
io.on('connection', (socket) => {
  console.log('📡 Nuevo cliente conectado');

  // Reenviar datos binarios (frames) a todos los demás
  socket.on('video-stream', (data) => {
    socket.broadcast.emit('video-stream', data);
  });

  socket.on('disconnect', () => console.log('❌ Cliente desconectado'));
});

// ==========================
// Logging
// ==========================
const logStream = fs.createWriteStream('/var/log/nodeapp.log', { flags: 'a' });

console.log = function (message) {
  const msg = new Date().toISOString() + ' [INFO] ' + message + '\n';
  logStream.write(msg);
  process.stdout.write(msg);
};

console.error = function (message) {
  const msg = new Date().toISOString() + ' [ERROR] ' + message + '\n';
  logStream.write(msg);
  process.stderr.write(msg);
};

// Motor de plantillas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null; 
  next();
});

// Rutas
require('./routes/perfil')(app);
require('./routes/registro')(app);
require('./routes/login')(app);
require('./routes/monitorizacion')(app);

app.get("/", (req, res) => res.render("index"));
app.get('/destacados', (req, res) => res.render('destacados'));
app.get('/comunidad', (req, res) => res.render('comunidad'));

// Puerto
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor en puerto ${PORT}`);
});