const { addColumn } = require('../migrate');

// Records what image processing did, so the saving is visible rather than
// something you have to take on trust.
exports.up = (db) => {
  addColumn(db, 'document_files', 'original_size', 'INTEGER');
  addColumn(db, 'document_files', 'was_converted', 'INTEGER DEFAULT 0');
  addColumn(db, 'document_files', 'width', 'INTEGER');
  addColumn(db, 'document_files', 'height', 'INTEGER');
};
