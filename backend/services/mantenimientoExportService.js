const fs = require('fs');
const path = require('path');

let PDFDocument;
let ExcelJS;

const obtenerPDFDocument = () => {
  if (!PDFDocument) PDFDocument = require('pdfkit');
  return PDFDocument;
};

const obtenerExcelJS = () => {
  if (!ExcelJS) ExcelJS = require('exceljs');
  return ExcelJS;
};

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png');
const NEGRO = '#0f172a';
const GRIS = '#475569';
const BORDE = '#cbd5e1';

const formatoMoneda = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

const numero = (valor) => {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
};

const formatoFecha = (fecha) => {
  if (!fecha) return '-';
  const valor = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(valor.getTime())) return String(fecha);
  return valor.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const fechaArchivo = (fecha = new Date()) => fecha.toISOString().slice(0, 10);

const dimensionesPng = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) {
    throw new Error('El logo no es un archivo PNG válido');
  }
  if (buffer.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('El logo no es un archivo PNG válido');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const ajustarDimensiones = (origen, maxAncho, maxAlto) => {
  const escala = Math.min(maxAncho / origen.width, maxAlto / origen.height);
  return {
    width: Math.max(1, Math.round(origen.width * escala)),
    height: Math.max(1, Math.round(origen.height * escala)),
  };
};

let logoCache = null;
const obtenerLogo = () => {
  if (!logoCache) {
    const buffer = fs.readFileSync(LOGO_PATH);
    logoCache = { buffer, ...dimensionesPng(buffer) };
  }
  return logoCache;
};

const calcularTotales = (mantenimiento) => {
  const subtotalServicios = (mantenimiento.servicios || [])
    .reduce((total, servicio) => total + numero(servicio.precio), 0);
  const subtotalRefacciones = (mantenimiento.productos || [])
    .reduce((total, producto) => {
      const cantidad = Math.max(1, Math.trunc(numero(producto.cantidad)) || 1);
      return total + (numero(producto.precio) * cantidad);
    }, 0);
  const totalGuardado = mantenimiento.costo_final == null ? null : numero(mantenimiento.costo_final);
  const totalFinal = totalGuardado == null ? subtotalServicios + subtotalRefacciones : totalGuardado;

  return { subtotalServicios, subtotalRefacciones, totalFinal };
};

const textoServicios = (mantenimiento) => {
  const servicios = mantenimiento.servicios || [];
  if (servicios.length === 0) return 'Sin servicios';
  return servicios
    .map((servicio) => `${servicio.nombre} (${formatoMoneda.format(numero(servicio.precio))})`)
    .join('; ');
};

const textoRefacciones = (mantenimiento) => {
  const productos = mantenimiento.productos || [];
  if (productos.length === 0) return 'Sin refacciones';
  return productos
    .map((producto) => {
      const cantidad = Math.max(1, Math.trunc(numero(producto.cantidad)) || 1);
      return `${producto.nombre} x${cantidad} (${formatoMoneda.format(numero(producto.precio))} c/u)`;
    })
    .join('; ');
};

const textoChecklist = (mantenimiento) => {
  const checklist = mantenimiento.checklist || [];
  if (checklist.length === 0) return 'Sin checklist';
  return checklist
    .map((item) => {
      const nota = item.nota ? ` (${item.nota})` : '';
      return `${item.item}: ${item.estado || 'Pendiente'}${nota}`;
    })
    .join('; ');
};

const crearDocumento = (layout = 'portrait', titulo) => {
  const PDFDocument = obtenerPDFDocument();
  const doc = new PDFDocument({
    size: 'A4',
    layout,
    margins: { top: 40, right: 40, bottom: 50, left: 40 },
    bufferPages: true,
    info: {
      Title: titulo,
      Author: 'Auto Servicio San Jorge S.A. de C.V.',
      Subject: titulo,
    },
  });

  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const completado = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  return { doc, completado };
};

const dibujarCabecera = (doc, titulo, subtitulo) => {
  const logo = obtenerLogo();
  const dimensiones = ajustarDimensiones(logo, 150, 45);
  const margenIzquierdo = doc.page.margins.left;
  const margenDerecho = doc.page.margins.right;
  const anchoPagina = doc.page.width;
  const inicioY = doc.page.margins.top;

  doc.image(logo.buffer, margenIzquierdo, inicioY, {
    width: dimensiones.width,
    height: dimensiones.height,
  });

  const anchoEmpresa = 230;
  const xEmpresa = anchoPagina - margenDerecho - anchoEmpresa;
  doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(10);
  doc.text('Auto Servicio San Jorge S.A. de C.V.', xEmpresa, inicioY, {
    width: anchoEmpresa,
    align: 'right',
  });
  doc.font('Helvetica').fontSize(7.5).fillColor(GRIS);
  doc.text(
    'Calle 10, No. 505, Col. Centro, San Jorge, México\nTel: +52 1 234 567 890\nwww.autoserviciosanjorge.com',
    xEmpresa,
    doc.y,
    { width: anchoEmpresa, align: 'right' }
  );

  const lineaY = Math.max(inicioY + dimensiones.height + 10, doc.y + 4);
  doc.moveTo(margenIzquierdo, lineaY)
    .lineTo(anchoPagina - margenDerecho, lineaY)
    .strokeColor(BORDE)
    .lineWidth(1)
    .stroke();

  doc.y = lineaY + 14;
  doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(16);
  doc.text(titulo, { align: 'center' });

  if (subtitulo) {
    doc.font('Helvetica').fontSize(8.5).fillColor(GRIS);
    doc.text(subtitulo, { align: 'center' });
  }

  doc.fillColor(NEGRO);
  doc.moveDown(0.7);
};

const dibujarTituloSeccion = (doc, titulo, subtitulo) => {
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NEGRO).text(titulo);
  if (subtitulo) {
    doc.font('Helvetica').fontSize(7.5).fillColor(GRIS).text(subtitulo);
  }
  doc.fillColor(NEGRO);
  doc.moveDown(0.3);
};

const dibujarInfo = (doc, filas) => {
  const contenidoAncho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const anchoEtiqueta = 72;
  const anchoValor = (contenidoAncho / 2) - anchoEtiqueta;
  const altoFila = 14;

  for (let indice = 0; indice < filas.length; indice += 2) {
    const y = doc.y;

    const escribir = (fila, columna) => {
      if (!fila) return;
      const x = doc.page.margins.left + (columna * (contenidoAncho / 2));

      doc.font('Helvetica-Bold').fontSize(8).fillColor(GRIS);
      doc.text(`${fila[0]}:`, x, y, { width: anchoEtiqueta, lineBreak: false });
      doc.font('Helvetica').fontSize(8.5).fillColor(NEGRO);
      doc.text(String(fila[1] || '-'), x + anchoEtiqueta, y, {
        width: Math.max(40, anchoValor),
        lineBreak: false,
        ellipsis: true,
      });
    };

    escribir(filas[indice], 0);
    escribir(filas[indice + 1], 1);
    doc.y = y + altoFila;
  }

  doc.fillColor(NEGRO);
  doc.moveDown(0.3);
};

const dibujarTabla = (doc, columns, rows, { fontSize = 8, vacio = 'Sin registros' } = {}) => {
  const inicioX = doc.page.margins.left;
  const anchoTotal = columns.reduce((total, columna) => total + columna.width, 0);
  const limiteInferior = doc.page.height - doc.page.margins.bottom;
  const padding = 4;

  if (rows.length === 0) {
    doc.font('Helvetica').fontSize(fontSize).fillColor(GRIS).text(vacio);
    doc.fillColor(NEGRO);
    return;
  }

  const dibujarEncabezado = () => {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(fontSize);
    const alto = Math.max(
      ...columns.map((columna) => doc.heightOfString(columna.label, { width: columna.width - (padding * 2) })),
      fontSize
    ) + (padding * 2);

    doc.save();
    doc.rect(inicioX, y, anchoTotal, alto).fill('#e2e8f0');
    doc.restore();

    let x = inicioX;
    doc.fillColor(NEGRO);
    columns.forEach((columna) => {
      doc.text(columna.label, x + padding, y + padding, {
        width: columna.width - (padding * 2),
        align: columna.align || 'left',
      });
      x += columna.width;
    });

    doc.y = y + alto;
    doc.font('Helvetica').fillColor(NEGRO);
  };

  dibujarEncabezado();

  rows.forEach((fila, indice) => {
    doc.font('Helvetica').fontSize(fontSize);
    const alturas = columns.map((columna, columnaIndice) => {
      const valor = String(fila[columnaIndice] ?? '');
      return doc.heightOfString(valor, { width: columna.width - (padding * 2) });
    });
    const alto = Math.max(...alturas, fontSize) + (padding * 2);

    if (doc.y + alto > limiteInferior) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      dibujarEncabezado();
    }

    const y = doc.y;
    if (indice % 2 === 1) {
      doc.save();
      doc.rect(inicioX, y, anchoTotal, alto).fill('#f8fafc');
      doc.restore();
    }

    let x = inicioX;
    doc.fillColor(NEGRO).font('Helvetica').fontSize(fontSize);
    columns.forEach((columna, columnaIndice) => {
      doc.text(String(fila[columnaIndice] ?? ''), x + padding, y + padding, {
        width: columna.width - (padding * 2),
        align: columna.align || 'left',
      });
      x += columna.width;
    });

    doc.y = y + alto;
    doc.moveTo(inicioX, doc.y)
      .lineTo(inicioX + anchoTotal, doc.y)
      .strokeColor('#e2e8f0')
      .lineWidth(0.5)
      .stroke();
  });

  doc.fillColor(NEGRO);
  doc.moveDown(0.5);
};

const dibujarTotales = (doc, totales) => {
  doc.font('Helvetica').fontSize(8.5).fillColor(GRIS);
  doc.text(`Subtotal servicios: ${formatoMoneda.format(totales.subtotalServicios)}`, { align: 'right' });
  doc.text(`Subtotal refacciones: ${formatoMoneda.format(totales.subtotalRefacciones)}`, { align: 'right' });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NEGRO);
  doc.text(`Total final: ${formatoMoneda.format(totales.totalFinal)}`, { align: 'right' });
  doc.moveDown(0.5);
};

const dibujarPie = (doc) => {
  const rango = doc.bufferedPageRange();
  const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  for (let indice = 0; indice < rango.count; indice += 1) {
    doc.switchToPage(indice);
    const margenInferiorOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7).fillColor('#64748b');
    doc.text(
      `Página ${indice + 1} de ${rango.count}`,
      doc.page.margins.left,
      doc.page.height - 30,
      { width: ancho, align: 'center' }
    );
    doc.page.margins.bottom = margenInferiorOriginal;
  }
  doc.fillColor(NEGRO);
};

const generarPdfMantenimiento = async (mantenimiento) => {
  const { doc, completado } = crearDocumento('portrait', `Mantenimiento ${mantenimiento.id}`);
  const totales = calcularTotales(mantenimiento);

  dibujarCabecera(
    doc,
    `ORDEN DE MANTENIMIENTO #${mantenimiento.id}`,
    `Fecha del servicio: ${formatoFecha(mantenimiento.fecha)} · Estado: ${mantenimiento.estado || 'Sin estado'}`
  );

  dibujarInfo(doc, [
    ['Cliente', mantenimiento.cliente_nombre || 'Sin cliente'],
    ['Vehículo', mantenimiento.vehiculo || 'Sin vehículo'],
    ['Correo', mantenimiento.cliente_email || '-'],
    ['Placa', mantenimiento.vehiculo_placa || '-'],
    ['Kilometraje', mantenimiento.kilometraje || '-'],
    ['Técnico', mantenimiento.tecnico || 'Sin asignar'],
  ]);

  dibujarTituloSeccion(doc, 'Servicios realizados');
  dibujarTabla(
    doc,
    [
      { label: 'Servicio', width: 180 },
      { label: 'Descripción', width: 245 },
      { label: 'Importe', width: 90, align: 'right' },
    ],
    (mantenimiento.servicios || []).map((servicio) => [
      servicio.nombre,
      servicio.descripcion || '-',
      formatoMoneda.format(numero(servicio.precio)),
    ]),
    { vacio: 'Sin servicios registrados' }
  );

  dibujarTituloSeccion(doc, 'Refacciones utilizadas');
  dibujarTabla(
    doc,
    [
      { label: 'Refacción', width: 190 },
      { label: 'Cantidad', width: 55, align: 'center' },
      { label: 'Precio unitario', width: 90, align: 'right' },
      { label: 'Subtotal', width: 90, align: 'right' },
    ],
    (mantenimiento.productos || []).map((producto) => {
      const cantidad = Math.max(1, Math.trunc(numero(producto.cantidad)) || 1);
      return [
        producto.nombre,
        String(cantidad),
        formatoMoneda.format(numero(producto.precio)),
        formatoMoneda.format(numero(producto.precio) * cantidad),
      ];
    }),
    { vacio: 'Sin refacciones registradas' }
  );

  if ((mantenimiento.checklist || []).length > 0) {
    dibujarTituloSeccion(doc, 'Checklist de inspección');
    dibujarTabla(
      doc,
      [
        { label: 'Punto de revisión', width: 245 },
        { label: 'Estado', width: 80 },
        { label: 'Nota', width: 190 },
      ],
      mantenimiento.checklist.map((item) => [
        item.item,
        item.estado || 'Pendiente',
        item.nota || '-',
      ])
    );
  }

  dibujarTituloSeccion(doc, 'Observaciones');
  doc.font('Helvetica').fontSize(8.5).fillColor(NEGRO).text(mantenimiento.observaciones || 'Sin observaciones');
  doc.moveDown(0.8);

  dibujarTotales(doc, totales);
  dibujarPie(doc);
  doc.end();

  return completado;
};

const generarPdfListado = async (mantenimientos, { estado } = {}) => {
  const { doc, completado } = crearDocumento('landscape', 'Listado de mantenimientos');
  const totales = mantenimientos.reduce((acumulado, mantenimiento) => {
    const parcial = calcularTotales(mantenimiento);
    return {
      subtotalServicios: acumulado.subtotalServicios + parcial.subtotalServicios,
      subtotalRefacciones: acumulado.subtotalRefacciones + parcial.subtotalRefacciones,
      totalFinal: acumulado.totalFinal + parcial.totalFinal,
    };
  }, { subtotalServicios: 0, subtotalRefacciones: 0, totalFinal: 0 });

  dibujarCabecera(
    doc,
    'LISTADO DE MANTENIMIENTOS',
    `Filtro: ${estado || 'Todos'} · Generado: ${formatoFecha(new Date())}`
  );

  dibujarTabla(
    doc,
    [
      { label: 'ID', width: 32 },
      { label: 'Fecha', width: 52 },
      { label: 'Cliente', width: 72 },
      { label: 'Vehículo', width: 80 },
      { label: 'Técnico', width: 60 },
      { label: 'Estado', width: 55 },
      { label: 'Servicios', width: 100 },
      { label: 'Refacciones', width: 100 },
      { label: 'Checklist', width: 95 },
      { label: 'Observaciones', width: 60 },
      { label: 'Total', width: 52, align: 'right' },
    ],
    mantenimientos.map((mantenimiento) => [
      String(mantenimiento.id),
      formatoFecha(mantenimiento.fecha),
      mantenimiento.cliente_nombre || 'Sin cliente',
      mantenimiento.vehiculo || 'Sin vehículo',
      mantenimiento.tecnico || 'Sin asignar',
      mantenimiento.estado || '-',
      textoServicios(mantenimiento),
      textoRefacciones(mantenimiento),
      textoChecklist(mantenimiento),
      mantenimiento.observaciones || '-',
      formatoMoneda.format(calcularTotales(mantenimiento).totalFinal),
    ]),
    { fontSize: 6.7, vacio: 'No hay mantenimientos para exportar' }
  );

  doc.font('Helvetica').fontSize(8).fillColor(GRIS);
  doc.text(`Subtotal servicios: ${formatoMoneda.format(totales.subtotalServicios)}`, { align: 'right' });
  doc.text(`Subtotal refacciones: ${formatoMoneda.format(totales.subtotalRefacciones)}`, { align: 'right' });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NEGRO);
  doc.text(`Total general: ${formatoMoneda.format(totales.totalFinal)}`, { align: 'right' });

  dibujarPie(doc);
  doc.end();

  return completado;
};

const estiloEncabezado = (cell) => {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };
};

const estiloCelda = (cell, { wrap = false, align = 'left' } = {}) => {
  cell.font = { size: 9, color: { argb: 'FF0F172A' } };
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: wrap };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  };
};

const agregarLogoExcel = (workbook, worksheet) => {
  const logo = obtenerLogo();
  const dimensiones = ajustarDimensiones(logo, 150, 45);
  const imageId = workbook.addImage({ buffer: logo.buffer, extension: 'png' });
  worksheet.addImage(imageId, {
    tl: { col: 0, row: 0 },
    ext: { width: dimensiones.width, height: dimensiones.height },
  });
};

const agregarCabeceraExcel = (workbook, worksheet, titulo, subtitulo, ultimaColumna) => {
  agregarLogoExcel(workbook, worksheet);

  worksheet.mergeCells(`C1:${ultimaColumna}1`);
  worksheet.getCell('C1').value = 'Auto Servicio San Jorge S.A. de C.V.';
  worksheet.getCell('C1').font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };
  worksheet.getCell('C1').alignment = { horizontal: 'right' };

  worksheet.mergeCells(`C2:${ultimaColumna}2`);
  worksheet.getCell('C2').value = 'Calle 10, No. 505, Col. Centro, San Jorge, México · Tel: +52 1 234 567 890';
  worksheet.getCell('C2').font = { size: 8, color: { argb: 'FF64748B' } };
  worksheet.getCell('C2').alignment = { horizontal: 'right' };

  worksheet.mergeCells(`A5:${ultimaColumna}5`);
  worksheet.getCell('A5').value = titulo;
  worksheet.getCell('A5').font = { bold: true, size: 16, color: { argb: 'FF0F172A' } };
  worksheet.getCell('A5').alignment = { horizontal: 'center' };

  worksheet.mergeCells(`A6:${ultimaColumna}6`);
  worksheet.getCell('A6').value = subtitulo;
  worksheet.getCell('A6').font = { size: 9, color: { argb: 'FF64748B' } };
  worksheet.getCell('A6').alignment = { horizontal: 'center' };
};

const generarXlsxMantenimiento = async (mantenimiento) => {
  const ExcelJS = obtenerExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Auto Servicio San Jorge';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Mantenimiento', {
    views: [{ showGridLines: false }],
  });

  worksheet.columns = [
    { width: 24 },
    { width: 26 },
    { width: 24 },
    { width: 24 },
  ];

  agregarCabeceraExcel(
    workbook,
    worksheet,
    `ORDEN DE MANTENIMIENTO #${mantenimiento.id}`,
    `Fecha del servicio: ${formatoFecha(mantenimiento.fecha)} · Estado: ${mantenimiento.estado || 'Sin estado'}`,
    'D'
  );

  const filasInfo = [
    ['Cliente', mantenimiento.cliente_nombre || 'Sin cliente'],
    ['Correo', mantenimiento.cliente_email || '-'],
    ['Vehículo', mantenimiento.vehiculo || 'Sin vehículo'],
    ['Placa', mantenimiento.vehiculo_placa || '-'],
    ['Kilometraje', mantenimiento.kilometraje || '-'],
    ['Técnico', mantenimiento.tecnico || 'Sin asignar'],
  ];

  filasInfo.forEach((fila, indice) => {
    const row = worksheet.getRow(8 + indice);
    row.getCell(1).value = fila[0];
    row.getCell(1).font = { bold: true, size: 9, color: { argb: 'FF475569' } };
    worksheet.mergeCells(`B${8 + indice}:D${8 + indice}`);
    row.getCell(2).value = fila[1];
    row.getCell(2).font = { size: 9, color: { argb: 'FF0F172A' } };
  });

  let fila = 15;

  worksheet.mergeCells(`A${fila}:D${fila}`);
  worksheet.getCell(`A${fila}`).value = 'Servicios realizados';
  worksheet.getCell(`A${fila}`).font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
  fila += 1;

  const encabezadosServicios = ['Servicio', 'Descripción', 'Importe'];
  worksheet.getCell(fila, 1).value = encabezadosServicios[0];
  estiloEncabezado(worksheet.getCell(fila, 1));
  worksheet.mergeCells(`B${fila}:C${fila}`);
  worksheet.getCell(fila, 2).value = encabezadosServicios[1];
  estiloEncabezado(worksheet.getCell(fila, 2));
  worksheet.getCell(fila, 4).value = encabezadosServicios[2];
  estiloEncabezado(worksheet.getCell(fila, 4));
  fila += 1;

  (mantenimiento.servicios || []).forEach((servicio) => {
    worksheet.getCell(fila, 1).value = servicio.nombre;
    worksheet.mergeCells(`B${fila}:C${fila}`);
    worksheet.getCell(fila, 2).value = servicio.descripcion || '-';
    worksheet.getCell(fila, 4).value = numero(servicio.precio);
    worksheet.getCell(fila, 4).numFmt = '"$"#,##0.00';
    for (let columna = 1; columna <= 4; columna += 1) {
      estiloCelda(worksheet.getCell(fila, columna), { wrap: columna === 1 });
    }
    fila += 1;
  });

  if ((mantenimiento.servicios || []).length === 0) {
    worksheet.mergeCells(`A${fila}:D${fila}`);
    worksheet.getCell(`A${fila}`).value = 'Sin servicios registrados';
    estiloCelda(worksheet.getCell(`A${fila}`), { align: 'center' });
    fila += 1;
  }

  fila += 1;
  worksheet.mergeCells(`A${fila}:D${fila}`);
  worksheet.getCell(`A${fila}`).value = 'Refacciones utilizadas';
  worksheet.getCell(`A${fila}`).font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
  fila += 1;

  const encabezadosRefacciones = ['Refacción', 'Cantidad', 'Precio unitario', 'Subtotal'];
  encabezadosRefacciones.forEach((encabezado, indice) => {
    const cell = worksheet.getCell(fila, indice + 1);
    cell.value = encabezado;
    estiloEncabezado(cell);
  });
  fila += 1;

  (mantenimiento.productos || []).forEach((producto) => {
    const cantidad = Math.max(1, Math.trunc(numero(producto.cantidad)) || 1);
    worksheet.getCell(fila, 1).value = producto.nombre;
    worksheet.getCell(fila, 2).value = cantidad;
    worksheet.getCell(fila, 3).value = numero(producto.precio);
    worksheet.getCell(fila, 3).numFmt = '"$"#,##0.00';
    worksheet.getCell(fila, 4).value = numero(producto.precio) * cantidad;
    worksheet.getCell(fila, 4).numFmt = '"$"#,##0.00';
    for (let columna = 1; columna <= 4; columna += 1) {
      estiloCelda(worksheet.getCell(fila, columna), { wrap: columna === 1, align: columna > 1 ? 'right' : 'left' });
    }
    fila += 1;
  });

  if ((mantenimiento.productos || []).length === 0) {
    worksheet.mergeCells(`A${fila}:D${fila}`);
    worksheet.getCell(`A${fila}`).value = 'Sin refacciones registradas';
    estiloCelda(worksheet.getCell(`A${fila}`), { align: 'center' });
    fila += 1;
  }

  const totales = calcularTotales(mantenimiento);

  fila += 1;
  [['Subtotal servicios', totales.subtotalServicios], ['Subtotal refacciones', totales.subtotalRefacciones], ['Total final', totales.totalFinal]]
    .forEach(([etiqueta, valor], indice) => {
      worksheet.mergeCells(`A${fila}:C${fila}`);
      worksheet.getCell(`A${fila}`).value = etiqueta;
      worksheet.getCell(`A${fila}`).alignment = { horizontal: 'right' };
      worksheet.getCell(`A${fila}`).font = { bold: indice === 2, size: 9, color: { argb: 'FF0F172A' } };
      worksheet.getCell(fila, 4).value = valor;
      worksheet.getCell(fila, 4).numFmt = '"$"#,##0.00';
      worksheet.getCell(fila, 4).font = { bold: indice === 2, size: 9, color: { argb: 'FF0F172A' } };
      fila += 1;
    });

  fila += 1;
  worksheet.mergeCells(`A${fila}:D${fila}`);
  worksheet.getCell(`A${fila}`).value = 'Checklist de inspección';
  worksheet.getCell(`A${fila}`).font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
  fila += 1;

  if ((mantenimiento.checklist || []).length === 0) {
    worksheet.mergeCells(`A${fila}:D${fila}`);
    worksheet.getCell(`A${fila}`).value = 'Sin checklist';
    estiloCelda(worksheet.getCell(`A${fila}`), { align: 'center' });
    fila += 1;
  } else {
    ['Punto de revisión', 'Estado', 'Nota', ''].forEach((encabezado, indice) => {
      if (!encabezado) return;
      const cell = worksheet.getCell(fila, indice + 1);
      cell.value = encabezado;
      estiloEncabezado(cell);
    });
    worksheet.mergeCells(`C${fila}:D${fila}`);
    estiloEncabezado(worksheet.getCell(fila, 3));
    fila += 1;

    mantenimiento.checklist.forEach((item) => {
      worksheet.getCell(fila, 1).value = item.item;
      worksheet.getCell(fila, 2).value = item.estado || 'Pendiente';
      worksheet.mergeCells(`C${fila}:D${fila}`);
      worksheet.getCell(fila, 3).value = item.nota || '-';
      for (let columna = 1; columna <= 4; columna += 1) {
        estiloCelda(worksheet.getCell(fila, columna), { wrap: columna === 1 });
      }
      fila += 1;
    });
  }

  fila += 1;
  worksheet.mergeCells(`A${fila}:D${fila}`);
  worksheet.getCell(`A${fila}`).value = 'Observaciones';
  worksheet.getCell(`A${fila}`).font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
  fila += 1;
  worksheet.mergeCells(`A${fila}:D${fila}`);
  worksheet.getCell(`A${fila}`).value = mantenimiento.observaciones || 'Sin observaciones';
  worksheet.getCell(`A${fila}`).alignment = { wrapText: true, vertical: 'top' };
  worksheet.getCell(`A${fila}`).font = { size: 9, color: { argb: 'FF0F172A' } };
  worksheet.getRow(fila).height = 60;

  return workbook.xlsx.writeBuffer();
};

const generarXlsxListado = async (mantenimientos, { estado } = {}) => {
  const ExcelJS = obtenerExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Auto Servicio San Jorge';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Mantenimientos', {
    views: [{ state: 'frozen', ySplit: 9, showGridLines: false }],
  });

  worksheet.columns = [
    { width: 8 },
    { width: 12 },
    { width: 24 },
    { width: 28 },
    { width: 20 },
    { width: 18 },
    { width: 38 },
    { width: 38 },
    { width: 38 },
    { width: 32 },
    { width: 14 },
  ];

  agregarCabeceraExcel(
    workbook,
    worksheet,
    'LISTADO DE MANTENIMIENTOS',
    `Filtro: ${estado || 'Todos'} · Generado: ${formatoFecha(new Date())}`,
    'K'
  );

  const encabezados = [
    'ID',
    'Fecha',
    'Cliente',
    'Vehículo',
    'Técnico',
    'Estado',
    'Servicios',
    'Refacciones',
    'Checklist',
    'Observaciones',
    'Costo final',
  ];

  encabezados.forEach((encabezado, indice) => {
    const cell = worksheet.getCell(9, indice + 1);
    cell.value = encabezado;
    estiloEncabezado(cell);
  });

  let fila = 10;
  mantenimientos.forEach((mantenimiento) => {
    const total = calcularTotales(mantenimiento).totalFinal;
    const valores = [
      mantenimiento.id,
      formatoFecha(mantenimiento.fecha),
      mantenimiento.cliente_nombre || 'Sin cliente',
      mantenimiento.vehiculo || 'Sin vehículo',
      mantenimiento.tecnico || 'Sin asignar',
      mantenimiento.estado || '-',
      textoServicios(mantenimiento),
      textoRefacciones(mantenimiento),
      textoChecklist(mantenimiento),
      mantenimiento.observaciones || '-',
      total,
    ];

    valores.forEach((valor, indice) => {
      const cell = worksheet.getCell(fila, indice + 1);
      cell.value = valor;
      if (indice === 10) cell.numFmt = '"$"#,##0.00';
      estiloCelda(cell, {
        wrap: [2, 3, 6, 7, 8, 9].includes(indice),
        align: indice === 0 || indice === 10 ? 'right' : 'left',
      });
    });

    fila += 1;
  });

  worksheet.autoFilter = {
    from: { row: 9, column: 1 },
    to: { row: Math.max(9, fila - 1), column: encabezados.length },
  };

  const totales = mantenimientos.reduce((acumulado, mantenimiento) => {
    const parcial = calcularTotales(mantenimiento);
    return {
      subtotalServicios: acumulado.subtotalServicios + parcial.subtotalServicios,
      subtotalRefacciones: acumulado.subtotalRefacciones + parcial.subtotalRefacciones,
      totalFinal: acumulado.totalFinal + parcial.totalFinal,
    };
  }, { subtotalServicios: 0, subtotalRefacciones: 0, totalFinal: 0 });

  fila += 1;
  worksheet.mergeCells(`A${fila}:J${fila}`);
  worksheet.getCell(`A${fila}`).value = `Subtotal servicios: ${formatoMoneda.format(totales.subtotalServicios)} · Subtotal refacciones: ${formatoMoneda.format(totales.subtotalRefacciones)}`;
  worksheet.getCell(`A${fila}`).font = { bold: true, size: 9, color: { argb: 'FF0F172A' } };
  worksheet.getCell(`A${fila}`).alignment = { horizontal: 'right' };
  worksheet.getCell(fila, 11).value = totales.totalFinal;
  worksheet.getCell(fila, 11).numFmt = '"$"#,##0.00';
  worksheet.getCell(fila, 11).font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };

  return workbook.xlsx.writeBuffer();
};

module.exports = {
  LOGO_PATH,
  formatoFecha,
  fechaArchivo,
  dimensionesPng,
  ajustarDimensiones,
  calcularTotales,
  textoServicios,
  textoRefacciones,
  textoChecklist,
  generarPdfMantenimiento,
  generarPdfListado,
  generarXlsxMantenimiento,
  generarXlsxListado,
};
