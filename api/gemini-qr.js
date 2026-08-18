const { GoogleGenAI } = require('@google/genai');

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const materiaName = req.query.materiaName;

    if (!materiaName) {
        return res.status(400).json({ error: 'Missing materiaName parameter' });
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("No se encontró GEMINI_API_KEY en las variables de entorno.");
            return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
        }

        const ai = new GoogleGenAI({ apiKey });

        const prompt = `
Eres un diseñador experto de iconos SVG minimalistas.
Genera un icono SVG muy simple, plano y de silueta que represente a la materia escolar: "${materiaName}".
Reglas obligatorias:
1. Devuelve ÚNICAMENTE el código SVG. Sin texto adicional, sin formato de markdown (no uses \`\`\`svg).
2. Empieza directamente con <svg> y termina con </svg>.
3. Usa un viewBox="0 0 100 100".
4. El fill o stroke principal de las formas debe ser de color #D9724B.
5. El icono debe ser limpio, fácil de reconocer y sin detalles complejos (ideal para un logo central en un QR).
`;

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: prompt,
            config: {
                temperature: 0.1, // Baja temperatura para resultados predecibles y estándar
            }
        });

        let svgContent = response.text().trim();
        
        // Limpieza de seguridad por si el modelo incluye backticks
        if (svgContent.startsWith('```svg')) {
            svgContent = svgContent.replace(/```svg\n?/, '');
        }
        if (svgContent.startsWith('```html')) {
            svgContent = svgContent.replace(/```html\n?/, '');
        }
        if (svgContent.endsWith('```')) {
            svgContent = svgContent.slice(0, -3);
        }
        svgContent = svgContent.trim();

        // Control de caché para no gastar cuota en la misma materia repetidas veces
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
        res.setHeader('Content-Type', 'image/svg+xml');
        res.status(200).send(svgContent);

    } catch (error) {
        console.error('Error in gemini-qr API:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
