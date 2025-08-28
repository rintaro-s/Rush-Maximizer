# -*- coding: utf-8 -*-
import os
import json
import requests
from fastapi import FastAPI
import re
from fastapi.staticfiles import StaticFiles
import time
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uuid
import random

# load question bank for server-side distribution (do not expose answers to clients)
HERE = os.path.dirname(__file__)
DATA_PATH = os.path.join(HERE, "data", "questions.json")
ALL_QUESTIONS = []
try:
    with open(DATA_PATH, 'r', encoding='utf-8') as f:
        ALL_QUESTIONS = json.load(f)
    print(f"Successfully loaded {len(ALL_QUESTIONS)} questions from {DATA_PATH}")
except Exception as e:

    print(f"CRITICAL: Failed to load questions from {DATA_PATH}: {e}")
    

# server runtime state
SERVER_ID = str(uuid.uuid4())
PLAYERS = {}  # player_id -> { nickname, last_seen, session_token }

# helper: find player_id by session_token or validate player_id
def resolve_player(player_id: Optional[str] = None, session_token: Optional[str] = None):
    if player_id and player_id in PLAYERS:
        return player_id
    if session_token:
        for pid, pdata in PLAYERS.items():
            if pdata.get('session_token') == session_token:
                return pid
    return None
# rule -> list of waiting entries {player_id, joined_at}
WAITING_BY_RULE = {}
GAMES = {}  # game_id -> { players: [player_id], questions: [q], pointer: int }
MIN_PLAYERS = 3
SCORES = {'solo': [], 'rta': []}  # list of { player, score, time, meta }
DEFAULT_QUESTIONS_PER_GAME = int(os.getenv('QUESTIONS_PER_GAME', '10'))
ROOMS = {}  # room_id -> { name, password, max_players, rule, players: [player_id], creator }
# map player_id -> pending game_id so players who poll later can receive game info
PLAYER_GAME_MAP = {}

# --- Player activity timeout ---
PLAYER_TIMEOUT_SECONDS = 30

app = FastAPI()

# Allow all origins for simple local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve BGM static files placed in project-root /bgm directory at /bgm/<filename>
# HERE is backend/src, go two levels up to reach repository root
bgm_dir = os.path.abspath(os.path.join(HERE, '..', '..', 'bgm'))
try:
    if os.path.isdir(bgm_dir):
        app.mount('/bgm', StaticFiles(directory=bgm_dir), name='bgm')
        print(f"Serving BGM files from: {bgm_dir}")
    else:
        print(f"BGM directory not found at {bgm_dir}; create a 'bgm' folder at repo root with mp3 files to enable /bgm")
except Exception as e:
    print(f"Failed to mount /bgm static files: {e}")

# --- Mount Frontend ---
# Serve the frontend directory as static files.
# The `html=True` argument makes it serve `index.html` for root requests.
frontend_dir = os.path.abspath(os.path.join(HERE, '..', '..', 'frontend'))
try:
    if os.path.isdir(frontend_dir):
        app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
        print(f"Serving frontend from: {frontend_dir}")
    else:
        print(f"Frontend directory not found at {frontend_dir}. Cannot serve frontend.")
except Exception as e:
    print(f"Failed to mount frontend static files: {e}")



def cleanup_inactive_players():
    now = time.time()
    inactive_players = [pid for pid, pdata in PLAYERS.items() if now - pdata.get('last_seen', 0) > PLAYER_TIMEOUT_SECONDS]
    
    if not inactive_players:
        return

    print(f"Cleaning up inactive players: {inactive_players}")
    for pid in inactive_players:
        PLAYERS.pop(pid, None)
        # remove from any rule waiting lists
        for rule, lst in list(WAITING_BY_RULE.items()):
            newlst = [e for e in lst if e.get('player_id') != pid]
            if not newlst:
                WAITING_BY_RULE.pop(rule, None)
            else:
                WAITING_BY_RULE[rule] = newlst
        for room_id, room_data in list(ROOMS.items()):
            if pid in room_data['players']:
                room_data['players'].remove(pid)
                if not room_data['players']:
                    ROOMS.pop(room_id, None)
                    print(f"Cleaned up empty room: {room_id}")

LMSTUDIO_API_URL = os.getenv("LMSTUDIO_API_URL", "http://host.docker.internal:1234/v1/chat/completions")

# Scores persistence file (keeps top scores across restarts)
SCORES_FILE = os.path.join(HERE, 'data', 'scores.json')
try:
    if os.path.isfile(SCORES_FILE):
        with open(SCORES_FILE, 'r', encoding='utf-8') as sf:
            stored = json.load(sf)
            # basic validation
            if isinstance(stored, dict):
                SCORES = stored
            else:
                print('scores.json content invalid, starting fresh')
except Exception as e:
    print(f'Could not load scores from {SCORES_FILE}: {e}')

class QuestionRequest(BaseModel):
    question: str
    target_answer: str
    lm_server: Optional[str] = None


class ProbeRequest(BaseModel):
    lm_server: str

@app.post("/ask_ai")
async def ask_ai(request: QuestionRequest):
    # Input validation to prevent obfuscation-based prompt attacks and disallowed topics
    def is_obfuscated(text: str) -> bool:
        if not text or len(text.strip()) == 0:
            return True
        sep_pattern = r'[\+＋\-\|・/\\_\s]+'
        cjk = r'[\u4E00-\u9FFF\u3040-\u30FF]'
        pattern = re.compile(cjk + sep_pattern + cjk)
        if pattern.search(text):
            clean = re.sub(sep_pattern, '', text)
            if len(clean) <= 10:
                return True
        punct_count = len(re.findall(r'[^\w\s\u4E00-\u9FFF\u3040-\u30FF]', text))
        if punct_count > max(3, len(text) // 10):
            return True
        return False

    DANGEROUS_KEYWORDS = ['爆弾', '毒', '殺す', '自殺', '違法', 'ハッキング', 'パスワード']
    def contains_dangerous(text: str) -> bool:
        low = (text or '').lower()
        for k in DANGEROUS_KEYWORDS:
            if k in low:
                return True
        return False

    qtxt = request.question or ''
    if is_obfuscated(qtxt):
        return {"ai_response": "", "valid": False, "is_correct": False, "invalid_reason": "input_looks_obfuscated", "invalid_message": "入力が難読化されているようです。普通の日本語で再入力してください。"}
    if contains_dangerous(qtxt):
        return {"ai_response": "", "valid": False, "is_correct": False, "invalid_reason": "disallowed_content", "invalid_message": "危険または違法な行為を示唆する内容には回答できません。"}
    # Instruct the model to return a JSON object only with the following schema:
    # {"answer": "...", "reasoning": "...", "valid": true|false, "invalid_reason": "..."}
    # "valid" should be false when the question is invalid (contains the answer, is off-topic, or requests disallowed content).
    system_instruction = (
        "あなたはクイズの検証付き回答者です。必ず以下のJSON形式だけで出力してください。"
        "\n{\"answer\": \"...\", \"reasoning\": \"...\", \"valid\": true, \"invalid_reason\": \"...\"}"
        "\n- `answer`: 直接の答え（短く）"
        "\n- `reasoning`: どのように答えに到達したか簡潔に説明"
        "\n- `valid`: trueなら有効なクイズ、falseなら不正や無効な入力"
        "\n- `invalid_reason`: validがfalseの場合は理由を日本語で記載"
        "\n【重要なルール】"
        "\n- ここでは、「質問文・問題分・説明文」から単語を回答してもらいます。「単語」から答えを連想させる(ほんのうじノ変→本能寺の変)のは不正です。"
        "\n- 問題文や回答において、問題の単語をそのまま返答や表記ゆれ（例: ひらがな・カタカナ・分割・当て字・意図的な誤字・類似音・記号混ぜ・英語表記・ローマ字・略語・隠語・俗称・伏せ字・一部だけの記載・分割記載など）を使って本来の答えを直接または間接的に誘導する入力はすべて不正です。"
        "\n- 例:『鎌倉ばくふ』『織田おぶなが』『本能寺ノ変』『たいか＋の＋かいしん』『おだ・のぶなが』『ほんのうじのへん』『Tokugawa』『bakuhu』『Oda Nobunaga』『Honnouji』など、正答をひらがな・カタカナ・ローマ字・分割・記号・当て字・略語・隠語・俗称・一部のみ・伏せ字・誤字等で表現したものも全て不正です。"
        "\n- これらの不正入力やルール違反があった場合は、必ず `valid`: false とし、`invalid_reason` に「表記ゆれや難読化・不正入力」など理由を日本語で明記してください。"
        "\n- 危険・違法な行為や倫理的に不適切な内容も同様に `valid`: false で理由を明記してください。"
    )
    payload = {
        "model": "local-model",
        "messages": [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": request.question}
        ],
    "temperature": 0.2,
    "max_tokens": 800,
    }

    ai_response_text = ""
    try:
        # determine LMStudio URL: prefer the one provided by the client, otherwise use env/default
        target_lm_url = request.lm_server or LMSTUDIO_API_URL
        # normalize: if caller gave base URL without path, append the common LMStudio path
        if 'v1' not in target_lm_url:
            target_lm_url = target_lm_url.rstrip('/') + '/v1/chat/completions'
        print(f"Using LMStudio URL: {target_lm_url}")
        response = requests.post(target_lm_url, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        raw = data['choices'][0]['message']['content']
        # try to parse JSON from model output
        try:
            parsed = json.loads(raw)
            ai_response_text = parsed.get('answer', '')
            reasoning = parsed.get('reasoning')
            valid = parsed.get('valid', True)
            invalid_reason = parsed.get('invalid_reason')
            # valid: false の場合は必ず is_correct: false を返す
            if valid is False:
                return {"ai_response": ai_response_text, "reasoning": reasoning, "valid": False, "is_correct": False, "invalid_reason": invalid_reason}
            return {"ai_response": ai_response_text, "reasoning": reasoning, "valid": valid, "invalid_reason": invalid_reason}
        except Exception as ex:
            print(f"Failed to parse model JSON output: {ex}\nraw:{raw}")
            ai_response_text = raw
    except requests.exceptions.RequestException as e:
        print(f"LMStudio connection error: {e}")
        ai_response_text = "AIサーバー（LMStudio）に接続できません。起動しているか確認してください。"
    except Exception as e:
        print(f"Unknown server error: {e}")
        ai_response_text = "サーバー内部で不明なエラーが発生しました。"

    return {"ai_response": ai_response_text}

@app.get("/")
def read_root():
    return {"message": "Rush-Maximizer server is running."}


@app.get('/status')
def status():
    return {"server_id": SERVER_ID, "questions_count": len(ALL_QUESTIONS)}


@app.post('/probe_lm')
def probe_lm(req: ProbeRequest):
    url = req.lm_server
    try:
        target = url.rstrip('/')
        # try a common endpoint; if not available, at least attempt base URL
        test_urls = [target + '/v1/models', target + '/v1/chat/completions', target]
        last_err = None
        for t in test_urls:
            try:
                r = requests.get(t, timeout=5)
                if r.status_code >= 200 and r.status_code < 500:
                    return { 'ok': True, 'checked': t }
            except Exception as e:
                last_err = str(e)
        return { 'ok': False, 'error': last_err }
    except Exception as e:
        return { 'ok': False, 'error': str(e) }


class RegisterRequest(BaseModel):
    nickname: str


@app.post('/register')
def register(req: RegisterRequest):
    pid = str(uuid.uuid4())
    token = uuid.uuid4().hex
    PLAYERS[pid] = { 'nickname': req.nickname, 'last_seen': time.time(), 'session_token': token }
    print(f"player registered: {pid} -> {req.nickname} (token={token[:8]})")
    return { 'player_id': pid, 'session_token': token }

class HeartbeatRequest(BaseModel):
    player_id: Optional[str] = None
    session_token: Optional[str] = None

@app.post('/heartbeat')
def heartbeat(req: HeartbeatRequest):
    pid = resolve_player(req.player_id, req.session_token)
    if pid:
        PLAYERS[pid]['last_seen'] = time.time()
        return { 'ok': True }
    return { 'ok': False, 'error': 'unknown_player' }


class JoinLobbyRequest(BaseModel):
    player_id: str
    rule: Optional[str] = None
    session_token: Optional[str] = None


@app.post('/lobby/join')
def lobby_join(req: JoinLobbyRequest):
    cleanup_inactive_players()
    pid = resolve_player(req.player_id, req.session_token)
    if not pid:
        return { 'error': 'unknown_player' }
    # If a game was already created for this player, return it immediately
    pending_gid = PLAYER_GAME_MAP.get(pid)
    if pending_gid:
        g = GAMES.get(pending_gid)
        if g:
            # deliver pending game and clear mapping for this player
            PLAYER_GAME_MAP.pop(pid, None)
            return { 'game_id': pending_gid, 'players': g.get('players', []), 'questions': g.get('questions', []), 'rule': g.get('rule') }
    rule = req.rule or 'classic'
    lst = WAITING_BY_RULE.setdefault(rule, [])
    # prevent duplicate entry for this player in any rule
    for r, entries in WAITING_BY_RULE.items():
        if any(e.get('player_id') == pid for e in entries):
            return { 'waiting': True, 'position': next((i+1 for i,e in enumerate(entries) if e.get('player_id')==pid), 0), 'total_waiting': len(entries), 'info': f'already_waiting_in_{r}'}
    # also prevent if player is already inside a room
    for room in ROOMS.values():
        if pid in room.get('players', []):
            return { 'waiting': True, 'position': 0, 'total_waiting': len(lst), 'info': 'in_room' }

    entry = {'player_id': pid, 'joined_at': time.time()}
    lst.append(entry)
    print(f"player {pid} in lobby for rule={rule}, total waiting: {len(lst)}")

    # Create games as long as there are enough players for this rule
    while len(lst) >= MIN_PLAYERS:
        lst.sort(key=lambda e: e.get('joined_at', 0))
        chosen = lst[:MIN_PLAYERS]
        players_for_game = [e.get('player_id') for e in chosen]
        # remove chosen from list
        WAITING_BY_RULE[rule] = lst[MIN_PLAYERS:]
        gid = str(uuid.uuid4())
        qcount = DEFAULT_QUESTIONS_PER_GAME
        if rule == 'speed':
            qcount = 5
        elif rule == 'challenge':
            qcount = 15

        qcount = min(len(ALL_QUESTIONS), qcount)
        sampled = random.sample(ALL_QUESTIONS, qcount) if qcount > 0 else []
        random.shuffle(sampled)
        sanitized = [{'id': q.get('id'), 'prompt': (q.get('question') or q.get('prompt') or q.get('q') or q.get('text') or str(q.get('id')))} for q in sampled]
        
        GAMES[gid] = { 'players': players_for_game, 'questions': sanitized, 'pointer': 0, 'rule': rule }
        print(f"created game {gid} for players {players_for_game} with rule {rule} and {len(sanitized)} questions")

        # record pending game for each chosen player so they receive it on next poll
        for p in players_for_game:
            PLAYER_GAME_MAP[p] = gid

        # For players in the new game, check if they were the one polling
        if pid in players_for_game:
            return { 'game_id': gid, 'players': players_for_game, 'questions': sanitized, 'rule': rule }

    # If the player is still in the waiting list for this rule, return their position
    for i, e in enumerate(WAITING_BY_RULE.get(rule, [])):
        if e.get('player_id') == pid:
            return { 'waiting': True, 'position': i + 1, 'total_waiting': len(WAITING_BY_RULE.get(rule, [])) }
    # This can happen if the player was just put into a game by another player's poll
    return { 'status': 'game_created_by_other' }

class LobbyLeaveRequest(BaseModel):
    player_id: Optional[str] = None
    session_token: Optional[str] = None

@app.post('/lobby/leave')
def lobby_leave(req: LobbyLeaveRequest):
    pid = resolve_player(req.player_id, req.session_token)
    if not pid:
        return { 'ok': False, 'error': 'unknown_player' }
    removed = False
    for rule, lst in list(WAITING_BY_RULE.items()):
        newlst = [e for e in lst if e.get('player_id') != pid]
        if len(newlst) != len(lst):
            removed = True
            if newlst:
                WAITING_BY_RULE[rule] = newlst
            else:
                WAITING_BY_RULE.pop(rule, None)
    if removed:
        print(f"Player {pid} left the lobby.")
        return { 'ok': True }
    return { 'ok': False, 'error': 'player_not_in_lobby' }


@app.get('/game/{game_id}/question')
def game_question(game_id: str, player_id: str):
    g = GAMES.get(game_id)
    if not g:
        return { 'error': 'unknown_game' }
    # deliver next unused question for the game
    ptr = g.get('pointer', 0)
    if ptr >= len(g['questions']):
        return { 'finished': True }
    q = g['questions'][ptr]
    # increment pointer so same question won't be reused in this game
    g['pointer'] = ptr + 1
    # send prompt only (no answer)
    prompt = q.get('question') or q.get('prompt') or q.get('q') or q.get('text') or q.get('id')
    # build safe object
    return { 'question_id': q.get('id') or ptr, 'prompt': prompt }


@app.get('/solo/question')
def solo_question():
    # return a random question prompt (no answer)
    if not ALL_QUESTIONS:
        return { 'error': 'no_questions' }
    q = random.choice(ALL_QUESTIONS)
    prompt = q.get('question') or q.get('prompt') or q.get('q') or q.get('text') or q.get('id')
    return { 'question_id': q.get('id'), 'prompt': prompt }


@app.get('/solo/questions')
def solo_questions(n: int = 10):
    # return n random sanitized questions
    if not ALL_QUESTIONS:
        return { 'error': 'no_questions' }
    count = max(1, min(len(ALL_QUESTIONS), n))
    sampled = random.sample(ALL_QUESTIONS, count)
    sanitized = []
    for q in sampled:
        prompt = q.get('question') or q.get('prompt') or q.get('q') or q.get('text') or str(q.get('id'))
        # include answer(s) for solo mode so client can validate locally
        answers = q.get('answers') or ([q.get('answer')] if q.get('answer') else [])
        sanitized.append({'id': q.get('id'), 'prompt': prompt, 'answers': answers, 'answer': answers[0] if answers else None})
    return {'questions': sanitized}


class RoomCreateRequest(BaseModel):
    player_id: Optional[str] = None
    session_token: Optional[str] = None
    name: Optional[str] = None
    password: Optional[str] = None
    max_players: Optional[int] = 3
    rule: Optional[str] = 'classic'


class RoomJoinRequest(BaseModel):
    player_id: Optional[str] = None
    session_token: Optional[str] = None
    room_id: str
    password: Optional[str] = None


@app.post('/room/create')
def room_create(req: RoomCreateRequest):
    pid = resolve_player(req.player_id, req.session_token)
    if not pid:
        return {'error': 'unknown_player'}
    rid = str(uuid.uuid4())
    ROOMS[rid] = {
        'name': req.name or f"room-{rid[:6]}",
        'password': req.password,
        'max_players': max(1, int(req.max_players or 3)),
        'rule': req.rule or 'classic',
        'players': [pid],
        'creator': pid
    }
    print(f"room created {rid} by {pid}: {ROOMS[rid]}")
    return {'room_id': rid, 'room': ROOMS[rid]}


@app.post('/room/join')
def room_join(req: RoomJoinRequest):
    pid = resolve_player(req.player_id, req.session_token)
    if not pid:
        return {'error': 'unknown_player'}
    # If a game was already created for this player (e.g., room filled by another poll), return it
    pending_gid = PLAYER_GAME_MAP.get(pid)
    if pending_gid:
        g = GAMES.get(pending_gid)
        if g:
            PLAYER_GAME_MAP.pop(pid, None)
            return { 'game_id': pending_gid, 'players': g.get('players', []), 'questions': g.get('questions', []), 'rule': g.get('rule') }
    room = ROOMS.get(req.room_id)
    if not room:
        return {'error': 'unknown_room'}
    if room.get('password'):
        if not req.password or req.password != room.get('password'):
            return {'error': 'bad_password'}
    # Return current room state if player is already in it or just successfully joined
    if pid not in room['players']:
        if len(room['players']) >= room['max_players']:
            return {'error': 'room_full'}
        room['players'].append(pid)
    
    print(f"player {pid} is in room {req.room_id} ({len(room['players'])}/{room['max_players']})")

    # Check if the room is now full and should start a game
    if len(room['players']) >= room['max_players']:
        players_for_game = room['players'][:room['max_players']]
        gid = str(uuid.uuid4())
        rule = room.get('rule', 'classic')
        qcount = DEFAULT_QUESTIONS_PER_GAME
        if rule == 'speed':
            qcount = 5
        elif rule == 'challenge':
            qcount = 15
        
        qcount = min(len(ALL_QUESTIONS), qcount)
        sampled = random.sample(ALL_QUESTIONS, qcount) if qcount > 0 else []
        random.shuffle(sampled)
        sanitized = [{'id': q.get('id'), 'prompt': (q.get('question') or q.get('prompt') or q.get('q') or q.get('text') or str(q.get('id')))} for q in sampled]
        
        GAMES[gid] = {'players': players_for_game, 'questions': sanitized, 'pointer': 0, 'room': req.room_id, 'rule': rule}
        print(f"created game {gid} from room {req.room_id} for players {players_for_game}")
        # Record pending game for each player
        for p in players_for_game:
            PLAYER_GAME_MAP[p] = gid
        ROOMS.pop(req.room_id, None) # Clean up room
        return {'game_id': gid, 'players': players_for_game, 'questions': sanitized}

    # Not full yet, return waiting status
    return {
        'waiting': True, 
        'room_id': req.room_id,
        'current_players': len(room['players']),
        'max_players': room['max_players']
    }


@app.get('/server/stats')
def server_stats():
    return {
        'active_players': len(PLAYERS),
    'players_waiting_random': sum(len(v) for v in WAITING_BY_RULE.values()),
        'active_games': len(GAMES),
        'active_rooms': len(ROOMS)
    }


class ScoreSubmit(BaseModel):
    player_id: str
    mode: str
    correct_count: Optional[int] = None
    total_questions: Optional[int] = None
    time_seconds: Optional[int] = None
    client_raw_score: Optional[int] = None
    session_token: Optional[str] = None


@app.post('/scores/submit')
def submit_score(s: ScoreSubmit):
    # Validate player via session_token if provided
    pid = resolve_player(s.player_id, s.session_token)
    if not pid:
        return { 'ok': False, 'error': 'unknown_player' }
    nickname = PLAYERS.get(pid, {}).get('nickname', '匿名')

    # Compute canonical score depending on mode
    mode = s.mode or 'solo'
    canonical = 0
    meta = {}
    if mode == 'rta':
        # RTA: prioritize speed, then accuracy
        correct = int(s.correct_count or 0)
        total = int(s.total_questions or max(1, correct))
        time_sec = float(s.time_seconds or 0.0)
        accuracy = correct / total if total > 0 else 0.0
        # base from accuracy (0-1000)
        base = int(accuracy * 1000)
        # time bonus: faster => higher bonus; normalize with an expected time per question
        expected_per_q = 5.0  # seconds per question baseline
        expected_time = expected_per_q * total
        if time_sec <= 0:
            time_bonus = 0
        else:
            ratio = expected_time / time_sec
            time_bonus = int(max(0, min(ratio, 5.0)) * 200)  # cap multiplier
        canonical = base + time_bonus
        meta = {'correct': correct, 'total': total, 'time': time_sec, 'base': base, 'time_bonus': time_bonus}
    else:
        # solo/practice/classic: accuracy weighted + per-correct points minus penalty
        correct = int(s.correct_count or 0)
        total = int(s.total_questions or max(1, correct))
        wrong = max(0, (s.total_questions or total) - correct)
        accuracy = correct / total if total > 0 else 0.0
        canonical = correct * 100 - wrong * 10 + int(accuracy * 50)
        meta = {'correct': correct, 'total': total, 'wrong': wrong, 'accuracy': accuracy}

    rec = { 'player': nickname, 'score': canonical, 'time': s.time_seconds, 'meta': meta }
    SCORES.setdefault(mode, []).append(rec)
    # persist scores to disk (best-effort)
    try:
        with open(SCORES_FILE, 'w', encoding='utf-8') as sf:
            json.dump(SCORES, sf, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f'Warning: failed to persist scores to {SCORES_FILE}: {e}')

    print(f"score submitted: player={pid} mode={mode} canonical={canonical} meta={meta}")
    return { 'ok': True, 'canonical_score': canonical }


@app.get('/scores/all')
def scores_all():
    # return full scores object for client-side ranking display
    return { 'scores': SCORES }


@app.get('/scores/top')
def top_scores(mode: str = 'solo'):
    lst = SCORES.get(mode, [])
    sorted_list = sorted(lst, key=lambda x: x.get('score',0), reverse=True)[:10]
    return { 'top': sorted_list }
