# -*- coding: utf-8 -*-
import os
import json
import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uuid
import random

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
WAITING_LIST = []  # list of player_ids
PLAYERS = {}  # player_id -> { nickname }
GAMES = {}  # game_id -> { players: [player_id], questions: [q], pointer: int }
MIN_PLAYERS = 3
SCORES = {'solo': [], 'rta': []}  # list of { player, score, time }
DEFAULT_QUESTIONS_PER_GAME = int(os.getenv('QUESTIONS_PER_GAME', '10'))
ROOMS = {}  # room_id -> { name, password, max_players, rule, players: [player_id], creator }

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LMSTUDIO_API_URL = os.getenv("LMSTUDIO_API_URL", "http://host.docker.internal:1234/v1/chat/completions")

class QuestionRequest(BaseModel):
    question: str
    target_answer: str
    lm_server: Optional[str] = None


class ProbeRequest(BaseModel):
    lm_server: str

@app.post("/ask_ai")
async def ask_ai(request: QuestionRequest):
    # Instruct the model to return a JSON object only with the following schema:
    # {"answer": "...", "reasoning": "...", "valid": true|false, "invalid_reason": "..."}
    # "valid" should be false when the question is invalid (contains the answer, is off-topic, or requests disallowed content).
    system_instruction = (
        "/no-think,あなたは検証付きのクイズの回答者です。必ず JSON だけを以下の形式で出力してください。"
        "\n{\"answer\": \"...\", \"reasoning\": \"...\", \"valid\": true, \"invalid_reason\": \"...\"}"
        "\n- `answer`: 直接の答え（短く）\n- `reasoning`: どのように答えに到達したか簡潔に説明\n- `valid`: この応答が知識に則っているか/意味ではなく単語で誘導してないか\n        "
    )
    payload = {
        "model": "local-model",
        "messages": [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": request.question}
        ],
        "temperature": 0.2,
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
    PLAYERS[pid] = { 'nickname': req.nickname }
    print(f"player registered: {pid} -> {req.nickname}")
    return { 'player_id': pid }


class JoinLobbyRequest(BaseModel):
    player_id: str
    rule: Optional[str] = None


@app.post('/lobby/join')
def lobby_join(req: JoinLobbyRequest):
    pid = req.player_id
    if pid not in PLAYERS:
        return { 'error': 'unknown_player' }
    if pid in WAITING_LIST:
        # already waiting, return position
        return { 'waiting': True, 'position': WAITING_LIST.index(pid) + 1 }
    WAITING_LIST.append(pid)
    print(f"player {pid} joined lobby, total waiting: {len(WAITING_LIST)}")
    # simple matchmaking: when enough players, pop first N and create a game
    if len(WAITING_LIST) >= MIN_PLAYERS:
        players_for_game = [WAITING_LIST.pop(0) for _ in range(MIN_PLAYERS)]
        gid = str(uuid.uuid4())
        # determine rule (from request if provided, else default)
        rule = req.rule or 'classic'
        # decide question count by rule
        if rule == 'speed':
            qcount = min(len(ALL_QUESTIONS), 5)
        elif rule == 'challenge':
            qcount = min(len(ALL_QUESTIONS), max(10, DEFAULT_QUESTIONS_PER_GAME + 5))
        else:
            qcount = min(len(ALL_QUESTIONS), DEFAULT_QUESTIONS_PER_GAME)
        sampled = random.sample(ALL_QUESTIONS, qcount) if qcount > 0 else []
        random.shuffle(sampled)
        sanitized = []
        # sanitize (remove answers) for multiplayer
        for q in sampled:
            prompt = q.get('question') or q.get('prompt') or q.get('q') or q.get('text') or str(q.get('id'))
            sanitized.append({'id': q.get('id'), 'prompt': prompt})
        GAMES[gid] = { 'players': players_for_game, 'questions': sanitized, 'pointer': 0, 'rule': rule }
        print(f"created game {gid} for players {players_for_game} with rule {rule} and {len(sanitized)} questions")
        return { 'game_id': gid, 'players': players_for_game, 'questions': sanitized, 'rule': rule }

    return { 'waiting': True, 'position': len(WAITING_LIST) }


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
    player_id: str
    name: Optional[str] = None
    password: Optional[str] = None
    max_players: Optional[int] = 3
    rule: Optional[str] = 'classic'


class RoomJoinRequest(BaseModel):
    player_id: str
    room_id: str
    password: Optional[str] = None


@app.post('/room/create')
def room_create(req: RoomCreateRequest):
    if req.player_id not in PLAYERS:
        return {'error': 'unknown_player'}
    rid = str(uuid.uuid4())
    ROOMS[rid] = {
        'name': req.name or f"room-{rid[:6]}",
        'password': req.password,
        'max_players': max(1, int(req.max_players or 3)),
        'rule': req.rule or 'classic',
        'players': [req.player_id],
        'creator': req.player_id
    }
    print(f"room created {rid} by {req.player_id}: {ROOMS[rid]}")
    return {'room_id': rid, 'room': ROOMS[rid]}


@app.post('/room/join')
def room_join(req: RoomJoinRequest):
    if req.player_id not in PLAYERS:
        return {'error': 'unknown_player'}
    room = ROOMS.get(req.room_id)
    if not room:
        return {'error': 'unknown_room'}
    if room.get('password'):
        if not req.password or req.password != room.get('password'):
            return {'error': 'bad_password'}
    # Return current room state if player is already in it or just successfully joined
    if req.player_id not in room['players']:
        if len(room['players']) >= room['max_players']:
            return {'error': 'room_full'}
        room['players'].append(req.player_id)
    
    print(f"player {req.player_id} is in room {req.room_id} ({len(room['players'])}/{room['max_players']})")

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
        'players_waiting_random': len(WAITING_LIST),
        'active_games': len(GAMES),
        'active_rooms': len(ROOMS)
    }


class ScoreSubmit(BaseModel):
    player_id: str
    mode: str
    score: int
    time_seconds: Optional[int] = None


@app.post('/scores/submit')
def submit_score(s: ScoreSubmit):
    rec = { 'player': PLAYERS.get(s.player_id, {}).get('nickname','匿名'), 'score': s.score, 'time': s.time_seconds }
    SCORES.setdefault(s.mode, []).append(rec)
    return { 'ok': True }


@app.get('/scores/top')
def top_scores(mode: str = 'solo'):
    lst = SCORES.get(mode, [])
    sorted_list = sorted(lst, key=lambda x: x.get('score',0), reverse=True)[:10]
    return { 'top': sorted_list }
