const { consolidarMarcasDuplicadas, crearIndiceUnicoMarca } = require('./marcasUnicas');

module.exports = {
  id: '001_marcas_unicas',
  async up(db) {
    const resultado = await consolidarMarcasDuplicadas(db);
    await crearIndiceUnicoMarca(db);
    return resultado;
  },
};
