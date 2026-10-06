"""Render a connected UI story, synchronized to individual narration beats."""
import argparse
import asyncio
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

import edge_tts
from PIL import Image, ImageDraw
from storyboard import frame, font, W, H, FPS

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'public/media'
CONTENT = json.loads((ROOT/'src/shared/tour-content.json').read_text())
CACHE = Path(os.environ.get('CLASO_NARRATION_CACHE', Path(tempfile.gettempdir())/'claso-narration-cache'))


def run(*args):
    subprocess.run([str(a) for a in args],check=True)


def stamp(seconds):
    ms=round(seconds*1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'


async def narration(text,voice):
    key=hashlib.sha256((voice+'|+0%|'+text).encode()).hexdigest()
    mp3=CACHE/(key+'.mp3')
    timing=CACHE/(key+'.json')
    if not mp3.exists() or not timing.exists():
        boundaries=[]
        staged=mp3.with_suffix('.part')
        try:
            with staged.open('wb') as audio:
                async for item in edge_tts.Communicate(text,voice,rate='+0%',boundary='SentenceBoundary').stream():
                    if item['type']=='audio':audio.write(item['data'])
                    elif item['type']=='SentenceBoundary':
                        boundaries.append({'start':item['offset']/10_000_000,'duration':item['duration']/10_000_000,'text':item['text']})
            if not staged.stat().st_size or not boundaries:raise RuntimeError('Narration or timing is missing')
            staged.replace(mp3)
            timing.write_text(json.dumps(boundaries,ensure_ascii=False))
        finally:
            staged.unlink(missing_ok=True)
    seconds=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(mp3)]))
    return mp3,seconds,json.loads(timing.read_text())


def logo_file(tmp):
    dest=tmp/'logo.png'
    run('ffmpeg','-v','error','-y','-i',ROOT/'public/brand/symbol.svg','-vf','scale=40:40',dest)
    return Image.open(dest).convert('RGBA')


def preview(destination,tmp):
    logo=logo_file(tmp)
    shotlist=[('intro',0,2),('connect',1,3),('publish',2,2),('answer',3,3),('review',4,3),('result',4,2)]
    sheet=Image.new('RGB',(W*2,H*3),'#191c2b')
    data=CONTENT['ar']
    for i,(cue,scene,t) in enumerate(shotlist):
        shot=frame('ar',data['ui'],logo,cue,data['scenes'][scene]['title'],t,7,max(0,scene-1))
        sheet.paste(shot,((i%2)*W,(i//2)*H))
    sheet.save(destination)
    print('Storyboard:',destination,flush=True)


async def generate(locale,data,tmp,captions_only=False):
    logo=None if captions_only else logo_file(tmp)
    timeline=[]
    chapters=[]
    captions=['WEBVTT\n']
    elapsed=0
    waves=[]
    for i,scene in enumerate(data['scenes']):
        if scene['id'] not in ('intro','outro'):
            chapters.append({'id':scene['id'],'title':scene['title'],'start':round(elapsed,3)})
        for beat in scene['beats']:
            mp3,spoken,boundaries=await narration(beat['narration'],data['voice'])
            duration=math.ceil((spoken+.6)*FPS)/FPS
            wave=tmp/(locale+'-'+beat['cue']+'.wav')
            if not captions_only:
                run('ffmpeg','-v','error','-y','-i',mp3,'-af','apad=pad_dur=1','-t',duration,'-ar','24000','-ac','1',wave)
                waves.append(wave)
            for index,boundary in enumerate(boundaries):
                start=elapsed+boundary['start']
                # Provider sentence durations can overlap the next sentence by 50 ms.
                # Retain measured starts and end the preceding cue at the next start.
                next_start=boundaries[index+1]['start'] if index+1<len(boundaries) else spoken
                end=min(elapsed+spoken,start+boundary['duration'],elapsed+next_start)
                if end<=start:raise RuntimeError('Invalid caption boundary')
                captions.append(f'{stamp(start)} --> {stamp(end)}\n{boundary["text"]}\n')
            timeline.append({'cue':beat['cue'],'title':scene['title'],'duration':duration,'chapter':max(0,min(3,i-1)),'start':elapsed})
            elapsed+=duration
    if captions_only:
        existing=json.loads((ROOT/'src/shared/tour-timeline.json').read_text())[locale]
        if existing['duration']!=round(elapsed,3) or existing['chapters']!=chapters:
            raise RuntimeError('Narration timing changed; render the complete film before replacing captions')
        (tmp/f'tour-{locale}.vtt').write_text('\n'.join(captions))
        print(f'{locale}: regenerated captions with unchanged film timing',flush=True)
        return existing
    concat=tmp/(locale+'-audio.txt')
    concat.write_text(''.join(f"file '{p}'\n" for p in waves))
    audio=tmp/(locale+'.wav')
    run('ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',concat,'-c','copy',audio)
    dest=tmp/f'tour-{locale}.mp4'
    command=['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-i',str(audio),'-c:v','libopenh264','-b:v','4000k','-qmin','10','-qmax','18','-g','60','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart','-shortest',str(dest)]
    encoder=subprocess.Popen(command,stdin=subprocess.PIPE)
    previous=None
    try:
        for beat in timeline:
            for tick in range(round(beat['duration']*FPS)):
                t=tick/FPS
                shot=frame(locale,data['ui'],logo,beat['cue'],beat['title'],t,beat['duration'],beat['chapter'],previous)
                if beat['cue']=='publish' and tick==60:
                    shot.save(tmp/f'tour-{locale}-poster.jpg',quality=94)
                encoder.stdin.write(shot.tobytes())
            previous=shot.convert('RGBA')
        encoder.stdin.close()
        if encoder.wait()!=0:raise RuntimeError('MP4 encoder failed')
    except BaseException:
        encoder.kill()
        encoder.wait()
        raise
    run('ffmpeg','-v','error','-y','-i',dest,'-c:v','libvpx-vp9','-b:v','0','-crf','24','-row-mt','1','-cpu-used','5','-c:a','libopus','-b:a','64k',tmp/f'tour-{locale}.webm')
    (tmp/f'tour-{locale}.vtt').write_text('\n'.join(captions))
    revision=hashlib.sha256(dest.read_bytes()).hexdigest()[:12]
    print(f'{locale}: rendered {elapsed:.2f}s, {len(chapters)} chapters, revision {revision}',flush=True)
    return {'duration':round(elapsed,3),'revision':revision,'chapters':chapters}


async def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--preview',type=Path,help='Render a contact sheet without synthesizing narration')
    parser.add_argument('--captions-only',action='store_true',help='Refresh captions only when narration and chapter timing still match the rendered film')
    args=parser.parse_args()
    OUTPUT.mkdir(parents=True,exist_ok=True)
    CACHE.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='claso-story-') as folder:
        tmp=Path(folder)
        if args.preview:
            preview(args.preview,tmp)
            return
        metadata={}
        for locale,data in CONTENT.items():
            metadata[locale]=await generate(locale,data,tmp,args.captions_only)
        # Only publish after all language variants and codecs have rendered successfully.
        for locale in CONTENT:
            for suffix in (['.vtt'] if args.captions_only else ['.mp4','.webm','.vtt','-poster.jpg']):
                name=f'tour-{locale}{suffix}'
                staged=OUTPUT/('.'+name+'.tmp')
                shutil.copyfile(tmp/name,staged)
                staged.chmod(0o644)
                staged.replace(OUTPUT/name)
        if not args.captions_only:
            (ROOT/'src/shared/tour-timeline.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':
    asyncio.run(main())
