const policy=require('./tenant-policy');
function read(){return policy.license()}
function middleware(req,res,next){
 const current=policy.state(),lic=current.license; res.locals.tenantLicense=lic;
 if(!current.managed)return next(); // standalone single-office installs remain supported.
 const end=current.end;
 res.locals.subscriptionExpired=current.expired;
 res.locals.subscriptionStatus=current.status;
 res.locals.subscriptionDaysLeft=end?Math.max(0,Math.ceil((new Date(end)-Date.now())/86400000)):null;
 if(!current.allowed){
   // A suspended or expired office must not retain a read/download back door.
   // Keep only logout and the public contact/support entry points reachable.
   const safe=req.path.endsWith('/logout')||req.path==='/contact'||req.path==='/support'||req.path.startsWith('/support?');
   if(!safe)return res.status(current.expired?402:403).render('errors/subscription',{license:lic,status:current.status,expired:current.expired,layout:false});
 }
 // Apply a conservative global gate to every multipart upload. Route-level
 // checks still use the exact uploaded file sizes for the core document flows.
 if(req.method!=='GET'&&String(req.headers['content-type']||'').toLowerCase().startsWith('multipart/form-data')){
   const bytes=Math.max(0,Number(req.headers['content-length'])||0),quota=policy.allowance('storage',bytes);
   if(!quota.allowed)return res.status(413).render('errors/subscription',{license:lic,status:'storage_limit',expired:false,layout:false});
 }
 next();
}
module.exports={read,middleware};
