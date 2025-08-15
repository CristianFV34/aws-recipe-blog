const bcrypt = require('bcryptjs');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamodb } = require('./aws-config');
const upload = require('./upload');

module.exports = (app) => {
    app.get('/register', (req, res) => res.render('register', { errors: null, form: {} }));

    app.post('/register', async (req, res) => {
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
            ConditionExpression: 'attribute_not_exists(email)'
        };

        try {
            await dynamodb.send(new PutCommand(params));
            res.redirect('/');
        } catch (err) {
            if (err.name === 'ConditionalCheckFailedException') {
                res.status(400).send('El nombre de usuario ya existe');
            } else {
                console.error(err);
                res.status(500).send('Error al registrar usuario');
            }
        }
    });
};