const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const express = require('express');

// Inicializa el cliente S3 una sola vez (no dentro de la ruta)
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Función para guardar archivos en S3
async function guardarEnS3(buffer, nombreArchivo) {
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: `videos/${nombreArchivo}`,
    Body: buffer,
    ContentType: 'video/mp4'
  }));
  console.log(`Video subido a S3: ${nombreArchivo}`);
}

// Exporta la función que registra la ruta
module.exports = (app) => {
  app.get('/monitorizacion', (req, res) => {
    res.render('monitorizacion');
  });

  // (Opcional) podrías exponer un endpoint POST para subir el video
  app.post('/subir-video', express.raw({ type: 'video/mp4', limit: '500mb' }), async (req, res) => {
    try {
      const nombreArchivo = `grabacion-${Date.now()}.mp4`;
      await guardarEnS3(req.body, nombreArchivo);
      res.json({ ok: true, mensaje: 'Video guardado en S3', nombreArchivo });
    } catch (err) {
      console.error('Error subiendo video:', err);
      res.status(500).json({ ok: false, error: 'Error al subir video' });
    }
  });
};


