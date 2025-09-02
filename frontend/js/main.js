class GameManager {
    constructor() {
        this.gameServerUrl = localStorage.getItem('gameServerUrl') || (typeof config !== 'undefined' ? config.backendUrl : '');
        this.lmServerUrl = localStorage.getItem('lmServerUrl') || '';
        this.playerId = localStorage.getItem('playerId');
        this.nickname = localStorage.getItem('nickname') || '';
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.score = 0;
        this.correctAnswers = 0;
        this.questionCount = 0;
        this.timer = null;
        this.timeLimit = 300;
        this.initialTimeLimit = 300;
        this.questionsPerGame = 10;
        this.currentMode = 'solo';
        this.isMatchmaking = false;
        this.isProcessingAI = false;
        this.isLocked = false;
        this.hasUsedPass = false;
        this.allowPass = true;
        this.matchmakingStatus = {};
        this.lobbyPollInterval = null;
        this.serverStatsInterval = null;
        this.heartbeatInterval = null;
        this.currentGameId = null;
        this.gameStateInterval = null;
        this._hasSubmittedDone = false;
        this._vsCountdownVisible = false;
        this._autoReturnInterval = null;

        // Voice recognition properties
        this.recognition = null;
        this.isVoiceActive = false;
        this.voiceEnabled = false;

        // Pass counter for VS mode
        this.passesUsed = 0;
        this.maxPasses = 3;

        // Advanced scoring and timing
        this.questionStartTime = null;
        this.questionTimeLimit = 25;
        this.questionTimer = null;
        this.pausedTime = null;
        this.baseScore = 100;
        this.timeBonus = 0;
        
        // Mobile detection and optimization
        this.isMobile = this.detectMobile();
        this.isTouch = 'ontouchstart' in window;

        // Input validation and security
        this.inputLimits = {
            answer: 100,
            nickname: 30,
            url: 200,
            general: 500
        };
        this.inputRateLimit = new Map();
        this.maxRequestsPerMinute = 60;
        
        this.el = {};
        this.cacheElements();
        this.attachEventListeners();
        this.loadSettings();
        this.initUI();
        this.initVoiceRecognition();
        this.setupAudioUnlock();
        
        if (this.isMobile) {
            this.initMobileOptimizations();
            try { this.updateVh(); window.addEventListener('resize', () => this.updateVh()); } catch (e) {}
        }
    }

    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               window.innerWidth <= 900;
    }

    initMobileOptimizations() {
        // Prevent zoom on double tap
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        });

        // Prevent iOS zoom on input focus
        const inputs = document.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            if (input.style.fontSize !== '16px') {
                input.style.fontSize = '16px';
            }
        });

        // Add mobile-specific body class
        document.body.classList.add('mobile-device');

        // Optimize viewport for mobile
        let viewport = document.querySelector('meta[name=viewport]');
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = 'viewport';
            document.head.appendChild(viewport);
        }
        viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
    }

    updateVh() {
        try {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        } catch (e) {}
    }

    // Workaround for browser autoplay policies: wait for first user gesture to unlock audio
    setupAudioUnlock() {
        this.audioUnlocked = false;
        this.pendingBGM = null;
        const unlock = (e) => {
            try {
                this.audioUnlocked = true;
                this.ensureAudioManager();
                // if a BGM was requested before unlock, play it now
                if (this.pendingBGM) {
                    try { this.playBGM(this.pendingBGM); } catch (e) {}
                    this.pendingBGM = null;
                }
            } catch (err) {
                console.warn('audio unlock failed', err);
            } finally {
                // remove listeners after first gesture
                document.removeEventListener('click', unlock);
                document.removeEventListener('keydown', unlock);
                document.removeEventListener('touchstart', unlock);
            }
        };
        document.addEventListener('click', unlock, { once: true });
        document.addEventListener('keydown', unlock, { once: true });
        document.addEventListener('touchstart', unlock, { once: true });
    }

    cacheElements() {
        const el = {
            startupOverlay: document.getElementById('startup-overlay'),
            mainMenu: document.getElementById('main-menu'),
            gameScreen: document.getElementById('game-screen'),
            settingsModal: document.getElementById('settings-modal'),
            leaderboardModal: document.getElementById('leaderboard-modal'),
            achievementsModal: document.getElementById('achievements-modal'),
            resultModal: document.getElementById('result-modal'),
            tutorialSelectModal: document.getElementById('tutorial-select-modal'),
            tutorialOverlay: document.getElementById('tutorial-overlay'),
            bigCountdown: document.getElementById('big-countdown'),
            practiceSetupModal: document.getElementById('practice-setup-modal'),
            matchSelectModal: document.getElementById('match-select-modal'),
            randomMatchModal: document.getElementById('random-match-modal'),
            roomModal: document.getElementById('room-modal'),
            startupServer: document.getElementById('startup-server'),
            startupLmserver: document.getElementById('startup-lmserver'),
            startupNickname: document.getElementById('startup-nickname'),
            connectServerBtn: document.getElementById('connect-server-btn'),
            connectionStatus: document.getElementById('connection-status'),
            lobbyStatusContainer: document.getElementById('lobby-status-container'),
            lobbyStatus: document.getElementById('lobby-status'),
            lobbyDetails: document.getElementById('lobby-details'),
            lobbyMinigame: document.getElementById('lobby-minigame'),
            minigameArea: document.getElementById('minigame-area'),
            minigameBtn: document.getElementById('minigame-btn'),
            minigameScore: document.getElementById('minigame-score'),
            startupForceLm: document.getElementById('startup-force-lm'),
            soloModeBtn: document.getElementById('solo-mode-btn'),
            vsModeBtn: document.getElementById('vs-mode-btn'),
            rtaModeBtn: document.getElementById('rta-mode-btn'),
            practiceModeBtn: document.getElementById('practice-mode-btn'),
            leaderboardBtn: document.getElementById('leaderboard-btn'),
            achievementsBtn: document.getElementById('achievements-btn'),
            settingsMainBtn: document.getElementById('settings-main-btn'),
            backToMenuBtn: document.getElementById('back-to-menu-btn'),
            currentMode: document.getElementById('current-mode'),
            questionNumber: document.getElementById('question-number'),
            totalQuestions: document.getElementById('total-questions'),
            currentScore: document.getElementById('current-score'),
            timerWrapper: document.querySelector('.timer-wrapper'),
            timerDisplay: document.getElementById('timer-display'),
            targetAnswer: document.getElementById('target-answer'),
            aiOutput: document.getElementById('ai-output'),
            aiAnalysis: document.getElementById('ai-analysis'),
            aiStatus: document.getElementById('ai-status'),
            playerQuestion: document.getElementById('player-question'),
            questionHistory: document.getElementById('question-history'),
            questionCount: document.getElementById('question-count'),
            clearQuestionBtn: document.getElementById('clear-question-btn'),
            submitQuestionBtn: document.getElementById('submit-question-btn'),
            totalScore: document.getElementById('total-score'),
            correctCount: document.getElementById('correct-count'),
            accuracy: document.getElementById('accuracy'),
            progressFill: document.getElementById('progress-fill'),
            finalScore: document.getElementById('final-score'),
            resultCorrect: document.getElementById('result-correct'),
            resultQuestions: document.getElementById('result-questions'),
            resultAccuracy: document.getElementById('result-accuracy'),
            resultTime: document.getElementById('result-time'),
            playAgainBtn: document.getElementById('play-again-btn'),
            backToMenuResultBtn: document.getElementById('back-to-menu-result-btn'),
            saveSettingsBtn: document.getElementById('save-settings-btn'),
            theme: document.getElementById('theme'),
            gameServerAddress: document.getElementById('game-server-address'),
            lmServerAddress: document.getElementById('lm-server-address'),
            leaderboardList: document.getElementById('leaderboard-list'),
            matchRandomBtn: document.getElementById('match-random-btn'),
            matchCustomBtn: document.getElementById('match-custom-btn'),
            randomRuleSelect: document.getElementById('random-rule-select'),
            ruleDescription: document.getElementById('rule-description'),
            randomJoinBtn: document.getElementById('random-join-btn'),
            createRoomBtn: document.getElementById('create-room-btn'),
            joinRoomBtn: document.getElementById('join-room-btn'),
            roomStatus: document.getElementById('room-status'),
            roomName: document.getElementById('room-name'),
            roomPassword: document.getElementById('room-password'),
            roomMax: document.getElementById('room-max'),
            roomRule: document.getElementById('room-rule'),
            joinRoomId: document.getElementById('join-room-id'),
            joinRoomPassword: document.getElementById('join-room-password'),
            practiceQuestions: document.getElementById('practice-questions'),
            practiceTime: document.getElementById('practice-time'),
            practiceStartBtn: document.getElementById('practice-start-btn'),
            controlsStartBtn: document.getElementById('controls-start-btn'),
            controlsBackBtn: document.getElementById('controls-back-btn'),
            serverStats: document.getElementById('server-stats'),
            persistentStatusContainer: document.getElementById('persistent-status-container'),
            matchmakingStatus: document.getElementById('matchmaking-status'),
            cancelMatchmakingBtn: document.getElementById('cancel-matchmaking-btn'),
            matchFoundModal: document.getElementById('match-found-modal'),
            matchFoundCountdown: document.getElementById('match-found-countdown')
        };
        this.el = el;
    }

    attachEventListeners() {
        const safeAdd = (el, ev, fn) => {
            if (el) el.addEventListener(ev, fn.bind(this));
        };

        safeAdd(this.el.connectServerBtn, 'click', this.startupConnect);
        safeAdd(this.el.soloModeBtn, 'click', this.startSoloMode);
        safeAdd(this.el.vsModeBtn, 'click', () => this.showModal('match-select-modal'));
        safeAdd(this.el.rtaModeBtn, 'click', this.startRtaMode);
        safeAdd(this.el.practiceModeBtn, 'click', () => this.showModal('practice-setup-modal'));
        safeAdd(this.el.settingsMainBtn, 'click', () => this.showModal('settings-modal'));
        safeAdd(this.el.leaderboardBtn, 'click', this.showLeaderboard);
        safeAdd(this.el.achievementsBtn, 'click', () => this.showModal('achievements-modal'));
        safeAdd(this.el.backToMenuBtn, 'click', this.goBackToMenu);
        safeAdd(this.el.submitQuestionBtn, 'click', this.submitQuestion);
        safeAdd(this.el.clearQuestionBtn, 'click', this.clearQuestion);
        
        // Mobile-optimized input handling
        if (this.isMobile) {
            // Use touchend for better mobile responsiveness
            const mobileElements = [
                this.el.submitQuestionBtn,
                this.el.clearQuestionBtn,
                this.el.connectServerBtn
            ];
            
            mobileElements.forEach(el => {
                if (el) {
                    el.addEventListener('touchend', (e) => {
                        e.preventDefault();
                        el.click();
                    });
                }
            });
            
            // Simplified keyboard handling for mobile
            safeAdd(this.el.playerQuestion, 'keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    this.submitQuestion();
                }
            });
        } else {
            // Desktop keyboard shortcuts
            safeAdd(this.el.playerQuestion, 'keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.submitQuestion();
            });
        }

        // New UI element event listeners
        const newPlayerTextarea = document.querySelector('.player-textarea');
        if (newPlayerTextarea) {
            if (this.isMobile) {
                newPlayerTextarea.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                        e.preventDefault();
                        this.submitQuestion();
                    }
                });
            } else {
                newPlayerTextarea.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.submitQuestion();
                });
            }
        }

        const newSubmitBtn = document.querySelector('.btn-submit');
        if (newSubmitBtn) {
            newSubmitBtn.addEventListener('click', () => this.submitQuestion());
            if (this.isMobile) {
                newSubmitBtn.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    this.submitQuestion();
                });
            }
        }

        const newClearBtn = document.querySelector('.btn-clear');
        if (newClearBtn) {
            newClearBtn.addEventListener('click', () => this.clearQuestion());
        }
        
        const passBtn = document.getElementById('pass-btn') || document.querySelector('.pass-btn');
        if (passBtn) passBtn.addEventListener('click', () => this.passQuestion());

        // Mobile input focus handling: ensure AI output is visible when keyboard opens
        try {
            if (this.isMobile && this.el.playerQuestion) {
                this.el.playerQuestion.addEventListener('focus', () => {
                    setTimeout(() => {
                        const ai = document.getElementById('ai-output');
                        if (ai) ai.scrollIntoView({behavior:'smooth', block:'center'});
                        // reduce game content height to viewport when keyboard open
                        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
                        // add helper class so CSS can expand AI box when keyboard is visible
                        document.body.classList.add('keyboard-open');
                    }, 250);
                });
                this.el.playerQuestion.addEventListener('blur', () => {
                    setTimeout(() => {
                        // restore vh
                        this.updateVh();
                        document.body.classList.remove('keyboard-open');
                    }, 200);
                });
            }
        } catch (e) {}

        document.querySelectorAll('.modal .close-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.closeParentModal(e.target));
        });
        safeAdd(this.el.saveSettingsBtn, 'click', this.saveSettings);
        safeAdd(this.el.playAgainBtn, 'click', () => this.startGame(this.currentMode));
        safeAdd(this.el.backToMenuResultBtn, 'click', this.goBackToMenu);
        safeAdd(this.el.practiceStartBtn, 'click', this.startPracticeMode);
        safeAdd(this.el.matchRandomBtn, 'click', () => { this.showModal('random-match-modal'); this.closeModal('match-select-modal'); });
        safeAdd(this.el.matchCustomBtn, 'click', () => { this.showModal('room-modal'); this.closeModal('match-select-modal'); });
        safeAdd(this.el.randomRuleSelect, 'change', this.updateRuleDescription);
        safeAdd(this.el.randomJoinBtn, 'click', this.joinRandomMatch);
        safeAdd(this.el.createRoomBtn, 'click', this.createRoom);
        safeAdd(this.el.joinRoomBtn, 'click', this.joinRoom);
        safeAdd(this.el.cancelMatchmakingBtn, 'click', this.cancelMatchmaking);

        // Voice recognition event listeners
        const voiceToggle = document.getElementById('voice-toggle');
        const voiceInputBtn = document.getElementById('voice-input-btn');
        if (voiceToggle) voiceToggle.addEventListener('click', () => this.toggleVoiceRecognition());
        if (voiceInputBtn) voiceInputBtn.addEventListener('click', () => this.toggleVoiceRecognition());

        // Pass system event listener
        const passBtnNew = document.getElementById('pass-btn');
        if (passBtnNew) passBtnNew.addEventListener('click', () => this.usePass());

        // Tutorial event listeners: bind safely (retry if elements not yet present)
        const bindTutorialButtons = () => {
            const yes = document.getElementById('tutorial-yes-btn');
            const no = document.getElementById('tutorial-no-btn');
            const prev = document.getElementById('tutorial-prev-btn');
            const next = document.getElementById('tutorial-next-btn');
            const skip = document.getElementById('tutorial-skip-btn');
            if (yes) yes.addEventListener('click', () => this.startTutorial());
            if (no) no.addEventListener('click', () => this.closeTutorialSelect());
            if (prev) prev.addEventListener('click', () => this.previousTutorialStep());
            if (next) next.addEventListener('click', () => this.nextTutorialStep());
            if (skip) skip.addEventListener('click', () => this.endTutorial());
            // if not all found, retry shortly (max 5 attempts)
            return !!(yes && no && prev && next && skip);
        };
        let tutorialBindAttempts = 0;
        const tryBindTutorial = () => {
            tutorialBindAttempts++;
            const ok = bindTutorialButtons();
            if (!ok && tutorialBindAttempts < 6) {
                setTimeout(tryBindTutorial, 200);
            }
        };
        tryBindTutorial();

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn));
        });
    }

    initUI() {
        this.showScreen('main-menu');
        this.showModal('startup-overlay');
        // Pre-fill server input but keep it visible so users can override if needed.
        if (this.el.startupServer) {
            this.el.startupServer.value = window.location.origin;
        }
        if (this.lmServerUrl && this.el.startupLmserver) this.el.startupLmserver.value = this.lmServerUrl;
        if (this.nickname && this.el.startupNickname) this.el.startupNickname.value = this.nickname;
        this.updateRuleDescription();
    }

    loadSettings() {
        // Load theme
        const savedTheme = localStorage.getItem('theme') || 'glassmorphism';
        this.applyTheme(savedTheme);
        if (this.el.theme) {
            this.el.theme.value = savedTheme;
        }
        
        // Load layout
        const savedLayout = localStorage.getItem('uiLayout') || 'standard';
        this.applyLayout(savedLayout);
        const layoutSelect = document.getElementById('ui-layout');
        if (layoutSelect) {
            layoutSelect.value = savedLayout;
        }
        
        // Load other settings
        if (this.el.gameServerAddress) this.el.gameServerAddress.value = this.gameServerUrl;
        if (this.el.lmServerAddress) this.el.lmServerAddress.value = this.lmServerUrl;
    }

    saveSettings() {
        try {
            // Validate and save LM server URL
            if (this.el.lmServerAddress) {
                const lmUrl = this.el.lmServerAddress.value.trim();
                if (lmUrl) {
                    this.lmServerUrl = this.validateUrl(lmUrl);
                } else {
                    this.lmServerUrl = '';
                }
            }
            
            // Validate theme selection
            const theme = this.el.theme ? this.el.theme.value : 'glassmorphism';
            const validThemes = ['glassmorphism', 'gaming', 'light', 'cyberpunk'];
            const selectedTheme = validThemes.includes(theme) ? theme : 'glassmorphism';
            
            // Validate layout selection
            const layoutSelect = document.getElementById('ui-layout');
            const layout = layoutSelect ? layoutSelect.value : 'standard';
            const validLayouts = ['standard', 'compact', 'wide', 'minimal'];
            const selectedLayout = validLayouts.includes(layout) ? layout : 'standard';
            
            // Save to localStorage with validation
            localStorage.setItem('lmServerUrl', this.lmServerUrl);
            localStorage.setItem('theme', selectedTheme);
            localStorage.setItem('uiLayout', selectedLayout);
            
            this.applyTheme(selectedTheme);
            this.applyLayout(selectedLayout);
            this.showNotification('設定を保存しました', 'success');
            this.closeModal('settings-modal');
            
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showNotification(this.sanitizeInput(error.message || '設定の保存に失敗しました'), 'error');
        }
    }

    applyTheme(theme) {
        document.documentElement.className = theme;
    }

    applyLayout(layout) {
        document.documentElement.setAttribute('data-layout', layout);
    }

    loadSettings() {
        // Load theme
        const savedTheme = localStorage.getItem('theme') || 'glassmorphism';
        this.applyTheme(savedTheme);
        if (this.el.theme) {
            this.el.theme.value = savedTheme;
        }
        
        // Load layout
        const savedLayout = localStorage.getItem('uiLayout') || 'standard';
        this.applyLayout(savedLayout);
        const layoutSelect = document.getElementById('ui-layout');
        if (layoutSelect) {
            layoutSelect.value = savedLayout;
        }
        
        // Load other settings
        if (this.el.gameServerAddress) this.el.gameServerAddress.value = this.gameServerUrl;
        if (this.el.lmServerAddress) this.el.lmServerAddress.value = this.lmServerUrl;
    }

    async startupConnect() {
    // Prefer the value in the startup input (allows connecting to remote server),
    // fall back to window.location.origin if empty.
    const serverInput = this.el.startupServer ? this.el.startupServer.value.trim() : '';
    const server = serverInput || window.location.origin;
        const lm = this.el.startupLmserver ? this.el.startupLmserver.value.trim() : '';
        const nick = this.el.startupNickname ? this.el.startupNickname.value.trim() : '';
        const force = this.el.startupForceLm ? this.el.startupForceLm.checked : false;

        if (!nick) {
            return this.showNotification('ニックネームを入力してください', 'error');
        }

        if (this.el.connectServerBtn) this.el.connectServerBtn.disabled = true;
        if (this.el.connectionStatus) this.el.connectionStatus.textContent = 'サーバーに接続中...';

        try {
            // Try the chosen server first. If it fails (e.g., static file server at :9000),
            // attempt common local backend fallbacks so users don't have to edit the field.
            // Use GameAPI helper to detect reachable server
            const statusResult = await window.GameAPI.checkStatus(server);
            const info = statusResult.info;
            const chosenServer = statusResult.chosenServer || server;
            if (this.el.connectionStatus) this.el.connectionStatus.textContent = `ゲームサーバー: OK (ID: ${info.server_id ? info.server_id.slice(0,8) : (info.message||'')})`;
            this.gameServerUrl = chosenServer;
            this.nickname = nick;

            if (lm && !force) {
                if (this.el.connectionStatus) this.el.connectionStatus.textContent += ' | LMStudioに接続中...';
                const probej = await window.GameAPI.probeLM(this.gameServerUrl, lm);
                if (!probej.ok) throw new Error(`LMStudioに接続できません: ${probej.error || '不明なエラー'}`);
                if (this.el.connectionStatus) this.el.connectionStatus.textContent = this.el.connectionStatus.textContent.replace(' | LMStudioに接続中...', ' | LMStudio: OK');
            }
            this.lmServerUrl = lm;

            const bgmCheckbox = document.getElementById('startup-bgm-enabled');
            this.startWithBgm = bgmCheckbox ? !!bgmCheckbox.checked : true;

            // Always register a new player for simplicity and robustness
            const regj = await window.GameAPI.register(this.gameServerUrl, nick);
            if (!regj.player_id) throw new Error('プレイヤー登録に失敗しました');
            this.playerId = regj.player_id;
            if (regj.session_token) {
                this.sessionToken = regj.session_token;
                localStorage.setItem('sessionToken', this.sessionToken);
            }

            localStorage.setItem('gameServerUrl', this.gameServerUrl);
            localStorage.setItem('lmServerUrl', this.lmServerUrl);
            localStorage.setItem('nickname', this.nickname);
            if (this.playerId) localStorage.setItem('playerId', this.playerId);

            if (this.startWithBgm) this.playBGM('menu.mp3');

            this.showNotification('接続しました！', 'success');
            this.closeModal('startup-overlay');

            const hasSeenTutorial = localStorage.getItem('hasSeenTutorial');
            if (!hasSeenTutorial) {
                setTimeout(() => {
                    const modal = document.getElementById('tutorial-select-modal');
                    if (modal) modal.classList.add('active');
                }, 120);
            }
            
            this.startHeartbeat();
            this.startServerStatsPolling();
            // if user had a pending matchmaking intent saved (reload during matchmaking), try to resume it
            try { this.restorePendingMatch(); } catch(e) { console.warn('restorePendingMatch err', e); }

        } catch (e) {
            if (this.el.connectionStatus) this.el.connectionStatus.textContent = `接続失敗: ${e.message}`;
            this.showNotification(e.message, 'error');
        } finally {
            if (this.el.connectServerBtn) this.el.connectServerBtn.disabled = false;
        }
    }

    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(async () => {
            if (!this.playerId || !this.gameServerUrl) return;
            try {
                const hbPayload = { player_id: this.playerId };
                if (this.sessionToken) hbPayload.session_token = this.sessionToken;
                await fetch(`${this.gameServerUrl}/heartbeat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(hbPayload)
                });
            } catch (e) {
                console.warn('Heartbeat failed:', e);
            }
        }, 15000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
    }

    startServerStatsPolling() {
        if (this.serverStatsInterval) clearInterval(this.serverStatsInterval);
        const updateStats = async () => {
            if (!this.gameServerUrl || !this.el.serverStats) return;
            try {
                const res = await fetch(`${this.gameServerUrl}/server/stats`);
                const stats = await res.json();
                this.el.serverStats.textContent = `サーバー情報: ${stats.active_players}人接続中 | ${stats.players_waiting_random}人待機中`;
            } catch (e) {
                this.el.serverStats.textContent = 'サーバー情報: 取得失敗';
            }
        };
        updateStats();
        this.serverStatsInterval = setInterval(updateStats, 5000);
    }

    // Ensure any leftover matchmaking state is cleared before starting local modes
    cleanupMatchmakingBeforeLocalStart() {
        try {
            if (this.isMatchmaking) {
                console.log('[GameManager] cleaning up leftover matchmaking state before local start');
            }
        } catch(e){}
        this.isMatchmaking = false;
        try { this.stopLobbyPolling(); } catch(e){}
        try { this.hidePersistentStatusUI(); } catch(e){}
        try { this.disableMatchButtons(false); } catch(e){}
    }

    disableMatchButtons(disabled) {
        const ids = ['matchRandomBtn','matchCustomBtn','randomJoinBtn','createRoomBtn','joinRoomBtn'];
        ids.forEach(id => { const b = this.el[id]; if (b) b.disabled = disabled; });
    }

    async startSoloMode() {
    // clear any leftover matchmaking to ensure solo starts clean
    this.cleanupMatchmakingBeforeLocalStart();
        this.currentMode = 'solo';
        this.timeLimit = 0;
        this.questionsPerGame = 10;
        this.questionTimeLimit = 25; // 25 seconds per question
        this.questionStartTime = null;
        this.questionTimer = null;
        if (this.el.timerWrapper) this.el.timerWrapper.style.display = 'none';
        await this.fetchQuestionsAndStartGame();
    }

    async startRtaMode() {
    this.cleanupMatchmakingBeforeLocalStart();
        this.currentMode = 'rta';
        this.timeLimit = 180;
        this.questionsPerGame = 10;
        this.questionTimeLimit = 25; // 25 seconds per question
        this.questionStartTime = null;
        this.questionTimer = null;
        if (this.el.timerWrapper) this.el.timerWrapper.style.display = 'block';
        await this.fetchQuestionsAndStartGame();
    }

    startPracticeMode() {
        this.cleanupMatchmakingBeforeLocalStart();
        this.currentMode = 'practice';
        
        // Read practice settings from the modal
        const practiceSettings = this.getPracticeSettings();
        console.log('[Practice] Starting with settings:', practiceSettings);
        
        this.questionsPerGame = practiceSettings.questionsPerGame;
        this.timeLimit = practiceSettings.timeLimit;
        this.questionTimeLimit = 25; // 25 seconds per question
        this.questionStartTime = null;
        this.questionTimer = null;
        
        // Store practice filters for question fetching
        this.practiceFilters = practiceSettings.filters;
        
        this.closeModal('practice-setup-modal');
        if (this.el.timerWrapper) this.el.timerWrapper.style.display = 'block';
        this.fetchQuestionsAndStartGame();
    }

    getPracticeSettings() {
        const settings = {
            questionsPerGame: 10,
            timeLimit: 300, // 5 minutes default
            filters: {}
        };
        
        try {
            // Read question count
            if (this.el.practiceQuestions) {
                settings.questionsPerGame = parseInt(this.el.practiceQuestions.value, 10) || 10;
            }
            
            // Read time limit
            if (this.el.practiceTime) {
                settings.timeLimit = (parseInt(this.el.practiceTime.value, 10) || 5) * 60;
            }
            
            // Read difficulty filter
            const difficultyRadio = document.querySelector('input[name="difficulty"]:checked');
            if (difficultyRadio) {
                settings.filters.difficulty = difficultyRadio.value;
            }
            
            // Read category filter
            const categoryRadio = document.querySelector('input[name="category"]:checked');
            if (categoryRadio) {
                settings.filters.category = categoryRadio.value;
            }
            
            // Read question length filter
            const lengthRadio = document.querySelector('input[name="questionLength"]:checked');
            if (lengthRadio) {
                settings.filters.questionLength = lengthRadio.value;
            }
            
        } catch (error) {
            console.warn('[Practice] Error reading settings:', error);
        }
        
        return settings;
    }

    async fetchQuestionsAndStartGame() {
        try {
            this.showNotification('問題を読み込み中...', 'info');
            console.log('[GameManager] fetching questions from', this.gameServerUrl);
            
            let data = null;
            
            try {
                // Validate server URL
                if (!this.gameServerUrl) {
                    throw new Error('ゲームサーバーURLが設定されていません');
                }

                // Try to fetch from server with proper error handling
                data = await window.GameAPI.fetchSoloQuestions(this.gameServerUrl, this.questionsPerGame);
                
                if (data.error) {
                    throw new Error(data.error);
                }
                
                if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
                    throw new Error('サーバーから有効な問題が取得できませんでした');
                }

                // Validate and clean server questions
                const validQuestions = this.validateAndCleanQuestions(data.questions);
                if (validQuestions.length === 0) {
                    throw new Error('サーバーの問題データが無効です');
                }

                this.questions = validQuestions.slice(0, this.questionsPerGame);
                console.log(`[GameManager] loaded ${this.questions.length} valid questions from server`);
                
            } catch (serverErr) {
                console.warn('[GameManager] failed to fetch from server, attempting local fallback:', serverErr);
                
                // Try local bundled questions as a fallback for offline/dev usage
                try {
                    const localRes = await fetch('data/questions.json', {
                        headers: { 'Accept': 'application/json' },
                        cache: 'no-cache'
                    });
                    
                    if (!localRes.ok) {
                        throw new Error(`ローカルファイルの読み込みに失敗: ${localRes.status}`);
                    }
                    
                    const localData = await localRes.json();
                    let questions = [];
                    
                    if (Array.isArray(localData)) {
                        questions = localData;
                    } else if (localData && Array.isArray(localData.questions)) {
                        questions = localData.questions;
                    } else {
                        throw new Error('ローカル問題ファイルの形式が無効です');
                    }

                    const validQuestions = this.validateAndCleanQuestions(questions);
                    if (validQuestions.length === 0) {
                        throw new Error('ローカル問題ファイルに有効な問題がありません');
                    }

                    this.questions = validQuestions.slice(0, this.questionsPerGame);
                    console.log(`[GameManager] loaded ${this.questions.length} questions from local fallback`);
                    this.showNotification('ローカル問題ファイルを使用します', 'warning');
                    
                } catch (localErr) {
                    console.error('[GameManager] local fallback failed:', localErr);
                    
                    // Final fallback: use hardcoded questions
                    this.questions = this.createDefaultQuestions();
                    this.showNotification('デフォルト問題を使用します', 'warning');
                    console.log('[GameManager] using default questions as final fallback');
                }
            }

            // Final validation
            if (!this.questions || this.questions.length === 0) {
                throw new Error('問題が見つかりませんでした');
            }

            this.showNotification(`${this.questions.length}問の問題を読み込みました`, 'success');
            this.startGame(this.currentMode);
            
        } catch (e) {
            const errorMessage = e.message || '問題の取得に失敗しました';
            this.showNotification(errorMessage, 'error');
            console.error('Failed to fetch questions:', e);
            
            // Don't start game if no questions available
            if (!this.questions || this.questions.length === 0) {
                this.goBackToMenu();
            }
        }
    }

    validateAndCleanQuestions(questions) {
        if (!Array.isArray(questions)) {
            console.warn('Questions is not an array:', typeof questions);
            return [];
        }

        const validQuestions = [];
        
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            
            try {
                // Basic validation
                if (!q || typeof q !== 'object') {
                    console.warn(`Question ${i} is not an object:`, q);
                    continue;
                }

                // Ensure required fields exist
                let answers = [];
                if (Array.isArray(q.answers)) {
                    answers = q.answers.filter(ans => typeof ans === 'string' && ans.trim().length > 0);
                } else if (typeof q.answer === 'string' && q.answer.trim()) {
                    answers = [q.answer.trim()];
                } else if (typeof q.target === 'string' && q.target.trim()) {
                    answers = [q.target.trim()];
                }

                if (answers.length === 0) {
                    console.warn(`Question ${i} has no valid answers:`, q);
                    continue;
                }

                // Create normalized question object
                const normalizedQuestion = {
                    id: q.id || `q_${i}`,
                    answers: answers,
                    prompt: (q.prompt || q.question || q.text || '').trim(),
                    category: q.category || 'general',
                    difficulty: q.difficulty || 'medium',
                    tags: Array.isArray(q.tags) ? q.tags : []
                };

                // Additional validation
                if (normalizedQuestion.answers[0].length > 100) {
                    console.warn(`Question ${i} answer too long:`, normalizedQuestion.answers[0]);
                    continue;
                }

                validQuestions.push(normalizedQuestion);
                
            } catch (error) {
                console.warn(`Error processing question ${i}:`, error, q);
                continue;
            }
        }

        console.log(`Validated ${validQuestions.length}/${questions.length} questions`);
        return validQuestions;
    }

    createDefaultQuestions() {
        return [
            {
                id: 'default_1',
                answers: ['東京'],
                prompt: '日本の首都は？',
                category: 'geography',
                difficulty: 'easy'
            },
            {
                id: 'default_2', 
                answers: ['富士山'],
                prompt: '日本で最も高い山は？',
                category: 'geography',
                difficulty: 'easy'
            },
            {
                id: 'default_3',
                answers: ['太平洋'],
                prompt: '世界最大の海は？',
                category: 'geography', 
                difficulty: 'medium'
            }
        ];
    }

    startGame(mode) {
        // Start the game after a short countdown to prevent accidental inputs
        this.startGameWithCountdown(mode, 3);
    }

    // Begin actual game logic immediately (called after countdown)
    beginGame(mode) {
        this.currentMode = mode;
        this.resetGameState();
        this.showNotification('ゲームを開始します...', 'info');
    // Mark page as game-active to allow CSS to position the game screen safely
    document.body.classList.add('game-active');
    this.showScreen('game-screen');
        this.closeAllModals();

        console.log('[GameManager] beginGame called, mode=', mode, 'questions count=', this.questions ? this.questions.length : 0);
        this.updateGameHUD();
        this.showQuestion();
        if (this.timeLimit > 0) {
            this.startTimer();
        }
        // play default BGM for gameplay
        try { this.playBGM('fighting_bgm.mp3'); } catch (e) {}
    }

    startGameWithCountdown(mode, seconds) {
        if (!seconds || seconds <= 0) return this.beginGame(mode);
        // lock UI
        this.isLocked = true;
        if (this.el.submitQuestionBtn) this.el.submitQuestionBtn.disabled = true;
        if (this.el.playerQuestion) this.el.playerQuestion.disabled = true;
        // show big countdown overlay
        const overlay = document.getElementById('big-countdown');
        const numberEl = document.getElementById('big-count-number');
        console.log('[GameManager] startGameWithCountdown called, mode=', mode, 'seconds=', seconds, 'overlay=', !!overlay, 'numberEl=', !!numberEl);
        if (overlay && numberEl) {
            overlay.classList.add('active');
            let count = seconds;
            const tick = async () => {
                numberEl.textContent = String(count);
                // animate
                numberEl.style.animation = 'none';
                // force reflow
                void numberEl.offsetWidth;
                numberEl.style.animation = `countdown-pop 900ms cubic-bezier(.2,.8,.2,1)`;
                try { if (this.startWithBgm) this.playSE('count_down.mp3'); } catch (e) {}
                console.log('[GameManager] countdown tick:', count);
                count--;
                if (count < 0) {
                    console.log('[GameManager] countdown finished, starting game now');
                    overlay.classList.remove('active');
                    this.isLocked = false;
                    if (this.el.submitQuestionBtn) this.el.submitQuestionBtn.disabled = false;
                    if (this.el.playerQuestion) this.el.playerQuestion.disabled = false;
                    // give a tiny delay to let overlay removal render
                    setTimeout(() => {
                        this.showNotification('カウントダウン完了。ゲームを開始します。', 'info');
                        this.beginGame(mode);
                    }, 80);
                    return;
                }
                setTimeout(tick, 900);
            };
            // start
            setTimeout(tick, 80);
        } else {
            // fallback to simple countdown
            let countdown = seconds;
            if (this.el.matchFoundCountdown) this.el.matchFoundCountdown.textContent = countdown;
            const iv = setInterval(() => {
                countdown--;
                if (this.el.matchFoundCountdown) this.el.matchFoundCountdown.textContent = countdown;
                try { if (this.startWithBgm) this.playSE('count_down.mp3'); } catch (e) {}
                if (countdown <= 0) {
                    clearInterval(iv);
                    console.log('[GameManager] fallback countdown finished, starting game');
                    this.isLocked = false;
                    if (this.el.submitQuestionBtn) this.el.submitQuestionBtn.disabled = false;
                    if (this.el.playerQuestion) this.el.playerQuestion.disabled = false;
                    this.showNotification('カウントダウン完了。ゲームを開始します。', 'info');
                    this.beginGame(mode);
                }
            }, 1000);
        }
    }

    goBackToMenu() {
        // Clear any auto-return timer if active
        try { 
            if (this._autoReturnInterval) { 
                clearInterval(this._autoReturnInterval); 
                this._autoReturnInterval = null; 
            } 
        } catch (e) {}
        
        // Stop all game timers and processes
        this.stopAllTimers();
        this.clearQuestionTimer();
        this.isProcessingAI = false;
        this.isLocked = false;
        
        // Stop voice recognition if active
        if (this.isVoiceActive && this.recognition) {
            try {
                this.recognition.stop();
                this.isVoiceActive = false;
            } catch (error) {
                console.warn('Failed to stop voice recognition:', error);
            }
        }
        
        // Resume menu BGM
        try { this.playBGM('menu.mp3'); } catch (e) {}
        
        // Reset game state completely
        this.resetGameState();
        
        // Remove game-active class so CSS returns to menu layout
        document.body.classList.remove('game-active');
        
        // Show menu and close all modals
        this.showScreen('main-menu');
        this.closeAllModals();
        
        // Reset UI elements
        this.setAIStatus('待機中', '#808080');
        if (this.el.submitQuestionBtn) this.el.submitQuestionBtn.disabled = false;
    }

    stopAllTimers() {
        // Stop main game timer
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        
        // Stop question timer
        this.clearQuestionTimer();
        
        // Stop any polling intervals
        if (this.lobbyPollInterval) {
            clearInterval(this.lobbyPollInterval);
            this.lobbyPollInterval = null;
        }
        
        if (this.serverStatsInterval) {
            clearInterval(this.serverStatsInterval);
            this.serverStatsInterval = null;
        }
        
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        if (this.gameStateInterval) {
            clearInterval(this.gameStateInterval);
            this.gameStateInterval = null;
        }
        
        console.log('[Timer] All timers stopped');
    }

    updateRuleDescription() {
        if (!this.el.randomRuleSelect || !this.el.ruleDescription) return;
        const selectedRule = this.el.randomRuleSelect.value;
        const descriptions = {
            classic: '<b>クラシック:</b> 標準的なルールです。10問の問題に挑戦し、スコアを競います。',
            speed: '<b>スピード:</b> 短時間で決着！問題数は5問で、素早い判断が求められます。',
            challenge: '<b>チャレンジ:</b> 上級者向け。問題数が15問と多く、長丁場の戦いです。'
        };
        this.el.ruleDescription.innerHTML = descriptions[selectedRule] || '';
    }

    joinRandomMatch() {
    if (this.isMatchmaking) return this.showNotification('すでにエントリー中です', 'warning');
    const rule = this.el.randomRuleSelect ? this.el.randomRuleSelect.value : 'classic';
    this.closeModal('random-match-modal');
    this.isMatchmaking = true;
    this.matchmakingStatus = { type: 'random', rule: rule };
    this.disableMatchButtons(true);
    this.showPersistentStatusUI();
    const params = { rule };
    this.persistPendingMatch(params);
    this.startLobbyPolling(params);
    this.showNotification('対戦モードにエントリーしました。マッチングをお待ちください。', 'info');
    this.showScreen('main-menu');
    }

    async createRoom() {
    if (this.isMatchmaking) return this.showNotification('すでにエントリー中です', 'warning');
        const name = this.el.roomName ? this.el.roomName.value : '';
        const password = this.el.roomPassword ? this.el.roomPassword.value : '';
        const max_players = this.el.roomMax ? parseInt(this.el.roomMax.value, 10) : 3;
        const rule = this.el.roomRule ? this.el.roomRule.value : 'classic';
        try {
            const res = await fetch(`${this.gameServerUrl}/room/create`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ player_id: this.playerId, name, password, max_players, rule })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            this.isMatchmaking = true;
            this.matchmakingStatus = { type: 'room', roomId: data.room_id };
            this.disableMatchButtons(true);
            this.showPersistentStatusUI();
            const params = { roomId: data.room_id };
            this.persistPendingMatch(params);
            this.startLobbyPolling(params);
            this.closeModal('room-modal');
            this.showNotification('ルームを作成しました。プレイヤーを待っています。', 'info');
            this.showScreen('main-menu');
        } catch (e) {
            this.showNotification(`ルーム作成失敗: ${e.message}`, 'error');
        }
    }

    joinRoom() {
    if (this.isMatchmaking) return this.showNotification('すでにエントリー中です', 'warning');
        const roomId = this.el.joinRoomId ? this.el.joinRoomId.value.trim() : '';
        const password = this.el.joinRoomPassword ? this.el.joinRoomPassword.value.trim() : '';
        if (!roomId) return this.showNotification('ルームIDを入力してください', 'error');
        this.isMatchmaking = true;
        this.matchmakingStatus = { type: 'room', roomId: roomId };
    this.disableMatchButtons(true);
    this.showPersistentStatusUI();
    const params = { roomId, password };
    this.persistPendingMatch(params);
    this.startLobbyPolling(params);
        this.closeModal('room-modal');
        this.showNotification('ルームに参加しました。ゲーム開始をお待ちください。', 'info');
        this.showScreen('main-menu');
    }

    async cancelMatchmaking() {
        if (!this.isMatchmaking) return this.showNotification('現在マッチング中ではありません', 'warning');
        const cancelBtn = document.getElementById('cancel-matchmaking-btn');
        if (cancelBtn) { cancelBtn.disabled = true; cancelBtn.textContent = 'キャンセル中...'; }
        try {
            await fetch(`${this.gameServerUrl}/lobby/leave`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ player_id: this.playerId })
            });
        } catch (e) {
            console.error('Failed to leave lobby:', e);
            this.showNotification('キャンセルに失敗しました。ネットワークを確認してください。', 'error');
        }
        this.isMatchmaking = false;
        this.stopLobbyPolling();
        this.hidePersistentStatusUI();
        this.disableMatchButtons(false);
    try { this.clearPendingMatch(); } catch(e){}
    }

    startLobbyPolling(params) {
        if (this.lobbyPollInterval) clearInterval(this.lobbyPollInterval);
        
        const poll = async (retryCount = 0) => {
            if (!this.isMatchmaking) return this.stopLobbyPolling();
            try {
                const endpoint = params.roomId ? `${this.gameServerUrl}/room/join` : `${this.gameServerUrl}/lobby/join`;
                const payload = params.roomId 
                    ? { player_id: this.playerId, room_id: params.roomId, password: params.password || '' }
                    : { player_id: this.playerId, rule: params.rule };
                
                const res = await fetch(endpoint, { 
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'}, 
                    body: JSON.stringify(payload)
                });
                const data = await res.json();

                if (data.error) throw new Error(data.error);

                if (data.game_id) {
                    this.handleMatchFound(data);
                } else if (data.waiting) {
                    this.matchmakingStatus = { ...this.matchmakingStatus, ...data };
                    this.updatePersistentStatusUI();
                }
            } catch (e) {
                const msg = e && e.message ? e.message : String(e);
                this.showNotification(`ロビー接続エラー: ${msg}`, 'error');
                if (this.el.lobbyStatus) {
                    // give user a friendly hint if it's a network/CORS issue
                    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('CORS')) {
                        this.el.lobbyStatus.textContent = 'サーバーに接続できません（CORS設定またはサーバーが停止している可能性があります）。';
                    } else {
                        this.el.lobbyStatus.textContent = `ロビーエラー: ${msg}`;
                    }
                }
                if (retryCount < 2) {
                    setTimeout(() => poll(retryCount + 1), 2000 * (retryCount + 1)); // retry with backoff
                } else {
                    this.stopLobbyPolling();
                    this.hidePersistentStatusUI();
                }
            }
        };

        poll();
        this.lobbyPollInterval = setInterval(poll, 4000); // increased to 4s to reduce load
    }

    stopLobbyPolling() {
        if (this.lobbyPollInterval) clearInterval(this.lobbyPollInterval);
        this.lobbyPollInterval = null;
    }

    // Persist pending matchmaking intent so reloads can be reconciled with server state.
    persistPendingMatch(params) {
        try {
            localStorage.setItem('pendingMatch', JSON.stringify(params || {}));
        } catch (e) {}
    }

    clearPendingMatch() {
        try { localStorage.removeItem('pendingMatch'); } catch(e){}
    }

    restorePendingMatch() {
        try {
            const raw = localStorage.getItem('pendingMatch');
            if (!raw) return;
            const obj = JSON.parse(raw);
            if (!obj) return;
            // Only attempt restore if we have player and server info
            if (!this.playerId || !this.gameServerUrl) return;
            // show UI and resume polling to reconcile with server
            this.isMatchmaking = true;
            this.matchmakingStatus = { ...(this.matchmakingStatus || {}), ...obj };
            this.disableMatchButtons(true);
            this.showPersistentStatusUI();
            // resume polling with the saved params
            this.startLobbyPolling(obj);
        } catch (e) {
            console.warn('restorePendingMatch failed', e);
        }
    }

    showPersistentStatusUI() {
    if (this.el.persistentStatusContainer) this.el.persistentStatusContainer.style.display = 'flex';
    // ensure cancel button is enabled when showing
    const cancel = document.getElementById('cancel-matchmaking-btn');
    if (cancel) { cancel.disabled = false; cancel.textContent = 'キャンセル'; }
    // show quick floating cancel as well
    const quick = document.getElementById('quick-cancel-btn');
    if (quick) { quick.style.display = 'block'; quick.disabled = false; }
    this.updatePersistentStatusUI();
    }

    hidePersistentStatusUI() {
    if (this.el.persistentStatusContainer) this.el.persistentStatusContainer.style.display = 'none';
    const quick = document.getElementById('quick-cancel-btn');
    if (quick) quick.style.display = 'none';
    }

    updatePersistentStatusUI() {
        if (!this.el.matchmakingStatus || !this.isMatchmaking) {
            // hide if not matchmaking
            if (this.el.persistentStatusContainer) this.el.persistentStatusContainer.style.display = 'none';
            return;
        }
        const { type, rule, current_players, max_players, position, total_waiting } = this.matchmakingStatus;
        let statusText = '';
        if (type === 'random') {
            statusText = `マッチング中 (${this.getModeName(rule)}) — 順位: ${position || '?'} / 待機人数: ${total_waiting || '?'} `;
        } else if (type === 'room') {
            statusText = `ルーム待機中: ${current_players || '?'} / ${max_players || '?'} `;
        }
        if (this.el.matchmakingStatus) this.el.matchmakingStatus.textContent = statusText;
        // update cancel button label when player is first in queue
        const cancel = document.getElementById('cancel-matchmaking-btn');
        if (cancel) {
            if (position === 1) cancel.textContent = 'キャンセル（あなたが先頭）';
            else cancel.textContent = 'キャンセル';
        }
        // update waiting badge
        const badge = document.querySelector('#persistent-status-container .waiting-badge');
        if (badge) badge.textContent = String(total_waiting || '?');
    }

    async handleMatchFound(gameData) {
    this.isMatchmaking = false;
        this.stopLobbyPolling();
        this.hidePersistentStatusUI();
    try { this.clearPendingMatch(); } catch(e){}
        this.stopTimer();
        // Determine countdown seconds. If server provided a start_at timestamp, sync to it.
        let countdown = 5;
        if (gameData && gameData.start_at) {
            try {
                const startAt = Number(gameData.start_at);
                const now = Date.now();
                // detect seconds vs milliseconds
                const startMs = startAt > 1e12 ? startAt : startAt * 1000;
                const diffSec = Math.ceil((startMs - now) / 1000);
                if (!isNaN(diffSec) && diffSec > 0) countdown = diffSec;
                else countdown = 1;
            } catch (e) {
                countdown = 5;
            }
        }
        if (this.el.matchFoundCountdown) this.el.matchFoundCountdown.textContent = countdown;
        this.questions = gameData.questions.map(q => ({ ...q, answers: [] }));
        // Use the shared countdown routine
        this.startGameWithCountdown('vs', countdown);
        // Start polling game state (server provides game_id)
        if (gameData.game_id) {
            try { this.startGameStatePolling(gameData.game_id); } catch(e) { console.warn('startGameStatePolling failed', e); }
        }
    }

    resetGameState() {
        this.stopTimer();
        this.score = 0;
        this.correctAnswers = 0;
        this.questionCount = 0;
        this.currentQuestionIndex = 0;
        if (this.el.questionHistory) this.el.questionHistory.innerHTML = '';
        if (this.el.playerQuestion) this.el.playerQuestion.value = '';
        this.updateUI();
    }

    showQuestion() {
        if (!this.questions || this.questions.length === 0) {
            console.error('[GameManager] showQuestion: no questions loaded', this.questions);
            this.showNotification('問題が読み込まれていません。data/questions.json を確認してください。', 'error');
            return this.endGame();
        }
        if (this.currentQuestionIndex >= this.questions.length) {
            this.showNotification('ゲームの問題をすべて処理しました。', 'info');
            return this.endGame();
        }
        const q = this.questions[this.currentQuestionIndex];
        if (!q) {
            this.showNotification('現在の問題が無効です。次へ進みます。', 'warning');
            return this.nextQuestion();
        }

        console.log('[GameManager] showQuestion index=', this.currentQuestionIndex, 'question=', q);
        
        // Start question timer for solo/RTA/practice modes with 17-second limit
        if (['solo', 'rta', 'practice'].includes(this.currentMode) && this.questionTimeLimit > 0) {
            this.startQuestionTimer();
        }
        
        if (this.el.targetAnswer) {
            try {
                // Normalize answers: prefer q.answers array, fallback to q.answer string
                let answers = null;
                if (Array.isArray(q.answers) && q.answers.length) answers = q.answers;
                else if (typeof q.answer === 'string' && q.answer.trim().length) answers = [q.answer.trim()];

                let assignedText = '';
                // Always show the target to players (shared questions in multiplayer).
                if (answers && answers.length) {
                    assignedText = answers.join(' / ');
                } else {
                    assignedText = q.prompt || q.question || q.text || q.id || '';
                }
                this.el.targetAnswer.textContent = assignedText;
                // assign text to target element
                // If text overflows on small screens, enable marquee animation
                try {
                    const ta = this.el.targetAnswer;
                    if (ta && ta.scrollWidth > ta.clientWidth) {
                        ta.classList.add('marquee');
                    } else if (ta) {
                        ta.classList.remove('marquee');
                    }
                } catch (e) {}
            } catch (dbgErr) {
                console.error('[GameManager] showQuestion debug error', dbgErr);
            }
        }
        // ensure AI output and analysis are visible/cleared
        if (this.el.aiOutput) this.el.aiOutput.textContent = 'AIが回答を待っています...';
        if (this.el.aiAnalysis) this.el.aiAnalysis.innerHTML = '';
        this.showNotification('問題を表示しました。', 'success');
        if (this.el.questionNumber) this.el.questionNumber.textContent = this.currentQuestionIndex + 1;
        
        // Update new UI elements
        const aiOutputModern = document.getElementById('ai-output-modern');
        if (aiOutputModern) aiOutputModern.textContent = '';
        
        if (this.el.aiOutput) this.el.aiOutput.textContent = 'AIが回答を待っています...';
        if (this.el.aiAnalysis) this.el.aiAnalysis.innerHTML = '';
        this.setAIStatus('待機中', '#ccc');
        this.updateGameHUD();
        this.updateUI();
    }

    async submitQuestion() {
        try {
            // Check if timer has already expired to prevent race condition
            if (this.questionStartTime) {
                const elapsed = (Date.now() - this.questionStartTime) / 1000;
                if (elapsed >= this.questionTimeLimit) {
                    this.showNotification('時間切れです', 'warning');
                    return false;
                }
            }

            // Get text from both old and new UI elements with validation
            let text = '';
            if (this.el.playerQuestion && this.el.playerQuestion.value) {
                text = this.el.playerQuestion.value.trim();
            }
            
            const newPlayerTextarea = document.querySelector('.player-textarea');
            if (!text && newPlayerTextarea && newPlayerTextarea.value) {
                text = newPlayerTextarea.value.trim();
            }
            
            // Validate input
            if (!text) {
                this.showNotification('質問を入力してください', 'warning');
                return false;
            }

            if (text.length > 500) {
                this.showNotification('質問は500文字以内で入力してください', 'warning');
                return false;
            }

            // Check system state
            if (this.isLocked) {
                this.showNotification('カウントダウン中は操作できません', 'warning');
                return false;
            }
            
            if (this.isProcessingAI) {
                this.showNotification('AI処理中はリクエストを送れません', 'warning');
                return false;
            }

            // Validate current question exists
            if (!this.questions || this.currentQuestionIndex >= this.questions.length) {
                this.showNotification('有効な問題が見つかりません', 'error');
                return false;
            }

            const q = this.questions[this.currentQuestionIndex];
            if (!q) {
                this.showNotification('現在の問題が無効です', 'error');
                return false;
            }

            // Check if answer is revealed in question (only for non-VS modes)
            if (this.currentMode !== 'vs' && q.answers && Array.isArray(q.answers)) {
                const lowerText = text.toLowerCase();
                const hasAnswer = q.answers.some(ans => {
                    if (typeof ans === 'string' && ans.trim()) {
                        return lowerText.includes(ans.toLowerCase());
                    }
                    return false;
                });
                
                if (hasAnswer) {
                    this.showNotification('質問に答えが含まれています', 'error');
                    return false;
                }
            }

            // Stop voice recognition if active
            if (this.isVoiceActive && this.recognition) {
                try {
                    this.recognition.stop();
                } catch (error) {
                    console.warn('Failed to stop voice recognition:', error);
                }
            }

            // Pause the question timer during AI processing
            this.pauseQuestionTimer();

            // Set processing state
            this.setAIStatus('処理中', '#ffaa00');
            this.isProcessingAI = true;
            if (this.el.submitQuestionBtn) this.el.submitQuestionBtn.disabled = true;
            
            // Update counters
            this.questionCount++;
            this.appendQuestionHistory(text);
            
            // Clear input fields
            if (this.el.playerQuestion) this.el.playerQuestion.value = '';
            if (newPlayerTextarea) newPlayerTextarea.value = '';

            // Validate server URLs
            if (!this.gameServerUrl || !this.lmServerUrl) {
                throw new Error('サーバーURLが設定されていません');
            }

            const requestPayload = {
                question: text,
                target_answer: (q.answers && q.answers[0]) ? q.answers[0] : '',
                lm_server: this.lmServerUrl
            };

            console.log('Submitting question:', requestPayload);

            const res = await fetch(`${this.gameServerUrl}/ask_ai`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestPayload),
                timeout: 30000 // 30 second timeout
            });

            if (!res.ok) {
                const errorText = await res.text().catch(() => 'レスポンスの読み取りに失敗');
                throw new Error(`サーバーエラー: ${res.status} ${res.statusText}. ${errorText}`);
            }

            const data = await res.json();
            
            // Validate response data
            if (!data || typeof data !== 'object') {
                throw new Error('無効なレスポンス形式です');
            }

            // Update AI output safely
            const aiResponse = data.ai_response || '(応答なし)';
            if (this.el.aiOutput) {
                this.el.aiOutput.textContent = aiResponse;
            }
            
            // Update new UI element
            const aiOutputModern = document.getElementById('ai-output-modern');
            if (aiOutputModern) {
                aiOutputModern.textContent = aiResponse;
            }
            
            // Handle reasoning
            if (data.reasoning && this.el.aiAnalysis) {
                const safeReasoning = String(data.reasoning).substring(0, 1000); // Limit length
                this.el.aiAnalysis.innerHTML = `<p><b>AIの思考:</b> ${safeReasoning}</p>`;
            }
            
            // Handle validation
            if (data.valid === false) {
                const invalidReason = data.invalid_reason || 'ルール違反';
                this.showNotification(`不正な質問: ${invalidReason}`, 'error');
            }

            // Check answer
            let isCorrect = false;
            if (data.valid !== false && q.answers) {
                isCorrect = this.checkAnswer(aiResponse, q.answers);
            }
            
            // Resume timer after AI response is received - only pause during processing
            this.resumeQuestionTimer();
            
            this.handleAnswerResult(isCorrect);
            return true;

        } catch (error) {
            console.error('Submit question error:', error);
            this.setAIStatus('エラー', '#ff4757');
            
            // Resume timer on error so user can try again
            this.resumeQuestionTimer();
            
            let errorMessage = 'エラーが発生しました';
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage = 'サーバーに接続できません';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            this.showNotification(errorMessage, 'error');
            return false;
        } finally {
            // Always reset processing state
            this.isProcessingAI = false;
            if (this.el.submitQuestionBtn) this.el.submitQuestionBtn.disabled = false;
        }
    }

    checkAnswer(aiResponse, targetAnswers) {
        if (!aiResponse || !targetAnswers || targetAnswers.length === 0) return false;
        const lowerResponse = aiResponse.toLowerCase();
        return targetAnswers.some(ans => lowerResponse.includes(ans.toLowerCase()));
    }

    handleAnswerResult(isCorrect) {
        // Timer is already cleared in submitQuestion after AI response
        
        if (isCorrect) {
            this.score += 100;
            this.correctAnswers++;
            this.setAIStatus('正解！', '#00ff88');
            this.showNotification('正解！', 'success');
            if (typeof this.playSE === 'function') this.playSE('seikai.mp3');
            setTimeout(async () => {
                // When correct in multiplayer VS, mark as done and notify server if this is final
                if (this.currentMode === 'vs') {
                    // mark submitted done once when we've finished all questions or if server rules require
                    // here we treat answering a question correctly as finishing the run
                    try {
                        await this.submitGameDone({ correct: true, score_delta: 100, done: true });
                    } catch (e) {
                        console.warn('submitGameDone failed:', e);
                    }
                }
                this.nextQuestion();
            }, 1500);
        } else {
            this.score = Math.max(0, this.score - 10);
            this.setAIStatus('不正解', '#ff4757');
            if (typeof this.playSE === 'function') this.playSE('huseikai.mp3');
        }
        this.updateUI();
    }

    nextQuestion() {
        this.clearQuestionTimer();
        this.currentQuestionIndex++;
        this.showQuestion();
    }

    endGame() {
        this.stopTimer();
        this.clearQuestionTimer();
        // If in a multiplayer game and not yet submitted, send final done flag
        if (this.currentMode === 'vs' && this.currentGameId && !this._hasSubmittedDone) {
            try { this.submitGameDone({ correct: false, score_delta: 0, done: true }); } catch (e) { console.warn(e); }
        }
        // stop gameplay BGM when game ends
        try { this.stopBGM(); } catch (e) {}
        const timeTaken = this.initialTimeLimit - this.timeLimit;
        if (this.el.finalScore) this.el.finalScore.textContent = this.score;
        if (this.el.resultCorrect) this.el.resultCorrect.textContent = `${this.correctAnswers} / ${this.questions.length}`;
        if (this.el.resultQuestions) this.el.resultQuestions.textContent = this.questionCount;
        const accuracy = this.questions.length > 0 ? Math.round((this.correctAnswers / this.questions.length) * 100) : 0;
        if (this.el.resultAccuracy) this.el.resultAccuracy.textContent = `${accuracy}%`;
        if (this.el.resultTime) this.el.resultTime.textContent = this.formatTime(timeTaken);
        this.showModal('result-modal');
        // submit score for non-practice modes
        if (this.currentMode !== 'practice') {
            this.submitScore(timeTaken);
        }

        // start auto-return countdown (15s) and update UI element if present
        try { if (this._autoReturnInterval) clearInterval(this._autoReturnInterval); } catch (e) {}
        let autoSec = 15;
        const autoEl = document.getElementById('auto-return-countdown');
        if (autoEl) autoEl.textContent = String(autoSec);
        this._autoReturnInterval = setInterval(() => {
            autoSec--;
            if (autoEl) autoEl.textContent = String(autoSec);
            if (autoSec <= 0) {
                clearInterval(this._autoReturnInterval);
                this._autoReturnInterval = null;
                this.closeModal('result-modal');
                this.goBackToMenu();
            }
        }, 1000);
    }

    // Multiplayer: submit that this player finished (or update score)
    async submitGameDone({ correct = false, score_delta = 0, done = false } = {}, retryCount = 0) {
        if (!this.currentGameId || !this.playerId || !this.gameServerUrl) {
            throw new Error('ゲーム情報が不十分です');
        }
        try {
            const payload = { player_id: this.playerId, session_token: this.sessionToken, correct, score_delta, done };
            const res = await fetch(`${this.gameServerUrl}/game/${encodeURIComponent(this.currentGameId)}/submit_answer`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const txt = await res.text().catch(()=>'');
                throw new Error(`submit failed: ${res.status} ${txt}`);
            }
            const j = await res.json();
            if (done) this._hasSubmittedDone = true;
            // If server indicates finished right away, handle state
            if (j && j.finished) {
                // fetch final state and show results
                try { await this.fetchAndHandleGameState(); } catch(e){}
            }
            return j;
        } catch (e) {
            console.warn('submitGameDone error', e);
            if (retryCount < 2) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                return this.submitGameDone({ correct, score_delta, done }, retryCount + 1);
            }
            throw e;
        }
    }

    // Start polling the game state for a multiplayer game
    startGameStatePolling(gameId) {
        this.stopGameStatePolling();
        if (!gameId) return;
        this.currentGameId = gameId;
        // immediately fetch once
        this.fetchAndHandleGameState();
        this.gameStateInterval = setInterval(() => this.fetchAndHandleGameState(), 2000); // increased to 2s to reduce load
    }

    stopGameStatePolling() {
        if (this.gameStateInterval) clearInterval(this.gameStateInterval);
        this.gameStateInterval = null;
        this.currentGameId = null;
        this._vsCountdownVisible = false;
        const vsEl = document.getElementById('vs-countdown-small');
        if (vsEl) vsEl.style.display = 'none';
    }

    async fetchAndHandleGameState(retryCount = 0) {
        if (!this.currentGameId || !this.gameServerUrl) return;
        try {
            const res = await fetch(`${this.gameServerUrl}/game/${encodeURIComponent(this.currentGameId)}/state`);
            if (!res.ok) throw new Error(`state fetch failed: ${res.status}`);
            const st = await res.json();
            this.handleGameStateResponse(st);
        } catch (e) {
            console.warn('fetchAndHandleGameState error', e);
            if (retryCount < 3) {
                setTimeout(() => this.fetchAndHandleGameState(retryCount + 1), 1000 * (retryCount + 1)); // exponential backoff
            }
        }
    }

    handleGameStateResponse(state) {
        if (!state) return;
        // update HUD scores if present
        if (state.scores && typeof state.scores === 'object') {
            // update my score from server
            if (this.playerId && state.scores[this.playerId] !== undefined) {
                this.score = state.scores[this.playerId];
                this.updateUI();
            }
            // if there's a UI element for other players, update it (simple implementation)
            const vsEl = document.getElementById('vs-countdown-small');
            // If first_finish_at exists, compute remaining seconds (server uses epoch seconds)
            if (state.first_finish_at) {
                const nowSec = Date.now() / 1000;
                const elapsed = nowSec - Number(state.first_finish_at);
                const remaining = Math.max(0, 60 - Math.floor(elapsed));
                if (remaining > 0) {
                    if (vsEl) {
                        vsEl.style.display = 'block';
                        vsEl.textContent = `あと ${remaining } 秒で終了`; 
                    }
                    this._vsCountdownVisible = true;
                } else {
                    if (vsEl) vsEl.style.display = 'none';
                    this._vsCountdownVisible = false;
                }
            } else {
                if (vsEl) vsEl.style.display = 'none';
            }
        }

        if (state.finished) {
            // Stop polling and show results based on state.ranking or state.final_ranking
            this.stopGameStatePolling();
            // Map ranking to result modal UI
            if (state.ranking || state.final_ranking) {
                const ranking = state.ranking || state.final_ranking || [];
                // Fill result modal with ranking info
                const resultList = document.getElementById('result-ranking-list');
                if (resultList) {
                    resultList.innerHTML = '';
                    ranking.forEach((p, idx) => {
                        const row = document.createElement('div');
                        row.className = 'result-row';
                        row.innerHTML = `<div class="rank">#${idx+1}</div><div class="name">${p.player || p.player_id || p}</div><div class="score">${p.score||''}</div>`;
                        resultList.appendChild(row);
                    });
                }
            }
            // show result modal
            this.showModal('result-modal');
        }
    }

    async submitScore(timeInSeconds) {
        if (!this.playerId) return;
        try {
            const payload = {
                player_id: this.playerId,
                session_token: this.sessionToken,
                mode: this.currentMode,
                correct_count: this.correctAnswers,
                total_questions: this.questions.length,
                time_seconds: timeInSeconds,
                client_raw_score: this.score
            };
            const res = await fetch(`${this.gameServerUrl}/scores/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(`Score submit failed: ${res.status}`);

            // Fetch updated scores and show leaderboard with highlight
            try {
                const res2 = await fetch(`${this.gameServerUrl}/scores/all`);
                if (res2.ok) {
                    const json = await res2.json();
                    const scores = (json && json.scores && json.scores[this.currentMode]) || [];
                    this.showModal('leaderboard-modal');
                    // populate leaderboard list
                    if (this.el.leaderboardList) {
                        this.el.leaderboardList.innerHTML = '';
                        // sort by score desc
                        scores.sort((a,b) => (b.score||0) - (a.score||0));
                        scores.forEach((item, i) => {
                            const row = document.createElement('div');
                            row.className = 'leaderboard-item';
                            if (item.player === (localStorage.getItem('nickname') || this.nickname)) {
                                row.classList.add('leaderboard-self');
                            }
                            row.innerHTML = `<div class="rank">#${i+1}</div><div class="player-name">${item.player}</div><div class="player-score">${item.score}</div>`;
                            this.el.leaderboardList.appendChild(row);
                        });
                    }
                }
            } catch (e) {
                console.warn('Failed to fetch latest scores:', e);
            }

        } catch (e) {
            console.error('Score submission failed:', e);
        }
    }

    // Simple audio manager for BGM
    ensureAudioManager() {
        if (this.audio) return;
        try {
            this.audio = new Audio();
            this.audio.loop = true;
            this.audio.volume = 0.5;
        } catch (e) {
            console.warn('Audio not supported:', e);
            this.audio = null;
        }
    }

    playBGM(fileName) {
        // If BGM is disabled, do nothing
        if (!this.startWithBgm) return;
        
        this.ensureAudioManager();
        if (!this.audio) return;
        try {
            const url = (this.gameServerUrl || '') + `/bgm/${fileName}`;
            console.log('playBGM url=', url, 'gameServerUrl=', this.gameServerUrl, 'audioUnlocked=', !!this.audioUnlocked);
            if (!this.audioUnlocked) {
                // Defer playback until user interacts
                this.pendingBGM = fileName;
                console.warn('BGM play deferred until user gesture (autoplay policy)');
                return;
            }
            // If changing tracks, pause and load new source to avoid overlapping play/pause aborts
            if (this.audio.src !== url) {
                try { this.audio.pause(); } catch (e) {}
                this.audio.src = url;
                try { this.audio.load(); } catch (e) {}
                // give the browser a moment to settle before calling play
                setTimeout(() => {
                    this.audio.play().catch(e => {
                        console.warn('BGM play failed:', e);
                    });
                }, 60);
            } else {
                this.audio.play().catch(e => {
                    console.warn('BGM play failed:', e);
                });
            }
        } catch (e) {
            console.warn('playBGM error', e);
        }
    }

    // SE再生用メソッド
    playSE(fileName) {
        if (!this.se) {
            this.se = new Audio();
            this.se.volume = 0.7;
        }
        const url = (this.gameServerUrl || '') + `/bgm/${fileName}`;
        console.log('playSE url=', url, 'gameServerUrl=', this.gameServerUrl);
        this.se.src = url;
        this.se.loop = false;
        this.se.currentTime = 0;
        this.se.play().catch(e => {
            console.warn('SE play failed:', e);
        });
    }

    stopBGM() {
        if (this.audio) {
            try { this.audio.pause(); } catch (e) {}
        }
    }

    updateUI() {
        if (this.el.currentScore) this.el.currentScore.textContent = this.score;
        if (this.el.totalScore) this.el.totalScore.textContent = this.score;
        if (this.el.correctCount) this.el.correctCount.textContent = this.correctAnswers;
        if (this.el.questionCount) this.el.questionCount.textContent = `質問回数: ${this.questionCount}`;
        const accuracy = this.correctAnswers > 0 && this.questionCount > 0 ? Math.round((this.correctAnswers / this.questionCount) * 100) : 0;
        if (this.el.accuracy) this.el.accuracy.textContent = `${accuracy}%`;
        const progress = this.questions.length > 0 ? ((this.currentQuestionIndex) / this.questions.length) * 100 : 0;
        if (this.el.progressFill) this.el.progressFill.style.width = `${progress}%`;
    }

    startTimer() {
        this.stopTimer();
        this.initialTimeLimit = this.timeLimit;
        if (this.el.timerDisplay) this.el.timerDisplay.textContent = this.formatTime(this.timeLimit);
        this.timer = setInterval(() => {
            this.timeLimit--;
            if (this.el.timerDisplay) this.el.timerDisplay.textContent = this.formatTime(this.timeLimit);
            if (this.timeLimit <= 0) {
                this.endGame();
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    async showLeaderboard() {
        this.showModal('leaderboard-modal');
        const activeTab = document.querySelector('#leaderboard-modal .tab-btn.active');
        const mode = activeTab ? activeTab.dataset.board : 'solo';
        if (!this.gameServerUrl) return;
        try {
            const res = await fetch(`${this.gameServerUrl}/scores/top?mode=${mode}`);
            const data = await res.json();
            if (this.el.leaderboardList) {
                this.el.leaderboardList.innerHTML = '';
                if (data.top && data.top.length > 0) {
                    data.top.forEach((item, i) => {
                        const row = document.createElement('div');
                        row.className = 'leaderboard-item';
                        row.innerHTML = `<div class="rank">#${i + 1}</div><div class="player-name">${item.player}</div><div class="player-score">${item.score}</div>`;
                        this.el.leaderboardList.appendChild(row);
                    });
                } else {
                    this.el.leaderboardList.innerHTML = '<p style="text-align:center;opacity:0.8;">まだ記録がありません。</p>';
                }
            }
        } catch (e) {
            if (this.el.leaderboardList) this.el.leaderboardList.innerHTML = '<p style="text-align:center;color:red;">ランキングの読み込みに失敗しました。</p>';
        }
    }

    showScreen(screenId) {
        // Deactivate all screens and explicitly hide them to avoid cases where a screen
        // remains visible on top due to CSS or body class mismatches.
        document.querySelectorAll('.screen').forEach(s => {
            s.classList.remove('active');
            s.setAttribute('aria-hidden', 'true');
            s.style.display = 'none';
        });
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
            screen.removeAttribute('aria-hidden');
            screen.style.display = '';
        }
        // Play menu BGM when showing main menu. For other screens (except game-screen), stop BGM.
        try {
            if (screenId === 'main-menu') {
                this.playBGM('menu.mp3');
            } else if (screenId !== 'game-screen') {
                this.stopBGM();
            }
        } catch (e) {}
        // When switching screens, clear any forced full-screen inline styles applied to game-screen
        // This ensures returning to menu restores normal layout
        if (screenId !== 'game-screen') {
            // If leaving game-screen, also ensure body game-active class is removed
            try { document.body.classList.remove('game-active'); } catch(e){}
            const gs = document.getElementById('game-screen');
            if (gs) {
                gs.style.position = '';
                gs.style.top = '';
                gs.style.left = '';
                gs.style.width = '';
                gs.style.height = '';
                gs.style.minHeight = '';
                gs.style.zIndex = '';
                gs.style.opacity = '';
                gs.style.pointerEvents = '';
            }
            // cleanup any temporary reparented container
            try {
                if (this._reparented && this._reparentId) {
                    const wrapper = document.getElementById(this._reparentId);
                    const gsEl = document.getElementById('game-screen');
                    if (wrapper) {
                        // if we recorded moved nodes, move them back
                        if (this._reparentedNodes && this._reparentedNodes.length && gsEl) {
                            this._reparentedNodes.forEach(n => gsEl.appendChild(n));
                        }
                        wrapper.remove();
                    }
                    this._reparented = false;
                    this._reparentId = null;
                    this._reparentedNodes = null;
                }
            } catch (e) {}
        }
    }
    showModal(modalId) { 
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('active');
    }

    closeModal(modalId) { 
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
    }

    closeParentModal(el) { 
        const modal = el.closest('.modal');
        if (modal) modal.classList.remove('active');
    }

    closeAllModals() { 
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    }

    getModeName(m) {
        return ({ solo: 'ソロモード', vs: '対戦モード', rta: 'RTAモード', practice: '練習モード', classic: 'クラシック', speed: 'スピード', challenge: 'チャレンジ' })[m] || m;
    }

    setAIStatus(text, color) {
        if (this.el.aiStatus) {
            this.el.aiStatus.textContent = text;
            this.el.aiStatus.style.background = color;
        }
    }

    appendQuestionHistory(text) {
        if (!this.el.questionHistory) return;
        const d = document.createElement('div');
        d.className = 'question-item';
        d.textContent = `${this.questionCount}. ${text}`;
        this.el.questionHistory.appendChild(d);
        this.el.questionHistory.scrollTop = this.el.questionHistory.scrollHeight;
    }

    clearQuestion() { 
        if (this.el.playerQuestion) this.el.playerQuestion.value = '';
        
        // Clear new UI element
        const playerTextarea = document.querySelector('.player-textarea');
        if (playerTextarea) playerTextarea.value = '';
    }

    passQuestion() {
        if (!this.allowPass || this.hasUsedPass) return this.showNotification('パスは一度だけ使用できます', 'warning');
        // Mark pass used and disable button
        this.hasUsedPass = true;
        const passBtn = document.getElementById('pass-btn') || document.querySelector('.pass-btn');
        if (passBtn) passBtn.disabled = true;
        // Treat as skip: advance to next question without scoring
        this.showNotification('パスしました。次の問題へ移動します', 'info');
        this.currentQuestionIndex++;
        if (this.currentQuestionIndex >= this.questions.length) return this.endGame();
        this.showQuestion();
    }

    formatTime(seconds) {
        const m = Math.floor(seconds / 60); 
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    showNotification(msg, type = 'info') {
        const n = document.createElement('div');
        n.className = `notification notification-${type}`;
        n.textContent = msg;
        document.body.appendChild(n);
        setTimeout(() => n.classList.add('show'), 10);
        setTimeout(() => {
            n.classList.remove('show');
            n.addEventListener('transitionend', () => n.remove());
        }, 3000);
    }

    switchTab(btn) {
        const parent = btn.closest('.modal-content');
        if (!parent) return;
        parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Handle practice setup modal tabs
        if (parent.closest('#practice-setup-modal')) {
            this.handlePracticeTabSwitch(btn);
        }
        
        if (parent.closest('#leaderboard-modal')) {
            this.showLeaderboard();
        }
    }

    handlePracticeTabSwitch(btn) {
        const modal = document.getElementById('practice-setup-modal');
        if (!modal) return;
        
        const selectedTab = btn.dataset.tab;
        console.log('[Practice] Tab switched to:', selectedTab);
        
        // Show/hide tab content based on selection
        modal.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = 'none';
        });
        
        const activeContent = modal.querySelector(`[data-tab-content="${selectedTab}"]`);
        if (activeContent) {
            activeContent.style.display = 'block';
        }
        
        // Initialize default settings if needed
        this.initializePracticeSettings(selectedTab);
    }

    initializePracticeSettings(tabType) {
        try {
            switch(tabType) {
                case 'difficulty':
                    // Set default difficulty if none selected
                    const difficultyRadios = document.querySelectorAll('input[name="difficulty"]');
                    if (difficultyRadios.length > 0 && !Array.from(difficultyRadios).some(r => r.checked)) {
                        difficultyRadios[0].checked = true;
                    }
                    break;
                case 'category':
                    // Set default category if none selected
                    const categoryRadios = document.querySelectorAll('input[name="category"]');
                    if (categoryRadios.length > 0 && !Array.from(categoryRadios).some(r => r.checked)) {
                        categoryRadios[0].checked = true;
                    }
                    break;
                case 'length':
                    // Set default length if none selected
                    const lengthRadios = document.querySelectorAll('input[name="questionLength"]');
                    if (lengthRadios.length > 0 && !Array.from(lengthRadios).some(r => r.checked)) {
                        lengthRadios[0].checked = true;
                    }
                    break;
            }
        } catch (error) {
            console.warn('[Practice] Error initializing settings:', error);
        }
    }

    startMinigame() {
        if (!this.el.minigameBtn || !this.el.minigameArea || !this.el.minigameScore) return;
        this._minigameScore = 0;
        this.el.minigameScore.textContent = `得点: ${this._minigameScore}`;
        this._minigameRunning = true;
        const moveBtn = () => {
            if (!this._minigameRunning) return;
            const area = this.el.minigameArea.getBoundingClientRect();
            const btn = this.el.minigameBtn;
            const size = 48;
            const x = Math.random() * (area.width - size);
            const y = Math.random() * (area.height - size);
            btn.style.left = `${x}px`;
            btn.style.top = `${y}px`;
            this._minigameTimer = setTimeout(moveBtn, 1200 - Math.random() * 800);
        };
        moveBtn();
        this.el.minigameBtn.onclick = () => {
            if (!this._minigameRunning) return;
            this._minigameScore += 1;
            this.el.minigameScore.textContent = `得点: ${this._minigameScore}`;
            if (this._minigameTimer) clearTimeout(this._minigameTimer);
            moveBtn();
        };
    }

    stopMinigame() {
        this._minigameRunning = false;
        if (this._minigameTimer) clearTimeout(this._minigameTimer);
        if (this.el.minigameBtn) this.el.minigameBtn.onclick = null;
    }
    
    // Update new game HUD elements
    updateGameHUD() {
        const targetDisplay = document.querySelector('.target-value');
        const progressRing = document.querySelector('.progress-ring .progress');
        const progressText = document.querySelector('.progress-text');
        
        if (targetDisplay && this.questions.length > 0) {
            const currentQ = this.questions[this.currentQuestionIndex];
            if (currentQ) {
                // Always display the target locally so players can see the shared question.
                // Previously vs mode hid the target as '???' which made multiplayer unplayable.
                const answers = Array.isArray(currentQ.answers) && currentQ.answers.length ? currentQ.answers : (currentQ.answer ? [currentQ.answer] : []);
                if (answers && answers.length) targetDisplay.textContent = answers.join(' / ');
                else targetDisplay.textContent = currentQ.prompt || currentQ.question || currentQ.text || currentQ.id || '';
            }
        }
        
        if (progressRing && progressText) {
            const progress = this.questions.length > 0 ? this.currentQuestionIndex / this.questions.length : 0;
            const circumference = 213.628; // 2 * π * radius (34)
            const offset = circumference - (progress * circumference);
            progressRing.style.strokeDashoffset = offset;
            progressText.textContent = `${this.currentQuestionIndex}/${this.questions.length}`;
        }
    }

    // Tutorial system methods
    startTutorial() {
        this.tutorialStep = 0;
        // Steps updated to match left=player, right=AI layout and include demo flags
        this.tutorialSteps = [
            { title: "Rush Maximizerへようこそ！", description: "これはAIと対戦する質問ゲームです。AIよりも早く正解を見つけましょう！", highlight: null },
            { title: "ターゲットの確認", description: "画面上部に表示されるTARGETを確認してください。これが目標の答えです。", highlight: ".target-display" },
            { title: "質問の入力 (デモ)", description: "左側の入力欄に質問を入力する様子をデモします。Ctrl+Enterで送信できます。", highlight: ".player-textarea", demo: 'input', demoText: 'このキャラクターの名前は何ですか？' },
            { title: "AIの回答 (デモ)", description: "右側にAIの応答が表示される様子をデモします。実際のプレイではここで判定が行われます。", highlight: "#ai-output", demo: 'ai', demoText: 'それは「江戸城無血開城」として知られています。説明: ...' },
            { title: "プログレス表示", description: "右上の円形ゲージで現在の進行状況を確認できます。", highlight: ".progress-ring" },
            { title: "チュートリアル完了", description: "基本操作は以上です。さあ、AIとの知的バトルを楽しみましょう！", highlight: null }
        ];
        
        this.closeModal('tutorial-select-modal');
        this.showTutorialStep();
        localStorage.setItem('hasSeenTutorial', 'true');
    }

    showTutorialStep() {
        const overlay = this.el.tutorialOverlay;
        const titleEl = document.getElementById('tutorial-title');
        const descEl = document.getElementById('tutorial-description');
        const counterEl = document.getElementById('tutorial-counter');
        const prevBtn = document.getElementById('tutorial-prev-btn');
        const nextBtn = document.getElementById('tutorial-next-btn');
        const skipBtn = document.getElementById('tutorial-skip-btn');
        
        if (!overlay || !this.tutorialSteps) return;
        
        const step = this.tutorialSteps[this.tutorialStep];
        if (!step) return this.endTutorial();
        
        overlay.classList.add('active');
        
        if (titleEl) titleEl.textContent = step.title;
        if (descEl) descEl.textContent = step.description;
        if (counterEl) counterEl.textContent = `${this.tutorialStep + 1} / ${this.tutorialSteps.length}`;
        
        if (prevBtn) prevBtn.style.display = this.tutorialStep > 0 ? 'block' : 'none';
        if (nextBtn) nextBtn.textContent = this.tutorialStep < this.tutorialSteps.length - 1 ? '次へ' : '完了';
        
        this.highlightElement(step.highlight);

        // If this step includes a demo action, run it
        if (step.demo === 'input') {
            // simulate typing into player textarea
            const ta = document.querySelector('.player-textarea') || document.getElementById('player-question');
            if (ta) {
                this.simulateTyping(ta, step.demoText || 'デモ質問です。', 40).then(() => {
                    // leave typed text visible for a short moment
                    setTimeout(() => {
                        // keep text or clear depending on UX; we keep it so next AI demo can use it
                    }, 600);
                });
            }
        } else if (step.demo === 'ai') {
            // Show a simulated AI response (no server call)
            const sample = step.demoText || '(AIの応答デモ)';
            // clear previous AI output
            const aiOut = document.getElementById('ai-output');
            if (aiOut) aiOut.textContent = '';
            this.simulateAIResponse(sample, 20);
        }
    }

    simulateTyping(targetEl, text, delay = 50) {
        return new Promise(resolve => {
            if (!targetEl) return resolve();
            this.isLocked = true;
            targetEl.focus();
            targetEl.value = '';
            let i = 0;
            const iv = setInterval(() => {
                targetEl.value += text.charAt(i);
                i++;
                if (i >= text.length) {
                    clearInterval(iv);
                    this.isLocked = false;
                    resolve();
                }
            }, delay);
        });
    }

    simulateAIResponse(text, delay = 30) {
        const outEl = document.getElementById('ai-output');
        if (!outEl) return;
        outEl.textContent = '';
        this.isLocked = true;
        let i = 0;
        const iv = setInterval(() => {
            outEl.textContent += text.charAt(i);
            i++;
            if (i >= text.length) {
                clearInterval(iv);
                this.isLocked = false;
            }
        }, delay);
    }

    highlightElement(selector) {
        // Remove existing highlights
        document.querySelectorAll('.tutorial-highlight').forEach(el => el.remove());
        
        if (!selector) return;
        
        const element = document.querySelector(selector);
        if (!element) return;
        
        const rect = element.getBoundingClientRect();
        const highlight = document.createElement('div');
        highlight.className = 'tutorial-highlight';
        highlight.style.position = 'fixed';
        highlight.style.left = `${rect.left - 10}px`;
        highlight.style.top = `${rect.top - 10}px`;
        highlight.style.width = `${rect.width + 20}px`;
        highlight.style.height = `${rect.height + 20}px`;
        
        document.body.appendChild(highlight);
    }

    nextTutorialStep() {
        if (this.tutorialStep < this.tutorialSteps.length - 1) {
            this.tutorialStep++;
            this.showTutorialStep();
        } else {
            this.endTutorial();
        }
    }

    previousTutorialStep() {
        if (this.tutorialStep > 0) {
            this.tutorialStep--;
            this.showTutorialStep();
        }
    }

    endTutorial() {
        this.closeModal('tutorial-overlay');
        document.querySelectorAll('.tutorial-highlight').forEach(el => el.remove());
        this.tutorialStep = 0;
        this.tutorialSteps = null;
    }

    closeTutorialSelect() {
        this.closeModal('tutorial-select-modal');
        localStorage.setItem('hasSeenTutorial', 'true');
    }

    // Voice Recognition System
    initVoiceRecognition() {
        try {
            if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                console.warn('Speech recognition not supported');
                this.voiceEnabled = false;
                this.updateVoiceUI();
                return;
            }

            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'ja-JP';
            this.recognition.maxAlternatives = 1;

            this.recognition.onstart = () => {
                try {
                    this.isVoiceActive = true;
                    this.updateVoiceUI();
                    this.showNotification('音声認識を開始しました', 'info');
                } catch (error) {
                    console.error('Voice recognition start error:', error);
                }
            };

            this.recognition.onresult = (event) => {
                try {
                    if (!event.results || !event.results[0] || !event.results[0][0]) {
                        this.showNotification('音声が認識できませんでした', 'warning');
                        return;
                    }
                    
                    const transcript = event.results[0][0].transcript;
                    if (transcript && transcript.trim()) {
                        const playerQuestion = document.getElementById('player-question');
                        if (playerQuestion) {
                            // Safely update input with validation
                            const cleanTranscript = transcript.trim().substring(0, 500); // Limit length
                            playerQuestion.value = cleanTranscript;
                            playerQuestion.focus();
                            this.showNotification(`音声入力: ${cleanTranscript}`, 'success');
                        } else {
                            this.showNotification('入力フィールドが見つかりません', 'error');
                        }
                    } else {
                        this.showNotification('音声が認識できませんでした', 'warning');
                    }
                } catch (error) {
                    console.error('Voice recognition result error:', error);
                    this.showNotification('音声認識処理中にエラーが発生しました', 'error');
                }
            };

            this.recognition.onerror = (event) => {
                try {
                    console.error('Speech recognition error:', event.error);
                    this.isVoiceActive = false;
                    this.updateVoiceUI();
                    
                    let errorMessage = '音声認識エラーが発生しました';
                    switch (event.error) {
                        case 'no-speech':
                            errorMessage = '音声が検出されませんでした';
                            break;
                        case 'audio-capture':
                            errorMessage = 'マイクにアクセスできません';
                            break;
                        case 'not-allowed':
                            errorMessage = 'マイクの使用が許可されていません';
                            break;
                        case 'network':
                            errorMessage = 'ネットワークエラーが発生しました';
                            break;
                        default:
                            errorMessage = `音声認識エラー: ${event.error}`;
                    }
                    this.showNotification(errorMessage, 'error');
                } catch (error) {
                    console.error('Voice recognition error handler failed:', error);
                }
            };

            this.recognition.onend = () => {
                try {
                    this.isVoiceActive = false;
                    this.updateVoiceUI();
                } catch (error) {
                    console.error('Voice recognition end error:', error);
                }
            };

            this.voiceEnabled = true;
            console.log('Voice recognition initialized successfully');
        } catch (error) {
            console.error('Failed to initialize voice recognition:', error);
            this.voiceEnabled = false;
            this.updateVoiceUI();
        }
    }

    toggleVoiceRecognition() {
        try {
            if (!this.voiceEnabled || !this.recognition) {
                this.showNotification('音声認識はサポートされていません', 'warning');
                return false;
            }

            if (this.isVoiceActive) {
                try {
                    this.recognition.stop();
                    this.showNotification('音声認識を停止しました', 'info');
                } catch (error) {
                    console.error('Failed to stop voice recognition:', error);
                    this.isVoiceActive = false;
                    this.updateVoiceUI();
                }
            } else {
                try {
                    // Check if already processing AI request
                    if (this.isProcessingAI) {
                        this.showNotification('AI処理中は音声認識を開始できません', 'warning');
                        return false;
                    }
                    
                    // Check microphone permissions
                    if (navigator.permissions) {
                        navigator.permissions.query({ name: 'microphone' }).then((result) => {
                            if (result.state === 'denied') {
                                this.showNotification('マイクの使用が拒否されています。ブラウザの設定を確認してください', 'error');
                                return false;
                            }
                        }).catch(() => {
                            // Permission API not supported, continue anyway
                        });
                    }
                    
                    this.recognition.start();
                } catch (error) {
                    console.error('Failed to start voice recognition:', error);
                    let errorMessage = '音声認識の開始に失敗しました';
                    
                    if (error.name === 'InvalidStateError') {
                        errorMessage = '音声認識が既に実行中です';
                    } else if (error.name === 'NotAllowedError') {
                        errorMessage = 'マイクの使用が許可されていません';
                    }
                    
                    this.showNotification(errorMessage, 'error');
                    return false;
                }
            }
            return true;
        } catch (error) {
            console.error('Voice recognition toggle failed:', error);
            this.showNotification('音声認識の切り替えに失敗しました', 'error');
            return false;
        }
    }

    updateVoiceUI() {
        const voiceToggle = document.getElementById('voice-toggle');
        const voiceIndicator = document.getElementById('voice-indicator');
        const voiceInputBtn = document.getElementById('voice-input-btn');

        if (voiceToggle) {
            const statusSpan = voiceToggle.querySelector('.status');
            if (this.isVoiceActive) {
                voiceToggle.classList.add('active');
                if (statusSpan) statusSpan.textContent = 'ON';
            } else {
                voiceToggle.classList.remove('active');
                if (statusSpan) statusSpan.textContent = this.voiceEnabled ? 'OFF' : 'N/A';
            }
        }

        if (voiceIndicator) {
            const statusSpan = voiceIndicator.querySelector('.voice-status');
            if (this.isVoiceActive) {
                voiceIndicator.classList.add('active');
                if (statusSpan) statusSpan.textContent = '録音中';
            } else {
                voiceIndicator.classList.remove('active');
                if (statusSpan) statusSpan.textContent = '待機中';
            }
        }

        if (voiceInputBtn) {
            if (this.isVoiceActive) {
                voiceInputBtn.classList.add('active');
                const textSpan = voiceInputBtn.querySelector('.text');
                if (textSpan) textSpan.textContent = '録音停止';
            } else {
                voiceInputBtn.classList.remove('active');
                const textSpan = voiceInputBtn.querySelector('.text');
                if (textSpan) textSpan.textContent = '音声入力';
            }
        }
    }

    // Pass system for VS mode
    initPassSystem() {
        this.passesUsed = 0;
        this.updatePassUI();
    }

    usePass() {
        if (this.currentMode !== 'vs') {
            this.showNotification('パス機能は対戦モードでのみ利用できます', 'warning');
            return;
        }

        if (this.passesUsed >= this.maxPasses) {
            this.showNotification('パス回数の上限に達しました。リタイアしますか？', 'warning');
            this.showRetireOption();
            return;
        }

        this.passesUsed++;
        this.updatePassUI();
        this.showNotification(`パスしました (${this.passesUsed}/${this.maxPasses})`, 'info');
        
        // Move to next question
        this.nextQuestion();
    }

    updatePassUI() {
        const passCounter = document.getElementById('pass-counter');
        if (!passCounter) return;

        const passButton = document.getElementById('pass-btn');
        const passDots = passCounter.querySelectorAll('.pass-dot');

        // Update pass dots
        passDots.forEach((dot, index) => {
            if (index < this.passesUsed) {
                dot.classList.add('used');
                dot.classList.remove('active');
            } else {
                dot.classList.remove('used');
                dot.classList.add('active');
            }
        });

        // Update pass button
        if (passButton) {
            if (this.passesUsed >= this.maxPasses) {
                const textSpan = passButton.querySelector('.text');
                if (textSpan) textSpan.textContent = 'リタイア';
                passButton.classList.add('retire');
            } else {
                const textSpan = passButton.querySelector('.text');
                if (textSpan) textSpan.textContent = `パス (${this.maxPasses - this.passesUsed})`;
                passButton.classList.remove('retire');
            }
        }

        // Show/hide pass counter based on mode
        if (this.currentMode === 'vs') {
            passCounter.style.display = 'flex';
        } else {
            passCounter.style.display = 'none';
        }
    }

    showRetireOption() {
        const confirmRetire = confirm('パス回数の上限に達しました。リタイアしますか？');
        if (confirmRetire) {
            this.retireFromGame();
        }
    }

    retireFromGame() {
        this.showNotification('ゲームからリタイアしました', 'info');
        // Submit retirement to server if in multiplayer
        if (this.currentMode === 'vs' && this.currentGameId) {
            this.submitGameDone({ correct: false, score_delta: -50, done: true, retired: true });
        }
        this.endGame();
    }

    // Question timer functions for 17-second limit
    startQuestionTimer() {
        this.clearQuestionTimer();
        this.questionStartTime = Date.now();
        
        this.questionTimer = setTimeout(() => {
            this.handleQuestionTimeout();
        }, this.questionTimeLimit * 1000);
        
        // Update visual timer if there's a display element
        this.updateQuestionTimerDisplay();
    }

    clearQuestionTimer() {
        if (this.questionTimer) {
            clearTimeout(this.questionTimer);
            this.questionTimer = null;
        }
        this.questionStartTime = null;
        this.pausedTime = null;
    }

    pauseQuestionTimer() {
        if (this.questionTimer && this.questionStartTime) {
            // Calculate elapsed time and pause
            this.pausedTime = Date.now() - this.questionStartTime;
            clearTimeout(this.questionTimer);
            this.questionTimer = null;
            console.log(`[Timer] Paused at ${this.pausedTime}ms`);
        }
    }

    resumeQuestionTimer() {
        if (this.pausedTime !== null && this.questionTimeLimit) {
            // Resume from where we left off
            this.questionStartTime = Date.now() - this.pausedTime;
            const remainingMs = (this.questionTimeLimit * 1000) - this.pausedTime;
            
            if (remainingMs > 0) {
                this.questionTimer = setTimeout(() => {
                    this.handleQuestionTimeout();
                }, remainingMs);
                console.log(`[Timer] Resumed with ${remainingMs}ms remaining`);
            } else {
                // Time already expired during pause
                this.handleQuestionTimeout();
            }
            
            this.pausedTime = null;
            this.updateQuestionTimerDisplay();
        }
    }

    updateQuestionTimerDisplay() {
        if (!this.questionStartTime || !this.questionTimeLimit) return;
        
        // Check if timer is paused
        if (this.pausedTime !== null) {
            // Show paused state
            const remaining = Math.max(0, this.questionTimeLimit - (this.pausedTime / 1000));
            const percentage = (remaining / this.questionTimeLimit) * 100;
            
            const timerDisplay = document.getElementById('question-timer');
            if (timerDisplay) {
                timerDisplay.textContent = `${Math.ceil(remaining)}s ⏸️`;
                timerDisplay.classList.add('paused');
            }
            
            const progressCircle = document.getElementById('question-progress-circle');
            if (progressCircle) {
                const circumference = 2 * Math.PI * 25;
                const offset = circumference - (percentage / 100) * circumference;
                progressCircle.style.strokeDashoffset = offset;
                progressCircle.style.stroke = '#ffaa00'; // Orange for paused
            }
            return;
        }
        
        const elapsed = (Date.now() - this.questionStartTime) / 1000;
        const remaining = Math.max(0, this.questionTimeLimit - elapsed);
        const percentage = (remaining / this.questionTimeLimit) * 100;
        
        // Update timer display element if it exists
        const timerDisplay = document.getElementById('question-timer');
        if (timerDisplay) {
            timerDisplay.textContent = `${Math.ceil(remaining)}s`;
            timerDisplay.classList.remove('paused');
            
            // Add visual urgency when time is running low
            if (remaining <= 5) {
                timerDisplay.classList.add('urgent');
            } else {
                timerDisplay.classList.remove('urgent');
            }
        }
        
        // Update circular progress if it exists
        const progressCircle = document.getElementById('question-progress-circle');
        if (progressCircle) {
            const circumference = 2 * Math.PI * 25; // radius = 25
            const offset = circumference - (percentage / 100) * circumference;
            progressCircle.style.strokeDashoffset = offset;
            
            // Change color based on remaining time
            if (remaining <= 5) {
                progressCircle.style.stroke = '#ff4757';
            } else if (remaining <= 10) {
                progressCircle.style.stroke = '#ffaa00';
            } else {
                progressCircle.style.stroke = '#00d4ff';
            }
        }
        
        // Continue updating if timer is still running (not paused)
        if (remaining > 0 && this.questionTimer && this.pausedTime === null) {
            setTimeout(() => this.updateQuestionTimerDisplay(), 100);
        }
    }

    handleQuestionTimeout() {
        this.clearQuestionTimer();
        this.showNotification('時間切れです！問題のヒントが表示されます。', 'warning');
        
        // Show prompt from current question
        const q = this.questions[this.currentQuestionIndex];
        if (q && q.prompt) {
            if (this.el.aiOutput) {
                this.el.aiOutput.textContent = `ヒント（問題文）: ${q.prompt}`;
            }
            const aiOutputModern = document.getElementById('ai-output-modern');
            if (aiOutputModern) {
                aiOutputModern.textContent = `ヒント（問題文）: ${q.prompt}`;
            }
            this.setAIStatus('ヒント表示', '#ffaa00');
        } else if (q && q.answers && q.answers.length > 0) {
            // Fallback to partial answer hint if no prompt
            const hint = q.answers[0].slice(0, Math.ceil(q.answers[0].length / 2)) + '...';
            if (this.el.aiOutput) {
                this.el.aiOutput.textContent = `ヒント: ${hint}`;
            }
            const aiOutputModern = document.getElementById('ai-output-modern');
            if (aiOutputModern) {
                aiOutputModern.textContent = `ヒント: ${hint}`;
            }
            this.setAIStatus('ヒント表示', '#ffaa00');
        }
        
        // Auto-advance to next question after showing hint for 5 seconds
        setTimeout(() => {
            this.showNotification('次の問題に進みます', 'info');
            this.nextQuestion();
        }, 5000);
    }

    // Input validation and security utilities
    validateInput(input, type = 'general') {
        if (!input) return '';
        
        const str = String(input);
        const limit = this.inputLimits[type] || this.inputLimits.general;
        
        // Length validation
        if (str.length > limit) {
            throw new Error(`入力が長すぎます（最大${limit}文字）`);
        }
        
        return str.trim();
    }

    sanitizeInput(input) {
        if (!input) return '';
        
        const str = String(input);
        
        // Remove potential XSS characters and control characters
        return str
            .replace(/[<>]/g, '') // Remove < and >
            .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    }

    checkRateLimit(identifier = 'default') {
        const now = Date.now();
        const windowStart = now - 60000; // 1 minute window
        
        if (!this.inputRateLimit.has(identifier)) {
            this.inputRateLimit.set(identifier, []);
        }
        
        const requests = this.inputRateLimit.get(identifier);
        
        // Remove old requests outside the window
        const recentRequests = requests.filter(time => time > windowStart);
        
        if (recentRequests.length >= this.maxRequestsPerMinute) {
            throw new Error('リクエストが多すぎます。少し待ってからお試しください。');
        }
        
        recentRequests.push(now);
        this.inputRateLimit.set(identifier, recentRequests);
        
        return true;
    }

    validateUrl(url) {
        if (!url || typeof url !== 'string') {
            throw new Error('有効なURLを入力してください');
        }

        try {
            const validatedUrl = new URL(url);
            
            // Only allow http and https protocols
            if (!['http:', 'https:'].includes(validatedUrl.protocol)) {
                throw new Error('HTTPまたはHTTPSのURLのみサポートされています');
            }
            
            return validatedUrl.toString();
        } catch (e) {
            throw new Error('無効なURL形式です');
        }
    }

    validateNickname(nickname) {
        if (!nickname || typeof nickname !== 'string') {
            throw new Error('ニックネームを入力してください');
        }

        const cleaned = this.sanitizeInput(nickname);
        const validated = this.validateInput(cleaned, 'nickname');
        
        if (validated.length < 1) {
            throw new Error('ニックネームは1文字以上である必要があります');
        }
        
        if (validated.length > 30) {
            throw new Error('ニックネームは30文字以下である必要があります');
        }
        
        // Check for inappropriate content (basic)
        const inappropriate = ['admin', 'system', 'bot', 'null', 'undefined'];
        if (inappropriate.some(word => validated.toLowerCase().includes(word))) {
            throw new Error('そのニックネームは使用できません');
        }
        
        return validated;
    }

    validateAnswer(answer) {
        if (!answer || typeof answer !== 'string') {
            return '';
        }

        const cleaned = this.sanitizeInput(answer);
        const validated = this.validateInput(cleaned, 'answer');
        
        return validated;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        window.gameManager = new GameManager();
    } catch (e) {
        console.error("Failed to initialize GameManager:", e);
        document.body.innerHTML = `<div style="color: red; padding: 2rem; font-family: sans-serif;"><h1>Application Error</h1><p>Could not start the application due to a critical error. Please check the console for details.</p><pre>${e.stack}</pre></div>`;
    }
});

// Ensure logo pulse class is applied even if CSS animation was blocked or not applied
document.addEventListener('DOMContentLoaded', () => {
    try {
        const logo = document.querySelector('.game-title h1');
        if (logo && !logo.classList.contains('logo-pulse')) {
            logo.classList.add('logo-pulse');
        }
    } catch (e) {}
});
