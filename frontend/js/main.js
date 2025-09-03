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

        // Tutorial properties
        this.tutorialStep = 0;
        this.tutorialSteps = null;
        this.currentHighlight = null;
        this.tutorialKeyHandler = null;
        this.tutorialTimeout = null;

        // Server connection state
        this.isServerConnected = false;
        this.connectionEstablishedTime = null;
        
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

        // Initialize application flow
        this.initializeAppFlow();

        // Debug: Check if cancel button is properly cached
        console.log('[Debug] cancelMatchmakingBtn cached:', !!this.el.cancelMatchmakingBtn);

        // Handle page unload - cancel matchmaking if active
        window.addEventListener('beforeunload', () => {
            if (this.isMatchmaking) {
                console.log('[App] Page unloading with active matchmaking - cancelling...');
                this.cancelMatchmakingOnUnload();
            }
        });
    }

    initUI() {
        // Initialize UI state - don't show any screens yet
        // The initializeAppFlow() will handle the proper flow

        // Disable game mode buttons initially (server not connected yet)
        this.disableGameModeButtons();

        console.log('[App] UI initialized');
    }

    // Main application flow controller
    initializeAppFlow() {
        console.log('[App] Starting application flow...');

        // Clear any pending matchmaking state from previous sessions
        this.clearPendingMatchOnStartup();

        // Ensure tutorial elements are hidden at startup
        const tutorialModal = document.getElementById('tutorial-select-modal');
        const tutorialOverlay = document.getElementById('tutorial-overlay');

        if (tutorialModal) {
            tutorialModal.style.display = 'none';
            tutorialModal.classList.remove('active');
        }

        if (tutorialOverlay) {
            tutorialOverlay.style.display = 'none';
            tutorialOverlay.classList.remove('active');
        }

        // Always start with startup overlay for server connection
        this.showModal('startup-overlay');

        console.log('[App] Application flow initialized - waiting for server connection');
    }

    // Called when server connection is successful
    onServerConnected() {
        console.log('[App] Server connected, checking tutorial status...');

        // Mark server as connected
        this.isServerConnected = true;

        // Record connection time for delay enforcement
        this.connectionEstablishedTime = Date.now();

        // Update connection status UI
        const connectionIndicator = document.getElementById('connection-indicator');
        const serverStats = document.getElementById('server-stats');
        if (connectionIndicator) connectionIndicator.classList.add('connected');
        if (serverStats) serverStats.textContent = 'サーバー情報: 接続済み';

        // Now check if user has seen tutorial before (after server connection)
        const hasSeenTutorial = localStorage.getItem('hasSeenTutorial') === 'true';

        if (!hasSeenTutorial) {
            console.log('[App] First time user detected - showing tutorial selection');
            this.isFirstTimeUser = true;
            // Show tutorial selection for first-time users
            this.closeModal('startup-overlay');

            // Show tutorial select modal
            const tutorialModal = document.getElementById('tutorial-select-modal');
            if (tutorialModal) {
                tutorialModal.style.display = 'flex';
                tutorialModal.classList.add('active');
            }

            // Bind tutorial buttons when modal is shown
            setTimeout(() => this.bindTutorialButtons(), 100);
        } else {
            console.log('[App] Returning user - going directly to main menu');
            this.isFirstTimeUser = false;
            // Go directly to main menu for returning users
            this.closeModal('startup-overlay');
            this.showScreen('main-menu');

            // Enable game mode buttons after 5 second delay
            setTimeout(() => {
                console.log('[App] Enabling game mode buttons after connection delay');
                this.enableGameModeButtons();
            }, 5000);
        }
    }

    // Handle game mode button clicks with server connection and delay checks
    handleGameModeClick(mode) {
        // Must be connected
        if (!this.isServerConnected) {
            console.warn(`[${mode.toUpperCase()}] Cannot start ${mode} mode - server not connected`);
            this.showModal('connection-error-modal');
            return;
        }

        // Determine the button for this mode and check its disabled state
        const btnMap = {
            solo: this.el.soloModeBtn,
            vs: this.el.vsModeBtn,
            rta: this.el.rtaModeBtn,
            practice: this.el.practiceModeBtn
        };

        const btn = btnMap[mode];
        if (btn && btn.disabled) {
            // If we have a recorded connection time, show remaining seconds; otherwise show generic message
            if (this.connectionEstablishedTime) {
                const timeSince = Date.now() - this.connectionEstablishedTime;
                if (timeSince < 5000) {
                    const remainingTime = Math.ceil((5000 - timeSince) / 1000);
                    this.showNotification(`サーバー接続後${remainingTime}秒待ってください`, 'warning');
                    return;
                }
            }

            this.showNotification('接続処理が完了していません。しばらくお待ちください', 'warning');
            return;
        }

        // Execute the appropriate action based on mode
        switch (mode) {
            case 'solo':
                this.startSoloMode();
                break;
            case 'vs':
                this.showModal('match-select-modal');
                break;
            case 'rta':
                this.startRtaMode();
                break;
            case 'practice':
                this.showModal('practice-setup-modal');
                break;
            default:
                console.error(`Unknown game mode: ${mode}`);
        }
    }

    // Disable game mode buttons when server is not connected
    disableGameModeButtons() {
        const buttons = [
            this.el.soloModeBtn,
            this.el.vsModeBtn,
            this.el.rtaModeBtn,
            this.el.practiceModeBtn
        ];

        buttons.forEach(btn => {
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            }
        });
    }

    // Enable game mode buttons after server connection and delay
    enableGameModeButtons() {
        const buttons = [
            this.el.soloModeBtn,
            this.el.vsModeBtn,
            this.el.rtaModeBtn,
            this.el.practiceModeBtn
        ];

        buttons.forEach(btn => {
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            }
        });
    }

    // Called when user chooses to start tutorial
    startTutorialFlow() {
        console.log('[App] Starting tutorial flow...');

        // Close tutorial select modal
        const tutorialModal = document.getElementById('tutorial-select-modal');
        if (tutorialModal) {
            tutorialModal.style.display = 'none';
            tutorialModal.classList.remove('active');
        }

        // Bind tutorial buttons before starting tutorial
        this.bindTutorialButtons();

        this.startTutorial();
    }

    // Called when user chooses to skip tutorial
    skipTutorialFlow() {
        console.log('[App] Skipping tutorial, going to main menu...');

        // Close tutorial select modal
        const tutorialModal = document.getElementById('tutorial-select-modal');
        if (tutorialModal) {
            tutorialModal.style.display = 'none';
            tutorialModal.classList.remove('active');
        }

        this.showScreen('main-menu');
        localStorage.setItem('hasSeenTutorial', 'true');

        // Enable game mode buttons after 5 second delay
        setTimeout(() => {
            console.log('[App] Enabling game mode buttons after tutorial skip');
            this.enableGameModeButtons();
        }, 5000);
    }

    // Called when tutorial is completed
    onTutorialCompleted() {
        console.log('[App] Tutorial completed, going to main menu...');
        this.showScreen('main-menu');
        localStorage.setItem('hasSeenTutorial', 'true');
    }

    // Server connection and startup flow
    startupConnect() {
        console.log('[App] Starting server connection process...');

        const serverUrl = this.el.startupServer?.value?.trim();
        const lmServerUrl = this.el.startupLmserver?.value?.trim();
        const nickname = this.el.startupNickname?.value?.trim();
        const forceLm = this.el.startupForceLm?.checked;

        // Validate inputs
        if (!serverUrl) {
            this.showNotification('ゲームサーバーのURLを入力してください', 'error');
            return;
        }

        if (!nickname) {
            this.showNotification('ニックネームを入力してください', 'error');
            return;
        }

        // Validate URLs
        try {
            new URL(serverUrl);
            if (lmServerUrl) {
                new URL(lmServerUrl);
            }
        } catch (e) {
            this.showNotification('有効なURLを入力してください', 'error');
            return;
        }

        // Save settings
        localStorage.setItem('gameServerUrl', serverUrl);
        if (lmServerUrl) {
            localStorage.setItem('lmServerUrl', lmServerUrl);
        }
        localStorage.setItem('nickname', nickname);

        // Update game manager properties
        this.gameServerUrl = serverUrl;
        this.lmServerUrl = lmServerUrl || '';
        this.nickname = nickname;

        // Update connection status
        if (this.el.connectionStatus) {
            this.el.connectionStatus.textContent = '接続中...';
        }

        // Disable connect button during connection
        if (this.el.connectServerBtn) {
            this.el.connectServerBtn.disabled = true;
            this.el.connectServerBtn.textContent = '接続中...';
        }

        // Test server connection
        this.testServerConnection().then(success => {
            if (success) {
                console.log('[App] Server connection successful');
                this.showNotification('サーバーに接続しました！', 'success');

                // Proceed to next step in the flow
                this.onServerConnected();
            } else {
                console.error('[App] Server connection failed');
                this.showNotification('サーバー接続に失敗しました', 'error');

                // Re-enable connect button
                if (this.el.connectServerBtn) {
                    this.el.connectServerBtn.disabled = false;
                    this.el.connectServerBtn.textContent = '接続して開始';
                }

                if (this.el.connectionStatus) {
                    this.el.connectionStatus.textContent = '接続失敗';
                }
            }
        }).catch(error => {
            console.error('[App] Connection test error:', error);
            this.showNotification('接続テスト中にエラーが発生しました', 'error');

            // Re-enable connect button
            if (this.el.connectServerBtn) {
                this.el.connectServerBtn.disabled = false;
                this.el.connectServerBtn.textContent = '接続して開始';
            }

            if (this.el.connectionStatus) {
                this.el.connectionStatus.textContent = 'エラー';
            }
        });
    }

    async testServerConnection() {
        try {
            // Test game server connection
            // Use AbortController for broader compatibility (AbortSignal.timeout may not exist)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            let gameServerResponse;
            try {
                gameServerResponse = await fetch(`${this.gameServerUrl}/health`, {
                    method: 'GET',
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timeoutId);
            }

            if (!gameServerResponse.ok) {
                console.warn('[App] Game server health check failed');
                return false;
            }

            // Test LM Studio connection if provided and not forced to skip
            if (this.lmServerUrl && !this.el.startupForceLm?.checked) {
                try {
                    const lmController = new AbortController();
                    const lmTimeout = setTimeout(() => lmController.abort(), 5000);
                    try {
                        const lmResponse = await fetch(`${this.lmServerUrl}/health`, {
                            method: 'GET',
                            signal: lmController.signal
                        });

                        if (!lmResponse.ok) {
                            console.warn('[App] LM Studio health check failed, but continuing');
                        }
                    } finally {
                        clearTimeout(lmTimeout);
                    }
                } catch (lmError) {
                    console.warn('[App] LM Studio connection failed, but continuing:', lmError);
                }
            }

            console.log('[App] testServerConnection: game server reachable');
            return true;
        } catch (error) {
            console.error('[App] Server connection test failed:', error);
            return false;
        }
    }

    // Bind tutorial buttons safely
    bindTutorialButtons() {
        console.log('[Tutorial] Binding tutorial buttons...');

        // Remove existing event listeners first to prevent duplicates
        const yes = document.getElementById('tutorial-yes-btn');
        const no = document.getElementById('tutorial-no-btn');
        const prev = document.getElementById('tutorial-prev-btn');
        const next = document.getElementById('tutorial-next-btn');
        const skip = document.getElementById('tutorial-skip-btn');

        console.log('[Tutorial] Found elements:', {
            yes: !!yes,
            no: !!no,
            prev: !!prev,
            next: !!next,
            skip: !!skip
        });

        // Check if skip button should be shown
        if (skip) {
            const shouldShow = this.checkIfDevelopmentEnvironment();
            skip.style.display = shouldShow ? 'inline-block' : 'none';
            console.log('[Tutorial] Skip button', shouldShow ? 'enabled' : 'hidden',
                       'for', shouldShow ? 'development' : 'production', 'environment');
        }

        // Bind event listeners
        if (yes) {
            // Remove existing listener
            yes.removeEventListener('click', this._tutorialYesHandler);
            // Create new handler
            this._tutorialYesHandler = () => {
                console.log('[Tutorial] Yes button clicked, starting tutorial flow');
                this.startTutorialFlow();
            };
            yes.addEventListener('click', this._tutorialYesHandler);
        } else {
            console.error('[Tutorial] Yes button not found');
        }

        if (no) {
            // Remove existing listener
            no.removeEventListener('click', this._tutorialNoHandler);
            // Create new handler
            this._tutorialNoHandler = () => {
                console.log('[Tutorial] No button clicked, skipping tutorial');
                this.skipTutorialFlow();
            };
            no.addEventListener('click', this._tutorialNoHandler);
        } else {
            console.error('[Tutorial] No button not found');
        }

        if (prev) {
            prev.removeEventListener('click', this._tutorialPrevHandler);
            this._tutorialPrevHandler = () => this.previousTutorialStep();
            prev.addEventListener('click', this._tutorialPrevHandler);
        }

        if (next) {
            next.removeEventListener('click', this._tutorialNextHandler);
            this._tutorialNextHandler = () => this.nextTutorialStep();
            next.addEventListener('click', this._tutorialNextHandler);
        }

        if (skip) {
            skip.removeEventListener('click', this._tutorialSkipHandler);
            this._tutorialSkipHandler = () => this.endTutorial();
            skip.addEventListener('click', this._tutorialSkipHandler);
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
            // leaderboardModal removed (ranking廃止)
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
            // leaderboardList removed (ranking廃止)
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
        safeAdd(this.el.soloModeBtn, 'click', () => this.handleGameModeClick('solo'));
        safeAdd(this.el.vsModeBtn, 'click', () => this.handleGameModeClick('vs'));
        safeAdd(this.el.rtaModeBtn, 'click', () => this.handleGameModeClick('rta'));
        safeAdd(this.el.practiceModeBtn, 'click', () => this.handleGameModeClick('practice'));
        safeAdd(this.el.settingsMainBtn, 'click', () => this.showModal('settings-modal'));
    // leaderboard button removed
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
        console.log('[App] Cancel matchmaking button listener attached:', !!this.el.cancelMatchmakingBtn);

        // Voice recognition event listeners
        const voiceToggle = document.getElementById('voice-toggle');
        const voiceInputBtn = document.getElementById('voice-input-btn');
        if (voiceToggle) voiceToggle.addEventListener('click', () => this.toggleVoiceRecognition());
        if (voiceInputBtn) voiceInputBtn.addEventListener('click', () => this.toggleVoiceRecognition());

        // Pass system event listener
        const passBtnNew = document.getElementById('pass-btn');
        if (passBtnNew) passBtnNew.addEventListener('click', () => this.usePass());
    }

    checkIfDevelopmentEnvironment() {
        // Check various development indicators
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        const searchParams = new URLSearchParams(window.location.search);

        // Local development
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
            return true;
        }

        // Development protocol (file://)
        if (protocol === 'file:') {
            return true;
        }

        // Development query parameter
        if (searchParams.has('dev') || searchParams.has('debug') || searchParams.has('tutorial')) {
            return true;
        }

        // Check for development tools
        if (window.__DEV__ || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
            return true;
        }

        // Check user agent for development indicators
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('electron') || userAgent.includes('nwjs')) {
            return true;
        }

        // Check for common development ports
        const port = window.location.port;
        if (port === '3000' || port === '8080' || port === '8000' || port === '5000') {
            return true;
        }

        return false;
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

        // Tab switching functionality
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn));
        });
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
            // Mark app as connected and run post-connection flow (sets isServerConnected, UI, tutorial flow)
            try {
                this.onServerConnected();
            } catch (e) {
                console.warn('[Startup] onServerConnected failed:', e);
            }

            const hasSeenTutorial = localStorage.getItem('hasSeenTutorial');
            console.log('[Startup] hasSeenTutorial:', hasSeenTutorial);

            if (!hasSeenTutorial) {
                console.log('[Startup] Showing tutorial select modal');
                setTimeout(() => {
                    const modal = document.getElementById('tutorial-select-modal');
                    if (modal) {
                        modal.classList.add('active');
                        console.log('[Startup] Tutorial select modal activated');
                    } else {
                        console.error('[Startup] Tutorial select modal not found');
                    }
                }, 120);
            } else {
                console.log('[Startup] Tutorial already seen, showing main menu');
                // Ensure main menu is visible
                setTimeout(() => {
                    this.showScreen('main-menu');
                }, 100);
            }
            
            this.startHeartbeat();
            this.startServerStatsPolling();
            // Removed automatic matchmaking resume on connection - user must manually start matchmaking

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
        // Check if server is connected before starting game
        if (!this.isServerConnected) {
            console.warn('[Solo] Cannot start solo mode - server not connected');
            this.showModal('connection-error-modal');
            return;
        }

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
    }    async startRtaMode() {
        // Check if server is connected before starting game
        if (!this.isServerConnected) {
            console.warn('[RTA] Cannot start RTA mode - server not connected');
            this.showModal('connection-error-modal');
            return;
        }

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
        // Check if server is connected before starting game
        if (!this.isServerConnected) {
            console.warn('[Practice] Cannot start practice mode - server not connected');
            this.showModal('connection-error-modal');
            return;
        }

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
        
        // Cancel matchmaking if active
        if (this.isMatchmaking) {
            console.log('[Menu] Cancelling active matchmaking');
            this.isMatchmaking = false;
            this.matchmakingStatus = {};
            this.stopLobbyPolling();
            this.hidePersistentStatusUI();
            this.disableMatchButtons(false);
            try {
                this.clearPendingMatch();
            } catch (e) {
                console.warn('[Menu] Failed to clear pending match:', e);
            }
        }
        
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
        // Check if server is connected before starting matchmaking
        if (!this.isServerConnected) {
            console.warn('[Matchmaking] Cannot join random match - server not connected');
            this.showModal('connection-error-modal');
            return;
        }

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
        // Check if server is connected before creating room
        if (!this.isServerConnected) {
            console.warn('[Room] Cannot create room - server not connected');
            this.showModal('connection-error-modal');
            return;
        }

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
        // Check if server is connected before joining room
        if (!this.isServerConnected) {
            console.warn('[Room] Cannot join room - server not connected');
            this.showModal('connection-error-modal');
            return;
        }

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
        console.log('[Cancel] cancelMatchmaking called, isMatchmaking:', this.isMatchmaking);

        if (!this.isMatchmaking) {
            console.log('[Cancel] Not currently matchmaking');
            return this.showNotification('現在マッチング中ではありません', 'warning');
        }

        console.log('[Cancel] Cancelling matchmaking...');
        const cancelBtn = document.getElementById('cancel-matchmaking-btn');
        console.log('[Cancel] Cancel button element:', cancelBtn);

        if (cancelBtn) {
            cancelBtn.disabled = true;
            cancelBtn.textContent = 'キャンセル中...';
            console.log('[Cancel] Button disabled and text changed');
        } else {
            console.error('[Cancel] Cancel button not found!');
        }

        try {
            // Try to notify server about leaving
            const response = await fetch(`${this.gameServerUrl}/lobby/leave`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ player_id: this.playerId })
            });

            if (response.ok) {
                console.log('[Cancel] Successfully left lobby');
            } else {
                console.warn('[Cancel] Server responded with error:', response.status);
            }
        } catch (e) {
            console.error('[Cancel] Failed to leave lobby:', e);
            // Don't show error notification for network issues during cancel
            // as the local state will still be cleaned up
        }

        // Always clean up local state regardless of server response
        console.log('[Cancel] Cleaning up local matchmaking state');
        this.isMatchmaking = false;
        this.matchmakingStatus = {};
        this.stopLobbyPolling();
        this.hidePersistentStatusUI();
        this.disableMatchButtons(false);

        try {
            this.clearPendingMatch();
        } catch (e) {
            console.warn('[Cancel] Failed to clear pending match:', e);
        }

        this.showNotification('マッチングをキャンセルしました', 'info');
        console.log('[Cancel] Matchmaking cancelled successfully');
    }

    // Synchronous matchmaking cancellation for page unload
    cancelMatchmakingOnUnload() {
        if (!this.isMatchmaking) {
            console.log('[Unload] No active matchmaking to cancel');
            return;
        }

        console.log('[Unload] Cancelling matchmaking on page unload...');

        try {
            // Try synchronous server notification (limited time available)
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${this.gameServerUrl}/lobby/leave`, false); // synchronous
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify({ player_id: this.playerId }));

            if (xhr.status === 200) {
                console.log('[Unload] Successfully notified server about leaving');
            } else {
                console.warn('[Unload] Server notification failed:', xhr.status);
            }
        } catch (e) {
            console.error('[Unload] Failed to notify server:', e);
        }

        // Clean up local state
        this.isMatchmaking = false;
        this.matchmakingStatus = {};
        this.stopLobbyPolling();
        this.hidePersistentStatusUI();
        this.disableMatchButtons(false);

        try {
            this.clearPendingMatch();
        } catch (e) {
            console.warn('[Unload] Failed to clear pending match:', e);
        }

        console.log('[Unload] Matchmaking cancelled on page unload');
    }

    startLobbyPolling(params) {
        if (this.lobbyPollInterval) clearInterval(this.lobbyPollInterval);

        let consecutiveErrors = 0;
        const maxConsecutiveErrors = 3;
        let pollCount = 0;

        // Ensure we have a valid playerId before starting polling. If missing, attempt a one-time re-registration.
        const ensurePlayerId = async () => {
            if (this.playerId) return true;
            try {
                console.log('[Lobby] playerId missing, attempting re-registration...');
                if (!this.gameServerUrl || !this.nickname) {
                    throw new Error('playerIdがなく、再登録に必要な情報が不足しています');
                }
                const regj = await window.GameAPI.register(this.gameServerUrl, this.nickname);
                if (!regj || !regj.player_id) throw new Error('再登録に失敗しました');
                this.playerId = regj.player_id;
                if (regj.session_token) {
                    this.sessionToken = regj.session_token;
                    localStorage.setItem('sessionToken', this.sessionToken);
                }
                localStorage.setItem('playerId', this.playerId);
                console.log('[Lobby] Re-registration successful, playerId:', this.playerId);
                return true;
            } catch (re) {
                console.error('[Lobby] Re-registration failed:', re);
                this.showNotification('プレイヤーIDが無効です。再接続してください。', 'error');
                return false;
            }
        };

        const poll = async () => {
            if (!this.isMatchmaking) {
                console.log('[Lobby] Stopping polling - matchmaking cancelled');
                return this.stopLobbyPolling();
            }

            pollCount++;
            console.log(`[Lobby] Poll attempt #${pollCount}`);

            try {
                const endpoint = params.roomId ? `${this.gameServerUrl}/room/join` : `${this.gameServerUrl}/lobby/join`;
                const payload = params.roomId
                    ? { player_id: this.playerId, room_id: params.roomId, password: params.password || '' }
                    : { player_id: this.playerId, rule: params.rule };

                console.log('[Lobby] Sending request to:', endpoint, 'with payload:', payload);

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                }

                const data = await res.json();
                console.log('[Lobby] Received response:', data);

                if (data.error) {
                    throw new Error(data.error);
                }

                // Reset error counter on successful response
                consecutiveErrors = 0;

                if (data.game_id) {
                    console.log('[Lobby] Match found! Game ID:', data.game_id);
                    this.handleMatchFound(data);
                } else if (data.waiting) {
                    console.log('[Lobby] Still waiting, updating status');
                    this.matchmakingStatus = { ...this.matchmakingStatus, ...data };
                    this.updatePersistentStatusUI();
                } else {
                    console.warn('[Lobby] Unexpected response format:', data);
                }

            } catch (e) {
                consecutiveErrors++;
                const msg = e && e.message ? e.message : String(e);
                console.error(`[Lobby] Error (attempt ${consecutiveErrors}/${maxConsecutiveErrors}):`, msg);

                this.showNotification(`ロビー接続エラー: ${msg}`, 'error');

                if (this.el.lobbyStatus) {
                    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('CORS')) {
                        this.el.lobbyStatus.textContent = 'サーバーに接続できません（CORS設定またはサーバーが停止している可能性があります）。';
                    } else {
                        this.el.lobbyStatus.textContent = `ロビーエラー: ${msg}`;
                    }
                }

                if (consecutiveErrors >= maxConsecutiveErrors) {
                    console.error('[Lobby] Too many consecutive errors, stopping polling');
                    this.stopLobbyPolling();
                    this.hidePersistentStatusUI();
                    this.isMatchmaking = false;
                    this.showNotification('マッチングを中止しました。サーバー接続に問題があります。', 'error');
                }
            }
        };

        // Initial poll - ensure player id first
        ensurePlayerId().then(ok => {
            if (ok) {
                poll();
                // Set up interval polling with shorter interval for better responsiveness
                this.lobbyPollInterval = setInterval(poll, 3000); // 3 seconds for better responsiveness
            } else {
                console.error('[Lobby] Cannot start polling without a valid playerId');
                this.isMatchmaking = false;
                this.hidePersistentStatusUI();
                this.disableMatchButtons(false);
            }
        }).catch(err => {
            console.error('[Lobby] ensurePlayerId check failed:', err);
            this.isMatchmaking = false;
        });
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

    // Clear pending matchmaking state on application startup
    clearPendingMatchOnStartup() {
        try {
            const raw = localStorage.getItem('pendingMatch');
            if (raw) {
                console.log('[Startup] Clearing pending matchmaking state from previous session');
                localStorage.removeItem('pendingMatch');
            }
        } catch (e) {
            console.warn('[Startup] Failed to clear pending match on startup:', e);
        }
    }

    restorePendingMatch() {
        try {
            const raw = localStorage.getItem('pendingMatch');
            if (!raw) {
                console.log('[Restore] No pending match found in localStorage');
                return;
            }

            const obj = JSON.parse(raw);
            if (!obj) {
                console.log('[Restore] Invalid pending match data');
                return;
            }

            console.log('[Restore] Found pending match:', obj);

            // Wait for player ID and server URL to be available
            const waitForConnection = () => {
                if (this.playerId && this.gameServerUrl) {
                    console.log('[Restore] Connection ready, resuming matchmaking');
                    this.isMatchmaking = true;
                    this.matchmakingStatus = { ...(this.matchmakingStatus || {}), ...obj };
                    this.disableMatchButtons(true);
                    this.showPersistentStatusUI();
                    this.showNotification('マッチングを再開しました', 'info');
                    this.startLobbyPolling(obj);
                } else {
                    console.log('[Restore] Waiting for connection...');
                    setTimeout(waitForConnection, 1000);
                }
            };

            // Start waiting immediately
            waitForConnection();

        } catch (e) {
            console.warn('[Restore] restorePendingMatch failed:', e);
            // Clean up corrupted data
            try {
                localStorage.removeItem('pendingMatch');
            } catch (cleanupError) {
                console.warn('[Restore] Failed to clean up corrupted data:', cleanupError);
            }
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
            const modeName = this.getModeName(rule) || 'ランダム';
            const queuePosition = position ? `${position}位` : '確認中...';
            const waitingCount = total_waiting ? `${total_waiting}人待機中` : '待機人数確認中...';
            statusText = `マッチング中 (${modeName}) — ${queuePosition} / ${waitingCount}`;
        } else if (type === 'room') {
            const current = current_players || 0;
            const max = max_players || '?';
            statusText = `ルーム待機中: ${current} / ${max} 人`;
        } else {
            statusText = 'マッチング準備中...';
        }

        if (this.el.matchmakingStatus) {
            this.el.matchmakingStatus.textContent = statusText;
        }

        // update cancel button label when player is first in queue
        const cancel = document.getElementById('cancel-matchmaking-btn');
        if (cancel) {
            if (position === 1) {
                cancel.textContent = 'キャンセル（あなたが先頭）';
            } else {
                cancel.textContent = 'キャンセル';
            }
        }

        // Show persistent status container
        if (this.el.persistentStatusContainer) {
            this.el.persistentStatusContainer.style.display = 'flex';
        }

        // Update waiting badge
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
    // Preserve provided answers from the server. Previously answers were being
    // cleared here which caused client-side answer checking to always fail
    // in VS mode (no answers => checkAnswer() never matches).
    this.questions = gameData.questions.map(q => ({ ...q }));
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
    // Show correct count instead of score
    if (this.el.finalScore) this.el.finalScore.textContent = String(this.correctAnswers);
        if (this.el.resultCorrect) this.el.resultCorrect.textContent = `${this.correctAnswers} / ${this.questions.length}`;
        if (this.el.resultQuestions) this.el.resultQuestions.textContent = this.questionCount;
        const accuracy = this.questions.length > 0 ? Math.round((this.correctAnswers / this.questions.length) * 100) : 0;
        if (this.el.resultAccuracy) this.el.resultAccuracy.textContent = `${accuracy}%`;
        if (this.el.resultTime) this.el.resultTime.textContent = this.formatTime(timeTaken);
        this.showModal('result-modal');
    // Do not submit scores anymore (ranking廃止)

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
            this.stopGameStatePolling();
            this.showModal('result-modal');
        }
    }

    async submitScore(timeInSeconds) {
        // Ranking廃止: no-op for backward compatibility
        return;
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
            try {
                this.se = new Audio();
            } catch (e) {
                return; // audio unsupported
            }
        }
        try {
            const url = (this.gameServerUrl || '') + `/bgm/${fileName}`;
            this.se.src = url;
            this.se.currentTime = 0;
            this.se.play().catch(() => {});
        } catch (e) {}
    }

    stopTimer() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    async showLeaderboard() {
        // Ranking廃止: no-op
        return;
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
        
    // Leaderboard tabs removed
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
        console.log('[Tutorial] Starting tutorial...');
        this.tutorialStep = 0;
        // Comprehensive tutorial with detailed explanations, visual elements, and interactive demos
        this.tutorialSteps = [
            {
                title: "🎮 Rush Maximizerへようこそ！",
                description: `
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div style="font-size: 3rem; margin: 20px 0;">🎯🤖⚡</div>
                        <h3 style="color: #00d4ff; margin: 10px 0;">AIと対戦する高速質問ゲーム</h3>
                    </div>

                    <div style="background: rgba(0, 212, 255, 0.1); padding: 15px; border-radius: 10px; margin: 15px 0;">
                        <strong>🎯 ゲームの目的:</strong><br>
                        AIよりも早く、少ない質問でターゲットとなる答えを特定する
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px;">
                        <div style="background: rgba(0, 255, 136, 0.1); padding: 10px; border-radius: 8px;">
                            <strong>✅ 勝利条件:</strong><br>
                            • 正確な答えを導き出す<br>
                            • 時間内に回答する<br>
                            • 効率的な質問をする
                        </div>
                        <div style="background: rgba(255, 107, 53, 0.1); padding: 10px; border-radius: 8px;">
                            <strong>❌ 敗北条件:</strong><br>
                            • 時間切れになる<br>
                            • 誤った結論を出す<br>
                            • 質問が非効率的
                        </div>
                    </div>
                `,
                highlight: null,
                icon: "🎮",
                duration: 8000
            },
            {
                title: "🎯 ターゲットの確認方法",
                description: `
                    <div style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                        <strong>📍 ターゲット表示位置:</strong> 画面上部の青い枠内<br>
                        <strong>📝 内容:</strong> あなたが特定すべき答え<br>
                        <strong>🔍 特徴:</strong> 長文の場合は自動でスクロール可能
                    </div>

                    <div style="border: 2px solid #00d4ff; border-radius: 10px; padding: 15px; margin: 15px 0; background: rgba(0, 212, 255, 0.05);">
                        <div style="text-align: center; font-weight: bold; margin-bottom: 10px;">サンプルターゲット:</div>
                        <div style="background: rgba(0, 212, 255, 0.1); padding: 10px; border-radius: 5px; font-family: monospace;">
                            慶応4年（1868年）に起こった、日本史上最大級の内戦
                        </div>
                    </div>

                    <div style="color: #ffaa00; font-weight: bold;">
                        💡 ヒント: ターゲットをよく読み、質問の方向性を決めることが重要です！
                    </div>
                `,
                highlight: ".target-display",
                icon: "🎯",
                demo: 'target',
                duration: 6000
            },
            {
                title: "📝 質問の入力テクニック",
                description: `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                        <div style="background: rgba(0, 255, 136, 0.1); padding: 12px; border-radius: 8px;">
                            <strong>✅ 良い質問例:</strong><br>
                            • 「これは何年に起こりましたか？」<br>
                            • 「どこの出来事ですか？」<br>
                            • 「誰が関与していますか？」
                        </div>
                        <div style="background: rgba(255, 71, 87, 0.1); padding: 12px; border-radius: 8px;">
                            <strong>❌ 避ける質問:</strong><br>
                            • 「はいですか？いいえですか？」<br>
                            • 「これのことですか？」<br>
                            • 「わかりません」
                        </div>
                    </div>

                    <div style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 10px; margin: 15px 0;">
                        <strong>⌨️ 便利なショートカット:</strong><br>
                        • <kbd>Ctrl</kbd> + <kbd>Enter</kbd>: 質問を送信<br>
                        • <kbd>Tab</kbd>: 次の入力欄に移動<br>
                        • <kbd>音声ボタン</kbd>: 音声入力開始
                    </div>

                    <div style="border: 2px solid #00d4ff; border-radius: 10px; padding: 15px; margin: 15px 0;">
                        <strong>🎯 効率的な質問のポイント:</strong><br>
                        1. ターゲットのカテゴリを特定する<br>
                        2. 時系列・場所・人物を絞り込む<br>
                        3. 可能性を2分割する質問をする
                    </div>
                `,
                highlight: ".player-textarea",
                icon: "📝",
                demo: 'input',
                demoText: 'この出来事は江戸時代に起こりましたか？',
                duration: 10000
            },
            {
                title: "🤖 AI回答の分析方法",
                description: `
                    <div style="background: rgba(0, 212, 255, 0.1); padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                        <strong>🔍 AI回答の読み方:</strong><br>
                        • 事実に基づいた正確な情報<br>
                        • 文脈を考慮した詳細な説明<br>
                        • 関連する背景情報も含む
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0;">
                        <div style="background: rgba(0, 255, 136, 0.1); padding: 12px; border-radius: 8px;">
                            <strong>📊 回答の活用:</strong><br>
                            • 新しい手がかりを得る<br>
                            • 誤った仮説を排除<br>
                            • 次の質問の方向性を決める
                        </div>
                        <div style="background: rgba(255, 170, 0, 0.1); padding: 12px; border-radius: 8px;">
                            <strong>⚠️ 注意点:</strong><br>
                            • 回答中はタイマーが停止<br>
                            • 回答は即座に分析<br>
                            • 時間を無駄にしない
                        </div>
                    </div>

                    <div style="border: 2px solid #ffaa00; border-radius: 10px; padding: 15px; margin: 15px 0; background: rgba(255, 170, 0, 0.05);">
                        <strong>🎯 実践テクニック:</strong><br>
                        AIの回答からキーワードを抽出し、次の質問の軸にする
                    </div>
                `,
                highlight: "#ai-output",
                icon: "🤖",
                demo: 'ai',
                demoText: 'これは戊辰戦争（1868-1869年）のことです。江戸幕府と新政府軍の間で起こった内戦で、明治維新の重要な出来事です。',
                duration: 8000
            },
            {
                title: "⏱️ タイマー管理の極意",
                description: `
                    <div style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                        <strong>⏱️ 制限時間:</strong> 各質問に25秒<br>
                        <strong>🎨 色分け:</strong> 青(通常) → 赤(5秒以内)<br>
                        <strong>⏸️ 一時停止:</strong> AI回答中は自動停止
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin: 15px 0;">
                        <div style="background: rgba(0, 212, 255, 0.1); padding: 10px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 1.5rem;">🔵</div>
                            <strong>通常</strong><br>
                            落ち着いて質問
                        </div>
                        <div style="background: rgba(255, 170, 0, 0.1); padding: 10px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 1.5rem;">🟡</div>
                            <strong>注意</strong><br>
                            時間意識
                        </div>
                        <div style="background: rgba(255, 71, 87, 0.1); padding: 10px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 1.5rem;">🔴</div>
                            <strong>緊急</strong><br>
                            即判断
                        </div>
                    </div>

                    <div style="border: 2px solid #00d4ff; border-radius: 10px; padding: 15px; margin: 15px 0;">
                        <strong>⚡ 時間管理のコツ:</strong><br>
                        • 最初の10秒で質問を考える<br>
                        • 残り10秒で結論をまとめる<br>
                        • 5秒以内は直感で判断
                    </div>
                `,
                highlight: ".timer-section",
                icon: "⏱️",
                duration: 7000
            },
            {
                title: "📈 スコアシステムの理解",
                description: `
                    <div style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                        <strong>🏆 スコア計算式:</strong><br>
                        基礎点(100) + 時間ボーナス + 連続正解ボーナス
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0;">
                        <div style="background: rgba(0, 255, 136, 0.1); padding: 12px; border-radius: 8px;">
                            <strong>⚡ 時間ボーナス:</strong><br>
                            • 20秒以内: +50点<br>
                            • 15秒以内: +30点<br>
                            • 10秒以内: +20点<br>
                            • 5秒以内: +10点
                        </div>
                        <div style="background: rgba(255, 107, 53, 0.1); padding: 12px; border-radius: 8px;">
                            <strong>🔥 連続ボーナス:</strong><br>
                            • 3連続: +25点<br>
                            • 5連続: +50点<br>
                            • 10連続: +100点
                        </div>
                    </div>

                    <div style="border: 2px solid #ffaa00; border-radius: 10px; padding: 15px; margin: 15px 0; background: rgba(255, 170, 0, 0.05);">
                        <strong>🎯 スコアアップの秘訣:</strong><br>
                        • 素早く正確に答える<br>
                        • 連続正解を狙う<br>
                        • 効率的な質問を心がける
                    </div>

                    <div style="color: #00ff88; font-weight: bold; text-align: center; margin-top: 15px;">
                        💪 高スコアを目指して頑張りましょう！
                    </div>
                `,
                highlight: ".progress-ring",
                icon: "📈",
                duration: 8000
            },
            {
                title: "🎵 サウンドと環境設定",
                description: `
                    <div style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                        <strong>🎵 音声設定の重要性:</strong><br>
                        BGMと効果音で集中力を高め、ゲーム体験を向上させる
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0;">
                        <div style="background: rgba(0, 255, 136, 0.1); padding: 12px; border-radius: 8px;">
                            <strong>🎼 BGM設定:</strong><br>
                            • 集中できる曲を選択<br>
                            • 適切な音量に調整<br>
                            • 好みに合わせて変更
                        </div>
                        <div style="background: rgba(255, 107, 53, 0.1); padding: 12px; border-radius: 8px;">
                            <strong>🔊 効果音:</strong><br>
                            • 回答時の通知音<br>
                            • 時間切れの警告音<br>
                            • スコア獲得時の効果音
                        </div>
                    </div>

                    <div style="border: 2px solid #00d4ff; border-radius: 10px; padding: 15px; margin: 15px 0;">
                        <strong>⚙️ 設定のヒント:</strong><br>
                        • 初めての方はBGMを小さめに<br>
                        • 効果音は重要な通知として活用<br>
                        • 環境に合わせて調整可能
                    </div>
                `,
                highlight: ".sound-controls",
                icon: "🎵",
                duration: 6000
            },
            {
                title: "🎨 テーマとレイアウトのカスタマイズ",
                description: `
                    <div style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                        <strong>🎨 テーマ選択の効果:</strong><br>
                        見た目をカスタマイズして、より快適なゲーム環境を作る
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 15px 0;">
                        <div style="background: linear-gradient(135deg, #f8faff, #fff0f5, #f0fff8, #fff8f0, #f5f0ff, #f0f8ff, #fff5f8, #f8fff0, #fafff8); padding: 10px; border-radius: 8px; text-align: center; border: 2px solid #00d4ff;">
                            <strong>💎 Glassmorphism</strong><br>
                            <small>モダンで美しい</small>
                        </div>
                        <div style="background: linear-gradient(135deg, #1a1a2e, #16213e, #0f3460); color: white; padding: 10px; border-radius: 8px; text-align: center;">
                            <strong>🎮 Gaming</strong><br>
                            <small>ゲーミングスタイル</small>
                        </div>
                        <div style="background: linear-gradient(135deg, #ffffff, #f8f9fa, #e9ecef); padding: 10px; border-radius: 8px; text-align: center;">
                            <strong>☀️ Light</strong><br>
                            <small>明るい配色</small>
                        </div>
                        <div style="background: linear-gradient(135deg, #0a0a0a, #1a0a1e, #2a0a2e); color: #ff0080; padding: 10px; border-radius: 8px; text-align: center;">
                            <strong>⚡ Cyberpunk</strong><br>
                            <small>未来的デザイン</small>
                        </div>
                    </div>

                    <div style="border: 2px solid #ffaa00; border-radius: 10px; padding: 15px; margin: 15px 0; background: rgba(255, 170, 0, 0.05);">
                        <strong>📱 レイアウト調整:</strong><br>
                        • 画面サイズに合わせて自動調整<br>
                        • モバイルデバイス対応<br>
                        • 読みやすいフォントサイズ
                    </div>
                `,
                highlight: ".theme-selector",
                icon: "🎨",
                duration: 7000
            },
            {
                title: "🏆 ゲームモードの選択",
                description: `
                    <div style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                        <strong>🎯 目的別モード選択:</strong><br>
                        自分のレベルや目的に合わせて最適なモードを選ぼう
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0;">
                        <div style="background: rgba(0, 255, 136, 0.1); padding: 12px; border-radius: 8px;">
                            <strong>🎮 ソロプレイ</strong><br>
                            <small>• 1人で練習<br>• 時間無制限<br>• じっくり考えられる</small>
                        </div>
                        <div style="background: rgba(255, 107, 53, 0.1); padding: 12px; border-radius: 8px;">
                            <strong>⚡ RTAモード</strong><br>
                            <small>• 時間制限付き<br>• 速さを競う<br>• 上級者向け</small>
                        </div>
                        <div style="background: rgba(0, 212, 255, 0.1); padding: 12px; border-radius: 8px;">
                            <strong>🎯 ランダムマッチ</strong><br>
                            <small>• 誰かと対戦<br>• 実戦練習<br>• ランキング対応</small>
                        </div>
                        <div style="background: rgba(255, 71, 87, 0.1); padding: 12px; border-radius: 8px;">
                            <strong>👥 カスタムルーム</strong><br>
                            <small>• 友達と遊ぶ<br>• ルールカスタム<br>• プライベート</small>
                        </div>
                    </div>

                    <div style="border: 2px solid #00d4ff; border-radius: 10px; padding: 15px; margin: 15px 0;">
                        <strong>🚀 始め方のオススメ:</strong><br>
                        1. ソロモードで基本を練習<br>
                        2. RTAモードで速度を養う<br>
                        3. ランダムマッチで実戦経験
                    </div>
                `,
                highlight: ".mode-cards",
                icon: "🏆",
                duration: 8000
            },
            {
                title: "🎉 チュートリアル完了！準備は整いました",
                description: `
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div style="font-size: 3rem; margin: 20px 0;">🎊🎉🏆</div>
                        <h3 style="color: #00ff88; margin: 10px 0;">おめでとうございます！</h3>
                        <p style="font-size: 1.1rem;">Rush Maximizerの基本操作をマスターしました</p>
                    </div>

                    <div style="background: rgba(0, 255, 136, 0.1); padding: 15px; border-radius: 10px; margin: 15px 0;">
                        <strong>🎯 これからの目標:</strong><br>
                        • AIよりも賢く、速く答える<br>
                        • 効率的な質問テクニックを磨く<br>
                        • 高スコアを狙って楽しむ
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0;">
                        <div style="background: rgba(0, 212, 255, 0.1); padding: 12px; border-radius: 8px; text-align: center;">
                            <strong>📚 学習のコツ</strong><br>
                            <small>• 様々な分野の問題に挑戦<br>• 質問の質を高める<br>• 時間管理を意識する</small>
                        </div>
                        <div style="background: rgba(255, 107, 53, 0.1); padding: 12px; border-radius: 8px; text-align: center;">
                            <strong>🎮 楽しみ方</strong><br>
                            <small>• 友達とスコアを競う<br>• 新しいテーマに挑戦<br>• 毎日コツコツ上達</small>
                        </div>
                    </div>

                    <div style="border: 2px solid #ffaa00; border-radius: 10px; padding: 15px; margin: 15px 0; background: rgba(255, 170, 0, 0.05); text-align: center;">
                        <strong>💪 さあ、ゲームを始めましょう！</strong><br>
                        <small>「ソロプレイ」から始めて、徐々にレベルアップしていきましょう</small>
                    </div>

                    <div style="color: #00d4ff; font-weight: bold; text-align: center; margin-top: 20px;">
                        🚀 あなたの冒険が始まります！
                    </div>
                `,
                highlight: null,
                icon: "🎉",
                duration: 10000
            }
        ];

        this.closeModal('tutorial-select-modal');
        this.showTutorialStep();
        localStorage.setItem('hasSeenTutorial', 'true');
    }

    showTutorialStep() {
        console.log('[Tutorial] Showing tutorial step:', this.tutorialStep);
        const overlay = this.el.tutorialOverlay;
        const titleEl = document.getElementById('tutorial-title');
        const descEl = document.getElementById('tutorial-description');
        const counterEl = document.getElementById('tutorial-counter');
        const prevBtn = document.getElementById('tutorial-prev-btn');
        const nextBtn = document.getElementById('tutorial-next-btn');
        const skipBtn = document.getElementById('tutorial-skip-btn');

        if (!overlay || !this.tutorialSteps) {
            console.error('[Tutorial] Missing overlay or tutorialSteps:', { overlay: !!overlay, tutorialSteps: !!this.tutorialSteps });
            return;
        }

        const step = this.tutorialSteps[this.tutorialStep];
        if (!step) return this.endTutorial();

        overlay.classList.add('active');

        // Enhanced title with icon and animation
        if (titleEl) {
            titleEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="font-size: 2rem; animation: bounceIn 0.6s ease-out;">${step.icon || '📖'}</div>
                    <div>
                        <h2 style="margin: 0; color: #00d4ff; font-size: 1.4rem;">${step.title}</h2>
                    </div>
                </div>
            `;
            titleEl.style.animation = 'fadeInUp 0.5s ease-out';
        }

        // Enhanced description with rich formatting
        if (descEl) {
            descEl.innerHTML = step.description;
            descEl.style.animation = 'fadeIn 0.7s ease-out 0.2s both';
        }

        // Enhanced counter with progress visualization
        if (counterEl) {
            const progress = ((this.tutorialStep + 1) / this.tutorialSteps.length) * 100;
            const currentStep = this.tutorialStep + 1;
            const totalSteps = this.tutorialSteps.length;

            counterEl.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-weight: bold; color: #00d4ff;">ステップ ${currentStep} / ${totalSteps}</span>
                        <span style="color: #888;">${Math.round(progress)}% 完了</span>
                    </div>
                    <div style="position: relative; height: 8px; background: rgba(255,255,255,0.2); border-radius: 4px; overflow: hidden;">
                        <div style="height: 100%; background: linear-gradient(90deg, #00d4ff, #0099cc, #00ff88); border-radius: 4px; width: ${progress}%; transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 10px rgba(0, 212, 255, 0.5);"></div>
                        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent); animation: shimmer 2s infinite;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #888;">
                        <span>開始</span>
                        <span>完了</span>
                    </div>
                </div>
            `;
        }

        // Enhanced navigation buttons
        if (prevBtn) {
            prevBtn.style.display = this.tutorialStep > 0 ? 'block' : 'none';
            if (this.tutorialStep > 0) {
                prevBtn.innerHTML = '◀ 戻る';
                prevBtn.style.animation = 'slideInLeft 0.3s ease-out';
            }
        }

        if (nextBtn) {
            const isLastStep = this.tutorialStep >= this.tutorialSteps.length - 1;
            nextBtn.innerHTML = isLastStep ? '🎉 ゲーム開始！' : '次へ ▶';
            nextBtn.style.animation = 'slideInRight 0.3s ease-out';
            nextBtn.style.background = isLastStep ? 'linear-gradient(135deg, #00ff88, #00cc66)' : 'linear-gradient(135deg, #00d4ff, #0099cc)';
        }

        // Highlight target element with enhanced animation
        this.highlightElement(step.highlight);

        // Add step transition animation
        overlay.style.animation = 'tutorialStepTransition 0.5s ease-out';

        // Add keyboard navigation
        this.setupTutorialKeyboardNavigation();

        // Auto-advance for steps with duration
        if (step.duration) {
            this.clearTutorialTimeout();
            this.tutorialTimeout = setTimeout(() => {
                if (this.tutorialStep < this.tutorialSteps.length - 1) {
                    this.nextTutorialStep();
                }
            }, step.duration);
        }

        // Add interactive demo if specified
        this.showTutorialDemo(step);
    }

    clearTutorialTimeout() {
        if (this.tutorialTimeout) {
            clearTimeout(this.tutorialTimeout);
            this.tutorialTimeout = null;
        }
    }

    showTutorialDemo(step) {
        // Clear previous demo
        const existingDemo = document.querySelector('.tutorial-demo');
        if (existingDemo) {
            existingDemo.remove();
        }

        if (!step.demo) return;

        const demoElement = document.createElement('div');
        demoElement.className = 'tutorial-demo';
        demoElement.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid #00d4ff;
            border-radius: 15px;
            padding: 20px;
            z-index: 10001;
            max-width: 80vw;
            animation: demoPopup 0.5s ease-out;
            box-shadow: 0 0 30px rgba(0, 212, 255, 0.5);
        `;

        switch (step.demo) {
            case 'input':
                demoElement.innerHTML = `
                    <div style="text-align: center; color: #00d4ff; margin-bottom: 15px;">
                        <strong>📝 質問入力の例</strong>
                    </div>
                    <div style="background: rgba(255, 255, 255, 0.1); padding: 15px; border-radius: 10px; font-family: monospace;">
                        ${step.demoText || 'この出来事は何年に起こりましたか？'}
                    </div>
                    <div style="text-align: center; margin-top: 15px; color: #888; font-size: 0.9rem;">
                        Ctrl+Enterで送信できます
                    </div>
                `;
                break;

            case 'ai':
                demoElement.innerHTML = `
                    <div style="text-align: center; color: #00ff88; margin-bottom: 15px;">
                        <strong>🤖 AI回答の例</strong>
                    </div>
                    <div style="background: rgba(0, 255, 136, 0.1); padding: 15px; border-radius: 10px; border-left: 4px solid #00ff88;">
                        ${step.demoText || 'AIの回答がここに表示されます'}
                    </div>
                    <div style="text-align: center; margin-top: 15px; color: #888; font-size: 0.9rem;">
                        回答から次の質問のヒントを得ましょう
                    </div>
                `;
                break;

            case 'target':
                demoElement.innerHTML = `
                    <div style="text-align: center; color: #ffaa00; margin-bottom: 15px;">
                        <strong>🎯 ターゲットの例</strong>
                    </div>
                    <div style="background: rgba(255, 170, 0, 0.1); padding: 15px; border-radius: 10px; border: 2px solid #ffaa00; text-align: center;">
                        <div style="font-weight: bold; margin-bottom: 10px;">TARGET ANSWER</div>
                        慶応4年（1868年）に起こった、日本史上最大級の内戦
                    </div>
                    <div style="text-align: center; margin-top: 15px; color: #888; font-size: 0.9rem;">
                        これを特定するのがあなたの目標です
                    </div>
                `;
                break;
        }

        document.body.appendChild(demoElement);

        // Auto-remove demo after 4 seconds
        setTimeout(() => {
            if (demoElement.parentNode) {
                demoElement.style.animation = 'demoFadeOut 0.3s ease-out';
                setTimeout(() => {
                    if (demoElement.parentNode) {
                        demoElement.remove();
                    }
                }, 300);
            }
        }, 4000);
    }

    setupTutorialKeyboardNavigation() {
        // Remove previous listener if exists
        if (this.tutorialKeyHandler) {
            document.removeEventListener('keydown', this.tutorialKeyHandler);
        }

        this.tutorialKeyHandler = (e) => {
            if (!this.el.tutorialOverlay || !this.el.tutorialOverlay.classList.contains('active')) {
                return;
            }

            // Prevent default behavior for tutorial navigation keys
            const navigationKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter', 'Escape', 'h', 'j', 'k', 'l'];
            if (navigationKeys.includes(e.key)) {
                e.preventDefault();
                e.stopPropagation();
            }

            switch (e.key) {
                case 'ArrowLeft':
                case 'ArrowUp':
                case 'h': // Vim-style navigation
                case 'k': // Vim-style navigation
                    if (this.tutorialStep > 0) {
                        this.previousTutorialStep();
                        this.showNotification('前のステップに戻りました', 'info');
                    } else {
                        this.showNotification('最初のステップです', 'warning');
                    }
                    break;

                case 'ArrowRight':
                case 'ArrowDown':
                case ' ':
                case 'Enter':
                case 'l': // Vim-style navigation
                case 'j': // Vim-style navigation
                    if (this.tutorialStep < this.tutorialSteps.length - 1) {
                        this.nextTutorialStep();
                        this.showNotification('次のステップに進みました', 'info');
                    } else {
                        this.endTutorial();
                        this.showNotification('チュートリアルが完了しました！', 'success');
                    }
                    break;

                case 'Escape':
                    // Show confirmation dialog for escape
                    if (confirm('チュートリアルを終了しますか？')) {
                        this.endTutorial();
                        this.showNotification('チュートリアルをスキップしました', 'info');
                    }
                    break;

                case '?':
                    // Show keyboard shortcuts help
                    this.showTutorialKeyboardHelp();
                    break;

                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7':
                case '8':
                case '9':
                    // Jump to specific step (1-9)
                    const targetStep = parseInt(e.key) - 1;
                    if (targetStep >= 0 && targetStep < this.tutorialSteps.length) {
                        this.tutorialStep = targetStep;
                        this.showTutorialStep();
                        this.showNotification(`ステップ ${targetStep + 1} にジャンプしました`, 'info');
                    }
                    break;
            }
        };

        document.addEventListener('keydown', this.tutorialKeyHandler);
    }

    showTutorialKeyboardHelp() {
        const helpModal = document.createElement('div');
        helpModal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.95);
            border: 2px solid #00d4ff;
            border-radius: 15px;
            padding: 25px;
            z-index: 10002;
            max-width: 400px;
            animation: demoPopup 0.3s ease-out;
            box-shadow: 0 0 30px rgba(0, 212, 255, 0.5);
        `;

        helpModal.innerHTML = `
            <div style="text-align: center; color: #00d4ff; margin-bottom: 20px;">
                <strong>⌨️ キーボードショートカット</strong>
            </div>
            <div style="color: #fff; line-height: 1.6;">
                <div><strong>← ↑ h k:</strong> 前のステップ</div>
                <div><strong>→ ↓ j l スペース Enter:</strong> 次のステップ</div>
                <div><strong>1-9:</strong> 指定のステップにジャンプ</div>
                <div><strong>Esc:</strong> チュートリアル終了</div>
                <div><strong>? :</strong> このヘルプを表示</div>
            </div>
            <div style="text-align: center; margin-top: 20px;">
                <button onclick="this.parentElement.parentElement.remove()" style="background: #00d4ff; color: #000; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer;">
                    閉じる
                </button>
            </div>
        `;

        document.body.appendChild(helpModal);

        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (helpModal.parentNode) {
                helpModal.remove();
            }
        }, 10000);
    }

    showTutorialStep(stepIndex) {
        this.tutorialStep = stepIndex;
        const step = this.tutorialSteps[stepIndex];
        if (!step) return;

        // Create or get overlay
        let overlay = this.el.tutorialOverlay;
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'tutorial-overlay active';
            overlay.innerHTML = `
                <div class="tutorial-modal">
                    <div class="tutorial-header">
                        <div class="tutorial-progress">
                            <div class="tutorial-progress-bar" id="tutorial-progress-bar"></div>
                        </div>
                        <button class="tutorial-close" id="tutorial-close">&times;</button>
                    </div>
                    <div class="tutorial-content">
                        <div class="tutorial-icon" id="tutorial-icon"></div>
                        <h3 id="tutorial-title"></h3>
                        <p id="tutorial-description"></p>
                    </div>
                    <div class="tutorial-navigation">
                        <button class="tutorial-btn tutorial-prev" id="tutorial-prev">前へ</button>
                        <span class="tutorial-step-counter" id="tutorial-step-counter"></span>
                        <button class="tutorial-btn tutorial-next" id="tutorial-next">次へ</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            this.el.tutorialOverlay = overlay;

            // Add event listeners with error checking
            const closeBtn = overlay.querySelector('#tutorial-close');
            const prevBtn = overlay.querySelector('#tutorial-prev');
            const nextBtn = overlay.querySelector('#tutorial-next');

            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    console.log('[Tutorial] Close button clicked');
                    this.endTutorial();
                });
            }

            if (prevBtn) {
                prevBtn.addEventListener('click', () => {
                    console.log('[Tutorial] Previous button clicked');
                    if (this.tutorialSteps) {
                        this.previousTutorialStep();
                    } else {
                        console.error('[Tutorial] Previous button clicked but tutorial not initialized');
                        this.showNotification('チュートリアルが開始されていません', 'error');
                    }
                });
            }

            if (nextBtn) {
                nextBtn.addEventListener('click', () => {
                    console.log('[Tutorial] Next button clicked');
                    if (this.tutorialSteps) {
                        this.nextTutorialStep();
                    } else {
                        console.error('[Tutorial] Next button clicked but tutorial not initialized');
                        this.showNotification('チュートリアルが開始されていません', 'error');
                    }
                });
            }
        }

        // Update content
        overlay.querySelector('#tutorial-icon').innerHTML = step.icon;
        overlay.querySelector('#tutorial-title').textContent = step.title;
        overlay.querySelector('#tutorial-description').innerHTML = step.description;
        overlay.querySelector('#tutorial-step-counter').textContent = `${stepIndex + 1} / ${this.tutorialSteps.length}`;

        // Update progress bar
        const progressBar = overlay.querySelector('#tutorial-progress-bar');
        progressBar.style.width = `${((stepIndex + 1) / this.tutorialSteps.length) * 100}%`;

        // Update navigation buttons
        const prevBtn = overlay.querySelector('#tutorial-prev');
        const nextBtn = overlay.querySelector('#tutorial-next');
        prevBtn.style.display = stepIndex === 0 ? 'none' : 'inline-block';
        nextBtn.textContent = stepIndex === this.tutorialSteps.length - 1 ? '完了' : '次へ';

        // Add step transition animation
        overlay.style.animation = 'tutorialStepTransition 0.5s ease-out';

        // Add keyboard navigation
        this.setupTutorialKeyboardNavigation();

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
            targetEl.classList.add('demo-typing');
            let i = 0;
            const iv = setInterval(() => {
                if (i < text.length) {
                    targetEl.value += text.charAt(i);
                    i++;
                } else {
                    clearInterval(iv);
                    targetEl.classList.remove('demo-typing');
                    this.isLocked = false;
                    resolve();
                }
            }, delay);
        });
    }

    simulateAIResponse(text, delay = 30) {
        const aiOut = document.getElementById('ai-output');
        if (!aiOut) return;

        aiOut.textContent = '';
        aiOut.classList.add('demo-typing');
        let i = 0;
        const iv = setInterval(() => {
            if (i < text.length) {
                aiOut.textContent += text.charAt(i);
                i++;
            } else {
                clearInterval(iv);
                aiOut.classList.remove('demo-typing');
            }
        }, delay);
    }

    simulateTyping(targetEl, text, delay = 50) {
        return new Promise(resolve => {
            if (!targetEl) return resolve();
            this.isLocked = true;
            targetEl.focus();
            targetEl.value = '';
            targetEl.classList.add('demo-typing');
            let i = 0;
            const iv = setInterval(() => {
                if (i < text.length) {
                    targetEl.value += text.charAt(i);
                    i++;
                } else {
                    clearInterval(iv);
                    targetEl.classList.remove('demo-typing');
                    this.isLocked = false;
                    resolve();
                }
            }, delay);
        });
    }

    simulateAIResponse(text, delay = 30) {
        const aiOut = document.getElementById('ai-output');
        if (!aiOut) return;

        aiOut.textContent = '';
        aiOut.classList.add('demo-typing');
        let i = 0;
        const iv = setInterval(() => {
            if (i < text.length) {
                aiOut.textContent += text.charAt(i);
                i++;
            } else {
                clearInterval(iv);
                aiOut.classList.remove('demo-typing');
            }
        }, delay);
    }

    highlightElement(selector) {
        // Clear previous highlights
        const existingHighlights = document.querySelectorAll('.tutorial-highlight');
        existingHighlights.forEach(el => el.remove());

        if (!selector) return;

        const element = document.querySelector(selector);
        if (!element) return;

        // Create highlight overlay
        const highlight = document.createElement('div');
        highlight.className = 'tutorial-highlight';
        highlight.style.cssText = `
            position: absolute;
            background: rgba(0, 212, 255, 0.3);
            border: 3px solid #00d4ff;
            border-radius: 8px;
            box-shadow: 0 0 20px rgba(0, 212, 255, 0.6), inset 0 0 20px rgba(0, 212, 255, 0.2);
            z-index: 9999;
            pointer-events: none;
            animation: highlightPulse 2s infinite ease-in-out;
            transition: all 0.3s ease;
        `;

        // Position highlight
        const rect = element.getBoundingClientRect();
        highlight.style.left = rect.left - 10 + 'px';
        highlight.style.top = rect.top - 10 + 'px';
        highlight.style.width = rect.width + 20 + 'px';
        highlight.style.height = rect.height + 20 + 'px';

        document.body.appendChild(highlight);

        // Add pulsing animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes highlightPulse {
                0%, 100% {
                    box-shadow: 0 0 20px rgba(0, 212, 255, 0.6), inset 0 0 20px rgba(0, 212, 255, 0.2);
                    transform: scale(1);
                }
                50% {
                    box-shadow: 0 0 30px rgba(0, 212, 255, 0.9), inset 0 0 30px rgba(0, 212, 255, 0.4);
                    transform: scale(1.02);
                }
            }
            @keyframes tutorialStepTransition {
                0% { opacity: 0; transform: translateY(-20px); }
                100% { opacity: 1; transform: translateY(0); }
            }
            @keyframes demoPopup {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
                100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            }
            @keyframes demoFadeOut {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
                100% { opacity: 1; transform: translate(-50%, -50%) scale(0.8); }
            }
            @keyframes shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
            @keyframes bounceIn {
                0% { transform: scale(0.3); opacity: 0; }
                50% { transform: scale(1.05); }
                70% { transform: scale(0.9); }
                100% { transform: scale(1); opacity: 1; }
            }
            @keyframes fadeInUp {
                0% { opacity: 0; transform: translateY(30px); }
                100% { opacity: 1; transform: translateY(0); }
            }
            @keyframes slideInLeft {
                0% { opacity: 0; transform: translateX(-30px); }
                100% { opacity: 1; transform: translateX(0); }
            }
            @keyframes slideInRight {
                0% { opacity: 0; transform: translateX(30px); }
                100% { opacity: 1; transform: translateX(0); }
            }
        `;
        document.head.appendChild(style);

        // Add tooltip arrow pointing to element
        const arrow = document.createElement('div');
        arrow.style.cssText = `
            position: absolute;
            width: 0;
            height: 0;
            border-left: 10px solid transparent;
            border-right: 10px solid transparent;
            border-top: 10px solid #00d4ff;
            left: 50%;
            top: -10px;
            transform: translateX(-50%);
            z-index: 10000;
            animation: arrowBounce 1s infinite ease-in-out;
        `;
        highlight.appendChild(arrow);

        // Add arrow bounce animation
        const arrowStyle = document.createElement('style');
        arrowStyle.textContent = `
            @keyframes arrowBounce {
                0%, 100% { transform: translateX(-50%) translateY(0); }
                50% { transform: translateX(-50%) translateY(-5px); }
            }
        `;
        document.head.appendChild(arrowStyle);

        // Scroll element into view if needed
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Store highlight for cleanup
        this.currentHighlight = highlight;
    }

    startTutorial() {
        console.log('[Tutorial] Starting tutorial...');

        // Initialize tutorial steps
        this.tutorialSteps = [
            {
                title: "ようこそ Rush-Maximizer へ！",
                description: "AIを使った新感覚クイズゲームへようこそ！このチュートリアルで基本的な操作を学びましょう。",
                highlight: null,
                action: null
            },
            {
                title: "ゲームモードの選択",
                description: "メイン画面から4つのゲームモードを選択できます。各モードで異なるルールで遊べます。",
                highlight: ".mode-grid",
                action: () => {
                    const modeGrid = document.querySelector('.mode-grid');
                    if (modeGrid) {
                        modeGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            },
            {
                title: "ソロモード",
                description: "時間無制限でじっくり挑戦できます。17秒/問題の新ルールで戦略的にプレイしましょう。",
                highlight: "#solo-mode-btn",
                action: null
            },
            {
                title: "対戦モード",
                description: "オンラインで他プレイヤーとリアルタイム対戦できます。パス機能も使えます。",
                highlight: "#vs-mode-btn",
                action: null
            },
            {
                title: "RTAモード",
                description: "10問を3分以内で解くタイムアタックモード。時間でスコアが変動します。",
                highlight: "#rta-mode-btn",
                action: null
            },
            {
                title: "練習モード",
                description: "カテゴリーや難易度を指定して練習できます。スキルアップに最適です。",
                highlight: "#practice-mode-btn",
                action: null
            },
            {
                title: "設定とその他の機能",
                description: "右上のボタンから設定、ランキング、チュートリアルなどの機能にアクセスできます。",
                highlight: ".quick-actions",
                action: null
            },
            {
                title: "サーバー接続情報",
                description: "下部の接続情報でサーバーの状態を確認できます。音声認識機能も利用可能です。",
                highlight: ".server-info-panel",
                action: null
            },
            {
                title: "ゲームプレイの準備",
                description: "ゲームを開始するには、まずサーバーに接続する必要があります。準備ができたらモードを選択してください。",
                highlight: null,
                action: null
            },
            {
                title: "チュートリアル完了！",
                description: "基本的な操作を学びました。あとは実際にプレイして楽しんでください！",
                highlight: null,
                action: null
            }
        ];

        // Reset tutorial state
        this.tutorialStep = 0;

        // Close tutorial select modal and show tutorial overlay
        this.closeModal('tutorial-select-modal');
        this.showModal('tutorial-overlay');

        // Add keyboard event listener
        this.tutorialKeyHandler = (e) => {
            if (e.key === 'ArrowRight' || e.key === ' ') {
                e.preventDefault();
                this.nextTutorialStep();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.previousTutorialStep();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.endTutorial();
            }
        };
        document.addEventListener('keydown', this.tutorialKeyHandler);

        // Show first step
        this.showTutorialStep();

        console.log('[Tutorial] Tutorial started successfully');
    }

    nextTutorialStep() {
        console.log('[Tutorial] Next step called, current step:', this.tutorialStep);

        // Check if tutorial is properly initialized
        if (!this.tutorialSteps) {
            console.warn('[Tutorial] tutorialSteps is undefined, attempting to initialize and start tutorial');
            try {
                // Try to recover by starting the tutorial
                this.startTutorial();
            } catch (e) {
                console.error('[Tutorial] Failed to start tutorial during recovery:', e);
                this.showNotification('チュートリアルが正しく初期化されませんでした', 'error');
                return;
            }

            // If startTutorial succeeded, tutorialSteps should be set. If still not, abort.
            if (!this.tutorialSteps) {
                console.error('[Tutorial] Recovery start did not initialize tutorialSteps');
                this.showNotification('チュートリアルの初期化に失敗しました', 'error');
                return;
            }

            // Continue to advance to next step after recovery
            console.log('[Tutorial] Recovery successful, proceeding to advance step from', this.tutorialStep);
        }

        // Check if tutorialStep is properly initialized
        if (this.tutorialStep === undefined || this.tutorialStep === null) {
            console.error('[Tutorial] tutorialStep is undefined, resetting to 0');
            this.tutorialStep = 0;
        }

        if (this.tutorialStep < this.tutorialSteps.length - 1) {
            this.tutorialStep++;
            console.log('[Tutorial] Moving to step:', this.tutorialStep);
            this.showTutorialStep();
        } else {
            console.log('[Tutorial] Tutorial completed, ending');
            this.endTutorial();
        }
    }

    showTutorialStep() {
        console.log('[Tutorial] Showing step:', this.tutorialStep);

        if (!this.tutorialSteps || this.tutorialStep >= this.tutorialSteps.length) {
            console.error('[Tutorial] Invalid tutorial state');
            this.endTutorial();
            return;
        }

        const step = this.tutorialSteps[this.tutorialStep];

        // Update tutorial content
        const titleEl = document.getElementById('tutorial-title');
        const descEl = document.getElementById('tutorial-description');
        const counterEl = document.getElementById('tutorial-counter');
        const prevBtn = document.getElementById('tutorial-prev-btn');
        const nextBtn = document.getElementById('tutorial-next-btn');

        if (titleEl) titleEl.textContent = step.title;
        if (descEl) descEl.textContent = step.description;
        if (counterEl) counterEl.textContent = `${this.tutorialStep + 1} / ${this.tutorialSteps.length}`;

        // Update navigation buttons
        if (prevBtn) {
            prevBtn.style.display = this.tutorialStep > 0 ? 'inline-block' : 'none';
        }
        if (nextBtn) {
            nextBtn.textContent = this.tutorialStep === this.tutorialSteps.length - 1 ? '完了 ✓' : '次へ →';
        }

        // Clear previous highlight
        this.clearTutorialHighlight();

        // Add new highlight if specified
        if (step.highlight) {
            this.highlightTutorialElement(step.highlight);
        }

        // Execute step action if specified
        if (step.action) {
            try {
                step.action();
            } catch (error) {
                console.error('[Tutorial] Error executing step action:', error);
            }
        }

        console.log('[Tutorial] Step shown successfully');
    }

    highlightTutorialElement(selector) {
        console.log('[Tutorial] Highlighting element:', selector);

        const element = document.querySelector(selector);
        if (!element) {
            console.warn('[Tutorial] Element not found for selector:', selector);
            return;
        }

        // Create highlight overlay
        const highlight = document.createElement('div');
        highlight.className = 'tutorial-highlight';
        highlight.style.cssText = `
            position: absolute;
            top: ${element.offsetTop - 8}px;
            left: ${element.offsetLeft - 8}px;
            width: ${element.offsetWidth + 16}px;
            height: ${element.offsetHeight + 16}px;
            background: rgba(0, 212, 255, 0.3);
            border: 3px solid #00d4ff;
            border-radius: 12px;
            z-index: 9998;
            pointer-events: none;
            animation: tutorialPulse 2s ease-in-out infinite;
        `;

        // Add to tutorial overlay
        const overlay = this.el.tutorialOverlay;
        if (overlay) {
            overlay.appendChild(highlight);
            this.currentHighlight = highlight;
        }

        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    clearTutorialHighlight() {
        if (this.currentHighlight) {
            this.currentHighlight.remove();
            this.currentHighlight = null;
        }

        // Remove any existing highlights
        document.querySelectorAll('.tutorial-highlight').forEach(el => el.remove());
    }

    previousTutorialStep() {
        console.log('[Tutorial] Previous step called, current step:', this.tutorialStep);

        // Check if tutorial is properly initialized
        if (!this.tutorialSteps) {
            console.warn('[Tutorial] previousTutorialStep called but tutorial not initialized, attempting to start');
            try {
                this.startTutorial();
            } catch (e) {
                console.error('[Tutorial] Recovery start failed:', e);
                this.showNotification('チュートリアルが開始されていません', 'error');
                return;
            }

            if (!this.tutorialSteps) {
                console.error('[Tutorial] Recovery did not initialize tutorialSteps');
                this.showNotification('チュートリアルが開始されていません', 'error');
                return;
            }

            console.log('[Tutorial] Recovery successful, ready to step previous from', this.tutorialStep);
        }

        if (this.tutorialStep > 0) {
            this.tutorialStep--;
            console.log('[Tutorial] Moving to previous step:', this.tutorialStep);
            this.showTutorialStep();
        } else {
            console.log('[Tutorial] Already at first step');
            this.showNotification('最初のステップです', 'info');
        }
    }

    endTutorial() {
        // Clear tutorial state
        this.closeModal('tutorial-overlay');
        document.querySelectorAll('.tutorial-highlight').forEach(el => el.remove());
        document.querySelectorAll('.tutorial-demo').forEach(el => el.remove());

        // Remove keyboard event listener
        if (this.tutorialKeyHandler) {
            document.removeEventListener('keydown', this.tutorialKeyHandler);
            this.tutorialKeyHandler = null;
        }

        // Clear any pending timeouts
        this.clearTutorialTimeout();

        // Reset tutorial state
        this.tutorialStep = 0;
        this.tutorialSteps = null;
        this.currentHighlight = null;

        // Mark tutorial as completed
        localStorage.setItem('hasSeenTutorial', 'true');
        localStorage.setItem('tutorialCompletedAt', new Date().toISOString());

        // Use the new flow controller
        this.onTutorialCompleted();

        // Enable game mode buttons after 5 second delay
        setTimeout(() => {
            console.log('[Tutorial] Enabling game mode buttons after tutorial completion');
            this.enableGameModeButtons();
        }, 5000);

        console.log('[Tutorial] Tutorial completed successfully');
    }

    // Explicit navigation to main menu + startup overlay after tutorial
    finishTutorialAndOpenStartup() {
        try {
            // Ensure tutorial is marked as completed and closed
            localStorage.setItem('hasSeenTutorial', 'true');
            this.closeModal('tutorial-overlay');
            this.closeModal('tutorial-select-modal');

            // Reset any tutorial state just in case
            this.tutorialStep = 0;
            this.tutorialSteps = null;
            this.currentHighlight = null;
            this.clearTutorialTimeout();
            if (this.tutorialKeyHandler) {
                document.removeEventListener('keydown', this.tutorialKeyHandler);
                this.tutorialKeyHandler = null;
            }

            // Show main menu and the startup (server connect) modal
            this.showScreen('main-menu');
            this.showModal('startup-overlay');

            // Re-enable all buttons just in case
            document.querySelectorAll('button').forEach(btn => {
                btn.disabled = false;
                btn.style.pointerEvents = 'auto';
            });

            console.log('[Tutorial] Navigated to main menu with startup overlay');
            return true;
        } catch (e) {
            console.error('[Tutorial] Failed to navigate to main menu/startup overlay:', e);
            this.showNotification('メイン画面への遷移に失敗しました', 'error');
            return false;
        }
    }

    clearTutorialTimeout() {
        if (this.tutorialTimeout) {
            clearTimeout(this.tutorialTimeout);
            this.tutorialTimeout = null;
        }
    }

    showTutorialCompletionCelebration() {
        const celebration = document.createElement('div');
        celebration.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
            animation: fadeIn 0.5s ease-out;
        `;

        celebration.innerHTML = `
            <div style="text-align: center; color: #fff; max-width: 500px; padding: 40px; background: rgba(0, 212, 255, 0.1); border-radius: 20px; border: 2px solid #00d4ff; box-shadow: 0 0 30px rgba(0, 212, 255, 0.5);">
                <div style="font-size: 4rem; margin-bottom: 20px; animation: bounceIn 1s ease-out;">🎉</div>
                <h2 style="color: #00d4ff; margin-bottom: 20px; animation: fadeInUp 0.8s ease-out 0.3s both;">チュートリアル完了！</h2>
                <p style="margin-bottom: 30px; line-height: 1.6; animation: fadeInUp 0.8s ease-out 0.5s both;">
                    おめでとうございます！<br>
                    これでゲームの基本をマスターしました。<br>
                    さっそくゲームを始めましょう！
                </p>
                <div style="animation: fadeInUp 0.8s ease-out 0.7s both;">
                    <button onclick="(function(btn){ try{ if(window.gameManager){ window.gameManager.finishTutorialAndOpenStartup(); } }catch(e){ console.error(e); } finally { try{ if(btn && btn.parentElement && btn.parentElement.parentElement && btn.parentElement.parentElement.parentElement) btn.parentElement.parentElement.parentElement.remove(); }catch(err){} } })(this);" style="background: linear-gradient(135deg, #00ff88, #00cc66); color: #000; border: none; padding: 15px 30px; border-radius: 10px; font-size: 1.1rem; font-weight: bold; cursor: pointer; margin-right: 15px; box-shadow: 0 4px 15px rgba(0, 255, 136, 0.3);">
                        🚀 ゲーム開始
                    </button>
                    <button onclick="this.parentElement.parentElement.parentElement.remove();" style="background: rgba(255, 255, 255, 0.2); color: #fff; border: 1px solid #00d4ff; padding: 15px 30px; border-radius: 10px; font-size: 1.1rem; cursor: pointer; box-shadow: 0 4px 15px rgba(0, 212, 255, 0.2);">
                        あとで
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(celebration);

        // Auto-remove after 10 seconds if not clicked
        setTimeout(() => {
            if (celebration.parentNode) {
                celebration.style.animation = 'fadeOut 0.5s ease-out';
                setTimeout(() => celebration.remove(), 500);
            }
        }, 10000);
    }

    enablePostTutorialFeatures() {
        // Enable any features that were disabled during tutorial
        const gameElements = document.querySelectorAll('.game-element');
        gameElements.forEach(el => {
            el.classList.remove('tutorial-disabled');
        });

        // Show advanced options if they were hidden
        const advancedOptions = document.querySelectorAll('.advanced-option');
        advancedOptions.forEach(el => {
            el.style.display = 'block';
        });

        // Update UI to reflect tutorial completion
        const tutorialBtn = document.querySelector('.tutorial-btn');
        if (tutorialBtn) {
            tutorialBtn.innerHTML = '📖 チュートリアル (完了)';
            tutorialBtn.style.background = 'linear-gradient(135deg, #00ff88, #00cc66)';
        }
    }

    // Debug function to check tutorial state
    debugTutorialState() {
        console.log('=== Tutorial Debug Info ===');
        console.log('tutorialStep:', this.tutorialStep);
        console.log('tutorialSteps:', this.tutorialSteps ? this.tutorialSteps.length : 'null');
        console.log('tutorialOverlay element:', this.el.tutorialOverlay);
        console.log('tutorialSelectModal element:', this.el.tutorialSelectModal);

        if (this.el.tutorialOverlay) {
            console.log('tutorialOverlay classList:', this.el.tutorialOverlay.classList);
            console.log('tutorialOverlay style.display:', this.el.tutorialOverlay.style.display);
        }

        if (this.el.tutorialSelectModal) {
            console.log('tutorialSelectModal classList:', this.el.tutorialSelectModal.classList);
            console.log('tutorialSelectModal style.display:', this.el.tutorialSelectModal.style.display);
        }

        console.log('hasSeenTutorial in localStorage:', localStorage.getItem('hasSeenTutorial'));
        console.log('main-menu element:', document.getElementById('main-menu'));
        console.log('===========================');
    }

    // Force show main menu (emergency fix)
    forceShowMainMenu() {
        console.log('Forcing main menu display...');

        // Close all modals
        this.closeModal('tutorial-select-modal');
        this.closeModal('tutorial-overlay');
        this.closeModal('startup-overlay');

        // Reset tutorial state
        this.tutorialStep = 0;
        this.tutorialSteps = null;
        localStorage.removeItem('hasSeenTutorial');

        // Show main menu
        this.showScreen('main-menu');

        // Re-enable all buttons
        const buttons = document.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.disabled = false;
            btn.style.pointerEvents = 'auto';
        });

        this.showNotification('メインコンテンツを表示しました', 'success');
        console.log('Main menu forced to show');
    }

    // Reset tutorial completely
    resetTutorial() {
        console.log('Resetting tutorial completely...');

        // Clear localStorage
        localStorage.removeItem('hasSeenTutorial');
        localStorage.removeItem('tutorialCompletedAt');

        // Reset tutorial state
        this.tutorialStep = 0;
        this.tutorialSteps = null;
        this.currentHighlight = null;

        // Close all tutorial-related elements
        this.closeModal('tutorial-select-modal');
        this.closeModal('tutorial-overlay');

        // Clear any tutorial timeouts
        if (this.tutorialTimeout) {
            clearTimeout(this.tutorialTimeout);
            this.tutorialTimeout = null;
        }

        // Remove tutorial event listeners
        if (this.tutorialKeyHandler) {
            document.removeEventListener('keydown', this.tutorialKeyHandler);
            this.tutorialKeyHandler = null;
        }

        // Remove tutorial highlights
        document.querySelectorAll('.tutorial-highlight').forEach(el => el.remove());
        document.querySelectorAll('.tutorial-demo').forEach(el => el.remove());

        this.showNotification('チュートリアルをリセットしました', 'info');
        console.log('Tutorial reset complete');
    }

    closeTutorialSelect() {
        this.closeModal('tutorial-select-modal');
        localStorage.setItem('hasSeenTutorial', 'true');
    }

    // Voice Recognition System
    initVoiceRecognition() {
        // Check if we can use the local Vosk server, fallback to Web Speech API
        this.voiceServerUrl = 'http://localhost:5000';

        // First try to connect to local Vosk server
        this.checkVoiceServerHealth().then(available => {
            if (available) {
                console.log('[Voice] Using local Vosk server for voice recognition');
                this.voiceEnabled = true;
                this.useVoskServer = true;
            } else {
                console.log('[Voice] Vosk server not available, falling back to Web Speech API');
                this.initWebSpeechAPI();
            }
            this.updateVoiceUI();
        }).catch(error => {
            console.warn('[Voice] Health check failed:', error);
            this.initWebSpeechAPI();
            this.updateVoiceUI();
        });
    }

    async checkVoiceServerHealth() {
        try {
            const response = await fetch(`${this.voiceServerUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000) // 5 second timeout
            });

            if (response.ok) {
                const data = await response.json();
                return data.status === 'healthy' && data.model_loaded === true;
            }
            return false;
        } catch (error) {
            console.warn('[Voice] Health check error:', error);
            return false;
        }
    }

    initWebSpeechAPI() {
        try {
            if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                console.warn('[Voice] Speech recognition not supported');
                this.voiceEnabled = false;
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
            console.log('[Voice] Web Speech API initialized successfully');
        } catch (error) {
            console.error('[Voice] Failed to initialize Web Speech API:', error);
            this.voiceEnabled = false;
        }
    }

    toggleVoiceRecognition() {
        try {
            if (!this.voiceEnabled) {
                this.showNotification('音声認識は利用できません', 'warning');
                return false;
            }

            if (this.useVoskServer) {
                return this.toggleVoskVoiceRecognition();
            } else {
                return this.toggleWebSpeechRecognition();
            }
        } catch (error) {
            console.error('Voice recognition toggle failed:', error);
            this.showNotification('音声認識の切り替えに失敗しました', 'error');
            return false;
        }
    }

    toggleVoskVoiceRecognition() {
        if (this.isVoiceActive) {
            // Stop recording
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }
            this.isVoiceActive = false;
            this.updateVoiceUI();
            this.showNotification('音声認識を停止しました', 'info');
            return true;
        } else {
            // Start recording
            return this.startVoskRecording();
        }
    }

    async startVoskRecording() {
        try {
            // Check if already processing AI request
            if (this.isProcessingAI) {
                this.showNotification('AI処理中は音声認識を開始できません', 'warning');
                return false;
            }

            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            const audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                try {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    await this.processVoskAudio(audioBlob);

                    // Stop all tracks
                    stream.getTracks().forEach(track => track.stop());
                } catch (error) {
                    console.error('Audio processing error:', error);
                    this.showNotification('音声処理中にエラーが発生しました', 'error');
                    stream.getTracks().forEach(track => track.stop());
                }
            };

            this.mediaRecorder.start();
            this.isVoiceActive = true;
            this.updateVoiceUI();
            this.showNotification('音声認識を開始しました（Vosk）', 'info');

            // Auto-stop after 5 seconds
            setTimeout(() => {
                if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                    this.mediaRecorder.stop();
                }
            }, 5000);

            return true;
        } catch (error) {
            console.error('Failed to start Vosk recording:', error);
            let errorMessage = '音声認識の開始に失敗しました';

            if (error.name === 'NotAllowedError') {
                errorMessage = 'マイクの使用が許可されていません';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'マイクが見つかりません';
            }

            this.showNotification(errorMessage, 'error');
            return false;
        }
    }

    async processVoskAudio(audioBlob) {
        try {
            // Convert any input audio Blob (webm/opus) to 16kHz mono WAV for Vosk
            const arrayBuffer = await audioBlob.arrayBuffer();
            const ac = new (window.AudioContext || window.webkitAudioContext)();
            const decoded = await ac.decodeAudioData(arrayBuffer);

            // downmix to mono
            const chanData = decoded.numberOfChannels > 1 ? decoded.getChannelData(0) : decoded.getChannelData(0);
            // resample to 16000
            const targetRate = 16000;
            const srcRate = decoded.sampleRate;
            const srcLength = chanData.length;
            const targetLength = Math.round(srcLength * targetRate / srcRate);
            const resampled = new Float32Array(targetLength);
            for (let i = 0; i < targetLength; i++) {
                const srcIndex = i * srcRate / targetRate;
                const i0 = Math.floor(srcIndex);
                const i1 = Math.min(i0 + 1, srcLength - 1);
                const t = srcIndex - i0;
                resampled[i] = (1 - t) * chanData[i0] + t * chanData[i1];
            }

            // PCM16 encode
            const wavBuffer = new ArrayBuffer(44 + resampled.length * 2);
            const view = new DataView(wavBuffer);
            /* RIFF header */
            function writeString(view, offset, string) {
                for (let i = 0; i < string.length; i++) {
                    view.setUint8(offset + i, string.charCodeAt(i));
                }
            }
            writeString(view, 0, 'RIFF');
            view.setUint32(4, 36 + resampled.length * 2, true);
            writeString(view, 8, 'WAVE');
            writeString(view, 12, 'fmt ');
            view.setUint32(16, 16, true); // PCM chunk size
            view.setUint16(20, 1, true); // PCM format
            view.setUint16(22, 1, true); // mono
            view.setUint32(24, targetRate, true); // sample rate
            view.setUint32(28, targetRate * 2, true); // byte rate (sampleRate * blockAlign)
            view.setUint16(32, 2, true); // block align
            view.setUint16(34, 16, true); // bits per sample
            writeString(view, 36, 'data');
            view.setUint32(40, resampled.length * 2, true);
            // write PCM samples
            let offset = 44;
            for (let i = 0; i < resampled.length; i++, offset += 2) {
                let s = Math.max(-1, Math.min(1, resampled[i]));
                view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            }

            const wavBlob = new Blob([view], { type: 'audio/wav' });

            const formData = new FormData();
            formData.append('audio', wavBlob, 'recording.wav');

            const response = await fetch(`${this.voiceServerUrl}/recognize`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${text}`);
            }

            const result = await response.json();

            if (result.success && result.text) {
                const playerQuestion = document.getElementById('player-question');
                if (playerQuestion) {
                    const cleanTranscript = result.text.trim().substring(0, 500);
                    playerQuestion.value = cleanTranscript;
                    playerQuestion.focus();
                    this.showNotification(`音声入力（Vosk）: ${cleanTranscript}`, 'success');
                } else {
                    this.showNotification('入力フィールドが見つかりません', 'error');
                }
            } else {
                this.showNotification('音声が認識できませんでした', 'warning');
            }
        } catch (error) {
            console.error('Vosk processing error:', error);
            this.showNotification('音声認識サーバーに接続できませんでした', 'error');
        }
    }

    toggleWebSpeechRecognition() {
        try {
            if (!this.recognition) {
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
            console.error('Web Speech recognition toggle failed:', error);
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

// Debug functions for tutorial troubleshooting
window.debugTutorial = () => {
    if (window.gameManager) {
        window.gameManager.debugTutorialState();
    } else {
        console.log('GameManager not found');
    }
};

window.forceMainMenu = () => {
    if (window.gameManager) {
        window.gameManager.forceShowMainMenu();
    } else {
        console.log('GameManager not found');
    }
};

window.resetTutorial = () => {
    if (window.gameManager) {
        window.gameManager.resetTutorial();
    } else {
        console.log('GameManager not found');
    }
};

// Debug function to check app flow state
window.debugAppFlow = () => {
    if (window.gameManager) {
        console.log('[Debug] App Flow State:');
        console.log('- isFirstTimeUser:', window.gameManager.isFirstTimeUser);
        console.log('- hasSeenTutorial (localStorage):', localStorage.getItem('hasSeenTutorial'));
        console.log('- Current screen:', document.querySelector('.screen:not([style*="display: none"])')?.id || 'none');
        console.log('- Active modals:', Array.from(document.querySelectorAll('.modal.active')).map(m => m.id));
        console.log('- tutorialStep:', window.gameManager.tutorialStep);
        console.log('- tutorialSteps:', window.gameManager.tutorialSteps ? window.gameManager.tutorialSteps.length : 'null');
        console.log('- Server connected:', window.gameManager.gameServerUrl ? 'Yes' : 'No');
    } else {
        console.log('GameManager not found');
    }
};

// Keyboard shortcuts for debugging
document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+D: Debug tutorial state
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        window.debugTutorial();
    }

    // Ctrl+Shift+M: Force show main menu
    if (e.ctrlKey && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        window.forceMainMenu();
    }

    // Ctrl+Shift+R: Reset tutorial
    if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        window.resetTutorial();
    }

    // Ctrl+Shift+F: Debug app flow state
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        window.debugAppFlow();
    }
});
