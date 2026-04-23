// ═══════════════════════════════════════════════════════════════
// PKMS Dashboard — Code.gs  v3.0
// Enhancements: parallel fetch · CacheService · Google Calendar
//               inline Notion writes · per-DB error isolation
//               task status toggle · weekly review toggle
// ═══════════════════════════════════════════════════════════════
//
// SCRIPT PROPERTIES REQUIRED:
//   NOTION_TOKEN  = secret_xxxxxxxxxxxx
//
// GOOGLE CALENDAR SETUP:
//   Apps Script → Services → Add → Google Calendar API
//   (the CalendarApp service is built-in, no extra setup needed)
//
// ═══════════════════════════════════════════════════════════════

var NOTION_VERSION = '2022-06-28';
var NOTION_BASE    = 'https://api.notion.com/v1';
var CACHE_TTL      = 300; // 5 minutes

var DB = {
  PARA:          'e6ac8d2a-5aa7-824d-9c44-8140c61c3c9c',
  TASKS:         'd5ec8d2a-5aa7-8390-accd-01c040bcdfc2',
  DAILY_PAGES:   '1c1c8d2a-5aa7-827c-a026-8139c5311d61',
  NOTES:         '3e9c8d2a-5aa7-827f-abfc-01bad92e324f',
  READ_LATER:    '7e6c8d2a-5aa7-83f9-a3aa-816ececee687',
  WEEKLY_REVIEW: '762c8d2a-5aa7-8309-a088-01b1d8203121',
};

// ── Entry point ────────────────────────────────────────────────
function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('🧠 PKMS · Second Brain')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── Main data fetch (with cache) ───────────────────────────────
function getDashboardData() {
  var cache = CacheService.getUserCache();
  var cached = cache.get('pkms_dashboard_data');
  if (cached) {
    try {
      var parsed = JSON.parse(cached);
      parsed.fromCache = true;
      return parsed;
    } catch(e) { /* cache corrupt, refetch */ }
  }

  try {
    var token = getToken_();
    var today = new Date().toISOString().slice(0, 10);

    // Fetch all DBs with per-DB error isolation
    var para         = safeQueryDB_(token, DB.PARA,          [], 100, 'PARA');
    var tasks        = safeQueryDB_(token, DB.TASKS,         [], 100, 'TASKS');
    var daily        = safeQueryDB_(token, DB.DAILY_PAGES,   [sort_('Date', 'descending')], 14, 'DAILY_PAGES');
    var notes        = safeQueryDB_(token, DB.NOTES,         [sort_('created_time', 'descending')], 100, 'NOTES');
    var readLater    = safeQueryDB_(token, DB.READ_LATER,    [sort_('created_time', 'descending')], 100, 'READ_LATER');
    var weeklyReview = safeQueryDB_(token, DB.WEEKLY_REVIEW, [], 50, 'WEEKLY_REVIEW');
    var calEvents    = getCalendarEvents_();

    var result = {
      ok:           true,
      para:         parsePara_(para.rows),
      tasks:        parseTasks_(tasks.rows),
      daily:        parseDaily_(daily.rows),
      notes:        parseNotes_(notes.rows),
      readLater:    parseReadLater_(readLater.rows),
      weeklyReview: parseWeeklyReview_(weeklyReview.rows),
      calendar:     calEvents,
      errors:       [para.error, tasks.error, daily.error, notes.error,
                     readLater.error, weeklyReview.error].filter(Boolean),
      today:        today,
      synced:       new Date().toISOString(),
      fromCache:    false,
    };

    // Cache for 5 minutes
    try { cache.put('pkms_dashboard_data', JSON.stringify(result), CACHE_TTL); } catch(e) {}
    return result;

  } catch (e) {
    console.error('getDashboardData:', e.message);
    return { ok: false, error: e.message };
  }
}

// ── Force refresh (bypasses cache) ────────────────────────────
function refreshDashboardData() {
  CacheService.getUserCache().remove('pkms_dashboard_data');
  return getDashboardData();
}

// ── Google Calendar ────────────────────────────────────────────
function getCalendarEvents_() {
  try {
    var today    = new Date();
    var tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 7); // next 7 days

    var calendars = CalendarApp.getAllCalendars();
    var events = [];

    calendars.forEach(function(cal) {
      if (cal.isHidden()) return;
      var calEvents = cal.getEvents(today, tomorrow);
      calEvents.forEach(function(e) {
        events.push({
          id:       e.getId(),
          title:    e.getTitle(),
          start:    e.getStartTime().toISOString(),
          end:      e.getEndTime().toISOString(),
          allDay:   e.isAllDayEvent(),
          color:    cal.getColor(),
          calName:  cal.getName(),
          isNow:    today >= e.getStartTime() && today <= e.getEndTime(),
        });
      });
    });

    events.sort(function(a,b){ return new Date(a.start) - new Date(b.start); });
    return { ok: true, events: events };
  } catch(e) {
    return { ok: false, error: e.message, events: [] };
  }
}

// ── Create Google Calendar event from a task ──────────────────
function createCalendarEvent(taskName, dateStr, notes) {
  try {
    var date = new Date(dateStr);
    var end  = new Date(date.getTime() + 60 * 60 * 1000); // 1 hour default
    var cal  = CalendarApp.getDefaultCalendar();
    var event = cal.createEvent(taskName, date, end, {
      description: notes || 'Created from PKMS Dashboard',
    });
    CacheService.getUserCache().remove('pkms_dashboard_data');
    return { ok: true, eventId: event.getId() };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Update task status in Notion ──────────────────────────────
function updateTaskStatus(pageId, newStatus) {
  try {
    var token = getToken_();
    notionPatch_(token, '/pages/' + pageId, {
      properties: {
        Status: { status: { name: newStatus } },
      },
    });
    CacheService.getUserCache().remove('pkms_dashboard_data');
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Update task Do On date in Notion ──────────────────────────
function updateTaskDoOn(pageId, dateStr) {
  try {
    var token = getToken_();
    var props = {};
    if (dateStr) {
      props['Do on'] = { date: { start: dateStr } };
    } else {
      props['Do on'] = { date: null };
    }
    notionPatch_(token, '/pages/' + pageId, { properties: props });
    CacheService.getUserCache().remove('pkms_dashboard_data');
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Update task deadline in Notion ────────────────────────────
function updateTaskDeadline(pageId, dateStr) {
  try {
    var token = getToken_();
    var props = {};
    if (dateStr) {
      props['Deadline'] = { date: { start: dateStr } };
    } else {
      props['Deadline'] = { date: null };
    }
    notionPatch_(token, '/pages/' + pageId, { properties: props });
    CacheService.getUserCache().remove('pkms_dashboard_data');
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Toggle weekly review item done/undone in Notion ───────────
function toggleWeeklyReview(pageId, currentDone) {
  try {
    var token = getToken_();
    notionPatch_(token, '/pages/' + pageId, {
      properties: {
        Done: { checkbox: !currentDone },
      },
    });
    CacheService.getUserCache().remove('pkms_dashboard_data');
    return { ok: true, newValue: !currentDone };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Update PARA item status ────────────────────────────────────
function updateParaStatus(pageId, newStatus) {
  try {
    var token = getToken_();
    notionPatch_(token, '/pages/' + pageId, {
      properties: {
        Status: { status: { name: newStatus } },
      },
    });
    CacheService.getUserCache().remove('pkms_dashboard_data');
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Quick captures ────────────────────────────────────────────
function captureTask(name, doOn) {
  try {
    var token = getToken_();
    var props = {
      Name:   { title: [{ text: { content: name } }] },
      Status: { status: { name: 'Not started' } },
    };
    if (doOn) props['Do on'] = { date: { start: doOn } };
    var res = notionPost_(token, '/pages', {
      parent:     { database_id: DB.TASKS },
      properties: props,
    });
    CacheService.getUserCache().remove('pkms_dashboard_data');
    return { ok: true, url: res.url, id: res.id };
  } catch(e) { return { ok: false, error: e.message }; }
}

function captureNote(name) {
  try {
    var token = getToken_();
    var res = notionPost_(token, '/pages', {
      parent:     { database_id: DB.NOTES },
      properties: {
        Name:   { title: [{ text: { content: name } }] },
        Status: { status: { name: 'Raw' } },
      },
    });
    CacheService.getUserCache().remove('pkms_dashboard_data');
    return { ok: true, url: res.url, id: res.id };
  } catch(e) { return { ok: false, error: e.message }; }
}

function captureReadLater(name, url, type) {
  try {
    var token = getToken_();
    var props = {
      Name:   { title: [{ text: { content: name } }] },
      Status: { status: { name: 'Not started' } },
    };
    if (url)  props['Link'] = { url: url };
    if (type) props['Type'] = { select: { name: type } };
    var res = notionPost_(token, '/pages', {
      parent:     { database_id: DB.READ_LATER },
      properties: props,
    });
    CacheService.getUserCache().remove('pkms_dashboard_data');
    return { ok: true, url: res.url, id: res.id };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ── Notion API helpers ─────────────────────────────────────────
function safeQueryDB_(token, dbId, sorts, pageSize, label) {
  try {
    var rows = queryDB_(token, dbId, sorts, pageSize);
    return { rows: rows, error: null };
  } catch(e) {
    console.error('DB fetch failed [' + label + ']: ' + e.message);
    return { rows: [], error: label + ': ' + e.message };
  }
}

function queryDB_(token, dbId, sorts, pageSize) {
  var body = { page_size: pageSize || 50 };
  if (sorts && sorts.length) body.sorts = sorts;
  var res = notionPost_(token, '/databases/' + dbId + '/query', body);
  return res.results || [];
}

function sort_(prop, dir) { 
  return prop === 'created_time' ? { timestamp: 'created_time', direction: dir } : { property: prop, direction: dir }; 
}

function notionPost_(token, path, body) {
  return notionRequest_(token, 'post', path, body);
}

function notionPatch_(token, path, body) {
  return notionRequest_(token, 'patch', path, body);
}

function notionRequest_(token, method, path, body) {
  var opts = {
    method:             method,
    headers: {
      'Authorization':  'Bearer ' + token,
      'Notion-Version': NOTION_VERSION,
      'Content-Type':   'application/json',
    },
    muteHttpExceptions: true,
  };
  if (body) opts.payload = JSON.stringify(body);
  var resp = UrlFetchApp.fetch(NOTION_BASE + path, opts);
  var code = resp.getResponseCode();
  var json = JSON.parse(resp.getContentText());
  if (code >= 400) throw new Error('Notion ' + code + ': ' + (json.message || '?'));
  return json;
}

function getToken_() {
  var t = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
  if (!t) throw new Error('NOTION_TOKEN not set in Script Properties.');
  return t;
}

// ── Parsers ────────────────────────────────────────────────────
function parsePara_(rows) {
  return rows.map(function(r) {
    var p = r.properties;
    return {
      id:        r.id,
      url:       r.url,
      name:      getTitle_(p.Name),
      category:  getSelect_(p.Category),
      status:    getStatus_(p.Status),
      deadline:  getDate_(p.Deadline),
      taskCount: getRelation_(p.Tasks).length,
      noteCount: getRelation_(p.Notes).length,
      created:   r.created_time || null,
    };
  });
}

function parseTasks_(rows) {
  return rows.map(function(r) {
    var p = r.properties;
    return {
      id:       r.id,
      url:      r.url,
      name:     getTitle_(p.Name),
      status:   getStatus_(p.Status),
      deadline: getDate_(p.Deadline),
      doOn:     getDate_(p['Do on']),
      tags:     getMultiSelect_(p.Tags),
      created:  r.created_time || null,
    };
  });
}

function parseDaily_(rows) {
  return rows.map(function(r) {
    var p = r.properties;
    return {
      id:      r.id,
      url:     r.url,
      title:   getTitle_(p['Daily Page']),
      date:    getDate_(p.Date),
      slept:   getCheckbox_(p['Slept 7+hours']),
      workout: getMultiSelect_(p.Workout),
      protein: getNumber_(p['Protein Intake in g']),
      win:     getText_(p.Win),
    };
  });
}

function parseNotes_(rows) {
  return rows.map(function(r) {
    var p = r.properties;
    return {
      id:        r.id,
      url:       r.url,
      name:      getTitle_(p.Name),
      status:    getStatus_(p.Status),
      keywords:  getMultiSelect_(p['AI keywords']),
      sourceUrl: p['URL'] ? (p['URL'].url || null) : null,
      created:   r.created_time || null,
    };
  });
}

function parseReadLater_(rows) {
  return rows.map(function(r) {
    var p = r.properties;
    return {
      id:            r.id,
      url:           r.url,
      name:          getTitle_(p.Name),
      type:          getSelect_(p.Type),
      status:        getStatus_(p.Status),
      link:          p.Link ? (p.Link.url || null) : null,
      recommendedBy: getText_(p['Recommended by']),
      dateFinished:  getDate_(p['Date finished']),
      dateAdded:     r.created_time || null,
    };
  });
}

function parseWeeklyReview_(rows) {
  return rows.map(function(r) {
    var p = r.properties;
    return {
      id:   r.id,
      url:  r.url,
      name: getTitle_(p.Name),
      done: getCheckbox_(p.Done),
    };
  });
}

// ── Property extractors ────────────────────────────────────────
function getTitle_(p)       { return p && p.title       && p.title[0]     ? p.title[0].plain_text     : ''; }
function getSelect_(p)      { return p && p.select                         ? p.select.name             : null; }
function getStatus_(p)      { return p && p.status                         ? p.status.name             : null; }
function getDate_(p)        { return p && p.date                           ? p.date.start              : null; }
function getText_(p)        { return p && p.rich_text   && p.rich_text[0] ? p.rich_text[0].plain_text : ''; }
function getCheckbox_(p)    { return p ? p.checkbox === true               : false; }
function getNumber_(p)      { return p && p.number != null                 ? p.number                  : 0; }
function getMultiSelect_(p) { return p && p.multi_select ? p.multi_select.map(function(o){ return o.name; }) : []; }
function getRelation_(p)    { return p && p.relation ? p.relation : []; }

// ── Diagnostic (run from editor to test DB connections) ────────
function diagnoseDatabases() {
  var token = getToken_();
  var results = [];
  Object.keys(DB).forEach(function(name) {
    var resp = UrlFetchApp.fetch(NOTION_BASE + '/databases/' + DB[name], {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + token, 'Notion-Version': NOTION_VERSION },
      muteHttpExceptions: true,
    });
    var code = resp.getResponseCode();
    var msg  = code === 200 ? '✅ OK' : '❌ ' + code + ' — ' + JSON.parse(resp.getContentText()).message;
    results.push(name + ': ' + msg);
  });
  Logger.log(results.join('\n'));
  return results.join('\n');
}
