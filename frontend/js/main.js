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
        this.timeLimit = 300; // Default 5 minutes
        this.questionsPerGame = 10; // Default 10 questions

        this.cacheElements();
        this.attachEventListeners();
        this.loadSettings();
        this.initUI();
    }

    cache(id) { return document.getElementById(id); }

    cacheElements() {
        this.el = {
            // Modals & Screens
            startupOverlay: this.cache('startup-overlay'),
            mainMenu: this.cache('main-menu'),
            gameScreen: this.cache('game-screen'),
            settingsModal: this.cache('settings-modal'),
            leaderboardModal: this.cache('leaderboard-modal'),
            achievementsModal: this.cache('achievements-modal'),
            resultModal: this.cache('result-modal'),
            controlsOverlay: this.cache('controls-overlay'),
            practiceSetupModal: this.cache('practice-setup-modal'),
            matchSelectModal: this.cache('match-select-modal'),
            randomMatchModal: this.cache('random-match-modal'),
            roomModal: this.cache('room-modal'),

            // Startup
            startupServer: this.cache('startup-server'),
            startupLMServer: this.cache('startup-lmserver'),
            startupNickname: this.cache('startup-nickname'),
            connectServerBtn: this.cache('connect-server-btn'),
            connectionStatus: this.cache('connection-status'),
            lobbyStatus: this.cache('lobby-status'),
            lobbyMinigame: this.cache('lobby-minigame'),
            minigameArea: this.cache('minigame-area'),
            minigameBtn: this.cache('minigame-btn'),
            minigameScore: this.cache('minigame-score'),

            // Main Menu
            soloModeBtn: this.cache('solo-mode-btn'),
            vsModeBtn: this.cache('vs-mode-btn'),
            rtaModeBtn: this.cache('rta-mode-btn'),
            practiceModeBtn: this.cache('practice-mode-btn'),
            leaderboardBtn: this.cache('leaderboard-btn'),
            achievementsBtn: this.cache('achievements-btn'),
            settingsMainBtn: this.cache('settings-main-btn'),

            // Game Screen
            backToMenuBtn: this.cache('back-to-menu-btn'),
            currentMode: this.cache('current-mode'),
            questionNumber: this.cache('question-number'),
            totalQuestions: this.cache('total-questions'),
            currentScore: this.cache('current-score'),
            timerDisplay: this.cache('timer-display'),
            targetAnswer: this.cache('target-answer'),
            aiOutput: this.cache('ai-output'),
            aiAnalysis: this.cache('ai-analysis'),
            aiStatus: this.cache('ai-status'),
            playerQuestion: this.cache('player-question'),
            questionHistory: this.cache('question-history'),
            questionCount: this.cache('question-count'),
            clearQuestionBtn: this.cache('clear-question-btn'),
            submitQuestionBtn: this.cache('submit-question-btn'),
            totalScore: this.cache('total-score'),
            correctCount: this.cache('correct-count'),
            accuracy: this.cache('accuracy'),
            progressFill: this.cache('progress-fill'),

            // Result Modal
            finalScore: this.cache('final-score'),
            resultCorrect: this.cache('result-correct'),
            resultQuestions: this.cache('result-questions'),
            resultAccuracy: this.cache('result-accuracy'),
            resultTime: this.cache('result-time'),
            playAgainBtn: this.cache('play-again-btn'),
            backToMenuResultBtn: this.cache('back-to-menu-result-btn'),

            // Settings
            saveSettingsBtn: this.cache('save-settings-btn'),
            themeSelect: this.cache('theme'),
            gameServerAddress: this.cache('game-server-address'),
            lmServerAddress: this.cache('lm-server-address'),

            // Leaderboard
            leaderboardList: this.cache('leaderboard-list'),

            // Multiplayer Modals
            matchRandomBtn: this.cache('match-random-btn'),
            matchCustomBtn: this.cache('match-custom-btn'),
            randomRuleSelect: this.cache('random-rule-select'),
            ruleDescription: this.cache('rule-description'),
            randomJoinBtn: this.cache('random-join-btn'),
            createRoomBtn: this.cache('create-room-btn'),
            joinRoomBtn: this.cache('join-room-btn'),
            roomStatus: this.cache('room-status'),
        };
    }

    attachEventListeners() {
        const safeAdd = (el, ev, fn) => { if (el) el.addEventListener(ev, fn.bind(this)); };

        // Startup
        safeAdd(this.el.connectServerBtn, 'click', this.startupConnect);

        // Main Menu
        safeAdd(this.el.soloModeBtn, 'click', this.startSoloMode);
        safeAdd(this.el.vsModeBtn, 'click', () => this.showModal('match-select-modal'));
        safeAdd(this.el.rtaModeBtn, 'click', this.startRtaMode);
        safeAdd(this.el.practiceModeBtn, 'click', () => this.showModal('practice-setup-modal'));
        safeAdd(this.el.settingsMainBtn, 'click', () => this.showModal('settings-modal'));
        safeAdd(this.el.leaderboardBtn, 'click', this.showLeaderboard);
        safeAdd(this.el.achievementsBtn, 'click', () => this.showModal('achievements-modal'));

        // Game Screen
        safeAdd(this.el.backToMenuBtn, 'click', this.goBackToMenu);
        safeAdd(this.el.submitQuestionBtn, 'click', this.submitQuestion);
        safeAdd(this.el.clearQuestionBtn, 'click', this.clearQuestion);
        if (this.el.playerQuestion) {
            this.el.playerQuestion.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.submitQuestion();
            });
        }

        // Modals
        document.querySelectorAll('.modal .close-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.closeParentModal(e.target));
        });
        safeAdd(this.el.saveSettingsBtn, 'click', this.saveSettings);
        safeAdd(this.el.playAgainBtn, 'click', () => this.startGame(this.currentMode));
        safeAdd(this.el.backToMenuResultBtn, 'click', this.goBackToMenu);
        safeAdd(this.cache('practice-start-btn'), 'click', this.startPracticeMode);
        safeAdd(this.cache('controls-start-btn'), 'click', () => this.closeModal('controls-overlay'));
        safeAdd(this.cache('controls-back-btn'), 'click', this.goBackToMenu);

        // Multiplayer
        safeAdd(this.el.matchRandomBtn, 'click', () => { this.showModal('random-match-modal'); this.closeModal('match-select-modal'); });
        safeAdd(this.el.matchCustomBtn, 'click', () => { this.showModal('room-modal'); this.closeModal('match-select-modal'); });
        safeAdd(this.el.randomRuleSelect, 'change', this.updateRuleDescription);
        safeAdd(this.el.randomJoinBtn, 'click', this.joinRandomMatch);
        safeAdd(this.el.createRoomBtn, 'click', this.createRoom);
        safeAdd(this.el.joinRoomBtn, 'click', this.joinRoom);

        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn));
        });
    }

    initUI() {
        this.showScreen('main-menu');
        if (this.gameServerUrl && this.nickname) {
            this.el.startupServer.value = this.gameServerUrl;
            this.el.startupLMServer.value = this.lmServerUrl;
            this.el.startupNickname.value = this.nickname;
            this.closeModal('startup-overlay');
        } else {
            this.showModal('startup-overlay');
        }
        this.updateRuleDescription();
    }

    // --- Connection and Setup ---
    async startupConnect() {
        const server = this.el.startupServer.value.trim();
        const lm = this.el.startupLMServer.value.trim();
        const nick = this.el.startupNickname.value.trim();
        const force = this.cache('startup-force-lm').checked;

        if (!server || !nick) {
            return this.showNotification('ゲームサーバーとニックネームを入力してください', 'error');
        }

        this.el.connectServerBtn.disabled = true;
        this.el.connectionStatus.textContent = 'サーバーに接続中...';

        try {
            const res = await fetch(`${server}/status`);
            if (!res.ok) throw new Error(`サーバーが応答しません (Status: ${res.status})`);
            const info = await res.json();
            this.el.connectionStatus.textContent = `ゲームサーバー: OK (ID: ${info.server_id.slice(0, 8)})`;
            this.gameServerUrl = server;
            this.nickname = nick;

            if (lm && !force) {
                this.el.connectionStatus.textContent += ' | LMStudioに接続中...';
                const probe = await fetch(`${server}/probe_lm`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ lm_server: lm }) });
                const probej = await probe.json();
                if (!probej.ok) throw new Error(`LMStudioに接続できません: ${probej.error || '不明なエラー'}`);
                this.el.connectionStatus.textContent = this.el.connectionStatus.textContent.replace(' | LMStudioに接続中...', ' | LMStudio: OK');
            }
            this.lmServerUrl = lm;

            const reg = await fetch(`${server}/register`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ nickname: nick }) });
            const regj = await reg.json();
            if (!regj.player_id) throw new Error('プレイヤー登録に失敗しました');
            this.playerId = regj.player_id;

            localStorage.setItem('gameServerUrl', this.gameServerUrl);
            localStorage.setItem('lmServerUrl', this.lmServerUrl);
            localStorage.setItem('nickname', this.nickname);
            localStorage.setItem('playerId', this.playerId);

            this.showNotification('接続しました！', 'success');
            this.closeModal('startup-overlay');

        } catch (e) {
            this.el.connectionStatus.textContent = `接続失敗: ${e.message}`;
            this.showNotification(e.message, 'error');
        } finally {
            this.el.connectServerBtn.disabled = false;
        }
    }

    // --- Game Modes ---
    async startSoloMode() {
        this.currentMode = 'solo';
        this.timeLimit = 5 * 60;
        this.questionsPerGame = 10;
        await this.fetchQuestionsAndStartGame();
    }

    async startRtaMode() {
        this.currentMode = 'rta';
        this.timeLimit = 5 * 60;
        this.questionsPerGame = 10;
        await this.fetchQuestionsAndStartGame();
    }

    startPracticeMode() {
        this.currentMode = 'practice';
        this.questionsPerGame = parseInt(this.cache('practice-questions').value, 10) || 10;
        this.timeLimit = (parseInt(this.cache('practice-time').value, 10) || 5) * 60;
        this.closeModal('practice-setup-modal');
        this.fetchQuestionsAndStartGame();
    }

    async fetchQuestionsAndStartGame() {
        if (!this.gameServerUrl) {
            return this.showNotification('ゲームサーバーに接続していません', 'error');
        }
        try {
            const res = await fetch(`${this.gameServerUrl}/solo/questions?n=${this.questionsPerGame}`);
            const data = await res.json();
            if (data.error || !data.questions || !data.questions.length) {
                throw new Error(data.error || '問題の取得に失敗しました');
            }
            this.questions = data.questions;
            this.startGame(this.currentMode);
        } catch (e) {
            this.showNotification(e.message, 'error');
            console.error('Failed to fetch questions:', e);
        }
    }

    startGame(mode) {
        this.currentMode = mode;
        this.resetGameState();
        this.showScreen('game-screen');
        this.showModal('controls-overlay');

        this.el.currentMode.textContent = this.getModeName(mode);
        this.el.totalQuestions.textContent = this.questions.length;

        this.showQuestion();
        this.startTimer();
    }

    // --- Multiplayer Flow ---
    updateRuleDescription() {
        const selectedRule = this.el.randomRuleSelect.value;
        const descriptions = {
            classic: '<b>クラシック:</b> 標準的なルールです。10問の問題に挑戦し、スコアを競います。',
            speed: '<b>スピード:</b> 短時間で決着！問題数は5問で、素早い判断が求められます。',
            challenge: '<b>チャレンジ:</b> 上級者向け。問題数が15問と多く、長丁場の戦いです。'
        };
        this.el.ruleDescription.innerHTML = descriptions[selectedRule] || '';
    }

    async joinRandomMatch() {
        const rule = this.el.randomRuleSelect.value;
        this.closeModal('random-match-modal');
        this.el.lobbyStatus.textContent = `「${this.getModeName(rule)}」ルールでマッチング待機中...`;
        this.el.lobbyStatus.style.display = 'block';
        this.startLobbyPolling(rule);
    }

    async createRoom() {
        const name = this.cache('room-name').value || '';
        const password = this.cache('room-password').value || '';
        const max_players = parseInt(this.cache('room-max').value, 10) || 3;
        const rule = this.cache('room-rule').value || 'classic';

        try {
            const res = await fetch(`${this.gameServerUrl}/room/create`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ player_id: this.playerId, name, password, max_players, rule })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            this.el.roomStatus.textContent = `ルーム作成完了！ID: ${data.room_id}。友達を待っています...`;
            this.startLobbyPolling(null, data.room_id);
        } catch (e) {
            this.el.roomStatus.textContent = `作成失敗: ${e.message}`;
            this.showNotification(e.message, 'error');
        }
    }

    async joinRoom() {
        const room_id = this.cache('join-room-id').value.trim();
        const password = this.cache('join-room-password').value || '';
        if (!room_id) return this.showNotification('ルームIDを入力してください', 'error');

        try {
            const res = await fetch(`${this.gameServerUrl}/room/join`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ player_id: this.playerId, room_id, password })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            this.el.roomStatus.textContent = `ルーム「${room_id}」に参加しました。ゲーム開始を待っています...`;
            if (data.game_id) {
                this.handleGameStart(data);
            } else {
                this.startLobbyPolling(null, room_id);
            }
        } catch (e) {
            this.el.roomStatus.textContent = `参加失敗: ${e.message}`;
            this.showNotification(e.message, 'error');
        }
    }

    startLobbyPolling(rule, roomId = null) {
        if (this.lobbyPollInterval) clearInterval(this.lobbyPollInterval);
        this.el.lobbyMinigame.style.display = 'block';
        this.startMinigame();

        this.lobbyPollInterval = setInterval(async () => {
            try {
                const endpoint = roomId ? `${this.gameServerUrl}/room/join` : `${this.gameServerUrl}/lobby/join`;
                const payload = roomId ? { player_id: this.playerId, room_id: roomId } : { player_id: this.playerId, rule };
                
                const res = await fetch(endpoint, { 
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'}, 
                    body: JSON.stringify(payload)
                });
                const data = await res.json();

                if (data.error) {
                    throw new Error(data.error);
                }

                if (data.game_id) {
                    this.handleGameStart(data);
                } else if (data.waiting) {
                    const statusText = roomId 
                        ? `ルーム待機中 (${data.position}/${data.max_players || '-'})`
                        : `マッチング待機中 (順番: ${data.position})`;
                    this.el.lobbyStatus.textContent = statusText;
                }
            } catch (e) {
                this.showNotification(`ロビーエラー: ${e.message}`, 'error');
                this.stopLobbyPolling();
            }
        }, 3000);
    }

    stopLobbyPolling() {
        if (this.lobbyPollInterval) clearInterval(this.lobbyPollInterval);
        this.lobbyPollInterval = null;
        this.el.lobbyStatus.style.display = 'none';
        this.el.lobbyMinigame.style.display = 'none';
        this.stopMinigame();
    }

    handleGameStart(gameData) {
        this.stopLobbyPolling();
        this.showNotification('マッチング完了！ゲームを開始します。', 'success');
        this.questions = gameData.questions.map(q => ({ ...q, answers: [] })); // Answers are not sent for multiplayer
        this.closeModal('room-modal');
        this.startGame('vs');
    }

    // --- In-Game Logic ---
    resetGameState() {
        this.stopTimer();
        this.score = 0;
        this.correctAnswers = 0;
        this.questionCount = 0;
        this.currentQuestionIndex = 0;
        this.el.questionHistory.innerHTML = '';
        this.el.playerQuestion.value = '';
        this.updateUI();
    }

    showQuestion() {
        if (this.currentQuestionIndex >= this.questions.length) {
            this.endGame();
            return;
        }
        const q = this.questions[this.currentQuestionIndex];
        this.el.targetAnswer.textContent = this.currentMode === 'vs' ? '???' : q.answers.join(' / ');
        this.el.questionNumber.textContent = this.currentQuestionIndex + 1;
        this.el.aiOutput.textContent = 'AIが回答を待っています...';
        this.el.aiAnalysis.innerHTML = '';
        this.setAIStatus('待機中', '#ccc');
        this.updateUI();
    }

    async submitQuestion() {
        const text = this.el.playerQuestion.value.trim();
        if (!text) return;

        const q = this.questions[this.currentQuestionIndex];
        if (this.currentMode !== 'vs' && q.answers.some(ans => text.toLowerCase().includes(ans.toLowerCase()))) {
            return this.showNotification('質問に答えが含まれています。', 'error');
        }

        this.setAIStatus('処理中', '#ffaa00');
        this.el.submitQuestionBtn.disabled = true;
        this.questionCount++;
        this.appendQuestionHistory(text);

        try {
            const res = await fetch(`${this.gameServerUrl}/ask_ai`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: text, target_answer: q.answers[0] || '', lm_server: this.lmServerUrl })
            });
            if (!res.ok) throw new Error(`サーバーエラー: ${res.status}`);
            const data = await res.json();
            
            this.el.aiOutput.textContent = data.ai_response || '(応答なし)';
            if (data.reasoning) {
                this.el.aiAnalysis.innerHTML = `<p><b>AIの思考:</b> ${data.reasoning}</p>`;
            }
            if (data.valid === false) {
                this.showNotification(`不正な質問: ${data.invalid_reason || 'ルール違反'}`, 'error');
            }

            const isCorrect = this.checkAnswer(data.ai_response, q.answers);
            this.handleAnswerResult(isCorrect);

        } catch (e) {
            this.setAIStatus('エラー', '#ff4757');
            this.showNotification(e.message, 'error');
        } finally {
            this.el.submitQuestionBtn.disabled = false;
        }
    }

    checkAnswer(aiResponse, targetAnswers) {
        if (!aiResponse || !targetAnswers || targetAnswers.length === 0) return false;
        const lowerResponse = aiResponse.toLowerCase();
        return targetAnswers.some(ans => lowerResponse.includes(ans.toLowerCase()));
    }

    handleAnswerResult(isCorrect) {
        if (isCorrect) {
            this.score += this.calculateScore();
            this.correctAnswers++;
            this.setAIStatus('正解！', '#00ff88');
            this.showNotification('正解！', 'success');
            setTimeout(() => this.nextQuestion(), 1500);
        } else {
            this.score = Math.max(0, this.score - 10);
            this.setAIStatus('不正解', '#ff4757');
        }
        this.updateUI();
    }

    nextQuestion() {
        this.currentQuestionIndex++;
        this.showQuestion();
    }

    endGame() {
        this.stopTimer();
        const timeTaken = this.initialTimeLimit - this.timeLimit;
        this.el.finalScore.textContent = this.score;
        this.el.resultCorrect.textContent = `${this.correctAnswers} / ${this.questions.length}`;
        this.el.resultQuestions.textContent = this.questionCount;
        const accuracy = this.questions.length > 0 ? Math.round((this.correctAnswers / this.questions.length) * 100) : 0;
        this.el.resultAccuracy.textContent = `${accuracy}%`;
        this.el.resultTime.textContent = this.formatTime(timeTaken);
        this.showModal('result-modal');

        if (this.currentMode !== 'practice') {
            this.submitScore(timeTaken);
        }
    }

    async submitScore(timeInSeconds) {
        try {
            await fetch(`${this.gameServerUrl}/scores/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    player_id: this.playerId, 
                    mode: this.currentMode, 
                    score: this.score, 
                    time_seconds: timeInSeconds 
                })
            });
        } catch (e) {
            console.error('Score submission failed:', e);
        }
    }

    // --- UI & State Management ---
    updateUI() {
        this.el.currentScore.textContent = this.score;
        this.el.totalScore.textContent = this.score;
        this.el.correctCount.textContent = this.correctAnswers;
        this.el.questionCount.textContent = `質問回数: ${this.questionCount}`;
        const accuracy = this.correctAnswers > 0 ? Math.round((this.correctAnswers / this.questionCount) * 100) : 0;
        this.el.accuracy.textContent = `${accuracy}%`;
        const progress = this.questions.length > 0 ? ((this.currentQuestionIndex) / this.questions.length) * 100 : 0;
        this.el.progressFill.style.width = `${progress}%`;
    }

    startTimer() {
        this.stopTimer();
        this.initialTimeLimit = this.timeLimit;
        this.el.timerDisplay.textContent = this.formatTime(this.timeLimit);
        this.timer = setInterval(() => {
            this.timeLimit--;
            this.el.timerDisplay.textContent = this.formatTime(this.timeLimit);
            if (this.timeLimit <= 0) {
                this.endGame();
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    loadSettings() {
        const theme = localStorage.getItem('theme') || 'dark';
        this.el.themeSelect.value = theme;
        this.applyTheme(theme);
        this.el.gameServerAddress.value = this.gameServerUrl;
        this.el.lmServerAddress.value = this.lmServerUrl;
    }

    saveSettings() {
        this.gameServerUrl = this.el.gameServerAddress.value.trim();
        this.lmServerUrl = this.el.lmServerAddress.value.trim();
        const theme = this.el.themeSelect.value;
        localStorage.setItem('gameServerUrl', this.gameServerUrl);
        localStorage.setItem('lmServerUrl', this.lmServerUrl);
        localStorage.setItem('theme', theme);
        this.applyTheme(theme);
        this.showNotification('設定を保存しました');
        this.closeModal('settings-modal');
    }

    applyTheme(theme) {
        document.documentElement.className = theme;
    }

    async showLeaderboard() {
        this.showModal('leaderboard-modal');
        const mode = document.querySelector('#leaderboard-modal .tab-btn.active').dataset.board || 'solo';
        try {
            const res = await fetch(`${this.gameServerUrl}/scores/top?mode=${mode}`);
            const data = await res.json();
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
        } catch (e) {
            this.el.leaderboardList.innerHTML = '<p style="text-align:center;color:red;">ランキングの読み込みに失敗しました。</p>';
        }
    }

    // --- Helpers ---
    goBackToMenu() {
        this.resetGameState();
        this.showScreen('main-menu');
        this.closeAllModals();
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        this.cache(screenId).classList.add('active');
    }

    showModal(modalId) { this.cache(modalId).classList.add('active'); }
    closeModal(modalId) { this.cache(modalId).classList.remove('active'); }
    closeParentModal(el) { el.closest('.modal').classList.remove('active'); }
    closeAllModals() { document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); }

    getModeName(m) {
        return ({ solo: 'ソロモード', vs: '対戦モード', rta: 'RTAモード', practice: '練習モード', classic: 'クラシック', speed: 'スピード', challenge: 'チャレンジ' })[m] || m;
    }

    setAIStatus(text, color) {
        this.el.aiStatus.textContent = text;
        this.el.aiStatus.style.background = color;
    }

    appendQuestionHistory(text) {
        const d = document.createElement('div');
        d.className = 'question-item';
        d.textContent = `${this.questionCount}. ${text}`;
        this.el.questionHistory.appendChild(d);
        this.el.questionHistory.scrollTop = this.el.questionHistory.scrollHeight;
    }

    clearQuestion() { this.el.playerQuestion.value = ''; }

    calculateScore() { return 100; } // Placeholder

    formatTime(seconds) {
        const m = Math.floor(seconds / 60); const s = seconds % 60;
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
        parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (parent.closest('#leaderboard-modal')) {
            this.showLeaderboard();
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
}

document.addEventListener('DOMContentLoaded', () => {
    window.gameManager = new GameManager();
});
