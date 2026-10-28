"""Download attributed music and make beat-length, crossfaded game loops with FFmpeg."""
import hashlib
import json
import subprocess
import numpy as np
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/music'
CACHE = ROOT / 'qa/music-sources'
TRACKS = [
    ('harvest', 'Carefree', 'USUAN1400037', 96, 20),
    ('mail', 'Easy Lemon', 'USUAN1200076', 82, 16 * 60 / 82),
    ('garden', 'Dream Culture', 'USUAN1300046', 70, 16 * 60 / 70),
    ('farm', 'Fretless', 'USUAN1500074', 100, 19.2),
]

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    manifest = []
    for scene, title, isrc, bpm, start in TRACKS:
        url = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/' + quote(title + '.mp3')
        source = CACHE / (scene + '.mp3')
        if not source.exists():
            with urlopen(url, timeout=60) as response:
                source.write_bytes(response.read())
        length = 64 * 60 / bpm
        fade = 0.20
        # Rotate the loop: body from 200ms to the beat-length end, followed by
        # a tail/head blend. Its last sample flows into the body's first sample.
        rate = 44100
        count, overlap = round(length * rate), round(fade * rate)
        decoded = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(start), '-i', str(source),
            '-t', str(length+fade+.1), '-f', 'f32le', '-ac', '2', '-ar', str(rate), 'pipe:1'],
            check=True, capture_output=True).stdout
        samples = np.frombuffer(decoded, dtype='<f4').reshape(-1, 2)
        assert len(samples) >= count + overlap, 'Source is too short'
        ramp = np.linspace(0, 1, overlap, dtype=np.float32)[:, None]
        blend = samples[count:count+overlap] * (1-ramp) + samples[:overlap] * ramp
        pcm = np.concatenate([samples[overlap:count], blend]).astype('<f4').tobytes()
        measurement = subprocess.run(['ffmpeg', '-v', 'info', '-f', 'f32le', '-ar', str(rate),
            '-ac', '2', '-i', 'pipe:0', '-af', 'loudnorm=I=-23:TP=-3:print_format=json',
            '-f', 'null', '-'], input=pcm, capture_output=True, check=True).stderr.decode()
        stats, _ = json.JSONDecoder().raw_decode(measurement[measurement.rindex('{'):])
        gain_db = min(-23-float(stats['input_i']), -3-float(stats['input_tp']))
        destination = OUT / (scene + '.mp3')
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                        '-f', 'f32le', '-ar', str(rate), '-ac', '2', '-i', 'pipe:0',
                        '-af', f'volume={gain_db}dB',
                        '-codec:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1',
                        '-metadata', f'title={title} - edited game loop',
                        '-metadata', 'artist=Kevin MacLeod (incompetech.com)',
                        '-metadata', 'copyright=CC BY 4.0 https://creativecommons.org/licenses/by/4.0/',
                        str(destination)], input=pcm, check=True)
        assert destination.stat().st_size > 100000, 'Encoded loop is unexpectedly short'
        manifest.append(dict(scene=scene, title=title, author='Kevin MacLeod', isrc=isrc,
            source=url, sourcePage=f'https://incompetech.com/music/royalty-free/index.html?isrc={isrc}',
            license='https://creativecommons.org/licenses/by/4.0/', startSeconds=start,
            loopSeconds=length, crossfadeSeconds=fade, targetLUFS=-23,
            edits='Excerpt, wraparound crossfade, loudness normalization, MP3 encoding',
            sha256=hashlib.sha256(destination.read_bytes()).hexdigest()))
        print(f'{scene}: {title}, {length:.2f}s, {destination.stat().st_size} bytes', flush=True)
    (OUT / 'credits.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

if __name__ == '__main__':
    main()
