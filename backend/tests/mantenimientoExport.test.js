const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { PDFParse } = require('pdf-parse');
const {
  LOGO_PATH,
  dimensionesPng,
  ajustarDimensiones,
  calcularTotales,
  generarPdfMantenimiento,
  generarPdfListado,
  generarXlsxMantenimiento,
  generarXlsxListado,
} = require('../services/mantenimientoExportService');

const mantenimiento = {
  id: 12,
  cliente_nombre: 'Juan Pérez',
  cliente_email: 'juan@example.com',
  vehiculo: 'Toyota Corolla • ABC123',
  vehiculo_placa: 'ABC123',
  vehiculo_marca: 'Toyota',
  vehiculo_modelo: 'Corolla',
  fecha: '2026-11-20',
  tecnico: 'Luis Ramírez',
  kilometraje: '45000',
  estado: 'Completado',
  observaciones: 'Cambio de aceite y revisión general.',
  costo_final: 430,
  servicios: [
    { id: 1, nombre: 'Afinación', descripcion: 'Afinación mayor', precio: 300 },
  ],
  productos: [
    { id: 1, nombre: 'Aceite 5W-30', cantidad: 2, precio: 65 },
  ],
  checklist: [
    { id: 'aceite', item: 'Nivel de aceite', estado: 'Cambiado', nota: '5W-30' },
  ],
};

const extraerTextoPdf = async (buffer) => {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const resultado = await parser.getText();
    return resultado.text;
  } finally {
    await parser.destroy();
  }
};

const leerWorkbook = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
};

const valoresHoja = (worksheet) => {
  const valores = [];
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (cell.value != null) valores.push(String(cell.value));
    });
  });
  return valores.join(' | ');
};

test('calcula subtotales de servicios y refacciones', () => {
  assert.deepEqual(calcularTotales(mantenimiento), {
    subtotalServicios: 300,
    subtotalRefacciones: 130,
    totalFinal: 430,
  });
});

test('el logo conserva la proporcion original', () => {
  const buffer = fs.readFileSync(LOGO_PATH);
  const dimensiones = dimensionesPng(buffer);
  const ajustado = ajustarDimensiones(dimensiones, 150, 45);
  const proporcionOriginal = dimensiones.width / dimensiones.height;
  const proporcionAjustada = ajustado.width / ajustado.height;

  assert.equal(dimensiones.width, 579);
  assert.equal(dimensiones.height, 146);
  assert.ok(Math.abs(proporcionOriginal - proporcionAjustada) < 0.02);
});

test('genera un PDF individual valido con todos los datos', async () => {
  const buffer = await generarPdfMantenimiento(mantenimiento);

  assert.equal(Buffer.isBuffer(buffer), true);
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');

  const texto = await extraerTextoPdf(buffer);
  assert.match(texto, /Juan Pérez/);
  assert.match(texto, /Toyota Corolla/);
  assert.match(texto, /Luis Ramírez/);
  assert.match(texto, /Afinación/);
  assert.match(texto, /Aceite 5W-30/);
  assert.match(texto, /Nivel de aceite/);
  assert.match(texto, /Cambio de aceite y revisión general/);
  assert.match(texto, /300\.00/);
  assert.match(texto, /130\.00/);
  assert.match(texto, /430\.00/);
});

test('genera un PDF de listado valido', async () => {
  const buffer = await generarPdfListado([mantenimiento], { estado: 'Completado' });
  const texto = await extraerTextoPdf(buffer);

  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  assert.match(texto, /LISTADO DE\s+MANTENIMIENTOS/);
  assert.match(texto, /Juan Pérez/);
  assert.match(texto, /Afinación/);
  assert.match(texto, /Aceite 5W-30/);
  assert.match(texto, /430\.00/);
});

test('genera un XLSX individual con datos, totales y logo', async () => {
  const buffer = await generarXlsxMantenimiento(mantenimiento);
  const workbook = await leerWorkbook(buffer);
  const worksheet = workbook.getWorksheet('Mantenimiento');
  const texto = valoresHoja(worksheet);
  const imagenes = worksheet.getImages();

  assert.equal(buffer.subarray(0, 2).toString('hex'), '504b');
  assert.match(texto, /Juan Pérez/);
  assert.match(texto, /Afinación/);
  assert.match(texto, /Aceite 5W-30/);
  assert.match(texto, /Nivel de aceite/);
  assert.match(texto, /430/);
  assert.equal(imagenes.length, 1);

  const extension = imagenes[0].range.ext;
  assert.ok(Math.abs((extension.width / extension.height) - (579 / 146)) < 0.05);
});

test('genera un XLSX de listado con total general y logo', async () => {
  const buffer = await generarXlsxListado([mantenimiento], { estado: 'Completado' });
  const workbook = await leerWorkbook(buffer);
  const worksheet = workbook.getWorksheet('Mantenimientos');
  const texto = valoresHoja(worksheet);

  assert.match(texto, /LISTADO DE MANTENIMIENTOS/);
  assert.match(texto, /Juan Pérez/);
  assert.match(texto, /Afinación/);
  assert.match(texto, /Aceite 5W-30/);
  assert.match(texto, /430/);
  assert.equal(worksheet.getImages().length, 1);
});
