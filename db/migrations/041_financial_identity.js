const {addColumn}=require('../migrate');
exports.up=db=>{
  addColumn(db,'report_profiles','entity_type','TEXT');
  addColumn(db,'report_profiles','unified_no','TEXT');
  addColumn(db,'report_profiles','vat_registered','INTEGER DEFAULT 0');
  addColumn(db,'report_profiles','vat_rate','REAL DEFAULT 0');
  addColumn(db,'report_profiles','prices_include_tax','INTEGER DEFAULT 0');
  addColumn(db,'report_profiles','currency','TEXT DEFAULT \'EGP\'');
  addColumn(db,'report_profiles','fiscal_year_start','TEXT DEFAULT \'01-01\'');
  addColumn(db,'report_profiles','bank_name','TEXT');
  addColumn(db,'report_profiles','iban','TEXT');
  addColumn(db,'report_profiles','invoice_prefix','TEXT DEFAULT \'INV\'');
};
