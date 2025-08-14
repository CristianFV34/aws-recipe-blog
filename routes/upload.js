const multer = require('multer');
const multerS3 = require('multer-s3');
const { s3 } = require('./aws-config');

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME,
    acl: 'public-read',
    key: (req, file, cb) => {
      const fileName = `perfil/${Date.now()}-${file.originalname}`;
      cb(null, fileName);
    }
  })
});

module.exports = upload;