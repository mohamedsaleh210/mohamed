const {addColumn}=require('../migrate');
exports.up=db=>{
 db.exec(`
 CREATE TABLE consultation_modes(id INTEGER PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
 INSERT INTO consultation_modes(id,name) VALUES(1,'استشارة مكتوبة'),(2,'استشارة موثقة'),(3,'استشارة هاتفية'),(4,'استشارة واتساب'),(5,'لقاء بالمكتب');
 CREATE TABLE booking_slots(id INTEGER PRIMARY KEY, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, location TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, CHECK(ends_at>starts_at));
 CREATE TABLE bookings(
 id INTEGER PRIMARY KEY, ref TEXT NOT NULL UNIQUE, client_id INTEGER NOT NULL REFERENCES clients(id),
 slot_id INTEGER NOT NULL REFERENCES booking_slots(id), mode_id INTEGER REFERENCES consultation_modes(id),
 kind TEXT NOT NULL CHECK(kind IN ('appointment','consultation')), service_id INTEGER REFERENCES services(id),
 request_id INTEGER NOT NULL UNIQUE REFERENCES requests(id), agenda_event_id INTEGER NOT NULL UNIQUE REFERENCES agenda_events(id),
 assigned_user_id INTEGER REFERENCES users(id), status TEXT NOT NULL DEFAULT 'unassigned' CHECK(status IN ('unassigned','confirmed','completed','cancelled')),
 notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT(datetime('now')));
 CREATE UNIQUE INDEX booking_slot_reserved ON bookings(slot_id) WHERE status IN ('unassigned','confirmed');
 CREATE INDEX booking_employee ON bookings(assigned_user_id,status);
 CREATE INDEX booking_customer ON bookings(client_id,created_at);
 CREATE TABLE booking_history(id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL REFERENCES bookings(id), action TEXT NOT NULL,
 before_json TEXT, after_json TEXT NOT NULL, actor_id INTEGER, actor_type TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT DEFAULT(datetime('now')));
 CREATE TABLE booking_client_notifications(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES clients(id),booking_id INTEGER NOT NULL REFERENCES bookings(id),text TEXT NOT NULL,created_at TEXT DEFAULT(datetime('now')));
 `);
 addColumn(db,'notifications','booking_id','INTEGER REFERENCES bookings(id)');
 db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('booking_enabled','0')").run();
};
