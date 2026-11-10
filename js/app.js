/* ABACBS 2026 interactive program -------------------------------------- */
(function () {
  'use strict';

  var STORE = 'abacbs2026.picks.v1';
  var THEME = 'abacbs2026.theme';
  var DATA = null;
  var picks = new Set();
  var state = { view: 'program', day: null, streams: new Set(), q: '', posterDay: 'Tue' };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var mins = function (hm) { var p = hm.split(':'); return (+p[0]) * 60 + (+p[1]); };
  var hhmm = function (m) {
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };

  /* ---------- storage ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) JSON.parse(raw).forEach(function (id) { picks.add(id); });
    } catch (e) { /* private mode */ }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(Array.from(picks))); } catch (e) {}
  }

  /* ---------- derived index ---------- */
  var ITEMS = [];   // every pickable thing, flattened, with time span
  function buildIndex() {
    ITEMS = [];
    DATA.events.forEach(function (ev) {
      if (ev.type === 'break') return;
      if (ev.talks && ev.talks.length) {
        ev.talks.forEach(function (t, i) {
          var next = ev.talks[i + 1];
          t.end = next ? next.start : ev.end;
          ITEMS.push({
            id: t.id, kind: 'talk', day: ev.day, start: t.start, end: t.end,
            title: t.title, speaker: t.speaker, affiliation: t.affiliation,
            room: ev.room, stream: ev.stream, parent: ev
          });
        });
      } else {
        ITEMS.push({
          id: ev.id, kind: ev.type, day: ev.day, start: ev.start, end: ev.end,
          title: ev.title, speaker: ev.speaker || '', affiliation: ev.affiliation || '',
          room: ev.room, stream: ev.stream, parent: ev
        });
      }
    });
    DATA.posters.forEach(function (p) {
      p.id = 'poster-' + p.day + '-' + p.number;
      var isTue = p.day === 'Tue';
      var odd = p.number % 2 === 1;
      p.date = isTue ? '2026-11-17' : '2026-11-18';
      p.slot = odd ? 'morning tea' : 'afternoon tea';
      p.start = odd ? (isTue ? '10:30' : '10:20') : (isTue ? '15:30' : '15:20');
      p.end = odd ? (isTue ? '11:15' : '11:05') : (isTue ? '16:15' : '16:05');
      ITEMS.push({
        id: p.id, kind: 'poster', day: p.date, start: p.start, end: p.end,
        title: p.title, speaker: p.presenter, affiliation: '',
        room: 'Posters: back of Storey Hall Auditorium (L5) & Green Brain Room (L7)',
        stream: 'Poster', parent: p, number: p.number
      });
    });
  }
  function itemById(id) {
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i];
    return null;
  }

  /* ---------- conflicts ---------- */
  function conflictsFor(id) {
    var me = itemById(id);
    if (!me || !picks.has(id)) return [];
    var out = [];
    picks.forEach(function (other) {
      if (other === id) return;
      var o = itemById(other);
      if (!o || o.day !== me.day) return;
      if (mins(o.start) < mins(me.end) && mins(me.start) < mins(o.end)) out.push(o);
    });
    return out;
  }

  /* ---------- toast ---------- */
  var toastT;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------- rendering helpers ---------- */
  function starBtn(id, small) {
    var b = el('button', 'star' + (small ? ' sm' : ''));
    b.type = 'button';
    var on = picks.has(id);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('aria-label', (on ? 'Remove from' : 'Add to') + ' my program');
    b.textContent = on ? '★' : '☆';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (picks.has(id)) { picks.delete(id); toast('Removed from My program'); }
      else {
        picks.add(id);
        var c = conflictsFor(id);
        toast(c.length ? 'Added — clashes with ' + c.length + ' other pick' + (c.length > 1 ? 's' : '') : 'Added to My program');
      }
      save();
      render();
    });
    return b;
  }

  function mark(text) {
    if (!state.q) return esc(text);
    var q = state.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return esc(text).replace(new RegExp('(' + q + ')', 'ig'), '<mark>$1</mark>');
  }

  var KICKER = {
    keynote: ['Keynote', ''], plenary: ['Plenary', 'grey'], lightning: ['Lightning talks', 'blue'],
    social: ['Social', 'blue'], satellite: ['Satellite event', 'blue'],
    'workshop-block': ['Workshops', 'blue'], parallel: ['Parallel session', 'blue'],
    break: ['Break', 'grey'], poster: ['Poster', 'blue']
  };

  function matches(item) {
    if (state.streams.size && !state.streams.has(item.stream)) return false;
    if (!state.q) return true;
    var q = state.q.toLowerCase();
    return [item.title, item.speaker, item.affiliation, item.room, item.stream]
      .join(' ').toLowerCase().indexOf(q) > -1;
  }

  function eventCard(ev, opts) {
    opts = opts || {};
    var card = el('div', 'card' + (ev.type === 'break' ? ' is-break' : ''));
    var head = el('div', 'card-head');
    var main = el('div', 'card-main');

    var k = KICKER[ev.type] || ['', 'grey'];
    var label = ev.badge || k[0];
    if (label) {
      var kick = el('div', 'kicker ' + (k[1] || ''));
      kick.textContent = label;
      main.appendChild(kick);
    }

    var h = el('h3');
    h.innerHTML = mark(ev.title);
    main.appendChild(h);

    var bits = [];
    if (ev.speaker) bits.push('<span class="who">' + mark(ev.speaker) + '</span>' +
      (ev.affiliation ? ' <span class="dot">·</span> ' + mark(ev.affiliation) : ''));
    var line2 = [];
    line2.push(ev.start + '–' + ev.end);
    if (ev.room) line2.push(mark(ev.room));
    if (ev.chairs) line2.push('Chairs: ' + mark(ev.chairs));
    bits.push(line2.join(' <span class="dot">·</span> '));
    var meta = el('p', 'meta');
    meta.innerHTML = bits.join('<br>');
    main.appendChild(meta);

    if (ev.desc) {
      var d = el('p', 'desc');
      d.innerHTML = mark(ev.desc);
      main.appendChild(d);
    }
    if (ev.notes && ev.notes.length) {
      var nl = el('ul', 'notes');
      ev.notes.forEach(function (n) {
        var li = el('li');
        li.innerHTML = '<strong>' + mark(n.label) + '</strong> ' + mark(n.text);
        nl.appendChild(li);
      });
      main.appendChild(nl);
    }
    var links = (ev.links || []).slice();
    if (ev.link) links.unshift({ label: 'Event page', url: ev.link });
    if (links.length) {
      var wrap = el('p', 'desc');
      links.forEach(function (l, i) {
        if (i) wrap.appendChild(el('span', 'dot', ' · '));
        var a = el('a', null, l.label + ' →');
        a.href = l.url; a.rel = 'noopener'; a.target = '_blank';
        wrap.appendChild(a);
      });
      main.appendChild(wrap);
    }

    head.appendChild(main);
    if (ev.type !== 'break' && !(ev.talks && ev.talks.length)) {
      head.appendChild(starBtn(ev.id));
      if (picks.has(ev.id)) {
        var c = conflictsFor(ev.id);
        if (c.length) {
          var w = el('div', 'conflict', '⚠ Clashes with ' + c.map(function (x) { return x.title; }).join('; '));
          main.appendChild(w);
        }
      }
    }
    card.appendChild(head);

    if (ev.items && ev.items.length) {            // lightning talks
      var ul = el('ul', 'talks');
      ev.items.forEach(function (it) {
        var li = el('li', 'talk');
        li.appendChild(el('div', 't-time', String(it.order)));
        var body = el('div', 't-body');
        var tt = el('p', 't-title'); tt.innerHTML = mark(it.title); body.appendChild(tt);
        var tw = el('p', 't-who'); tw.innerHTML = mark(it.speaker); body.appendChild(tw);
        li.appendChild(body);
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }

    if (ev.talks && ev.talks.length) {
      var list = el('ul', 'talks');
      var any = false;
      ev.talks.forEach(function (t) {
        var item = itemById(t.id);
        if (opts.onlyPicked && !picks.has(t.id)) return;
        if (!opts.onlyPicked && !matches(item)) return;
        any = true;
        var li = el('li', 'talk' + (picks.has(t.id) ? ' is-picked' : (opts.dimUnpicked ? ' is-dim' : '')));
        li.appendChild(el('div', 't-time', t.start));
        var body = el('div', 't-body');
        var tt = el('p', 't-title'); tt.innerHTML = mark(t.title); body.appendChild(tt);
        var tw = el('p', 't-who');
        tw.innerHTML = '<span class="who">' + mark(t.speaker) + '</span>' +
          (t.affiliation ? ' <span class="dot">·</span> ' + mark(t.affiliation) : '');
        body.appendChild(tw);
        if (picks.has(t.id)) {
          var cc = conflictsFor(t.id);
          if (cc.length) {
            body.appendChild(el('div', 'conflict',
              '⚠ Clashes with ' + cc.map(function (x) { return x.title; }).join('; ')));
          }
        }
        li.appendChild(body);
        li.appendChild(starBtn(t.id, true));
        list.appendChild(li);
      });
      if (any) card.appendChild(list);
      else if (opts.onlyPicked) return null;
      else if (state.q) return null;
    }
    return card;
  }

  /* ---------- views ---------- */
  function groupByStart(events) {
    var map = [];
    events.forEach(function (ev) {
      var g = map[map.length - 1];
      if (!g || g.start !== ev.start) { g = { start: ev.start, items: [] }; map.push(g); }
      g.items.push(ev);
    });
    return map;
  }

  function viewProgram(root) {
    var day = state.day;
    var evs = DATA.events.filter(function (e) { return e.day === day; });
    var dayMeta = DATA.meta.days.filter(function (d) { return d.date === day; })[0];

    var h = el('h2', 'day-head', dayMeta.long);
    root.appendChild(h);
    root.appendChild(el('p', 'day-sub', dayMeta.sub + ' · ' + DATA.meta.venue));

    var shown = 0;
    groupByStart(evs).forEach(function (g) {
      var cards = [];
      g.items.forEach(function (ev) {
        if (ev.type === 'break') {
          if (state.q || state.streams.size) return;
          cards.push(eventCard(ev));
          return;
        }
        if (ev.talks && ev.talks.length) {
          if (state.streams.size && !state.streams.has(ev.stream)) return;
          var c = eventCard(ev, { dimUnpicked: false });
          if (c) cards.push(c);
          return;
        }
        var item = itemById(ev.id);
        if (item && !matches(item)) return;
        cards.push(eventCard(ev));
      });
      if (!cards.length) return;
      shown += cards.length;
      var slot = el('div', 'slot');
      slot.appendChild(el('div', 'slot-time', g.start));
      var body = el('div', 'slot-body' + (cards.length > 1 ? ' pair' : ''));
      cards.forEach(function (c) { body.appendChild(c); });
      slot.appendChild(body);
      root.appendChild(slot);
    });

    if (!shown) {
      var e = el('div', 'empty');
      e.appendChild(el('strong', null, 'Nothing matches'));
      e.appendChild(el('p', null, 'Try a different search term or clear the stream filters.'));
      root.appendChild(e);
    }
  }

  function viewMine(root) {
    var head = el('div');
    head.appendChild(el('h2', 'day-head', 'My program'));
    head.appendChild(el('p', 'day-sub',
      picks.size + ' item' + (picks.size === 1 ? '' : 's') + ' saved on this device'));
    root.appendChild(head);

    if (!picks.size) {
      var e = el('div', 'empty');
      e.appendChild(el('strong', null, 'Nothing picked yet'));
      e.appendChild(el('p', null, 'Tap ☆ next to any talk, poster or event to build your own program. It is saved on this device and works offline.'));
      root.appendChild(e);
      return;
    }

    var mine = ITEMS.filter(function (i) { return picks.has(i.id); })
      .sort(function (a, b) { return a.day.localeCompare(b.day) || mins(a.start) - mins(b.start); });

    var nClash = mine.filter(function (i) { return conflictsFor(i.id).length; }).length;
    if (nClash) {
      var warn = el('div', 'banner');
      warn.innerHTML = '⚠ <strong>' + nClash + '</strong> of your picks overlap in time. Overlapping items are flagged below.';
      root.appendChild(warn);
    }

    DATA.meta.days.forEach(function (d) {
      var dayItems = mine.filter(function (i) { return i.day === d.date; });
      if (!dayItems.length) return;
      root.appendChild(el('h2', 'day-head', d.long));
      root.appendChild(el('p', 'day-sub', dayItems.length + ' item' + (dayItems.length === 1 ? '' : 's')));
      dayItems.forEach(function (i) {
        var card = el('div', 'card');
        var hd = el('div', 'card-head');
        var main = el('div', 'card-main');
        var k = el('div', 'kicker ' + (i.kind === 'keynote' ? '' : 'blue'));
        k.textContent = i.kind === 'poster' ? 'Poster ' + i.number : (i.stream || i.kind);
        main.appendChild(k);
        var h3 = el('h3'); h3.textContent = i.title; main.appendChild(h3);
        var m = el('p', 'meta');
        m.innerHTML = (i.speaker ? '<span class="who">' + esc(i.speaker) + '</span>' +
          (i.affiliation ? ' <span class="dot">·</span> ' + esc(i.affiliation) : '') + '<br>' : '') +
          i.start + '–' + i.end + (i.room ? ' <span class="dot">·</span> ' + esc(i.room) : '');
        main.appendChild(m);
        var cc = conflictsFor(i.id);
        if (cc.length) {
          main.appendChild(el('div', 'conflict',
            '⚠ Clashes with ' + cc.map(function (x) { return x.title; }).join('; ')));
        }
        hd.appendChild(main);
        hd.appendChild(starBtn(i.id));
        card.appendChild(hd);
        root.appendChild(card);
      });
    });

    var tools = el('div', 'card');
    tools.style.padding = '14px';
    tools.appendChild(el('h3', null, 'Take it with you'));
    var row = el('div', 'row-btns');
    var ics = el('button', 'btn primary', 'Add to calendar (.ics)');
    ics.type = 'button';
    ics.addEventListener('click', exportICS);
    var copy = el('button', 'btn', 'Copy share code');
    copy.type = 'button';
    copy.addEventListener('click', copyCode);
    var imp = el('button', 'btn', 'Paste share code');
    imp.type = 'button';
    imp.addEventListener('click', importCode);
    var clr = el('button', 'btn danger', 'Clear all');
    clr.type = 'button';
    clr.addEventListener('click', function () {
      if (confirm('Remove all ' + picks.size + ' saved items?')) {
        picks.clear(); save(); render(); toast('My program cleared');
      }
    });
    [ics, copy, imp, clr].forEach(function (b) { row.appendChild(b); });
    tools.appendChild(row);
    root.appendChild(tools);
  }

  function viewPosters(root) {
    root.appendChild(el('h2', 'day-head', 'Posters'));
    root.appendChild(el('p', 'day-sub',
      'A0 portrait · back of Storey Hall Auditorium (L5) and the Green Brain Room (L7). ' +
      'Odd numbers are presented at morning tea, even numbers at afternoon tea.'));

    var switcher = el('div', 'days');
    switcher.style.padding = '0 0 12px';
    [['Tue', 'Tuesday 17 Nov'], ['Wed', 'Wednesday 18 Nov']].forEach(function (d) {
      var b = el('button', 'day');
      b.type = 'button';
      b.setAttribute('aria-pressed', state.posterDay === d[0] ? 'true' : 'false');
      b.innerHTML = '<b>' + d[1] + '</b><span>95 posters</span>';
      b.addEventListener('click', function () { state.posterDay = d[0]; render(); });
      switcher.appendChild(b);
    });
    root.appendChild(switcher);

    var list = DATA.posters.filter(function (p) {
      if (p.day !== state.posterDay) return false;
      if (!state.q) return true;
      var q = state.q.toLowerCase();
      return (p.title + ' ' + p.presenter + ' ' + p.number).toLowerCase().indexOf(q) > -1;
    });

    if (!list.length) {
      var e = el('div', 'empty');
      e.appendChild(el('strong', null, 'No posters match'));
      root.appendChild(e);
      return;
    }

    var card = el('div', 'card');
    list.forEach(function (p) {
      var row = el('div', 'poster' + (picks.has(p.id) ? ' is-picked' : ''));
      var n = el('div', 'pnum', String(p.number));
      row.appendChild(n);
      var body = el('div', 't-body');
      var t = el('p', 't-title'); t.innerHTML = mark(p.title); body.appendChild(t);
      var w = el('p', 't-who');
      w.innerHTML = '<span class="who">' + mark(p.presenter) + '</span> <span class="dot">·</span> ' +
        (p.number % 2 ? 'morning tea' : 'afternoon tea');
      body.appendChild(w);
      row.appendChild(body);
      row.appendChild(starBtn(p.id, true));
      card.appendChild(row);
    });
    root.appendChild(card);
  }

  function viewInfo(root) {
    var m = DATA.meta;
    var logo = document.createElement('img');
    logo.src = 'icons/logo-folded.png';
    logo.alt = 'Australian Bioinformatics and Computational Biology Society';
    logo.className = 'logo-wide';
    root.appendChild(logo);
    root.appendChild(el('h2', 'day-head', m.name + ' — ' + m.tagline));
    root.appendChild(el('p', 'day-sub', m.dates + ' · ' + m.venue));

    var wrap = el('div', 'info');

    function card(title, html) {
      var c = el('div', 'card');
      c.style.padding = '14px';
      c.appendChild(el('h3', null, title));
      var p = el('div');
      p.innerHTML = html;
      c.appendChild(p);
      wrap.appendChild(c);
      return c;
    }

    card('Install this on your phone',
      '<p>This page works as an app: it opens full-screen from your home screen and keeps working without signal.</p>' +
      '<p><strong>iPhone / iPad (Safari):</strong> tap the <em>Share</em> button → <em>Add to Home Screen</em> → <em>Add</em>.</p>' +
      '<p><strong>Android (Chrome):</strong> tap the <em>⋮</em> menu → <em>Add to Home screen</em> / <em>Install app</em>.</p>' +
      '<p>Your saved picks live on the device, so install first and then build your program.</p>');

    card('Venue & getting here',
      '<p><strong>' + esc(m.venue) + '</strong><br>' + esc(m.address) + '</p>' +
      '<p>' + esc(m.info.getting_here) + '</p>' +
      '<p><strong>Registration desk:</strong> ' + esc(m.info.registration_desk) + '</p>');

    card('Posters', '<p>' + esc(m.info.posters) + '</p>');
    card('Accessibility & conduct',
      '<p>' + esc(m.info.access) + '</p>' +
      '<p><a href="' + m.info.code_of_conduct + '" rel="noopener" target="_blank">Code of conduct</a> · ' +
      '<a href="mailto:' + m.email + '">' + m.email + '</a></p>');
    card('Social', '<p>' + esc(m.info.social) + '</p>');

    var wsHtml = '<p>Workshops run Thursday afternoon and Friday at RMIT City Campus, alongside the BiocAsia Bioconductor workshops. ' +
      'Times are subject to change — the final grid is on the ' +
      '<a href="https://www.abacbs.org/workshops-2026-call" rel="noopener" target="_blank">workshops page</a>. ' +
      'Workshop attendance requires a conference registration (workshop fee is separate).</p>';
    DATA.workshops.forEach(function (w) {
      wsHtml += '<details><summary>' + esc(w.title) + '</summary>' +
        '<p><span class="pill">' + esc(w.duration || 'TBC') + '</span>' +
        (w.capacity ? '<span class="pill">max ' + esc(w.capacity) + '</span>' : '') + '</p>' +
        (w.presenters && w.presenters.length ? '<p><strong>' + esc(w.presenters.join(', ')) + '</strong></p>' : '') +
        (w.audience ? '<p><em>Who it is for:</em> ' + esc(w.audience) + '</p>' : '') +
        (w.prereq ? '<p><em>Prerequisites:</em> ' + esc(w.prereq) + '</p>' : '') +
        '</details>';
    });
    card('Workshops (' + DATA.workshops.length + ')', wsHtml);

    card('About this program',
      '<p>' + esc(m.note) + '</p>' +
      '<p>Last updated ' + esc(m.updated) + '. Official site: <a href="' + m.site + '" rel="noopener" target="_blank">abacbs.org/2026</a>.</p>');

    root.appendChild(wrap);
  }

  /* ---------- export / share ---------- */
  function exportICS() {
    var mine = ITEMS.filter(function (i) { return picks.has(i.id); });
    if (!mine.length) { toast('Nothing to export yet'); return; }
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ABACBS 2026//Program//EN', 'CALSCALE:GREGORIAN'];
    mine.forEach(function (i) {
      var d = i.day.replace(/-/g, '');
      var fold = function (s) {
        s = s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
        return s;
      };
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + i.id + '@abacbs2026');
      lines.push('DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z');
      lines.push('DTSTART;TZID=Australia/Melbourne:' + d + 'T' + i.start.replace(':', '') + '00');
      lines.push('DTEND;TZID=Australia/Melbourne:' + d + 'T' + i.end.replace(':', '') + '00');
      lines.push('SUMMARY:' + fold((i.kind === 'poster' ? 'Poster ' + i.number + ': ' : '') + i.title));
      lines.push('LOCATION:' + fold(i.room || DATA.meta.venue));
      lines.push('DESCRIPTION:' + fold([i.speaker, i.affiliation, i.stream].filter(Boolean).join(' · ')));
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'abacbs2026-my-program.ics';
    document.body.appendChild(a); a.click(); a.remove();
    toast('Calendar file downloaded');
  }

  function copyCode() {
    var code = btoa(JSON.stringify(Array.from(picks)));
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(function () { toast('Share code copied'); },
        function () { prompt('Copy your share code:', code); });
    } else { prompt('Copy your share code:', code); }
  }

  function importCode() {
    var code = prompt('Paste a share code to load that program:');
    if (!code) return;
    try {
      JSON.parse(atob(code.trim())).forEach(function (id) { picks.add(id); });
      save(); render(); toast('Program loaded');
    } catch (e) { toast('That code did not look right'); }
  }

  /* ---------- chrome ---------- */
  function renderDayBar() {
    var bar = $('#dayBar');
    bar.innerHTML = '';
    if (state.view !== 'program') { bar.hidden = true; return; }
    bar.hidden = false;
    DATA.meta.days.forEach(function (d) {
      var b = el('button', 'day');
      b.type = 'button';
      b.setAttribute('aria-pressed', state.day === d.date ? 'true' : 'false');
      b.innerHTML = '<b>' + d.label + '</b><span>' + d.sub + '</span>';
      b.addEventListener('click', function () { state.day = d.date; render(); window.scrollTo(0, 0); });
      bar.appendChild(b);
    });
  }

  function renderFilters() {
    var bar = $('#filterBar');
    bar.innerHTML = '';
    if (state.view !== 'program') { bar.hidden = true; return; }
    var streams = [];
    DATA.events.filter(function (e) { return e.day === state.day && e.type !== 'break'; })
      .forEach(function (e) { if (streams.indexOf(e.stream) < 0) streams.push(e.stream); });
    if (streams.length < 2) { bar.hidden = true; return; }
    bar.hidden = false;
    streams.forEach(function (s) {
      var c = el('button', 'chip', s);
      c.type = 'button';
      c.setAttribute('aria-pressed', state.streams.has(s) ? 'true' : 'false');
      c.addEventListener('click', function () {
        if (state.streams.has(s)) state.streams.delete(s); else state.streams.add(s);
        render();
      });
      bar.appendChild(c);
    });
    if (state.streams.size) {
      var clr = el('button', 'chip', '✕ clear');
      clr.type = 'button';
      clr.addEventListener('click', function () { state.streams.clear(); render(); });
      bar.appendChild(clr);
    }
  }

  function renderBanner() {
    var b = $('#banner');
    var now = new Date();
    var today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
    var isDay = DATA.meta.days.some(function (d) { return d.date === today; });
    if (state.view === 'program' && isDay && state.day === today) {
      var m = now.getHours() * 60 + now.getMinutes();
      var live = DATA.events.filter(function (e) {
        return e.day === today && mins(e.start) <= m && m < mins(e.end);
      });
      if (live.length) {
        b.hidden = false;
        b.innerHTML = '<strong>On now:</strong> ' + live.map(function (e) {
          return esc(e.title) + (e.room ? ' (' + esc(e.room) + ')' : '');
        }).join(' · ');
        return;
      }
    }
    b.hidden = true;
  }

  function render() {
    $('#mineCount').textContent = picks.size;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('is-active', t.dataset.view === state.view);
    });
    renderDayBar();
    renderFilters();
    renderBanner();
    var root = $('#view');
    root.innerHTML = '';
    if (state.view === 'program') viewProgram(root);
    else if (state.view === 'mine') viewMine(root);
    else if (state.view === 'posters') viewPosters(root);
    else viewInfo(root);
  }

  /* ---------- theme ---------- */
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME); } catch (e) {}
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    $('#themeBtn').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var isDark = cur ? cur === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      var next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME, next); } catch (e) {}
    });
  }

  /* ---------- boot ---------- */
  function todayOrFirst() {
    var now = new Date();
    var today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
    var hit = DATA.meta.days.filter(function (d) { return d.date === today; })[0];
    if (hit) return hit.date;
    var future = DATA.meta.days.filter(function (d) { return d.date > today; })[0];
    return future ? future.date : DATA.meta.days[1].date;
  }

  function wire() {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.addEventListener('click', function () {
        state.view = t.dataset.view;
        render();
        window.scrollTo(0, 0);
      });
    });
    var sb = $('#searchBtn'), sw = $('#searchWrap'), si = $('#search');
    sb.addEventListener('click', function () {
      var open = sw.hidden;
      sw.hidden = !open;
      sb.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) si.focus();
      else { si.value = ''; state.q = ''; render(); }
    });
    var t;
    si.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () { state.q = si.value.trim(); render(); }, 150);
    });
    $('#searchClear').addEventListener('click', function () {
      si.value = ''; state.q = ''; si.focus(); render();
    });
  }

  fetch('data/program.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      DATA = d;
      buildIndex();
      load();
      state.day = todayOrFirst();
      initTheme();
      wire();
      render();
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      }
    })
    .catch(function (e) {
      $('#view').innerHTML = '<div class="empty"><strong>Could not load the program</strong>' +
        '<p>If you opened this file directly, run it from a local web server instead ' +
        '(see the README).</p></div>';
    });
})();
