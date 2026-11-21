const express = require('express');
const {
  getMantenimientos,
  descargarOrdenMantenimiento,
  createMantenimiento,
  updateMantenimientoFull,
  updateMantenimientoEstado,
} = require('../controllers/mantenimientoController');
const defaultExportController = require('../controllers/mantenimientoExportController');
const { authenticateToken, requireRole } = require('../middleware/auth');

function createMantenimientoRouter({ exportController = defaultExportController } = {}) {
  const router = express.Router();

  router.get('/', getMantenimientos);
  router.get('/:id/orden.pdf', descargarOrdenMantenimiento);
  router.get('/export', authenticateToken, requireRole('Administrador'), exportController.exportMantenimientos);
  router.get('/:id/export', authenticateToken, requireRole('Administrador'), exportController.exportMantenimiento);
  router.post('/', createMantenimiento);
  router.put('/:id', updateMantenimientoFull);
  router.put('/:id/estado', updateMantenimientoEstado);

  return router;
}

const router = createMantenimientoRouter();

module.exports = router;
module.exports.createMantenimientoRouter = createMantenimientoRouter;
