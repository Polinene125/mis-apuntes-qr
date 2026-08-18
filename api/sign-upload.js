const cloudinary = require('cloudinary').v2;

export default async function handler(req, res) {
  // Configurar Cloudinary con las variables de entorno
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  // Solo permitir solicitudes GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    
    // Parámetros a firmar. Aquí puedes agregar configuraciones extra si lo deseas.
    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp: timestamp,
        // Puedes agregar una carpeta aquí si quieres que vayan organizados
        // folder: 'mis_apuntes'
      },
      process.env.CLOUDINARY_API_SECRET
    );

    res.status(200).json({
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY
    });
  } catch (error) {
    console.error("Error generating signature", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
