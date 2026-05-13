window.attendanceApp = () => {
    // FIXED STRICT IST HELPERS
    const getISTString = (date = new Date()) => {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(date);
    };

    const getISTDateObject = (date = new Date()) => {
        const s = getISTString(date);
        const[y, m, d] = s.split('-').map(Number);
        return new Date(y, m - 1, d);
    };

    const getISTTime24 = () => {
        const formatter = new Intl.DateTimeFormat('en-GB', { 
            timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false 
        });
        return formatter.format(new Date()); 
    };

    const generateSecureId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

    const initialToday = getISTString();
    const todayObj = getISTDateObject();
    const firstDayStr = getISTString(new Date(todayObj.getFullYear(), todayObj.getMonth(), 1));
    const lastDayStr = getISTString(new Date(todayObj.getFullYear(), todayObj.getMonth() + 1, 0));

    return {
        view: 'portal', 
        dashboardPeriod: 'month',
        portalPeriod: 'month', 
        filterName: '', 
        filterDept: '', 
        initialToday: initialToday,
        currentDate: initialToday,
        
        currentISTTimeWidget: '',
        currentISTDateWidget: '',
        liveShiftMins: 0,     
        liveActiveMins: 0,    

        isAdminAuthenticated: false,
        adminPinInput: '',
        masterPin: '000000', 
        newPinValue: '',

        userSession: null,
        userSyncChannel: null, 
        loginIdInput: '',
        loginPinInput: '',
        breakPinInput: '',
        loginStep: 'id', 
        tempUser: null,

        captchaTimer: null,
        captchaTimeoutTimer: null,
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
        idleTimer: null,

        summaryStartDate: firstDayStr,
        summaryEndDate: lastDayStr,

        autoExportEnabled: false,
        autoExportTime: '18:00',
        lastAutoExportDate: '',

        scopeStartStr: '',
        fetchedOldDates: new Set(),

        // SUPABASE CREDENTIALS
        supabaseUrl: 'https://lpthzknjzmxwukwpvhii.supabase.co',
        supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwdGh6a25qem14d3Vrd3B2aGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzczMDksImV4cCI6MjA5MDgxMzMwOX0.C3uuAVuw3kQWFYcwAFa37bTYbVGOC3DIAgqYpw2osbs',
        supabase: null,
        
        // APP STATE (Hydrated from Relational DB)
        members:[],
        attendanceData: {}, 
        punchLogs: {}, 
        ytdStats: {}, 
        userExceptionHistory:[], 
        leaveRequests:[], 
        roles:[],
        departments: [],
        shifts:[],
        holidayList:[],
        
        newRoleName: '',
        newDeptName: '',
        newShift: { name: '', inTime: '', outTime: '' },
        newHoliday: { name: '', date: '', dept: 'All' },
        isAddingMember: false,
        isEditing: false,
        isEditingLog: false,
        
        isSyncing: false,
        syncError: false,
        syncTimer: null,

        showDeleteModal: false,
        showLeaveModal: false,
        showNotifications: false,
        showLogoutModal: false,
        logoutTimePreview: '',
        editingLogId: null,
        tempPunches: { in: '', out: '' },
        deleteTarget: null, 
        memberToDelete: null,
        notification: null,

        newMember: { empId: '', firstName: '', lastName: '', dept: 'General', role: 'Staff', shift: 'General Shift', allowedPL: 0, allowedSL: 0, allowedPerm: 0, doj: '', doe: '', dob: '', pin: '', captchaEnabled: false },
        newLeave: { type: 'a', startDate: '', endDate: '', reason: '' },

        statusOptions:[
            { id: 'p', display: 'P', label: 'Present', color: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-500', hex: '#10b981' },
            { id: 'wfh', display: 'WFH', label: 'Work From Home', color: 'text-blue-700', bg: 'bg-blue-50', ring: 'ring-blue-500', hex: '#3b82f6', value: 1 },
            { id: '1p', display: '1P', label: '1HR Perm.', color: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-500', hex: '#f59e0b', value: 1 },
            { id: '2p', display: '2P', label: '2HRS Perm.', color: 'text-orange-700', bg: 'bg-orange-50', ring: 'ring-orange-500', hex: '#ea580c', value: 2 },
            { id: 'h', display: 'H', label: 'Half Day', color: 'text-sky-700', bg: 'bg-sky-50', ring: 'ring-sky-500', hex: '#0ea5e9', value: 0.5 },
            { id: 'fh', display: 'FH', label: 'Holiday', color: 'text-violet-700', bg: 'bg-violet-50', ring: 'ring-violet-500', hex: '#8b5cf6' },
            { id: 'a', display: 'A', label: 'Absent', color: 'text-red-700', bg: 'bg-red-50', ring: 'ring-red-500', hex: '#ef4444', value: 1 },
            { id: 'lop', display: 'LOP', label: 'Loss of Pay', color: 'text-rose-700', bg: 'bg-rose-50', ring: 'ring-rose-500', hex: '#f43f5e', value: 1 },
            { id: 'w', display: 'W', label: 'Weekend', color: 'text-slate-600', bg: 'bg-slate-100', ring: 'ring-slate-400', hex: '#64748b' },
            { id: 'co', display: 'CO', label: 'Comp Off', color: 'text-teal-700', bg: 'bg-teal-50', ring: 'ring-teal-500', hex: '#0f766e', value: 1 }
        ],

        menuItems:[
            { id: 'portal', label: 'Personnel', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' },
            { id: 'dashboard', label: 'Stats', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>', admin: true },
            { id: 'record', label: 'Log', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>', admin: true },
            { id: 'members', label: 'Roster', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>', admin: true },
            { id: 'summary', label: 'Reports', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>', admin: true },
            { id: 'master', label: 'Master', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>', admin: true },
            { id: 'import', label: 'Hub', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>', admin: true }
        ],

        init() {
            if ("Notification" in window && Notification.permission === "default") {
                Notification.requestPermission()
                    .then(permission => {
                        if (permission === "granted") {
                            console.log("Notifications enabled on launch.");
                        }
                    })
                    .catch(e => console.warn("Auto-prompt blocked:", e));
            }   

            this.userSession = null;
            this.supabase = supabase.createClient(this.supabaseUrl, this.supabaseKey);

            const todayRef = getISTDateObject();
            const initScopeDate = new Date(todayRef.getFullYear(), todayRef.getMonth(), todayRef.getDate() - 31);
            this.scopeStartStr = getISTString(initScopeDate);

            this.$watch('currentDate', (newDate) => {
                if (this.scopeStartStr && newDate < this.scopeStartStr && !this.fetchedOldDates.has(newDate)) {
                    this.fetchHistoricalDate(newDate);
                }
            });

            setInterval(() => {
                const now = new Date();
                this.currentISTTimeWidget = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
                }).format(now);
                this.currentISTDateWidget = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'Asia/Kolkata', weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                }).format(now);

                if (this.userSession) {
                    const dateKey = this.getActiveShiftDate();
                    const log = this.punchLogs[dateKey]?.[this.userSession.id];
                    if (log && log.in) {
                        const outTime = log.out || this.getCurrentTimeIST();
                        const grossMins = Math.max(0, this.diffInMins(log.in, outTime));
                        const breakMins = this.calculateTotalBreakMins(log.breaks);
                        this.liveShiftMins = grossMins;
                        this.liveActiveMins = Math.max(0, grossMins - breakMins);
                    } else {
                        this.liveShiftMins = 0;
                        this.liveActiveMins = 0;
                    }
                }
            }, 1000);
            
            this.syncInitialConfig();
            
            ['mousemove', 'keydown', 'mousedown', 'touchstart'].forEach(evt => {
                window.addEventListener(evt, () => this.resetIdleTimer());
            });

            window.addEventListener('focus', () => this.checkExpiredCaptchas());

            setInterval(() => {
                if (this.autoExportEnabled && this.autoExportTime) {
                    const todayStr = getISTString();
                    const istTimeStr = getISTTime24();
                    if (this.lastAutoExportDate !== todayStr && istTimeStr >= this.autoExportTime) {
                        this.executeFullSystemExport(true);
                        this.lastAutoExportDate = todayStr;
                        this.upsertConfigCloud('export_settings', { autoExportEnabled: true, autoExportTime: this.autoExportTime, lastAutoExportDate: todayStr });
                    }
                }
            }, 30000);

            try {
                const bc = new BroadcastChannel('revcentric_captcha');
                bc.onmessage = (e) => {
                    if (e.data?.type === 'CAPTCHA_TRIGGERED' && this.userSession && e.data.userId === this.userSession.id) {
                        try { window.focus(); } catch(err) {}
                        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
                    }
                };
            } catch(e) {}
        },

        setupUserRealtime() {
            if (this.userSyncChannel) {
                this.supabase.removeChannel(this.userSyncChannel);
                this.userSyncChannel = null;
            }

            if (!this.userSession && !this.isAdminAuthenticated) return;

            if (this.isManagerOrLead || this.isAdminAuthenticated) {
                this.userSyncChannel = this.supabase.channel('admin-tracking')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'punch_logs' }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'break_logs' }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'captcha_logs' }, p => this.handleRealtimePayload(p))
                    .subscribe();
            } 
            else {
                const myId = this.userSession.id;
                this.userSyncChannel = this.supabase.channel(`user-${myId}-tracking`)
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `member_id=eq.${myId}` }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'punch_logs', filter: `member_id=eq.${myId}` }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'break_logs', filter: `member_id=eq.${myId}` }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'captcha_logs', filter: `member_id=eq.${myId}` }, p => this.handleRealtimePayload(p))
                    .subscribe();
            }
        },

        handleRealtimePayload(payload) {
            if (this.isEditingLog || this.isAddingMember) return;

            const { table, eventType, new: newRec, old: oldRec } = payload;

            if (table === 'attendance') {
                if (eventType === 'INSERT' || eventType === 'UPDATE') {
                    if (!this.attendanceData[newRec.date]) this.attendanceData[newRec.date] = {};
                    this.attendanceData[newRec.date][newRec.member_id] = newRec.status;
                    this.attendanceData = { ...this.attendanceData }; 
                } else if (eventType === 'DELETE' && oldRec) {
                    if (this.attendanceData[oldRec.date] && this.attendanceData[oldRec.date][oldRec.member_id]) {
                        this.attendanceData[oldRec.date][oldRec.member_id] = '';
                        this.attendanceData = { ...this.attendanceData };
                    }
                }
            } 
            else if (table === 'punch_logs' && (eventType === 'INSERT' || eventType === 'UPDATE')) {
                if (!this.punchLogs[newRec.date]) this.punchLogs[newRec.date] = {};
                
                const existingBreaks = this.punchLogs[newRec.date][newRec.member_id]?.breaks ||[];
                const existingCaptchas = this.punchLogs[newRec.date][newRec.member_id]?.captchas ||[];

                this.punchLogs[newRec.date][newRec.member_id] = {
                    in: newRec.in_time || '', 
                    out: newRec.out_time || '',
                    breaks: existingBreaks, 
                    captchas: existingCaptchas
                };
                this.punchLogs = { ...this.punchLogs };
            }
            else if (table === 'break_logs' && (eventType === 'INSERT' || eventType === 'UPDATE')) {
                const date = newRec.log_date;
                const mId = newRec.member_id;

                if (!this.punchLogs[date]) this.punchLogs[date] = {};
                if (!this.punchLogs[date][mId]) this.punchLogs[date][mId] = { in: '', out: '', breaks:[], captchas:[] };

                let breaks = this.punchLogs[date][mId].breaks ||[];
                let breakIdx = breaks.findIndex(b => b.start === newRec.start_time);

                if (breakIdx !== -1) {
                    breaks[breakIdx].end = newRec.end_time || '';
                } else {
                    breaks.push({ start: newRec.start_time, end: newRec.end_time || '' });
                }

                this.punchLogs[date][mId].breaks = breaks;
                this.punchLogs = { ...this.punchLogs };
            }
            else if (table === 'captcha_logs' && (eventType === 'INSERT' || eventType === 'UPDATE')) {
                const date = newRec.log_date;
                const mId = newRec.member_id;

                if (!this.punchLogs[date]) this.punchLogs[date] = {};
                if (!this.punchLogs[date][mId]) this.punchLogs[date][mId] = { in: '', out: '', breaks:[], captchas:[] };

                let captchas = this.punchLogs[date][mId].captchas ||[];
                let capIdx = captchas.findIndex(c => c.time === newRec.check_time);

                if (capIdx !== -1) {
                    captchas[capIdx].status = newRec.status;
                } else {
                    captchas.push({ time: newRec.check_time, status: newRec.status });
                }

                this.punchLogs[date][mId].captchas = captchas;
                this.punchLogs = { ...this.punchLogs };

                if (this.userSession && this.userSession.id === mId && newRec.status === 'Pending' && eventType === 'INSERT') {
                    if (date === this.getActiveShiftDate()) {
                        this.triggerCaptcha(newRec.check_time);
                    }
                }
                
                if (this.userSession && this.userSession.id === mId && newRec.status === 'Missed' && eventType === 'UPDATE') {
                    if (this.showCaptchaModal && this.currentCaptchaTime === newRec.check_time) {
                        this.showCaptchaModal = false;
                        this.clearCaptchaTimers();
                        this.currentCaptchaTime = null;
                        this.showNote("System enforced timeout.", "error");
                    }
                }
            }
        },

        async upsertConfigCloud(key, value) {
            try { await this.supabase.from('system_config').upsert({ key, value }); } 
            catch(e) { console.error("Config save error", e); this.syncError = true; }
        },
        
        async upsertMemberCloud(m) {
            try {
                await this.supabase.from('members').upsert({
                    id: m.id, emp_id: m.empId, first_name: m.firstName, last_name: m.lastName,
                    dept: m.dept, role: m.role, shift: m.shift, pin: m.pin,
                    doj: m.doj || null, dob: m.dob || null,
                    allowed_pl: m.allowedPL, allowed_sl: m.allowedSL, allowed_perm: m.allowedPerm,
                    captcha_enabled: m.captchaEnabled
                });
            } catch(e) { console.error("Member save error", e); }
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
            } catch(e) { console.error("Attendance save error", e); }
        },

        async bulkUpsertAttCloud(recordsArray) {
            if (!recordsArray || recordsArray.length === 0) return;
            try {
                for (const rec of recordsArray) {
                    const { data, error } = await this.supabase.from('attendance')
                        .update({ status: rec.status })
                        .match({ date: rec.date, member_id: rec.member_id })
                        .select();
                        
                    if (!error && (!data || data.length === 0)) {
                        await this.supabase.from('attendance').insert(rec);
                    }
                }
            } catch(e) { console.error("Bulk Attendance save error", e); }
        },

        async upsertPunchCloud(date, mId) {
            try {
                const log = this.punchLogs[date]?.[mId];
                if (!log) return;
                
                const { data, error } = await this.supabase.from('punch_logs')
                    .update({ in_time: log.in || null, out_time: log.out || null, breaks: log.breaks ||[] })
                    .match({ date, member_id: mId })
                    .select();
                    
                if (!error && (!data || data.length === 0)) {
                    await this.supabase.from('punch_logs').insert({
                        date, member_id: mId, in_time: log.in || null, out_time: log.out || null, breaks: log.breaks ||[]
                    });
                }
            } catch(e) { console.error("Punch save error", e); }
        },

        async upsertLeaveCloud(req) {
            try {
                await this.supabase.from('leave_requests').upsert({
                    id: req.id, emp_id: req.empId, type: req.type, start_date: req.startDate, 
                    end_date: req.endDate, reason: req.reason, status: req.status
                });
            } catch(e) { console.error("Leave save error", e); }
        },

        async upsertHolidayCloud(h) {
            try { await this.supabase.from('holidays').upsert({ id: h.id, name: h.name, date: h.date, dept: h.dept }); } 
            catch(e) { console.error("Holiday save error", e); }
        },

        async syncInitialConfig() {
            this.isSyncing = true;
            try {
                const { data: cData } = await this.supabase.from('system_config').select('*');
                if (cData) {
                    cData.forEach(row => {
                        if(row.key === 'roles') this.roles = row.value;
                        if(row.key === 'departments') this.departments = row.value;
                        if(row.key === 'shifts') this.shifts = row.value;
                        if(row.key === 'master_pin') this.masterPin = row.value;
                        if(row.key === 'export_settings') {
                            this.autoExportEnabled = row.value.autoExportEnabled;
                            this.autoExportTime = row.value.autoExportTime;
                            this.lastAutoExportDate = row.value.lastAutoExportDate;
                        }
                    });
                }

                const { data: mData } = await this.supabase.from('members').select('id, emp_id, first_name, last_name, dept, role, shift, pin, captcha_enabled, doj, dob, allowed_pl, allowed_sl, allowed_perm');
                if (mData) {
                    this.members = mData.map(m => ({
                        id: m.id, empId: m.emp_id, firstName: m.first_name, lastName: m.last_name,
                        name: `${m.first_name} ${m.last_name || ''}`.trim(),
                        dept: m.dept, role: m.role, shift: m.shift, pin: m.pin,
                        doj: m.doj, dob: m.dob, allowedPL: m.allowed_pl, allowedSL: m.allowed_sl, 
                        allowedPerm: m.allowed_perm, captchaEnabled: m.captcha_enabled
                    }));
                    this.members.sort((a, b) => a.empId.localeCompare(b.empId, undefined, { numeric: true, sensitivity: 'base' }));
                }
                this.syncError = false;
            } catch (e) {
                console.error("Initial Config Pull Error:", e);
                this.syncError = true;
            } finally {
                this.isSyncing = false;
            }
        },

        async syncUserData(silent = false) {
            this.isSyncing = true;
            try {
                const { data: lData } = await this.supabase.from('leave_requests').select('*');
                if (lData) {
                    this.leaveRequests = lData.map(l => ({
                        id: l.id, empId: l.emp_id, type: l.type, startDate: l.start_date, 
                        endDate: l.end_date, reason: l.reason, status: l.status, name: this.members.find(m => m.id === l.emp_id)?.name || ''
                    }));
                }

                const { data: hData } = await this.supabase.from('holidays').select('*');
                if (hData) {
                    this.holidayList = hData;
                }

                let ytdQuery = this.supabase.from('member_ytd_stats').select('*');
                let attQuery = this.supabase.from('attendance').select('*').gte('date', this.scopeStartStr);
                let punchQuery = this.supabase.from('punch_logs').select('*').gte('date', this.scopeStartStr);
                let breakQuery = this.supabase.from('break_logs').select('*').gte('log_date', this.scopeStartStr);
                let capQuery = this.supabase.from('captcha_logs').select('*').gte('log_date', this.scopeStartStr);

                if (!this.isAdminAuthenticated && !this.isManagerOrLead) {
                    const myId = this.userSession.id;
                    ytdQuery = ytdQuery.eq('member_id', myId);
                    attQuery = attQuery.eq('member_id', myId);
                    punchQuery = punchQuery.eq('member_id', myId);
                    breakQuery = breakQuery.eq('member_id', myId);
                    capQuery = capQuery.eq('member_id', myId);
                }

                const[ { data: vData }, { data: aData }, { data: pData }, { data: bData }, { data: capData } ] = await Promise.all([
                    ytdQuery, attQuery, punchQuery, breakQuery, capQuery
                ]);

                let newYtdStats = {};
                if (vData) {
                    vData.forEach(row => {
                        newYtdStats[row.member_id] = { leaves: row.ytd_leaves || 0, compOffs: row.ytd_comp_off || 0, permHours: row.ytd_perm_hours_used || 0 };
                    });
                }
                this.ytdStats = newYtdStats;

                let newAtt = {};
                if (aData) {
                    aData.forEach(r => {
                        if(!newAtt[r.date]) newAtt[r.date] = {};
                        newAtt[r.date][r.member_id] = r.status;
                    });
                }
                this.attendanceData = newAtt;

                let newPunch = {};
                if (pData) {
                    pData.forEach(r => {
                        if(!newPunch[r.date]) newPunch[r.date] = {};
                        newPunch[r.date][r.member_id] = { in: r.in_time || '', out: r.out_time || '', breaks: [], captchas:[] };
                    });
                }
                if (bData) {
                    bData.forEach(b => {
                        if (!newPunch[b.log_date]) newPunch[b.log_date] = {};
                        if (!newPunch[b.log_date][b.member_id]) newPunch[b.log_date][b.member_id] = { in: '', out: '', breaks: [], captchas:[] };
                        newPunch[b.log_date][b.member_id].breaks.push({ start: b.start_time, end: b.end_time || '' });
                    });
                }
                if (capData) {
                    capData.forEach(c => {
                        if (!newPunch[c.log_date]) newPunch[c.log_date] = {};
                        if (!newPunch[c.log_date][c.member_id]) newPunch[c.log_date][c.member_id] = { in: '', out: '', breaks:[], captchas:[] };
                        if (!newPunch[c.log_date][c.member_id].captchas) newPunch[c.log_date][c.member_id].captchas = [];
                        newPunch[c.log_date][c.member_id].captchas.push({ time: c.check_time, status: c.status });
                    });
                }
                this.punchLogs = newPunch;

                if (this.userSession && !this.members.find(m => m.id === this.userSession.id)) {
                    this.logoutUser();
                }
                
                this.checkExpiredCaptchas();
                
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
                const { data: aData } = await this.supabase.from('attendance').select('*').eq('date', targetDate);
                if (aData) {
                    if (!this.attendanceData[targetDate]) this.attendanceData[targetDate] = {};
                    aData.forEach(r => {
                        this.attendanceData[targetDate][r.member_id] = r.status;
                    });
                    this.attendanceData = { ...this.attendanceData }; 
                }

                const { data: pData } = await this.supabase.from('punch_logs').select('*').eq('date', targetDate);
                const { data: bData } = await this.supabase.from('break_logs').select('*').eq('log_date', targetDate);
                const { data: capData } = await this.supabase.from('captcha_logs').select('*').eq('log_date', targetDate);
                
                if (!this.punchLogs[targetDate]) this.punchLogs[targetDate] = {};

                if (pData) {
                    pData.forEach(r => {
                        this.punchLogs[targetDate][r.member_id] = { 
                            in: r.in_time || '', out: r.out_time || '', breaks: [], captchas:[] 
                        };
                    });
                }
                
                if (bData) {
                    bData.forEach(b => {
                        if (!this.punchLogs[targetDate][b.member_id]) this.punchLogs[targetDate][b.member_id] = { in: '', out: '', breaks: [], captchas:[] };
                        this.punchLogs[targetDate][b.member_id].breaks.push({ start: b.start_time, end: b.end_time || '' });
                    });
                }

                if (capData) {
                    capData.forEach(c => {
                        if (!this.punchLogs[targetDate][c.member_id]) this.punchLogs[targetDate][c.member_id] = { in: '', out: '', breaks:[], captchas: [] };
                        if (!this.punchLogs[targetDate][c.member_id].captchas) this.punchLogs[targetDate][c.member_id].captchas =[];
                        this.punchLogs[targetDate][c.member_id].captchas.push({ time: c.check_time, status: c.status });
                    });
                }

                this.punchLogs = { ...this.punchLogs }; 
                this.showNote(`Historical log loaded for ${this.formatDate(targetDate)}`, "success");
            } catch(e) { 
                console.error("Historical Pull Error:", e); 
                this.fetchedOldDates.delete(targetDate);
                this.showNote("Failed to load historical data", "error");
            } finally { 
                this.isSyncing = false; 
            }
        },

        toggleCaptcha() {
            if (!this.userSession) return;
            const idx = this.members.findIndex(m => m.id === this.userSession.id);
            if (idx > -1) {
                const current = !!this.members[idx].captchaEnabled;
                this.members[idx].captchaEnabled = !current;
                this.userSession.captchaEnabled = !current;
                
                this.upsertMemberCloud(this.members[idx]); 

                if (this.userSession.captchaEnabled) {
                    if ("Notification" in window && Notification.permission !== "granted") Notification.requestPermission();
                    this.scheduleNextCaptcha();
                    this.showNote("Verification Mode Enabled", "success");
                } else {
                    this.clearCaptchaTimers();
                    this.showNote("Verification Mode Disabled", "success");
                }
            }
        },

        clearCaptchaTimers() {
            if (this.captchaTimer) { clearTimeout(this.captchaTimer); this.captchaTimer = null; }
            if (this.captchaTimeoutTimer) { clearTimeout(this.captchaTimeoutTimer); this.captchaTimeoutTimer = null; }

            if (this._captchaAudio) {
                try { this._captchaAudio.pause(); this._captchaAudio.currentTime = 0; } catch(e) {}
                this._captchaAudio = null;
            }

            try { if (navigator.vibrate) navigator.vibrate(0); } catch(e) {}

            if (this._captchaVisibilityHandler) {
                document.removeEventListener('visibilitychange', this._captchaVisibilityHandler);
                window.removeEventListener('focus', this._captchaVisibilityHandler);
                this._captchaVisibilityHandler = null;
            }

            try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch(e) {}

            if (this.titleFlashInterval) {
                clearInterval(this.titleFlashInterval);
                this.titleFlashInterval = null;
                document.title = "RevCentric Solutions";
            }
        },

        scheduleNextCaptcha() {
            this.clearCaptchaTimers();
            if (!this.userSession || !this.userSession.captchaEnabled || this.userOnBreak) return;
            const activeDate = this.getActiveShiftDate();
            const log = this.punchLogs[activeDate]?.[this.userSession.id];
            if (!log || !log.in || log.out) return;
            const minMs = 20 * 60 * 1000;
            const maxMs = 35 * 60 * 1000;
            const interval = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
            this.captchaTimer = setTimeout(() => {
                const currentLog = this.punchLogs[this.getActiveShiftDate()]?.[this.userSession?.id];
                if (this.userSession && this.userSession.captchaEnabled && !this.userOnBreak && currentLog?.in && !currentLog?.out) {
                    this.triggerCaptcha();
                }
            }, interval);
        },

        triggerCaptcha(forceTime = null) {
            this.checkExpiredCaptchas();
            
            if (!this.userSession) return;
            
            if (!forceTime && !this.userSession.captchaEnabled) return;
            if (!forceTime && this.userOnBreak) return;
            
            const _guardDate = this.getActiveShiftDate();
            const _guardLog = this.punchLogs[_guardDate]?.[this.userSession.id];
            if (!forceTime && (!_guardLog?.in || _guardLog?.out)) return;

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
                        vibrate:[300, 100, 300, 100, 300],
                        tag: "captcha-alert",
                        renotify: true
                    });
                } catch(e) {}
            }

            try { window.focus(); } catch(e) {}

            try {
                const el = document.documentElement;
                if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
                else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            } catch(e) {}

            try {
                this._captchaAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                this._captchaAudio.loop = true;
                this._captchaAudio.volume = 1.0;
                this._captchaAudio.play().catch(() => {
                    const unlockAudio = () => {
                        this._captchaAudio?.play().catch(() => {});
                        document.removeEventListener('click', unlockAudio);
                        document.removeEventListener('keydown', unlockAudio);
                    };
                    document.addEventListener('click', unlockAudio, { once: true });
                    document.addEventListener('keydown', unlockAudio, { once: true });
                });
            } catch(e) {}

            try {
                if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500, 200, 1000]);
            } catch(e) {}

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
            } catch(e) {}

            this._captchaVisibilityHandler = () => {
                if (!document.hidden && this.showCaptchaModal) {
                    try { window.focus(); } catch(e) {}
                    setTimeout(() => {
                        const el = document.querySelector('[x-ref="captchaInputRef"]') ||
                                   document.getElementById('captcha-input-field');
                        if (el) el.focus();
                    }, 100);
                }
            };
            document.addEventListener('visibilitychange', this._captchaVisibilityHandler);
            window.addEventListener('focus', this._captchaVisibilityHandler);

            this.captchaTimeoutTimer = setTimeout(() => {
                this.handleCaptchaTimeout();
            }, 120000);
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
                this.startBreak();
            }
        },

        handleCaptchaTimeout() {
            if (!this.showCaptchaModal) return;
            this.showCaptchaModal = false;
            this.clearCaptchaTimers();
            
            this.recordCaptchaResult('Missed');
            this.currentCaptchaTime = null;
            
            this.showNote("Verification Missed. Auto-initiating break.", "error");
            this.startBreak();
        },

        async recordCaptchaResult(status, timeOverride = null) {
            if (!this.userSession) return;
            const activeDate = this.getActiveShiftDate();
            const uId = this.userSession.id;
            const checkTime = timeOverride || this.currentCaptchaTime || this.getCurrentTimeIST();
            
            if (!this.punchLogs[activeDate]) this.punchLogs[activeDate] = {};
            if (!this.punchLogs[activeDate][uId]) this.punchLogs[activeDate][uId] = { in: '', out: '', breaks:[], captchas:[] };
            if (!this.punchLogs[activeDate][uId].captchas) this.punchLogs[activeDate][uId].captchas = [];
            
            const existingIdx = this.punchLogs[activeDate][uId].captchas.findIndex(c => c.time === checkTime);
            if (existingIdx > -1) {
                this.punchLogs[activeDate][uId].captchas[existingIdx].status = status;
            } else {
                this.punchLogs[activeDate][uId].captchas.push({ time: checkTime, status: status });
            }
            this.punchLogs = { ...this.punchLogs };
            
            try {
                if (status === 'Pending') {
                    await this.supabase.from('captcha_logs').insert({
                        member_id: uId, log_date: activeDate, check_time: checkTime, status: status
                    });
                } else {
                    await this.supabase.from('captcha_logs')
                        .update({ status: status })
                        .match({ member_id: uId, log_date: activeDate, check_time: checkTime });
                }
            } catch(e) { console.error("Captcha log error", e); }
        },

        async forceCaptcha(mId) {
            if (!this.isAdminAuthenticated && !this.isManagerOrLead) return;
            const checkTime = this.getCurrentTimeIST();
            
            const todayStr = getISTString();
            
            const yDate = getISTDateObject();
            yDate.setDate(yDate.getDate() - 1);
            const yesterdayStr = getISTString(yDate);

            let dateKey = this.currentDate;

            if (this.punchLogs[yesterdayStr]?.[mId]?.in && !this.punchLogs[yesterdayStr]?.[mId]?.out) {
                dateKey = yesterdayStr;
            } 
            else if (this.punchLogs[todayStr]?.[mId]?.in && !this.punchLogs[todayStr]?.[mId]?.out) {
                dateKey = todayStr;
            }
            
            if (!this.punchLogs[dateKey]) this.punchLogs[dateKey] = {};
            if (!this.punchLogs[dateKey][mId]) this.punchLogs[dateKey][mId] = { in: '', out: '', breaks:[], captchas:[] };
            if (!this.punchLogs[dateKey][mId].captchas) this.punchLogs[dateKey][mId].captchas = [];
            
            const exists = this.punchLogs[dateKey][mId].captchas.find(c => c.time === checkTime);
            if (!exists) {
                this.punchLogs[dateKey][mId].captchas.push({ time: checkTime, status: 'Pending' });
                this.punchLogs = { ...this.punchLogs };
            }

            try {
                await this.supabase.from('captcha_logs').insert({
                    member_id: mId, log_date: dateKey, check_time: checkTime, status: 'Pending'
                });
                this.showNote(`Verification Forced on ${dateKey} log`, "success");
            } catch(e) {
                console.error(e);
                this.showNote("Failed to force verify", "error");
            }
        },

        get isManagerOrLead() {
            if (!this.userSession) return false;
            const r = (this.userSession.role || '').toLowerCase();
            return r.includes('manager') || r.includes('lead') || r.includes('admin') || r.includes('hr');
        },
        get activeTeamOnBreak() {
            if (!this.isManagerOrLead) return[];
            const activeDate = this.getActiveShiftDate();
            return this.members.filter(m => this.isMemberOnBreak(m.id, activeDate));
        },
        get pendingLeaveCount() { return this.leaveRequests.filter(r => r.status === 'pending').length; },
        get upcomingHolidays() {
            const istRef = getISTDateObject();
            istRef.setDate(istRef.getDate() + 1); 
            const tomorrowStr = getISTString(istRef);
            return this.holidayList.filter(h => h.date === tomorrowStr && (h.dept === 'All' || h.dept === this.userSession?.dept));
        },
        
        get todayEvents() {
            const curM = getISTDateObject().getMonth() + 1, curD = getISTDateObject().getDate();
            const events =[];
            this.members.forEach(m => {
                if (m.dob && parseInt(m.dob.split('-')[1]) === curM && parseInt(m.dob.split('-')[2]) === curD) events.push({ id: 'bday_'+m.id, type: 'birthday', member: m, title: 'Birthday', icon: '🎂', color: 'text-pink-600', bg: 'bg-pink-100' });
                if (m.doj && parseInt(m.doj.split('-')[1]) === curM && parseInt(m.doj.split('-')[2]) === curD) {
                    const yrs = getISTDateObject().getFullYear() - parseInt(m.doj.split('-')[0]);
                    events.push({ id: 'annv_'+m.id, type: 'anniversary', member: m, title: yrs > 0 ? `Anniversary (${yrs} Yr)` : 'Joined Today!', icon: yrs > 0 ? '🎊' : '🎉', color: yrs > 0 ? 'text-emerald-600' : 'text-indigo-600', bg: yrs > 0 ? 'bg-emerald-100' : 'bg-indigo-100' });
                }
            });
            return events;
        },
        get userOnBreak() {
            if (!this.userSession) return false;
            const breaks = this.punchLogs[this.getActiveShiftDate()]?.[this.userSession.id]?.breaks;
            return breaks && breaks.length > 0 && !breaks[breaks.length - 1].end;
        },
        isMemberOnBreak(mId, dateKey) {
            const breaks = this.punchLogs[dateKey]?.[mId]?.breaks;
            return breaks && breaks.length > 0 && !breaks[breaks.length - 1].end;
        },

        submitLeave() {
            if (!this.newLeave.startDate || !this.newLeave.endDate) return this.showNote("Dates missing", "error");
            const req = {
                id: generateSecureId(), empId: this.userSession.empId, name: this.userSession.name,
                type: this.newLeave.type, startDate: this.newLeave.startDate, endDate: this.newLeave.endDate,
                reason: this.newLeave.reason, status: 'pending'
            };
            this.leaveRequests.unshift(req);
            this.upsertLeaveCloud(req);
            this.showLeaveModal = false;
            this.newLeave = { type: 'a', startDate: '', endDate: '', reason: '' };
            this.showNote("Leave Request Forwarded", "success");
        },

        approveLeave(reqId) {
            const req = this.leaveRequests.find(r => r.id === reqId);
            if (!req) return;
            req.status = 'approved';
            this.upsertLeaveCloud(req); 

            for (let d = new Date(req.startDate); d <= new Date(req.endDate); d.setDate(d.getDate() + 1)) {
                const dStr = getISTString(d);
                if (!this.attendanceData[dStr]) this.attendanceData[dStr] = {};
                this.attendanceData[dStr][req.empId] = req.type;
                this.upsertAttCloud(dStr, req.empId, req.type); 
            }
            this.attendanceData = { ...this.attendanceData }; 
            this.showNote(`Approved leave for ${req.name}`);
        },

        rejectLeave(reqId) {
            const req = this.leaveRequests.find(r => r.id === reqId);
            if (req) {
                req.status = 'rejected';
                this.upsertLeaveCloud(req); 
                this.showNote(`Rejected leave for ${req.name}`, "error");
            }
        },

        processAutoHolidays() {
            const bulkRecords =[];
            this.holidayList.forEach(h => {
                this.members.forEach(m => {
                    if (h.dept === 'All' || h.dept === m.dept) {
                        if (!this.attendanceData[h.date]?.[m.id]) {
                            if(!this.attendanceData[h.date]) this.attendanceData[h.date] = {};
                            this.attendanceData[h.date][m.id] = 'fh';
                            bulkRecords.push({ date: h.date, member_id: m.id, status: 'fh' });
                        }
                    }
                });
            });
            if (bulkRecords.length > 0) {
                this.attendanceData = { ...this.attendanceData }; 
                this.bulkUpsertAttCloud(bulkRecords);
            }
        },

        addHoliday() {
            if (!this.newHoliday.name || !this.newHoliday.date) return this.showNote("Invalid Details", "error");
            const h = { ...this.newHoliday, id: generateSecureId() };
            this.holidayList.push(h);
            this.upsertHolidayCloud(h); 
            this.newHoliday = { name: '', date: '', dept: 'All' };
            this.showNote("Holiday Processed Successfully");
        },

        async removeHoliday(id) {
            this.holidayList = this.holidayList.filter(h => h.id !== id);
            try { await this.supabase.from('holidays').delete().eq('id', id); } catch(e){}
        },

        getCurrentTimeIST() {
            return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date());
        },
        formatTimeDisplay(time24) {
            if (!time24) return '--:--';
            const[h, m] = time24.split(':');
            let hNum = parseInt(h, 10);
            const ampm = hNum >= 12 ? 'PM' : 'AM';
            return `${(hNum % 12 || 12).toString().padStart(2, '0')}:${m} ${ampm}`;
        },
        formatHoursDecimal(mins) { return (!mins || mins <= 0) ? '0.00 Hrs' : (mins / 60).toFixed(2) + ' Hrs'; },

        getActiveShiftDate() {
            if (!this.userSession) return getISTString();
            const shiftName = this.userSession.shift || '';
            const shiftObj = this.shifts.find(s => s.name === shiftName) || {};
            const currentHourIST = parseInt(getISTTime24().split(':')[0], 10);
            let isNightShift = shiftObj.inTime && shiftObj.outTime ? (shiftObj.inTime > shiftObj.outTime) : shiftName.toLowerCase().includes('night');
            
            if (isNightShift && currentHourIST < 14) {
                const y = getISTDateObject(); y.setDate(y.getDate() - 1); return getISTString(y);
            } else if (!isNightShift && currentHourIST < 5) {
                const y = getISTDateObject(); y.setDate(y.getDate() - 1); 
                if (this.punchLogs[getISTString(y)]?.[this.userSession.id]?.in && !this.punchLogs[getISTString(y)]?.[this.userSession.id]?.out) return getISTString(y);
            }
            return getISTString();
        },

        resetIdleTimer() {
            if (this.idleTimer) clearTimeout(this.idleTimer);
            
            const monitorAdmin = this.isAdminAuthenticated;
            const monitorUser = this.userSession && !this.userSession.captchaEnabled && !this.userOnBreak;

            if (monitorAdmin || monitorUser) {
                this.idleTimer = setTimeout(() => { 
                    if (this.isAdminAuthenticated) { 
                        this.logoutAdmin(); 
                        this.showNote("Vault auto-locked due to inactivity", "error"); 
                    }
                    if (this.userSession && !this.userSession.captchaEnabled && !this.userOnBreak) {
                        this.logoutUser(); 
                        this.showNote("Session expired due to inactivity", "error");
                    }
                }, this.idleTimeout); 
            }
        },

        checkExpiredCaptchas() {
            const now = this.getCurrentTimeIST();
            let updated = false;

            if (this.userSession) {
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
                                this.startBreak(cap.time); 
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
                                    
                                    const breaks = log.breaks ||[];
                                    if (breaks.length === 0 || breaks[breaks.length - 1].end !== '') {
                                        breaks.push({ start: cap.time, end: '' });
                                        this.supabase.from('break_logs').insert({
                                            member_id: mId, log_date: checkDate, start_time: cap.time
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
            }
        },

        async startBreak(timeOverride = null) {
            if (!this.userSession) return;
            this.clearCaptchaTimers();
            const activeDate = this.getActiveShiftDate();
            const uId = this.userSession.id;
            
            const startTime = (typeof timeOverride === 'string') ? timeOverride : this.getCurrentTimeIST();

            if (!this.punchLogs[activeDate]) this.punchLogs[activeDate] = {};
            if (!this.punchLogs[activeDate][uId]) this.punchLogs[activeDate][uId] = { in: '', out: '', breaks:[], captchas:[] };
            if (!this.punchLogs[activeDate][uId].breaks) this.punchLogs[activeDate][uId].breaks =[];
            
            const breaks = this.punchLogs[activeDate][uId].breaks;
            
            if (breaks.length > 0 && !breaks[breaks.length - 1].end) {
                if (timeOverride) {
                    breaks[breaks.length - 1].start = startTime;
                    try {
                        await this.supabase.from('break_logs').update({ start_time: startTime })
                            .match({ member_id: uId, log_date: activeDate }).is('end_time', null);
                    } catch(e) {}
                }
            } else {
                breaks.push({ start: startTime, end: '' });
                try {
                    await this.supabase.from('break_logs').insert({
                        member_id: uId, log_date: activeDate, start_time: startTime
                    });
                } catch(e) { console.error("Break start error", e); }
            }
            
            this.punchLogs = { ...this.punchLogs };
            this.breakPinInput = '';
            
            this.showNote(timeOverride ? "Penalty Break Retroactively Applied" : "Break Started & Tool Locked", "error");
            try { const elem = document.documentElement; if (elem.requestFullscreen) elem.requestFullscreen().catch(e=>e); } catch(e) {}
            setTimeout(() => { const el = document.getElementById('break-pin-input'); if(el) el.focus(); }, 100);
        },

        handleBreakUnlock() {
            if (this.breakPinInput === this.userSession.pin) {
                this.endBreak();
                this.breakPinInput = '';
                try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(e=>e); } catch(e){}
            } else {
                this.showNote("Invalid PIN.", "error"); this.breakPinInput = '';
            }
        },

        async endBreak() {
            if (!this.userSession) return;
            const activeDate = this.getActiveShiftDate();
            const uId = this.userSession.id;
            const breaks = this.punchLogs[activeDate]?.[uId]?.breaks;
            const endTime = this.getCurrentTimeIST();

            if (breaks && breaks.length > 0 && !breaks[breaks.length - 1].end) {
                breaks[breaks.length - 1].end = endTime;
                this.punchLogs = { ...this.punchLogs };
                
                try {
                    await this.supabase.from('break_logs')
                        .update({ end_time: endTime })
                        .match({ member_id: uId, log_date: activeDate })
                        .is('end_time', null); 
                } catch(e) { console.error("Break end error", e); }
                
                this.showNote("Break Ended", "success");
                
                this.scheduleNextCaptcha();
            }
        },

        diffInMins(t1, t2) {
            if(!t1 || !t2) return 0;
            const p = (str) => {
                const m = str.match(/(\d+):(\d+)\s*(AM|PM)/i);
                if(!m) return null;
                let h = parseInt(m[1], 10);
                if(m[3].toUpperCase() === 'PM' && h < 12) h += 12;
                if(m[3].toUpperCase() === 'AM' && h === 12) h = 0;
                const d = new Date(); d.setHours(h, parseInt(m[2], 10), 0, 0); return d;
            };
            const d1 = p(t1), d2 = p(t2);
            if (!d1 || !d2) return 0;
            let diff = (d2 - d1) / 60000;
            return Math.floor(diff < 0 ? diff + 1440 : diff);
        },
        calculateTotalBreakMins(breaks) {
            if (!breaks || !breaks.length) return 0;
            const now = this.getCurrentTimeIST();
            return breaks.reduce((acc, b) => acc + this.diffInMins(b.start, b.end || now), 0);
        },
        getActiveMinsForLog(log, dateKey) {
            if (!log || !log.in) return 0;
            const outTime = log.out || (dateKey === getISTString() ? this.getCurrentTimeIST() : null);
            if (!outTime) return 0;
            return Math.max(0, this.diffInMins(log.in, outTime) - this.calculateTotalBreakMins(log.breaks));
        },

        formatBreakDisplay(mins) {
            if (!mins || mins <= 0) return '0m';
            return Math.floor(mins/60) > 0 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`;
        },
        formatClockDisplay(mins) {
            if (!mins || mins <= 0) return '00:00';
            const h = Math.floor(mins / 60).toString().padStart(2, '0');
            const m = (mins % 60).toString().padStart(2, '0');
            return `${h}:${m}`;
        },

        get dashboardStats() {
            const dates = this.getFilteredDatesByPeriod(this.dashboardPeriod);
            const totals = {};
            this.statusOptions.forEach(o => totals[o.id] = 0);
            dates.forEach(dk => {
                this.filteredMembers.forEach(m => { if(this.attendanceData[dk]?.[m.id]) totals[this.attendanceData[dk][m.id]]++; });
            });
            return { totals, grandTotal: Object.values(totals).reduce((a, b) => a + b, 0) };
        },

        get individualStats() {
            if (!this.userSession) return null;
            const user = this.members.find(m => m.id === this.userSession.id) || this.userSession;
            const id = user.id, curRef = getISTDateObject(), curY = curRef.getFullYear(), curM = curRef.getMonth() + 1, curD = curRef.getDate();
            const stats = { periodTotals: {}, history:[] };
            this.statusOptions.forEach(opt => stats.periodTotals[opt.id] = 0);

            for (let i = 0; i < 15; i++) {
                const day = getISTDateObject(); day.setDate(day.getDate() - i);
                const dk = getISTString(day);
                const sObj = this.statusOptions.find(s => s.id === this.attendanceData[dk]?.[id]) || { id: '-', label: 'Unrecorded', color: 'text-zinc-400', bg: 'bg-zinc-100/50', display: '-' };
                stats.history.push({ date: dk, label: day.toLocaleDateString('en-US', {month:'short', day:'numeric', weekday:'short'}), status: sObj, punch: this.punchLogs[dk]?.[id] || {} });
            }

            let mtd = { p:0, lv:0, prm:0, lop:0, activeMins:0, breakMins:0, daysPunched:0 };
            let ytd = { lv:0, prm:0, co:0, activeMins:0, breakMins:0, daysPunched:0 };

            Object.keys(this.attendanceData).forEach(dk => {
                const s = this.attendanceData[dk][id];
                if (!s) return;
                const[dy, dm] = dk.split('-').map(Number);
                if (dy === curY) {
                    if (s === 'co') ytd.co += 1;
                    if (s === 'a') ytd.lv += 1; if (s === 'h') ytd.lv += 0.5;
                    if (s === '1p') ytd.prm += 1; if (s === '2p') ytd.prm += 2;
                    if (dm === curM) {
                        if (['p','wfh','1p','2p','co'].includes(s)) mtd.p += 1;
                        if (s === 'h') { mtd.p += 0.5; mtd.lv += 0.5; }
                        if (s === 'a') mtd.lv += 1;
                        if (s === 'lop') mtd.lop += 1;
                    }
                }
            });

            Object.keys(this.punchLogs).forEach(dk => {
                const log = this.punchLogs[dk]?.[id];
                if (!log || !log.in) return;
                const[dy, dm] = dk.split('-').map(Number);
                if (dy === curY) {
                    ytd.breakMins += this.calculateTotalBreakMins(log.breaks);
                    ytd.activeMins += this.getActiveMinsForLog(log, dk);
                    ytd.daysPunched++;
                    if (dm === curM) {
                        mtd.breakMins += this.calculateTotalBreakMins(log.breaks);
                        mtd.activeMins += this.getActiveMinsForLog(log, dk);
                        mtd.daysPunched++;
                    }
                }
            });

            const dbYTD = this.ytdStats[id] || { leaves: 0, compOffs: 0, permHours: 0 };

            return {
                ...stats,
                isAnniversary: user.doj && user.doj.split('-')[1] == curM && user.doj.split('-')[2] == curD,
                isBirthday: user.dob && user.dob.split('-')[1] == curM && user.dob.split('-')[2] == curD,
                holidays: this.holidayList.filter(h => h.dept === 'All' || h.dept === user.dept),
                metrics: {
                    presentMTD: mtd.p, 
                    lvMTD: mtd.lv, 
                    plAllowed: user.allowedPL || 0, 
                    slAllowed: user.allowedSL || 0, 
                    
                    coEarned: dbYTD.compOffs,
                    lvAvailYTD: ((user.allowedPL||0) + dbYTD.compOffs + (user.allowedSL||0)) - dbYTD.leaves,
                    prmAvailYTD: ((user.allowedPerm||0) * curM) - dbYTD.permHours, 
                    prmUsedYTD: dbYTD.permHours, 
                    
                    lopMTD: mtd.lop,
                    avgActiveMTD: mtd.daysPunched ? Math.floor(mtd.activeMins/mtd.daysPunched) : 0,
                    avgBreakMTD: mtd.daysPunched ? Math.floor(mtd.breakMins/mtd.daysPunched) : 0,
                    avgActiveYTD: ytd.daysPunched ? Math.floor(ytd.activeMins/ytd.daysPunched) : 0,
                    avgBreakYTD: ytd.daysPunched ? Math.floor(ytd.breakMins/ytd.daysPunched) : 0
                }
            };
        },

        get rangeSummaryData() {
            const sDate = this.summaryStartDate, eDate = this.summaryEndDate;
            const endY = eDate ? parseInt(eDate.split('-')[0]) : getISTDateObject().getFullYear();
            const endM = eDate ? parseInt(eDate.split('-')[1]) : (getISTDateObject().getMonth() + 1);

            return this.filteredMembers.map(m => {
                let d = { presentMTD:0, absentMTD:0, halfMTD:0, prmHrsMTD:0, lopMTD:0, holidayMTD:0, lvYTD:0, prmYTDUsed:0, avgActiveMTD:0, avgBreakMTD:0, avgActiveYTD:0, avgBreakYTD:0 };
                let ytd={ act:0, brk:0, days:0 }, mtd={ act:0, brk:0, days:0 };

                Object.keys(this.attendanceData).forEach(dk => {
                    const s = this.attendanceData[dk]?.[m.id];
                    if (!s) return;
                    const [y, mm] = dk.split('-').map(Number);
                    if (dk >= sDate && dk <= eDate) {
                        if (s === 'p' || s === 'wfh') d.presentMTD += 1;
                        if (s === 'a') d.absentMTD += 1;
                        if (s === 'h') { d.halfMTD += 1; d.presentMTD += 0.5; }
                        if (s === '1p') { d.presentMTD += 1; d.prmHrsMTD += 1; }
                        if (s === '2p') { d.presentMTD += 1; d.prmHrsMTD += 2; }
                        if (s === 'lop') d.lopMTD += 1; 
                        if (s === 'fh') d.holidayMTD += 1;
                    }
                });

                Object.keys(this.punchLogs).forEach(dk => {
                    const log = this.punchLogs[dk]?.[m.id];
                    if (!log || !log.in) return;
                    const [y, mm] = dk.split('-').map(Number);
                    if (y === endY && dk <= eDate) {
                        ytd.act += this.getActiveMinsForLog(log, dk); ytd.brk += this.calculateTotalBreakMins(log.breaks); ytd.days++;
                        if (mm === endM) { mtd.act += this.getActiveMinsForLog(log, dk); mtd.brk += this.calculateTotalBreakMins(log.breaks); mtd.days++; }
                    }
                });

                const dbYTD = this.ytdStats[m.id] || { leaves: 0, compOffs: 0, permHours: 0 };
                d.lvYTD = dbYTD.leaves;
                d.prmYTDUsed = dbYTD.permHours;

                d.avgActiveMTD = mtd.days ? Math.floor(mtd.act/mtd.days) : 0; 
                d.avgBreakMTD = mtd.days ? Math.floor(mtd.brk/mtd.days) : 0;
                d.avgActiveYTD = ytd.days ? Math.floor(ytd.act/ytd.days) : 0; 
                d.avgBreakYTD = ytd.days ? Math.floor(ytd.brk/ytd.days) : 0;
                
                return { ...m, ...d };
            });
        },

        getFilteredDatesByPeriod(p) {
            const ist = getISTDateObject();
            return Object.keys(this.attendanceData).filter(d => {
                const[y, m, day] = d.split('-').map(Number);
                if (p === 'day') return y === ist.getFullYear() && m === (ist.getMonth() + 1) && day === ist.getDate();
                if (p === 'month') return y === ist.getFullYear() && m === (ist.getMonth() + 1);
                return y === ist.getFullYear();
            });
        },
        get availablePersonnelOptions() { return this.filterDept ? this.members.filter(m => m.dept === this.filterDept) : this.members; },
        get filteredMembers() { 
            return this.members.filter(m => (!this.filterName || m.id === this.filterName) && (!this.filterDept || m.dept === this.filterDept)); 
        },

        handleNameFilterChange() { if (this.filterName) this.filterDept = this.members.find(m => m.id === this.filterName)?.dept; },

        markAttendance(id, s) { 
            if (!this.attendanceData[this.currentDate]) this.attendanceData[this.currentDate] = {}; 
            const newStatus = this.attendanceData[this.currentDate][id] === s ? "" : s;
            this.attendanceData[this.currentDate][id] = newStatus;
            
            this.attendanceData = { ...this.attendanceData }; 
            this.upsertAttCloud(this.currentDate, id, newStatus); 
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

        commitEditLog() {
            if (!this.editingLogId) return;
            const id = this.editingLogId;
            if (!this.punchLogs[this.currentDate]) this.punchLogs[this.currentDate] = {};
            if (!this.punchLogs[this.currentDate][id]) this.punchLogs[this.currentDate][id] = { in: '', out: '', breaks:[], captchas:[] };
            
            const formatT = (t) => {
                if(!t) return ''; const[h, m] = t.split(':');
                return `${(parseInt(h,10)%12||12).toString().padStart(2,'0')}:${m} ${parseInt(h,10)>=12?'PM':'AM'}`;
            };
            this.punchLogs[this.currentDate][id].in = formatT(this.tempPunches.in);
            this.punchLogs[this.currentDate][id].out = formatT(this.tempPunches.out);
            
            this.punchLogs = { ...this.punchLogs };
            this.upsertPunchCloud(this.currentDate, id); 
            this.showNote("Punch Timings Saved", "success");
            this.editingLogId = null;
        },

        async adminToggleBreak(mId) {
            if (!this.isAdminAuthenticated) return;
            if (!this.punchLogs[this.currentDate]) this.punchLogs[this.currentDate] = {};
            if (!this.punchLogs[this.currentDate][mId]) this.punchLogs[this.currentDate][mId] = { in: '', out: '', breaks:[], captchas:[] };
            
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
                    breaks.push({ start: currentTime, end: '' });
                    await this.supabase.from('break_logs').insert({
                        member_id: mId, log_date: this.currentDate, start_time: currentTime
                    });
                    this.showNote("Break Force-Started", "success");
                }
                this.punchLogs = { ...this.punchLogs };
            } catch(e) { 
                console.error("Admin break toggle error", e); 
                this.showNote("Error saving break", "error");
            }
        },

        formatDate(d) { return d ? new Date(d.split('-').map(Number)[0], d.split('-').map(Number)[1] - 1, d.split('-').map(Number)[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' }) : '...'; },
        changeDate(n) { const dt = new Date(this.currentDate.split('-').map(Number)[0], this.currentDate.split('-').map(Number)[1] - 1, this.currentDate.split('-').map(Number)[2]); dt.setDate(dt.getDate() + n); this.currentDate = getISTString(dt); },
        isMarkedPortal(s) { return this.attendanceData[this.getActiveShiftDate()]?.[this.userSession?.id] === s; },
        
        markPortalAttendance(s) {
            if (!this.userSession) return;
            const activeDate = this.getActiveShiftDate(), uId = this.userSession.id;
            if (!this.attendanceData[activeDate]) this.attendanceData[activeDate] = {};
            this.attendanceData[activeDate][uId] = s;
            if (!this.punchLogs[activeDate]) this.punchLogs[activeDate] = {};
            if (!this.punchLogs[activeDate][uId] || !this.punchLogs[activeDate][uId].in) this.punchLogs[activeDate][uId] = { in: this.getCurrentTimeIST(), out: '', breaks:[], captchas:[] };
            
            this.attendanceData = { ...this.attendanceData };
            this.punchLogs = { ...this.punchLogs };
            
            this.upsertAttCloud(activeDate, uId, s); 
            this.upsertPunchCloud(activeDate, uId); 
            this.showNote("Shift Record Updated", "success");
            this.scheduleNextCaptcha();
        },
        
        initiateLogout() { if (!this.userSession) return; this.logoutTimePreview = this.getCurrentTimeIST(); this.showLogoutModal = true; },
        confirmLogoutPortal() {
            this.clearCaptchaTimers();

            const activeDate = this.getActiveShiftDate(), uId = this.userSession.id;
            if (!this.punchLogs[activeDate]) this.punchLogs[activeDate] = {};
            if (!this.punchLogs[activeDate][uId]) this.punchLogs[activeDate][uId] = { in: '', out: '', breaks:[], captchas:[] };
            const breaks = this.punchLogs[activeDate][uId].breaks;
            if (breaks?.length > 0 && !breaks[breaks.length - 1].end) breaks[breaks.length - 1].end = this.logoutTimePreview;
            this.punchLogs[activeDate][uId].out = this.logoutTimePreview;
            
            this.punchLogs = { ...this.punchLogs };
            this.upsertPunchCloud(activeDate, uId); 
            this.showLogoutModal = false; this.logoutUser(); this.showNote("Shift Logged Out", "success");
        },

        toggleEditLog(id) {
            if (this.editingLogId === id) this.commitEditLog();
            else { if (this.editingLogId) this.commitEditLog(); this.editingLogId = id; this.tempPunches = { in: this.getTimeInputVal(this.punchLogs[this.currentDate]?.[id]?.in), out: this.getTimeInputVal(this.punchLogs[this.currentDate]?.[id]?.out) }; }
        },

        startEdit(m) { this.isEditing = true; this.newMember = JSON.parse(JSON.stringify(m)); this.isAddingMember = true; },
        resetMemberForm() { this.isAddingMember = false; this.isEditing = false; this.newMember = { empId: '', firstName: '', lastName: '', dept: 'General', role: 'Staff', shift: 'General Shift', allowedPL: 0, allowedSL: 0, allowedPerm: 0, doj: '', doe: '', dob: '', pin: '', captchaEnabled: false }; },
        
        handleIdEntry() { 
            const found = this.members.find(m => m.empId.trim().toUpperCase() === this.loginIdInput.trim().toUpperCase()); 
            if (found) {
                this.tempUser = JSON.parse(JSON.stringify(found));
                this.loginStep = !found.pin ? 'setup' : 'pin';
                if ("Notification" in window && Notification.permission === "default") {
                    Notification.requestPermission().catch(() => {});
                }
                setTimeout(() => document.getElementById(this.loginStep === 'pin' ? 'login-pin-input' : 'setup-pin-input')?.focus(), 50);
            } else this.showNote("Invalid ID", "error"); 
        },
        
        async handlePinVerification() { 
            const uid = this.tempUser.id;
            if (this.userLockoutUntil[uid] && Date.now() < this.userLockoutUntil[uid]) { this.loginPinInput = ''; return this.showNote(`Account locked. Try again later`, "error"); }
            
            if (this.loginPinInput === this.tempUser.pin) { 
                this.userFailedAttempts[uid] = 0; 
                this.userSession = JSON.parse(JSON.stringify(this.tempUser)); 
                this.setupUserRealtime();

                await this.syncUserData(true);

                const { data: excData } = await this.supabase
                    .from('member_exceptions_view')
                    .select('date, status')
                    .eq('member_id', this.userSession.id)
                    .order('date', { ascending: false });

                if (excData) {
                    this.userExceptionHistory = excData.map(log => ({
                        date: log.date,
                        label: this.formatDate(log.date),
                        status: this.statusOptions.find(s => s.id === log.status)
                    }));
                }

                const trapDate = this.getActiveShiftDate(); 
                
                const todaysCaptchas = this.punchLogs[trapDate]?.[uid]?.captchas ||[];
                const pendingCaptchas = todaysCaptchas.filter(c => c.status === 'Pending');

                if (pendingCaptchas.length > 0) {
                    this.showNote("Window closed during verification. Penalty applied.", "error");
                    
                    let penaltyTime = pendingCaptchas[0].time;
                    
                    for (const cap of pendingCaptchas) {
                        cap.status = 'Missed';
                        await this.supabase.from('captcha_logs')
                            .update({ status: 'Missed' })
                            .match({ member_id: uid, log_date: trapDate, check_time: cap.time });
                        
                        if (cap.time < penaltyTime) penaltyTime = cap.time;
                    }
                    this.punchLogs = { ...this.punchLogs }; 
                    
                    this.startBreak(penaltyTime);
                    
                    this.loginStep = 'id'; this.loginIdInput = ''; this.loginPinInput = ''; this.tempUser = null;
                    return; 
                }

                const reopenLog = this.punchLogs[trapDate]?.[uid];
                const alreadyOnBreak = reopenLog?.breaks?.length > 0 && !reopenLog.breaks[reopenLog.breaks.length - 1].end;
                if (this.userSession.captchaEnabled && reopenLog?.in && !reopenLog?.out && !alreadyOnBreak) {
                    const missedTime = this.getCurrentTimeIST();
                    if (!this.punchLogs[trapDate][uid].captchas) this.punchLogs[trapDate][uid].captchas = [];
                    this.punchLogs[trapDate][uid].captchas.push({ time: missedTime, status: 'Missed' });
                    this.punchLogs = { ...this.punchLogs };
                    try {
                        await this.supabase.from('captcha_logs').insert({
                            member_id: uid, log_date: trapDate, check_time: missedTime, status: 'Missed'
                        });
                    } catch(e) { console.error("Session-close captcha log error", e); }

                    this.showNote("Session closed during active shift. Break initiated.", "error");
                    this.startBreak(missedTime);
                    this.loginStep = 'id'; this.loginIdInput = ''; this.loginPinInput = ''; this.tempUser = null;
                    return;
                }

                const activeDate = this.getActiveShiftDate(), uId = this.userSession.id;
                if (!this.attendanceData[activeDate]) this.attendanceData[activeDate] = {}; 
                if (!this.attendanceData[activeDate][uId]) {
                    this.attendanceData[activeDate][uId] = 'p'; 
                    this.upsertAttCloud(activeDate, uId, 'p');
                }
                if (!this.punchLogs[activeDate]) this.punchLogs[activeDate] = {};
                if (!this.punchLogs[activeDate][uId] || !this.punchLogs[activeDate][uId].in) {
                    this.punchLogs[activeDate][uId] = { in: this.getCurrentTimeIST(), out: '', breaks:[], captchas:[] };
                    this.upsertPunchCloud(activeDate, uId);
                }
                this.loginStep = 'id'; this.loginIdInput = ''; this.loginPinInput = ''; this.tempUser = null; 
                this.scheduleNextCaptcha();
            } else { 
                this.userFailedAttempts[uid] = (this.userFailedAttempts[uid] || 0) + 1; this.loginPinInput = '';
                if (this.userFailedAttempts[uid] >= 3) { this.userLockoutUntil[uid] = Date.now() + 30000; this.userFailedAttempts[uid] = 0; this.showNote("Too many failed attempts. Locked for 30s.", "error"); } 
                else this.showNote(`Invalid PIN (${3 - this.userFailedAttempts[uid]} attempts left)`, "error"); 
            } 
        },

        async handlePinSetup() { 
            if (this.loginPinInput.length === 6) { 
                const idx = this.members.findIndex(m => m.id === this.tempUser.id); 
                if (idx !== -1) { 
                    this.members[idx].pin = this.loginPinInput; 
                    this.upsertMemberCloud(this.members[idx]); 
                    this.userSession = JSON.parse(JSON.stringify(this.members[idx])); 
                    this.setupUserRealtime();
                    await this.syncUserData(true); 

                    const { data: excData } = await this.supabase
                        .from('member_exceptions_view')
                        .select('date, status')
                        .eq('member_id', this.userSession.id)
                        .order('date', { ascending: false });

                    if (excData) {
                        this.userExceptionHistory = excData.map(log => ({
                            date: log.date,
                            label: this.formatDate(log.date),
                            status: this.statusOptions.find(s => s.id === log.status)
                        }));
                    }

                    const setupTrapDate = this.getActiveShiftDate();
                    const setupUid = this.userSession.id;
                    const setupTodaysCaptchas = this.punchLogs[setupTrapDate]?.[setupUid]?.captchas ||[];
                    const setupPendingCaptchas = setupTodaysCaptchas.filter(c => c.status === 'Pending');

                    if (setupPendingCaptchas.length > 0) {
                        this.showNote("Window closed during verification. Penalty applied.", "error");
                        
                        let penaltyTime = setupPendingCaptchas[0].time;
                        
                        for (const cap of setupPendingCaptchas) {
                            cap.status = 'Missed';
                            await this.supabase.from('captcha_logs')
                                .update({ status: 'Missed' })
                                .match({ member_id: setupUid, log_date: setupTrapDate, check_time: cap.time });
                                
                            if (cap.time < penaltyTime) penaltyTime = cap.time;
                        }
                        this.punchLogs = { ...this.punchLogs };
                        
                        this.startBreak(penaltyTime);
                        
                        this.loginStep = 'id'; this.loginIdInput = ''; this.loginPinInput = ''; this.tempUser = null;
                        return;
                    }

                    const activeDate = this.getActiveShiftDate(), uId = this.userSession.id;
                    if (!this.attendanceData[activeDate]) this.attendanceData[activeDate] = {}; 
                    this.attendanceData[activeDate][uId] = 'p'; 
                    this.upsertAttCloud(activeDate, uId, 'p');

                    if (!this.punchLogs[activeDate]) this.punchLogs[activeDate] = {};
                    if (!this.punchLogs[activeDate][uId] || !this.punchLogs[activeDate][uId].in) {
                        this.punchLogs[activeDate][uId] = { in: this.getCurrentTimeIST(), out: '', breaks:[], captchas:[] };
                        this.upsertPunchCloud(activeDate, uId);
                    }
                    this.loginStep = 'id'; this.loginIdInput = ''; this.loginPinInput = ''; this.tempUser = null; 
                    this.scheduleNextCaptcha(); this.showNote("Security Registered", "success"); 
                } 
            } else this.showNote("PIN must be 6 digits", "error"); 
        },

        logoutUser() { this.clearCaptchaTimers(); this.currentCaptchaTime = null; this.userSession = null; if (this.userSyncChannel) {this.supabase.removeChannel(this.userSyncChannel);this.userSyncChannel = null;} this.loginStep = 'id'; setTimeout(() => document.getElementById('login-id-input')?.focus(), 50); },

        cancelLogin() { this.loginStep = 'id'; this.tempUser = null; this.loginIdInput = ''; this.loginPinInput = ''; setTimeout(() => document.getElementById('login-id-input')?.focus(), 50); },

        verifyAdmin() { 
            if (Date.now() < this.adminLockoutUntil) { this.adminPinInput = ''; return this.showNote(`Vault locked.`, "error"); }
            if (this.adminPinInput === this.masterPin) { 
                this.isAdminAuthenticated = true; 
                this.adminPinInput = ''; 
                this.adminFailedAttempts = 0; 
                this.resetIdleTimer();
                this.setupUserRealtime(); 
                
                this.syncUserData(true);
            } 
            else { 
                this.adminFailedAttempts++; this.adminPinInput = '';
                if (this.adminFailedAttempts >= 3) { this.adminLockoutUntil = Date.now() + 30000; this.adminFailedAttempts = 0; this.showNote("Vault Lockdown Triggered", "error"); } 
                else this.showNote(`Access Denied`, "error"); 
            } 
        },

        logoutAdmin() { 
            this.isAdminAuthenticated = false; 
            this.view = 'portal'; 
            if(this.idleTimer) clearTimeout(this.idleTimer); 

            if (this.userSyncChannel) {
                this.supabase.removeChannel(this.userSyncChannel);
                this.userSyncChannel = null;
            }
        },
        
        changeAdminPin() {
            if (this.newPinValue.length === 6) { 
                this.masterPin = this.newPinValue; 
                this.upsertConfigCloud('master_pin', this.masterPin); 
                this.newPinValue = ''; this.showNote("Master PIN Updated", "success"); 
            } else this.showNote("PIN must be 6 digits", "error");
        },

        addMember() {
            if (!this.newMember.firstName || !this.newMember.empId) return this.showNote("Fields missing", "error");
            const fullName = (this.newMember.firstName + ' ' + (this.newMember.lastName || '')).trim();
            const cleanMember = { ...this.newMember, id: this.newMember.empId, name: fullName, allowedPL: Number(this.newMember.allowedPL ?? 0), allowedSL: Number(this.newMember.allowedSL ?? 0), allowedPerm: Number(this.newMember.allowedPerm ?? 0) };
            
            if (this.isEditing) { const idx = this.members.findIndex(m => m.empId === cleanMember.empId); if (idx !== -1) this.members[idx] = cleanMember; }
            else { if (this.members.find(m => m.empId === cleanMember.empId)) return this.showNote("ID exists", "error"); this.members.push(cleanMember); }
            
            this.members.sort((a, b) => a.empId.localeCompare(b.empId, undefined, { numeric: true, sensitivity: 'base' })); 

            this.upsertMemberCloud(cleanMember); 
            this.resetMemberForm();
        },
        
        addRole() { if (this.newRoleName.trim() && !this.roles.includes(this.newRoleName.trim())) { this.roles = [...this.roles, this.newRoleName.trim()]; this.upsertConfigCloud('roles', this.roles); this.newRoleName = ''; this.showNote("Role added", "success"); } },
        addDept() { if (this.newDeptName.trim() && !this.departments.includes(this.newDeptName.trim())) { this.departments =[...this.departments, this.newDeptName.trim()]; this.upsertConfigCloud('departments', this.departments); this.newDeptName = ''; this.showNote("Department added", "success"); } },
        addShift() { if (this.newShift.name.trim() && !this.shifts.find(s => s.name === this.newShift.name.trim())) { this.shifts =[...this.shifts, { name: this.newShift.name.trim(), inTime: this.newShift.inTime || '09:00', outTime: this.newShift.outTime || '18:00' }]; this.upsertConfigCloud('shifts', this.shifts); this.newShift = { name: '', inTime: '', outTime: '' }; this.showNote("Shift added", "success"); } },

        removeDept(dept) { this.departments = this.departments.filter(d => d !== dept); this.upsertConfigCloud('departments', this.departments); },
        removeRole(role) { this.roles = this.roles.filter(r => r !== role); this.upsertConfigCloud('roles', this.roles); },
        removeShift(s) { this.shifts = this.shifts.filter(x => x.name !== s); this.upsertConfigCloud('shifts', this.shifts); },
        
        showNote(msg, type = 'success') { this.notification = { msg, type }; setTimeout(() => this.notification = null, 3000); },
        confirmWipe(t) { this.deleteTarget = t; this.showDeleteModal = true; },
        
        async executeWipe() { 
            if (this.deleteTarget === 'local') { 
                try {
                    await this.supabase.from('members').delete().neq('id', '0');
                    await this.supabase.from('attendance').delete().neq('date', '1970-01-01');
                    await this.supabase.from('punch_logs').delete().neq('date', '1970-01-01');
                    await this.supabase.from('break_logs').delete().neq('log_date', '1970-01-01');
                    await this.supabase.from('captcha_logs').delete().neq('log_date', '1970-01-01');
                    await this.supabase.from('leave_requests').delete().neq('id', '0');
                    await this.supabase.from('holidays').delete().neq('id', '0');
                    window.location.reload(); 
                } catch(e) { console.error(e); }
            } else if (this.deleteTarget === 'member') { 
                this.members = this.members.filter(m => m.id !== this.memberToDelete); 
                try { await this.supabase.from('members').delete().eq('id', this.memberToDelete); } catch(e){} 
            } 
            this.showDeleteModal = false; 
        },
        
        exportToPDF() { 
            const el = document.getElementById('summary-content'), scrollArea = document.getElementById('audit-table-scroll');
            if (scrollArea) scrollArea.classList.remove('max-h-[600px]', 'overflow-x-auto');
            html2pdf().from(el).set({ margin: 10, filename: `Audit_Report_${this.summaryStartDate}_to_${this.summaryEndDate}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { format: 'a3', orientation: 'landscape' } }).save().then(() => {
                if (scrollArea) scrollArea.classList.add('max-h-[600px]', 'overflow-x-auto'); this.showNote("PDF Downloaded", "success");
            }); 
        },
        async fetchReportDataRange() {
            if (!this.summaryStartDate || !this.summaryEndDate) return this.showNote("Please select both dates", "error");
            if (this.summaryStartDate > this.summaryEndDate) return this.showNote("Start date must be before end date", "error");

            this.isSyncing = true;
            this.showNote("Fetching historical report data...", "success");

            try {
                let attQuery = this.supabase.from('attendance').select('*').gte('date', this.summaryStartDate).lte('date', this.summaryEndDate);
                let punchQuery = this.supabase.from('punch_logs').select('*').gte('date', this.summaryStartDate).lte('date', this.summaryEndDate);
                let breakQuery = this.supabase.from('break_logs').select('*').gte('log_date', this.summaryStartDate).lte('log_date', this.summaryEndDate);
                let capQuery = this.supabase.from('captcha_logs').select('*').gte('log_date', this.summaryStartDate).lte('log_date', this.summaryEndDate);

                const[{ data: aData }, { data: pData }, { data: bData }, { data: capData }] = await Promise.all([
                    attQuery, punchQuery, breakQuery, capQuery
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
                            this.punchLogs[r.date][r.member_id] = { in: r.in_time || '', out: r.out_time || '', breaks: [], captchas:[] };
                        } else {
                            this.punchLogs[r.date][r.member_id].in = r.in_time || '';
                            this.punchLogs[r.date][r.member_id].out = r.out_time || '';
                        }
                    });
                }

                if (bData) {
                    bData.forEach(b => {
                        if (!this.punchLogs[b.log_date]) this.punchLogs[b.log_date] = {};
                        if (!this.punchLogs[b.log_date][b.member_id]) this.punchLogs[b.log_date][b.member_id] = { in: '', out: '', breaks: [], captchas:[] };
                        
                        const breaks = this.punchLogs[b.log_date][b.member_id].breaks;
                        if (!breaks.find(existing => existing.start === b.start_time)) {
                            breaks.push({ start: b.start_time, end: b.end_time || '' });
                        }
                    });
                }

                if (capData) {
                    capData.forEach(c => {
                        if (!this.punchLogs[c.log_date]) this.punchLogs[c.log_date] = {};
                        if (!this.punchLogs[c.log_date][c.member_id]) this.punchLogs[c.log_date][c.member_id] = { in: '', out: '', breaks: [], captchas:[] };
                        if (!this.punchLogs[c.log_date][c.member_id].captchas) this.punchLogs[c.log_date][c.member_id].captchas =[];
                        
                        const captchas = this.punchLogs[c.log_date][c.member_id].captchas;
                        if (!captchas.find(existing => existing.time === c.check_time)) {
                            captchas.push({ time: c.check_time, status: c.status });
                        }
                    });
                }

                this.punchLogs = { ...this.punchLogs };
                
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

        exportDetailedExcel() {
            if (!this.summaryStartDate || !this.summaryEndDate) return this.showNote("Invalid date range", "error");
            const sDate = new Date(this.summaryStartDate), eDate = new Date(this.summaryEndDate), detailedRows =[];
            this.filteredMembers.forEach(m => {
                for (let d = new Date(sDate); d <= eDate; d.setDate(d.getDate() + 1)) {
                    const dateStr = getISTString(d), statusId = this.attendanceData[dateStr]?.[m.id] || '-';
                    const punchLog = this.punchLogs[dateStr]?.[m.id] || { in: '', out: '', breaks:[], captchas:[] };
                    let notes = '';
                    if (statusId === 'fh') { const h = this.holidayList.find(hol => hol.date === dateStr && (hol.dept === 'All' || hol.dept === m.dept)); if (h) notes = `Holiday: ${h.name}`; } 
                    else if (['a', 'h', '1p', '2p', 'lop', 'wfh'].includes(statusId)) { const leave = this.leaveRequests.find(l => l.empId === m.id && l.status === 'approved' && l.startDate <= dateStr && l.endDate >= dateStr); if (leave) notes = `Leave: ${leave.reason}`; }
                    detailedRows.push({ 'Date': dateStr, 'Emp ID': m.empId, 'Name': m.name, 'Department': m.dept, 'Shift': m.shift, 'Status': this.statusOptions.find(s => s.id === statusId)?.label || 'Unrecorded', 'Punch In': punchLog.in || '', 'Punch Out': punchLog.out || '', 'Active (Mins)': this.getActiveMinsForLog(punchLog, dateStr), 'Break (Mins)': this.calculateTotalBreakMins(punchLog.breaks), 'Captcha Fails': punchLog.captchas?.filter(c => c.status !== 'Passed').length || 0, 'Notes': notes });
                }
            });
            if (detailedRows.length === 0) return this.showNote("No data", "error");
            const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(detailedRows);
            ws['!cols'] =[{wch: 12}, {wch: 10}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 12}, {wch: 10}, {wch: 10}, {wch: 18}, {wch: 18}, {wch: 15}, {wch: 30}];
            XLSX.utils.book_append_sheet(wb, ws, "Detailed_Logs"); XLSX.writeFile(wb, `Detailed_Log_Report_${this.summaryStartDate}_to_${this.summaryEndDate}.xlsx`); this.showNote("Report Downloaded", "success");
        },

        exportRosterExcel() {
            if (!this.members || this.members.length === 0) return this.showNote("No personnel data", "error");
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
            ws['!cols'] =[{wch: 12}, {wch: 25}, {wch: 18}, {wch: 18}, {wch: 18}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 15}, {wch: 15}, {wch: 20}];
            XLSX.utils.book_append_sheet(wb, ws, "Roster_Report");
            XLSX.writeFile(wb, `Roster_Report_${getISTString()}.xlsx`);
            this.showNote("Roster Report Downloaded", "success");
        },

        executeFullSystemExport(isAuto = false) { 
            if (!this.members || this.members.length === 0) return this.showNote("No data available to export", "error");

            const wb = XLSX.utils.book_new(); 

            // SHEET 1: Personnel Master List
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

            // SHEET 2: Attendance Registry
            const attendanceRows =[]; 
            Object.keys(this.attendanceData).sort().forEach(date => {
                Object.keys(this.attendanceData[date]).forEach(empId => { 
                    if (this.attendanceData[date][empId]) {
                        attendanceRows.push({ 
                            'Date': date, 
                            'Emp ID': empId, 
                            'Name': this.members.find(m => m.id === empId)?.name || 'Unknown', 
                            'Status': this.attendanceData[date][empId].toUpperCase() 
                        }); 
                    }
                }); 
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attendanceRows), "Attendance_Registry");

            // SHEET 3: Detailed Punch & Break Logs
            const punchRows =[]; 
            Object.keys(this.punchLogs).sort().forEach(date => {
                Object.keys(this.punchLogs[date]).forEach(empId => { 
                    const log = this.punchLogs[date][empId]; 
                    const captchaFails = (log.captchas ||[]).filter(c => c.status !== 'Passed').length;
                    
                    punchRows.push({ 
                        'Date': date, 
                        'Emp ID': empId, 
                        'Name': this.members.find(m => m.id === empId)?.name || 'Unknown', 
                        'Punch In': log.in || 'Missing', 
                        'Punch Out': log.out || 'Missing', 
                        'Active (Mins)': this.getActiveMinsForLog(log, date), 
                        'Break (Mins)': this.calculateTotalBreakMins(log.breaks),
                        'Failed Verifications': captchaFails
                    }); 
                }); 
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(punchRows), "Punch_and_Break_Logs");

            // SHEET 4: Leave & Time-Off Requests
            const leaveRows = this.leaveRequests.map(l => ({ 
                'Request ID': l.id, 
                'Emp ID': l.empId, 
                'Name': l.name, 
                'Leave Type': l.type.toUpperCase(), 
                'Start Date': l.startDate, 
                'End Date': l.endDate, 
                'Reason': l.reason, 
                'Approval Status': l.status.toUpperCase() 
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leaveRows), "Time_Off_Requests");

            // SHEET 5: Holiday Configurations
            const holidayRows = this.holidayList.map(h => ({ 
                'Holiday Name': h.name, 
                'Date': h.date, 
                'Applicable Department': h.dept 
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(holidayRows), "Holiday_Calendar");

            // Generate and Download
            const fileName = `RevCentric_System_Export_${isAuto ? 'Automated' : 'Manual'}_${getISTString()}.xlsx`;
            XLSX.writeFile(wb, fileName); 
            this.showNote(isAuto ? "Automated DB Export Completed" : "Comprehensive Export Downloaded", "success");
        },

        toggleAutoExport() {
            this.autoExportEnabled = !this.autoExportEnabled;
            this.upsertConfigCloud('export_settings', { autoExportEnabled: this.autoExportEnabled, autoExportTime: this.autoExportTime, lastAutoExportDate: this.lastAutoExportDate }); 
            this.showNote(this.autoExportEnabled ? `Auto-Export set for ${this.autoExportTime} IST` : "Auto-Export Disabled", "success");
        },

        openNewMemberForm() { this.isAddingMember = true; this.isEditing = false; this.newMember = { empId: '', firstName: '', lastName: '', dept: 'General', role: 'Staff', shift: 'General Shift', allowedPL: 0, allowedSL: 0, allowedPerm: 0, doj: '', doe: '', dob: '', pin: '', captchaEnabled: false }; },
        removeMember(id) { this.memberToDelete = id; this.confirmWipe('member'); },
        resetUserPin(id) {
            const idx = this.members.findIndex(m => m.id === id);
            if (idx !== -1) { 
                this.members[idx].pin = ''; 
                this.upsertMemberCloud(this.members[idx]); 
                this.showNote("User security reset"); 
            }
        }
    };
};