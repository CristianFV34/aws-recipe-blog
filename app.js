const express = require('express');
const session = require('express-session');
const DynamoDBStore = require('connect-dynamodb')({ session });
const path = require('path');

const app = express();

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

// Motor de plantillas (ej: EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Rutas
require('./routes/perfil')(app);   // Ruta de perfil
require('./routes/registro')(app); // Ruta de registro
require('./routes/login')(app);    // Ruta de login

// Página principal
app.get('/', (req, res) => {
  res.render('index', { user: req.session.user });
});
app.get('/destacados', (req, res) => res.render('destacados'));
app.get('/comunidad', (req, res) => res.render('comunidad'));

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
