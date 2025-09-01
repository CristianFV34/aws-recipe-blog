require('dotenv').config();
const express = require('express');
const session = require('express-session');
const DynamoDBStore = require('connect-dynamodb')({ session });
const path = require('path');
const fs = require('fs');

const app = express();

// ==========================
// Seguimiento de usuarios activos
// ==========================
let activeUsers = {
  loggedIn: new Set(),   // Usuarios con sesión
  guests: new Set()      // Invitados sin sesión
};

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

app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress; // identificador básico
  const user = req.session.user ? req.session.user.email : null;

  if (user) {
    activeUsers.loggedIn.add(user);
  } else {
    activeUsers.guests.add(ip);
  }

  // Cuando la respuesta termina, quitamos al usuario
  res.on('finish', () => {
    if (user) {
      activeUsers.loggedIn.delete(user);
    } else {
      activeUsers.guests.delete(ip);
    }
  });

  next();
});

function logActiveUsers() {
  const msg = `Usuarios activos -> Logueados: ${activeUsers.loggedIn.size}, Invitados: ${activeUsers.guests.size}`;
  console.log(msg);
}

// cada 1 minuto registramos la info en el log
setInterval(logActiveUsers, 60 * 1000);

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

// Middleware base
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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