// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const slugify = require('slugify'); // npm install slugify

const app = express();
app.use(express.json());

// Servir archivos estáticos
app.use(express.static(path.join(__dirname)));

// Ruta a becas.json
const BECAS_PATH = path.join(__dirname, 'becas.json');

// READ: Obtener todas las becas
app.get('/api/becas', (req, res) => {
  const data = fs.readFileSync(BECAS_PATH, 'utf-8');
  const becas = JSON.parse(data);
  res.json(becas);
});

// CREATE: Crear una beca, generar archivo HTML
app.post('/api/becas', (req, res) => {
  let becas = JSON.parse(fs.readFileSync(BECAS_PATH, 'utf-8'));
  const newId = becas.length ? Math.max(...becas.map(b => b.id)) + 1 : 1;

  const { titulo, fechaLimite, descripcion, imagen } = req.body;
  const slug = slugify(titulo || 'beca-sin-titulo', { lower: true, strict: true });
  const fileName = `beca_${slug}.html`; // p.e. "beca_programa-amity.html"

  const newBeca = {
    id: newId,
    titulo,
    fechaLimite,
    descripcion,
    imagen,
    link: fileName
  };

  becas.push(newBeca);
  fs.writeFileSync(BECAS_PATH, JSON.stringify(becas, null, 2), 'utf-8');

  // Generar HTML base con placeholders
  const templateHTML = generateBecaHTML(newBeca);
  fs.writeFileSync(path.join(__dirname, 'pages', fileName), templateHTML, 'utf-8');

  // Devolvemos la ruta del archivo detallado
  res.status(201).json({
    message: 'Beca creada y HTML generado',
    beca: newBeca,
    detailFile: fileName
  });
});

// UPDATE: Actualizar datos básicos de la beca (NO regenerar HTML)
app.put('/api/becas/:id', (req, res) => {
  const { id } = req.params;
  let becas = JSON.parse(fs.readFileSync(BECAS_PATH, 'utf-8'));
  const index = becas.findIndex(b => b.id === parseInt(id, 10));
  if (index === -1) {
    return res.status(404).json({ error: 'Beca no encontrada' });
  }

  becas[index].titulo = req.body.titulo;
  becas[index].fechaLimite = req.body.fechaLimite;
  becas[index].descripcion = req.body.descripcion;
  becas[index].imagen = req.body.imagen;
  // link no lo tocamos

  fs.writeFileSync(BECAS_PATH, JSON.stringify(becas, null, 2), 'utf-8');
  res.json({ message: 'Beca actualizada', beca: becas[index] });
});

// DELETE (opcional)
app.delete('/api/becas/:id', (req, res) => {
  const { id } = req.params;
  let becas = JSON.parse(fs.readFileSync(BECAS_PATH, 'utf-8'));
  const newBecas = becas.filter(b => b.id !== parseInt(id, 10));
  if (newBecas.length === becas.length) {
    return res.status(404).json({ error: 'Beca no encontrada' });
  }
  fs.writeFileSync(BECAS_PATH, JSON.stringify(newBecas, null, 2), 'utf-8');
  res.json({ message: 'Beca eliminada' });
});

// Ruta para Editar Detalle HTML (POST /api/becas/detalle)
app.post('/api/becas/detalle', (req, res) => {
  const { file, requisitos, costos, extraInfo } = req.body;
  const filePath = path.join(__dirname, 'pages', file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'El archivo HTML no existe' });
  }

  let htmlContent = fs.readFileSync(filePath, 'utf-8');

  // Reemplazar placeholders
  // Suponiendo que en generateBecaHTML hay comentarios o placeholders:
  //  <!-- REQ_PLACEHOLDER -->, <!-- COST_PLACEHOLDER -->, <!-- EXTRA_PLACEHOLDER -->
  const reqList = requisitos.split('\n').map(r => `<li>${r}</li>`).join('\n');
  const costList = costos.split('\n').map(c => `<li>${c}</li>`).join('\n');

  // Simple ejemplo con replace
  htmlContent = htmlContent.replace('<!-- REQ_PLACEHOLDER -->', `
    <h5>Requisitos</h5>
    <ul>
      ${reqList}
    </ul>
  `);

  htmlContent = htmlContent.replace('<!-- COST_PLACEHOLDER -->', `
    <h5>Costos</h5>
    <ul>
      ${costList}
    </ul>
  `);

  htmlContent = htmlContent.replace('<!-- EXTRA_PLACEHOLDER -->', `<p>${extraInfo}</p>`);

  // Guardar cambios
  fs.writeFileSync(filePath, htmlContent, 'utf-8');

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
      <img src="../${beca.imagen}" class="card-img-top" alt="${beca.titulo}" style="height:400px; object-fit:cover;">
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

  <!-- Bootstrap JS -->
  <script 
    src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js">
  </script>
</body>
</html>
  `;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
