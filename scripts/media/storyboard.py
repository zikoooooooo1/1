"""Deterministic, localized UI choreography for the narrated product story."""
from functools import lru_cache
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
W, H, FPS = 1280, 720, 30
BG, PAPER, INK = '#191c2b', '#fbfbfe', '#252a3e'
PURPLE, MUTED, LINE = '#5748c8', '#687184', '#e5e7ef'
GREEN = '#267363'

@lru_cache(maxsize=48)
def font(size, bold=False):
    return ImageFont.truetype(str(ROOT / 'assets/film-fonts' / ('IBMPlexSansArabic-SemiBold.ttf' if bold else 'IBMPlexSansArabic-Regular.ttf')), size)

def ease(value):
    v=max(0,min(1,value))
    return 1-(1-v)**3

class Scene:
    def __init__(self, locale, ui, logo):
        self.ar=locale=='ar'
        self.ui=ui
        self.logo=logo
        self.image=Image.new('RGBA',(W,H),BG)
        self.d=ImageDraw.Draw(self.image)

    def box(self,x,y,w,h,fill=PAPER,outline=None,r=12,width=1):
        px=W-x-w if self.ar else x
        self.d.rounded_rectangle((px,y,px+w,y+h),radius=r,fill=fill,outline=outline,width=width)
        return px

    def text(self,value,x,y,w,size=26,color=INK,bold=False,center=False):
        px=W-x-w if self.ar else x
        while self.d.textlength(value,font=font(size,bold),direction='rtl' if self.ar else 'ltr')>w and size>12:
            size-=1
        anchor='mm' if center else ('rm' if self.ar else 'lm')
        at=px+w/2 if center else (px+w if self.ar else px)
        self.d.text((at,y),value,font=font(size,bold),fill=color,anchor=anchor,direction='rtl' if self.ar else 'ltr')

    def label(self,key,x,y,w,**kwargs):
        self.text(self.ui[key],x,y,w,**kwargs)

    def math(self,value,x,y,w,size=32,color=INK):
        px=W-x-w if self.ar else x
        self.d.text((px+w/2,y),value,font=font(size,True),fill=color,anchor='mm',direction='ltr')

    def pill(self,key,x,y,w,fill='#efedfc',color=PURPLE):
        self.box(x,y,w,36,fill,r=18)
        self.label(key,x+12,y+18,w-24,size=19,color=color,bold=True,center=True)

    def button(self,key,done,x=480,y=505,w=320):
        self.box(x,y,w,48,GREEN if done else PURPLE,r=9)
        self.label(key,x+15,y+24,w-30,size=24,color='white',bold=True,center=True)

    def cursor(self,t,x=640,y=530):
        # A single deliberate pointer move, click ring, then rest.
        if t>1.85:return
        move=ease(t/.95)
        logical=850+(x-850)*move
        cx=W-logical if self.ar else logical
        cy=420+(y-420)*move
        if .95<t<1.55:
            q=(t-.95)/.6
            overlay=Image.new('RGBA',(W,H))
            od=ImageDraw.Draw(overlay)
            radius=9+q*27
            od.ellipse((cx-radius,cy-radius,cx+radius,cy+radius),outline=(136,121,245,int(200*(1-q))),width=3)
            self.image.alpha_composite(overlay)
        direction=-1 if self.ar else 1
        shape=[(cx,cy),(cx+direction*6,cy+24),(cx+direction*12,cy+16),(cx+direction*23,cy+14)]
        self.d.polygon(shape,fill='#282d42',outline='white',width=2)

    def header(self,title,chapter):
        self.image.alpha_composite(self.logo,((W-96 if self.ar else 56),34))
        self.text('CLASO',112,56,175,size=26,color='white',bold=True)
        self.label('illustration',760,55,460,size=17,color='#bbc0d4')
        self.text(title,66,128,1148,size=41,color='white',bold=True)
        self.d.line((65,151,1215,151),fill='#35394e',width=1)

    def shell(self,role,tab):
        self.box(64,183,1152,407,'#f8f9fc',r=18)
        self.box(65,184,1150,60,'white',r=17)
        self.d.line((65,244,1215,244),fill=LINE,width=1)
        self.label('class',100,216,680,size=26,bold=True)
        self.pill(role,944,196,235)
        self.box(875,264,302,288,'#efedf8',r=12)
        for n,key in enumerate(['class_tab','work_tab','results_tab']):
            if key==tab:
                self.box(894,290+n*69,264,52,'white',r=9)
                self.box(894,303+n*69,4,25,PURPLE,r=2)
            self.label(key,916,316+n*69,220,size=24,bold=key==tab,color=PURPLE if key==tab else MUTED)
        self.label('saved',921,530,220,size=16,color=MUTED)

    def timeline(self,chapter,progress):
        labels=['setup_title','publish_title','submit_title','return_title']
        for n,key in enumerate(labels):
            x=65+n*300
            self.box(x,628,267,4,PURPLE if n<chapter else '#34394c',r=2)
            if n==chapter:self.box(x,628,max(2,267*progress),4,PURPLE,r=2)
            self.label(key,x,657,267,size=21,color='white' if n==chapter else '#a9b1c8',bold=n==chapter,center=True)

    def notice(self,key,t):
        overlay=Image.new('RGBA',(W,H))
        od=ImageDraw.Draw(overlay)
        alpha=int(255*ease((t-1.1)/.5))
        if alpha<=0:return
        px=165
        od.rounded_rectangle((px,566,1115,610),radius=12,fill=(231,248,239,alpha))
        od.text((640,588),self.ui[key],font=font(22,True),fill=(31,97,79,alpha),anchor='mm',direction='rtl' if self.ar else 'ltr')
        self.image.alpha_composite(overlay)

    def field(self,label,value,y):
        self.label(label,107,y,706,size=19,color=MUTED)
        self.box(105,y+20,710,58,'white',LINE,r=9)
        self.label(value,126,y+49,664,size=27,bold=True)

    def render(self,cue,title,t,duration,chapter):
        self.header(title,chapter)
        if cue in ['intro','outro']:
            self.brand_scene(cue,t)
            return self.image
        role='admin' if cue in ['setup','connect'] else 'student' if cue in ['answer','submit','result'] else 'teacher'
        tab='class_tab' if role=='admin' else 'results_tab' if cue=='result' else 'work_tab'
        self.shell(role,tab)
        second=cue in ['connect','publish','submit','result']
        self.timeline(chapter,(.5 if second else 0)+.5*min(1,t/duration))
        done=t>=1.05
        if cue in ['setup','connect']:
            self.field('subject_label','class',278)
            self.label('teacher_label',108,387,330,size=19,color=MUTED)
            self.label('students_label',465,387,345,size=19,color=MUTED)
            self.box(105,409,342,63,'white',LINE,r=10)
            self.label('assigned',125,440,302,size=25,bold=True,color=GREEN)
            self.box(463,409,352,63,'white',LINE,r=10)
            self.label('enrolled' if cue=='connect' else 'students_pending',483,440,312,size=25,bold=True,color=GREEN if cue=='connect' else MUTED)
            if cue=='setup':
                self.button('connect',False)
            else:
                done=t>=2.55
                self.button('connected' if done else 'connect',done)
                if t>1.5:self.cursor(t-1.5)
                if done:self.notice('connected',t-1.5)
        else:
            title_value=self.ui['assignment']
            if cue=='draft':title_value=title_value[:int(len(title_value)*ease(t/1.3))]
            self.text(title_value,108,282,540,size=30,bold=True)
            status='published' if cue in ['answer','publish'] else 'submitted' if cue in ['submit','review'] else 'returned' if cue=='result' else 'draft'
            if cue=='publish' and not done:status='draft'
            if cue=='submit' and not done:status='published'
            self.pill(status,655,263,158,fill='#e8f4ef' if status in ['submitted','returned'] else '#eceafa',color=GREEN if status in ['submitted','returned'] else PURPLE)
            if cue in ['draft','publish']:
                self.label('instructions',108,334,702,size=24,color=MUTED)
                self.box(105,368,710,110,'white',LINE,r=10)
                self.math(self.ui['equation'],105,422,710,size=42)
                self.button('published' if cue=='publish' and done else 'publish',cue=='publish' and done)
                if cue=='publish':
                    self.cursor(t)
                    if done:self.notice('available',t)
            elif cue in ['answer','submit']:
                self.math(self.ui['equation'],108,343,707,size=32)
                self.label('answer_label',108,389,704,size=18,color=MUTED)
                self.box(105,410,710,70,'white',PURPLE if cue=='answer' else LINE,r=9,width=2 if cue=='answer' else 1)
                value=self.ui['solution']
                if cue=='answer':value=value[:int(len(value)*ease((t-.4)/2.3))]
                self.math(value,110,445,700,size=30)
                self.button('submitted' if cue=='submit' and done else 'submit',cue=='submit' and done)
                if cue=='submit':
                    self.cursor(t)
                    if done:self.notice('received',t)
            else:
                self.box(105,319,710,63,'white',LINE,r=9)
                self.math(self.ui['solution'],105,350,710,size=30)
                self.label('feedback_label',108,411,703,size=19,color=MUTED)
                self.box(105,433,710,58,'#eaf4ef',r=9)
                feedback=self.ui['feedback']
                if cue=='review':feedback=feedback[:int(len(feedback)*ease((t-.35)/2.0))]
                self.text(feedback,123,462,674,size=23,color=GREEN)
                if cue=='review':
                    # Return is pressed only after the feedback has had time to be read.
                    press=max(0,t-(duration-2.0))
                    self.button('returned' if press>=1.05 else 'return',press>=1.05)
                    if t>duration-2.0:self.cursor(press)
                else:
                    self.button('returned',True)
                    self.notice('result_notice',t+1.1)
        return self.image

    def brand_scene(self,cue,t):
        self.box(64,183,1152,407,'#23283b',outline='#3b4057',r=18)
        self.label('intro_line' if cue=='intro' else 'outro_line',100,277,1080,size=49,color='white',bold=True,center=True)
        self.label('intro_sub' if cue=='intro' else 'same_work',115,338,1050,size=24,color='#c5c9dd',center=True)
        labels=['admin','teacher','student']
        for n,key in enumerate(labels):
            amount=ease((t-.3-n*.35)/.8)
            x=153+n*347
            y=int(413+(1-amount)*30)
            self.box(x,y,280,89,'#f8f8fd',r=14)
            self.label(key,x+20,y+44,240,size=30,color=PURPLE,bold=True,center=True)
            if n<2:
                px=W-(x+297) if self.ar else x+297
                self.d.line((px,457,px+(-28 if self.ar else 28),457),fill='#9386e4',width=3)
        self.label('brand_line',90,654,1100,size=32,color='white',bold=True,center=True)


_MONTAGE_CACHE = {}

def editorial_montage(locale, ui, logo, t, duration):
    """A four-shot recap of the same object, with readable labels and motivated cuts."""
    key=(locale, tuple(sorted(ui.items())))
    if key not in _MONTAGE_CACHE:
        tiles=[]
        for cue, label, role, chapter in [('connect','setup_title','admin',0),('publish','publish_title','teacher',1),('submit','submit_title','student',2),('result','return_title','student',3)]:
            scene=Scene(locale,ui,logo)
            shot=scene.render(cue,ui[label],3.3,7,chapter)
            # Show the academic work, excluding duplicate headers and outer navigation.
            crop=shot.crop((64,183,1216,615)).resize((535,201),Image.Resampling.LANCZOS)
            tiles.append((crop,ui[label],ui[role]))
        _MONTAGE_CACHE[key]=tiles
    scene=Scene(locale,ui,logo)
    scene.header(ui['same_work'],3)
    active=min(3,int(max(0,t-.25)/1.25))
    for i,(tile,title,role) in enumerate(_MONTAGE_CACHE[key]):
        x=70+(i%2)*595; y=193+(i//2)*241
        amount=ease((t-i*.17)/.5)
        y+=int((1-amount)*18)
        scene.box(x-5,y-5,545,211,'#272c42',PURPLE if i==active else '#3b4157',r=8,width=3 if i==active else 1)
        actual=W-x-535 if scene.ar else x
        scene.image.alpha_composite(tile,(actual,y))
        scene.text(f'{i+1:02}  {title}',x,y+221,535,size=20,color='white',bold=i==active)
    # End on a clean brand lockup, fading from the completed montage.
    if t>duration-2.3:
        ending=Scene(locale,ui,logo)
        ending.image.alpha_composite(logo.resize((80,80)),(600,207))
        ending.text('CLASO',140,348,1000,size=76,color='white',bold=True,center=True)
        ending.label('brand_line',140,429,1000,size=36,color='#c5c9dd',center=True)
        scene.image=Image.blend(scene.image,ending.image,ease((t-duration+2.3)/.65))
    return scene.image

def frame(locale,ui,logo,cue,title,t,duration,chapter,previous=None):
    shot=Scene(locale,ui,logo).render(cue,title,t,duration,chapter)
    if locale=='en':
        if cue=='outro':
            shot=editorial_montage(locale,ui,logo,t,duration)
        elif cue not in ['intro','setup']:
            # Gentle camera movement adds emphasis without moving the assignment off screen.
            zoom=1+.025*ease(t/.8)
            zw,zh=round(W*zoom),round(H*zoom)
            shot=shot.resize((zw,zh),Image.Resampling.BICUBIC).crop(((zw-W)//2,(zh-H)//2,(zw+W)//2,(zh+H)//2))
        if previous is not None and t<.28:
            # A brief directional match-cut reveals the next state in the same workspace.
            edge=round(W*ease(t/.28))
            composite=previous.copy()
            composite.paste(shot.crop((0,0,edge,H)),(0,0))
            if edge<W:
                ImageDraw.Draw(composite).rectangle((edge,0,min(W,edge+4),H),fill='#8d80ef')
            shot=composite
    elif previous is not None and t<.32:
        shot=Image.blend(previous,shot,ease(t/.32))
    return shot.convert('RGB')
