window.attendanceApp = () => {
    let timeDrift = 0; 

    const getNow = () => typeof window.getSecureDate === 'function' ? window.getSecureDate() : new Date(Date.now() + timeDrift);

    // Dynamic, resilient sync with public time APIs and Supabase Date Headers
    const syncTrueTime = async () => {
        try {
            const res = await fetch('https://worldtimeapi.org/api/timezone/Asia/Kolkata');
            const data = await res.json();
            const trueTime = new Date(data.datetime).getTime();
            timeDrift = trueTime - Date.now();
            console.log(`Time synchronized. Drift: ${Math.round(timeDrift/1000)}s`);
        } catch (e) {
            console.warn("Time sync failed, attempting Supabase server date header fallback...");
            try {
                // Highly reliable fallback: Fetch Supabase rest endpoint headers
                const res = await fetch('https://lpthzknjzmxwukwpvhii.supabase.co', { method: 'HEAD' });
                const serverDateStr = res.headers.get('date');
                if (serverDateStr) {
                    const trueTime = new Date(serverDateStr).getTime();
                    timeDrift = trueTime - Date.now();
                    console.log(`Time synchronized via Supabase. Drift: ${Math.round(timeDrift/1000)}s`);
                }
            } catch (err) {
                console.warn("All time synchronization methods failed. Defaulting to local clock.");
            }
        }
    };

    const getISTString = (date = getNow()) => {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(date);
    };

    const getISTDateObject = (date = getNow()) => {
        const s = getISTString(date);
        const [y, m, d] = s.split('-').map(Number);
        return new Date(y, m - 1, d);
    };

    const getISTTime24 = () => {
        const formatter = new Intl.DateTimeFormat('en-GB', { 
            timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false 
        });
        return formatter.format(getNow()); 
    };

    const generateSecureId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

    // Secure, tamper-proof time check with resilient mobile operator fallback
    const fetchSecureApiTimeIST = async () => {
        try {
            const res = await fetch(`https://worldtimeapi.org/api/timezone/Asia/Kolkata?nocache=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error("Primary API down");
            const data = await res.json();
            const trueEpochMs = data.unixtime * 1000; 
            
            return new Intl.DateTimeFormat('en-US', { 
                timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true 
            }).format(new Date(trueEpochMs));
            
        } catch (e) {
            console.warn("Primary time API failed, switching to secondary API...");
            try {
                const fallbackRes = await fetch(`https://timeapi.io/api/Time/current/zone?timeZone=Asia/Kolkata&nocache=${Date.now()}`, { cache: 'no-store' });
                if (!fallbackRes.ok) throw new Error("Secondary API down");
                const fbData = await fallbackRes.json();
                const cleanISO = `${fbData.year}-${String(fbData.month).padStart(2, '0')}-${String(fbData.day).padStart(2, '0')}T${String(fbData.hour).padStart(2, '0')}:${String(fbData.minute).padStart(2, '0')}:00+05:30`;
                
                return new Intl.DateTimeFormat('en-US', { 
                    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true 
                }).format(new Date(cleanISO));
                
            } catch (fallbackError) {
                console.warn("Secondary API blocked or down. Initiating Supabase server timestamp verification...");
                try {
                    // Extract Date Header directly from project Supabase instance
                    const res = await fetch('https://lpthzknjzmxwukwpvhii.supabase.co', { method: 'HEAD' });
                    const serverDateStr = res.headers.get('date');
                    if (serverDateStr) {
                        const trueEpochMs = new Date(serverDateStr).getTime();
                        return new Intl.DateTimeFormat('en-US', { 
                            timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true 
                        }).format(new Date(trueEpochMs));
                    }
                    throw new Error("Date header absent");
                } catch (supabaseError) {
                    console.error("CRITICAL: All server clocks are unreachable.");
                    alert("Security Error: Unable to verify strict IST time via API. Action blocked. Please check your connection.");
                    return null; 
                }
            }
        }
    };

    const initialToday = getISTString();
    const todayObj = getISTDateObject();
    const firstDayStr = getISTString(new Date(todayObj.getFullYear(), todayObj.getMonth(), 1));
    const lastDayStr = getISTString(new Date(todayObj.getFullYear(), todayObj.getMonth() + 1, 0));

    return {
        theme: localStorage.getItem('appTheme') || 'light',
        breakTypes: ['Lunch', 'Dinner','Tea', 'Bio', 'Meeting', 'Other'],
        selectedBreakType: '',
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
        memberToDelete: null,
        notification: null,

        newMember: { empId: '', firstName: '', lastName: '', dept: 'General', role: 'Staff', shift: 'General Shift', allowedPL: 0, allowedSL: 0, allowedPerm: 0, doj: '', doe: '', dob: '', pin: '', captchaEnabled: false },
        newLeave: { type: 'a', startDate: '', endDate: '', reason: '' },

        statusOptions: [
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

        menuItems: [
            { 
                id: 'portal', 
                label: 'Portal', 
                admin: false,
                color: 'text-sky-500 hover:text-sky-600',
                // iOS Style: Solid rounded house (house.fill)
                icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.12 2.38a1.5 1.5 0 0 1 1.76 0l8.25 6.09A1.5 1.5 0 0 1 21.5 9.68V20a2 2 0 0 1-2 2h-4.5a.5.5 0 0 1-.5-.5v-5a1.5 1.5 0 0 0-1.5-1.5h-2A1.5 1.5 0 0 0 9.5 16.5v5a.5.5 0 0 1-.5.5H4.5a2 2 0 0 1-2-2V9.68a1.5 1.5 0 0 1 .37-1.21l8.25-6.09z"/></svg>'
            },
            { 
                id: 'dashboard', 
                label: 'Stats', 
                admin: true,
                color: 'text-indigo-500 hover:text-indigo-600',
                // iOS Style: Solid rounded bar chart (chart.bar.fill)
                icon: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="15" width="4" height="6" rx="1.5"/><rect x="10" y="9" width="4" height="12" rx="1.5"/><rect x="17" y="3" width="4" height="18" rx="1.5"/></svg>'
            },
            { 
                id: 'record', 
                label: 'Log', 
                admin: true,
                color: 'text-emerald-500 hover:text-emerald-600',
                // iOS Style: Solid document with folded corner (doc.text.fill)
                icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM13 3.5V8h4.5L13 3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2z"/></svg>'
            },
            { 
                id: 'members', 
                label: 'Roster', 
                admin: true,
                color: 'text-violet-500 hover:text-violet-600',
                // iOS Style: Layered multi-person with opacity depth (person.3.fill)
                icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8c0-2.5 3.5-4 7-4s7 1.5 7 4v1H5v-1z"/><path d="M17 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm3.5 7.5c-1-.7-2.3-1.3-4-1.7.9 1 1.5 2 1.5 3.2v1h4v-.5c0-1.1-.5-2.2-1.5-2z" fill-opacity="0.5"/><path d="M7 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 17.5c-1 .2-1.5 1.3-1.5 2.5v1h4v-1c0-1.2.6-2.2 1.5-3.2-1.7.4-3 1-4 1.7z" fill-opacity="0.5"/></svg>'
            },
            { 
                id: 'summary', 
                label: 'Reports', 
                admin: true,
                color: 'text-amber-500 hover:text-amber-600',
                // iOS Style: Dual-tone segmented pie chart (chart.pie.fill)
                icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10h-9a1 1 0 0 1-1-1V2z"/><path d="M14 2.1c4.5 1 8 4.6 8.9 9.1h-8.9V2.1z" fill-opacity="0.5"/></svg>'
            },
            { 
                id: 'master', 
                label: 'Master Config', 
                admin: true,
                color: 'text-rose-500 hover:text-rose-600',
                // iOS Style: Solid mechanical gear (gearshape.fill)
                icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>'
            }
        ],

        toggleTheme() {
            this.theme = this.theme === 'light' ? 'dark' : 'light';
            localStorage.setItem('appTheme', this.theme);
        },

        async init() {
            await syncTrueTime();

            if ("Notification" in window && Notification.permission === "default") {
                Notification.requestPermission().catch(e => console.warn("Auto-prompt blocked:", e));
            }   

            this.userSession = null;
            this.localSessionToken = null;
            this.supabase = supabase.createClient(this.supabaseUrl, this.supabaseKey);

            this.supabase.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
                    this.userSession = null;
                    this.localSessionToken = null;
                    localStorage.clear(); 
                    sessionStorage.clear();
                }
            });

            await this.syncInitialConfig();

            // Load Admin Authentication State locally to make sessions permanent
            if (localStorage.getItem('rc_admin_authenticated') === 'true') {
                this.isAdminAuthenticated = true;
                this.adminPinInput = localStorage.getItem('rc_admin_pin') || '';
            }

            await this.restoreSession();

            const todayRef = getISTDateObject();
            const initScopeDate = new Date(todayRef.getFullYear(), todayRef.getMonth(), todayRef.getDate() - 31);
            this.scopeStartStr = getISTString(initScopeDate);

            this.$watch('currentDate', (newDate) => {
                if (this.scopeStartStr && newDate < this.scopeStartStr && !this.fetchedOldDates.has(newDate)) {
                    this.fetchHistoricalDate(newDate);
                }
            });

            setInterval(() => {
                const now = getNow(); 
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
                        this.liveTotalBreakMins = breakMins;	
                    } else {
                        this.liveShiftMins = 0;
                        this.liveActiveMins = 0;
                        this.liveTotalBreakMins = 0;
                    }
                }
            }, 1000);
            
            ['mousemove', 'keydown', 'mousedown', 'touchstart'].forEach(evt => {
                window.addEventListener(evt, () => this.resetIdleTimer());
            });

            window.addEventListener('focus', () => this.checkExpiredCaptchas());

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

        async restoreSession() {
            try {
                const { data: { session }, error } = await this.supabase.auth.getSession();
                
                if (error || !session) {
                    // Do not wipe admin authentication here
                    if (!this.isAdminAuthenticated) {
                        localStorage.clear();
                        sessionStorage.clear();
                    }
                    return;
                }

                if (session) {
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
                            this.syncUserData(true);
                            await this.fetchExceptionHistory();	
                        } else {
                            await this.supabase.auth.signOut();
                        }
                    }
                }
            } catch (e) { 
                console.error("Session restore failed", e); 
                if (!this.isAdminAuthenticated) localStorage.clear(); 
            }
        },

        killSession() {
            if (this.isAdminAuthenticated) this.logoutAdmin();
            if (this.userSession) this.logoutUser();
        },

        async fetchDeviceAndNetworkInfo() {
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

            try {
                const res = await fetch('https://ipapi.co/json/');
                const data = await res.json();
                let locationTag = "";
                if (data.country_code && data.country_code !== 'US') locationTag = ` [🚨 Outside US: ${data.country_name}]`;
                return `${data.ip}${locationTag} | OS: ${os}`;
            } catch (e) {
                try {
                    const fbRes = await fetch('https://api.ipify.org?format=json');
                    const fbData = await fbRes.json();
                    return `${fbData.ip} | OS: ${os}`;
                } catch (err) {
                    return `Unknown IP | OS: ${os}`;
                }
            }
        },

        async checkSecurityFlag(netString, memberName) {
            if (!netString || !memberName) return;
            const isAndroid = netString.includes('OS: Android');
            const isOutsideUS = netString.includes('[🚨 Outside US:');
            
            if (isAndroid || isOutsideUS) {
                const issues = [];
                if (isOutsideUS) issues.push('Foreign IP');
                if (isAndroid) issues.push('Android Device');
                
                const timeStr = this.getCurrentTimeIST();
                const message = `🚨 SECURITY ALERT: ${memberName} detected on ${issues.join(' & ')} at ${timeStr}. Details: ${netString}`;
                
                console.warn(message);
            }
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
                    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'members' }, p => this.handleRealtimePayload(p))
                    .subscribe();
            } 
            else {
                const myId = this.userSession.id;
                this.userSyncChannel = this.supabase.channel(`user-${myId}-tracking`)
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `member_id=eq.${myId}` }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'punch_logs', filter: `member_id=eq.${myId}` }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'break_logs', filter: `member_id=eq.${myId}` }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'captcha_logs', filter: `member_id=eq.${myId}` }, p => this.handleRealtimePayload(p))
                    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'members', filter: `id=eq.${myId}` }, p => this.handleRealtimePayload(p))
                    .subscribe();
            }
        },

        handleRealtimePayload(payload) {
            if (this.isEditingLog || this.isAddingMember) return;

            const { table, eventType, new: newRecord } = payload;
            const updatedField = newRecord;

            if (table === 'members' && eventType === 'UPDATE') {
                if (this.userSession && updatedField.id === this.userSession.id) {
                    if (updatedField.current_session !== this.localSessionToken) {
                        this.logoutUser();
                        this.showNote("Logged out from another device/session", "error");
                        return;
                    }
                }
            }

            const activeDate = this.getActiveShiftDate();

            if (table === 'attendance') {
                const record = payload.new || payload.old;
                if (record && record.date === this.currentDate) {
                    if (eventType === 'DELETE') {
                        delete this.attendanceData[this.currentDate][record.member_id];
                    } else {
                        if (!this.attendanceData[this.currentDate]) this.attendanceData[this.currentDate] = {};
                        this.attendanceData[this.currentDate][record.member_id] = record.status;
                    }
                    this.attendanceData = { ...this.attendanceData };
                }
            }

            if (table === 'punch_logs') {
                const record = payload.new || payload.old;
                if (record && record.date === this.currentDate) {
                    if (!this.punchLogs[this.currentDate]) this.punchLogs[this.currentDate] = {};
                    if (eventType === 'DELETE') {
                        delete this.punchLogs[this.currentDate][record.member_id];
                    } else {
                        if (!this.punchLogs[this.currentDate][record.member_id]) {
                            this.punchLogs[this.currentDate][record.member_id] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
                        }
                        this.punchLogs[this.currentDate][record.member_id].in = record.in_time || '';
                        this.punchLogs[this.currentDate][record.member_id].out = record.out_time || '';
                        this.punchLogs[this.currentDate][record.member_id].in_ip = record.in_ip || '';
                        this.punchLogs[this.currentDate][record.member_id].out_ip = record.out_ip || '';
                    }
                    this.punchLogs = { ...this.punchLogs };
                }
            }

            if (table === 'break_logs') {
                const record = payload.new || payload.old;
                if (record && record.log_date === this.currentDate) {
                    if (!this.punchLogs[this.currentDate]) this.punchLogs[this.currentDate] = {};
                    if (!this.punchLogs[this.currentDate][record.member_id]) {
                        this.punchLogs[this.currentDate][record.member_id] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
                    }
                    
                    const breaks = this.punchLogs[this.currentDate][record.member_id].breaks || [];
                    const idx = breaks.findIndex(b => b.start === record.start_time);
                    if (eventType === 'DELETE') {
                        if (idx > -1) breaks.splice(idx, 1);
                    } else {
                        const bObj = { start: record.start_time, end: record.end_time || '', type: record.type || '' };
                        if (idx > -1) {
                            breaks[idx] = bObj;
                        } else {
                            breaks.push(bObj);
                        }
                    }
                    this.punchLogs[this.currentDate][record.member_id].breaks = breaks;
                    this.punchLogs = { ...this.punchLogs };
                }
            }

            if (table === 'captcha_logs') {
                const record = payload.new || payload.old;
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
                        if (idx > -1) {
                            captchas[idx] = cObj;
                        } else {
                            captchas.push(cObj);
                        }
                    }
                    this.punchLogs[this.currentDate][record.member_id].captchas = captchas;
                    this.punchLogs = { ...this.punchLogs };
                }
            }
        },

        async upsertConfigCloud(key, value) {
            try { await this.supabase.from('system_config').upsert({ key, value }); } 
            catch(e) { console.error("Config save error", e); this.syncError = true; }
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
            } catch(e) { console.error("Punch save error", e); }
        },

        async upsertLeaveCloud(req) {
            try {
                await this.supabase.from('leave_requests').upsert({
                    id: req.id, emp_id: req.empId, type: req.type, start_date: req.start_date || req.startDate, 
                    end_date: req.end_date || req.endDate, reason: req.reason, status: req.status
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
                    });
                }

                const { data: mData } = await this.supabase.from('members').select('*');
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
                this.userExceptionHistory = excData.map(log => ({
                    date: log.date,
                    label: this.formatDate(log.date),
                    status: this.statusOptions.find(s => s.id === log.status)
                }));
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

                const [ { data: vData }, { data: aData }, { data: pData }, { data: bData }, { data: capData } ] = await Promise.all([
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
                        newPunch[r.date][r.member_id] = { in: r.in_time || '', out: r.out_time || '', in_ip: r.in_ip || '', out_ip: r.out_ip || '', breaks: [], captchas: [] };
                    });
                }
                if (bData) {
                    bData.forEach(b => {
                        if (!newPunch[b.log_date]) newPunch[b.log_date] = {};
                        if (!newPunch[b.log_date][b.member_id]) newPunch[b.log_date][b.member_id] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
                        newPunch[b.log_date][b.member_id].breaks.push({ start: b.start_time, end: b.end_time || '', type: b.type || '' });
                    });
                }
                if (capData) {
                    capData.forEach(
                        c => {
                            if (!newPunch[c.log_date]) newPunch[c.log_date] = {};
                            if (!newPunch[c.log_date][c.member_id]) newPunch[c.log_date][c.member_id] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
                            if (!newPunch[c.log_date][c.member_id].captchas) newPunch[c.log_date][c.member_id].captchas = [];
                            newPunch[c.log_date][c.member_id].captchas.push({ time: c.check_time, status: c.status, ip: c.ip_address || '' });
                        });
                }
                this.punchLogs = newPunch;
                
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
                this.showNote(`Historical log loaded for ${this.formatDate(targetDate)}`, "success");
            } catch(e) { 
                console.error("Historical Pull Error:", e); 
                this.fetchedOldDates.delete(targetDate);
                this.showNote("Failed to load historical data", "error");
            } finally { 
                this.isSyncing = false; 
            }
        },

        toggleMemberVerification(mId) {
            if (!this.isAdminAuthenticated && !this.isManagerOrLead) return;
            const idx = this.members.findIndex(m => m.id === mId);
            if (idx > -1) {
                const current = !!this.members[idx].captchaEnabled;
                this.members[idx].captchaEnabled = !current;
                
                if (this.userSession && this.userSession.id === mId) {
                    this.userSession.captchaEnabled = !current;
                    if (this.userSession.captchaEnabled) {
                        if ("Notification" in window && Notification.permission !== "granted") Notification.requestPermission();
                        this.scheduleNextCaptcha();
                    } else {
                        this.clearCaptchaTimers();
                    }
                }
                
                this.upsertMemberCloud(this.members[idx]); 
                this.showNote(`Verification for ${this.members[idx].firstName} ${!current ? 'Enabled' : 'Disabled'}`, "success");
            }
        },

        clearCaptchaTimers() {
            if (this.captchaTimer) { clearTimeout(this.captchaTimer); this.captchaTimer = null; }
            if (this.captchaTimeoutTimer) { clearTimeout(this.captchaTimeoutTimer); this.captchaTimeoutTimer = null; }

            if (this._unlockAudioHandler) {
                document.removeEventListener('click', this._unlockAudioHandler);
                document.removeEventListener('keydown', this._unlockAudioHandler);
                this._unlockAudioHandler = null;
            }

            if (this._captchaAudio) {
                try { 
                    this._captchaAudio.muted = true; 
                    this._captchaAudio.pause(); 
                    this._captchaAudio.currentTime = 0; 
                    this._captchaAudio.removeAttribute('src'); 
                } catch(e) {}
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

                this._unlockAudioHandler = () => {
                    if (this._captchaAudio) {
                        this._captchaAudio.play().catch(() => {});
                    }
                    document.removeEventListener('click', this._unlockAudioHandler);
                    document.removeEventListener('keydown', this._unlockAudioHandler);
                    this._unlockAudioHandler = null;
                };

                const playPromise = this._captchaAudio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(() => {
                        document.addEventListener('click', this._unlockAudioHandler, { once: true });
                        document.addEventListener('keydown', this._unlockAudioHandler, { once: true });
                    });
                }
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
            if (!this.userSession) return;
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
            } catch(e) { console.error("Captcha log error", e); }
        },

        async forceCaptcha(mId) {
            if (!this.isAdminAuthenticated && !this.isManagerOrLead) return;
            const checkTime = this.getCurrentTimeIST();
            const currentIp = await this.fetchDeviceAndNetworkInfo();
            
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
            if (!this.punchLogs[dateKey][mId]) this.punchLogs[dateKey][mId] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
            if (!this.punchLogs[dateKey][mId].captchas) this.punchLogs[dateKey][mId].captchas = [];
            
            const exists = this.punchLogs[dateKey][mId].captchas.find(c => c.time === checkTime);
            if (!exists) {
                this.punchLogs[dateKey][mId].captchas.push({ time: checkTime, status: 'Pending', ip: currentIp });
                this.punchLogs = { ...this.punchLogs };
            }

            try {
                await this.supabase.from('captcha_logs').insert({
                    member_id: mId, log_date: dateKey, check_time: checkTime, status: 'Pending', ip_address: currentIp
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

        get formattedIdleTime() {
            const mins = Math.floor(this.idleSecondsRemaining / 60).toString().padStart(2, '0');
            const secs = (this.idleSecondsRemaining % 60).toString().padStart(2, '0');
            return `${mins}:${secs}`;
        },

        get activeTeamOnBreak() {
            if (!this.isManagerOrLead) return [];
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
            const events = [];
            this.members.forEach(m => {
                if (m.dob && parseInt(m.dob.split('-')[1]) === curM && parseInt(m.dob.split('-')[2]) === curD) events.push({ id: 'bday_'+m.id, type: 'birthday', member: m, title: 'Birthday', icon: '🎂', color: 'text-pink-600', bg: 'bg-pink-100' });
                if (m.doj && parseInt(m.doj.split('-')[1]) === curM && parseInt(m.doj.split('-')[2]) === curD) {
                    const yrs = getISTDateObject().getFullYear() - parseInt(m.doj.split('-')[0]);
                    events.push({ id: 'annv_'+m.id, type: 'anniversary', member: m, title: yrs > 0 ? `Anniversary (${yrs} Yr)` : 'Joined Today!', icon: yrs > 0 ? '🎊' : '🎉', color: yrs > 0 ? 'text-emerald-600' : 'text-indigo-600', bg: yrs > 0 ? 'bg-emerald-100' : 'bg-indigo-100' });
                }
            });
            return events;
        },

        get monthEvents() {
            const curObj = getISTDateObject();
            const curM = curObj.getMonth() + 1;
            const curY = curObj.getFullYear();
            const events = [];
            
            this.members.forEach(m => {
                if (m.dob) {
                    const [bY, bM, bD] = m.dob.split('-').map(Number);
                    if (bM === curM) {
                        events.push({ 
                            id: 'mbday_' + m.id, type: 'birthday', member: m, 
                            title: 'Birthday', day: bD, icon: '🎂', 
                            color: 'text-pink-600', bg: 'bg-pink-100' 
                        });
                    }
                }
                if (m.doj) {
                    const [jY, jM, jD] = m.doj.split('-').map(Number);
                    if (jM === curM) {
                        const yrs = curY - jY;
                        events.push({ 
                            id: 'mannv_' + m.id, type: 'anniversary', member: m, 
                            title: yrs > 0 ? `Anniversary (${yrs} Yr)` : 'Joining Month', 
                            day: jD, icon: yrs > 0 ? '🎊' : '🎉', 
                            color: yrs > 0 ? 'text-emerald-600' : 'text-indigo-600', 
                            bg: yrs > 0 ? 'bg-emerald-100' : 'bg-indigo-100' 
                        });
                    }
                }
            });
            
            return events.sort((a, b) => a.day - b.day);
        },

get notificationGlowClass() {
            // 1. Pink glow for Birthdays
            if (this.todayEvents.some(e => e.type === 'birthday')) {
                return 'shadow-[0_0_15px_rgba(236,72,153,0.6)] animate-pulse text-pink-500';
            }
            // 2. Emerald glow for Anniversaries
            if (this.todayEvents.some(e => e.type === 'anniversary')) {
                return 'shadow-[0_0_15px_rgba(16,185,129,0.6)] animate-pulse text-emerald-500';
            }
            // 3. Rose glow for AI Security Insights (Admins/Managers)
            if ((this.isAdminAuthenticated || this.isManagerOrLead) && this.offenderAlerts.length > 0) {
                return 'shadow-[0_0_15px_rgba(244,63,94,0.6)] animate-pulse text-rose-500';
            }
            // 4. Indigo glow for Pending Approvals (Admins/Managers)
            if ((this.isAdminAuthenticated || this.isManagerOrLead) && this.pendingLeaveCount > 0) {
                return 'shadow-[0_0_15px_rgba(99,102,241,0.6)] animate-pulse text-indigo-500';
            }
            // 5. Default Brand Orange for general month events
            if (this.todayEvents.length > 0 || this.monthEvents.length > 0) {
                return 'shadow-[0_0_15px_rgba(242,101,34,0.6)] animate-pulse text-[#f26522]';
            }
            // 6. Idle state (no notifications)
            return 'text-zinc-400 hover:text-indigo-500';
        },

        get offenderAlerts() {
            const alerts = [];
            const todayStr = this.getActiveShiftDate();
            const THRESHOLD = 470; 
            const VIOLATION_LIMIT = 3; 
            
            const [y, m, d] = todayStr.split('-').map(Number);
            const cutoffObj = new Date(y, m - 1, d - 30);
            const cutoffDateStr = `${cutoffObj.getFullYear()}-${String(cutoffObj.getMonth() + 1).padStart(2, '0')}-${String(cutoffObj.getDate()).padStart(2, '0')}`;
            
            this.members.forEach(m => {
                if (!this.isManagerOrLead && (!this.userSession || this.userSession.id !== m.id)) return;

                const isPresentToday = this.attendanceData[todayStr]?.[m.id] === 'p' || 
                                      (this.punchLogs[todayStr]?.[m.id]?.in && !this.punchLogs[todayStr]?.[m.id]?.out);
                
                if (isPresentToday) {
                    let violations = 0;
                    
                    Object.keys(this.punchLogs).forEach(date => {
                        if (date >= todayStr || date < cutoffDateStr) return; 
                        
                        const log = this.punchLogs[date]?.[m.id];
                        const status = this.attendanceData[date]?.[m.id];
                        
                        if (status === 'p' && log && log.in && log.out) {
                            const activeMins = this.getActiveMinsForLog(log, date);
                            if (activeMins > 0 && activeMins < THRESHOLD) {
                                violations++;
                            }
                        }
                    });
                    
                    if (violations >= VIOLATION_LIMIT) {
                        alerts.push({
                            id: 'ai_' + m.id,
                            member: m,
                            violations: violations,
                            title: 'Flight Risk Detected',
                            message: `${violations} shifts under 7h 50m in last 30 days`,
                            icon: '🤖',
                            color: 'text-rose-600',
                            bg: 'bg-rose-100'
                        });
                    }
                }
            });
            
            return alerts.sort((a, b) => b.violations - a.violations);
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
            const bulkRecords = [];
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
            return new Intl.DateTimeFormat('en-US', { 
                timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true 
            }).format(getNow());
        },
        formatTimeDisplay(time24) {
            if (!time24) return '--:--';
            const [h, m] = time24.split(':');
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
            }
        },

        async startBreak(timeOverride = null, type = null) {
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
                    } catch(e) {}
                }
            } else {
                breaks.push({ start: startTime, end: '', type: breakType }); 
                try {
                    await this.supabase.from('break_logs').insert({
                        member_id: uId, log_date: activeDate, start_time: startTime, type: breakType
                    });
                } catch(e) { console.error("Break start error", e); }
            }
            
            this.punchLogs = { ...this.punchLogs };
            this.breakPinInput = '';
            
            this.showNote(timeOverride ? "Penalty Break Applied" : `${breakType} Break Started`, timeOverride ? "error" : "success");
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
            const secureTime = await fetchSecureApiTimeIST();
            if (!secureTime) return;
            const activeDate = this.getActiveShiftDate();
            const uId = this.userSession.id;
            const breaks = this.punchLogs[activeDate]?.[uId]?.breaks;
            const endTime = secureTime;

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
                this.selectedBreakType = ''; 
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
            const stats = { periodTotals: {}, history: [] };
            this.statusOptions.forEach(opt => stats.periodTotals[opt.id] = 0);

            const userShift = this.shifts.find(s => s.name === user.shift) || { inTime: '09:00', outTime: '18:00' };
            const totalShiftMins = this.diffInMins(userShift.inTime, userShift.outTime) || 540; 
            const allowedBreakMins = 60; 
            const baseTargetMins = totalShiftMins - allowedBreakMins; 
            
            const activeDateKey = this.getActiveShiftDate();

            for (let i = 0; i < 15; i++) {
                const day = getISTDateObject(); day.setDate(day.getDate() - i);
                const dk = getISTString(day);
                const sObj = this.statusOptions.find(s => s.id === this.attendanceData[dk]?.[id]) || { id: '-', label: 'Unrecorded', color: 'text-zinc-400', bg: 'bg-zinc-100/50', display: '-' };
                stats.history.push({ date: dk, label: day.toLocaleDateString('en-US', {month:'short', day:'numeric', weekday:'short'}), status: sObj, punch: this.punchLogs[dk]?.[id] || {} });
            }

            let mtd = { 
                p:0, lv:0, prm:0, lop:0, activeMins:0, breakMins:0, 
                completedDays:0, targetActiveMins:0, targetBreakMins:0
            };
            let ytd = { 
                lv:0, prm:0, co:0, activeMins:0, breakMins:0, 
                completedDays:0 
            };

            Object.keys(this.attendanceData).forEach(dk => {
                const s = this.attendanceData[dk][id];
                if (!s) return;
                const [dy, dm] = dk.split('-').map(Number);
                
                if (dy === curY) {
                    if (s === 'co') ytd.co += 1;
                    if (s === 'a') ytd.lv += 1; if (s === 'h') ytd.lv += 0.5;
                    if (s === '1p') ytd.prm += 1; if (s === '2p') ytd.prm += 2;
                    
                    if (['p', 'wfh', '1p', '2p', 'co', 'h'].includes(s)) {
                        const log = this.punchLogs[dk]?.[id];
                        const isActiveShift = (dk === activeDateKey && log && log.in && !log.out);
                        
                        if (!isActiveShift) {
                            let dailyActiveTarget = baseTargetMins;
                            if (s === '1p') dailyActiveTarget = (baseTargetMins - 60); 
                            else if (s === '2p') dailyActiveTarget = (baseTargetMins - 120); 
                            else if (s === 'h') dailyActiveTarget = (baseTargetMins / 2); 

                            let dailyBreakTarget = ['h'].includes(s) ? (allowedBreakMins / 2) : allowedBreakMins; 

                            ytd.completedDays++;

                            if (dm === curM) {
                                mtd.targetActiveMins += dailyActiveTarget;
                                mtd.targetBreakMins += dailyBreakTarget;
                                mtd.completedDays++;
                            }
                        }
                    }

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
                if (log && log.in && log.out) {
                    const [dy, dm] = dk.split('-').map(Number);
                    if (dy === curY) {
                        const isActiveShift = (dk === activeDateKey && !log.out);
                        if (!isActiveShift) {
                            const activeMins = this.getActiveMinsForLog(log, dk);
                            const breakMins = this.calculateTotalBreakMins(log.breaks);
                            
                            ytd.activeMins += activeMins;
                            ytd.breakMins += breakMins;

                            if (dm === curM) {
                                mtd.activeMins += activeMins;
                                mtd.breakMins += breakMins;
                            }
                        }
                    }
                }
            });

            const dbYTD = this.ytdStats[id] || { leaves: 0, compOffs: 0, permHours: 0 };

            let monthsActiveThisYear = curM;
            if (user.doj) {
                const dojParts = user.doj.split('-');
                if (dojParts.length === 3) {
                    const dojY = parseInt(dojParts[0], 10);
                    const dojM = parseInt(dojParts[1], 10);
                    if (dojY === curY) {
                        monthsActiveThisYear = Math.max(1, curM - dojM + 1);
                    } else if (dojY > curY) {
                        monthsActiveThisYear = 0;
                    }
                }
            }

            const totalYearlyLeaves = (user.allowedPL || 0) + (user.allowedSL || 0);
            const limitPerMonth = totalYearlyLeaves / 12;
            const proratedLimitYTD = limitPerMonth * monthsActiveThisYear;
            const remainingYTD = proratedLimitYTD + dbYTD.compOffs - dbYTD.leaves;

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
                    monthlyLeaveLimit: Number(limitPerMonth.toFixed(2)),
                    proratedLeaveLimitYTD: Number(proratedLimitYTD.toFixed(2)),
                    usedLeavesMTD: mtd.lv,
                    usedLeavesYTD: dbYTD.leaves,
                    remainingLeavesYTD: Number(remainingYTD.toFixed(2)),
                    prmAvailYTD: ((user.allowedPerm||0) * curM) - dbYTD.permHours, 
                    prmUsedYTD: dbYTD.permHours, 
                    lopMTD: mtd.lop,
                    
                    targetActiveMTD: mtd.completedDays > 0 ? Math.round(mtd.targetActiveMins / mtd.completedDays) : baseTargetMins,
                    targetBreakMTD: mtd.completedDays > 0 ? Math.round(mtd.targetBreakMins / mtd.completedDays) : allowedBreakMins,
                    
                    avgActiveMTD: mtd.completedDays > 0 ? Math.round(mtd.activeMins / mtd.completedDays) : 0,
                    avgBreakMTD: mtd.completedDays > 0 ? Math.round(mtd.breakMins / mtd.completedDays) : 0,
                    
                    avgActiveYTD: ytd.completedDays > 0 ? Math.round(ytd.activeMins / ytd.completedDays) : 0,
                    avgBreakYTD: ytd.completedDays > 0 ? Math.round(ytd.breakMins / ytd.completedDays) : 0
                }
            };
        },

        getAdherenceTier() {
            if (!this.individualStats?.metrics) return 'Silver Tier';
            
            const m = this.individualStats.metrics;
            const targetMins = m.targetActiveMTD || 470;
            const activePercent = ((m.avgActiveMTD || 0) / Math.max(1, targetMins)) * 100;
            const leavesOver = (m.remainingLeavesYTD < 0);
            const permsOver = (m.prmAvailYTD < 0);
            const breakCompliant = (m.avgBreakMTD || 0) <= (m.targetBreakMTD || 60);

            if (activePercent >= 95 && breakCompliant && !leavesOver && !permsOver) {
                return 'Platinum Tier';
            } else if (activePercent >= 85 && !leavesOver && !permsOver) {
                return 'Gold Tier';
            } else if (activePercent >= 75) {
                return 'Silver Tier';
            } else {
                return 'Action Needed';
            }
        },

        get rangeSummaryData() {
            const sDate = this.summaryStartDate, eDate = this.summaryEndDate;
            const endY = eDate ? parseInt(eDate.split('-')[0]) : getISTDateObject().getFullYear();
            const endM = eDate ? parseInt(eDate.split('-')[1]) : (getISTDateObject().getMonth() + 1);

            return this.filteredMembers.map(m => {
                let d = { presentMTD:0, absentMTD:0, halfMTD:0, wfhMTD:0, coMTD:0, prmHrsMTD:0, lopMTD:0, holidayMTD:0, lvYTD:0, prmYTDUsed:0, availLv:0, availPrm:0, avgActiveMTD:0, avgBreakMTD:0, avgActiveYTD:0, avgBreakYTD:0 };
                let ytd={ act:0, brk:0, days:0 }, mtd={ act:0, brk:0, days:0 };

                Object.keys(this.attendanceData).forEach(dk => {
                    const s = this.attendanceData[dk]?.[m.id];
                    if (!s) return;
                    if (dk >= sDate && dk <= eDate) {
                        if (s === 'p' || s === 'wfh') d.presentMTD += 1;
                        if (s === 'a') d.absentMTD += 1;
                        if (s === 'h') { d.halfMTD += 1; d.presentMTD += 0.5; }
                        
                        if (s === 'wfh') d.wfhMTD += 1;
                        if (s === 'co') d.coMTD += 1;
                        
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

                let monthsActiveThisYear = endM;
                if (m.doj) {
                    const dojParts = m.doj.split('-');
                    if (dojParts.length === 3) {
                        const dojY = parseInt(dojParts[0], 10);
                        const dojM = parseInt(dojParts[1], 10);
                        if (dojY === endY) {
                            monthsActiveThisYear = Math.max(1, endM - dojM + 1);
                        } else if (dojY > endY) {
                            monthsActiveThisYear = 0; 
                        }
                    }
                }

                const totalYearlyLeaves = (m.allowedPL || 0) + (m.allowedSL || 0);
                const limitPerMonth = totalYearlyLeaves / 12;
                const proratedLimitYTD = limitPerMonth * monthsActiveThisYear;
                const remainingYTD = proratedLimitYTD + dbYTD.compOffs - dbYTD.leaves;
                
                d.availLv = Number(remainingYTD.toFixed(2));
                d.availPrm = ((m.allowedPerm || 0) * monthsActiveThisYear) - dbYTD.permHours;

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
                const [y, m, day] = d.split('-').map(Number);
                if (p === 'day') return y === ist.getFullYear() && m === (ist.getMonth() + 1) && day === ist.getDate();
                if (p === 'month') return y === ist.getFullYear() && m === (ist.getMonth() + 1);
                return y === ist.getFullYear();
            });
        },

        get availablePersonnelOptions() { 
            const today = getISTString();
            const activeOnly = this.members.filter(m => !m.doe || m.doe >= today);
            return this.filterDept ? activeOnly.filter(m => m.dept === this.filterDept) : activeOnly; 
        },

        get filteredMembers() { 
            return this.members.filter(m => {
                if (this.filterName && m.id !== this.filterName) return false;
                if (this.filterDept && m.dept !== this.filterDept) return false;
                
                if (this.view === 'record' || this.view === 'dashboard') {
                    if (m.doe && m.doe < this.currentDate) return false;
                }
                
                if (this.view === 'summary') {
                    if (m.doe && m.doe < this.summaryStartDate) return false;
                }
                
                return true;
            }); 
        },

        handleNameFilterChange() { if (this.filterName) this.filterDept = this.members.find(m => m.id === this.filterName)?.dept; },

        markAttendance(id, s) { 
            if (!this.attendanceData[this.currentDate]) this.attendanceData[this.currentDate] = {}; 
            this.attendanceData[this.currentDate][id] = s;
            this.attendanceData = { ...this.attendanceData }; 
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

        commitEditLog() {
            if (!this.editingLogId) return;
            const id = this.editingLogId;
            if (!this.punchLogs[this.currentDate]) this.currentDate = getISTString();
            if (!this.punchLogs[this.currentDate][id]) this.punchLogs[this.currentDate][id] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
            
            const formatT = (t) => {
                if(!t) return ''; const [h, m] = t.split(':');
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
            } catch(e) { 
                console.error("Admin break toggle error", e); 
                this.showNote("Error saving break", "error");
            }
        },

        formatDate(d) { return d ? new Date(d.split('-').map(Number)[0], d.split('-').map(Number)[1] - 1, d.split('-').map(Number)[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' }) : '...'; },
        changeDate(n) { const dt = new Date(this.currentDate.split('-').map(Number)[0], this.currentDate.split('-').map(Number)[1] - 1, this.currentDate.split('-').map(Number)[2]); dt.setDate(dt.getDate() + n); this.currentDate = getISTString(dt); },
        isMarkedPortal(s) { return this.attendanceData[this.getActiveShiftDate()]?.[this.userSession?.id] === s; },
        
        async markPortalAttendance(s) {
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
            
            this.upsertAttCloud(activeDate, uId, s); 
            this.upsertPunchCloud(activeDate, uId); 
            this.showNote("Shift Record Updated", "success");
            this.scheduleNextCaptcha();
        },
        
        initiateLogout() { if (!this.userSession) return; this.logoutTimePreview = this.getCurrentTimeIST(); this.showLogoutModal = true; },
        
        async confirmLogoutPortal() {
            this.clearCaptchaTimers();
            const secureTime = await fetchSecureApiTimeIST();
            if (!secureTime) {
                this.showLogoutModal = false; 
                return; 
            }
            const activeDate = this.getActiveShiftDate(), uId = this.userSession.id;
            if (!this.punchLogs[activeDate]) this.punchLogs[activeDate] = {};
            if (!this.punchLogs[activeDate][uId]) this.punchLogs[activeDate][uId] = { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
            
            const breaks = this.punchLogs[activeDate][uId].breaks;
            if (breaks?.length > 0 && !breaks[breaks.length - 1].end) breaks[breaks.length - 1].end = secureTime;
            
            const currentIp = await this.fetchDeviceAndNetworkInfo();
            this.checkSecurityFlag(currentIp, this.userSession.name);
            
            this.punchLogs[activeDate][uId].out = secureTime;
            this.punchLogs[activeDate][uId].out_ip = currentIp;
            this.punchLogs = { ...this.punchLogs };
            
            await this.upsertPunchCloud(activeDate, uId); 
            
            this.showLogoutModal = false; 
            this.showNote("Shift Logged Out", "success");
            await this.logoutUser(); 
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
                const todayStr = getISTString();
                if (found.doe && found.doe < todayStr) {
                    this.loginIdInput = '';
                    return this.showNote("Access Denied: Account Deactivated", "error");
                }
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
                const { data: signUpData, error: signUpError } = await this.supabase.auth.signUp({
                    email: ghostEmail,
                    password: pinPassword
                });
                
                if (!signUpError && signUpData.user) {
                    authData = signUpData;
                    authError = null;
                    await this.supabase.from('members').update({ auth_id: authData.user.id }).eq('id', uid);
                } else if (signUpError && signUpError.message.includes("already registered")) {
                    authError = signUpError; 
                }
            }

            if (authError) {
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
            this.userSession = JSON.parse(JSON.stringify(this.tempUser)); 
            this.userSession.auth_id = authData.user.id; 

            this.localSessionToken = generateSecureId(); 
            await this.supabase.from('members')
                .update({ current_session: this.localSessionToken })
                .eq('id', uid);

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
                
                this.startBreak(penaltyTime);
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
                try {
                    await this.supabase.from('captcha_logs').insert({
                        member_id: uid, log_date: trapDate, check_time: missedTime, status: 'Missed', ip_address: currentIp
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
                const currentIp = await this.fetchDeviceAndNetworkInfo();
                this.checkSecurityFlag(currentIp, this.userSession.name);
                
                this.punchLogs[activeDate][uId] = { 
                    in: this.getCurrentTimeIST(), out: '', 
                    in_ip: currentIp, out_ip: '', 
                    breaks: [], captchas: [] 
                };
                this.upsertPunchCloud(activeDate, uId);
            }
            this.loginStep = 'id'; this.loginIdInput = ''; this.loginPinInput = ''; this.tempUser = null; 
            this.scheduleNextCaptcha();
        },

        async handlePinSetup() { 
            if (this.loginPinInput.length === 6) { 
                const uid = this.tempUser.id;
                const empId = this.tempUser.empId.toUpperCase();
                const ghostEmail = `${empId}@revcentric.local`;
                const pinPassword = this.loginPinInput;

                const { data: authData, error: authError } = await this.supabase.auth.signUp({
                    email: ghostEmail, password: pinPassword
                });

                if (authError) return this.showNote("Auth Error: " + authError.message, "error");

                const idx = this.members.findIndex(m => m.id === this.tempUser.id); 
                if (idx !== -1) { 
                    this.members[idx].pin = pinPassword; 
                    this.members[idx].auth_id = authData.user.id;
                    this.upsertMemberCloud(this.members[idx]); 

                    this.userSession = JSON.parse(JSON.stringify(this.members[idx])); 
                    this.userSession.auth_id = authData.user.id;

                    this.localSessionToken = generateSecureId(); 
                    await this.supabase.from('members')
                        .update({ current_session: this.localSessionToken })
                        .eq('id', uid);

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
                        const currentIp = await this.fetchDeviceAndNetworkInfo();
                        this.checkSecurityFlag(currentIp, this.userSession.name);
                        
                        this.punchLogs[activeDate][uId] = { 
                            in: this.getCurrentTimeIST(), out: '', 
                            in_ip: currentIp, out_ip: '', 
                            breaks: [], captchas: [] 
                        };
                        this.upsertPunchCloud(activeDate, uId);
                    }
                    this.loginStep = 'id'; this.loginIdInput = ''; this.loginPinInput = ''; this.tempUser = null; 
                    this.scheduleNextCaptcha(); this.showNote("Security Registered", "success"); 
                } 
            } else this.showNote("PIN must be 6 digits", "error"); 
        },

        async logoutUser() { 
            this.clearCaptchaTimers(); 
            this.currentCaptchaTime = null; 
            this.userSession = null; 
            this.localSessionToken = null; 
            
            if (this.userSyncChannel) {
                this.supabase.removeChannel(this.userSyncChannel);
                this.userSyncChannel = null;
            } 
            
            this.loginStep = 'id'; 
            
            try {
                await this.supabase.auth.signOut();
            } catch(e) {
                console.warn("Supabase signout skipped or failed:", e);
            }

            localStorage.clear();
            sessionStorage.clear();
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
                this.tempUser = matched;
                this.loginStep = !matched.pin ? 'setup' : 'pin';
                this.loginIdInput = '';
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
                let { data: authData, error: authError } = await this.supabase.auth.signInWithPassword({
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
                // Set persistent local flags for admin sessions
                localStorage.setItem('rc_admin_authenticated', 'true');
                localStorage.setItem('rc_admin_pin', this.adminPinInput);

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

        async logoutAdmin() { 
            this.isAdminAuthenticated = false; 
            localStorage.removeItem('rc_admin_authenticated');
            localStorage.removeItem('rc_admin_pin');
            this.view = 'portal'; 
            if(this.idleInterval) clearInterval(this.idleInterval); 

            if (this.userSyncChannel) {
                this.supabase.removeChannel(this.userSyncChannel);
                this.userSyncChannel = null;
            }
            await this.supabase.auth.signOut();
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
        addDept() { if (this.newDeptName.trim() && !this.departments.includes(this.newDeptName.trim())) { this.departments = [...this.departments, this.newDeptName.trim()]; this.upsertConfigCloud('departments', this.departments); this.newDeptName = ''; this.showNote("Department added", "success"); } },
        addShift() { if (this.newShift.name.trim() && !this.shifts.find(s => s.name === this.newShift.name.trim())) { this.shifts = [...this.shifts, { name: this.newShift.name.trim(), inTime: this.newShift.inTime || '09:00', outTime: this.newShift.outTime || '18:00' }]; this.upsertConfigCloud('shifts', this.shifts); this.newShift = { name: '', inTime: '', outTime: '' }; this.showNote("Shift added", "success"); } },

        removeDept(dept) { this.departments = this.departments.filter(d => d !== dept); this.upsertConfigCloud('departments', this.departments); },
        removeRole(role) { this.roles = this.roles.filter(r => r !== role); this.upsertConfigCloud('roles', this.roles); },
        removeShift(s) { this.shifts = this.shifts.filter(x => x.name !== s); this.upsertConfigCloud('shifts', this.shifts); },
        
        showNote(msg, type = 'success') { this.notification = { msg, type }; setTimeout(() => this.notification = null, 3000); },
        
        async executeWipe() { 
            if (this.memberToDelete) { 
                this.members = this.members.filter(m => m.id !== this.memberToDelete); 
                try { await this.supabase.from('members').delete().eq('id', this.memberToDelete); } catch(e){} 
            } 
            this.showDeleteModal = false; 
            this.memberToDelete = null;
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
                let apiQuery = this.supabase.from('captcha_logs').select('*').gte('log_date', this.summaryStartDate).lte('log_date', this.summaryEndDate);

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
            const sDate = new Date(this.summaryStartDate), eDate = new Date(this.summaryEndDate), detailedRows = [];
            this.filteredMembers.forEach(m => {
                for (let d = new Date(sDate); d <= eDate; d.setDate(d.getDate() + 1)) {
                    const dateStr = getISTString(d), statusId = this.attendanceData[dateStr]?.[m.id] || '-';
                    const punchLog = this.punchLogs[dateStr]?.[m.id] || { in: '', out: '', in_ip: '', out_ip: '', breaks: [], captchas: [] };
                    let notes = '';
                    if (statusId === 'fh') { const h = this.holidayList.find(hol => hol.date === dateStr && (hol.dept === 'All' || hol.dept === m.dept)); if (h) notes = `Holiday: ${h.name}`; } 
                    else if (['a', 'h', '1p', '2p', 'lop', 'wfh'].includes(statusId)) { const leave = this.leaveRequests.find(l => l.empId === m.id && l.status === 'approved' && l.startDate <= dateStr && l.endDate >= dateStr); if (leave) notes = `Leave: ${leave.reason}`; }
                    detailedRows.push({ 'Date': dateStr, 'Emp ID': m.empId, 'Name': m.name, 'Department': m.dept, 'Shift': m.shift, 'Status': this.statusOptions.find(s => s.id === statusId)?.label || 'Unrecorded', 'Punch In': punchLog.in || '', 'Punch In IP': punchLog.in_ip || '', 'Punch Out': punchLog.out || '', 'Punch Out IP': punchLog.out_ip || '', 'Active (Mins)': this.getActiveMinsForLog(punchLog, dateStr), 'Break (Mins)': this.calculateTotalBreakMins(punchLog.breaks), 'Captcha Fails': punchLog.captchas?.filter(c => c.status !== 'Passed').length || 0, 'Notes': notes });
                }
            });
            if (detailedRows.length === 0) return this.showNote("No data", "error");
            const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(detailedRows);
            ws['!cols'] = [{wch: 12}, {wch: 10}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 12}, {wch: 10}, {wch: 35}, {wch: 10}, {wch: 35}, {wch: 18}, {wch: 18}, {wch: 15}, {wch: 30}];
            XLSX.utils.book_append_sheet(wb, ws, "Detailed_Logs"); XLSX.writeFile(wb, `Detailed_Log_Report_${this.summaryStartDate}_to_${this.summaryEndDate}.xlsx`); this.showNote("Report Downloaded", "success");
        },

        exportSecurityAuditExcel() {
            if (!this.summaryStartDate || !this.summaryEndDate) return this.showNote("Invalid date range", "error");
            const sDate = new Date(this.summaryStartDate), eDate = new Date(this.summaryEndDate), auditRows = [];
            
            const parseNetworkString = (str) => {
                if (!str) return { ip: 'N/A', geo: 'US/Unknown', os: 'N/A' };
                let ip = str.split(' | ')[0] || 'N/A';
                let os = str.split(' | OS: ')[1] || 'N/A';
                let geo = 'US (Assumed)';
                if (ip.includes('[🚨 Outside US:')) {
                    const match = ip.match(/\[🚨 Outside US: (.*?)\]/);
                    if (match) geo = match[1];
                    ip = ip.replace(/ \[🚨 Outside US: .*?\]/, '');
                }
                return { ip: ip.trim(), geo: geo.trim(), os: os.trim() };
            };

            this.filteredMembers.forEach(m => {
                for (let d = new Date(sDate); d <= eDate; d.setDate(d.getDate() + 1)) {
                    const dateStr = getISTString(d);
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
            ws['!cols'] = [{wch: 12}, {wch: 25}, {wch: 18}, {wch: 18}, {wch: 18}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 15}, {wch: 15}, {wch: 20}];
            XLSX.utils.book_append_sheet(wb, ws, "Roster_Report");
            XLSX.writeFile(wb, `Roster_Report_${getISTString()}.xlsx`);
            this.showNote("Roster Report Downloaded", "success");
        },

        async executeFullSystemExport() { 
            if (!this.members || this.members.length === 0) return this.showNote("No data available to export", "error");

            this.showNote("Compiling Database Snapshot...", "success");
            const wb = XLSX.utils.book_new(); 

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
                            'Name': this.members.find(m => m.id === empId)?.name || 'Unknown', 
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
                        'Name': this.members.find(m => m.id === empId)?.name || 'Unknown', 
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
                'Reason': l.reason, 
                'Approval Status': l.status.toUpperCase() 
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
                let os = str.split(' | OS: ')[1] || 'N/A';
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
                    const mName = this.members.find(m => m.id === empId)?.name || 'Unknown';
                    
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

        openNewMemberForm() { this.isAddingMember = true; this.isEditing = false; this.newMember = { empId: '', firstName: '', lastName: '', dept: 'General', role: 'Staff', shift: 'General Shift', allowedPL: 0, allowedSL: 0, allowedPerm: 0, doj: '', doe: '', dob: '', pin: '', captchaEnabled: false }; },
        removeMember(id) { this.memberToDelete = id; this.showDeleteModal = true; },
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
