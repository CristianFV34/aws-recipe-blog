const bcrypt = require('bcryptjs');
const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamodb } = require('./aws-config');
const upload = require('./upload');

// Asegúrate de tener tu middleware de autenticación
const ensureAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

module.exports = (app) => {
  const { GetCommand } = require('@aws-sdk/lib-dynamodb');

  app.post('/perfil', ensureAuth, upload.single('foto'), async (req, res) => {
    const { oldPassword, newPassword, newPassword2 } = req.body;
    const email = req.session.user.email;
    const username = req.session.user.username;
    let errors = [];
    let success = null;

    try {
      // 1. Obtener usuario
      const { Item: user } = await dynamodb.send(new GetCommand({
        TableName: 'Usuarios',
        Key: { email, username }
      }));

      if (!user) {
        return res.render('perfil', { user: null, errors: ['Usuario no encontrado'], success: null });
      }

      // 2. Cambio de contraseña
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

      // 3. Actualizar foto de perfil
      if (req.file) {
        user.foto = req.file.location;
        req.session.user.foto = user.foto;
        success = success ? success + ' Foto actualizada.' : 'Foto actualizada.';
      }

      // 4. Guardar cambios en DynamoDB
      await dynamodb.send(new UpdateCommand({
        TableName: 'Usuarios',
        Key: { 
          username: user.username,
          email: user.email
        },
        UpdateExpression: 'SET passwordHash = :ph, foto = :f',
        ExpressionAttributeValues: {
          ':ph': user.passwordHash,
          ':f': user.foto
        }
      }));

      // 5. Renderizar vista
      res.render('perfil', { user, errors, success });

    } catch (err) {
      console.error('Error actualizando perfil:', err);
      errors.push('Ocurrió un error al actualizar el perfil.');
      res.render('perfil', { user: req.session.user, errors, success: null });
    }
  });

  app.get('/perfil', ensureAuth, async (req, res) => {
    try {
      const { Item: user } = await dynamodb.send(new GetCommand({
        TableName: 'Usuarios',
        Key: { 
          username: req.session.user.username,
          email: req.session.user.email
        }
      }));

      if (!user) {
        return res.render('perfil', { user: null, errors: ['Usuario no encontrado'], success: null });
      }

      res.render('perfil', { user, errors: [], success: null });

    } catch (err) {
      console.error('Error obteniendo perfil:', err);
      res.render('perfil', { user: null, errors: ['Error al cargar el perfil'], success: null });
    }
  });
};