// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const slugify = require('slugify'); // npm install slugify
const multer = require('multer');   // npm install multer

const app = express();
app.use(express.json());

// Configuración de multer para subir archivos a /images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'images'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const timestamp = Date.now();
    cb(null, `${base}-${timestamp}${ext}`);
  }
});
const upload = multer({ storage });

// Servir archivos estáticos (HTML, CSS, imágenes, etc.)
app.use(express.static(path.join(__dirname)));

const BECAS_PATH = path.join(__dirname, 'becas.json');

// READ: Listar todas las becas
app.get('/api/becas', (req, res) => {
  const data = fs.readFileSync(BECAS_PATH, 'utf-8');
  res.json(JSON.parse(data));
});

// CREATE: Generar beca (POST /api/becas) con HTML base (placeholders)
app.post('/api/becas', upload.single('imagen'), (req, res) => {
  let becas = JSON.parse(fs.readFileSync(BECAS_PATH, 'utf-8'));
  const newId = becas.length ? Math.max(...becas.map(b => b.id)) + 1 : 1;

  const {
    titulo,
    fechaLimite,
    descripcion,
    requisitos,   // JSON string con array
    costos        // JSON string con array
  } = req.body;

  let imagePath = 'images/default.jpg';
  if (req.file) {
    imagePath = path.join('images', req.file.filename).replace(/\\/g, '/');
  }

  const slug = slugify(titulo || 'beca-sin-titulo', { lower: true, strict: true });
  const fileName = `beca_${slug}.html`;

  // Parseamos los requisitos/costos a array
  let reqArr = [];
  let costArr = [];
  if (requisitos) {
    try { reqArr = JSON.parse(requisitos); } catch { reqArr = []; }
  }
  if (costos) {
    try { costArr = JSON.parse(costos); } catch { costArr = []; }
  }

  const newBeca = {
    id: newId,
    titulo,
    fechaLimite,
    descripcion,
    imagen: imagePath,
    link: fileName,
    requisitos: reqArr,
    costos: costArr
  };

  becas.push(newBeca);
  fs.writeFileSync(BECAS_PATH, JSON.stringify(becas, null, 2), 'utf-8');

  // Generar HTML base con placeholders
  const htmlContent = generateBecaHTML(newBeca);
  fs.writeFileSync(path.join(__dirname, 'pages', fileName), htmlContent, 'utf-8');

  res.status(201).json({
    message: 'Beca creada y HTML generado',
    beca: newBeca,
    detailFile: fileName
  });
});

// UPDATE: Editar la beca (PUT /api/becas/:id) con parche parcial de HTML
app.put('/api/becas/:id', upload.single('imagen'), (req, res) => {
  let becas = JSON.parse(fs.readFileSync(BECAS_PATH, 'utf-8'));
  const { id } = req.params;
  const index = becas.findIndex(b => b.id === parseInt(id, 10));
  if (index === -1) {
    return res.status(404).json({ error: 'Beca no encontrada' });
  }

  const {
    titulo,
    fechaLimite,
    descripcion,
    requisitos,   // JSON string array
    costos        // JSON string array
  } = req.body;

  let imagePath = becas[index].imagen;
  if (req.file) {
    imagePath = path.join('images', req.file.filename).replace(/\\/g, '/');
  }

  // Recuperar arrays existentes
  let reqArr = becas[index].requisitos || [];
  let costArr = becas[index].costos || [];
  // Parsear si el body trae nuevos arrays
  if (requisitos) {
    try { reqArr = JSON.parse(requisitos); } catch {}
  }
  if (costos) {
    try { costArr = JSON.parse(costos); } catch {}
  }

  // Actualizar en JSON
  becas[index].titulo = titulo;
  becas[index].fechaLimite = fechaLimite;
  becas[index].descripcion = descripcion;
  becas[index].imagen = imagePath;
  becas[index].requisitos = reqArr;
  becas[index].costos = costArr;

  fs.writeFileSync(BECAS_PATH, JSON.stringify(becas, null, 2), 'utf-8');

  // Parchear el HTML si existe
  const fileName = becas[index].link;
  const filePath = path.join(__dirname, 'pages', fileName);
  if (fs.existsSync(filePath)) {
    let htmlContent = fs.readFileSync(filePath, 'utf-8');
    
    // 1) Título => <h1 class="text-center mb-4">...</h1>
    htmlContent = htmlContent.replace(
      /(<h1 class="text-center mb-4">)([\s\S]*?)(<\/h1>)/,
      `$1${titulo}$3`
    );
    
    // 2) Fecha Límite => <p><strong>Fecha límite:<\/strong> ...<\/p>
    htmlContent = htmlContent.replace(
      /(<p><strong>Fecha límite:<\/strong>\s?)([^<]*)(<\/p>)/,
      `$1${fechaLimite}$3`
    );
    
    // 3) Descripción => <p><strong>Descripción:<\/strong> ...<\/p>
    htmlContent = htmlContent.replace(
      /(<p><strong>Descripción:<\/strong>\s?)([^<]*)(<\/p>)/,
      `$1${descripcion}$3`
    );
    
    // 4) Imagen => <img src="../images/...">
    htmlContent = htmlContent.replace(
      /(src=")\.\.\/[^"]+(")/,
      `$1../${imagePath}$2`
    );

    // ** NUEVO: Reemplazar Requisitos y Costos si ya hay <h5>Requisitos</h5><ul> ...</ul> **
    // Regex para <h5>Requisitos</h5><ul> ... </ul>
    const reqRegex = /(<h5>Requisitos<\/h5>\s*<ul>)([\s\S]*?)(<\/ul>)/;
    if (reqArr.length > 0) {
      const newReqContent = reqArr.map(r => `<li>${r}</li>`).join('');
      htmlContent = htmlContent.replace(reqRegex, `$1${newReqContent}$3`);
    } else {
      // Si el array viene vacío, podemos dejar la sección vacía
      htmlContent = htmlContent.replace(reqRegex, `$1$3`);
    }

    // Regex para <h5>Costos</h5><ul> ...</ul>
    const costRegex = /(<h5>Costos<\/h5>\s*<ul>)([\s\S]*?)(<\/ul>)/;
    if (costArr.length > 0) {
      const newCostContent = costArr.map(c => `<li>${c}</li>`).join('');
      htmlContent = htmlContent.replace(costRegex, `$1${newCostContent}$3`);
    } else {
      htmlContent = htmlContent.replace(costRegex, `$1$3`);
    }

    fs.writeFileSync(filePath, htmlContent, 'utf-8');
  }

  res.json({ message: 'Beca actualizada (parcial HTML replaced)', beca: becas[index] });
});

// DELETE
app.delete('/api/becas/:id', (req, res) => {
  let becas = JSON.parse(fs.readFileSync(BECAS_PATH, 'utf-8'));
  const { id } = req.params;
  const newBecas = becas.filter(b => b.id !== parseInt(id, 10));
  if (newBecas.length === becas.length) {
    return res.status(404).json({ error: 'Beca no encontrada' });
  }
  fs.writeFileSync(BECAS_PATH, JSON.stringify(newBecas, null, 2), 'utf-8');
  res.json({ message: 'Beca eliminada' });
});

// POST /api/becas/detalle -> edita placeholders con edit_detalle.html
app.post('/api/becas/detalle', (req, res) => {
  const { file, requisitos, costos, extraInfo } = req.body;
  const filePath = path.join(__dirname, 'pages', file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'El archivo HTML no existe' });
  }

  let htmlContent = fs.readFileSync(filePath, 'utf-8');

  const reqList = requisitos.split('\n').map(r => `<li>${r}</li>`).join('\n');
  const costList = costos.split('\n').map(c => `<li>${c}</li>`).join('\n');

  htmlContent = htmlContent.replace(
    /<!-- REQ_PLACEHOLDER -->/,
    `<h5>Requisitos</h5>\n<ul>${reqList}</ul>`
  );
  htmlContent = htmlContent.replace(
    /<!-- COST_PLACEHOLDER -->/,
    `<h5>Costos</h5>\n<ul>${costList}</ul>`
  );
  htmlContent = htmlContent.replace(
    /<!-- EXTRA_PLACEHOLDER -->/,
    `<p>${extraInfo}</p>`
  );

  fs.writeFileSync(filePath, htmlContent, 'utf-8');

  // Guardarlo también en becas.json
  let becas = JSON.parse(fs.readFileSync(BECAS_PATH, 'utf-8'));
  const becaIndex = becas.findIndex(b => b.link === file);
  if (becaIndex !== -1) {
    const reqArr = requisitos.split('\n').map(r => r.trim()).filter(Boolean);
    const costArr = costos.split('\n').map(c => c.trim()).filter(Boolean);
    becas[becaIndex].requisitos = reqArr;
    becas[becaIndex].costos = costArr;
    fs.writeFileSync(BECAS_PATH, JSON.stringify(becas, null, 2), 'utf-8');
  }

  res.json({ message: `Detalle guardado en ${file}` });
});

// Generar HTML base con placeholders
function generateBecaHTML(beca) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${beca.titulo} | Becas UES</title>
  <link rel="icon" href="../images/Ues logo.ico">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Bootstrap CSS -->
  <link 
    href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
    rel="stylesheet"
  >
  <link rel="stylesheet" href="../css/styles.css">
</head>
<body>
  <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
    <div class="container-fluid">
      <a class="navbar-brand" href="../index.html">Internacionalización UES</a>
      <button 
        class="navbar-toggler" 
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#navbarNav"
        aria-controls="navbarNav"
        aria-expanded="false"
        aria-label="Alternar navegación"
      >
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNav">
        <ul class="navbar-nav ms-auto">
          <li class="nav-item"><a class="nav-link" href="../index.html">Home</a></li>
          <li class="nav-item"><a class="nav-link" href="becas.html">Becas</a></li>
          <li class="nav-item"><a class="nav-link" href="experiencias.html">Experiencias</a></li>
          <li class="nav-item"><a class="nav-link" href="internacionales.html">Internacionales</a></li>
          <li class="nav-item"><a class="nav-link" href="contactos.html">Contactos</a></li>
        </ul>
      </div>
    </div>
  </nav>

  <main class="container my-5">
    <h1 class="text-center mb-4">${beca.titulo}</h1>
    <div class="card mb-5">
      <img
        src="../${beca.imagen}"
        class="card-img-top"
        alt="${beca.titulo}"
        style="height:400px; object-fit:cover;"
      >
      <div class="card-body">
        <p><strong>Fecha límite:</strong> ${beca.fechaLimite || ''}</p>
        <p><strong>Descripción:</strong> ${beca.descripcion || ''}</p>
        <!-- REQ_PLACEHOLDER -->
        <!-- COST_PLACEHOLDER -->
        <!-- EXTRA_PLACEHOLDER -->
      </div>
    </div>
    <div class="text-center">
      <a href="becas.html" class="btn btn-primary">Volver a Becas</a>
    </div>
  </main>

  <footer class="bg-dark text-white text-center py-3">
    <p>&copy; 2024 Universidad de El Salvador</p>
  </footer>

  <script
    src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"
  ></script>
</body>
</html>
  `;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
