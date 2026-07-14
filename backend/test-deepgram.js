const WebSocket = require('ws');
require('dotenv').config();
const qs = '?model=nova-2&language=en-US&smart_format=true&punctuate=true&interim_results=true&endpointing=150&encoding=linear16&sample_rate=16000&channels=1&diarize=false';
const ws = new WebSocket(`wss://api.deepgram.com/v1/listen${qs}`, ['token', process.env.DEEPGRAM_API_KEY]);
ws.on('open', () => { console.log('OPENED'); process.exit(0); });
ws.on('unexpected-response', (req, res) => { console.log('UNEXPECTED', res.statusCode); process.exit(1); });
ws.on('error', err => { console.log('ERROR', err); process.exit(1); });
