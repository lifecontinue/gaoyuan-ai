"""Decode final MP3s and inspect duration, loudness and wraparound samples."""
from pathlib import Path
import subprocess, json
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
report=[]
for track in json.loads((ROOT/'public/assets/music/credits.json').read_text()):
    path=ROOT/'public/assets/music'/f"{track['scene']}.mp3"
    raw=subprocess.run(['ffmpeg','-v','error','-i',str(path),'-f','f32le','-ac','2','-ar','44100','pipe:1'],check=True,capture_output=True).stdout
    samples=np.frombuffer(raw,dtype='<f4').reshape(-1,2)
    duration=len(samples)/44100
    jump=float(np.max(np.abs(samples[-1]-samples[0])))
    rms=float(np.sqrt(np.mean(np.concatenate([samples[-441:],samples[:441]])**2)))
    stderr=subprocess.run(['ffmpeg','-hide_banner','-i',str(path),'-af','loudnorm=I=-23:TP=-3:print_format=json','-f','null','-'],check=True,capture_output=True).stderr.decode()
    measured,_=json.JSONDecoder().raw_decode(stderr[stderr.rindex('{'):])
    assert abs(duration-track['loopSeconds'])<.05,(path,duration)
    assert jump<.02,(path,jump)
    assert rms>.00001,(path,rms)
    assert -24<float(measured['input_i'])<-22,(path,measured)
    assert float(measured['input_tp'])<-2.5,(path,measured)
    report.append(dict(scene=track['scene'],duration=round(duration,3),LUFS=measured['input_i'],truePeak=measured['input_tp'],seamJump=round(jump,6),seamRMS=round(rms,6)))
(ROOT/'qa/music-file-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
