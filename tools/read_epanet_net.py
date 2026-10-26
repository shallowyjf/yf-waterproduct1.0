"""Read the full EPANET Delphi GUI value stream without changing its source."""
import pathlib, struct, json, math, hashlib

class Reader:
    def __init__(self,b): self.b=b; self.p=0
    def take(self,n):
        v=self.b[self.p:self.p+n]
        if len(v)!=n: raise ValueError(f'EOF at {self.p}')
        self.p+=n
        return v
    def integer(self,fmt): return struct.unpack(fmt,self.take(struct.calcsize(fmt)))[0]
    def read(self):
        at=self.p; t=self.integer('<B')
        if t==0: return None
        if t==1:
            vals=[]
            while self.b[self.p]!=0: vals.append(self.read())
            self.take(1); return vals
        if t in (2,3,4,19): return self.integer({2:'<b',3:'<h',4:'<i',19:'<q'}[t])
        if t==5:
            mant=self.integer('<Q'); signexp=self.integer('<H')
            if mant==0: return 0.0
            return (-1 if signexp&0x8000 else 1)*math.ldexp(mant,(signexp&0x7fff)-16383-63)
        if t in (6,7): return self.take(self.integer('<B')).decode('cp936')
        if t==8: return False
        if t==9: return True
        if t==12: return self.take(self.integer('<I')).decode('cp936')
        if t==15: return self.integer('<f')
        if t==16: return self.integer('<q')/10000
        if t in (17,21): return self.integer('<d')
        if t==18: return self.take(self.integer('<I')*2).decode('utf-16le')
        if t==20: return self.take(self.integer('<I')).decode('utf-8')
        raise ValueError(f'Unknown TValueType {t} at {at}')
    def array(self): return [self.read() for _ in range(self.read())]


def read_net(source):
    SOURCE=pathlib.Path(source)
    B=SOURCE.read_bytes()
    r=Reader(B)
    out={'source':str(SOURCE),'source_bytes':len(B),'source_sha256':hashlib.sha256(B).hexdigest(),'schema':'USEPA/EPANET2.2 Delphi_GUI/epanet2w/Ufileio.pas, Uglobals.pas; Delphi TReader/TWriter value stream'}
    out['header']=r.read(); out['version']=r.read()
    categories=['junctions','reservoirs','tanks','pipes','pumps','valves','labels','patterns','curves','controls']
    out['counts']=dict(zip(categories,[r.read() for _ in categories]))
    out['title']=r.read(); out['notes']=r.read(); out['options_data']=r.array(); out['auto_length']=r.read()
    out['patterns']=[dict(zip(['id','comment','multipliers'],[r.read(),r.read(),r.read()])) for _ in range(r.read())]
    out['curves']=[dict(zip(['id','comment','type','x','y'],[r.read(),r.read(),r.read(),r.read(),r.read()])) for _ in range(r.read())]
    nodefields={
    'junctions':['description','tag','elevation','demand','pattern','demand_categories','emitter','initial_quality','source_quality','source_pattern','source_type'],
    'reservoirs':['description','tag','head','pattern','initial_quality','source_quality','source_pattern','source_type'],
    'tanks':['description','tag','elevation','initial_level','min_level','max_level','diameter','min_volume','volume_curve','mixing_model','mixing_fraction','bulk_coeff','initial_quality','source_quality','source_pattern','source_type','overflow']}
    for kind in ['junctions','reservoirs','tanks']:
        vals=[]
        for _ in range(r.read()):
            item={'id':r.read(),'x':r.read(),'y':r.read(),'data':r.array()}
            item.update(dict(zip(nodefields[kind],item['data'])))
            if kind=='junctions': item['demands']=r.read()
            vals.append(item)
        out[kind]=vals
    linkfields={
    'pipes':['description','tag','length','diameter','roughness','minor_loss','status','bulk_coeff','wall_coeff'],
    'pumps':['description','tag','head_curve','horsepower','speed','speed_pattern','status','efficiency_curve','energy_price','price_pattern'],
    'valves':['description','tag','diameter','valve_type','setting','minor_loss','status']}
    for kind in ['pipes','pumps','valves']:
        vals=[]
        for _ in range(r.read()):
            item={'id':r.read(),'node1':r.read(),'node2':r.read()}
            item['vertices']=[[r.read(),r.read()] for _ in range(r.read())]
            item['data']=r.array()
            item.update(dict(zip(linkfields[kind],item['data'])))
            vals.append(item)
        out[kind]=vals
    out['simple_controls']=r.read(); out['rule_controls']=r.read()
    out['labels']=[]
    for _ in range(r.read()):
        out['labels'].append(dict(zip(['id','x','y','anchor','font','font_size','bold','italic','meter_type','meter_id'],[r.read() for i in range(10)])))
    out['map_dimensions']=dict(zip(['minx','miny','maxx','maxy','units'],[r.read() for _ in range(5)]))
    out['map_backdrop']=dict(zip(['filename','offsetx','offsety'],[r.read() for _ in range(3)]))
    out['map_options']=[r.read() for _ in range(25)]
    out['map_node_color']=r.array(); out['map_link_color']=r.array()
    out['node_calibration_files']=[r.read() for _ in range(4)]
    out['link_calibration_files']=[r.read() for _ in range(3)]
    out['id_increment']=r.read(); out['id_prefix']=r.array()
    out['default_properties']={}
    for kind in categories[:6]:
        data=r.array()
        out['default_properties'][kind]={'data':data,**dict(zip(nodefields.get(kind,linkfields.get(kind)),data))}
    out['node_legend_intervals']=[[r.read() for _ in range(4)] for _ in range(7)]
    out['link_legend_intervals']=[[r.read() for _ in range(4)] for _ in range(10)]
    out['page_layout']=dict(zip(['left_margin','top_margin','right_margin','bottom_margin','header','header_align','header_enabled','footer','footer_align','footer_enabled','page_numbers','title_as_header','orientation'],[r.read() for _ in range(13)]))
    out['end_marker']=r.read(); out['consumed_bytes']=r.p
    assert r.p==len(B),(r.p,len(B))
    assert out['end_marker']==-1
    assert out['counts']==dict(out['counts'],**{k:len(out[k]) for k in categories[:-1]})
    return out
