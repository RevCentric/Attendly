window.attendanceApp = () => {
    let timeDrift = 0;

    // Reusable Intl formatters (avoids constructing 4+ objects every second)
    const fmtISTTimeFull = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
    const fmtESTTimeFull = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
    const fmtCSTTimeFull = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
    const fmtISTDateFull = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata', weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
    const fmtISTTimeShort = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true
    });

    const YTD_SNAPSHOT_REGEX = /\s*\[\[YTD_AVAIL:([^|\]]*)\|([^\]]*)\]\]\s*$/;

    const parseLeaveSnapshot = (l) => {
        let rawReason = l.reason || '';
        let ytdLeaveAvail = (l.ytd_leave_avail !== undefined && l.ytd_leave_avail !== null && l.ytd_leave_avail !== '')
            ? Number(l.ytd_leave_avail) : null;
        let ytdPermAvail = (l.ytd_perm_avail !== undefined && l.ytd_perm_avail !== null && l.ytd_perm_avail !== '')
            ? Number(l.ytd_perm_avail) : null;

        const match = rawReason.match(YTD_SNAPSHOT_REGEX);
        if (match) {
            if (ytdLeaveAvail === null && match[1] !== '') {
                const parsedLv = Number(match[1]);
                if (!Number.isNaN(parsedLv)) ytdLeaveAvail = parsedLv;
            }
            if (ytdPermAvail === null && match[2] !== '') {
                const parsedPrm = Number(match[2]);
                if (!Number.isNaN(parsedPrm)) ytdPermAvail = parsedPrm;
            }
            rawReason = rawReason.replace(YTD_SNAPSHOT_REGEX, '').trim();
        }
        return { cleanReason: rawReason, ytdLeaveAvail, ytdPermAvail };
    };

    const fetchWithTimeout = (url, options = {}, timeoutMs = 2500) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        return fetch(url, { ...options, signal: controller.signal })
            .finally(() => clearTimeout(timer));
    };

    const scriptLoadCache = new Map();
    const loadScriptOnce = (src) => {
        if (scriptLoadCache.has(src)) return scriptLoadCache.get(src);
        const p = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = () => resolve(true);
            s.onerror = () => {
                scriptLoadCache.delete(src);
                reject(new Error(`Failed to load ${src}`));
            };
            document.head.appendChild(s);
        });
        scriptLoadCache.set(src, p);
        return p;
    };

    const ensureChartJS = async () => {
        if (!window.Chart) {
            try {
                await loadScriptOnce('https://cdn.jsdelivr.net/npm/chart.js');
                if (window.Chart) {
                    Chart.defaults.color = '#9ca3af';
                    Chart.defaults.font.family = 'Outfit';
                }
            } catch (e) {
                console.warn('Chart.js lazy-load failed:', e);
                return false;
            }
        }
        return !!window.Chart;
    };

    const ensureXLSX = async () => {
        if (!window.XLSX) {
            try {
                await loadScriptOnce('https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js');
            } catch (e) {
                console.warn('SheetJS lazy-load failed:', e);
                return false;
            }
        }
        return !!window.XLSX;
    };

    const parseTimeToMins = (str) => {
        if (!str) return -1;
        const m = str.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
        if (!m) return -1;
        let h = parseInt(m[1], 10);
        const mins = parseInt(m[2], 10);
        if (m[3]) {
            const ap = m[3].toUpperCase();
            if (ap === 'PM' && h < 12) h += 12;
            if (ap === 'AM' && h === 12) h = 0;
        }
        return h * 60 + mins;
    };

    const _memoCache = new Map();
    let _memoClearScheduled = false;
    const invalidateMemo = () => _memoCache.clear();
    const memoizeFrame = (key, deps, computeFn) => {
        const entry = _memoCache.get(key);
        if (entry && entry.deps.length === deps.length && entry.deps.every((v, i) => v === deps[i])) {
            return entry.value;
        }
        const value = computeFn();
        _memoCache.set(key, { deps, value });
        if (!_memoClearScheduled) {
            _memoClearScheduled = true;
            setTimeout(() => {
                _memoCache.clear();
                _memoClearScheduled = false;
            }, 0);
        }
        return value;
    };

    let _cachedNetInfo = null;
    let _cachedNetInfoAt = 0;

    const syncTrueTime = async () => {
        try {
            const res = await fetchWithTimeout('https://worldtimeapi.org/api/timezone/Asia/Kolkata', {}, 2500);
            const data = await res.json();
            timeDrift = new Date(data.datetime).getTime() - Date.now();
        } catch (e) {
            try {
                const res = await fetchWithTimeout('https://lpthzknjzmxwukwpvhii.supabase.co', { method: 'HEAD' }, 2500);
                const serverDateStr = res.headers.get('date');
                if (serverDateStr) {
                    timeDrift = new Date(serverDateStr).getTime() - Date.now();
                }
            } catch (err) {
                console.warn("Time sync fallback failed. Defaulting to local clock.");
            }
        }
    };

    const getNow = () => new Date(Date.now() + timeDrift);
    const getISTDate = (baseDate = getNow()) => new Date(baseDate.getTime() + 19800000);

    const getISTString = (date = getNow()) => {
        const ist = getISTDate(date);
        return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
    };

    const getISTDateObject = (date = getNow()) => {
        const ist = getISTDate(date);
        return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
    };

    const getISTTime24 = () => {
        const ist = getISTDate();
        return `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`;
    };

    const getCurrentTimeIST = () => fmtISTTimeShort.format(getNow());
    const generateSecureId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    const fetchSecureApiTimeIST = async () => getCurrentTimeIST();

    const getGreetingFromDate = (istDate) => {
        const h = istDate.getUTCHours();
        return h < 12 ? 'Good Morning' : (h < 17 ? 'Good Afternoon' : 'Good Evening');
    };

    const initialToday = getISTString();
    const todayObj = getISTDateObject();
    const firstDayStr = getISTString(new Date(Date.UTC(todayObj.getUTCFullYear(), todayObj.getUTCMonth(), 1)));
    const lastDayStr = getISTString(new Date(Date.UTC(todayObj.getUTCFullYear(), todayObj.getUTCMonth() + 1, 0)));

    setInterval(syncTrueTime, 15 * 60 * 1000);

    const isMobileDevice = () => {
        const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const hasTouchScreen = (navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
        const isSmallScreen = window.screen.width <= 1024;
        const isSpoofedMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
        return uaMobile || isSpoofedMac || (hasTouchScreen && isSmallScreen);
    };

    const clearAuthStorageOnly = () => {
        localStorage.removeItem('rc_admin_authenticated');
        localStorage.removeItem('rc_admin_pin');
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('sb-')) localStorage.removeItem(k);
        });
        sessionStorage.clear();
    };

    return {
        theme: localStorage.getItem('appTheme') || 'light',
        showPortalCharts: localStorage.getItem('showPortalCharts') !== 'false',
        originalAdminSession: null,
        isImpersonating: false,
        roleAccess: {},
        splitShiftEmps: [],
        weekOffDays: [0, 6],
        receivedWishes: [],
        systemBroadcastChannel: null,

        // Master Config inline editing states
        editingDept: null,
        editDeptValue: '',
        editingRole: null,
        editRoleValue: '',
        editingShift: null,
        editShiftForm: { name: '', inTime: '', outTime: '' },
        editingHolidayId: null,
        editHolidayForm: { id: '', name: '', date: '', dept: 'All' },

        calMonth: todayObj.getUTCMonth(),
        calYear: todayObj.getUTCFullYear(),
        selectedCalDate: initialToday,
        pinErrorShake: false,

        get monthName() {
            return new Date(Date.UTC(this.calYear, this.calMonth, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
        },

        get calendarDays() {
            return memoizeFrame('calendarDays', [
                this.calYear, this.calMonth, this.userSession?.id,
                this.punchLogs, this.attendanceData, this.members, this.holidayList
            ], () => {
                const year = this.calYear;
                const month = this.calMonth;
                const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
                const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
                const days = [];

                const mEvents = this.monthEvents || [];
                const eventsByDay = new Map();
                for (let i = 0; i < mEvents.length; i++) {
                    const ev = mEvents[i];
                    let entry = eventsByDay.get(ev.day);
                    if (!entry) {
                        entry = { hasBirthday: false, hasAnniversary: false };
                        eventsByDay.set(ev.day, entry);
                    }
                    if (ev.type === 'birthday') entry.hasBirthday = true;
                    else if (ev.type === 'anniversary') entry.hasAnniversary = true;
                }

                const userHolidays = this.individualStats?.holidays || [];
                const holidayDates = new Set(userHolidays.map(h => h.date));
                const uid = this.userSession?.id;
                const ymPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;

                for (let i = 0; i < firstDay; i++) days.push(null);
                for (let i = 1; i <= daysInMonth; i++) {
                    const dStr = ymPrefix + String(i).padStart(2, '0');
                    const evFlags = eventsByDay.get(i);
                    days.push({
                        day: i,
                        dateStr: dStr,
                        log: uid ? this.punchLogs[dStr]?.[uid] : null,
                        status: uid ? this.attendanceData[dStr]?.[uid] : null,
                        hasBirthday: evFlags ? evFlags.hasBirthday : false,
                        hasAnniversary: evFlags ? evFlags.hasAnniversary : false,
                        hasHoliday: holidayDates.has(dStr)
                    });
                }
                return days;
            });
        },

        get upcomingHolidays() {
            if (!this.holidayList || !this.holidayList.length) return [];
            const tomorrow = getISTDateObject();
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            const tomorrowStr = getISTString(tomorrow);
            const userDept = this.userSession?.dept;
            return this.holidayList.filter(h =>
                h.date === tomorrowStr && (h.dept === 'All' || !userDept || h.dept === userDept)
            );
        },

        async syncCalendar() {
            const targetMonthStart = `${this.calYear}-${String(this.calMonth + 1).padStart(2, '0')}-01`;
            if (targetMonthStart < this.scopeStartStr) {
                this.scopeStartStr = targetMonthStart;
            }
            await this.syncUserData();
            this.showNote(`Data Synced for ${this.monthName} ${this.calYear}`, "success");
        },

        getEventsForDate(dateStr) {
            if (!dateStr) return [];
            const d = Number(dateStr.split('-')[2]);
            const events = [];

            if (this.individualStats?.holidays) {
                this.individualStats.holidays.forEach(h => {
                    if (h.date === dateStr) {
                        events.push({
                            icon: '🏖️',
                            title: 'Holiday: ' + h.name,
                            color: 'text-violet-700 dark:text-violet-400',
                            bg: 'bg-violet-100/50 dark:bg-violet-900/40',
                            border: 'border-violet-200 dark:border-violet-800'
                        });
                    }
                });
            }

            const mEvents = this.monthEvents || [];
            for (let i = 0; i < mEvents.length; i++) {
                const e = mEvents[i];
                if (e.day === d) {
                    events.push({
                        icon: e.icon,
                        title: e.title + ': ' + e.member.name,
                        color: e.color,
                        bg: e.bg,
                        border: e.type === 'birthday' ? 'border-pink-200 dark:border-pink-900' : 'border-emerald-200 dark:border-emerald-900'
                    });
                }
            }

            return events;
        },

        getBreakIcon(type) {
            const icons = { 'Lunch': '🍱', 'Dinner': '🍽️', 'Tea': '☕', 'Bio': '🚻', 'Meeting': '🤝', 'Split Shift': '⏸️', 'Other': '🕒' };
            return icons[type] || '🕒';
        },

        async renderUserCharts() {
            if (this.view !== 'portal' || !this.userSession || !this.showPortalCharts) return;
            const ready = await ensureChartJS();
            if (!ready || this.view !== 'portal' || !this.userSession || !this.showPortalCharts) return;

            const uid = this.userSession.id;
            const ymPrefix = `${this.calYear}-${String(this.calMonth + 1).padStart(2, '0')}-`;

            let p = 0, a = 0, prm = 0, lop = 0, lv = 0;
            let totalAct = 0, totalBrk = 0, days = 0;

            for (let i = 1; i <= 31; i++) {
                const dStr = ymPrefix + String(i).padStart(2, '0');
                const st = this.attendanceData[dStr]?.[uid];
                if (st) {
                    if (['p', 'wfh', 'co', '1p', '2p', 'lop1', 'lop2'].includes(st)) p++;
                    else if (st === 'a') a++;
                    else if (st === 'h') lv += 0.5;
                    else if (st === 'fh') lv += 1;
                    else if (st === 'lop') lop += 1;
                    else if (st === 'loph') lop += 0.5;

                    if (st === '1p') prm += 1;
                    else if (st === '2p') prm += 2;
                    else if (st === 'lop1') lop += 0.125;
                    else if (st === 'lop2') lop += 0.25;
                }

                const log = this.punchLogs[dStr]?.[uid];
                if (log && log.in && log.out) {
                    totalAct += this.getActiveMinsForLog(log, dStr);
                    totalBrk += this.calculateTotalBreakMins(log.breaks);
                    days++;
                }
            }

            if (window.userPolarChart) window.userPolarChart.destroy();
            if (window.userBarChart) window.userBarChart.destroy();
            if (window.userRadialChart) window.userRadialChart.destroy();

            const isDark = this.theme === 'dark';
            const fontColor = isDark ? '#d4d4d8' : '#475569';
            const gridColor = isDark ? 'rgba(63,63,70,0.45)' : 'rgba(203,213,225,0.6)';

            const ctxPolar = document.getElementById('polarChart');
            if (ctxPolar) {
                window.userPolarChart = new Chart(ctxPolar, {
                    type: 'polarArea',
                    data: {
                        labels: ['Present', 'Absent', 'Perm (Hrs)', 'LOP', 'Holiday / Half'],
                        datasets: [{
                            data: [p, a, prm, Number(lop.toFixed(2)), lv],
                            backgroundColor: [
                                'rgba(16, 185, 129, 0.78)',
                                'rgba(242, 101, 34, 0.78)',
                                'rgba(15, 76, 129, 0.78)',
                                'rgba(225, 29, 72, 0.78)',
                                'rgba(139, 92, 246, 0.78)'
                            ],
                            borderColor: isDark ? '#18181b' : '#ffffff',
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'right',
                                labels: { color: fontColor, boxWidth: 10, usePointStyle: true, font: { family: 'Outfit', weight: '700', size: 11 } }
                            }
                        },
                        scales: {
                            r: {
                                grid: { color: gridColor },
                                ticks: { backdropColor: 'transparent', color: fontColor, font: { size: 9 } }
                            }
                        }
                    }
                });
            }

            // Build rolling Last 30 Days datasets (IST)
            const ACTIVE_TARGET = 480; // 8h target in minutes
            const BREAK_LIMIT = 60;    // 60m daily allowance

            const last30Labels = [];
            const last30Active = [];
            const last30Break = [];
            let sumAct30 = 0, actDays30 = 0;
            let sumBrk30 = 0, brkDays30 = 0;
            const activeShiftDate = this.getActiveShiftDate();

            for (let i = 29; i >= 0; i--) {
                const d = getISTDateObject();
                d.setUTCDate(d.getUTCDate() - i);
                const dStr = getISTString(d);
                last30Labels.push(
                    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
                );

                const log = this.punchLogs[dStr]?.[uid];
                let actMins = 0;
                let brkMins = 0;

                if (log && log.in) {
                    const isCountable = Boolean(log.out || dStr === activeShiftDate);
                    if (isCountable) {
                        actMins = this.getActiveMinsForLog(log, dStr);
                        brkMins = this.calculateTotalBreakMins(log.breaks);
                        if (actMins > 0) {
                            sumAct30 += actMins;
                            actDays30++;
                        }
                        sumBrk30 += brkMins;
                        brkDays30++;
                    }
                }

                last30Active.push(actMins);
                last30Break.push(brkMins);
            }

            const avgAct30 = actDays30 ? Math.round(sumAct30 / actDays30) : 0;
            const avgBrk30 = brkDays30 ? Math.round(sumBrk30 / brkDays30) : 0;

// Active Shift Pace: Last 30 Days Bar Graph + 30D Avg Line + 480m Target Line
            const ctxBar = document.getElementById('barChart');
            if (ctxBar) {
                const activeBarColors = last30Active.map(v =>
                    (v > 0 && v < ACTIVE_TARGET) ? '#e11d48' : '#0f4c81'
                );

                window.userBarChart = new Chart(ctxBar, {
                    type: 'bar',
                    data: {
                        labels: last30Labels,
                        datasets: [
                            {
                                type: 'bar',
                                label: 'Active (m)',
                                data: last30Active,
                                backgroundColor: activeBarColors,
                                borderRadius: 4,
                                barPercentage: 0.78,
                                categoryPercentage: 0.88,
                                order: 3
                            },
                            {
                                type: 'line',
                                label: `30D Avg (${this.formatBreakDisplay(avgAct30)})`,
                                data: Array(30).fill(avgAct30),
                                borderColor: '#f26522',
                                borderWidth: 2,
                                borderDash: [6, 4],
                                pointRadius: 0,
                                pointHoverRadius: 0,
                                fill: false,
                                order: 2
                            },
                            {
                                type: 'line',
                                label: `Target (${ACTIVE_TARGET}m)`,
                                data: Array(30).fill(ACTIVE_TARGET),
                                borderColor: '#10b981',
                                borderWidth: 1.75,
                                borderDash: [2, 3],
                                pointRadius: 0,
                                pointHoverRadius: 0,
                                fill: false,
                                order: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: { color: fontColor, boxWidth: 10, usePointStyle: true, font: { family: 'Outfit', weight: '700', size: 10 } }
                            },
                            tooltip: {
                                callbacks: {
                                    label: (ctx) => {
                                        const val = ctx.parsed.y;
                                        const flag = ctx.dataset.type === 'bar' && val > 0 && val < ACTIVE_TARGET ? ' — Below Target' : '';
                                        return `${ctx.dataset.label}: ${val}m (${this.formatBreakDisplay(val)})${flag}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: { color: fontColor, maxTicksLimit: 6, maxRotation: 0, font: { size: 9, weight: '600' } }
                            },
                            y: {
                                beginAtZero: true,
                                suggestedMax: Math.max(540, ...last30Active),
                                grid: { color: gridColor },
                                ticks: { color: fontColor, font: { size: 9 } }
                            }
                        }
                    }
                });
            }

            // Break Budget: Last 30 Days Bar Graph + 30D Avg Line + 60m Limit Line
            const ctxRadial = document.getElementById('radialChart');
            if (ctxRadial) {
                const breakBarColors = last30Break.map(v =>
                    v > BREAK_LIMIT ? '#e11d48' : '#f26522'
                );

                window.userRadialChart = new Chart(ctxRadial, {
                    type: 'bar',
                    data: {
                        labels: last30Labels,
                        datasets: [
                            {
                                type: 'bar',
                                label: 'Break (m)',
                                data: last30Break,
                                backgroundColor: breakBarColors,
                                borderRadius: 4,
                                barPercentage: 0.78,
                                categoryPercentage: 0.88,
                                order: 3
                            },
                            {
                                type: 'line',
                                label: `30D Avg (${avgBrk30}m)`,
                                data: Array(30).fill(avgBrk30),
                                borderColor: isDark ? '#38bdf8' : '#0f4c81',
                                borderWidth: 2,
                                borderDash: [6, 4],
                                pointRadius: 0,
                                pointHoverRadius: 0,
                                fill: false,
                                order: 2
                            },
                            {
                                type: 'line',
                                label: `Limit (${BREAK_LIMIT}m)`,
                                data: Array(30).fill(BREAK_LIMIT),
                                borderColor: '#e11d48',
                                borderWidth: 1.75,
                                borderDash: [2, 3],
                                pointRadius: 0,
                                pointHoverRadius: 0,
                                fill: false,
                                order: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: { color: fontColor, boxWidth: 10, usePointStyle: true, font: { family: 'Outfit', weight: '700', size: 10 } }
                            },
                            tooltip: {
                                callbacks: {
                                    label: (ctx) => {
                                        const val = ctx.parsed.y;
                                        const flag = ctx.dataset.type === 'bar' && val > BREAK_LIMIT ? ' — Exceeded' : '';
                                        return `${ctx.dataset.label}: ${val}m${flag}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: { color: fontColor, maxTicksLimit: 6, maxRotation: 0, font: { size: 9, weight: '600' } }
                            },
                            y: {
                                beginAtZero: true,
                                suggestedMax: Math.max(80, ...last30Break),
                                grid: { color: gridColor },
                                ticks: { color: fontColor, font: { size: 9 } }
                            }
                        }
                    }
                });
            }
	 },	
        async renderDashboardChart() {
            if (this.view !== 'dashboard') return;
            const ready = await ensureChartJS();
            if (!ready || this.view !== 'dashboard') return;
            const ctx = document.getElementById('dashboardChart');
            if (!ctx) return;
            if (window.adminDashboardChart) window.adminDashboardChart.destroy();

            const isDark = this.theme === 'dark';
            const fontColor = isDark ? '#d4d4d8' : '#475569';
            const gridColor = isDark ? 'rgba(63,63,70,0.45)' : 'rgba(226,232,240,0.8)';

            const statsTotals = this.dashboardStats.totals;
            const labels = this.statusOptions.map(s => s.display);
            const values = this.statusOptions.map(s => statsTotals[s.id] || 0);
            const colors = this.statusOptions.map(s => s.hex);

            window.adminDashboardChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Records',
                        data: values,
                        backgroundColor: colors,
                        borderRadius: 8,
                        borderSkipped: false,
                        maxBarThickness: 32
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#0f172a',
                            titleFont: { family: 'Outfit', weight: '700' },
                            bodyFont: { family: 'Outfit', weight: '600' },
                            padding: 10,
                            cornerRadius: 10
                        }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: fontColor, font: { family: 'Outfit', weight: '700', size: 11 } } },
                        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { precision: 0, color: fontColor, font: { family: 'Outfit', size: 10 } } }
                    }
                }
            });
        },

        get availableBreakTypes() {
            const base = ['Lunch', 'Dinner', 'Tea', 'Bio', 'Meeting', 'Other'];
            if (this.userSession && this.splitShiftEmps && this.splitShiftEmps.includes(this.userSession.id)) {
                base.push('Split Shift');
            }
            return base;
        },

        toggleSplitShiftAccess(mId) {
            if (!mId || !this.hasWriteAccess('members')) return this.showNote("Read-only access for Roster", "error");
            if (!this.splitShiftEmps) this.splitShiftEmps = [];
            const idx = this.splitShiftEmps.indexOf(mId);
            if (idx > -1) this.splitShiftEmps.splice(idx, 1);
            else this.splitShiftEmps.push(mId);

            this.splitShiftEmps = [...this.splitShiftEmps];
            this.upsertConfigCloud('split_shift_emps', this.splitShiftEmps);
            this.showNote(`Split Shift Access Updated`, "success");
        },

        toggleWeekOffDay(dayIdx) {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            const set = new Set(this.weekOffDays || [0, 6]);
            if (set.has(dayIdx)) set.delete(dayIdx);
            else set.add(dayIdx);
            this.weekOffDays = Array.from(set).sort((a, b) => a - b);
            this.upsertConfigCloud('week_off_days', this.weekOffDays);
            this.showNote("Week-off schedule updated", "success");
        },

        selectedBreakType: '',
        view: 'portal',
        dashboardPeriod: 'month',
        portalPeriod: 'month',
        filterName: '',
        filterDept: '',
        initialToday: initialToday,
        currentDate: initialToday,

        currentISTTimeWidget: '',
        currentESTTimeWidget: '',
        currentCSTTimeWidget: '',
        currentISTDateWidget: '',
        istGreeting: getGreetingFromDate(getISTDate()),
        liveShiftMins: 0,
        liveActiveMins: 0,
        liveTotalBreakMins: 0,

        isAdminAuthenticated: false,
        adminPinInput: '',
        masterPin: '000000',

        userSession: null,
        localSessionToken: null,
        userSyncChannel: null,
        loginIdInput: '',
        loginPinInput: '',
        breakPinInput: '',
        loginStep: 'id',
        tempUser: null,

        captchaTimer: null,
        captchaTimeoutTimer: null,
        captchaCountdownInterval: null,
        captchaSecondsRemaining: 120,
        get formattedCaptchaTime() {
            const mins = Math.floor(this.captchaSecondsRemaining / 60).toString().padStart(2, '0');
            const secs = (this.captchaSecondsRemaining % 60).toString().padStart(2, '0');
            return `${mins}:${secs}`;
        },
        titleFlashInterval: null,
        showCaptchaModal: false,
        captchaTargetNumber: '',
        captchaInput: '',
        currentCaptchaTime: null,

        adminFailedAttempts: 0,
        adminLockoutUntil: 0,
        userFailedAttempts: {},
        userLockoutUntil: {},
        idleTimeout: 5 * 60 * 1000,
        idleInterval: null,
        idleSecondsRemaining: 300,

        summaryStartDate: firstDayStr,
        summaryEndDate: lastDayStr,

        scopeStartStr: '',
        fetchedOldDates: new Set(),

        supabaseUrl: 'https://lpthzknjzmxwukwpvhii.supabase.co',
        supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwdGh6a25qem14d3Vrd3B2aGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzczMDksImV4cCI6MjA5MDgxMzMwOX0.C3uuAVuw3kQWFYcwAFa37bTYbVGOC3DIAgqYpw2osbs',
        supabase: null,

        members: [],
        attendanceData: {},
        punchLogs: {},
        ytdStats: {},
        userExceptionHistory: [],
        leaveRequests: [],
        roles: [],
        departments: [],
        shifts: [],
        holidayList: [],
        policiesNote: '',
        policyNoteDraft: '',
        broadcastDept: 'All',
        broadcastMessage: '',
        activeBroadcast: null,

        newRoleName: '',
        newDeptName: '',
        newShift: { name: '', inTime: '', outTime: '' },
        newHoliday: { name: '', date: '', dept: 'All' },
        isAddingMember: false,
        isEditing: false,
        isEditingLog: false,

        isSyncing: false,
        syncError: false,

        showDeleteModal: false,
        showPoliciesModal: false,
        showLeaveModal: false,
        showNotifications: false,
        showLogoutModal: false,
        logoutTimePreview: '',
        logoutPenaltyWarning: null,
        editingLogId: null,
        tempPunches: { in: '', out: '', breaks: [] },
        memberToDelete: null,
        notification: null,

        newMember: { empId: '', firstName: '', lastName: '', dept: 'General', role: 'Staff', shift: 'General Shift', allowedPL: 0, allowedSL: 0, allowedPerm: 0, doj: '', doe: '', dob: '', pin: '', captchaEnabled: false },
        newLeave: { type: 'a', startDate: '', endDate: '', startTime: '', endTime: '', reason: '' },

        statusOptions: [
            { id: 'p', display: 'P', label: 'Present', color: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-500', hex: '#10b981' },
            { id: 'wfh', display: 'WFH', label: 'Work From Home', color: 'text-blue-700', bg: 'bg-blue-50', ring: 'ring-blue-500', hex: '#3b82f6', value: 1 },
            { id: '1p', display: '1P', label: '1HR Perm.', color: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-500', hex: '#f59e0b', value: 1 },
            { id: '2p', display: '2P', label: '2HRS Perm.', color: 'text-orange-700', bg: 'bg-orange-50', ring: 'ring-orange-500', hex: '#ea580c', value: 2 },
            { id: 'h', display: 'H', label: 'Half Day', color: 'text-sky-700', bg: 'bg-sky-50', ring: 'ring-sky-500', hex: '#0ea5e9', value: 0.5 },
            { id: 'fh', display: 'FH', label: 'Holiday', color: 'text-violet-700', bg: 'bg-violet-50', ring: 'ring-violet-500', hex: '#8b5cf6' },
            { id: 'a', display: 'A', label: 'Absent', color: 'text-red-700', bg: 'bg-red-50', ring: 'ring-red-500', hex: '#ef4444', value: 1 },
            { id: 'lop', display: 'LOP', label: 'Loss of Pay', color: 'text-rose-700', bg: 'bg-rose-50', ring: 'ring-rose-500', hex: '#f43f5e', value: 1 },
            { id: 'lop1', display: 'L1', label: 'LOP-1HR', color: 'text-rose-700', bg: 'bg-rose-50', ring: 'ring-rose-500', hex: '#f43f5e', value: 1 },
            { id: 'lop2', display: 'L2', label: 'LOP-2HR', color: 'text-rose-700', bg: 'bg-rose-50', ring: 'ring-rose-500', hex: '#f43f5e', value: 2 },
            { id: 'loph', display: 'LH', label: 'LOP-Half Day', color: 'text-rose-700', bg: 'bg-rose-50', ring: 'ring-rose-500', hex: '#f43f5e', value: 0.5 },
            { id: 'w', display: 'W', label: 'Weekend', color: 'text-slate-600', bg: 'bg-slate-100', ring: 'ring-slate-400', hex: '#64748b' },
            { id: 'co', display: 'CO', label: 'Comp Off', color: 'text-teal-700', bg: 'bg-teal-50', ring: 'ring-teal-500', hex: '#0f766e', value: 1 }
        ],

        menuItems: [
            {
                id: 'portal',
                label: 'Portal',
                admin: false,
                color: 'text-sky-500 hover:text-sky-600',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>'
            },
            {
                id: 'dashboard',
                label: 'Stats',
                admin: true,
                color: 'text-indigo-500 hover:text-indigo-600',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>'
            },
            {
                id: 'record',
                label: 'Log',
                admin: true,
                color: 'text-emerald-500 hover:text-emerald-600',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>'
            },
            {
                id: 'members',
                label: 'Roster',
                admin: true,
                color: 'text-violet-500 hover:text-violet-600',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
            },
            {
                id: 'summary',
                label: 'Reports',
                admin: true,
                color: 'text-amber-500 hover:text-amber-600',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>'
            },
            {
                id: 'master',
                label: 'Master Config',
                admin: true,
                color: 'text-rose-500 hover:text-rose-600',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
            }
        ],

        toggleTheme() {
            this.theme = this.theme === 'light' ? 'dark' : 'light';
            localStorage.setItem('appTheme', this.theme);
        },

        togglePortalCharts() {
            this.showPortalCharts = !this.showPortalCharts;
            localStorage.setItem('showPortalCharts', this.showPortalCharts);

            if (this.showPortalCharts) {
                this.$nextTick(() => {
                    setTimeout(() => this.renderUserCharts(), 50);
                });
            } else {
                if (window.userPolarChart) { window.userPolarChart.destroy(); window.userPolarChart = null; }
                if (window.userBarChart) { window.userBarChart.destroy(); window.userBarChart = null; }
                if (window.userRadialChart) { window.userRadialChart.destroy(); window.userRadialChart = null; }
            }
        },

        async init() {
            const todayRef = getISTDateObject();
            const initScopeDate = new Date(todayRef.getTime() - 31 * 86400000);
            this.scopeStartStr = getISTString(initScopeDate);

            if ("Notification" in window && Notification.permission === "default") {
                Notification.requestPermission().catch(e => console.warn("Auto-prompt blocked:", e));
            }

            this.userSession = null;
            this.localSessionToken = null;
            this.supabase = supabase.createClient(this.supabaseUrl, this.supabaseKey);

            this.supabase.auth.onAuthStateChange((event) => {
                if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
                    this.userSession = null;
                    this.originalAdminSession = null;
                    this.isImpersonating = false;
                    this.localSessionToken = null;
                    clearAuthStorageOnly();
                }
            });

            if (localStorage.getItem('rc_admin_authenticated') === 'true') {
                this.isAdminAuthenticated = true;
                this.adminPinInput = localStorage.getItem('rc_admin_pin') || '';
            }

            syncTrueTime();

            const [, sessionRes] = await Promise.all([
                this.syncInitialConfig(),
                this.supabase.auth.getSession()
            ]);

            await this.restoreSession(sessionRes);

            this.$watch('currentDate', (newDate) => {
                if (this.scopeStartStr && newDate < this.scopeStartStr && !this.fetchedOldDates.has(newDate)) {
                    this.fetchHistoricalDate(newDate);
                }
            });

            this.$watch('calMonth', () => { setTimeout(() => this.renderUserCharts(), 50); });
            this.$watch('dashboardPeriod', () => { setTimeout(() => this.renderDashboardChart(), 50); });
            this.$watch('filterName', () => { setTimeout(() => this.renderDashboardChart(), 50); });
            this.$watch('filterDept', () => { setTimeout(() => this.renderDashboardChart(), 50); });
            this.$watch('theme', () => {
                setTimeout(() => {
                    this.renderUserCharts();
                    this.renderDashboardChart();
                }, 50);
            });
            this.$watch('view', (v) => {
                if (v === 'portal') setTimeout(() => this.renderUserCharts(), 150);
                if (v === 'dashboard') setTimeout(() => this.renderDashboardChart(), 150);
            });

            let lastDateCheck = '';
            const updateTick = () => {
                const now = getNow();
                this.currentISTTimeWidget = fmtISTTimeFull.format(now);
                this.currentESTTimeWidget = fmtESTTimeFull.format(now);
                this.currentCSTTimeWidget = fmtCSTTimeFull.format(now);

                const todayIST = getISTString(now);
                if (this.initialToday !== todayIST) {
                    this.initialToday = todayIST;
                }

                const istDate = getISTDate(now);
                const dateKeyDay = istDate.getUTCDate();
                if (lastDateCheck !== dateKeyDay) {
                    lastDateCheck = dateKeyDay;
                    this.currentISTDateWidget = fmtISTDateFull.format(now);
                }
                const nextGreeting = getGreetingFromDate(istDate);
                if (this.istGreeting !== nextGreeting) this.istGreeting = nextGreeting;

                if (this.userSession) {
                    const dateKey = this.getActiveShiftDate();
                    const log = this.punchLogs[dateKey]?.[this.userSession.id];
                    if (log && log.in) {
                        const outTime = log.out || fmtISTTimeShort.format(now);
                        const grossMins = Math.max(0, this.diffInMins(log.in, outTime));
                        const regularBreakMins = this.calculateTotalBreakMins(log.breaks);
                        const splitShiftMins = this.calculateSplitShiftMins(log.breaks);
                        const allBreaks = regularBreakMins + splitShiftMins;

                        const nextShift = Math.max(0, grossMins - splitShiftMins);
                        const nextActive = Math.max(0, grossMins - allBreaks);
                        if (this.liveShiftMins !== nextShift) this.liveShiftMins = nextShift;
                        if (this.liveActiveMins !== nextActive) this.liveActiveMins = nextActive;
                        if (this.liveTotalBreakMins !== regularBreakMins) this.liveTotalBreakMins = regularBreakMins;
                    } else {
                        if (this.liveShiftMins !== 0) this.liveShiftMins = 0;
                        if (this.liveActiveMins !== 0) this.liveActiveMins = 0;
                        if (this.liveTotalBreakMins !== 0) this.liveTotalBreakMins = 0;
                    }
                }
            };
            updateTick();
            setInterval(updateTick, 1000);

            ['mousemove', 'keydown', 'mousedown', 'touchstart'].forEach(evt => {
                window.addEventListener(evt, () => this.resetIdleTimer(), { passive: true });
            });

            window.addEventListener('focus', () => this.checkExpiredCaptchas());

            try {
                const bc = new BroadcastChannel('revcentric_captcha');
                bc.onmessage = (e) => {
                    if (e.data?.type === 'CAPTCHA_TRIGGERED' && this.userSession && e.data.userId === this.userSession.id) {
                        try { window.focus(); } catch (err) {}
                        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
                    }
                };
            } catch (e) {}
        },

        async restoreSession(preloadedSessionRes = null) {
            try {
                const { data: { session }, error } = preloadedSessionRes || await this.supabase.auth.getSession();

                if (error || !session) {
                    if (!this.isAdminAuthenticated) clearAuthStorageOnly();
                    return;
                }

                if (session.user.email === 'master@revcentric.local') {
                    this.isAdminAuthenticated = true;
                    localStorage.setItem('rc_admin_authenticated', 'true');
                    this.setupUserRealtime();
                    this.syncUserData(true);
                } else {
                    let matchedMember = this.members.find(m => m.auth_id === session.user.id);
                    if (!matchedMember) {
                        const { data: dbMember } = await this.supabase.from('members').select('*').eq('auth_id', session.user.id).single();
                        if (dbMember) {
                            matchedMember = {
                                id: dbMember.id, empId: dbMember.emp_id, firstName: dbMember.first_name, lastName: dbMember.last_name,
                                name: `${dbMember.first_name} ${dbMember.last_name || ''}`.trim(),
                                dept: dbMember.dept, role: dbMember.role, shift: dbMember.shift, pin: dbMember.pin,
                                doj: dbMember.doj, doe: dbMember.doe, dob: dbMember.dob, allowedPL: dbMember.allowed_pl, allowedSL: dbMember.allowed_sl,
                                allowedPerm: dbMember.allowed_perm, captchaEnabled: dbMember.captcha_enabled, auth_id: dbMember.auth_id,
                                current_session: dbMember.current_session
                            };
                        }
                    }

                    if (matchedMember) {
                        const todayStr = getISTString();
                        if (matchedMember.doe && matchedMember.doe < todayStr) {
                            await this.supabase.auth.signOut();
                            return;
                        }
                        this.localSessionToken = matchedMember.current_session;
                        this.userSession = JSON.parse(JSON.stringify(matchedMember));
                        this.setupUserRealtime();
                        await Promise.all([
                            this.syncUserData(true),
                            this.fetchExceptionHistory()
                        ]);
                        this.scheduleNextCaptcha();
                    } else {
                        await this.supabase.auth.signOut();
                    }
                }
            } catch (e) {
                console.error("Session restore failed", e);
                if (!this.isAdminAuthenticated) clearAuthStorageOnly();
            }
        },

        killSession() {
            if (this.isAdminAuthenticated) this.logoutAdmin();
            if (this.userSession) this.logoutUser();
        },

        async fetchDeviceAndNetworkInfo() {
            const nowMs = Date.now();
            if (_cachedNetInfo && (nowMs - _cachedNetInfoAt) < 5 * 60 * 1000) {
                return _cachedNetInfo;
            }

            const ua = navigator.userAgent;
            let os = "Unknown OS";

            if (ua.indexOf("Win") !== -1) {
                if (/Windows NT 10.0/.test(ua)) os = "Windows 10/11";
                else if (/Windows NT 6.2/.test(ua)) os = "Windows 8";
                else if (/Windows NT 6.1/.test(ua)) os = "Windows 7";
                else os = "Windows";
            } else if (ua.indexOf("Mac") !== -1) {
                if (/Mac OS X (\d+[._]\d+[._]?\d*)/.test(ua)) {
                    os = "MacOS " + ua.match(/Mac OS X (\d+[._]\d+[._]?\d*)/)[1].replace(/_/g, '.');
                } else os = "MacOS";
            } else if (/Android/.test(ua)) {
                if (/Android (\d+(\.\d+)?)/.test(ua)) {
                    os = "Android " + ua.match(/Android (\d+(\.\d+)?)/)[1];
                } else os = "Android";
            } else if (/iPhone|iPad|iPod/.test(ua)) {
                if (/OS (\d+)_(\d+)_?(\d+)?/.test(ua)) {
                    const match = ua.match(/OS (\d+)_(\d+)_?(\d+)?/);
                    os = `iOS ${match[1]}.${match[2]}`;
                } else os = "iOS";
            } else if (ua.indexOf("Linux") !== -1) {
                os = "Linux";
            }

            let result = `Unknown IP | OS: ${os}`;
            try {
                const res = await fetchWithTimeout('https://ipapi.co/json/', {}, 2500);
                const data = await res.json();
                let locationTag = "";
                if (data.country_code && data.country_code !== 'US') locationTag = ` [🚨 Outside US: ${data.country_name}]`;
                result = `${data.ip}${locationTag} | OS: ${os}`;
            } catch (e) {
                try {
                    const fbRes = await fetchWithTimeout('https://api.ipify.org?format=json', {}, 2500);
                    const fbData = await fbRes.json();
                    result = `${fbData.ip} | OS: ${os}`;
                } catch (err) {}
            }
            _cachedNetInfo = result;
            _cachedNetInfoAt = nowMs;
            return result;
        },

        async checkSecurityFlag(netString, memberName) {
            if (!netString || !memberName) return;
            const isAndroid = netString.includes('OS: Android');
            const isOutsideUS = netString.includes('[🚨 Outside US:');

            if (isAndroid || isOutsideUS) {
                const issues = [];
                if (isOutsideUS) issues.push('Foreign IP');
                if (isAndroid) issues.push('Android Device');
                console.warn(`🚨 SECURITY ALERT: ${memberName} detected on ${issues.join(' & ')} at ${this.getCurrentTimeIST()}. Details: ${netString}`);
            }
        },

        setupUserRealtime() {
            if (this.userSyncChannel) {
                this.supabase.removeChannel(this.userSyncChannel);
                this.userSyncChannel = null;
            }

            const actor = this.activeAuthSession;
            if (!actor && !this.isAdminAuthenticated) return;

            if (this.isManagerOrLead || this.isAdminAuthenticated) {
                this.userSyncChannel = this.supabase.channel('admin-tracking')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'punch_logs' }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'break_logs' }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'captcha_logs' }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'members' }, p => this.handleRealtimePayload(p))
                    .subscribe();
            } else {
                const myId = actor.id;
                this.userSyncChannel = this.supabase.channel(`user-${myId}-tracking`)
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `member_id=eq.${myId}` }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'punch_logs', filter: `member_id=eq.${myId}` }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'break_logs', filter: `member_id=eq.${myId}` }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'captcha_logs', filter: `member_id=eq.${myId}` }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'members', filter: `id=eq.${myId}` }, p => this.handleRealtimePayload(p))
                    .subscribe();
            }

            if (this.systemBroadcastChannel) {
                this.supabase.removeChannel(this.systemBroadcastChannel);
            }

            this.systemBroadcastChannel = this.supabase.channel('public-events')
                .on('broadcast', { event: 'send_wish' }, (payload) => {
                    if (this.userSession && payload.payload.targetId === this.userSession.id) {
                        if (!this.receivedWishes.includes(payload.payload.senderName)) {
                            this.receivedWishes.push(payload.payload.senderName);
                            this.showNote(`🎊 You received a wish from ${payload.payload.senderName}!`, "success");
                        }
                    }
                })
                .on('broadcast', { event: 'system_notice' }, (payload) => {
                    if (this.userSession && (payload.payload.dept === 'All' || payload.payload.dept === this.userSession.dept)) {
                        this.showNote(`📢 NOTICE: ${payload.payload.message}`, "success");
                        this.activeBroadcast = payload.payload;

                        if ("Notification" in window && Notification.permission === "granted") {
                            try {
                                new Notification(`📢 ${payload.payload.sender} (Broadcast)`, {
                                    body: payload.payload.message,
                                    icon: "logo.png",
                                    requireInteraction: true
                                });
                            } catch (e) {}
                        }
                    }
                })
                .on('broadcast', { event: 'clear_notice' }, () => {
                    this.activeBroadcast = null;
                })
                .subscribe();
        },

        sendWish(targetId) {
            if (!this.userSession || !this.systemBroadcastChannel) return;
            if (targetId === this.userSession.id) return;

            this.systemBroadcastChannel.send({
                type: 'broadcast',
                event: 'send_wish',
                payload: {
                    targetId: targetId,
                    senderName: this.activeAuthSession?.firstName || this.userSession.firstName || this.userSession.name
                }
            });

            this.showNote("Wish sent successfully! ✨", "success");
        },

        sendBroadcast() {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            if (!this.broadcastMessage.trim()) {
                return this.showNote("Please enter a message to broadcast.", "error");
            }
            if (!this.systemBroadcastChannel) {
                return this.showNote("Broadcast channel not connected.", "error");
            }

            const actor = this.activeAuthSession;
            const payload = {
                dept: this.broadcastDept,
                message: this.broadcastMessage.trim(),
                sender: actor?.name || 'Admin',
                time: this.getCurrentTimeIST(),
                timestamp: Date.now()
            };

            this.upsertConfigCloud('active_broadcast', payload);

            this.systemBroadcastChannel.send({
                type: 'broadcast',
                event: 'system_notice',
                payload: payload
            });

            this.showNote(`Broadcast sent to ${this.broadcastDept}`, "success");
            this.broadcastMessage = '';
        },

        async clearBroadcast() {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            this.activeBroadcast = null;
            try {
                await this.supabase.from('system_config').delete().eq('key', 'active_broadcast');
            } catch (e) {
                console.error("Failed to delete broadcast:", e);
            }
            if (this.systemBroadcastChannel) {
                this.systemBroadcastChannel.send({
                    type: 'broadcast',
                    event: 'clear_notice',
                    payload: {}
                });
            }
            this.showNote("Broadcast cleared globally", "success");
        },

        handleRealtimePayload(payload) {
            if (this.isEditingLog || this.isAddingMember) return;

            const { table, eventType, new: newRecord } = payload;

            if (table === 'members' && eventType === 'UPDATE') {
                const actor = this.activeAuthSession;
                if (actor && newRecord.id === actor.id && !this.isImpersonating) {
                    if (newRecord.current_session !== this.localSessionToken) {
                        this.logoutUser();
                        this.showNote("Logged out from another device/session", "error");
                        return;
                    }
                }
            }

            if (table === 'attendance') {
                const record = payload.new || payload.old;
                if (record && record.date === this.currentDate) {
                    if (eventType === 'DELETE') {
                        delete this.attendanceData[this.currentDate]?.[record.member_id];
                    } else {
                        if (!this.attendanceData[this.currentDate]) this.attendanceData[this.currentDate] = {};
                        this.attendanceData[this.currentDate][record.member_id] = record.status;
                    }
                    this.attendanceData = { ...this.attendanceData };
                    invalidateMemo();
                }
            }

            if (table === 'punch_logs') {
                const record = payload.new || payload.old;
                const dateKey = record?.date;

                if (dateKey) {
                    if (!this.punchLogs[dateKey]) this.punchLogs[dateKey] = {};
                    if (eventType === 'DELETE') {
                        delete this.punchLogs[dateKey][record.member_id];
                    } else {
                        if (!this.punchLogs[dateKey][record.member_id]) {
                            this.punchLogs[dateKey][record.member_id] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
                        }
                        this.punchLogs[dateKey][record.member_id].in = record.in_time || '';
                        this.punchLogs[dateKey][record.member_id].out = record.out_time || '';
                        this.punchLogs[dateKey][record.member_id].in_ip = record.in_ip || '';
                        this.punchLogs[dateKey][record.member_id].out_ip = record.out_ip || '';
                    }
                    this.punchLogs = { ...this.punchLogs };
                    invalidateMemo();
                }
            }

            if (table === 'break_logs') {
                const record = payload.new || payload.old;
                const dateKey = record?.log_date;

                if (dateKey) {
                    if (!this.punchLogs[dateKey]) this.punchLogs[dateKey] = {};
                    if (!this.punchLogs[dateKey][record.member_id]) {
                        this.punchLogs[dateKey][record.member_id] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
                    }

                    const breaks = this.punchLogs[dateKey][record.member_id].breaks || [];
                    const idx = breaks.findIndex(b => b.start === record.start_time);
                    if (eventType === 'DELETE') {
                        if (idx > -1) breaks.splice(idx, 1);
                    } else {
                        const bObj = { start: record.start_time, end: record.end_time || '', type: record.type || '' };
                        if (idx > -1) breaks[idx] = bObj;
                        else breaks.push(bObj);
                    }
                    this.punchLogs[dateKey][record.member_id].breaks = breaks;
                    this.punchLogs = { ...this.punchLogs };
                    invalidateMemo();
                }
            }

            if (table === 'captcha_logs') {
                const record = payload.new || payload.old;

                if (eventType === 'INSERT' && record?.status === 'Pending' && this.userSession && !this.isImpersonating && record.member_id === this.userSession.id) {
                    this.triggerCaptcha(record.check_time);
                }

                if (record && record.log_date === this.currentDate) {
                    if (!this.punchLogs[this.currentDate]) this.punchLogs[this.currentDate] = {};
                    if (!this.punchLogs[this.currentDate][record.member_id]) {
                        this.punchLogs[this.currentDate][record.member_id] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
                    }

                    const captchas = this.punchLogs[this.currentDate][record.member_id].captchas || [];
                    const idx = captchas.findIndex(c => c.time === record.check_time);
                    if (eventType === 'DELETE') {
                        if (idx > -1) captchas.splice(idx, 1);
                    } else {
                        const cObj = { time: record.check_time, status: record.status, ip: record.ip_address || '' };
                        if (idx > -1) captchas[idx] = cObj;
                        else captchas.push(cObj);
                    }
                    this.punchLogs[this.currentDate][record.member_id].captchas = captchas;
                    this.punchLogs = { ...this.punchLogs };
                    invalidateMemo();
                }
            }
        },

        async upsertConfigCloud(key, value) {
            try { await this.supabase.from('system_config').upsert({ key, value }); }
            catch (e) { console.error("Config save error", e); this.syncError = true; }
        },

        async upsertMemberCloud(m) {
            try {
                const payload = {
                    id: m.id, emp_id: m.empId, first_name: m.firstName, last_name: m.lastName,
                    dept: m.dept, role: m.role, shift: m.shift, pin: m.pin,
                    doj: m.doj || null, doe: m.doe || null, dob: m.dob || null,
                    allowed_pl: m.allowedPL, allowed_sl: m.allowedSL, allowed_perm: m.allowedPerm,
                    captcha_enabled: m.captchaEnabled
                };
                if (m.auth_id) payload.auth_id = m.auth_id;
                await this.supabase.from('members').upsert(payload);
            } catch (e) { console.error("Member save error", e); }
        },

        async upsertAttCloud(date, mId, status) {
            try {
                if (!status) {
                    await this.supabase.from('attendance').delete().match({ date, member_id: mId });
                } else {
                    const { data, error } = await this.supabase.from('attendance')
                        .update({ status })
                        .match({ date, member_id: mId })
                        .select();

                    if (!error && (!data || data.length === 0)) {
                        await this.supabase.from('attendance').insert({ date, member_id: mId, status });
                    }
                }
            } catch (e) { console.error("Attendance save error", e); }
        },

        async bulkUpsertAttCloud(recordsArray) {
            if (!recordsArray || recordsArray.length === 0) return;
            try {
                const BATCH_SIZE = 10;
                for (let i = 0; i < recordsArray.length; i += BATCH_SIZE) {
                    const chunk = recordsArray.slice(i, i + BATCH_SIZE);
                    await Promise.all(chunk.map(async (rec) => {
                        const { data, error } = await this.supabase.from('attendance')
                            .update({ status: rec.status })
                            .match({ date: rec.date, member_id: rec.member_id })
                            .select();

                        if (!error && (!data || data.length === 0)) {
                            await this.supabase.from('attendance').insert(rec);
                        }
                    }));
                }
            } catch (e) { console.error("Bulk Attendance save error", e); }
        },

        async upsertPunchCloud(date, mId) {
            try {
                const log = this.punchLogs[date]?.[mId];
                if (!log) return;

                const { data, error } = await this.supabase.from('punch_logs')
                    .update({
                        in_time: log.in || null, out_time: log.out || null,
                        in_ip: log.in_ip || null, out_ip: log.out_ip || null,
                        breaks: log.breaks || []
                    })
                    .match({ date, member_id: mId })
                    .select();

                if (!error && (!data || data.length === 0)) {
                    await this.supabase.from('punch_logs').insert({
                        date, member_id: mId,
                        in_time: log.in || null, out_time: log.out || null,
                        in_ip: log.in_ip || null, out_ip: log.out_ip || null,
                        breaks: log.breaks || []
                    });
                }
            } catch (e) { console.error("Punch save error", e); }
        },

        async upsertLeaveCloud(req) {
            const cleanReason = String(req.reason || '').replace(YTD_SNAPSHOT_REGEX, '').trim();
            const basePayload = {
                id: req.id, emp_id: req.empId, type: req.type, start_date: req.start_date || req.startDate,
                end_date: req.end_date || req.endDate, start_time: req.startTime || null,
                end_time: req.endTime || null, reason: cleanReason, status: req.status,
                requested_at: req.requestedAt || null,
                approved_at: req.approvedAt || null,
                reviewed_at: req.reviewedAt || req.approvedAt || null,
                reviewed_by_name: req.reviewedByName || null,
                reviewed_by_role: req.reviewedByRole || null,
                reviewed_by_emp_id: req.reviewedByEmpId || null
            };
            const extendedPayload = {
                ...basePayload,
                ytd_leave_avail: req.ytdLeaveAvail ?? null,
                ytd_perm_avail: req.ytdPermAvail ?? null
            };
            try {
                const { error } = await this.supabase.from('leave_requests').upsert(extendedPayload);
                if (error) {
                    const hasSnap = (req.ytdLeaveAvail !== null && req.ytdLeaveAvail !== undefined) ||
                                    (req.ytdPermAvail !== null && req.ytdPermAvail !== undefined);
                    const fallbackReason = hasSnap
                        ? `${cleanReason} [[YTD_AVAIL:${req.ytdLeaveAvail ?? ''}|${req.ytdPermAvail ?? ''}]]`.trim()
                        : cleanReason;
                    await this.supabase.from('leave_requests').upsert({ ...basePayload, reason: fallbackReason });
                }
            } catch (e) { console.error("Leave save error", e); }
        },

        async upsertHolidayCloud(h) {
            try { await this.supabase.from('holidays').upsert({ id: h.id, name: h.name, date: h.date, dept: h.dept }); }
            catch (e) { console.error("Holiday save error", e); }
        },

        async syncInitialConfig() {
            this.isSyncing = true;
            try {
                const [{ data: cData }, { data: mData }] = await Promise.all([
                    this.supabase.from('system_config').select('*'),
                    this.supabase.from('members').select('*')
                ]);

                if (cData) {
                    cData.forEach(row => {
                        if (row.key === 'roles') this.roles = row.value;
                        if (row.key === 'departments') this.departments = row.value;
                        if (row.key === 'shifts') this.shifts = row.value;
                        if (row.key === 'master_pin') this.masterPin = row.value;
                        if (row.key === 'split_shift_emps') this.splitShiftEmps = row.value || [];
                        if (row.key === 'week_off_days' && Array.isArray(row.value)) this.weekOffDays = row.value;
                        if (row.key === 'role_access') this.roleAccess = row.value || {};
                        if (row.key === 'policies_note') { this.policiesNote = row.value || ''; this.policyNoteDraft = this.policiesNote; }
                        if (row.key === 'active_broadcast' && row.value) {
                            this.activeBroadcast = (Date.now() - row.value.timestamp < 86400000) ? row.value : null;
                        }
                    });
                }

                if (mData) {
                    this.members = mData.map(m => ({
                        id: m.id, empId: m.emp_id, firstName: m.first_name, lastName: m.last_name,
                        name: `${m.first_name} ${m.last_name || ''}`.trim(),
                        dept: m.dept, role: m.role, shift: m.shift, pin: m.pin,
                        doj: m.doj, doe: m.doe, dob: m.dob, allowedPL: m.allowed_pl, allowedSL: m.allowed_sl,
                        allowedPerm: m.allowed_perm, captchaEnabled: m.captcha_enabled, auth_id: m.auth_id,
                        current_session: m.current_session
                    }));
                    this.members.sort((a, b) => a.empId.localeCompare(b.empId, undefined, { numeric: true, sensitivity: 'base' }));
                }
                invalidateMemo();
                this.syncError = false;
            } catch (e) {
                console.error("Initial Config Pull Error:", e);
                this.syncError = true;
            } finally {
                this.isSyncing = false;
            }
        },

        async fetchExceptionHistory() {
            if (!this.userSession) return;

            const { data: excData } = await this.supabase
                .from('member_exceptions_view')
                .select('date, status')
                .eq('member_id', this.userSession.id)
                .order('date', { ascending: false });

            if (excData) {
                const statusMap = new Map(this.statusOptions.map(s => [s.id, s]));
                this.userExceptionHistory = excData.map(log => ({
                    date: log.date,
                    label: this.formatDate(log.date),
                    status: statusMap.get(log.status)
                }));
                invalidateMemo();
            }
        },

        async syncUserData(silent = false) {
            this.isSyncing = true;
            try {
                let ytdQuery = this.supabase.from('member_ytd_stats').select('*');
                let attQuery = this.supabase.from('attendance').select('*').gte('date', this.scopeStartStr);
                let punchQuery = this.supabase.from('punch_logs').select('*').gte('date', this.scopeStartStr);
                let breakQuery = this.supabase.from('break_logs').select('*').gte('log_date', this.scopeStartStr);
                let capQuery = this.supabase.from('captcha_logs').select('*').gte('log_date', this.scopeStartStr);

                if (!this.isAdminAuthenticated && !this.isManagerOrLead && this.userSession) {
                    const myId = this.userSession.id;
                    ytdQuery = ytdQuery.eq('member_id', myId);
                    attQuery = attQuery.eq('member_id', myId);
                    punchQuery = punchQuery.eq('member_id', myId);
                    breakQuery = breakQuery.eq('member_id', myId);
                    capQuery = capQuery.eq('member_id', myId);
                }

                const [
                    { data: lData },
                    { data: hData },
                    { data: vData },
                    { data: aData },
                    { data: pData },
                    { data: bData },
                    { data: capData }
                ] = await Promise.all([
                    this.supabase.from('leave_requests').select('*'),
                    this.supabase.from('holidays').select('*'),
                    ytdQuery, attQuery, punchQuery, breakQuery, capQuery
                ]);

                if (lData) {
                    const memberNameMap = new Map();
                    for (let i = 0; i < this.members.length; i++) {
                        const m = this.members[i];
                        memberNameMap.set(m.id, m.name);
                        if (m.empId) memberNameMap.set(m.empId, m.name);
                    }
                    this.leaveRequests = lData.map(l => {
                        const snap = parseLeaveSnapshot(l);
                        return {
                            id: l.id, empId: l.emp_id, type: l.type, startDate: l.start_date,
                            endDate: l.end_date, startTime: l.start_time || '', endTime: l.end_time || '',
                            reason: snap.cleanReason, status: l.status,
                            ytdLeaveAvail: snap.ytdLeaveAvail,
                            ytdPermAvail: snap.ytdPermAvail,
                            requestedAt: l.requested_at || l.created_at || null,
                            approvedAt: l.approved_at || l.reviewed_at || null,
                            reviewedAt: l.reviewed_at || l.approved_at || null,
                            reviewedByName: l.reviewed_by_name || '',
                            reviewedByRole: l.reviewed_by_role || '',
                            reviewedByEmpId: l.reviewed_by_emp_id || '',
                            name: memberNameMap.get(l.emp_id) || ''
                        };
                    });
                }

                if (hData) this.holidayList = hData;

                const newYtdStats = {};
                if (vData) {
                    for (let i = 0; i < vData.length; i++) {
                        const row = vData[i];
                        newYtdStats[row.member_id] = {
                            leaves: row.ytd_leaves || 0,
                            compOffs: row.ytd_comp_off || 0,
                            permHours: row.ytd_perm_hours_used || 0
                        };
                    }
                }
                this.ytdStats = newYtdStats;

                const newAtt = {};
                if (aData) {
                    for (let i = 0; i < aData.length; i++) {
                        const r = aData[i];
                        if (!newAtt[r.date]) newAtt[r.date] = {};
                        newAtt[r.date][r.member_id] = r.status;
                    }
                }
                this.attendanceData = newAtt;

                const newPunch = {};
                if (pData) {
                    for (let i = 0; i < pData.length; i++) {
                        const r = pData[i];
                        if (!newPunch[r.date]) newPunch[r.date] = {};
                        newPunch[r.date][r.member_id] = {
                            in: r.in_time || '', out: r.out_time || '',
                            in_ip: r.in_ip || '', out_ip: r.out_ip || '',
                            breaks: [], captchas: []
                        };
                    }
                }
                if (bData) {
                    for (let i = 0; i < bData.length; i++) {
                        const b = bData[i];
                        if (!newPunch[b.log_date]) newPunch[b.log_date] = {};
                        if (!newPunch[b.log_date][b.member_id]) newPunch[b.log_date][b.member_id] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
                        newPunch[b.log_date][b.member_id].breaks.push({ start: b.start_time, end: b.end_time || '', type: b.type || '' });
                    }
                }
                if (capData) {
                    for (let i = 0; i < capData.length; i++) {
                        const c = capData[i];
                        if (!newPunch[c.log_date]) newPunch[c.log_date] = {};
                        if (!newPunch[c.log_date][c.member_id]) newPunch[c.log_date][c.member_id] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
                        newPunch[c.log_date][c.member_id].captchas.push({ time: c.check_time, status: c.status, ip: c.ip_address || '' });
                    }
                }
                this.punchLogs = newPunch;
                invalidateMemo();

                if (this.userSession && !this.isImpersonating) {
                    const today = this.getActiveShiftDate();
                    const log = this.punchLogs[today]?.[this.userSession.id];
                    if (log && log.captchas) {
                        const activePending = log.captchas.find(c => c.status === 'Pending');
                        if (activePending && !this.showCaptchaModal) {
                            this.triggerCaptcha(activePending.time);
                        }
                    }
                }

                this.checkExpiredCaptchas();
                this.processAutoLopForMissingPunches();
                setTimeout(() => {
                    this.renderUserCharts();
                    this.renderDashboardChart();
                }, 100);

                this.syncError = false;
                if (!silent) this.showNote("Database Synced", "success");
            } catch (e) {
                console.error("Cloud Pull Error:", e);
                this.syncError = true;
            } finally {
                this.isSyncing = false;
            }
        },

        async fetchHistoricalDate(targetDate) {
            this.isSyncing = true;
            this.fetchedOldDates.add(targetDate);

            try {
                const [
                    { data: aData },
                    { data: pData },
                    { data: bData },
                    { data: capData }
                ] = await Promise.all([
                    this.supabase.from('attendance').select('*').eq('date', targetDate),
                    this.supabase.from('punch_logs').select('*').eq('date', targetDate),
                    this.supabase.from('break_logs').select('*').eq('log_date', targetDate),
                    this.supabase.from('captcha_logs').select('*').eq('log_date', targetDate)
                ]);

                if (aData) {
                    if (!this.attendanceData[targetDate]) this.attendanceData[targetDate] = {};
                    aData.forEach(r => { this.attendanceData[targetDate][r.member_id] = r.status; });
                    this.attendanceData = { ...this.attendanceData };
                }

                if (!this.punchLogs[targetDate]) this.punchLogs[targetDate] = {};

                if (pData) {
                    pData.forEach(r => {
                        this.punchLogs[targetDate][r.member_id] = {
                            in: r.in_time || '', out: r.out_time || '', in_ip: r.in_ip || '', out_ip: r.out_ip || '', breaks: [], captchas: []
                        };
                    });
                }

                if (bData) {
                    bData.forEach(b => {
                        if (!this.punchLogs[targetDate][b.member_id]) this.punchLogs[targetDate][b.member_id] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
                        this.punchLogs[targetDate][b.member_id].breaks.push({ start: b.start_time, end: b.end_time || '', type: b.type || '' });
                    });
                }

                if (capData) {
                    capData.forEach(c => {
                        if (!this.punchLogs[targetDate][c.member_id]) this.punchLogs[targetDate][c.member_id] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
                        if (!this.punchLogs[targetDate][c.member_id].captchas) this.punchLogs[targetDate][c.member_id].captchas = [];
                        this.punchLogs[targetDate][c.member_id].captchas.push({ time: c.check_time, status: c.status, ip: c.ip_address || '' });
                    });
                }

                this.punchLogs = { ...this.punchLogs };
                invalidateMemo();
                this.showNote(`Historical log loaded for ${this.formatDate(targetDate)}`, "success");
            } catch (e) {
                console.error("Historical Pull Error:", e);
                this.fetchedOldDates.delete(targetDate);
                this.showNote("Failed to load historical data", "error");
            } finally {
                this.isSyncing = false;
            }
        },

        toggleMemberVerification(mId) {
            if (!mId || !this.hasWriteAccess('members')) return this.showNote("Read-only access for Roster", "error");
            const idx = this.members.findIndex(m => m.id === mId);
            if (idx > -1) {
                const current = !!this.members[idx].captchaEnabled;
                this.members[idx].captchaEnabled = !current;

                if (this.userSession && this.userSession.id === mId && !this.isImpersonating) {
                    this.userSession.captchaEnabled = !current;
                    if (this.userSession.captchaEnabled) {
                        if ("Notification" in window && Notification.permission !== "granted") Notification.requestPermission();
                        this.scheduleNextCaptcha();
                    } else {
                        this.clearCaptchaTimers();
                    }
                }

                this.upsertMemberCloud(this.members[idx]);
                invalidateMemo();
                this.showNote(`Verification for ${this.members[idx].firstName} ${!current ? 'Enabled' : 'Disabled'}`, "success");
            }
        },

        startCaptchaTone() {
            this.stopCaptchaTone();
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                const playPulse = () => {
                    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(880, ctx.currentTime);
                    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.14);
                    gain.gain.setValueAtTime(0.18, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.34);
                };
                playPulse();
                this._captchaToneInterval = setInterval(playPulse, 1800);
                this._captchaAudioCtx = ctx;
                this._unlockAudioHandler = () => {
                    if (this._captchaAudioCtx && this._captchaAudioCtx.state === 'suspended') {
                        this._captchaAudioCtx.resume().catch(() => {});
                    }
                    document.removeEventListener('click', this._unlockAudioHandler);
                    document.removeEventListener('keydown', this._unlockAudioHandler);
                    this._unlockAudioHandler = null;
                };
                document.addEventListener('click', this._unlockAudioHandler, { once: true });
                document.addEventListener('keydown', this._unlockAudioHandler, { once: true });
            } catch (e) {}
        },

        stopCaptchaTone() {
            if (this._captchaToneInterval) {
                clearInterval(this._captchaToneInterval);
                this._captchaToneInterval = null;
            }
            if (this._captchaAudioCtx) {
                try { this._captchaAudioCtx.close(); } catch (e) {}
                this._captchaAudioCtx = null;
            }
            if (this._unlockAudioHandler) {
                document.removeEventListener('click', this._unlockAudioHandler);
                document.removeEventListener('keydown', this._unlockAudioHandler);
                this._unlockAudioHandler = null;
            }
        },

        clearCaptchaTimers() {
            if (this.captchaTimer) { clearTimeout(this.captchaTimer); this.captchaTimer = null; }
            if (this.captchaTimeoutTimer) { clearTimeout(this.captchaTimeoutTimer); this.captchaTimeoutTimer = null; }
            if (this.captchaCountdownInterval) { clearInterval(this.captchaCountdownInterval); this.captchaCountdownInterval = null; }

            this.stopCaptchaTone();

            try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {}

            if (this._captchaVisibilityHandler) {
                document.removeEventListener('visibilitychange', this._captchaVisibilityHandler);
                window.removeEventListener('focus', this._captchaVisibilityHandler);
                this._captchaVisibilityHandler = null;
            }

            try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch (e) {}

            if (this.titleFlashInterval) {
                clearInterval(this.titleFlashInterval);
                this.titleFlashInterval = null;
                document.title = "RevCentric Solutions";
            }
        },

        scheduleNextCaptcha() {
            this.clearCaptchaTimers();
            if (!this.userSession || this.isImpersonating || !this.userSession.captchaEnabled || this.userOnBreak) return;
            const activeDate = this.getActiveShiftDate();
            const log = this.punchLogs[activeDate]?.[this.userSession.id];
            if (!log || !log.in || log.out) return;
            const minMs = 20 * 60 * 1000;
            const maxMs = 35 * 60 * 1000;
            const interval = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
            this.captchaTimer = setTimeout(() => {
                const currentLog = this.punchLogs[this.getActiveShiftDate()]?.[this.userSession?.id];
                if (this.userSession && !this.isImpersonating && this.userSession.captchaEnabled && !this.userOnBreak && currentLog?.in && !currentLog?.out) {
                    this.triggerCaptcha();
                }
            }, interval);
        },

        triggerCaptcha(forceTime = null) {
            if (this.isImpersonating) return;
            if (isMobileDevice()) {
                this.showNote("Verification Failed: Mobile devices are strictly prohibited.", "error");
                this.recordCaptchaResult('Failed');
                this.startBreak(null, 'Penalty');
                return;
            }
            this.clearCaptchaTimers();
            this.checkExpiredCaptchas();

            if (!this.userSession) return;
            if (!forceTime && !this.userSession.captchaEnabled) return;
            if (!forceTime && this.userOnBreak) return;

            const _guardDate = this.getActiveShiftDate();
            const _guardLog = this.punchLogs[_guardDate]?.[this.userSession.id];
            if (!forceTime && (!_guardLog?.in || _guardLog?.out)) return;

            if (this.showCaptchaModal && this.currentCaptchaTime) {
                this.recordCaptchaResult('Passed', this.currentCaptchaTime);
            }

            this.captchaTargetNumber = Math.floor(Math.random() * 10).toString();
            this.captchaInput = '';
            this.showCaptchaModal = true;

            if (forceTime) {
                this.currentCaptchaTime = forceTime;
            } else {
                this.currentCaptchaTime = this.getCurrentTimeIST();
                this.recordCaptchaResult('Pending', this.currentCaptchaTime);
            }

            if ("Notification" in window && Notification.permission === "granted") {
                try {
                    new Notification("🚨 Identity Verification Required", {
                        body: "Return to RevCentric NOW and enter your code. Failure will lock your session.",
                        icon: "logo.png",
                        requireInteraction: true,
                        vibrate: [300, 100, 300, 100, 300],
                        tag: "captcha-alert",
                        renotify: true
                    });
                } catch (e) {}
            }

            try { window.focus(); } catch (e) {}

            try {
                const el = document.documentElement;
                if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
                else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            } catch (e) {}

            this.startCaptchaTone();

            try {
                if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500, 200, 1000]);
            } catch (e) {}

            const originalTitle = document.title || "RevCentric Solutions";
            let isFlashing = false;
            this.titleFlashInterval = setInterval(() => {
                document.title = isFlashing ? "🚨 VERIFY NOW 🚨" : originalTitle;
                isFlashing = !isFlashing;
            }, 800);

            try {
                const bc = new BroadcastChannel('revcentric_captcha');
                bc.postMessage({ type: 'CAPTCHA_TRIGGERED', userId: this.userSession?.id });
                bc.close();
            } catch (e) {}

            this._captchaVisibilityHandler = () => {
                if (!document.hidden && this.showCaptchaModal) {
                    try { window.focus(); } catch (e) {}
                    setTimeout(() => {
                        const el = document.querySelector('[x-ref="captchaInputRef"]') || document.getElementById('captcha-input-field');
                        if (el) el.focus();
                    }, 100);
                }
            };
            document.addEventListener('visibilitychange', this._captchaVisibilityHandler);
            window.addEventListener('focus', this._captchaVisibilityHandler);

            this.captchaTimeoutTimer = setTimeout(() => {
                this.handleCaptchaTimeout();
            }, 120000);
            this.captchaSecondsRemaining = 120;
            this.captchaCountdownInterval = setInterval(() => {
                if (this.captchaSecondsRemaining > 0) this.captchaSecondsRemaining--;
                else clearInterval(this.captchaCountdownInterval);
            }, 1000);
        },

        submitCaptcha() {
            if (!this.showCaptchaModal) return;
            this.clearCaptchaTimers();
            this.showCaptchaModal = false;

            const passed = this.captchaInput === this.captchaTargetNumber;
            this.recordCaptchaResult(passed ? 'Passed' : 'Failed');
            this.currentCaptchaTime = null;

            if (passed) {
                this.showNote("Verified Successfully", "success");
                this.scheduleNextCaptcha();
            } else {
                this.showNote("Verification Failed. Auto-initiating break.", "error");
                this.startBreak(null, 'Penalty');
            }
        },

        handleCaptchaTimeout() {
            if (!this.showCaptchaModal) return;
            this.showCaptchaModal = false;
            this.clearCaptchaTimers();

            this.recordCaptchaResult('Missed');
            this.currentCaptchaTime = null;

            this.showNote("Verification Missed. Auto-initiating break.", "error");
            this.startBreak(null, 'Penalty');
        },

        async recordCaptchaResult(status, timeOverride = null) {
            if (!this.userSession || this.isImpersonating) return;
            let secureTime = null;
            if (!timeOverride && !this.currentCaptchaTime) {
                secureTime = await fetchSecureApiTimeIST();
                if (!secureTime) return;
            }
            const activeDate = this.getActiveShiftDate();
            const uId = this.userSession.id;
            const checkTime = timeOverride || this.currentCaptchaTime || secureTime;
            const currentIp = await this.fetchDeviceAndNetworkInfo();

            this.checkSecurityFlag(currentIp, this.userSession.name);

            if (!this.punchLogs[activeDate]) this.punchLogs[activeDate] = {};
            if (!this.punchLogs[activeDate][uId] || !this.punchLogs[activeDate][uId].in) {
                this.punchLogs[activeDate][uId] = { in: secureTime, out: '', in_ip: currentIp, out_ip: '', breaks: [], captchas: [] };
            }
            if (!this.punchLogs[activeDate][uId].captchas) this.punchLogs[activeDate][uId].captchas = [];

            const existingIdx = this.punchLogs[activeDate][uId].captchas.findIndex(c => c.time === checkTime);
            if (existingIdx > -1) {
                this.punchLogs[activeDate][uId].captchas[existingIdx].status = status;
                this.punchLogs[activeDate][uId].captchas[existingIdx].ip = currentIp;
            } else {
                this.punchLogs[activeDate][uId].captchas.push({ time: checkTime, status: status, ip: currentIp });
            }
            this.punchLogs = { ...this.punchLogs };
            invalidateMemo();

            try {
                if (status === 'Pending') {
                    await this.supabase.from('captcha_logs').insert({
                        member_id: uId, log_date: activeDate, check_time: checkTime, status: status, ip_address: currentIp
                    });
                } else {
                    await this.supabase.from('captcha_logs')
                        .update({ status: status, ip_address: currentIp })
                        .match({ member_id: uId, log_date: activeDate, check_time: checkTime });
                }
            } catch (e) { console.error("Captcha log error", e); }
        },

        async forceCaptcha(mId) {
            if (!this.hasWriteAccess('record')) return this.showNote("Read-only access for Log", "error");
            const checkTime = this.getCurrentTimeIST();
            const currentIp = await this.fetchDeviceAndNetworkInfo();

            const todayStr = getISTString();
            const yDate = getISTDateObject();
            yDate.setUTCDate(yDate.getUTCDate() - 1);
            const yesterdayStr = getISTString(yDate);

            let dateKey = this.currentDate;

            if (this.punchLogs[yesterdayStr]?.[mId]?.in && !this.punchLogs[yesterdayStr]?.[mId]?.out) {
                dateKey = yesterdayStr;
            } else if (this.punchLogs[todayStr]?.[mId]?.in && !this.punchLogs[todayStr]?.[mId]?.out) {
                dateKey = todayStr;
            }

            if (!this.punchLogs[dateKey]) this.punchLogs[dateKey] = {};
            if (!this.punchLogs[dateKey][mId]) this.punchLogs[dateKey][mId] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
            if (!this.punchLogs[dateKey][mId].captchas) this.punchLogs[dateKey][mId].captchas = [];

            const exists = this.punchLogs[dateKey][mId].captchas.find(c => c.time === checkTime);
            if (!exists) {
                this.punchLogs[dateKey][mId].captchas.push({ time: checkTime, status: 'Pending', ip: currentIp });
                this.punchLogs = { ...this.punchLogs };
                invalidateMemo();
            }

            try {
                await this.supabase.from('captcha_logs').insert({
                    member_id: mId, log_date: dateKey, check_time: checkTime, status: 'Pending', ip_address: currentIp
                });
                this.showNote(`Verification Forced on ${dateKey} log`, "success");
            } catch (e) {
                console.error(e);
                this.showNote("Failed to force verify", "error");
            }
        },

        get activeAuthSession() {
            return this.originalAdminSession || this.userSession;
        },

        get isManagerOrLead() {
            if (this.isAdminAuthenticated) return true;
            const actor = this.activeAuthSession;
            if (!actor) return false;

            const r = actor.role;
            const allowedMenus = this.roleAccess[r] || [];

            if (Object.keys(this.roleAccess).length > 0) {
                return allowedMenus.length > 0;
            }

            const rLower = (r || '').toLowerCase();
            return rLower.includes('manager') || rLower.includes('lead') || rLower.includes('admin') || rLower.includes('hr');
        },

        get isSuperUser() {
            if (this.isAdminAuthenticated) return true;
            const actor = this.activeAuthSession;
            if (!actor || !actor.role) return false;
            const accessList = this.roleAccess[actor.role];
            return Array.isArray(accessList) ? accessList.includes('superuser') : false;
        },

        get formattedIdleTime() {
            const mins = Math.floor(this.idleSecondsRemaining / 60).toString().padStart(2, '0');
            const secs = (this.idleSecondsRemaining % 60).toString().padStart(2, '0');
            return `${mins}:${secs}`;
        },

        get activeTeamOnBreak() {
            if (!this.isManagerOrLead) return [];
            return memoizeFrame('activeTeamOnBreak', [
                this.isManagerOrLead, this.filteredMembers, this.punchLogs,
                this.userSession?.id, this.userSession?.shift, this.shifts
            ], () => {
                const activeDate = this.getActiveShiftDate();
                return this.filteredMembers.filter(m => this.isMemberOnBreak(m.id, activeDate));
            });
        },

        get pendingLeaveRequests() {
            const actor = this.activeAuthSession;
            return this.leaveRequests.filter(r => {
                if (r.status !== 'pending') return false;
                if (this.isManagerOrLead && !this.isSuperUser) {
                    const reqMember = this.resolveMember(r.empId);
                    if (reqMember && reqMember.dept !== actor?.dept) return false;
                }
                return true;
            });
        },
        get pendingLeaveCount() { return this.pendingLeaveRequests.length; },

        get reviewedLeaveRequests() {
            if (!this.isManagerOrLead) return [];
            const actor = this.activeAuthSession;
            return this.leaveRequests
                .filter(r => r.status !== 'pending' && (r.reviewedAt || r.approvedAt))
                .filter(r => {
                    if (this.isSuperUser) return true;
                    const reqMember = this.resolveMember(r.empId);
                    return !reqMember || reqMember.dept === actor?.dept;
                })
                .sort((a, b) => new Date(b.reviewedAt || b.approvedAt || 0) - new Date(a.reviewedAt || a.approvedAt || 0))
                .slice(0, 8);
        },

        get todayEvents() {
            return memoizeFrame('todayEvents', [
                this.isAdminAuthenticated, this.userSession?.id, this.userSession?.dept,
                this.userSession?.role, this.members, this.roleAccess
            ], () => {
                const curObj = getISTDateObject();
                const curM = curObj.getUTCMonth() + 1;
                const curD = curObj.getUTCDate();
                const curY = curObj.getUTCFullYear();
                const events = [];

                let targetMembers = [];
                if (this.isAdminAuthenticated || this.isSuperUser) {
                    targetMembers = this.members;
                } else if (this.userSession && this.userSession.dept) {
                    const myDept = String(this.userSession.dept).trim().toLowerCase();
                    targetMembers = this.members.filter(m => String(m.dept || '').trim().toLowerCase() === myDept);
                }

                for (let i = 0; i < targetMembers.length; i++) {
                    const m = targetMembers[i];
                    if (m.dob) {
                        const [, bM, bD] = m.dob.split('-').map(Number);
                        if (bM === curM && bD === curD) events.push({ id: 'bday_' + m.id, type: 'birthday', member: m, title: 'Birthday', icon: '🎂', color: 'text-pink-600', bg: 'bg-pink-100' });
                    }
                    if (m.doj) {
                        const [jY, jM, jD] = m.doj.split('-').map(Number);
                        if (jM === curM && jD === curD) {
                            const yrs = curY - jY;
                            events.push({ id: 'annv_' + m.id, type: 'anniversary', member: m, title: yrs > 0 ? `Anniversary (${yrs} Yr)` : 'Joined Today!', icon: yrs > 0 ? '🎊' : '🎉', color: yrs > 0 ? 'text-emerald-600' : 'text-indigo-600', bg: yrs > 0 ? 'bg-emerald-100' : 'bg-indigo-100' });
                        }
                    }
                }
                return events;
            });
        },

        get monthEvents() {
            return memoizeFrame('monthEvents', [
                this.calMonth, this.calYear, this.members
            ], () => {
                if (!this.members) return [];
                const currentMonth = this.calMonth;
                const currentYear = this.calYear;
                const events = [];
                let eventIdCounter = 1;

                for (let i = 0; i < this.members.length; i++) {
                    const member = this.members[i];
                    if (member.dob) {
                        const dobParts = member.dob.split('-');
                        const dobMonth = parseInt(dobParts[1], 10) - 1;
                        const dobDay = parseInt(dobParts[2], 10);

                        if (dobMonth === currentMonth) {
                            events.push({
                                id: eventIdCounter++,
                                type: 'birthday',
                                day: dobDay,
                                member: member,
                                title: 'Birthday',
                                icon: '🎂',
                                bg: 'bg-pink-100 dark:bg-pink-900/40',
                                color: 'text-pink-600 dark:text-pink-400'
                            });
                        }
                    }

                    if (member.doj) {
                        const dojParts = member.doj.split('-');
                        const dojYear = parseInt(dojParts[0], 10);
                        const dojMonth = parseInt(dojParts[1], 10) - 1;
                        const dojDay = parseInt(dojParts[2], 10);

                        if (dojMonth === currentMonth && currentYear > dojYear) {
                            const years = currentYear - dojYear;
                            events.push({
                                id: eventIdCounter++,
                                type: 'anniversary',
                                day: dojDay,
                                member: member,
                                title: `${years}Yr Work Anniversary`,
                                icon: '🎉',
                                bg: 'bg-emerald-100 dark:bg-emerald-900/40',
                                color: 'text-emerald-600 dark:text-emerald-400'
                            });
                        }
                    }
                }

                return events.sort((a, b) => a.day - b.day);
            });
        },

        get notificationGlowClass() {
            const events = this.todayEvents;
            if (events.some(e => e.type === 'birthday')) return 'shadow-[0_0_15px_rgba(236,72,153,0.6)] animate-pulse text-pink-500';
            if (events.some(e => e.type === 'anniversary')) return 'shadow-[0_0_15px_rgba(16,185,129,0.6)] animate-pulse text-emerald-500';
            if ((this.isAdminAuthenticated || this.isManagerOrLead) && this.offenderAlerts.length > 0) return 'shadow-[0_0_15px_rgba(244,63,94,0.6)] animate-pulse text-rose-500';
            if ((this.isAdminAuthenticated || this.isManagerOrLead) && this.pendingLeaveCount > 0) return 'shadow-[0_0_15px_rgba(99,102,241,0.6)] animate-pulse text-indigo-500';
            if (events.length > 0 || this.monthEvents.length > 0) return 'shadow-[0_0_15px_rgba(242,101,34,0.6)] animate-pulse text-[#f26522]';
            return 'text-zinc-400 hover:text-indigo-500';
        },

        get offenderAlerts() {
            return memoizeFrame('offenderAlerts', [
                this.members, this.attendanceData, this.punchLogs,
                this.userSession?.id, this.userSession?.dept, this.userSession?.role,
                this.isAdminAuthenticated, this.roleAccess
            ], () => {
                const alerts = [];
                const todayStr = this.getActiveShiftDate();
                const THRESHOLD = 480;
                const VIOLATION_LIMIT = 3;
                const actor = this.activeAuthSession;

                const [y, m, d] = todayStr.split('-').map(Number);
                const cutoffObj = new Date(Date.UTC(y, m - 1, d - 30));
                const cutoffDateStr = cutoffObj.toISOString().slice(0, 10);
                const punchDates = Object.keys(this.punchLogs).filter(date => date < todayStr && date >= cutoffDateStr);

                for (let i = 0; i < this.members.length; i++) {
                    const member = this.members[i];
                    if (!this.isManagerOrLead && (!this.userSession || this.userSession.id !== member.id)) continue;
                    if (this.isManagerOrLead && !this.isSuperUser && member.dept !== actor?.dept) continue;

                    const isPresentToday = this.attendanceData[todayStr]?.[member.id] === 'p' ||
                                          (this.punchLogs[todayStr]?.[member.id]?.in && !this.punchLogs[todayStr]?.[member.id]?.out);

                    if (isPresentToday) {
                        let violations = 0;
                        for (let j = 0; j < punchDates.length; j++) {
                            const date = punchDates[j];
                            const log = this.punchLogs[date]?.[member.id];
                            if (this.attendanceData[date]?.[member.id] === 'p' && log && log.in && log.out) {
                                const activeMins = this.getActiveMinsForLog(log, date);
                                if (activeMins > 0 && activeMins < THRESHOLD) violations++;
                            }
                        }
                        if (violations >= VIOLATION_LIMIT) {
                            alerts.push({ id: 'ai_' + member.id, member: member, violations: violations, title: 'Flight Risk Detected', message: `${violations} shifts under 8h in last 30 days`, icon: '🤖', color: 'text-rose-600', bg: 'bg-rose-100' });
                        }
                    }
                }
                return alerts.sort((a, b) => b.violations - a.violations);
            });
        },

        get userOnBreak() {
            if (!this.userSession) return false;
            const breaks = this.punchLogs[this.getActiveShiftDate()]?.[this.userSession.id]?.breaks;
            return !!(breaks && breaks.length > 0 && !breaks[breaks.length - 1].end);
        },
        isMemberOnBreak(mId, dateKey) {
            const breaks = this.punchLogs[dateKey]?.[mId]?.breaks;
            return !!(breaks && breaks.length > 0 && !breaks[breaks.length - 1].end);
        },

        resolveMember(idOrEmpId) {
            if (!idOrEmpId) return null;
            return this.members.find(m => m.id === idOrEmpId || m.empId === idOrEmpId) || null;
        },

        submitLeave() {
            if (this.isImpersonating) return this.showNote("Read-only preview mode. Exit Staff View to submit requests.", "error");
            if (!this.newLeave.type || !this.newLeave.startDate || !this.newLeave.endDate) return this.showNote("Request type and dates are required", "error");
            const timedTypes = ['1p', '2p', 'lop1', 'lop2', 'h', 'loph'];
            const needsTime = timedTypes.includes(this.newLeave.type);
            const startTime = this.newLeave.startTime || '';
            const endTime = this.newLeave.endTime || '';
            if (needsTime) {
                if (!startTime || !endTime) return this.showNote("Start and end times are required", "error");
                if (this.newLeave.startDate !== this.newLeave.endDate) return this.showNote("Timed requests must use the same start and end date", "error");
                const [sh, sm] = startTime.split(':').map(Number);
                const [eh, em] = endTime.split(':').map(Number);
                const duration = (eh * 60 + em) - (sh * 60 + sm);
                if (duration <= 0) return this.showNote("End time must be after start time", "error");
                const expected = ({ '1p': 60, 'lop1': 60, '2p': 120, 'lop2': 120 })[this.newLeave.type];
                if (expected && duration !== expected) return this.showNote(`This request must be exactly ${expected / 60} hour${expected === 60 ? '' : 's'}`, "error");
            }
            if (this.newLeave.endDate < this.newLeave.startDate) return this.showNote("End date cannot be before start date", "error");

            // Snapshot already-available YTD balances directly at submission time (no extra calculation)
            const mMetrics = this.individualStats?.metrics;
            const ytdLeaveAvail = (mMetrics && mMetrics.remainingLeavesYTD !== undefined && mMetrics.remainingLeavesYTD !== null)
                ? mMetrics.remainingLeavesYTD : null;
            const ytdPermAvail = (mMetrics && mMetrics.prmAvailYTD !== undefined && mMetrics.prmAvailYTD !== null)
                ? mMetrics.prmAvailYTD : null;

            const req = {
                id: generateSecureId(),
                empId: this.userSession.id || this.userSession.empId,
                name: this.userSession.name,
                type: this.newLeave.type,
                startDate: this.newLeave.startDate,
                endDate: this.newLeave.endDate,
                startTime: needsTime ? startTime : '',
                endTime: needsTime ? endTime : '',
                reason: this.newLeave.reason,
                ytdLeaveAvail,
                ytdPermAvail,
                status: 'pending',
                requestedAt: getNow().toISOString(),
                approvedAt: null,
                reviewedAt: null,
                reviewedByName: '',
                reviewedByRole: '',
                reviewedByEmpId: ''
            };
            this.leaveRequests.unshift(req);
            this.upsertLeaveCloud(req);
            invalidateMemo();
            this.showLeaveModal = false;
            this.newLeave = { type: 'a', startDate: '', endDate: '', startTime: '', endTime: '', reason: '' };
            this.showNote("Leave Request Forwarded", "success");
        },

        getLeaveReviewerInfo() {
            const reviewer = this.activeAuthSession;
            if (reviewer) {
                return {
                    name: reviewer.name || `${reviewer.firstName || ''} ${reviewer.lastName || ''}`.trim() || 'Manager',
                    role: reviewer.role || 'Manager',
                    empId: reviewer.empId || ''
                };
            }
            if (this.isAdminAuthenticated) {
                return { name: 'Master Admin', role: 'Administrator', empId: 'MASTER_ADMIN' };
            }
            return { name: 'Authorized Approver', role: 'Approver', empId: '' };
        },

        recordLeaveReview(req, status) {
            const reviewer = this.getLeaveReviewerInfo();
            const reviewedAt = getNow().toISOString();
            req.status = status;
            req.approvedAt = reviewedAt;
            req.reviewedAt = reviewedAt;
            req.reviewedByName = reviewer.name;
            req.reviewedByRole = reviewer.role;
            req.reviewedByEmpId = reviewer.empId;
            this.upsertLeaveCloud(req);
        },

        approveLeave(reqId) {
            if (!this.hasWriteAccess('record') && !this.hasWriteAccess('members')) {
                return this.showNote("Read-only access: approval requires write permission", "error");
            }
            const req = this.leaveRequests.find(r => r.id === reqId);
            if (!req) return;
            this.recordLeaveReview(req, 'approved');

            const targetMember = this.resolveMember(req.empId);
            const targetId = targetMember ? targetMember.id : req.empId;

            for (let d = new Date(req.startDate + 'T00:00:00Z'); d <= new Date(req.endDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
                const dStr = d.toISOString().slice(0, 10);
                if (!this.attendanceData[dStr]) this.attendanceData[dStr] = {};
                this.attendanceData[dStr][targetId] = req.type;
                this.upsertAttCloud(dStr, targetId, req.type);
            }
            this.attendanceData = { ...this.attendanceData };
            invalidateMemo();
            this.showNote(`Approved leave for ${req.name}`);
        },

        rejectLeave(reqId) {
            if (!this.hasWriteAccess('record') && !this.hasWriteAccess('members')) {
                return this.showNote("Read-only access: rejection requires write permission", "error");
            }
            const req = this.leaveRequests.find(r => r.id === reqId);
            if (req) {
                this.recordLeaveReview(req, 'rejected');
                invalidateMemo();
                this.showNote(`Rejected leave for ${req.name}`, "error");
            }
        },

        processAutoHolidays() {
            const bulkRecords = [];
            this.holidayList.forEach(h => {
                this.members.forEach(m => {
                    if (h.dept === 'All' || h.dept === m.dept) {
                        if (!this.attendanceData[h.date]?.[m.id]) {
                            if (!this.attendanceData[h.date]) this.attendanceData[h.date] = {};
                            this.attendanceData[h.date][m.id] = 'fh';
                            bulkRecords.push({ date: h.date, member_id: m.id, status: 'fh' });
                        }
                    }
                });
            });
            if (bulkRecords.length > 0) {
                this.attendanceData = { ...this.attendanceData };
                invalidateMemo();
                this.bulkUpsertAttCloud(bulkRecords);
            }
        },

        processAutoLopForMissingPunches() {
            const nowISTMs = getISTDate().getTime();
            const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
            const bulkRecords = [];
            const weekOffSet = new Set(Array.isArray(this.weekOffDays) ? this.weekOffDays : [0, 6]);

            const targetMembers = (this.isAdminAuthenticated || this.isManagerOrLead)
                ? this.members
                : (this.userSession ? [this.userSession] : []);

            const shiftMap = new Map(this.shifts.map(s => [s.name, s]));
            const exemptStatuses = new Set(['a', 'h', 'fh', 'co', 'w', 'lop', 'loph', 'lop1', 'lop2']);
            const approvedLeaves = this.leaveRequests.filter(l => l.status === 'approved');

            const datesToCheck = [];
            for (let i = 0; i < 7; i++) {
                const d = getISTDateObject();
                d.setUTCDate(d.getUTCDate() - i);
                const dateStr = getISTString(d);
                const [y, mo, day] = dateStr.split('-').map(Number);
                datesToCheck.push({ dateStr, y, mo, day, dayOfWeek: new Date(Date.UTC(y, mo - 1, day)).getUTCDay() });
            }

            for (let di = 0; di < datesToCheck.length; di++) {
                const { dateStr, y, mo, day, dayOfWeek } = datesToCheck[di];

                for (let mi = 0; mi < targetMembers.length; mi++) {
                    const m = targetMembers[mi];
                    if (m.doj && dateStr < m.doj) continue;
                    if (m.doe && dateStr > m.doe) continue;

                    const shiftObj = shiftMap.get(m.shift);
                    if (!shiftObj || !shiftObj.inTime || !shiftObj.outTime) continue;

                    const [outH, outM] = shiftObj.outTime.split(':').map(Number);
                    const isNightShift = shiftObj.inTime > shiftObj.outTime;

                    let shiftEndMs = Date.UTC(y, mo - 1, day, outH, outM);
                    if (isNightShift) shiftEndMs += 86400000;
                    if (nowISTMs < shiftEndMs + TWELVE_HOURS_MS) continue;

                    const currentStatus = this.attendanceData[dateStr]?.[m.id];
                    if (exemptStatuses.has(currentStatus)) continue;

                    const isHoliday = this.holidayList.some(
                        h => h.date === dateStr && (h.dept === 'All' || h.dept === m.dept)
                    );
                    if (isHoliday) continue;

                    const hasApprovedLeave = approvedLeaves.some(
                        l => (l.empId === m.id || l.empId === m.empId) && l.startDate <= dateStr && l.endDate >= dateStr
                    );
                    if (hasApprovedLeave) continue;

                    const log = this.punchLogs[dateStr]?.[m.id];
                    const isMissingOut = Boolean(log?.in && !log?.out);
                    const isMissingIn = !log?.in && !weekOffSet.has(dayOfWeek);

                    if (isMissingOut || isMissingIn) {
                        if (!this.attendanceData[dateStr]) this.attendanceData[dateStr] = {};
                        this.attendanceData[dateStr][m.id] = 'lop';
                        bulkRecords.push({ date: dateStr, member_id: m.id, status: 'lop' });
                    }
                }
            }

            if (bulkRecords.length > 0) {
                this.attendanceData = { ...this.attendanceData };
                invalidateMemo();
                this.bulkUpsertAttCloud(bulkRecords);
            }
        },

        addHoliday() {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            if (!this.newHoliday.name || !this.newHoliday.date) return this.showNote("Invalid Details", "error");
            const h = { ...this.newHoliday, name: this.newHoliday.name.trim(), id: generateSecureId() };
            this.holidayList.push(h);
            this.holidayList = [...this.holidayList];
            this.upsertHolidayCloud(h);
            invalidateMemo();
            this.newHoliday = { name: '', date: '', dept: 'All' };
            this.showNote("Holiday Processed Successfully");
        },

        startEditHoliday(holiday) {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            this.editingHolidayId = holiday.id;
            this.editHolidayForm = { id: holiday.id, name: holiday.name, date: holiday.date, dept: holiday.dept || 'All' };
        },
        cancelEditHoliday() {
            this.editingHolidayId = null;
            this.editHolidayForm = { id: '', name: '', date: '', dept: 'All' };
        },
        async saveEditHoliday() {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            const id = this.editingHolidayId;
            const name = (this.editHolidayForm.name || '').trim();
            const date = this.editHolidayForm.date;
            const dept = this.editHolidayForm.dept || 'All';
            if (!id || !name || !date) return this.showNote("Holiday name and date are required", "error");
            const updated = { id, name, date, dept };
            this.holidayList = this.holidayList.map(h => h.id === id ? updated : h);
            await this.upsertHolidayCloud(updated);
            invalidateMemo();
            this.cancelEditHoliday();
            this.showNote("Holiday updated", "success");
        },

        async removeHoliday(id) {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            this.holidayList = this.holidayList.filter(h => h.id !== id);
            invalidateMemo();
            try { await this.supabase.from('holidays').delete().eq('id', id); } catch (e) {}
        },

        getCurrentTimeIST() {
            return fmtISTTimeShort.format(getNow());
        },
        formatTimeDisplay(time24) {
            if (!time24) return '--:--';
            const [h, m] = time24.split(':');
            const hNum = parseInt(h, 10);
            const ampm = hNum >= 12 ? 'PM' : 'AM';
            return `${(hNum % 12 || 12).toString().padStart(2, '0')}:${m} ${ampm}`;
        },
        formatHoursDecimal(mins) { return (!mins || mins <= 0) ? '0.00 Hrs' : (mins / 60).toFixed(2) + ' Hrs'; },

        getActiveShiftDate() {
            if (!this.userSession) return getISTString();
            const shiftName = this.userSession.shift || '';
            const shiftObj = this.shifts.find(s => s.name === shiftName) || {};
            const currentHourIST = parseInt(getISTTime24().split(':')[0], 10);
            const isNightShift = shiftObj.inTime && shiftObj.outTime ? (shiftObj.inTime > shiftObj.outTime) : shiftName.toLowerCase().includes('night');

            if (isNightShift && currentHourIST < 14) {
                const y = getISTDateObject(); y.setUTCDate(y.getUTCDate() - 1); return getISTString(y);
            } else if (!isNightShift && currentHourIST < 5) {
                const y = getISTDateObject(); y.setUTCDate(y.getUTCDate() - 1);
                if (this.punchLogs[getISTString(y)]?.[this.userSession.id]?.in && !this.punchLogs[getISTString(y)]?.[this.userSession.id]?.out) return getISTString(y);
            }
            return getISTString();
        },

        resetIdleTimer() {
            if (this.idleInterval) clearInterval(this.idleInterval);

            const monitorAdmin = this.isAdminAuthenticated;
            const monitorUser = this.userSession && !this.userSession.captchaEnabled && !this.userOnBreak && !this.isManagerOrLead;

            if (monitorAdmin || monitorUser) {
                this.idleSecondsRemaining = this.idleTimeout / 1000;

                this.idleInterval = setInterval(() => {
                    this.idleSecondsRemaining--;

                    if (this.idleSecondsRemaining <= 0) {
                        clearInterval(this.idleInterval);

                        if (this.isAdminAuthenticated) {
                            this.logoutAdmin();
                            this.showNote("Vault auto-locked due to inactivity", "error");
                        }
                        if (this.userSession && !this.userSession.captchaEnabled && !this.userOnBreak && !this.isManagerOrLead) {
                            this.logoutUser();
                            this.showNote("Session expired due to inactivity", "error");
                        }
                    }
                }, 1000);
            } else {
                this.idleSecondsRemaining = this.idleTimeout / 1000;
            }
        },

        checkExpiredCaptchas() {
            const now = this.getCurrentTimeIST();
            let updated = false;

            if (this.userSession && !this.isImpersonating) {
                const today = this.getActiveShiftDate();
                const uid = this.userSession.id;
                const log = this.punchLogs[today]?.[uid];

                if (log && log.captchas) {
                    const pendings = log.captchas.filter(c => c.status === 'Pending');
                    for (const cap of pendings) {
                        if (this.diffInMins(cap.time, now) >= 2) {
                            cap.status = 'Missed';
                            updated = true;

                            if (this.showCaptchaModal && this.currentCaptchaTime === cap.time) {
                                this.showCaptchaModal = false;
                                this.clearCaptchaTimers();
                                this.currentCaptchaTime = null;
                            }

                            this.supabase.from('captcha_logs')
                                .update({ status: 'Missed' })
                                .match({ member_id: uid, log_date: today, check_time: cap.time }).then();

                            if (!this.userOnBreak) {
                                this.showNote("Verification Missed (Timeout). Tool Locked.", "error");
                                this.startBreak(null, 'Penalty');
                            }
                        }
                    }
                }
            }

            if (this.isAdminAuthenticated || this.isManagerOrLead) {
                const checkDate = this.currentDate;
                if (this.punchLogs[checkDate]) {
                    for (const mId in this.punchLogs[checkDate]) {
                        if (this.userSession && this.userSession.id === mId) continue;

                        const log = this.punchLogs[checkDate][mId];
                        if (log && log.captchas) {
                            const pendings = log.captchas.filter(c => c.status === 'Pending');
                            for (const cap of pendings) {
                                if (this.diffInMins(cap.time, now) >= 2) {
                                    cap.status = 'Missed';
                                    updated = true;

                                    this.supabase.from('captcha_logs')
                                        .update({ status: 'Missed' })
                                        .match({ member_id: mId, log_date: checkDate, check_time: cap.time }).then();

                                    const breaks = log.breaks || [];
                                    if (breaks.length === 0 || breaks[breaks.length - 1].end !== '') {
                                        breaks.push({ start: cap.time, end: '', type: 'Penalty' });
                                        this.supabase.from('break_logs').insert({
                                            member_id: mId, log_date: checkDate, start_time: cap.time, type: 'Penalty'
                                        }).then();
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (updated) {
                this.punchLogs = { ...this.punchLogs };
                invalidateMemo();
            }
        },

        async startBreak(timeOverride = null, type = null) {
            if (this.isImpersonating) return this.showNote("Read-only preview mode. Exit Staff View to perform actions.", "error");
            if (isMobileDevice()) {
                this.showNote("Action Denied: Breaks cannot be initiated from a mobile device.", "error");
                return;
            }
            if (!this.userSession) return;

            let breakType = type || this.selectedBreakType;
            if (timeOverride && !breakType) breakType = 'Penalty';

            if (!breakType) {
                this.showNote("Please select a break type first.", "error");
                return;
            }

            this.clearCaptchaTimers();
            const secureTime = await fetchSecureApiTimeIST();
            if (!secureTime) return;

            const activeDate = this.getActiveShiftDate();
            const uId = this.userSession.id;
            const startTime = (typeof timeOverride === 'string') ? timeOverride : secureTime;

            if (!this.punchLogs[activeDate]) this.punchLogs[activeDate] = {};
            if (!this.punchLogs[activeDate][uId]) this.punchLogs[activeDate][uId] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
            if (!this.punchLogs[activeDate][uId].breaks) this.punchLogs[activeDate][uId].breaks = [];

            const breaks = this.punchLogs[activeDate][uId].breaks;

            if (breaks.length > 0 && !breaks[breaks.length - 1].end) {
                if (timeOverride) {
                    breaks[breaks.length - 1].start = startTime;
                    try {
                        await this.supabase.from('break_logs').update({ start_time: startTime, type: breakType })
                            .match({ member_id: uId, log_date: activeDate }).is('end_time', null);
                    } catch (e) {}
                }
            } else {
                breaks.push({ start: startTime, end: '', type: breakType });
                try {
                    await this.supabase.from('break_logs').insert({
                        member_id: uId, log_date: activeDate, start_time: startTime, type: breakType
                    });
                } catch (e) { console.error("Break start error", e); }
            }

            this.punchLogs = { ...this.punchLogs };
            invalidateMemo();
            this.breakPinInput = '';

            this.showNote(timeOverride ? "Penalty Break Applied" : `${breakType} Break Started`, timeOverride ? "error" : "success");
            try { const elem = document.documentElement; if (elem.requestFullscreen) elem.requestFullscreen().catch(e => e); } catch (e) {}
            setTimeout(() => { const el = document.getElementById('break-pin-input'); if (el) el.focus(); }, 100);
        },

        handleBreakUnlock() {
            if (this.isImpersonating) return;
            if (this.breakPinInput === this.userSession.pin) {
                this.endBreak();
                this.breakPinInput = '';
                try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(e => e); } catch (e) {}
            } else {
                this.pinErrorShake = true;
                setTimeout(() => this.pinErrorShake = false, 500);
                this.showNote("Invalid PIN.", "error");
                this.breakPinInput = '';
            }
        },

        async endBreak() {
            if (this.isImpersonating) return this.showNote("Read-only preview mode. Exit Staff View to perform actions.", "error");
            if (isMobileDevice()) {
                this.showNote("Action Denied: Breaks cannot be ended from a mobile device.", "error");
                return;
            }
            if (!this.userSession) return;
            const secureTime = await fetchSecureApiTimeIST();
            if (!secureTime) return;
            const activeDate = this.getActiveShiftDate();
            const uId = this.userSession.id;
            const breaks = this.punchLogs[activeDate]?.[uId]?.breaks;
            const endTime = secureTime;

            if (breaks && breaks.length > 0 && !breaks[breaks.length - 1].end) {
                breaks[breaks.length - 1].end = endTime;
                this.punchLogs = { ...this.punchLogs };
                invalidateMemo();

                try {
                    await this.supabase.from('break_logs')
                        .update({ end_time: endTime })
                        .match({ member_id: uId, log_date: activeDate })
                        .is('end_time', null);
                } catch (e) { console.error("Break end error", e); }

                this.showNote("Break Ended", "success");
                this.selectedBreakType = '';
                this.scheduleNextCaptcha();
            }
        },

        diffInMins(t1, t2) {
            if (!t1 || !t2) return 0;
            const m1 = parseTimeToMins(t1);
            const m2 = parseTimeToMins(t2);
            if (m1 < 0 || m2 < 0) return 0;
            const diff = m2 - m1;
            return diff < 0 ? diff + 1440 : diff;
        },

        calculateTotalBreakMins(breaks) {
            if (!breaks || !breaks.length) return 0;
            const now = this.getCurrentTimeIST();
            let total = 0;
            for (let i = 0; i < breaks.length; i++) {
                const b = breaks[i];
                if (b.type !== 'Split Shift') total += this.diffInMins(b.start, b.end || now);
            }
            return total;
        },

        calculateSplitShiftMins(breaks) {
            if (!breaks || !breaks.length) return 0;
            const now = this.getCurrentTimeIST();
            let total = 0;
            for (let i = 0; i < breaks.length; i++) {
                const b = breaks[i];
                if (b.type === 'Split Shift') total += this.diffInMins(b.start, b.end || now);
            }
            return total;
        },

        getActiveMinsForLog(log, dateKey) {
            if (!log || !log.in) return 0;
            const isLiveLog = dateKey === this.getActiveShiftDate() || dateKey === getISTString();
            const outTime = log.out || (isLiveLog ? this.getCurrentTimeIST() : null);
            if (!outTime) return 0;
            const gross = this.diffInMins(log.in, outTime);
            let allBreaks = 0;
            if (log.breaks && log.breaks.length) {
                for (let i = 0; i < log.breaks.length; i++) {
                    allBreaks += this.diffInMins(log.breaks[i].start, log.breaks[i].end || outTime);
                }
            }
            return Math.max(0, gross - allBreaks);
        },

        formatBreakDisplay(mins) {
            if (!mins || mins <= 0) return '0m';
            return Math.floor(mins / 60) > 0 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
        },
        formatClockDisplay(mins) {
            if (!mins || mins <= 0) return '00:00';
            const h = Math.floor(mins / 60).toString().padStart(2, '0');
            const m = (mins % 60).toString().padStart(2, '0');
            return `${h}:${m}`;
        },

        get dashboardStats() {
            return memoizeFrame('dashboardStats', [
                this.dashboardPeriod, this.attendanceData, this.filteredMembers, this.leaveRequests
            ], () => {
                const dates = this.getFilteredDatesByPeriod(this.dashboardPeriod);
                const totals = {};
                this.statusOptions.forEach(o => totals[o.id] = 0);
                const members = this.filteredMembers;
                const approvedLeaves = this.leaveRequests.filter(l => l.status === 'approved' && l.type === 'a');

                let grandTotal = 0;
                let approvedLeaveDays = 0;
                let unapprovedAbsentDays = 0;

                for (let i = 0; i < dates.length; i++) {
                    const dk = dates[i];
                    const dayMap = this.attendanceData[dk];
                    if (!dayMap) continue;
                    for (let j = 0; j < members.length; j++) {
                        const m = members[j];
                        const st = dayMap[m.id];
                        if (!st) continue;

                        totals[st] = (totals[st] || 0) + 1;
                        grandTotal++;

                        if (st === 'a') {
                            const isApproved = approvedLeaves.some(l =>
                                (l.empId === m.id || l.empId === m.empId) && l.startDate <= dk && l.endDate >= dk
                            );
                            if (isApproved) approvedLeaveDays++;
                            else unapprovedAbsentDays++;
                        }
                    }
                }

                const presentTotal = (totals.p || 0) + (totals.wfh || 0) + (totals['1p'] || 0) + (totals['2p'] || 0);
                const leaveTotal = approvedLeaveDays + (totals.h || 0) + (totals.co || 0) + (totals.fh || 0);
                const absentAndLopTotal = unapprovedAbsentDays + (totals.lop || 0) + (totals.loph || 0) + (totals.lop1 || 0) + (totals.lop2 || 0);

                return { totals, grandTotal, kpis: { presentTotal, leaveTotal, absentAndLopTotal } };
            });
        },

        get userPatterns() {
            return memoizeFrame('userPatterns', [
                this.dashboardPeriod, this.attendanceData, this.punchLogs, this.filteredMembers
            ], () => {
                const todayStr = getISTString();
                const ist = getISTDateObject();
                const curY = ist.getUTCFullYear();
                const curM = ist.getUTCMonth() + 1;
                const curD = ist.getUTCDate();

                const isInPeriod = (d) => {
                    const [y, m, day] = d.split('-').map(Number);
                    if (this.dashboardPeriod === 'day') return y === curY && m === curM && day === curD;
                    if (this.dashboardPeriod === 'month') return y === curY && m === curM;
                    return y === curY;
                };

                const dates = Array.from(new Set([
                    ...this.getFilteredDatesByPeriod(this.dashboardPeriod),
                    ...Object.keys(this.punchLogs).filter(isInPeriod)
                ]));

                return this.filteredMembers.map(m => {
                    let totalActiveMins = 0;
                    let totalBreakMins = 0;
                    let loggedDays = 0;
                    let breakExceeds = 0;
                    let leaves = 0;

                    for (let i = 0; i < dates.length; i++) {
                        const dk = dates[i];
                        const st = this.attendanceData[dk]?.[m.id];
                        const log = this.punchLogs[dk]?.[m.id];

                        if (st === 'a' || st === 'lop') leaves += 1;
                        else if (st === 'h' || st === 'loph') leaves += 0.5;

                        if (log && log.in) {
                            const brkMins = this.calculateTotalBreakMins(log.breaks);
                            if (brkMins > 60) breakExceeds++;
                            if (log.out || dk === todayStr) {
                                totalActiveMins += this.getActiveMinsForLog(log, dk);
                                totalBreakMins += brkMins;
                                loggedDays++;
                            }
                        }
                    }

                    const avgNetMins = loggedDays > 0 ? Math.round(totalActiveMins / loggedDays) : 0;
                    const avgBreakMins = loggedDays > 0 ? Math.round(totalBreakMins / loggedDays) : 0;
                    const totalFlags = breakExceeds + Math.ceil(leaves);

                    return {
                        id: m.id,
                        empId: m.empId,
                        name: m.name,
                        dept: m.dept || 'General',
                        shift: m.shift || 'Standard',
                        avgNetMins,
                        avgBreakMins,
                        loggedDays,
                        breakExceeds,
                        leaves,
                        totalFlags
                    };
                })
                .filter(u => u.loggedDays > 0 || u.totalFlags > 0)
                .sort((a, b) => b.totalFlags - a.totalFlags || b.avgBreakMins - a.avgBreakMins || a.avgNetMins - b.avgNetMins);
            });
        },

        get individualStats() {
            if (!this.userSession) return null;
            return memoizeFrame('individualStats', [
                this.userSession?.id, this.members, this.calYear, this.calMonth,
                this.shifts, this.attendanceData, this.punchLogs,
                this.userExceptionHistory, this.holidayList
            ], () => {
                const user = this.members.find(m => m.id === this.userSession.id) || this.userSession;

                const curRef = getISTDateObject();
                const curM = curRef.getUTCMonth() + 1;
                const curD = curRef.getUTCDate();

                const calY = this.calYear;
                const calM = this.calMonth + 1;
                const id = user.id;

                const statusMap = new Map(this.statusOptions.map(s => [s.id, s]));
                const stats = { periodTotals: {}, history: [] };
                this.statusOptions.forEach(opt => stats.periodTotals[opt.id] = 0);

                const userShift = this.shifts.find(s => s.name === user.shift) || { inTime: '09:00', outTime: '18:00' };
                const totalShiftMins = this.diffInMins(userShift.inTime, userShift.outTime) || 540;
                const allowedBreakMins = 60;
                const baseTargetMins = totalShiftMins - allowedBreakMins;

                const activeDateKey = this.getActiveShiftDate();
                const unrecorded = { id: '-', label: 'Unrecorded', color: 'text-zinc-400', bg: 'bg-zinc-100/50', display: '-' };

                for (let i = 0; i < 15; i++) {
                    const day = getISTDateObject(); day.setUTCDate(day.getUTCDate() - i);
                    const dk = getISTString(day);
                    const sObj = statusMap.get(this.attendanceData[dk]?.[id]) || unrecorded;
                    stats.history.push({ date: dk, label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' }), status: sObj, punch: this.punchLogs[dk]?.[id] || {} });
                }

                const mtd = {
                    p: 0, co: 0, lv: 0, prmHrs: 0, lop: 0, activeMins: 0, breakMins: 0,
                    completedDays: 0, targetActiveMins: 0, targetBreakMins: 0
                };
                const ytd = {
                    lv: 0, prm: 0, co: 0, activeMins: 0, breakMins: 0,
                    completedDays: 0, lop: 0
                };

                const processedDates = new Set();

                const processStatus = (s, dk) => {
                    if (!s) return;
                    const [dy, dm] = dk.split('-').map(Number);

                    if (dy === calY && dm <= calM) {
                        if (s === 'co') ytd.co += 1;
                        else if (s === 'a') ytd.lv += 1;
                        else if (s === 'h') ytd.lv += 0.5;
                        else if (s === '1p') ytd.prm += 1;
                        else if (s === '2p') ytd.prm += 2;
                        else if (s === 'lop') ytd.lop += 1;
                        else if (s === 'loph') ytd.lop += 0.5;
                        else if (s === 'lop1') ytd.lop += 0.125;
                        else if (s === 'lop2') ytd.lop += 0.25;

                        if (dm === calM) {
                            if (s === 'p' || s === 'wfh' || s === '1p' || s === '2p' || s === 'co' || s === 'lop1' || s === 'lop2') mtd.p += 1;
                            else if (s === 'h' || s === 'loph') mtd.p += 0.5;

                            if (s === 'co') mtd.co += 1;
                            if (s === 'h') mtd.lv += 0.5;
                            else if (s === 'a') mtd.lv += 1;

                            if (s === '1p') mtd.prmHrs += 1;
                            else if (s === '2p') mtd.prmHrs += 2;

                            if (s === 'lop') mtd.lop += 1;
                            else if (s === 'loph') mtd.lop += 0.5;
                            else if (s === 'lop1') mtd.lop += 0.125;
                            else if (s === 'lop2') mtd.lop += 0.25;
                        }

                        if (s === 'p' || s === 'wfh' || s === '1p' || s === '2p' || s === 'co' || s === 'h' || s === 'lop1' || s === 'lop2' || s === 'loph') {
                            const log = this.punchLogs[dk]?.[id];
                            const isActiveShift = (dk === activeDateKey && log && log.in && !log.out);

                            if (!isActiveShift) {
                                let dailyActiveTarget = baseTargetMins;
                                if (s === '1p' || s === 'lop1') dailyActiveTarget = (baseTargetMins - 60);
                                else if (s === '2p' || s === 'lop2') dailyActiveTarget = (baseTargetMins - 120);
                                else if (s === 'h' || s === 'loph') dailyActiveTarget = (baseTargetMins / 2);

                                const dailyBreakTarget = (s === 'h' || s === 'loph') ? (allowedBreakMins / 2) : allowedBreakMins;

                                ytd.completedDays++;

                                if (dm === calM) {
                                    mtd.targetActiveMins += dailyActiveTarget;
                                    mtd.targetBreakMins += dailyBreakTarget;
                                    mtd.completedDays++;
                                }
                            }
                        }
                    }
                };

                const attKeys = Object.keys(this.attendanceData);
                for (let i = 0; i < attKeys.length; i++) {
                    const dk = attKeys[i];
                    processedDates.add(dk);
                    processStatus(this.attendanceData[dk][id], dk);
                }

                if (this.userExceptionHistory) {
                    for (let i = 0; i < this.userExceptionHistory.length; i++) {
                        const exc = this.userExceptionHistory[i];
                        if (!processedDates.has(exc.date) && exc.status) {
                            processStatus(exc.status.id, exc.date);
                        }
                    }
                }

                const punchKeys = Object.keys(this.punchLogs);
                for (let i = 0; i < punchKeys.length; i++) {
                    const dk = punchKeys[i];
                    const log = this.punchLogs[dk]?.[id];
                    if (log && log.in && log.out) {
                        const [dy, dm] = dk.split('-').map(Number);
                        if (dy === calY && dm <= calM) {
                            const isActiveShift = (dk === activeDateKey && !log.out);
                            if (!isActiveShift) {
                                const activeMins = this.getActiveMinsForLog(log, dk);
                                const breakMins = this.calculateTotalBreakMins(log.breaks);

                                ytd.activeMins += activeMins;
                                ytd.breakMins += breakMins;

                                if (dm === calM) {
                                    mtd.activeMins += activeMins;
                                    mtd.breakMins += breakMins;
                                }
                            }
                        }
                    }
                }

                let monthsActiveThisYear = calM;
                if (user.doj) {
                    const dojParts = user.doj.split('-');
                    if (dojParts.length === 3) {
                        const dojY = parseInt(dojParts[0], 10);
                        const dojM = parseInt(dojParts[1], 10);
                        if (dojY === calY) monthsActiveThisYear = Math.max(1, calM - dojM + 1);
                        else if (dojY > calY) monthsActiveThisYear = 0;
                    }
                }

                const totalYearlyLeaves = (user.allowedPL || 0) + (user.allowedSL || 0);
                const limitPerMonth = totalYearlyLeaves / 12;
                const proratedLimitYTD = limitPerMonth * monthsActiveThisYear;
                const remainingYTD = proratedLimitYTD + ytd.co - ytd.lv;

                const netUsedLeaves = Math.max(0, ytd.lv - ytd.co);
                let leaveMonthUtilizedNum = limitPerMonth > 0 ? Math.ceil(netUsedLeaves / limitPerMonth) : 0;
                if (leaveMonthUtilizedNum > 12) leaveMonthUtilizedNum = 12;
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const leaveMonthStr = leaveMonthUtilizedNum > 0 ? monthNames[leaveMonthUtilizedNum - 1] : "N/A";
                const potentialLeaveLOP = Math.max(0, netUsedLeaves - proratedLimitYTD);

                const permLimitPerMonth = user.allowedPerm || 0;
                const proratedPermLimitYTD = permLimitPerMonth * monthsActiveThisYear;
                let permMonthUtilizedNum = permLimitPerMonth > 0 ? Math.ceil(ytd.prm / permLimitPerMonth) : 0;
                if (permMonthUtilizedNum > 12) permMonthUtilizedNum = 12;
                const permMonthStr = permMonthUtilizedNum > 0 ? monthNames[permMonthUtilizedNum - 1] : "N/A";
                const potentialPermLOP = Math.max(0, ytd.prm - proratedPermLimitYTD);

                return {
                    ...stats,
                    isAnniversary: user.doj ? (user.doj.split('-').map(Number)[1] === curM && user.doj.split('-').map(Number)[2] === curD) : false,
                    isBirthday: user.dob ? (user.dob.split('-').map(Number)[1] === curM && user.dob.split('-').map(Number)[2] === curD) : false,
                    holidays: this.holidayList.filter(h => h.dept === 'All' || h.dept === user.dept),
                    metrics: {
                        presentMTD: mtd.p,
                        coMTD: mtd.co,
                        lvMTD: mtd.lv,
                        prmUsedMTD: mtd.prmHrs,
                        lopMTD: mtd.lop,

                        plAllowed: user.allowedPL || 0,
                        slAllowed: user.allowedSL || 0,
                        coEarned: ytd.co,
                        monthlyLeaveLimit: Number(limitPerMonth.toFixed(2)),
                        proratedLeaveLimitYTD: Number(proratedLimitYTD.toFixed(2)),
                        leaveQuotaYTD: Number(proratedLimitYTD.toFixed(2)),
                        permQuotaYTD: proratedPermLimitYTD,

                        usedLeavesMTD: mtd.lv,
                        usedLeavesYTD: ytd.lv,
                        remainingLeavesYTD: Number(remainingYTD.toFixed(2)),

                        prmAvailYTD: proratedPermLimitYTD - ytd.prm,
                        prmUsedYTD: ytd.prm,
                        lopYTD: ytd.lop,

                        leaveMonthUtilized: leaveMonthStr,
                        leaveLOPWarning: Number(potentialLeaveLOP.toFixed(2)),
                        permMonthUtilized: permMonthStr,
                        permLOPWarning: potentialPermLOP,

                        targetActiveMTD: mtd.completedDays > 0 ? Math.round(mtd.targetActiveMins / mtd.completedDays) : baseTargetMins,
                        targetBreakMTD: mtd.completedDays > 0 ? Math.round(mtd.targetBreakMins / mtd.completedDays) : allowedBreakMins,

                        avgActiveMTD: mtd.completedDays > 0 ? Math.round(mtd.activeMins / mtd.completedDays) : 0,
                        avgBreakMTD: mtd.completedDays > 0 ? Math.round(mtd.breakMins / mtd.completedDays) : 0,

                        avgActiveYTD: ytd.completedDays > 0 ? Math.round(ytd.activeMins / ytd.completedDays) : 0,
                        avgBreakYTD: ytd.completedDays > 0 ? Math.round(ytd.breakMins / ytd.completedDays) : 0
                    }
                };
            });
        },

        getAdherenceTier() {
            if (!this.individualStats?.metrics) return 'Silver Tier';

            const m = this.individualStats.metrics;
            const targetMins = m.targetActiveMTD || 480;
            const activePercent = ((m.avgActiveMTD || 0) / Math.max(1, targetMins)) * 100;
            const leavesOver = (m.remainingLeavesYTD < 0);
            const permsOver = (m.prmAvailYTD < 0);
            const breakCompliant = (m.avgBreakMTD || 0) <= (m.targetBreakMTD || 60);

            if (activePercent >= 95 && breakCompliant && !leavesOver && !permsOver) return 'Platinum Tier';
            if (activePercent >= 85 && !leavesOver && !permsOver) return 'Gold Tier';
            if (activePercent >= 75) return 'Silver Tier';
            return 'Action Needed';
        },

        get rangeSummaryData() {
            return memoizeFrame('rangeSummaryData', [
                this.summaryStartDate, this.summaryEndDate, this.filteredMembers,
                this.attendanceData, this.punchLogs, this.ytdStats
            ], () => {
                const sDate = this.summaryStartDate, eDate = this.summaryEndDate;
                const istFallback = getISTDateObject();
                const endY = eDate ? parseInt(eDate.split('-')[0], 10) : istFallback.getUTCFullYear();
                const endM = eDate ? parseInt(eDate.split('-')[1], 10) : (istFallback.getUTCMonth() + 1);

                const attDatesInRange = Object.keys(this.attendanceData).filter(dk => dk >= sDate && dk <= eDate);
                const punchDatesInYear = Object.keys(this.punchLogs).filter(dk => {
                    const y = parseInt(dk.split('-')[0], 10);
                    return y === endY && dk <= eDate;
                });

                return this.filteredMembers.map(m => {
                    const d = {
                        presentMTD: 0, absentMTD: 0, halfMTD: 0, wfhMTD: 0, coMTD: 0,
                        prmHrsMTD: 0, lopMTD: 0, holidayMTD: 0, lvYTD: 0, prmYTDUsed: 0,
                        availLv: 0, availPrm: 0, avgActiveMTD: 0, avgBreakMTD: 0, avgActiveYTD: 0, avgBreakYTD: 0
                    };
                    const ytd = { act: 0, brk: 0, days: 0 };
                    const mtd = { act: 0, brk: 0, days: 0 };

                    for (let i = 0; i < attDatesInRange.length; i++) {
                        const s = this.attendanceData[attDatesInRange[i]]?.[m.id];
                        if (!s) continue;
                        if (s === 'p') d.presentMTD += 1;
                        else if (s === 'wfh') { d.presentMTD += 1; d.wfhMTD += 1; }
                        else if (s === 'a') d.absentMTD += 1;
                        else if (s === 'h') { d.halfMTD += 1; d.presentMTD += 0.5; }
                        else if (s === 'co') d.coMTD += 1;
                        else if (s === '1p') { d.presentMTD += 1; d.prmHrsMTD += 1; }
                        else if (s === '2p') { d.presentMTD += 1; d.prmHrsMTD += 2; }
                        else if (s === 'lop') d.lopMTD += 1;
                        else if (s === 'loph') { d.presentMTD += 0.5; d.lopMTD += 0.5; }
                        else if (s === 'lop1') { d.presentMTD += 1; d.lopMTD += 0.125; }
                        else if (s === 'lop2') { d.presentMTD += 1; d.lopMTD += 0.25; }
                        else if (s === 'fh') d.holidayMTD += 1;
                    }

                    for (let i = 0; i < punchDatesInYear.length; i++) {
                        const dk = punchDatesInYear[i];
                        const log = this.punchLogs[dk]?.[m.id];
                        if (!log || !log.in) continue;
                        const mm = parseInt(dk.split('-')[1], 10);
                        const act = this.getActiveMinsForLog(log, dk);
                        const brk = this.calculateTotalBreakMins(log.breaks);
                        ytd.act += act; ytd.brk += brk; ytd.days++;
                        if (mm === endM) { mtd.act += act; mtd.brk += brk; mtd.days++; }
                    }

                    const dbYTD = this.ytdStats[m.id] || { leaves: 0, compOffs: 0, permHours: 0 };
                    d.lvYTD = dbYTD.leaves;
                    d.prmYTDUsed = dbYTD.permHours;

                    let monthsActiveThisYear = endM;
                    if (m.doj) {
                        const dojParts = m.doj.split('-');
                        if (dojParts.length === 3) {
                            const dojY = parseInt(dojParts[0], 10);
                            const dojM = parseInt(dojParts[1], 10);
                            if (dojY === endY) monthsActiveThisYear = Math.max(1, endM - dojM + 1);
                            else if (dojY > endY) monthsActiveThisYear = 0;
                        }
                    }

                    const totalYearlyLeaves = (m.allowedPL || 0) + (m.allowedSL || 0);
                    const limitPerMonth = totalYearlyLeaves / 12;
                    const proratedLimitYTD = limitPerMonth * monthsActiveThisYear;
                    const remainingYTD = proratedLimitYTD + dbYTD.compOffs - dbYTD.leaves;

                    d.availLv = Number(remainingYTD.toFixed(2));
                    d.availPrm = ((m.allowedPerm || 0) * monthsActiveThisYear) - dbYTD.permHours;

                    d.avgActiveMTD = mtd.days ? Math.floor(mtd.act / mtd.days) : 0;
                    d.avgBreakMTD = mtd.days ? Math.floor(mtd.brk / mtd.days) : 0;
                    d.avgActiveYTD = ytd.days ? Math.floor(ytd.act / ytd.days) : 0;
                    d.avgBreakYTD = ytd.days ? Math.floor(ytd.brk / ytd.days) : 0;

                    return { ...m, ...d };
                });
            });
        },

        getSortedSummaryData(reportFilter = '', sortField = 'name', sortAsc = true) {
            const q = (reportFilter || '').trim().toLowerCase();
            const rows = this.rangeSummaryData.filter(d =>
                !q ||
                d.name.toLowerCase().includes(q) ||
                d.empId.toLowerCase().includes(q) ||
                (d.dept && d.dept.toLowerCase().includes(q))
            );
            return rows.slice().sort((a, b) => {
                const va = a[sortField];
                const vb = b[sortField];
                if (typeof va === 'number' || typeof vb === 'number') {
                    return sortAsc ? (Number(va || 0) - Number(vb || 0)) : (Number(vb || 0) - Number(va || 0));
                }
                const sa = String(va || '').toLowerCase();
                const sb = String(vb || '').toLowerCase();
                return sortAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
            });
        },

        getVisibleRecordMembers(logSearch = '', quickFilter = 'all') {
            const q = (logSearch || '').trim().toLowerCase();
            return this.filteredMembers.filter(m => {
                const matchesSearch = !q ||
                    m.name.toLowerCase().includes(q) ||
                    m.empId.toLowerCase().includes(q) ||
                    (m.dept && m.dept.toLowerCase().includes(q));
                if (!matchesSearch) return false;
                if (quickFilter === 'active') return !!this.punchLogs[this.currentDate]?.[m.id]?.in && !this.punchLogs[this.currentDate]?.[m.id]?.out;
                if (quickFilter === 'punchedout') return !!this.punchLogs[this.currentDate]?.[m.id]?.out;
                if (quickFilter === 'break') return this.isMemberOnBreak(m.id, this.currentDate);
                return true;
            });
        },

        getFilteredDatesByPeriod(p) {
            const ist = getISTDateObject();
            const curY = ist.getUTCFullYear(), curM = ist.getUTCMonth() + 1, curD = ist.getUTCDate();
            return Object.keys(this.attendanceData).filter(d => {
                const [y, m, day] = d.split('-').map(Number);
                if (p === 'day') return y === curY && m === curM && day === curD;
                if (p === 'month') return y === curY && m === curM;
                return y === curY;
            });
        },

        get availablePersonnelOptions() {
            const today = getISTString();
            const actor = this.activeAuthSession;
            const activeOnly = this.members.filter(m => !m.doe || m.doe >= today);
            let scoped = activeOnly;

            if (this.isManagerOrLead && !this.isSuperUser) {
                scoped = activeOnly.filter(m => m.dept === actor?.dept);
            }

            return (this.filterDept && this.isSuperUser) ? scoped.filter(m => m.dept === this.filterDept) : scoped;
        },

        get filteredMembers() {
            const actor = this.activeAuthSession;
            return memoizeFrame('filteredMembers', [
                this.members, this.filterName, this.filterDept, this.view,
                this.currentDate, this.summaryStartDate,
                this.isManagerOrLead, this.isSuperUser, actor?.dept
            ], () => {
                return this.members.filter(m => {
                    if (this.filterName && m.id !== this.filterName) return false;

                    if (this.isManagerOrLead && !this.isSuperUser) {
                        if (m.dept !== actor?.dept) return false;
                    } else {
                        if (this.filterDept && m.dept !== this.filterDept) return false;
                    }

                    if (this.view === 'record' || this.view === 'dashboard') {
                        if (m.doe && m.doe < this.currentDate) return false;
                    }

                    if (this.view === 'summary') {
                        if (m.doe && m.doe < this.summaryStartDate) return false;
                    }

                    return true;
                });
            });
        },

        handleNameFilterChange() { if (this.filterName) this.filterDept = this.members.find(m => m.id === this.filterName)?.dept; },

        markAttendance(id, s) {
            if (!this.hasWriteAccess('record')) return this.showNote("Read-only access for Log", "error");
            if (!this.attendanceData[this.currentDate]) this.attendanceData[this.currentDate] = {};
            this.attendanceData[this.currentDate][id] = s;
            this.attendanceData = { ...this.attendanceData };
            invalidateMemo();
            this.upsertAttCloud(this.currentDate, id, s);
        },

        isMarked(id, s) { return this.attendanceData[this.currentDate]?.[id] === s; },
        getTimeInputVal(tStr) {
            if (!tStr || tStr === '--:--') return '';
            if (/^\d{2}:\d{2}$/.test(tStr)) return tStr;
            const m = tStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
            if (!m) return '';
            let h = parseInt(m[1], 10);
            if (m[3].toUpperCase() === 'PM' && h < 12) h += 12;
            if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
            return `${h.toString().padStart(2, '0')}:${m[2]}`;
        },

        async commitEditLog() {
            if (!this.hasWriteAccess('record')) {
                this.editingLogId = null;
                return this.showNote("Read-only access for Log", "error");
            }
            if (!this.editingLogId) return;
            const id = this.editingLogId;
            if (!this.punchLogs[this.currentDate]) this.punchLogs[this.currentDate] = {};
            if (!this.punchLogs[this.currentDate][id]) this.punchLogs[this.currentDate][id] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };

            const formatT = (t) => {
                if (!t) return '';
                const [h, m] = t.split(':');
                return `${(parseInt(h, 10) % 12 || 12).toString().padStart(2, '0')}:${m} ${parseInt(h, 10) >= 12 ? 'PM' : 'AM'}`;
            };

            const nextIn = formatT(this.tempPunches.in);
            const nextOut = formatT(this.tempPunches.out);

            if (nextIn && nextOut && this.diffInMins(nextIn, nextOut) > 1080) {
                this.showNote("Warning: Shift exceeds 18h. Verify AM/PM punch order.", "error");
            }

            this.punchLogs[this.currentDate][id].in = nextIn;
            this.punchLogs[this.currentDate][id].out = nextOut;

            const newBreaks = this.tempPunches.breaks
                .filter(b => b.start)
                .map(b => ({
                    start: formatT(b.start),
                    end: formatT(b.end),
                    type: b.type || 'Admin Override'
                }));

            this.punchLogs[this.currentDate][id].breaks = newBreaks;
            this.punchLogs = { ...this.punchLogs };
            invalidateMemo();

            this.upsertPunchCloud(this.currentDate, id);

            try {
                await this.supabase.from('break_logs')
                    .delete()
                    .match({ member_id: id, log_date: this.currentDate });

                if (newBreaks.length > 0) {
                    const breakInserts = newBreaks.map(b => ({
                        member_id: id,
                        log_date: this.currentDate,
                        start_time: b.start,
                        end_time: b.end || null,
                        type: b.type
                    }));
                    await this.supabase.from('break_logs').insert(breakInserts);
                }
            } catch (e) {
                console.error("Failed to update break_logs", e);
            }

            this.showNote("Punch and Break Timings Saved", "success");
            this.editingLogId = null;
        },

        async adminToggleBreak(mId) {
            if (!this.hasWriteAccess('record')) return this.showNote("Read-only access for Log", "error");
            if (!this.punchLogs[this.currentDate]) this.punchLogs[this.currentDate] = {};
            if (!this.punchLogs[this.currentDate][mId]) this.punchLogs[this.currentDate][mId] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };

            const breaks = this.punchLogs[this.currentDate][mId].breaks;
            const currentTime = this.getCurrentTimeIST();

            try {
                if (breaks.length > 0 && !breaks[breaks.length - 1].end) {
                    breaks[breaks.length - 1].end = currentTime;
                    await this.supabase.from('break_logs')
                        .update({ end_time: currentTime })
                        .match({ member_id: mId, log_date: this.currentDate })
                        .is('end_time', null);
                    this.showNote("Break Force-Ended", "success");
                } else {
                    breaks.push({ start: currentTime, end: '', type: 'Admin Override' });
                    await this.supabase.from('break_logs').insert({
                        member_id: mId, log_date: this.currentDate, start_time: currentTime, type: 'Admin Override'
                    });
                    this.showNote("Break Force-Started", "success");
                }
                this.punchLogs = { ...this.punchLogs };
                invalidateMemo();
            } catch (e) {
                console.error("Admin break toggle error", e);
                this.showNote("Error saving break", "error");
            }
        },

        formatDate(d) {
            if (!d) return '...';
            const parts = d.split('-').map(Number);
            return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' });
        },
        changeDate(n) {
            const parts = this.currentDate.split('-').map(Number);
            const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
            dt.setUTCDate(dt.getUTCDate() + n);
            this.currentDate = dt.toISOString().slice(0, 10);
        },
        isMarkedPortal(s) { return this.attendanceData[this.getActiveShiftDate()]?.[this.userSession?.id] === s; },

        async markPortalAttendance(s) {
            if (this.isImpersonating) return this.showNote("Read-only preview mode. Exit Staff View to perform actions.", "error");
            if (!this.userSession) return;

            const secureTime = await fetchSecureApiTimeIST();
            if (!secureTime) return;

            const activeDate = this.getActiveShiftDate(), uId = this.userSession.id;
            const currentIp = await this.fetchDeviceAndNetworkInfo();

            this.checkSecurityFlag(currentIp, this.userSession.name);

            if (!this.attendanceData[activeDate]) this.attendanceData[activeDate] = {};
            this.attendanceData[activeDate][uId] = s;

            if (!this.punchLogs[activeDate]) this.punchLogs[activeDate] = {};

            if (!this.punchLogs[activeDate][uId] || !this.punchLogs[activeDate][uId].in) {
                this.punchLogs[activeDate][uId] = { in: secureTime, out: '', in_ip: currentIp, out_ip: '', breaks: [], captchas: [] };
            }

            this.attendanceData = { ...this.attendanceData };
            this.punchLogs = { ...this.punchLogs };
            invalidateMemo();

            this.upsertAttCloud(activeDate, uId, s);
            this.upsertPunchCloud(activeDate, uId);
            this.showNote("Shift Record Updated", "success");
            this.scheduleNextCaptcha();
        },

        initiateLogout() {
            if (this.isImpersonating) return this.showNote("Read-only preview mode. Exit Staff View to perform actions.", "error");
            if (isMobileDevice()) {
                this.showNote("Action Denied: You cannot punch out using a mobile device.", "error");
                return;
            }
            if (!this.userSession) return;

            const activeMins = this.liveActiveMins;
            const activeDate = this.getActiveShiftDate();
            const uId = this.userSession.id;
            const empCode = this.userSession.empId;

            const activeLeave = this.leaveRequests.find(l =>
                (l.empId === uId || l.empId === empCode) &&
                l.status === 'approved' &&
                l.startDate <= activeDate &&
                l.endDate >= activeDate
            );

            let requiredMins = 480;
            if (activeLeave) {
                if (['a', 'co', 'fh'].includes(activeLeave.type)) requiredMins = 0;
                else if (activeLeave.type === 'h') requiredMins = 240;
                else if (activeLeave.type === '1p') requiredMins = 420;
                else if (activeLeave.type === '2p') requiredMins = 360;
            }

            this.logoutPenaltyWarning = null;
            if (activeMins < requiredMins) {
                if (activeMins < 240) this.logoutPenaltyWarning = "Full Day LOP (Less than 4 hours active)";
                else if (activeMins < 360) this.logoutPenaltyWarning = "Half Day LOP (Between 4 - 5h 59m active)";
                else if (activeMins < 420) this.logoutPenaltyWarning = "2 HR LOP (Between 6 - 6h 59m active)";
                else if (activeMins < 480) this.logoutPenaltyWarning = "1 HR LOP (Between 7 - 7h 59m active)";
            }

            this.logoutTimePreview = this.getCurrentTimeIST();
            this.showLogoutModal = true;
        },

        async confirmLogoutPortal() {
            if (this.isImpersonating) {
                this.showLogoutModal = false;
                return this.showNote("Read-only preview mode.", "error");
            }
            if (isMobileDevice()) {
                this.showLogoutModal = false;
                this.showNote("Action Denied: Mobile punch-out is strictly prohibited.", "error");
                return;
            }
            this.clearCaptchaTimers();
            const secureTime = await fetchSecureApiTimeIST();
            if (!secureTime) {
                this.showLogoutModal = false;
                return;
            }
            const activeDate = this.getActiveShiftDate(), uId = this.userSession.id, empCode = this.userSession.empId;
            if (!this.punchLogs[activeDate]) this.punchLogs[activeDate] = {};
            if (!this.punchLogs[activeDate][uId]) this.punchLogs[activeDate][uId] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };

            const breaks = this.punchLogs[activeDate][uId].breaks;
            if (breaks?.length > 0 && !breaks[breaks.length - 1].end) breaks[breaks.length - 1].end = secureTime;

            const currentIp = await this.fetchDeviceAndNetworkInfo();
            this.checkSecurityFlag(currentIp, this.userSession.name);

            this.punchLogs[activeDate][uId].out = secureTime;
            this.punchLogs[activeDate][uId].out_ip = currentIp;
            this.punchLogs = { ...this.punchLogs };
            invalidateMemo();

            await this.upsertPunchCloud(activeDate, uId);

            const finalActiveMins = this.getActiveMinsForLog(this.punchLogs[activeDate][uId], activeDate);
            const activeLeave = this.leaveRequests.find(l =>
                (l.empId === uId || l.empId === empCode) &&
                l.status === 'approved' &&
                l.startDate <= activeDate &&
                l.endDate >= activeDate
            );

            let requiredMins = 480;
            if (activeLeave) {
                if (['a', 'co', 'fh'].includes(activeLeave.type)) requiredMins = 0;
                else if (activeLeave.type === 'h') requiredMins = 240;
                else if (activeLeave.type === '1p') requiredMins = 420;
                else if (activeLeave.type === '2p') requiredMins = 360;
            }

            if (finalActiveMins < requiredMins) {
                let penaltyStatus = null;
                if (finalActiveMins < 240) penaltyStatus = 'lop';
                else if (finalActiveMins < 360) penaltyStatus = 'loph';
                else if (finalActiveMins < 420) penaltyStatus = 'lop2';
                else if (finalActiveMins < 480) penaltyStatus = 'lop1';

                if (penaltyStatus) {
                    if (!this.attendanceData[activeDate]) this.attendanceData[activeDate] = {};
                    this.attendanceData[activeDate][uId] = penaltyStatus;
                    this.attendanceData = { ...this.attendanceData };
                    invalidateMemo();
                    await this.upsertAttCloud(activeDate, uId, penaltyStatus);
                }
            }

            this.showLogoutModal = false;
            this.showNote("Shift Logged Out", "success");
            setTimeout(() => { this.logoutUser(); }, 700);
        },

        toggleEditLog(id) {
            if (!this.hasWriteAccess('record')) return this.showNote("Read-only access for Log", "error");
            if (this.editingLogId === id) this.commitEditLog();
            else {
                if (this.editingLogId) this.commitEditLog();
                this.editingLogId = id;
                const log = this.punchLogs[this.currentDate]?.[id];

                this.tempPunches = {
                    in: this.getTimeInputVal(log?.in),
                    out: this.getTimeInputVal(log?.out),
                    breaks: log?.breaks ? log.breaks.map(b => ({
                        start: this.getTimeInputVal(b.start),
                        end: this.getTimeInputVal(b.end),
                        type: b.type
                    })) : []
                };
            }
        },

        startEdit(m) {
            if (!this.hasWriteAccess('members')) return this.showNote("Read-only access for Roster", "error");
            this.isEditing = true;
            this.newMember = JSON.parse(JSON.stringify(m));
            this.isAddingMember = true;
        },
        resetMemberForm() { this.isAddingMember = false; this.isEditing = false; this.newMember = { empId: '', firstName: '', lastName: '', dept: 'General', role: 'Staff', shift: 'General Shift', allowedPL: 0, allowedSL: 0, allowedPerm: 0, doj: '', doe: '', dob: '', pin: '', captchaEnabled: false }; },

        async handlePinVerification() {
            const uid = this.tempUser.id;
            const empId = this.tempUser.empId.toUpperCase();
            const ghostEmail = `${empId}@revcentric.local`;
            const pinPassword = this.loginPinInput;

            if (this.userLockoutUntil[uid] && Date.now() < this.userLockoutUntil[uid]) {
                this.loginPinInput = '';
                return this.showNote(`Account locked. Try again later`, "error");
            }

            let { data: authData, error: authError } = await this.supabase.auth.signInWithPassword({
                email: ghostEmail,
                password: pinPassword
            });

            if (authError && authError.message.includes("Invalid login credentials")) {
                if (!this.tempUser.auth_id && this.tempUser.pin && pinPassword === this.tempUser.pin) {
                    const { data: signUpData, error: signUpError } = await this.supabase.auth.signUp({
                        email: ghostEmail,
                        password: pinPassword
                    });
                    if (!signUpError && signUpData.user) {
                        authData = signUpData;
                        authError = null;
                        await this.supabase.from('members').update({ auth_id: authData.user.id }).eq('id', uid);
                    }
                }
            }

            if (authError) {
                this.pinErrorShake = true;
                setTimeout(() => this.pinErrorShake = false, 500);

                this.userFailedAttempts[uid] = (this.userFailedAttempts[uid] || 0) + 1;
                this.loginPinInput = '';
                if (this.userFailedAttempts[uid] >= 3) {
                    this.userLockoutUntil[uid] = Date.now() + 30000;
                    this.userFailedAttempts[uid] = 0;
                    this.showNote("Too many failed attempts. Locked for 30s.", "error");
                } else {
                    this.showNote(`Invalid PIN (${3 - this.userFailedAttempts[uid]} attempts left)`, "error");
                }
                return;
            }

            this.userFailedAttempts[uid] = 0;
            this.isImpersonating = false;
            this.originalAdminSession = null;
            this.userSession = JSON.parse(JSON.stringify(this.tempUser));
            this.userSession.auth_id = authData.user.id;

            this.localSessionToken = generateSecureId();
            await this.supabase.from('members')
                .update({ current_session: this.localSessionToken })
                .eq('id', uid);

            this.setupUserRealtime();
            await Promise.all([
                this.syncUserData(true),
                this.fetchExceptionHistory()
            ]);

            const trapDate = this.getActiveShiftDate();
            const todaysCaptchas = this.punchLogs[trapDate]?.[uid]?.captchas || [];
            const pendingCaptchas = todaysCaptchas.filter(c => c.status === 'Pending');

            if (pendingCaptchas.length > 0) {
                this.showNote("Window closed during verification. Penalty applied.", "error");

                let penaltyTime = pendingCaptchas[0].time;
                const currentIp = await this.fetchDeviceAndNetworkInfo();
                this.checkSecurityFlag(currentIp, this.userSession.name);

                for (const cap of pendingCaptchas) {
                    cap.status = 'Missed';
                    await this.supabase.from('captcha_logs')
                        .update({ status: 'Missed', ip_address: currentIp })
                        .match({ member_id: uid, log_date: trapDate, check_time: cap.time });

                    if (cap.time < penaltyTime) penaltyTime = cap.time;
                }
                this.punchLogs = { ...this.punchLogs };
                invalidateMemo();

                this.startBreak(null, 'Penalty');
                this.loginStep = 'id'; this.loginIdInput = ''; this.loginPinInput = ''; this.tempUser = null;
                return;
            }

            const reopenLog = this.punchLogs[trapDate]?.[uid];
            const alreadyOnBreak = reopenLog?.breaks?.length > 0 && !reopenLog.breaks[reopenLog.breaks.length - 1].end;
            if (this.userSession.captchaEnabled && reopenLog?.in && !reopenLog?.out && !alreadyOnBreak) {
                const missedTime = this.getCurrentTimeIST();
                const currentIp = await this.fetchDeviceAndNetworkInfo();
                this.checkSecurityFlag(currentIp, this.userSession.name);

                if (!this.punchLogs[trapDate][uid].captchas) this.punchLogs[trapDate][uid].captchas = [];
                this.punchLogs[trapDate][uid].captchas.push({ time: missedTime, status: 'Missed', ip: currentIp });
                this.punchLogs = { ...this.punchLogs };
                invalidateMemo();
                try {
                    await this.supabase.from('captcha_logs').insert({
                        member_id: uid, log_date: trapDate, check_time: missedTime, status: 'Missed', ip_address: currentIp
                    });
                } catch (e) { console.error("Session-close captcha log error", e); }

                this.showNote("Session closed during active shift. Break initiated.", "error");
                this.startBreak(missedTime);
                this.loginStep = 'id'; this.loginIdInput = ''; this.loginPinInput = ''; this.tempUser = null;
                return;
            }

            const activeDate = this.getActiveShiftDate(), uId = this.userSession.id;
            if (!this.attendanceData[activeDate]) this.attendanceData[activeDate] = {};
            if (!this.attendanceData[activeDate][uId]) {
                this.attendanceData[activeDate][uId] = 'p';
                this.attendanceData = { ...this.attendanceData };
                this.upsertAttCloud(activeDate, uId, 'p');
            }
            if (!this.punchLogs[activeDate]) this.punchLogs[activeDate] = {};

            if (!this.punchLogs[activeDate][uId] || !this.punchLogs[activeDate][uId].in) {
                const currentIp = await this.fetchDeviceAndNetworkInfo();
                this.checkSecurityFlag(currentIp, this.userSession.name);

                this.punchLogs[activeDate][uId] = {
                    in: this.getCurrentTimeIST(), out: '',
                    in_ip: currentIp, out_ip: '',
                    breaks: [], captchas: []
                };
                this.punchLogs = { ...this.punchLogs };
                this.upsertPunchCloud(activeDate, uId);
            }
            invalidateMemo();
            this.loginStep = 'id'; this.loginIdInput = ''; this.loginPinInput = ''; this.tempUser = null;
            this.scheduleNextCaptcha();
        },

        async handlePinSetup() {
            if (this.loginPinInput.length !== 6) return this.showNote("PIN must be 6 digits", "error");

            const uid = this.tempUser.id;
            const empId = this.tempUser.empId.toUpperCase();
            const ghostEmail = `${empId}@revcentric.local`;
            const pinPassword = this.loginPinInput;

            if (this.tempUser.auth_id) {
                return this.showNote("Account already exists in Auth. Ask an admin to run PIN reset via Edge Function.", "error");
            }

            const { data: authData, error: authError } = await this.supabase.auth.signUp({
                email: ghostEmail, password: pinPassword
            });

            if (authError) {
                const msg = authError.message.includes("already registered")
                    ? "Auth user already exists. Ask Admin to reset via Edge Function."
                    : "Auth Error: " + authError.message;
                return this.showNote(msg, "error");
            }

            const idx = this.members.findIndex(m => m.id === this.tempUser.id);
            if (idx !== -1) {
                this.members[idx].pin = pinPassword;
                this.members[idx].auth_id = authData.user.id;
                this.upsertMemberCloud(this.members[idx]);

                this.isImpersonating = false;
                this.originalAdminSession = null;
                this.userSession = JSON.parse(JSON.stringify(this.members[idx]));
                this.userSession.auth_id = authData.user.id;

                this.localSessionToken = generateSecureId();
                await this.supabase.from('members')
                    .update({ current_session: this.localSessionToken })
                    .eq('id', uid);

                this.setupUserRealtime();
                await Promise.all([
                    this.syncUserData(true),
                    this.fetchExceptionHistory()
                ]);

                const setupTrapDate = this.getActiveShiftDate();
                const setupUid = this.userSession.id;
                const setupTodaysCaptchas = this.punchLogs[setupTrapDate]?.[setupUid]?.captchas || [];
                const setupPendingCaptchas = setupTodaysCaptchas.filter(c => c.status === 'Pending');

                if (setupPendingCaptchas.length > 0) {
                    this.showNote("Window closed during verification. Penalty applied.", "error");

                    let penaltyTime = setupPendingCaptchas[0].time;
                    const currentIp = await this.fetchDeviceAndNetworkInfo();
                    this.checkSecurityFlag(currentIp, this.userSession.name);

                    for (const cap of setupPendingCaptchas) {
                        cap.status = 'Missed';
                        await this.supabase.from('captcha_logs')
                            .update({ status: 'Missed', ip_address: currentIp })
                            .match({ member_id: setupUid, log_date: setupTrapDate, check_time: cap.time });

                        if (cap.time < penaltyTime) penaltyTime = cap.time;
                    }
                    this.punchLogs = { ...this.punchLogs };
                    invalidateMemo();

                    this.startBreak(null, 'Penalty');
                    this.loginStep = 'id'; this.loginIdInput = ''; this.loginPinInput = ''; this.tempUser = null;
                    return;
                }

                const activeDate = this.getActiveShiftDate(), uId = this.userSession.id;
                if (!this.attendanceData[activeDate]) this.attendanceData[activeDate] = {};
                this.attendanceData[activeDate][uId] = 'p';
                this.attendanceData = { ...this.attendanceData };
                this.upsertAttCloud(activeDate, uId, 'p');

                if (!this.punchLogs[activeDate]) this.punchLogs[activeDate] = {};
                if (!this.punchLogs[activeDate][uId] || !this.punchLogs[activeDate][uId].in) {
                    const currentIp = await this.fetchDeviceAndNetworkInfo();
                    this.checkSecurityFlag(currentIp, this.userSession.name);

                    this.punchLogs[activeDate][uId] = {
                        in: this.getCurrentTimeIST(), out: '',
                        in_ip: currentIp, out_ip: '',
                        breaks: [], captchas: []
                    };
                    this.punchLogs = { ...this.punchLogs };
                    this.upsertPunchCloud(activeDate, uId);
                }
                invalidateMemo();
                this.loginStep = 'id'; this.loginIdInput = ''; this.loginPinInput = ''; this.tempUser = null;
                this.scheduleNextCaptcha();
                this.showNote("Security Registered", "success");
            }
        },

        async logoutUser() {
            this.clearCaptchaTimers();
            this.currentCaptchaTime = null;
            this.userSession = null;
            this.originalAdminSession = null;
            this.isImpersonating = false;
            this.localSessionToken = null;

            if (this.userSyncChannel) {
                this.supabase.removeChannel(this.userSyncChannel);
                this.userSyncChannel = null;
            }

            this.loginStep = 'id';

            try {
                await this.supabase.auth.signOut();
            } catch (e) {
                console.warn("Supabase signout skipped or failed:", e);
            }

            clearAuthStorageOnly();
            window.location.reload();
        },

        cancelLogin() { this.loginStep = 'id'; this.loginIdInput = ''; this.loginPinInput = ''; this.tempUser = null; },

        async handleIdEntry() {
            if (!this.loginIdInput) return;
            const empIdClean = this.loginIdInput.trim().toUpperCase();
            const matched = this.members.find(m => m.empId.toUpperCase() === empIdClean);

            if (matched) {
                const todayStr = getISTString();
                if (matched.doe && matched.doe < todayStr) {
                    this.loginIdInput = '';
                    return this.showNote("Access Denied: Account Deactivated", "error");
                }
                this.tempUser = JSON.parse(JSON.stringify(matched));
                this.loginStep = !matched.pin ? 'setup' : 'pin';
                this.loginIdInput = '';
                if ("Notification" in window && Notification.permission === "default") {
                    Notification.requestPermission().catch(() => {});
                }
                setTimeout(() => {
                    const el = document.getElementById(this.loginStep === 'pin' ? 'login-pin-input' : 'setup-pin-input');
                    if (el) el.focus();
                }, 100);
            } else {
                this.showNote("Employee ID not registered", "error");
            }
        },

        async verifyAdmin() {
            if (Date.now() < this.adminLockoutUntil) { this.adminPinInput = ''; return this.showNote(`Vault locked.`, "error"); }
            if (this.adminPinInput === this.masterPin) {
                const { error: authError } = await this.supabase.auth.signInWithPassword({
                    email: 'master@revcentric.local',
                    password: this.adminPinInput
                });

                if (authError && authError.message.includes("Invalid login credentials")) {
                    await this.supabase.auth.signUp({
                        email: 'master@revcentric.local',
                        password: this.adminPinInput
                    });
                }

                this.isAdminAuthenticated = true;
                localStorage.setItem('rc_admin_authenticated', 'true');
                localStorage.setItem('rc_admin_pin', this.adminPinInput);

                this.adminPinInput = '';
                this.adminFailedAttempts = 0;
                this.resetIdleTimer();
                this.setupUserRealtime();
                this.syncUserData(true);
            } else {
                this.adminFailedAttempts++; this.adminPinInput = '';
                if (this.adminFailedAttempts >= 3) { this.adminLockoutUntil = Date.now() + 30000; this.adminFailedAttempts = 0; this.showNote("Vault Lockdown Triggered", "error"); }
                else { this.pinErrorShake = true; setTimeout(() => this.pinErrorShake = false, 500); this.showNote(`Access Denied`, "error"); }
            }
        },

        async logoutAdmin() {
            this.isAdminAuthenticated = false;
            localStorage.removeItem('rc_admin_authenticated');
            localStorage.removeItem('rc_admin_pin');
            this.view = 'portal';
            if (this.idleInterval) clearInterval(this.idleInterval);

            if (this.userSyncChannel) {
                this.supabase.removeChannel(this.userSyncChannel);
                this.userSyncChannel = null;
            }
            await this.supabase.auth.signOut();
        },

        addMember() {
            if (!this.hasWriteAccess('members')) return this.showNote("Read-only access for Roster", "error");
            if (!this.newMember.firstName || !this.newMember.empId) return this.showNote("Fields missing", "error");
            const fullName = (this.newMember.firstName + ' ' + (this.newMember.lastName || '')).trim();
            const cleanMember = {
                ...this.newMember,
                id: this.isEditing ? (this.newMember.id || this.newMember.empId) : this.newMember.empId,
                name: fullName,
                allowedPL: Number(this.newMember.allowedPL ?? 0),
                allowedSL: Number(this.newMember.allowedSL ?? 0),
                allowedPerm: Number(this.newMember.allowedPerm ?? 0)
            };

            if (this.isEditing) {
                const idx = this.members.findIndex(m => m.id === cleanMember.id || m.empId === cleanMember.empId);
                if (idx !== -1) this.members[idx] = cleanMember;
            } else {
                if (this.members.find(m => m.empId.toUpperCase() === cleanMember.empId.toUpperCase())) {
                    return this.showNote("ID exists", "error");
                }
                this.members.push(cleanMember);
            }

            this.members.sort((a, b) => a.empId.localeCompare(b.empId, undefined, { numeric: true, sensitivity: 'base' }));
            this.members = [...this.members];
            invalidateMemo();

            this.upsertMemberCloud(cleanMember);
            this.resetMemberForm();
            this.showNote("Personnel profile saved", "success");
        },

        savePoliciesNote() {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            this.policiesNote = String(this.policyNoteDraft || '').trim();
            this.upsertConfigCloud('policies_note', this.policiesNote);
            this.showNote('Policies information updated', 'success');
        },

        formatAuditDateTime(value) {
            if (!value) return '—';
            const d = new Date(value);
            return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        },

        // Master Config: Roles CRUD
        addRole() {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            const name = this.newRoleName.trim();
            if (name && !this.roles.includes(name)) {
                this.roles = [...this.roles, name];
                this.upsertConfigCloud('roles', this.roles);
                this.newRoleName = '';
                this.showNote("Role added", "success");
            }
        },
        startEditRole(role) {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            this.editingRole = role;
            this.editRoleValue = role;
        },
        cancelEditRole() {
            this.editingRole = null;
            this.editRoleValue = '';
        },
        async saveEditRole() {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            const oldName = this.editingRole;
            const newName = (this.editRoleValue || '').trim();
            if (!oldName || !newName) return this.showNote("Role title cannot be empty", "error");
            if (newName === oldName) { this.cancelEditRole(); return; }
            if (this.roles.some(r => r.toLowerCase() === newName.toLowerCase() && r !== oldName)) {
                return this.showNote("Role already exists", "error");
            }
            this.roles = this.roles.map(r => r === oldName ? newName : r);
            if (this.roleAccess[oldName]) {
                this.roleAccess[newName] = [...this.roleAccess[oldName]];
                delete this.roleAccess[oldName];
                this.roleAccess = { ...this.roleAccess };
                await this.upsertConfigCloud('role_access', this.roleAccess);
            }
            await this.upsertConfigCloud('roles', this.roles);

            const affectedMembers = this.members.filter(m => m.role === oldName);
            for (const m of affectedMembers) {
                m.role = newName;
                this.upsertMemberCloud(m);
            }
            if (affectedMembers.length) this.members = [...this.members];
            if (this.userSession?.role === oldName) this.userSession.role = newName;
            if (this.originalAdminSession?.role === oldName) this.originalAdminSession.role = newName;

            invalidateMemo();
            this.cancelEditRole();
            this.showNote("Role updated", "success");
        },
        removeRole(role) {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            this.roles = this.roles.filter(r => r !== role);
            if (this.editingRole === role) this.cancelEditRole();
            this.upsertConfigCloud('roles', this.roles);
        },

        // Master Config: Departments CRUD
        addDept() {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            const name = this.newDeptName.trim();
            if (name && !this.departments.includes(name)) {
                this.departments = [...this.departments, name];
                this.upsertConfigCloud('departments', this.departments);
                this.newDeptName = '';
                this.showNote("Department added", "success");
            }
        },
        startEditDept(dept) {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            this.editingDept = dept;
            this.editDeptValue = dept;
        },
        cancelEditDept() {
            this.editingDept = null;
            this.editDeptValue = '';
        },
        async saveEditDept() {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            const oldName = this.editingDept;
            const newName = (this.editDeptValue || '').trim();
            if (!oldName || !newName) return this.showNote("Department name cannot be empty", "error");
            if (newName === oldName) { this.cancelEditDept(); return; }
            if (this.departments.some(d => d.toLowerCase() === newName.toLowerCase() && d !== oldName)) {
                return this.showNote("Department already exists", "error");
            }
            this.departments = this.departments.map(d => d === oldName ? newName : d);
            await this.upsertConfigCloud('departments', this.departments);

            const affectedMembers = this.members.filter(m => m.dept === oldName);
            for (const m of affectedMembers) {
                m.dept = newName;
                this.upsertMemberCloud(m);
            }
            if (affectedMembers.length) this.members = [...this.members];

            const affectedHolidays = this.holidayList.filter(h => h.dept === oldName);
            for (const h of affectedHolidays) {
                h.dept = newName;
                this.upsertHolidayCloud(h);
            }
            if (affectedHolidays.length) this.holidayList = [...this.holidayList];

            if (this.userSession?.dept === oldName) this.userSession.dept = newName;
            if (this.originalAdminSession?.dept === oldName) this.originalAdminSession.dept = newName;

            invalidateMemo();
            this.cancelEditDept();
            this.showNote("Department updated", "success");
        },
        removeDept(dept) {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            this.departments = this.departments.filter(d => d !== dept);
            if (this.editingDept === dept) this.cancelEditDept();
            this.upsertConfigCloud('departments', this.departments);
        },

        // Master Config: Shifts CRUD
        addShift() {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            const name = this.newShift.name.trim();
            if (name && !this.shifts.find(s => s.name === name)) {
                this.shifts = [...this.shifts, { name, inTime: this.newShift.inTime || '09:00', outTime: this.newShift.outTime || '18:00' }];
                this.upsertConfigCloud('shifts', this.shifts);
                invalidateMemo();
                this.newShift = { name: '', inTime: '', outTime: '' };
                this.showNote("Shift added", "success");
            }
        },
        startEditShift(shift) {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            this.editingShift = shift.name;
            this.editShiftForm = { name: shift.name, inTime: shift.inTime || '09:00', outTime: shift.outTime || '18:00' };
        },
        cancelEditShift() {
            this.editingShift = null;
            this.editShiftForm = { name: '', inTime: '', outTime: '' };
        },
        async saveEditShift() {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            const oldName = this.editingShift;
            const newName = (this.editShiftForm.name || '').trim();
            const inTime = this.editShiftForm.inTime || '09:00';
            const outTime = this.editShiftForm.outTime || '18:00';
            if (!oldName || !newName) return this.showNote("Shift title cannot be empty", "error");
            if (this.shifts.some(s => s.name.toLowerCase() === newName.toLowerCase() && s.name !== oldName)) {
                return this.showNote("Shift title already exists", "error");
            }
            this.shifts = this.shifts.map(s => s.name === oldName ? { name: newName, inTime, outTime } : s);
            await this.upsertConfigCloud('shifts', this.shifts);

            if (newName !== oldName) {
                const affectedMembers = this.members.filter(m => m.shift === oldName);
                for (const m of affectedMembers) {
                    m.shift = newName;
                    this.upsertMemberCloud(m);
                }
                if (affectedMembers.length) this.members = [...this.members];
                if (this.userSession?.shift === oldName) this.userSession.shift = newName;
                if (this.originalAdminSession?.shift === oldName) this.originalAdminSession.shift = newName;
            }

            invalidateMemo();
            this.cancelEditShift();
            this.showNote("Shift schedule updated", "success");
        },
        removeShift(s) {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            this.shifts = this.shifts.filter(x => x.name !== s);
            if (this.editingShift === s) this.cancelEditShift();
            invalidateMemo();
            this.upsertConfigCloud('shifts', this.shifts);
        },

        showNote(msg, type = 'success') { this.notification = { msg, type }; setTimeout(() => this.notification = null, 4000); },

        async executeWipe() {
            if (!this.hasWriteAccess('members')) {
                this.showDeleteModal = false;
                return this.showNote("Read-only access for Roster", "error");
            }
            if (this.memberToDelete) {
                this.members = this.members.filter(m => m.id !== this.memberToDelete);
                invalidateMemo();
                try { await this.supabase.from('members').delete().eq('id', this.memberToDelete); } catch (e) {}
                this.showNote("Personnel record removed", "success");
            }
            this.showDeleteModal = false;
            this.memberToDelete = null;
        },

        async exportToPDF() {
            if (!this.hasWriteAccess('summary')) return this.showNote("Read-only access for Reports", "error");
            if (!window.html2pdf) {
                this.showNote("Loading PDF engine...", "success");
                try {
                    await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
                } catch (e) {
                    return this.showNote("Failed to load PDF engine", "error");
                }
            }
            const el = document.getElementById('summary-content'), scrollArea = document.getElementById('audit-table-scroll');
            if (scrollArea) scrollArea.classList.remove('max-h-[620px]', 'max-h-[600px]', 'overflow-x-auto');
            try {
                await html2pdf().from(el).set({
                    margin: 10,
                    filename: `Audit_Report_${this.summaryStartDate}_to_${this.summaryEndDate}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2 },
                    jsPDF: { format: 'a3', orientation: 'landscape' }
                }).save();
                this.showNote("PDF Downloaded", "success");
            } finally {
                if (scrollArea) scrollArea.classList.add('max-h-[620px]', 'overflow-x-auto');
            }
        },

        async fetchReportDataRange() {
            if (!this.summaryStartDate || !this.summaryEndDate) return this.showNote("Please select both dates", "error");
            if (this.summaryStartDate > this.summaryEndDate) return this.showNote("Start date must be before end date", "error");

            this.isSyncing = true;
            this.showNote("Fetching historical report data...", "success");

            try {
                const attQuery = this.supabase.from('attendance').select('*').gte('date', this.summaryStartDate).lte('date', this.summaryEndDate);
                const punchQuery = this.supabase.from('punch_logs').select('*').gte('date', this.summaryStartDate).lte('date', this.summaryEndDate);
                const breakQuery = this.supabase.from('break_logs').select('*').gte('log_date', this.summaryStartDate).lte('log_date', this.summaryEndDate);
                const apiQuery = this.supabase.from('captcha_logs').select('*').gte('log_date', this.summaryStartDate).lte('log_date', this.summaryEndDate);

                const [{ data: aData }, { data: pData }, { data: bData }, { data: capData }] = await Promise.all([
                    attQuery, punchQuery, breakQuery, apiQuery
                ]);

                if (aData) {
                    aData.forEach(r => {
                        if (!this.attendanceData[r.date]) this.attendanceData[r.date] = {};
                        this.attendanceData[r.date][r.member_id] = r.status;
                    });
                    this.attendanceData = { ...this.attendanceData };
                }

                if (pData) {
                    pData.forEach(r => {
                        if (!this.punchLogs[r.date]) this.punchLogs[r.date] = {};
                        if (!this.punchLogs[r.date][r.member_id]) {
                            this.punchLogs[r.date][r.member_id] = { in: r.in_time || '', out: r.out_time || '', in_ip: r.in_ip || '', out_ip: r.out_ip || '', breaks: [], captchas: [] };
                        } else {
                            this.punchLogs[r.date][r.member_id].in = r.in_time || '';
                            this.punchLogs[r.date][r.member_id].out = r.out_time || '';
                            this.punchLogs[r.date][r.member_id].in_ip = r.in_ip || '';
                            this.punchLogs[r.date][r.member_id].out_ip = r.out_ip || '';
                        }
                    });
                }

                if (bData) {
                    bData.forEach(b => {
                        if (!this.punchLogs[b.log_date]) this.punchLogs[b.log_date] = {};
                        if (!this.punchLogs[b.log_date][b.member_id]) this.punchLogs[b.log_date][b.member_id] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };

                        const breaks = this.punchLogs[b.log_date][b.member_id].breaks;
                        if (!breaks.find(existing => existing.start === b.start_time)) {
                            breaks.push({ start: b.start_time, end: b.end_time || '', type: b.type || '' });
                        }
                    });
                }

                if (capData) {
                    capData.forEach(c => {
                        if (!this.punchLogs[c.log_date]) this.punchLogs[c.log_date] = {};
                        if (!this.punchLogs[c.log_date][c.member_id]) this.punchLogs[c.log_date][c.member_id] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
                        if (!this.punchLogs[c.log_date][c.member_id].captchas) this.punchLogs[c.log_date][c.member_id].captchas = [];

                        const captchas = this.punchLogs[c.log_date][c.member_id].captchas;
                        if (!captchas.find(existing => existing.time === c.check_time)) {
                            captchas.push({ time: c.check_time, status: c.status, ip: c.ip_address || '' });
                        }
                    });
                }

                this.punchLogs = { ...this.punchLogs };
                invalidateMemo();

                if (this.summaryStartDate < this.scopeStartStr) {
                    this.scopeStartStr = this.summaryStartDate;
                }

                this.showNote("Report data loaded successfully", "success");
            } catch (e) {
                console.error("Report Fetch Error:", e);
                this.showNote("Failed to fetch report data", "error");
            } finally {
                this.isSyncing = false;
            }
        },

        async exportDetailedExcel() {
            if (!this.hasWriteAccess('summary')) return this.showNote("Read-only access for Reports", "error");
            if (!this.summaryStartDate || !this.summaryEndDate) return this.showNote("Invalid date range", "error");
            if (!(await ensureXLSX())) return this.showNote("Failed to load Excel engine", "error");

            const sDate = new Date(this.summaryStartDate + 'T00:00:00Z'), eDate = new Date(this.summaryEndDate + 'T00:00:00Z'), detailedRows = [];
            const statusMap = new Map(this.statusOptions.map(s => [s.id, s.label]));
            this.filteredMembers.forEach(m => {
                for (let d = new Date(sDate); d <= eDate; d.setUTCDate(d.getUTCDate() + 1)) {
                    const dateStr = d.toISOString().slice(0, 10), statusId = this.attendanceData[dateStr]?.[m.id] || '-';
                    const punchLog = this.punchLogs[dateStr]?.[m.id] || { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
                    let notes = '';
                    if (statusId === 'fh') { const h = this.holidayList.find(hol => hol.date === dateStr && (hol.dept === 'All' || hol.dept === m.dept)); if (h) notes = `Holiday: ${h.name}`; }
                    else if (['a', 'h', '1p', '2p', 'lop', 'wfh'].includes(statusId)) { const leave = this.leaveRequests.find(l => (l.empId === m.id || l.empId === m.empId) && l.status === 'approved' && l.startDate <= dateStr && l.endDate >= dateStr); if (leave) notes = `Leave: ${leave.reason}`; }
                    detailedRows.push({ 'Date': dateStr, 'Emp ID': m.empId, 'Name': m.name, 'Department': m.dept, 'Shift': m.shift, 'Status': statusMap.get(statusId) || 'Unrecorded', 'Punch In': punchLog.in || '', 'Punch In IP': punchLog.in_ip || '', 'Punch Out': punchLog.out || '', 'Punch Out IP': punchLog.out_ip || '', 'Active (Mins)': this.getActiveMinsForLog(punchLog, dateStr), 'Break (Mins)': this.calculateTotalBreakMins(punchLog.breaks), 'Captcha Fails': punchLog.captchas?.filter(c => c.status !== 'Passed').length || 0, 'Notes': notes });
                }
            });
            if (detailedRows.length === 0) return this.showNote("No data", "error");
            const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(detailedRows);
            ws['!cols'] = [{wch: 12}, {wch: 10}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 12}, {wch: 10}, {wch: 35}, {wch: 10}, {wch: 35}, {wch: 18}, {wch: 18}, {wch: 15}, {wch: 30}];
            XLSX.utils.book_append_sheet(wb, ws, "Detailed_Logs"); XLSX.writeFile(wb, `Detailed_Log_Report_${this.summaryStartDate}_to_${this.summaryEndDate}.xlsx`); this.showNote("Report Downloaded", "success");
        },

        async exportSecurityAuditExcel() {
            if (!this.hasWriteAccess('summary')) return this.showNote("Read-only access for Reports", "error");
            if (!this.summaryStartDate || !this.summaryEndDate) return this.showNote("Invalid date range", "error");
            if (!(await ensureXLSX())) return this.showNote("Failed to load Excel engine", "error");

            const sDate = new Date(this.summaryStartDate + 'T00:00:00Z'), eDate = new Date(this.summaryEndDate + 'T00:00:00Z'), auditRows = [];

            const parseNetworkString = (str) => {
                if (!str) return { ip: 'N/A', geo: 'US/Unknown', os: 'N/A' };
                let ip = str.split(' | ')[0] || 'N/A';
                const os = str.split(' | OS: ')[1] || 'N/A';
                let geo = 'US (Assumed)';
                if (ip.includes('[🚨 Outside US:')) {
                    const match = ip.match(/\[🚨 Outside US: (.*?)\]/);
                    if (match) geo = match[1];
                    ip = ip.replace(/ \[🚨 Outside US: .*?\]/, '');
                }
                return { ip: ip.trim(), geo: geo.trim(), os: os.trim() };
            };

            this.filteredMembers.forEach(m => {
                for (let d = new Date(sDate); d <= eDate; d.setUTCDate(d.getUTCDate() + 1)) {
                    const dateStr = d.toISOString().slice(0, 10);
                    const punchLog = this.punchLogs[dateStr]?.[m.id];
                    if (!punchLog) continue;

                    if (punchLog.in && punchLog.in_ip) {
                        const parsedIn = parseNetworkString(punchLog.in_ip);
                        auditRows.push({ 'Date': dateStr, 'Emp ID': m.empId, 'Name': m.name, 'Event': 'Punch In', 'Time': punchLog.in, 'IP Address': parsedIn.ip, 'Location': parsedIn.geo, 'Operating System': parsedIn.os });
                    }
                    if (punchLog.out && punchLog.out_ip) {
                        const parsedOut = parseNetworkString(punchLog.out_ip);
                        auditRows.push({ 'Date': dateStr, 'Emp ID': m.empId, 'Name': m.name, 'Event': 'Punch Out', 'Time': punchLog.out, 'IP Address': parsedOut.ip, 'Location': parsedOut.geo, 'Operating System': parsedOut.os });
                    }
                    if (punchLog.captchas && punchLog.captchas.length > 0) {
                        punchLog.captchas.forEach(cap => {
                            const parsedCap = parseNetworkString(cap.ip);
                            auditRows.push({ 'Date': dateStr, 'Emp ID': m.empId, 'Name': m.name, 'Event': `Captcha (${cap.status})`, 'Time': cap.time, 'IP Address': parsedCap.ip, 'Location': parsedCap.geo, 'Operating System': parsedCap.os });
                        });
                    }
                }
            });

            if (auditRows.length === 0) return this.showNote("No security data found in range", "error");

            const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(auditRows);
            ws['!cols'] = [{wch: 12}, {wch: 10}, {wch: 25}, {wch: 18}, {wch: 12}, {wch: 18}, {wch: 18}, {wch: 25}];
            XLSX.utils.book_append_sheet(wb, ws, "Security_Audit");
            XLSX.writeFile(wb, `Security_Device_Audit_${this.summaryStartDate}_to_${this.summaryEndDate}.xlsx`);
            this.showNote("Security Audit Downloaded", "success");
        },

        async exportRosterExcel() {
            if (!this.hasWriteAccess('summary')) return this.showNote("Read-only access for Reports", "error");
            if (!this.members || this.members.length === 0) return this.showNote("No personnel data", "error");
            if (!(await ensureXLSX())) return this.showNote("Failed to load Excel engine", "error");

            const detailedRows = this.members.map(m => ({
                'Emp ID': m.empId,
                'Full Name': m.name,
                'Department': m.dept,
                'Role': m.role,
                'Shift': m.shift,
                'PL Allowed': m.allowedPL,
                'SL Allowed': m.allowedSL,
                'Perm (Hrs)': m.allowedPerm,
                'Date of Joining': m.doj || '',
                'Date of Birth': m.dob || '',
                'Verification Required': m.captchaEnabled ? 'Yes' : 'No'
            }));
            const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(detailedRows);
            ws['!cols'] = [{wch: 12}, {wch: 25}, {wch: 18}, {wch: 18}, {wch: 18}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 15}, {wch: 15}, {wch: 20}];
            XLSX.utils.book_append_sheet(wb, ws, "Roster_Report");
            XLSX.writeFile(wb, `Roster_Report_${getISTString()}.xlsx`);
            this.showNote("Roster Report Downloaded", "success");
        },

        async executeFullSystemExport() {
            if (!this.hasWriteAccess('summary')) return this.showNote("Read-only access for Reports", "error");
            if (!this.members || this.members.length === 0) return this.showNote("No data available to export", "error");
            if (!(await ensureXLSX())) return this.showNote("Failed to load Excel engine", "error");

            this.showNote("Compiling Database Snapshot...", "success");
            const wb = XLSX.utils.book_new();
            const memberNameMap = new Map(this.members.map(m => [m.id, m.name]));

            const personnelRows = this.members.map(m => ({
                'Employee ID': m.empId,
                'Full Name': m.name,
                'Department': m.dept,
                'Role': m.role,
                'Shift Type': m.shift,
                'PL Allowance': m.allowedPL,
                'SL Allowance': m.allowedSL,
                'Perm (Hrs/Mo)': m.allowedPerm,
                'Date of Joining': m.doj,
                'Date of Birth': m.dob || 'N/A',
                'Verification Enforced': m.captchaEnabled ? 'Yes' : 'No'
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(personnelRows), "Personnel_Master");

            const attendanceRows = [];
            Object.keys(this.attendanceData).sort().forEach(date => {
                Object.keys(this.attendanceData[date]).forEach(empId => {
                    if (this.attendanceData[date][empId]) {
                        attendanceRows.push({
                            'Date': date,
                            'Emp ID': empId,
                            'Name': memberNameMap.get(empId) || 'Unknown',
                            'Status': this.attendanceData[date][empId].toUpperCase()
                        });
                    }
                });
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attendanceRows), "Attendance_Registry");

            const punchRows = [];
            Object.keys(this.punchLogs).sort().forEach(date => {
                Object.keys(this.punchLogs[date]).forEach(empId => {
                    const log = this.punchLogs[date][empId];
                    const captchaFails = (log.captchas || []).filter(c => c.status !== 'Passed').length;

                    punchRows.push({
                        'Date': date,
                        'Emp ID': empId,
                        'Name': memberNameMap.get(empId) || 'Unknown',
                        'Punch In': log.in || 'Missing',
                        'Punch In IP': log.in_ip || 'N/A',
                        'Punch Out': log.out || 'Missing',
                        'Punch Out IP': log.out_ip || 'N/A',
                        'Active (Mins)': this.getActiveMinsForLog(log, date),
                        'Break (Mins)': this.calculateTotalBreakMins(log.breaks),
                        'Failed Verifications': captchaFails
                    });
                });
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(punchRows), "Punch_and_Break_Logs");

            const leaveRows = this.leaveRequests.map(l => ({
                'Request ID': l.id,
                'Emp ID': l.empId,
                'Name': l.name,
                'Leave Type': l.type.toUpperCase(),
                'Start Date': l.startDate,
                'End Date': l.endDate,
                'Start Time': l.startTime || '',
                'End Time': l.endTime || '',
                'Reason': l.reason,
                'YTD Leave Avail (At Request)': l.ytdLeaveAvail ?? '',
                'YTD Perm Avail (At Request)': l.ytdPermAvail ?? '',
                'Approval Status': l.status.toUpperCase(),
                'Reviewed By': l.reviewedByName || '',
                'Reviewer Role': l.reviewedByRole || '',
                'Reviewer Emp ID': l.reviewedByEmpId || '',
                'Reviewed At': l.reviewedAt || l.approvedAt || ''
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leaveRows), "Time_Off_Requests");

            const holidayRows = this.holidayList.map(h => ({
                'Holiday Name': h.name,
                'Date': h.date,
                'Applicable Department': h.dept
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(holidayRows), "Holiday_Calendar");

            const securityRows = [];
            const parseNetworkString = (str) => {
                if (!str) return { ip: 'N/A', geo: 'US/Unknown', os: 'N/A' };
                let ip = str.split(' | ')[0] || 'N/A';
                const os = str.split(' | OS: ')[1] || 'N/A';
                let geo = 'US (Assumed)';
                if (ip.includes('[🚨 Outside US:')) {
                    const match = ip.match(/\[🚨 Outside US: (.*?)\]/);
                    if (match) geo = match[1];
                    ip = ip.replace(/ \[🚨 Outside US: .*?\]/, '');
                }
                return { ip: ip.trim(), geo: geo.trim(), os: os.trim() };
            };
            Object.keys(this.punchLogs).sort().forEach(date => {
                Object.keys(this.punchLogs[date]).forEach(empId => {
                    const log = this.punchLogs[date][empId];
                    const mName = memberNameMap.get(empId) || 'Unknown';

                    if (log.in && log.in_ip) {
                        const parsedIn = parseNetworkString(log.in_ip);
                        securityRows.push({ 'Date': date, 'Emp ID': empId, 'Name': mName, 'Event': 'Punch In', 'Time': log.in, 'IP Address': parsedIn.ip, 'Location': parsedIn.geo, 'OS': parsedIn.os });
                    }
                    if (log.out && log.out_ip) {
                        const parsedOut = parseNetworkString(log.out_ip);
                        securityRows.push({ 'Date': date, 'Emp ID': empId, 'Name': mName, 'Event': 'Punch Out', 'Time': log.out, 'IP Address': parsedOut.ip, 'Location': parsedOut.geo, 'OS': parsedOut.os });
                    }
                    if (log.captchas && log.captchas.length > 0) {
                        log.captchas.forEach(cap => {
                            const parsedCap = parseNetworkString(cap.ip);
                            securityRows.push({ 'Date': date, 'Emp ID': empId, 'Name': mName, 'Event': `Captcha (${cap.status})`, 'Time': cap.time, 'IP Address': parsedCap.ip, 'Location': parsedCap.geo, 'OS': parsedCap.os });
                        });
                    }
                });
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(securityRows), "Security_Audit");

            const fileName = `RevCentric_DB_Snapshot_${getISTString()}.xlsx`;
            XLSX.writeFile(wb, fileName);
            this.showNote("Snapshot Downloaded Successfully", "success");
        },

        viewAsStaff(mId) {
            if (!this.hasAccess('members')) return;
            const member = this.members.find(m => m.id === mId);
            if (!member) return;

            this.clearCaptchaTimers();
            if (this.userSession && !this.originalAdminSession) {
                this.originalAdminSession = JSON.parse(JSON.stringify(this.userSession));
            }
            this.isImpersonating = true;
            this.userSession = JSON.parse(JSON.stringify(member));
            invalidateMemo();
            this.fetchExceptionHistory();
            this.view = 'portal';
            this.showNote(`Viewing portal as ${member.firstName} (Read-Only)`, "success");
        },

        closeStaffView() {
            this.clearCaptchaTimers();
            this.isImpersonating = false;

            if (this.originalAdminSession) {
                this.userSession = JSON.parse(JSON.stringify(this.originalAdminSession));
                this.originalAdminSession = null;
                invalidateMemo();
                this.fetchExceptionHistory();
                this.scheduleNextCaptcha();
            } else {
                this.userSession = null;
                invalidateMemo();
            }

            this.view = 'members';
            this.showNote("Returned to Admin Roster", "success");
        },

        hasAccess(menuId) {
            if (this.isAdminAuthenticated) return true;
            if (menuId === 'portal') return true;
            const actor = this.activeAuthSession;
            if (!actor) return false;

            const userRole = actor.role;
            const allowedMenus = this.roleAccess[userRole] || [];

            if (Object.keys(this.roleAccess).length === 0) {
                const rLower = (userRole || '').toLowerCase();
                if (rLower.includes('manager') || rLower.includes('lead') || rLower.includes('admin') || rLower.includes('hr')) return true;
            }

            return allowedMenus.includes(menuId) || allowedMenus.includes(`${menuId}_write`);
        },

        hasWriteAccess(menuId) {
            if (this.isAdminAuthenticated) return true;
            const actor = this.activeAuthSession;
            if (!actor) return false;

            const userRole = actor.role;
            const allowedMenus = this.roleAccess[userRole] || [];

            if (Object.keys(this.roleAccess).length === 0) {
                const rLower = (userRole || '').toLowerCase();
                if (rLower.includes('manager') || rLower.includes('lead') || rLower.includes('admin') || rLower.includes('hr')) return true;
            }

            return allowedMenus.includes(`${menuId}_write`);
        },

        toggleRoleAccess(role, menuId, isWrite = false) {
            if (!this.hasWriteAccess('master')) return this.showNote("Read-only access for Master Config", "error");
            if (!this.roleAccess[role]) this.roleAccess[role] = [];
            const accessKey = isWrite ? `${menuId}_write` : menuId;
            const idx = this.roleAccess[role].indexOf(accessKey);

            if (idx > -1) {
                this.roleAccess[role].splice(idx, 1);
                if (!isWrite) {
                    const writeIdx = this.roleAccess[role].indexOf(`${menuId}_write`);
                    if (writeIdx > -1) this.roleAccess[role].splice(writeIdx, 1);
                }
            } else {
                this.roleAccess[role].push(accessKey);
                if (isWrite && !this.roleAccess[role].includes(menuId)) {
                    this.roleAccess[role].push(menuId);
                }
            }

            this.roleAccess = { ...this.roleAccess };
            invalidateMemo();
            this.upsertConfigCloud('role_access', this.roleAccess);
        },

        openNewMemberForm() {
            if (!this.hasWriteAccess('members')) return this.showNote("Read-only access for Roster", "error");
            this.isAddingMember = true;
            this.isEditing = false;
            this.newMember = { empId: '', firstName: '', lastName: '', dept: 'General', role: 'Staff', shift: 'General Shift', allowedPL: 0, allowedSL: 0, allowedPerm: 0, doj: '', doe: '', dob: '', pin: '', captchaEnabled: false };
        },
        removeMember(id) {
            if (!this.hasWriteAccess('members')) return this.showNote("Read-only access for Roster", "error");
            this.memberToDelete = id;
            this.showDeleteModal = true;
        },
        async resetUserPin(id) {
            if (!this.hasWriteAccess('members')) return this.showNote("Read-only access for Roster", "error");
            const idx = this.members.findIndex(m => m.id === id);
            if (idx === -1) return;
            const member = this.members[idx];
            if (member.auth_id) {
                try {
                    const { error } = await this.supabase.functions.invoke('reset-member-pin', {
                        body: { memberId: member.id, authId: member.auth_id }
                    });
                    if (error) throw error;
                    this.members[idx].pin = '';
                    this.members[idx].auth_id = null;
                    this.members = [...this.members];
                    invalidateMemo();
                    this.showNote("User PIN & Auth reset successfully", "success");
                    return;
                } catch (e) {
                    console.warn("Edge function reset-member-pin failed or unavailable:", e);
                    return this.showNote("Deploy 'reset-member-pin' Edge Function to reset Auth-linked PINs.", "error");
                }
            }
            this.members[idx].pin = '';
            this.members = [...this.members];
            invalidateMemo();
            this.upsertMemberCloud(this.members[idx]);
            this.showNote("User security reset", "success");
        }
    };
};
