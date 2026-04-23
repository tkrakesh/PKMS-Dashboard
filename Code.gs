// ═══════════════════════════════════════════════════════════════
// PKMS Dashboard — Google Apps Script Backend  v2.0
// Rakesh's BASB Second Brain · Notion workspace
//
// All 6 databases:
//   SB_PARA          f77c8d2a-5aa7-8279-9ce3-8774a66053d8
//   SB_Tasks         ce5c8d2a-5aa7-821d-9bc0-07069607a168
//   SB_Daily Pages   b34c8d2a-5aa7-8282-b69f-87ec3519c80a
//   SB_Notes         c06c8d2a-5aa7-8368-b50e-078dacab4586
//   SB_Read Later    c63c8d2a-5aa7-834a-aa1d-878212dbfe4b
//   Weekly Review    328c8d2a-5aa7-835a-8e91-879a94262dd1
// ═══════════════════════════════════════════════════════════════
//
// ONE-TIME SETUP:
// 1. Apps Script → Project Settings → Script Prfoperties
//    Add key: NOTION_TOKEN  value: secret_xxxxxxxxxxxx
//    (notion.so/my-integrations → your integration → show token)
//
// 2. In Notion, open each database → ... → Connections
//    Connect your integration to ALL 6 databases above
//
// DEPLOY:
// 1. Deploy → New Deployment → Web App
// 2. Execute as: Me | Who has access: Anyone (or your org)
// 3. Open the /exec URL in your browser
// ═══════════════════════════════════════════════════════════════

var NOTION_VERSION = '2022-06-28';
var NOTION_BASE    = 'https://api.notion.com/v1';

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

// ── DEBUG: Run this manually in the Apps Script editor ─────────
// Click the function dropdown → select testConnection → Run
function testConnection() {
  var token = getToken_();
  var results = [];
  Object.keys(DB).forEach(function(key) {
    try {
      var resp = UrlFetchApp.fetch(NOTION_BASE + '/databases/' + DB[key], {
        method: 'get',
        headers: {
          'Authorization':  'Bearer ' + token,
          'Notion-Version': NOTION_VERSION,
        },
        muteHttpExceptions: true,
      });
      var code = resp.getResponseCode();
      var json = JSON.parse(resp.getContentText());
      results.push(key + ' (' + DB[key] + '): ' + (code === 200 ? '✅ OK — ' + (json.title && json.title[0] ? json.title[0].plain_text : '?') : '❌ ' + code + ' — ' + (json.message || '?')));
    } catch(e) {
      results.push(key + ': ❌ Exception — ' + e.message);
    }
  });
  Logger.log(results.join('\n'));
  console.log(results.join('\n'));
}

// ── Main fetch — called by frontend ───────────────────────────
function getDashboardData() {
  try {
    var token = getToken_();
    var today = new Date().toISOString().slice(0, 10);

    var para         = queryDB_(token, DB.PARA,          [], 100);
    var tasks        = queryDB_(token, DB.TASKS,         [], 100);
   var daily       = queryDB_(token, DB.DAILY_PAGES,   [sort_('Date', 'descending')], 14);
       var notes       = queryDB_(token, DB.NOTES,         [sort_('created_time', 'descending')], 100);
           var readLater   = queryDB_(token, DB.READ_LATER,     [sort_('created_time', 'descending')], 100);
    var weeklyReview = queryDB_(token, DB.WEEKLY_REVIEW, [], 50);

    var parsedTasks = parseTasks_(tasks);
    var parsedNotes = parseNotes_(notes);

    return {
      ok:           true,
      para:         parsePara_(para),
      tasks:        parsedTasks,
      daily:        parseDaily_(daily),
      notes:        parsedNotes,
      readLater:    parseReadLater_(readLater),
      weeklyReview: parseWeeklyReview_(weeklyReview),
      today:        today,
      synced:       new Date().toISOString(),
    };
  } catch (e) {
    console.error('getDashboardData:', e.message);
    return { ok: false, error: e.message };
  }
}

// ── Quick capture: task ────────────────────────────────────────
function captureTask(name) {
  try {
    var token = getToken_();
    var res = notionPost_(token, '/pages', {
      parent:     { database_id: DB.TASKS },
      properties: {
        Name:   { title: [{ text: { content: name } }] },
        Status: { status: { name: 'Not started' } },
      },
    });
    return { ok: true, url: res.url };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── Quick capture: raw note ────────────────────────────────────
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
    return { ok: true, url: res.url };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── Quick capture: read later ──────────────────────────────────
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
    return { ok: true, url: res.url };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── Notion API helpers ─────────────────────────────────────────
function queryDB_(token, dbId, sorts, pageSize) {
  var body = { page_size: pageSize || 50 };
  if (sorts && sorts.length) body.sorts = sorts;
  var res = notionPost_(token, '/databases/' + dbId + '/query', body);
  return res.results || [];
}

function sort_(prop, dir) { { return prop === 'created_time' ? { timestamp: 'created_time', direction: dir } : { property: prop, direction: dir }; }}

function notionPost_(token, path, body) {
  var resp = UrlFetchApp.fetch(NOTION_BASE + path, {
    method:             'post',
    headers: {
      'Authorization':  'Bearer ' + token,
      'Notion-Version': NOTION_VERSION,
      'Content-Type':   'application/json',
    },
    payload:            JSON.stringify(body),
    muteHttpExceptions: true,
  });
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
      category:  getSelect_(p.Category),  // Project | Area | Resource
      status:    getStatus_(p.Status),    // Active | Inactive | Not started | Done | Archived
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
      status:   getStatus_(p.Status),    // Not started | In progress | Waiting on | Done
      deadline: getDate_(p.Deadline),
      doOn:     getDate_(p['Do on']),
      tags:     getMultiSelect_(p.Tags), // Personal | Work | Online | Offline
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
      id:       r.id,
      url:      r.url,
      name:     getTitle_(p.Name),
      status:   getStatus_(p.Status),              // Raw | Polished | Archived
      keywords: getMultiSelect_(p['AI keywords']),
      sourceUrl: p['URL'] ? (p['URL'].url || null) : null,
      created:  r.created_time || null,
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
      type:          getSelect_(p.Type),   // Article | Book | Movie | Podcast | TV Series | YouTube video
      status:        getStatus_(p.Status), // Not started | In progress | Done
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
