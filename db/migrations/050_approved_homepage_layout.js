exports.up = (db) => {
  // One-time application of the approved visual order. After this migration
  // the owner can still hide or reorder any section from the homepage editor.
  const update = db.prepare(`UPDATE homepage_sections
    SET visible=1,sort=?,updated_at=datetime('now') WHERE section_key=?`);
  [
    ['hero',10],
    ['search',20],
    ['metrics',30],
    ['audiences',40],
    ['partners',50],
    ['popular',60],
    ['steps',70],
    ['why',80],
    ['system',90],
    ['plans',100],
    ['testimonials',110],
    ['faq',120],
    ['cta',130]
  ].forEach(([key,sort]) => update.run(sort,key));
};
