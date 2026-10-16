"""Print the verified campus DMA corridor geometry as a single vector A3 sheet."""
import json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, Color, white
from reportlab.lib.pagesizes import A3, landscape

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parent
OUT = ROOT / 'output/pdf/上海技术学院_DMA四分区_10米包络_A3打印版.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
D = json.loads((APP / 'data/campus-topology.json').read_text(encoding='utf-8'))
pdfmetrics.registerFont(TTFont('Chinese', 'C:/Windows/Fonts/msyh.ttc', subfontIndex=0))
pdfmetrics.registerFont(TTFont('ChineseBold', 'C:/Windows/Fonts/msyhbd.ttc', subfontIndex=0))
W, H = landscape(A3)
C = canvas.Canvas(str(OUT), pagesize=(W, H), pageCompression=1)
C.setTitle('上海技术学院漏损控制项目 - DMA四分区（10米包络）')
C.setAuthor('上海技术学院漏损控制项目')
C.setSubject('原始拓扑与假定DMA四分区；A3横向打印；10米供水走廊')
INK = HexColor('#203044')
MUTED = HexColor('#657385')
LINE = HexColor('#d9e0e7')
BG = HexColor('#f6f8fb')
PALETTE = [HexColor(z['color']) for z in D['zones']]

def text(x, y, s, size=10, color=INK, bold=False, align='left'):
    C.setFillColor(color)
    C.setFont('ChineseBold' if bold else 'Chinese', size)
    getattr(C, {'left':'drawString', 'right':'drawRightString', 'center':'drawCentredString'}[align])(x,y,s)

def lines(x, y, rows, size=9, leading=15, color=MUTED):
    for i, row in enumerate(rows):
        text(x, y-i*leading, row, size, color)

def polyline(coords, color, width=1, close=False, fill=False):
    p = C.beginPath()
    p.moveTo(*coords[0])
    for pt in coords[1:]: p.lineTo(*pt)
    if close: p.close()
    C.setLineWidth(width)
    C.setStrokeColor(color)
    C.drawPath(p, stroke=1, fill=int(fill))

def frame(x, y, w, h, fill=white):
    C.setFillColor(fill)
    C.setStrokeColor(LINE)
    C.setLineWidth(.7)
    C.roundRect(x,y,w,h,7,stroke=1,fill=1)

# Heading and concise print metadata.
text(30,H-43,'上海技术学院漏损控制项目',22,bold=True)
text(30,H-67,'供水管网拓扑与假定 DMA 四分区',13,MUTED)
text(W-30,H-36,'10 m 包络 / A3 横向',12,bold=True,align='right')
text(W-30,H-57,'出图日期  2026-10-13',9,MUTED,align='right')
C.setStrokeColor(LINE); C.line(30,H-83,W-30,H-83)
text(30,H-106,'102 个节点   /   100 条管段   /   2 处水源   /   总管长 1,770.77 m',10,bold=True)
text(W-30,H-106,'假定分区 · 供现场核对',10,HexColor('#a26513'),bold=True,align='right')

# Main drawing area and right-hand key.
mx,my,mw,mh = 30,95,847,H-224
rx,rw = 895,W-925
frame(mx,my,mw,mh)
text(mx+17,my+mh-25,'分区拓扑图',11,bold=True)
text(mx+mw-17,my+mh-24,'虚线为分区边界；实线为供水管路',9,MUTED,align='right')

all_points = [(n['x'],n['y']) for n in D['nodes']]
all_points += [(v['x'],v['y']) for z in D['zones'] for v in z['boundary']]
xmin,xmax = min(p[0] for p in all_points),max(p[0] for p in all_points)
ymin,ymax = min(p[1] for p in all_points),max(p[1] for p in all_points)
# Leave room for building callouts above and below the network.
s = min((mw-145)/(xmax-xmin),(mh-140)/(ymax-ymin))
cx,cy = (xmin+xmax)/2,(ymin+ymax)/2
ox,oy = mx+mw/2,my+mh/2+1
def pos(x,y): return ox+(x-cx)*s,oy-(y-cy)*s
nodes = {n['id']:n for n in D['nodes']}
pipe_zone = {pid:i for i,z in enumerate(D['zones']) for pid in z['pipeIds']}
node_zone = {nid:i for i,z in enumerate(D['zones']) for nid in z['nodeIds']}

# Real saved polygons, unaltered by the print layout.
for i,z in enumerate(D['zones']):
    coords = [pos(v['x'],v['y']) for v in z['boundary']]
    col=PALETTE[i]
    C.setFillColor(Color(.91+.09*col.red,.91+.09*col.green,.91+.09*col.blue))
    C.setDash(4,2.6)
    polyline(coords,col,.9,True,True)
C.setDash()
C.setLineCap(1); C.setLineJoin(1)
for p in D['pipes']:
    col=PALETTE[pipe_zone[p['id']]] if p['id'] in pipe_zone else HexColor('#8291a2')
    polyline([pos(v['x'],v['y']) for v in p['geometry']],col,1.15)

def symbol(x,y,kind,color,size=3):
    C.setStrokeColor(color); C.setFillColor(white); C.setLineWidth(.9)
    if kind=='user':
        polyline([(x-size,y-size),(x+size,y-size),(x+size,y+size*.6),(x,y+size*1.6),(x-size,y+size*.6)],color,.9,True,True)
    elif kind=='plant':
        C.rect(x-5,y-5,10,10,stroke=1,fill=1)
        text(x,y-2.4,'S',7,color,bold=True,align='center')
    elif kind=='pump':
        C.circle(x,y,4,stroke=1,fill=1)
        polyline([(x-2,y-2),(x+2.5,y),(x-2,y+2)],color,.7,True,False)
    elif kind=='valve':
        polyline([(x-2.2,y-2),(x+2.2,y+2),(x+2.2,y-2),(x-2.2,y+2)],color,.6,True,True)
    else: C.circle(x,y,1.25,stroke=1,fill=1)

for n in D['nodes']:
    col=PALETTE[node_zone[n['id']]] if n['id'] in node_zone else HexColor('#6e7f92')
    symbol(*pos(n['x'],n['y']),n['type'],col)

# Labels use fixed offsets around the original node locations, with leaders when useful.
label_offsets = {
 'JS642':(10,-23,'水源2'), 'JS52-1':(-15,-25,'水源1'),
 '22':(-20,20,'宿舍1'), 'JS625':(-23,28,'宿舍2'), 'JS42':(5,21,'宿舍3'),
 '17':(-70,-5,'北教学楼'), '16':(27,-8,'北侧泵房'),
 '6':(10,13,'体育馆厕所1'), '5':(10,7,'体育馆厕所2'), '4':(11,8,'花房'),
 '15':(-46,-17,'垃圾房'), 'JS39':(-54,-9,'南教学楼'),
 '2':(-13,33,'食堂直供'), '24':(28,-20,'南泵房'),
 'JS615':(10,10,'宿舍4'), 'JS608':(10,10,'宿舍5'), 'JS612':(10,0,'宿舍6'),
}
for nid,(dx,dy,label) in label_offsets.items():
    n=nodes[nid]; x,y=pos(n['x'],n['y']); lx,ly=x+dx,y+dy
    if nid in ['22','JS625','JS42','16','2','24']:
        C.setStrokeColor(HexColor('#bac3ce')); C.setLineWidth(.45)
        endx=lx+pdfmetrics.stringWidth(label,'Chinese',9)/2
        C.line(x,y,endx,ly-3 if dy>0 else ly+10)
    tw=pdfmetrics.stringWidth(label,'Chinese',9)
    C.setFillColor(white); C.rect(lx-2,ly-2,tw+4,12,fill=1,stroke=0)
    text(lx,ly,label,9)

# Zone IDs are also printed in the map so grayscale copies remain readable.
for i,(zx,zy) in enumerate([(230,305),(283,94),(430,313),(670,443)]):
    x,y=pos(zx,zy); z=D['zones'][i]; col=PALETTE[i]
    C.setFillColor(white); C.setStrokeColor(col); C.setLineWidth(.75)
    C.roundRect(x-26,y-10,52,20,4,stroke=1,fill=1)
    text(x,y-3,z['id'],8.5,col,bold=True,align='center')

# Scale derives from the source metres, not screen pixels. No unverified north arrow.
barx,bary=mx+19,my+35
barlen=50*D['metadata']['displayTransform']['scale']*s
C.setStrokeColor(INK);C.setLineWidth(1)
C.line(barx,bary,barx+barlen,bary)
for t in [0,.5,1]: C.line(barx+t*barlen,bary-3,barx+t*barlen,bary+3)
text(barx,bary-15,'0',8,MUTED)
text(barx+barlen/2,bary-15,'25',8,MUTED,align='center')
text(barx+barlen,bary-15,'50 m',8,MUTED,align='center')
text(mx+mw-17,my+20,'原始平面坐标等比例绘制；坐标系与方位待确认',8,MUTED,align='right')

top=my+mh
text(rx,top-15,'分区范围与指标',12,bold=True)
for i,z in enumerate(D['zones']):
    y=top-129-i*113
    frame(rx,y,rw,101,BG)
    C.setFillColor(PALETTE[i]); C.roundRect(rx+11,y+69,53,21,4,fill=1,stroke=0)
    text(rx+37.5,y+75,z['id'],8.8,white,bold=True,align='center')
    text(rx+11,y+50,z['name'],11,bold=True)
    text(rx+11,y+31,f"{len(z['nodeIds'])} 点 / {len(z['pipeIds'])} 条管段    管长 {z['lengthM']:.2f} m",8.8,MUTED)
    text(rx+11,y+13,f"走廊面积 {z['boundaryAreaM2']:,.2f} m²",8.8,MUTED)

legend_y=top-485
text(rx,legend_y,'图例',10.5,bold=True)
C.setDash(4,2.6); polyline([(rx,legend_y-19),(rx+34,legend_y-19)],PALETTE[0],.9);C.setDash()
text(rx+43,legend_y-22,'DMA 多边形边界',9)
polyline([(rx,legend_y-40),(rx+34,legend_y-40)],HexColor('#8291a2'),1.1)
text(rx+43,legend_y-43,'公共 / 未分配管段',9)
symbol(rx+5,legend_y-63,'plant',INK);text(rx+17,legend_y-66,'水源',9)
symbol(rx+80,legend_y-63,'user',INK);text(rx+92,legend_y-66,'用水点',9)
symbol(rx+160,legend_y-63,'pump',INK);text(rx+171,legend_y-66,'泵房',9)
text(rx,legend_y-89,'四区无重复成员；区域交叠 0 对',9,bold=True)

# Practical interpretation and print instructions, kept off the drawing.
C.setStrokeColor(LINE);C.line(30,79,W-30,79)
lines(30,63,[
 '包络规则：常规管段总宽至少 10 m（中心线两侧各 5 m）；食堂与宿舍4、5、6共用入口附近共边裁切，局部宽度例外。',
 '方案说明：走廊面积仅用于分区图示，不代表实际用地或服务面积。公共范围保留27点、25条管段；DMA-03经源管段28接入DMA-04。',
 '来源：20261013_sources 原始拓扑；拓扑版本 T-SH-CAMPUS-20261013。分区及计量边界待现场核实，未接入真实监测。',
],8.4,14)
text(W-30,21,'A3 横向 · 建议彩色打印 · A4 可选择适合纸张   |   1 / 1',8,MUTED,align='right')
C.showPage(); C.save()
print(OUT)
