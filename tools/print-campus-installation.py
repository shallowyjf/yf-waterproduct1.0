"""Reproduce the installation location booklet from the verified latest NET stream."""
import json, math, hashlib
from pathlib import Path
from collections import Counter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A3, landscape
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from xml.sax.saxutils import escape
from read_epanet_net import read_net

APP = Path(__file__).resolve().parents[1]
SOURCE = APP / 'data/sources/campus_water_completed1026_管长_铸铁DN200.net'
D = read_net(SOURCE)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == D['source_sha256']
OUT = APP / 'docs/installation/上海学校_二级表安装定位图册_20261026.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
N = {n['id']:n for n in D['junctions']+D['reservoirs']+D['tanks']}
P = D['pipes']
SITES = [
    ('K1','JS643','北侧入口','开挖位置'),
    ('K2','JS258','北侧入口待选','开挖待选'),
    ('M1','JS54','南侧入口','二级表标注'),
    ('M2','JS238','北侧泵房入口','二级表标注'),
    ('M3','19','北侧楼顶楼','二级表标注'),
    ('M4','21','北侧泵房至宿舍','二级表标注'),
    ('M5','JS70','食堂直供','二级表标注'),
    ('M6','7','幼儿园','二级表标注'),
    ('M7','27','南教','二级表标注'),
]
S = {s[1]:s for s in SITES}
assert set(S)=={n['id'] for n in N.values() if '二级表' in n['description']}
ADJ = {nid:[p for p in P if nid in (p['node1'],p['node2'])] for nid in S}
METER_PIPE=next(p for p in P if p['id']=='40')
assert '二级表' in METER_PIPE['description']
pdfmetrics.registerFont(TTFont('CN','C:/Windows/Fonts/msyh.ttc',subfontIndex=0))
pdfmetrics.registerFont(TTFont('CNB','C:/Windows/Fonts/msyhbd.ttc',subfontIndex=0))
W,H = landscape(A3)
C = canvas.Canvas(str(OUT),pagesize=(W,H),pageCompression=1)
C.setTitle('上海学校二级表安装定位图册 - 2026-10-26最新拓扑')
C.setAuthor('上海技术学院漏损控制项目')
C.setSubject('二级表位置、开挖候选位置、原始描述、源坐标及现场确认记录')
INK=HexColor('#142F46'); MUTED=HexColor('#607589'); BORDER=HexColor('#D8E2EB')
BLUE=HexColor('#087FA3'); AMBER=HexColor('#B66008'); PURPLE=HexColor('#8F47A2')
LINE=HexColor('#728A9C'); LIGHT=HexColor('#F3F7FA')
PS=ParagraphStyle('body',fontName='CN',fontSize=10,leading=16,textColor=INK,wordWrap='CJK')
SM=ParagraphStyle('small',parent=PS,fontSize=8.8,leading=13)
assert len(N)==96 and len(P)==94

def txt(x,y,s,size=10,color=INK,bold=False,align='left'):
    C.setFillColor(color);C.setFont('CNB' if bold else 'CN',size)
    getattr(C,{'left':'drawString','right':'drawRightString','center':'drawCentredString'}[align])(x,y,str(s))

def para(x,y,w,s,style=PS):
    p=Paragraph(s,style); _,h=p.wrap(w,1000);p.drawOn(C,x,y-h);return y-h

def box(x,y,w,h,fill=white):
    C.setStrokeColor(BORDER);C.setFillColor(fill);C.setLineWidth(.7)
    C.roundRect(x,y,w,h,6,fill=1,stroke=1)

def path(points,color=LINE,width=1,close=False,fill=False):
    if not points:return
    p=C.beginPath();p.moveTo(*points[0])
    for pt in points[1:]:p.lineTo(*pt)
    if close:p.close()
    C.setStrokeColor(color);C.setLineWidth(width);C.drawPath(p,fill=int(fill),stroke=1)

def header(page,title,sub):
    txt(32,H-38,'上海技术学院漏损控制项目',11,MUTED)
    txt(32,H-70,title,25,bold=True)
    txt(32,H-95,sub,10.4,MUTED)
    txt(W-32,H-38,'2026.10.26  /  最新拓扑',10,align='right')
    C.setStrokeColor(BORDER);C.line(32,H-112,W-32,H-112)
    C.line(32,42,W-32,42)
    txt(32,25,'A3 横向 · 原始平面坐标等比例绘图 · K/M 编号仅用于本图册',8.4,MUTED)
    txt(W-32,25,f'安装定位与现场复核  |  {page:02d} / 07',8.4,MUTED,align='right')

def symbol(x,y,nid,size=5):
    kind=S[nid][3];col=AMBER if kind=='开挖位置' else PURPLE if kind=='开挖待选' else BLUE
    C.setStrokeColor(col);C.setFillColor(white);C.setLineWidth(1.7)
    if kind=='开挖待选':
        C.setDash(2,1);path([(x,y+size+2),(x+size+2,y),(x,y-size-2),(x-size-2,y)],col,1.7,True,True);C.setDash()
    elif kind=='开挖位置':
        path([(x,y+size+3),(x+size+3,y-size-1),(x-size-3,y-size-1)],col,1.7,True,True)
    else:C.circle(x,y,size,fill=1,stroke=1)
    C.setFillColor(col);C.circle(x,y,1.6,fill=1,stroke=0)

def label(x,y,s,size=8,color=INK,bold=False):
    width=pdfmetrics.stringWidth(s,'CNB' if bold else 'CN',size)
    C.setFillColor(white);C.rect(x-2,y-2,width+4,size+4,fill=1,stroke=0)
    txt(x,y,s,size,color,bold)

def mapdraw(rect,bounds=None,highlights=None,callouts=None,labels=None,pipe_ids=False,all_node_ids=False,scale_len=25,meter_pipe_label=None):
    x,y,w,h=rect;box(x,y,w,h)
    if bounds is None:
        xs=[n['x'] for n in N.values()];ys=[n['y'] for n in N.values()]
        bounds=(min(xs)-14,min(ys)-14,max(xs)+14,max(ys)+14)
    x0,y0,x1,y1=bounds
    sc=min((w-70)/(x1-x0),(h-80)/(y1-y0));ox=x+w/2;oy=y+h/2+8
    def pos(a,b):return ox+(a-(x0+x1)/2)*sc,oy+(b-(y0+y1)/2)*sc
    C.saveState();clip=C.beginPath();clip.rect(x+14,y+45,w-28,h-64);C.clipPath(clip,stroke=0)
    # Light grid is only a scale reference; no unverified geographic north arrow.
    C.setStrokeColor(HexColor('#EEF2F5'));C.setLineWidth(.4)
    step=50 if x1-x0>250 else 10 if x1-x0>60 else 5
    for gx in range(math.ceil(x0/step)*step,math.floor(x1/step)*step+1,step):
        a,b=pos(gx,y0),pos(gx,y1);C.line(*a,*b)
    for gy in range(math.ceil(y0/step)*step,math.floor(y1/step)*step+1,step):
        a,b=pos(x0,gy),pos(x1,gy);C.line(*a,*b)
    for p in P:
        pts=[(N[p['node1']]['x'],N[p['node1']]['y'])]+p['vertices']+[(N[p['node2']]['x'],N[p['node2']]['y'])]
        hp=any(t in (highlights or []) for t in (p['node1'],p['node2']))
        path([pos(*z) for z in pts],BLUE if hp else LINE,1.8 if hp else 1)
        if p['id']=='40' and meter_pipe_label:
            path([pos(*z) for z in pts],BLUE,3.3)
        if pipe_ids and all(x0<=a<=x1 and y0<=b<=y1 for a,b in pts):
            if math.dist(pts[0],pts[-1])*sc>80:
                mid=pts[len(pts)//2] if len(pts)>2 else ((pts[0][0]+pts[-1][0])/2,(pts[0][1]+pts[-1][1])/2)
                px,py=pos(*mid);label(px+4,py+4,'管 '+p['id'],7.8,MUTED)
    for nid,n in N.items():
        if not (x0<=n['x']<=x1 and y0<=n['y']<=y1):continue
        px,py=pos(n['x'],n['y']);C.setStrokeColor(LINE);C.setFillColor(white);C.setLineWidth(.7);C.circle(px,py,2,stroke=1,fill=1)
        if all_node_ids and nid not in S:label(px+4,py-10,nid,7.6)
    for nid in highlights or []:
        px,py=pos(N[nid]['x'],N[nid]['y']);symbol(px,py,nid)
    for nid,dx,dy,s in labels or []:
        if nid not in N:continue
        px,py=pos(N[nid]['x'],N[nid]['y']);label(px+dx,py+dy,s,8.5)
    for nid,dx,dy,s in callouts or []:
        px,py=pos(N[nid]['x'],N[nid]['y']);lx,ly=px+dx,py+dy
        col=AMBER if nid=='JS643' else PURPLE if nid=='JS258' else BLUE
        C.setStrokeColor(col);C.setLineWidth(.7);C.line(px,py,lx,ly+4)
        label(lx,ly,s,10,col,True)
    if meter_pipe_label:
        a,b=N[METER_PIPE['node1']],N[METER_PIPE['node2']]
        px,py=pos((a['x']+b['x'])/2,(a['y']+b['y'])/2)
        dx,dy,s=meter_pipe_label;lx,ly=px+dx,py+dy
        C.setStrokeColor(BLUE);C.setLineWidth(.8);C.line(px,py,lx,ly+4)
        label(lx,ly,s,10,BLUE,True)
    C.restoreState()
    barx,bary=x+19,y+24; blen=scale_len*sc
    C.setStrokeColor(INK);C.setLineWidth(.9);C.line(barx,bary,barx+blen,bary)
    for t in (0,.5,1):C.line(barx+blen*t,bary-3,barx+blen*t,bary+3)
    txt(barx,bary-13,'0',7.7,MUTED);txt(barx+blen,bary-13,f'{scale_len} m',7.7,MUTED,align='center')
    txt(x+w-15,y+13,'X 向右 / Y 向上；方位未核实',7.5,MUTED,align='right')
    return pos

def site_card(y,nid,width=337,x=821,notes=''):
    code,_,name,kind=S[nid];n=N[nid]
    col=AMBER if kind=='开挖位置' else PURPLE if kind=='开挖待选' else BLUE
    txt(x,y,f'{code}  {name}',14,col,True);txt(x+width,y,f'节点 {nid}',10,align='right')
    y-=15
    y=para(x,y,width,f'<b>源描述：</b>{escape(n["description"].strip())}')-8
    txt(x,y,f'源 X {n["x"]:.3f}    /    源 Y {n["y"]:.3f}',9,MUTED);y-=21
    txt(x,y,'相邻管线（端点顺序不代表供水方向）',9.5,bold=True);y-=17
    for p in ADJ[nid]:
        txt(x,y,f'{p["id"]}: {p["node1"]} - {p["node2"]}',9.4);y-=15
        txt(x+12,y,f'DN{float(p["diameter"]):g}  /  铸铁管  /  {float(p["length"]):.3f} m',8.8,MUTED);y-=20
    if notes:y=para(x,y,width,notes,SM)-9
    C.setStrokeColor(BORDER);C.line(x,y,x+width,y)
    return y-25

def draw_table(x,top,rows,widths,rowheights=None,font=9.5):
    style=ParagraphStyle('cell',parent=PS,fontSize=font,leading=font+4)
    data=[[Paragraph(escape(str(c)).replace('\n','<br/>'),style) for c in row] for row in rows]
    t=Table(data,colWidths=widths,rowHeights=rowheights)
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),LIGHT),('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('GRID',(0,0),(-1,-1),.5,BORDER),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),
        ('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9),
    ]));_,h=t.wrap(sum(widths),H);t.drawOn(C,x,top-h);return top-h

# 1. Current topology and all nine annotated positions.
header(1,'二级表安装定位总图','依据最新 NET 描述编制 · 二级表位置、北侧入口开挖位置及待选位置')
txt(32,H-139,f'96 个节点   /   94 条管段   /   管长 {sum(float(p["length"]) for p in P):,.3f} m',12,bold=True)
txt(W-32,H-139,'10 处描述标注：9 个节点 + 1 个管段',11,align='right')
mapdraw((32,153,770,518),highlights=list(S),scale_len=50,callouts=[
    ('JS643',-58,-30,'K1 北侧入口'),('JS258',-64,36,'K2 待选'),
    ('JS54',-65,-28,'M1 南侧入口'),('JS238',30,-35,'M2 泵房入口'),
    ('19',-70,-28,'M3 北侧楼顶楼'),('21',25,37,'M4 至宿舍'),
    ('JS70',-45,30,'M5 食堂直供'),('7',22,-24,'M6 幼儿园'),('27',-10,-28,'M7 南教')],labels=[
    ('15',-33,-14,'垃圾房'),('6',-35,12,'体育场厕所1'),('5',8,5,'体育场厕所2'),
    ('4',6,8,'花房'),('JS615',4,12,'宿舍4'),('JS608',6,8,'宿舍5'),('JS612',7,-5,'宿舍6'),
    ('22',-45,13,'宿舍1'),('JS625',-30,29,'宿舍2'),('JS42',8,9,'宿舍3'),('JS39',-55,10,'南教学楼')],meter_pipe_label=(-91,-1,'M8 管40'))
rx=825;rw=W-rx-32
txt(rx,650,'图例与读图',14,bold=True)
for yy,nid,tt in [(623,'JS54','二级表标注'),(593,'JS643','开挖位置'),(563,'JS258','开挖待选位置')]:
    symbol(rx+9,yy+2,nid);txt(rx+28,yy-2,tt,10)
path([(rx,535),(rx+23,535)],BLUE,3.3);txt(rx+30,531,'管段二级表标注（整段）',10)
path([(rx,508),(rx+23,508)],LINE,1.2);txt(rx+30,504,'最新文件管线',10)
y=para(rx,478,rw,'图册 K1/K2、M1-M8 为定位索引；核对时使用原始节点或管段 ID。M8 对应整条管40，源文件未给出段内精确安装点。两处北侧开挖标注不自动等于两台设备。')
y=para(rx,y-20,rw,'<b>使用范围</b><br/>用于踏勘定位、安装点确认和交接。相邻管径为管道参数，不能直接作为水表口径或采购数量。开挖范围、最终安装位置与设备规格须现场确认。')
y=para(rx,y-20,rw,'<b>源文件状态</b><br/>最新文件为 96 个连接节点、94 条管线，无水库、水箱或泵链接；文件未给出水力流向。图中不沿用旧版水源符号。')
para(rx,y-18,rw,'坐标按源文件数值绘制，单位 m；坐标系和现场基准未给出。所有线条均可在 PDF 中放大查看。',SM)
box(32,61,W-64,73,LIGHT)
txt(45,115,'编制依据',10,bold=True)
txt(114,115,SOURCE.name,9.5)
txt(45,95,'源文件 SHA-256：'+D['source_sha256'],8.3,MUTED)
txt(45,77,'原文件标题仍含 2026-10-13 与旧统计；本图册以实际解析的 2026-10-26 文件内容为准。',9,MUTED)
C.showPage()

# 2. Source-grounded schedule.
header(2,'安装点位与原始描述清单','原始中文描述逐项保留；坐标四舍五入至 0.001 m；完整精度保留在源文件及系统数据中')
rows=[['图册号 / 节点','位置类别','源文件原始描述','源 X / 源 Y (m)','相邻管段原编号','详图页']]
for code,nid,name,kind in SITES:
    n=N[nid];rows.append([f'{code} / {nid}',kind,n['description'].strip(),f'{n["x"]:.3f}\n{n["y"]:.3f}',', '.join(p['id'] for p in ADJ[nid]),'03' if code.startswith('K') else '05' if code=='M1' else '04' if code in ('M2','M3','M4') else '06'])
rows.append(['M8 / 管40','管段二级表标注','二级表-垃圾房+体育管+花房','两端坐标见第03页','管40: JS641 - 28','03'])
bottom=draw_table(32,H-137,rows,[126,120,330,185,275,90],rowheights=[37]+[41]*10,font=9.5)
y=bottom-26
txt(32,y,'数量与名称的判读',12,bold=True)
y=para(32,y-15,W-64,'共检出 10 处“二级表”描述：7 个普通节点、2 个开挖相关节点及1条管段。JS258 明确标为“待选”；源文件未说明其与 JS643 的最终取舍关系，不能自行认定二选一或同时安装。')
y=para(32,y-12,W-64,'JS54 原文“南测入口”在定位图中按“南侧入口”展示；节点19的“北侧楼顶楼”、管40的“体育管”均保留原文。具体位置名称、楼栋与安装高度待现场确认。')
y=para(32,y-12,W-64,'所有列出的相邻管线在文件中均为 DN200、铸铁管；部分管径为源文件默认补全值，管长为模型记录值。设备口径、安装形式、直管段要求和附件清单应结合现场及最终选型确认。')
para(32,y-12,W-64,'以节点 ID 找点，再沿相邻管段核对连接关系；线条交叉但未共用节点时，不认定为管线连通。图册不把图上的端点顺序作为水流方向。')
C.showPage()

# 3. Excavation alternatives.
header(3,'北侧入口及垃圾房等支路计量位置','K1 / JS643 开挖 · K2 / JS258 开挖待选 · M8 / 管40 垃圾房+体育管+花房')
mapdraw((32,123,760,572),(-16769,-7752,-16724,-7701),['JS643','JS258'],[
    ('JS643',30,-30,'K1 / JS643 开挖位置'),('JS258',-65,35,'K2 / JS258 开挖待选')],pipe_ids=True,all_node_ids=True,scale_len=10,meter_pipe_label=(-155,-35,'M8 / 管40 段内点位待定'))
y=site_card(674,'JS643',notes='源标签 C01_WATER_METER；井室与可安装条件待核实。')
y=site_card(y,'JS258',notes='源标签 C01_PIPE_POINT；描述明确“待选”，最终用途及取舍待现场确认。')
txt(821,y,'M8  垃圾房+体育管+花房',13,BLUE,True);y-=18
y=para(821,y,337,escape(METER_PIPE['description']),SM)-9
txt(821,y,'管40: JS641 - 28 / DN200 / 5.784 m',9.2);y-=19
txt(821,y,'JS641: X -16754.338 / Y -7719.689',8.7,MUTED);y-=15
txt(821,y,'28: X -16757.616 / Y -7714.924',8.7,MUTED);y-=19
y=para(821,y,337,'图上加粗整段，指引线只用于标注，不代表段内精确安装点。',SM)-10
distance=math.hypot(N['JS643']['x']-N['JS258']['x'],N['JS643']['y']-N['JS258']['y'])
para(821,y,337,f'K1 与 K2 平面直线间距 {distance:.2f} m；只用于区分位置，不是开挖长度或沿管距离。',SM)
txt(32,94,'现场确认：最终选点 ________    计量范围 ________    开挖范围 ________    现场负责人 / 日期 __________________',10)
txt(32,71,'定位顺序：原始节点 ID → 相邻井点与管段 → 现场管径及埋设位置 → 最终安装点签认。',9,MUTED)
C.showPage()

# 4. North pump and branches.
header(4,'北侧泵房与教学楼支路','M2 / JS238 泵房入口 · M3 / 19 北侧楼顶楼 · M4 / 21 泵房至宿舍')
mapdraw((32,205,760,490),(-16675,-7678,-16603,-7620),['JS238','19','21'],[
    ('JS238',30,-30,'M2 / JS238'),('19',-110,-30,'M3 / 19'),('21',35,35,'M4 / 21')],
    labels=[('17',-54,-16,'教学楼北 / 17'),('16',-80,0,'泵房北 / 16'),('20',-115,-23,'泵房to北教 / 20')],pipe_ids=True,all_node_ids=False,scale_len=10)
y=site_card(674,'JS238',notes='相邻管17、18的 DN200 在源描述中为默认补全值，须现场核实。')
y=site_card(y,'19',notes='“北侧楼顶楼”为源描述；具体楼栋及安装高度未给出。')
y=site_card(y,'21',notes='源标签为“泵房to宿舍”；与泵房节点16由管24连接。')
box(32,65,760,119,LIGHT)
txt(48,160,'泵房邻近节点核对',11,bold=True)
para(48,143,725,'M2 为 JS238，M4 为 21，两者不是泵房节点16本身。M3 为节点19，位于节点20与18之间；不要与管段编号19混淆。图中“管”前缀表示管段 ID。')
para(48,98,725,'模型记录管24长 2.192 m（16 - 21），管18长 7.568 m（16 - JS238）；这些是相邻整段管长，不代表设备安装预留长度。',SM)
C.showPage()

# 5. Southern entrance, with an expanded near-point inset.
header(5,'南侧入口：二级表节点 JS54','M1 / JS54 · 源描述“二级表-南测入口” · 入口处多个井点相距较近，按 ID 精确区分')
mapdraw((32,309,760,386),(-16704,-7839,-16680,-7820),['JS54'],[
    ('JS54',-65,40,'M1 / JS54')],labels=[('JS52-1',-30,-19,'JS52-1'),('JS52',-47,16,'JS52'),('JS53',-20,-30,'JS53')],pipe_ids=True,all_node_ids=False,scale_len=5)
mapdraw((32,65,760,225),(-16700,-7834.2,-16696.8,-7832),['JS54'],[
    ('JS54',35,25,'M1 / JS54')],labels=[('JS52',-30,-17,'JS52'),('JS53',-35,-18,'JS53')],pipe_ids=True,all_node_ids=False,scale_len=.5)
txt(50,267,'入口近距放大',10,bold=True)
y=site_card(674,'JS54',notes='源标签为 C01_VALVE_ACCESS。保留原始设施类型和二级表描述，不能仅凭“阀门孔”标签假定井室已具备安装条件。')
y=para(821,y,337,'<b>现场核对重点</b><br/>JS54 与相邻 JS53 之间的管 L014 记录长约 0.515 m，属于不同节点。请核对入口实际管线、可用安装空间及对应井点，避免把二级表装在邻近错误节点。')
para(821,y-22,337,'最新源文件中 JS52-1 的节点类别为连接节点；图册依源文件绘制。仅凭其位于入口附近，不将其标成已设置的水力水源。',SM)
C.showPage()

# 6. Southern points.
header(6,'食堂直供、幼儿园与南教学楼','M5 / JS70 食堂直供 · M6 / 7 幼儿园 · M7 / 27 南教')
mapdraw((32,310,760,385),(-16586,-7810,-16413,-7706),['JS70','7','27'],[
    ('JS70',-55,38,'M5 / JS70'),('7',15,-32,'M6 / 7'),('27',-20,-36,'M7 / 27')],
    labels=[('JS39',-35,14,'南教学楼 / JS39'),('JS999',-25,15,'JS999')],pipe_ids=True,scale_len=25)
mapdraw((32,65,760,226),(-16454,-7750,-16428,-7729),['7'],[
    ('7',30,-20,'M6 / 7')],labels=[('24',-70,14,'南泵房 / 24'),('26',-90,-8,'泵房to南教 / 26'),('2',-85,2,'食堂直供 / 2')],pipe_ids=True,scale_len=5)
txt(50,268,'南泵房与幼儿园支路放大',10,bold=True)
y=site_card(674,'JS70',notes='描述指向二级表节点 JS70；食堂直供用户节点2不是该二级表节点。')
y=site_card(y,'7',notes='描述为“二级表-幼儿园”，通过管32、33连接节点1和25。')
y=site_card(y,'27',notes='节点27经管38接节点26（泵房to南教），经管39接南教学楼 JS39。')
C.showPage()

# 7. A practical signoff sheet scoped to actual source uncertainties.
header(7,'现场确认与安装交接记录','按原始节点 / 管段 ID 逐点记录；候选点及段内安装点完成签认后再计入安装数量')
rows=[['图册号 / 节点','位置','现场点位 / 计量范围确认','实测管径 / 最终表径','安装方式 / 附件','设备编号 / 照片编号','签认 / 日期']]
for code,nid,name,kind in SITES:rows.append([f'{code} / {nid}',name,'','','','',''])
rows.append(['M8 / 管40','垃圾房+体育管+花房','','','','',''])
bottom=draw_table(32,H-136,rows,[112,150,210,150,160,190,154],rowheights=[44]+[39]*10,font=9.1)
txt(32,bottom-26,'本版交接需确认的事项',12,bold=True)
y=para(32,bottom-42,W-64,'1. 北侧入口 K1 / K2：最终保留点及用途 ____________________；M8 管40段内精确安装点 ____________________。')
y=para(32,y-12,W-64,'2. M3“北侧楼顶楼”：具体楼栋 __________；楼层 / 高度 __________。M1“南测入口”名称核对 __________________。')
y=para(32,y-12,W-64,'3. 每点安装后补录实际坐标、设备口径及编号、安装照片与现场连接关系，并回写系统；候选点是否取消需明确记录。')
txt(32,y-30,'确认后的安装总数 ________ 台        现场负责人 __________________        建设方确认 __________________',10)
txt(32,y-56,'数据版本：'+SOURCE.name,8.8,MUTED)
C.showPage();C.save()
print(json.dumps({'output':str(OUT),'pages':7,'node_sites':len(SITES),'pipe_sites':1,'source_sha256':D['source_sha256']},ensure_ascii=False))
