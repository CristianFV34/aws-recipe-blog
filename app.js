require('dotenv').config();
const AWS = require('aws-sdk');
const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const multerS3 = require('multer-s3');
const bcrypt = require('bcryptjs');

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const app = express();

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME,
    acl: 'public-read',
    key: (req, file, cb) => {
      cb(null, `perfiles/${Date.now()}-${file.originalname}`);
    }
  })
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

const DynamoDBStore = require('connect-dynamodb')({ session });

app.use(session({
  store: new DynamoDBStore({
    table: 'Sesiones',
    AWSRegion: process.env.AWS_REGION
  }),
  secret: process.env.SESSION_SECRET || 'secret_dev',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

function ensureAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}

app.get('/', (req, res) => res.render('index'));
app.get('/destacados', (req, res) => res.render('destacados'));
app.get('/comunidad', (req, res) => res.render('comunidad'));

app.get('/register', (req, res) => res.render('register', { errors: null, form: {} }));

/*app.post('/register', async (req, res) => {
  const { username, password, email } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);

  const params = {
    TableName: 'Usuarios',
    Item: {
      username,        
      email,               
      passwordHash,
      foto: 'images/user-3296.png'
    },
    ConditionExpression: 'attribute_not_exists(username)'
  };

  try {
    await dynamodb.put(params).promise();
    res.send('Usuario registrado con éxito');
  } catch (err) {
    if (err.code === 'ConditionalCheckFailedException') {
      res.status(400).send('El nombre de usuario ya existe');
    } else {
      console.error(err);
      res.status(500).send('Error al registrar usuario');
    }
  }
});*/
app.post('/register', async (req, res) => {
  const { username, password, email } = req.body;

  try {
    // 1️⃣ Verificamos que llegan datos
    console.log("Datos recibidos:", { username, email });

    if (!username || !password || !email) {
      return res.status(400).send("Faltan campos obligatorios");
    }

    // 2️⃣ Hash de la contraseña
    const passwordHash = await bcrypt.hash(password, 10);

    // 3️⃣ Preparamos datos para Dynamo
    const params = {
      TableName: 'Usuarios',
      Item: {
        username,
        email,
        passwordHash,
        foto: 'images/user-3296.png'
      }
    };

    console.log("Guardando en DynamoDB con params:", params);

    // 4️⃣ Guardar en Dynamo
    await dynamodb.put(params).promise();

    console.log("Usuario guardado correctamente");
    res.send('Usuario registrado con éxito');

  } catch (err) {
    console.error("❌ Error al registrar:", err);
    res.status(500).send(`Error al registrar usuario: ${err.message}`);
  }
});

app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const params = {
    TableName: 'Usuarios',
    IndexName: 'email-index',
    KeyConditionExpression: 'email = :e',
    ExpressionAttributeValues: { ':e': email }
  };

  try {
    const data = await dynamodb.query(params).promise();
    const user = data.Items[0];
    if (!user) return res.render('login', { error: 'Credenciales inválidas' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.render('login', { error: 'Credenciales inválidas' });

    req.session.user = { username: user.username, email: user.email, foto: user.foto };
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'Error en el servidor' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

app.get('/perfil', ensureAuth, async (req, res) => {
  const getParams = { TableName: 'Usuarios', Key: { username: req.session.user.username } };
  const { Item: user } = await dynamodb.get(getParams).promise();
  if (!user) {
    return res.render('perfil', { user: null, errors: ['Usuario no encontrado'], success: null });
  }
  res.render('perfil', { user, errors: [], success: null });
});

app.post('/perfil', ensureAuth, upload.single('foto'), async (req, res) => {
  const { oldPassword, newPassword, newPassword2 } = req.body;
  const username = req.session.user.username;
  let errors = [];
  let success = null;

  // Obtener usuario
  const getParams = { TableName: 'Usuarios', Key: { username } };
  const { Item: user } = await dynamodb.get(getParams).promise();

  // Cambiar contraseña
  if (oldPassword || newPassword || newPassword2) {
    if (!oldPassword || !newPassword || !newPassword2) {
      errors.push('Debes completar todos los campos para cambiar la contraseña.');
    } else if (newPassword !== newPassword2) {
      errors.push('Las contraseñas nuevas no coinciden.');
    } else if (!(await bcrypt.compare(oldPassword, user.passwordHash))) {
      errors.push('La contraseña actual es incorrecta.');
    } else {
      user.passwordHash = await bcrypt.hash(newPassword, 10);
      success = 'Contraseña actualizada correctamente.';
    }
  }

  // Subir nueva foto a S3
  if (req.file) {
    user.foto = req.file.location;
    req.session.user.foto = user.foto;
    success = success ? success + ' Foto actualizada.' : 'Foto actualizada.';
  }

  // Guardar cambios en DynamoDB
  await dynamodb.put({ TableName: 'Usuarios', Item: user }).promise();

  res.render('perfil', { user, errors, success });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
