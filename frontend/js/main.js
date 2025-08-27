class GameManager {
    constructor() {
        // --- Core Properties ---
        this.gameServerUrl = localStorage.getItem('gameServerUrl') || (typeof config !== 'undefined' ? config.backendUrl : '');
        this.lmServerUrl = localStorage.getItem('lmServerUrl') || '';
        this.playerId = localStorage.getItem('playerId');
        this.nickname = localStorage.getItem('nickname') || '';

        // --- Game State ---
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.score = 0;
        this.correctAnswers = 0;
        this.questionCount = 0;
        this.timer = null;
        this.timeLimit = 300; // Default 5 minutes
        this.initialTimeLimit = 300;
        this.questionsPerGame = 10; // Default 10 questions
        this.currentMode = 'solo';

        // --- Multiplayer State ---
        this.lobbyPollInterval = null;

        // --- Initialization ---
        this.el = {};
        this.cacheElements();
        this.attachEventListeners();
        this.loadSettings();
        this.initUI();
    }

    // --- Caching and Event Binding ---

    cacheElements() {
        // A simpler, more direct caching method to avoid potential bugs.
        this.el.startupOverlay = document.getElementById('startup-overlay');
        this.el.mainMenu = document.getElementById('main-menu');
        this.el.gameScreen = document.getElementById('game-screen');
        this.el.settingsModal = document.getElementById('settings-modal');
        this.el.leaderboardModal = document.getElementById('leaderboard-modal');
        this.el.achievementsModal = document.getElementById('achievements-modal');
        this.el.resultModal = document.getElementById('result-modal');
        this.el.controlsOverlay = document.getElementById('controls-overlay');
        this.el.practiceSetupModal = document.getElementById('practice-setup-modal');
        this.el.matchSelectModal = document.getElementById('match-select-modal');
        this.el.randomMatchModal = document.getElementById('random-match-modal');
        this.el.roomModal = document.getElementById('room-modal');
        this.el.startupServer = document.getElementById('startup-server');
        this.el.startupLmserver = document.getElementById('startup-lmserver');
        this.el.startupNickname = document.getElementById('startup-nickname');
        this.el.connectServerBtn = document.getElementById('connect-server-btn');
        this.el.connectionStatus = document.getElementById('connection-status');
        this.el.lobbyStatus = document.getElementById('lobby-status');
        this.el.lobbyMinigame = document.getElementById('lobby-minigame');
        this.el.minigameArea = document.getElementById('minigame-area');
        this.el.minigameBtn = document.getElementById('minigame-btn');
        this.el.minigameScore = document.getElementById('minigame-score');
        this.el.startupForceLm = document.getElementById('startup-force-lm');
        this.el.soloModeBtn = document.getElementById('solo-mode-btn');
        this.el.vsModeBtn = document.getElementById('vs-mode-btn');
        this.el.rtaModeBtn = document.getElementById('rta-mode-btn');
        this.el.practiceModeBtn = document.getElementById('practice-mode-btn');
        this.el.leaderboardBtn = document.getElementById('leaderboard-btn');
        this.el.achievementsBtn = document.getElementById('achievements-btn');
        this.el.settingsMainBtn = document.getElementById('settings-main-btn');
        this.el.backToMenuBtn = document.getElementById('back-to-menu-btn');
        this.el.currentMode = document.getElementById('current-mode');
        this.el.questionNumber = document.getElementById('question-number');
        this.el.totalQuestions = document.getElementById('total-questions');
        this.el.currentScore = document.getElementById('current-score');
        this.el.timerDisplay = document.getElementById('timer-display');
        this.el.targetAnswer = document.getElementById('target-answer');
        this.el.aiOutput = document.getElementById('ai-output');
        this.el.aiAnalysis = document.getElementById('ai-analysis');
        this.el.aiStatus = document.getElementById('ai-status');
        this.el.playerQuestion = document.getElementById('player-question');
        this.el.questionHistory = document.getElementById('question-history');
        this.el.questionCount = document.getElementById('question-count');
        this.el.clearQuestionBtn = document.getElementById('clear-question-btn');
        this.el.submitQuestionBtn = document.getElementById('submit-question-btn');
        this.el.totalScore = document.getElementById('total-score');
        this.el.correctCount = document.getElementById('correct-count');
        this.el.accuracy = document.getElementById('accuracy');
        this.el.progressFill = document.getElementById('progress-fill');
        this.el.finalScore = document.getElementById('final-score');
        this.el.resultCorrect = document.getElementById('result-correct');
        this.el.resultQuestions = document.getElementById('result-questions');
        this.el.resultAccuracy = document.getElementById('result-accuracy');
        this.el.resultTime = document.getElementById('result-time');
        this.el.playAgainBtn = document.getElementById('play-again-btn');
        this.el.backToMenuResultBtn = document.getElementById('back-to-menu-result-btn');
        this.el.saveSettingsBtn = document.getElementById('save-settings-btn');
        this.el.theme = document.getElementById('theme');
        this.el.gameServerAddress = document.getElementById('game-server-address');
        this.el.lmServerAddress = document.getElementById('lm-server-address');
        this.el.leaderboardList = document.getElementById('leaderboard-list');
        this.el.matchRandomBtn = document.getElementById('match-random-btn');
        this.el.matchCustomBtn = document.getElementById('match-custom-btn');
        this.el.randomRuleSelect = document.getElementById('random-rule-select');
        this.el.ruleDescription = document.getElementById('rule-description');
        this.el.randomJoinBtn = document.getElementById('random-join-btn');
        this.el.createRoomBtn = document.getElementById('create-room-btn');
        this.el.joinRoomBtn = document.getElementById('join-room-btn');
        this.el.roomStatus = document.getElementById('room-status');
        this.el.roomName = document.getElementById('room-name');
        this.el.roomPassword = document.getElementById('room-password');
        this.el.roomMax = document.getElementById('room-max');
        this.el.roomRule = document.getElementById('room-rule');
        this.el.joinRoomId = document.getElementById('join-room-id');
        this.el.joinRoomPassword = document.getElementById('join-room-password');
        this.el.practiceQuestions = document.getElementById('practice-questions');
        this.el.practiceTime = document.getElementById('practice-time');
        this.el.practiceStartBtn = document.getElementById('practice-start-btn');
        this.el.controlsStartBtn = document.getElementById('controls-start-btn');
        this.el.controlsBackBtn = document.getElementById('controls-back-btn');
    }

    attachEventListeners() {
        const safeAdd = (el, ev, fn) => {
            if (el) {
                el.addEventListener(ev, fn.bind(this));
            } else {
                console.warn(`Event listener for ${ev} could not be attached to a null element.`);
            }
        };

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
        safeAdd(this.el.playerQuestion, 'keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.submitQuestion();
        });

        // Modals
        document.querySelectorAll('.modal .close-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.closeParentModal(e.target));
        });
        safeAdd(this.el.saveSettingsBtn, 'click', this.saveSettings);
        safeAdd(this.el.playAgainBtn, 'click', () => this.startGame(this.currentMode));
        safeAdd(this.el.backToMenuResultBtn, 'click', this.goBackToMenu);
        safeAdd(this.el.practiceStartBtn, 'click', this.startPracticeMode);
        safeAdd(this.el.controlsStartBtn, 'click', () => this.closeModal('controls-overlay'));
        safeAdd(this.el.controlsBackBtn, 'click', this.goBackToMenu);

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

    // --- UI Initialization and State ---

    initUI() {
        this.showScreen('main-menu');
        this.showModal('startup-overlay');
        if (this.gameServerUrl && this.el.startupServer) this.el.startupServer.value = this.gameServerUrl;
        if (this.lmServerUrl && this.el.startupLmserver) this.el.startupLmserver.value = this.lmServerUrl;
        if (this.nickname && this.el.startupNickname) this.el.startupNickname.value = this.nickname;
        this.updateRuleDescription();
    }

    loadSettings() {
        const theme = localStorage.getItem('theme') || 'dark';
        if (this.el.theme) this.el.theme.value = theme;
        this.applyTheme(theme);
        if (this.el.gameServerAddress) this.el.gameServerAddress.value = this.gameServerUrl;
        if (this.el.lmServerAddress) this.el.lmServerAddress.value = this.lmServerUrl;
    }

    saveSettings() {
        if (this.el.gameServerAddress) this.gameServerUrl = this.el.gameServerAddress.value.trim();
        if (this.el.lmServerAddress) this.lmServerUrl = this.el.lmServerAddress.value.trim();
        const theme = this.el.theme ? this.el.theme.value : 'dark';
        
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

    // --- Connection and Setup ---

    async startupConnect() {
        const server = this.el.startupServer ? this.el.startupServer.value.trim() : '';
        const lm = this.el.startupLmserver ? this.el.startupLmserver.value.trim() : '';
        const nick = this.el.startupNickname ? this.el.startupNickname.value.trim() : '';
        const force = this.el.startupForceLm ? this.el.startupForceLm.checked : false;

        if (!server || !nick) {
            return this.showNotification('ゲームサーバーとニックネームを入力してください', 'error');
        }

        if (this.el.connectServerBtn) this.el.connectServerBtn.disabled = true;
        if (this.el.connectionStatus) this.el.connectionStatus.textContent = 'サーバーに接続中...';

        try {
            const res = await fetch(`${server}/status`);
            if (!res.ok) throw new Error(`サーバーが応答しません (Status: ${res.status})`);
            const info = await res.json();
            if (this.el.connectionStatus) this.el.connectionStatus.textContent = `ゲームサーバー: OK (ID: ${info.server_id.slice(0, 8)})`;
            this.gameServerUrl = server;
            this.nickname = nick;

            if (lm && !force) {
                if (this.el.connectionStatus) this.el.connectionStatus.textContent += ' | LMStudioに接続中...';
                const probe = await fetch(`${server}/probe_lm`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ lm_server: lm }) });
                const probej = await probe.json();
                if (!probej.ok) throw new Error(`LMStudioに接続できません: ${probej.error || '不明なエラー'}`);
                if (this.el.connectionStatus) this.el.connectionStatus.textContent = this.el.connectionStatus.textContent.replace(' | LMStudioに接続中...', ' | LMStudio: OK');
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
            if (this.el.connectionStatus) this.el.connectionStatus.textContent = `接続失敗: ${e.message}`;
            this.showNotification(e.message, 'error');
        } finally {
            if (this.el.connectServerBtn) this.el.connectServerBtn.disabled = false;
        }
    }

    // --- Game Modes & Flow ---

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
        this.questionsPerGame = this.el.practiceQuestions ? parseInt(this.el.practiceQuestions.value, 10) : 10;
        this.timeLimit = (this.el.practiceTime ? parseInt(this.el.practiceTime.value, 10) : 5) * 60;
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

        if (this.el.currentMode) this.el.currentMode.textContent = this.getModeName(mode);
        if (this.el.totalQuestions) this.el.totalQuestions.textContent = this.questions.length;

        this.showQuestion();
        this.startTimer();
    }

    goBackToMenu() {
        this.resetGameState();
        this.showScreen('main-menu');
        this.closeAllModals();
    }

    // --- Multiplayer Flow ---

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

    async joinRandomMatch() {
        const rule = this.el.randomRuleSelect ? this.el.randomRuleSelect.value : 'classic';
        this.closeModal('random-match-modal');
        if (this.el.lobbyStatus) {
            this.el.lobbyStatus.textContent = `「${this.getModeName(rule)}」ルールでマッチング待機中...`;
            this.el.lobbyStatus.style.display = 'block';
        }
        this.startLobbyPolling({ rule });
    }

    async createRoom() {
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
            if (this.el.roomStatus) this.el.roomStatus.textContent = `ルーム作成完了！ID: ${data.room_id}。友達を待っています...`;
            this.startLobbyPolling({ roomId: data.room_id });
        } catch (e) {
            if (this.el.roomStatus) this.el.roomStatus.textContent = `作成失敗: ${e.message}`;
            this.showNotification(e.message, 'error');
        }
    }

    async joinRoom() {
        const roomId = this.el.joinRoomId ? this.el.joinRoomId.value.trim() : '';
        const password = this.el.joinRoomPassword ? this.el.joinRoomPassword.value : '';
        if (!roomId) return this.showNotification('ルームIDを入力してください', 'error');

        try {
            this.startLobbyPolling({ roomId, password });
        } catch (e) {
            if (this.el.roomStatus) this.el.roomStatus.textContent = `参加失敗: ${e.message}`;
            this.showNotification(e.message, 'error');
        }
    }

    startLobbyPolling(params) {
        if (this.lobbyPollInterval) clearInterval(this.lobbyPollInterval);
        if (this.el.lobbyMinigame) this.el.lobbyMinigame.style.display = 'block';
        this.startMinigame();

        const poll = async () => {
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
                    this.handleGameStart(data);
                } else if (data.waiting && this.el.lobbyStatus) {
                    const statusText = params.roomId 
                        ? `ルーム待機中 (${data.position}/${data.max_players || '-'})`
                        : `マッチング待機中 (順番: ${data.position})`;
                    this.el.lobbyStatus.textContent = statusText;
                }
            } catch (e) {
                this.showNotification(`ロビーエラー: ${e.message}`, 'error');
                this.stopLobbyPolling();
            }
        };

        poll();
        this.lobbyPollInterval = setInterval(poll, 3000);
    }

    stopLobbyPolling() {
        if (this.lobbyPollInterval) clearInterval(this.lobbyPollInterval);
        this.lobbyPollInterval = null;
        if (this.el.lobbyStatus) this.el.lobbyStatus.style.display = 'none';
        if (this.el.lobbyMinigame) this.el.lobbyMinigame.style.display = 'none';
        this.stopMinigame();
    }

    handleGameStart(gameData) {
        this.stopLobbyPolling();
        this.showNotification('マッチング完了！ゲームを開始します。', 'success');
        this.questions = gameData.questions.map(q => ({ ...q, answers: [] })); // Answers are not sent for multiplayer
        this.closeAllModals();
        this.startGame('vs');
    }

    // --- In-Game Logic ---

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
        if (this.currentQuestionIndex >= this.questions.length) {
            return this.endGame();
        }
        const q = this.questions[this.currentQuestionIndex];
        if (!q) return this.endGame();

        if (this.el.targetAnswer) {
            this.el.targetAnswer.textContent = this.currentMode === 'vs' ? '???' : q.answers.join(' / ');
        }
        if (this.el.questionNumber) this.el.questionNumber.textContent = this.currentQuestionIndex + 1;
        if (this.el.aiOutput) this.el.aiOutput.textContent = 'AIが回答を待っています...';
        if (this.el.aiAnalysis) this.el.aiAnalysis.innerHTML = '';
        this.setAIStatus('待機中', '#ccc');
        this.updateUI();
    }

    async submitQuestion() {
        if (!this.el.playerQuestion) return;
        const text = this.el.playerQuestion.value.trim();
        if (!text) return;

        const q = this.questions[this.currentQuestionIndex];
        if (this.currentMode !== 'vs' && q.answers.some(ans => text.toLowerCase().includes(ans.toLowerCase()))) {
            return this.showNotification('質問に答えが含まれています。', 'error');
        }

        this.setAIStatus('処理中', '#ffaa00');
        if (this.el.submitQuestionBtn) this.el.submitQuestionBtn.disabled = true;
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
            
            if (this.el.aiOutput) this.el.aiOutput.textContent = data.ai_response || '(応答なし)';
            if (data.reasoning && this.el.aiAnalysis) {
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
            if (this.el.submitQuestionBtn) this.el.submitQuestionBtn.disabled = false;
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
        if (this.el.finalScore) this.el.finalScore.textContent = this.score;
        if (this.el.resultCorrect) this.el.resultCorrect.textContent = `${this.correctAnswers} / ${this.questions.length}`;
        if (this.el.resultQuestions) this.el.resultQuestions.textContent = this.questionCount;
        const accuracy = this.questions.length > 0 ? Math.round((this.correctAnswers / this.questions.length) * 100) : 0;
        if (this.el.resultAccuracy) this.el.resultAccuracy.textContent = `${accuracy}%`;
        if (this.el.resultTime) this.el.resultTime.textContent = this.formatTime(timeTaken);
        this.showModal('result-modal');

        if (this.currentMode !== 'practice') {
            this.submitScore(timeTaken);
        }
    }

    async submitScore(timeInSeconds) {
        if (!this.playerId) return;
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

    // --- Helpers ---

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(screenId);
        if (screen) screen.classList.add('active');
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
    }

    calculateScore() { return 100; } // Placeholder

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
    try {
        window.gameManager = new GameManager();
    } catch (e) {
        console.error("Failed to initialize GameManager:", e);
        document.body.innerHTML = `<div style="color: red; padding: 2rem; font-family: sans-serif;"><h1>Application Error</h1><p>Could not start the application due to a critical error. Please check the console for details.</p><pre>${e.stack}</pre></div>`;
    }
});
