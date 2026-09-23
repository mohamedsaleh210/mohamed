function csv(res, filename, columns, rows) {
  const esc=v=>`"${String(v==null?'':v).replace(/"/g,'""')}"`;
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="${filename}.csv"`);
  res.end(Buffer.from('\uFEFF'+[columns,...rows].map(r=>r.map(esc).join(',')).join('\r\n'),'utf8'));
}
function profileForBranch(branchId){
  const {db}=require('../db');
  if(branchId){const exact=db.prepare('SELECT * FROM report_profiles WHERE active=1 AND office_branch_id=? ORDER BY is_default DESC,id LIMIT 1').get(branchId);if(exact)return exact}
  return db.prepare(`SELECT p.* FROM report_profiles p LEFT JOIN office_branches b ON b.id=p.office_branch_id
    WHERE p.active=1 ORDER BY COALESCE(b.is_main,0) DESC,p.is_default DESC,p.id LIMIT 1`).get()||null;
}
function print(res,title,columns,rows,officeBranchId){res.render('admin/report_print',{title,columns,rows,generatedAt:new Date(),reportProfile:profileForBranch(officeBranchId)})}

/**
 * A single-subject printable profile — an employee, client, company or
 * branch — as opposed to `print()`'s table of many rows. `sections` is
 * `[{ heading, fields: [[label, value], ...] }]`; a falsy value renders as
 * "—" rather than being silently dropped, so a blank field on the page
 * matches what the record actually has instead of hiding the gap.
 */
function profileDoc(res,title,subtitle,sections,officeBranchId){res.render('admin/report_profile_print',{title,subtitle,sections,generatedAt:new Date(),reportProfile:profileForBranch(officeBranchId)})}
module.exports={csv,print,profileDoc,profileForBranch};
