require('dotenv').config();
const express = require('express');
const session = require('express-session');
const DynamoDBStore = require('connect-dynamodb')({ session });
const path = require('path');
const fs = require('fs');

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
let activeUsers = {
  loggedIn: new Map(),   // usuario -> último timestamp
  guests: new Map()      // ip -> último timestamp
};

const SESSION_TTL = 5 * 60 * 1000; // 5 minutos
const app = express();

// Middleware base
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sesiones en DynamoDB (SDK v2 requerido por connect-dynamodb)
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

// Middleware para contar usuarios activos
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const user = req.session?.user ? req.session.user.email : null;
  const now = Date.now();

  if (user) {
    activeUsers.loggedIn.set(user, now);
  } else {
    activeUsers.guests.set(ip, now);
  }

  next();
});

// ==========================
// Limpieza de usuarios inactivos
// ==========================
function cleanupInactive() {
  const now = Date.now();

  for (let [user, ts] of activeUsers.loggedIn) {
    if (now - ts > SESSION_TTL) {
      activeUsers.loggedIn.delete(user);
    }
  }

  for (let [ip, ts] of activeUsers.guests) {
    if (now - ts > SESSION_TTL) {
      activeUsers.guests.delete(ip);
    }
  }
}

// ==========================
// Enviar métricas a CloudWatch
// ==========================
async function publishActiveUsers() {
  cleanupInactive();

  const loggedIn = activeUsers.loggedIn.size;
  const guests = activeUsers.guests.size;

  try {
    await cloudwatch.send(new PutMetricDataCommand({
      Namespace: 'MyApp/Metrics', // grupo de métricas
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

// cada 1 segundo enviamos métricas
setInterval(publishActiveUsers, 1000);

// ==========================
// Configuración de logging
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
// ==========================

// Motor de plantillas (ej: EJS)
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

// Páginas principales
app.get("/", (req, res) => res.render("index"));
app.get('/destacados', (req, res) => res.render('destacados'));
app.get('/comunidad', (req, res) => res.render('comunidad'));

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});