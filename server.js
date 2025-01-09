// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Servir tus archivos estáticos (HTML, CSS, imágenes, etc.)
// Ajusta la ruta si quieres que la carpeta root sea "INTERNALIZACION"
app.use(express.static(path.join(__dirname)));

// Ejemplo de becas.json en la raíz
const BECAS_PATH = path.join(__dirname, 'becas.json');

// READ: Obtener todas las becas en /api/becas
app.get('/api/becas', (req, res) => {
  const data = fs.readFileSync(BECAS_PATH, 'utf-8');
  const becas = JSON.parse(data);
  res.json(becas);
});

// (Opcional) CREATE, UPDATE, DELETE si implementarás todo el CRUD

// CREATE
app.post('/api/becas', (req, res) => {
    const data = fs.readFileSync('becas.json', 'utf-8');
    let becas = JSON.parse(data);
  
    const newId = becas.length ? Math.max(...becas.map(b => b.id)) + 1 : 1;
    const newBeca = {
      id: newId,
      titulo: req.body.titulo,
      fechaLimite: req.body.fechaLimite,
      descripcion: req.body.descripcion,
      imagen: req.body.imagen,
      link: req.body.link
    };
    becas.push(newBeca);
    fs.writeFileSync('becas.json', JSON.stringify(becas, null, 2), 'utf-8');
    res.status(201).json({ message: 'Beca creada', beca: newBeca });
  });
  
  // UPDATE
  app.put('/api/becas/:id', (req, res) => {
    const { id } = req.params;
    const data = fs.readFileSync('becas.json', 'utf-8');
    let becas = JSON.parse(data);
  
    const index = becas.findIndex(b => b.id === parseInt(id, 10));
    if (index !== -1) {
      becas[index].titulo = req.body.titulo;
      becas[index].fechaLimite = req.body.fechaLimite;
      becas[index].descripcion = req.body.descripcion;
      becas[index].imagen = req.body.imagen;
      becas[index].link = req.body.link;
  
      fs.writeFileSync('becas.json', JSON.stringify(becas, null, 2), 'utf-8');
      res.json({ message: 'Beca actualizada', beca: becas[index] });
    } else {
      res.status(404).json({ error: 'Beca no encontrada' });
    }
  });
  

// ...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});