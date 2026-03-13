/**
 * ═══════════════════════════════════════════════════════════════
 * FLEETSOURCE SPOTTER IQ — v3.9 Production
 * Optimized for MyGeotab New UI
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    var STATES = {
        MOVING:       { key: 'MOVING',       label: 'Moving',       css: 'moving',       color: '#16a34a', tip: 'Engine On, Speed > 1 mph, Trailer Coupled.' },
        BOBTAILING:   { key: 'BOBTAILING',   label: 'Bobtailing',   css: 'bobtailing',   color: '#ca8a04', tip: 'Engine On, Speed > 1 mph, No Trailer detected.' },
        COUPLED_IDLE: { key: 'COUPLED_IDLE', label: 'Coupled Idle', css: 'coupled-idle', color: '#ea580c', tip: 'Engine On, Speed < 1 mph, Trailer Coupled.' },
        BOBTAIL_IDLE: { key: 'BOBTAIL_IDLE', label: 'Bobtail Idle', css: 'bobtail-idle', color: '#dc2626', tip: 'Engine On, Speed < 1 mph, No Trailer detected.' },
        OFF:          { key: 'OFF',          label: 'Off',          css: 'off',          color: '#374151', tip: 'Engine Off (RPM < 400).' }
    };
    var STATE_ORDER = ['MOVING', 'BOBTAILING', 'COUPLED_IDLE', 'BOBTAIL_IDLE', 'OFF'];
    var SLOT_LABELS = ['4–8 AM', '8 AM–12 PM', '12–4 PM', '4–8 PM', '8 PM–12 AM', '12–4 AM'];

    var TRUCKS = [
        { id: 'YT-101', name: 'YT-101', sensorOk: true },
        { id: 'YT-102', name: 'YT-102', sensorOk: true },
        { id: 'YT-103', name: 'YT-103', sensorOk: false },
        { id: 'YT-104', name: 'YT-104', sensorOk: true },
        { id: 'YT-105', name: 'YT-105', sensorOk: true },
        { id: 'YT-106', name: 'YT-106', sensorOk: false },
        { id: 'YT-107', name: 'YT-107', sensorOk: true },
        { id: 'YT-108', name: 'YT-108', sensorOk: true }
    ];

    var tooltipEl = null;

    function initTooltip() {
        tooltipEl = document.getElementById('tooltip');
    }

    /**
     * ATTACH TIP: Prevents cut-off in Geotab UI by centering on the cursor
     * and forcing a minimum margin from the screen edges.
     */
    function attachTip(el, text) {
        el.addEventListener('mouseenter', function (e) {
            var rect = el.getBoundingClientRect();
            tooltipEl.textContent = text;
            
            var centerX = rect.left + (rect.width / 2);
            var screenWidth = window.innerWidth;
            
            // Safety margins (160px) to prevent sidebar cutoff
            if (centerX < 160) centerX = 160; 
            if (centerX > screenWidth - 160) centerX = screenWidth - 160;

            tooltipEl.style.left = centerX + 'px';
            tooltipEl.style.top = (rect.top - 10) + 'px'; 
            tooltipEl.style.transform = 'translate(-50%, -100%)';
            tooltipEl.classList.add('tooltip--visible');
        });
        el.addEventListener('mouseleave', function () {
            tooltipEl.classList.remove('tooltip--visible');
        });
    }

    function el(tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html !== undefined) e.innerHTML = html;
        return e;
    }

    function gphClass(v) { return v < 2.0 ? 'green' : v <= 3.0 ? 'amber' : 'red'; }
    function gphColor(v) { return v < 2.0 ? '#16a34a' : v <= 3.0 ? '#ca8a04' : '#dc2626'; }
    function gphTag(v) { return v < 2.0 ? 'EFFICIENT' : v <= 3.0 ? 'MONITOR' : 'OVER LIMIT'; }

    function sensorBadgeHTML(ok) {
        if (ok) return '<span class="badge-sensor badge-sensor--jaw" data-tip="JAW SENSOR reporting. Full 5-state data available."><span class="badge-sensor__dot"></span>JAW SENSOR</span>';
        return '<span class="badge-sensor badge-sensor--rpm" data-tip="No IOX detected. Engine RPM data only."><span class="badge-sensor__dot"></span>RPM ONLY</span>';
    }

    function stateBadgeHTML(stateKey, isFallback, isOffline, checkSensor) {
        if (isOffline) return '<span class="badge-state badge-state--offline"><span class="badge-state__dot"></span>OFFLINE</span>';
        if (checkSensor) return '<span class="badge-state badge-state--check-sensor"><span class="badge-state__dot"></span>CHECK SENSOR</span>';
        if (isFallback) {
            var isOn = stateKey !== 'OFF';
            return '<span class="badge-state ' + (isOn ? 'badge-state--fallback-on' : 'badge-state--fallback-off') + '"><span class="badge-state__dot"></span>' + (isOn ? 'Engine On' : 'Off') + '</span>';
        }
        var st = STATES[stateKey];
        return '<span class="badge-state badge-state--' + st.css + '"><span class="badge-state__dot"></span>' + st.label + '</span>';
    }

    function wireTips(container) {
        var items = container.querySelectorAll('[data-tip]');
        for (var i = 0; i < items.length; i++) { attachTip(items[i], items[i].getAttribute('data-tip')); }
    }

    function buildLegend(container, showFallback) {
        container.innerHTML = '';
        STATE_ORDER.forEach(function (k) {
            var st = STATES[k];
            var item = el('span', 'legend__item');
            item.innerHTML = '<span class="legend__swatch" style="background:' + st.color + '"></span>' +
                             '<span style="color:' + st.color + ';font-weight:700">' + st.label + '</span>';
            item.setAttribute('data-tip', st.tip);
            container.appendChild(item);
        });
        if (showFallback) {
            var fb = el('span', 'legend__fallback');
            fb.innerHTML = '<span class="legend__hatch-swatch"></span><span style="color:#ca8a04;font-weight:700">RPM Only Fallback</span>';
            container.appendChild(fb);
        }
        wireTips(container);
    }

    function generateLiveData(shiftHrs) {
        return TRUCKS.map(function (truck, i) {
            return { truck: truck, stateKey: i % 2 === 0 ? 'MOVING' : 'BOBTAIL_IDLE', moves: 12, lastSeen: new Date(), fuelPct: '85%', defPct: '90%', engineHrs: 1200.5, isOffline: false, checkSensor: false };
        });
    }

    function generateTruckDay(truck, dayOff) {
        var slots = SLOT_LABELS.map(function (label) {
            return { label: label, offMin: 30, moving: 100, bobtailing: 10, coupledIdle: 20, bobtailIdle: 80, engH: 3.5, fuel: 8.2, gph: 2.3, fb: !truck.sensorOk };
        });
        return { truck: truck, slots: slots, tEH: 21.0, tF: 48.0, idlePct: 35, avgGph: 2.3, waste: 5.5, moves: 45, maxSpd: 12, fb: !truck.sensorOk };
    }

    function renderLive() {
        var data = generateLiveData(12);
        var tbody = document.getElementById('liveBody');
        tbody.innerHTML = '';
        data.forEach(function (row) {
            var tr = document.createElement('tr');
            tr.innerHTML = '<td><div class="asset-cell"><span class="asset-id">' + row.truck.name + '</span>' + sensorBadgeHTML(row.truck.sensorOk) + '</div></td>' +
                           '<td>' + stateBadgeHTML(row.stateKey, !row.truck.sensorOk, row.isOffline, row.checkSensor) + '</td>' +
                           '<td><span class="move-count">' + row.moves + '</span></td>' +
                           '<td>' + row.lastSeen.toLocaleTimeString() + '</td>' +
                           '<td>' + row.fuelPct + '</td>' +
                           '<td>' + row.engineHrs + ' h</td>';
            tbody.appendChild(tr);
        });
        wireTips(tbody);
        buildLegend(document.getElementById('liveLegend'), true);
    }

    function renderAuditFleet() {
        var tbody = document.getElementById('auditBody');
        tbody.innerHTML = '';
        TRUCKS.forEach(function (truck) {
            var row = generateTruckDay(truck, 0);
            var tr = document.createElement('tr');
            tr.setAttribute('data-clickable', '1');
            tr.addEventListener('click', function () { auditState.truckId = truck.id; auditState.view = 'drill'; showAuditView(); });
            tr.innerHTML = '<td><div class="asset-cell"><span class="asset-id">' + truck.name + '</span>' + sensorBadgeHTML(truck.sensorOk) + '</div></td>' +
                           '<td><span class="gph-pill gph-pill--' + gphClass(row.avgGph) + '">' + row.avgGph + '</span></td>' +
                           '<td style="color:#dc2626;font-weight:700">' + (row.waste || 'N/A') + ' gal</td>' +
                           '<td>' + row.idlePct + '%</td>' +
                           '<td>' + (row.moves || 'N/A') + '</td>' +
                           '<td>' + row.maxSpd + ' mph</td>' +
                           '<td>' + row.tEH + ' h</td>' +
                           '<td>' + row.tF + ' gal</td>';
            tbody.appendChild(tr);
        });
        wireTips(tbody);
        buildLegend(document.getElementById('auditLegend'), true);
    }

    var auditState = { view: 'fleet', truckId: null, day: 0 };

    function showAuditView() {
        var isFleet = auditState.view === 'fleet';
        document.getElementById('auditFleet').style.display = isFleet ? '' : 'none';
        document.getElementById('auditDrill').style.display = isFleet ? 'none' : 'block';
        if (isFleet) renderAuditFleet(); else renderDrillDown();
    }

    function renderDrillDown() {
        var truck = TRUCKS.find(t => t.id === auditState.truckId);
        var data = generateTruckDay(truck, 0);
        document.getElementById('drillTruckName').innerHTML = '<span>' + truck.name + '</span>' + sensorBadgeHTML(truck.sensorOk);
        var ribbon = document.getElementById('ribbon');
        ribbon.innerHTML = '';
        data.slots.forEach(function(s) {
            var slot = el('div', 'ribbon__slot');
            slot.innerHTML = '<div class="ribbon__seg ribbon__seg--moving" style="height:40%"></div>' +
                             '<div class="ribbon__seg ribbon__seg--bobtail-idle" style="height:60%"></div>' +
                             '<div class="ribbon__gph">' + s.gph + '</div>';
            ribbon.appendChild(slot);
        });
        wireTips(document.getElementById('drillCard'));
    }

    geotab.addin.spotterIQ = function (api, state) {
        return {
            initialize: function (api, state, callback) {
                initTooltip();
                document.getElementById('tabLive').addEventListener('click', function () { activeTab = 'live'; renderLive(); document.getElementById('viewLive').style.display = 'block'; document.getElementById('viewAudit').style.display = 'none'; });
                document.getElementById('tabAudit').addEventListener('click', function () { activeTab = 'audit'; showAuditView(); document.getElementById('viewLive').style.display = 'none'; document.getElementById('viewAudit').style.display = 'block'; });
                document.getElementById('drillBack').addEventListener('click', function () { auditState.view = 'fleet'; showAuditView(); });
                renderLive();
                callback();
            },
            focus: function (api, state) { renderLive(); },
            blur: function () {}
        };
    };
    var activeTab = 'live';
})();
