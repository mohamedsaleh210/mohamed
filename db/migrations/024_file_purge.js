const { addColumn } = require('../migrate');

// Purging removes the image, not the record: the document row survives with its
// name and history, so a closed file still reads correctly years later even
// though the scan itself is gone.
exports.up = (db) => {
  addColumn(db, 'document_files', 'purged_at', 'TEXT');
  addColumn(db, 'document_files', 'purged_by', 'TEXT');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_files_live
      ON document_files(document_id) WHERE purged_at IS NULL;
  `);
};
