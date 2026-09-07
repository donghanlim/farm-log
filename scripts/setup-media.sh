#!/bin/bash
# Mac only. Downloads public CLI dependencies only, never user media or models.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="$ROOT/.local-data/farmer-app-tools"
SWIFTC=/Library/Developer/CommandLineTools/usr/bin/swiftc
SDK=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
UV="$HOME/.local/bin/uv"
FFMPEG=/opt/homebrew/bin/ffmpeg
NODE="${FARMLOG_NODE:-node}"
mkdir -p "$TOOLS"
case "${1:-}" in
  --install-stt)
    echo 'Downloading free public CLI dependencies only. No private user data is sent. No model downloads.'
    if [ ! -x "$TOOLS/venv/bin/python" ]; then
      UV_CACHE_DIR="$TOOLS/uv-cache" "$UV" venv --python /opt/homebrew/bin/python3.14 "$TOOLS/venv"
    fi
    UV_CACHE_DIR="$TOOLS/uv-cache" "$UV" pip install --python "$TOOLS/venv/bin/python" 'mlx-whisper==0.4.3'
    ;;
  --test-stt)
    export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"
    export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1 DO_NOT_TRACK=1
    MODEL="${FARMLOG_WHISPER_MODEL:-$HOME/.cache/huggingface/hub/models--mlx-community--whisper-large-v3-turbo/snapshots/a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb}"
    test -s "$MODEL/weights.safetensors" && test -f "$MODEL/config.json"
    WORK="$(mktemp -d "$TOOLS/stt-test-XXXXXX")"
    /usr/bin/say -v Yuna -o "$WORK/input.aiff" '오늘 삼번 하우스에서 토마토에 물을 삼십 분 주었습니다.'
    "$FFMPEG" -nostdin -v error -i "$WORK/input.aiff" -ac 1 -ar 16000 "$WORK/input.wav"
    # Node wrapper provides a hard timeout to the vendor CLI. No custom Python script.
    "$NODE" --input-type=module - "$TOOLS" "$MODEL" "$WORK" <<'NODE'
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const [tools,model,work]=process.argv.slice(2);
const executable=path.join(tools,'venv/bin/mlx_whisper');
if ((await readFile(path.join(work,'input.wav'))).length < 1000) throw new Error('macOS say produced no usable audio frames');
await promisify(execFile)(executable,[path.join(work,'input.wav'),'--model',model,'--language','ko','--output-format','json','--output-name','transcript','--output-dir',work,'--verbose','False'],{timeout:180000,killSignal:'SIGKILL',maxBuffer:2097152,env:{...process.env,HF_HUB_OFFLINE:'1'}});
const {text}=JSON.parse(await readFile(path.join(work,'transcript.json'),'utf8'));
if(typeof text!=='string'||!text.includes('토마토')) throw new Error('Korean synthetic transcription check failed');
await writeFile(path.join(tools,'stt-ready.json'),JSON.stringify({verified:true,executable,model,testedAt:new Date().toISOString(),text},null,2),{mode:0o600});
console.log(text);
NODE
    ;;
  '')
    "$SWIFTC" -sdk "$SDK" "$ROOT/src/native/vision-ocr.swift" -O -o "$TOOLS/vision-ocr"
    "$TOOLS/vision-ocr" --capabilities
    ;;
  *) echo 'Usage: bash scripts/setup-media.sh [--install-stt|--test-stt]' >&2; exit 2 ;;
esac
