const express = require('express');
const { db } = require('../../db');
const audit = require('../../lib/audit');
const trash = require('../../lib/trash');
const notify = require('../../lib/notify');
const { visibleRequestFilter } = require('../../lib/access');
const { requireStaff, can } = require('../../middleware/auth');

const router = express.Router();
router.use(requireStaff);

const me = (req) => req.session.user.display_name || req.session.user.username;
const canManage = (req) => req.userCan('errands.manage');

const validDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- overview
/**
 * The errands board.
 *
 * Grouped by place rather than by request, because that is how the journey
 * works: one person goes to one building and deals with everything waiting
 * there. A list sorted by request would have them criss-crossing the city.
 */
router.get('/', (req, res) => {
  const vis = visibleRequestFilter(req.user);

  const destinations = db
    .prepare(
      `SELECT d.*,
        (SELECT COUNT(*) FROM request_destinations rd
           JOIN requests r ON r.id = rd.request_id
          WHERE rd.destination_id = d.id AND rd.status = 'pending'
            AND r.archived_at IS NULL) AS pending
       FROM destinations d
       WHERE d.active = 1
       ORDER BY d.sort, d.id`
    )
    .all();

  const pending = db
    .prepare(
      `SELECT rd.*, r.ref, r.name, r.title, r.service_label, r.status AS request_status,
              r.is_critical, r.deadline, d.name AS destination, d.colour
       FROM request_destinations rd
       JOIN requests r ON r.id = rd.request_id
       JOIN destinations d ON d.id = rd.destination_id
       WHERE rd.status = 'pending' AND r.archived_at IS NULL ${vis.sql}
       ORDER BY r.is_critical DESC, d.sort, rd.id
       LIMIT 300`
    )
    .all(...vis.params);

  const byDestination = {};
  pending.forEach((row) => {
    (byDestination[row.destination_id] = byDestination[row.destination_id] || {
      id: row.destination_id,
      name: row.destination,
      colour: row.colour,
      items: [],
    }).items.push(row);
  });

  const upcoming = db
    .prepare(
      `SELECT t.*, d.name AS destination, d.colour,
        (SELECT COUNT(*) FROM request_destinations rd WHERE rd.trip_id = t.id) AS stops
       FROM trips t
       LEFT JOIN destinations d ON d.id = t.destination_id
       WHERE t.status != 'done'
       ORDER BY t.trip_date LIMIT 20`
    )
    .all();

  res.render('admin/errands', {
    destinations,
    staffOptions: db
      .prepare('SELECT id, display_name FROM users WHERE active = 1 ORDER BY display_name')
      .all(),
    groups: Object.values(byDestination),
    upcoming,
    canManage: canManage(req),
    msg: req.query.msg,
    today: today(),
  });
});

function errandRows(){return db.prepare(`SELECT t.trip_date,d.name destination,t.assignee_name,t.status,(SELECT COUNT(*) FROM request_destinations rd WHERE rd.trip_id=t.id) stops,t.notes FROM trips t LEFT JOIN destinations d ON d.id=t.destination_id ORDER BY t.trip_date DESC,t.id DESC`).all()}
router.get('/export.csv',can('errands.export'),(req,res)=>{const rows=errandRows();require('../../lib/reporting').csv(res,'sanad-errands',['التاريخ','الجهة','المسؤول','الحالة','عدد الطلبات','ملاحظات'],rows.map(x=>[x.trip_date,x.destination,x.assignee_name,x.status,x.stops,x.notes]))});
router.get('/print',can('errands.export'),(req,res)=>{const rows=errandRows();require('../../lib/reporting').print(res,'تقرير المشاوير',['التاريخ','الجهة','المسؤول','الحالة','الطلبات'],rows.map(x=>[x.trip_date,x.destination,x.assignee_name,x.status,x.stops]))});

// ---------------------------------------------------------------- one place
router.get('/destination/:id', (req, res) => {
  const destination = db.prepare('SELECT * FROM destinations WHERE id = ?').get(req.params.id);
  if (!destination) return res.status(404).render('errors/404');

  const vis = visibleRequestFilter(req.user);

  const rows = db
    .prepare(
      `SELECT rd.*, r.ref, r.name, r.phone, r.title, r.service_label, r.deadline,
              r.is_critical, r.status AS request_status
       FROM request_destinations rd
       JOIN requests r ON r.id = rd.request_id
       WHERE rd.destination_id = ? AND r.archived_at IS NULL ${vis.sql}
       ORDER BY rd.status, r.is_critical DESC, rd.id
       LIMIT 300`
    )
    .all(destination.id, ...vis.params);

  res.render('admin/destination', {
    destination,
    pending: rows.filter((r) => r.status === 'pending'),
    done: rows.filter((r) => r.status !== 'pending').slice(0, 60),
    canManage: canManage(req),
    staff: db
      .prepare("SELECT id, display_name FROM users WHERE active = 1 AND role != 'admin' ORDER BY display_name")
      .all(),
    today: today(),
    printable: req.query.print === '1',
  });
});

// ---------------------------------------------------------------- attach
router.post('/request/:id/add', (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).render('errors/404');

  const back = `${req.adminPath}/requests/${request.id}`;
  const destinationId = parseInt(req.body.destination_id, 10);
  const destination = destinationId
    ? db.prepare('SELECT * FROM destinations WHERE id = ?').get(destinationId)
    : null;
  if (!destination) return res.redirect(`${back}?msg=bad_destination`);

  const task = (req.body.task || '').trim().slice(0, 200);

  db.prepare(
    `INSERT INTO request_destinations (request_id, destination_id, task, added_by)
     VALUES (?,?,?,?)`
  ).run(request.id, destination.id, task || null, me(req));

  audit.log(req, 'request.destination_add', {
    type: 'request',
    id: request.id,
    label: request.ref,
    details: `أضاف جهة: ${destination.name}${task ? ' — ' + task : ''}`,
  });

  res.redirect(`${back}?msg=destination_added`);
});

router.post('/item/:id/done', (req, res) => {
  const item = db
    .prepare(
      `SELECT rd.*, r.ref, d.name AS destination
       FROM request_destinations rd
       JOIN requests r ON r.id = rd.request_id
       JOIN destinations d ON d.id = rd.destination_id
       WHERE rd.id = ?`
    )
    .get(req.params.id);
  if (!item) return res.redirect(req.adminPath + '/errands');

  const back = req.body.next || `${req.adminPath}/errands/destination/${item.destination_id}`;
  const done = item.status === 'pending';

  db.prepare(
    `UPDATE request_destinations
     SET status = ?, done_by = ?, done_on = ?, result_note = ?
     WHERE id = ?`
  ).run(
    done ? 'done' : 'pending',
    done ? me(req) : null,
    done ? validDate(req.body.done_on) || today() : null,
    done ? (req.body.result_note || '').trim().slice(0, 300) || null : null,
    item.id
  );

  audit.log(req, 'request.destination_done', {
    type: 'request',
    id: item.request_id,
    label: item.ref,
    details: done
      ? `خلّص المطلوب من ${item.destination}${req.body.result_note ? ' — ' + req.body.result_note : ''}`
      : `رجّع المطلوب من ${item.destination} كمعلّق`,
  });

  res.redirect(back);
});

router.post('/item/:id/remove', can('errands.manage'), (req, res) => {
  const item = db
    .prepare(
      `SELECT rd.*, r.ref, d.name AS destination
       FROM request_destinations rd
       JOIN requests r ON r.id = rd.request_id
       JOIN destinations d ON d.id = rd.destination_id
       WHERE rd.id = ?`
    )
    .get(req.params.id);
  if (!item) return res.redirect(req.adminPath + '/errands');

  db.prepare('DELETE FROM request_destinations WHERE id = ?').run(item.id);

  audit.log(req, 'request.destination_remove', {
    type: 'request',
    id: item.request_id,
    label: item.ref,
    details: `شال الجهة: ${item.destination}`,
  });

  res.redirect(req.body.next || `${req.adminPath}/requests/${item.request_id}`);
});

// ---------------------------------------------------------------- trips
router.post('/trips/new', can('errands.manage'), (req, res) => {
  const destinationId = parseInt(req.body.destination_id, 10) || null;
  const tripDate = validDate(req.body.trip_date);
  if (!tripDate) return res.redirect(`${req.adminPath}/errands?msg=bad_date`);

  const assigneeId = parseInt(req.body.assignee_id, 10) || null;
  const assignee = assigneeId
    ? db.prepare('SELECT display_name FROM users WHERE id = ?').get(assigneeId)
    : null;

  const info = db
    .prepare(
      `INSERT INTO trips (destination_id, trip_date, assignee_id, assignee_name, note, created_by)
       VALUES (?,?,?,?,?,?)`
    )
    .run(
      destinationId, tripDate, assigneeId,
      assignee ? assignee.display_name : null,
      (req.body.note || '').trim().slice(0, 300) || null,
      me(req)
    );

  const tripId = Number(info.lastInsertRowid);

  // Everything outstanding at that place joins the trip, which is the whole
  // point — otherwise somebody transcribes the list by hand.
  if (destinationId) {
    const attached = db
      .prepare(
        `UPDATE request_destinations SET trip_id = ?
         WHERE destination_id = ? AND status = 'pending' AND trip_id IS NULL`
      )
      .run(tripId, destinationId).changes;

    audit.log(req, 'trip.create', {
      type: 'settings',
      details: `أنشأ مشوار ${tripDate} — ${attached} طلب`,
    });

    if (assigneeId) {
      notify.notifyUsers([assigneeId], null, {
        type: 'trip',
        text: `📍 عندك مشوار يوم ${tripDate} — ${attached} طلب`,
      });
    }
  }

  res.redirect(`${req.adminPath}/errands/trip/${tripId}`);
});

router.get('/trip/:id', (req, res) => {
  const trip = db
    .prepare(
      `SELECT t.*, d.name AS destination, d.colour, d.address
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
       WHERE t.id = ?`
    )
    .get(req.params.id);
  if (!trip) return res.status(404).render('errors/404');

  const stops = db
    .prepare(
      `SELECT rd.*, r.ref, r.name, r.phone, r.title, r.service_label, r.is_critical,
              d.name AS destination
       FROM request_destinations rd
       JOIN requests r ON r.id = rd.request_id
       JOIN destinations d ON d.id = rd.destination_id
       WHERE rd.trip_id = ?
       ORDER BY r.is_critical DESC, rd.id`
    )
    .all(trip.id);

  res.render('admin/trip', {
    trip,
    stops,
    canManage: canManage(req),
    today: today(),
    printable: req.query.print === '1',
  });
});

router.post('/trip/:id/close', can('errands.manage'), (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.redirect(req.adminPath + '/errands');

  const open = db
    .prepare("SELECT COUNT(*) c FROM request_destinations WHERE trip_id = ? AND status = 'pending'")
    .get(trip.id).c;

  db.prepare("UPDATE trips SET status = 'done', closed_at = datetime('now') WHERE id = ?")
    .run(trip.id);

  // Anything not finished goes back to the pool rather than disappearing with
  // the trip — it still needs doing, just on another day.
  db.prepare("UPDATE request_destinations SET trip_id = NULL WHERE trip_id = ? AND status = 'pending'")
    .run(trip.id);

  audit.log(req, 'trip.close', {
    type: 'settings',
    details: `قفل مشوار ${trip.trip_date}${open ? ` — ${open} طلب رجعوا للقائمة` : ''}`,
  });

  res.redirect(`${req.adminPath}/errands?msg=trip_closed`);
});

// ---------------------------------------------------------------- manage
router.post('/destinations/new', can('errands.manage'), (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.redirect(`${req.adminPath}/errands?msg=need_name`);

  const sort = db.prepare('SELECT COALESCE(MAX(sort),0) + 1 AS n FROM destinations').get().n;
  db.prepare('INSERT INTO destinations (name, address, note, colour, sort) VALUES (?,?,?,?,?)').run(
    name.slice(0, 100),
    (req.body.address || '').trim().slice(0, 200) || null,
    (req.body.note || '').trim().slice(0, 300) || null,
    /^#[0-9a-f]{6}$/i.test(req.body.colour || '') ? req.body.colour : '#2f7bbf',
    sort
  );

  audit.log(req, 'destination.create', { type: 'settings', details: `أضاف جهة: ${name}` });
  res.redirect(`${req.adminPath}/errands?msg=destination_created`);
});

router.post('/destinations/:id/delete', can('errands.manage'), (req, res) => {
  const d = db.prepare('SELECT * FROM destinations WHERE id = ?').get(req.params.id);
  if (!d) return res.redirect(req.adminPath + '/errands');

  const used = db
    .prepare("SELECT COUNT(*) c FROM request_destinations WHERE destination_id = ? AND status = 'pending'")
    .get(d.id).c;

  // Hidden rather than deleted while work is outstanding: removing it would
  // take the pending items with it.
  if (used > 0) {
    db.prepare('UPDATE destinations SET active = 0 WHERE id = ?').run(d.id);
    audit.log(req, 'destination.hide', {
      type: 'settings',
      details: `أخفى جهة: ${d.name} (فيها ${used} طلب معلّق)`,
    });
    return res.redirect(`${req.adminPath}/errands?msg=destination_hidden`);
  }

  const trashId = trash.remove({
    entity: 'destination',
    id: d.id,
    label: d.name,
    row: d,
    by: me(req),
    deleteFn: () => db.prepare('DELETE FROM destinations WHERE id = ?').run(d.id),
  });

  audit.log(req, 'destination.delete', { type: 'settings', details: `حذف جهة: ${d.name}` });
  res.redirect(`${req.adminPath}/errands?msg=destination_deleted&undo=${trashId}`);
});

module.exports = router;
