const express = require('express');
const { getMantenimientos, descargarOrdenMantenimiento, createMantenimiento, updateMantenimientoFull, updateMantenimientoEstado } = require('../controllers/mantenimientoController');
const router = express.Router();

router.get('/', getMantenimientos);
router.get('/:id/orden.pdf', descargarOrdenMantenimiento);
router.post('/', createMantenimiento);
router.put('/:id', updateMantenimientoFull);
router.put('/:id/estado', updateMantenimientoEstado);

module.exports = router;
