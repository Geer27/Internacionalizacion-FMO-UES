// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const slugify = require("slugify");
const cheerio = require('cheerio');
const multer = require("multer");
const ejs = require("ejs");
const cors = require("cors");

const app = express();

// Middlewares esenciales
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

/* ============================ */
/* CONFIGURACIÓN COMÚN          */
/* ============================ */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "images"));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${slugify(file.originalname, { lower: true, strict: true })}-${Date.now()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB (ajusta según necesites)
    files: 1 // Solo 1 archivo por vez
  }
});

// Configuración EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "templates"));

/* ============================ */
/* CRUD PARA BECAS              */
/* ============================ */
const BECAS_PATH = path.join(__dirname, "becas.json");
const getBecas = () => JSON.parse(fs.readFileSync(BECAS_PATH, "utf-8"));
const saveBecas = (becas) =>
  fs.writeFileSync(BECAS_PATH, JSON.stringify(becas, null, 2));

// GET: Listar becas
app.get("/api/becas", (req, res) => {
  res.json(getBecas());
});

// POST: Crear beca
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

  // Generar HTML usando la plantilla beca.ejs
  const htmlContent = ejs.render(
    fs.readFileSync(path.join(__dirname, "templates", "beca.ejs"), "utf-8"),
    { beca: newBeca }
  );
  fs.writeFileSync(path.join(__dirname, "pages", fileName), htmlContent);

  res.status(201).json({ 
    message: "Beca creada", 
    beca: newBeca, 
    detailFile: fileName 
  });
});

// Función auxiliar para actualizar listas en el HTML (becas)
function updateList($, section, items) {
  const container = $(`[data-section="${section}"]`);
  container.empty();
  items.forEach(item => {
    container.append(`<li data-section="${section}-item">${item}</li>`);
  });
}

// POST: Editar detalle de beca (para actualizar campos adicionales)
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
    const htmlContent = fs.readFileSync(filePath, "utf-8");
    const $ = cheerio.load(htmlContent);

    // Actualizar campos del sidebar
    $('[data-section="institucion"]').text(institucion);
    $('[data-section="modalidad"]').text(modalidad);
    $('[data-section="tipoBeca"]').text(tipoBeca);
    $('[data-section="enlaceAplicacion"]').attr("href", enlaceAplicacion);

    // Actualizar listas de requisitos y costos
    const reqArr = requisitos.split("\n").map(r => r.trim()).filter(Boolean);
    const costArr = costos.split("\n").map(c => c.trim()).filter(Boolean);

    updateList($, "requisitos", reqArr);
    updateList($, "costos", costArr);
    $('[data-section="extraInfo"]').html(extraInfo || "");

    fs.writeFileSync(filePath, $.html());

    // Actualizar el JSON
    const becas = getBecas();
    const becaIndex = becas.findIndex(b => b.link === file);
    if (becaIndex !== -1) {
      becas[becaIndex] = {
        ...becas[becaIndex],
        requisitos: reqArr,
        costos: costArr,
        extraInfo: extraInfo || "",
        institucion,
        modalidad,
        tipoBeca,
        enlaceAplicacion
      };
      saveBecas(becas);
    }

    res.json({ message: `Detalle guardado en ${file}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar el detalle" });
  }
});

// PUT: Editar beca principal
// PUT: Editar beca principal
app.put("/api/becas/:id", upload.single("imagen"), (req, res) => {
  const becas = getBecas();
  const id = parseInt(req.params.id, 10);
  const index = becas.findIndex(b => b.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Beca no encontrada" });
  }
  const { titulo, fechaLimite, descripcion, requisitos, costos, extraInfo, institucion, modalidad, tipoBeca, enlaceAplicacion } = req.body;
  const oldBeca = becas[index];
  const timestamp = Date.now();

  // Si se sube una nueva imagen, eliminar la antigua (si no es default)
  let newImagen = oldBeca.imagen;
  if (req.file) {
    if (oldBeca.imagen && !oldBeca.imagen.includes("default.jpg")) {
      const oldImagePath = path.join(__dirname, oldBeca.imagen.split('?')[0]);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }
    newImagen = `${path.join("images", req.file.filename)}?v=${timestamp}`;
  }

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
    imagen: newImagen
  };

  becas[index] = updatedBeca;
  saveBecas(becas);

  // Actualizar HTML de la beca
  const filePath = path.join(__dirname, "pages", updatedBeca.link);
  if (fs.existsSync(filePath)) {
    const htmlContent = ejs.render(
      fs.readFileSync(path.join(__dirname, "templates", "beca.ejs"), "utf-8"),
      { beca: updatedBeca }
    );
    fs.writeFileSync(filePath, htmlContent);
  }

  res.json({
    message: "Beca actualizada correctamente",
    beca: updatedBeca
  });
});


// DELETE: Eliminar beca
// DELETE: Eliminar beca
app.delete("/api/becas/:id", (req, res) => {
  const becas = getBecas();
  const id = parseInt(req.params.id, 10);
  const index = becas.findIndex(b => b.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: "Beca no encontrada" });
  }
  
  const [deletedBeca] = becas.splice(index, 1);
  saveBecas(becas);
  
  // Eliminar la página HTML generada
  const pagePath = path.join(__dirname, "pages", deletedBeca.link);
  if (fs.existsSync(pagePath)) {
    fs.unlinkSync(pagePath);
  }
  
  // Eliminar la imagen, siempre y cuando no sea la imagen por defecto
  if (deletedBeca.imagen && !deletedBeca.imagen.includes("default.jpg")) {
    // Remover posible query string (?v=timestamp)
    const imagePath = path.join(__dirname, deletedBeca.imagen.split('?')[0]);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }
  
  res.json({ message: "Beca eliminada", beca: deletedBeca });
});


/* ============================ */
/* CRUD PARA EXPERIENCIAS         */
/* ============================ */
const EXPERIENCIAS_PATH = path.join(__dirname, "experiencias.json");
const getExperiencias = () => JSON.parse(fs.readFileSync(EXPERIENCIAS_PATH, "utf-8"));
const saveExperiencias = (experiencias) =>
  fs.writeFileSync(EXPERIENCIAS_PATH, JSON.stringify(experiencias, null, 2));

// GET: Listar experiencias
app.get("/api/experiencias", (req, res) => {
  res.json(getExperiencias());
});

// POST: Crear experiencia
app.post("/api/experiencias", upload.single("imagen"), (req, res) => {
  const experiencias = getExperiencias();
  const newId = experiencias.length ? Math.max(...experiencias.map(exp => exp.id)) + 1 : 1;
  const { titulo, descripcion, resena } = req.body;  // Usamos "resena" en lugar de "reseña"
  const imagePath = req.file
    ? path.join("images", req.file.filename).replace(/\\/g, "/")
    : "images/default.jpg";
  const slug = slugify(titulo || "experiencia-sin-titulo", { lower: true, strict: true });
  const fileName = `experiencia_${slug}.html`;
  const newExperiencia = {
    id: newId,
    titulo,
    descripcion,
    resena,  // propiedad corregida
    imagen: imagePath,
    link: fileName
  };
  experiencias.push(newExperiencia);
  saveExperiencias(experiencias);

  // Generar HTML usando la plantilla experiencia.ejs
  const htmlContent = ejs.render(
    fs.readFileSync(path.join(__dirname, "templates", "experiencia.ejs"), "utf-8"),
    { experiencia: newExperiencia }
  );
  fs.writeFileSync(path.join(__dirname, "pages", fileName), htmlContent);

  res.status(201).json({
    message: "Experiencia creada",
    experiencia: newExperiencia,
    detailFile: fileName
  });
});

// PUT: Editar experiencia principal
// PUT: Editar experiencia principal
app.put("/api/experiencias/:id", upload.single("imagen"), (req, res) => {
  const experiencias = getExperiencias();
  const id = parseInt(req.params.id, 10);
  const index = experiencias.findIndex(exp => exp.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Experiencia no encontrada" });
  }
  const { titulo, descripcion, resena } = req.body; // Usamos "resena" sin tilde
  const oldExp = experiencias[index];
  const timestamp = Date.now();

  // Si se sube una nueva imagen, eliminar la anterior (si no es default)
  let newImagen = oldExp.imagen;
  if (req.file) {
    if (oldExp.imagen && !oldExp.imagen.includes("default.jpg")) {
      const oldImagePath = path.join(__dirname, oldExp.imagen.split('?')[0]);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }
    newImagen = `${path.join("images", req.file.filename)}?v=${timestamp}`;
  }

  const updatedExperiencia = {
    ...oldExp,
    titulo: titulo || oldExp.titulo,
    descripcion: descripcion || oldExp.descripcion,
    resena: resena || oldExp.resena,  // Actualización usando "resena"
    imagen: newImagen
  };

  experiencias[index] = updatedExperiencia;
  saveExperiencias(experiencias);

  // Actualizar HTML de la experiencia
  const filePath = path.join(__dirname, "pages", updatedExperiencia.link);
  if (fs.existsSync(filePath)) {
    const htmlContent = ejs.render(
      fs.readFileSync(path.join(__dirname, "templates", "experiencia.ejs"), "utf-8"),
      { experiencia: updatedExperiencia }
    );
    fs.writeFileSync(filePath, htmlContent);
  }
  res.json({
    message: "Experiencia actualizada correctamente",
    experiencia: updatedExperiencia
  });
});


// DELETE: Eliminar experiencia
// DELETE: Eliminar experiencia
app.delete("/api/experiencias/:id", (req, res) => {
  let experiencias = getExperiencias();
  const id = parseInt(req.params.id, 10);
  const index = experiencias.findIndex(exp => exp.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: "Experiencia no encontrada" });
  }
  
  const [deletedExperiencia] = experiencias.splice(index, 1);
  saveExperiencias(experiencias);
  
  // Eliminar la página HTML generada
  const pagePath = path.join(__dirname, "pages", deletedExperiencia.link);
  if (fs.existsSync(pagePath)) {
    fs.unlinkSync(pagePath);
  }
  
  // Eliminar la imagen, siempre y cuando no sea la imagen por defecto
  if (deletedExperiencia.imagen && !deletedExperiencia.imagen.includes("default.jpg")) {
    const imagePath = path.join(__dirname, deletedExperiencia.imagen.split('?')[0]);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }
  
  res.json({ message: "Experiencia eliminada", experiencia: deletedExperiencia });
});
/* ============================ */
/* CRUD PARA INTERNACIONALES    */
/* ============================ */
const INTERNACIONALES_PATH = path.join(__dirname, "internacionales.json");

const getInternacionales = () => {
  if (!fs.existsSync(INTERNACIONALES_PATH)) {
    fs.writeFileSync(INTERNACIONALES_PATH, "[]");
  }
  return JSON.parse(fs.readFileSync(INTERNACIONALES_PATH, "utf-8"));
};

const saveInternacionales = (data) => {
  fs.writeFileSync(INTERNACIONALES_PATH, JSON.stringify(data, null, 2));
};

// GET: Listar todos
app.get('/api/internacionales', (req, res) => {
  try {
    const data = getInternacionales();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Error al leer los datos" });
  }
});

// GET: Obtener un internacional por ID
app.get('/api/internacionales/:id', (req, res) => {
  try {
    const internacionales = getInternacionales();
    const id = parseInt(req.params.id);
    const item = internacionales.find(i => i.id === id);

    if (!item) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }

    res.json(item);
    
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el registro" });
  }
});

// POST: Crear nuevo
app.post('/api/internacionales', upload.single('imagen'), (req, res) => {
  try {
    const internacionales = getInternacionales();
    const { titulo, descripcion, contenido } = req.body;

    // Validación básica
    if (!titulo || !descripcion || !contenido) {
      return res.status(400).json({ error: "Faltan campos requeridos" });
    }

    // Generar nombre del archivo
    const slug = slugify(titulo, { lower: true, strict: true });
    const fileName = `internacional_${slug}_${Date.now()}.html`;
    const imagePath = req.file ? `images/${req.file.filename}` : "images/default.jpg";

    const nuevoItem = {
      id: internacionales.length + 1,
      titulo,
      descripcion,
      contenido,
      imagen: imagePath,
      link: fileName,
      fechaCreacion: new Date().toISOString()
    };

    // Guardar en JSON
    internacionales.push(nuevoItem);
    saveInternacionales(internacionales);

    // Generar HTML
    const template = fs.readFileSync(path.join(__dirname, "templates", "internacional.ejs"), "utf-8");
    const html = ejs.render(template, { internacional: nuevoItem });
    fs.writeFileSync(path.join(__dirname, "pages", fileName), html);

    res.status(201).json(nuevoItem);

  } catch (error) {
    console.error("Error POST:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PUT: Actualizar existente
app.put('/api/internacionales/:id', upload.single('imagen'), (req, res) => {
  try {
    const internacionales = getInternacionales();
    const id = parseInt(req.params.id);
    const itemIndex = internacionales.findIndex(item => item.id === id);

    if (itemIndex === -1) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }

    const itemActual = internacionales[itemIndex];
    const { titulo, descripcion, contenido } = req.body;

    // Actualizar campos
    const updatedItem = {
      ...itemActual,
      titulo: titulo || itemActual.titulo,
      descripcion: descripcion || itemActual.descripcion,
      contenido: contenido || itemActual.contenido,
      imagen: itemActual.imagen // Mantener por defecto a menos que se actualice
    };

    // Manejar nueva imagen
    if (req.file) {
      // Eliminar imagen anterior si no es la default
      if (itemActual.imagen !== "images/default.jpg") {
        const oldImagePath = path.join(__dirname, itemActual.imagen);
        if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
      }
      updatedItem.imagen = `images/${req.file.filename}`;
    }

    // Actualizar archivo HTML
    const template = fs.readFileSync(path.join(__dirname, "templates", "internacional.ejs"), "utf-8");
    const html = ejs.render(template, { internacional: updatedItem });
    fs.writeFileSync(path.join(__dirname, "pages", updatedItem.link), html);

    // Actualizar JSON
    internacionales[itemIndex] = updatedItem;
    saveInternacionales(internacionales);

    res.json(updatedItem);

  } catch (error) {
    console.error("Error PUT:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// DELETE: Eliminar
app.delete('/api/internacionales/:id', (req, res) => {
  try {
    const internacionales = getInternacionales();
    const id = parseInt(req.params.id);
    const itemIndex = internacionales.findIndex(item => item.id === id);

    if (itemIndex === -1) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }

    const [deletedItem] = internacionales.splice(itemIndex, 1);
    
    // Eliminar archivos asociados
    if (deletedItem.imagen !== "images/default.jpg") {
      const imagePath = path.join(__dirname, deletedItem.imagen);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }

    const pagePath = path.join(__dirname, "pages", deletedItem.link);
    if (fs.existsSync(pagePath)) fs.unlinkSync(pagePath);

    saveInternacionales(internacionales);
    res.json({ message: "Registro eliminado", deletedItem });

  } catch (error) {
    console.error("Error DELETE:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Manejo de errores de Multer
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(413).json({
      error: err.code === 'LIMIT_FILE_SIZE' 
        ? 'El archivo es demasiado grande (Máx. 10MB)' 
        : 'Error al subir el archivo'
    });
  }
  next(err);
});


// ==============================
// CRUD PARA CONTACTOS
// ==============================

const CONTACTOS_PATH = path.join(__dirname, "contactos.json");

// Helper functions
const getContactos = () => {
  try {
    if (!fs.existsSync(CONTACTOS_PATH)) {
      fs.writeFileSync(CONTACTOS_PATH, "[]");
    }
    return JSON.parse(fs.readFileSync(CONTACTOS_PATH, "utf-8"));
  } catch (error) {
    console.error("Error leyendo contactos:", error);
    return [];
  }
};

const saveContactos = (data) => {
  fs.writeFileSync(CONTACTOS_PATH, JSON.stringify(data, null, 2));
};

// Eliminar imagen antigua si no es la default
const deleteContactoImage = (imagePath) => {
  if (imagePath && !imagePath.includes("default-contact.jpg")) {
    const fullPath = path.join(__dirname, imagePath.split('?')[0]);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
};

// GET: Listar todos los contactos
app.get('/api/contactos', (req, res) => {
  try {
    const contactos = getContactos();
    res.json(contactos);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener contactos" });
  }
});

// POST: Crear nuevo contacto
app.post('/api/contactos', upload.single('imagen'), (req, res) => {
  try {
    const contactos = getContactos();
    const { nombre, puesto, correo, descripcion } = req.body;

    // Validación básica
    if (!nombre || !puesto || !correo) {
      return res.status(400).json({ error: "Faltan campos requeridos" });
    }

    const newId = contactos.length > 0 ? Math.max(...contactos.map(c => c.id)) + 1 : 1;

    const imagePath = req.file 
      ? path.join("images", req.file.filename).replace(/\\/g, "/")
      : "images/default-contact.jpg";

    const nuevoContacto = {
      id: newId,
      nombre,
      puesto,
      correo,
      descripcion: descripcion || "",
      imagen: imagePath,
      fechaCreacion: new Date().toISOString()
    };

    contactos.push(nuevoContacto);
    saveContactos(contactos);
    
    res.status(201).json(nuevoContacto);
    
  } catch (error) {
    console.error("Error creando contacto:", error);
    res.status(500).json({ error: "Error al crear contacto" });
  }
});

// PUT: Actualizar contacto
app.put('/api/contactos/:id', upload.single('imagen'), (req, res) => {
  try {
    const contactos = getContactos();
    const id = parseInt(req.params.id);
    const contactoIndex = contactos.findIndex(c => c.id === id);

    if (contactoIndex === -1) {
      return res.status(404).json({ error: "Contacto no encontrado" });
    }

    const oldContacto = contactos[contactoIndex];
    const { nombre, puesto, correo, descripcion } = req.body;
    const timestamp = Date.now();

    // Manejo de imagen
    let newImage = oldContacto.imagen;
    if (req.file) {
      deleteContactoImage(oldContacto.imagen);
      newImage = `${path.join("images", req.file.filename)}?v=${timestamp}`;
    }

    const updatedContacto = {
      ...oldContacto,
      nombre: nombre || oldContacto.nombre,
      puesto: puesto || oldContacto.puesto,
      correo: correo || oldContacto.correo,
      descripcion: descripcion || oldContacto.descripcion,
      imagen: newImage
    };

    contactos[contactoIndex] = updatedContacto;
    saveContactos(contactos);

    res.json(updatedContacto);

  } catch (error) {
    console.error("Error actualizando contacto:", error);
    res.status(500).json({ error: "Error al actualizar contacto" });
  }
});

// DELETE: Eliminar contacto
app.delete('/api/contactos/:id', (req, res) => {
  try {
    const contactos = getContactos();
    const id = parseInt(req.params.id);
    const contactoIndex = contactos.findIndex(c => c.id === id);

    if (contactoIndex === -1) {
      return res.status(404).json({ error: "Contacto no encontrado" });
    }

    const [deletedContacto] = contactos.splice(contactoIndex, 1);
    saveContactos(contactos);

    // Eliminar imagen asociada
    deleteContactoImage(deletedContacto.imagen);

    res.json({ message: "Contacto eliminado", deletedContacto });

  } catch (error) {
    console.error("Error eliminando contacto:", error);
    res.status(500).json({ error: "Error al eliminar contacto" });
  }
});


/* ============================ */
// Inicializar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
