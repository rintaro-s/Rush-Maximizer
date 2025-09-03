#!/usr/bin/env python3
"""
Vosk-based voice recognition server for Japanese speech-to-text
Fast and accurate Japanese speech recognition using Vosk offline models
"""

import os
import json
import logging
import base64
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import vosk
import wave
import io
import numpy as np
from scipy.io import wavfile
import soundfile as sf

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Global model variable
model = None

def load_model():
    """Load Vosk Japanese model"""
    global model
    model_path = "/app/models/vosk-model-small-ja-0.22"

    if not os.path.exists(model_path):
        logger.error(f"Model path {model_path} does not exist")
        return False

    try:
        logger.info("Loading Vosk Japanese model...")
        model = vosk.Model(model_path)
        logger.info("Model loaded successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        return False

def convert_audio_to_wav(audio_data, sample_rate=16000):
    """Convert audio data to WAV format required by Vosk"""
    try:
        # Validate input data
        if audio_data is None:
            logger.error("Audio data is None")
            return None

        if isinstance(audio_data, bytes) and len(audio_data) == 0:
            logger.error("Audio data is empty bytes")
            return None

        if not isinstance(audio_data, bytes) and len(audio_data) == 0:
            logger.error("Audio data array is empty")
            return None

        # Convert to numpy array if needed
        if isinstance(audio_data, bytes):
            # Assume 16-bit PCM
            if len(audio_data) < 2:
                logger.error(f"Audio data too small: {len(audio_data)} bytes")
                return None
            audio_np = np.frombuffer(audio_data, dtype=np.int16)
        else:
            audio_np = np.array(audio_data, dtype=np.int16)

        # Validate buffer size
        if len(audio_np) == 0:
            logger.error("Converted audio array is empty")
            return None

        if len(audio_np) < 100:  # Minimum viable audio chunk
            logger.warning(f"Audio buffer very small: {len(audio_np)} samples")
            # Pad with silence if too small
            silence = np.zeros(100 - len(audio_np), dtype=np.int16)
            audio_np = np.concatenate([audio_np, silence])

        # Convert to float32 and normalize
        audio_float = audio_np.astype(np.float32) / 32768.0

        # Resample if necessary (Vosk expects 16kHz)
        if sample_rate != 16000:
            # Simple resampling (in production, use better resampling)
            ratio = 16000 / sample_rate
            new_length = int(len(audio_float) * ratio)
            if new_length <= 0:
                logger.error(f"Invalid resampled length: {new_length}")
                return None
            indices = np.linspace(0, len(audio_float) - 1, new_length)
            audio_float = np.interp(indices, np.arange(len(audio_float)), audio_float)

        # Convert back to 16-bit PCM
        audio_16bit = (audio_float * 32767).astype(np.int16)

        # Create WAV buffer
        wav_buffer = io.BytesIO()
        sf.write(wav_buffer, audio_16bit, 16000, format='WAV')
        wav_buffer.seek(0)

        return wav_buffer.getvalue()

    except Exception as e:
        logger.error(f"Audio conversion error: {e}")
        return None

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None
    })

@app.route('/recognize', methods=['POST'])
def recognize_speech():
    """Speech recognition endpoint"""
    try:
        if model is None:
            return jsonify({
                'error': 'Model not loaded',
                'success': False
            }), 500

        # Get audio data from request
        if 'audio' not in request.files:
            return jsonify({
                'error': 'No audio file provided',
                'success': False
            }), 400

        audio_file = request.files['audio']
        audio_data = audio_file.read()

        if len(audio_data) == 0:
            return jsonify({
                'error': 'Empty audio file',
                'success': False
            }), 400

        # Validate minimum audio size (at least 0.1 seconds at 16kHz 16-bit = 3200 bytes)
        if len(audio_data) < 3200:
            logger.warning(f"Audio file too small: {len(audio_data)} bytes")
            return jsonify({
                'error': 'Audio file too small (minimum 0.1 seconds required)',
                'success': False
            }), 400

        # Convert audio to WAV format
        wav_data = convert_audio_to_wav(audio_data)
        if wav_data is None:
            return jsonify({
                'error': 'Audio conversion failed',
                'success': False
            }), 400

        # Validate WAV data size
        if len(wav_data) < 100:
            return jsonify({
                'error': 'Converted audio too small',
                'success': False
            }), 400

        # Create recognizer
        rec = vosk.KaldiRecognizer(model, 16000)

        # Process audio
        rec.AcceptWaveform(wav_data)

        # Get result
        result = json.loads(rec.Result())

        text = result.get('text', '').strip()

        logger.info(f"Recognition result: '{text}'")

        return jsonify({
            'success': True,
            'text': text,
            'confidence': result.get('confidence', 0.0)
        })

    except Exception as e:
        logger.error(f"Recognition error: {e}")
        return jsonify({
            'error': str(e),
            'success': False
        }), 500

@app.route('/recognize/stream', methods=['POST'])
def recognize_stream():
    """Streaming speech recognition endpoint"""
    try:
        if model is None:
            return jsonify({
                'error': 'Model not loaded',
                'success': False
            }), 500

        # Get audio data from request
        audio_data = request.get_data()

        if len(audio_data) == 0:
            return jsonify({
                'error': 'No audio data provided',
                'success': False
            }), 400

        # Validate minimum audio size for streaming
        if len(audio_data) < 1000:  # Smaller threshold for streaming chunks
            logger.warning(f"Streaming audio chunk too small: {len(audio_data)} bytes")
            return jsonify({
                'error': 'Audio chunk too small',
                'success': False
            }), 400

        # Convert audio to WAV format for consistent processing
        wav_data = convert_audio_to_wav(audio_data)
        if wav_data is None:
            return jsonify({
                'error': 'Audio conversion failed',
                'success': False
            }), 400

        # Create recognizer
        rec = vosk.KaldiRecognizer(model, 16000)

        # Process audio
        if rec.AcceptWaveform(wav_data):
            result = json.loads(rec.Result())
        else:
            result = json.loads(rec.PartialResult())

        text = result.get('text', '').strip()
        partial = result.get('partial', '').strip()

        return jsonify({
            'success': True,
            'text': text,
            'partial': partial
        })

    except Exception as e:
        logger.error(f"Stream recognition error: {e}")
        return jsonify({
            'error': str(e),
            'success': False
        }), 500

@socketio.on('connect')
def handle_connect():
    """Handle WebSocket connection"""
    logger.info("Client connected")
    emit('status', {'message': 'Connected to voice recognition server'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle WebSocket disconnection"""
    logger.info("Client disconnected")

@socketio.on('start_recognition')
def handle_start_recognition(data):
    """Start real-time speech recognition"""
    try:
        if model is None:
            emit('error', {'message': 'Model not loaded'})
            return

        logger.info("Starting real-time speech recognition")
        emit('recognition_started', {'message': 'Recognition started'})

        # Create recognizer for this session
        rec = vosk.KaldiRecognizer(model, 16000)

    except Exception as e:
        logger.error(f"Failed to start recognition: {e}")
        emit('error', {'message': str(e)})

@socketio.on('audio_data')
def handle_audio_data(data):
    """Process incoming audio data"""
    try:
        if model is None:
            emit('error', {'message': 'Model not loaded'})
            return

        # Decode base64 audio data
        audio_b64 = data.get('audio', '')
        if not audio_b64:
            return

        try:
            audio_data = base64.b64decode(audio_b64)
        except Exception as e:
            logger.error(f"Base64 decode error: {e}")
            emit('error', {'message': 'Invalid audio data format'})
            return

        # Validate audio data size
        if len(audio_data) == 0:
            logger.warning("Received empty audio data")
            return

        if len(audio_data) < 100:  # Very small chunk
            logger.warning(f"Audio chunk too small: {len(audio_data)} bytes")
            return

        # Convert audio to WAV format for consistent processing
        wav_data = convert_audio_to_wav(audio_data)
        if wav_data is None:
            logger.warning("Audio conversion failed for WebSocket data")
            return

        # Create recognizer if not exists (per connection)
        if not hasattr(handle_audio_data, 'recognizer'):
            handle_audio_data.recognizer = vosk.KaldiRecognizer(model, 16000)

        rec = handle_audio_data.recognizer

        # Process audio chunk
        if rec.AcceptWaveform(wav_data):
            result = json.loads(rec.Result())
            text = result.get('text', '').strip()
            if text:
                logger.info(f"Recognized: {text}")
                emit('recognition_result', {
                    'text': text,
                    'is_final': True
                })
        else:
            partial_result = json.loads(rec.PartialResult())
            partial_text = partial_result.get('partial', '').strip()
            if partial_text:
                emit('recognition_result', {
                    'text': partial_text,
                    'is_final': False
                })

    except Exception as e:
        logger.error(f"Audio processing error: {e}")
        emit('error', {'message': str(e)})

@socketio.on('stop_recognition')
def handle_stop_recognition():
    """Stop speech recognition"""
    logger.info("Stopping speech recognition")
    emit('recognition_stopped', {'message': 'Recognition stopped'})

    # Clean up recognizer
    if hasattr(handle_audio_data, 'recognizer'):
        delattr(handle_audio_data, 'recognizer')

if __name__ == '__main__':
    if load_model():
        logger.info("Starting Vosk voice recognition server on port 5000")
        socketio.run(app, host='0.0.0.0', port=5000, debug=False)
    else:
        logger.error("Failed to load model, exiting")
        exit(1)
