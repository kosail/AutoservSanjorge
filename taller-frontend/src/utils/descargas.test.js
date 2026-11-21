import { describe, expect, test } from 'vitest';
import {
  listadoTieneDatos,
  MENSAJE_LISTADO_VACIO,
  nombreArchivoConFecha,
  parseFilenameFromDisposition,
} from './descargas.js';

describe('descargas', () => {
  test('lee el nombre desde Content-Disposition', () => {
    expect(
      parseFilenameFromDisposition(
        'attachment; filename="mantenimiento-12-2026-11-21.pdf"',
        'fallback.pdf'
      )
    ).toBe('mantenimiento-12-2026-11-21.pdf');
  });

  test('lee el nombre codificado en UTF-8', () => {
    expect(
      parseFilenameFromDisposition(
        "attachment; filename*=UTF-8''mantenimiento-%C3%B1-2026-11-21.xlsx",
        'fallback.xlsx'
      )
    ).toBe('mantenimiento-ñ-2026-11-21.xlsx');
  });

  test('usa el nombre de respaldo si no hay cabecera', () => {
    expect(parseFilenameFromDisposition('', 'respaldo.pdf')).toBe('respaldo.pdf');
  });

  test('construye nombres con fecha', () => {
    const fecha = new Date('2026-11-21T15:00:00.000Z');
    expect(nombreArchivoConFecha('mantenimiento-12', 'pdf', fecha)).toBe(
      'mantenimiento-12-2026-11-21.pdf'
    );
  });

  test('detecta listados vacios', () => {
    expect(listadoTieneDatos([])).toBe(false);
    expect(listadoTieneDatos([{ id: 1 }])).toBe(true);
    expect(listadoTieneDatos(null)).toBe(false);
    expect(MENSAJE_LISTADO_VACIO).toMatch(/No hay mantenimientos/);
  });
});
