const defaultData = require('../services/mantenimientoData');
const defaultExportService = require('../services/mantenimientoExportService');

const FORMATOS = {
  pdf: {
    mime: 'application/pdf',
    extension: 'pdf',
  },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  },
};

const fechaArchivo = () => new Date().toISOString().slice(0, 10);

const createMantenimientoExportController = ({
  data = defaultData,
  exportService = defaultExportService,
} = {}) => {
  const obtenerFormato = (req, res) => {
    const formato = String(req.query.formato || '').toLowerCase();
    if (!FORMATOS[formato]) {
      res.status(400).json({ error: 'Formato inválido. Usa pdf o xlsx.' });
      return null;
    }
    return formato;
  };

  const enviarArchivo = (res, { buffer, formato, nombre }) => {
    res.setHeader('Content-Type', FORMATOS[formato].mime);
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  };

  const generarDetalle = (formato, mantenimiento) => (
    formato === 'pdf'
      ? exportService.generarPdfMantenimiento(mantenimiento)
      : exportService.generarXlsxMantenimiento(mantenimiento)
  );

  const generarListado = (formato, mantenimientos, opciones) => (
    formato === 'pdf'
      ? exportService.generarPdfListado(mantenimientos, opciones)
      : exportService.generarXlsxListado(mantenimientos, opciones)
  );

  const exportMantenimiento = async (req, res) => {
    const formato = obtenerFormato(req, res);
    if (!formato) return;

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de mantenimiento inválido' });
    }

    try {
      const mantenimiento = await data.obtenerMantenimientoPorId(id);
      if (!mantenimiento) {
        return res.status(404).json({ error: 'Mantenimiento no encontrado' });
      }

      const buffer = await generarDetalle(formato, mantenimiento);
      const nombre = `mantenimiento-${id}-${fechaArchivo()}.${FORMATOS[formato].extension}`;
      return enviarArchivo(res, { buffer, formato, nombre });
    } catch (err) {
      console.error('Error al exportar mantenimiento:', err);
      return res.status(500).json({ error: 'Error al generar el archivo de mantenimiento' });
    }
  };

  const exportMantenimientos = async (req, res) => {
    const formato = obtenerFormato(req, res);
    if (!formato) return;

    const estado = req.query.estado ? String(req.query.estado).trim() : undefined;

    try {
      const mantenimientos = await data.obtenerMantenimientos({ estado });
      if (mantenimientos.length === 0) {
        return res.status(404).json({ error: 'No hay mantenimientos para exportar' });
      }

      const buffer = await generarListado(formato, mantenimientos, { estado });
      const nombre = `mantenimientos-${fechaArchivo()}.${FORMATOS[formato].extension}`;
      return enviarArchivo(res, { buffer, formato, nombre });
    } catch (err) {
      console.error('Error al exportar mantenimientos:', err);
      return res.status(500).json({ error: 'Error al generar el archivo de mantenimientos' });
    }
  };

  return { exportMantenimiento, exportMantenimientos };
};

const controlador = createMantenimientoExportController();

module.exports = {
  ...controlador,
  createMantenimientoExportController,
};
