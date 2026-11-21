const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const logo = readFileSync(join(__dirname, '../assets/logo-san-jorge.jpg'));
const winAnsi = '€\u0000‚ƒ„…†‡ˆ‰Š‹Œ\u0000Ž\u0000\u0000‘’“”•–—˜™š›œ\u0000žŸ';
const ancho = 595;
const alto = 842;
const lineasPorPagina = 43;

function textoPDF(texto) {
  // PDF permite declarar WinAnsi para las fuentes estándar. La codificación
  // hexadecimal protege paréntesis, barras y saltos presentes en los datos.
  const bytes = Array.from(String(texto ?? '').normalize('NFC'), caracter => {
    const codigo = caracter.codePointAt(0);
    if ((codigo >= 32 && codigo <= 126) || (codigo >= 160 && codigo <= 255)) return codigo;
    const especial = winAnsi.indexOf(caracter);
    return especial < 0 ? 63 : especial + 128;
  });
  return `<${Buffer.from(bytes).toString('hex')}>`;
}

function lineas(texto) {
  const resultado = [];
  for (const parrafo of String(texto ?? '').split(/\r?\n/)) {
    let linea = '';
    for (const palabra of parrafo.match(/\S{1,84}/gu) || []) {
      if (linea && linea.length + palabra.length + 1 > 84) {
        resultado.push(linea);
        linea = '';
      }
      linea = linea ? `${linea} ${palabra}` : palabra;
    }
    resultado.push(linea);
  }
  return resultado;
}

function stream(contenido, atributos = '') {
  return Buffer.concat([
    Buffer.from(`<< ${atributos} /Length ${contenido.length} >>\nstream\n`),
    contenido,
    Buffer.from('\nendstream'),
  ]);
}

function generarPDF(titulo, subtitulo, contenido) {
  const objetos = [
    null,
    '<< /Type /Catalog /Pages 2 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    stream(logo, '/Type /XObject /Subtype /Image /Width 360 /Height 240 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode'),
  ];
  const filas = contenido.flatMap(lineas);
  const numeroPaginas = Math.max(1, Math.ceil(filas.length / lineasPorPagina));
  const paginas = [];

  for (let pagina = 0; pagina < numeroPaginas; pagina++) {
    const paginaId = objetos.length;
    const desde = pagina * lineasPorPagina;
    paginas.push(`${paginaId} 0 R`);
    const cuerpo = filas.slice(desde, desde + lineasPorPagina).map((linea, indice) => (
      `BT /Cuerpo 10 Tf 42 ${704 - indice * 15} Td ${textoPDF(linea)} Tj ET`
    )).join('\n');

    objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ancho} ${alto}]
      /Resources << /Font << /Cuerpo 3 0 R /Titulo 4 0 R >> /XObject << /Logo 5 0 R >> >>
      /Contents ${paginaId + 1} 0 R >>`);
    objetos.push(stream(Buffer.from(`
q 114 0 0 76 42 750 cm /Logo Do Q
0.10 0.20 0.35 rg
BT /Titulo 19 Tf 165 798 Td ${textoPDF(titulo)} Tj ET
BT /Cuerpo 10 Tf 165 774 Td ${textoPDF(subtitulo)} Tj ET
0.72 0.77 0.82 RG 42 736 m 553 736 l S
0.12 0.15 0.18 rg
${cuerpo}
BT /Cuerpo 9 Tf 42 42 Td ${textoPDF(`Autoservicio San Jorge     Página ${pagina + 1} de ${numeroPaginas}`)} Tj ET
`)));
  }
  objetos[2] = `<< /Type /Pages /Count ${numeroPaginas} /Kids [${paginas.join(' ')}] >>`;

  const partes = [Buffer.from('%PDF-1.4\n')];
  const offsets = ['0000000000 65535 f \n'];
  let posicion = partes[0].length;
  for (let id = 1; id < objetos.length; id++) {
    offsets.push(`${String(posicion).padStart(10, '0')} 00000 n \n`);
    const objeto = Buffer.concat([Buffer.from(`${id} 0 obj\n`), Buffer.from(objetos[id]), Buffer.from('\nendobj\n')]);
    partes.push(objeto);
    posicion += objeto.length;
  }
  partes.push(Buffer.from(`xref\n0 ${objetos.length}\n${offsets.join('')}trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${posicion}\n%%EOF\n`));
  return Buffer.concat(partes);
}

module.exports = { generarPDF };
