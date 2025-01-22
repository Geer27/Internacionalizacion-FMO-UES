// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const slugify = require("slugify");
const multer = require("multer");

const app = express();
app.use(express.json());

// Configuración de multer (subir imágenes a /images)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "images"));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const timestamp = Date.now();
    cb(null, `${base}-${timestamp}${ext}`);
  },
});
const upload = multer({ storage });

app.use(express.static(path.join(__dirname)));

const BECAS_PATH = path.join(__dirname, "becas.json");

// READ: Listar becas
app.get("/api/becas", (req, res) => {
  const data = fs.readFileSync(BECAS_PATH, "utf-8");
  res.json(JSON.parse(data));
});

// CREATE: Crear beca y archivo HTML base
app.post("/api/becas", upload.single("imagen"), (req, res) => {
  let becas = JSON.parse(fs.readFileSync(BECAS_PATH, "utf-8"));
  const newId = becas.length ? Math.max(...becas.map(b => b.id)) + 1 : 1;

  const {
    titulo,
    fechaLimite,
    descripcion,
    requisitos,  // JSON array en string
    costos,      // JSON array en string
    extraInfo,
  } = req.body;

  let imagePath = "images/default.jpg";
  if (req.file) {
    imagePath = path.join("images", req.file.filename).replace(/\\/g, "/");
  }

  const slug = slugify(titulo || "beca-sin-titulo", { lower: true, strict: true });
  const fileName = `beca_${slug}.html`;

  let reqArr = [];
  let costArr = [];
  if (requisitos) {
    try { reqArr = JSON.parse(requisitos); } catch {}
  }
  if (costos) {
    try { costArr = JSON.parse(costos); } catch {}
  }

  const newBeca = {
    id: newId,
    titulo,
    fechaLimite,
    descripcion,
    imagen: imagePath,
    link: fileName,
    requisitos: reqArr,
    costos: costArr,
    extraInfo: extraInfo || ""
  };

  becas.push(newBeca);
  fs.writeFileSync(BECAS_PATH, JSON.stringify(becas, null, 2), "utf-8");

  // Generar HTML base
  const htmlContent = generateBecaHTML(newBeca);
  fs.writeFileSync(path.join(__dirname, "pages", fileName), htmlContent, "utf-8");

  res.status(201).json({
    message: "Beca creada y HTML generado",
    beca: newBeca,
    detailFile: fileName
  });
});

// UPDATE: Editar beca (PUT /api/becas/:id) => reemplazar etiqueta <img> con class="card-img-top"
app.put("/api/becas/:id", upload.single("imagen"), (req, res) => {
  let becas = JSON.parse(fs.readFileSync(BECAS_PATH, "utf-8"));
  const { id } = req.params;
  const index = becas.findIndex(b => b.id === parseInt(id, 10));
  if (index === -1) {
    return res.status(404).json({ error: "Beca no encontrada" });
  }

  const {
    titulo,
    fechaLimite,
    descripcion,
    requisitos,
    costos,
    extraInfo
  } = req.body;

  let imagePath = becas[index].imagen;
  if (req.file) {
    imagePath = path.join("images", req.file.filename).replace(/\\/g, "/");
  }

  // Parsear arrays
  let reqArr = becas[index].requisitos || [];
  let costArr = becas[index].costos || [];
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
  becas[index].extraInfo = extraInfo || "";

  fs.writeFileSync(BECAS_PATH, JSON.stringify(becas, null, 2), "utf-8");

  // Parchear el HTML
  const fileName = becas[index].link;
  const filePath = path.join(__dirname, "pages", fileName);
  if (fs.existsSync(filePath)) {
    let htmlContent = fs.readFileSync(filePath, "utf-8");

    // 1) Título
    htmlContent = htmlContent.replace(
      /(<h1 class="text-center mb-4">)([\s\S]*?)(<\/h1>)/,
      `$1${titulo}$3`
    );

    // 2) Fecha Límite
    htmlContent = htmlContent.replace(
      /(<p><strong>Fecha límite:<\/strong>\s?)([^<]*)(<\/p>)/,
      `$1${fechaLimite}$3`
    );

    // 3) Descripción
    htmlContent = htmlContent.replace(
      /(<p><strong>Descripción:<\/strong>\s?)([^<]*)(<\/p>)/,
      `$1${descripcion}$3`
    );

    // 4) Imagen: Reemplazar la etiqueta completa <img> con class="card-img-top"
    // Regex que busca <img ... class="..card-img-top.."...> (atributos varios)
    const fullImgRegex = /<img[^>]*class\s*=\s*"[^"]*\bcard-img-top\b[^"]*"[^>]*>/is;
    const newImgTag = `
<img
  src="../${imagePath}"
  class="card-img-top"
  alt="${titulo}"
  style="height:400px; object-fit:cover;"
>
`;
    htmlContent = htmlContent.replace(fullImgRegex, newImgTag);

    // 5) Requisitos
    const reqRegex = /(<h5>Requisitos<\/h5>\s*<ul>)([\s\S]*?)(<\/ul>)/;
    if (reqArr.length > 0) {
      const newReqContent = reqArr.map(r => `<li>${r}</li>`).join("");
      htmlContent = htmlContent.replace(reqRegex, `$1${newReqContent}$3`);
    } else {
      htmlContent = htmlContent.replace(reqRegex, `$1$3`);
    }

    // 6) Costos
    const costRegex = /(<h5>Costos<\/h5>\s*<ul>)([\s\S]*?)(<\/ul>)/;
    if (costArr.length > 0) {
      const newCostContent = costArr.map(c => `<li>${c}</li>`).join("");
      htmlContent = htmlContent.replace(costRegex, `$1${newCostContent}$3`);
    } else {
      htmlContent = htmlContent.replace(costRegex, `$1$3`);
    }

    // 7) Extra Info
    if (htmlContent.includes("<!-- EXTRA_PLACEHOLDER -->")) {
      htmlContent = htmlContent.replace(
        /<!-- EXTRA_PLACEHOLDER -->/,
        `<p id="extra-info">${becas[index].extraInfo}</p>`
      );
    } else {
      const extraBlockRegex = /<p id="extra-info">([\s\S]*?)<\/p>/;
      if (extraBlockRegex.test(htmlContent)) {
        htmlContent = htmlContent.replace(
          extraBlockRegex,
          `<p id="extra-info">${becas[index].extraInfo}</p>`
        );
      } else {
        // Insertar si no existe
        htmlContent = htmlContent.replace(
          /(<div class="card-body">\s*)([\s\S]*?)(\s*<\/div>)/,
          `$1$2\n<p id="extra-info">${becas[index].extraInfo}</p>$3`
        );
      }
    }

    fs.writeFileSync(filePath, htmlContent, "utf-8");
  }

  res.json({ message: "Beca actualizada (parcial HTML replaced)", beca: becas[index] });
});

// DELETE
app.delete("/api/becas/:id", (req, res) => {
  let becas = JSON.parse(fs.readFileSync(BECAS_PATH, "utf-8"));
  const { id } = req.params;

  const index = becas.findIndex(b => b.id === parseInt(id, 10));
  if (index === -1) {
    return res.status(404).json({ error: "Beca no encontrada" });
  }

  const fileName = becas[index].link;
  const newBecas = becas.filter(b => b.id !== parseInt(id, 10));
  fs.writeFileSync(BECAS_PATH, JSON.stringify(newBecas, null, 2), "utf-8");

  const filePath = path.join(__dirname, "pages", fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  res.json({ message: `Beca y archivo HTML ${fileName} eliminados.` });
});

// POST /api/becas/detalle -> placeholders
app.post("/api/becas/detalle", (req, res) => {
  const { file, requisitos, costos, extraInfo } = req.body;
  const filePath = path.join(__dirname, "pages", file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "El archivo HTML no existe" });
  }

  let htmlContent = fs.readFileSync(filePath, "utf-8");

  const reqList = requisitos.split("\n").map(r => `<li>${r}</li>`).join("\n");
  const costList = costos.split("\n").map(c => `<li>${c}</li>`).join("\n");

  htmlContent = htmlContent.replace(
    /<!-- REQ_PLACEHOLDER -->/,
    `<h5>Requisitos</h5>\n<ul>${reqList}</ul>`
  );
  htmlContent = htmlContent.replace(
    /<!-- COST_PLACEHOLDER -->/,
    `<h5>Costos</h5>\n<ul>${costList}</ul>`
  );

  // Al inyectar la primera vez, dejamos <p id="extra-info">
  htmlContent = htmlContent.replace(
    /<!-- EXTRA_PLACEHOLDER -->/,
    `<p id="extra-info">${extraInfo || ""}</p>`
  );

  fs.writeFileSync(filePath, htmlContent, "utf-8");

  // Actualizar becas.json
  let becas = JSON.parse(fs.readFileSync(BECAS_PATH, "utf-8"));
  const becaIndex = becas.findIndex(b => b.link === file);
  if (becaIndex !== -1) {
    const reqArr = requisitos.split("\n").map(r => r.trim()).filter(Boolean);
    const costArr = costos.split("\n").map(c => c.trim()).filter(Boolean);
    becas[becaIndex].requisitos = reqArr;
    becas[becaIndex].costos = costArr;
    becas[becaIndex].extraInfo = extraInfo || "";
    fs.writeFileSync(BECAS_PATH, JSON.stringify(becas, null, 2), "utf-8");
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
    <nav class="navbar navbar-expand-lg navbar-dark shadow-sm">
    <div class="container-fluid">
      <a class="navbar-brand d-flex align-items-center" href="../index.html">
        <img src="../images/logouess.png" alt="Logo UES" width="50" class="me-2">
        <span>Internacionalización UES</span>
      </a>
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
        <p><strong>Fecha límite:</strong> ${beca.fechaLimite || ""}
        </p>
        <p><strong>Descripción:</strong> ${beca.descripcion || ""}
        </p>
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
  console.log("Servidor corriendo en http://localhost:" + PORT);
});
