const bcrypt = require('bcryptjs');
const { GetCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamodb } = require('./aws-config'); // DynamoDBDocumentClient.from(client)
const upload = require('./upload');

module.exports = (app) => {
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
            const data = await dynamodb.send(new QueryCommand(params));

            if (!data.Items || data.Items.length === 0) {
                return res.render('login', { error: 'Credenciales inválidas' });
            }

            const user = data.Items[0];

            const match = await bcrypt.compare(password, user.passwordHash);
            if (!match) {
                return res.render('login', { error: 'Credenciales inválidas' });
            }

            req.session.user = { 
                username: user.username, 
                email: user.email, 
                foto: user.foto 
            };
            res.redirect('/');

        } catch (err) {
            console.error("Error al iniciar sesión:", err);
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
};