const express = require("express");
const fs = require("fs");
const path = require("path");
const slugify = require("slugify");
const multer = require("multer");
const ejs = require("ejs");
const cheerio = require("cheerio");

const app = express();
app.use(express.json());

// Configuración de multer
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

// Configuración EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

const BECAS_PATH = path.join(__dirname, "becas.json");

// Helper para leer/escribir becas
const getBecas = () => JSON.parse(fs.readFileSync(BECAS_PATH, "utf-8"));
const saveBecas = (becas) => fs.writeFileSync(BECAS_PATH, JSON.stringify(becas, null, 2));

// READ: Listar becas
app.get("/api/becas", (req, res) => {
  res.json(getBecas());
});

// CREATE: Crear beca
app.post("/api/becas", upload.single("imagen"), (req, res) => {
  const becas = getBecas();
  const newId = becas.length ? Math.max(...becas.map(b => b.id)) + 1 : 1;

  const { 
    titulo, 
    fechaLimite, 
    descripcion, 
    requisitos, 
    costos, 
    extraInfo,
    institucion,
    modalidad,
    tipoBeca,
    enlaceAplicacion
  } = req.body;

  const imagePath = req.file 
    ? path.join("images", req.file.filename).replace(/\\/g, "/") 
    : "images/default.jpg";

  const slug = slugify(titulo || "beca-sin-titulo", { lower: true, strict: true });
  const fileName = `beca_${slug}.html`;

  const newBeca = {
    id: newId,
    titulo,
    fechaLimite,
    descripcion,
    imagen: imagePath,
    link: fileName,
    requisitos: requisitos ? JSON.parse(requisitos) : [],
    costos: costos ? JSON.parse(costos) : [],
    extraInfo: extraInfo || "",
    institucion: institucion || "Universidad de El Salvador",
    modalidad: modalidad || "Presencial",
    tipoBeca: tipoBeca || "Parcial",
    enlaceAplicacion: enlaceAplicacion || "#"
  };

  becas.push(newBeca);
  saveBecas(becas);

  // Generar HTML desde template
  const htmlContent = ejs.render(
    fs.readFileSync(path.join(__dirname, 'templates/beca.ejs'), 'utf-8'),
    { beca: newBeca }
  );
  
  fs.writeFileSync(path.join(__dirname, "pages", fileName), htmlContent);
  
  res.status(201).json({ 
    message: "Beca creada", 
    beca: newBeca, 
    detailFile: fileName 
  });
});

// UPDATE: Editar detalle de beca
app.post("/api/becas/detalle", (req, res) => {
  const { 
    file, 
    requisitos, 
    costos, 
    extraInfo,
    institucion,
    modalidad,
    tipoBeca,
    enlaceAplicacion
  } = req.body;

  const filePath = path.join(__dirname, "pages", file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "El archivo HTML no existe" });
  }

  try {
    const $ = cheerio.load(fs.readFileSync(filePath, 'utf-8'));
    
    // Actualizar campos principales
    $('[data-section="institucion"]').text(institucion);
    $('[data-section="modalidad"]').text(modalidad);
    $('[data-section="tipoBeca"]').text(tipoBeca);
    $('[data-section="enlaceAplicacion"]').attr('href', enlaceAplicacion);

    // Actualizar listas
    const updateList = (section, items) => {
      const container = $(`[data-section="${section}"]`);
      container.empty();
      items.filter(Boolean).forEach(item => 
        container.append(`<li data-editable="${section}-item">${item}</li>`)
      );
    };

    const reqArr = requisitos.split('\n').map(r => r.trim());
    const costArr = costos.split('\n').map(c => c.trim());
    
    updateList('requisitos', reqArr);
    updateList('costos', costArr);
    $('[data-section="extraInfo"]').html(extraInfo || "");

    fs.writeFileSync(filePath, $.html());

    // Actualizar JSON
    const becas = getBecas();
    const becaIndex = becas.findIndex(b => b.link === file);
    if (becaIndex !== -1) {
      becas[becaIndex] = {
        ...becas[becaIndex],
        requisitos: reqArr.filter(Boolean),
        costos: costArr.filter(Boolean),
        institucion,
        modalidad,
        tipoBeca,
        enlaceAplicacion,
        extraInfo: extraInfo || ""
      };
      saveBecas(becas);
    }

    res.json({ message: `Detalle guardado en ${file}` });
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar el detalle" });
  }
});

// UPDATE: Editar beca principal
app.put("/api/becas/:id", upload.single("imagen"), (req, res) => {
  const becas = getBecas();
  const id = parseInt(req.params.id, 10);
  const index = becas.findIndex(b => b.id === id);
  
  if (index === -1) return res.status(404).json({ error: "Beca no encontrada" });

  const {
    titulo,
    fechaLimite,
    descripcion,
    requisitos,
    costos,
    extraInfo,
    institucion,
    modalidad,
    tipoBeca,
    enlaceAplicacion
  } = req.body;

  const oldBeca = becas[index];
  const timestamp = Date.now();
  const updatedBeca = {
    ...oldBeca,
    titulo: titulo || oldBeca.titulo,
    fechaLimite: fechaLimite || oldBeca.fechaLimite,
    descripcion: descripcion || oldBeca.descripcion,
    requisitos: requisitos ? JSON.parse(requisitos) : oldBeca.requisitos,
    costos: costos ? JSON.parse(costos) : oldBeca.costos,
    extraInfo: extraInfo || oldBeca.extraInfo,
    institucion: institucion || oldBeca.institucion,
    modalidad: modalidad || oldBeca.modalidad,
    tipoBeca: tipoBeca || oldBeca.tipoBeca,
    enlaceAplicacion: enlaceAplicacion || oldBeca.enlaceAplicacion,
    imagen: req.file 
      ? `${path.join("images", req.file.filename)}?v=${timestamp}`
      : oldBeca.imagen
  };

  becas[index] = updatedBeca;
  saveBecas(becas);

  // Actualizar HTML
  const filePath = path.join(__dirname, "pages", updatedBeca.link);
  if (fs.existsSync(filePath)) {
    const $ = cheerio.load(fs.readFileSync(filePath, 'utf-8'));
    
    $('[data-editable="titulo"]').text(updatedBeca.titulo);
    $('[data-editable="fechaLimite"]').text(updatedBeca.fechaLimite);
    $('[data-editable="descripcion"]').html(updatedBeca.descripcion);
    
    $('img[data-editable="imagen"]')
      .attr('src', `../${updatedBeca.imagen}`)
      .attr('alt', updatedBeca.titulo);

    $('[data-editable="institucion"]').text(updatedBeca.institucion);
    $('[data-editable="modalidad"]').text(updatedBeca.modalidad);
    $('[data-editable="tipoBeca"]').text(updatedBeca.tipoBeca);
    $('[data-editable="enlaceAplicacion"]').attr('href', updatedBeca.enlaceAplicacion);

    const updateList = (section, items) => {
      const container = $(`[data-section="${section}"]`);
      container.empty();
      items.forEach(item => 
        container.append(`<li data-editable="${section}-item">${item}</li>`)
      );
    };

    updateList('requisitos', updatedBeca.requisitos);
    updateList('costos', updatedBeca.costos);
    $('[data-section="extraInfo"]').html(updatedBeca.extraInfo);

    fs.writeFileSync(filePath, $.html());
  }

  res.json({
    message: "Beca actualizada correctamente",
    beca: updatedBeca
  });
});

// DELETE: Eliminar beca
app.delete("/api/becas/:id", (req, res) => {
  const becas = getBecas();
  const id = parseInt(req.params.id, 10);
  const index = becas.findIndex(b => b.id === id);
  
  if (index === -1) return res.status(404).json({ error: "Beca no encontrada" });

  const [deletedBeca] = becas.splice(index, 1);
  saveBecas(becas);

  const filePath = path.join(__dirname, "pages", deletedBeca.link);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  res.json({ message: "Beca eliminada", beca: deletedBeca });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});