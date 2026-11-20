const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { crc32, deflateRawSync } = require('node:zlib');

const logo = readFileSync(join(__dirname, '../assets/logo-san-jorge.jpg'));
const hoja = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relacion = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const dibujo = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const dibujoBase = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function escapar(texto) {
  return String(texto ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function relaciones(elementos) {
  return `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    ${elementos.map(([tipo, destino], indice) =>
      `<Relationship Id="rId${indice + 1}" Type="${relacion}/${tipo}" Target="${destino}"/>`).join('')}
  </Relationships>`;
}

function crearZip(archivos) {
  const entradas = [];
  const directorio = [];
  let offset = 0;

  for (const [ruta, contenido] of Object.entries(archivos)) {
    const nombre = Buffer.from(ruta);
    const original = Buffer.isBuffer(contenido) ? contenido : Buffer.from(xml + contenido);
    const comprimido = deflateRawSync(original);
    const crc = crc32(original);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // ZIP 2.0, necesario para deflate
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12); // Fecha mínima DOS, 1 de enero de 1980
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(original.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    local.copy(central, 6, 4, 30); // Versión, método, CRC, tamaños y nombre
    central.writeUInt32LE(offset, 42);
    entradas.push(local, nombre, comprimido);
    directorio.push(central, nombre);
    offset += local.length + nombre.length + comprimido.length;
  }

  const indice = Buffer.concat(directorio);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(directorio.length / 2, 8);
  fin.writeUInt16LE(directorio.length / 2, 10);
  fin.writeUInt32LE(indice.length, 12);
  fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...entradas, indice, fin]);
}

const formatos = {
  base: {},
  fondo: { relleno: 2 },
  titulo: { fuente: 1, relleno: 2, margen: 1 },
  marca: { fuente: 2, relleno: 2, margen: 1 },
  etiqueta: { fuente: 3, relleno: 3, margen: 1 },
  indicador: { fuente: 4, relleno: 3, margen: 1 },
  fechaResumen: { fuente: 4, relleno: 3, formato: 164, margen: 1 },
  totalResumen: { fuente: 5, relleno: 4, formato: 165, margen: 1 },
  encabezado: { fuente: 6, relleno: 2, margen: 1 },
  texto: { margen: 1, envolver: true },
  textoAlterno: { relleno: 5, margen: 1, envolver: true },
  fecha: { formato: 164, horizontal: 'center' },
  fechaAlterna: { relleno: 5, formato: 164, horizontal: 'center' },
  importe: { formato: 165, horizontal: 'right', margen: 1 },
  importeAlterno: { relleno: 5, formato: 165, horizontal: 'right', margen: 1 },
  vacio: { fuente: 3, relleno: 5, margen: 1 },
};
const estilos = Object.fromEntries(Object.keys(formatos).map((nombre, indice) => [nombre, indice]));

function definirEstilos() {
  const fuentes = [
    [11, '172B45'], [23, 'FFFFFF', true], [10, 'C8D9EF', true], [10, '46607F', true],
    [18, '152C4B', true], [18, '086854', true], [11, 'FFFFFF', true],
  ];
  const fondos = ['152C4B', 'ECF3FB', 'DBF4EC', 'F1F5F9'];
  return `<styleSheet xmlns="${hoja}">
    <numFmts count="2">
      <numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>
      <numFmt numFmtId="165" formatCode="&quot;$&quot;#,##0.00;(&quot;$&quot;#,##0.00)"/>
    </numFmts>
    <fonts count="${fuentes.length}">${fuentes.map(([tam, color, negrita]) =>
      `<font>${negrita ? '<b/>' : ''}<sz val="${tam}"/><color rgb="FF${color}"/><name val="Calibri"/><family val="2"/></font>`).join('')}</fonts>
    <fills count="${fondos.length + 2}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
      ${fondos.map(color => `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}
    </fills>
    <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
    <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
    <cellXfs count="${Object.keys(formatos).length}">${Object.values(formatos).map(({ fuente = 0, relleno = 0, formato = 0, horizontal = 'left', margen = 0, envolver = false }) =>
      `<xf numFmtId="${formato}" fontId="${fuente}" fillId="${relleno}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1">
        <alignment vertical="center" horizontal="${horizontal}" indent="${margen}" wrapText="${Number(envolver)}"/>
      </xf>`).join('')}</cellXfs>
    <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  </styleSheet>`;
}

function fechaExcel(fecha) {
  // Excel reserva el número 60 para el 29 de febrero de 1900, que no existió.
  if (fecha < '1900-01-01') return fecha;
  const numero = Date.parse(`${fecha}T00:00:00Z`) / 86400000 + 25569;
  return numero - (fecha < '1900-03-01' ? 1 : 0);
}

function generarExcel({ fecha, cantidad, total, ventas }) {
  const combinaciones = ['A1:A3', 'B1:F1', 'B2:F2', 'B3:F3', 'A5:B5', 'C5:D5', 'E5:F5', 'A6:B6', 'C6:D6', 'E6:F6'];
  const fila = (numero, altura, celdas) => `<row r="${numero}" ht="${altura}" customHeight="1">${celdas.map(([valor, estilo], indice) => {
    const ref = `${'ABCDEF'[indice]}${numero}`;
    const atributos = `r="${ref}" s="${estilos[estilo]}"`;
    if (valor === null) return `<c ${atributos}/>`;
    if (typeof valor === 'number') return `<c ${atributos}><v>${valor}</v></c>`;
    return `<c ${atributos} t="inlineStr"><is><t xml:space="preserve">${escapar(valor)}</t></is></c>`;
  }).join('')}</row>`;

  const fondoEncabezado = Array.from({ length: 4 }, () => [null, 'fondo']);
  const encabezado = [
    fila(1, 14, [[null, 'base'], [null, 'fondo'], ...fondoEncabezado]),
    fila(2, 28, [[null, 'base'], ['Ventas diarias', 'titulo'], ...fondoEncabezado]),
    fila(3, 22, [[null, 'base'], ['Autoservicio San Jorge', 'marca'], ...fondoEncabezado]),
    fila(4, 10, []),
    fila(5, 19, [['Fecha del reporte', 'etiqueta'], [null, 'etiqueta'], ['Ventas registradas', 'etiqueta'], [null, 'etiqueta'], ['Total en MXN', 'etiqueta'], [null, 'etiqueta']]),
    fila(6, 34, [[fechaExcel(fecha), 'fechaResumen'], [null, 'fechaResumen'], [cantidad, 'indicador'], [null, 'indicador'], [total, 'totalResumen'], [null, 'totalResumen']]),
    fila(7, 13, []),
    fila(8, 27, ['Folio', 'Cliente', 'Detalle de la venta', 'Fecha', 'Importe (MXN)', 'Método de pago'].map(valor => [valor, 'encabezado'])),
  ];
  const movimientos = ventas.map((venta, indice) => {
    const alterno = indice % 2 !== 0;
    const texto = alterno ? 'textoAlterno' : 'texto';
    const lineas = Math.max(...[[venta.cliente, 24], [venta.servicio, 52]].map(([valor, ancho]) =>
      valor.split(/\r?\n/).reduce((suma, linea) => suma + Math.max(1, Math.ceil(linea.length / ancho)), 0)));
    const metodo = venta.metodo.charAt(0).toUpperCase() + venta.metodo.slice(1);
    return fila(indice + 9, Math.min(408, Math.max(24, lineas * 16 + 8)), [
      [venta.id, texto], [venta.cliente, texto], [venta.servicio, texto],
      [fechaExcel(venta.fechaISO), alterno ? 'fechaAlterna' : 'fecha'],
      [venta.total, alterno ? 'importeAlterno' : 'importe'], [metodo, texto],
    ]);
  });
  if (movimientos.length === 0) {
    combinaciones.push('A9:F9');
    movimientos.push(fila(9, 32, [['No hay ventas registradas para esta fecha.', 'vacio']]));
  }

  return crearZip({
    '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Default Extension="jpg" ContentType="image/jpeg"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
    </Types>`,
    '_rels/.rels': relaciones([['officeDocument', 'xl/workbook.xml']]),
    'xl/workbook.xml': `<workbook xmlns="${hoja}" xmlns:r="${relacion}"><bookViews><workbookView/></bookViews><sheets>
      <sheet name="Ventas diarias" sheetId="1" r:id="rId1"/>
    </sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': relaciones([['worksheet', 'worksheets/sheet1.xml'], ['styles', 'styles.xml']]),
    'xl/styles.xml': definirEstilos(),
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${hoja}" xmlns:r="${relacion}">
      <sheetViews><sheetView showGridLines="0" workbookViewId="0">
        <pane ySplit="8" topLeftCell="A9" activePane="bottomLeft" state="frozen"/>
        <selection pane="bottomLeft" activeCell="A9" sqref="A9"/>
      </sheetView></sheetViews>
      <cols>${[19, 31, 62, 17, 19, 22].map((ancho, indice) =>
        `<col min="${indice + 1}" max="${indice + 1}" width="${ancho}" customWidth="1"/>`).join('')}</cols>
      <sheetData>${encabezado.join('')}${movimientos.join('')}</sheetData>
      ${ventas.length ? `<autoFilter ref="A8:F${ventas.length + 8}"/>` : ''}
      <mergeCells count="${combinaciones.length}">${combinaciones.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>
      <drawing r:id="rId1"/>
    </worksheet>`,
    'xl/worksheets/_rels/sheet1.xml.rels': relaciones([['drawing', '../drawings/drawing1.xml']]),
    'xl/drawings/drawing1.xml': `<xdr:wsDr xmlns:xdr="${dibujo}" xmlns:a="${dibujoBase}" xmlns:r="${relacion}">
      <xdr:oneCellAnchor>
        <xdr:from><xdr:col>0</xdr:col><xdr:colOff>114300</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>57150</xdr:rowOff></xdr:from>
        <xdr:ext cx="1028700" cy="685800"/>
        <xdr:pic>
          <xdr:nvPicPr><xdr:cNvPr id="1" name="Autoservicio San Jorge"/><xdr:cNvPicPr/></xdr:nvPicPr>
          <xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
          <xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
        </xdr:pic><xdr:clientData/>
      </xdr:oneCellAnchor>
    </xdr:wsDr>`,
    'xl/drawings/_rels/drawing1.xml.rels': relaciones([['image', '../media/logo.jpg']]),
    'xl/media/logo.jpg': logo,
  });
}

module.exports = { generarExcel };
