import { describe, expect, test } from 'vitest';
import {
  buscarMarcaDuplicada,
  mensajeErrorMarca,
  MENSAJE_MARCA_DUPLICADA,
  normalizarNombreMarca,
} from './marcas.js';

const marcas = [
  { id: 1, nombre: 'Toyota' },
  { id: 2, nombre: 'Ford' },
];

describe('marcas', () => {
  test.each(['Toyota', 'toyota', ' Toyota '])('detecta %s como duplicada', (nombre) => {
    expect(buscarMarcaDuplicada(marcas, nombre)).toEqual(marcas[0]);
  });

  test('no marca como duplicada la marca que se está editando', () => {
    expect(buscarMarcaDuplicada(marcas, 'toyota', 1)).toBeNull();
  });

  test('detecta el choque al editar hacia otra marca existente', () => {
    expect(buscarMarcaDuplicada(marcas, ' ford ', 1)).toEqual(marcas[1]);
  });

  test('normaliza espacios exteriores y mayúsculas', () => {
    expect(normalizarNombreMarca('  ToYoTa  ')).toBe('toyota');
  });

  test('devuelve el mensaje de duplicado para un 409', () => {
    const error = new Error('detalle del backend');
    error.status = 409;
    expect(mensajeErrorMarca(error)).toBe(MENSAJE_MARCA_DUPLICADA);
  });

  test('conserva el mensaje para errores distintos de 409', () => {
    expect(mensajeErrorMarca(new Error('Error 500'))).toBe('Error 500');
  });
});
